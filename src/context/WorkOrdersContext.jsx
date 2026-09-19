import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc, runTransaction, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, auth, storage } from '../firebaseConfig';
import { useAuth } from './AuthContext';

const WorkOrdersContext = createContext(undefined);
const COLLECTION = 'workOrders';

function decodeStorageUrlToPath(downloadUrl) {
  const match = downloadUrl.match(/\/o\/(.+?)\?/);
  return match ? decodeURIComponent(match[1]) : downloadUrl;
}

export function WorkOrdersProvider({ children }) {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    if (!user) {
      setOrders([]);
      return;
    }
    const unsubscribe = onSnapshot(collection(db, COLLECTION), (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title,
          description: data.description,
          documentUrl: data.documentUrl ?? '', // legacy Drive-link option, still supported
          originalFileUrl: data.originalFileUrl ?? null,
          originalFileName: data.originalFileName ?? null,
          signedFileUrl: data.signedFileUrl ?? null,
          // The path, written by the function. signedFileUrl above is the old
          // tokenised URL, kept until the migration has run everywhere.
          signedPath: data.signedPath ?? null,
          originalPath: data.originalPath ?? null,
          downloadedByUids: data.downloadedByUids ?? [],
          signedPdfError: data.signedPdfError ?? null,
          filesDeleted: data.filesDeleted ?? false,
          // Null until the sender downloads the finished document. The dot
          // shows while a completed order has not been downloaded.
          downloadedAt: data.downloadedAt ?? null,
          uploadedByUid: data.uploadedByUid,
          uploadedByName: data.uploadedByName,
          assignedUids: data.assignedUids ?? [],
          signatures: data.signatures ?? [], // [{ uid, name, signedAt, signatureImageDataUrl }]
          status: data.status ?? 'pending',
          createdAt: data.createdAt,
          completedAt: data.completedAt ?? null,
        };
      });
      setOrders(list.sort((a, b) => b.createdAt - a.createdAt));
    },
      (err) => console.error('[WorkOrders listener] ' + err.code + ': ' + err.message)
    );
    return unsubscribe;
  }, [user]);

  const getMyQueue = () =>
    orders.filter((o) => o.assignedUids.includes(user?.uid) && !o.signatures.some((s) => s.uid === user?.uid));

  const getSentByMe = () => orders.filter((o) => o.uploadedByUid === user?.uid);

  // file is an actual File object from a <input type="file"> picker — the
  // real document now lives in Firebase Storage, not just a Drive link.
  // documentUrl (a Drive link) still works too, for anyone who'd rather
  // reference something already in Drive instead of uploading a fresh copy.
  const createWorkOrder = async ({ title, description, documentUrl, file, assignedUids }) => {
    const orderRef = doc(collection(db, COLLECTION));
    let originalFileUrl = null;
    let originalFileName = null;

    if (file) {
      const fileRef = ref(storage, `workOrders/${orderRef.id}/original-${file.name}`);
      await uploadBytes(fileRef, file);
      originalFileUrl = await getDownloadURL(fileRef);
      originalFileName = file.name;
    }

    await setDoc(orderRef, {
      title,
      description,
      documentUrl: documentUrl ?? '',
      originalFileUrl,
      originalFileName,
      signedFileUrl: null,
      signedPdfError: null,
      filesDeleted: false,
      downloadedAt: null,
      uploadedByUid: auth.currentUser?.uid ?? null,
      uploadedByName: user?.name ?? 'Unknown',
      assignedUids,
      signatures: [],
      status: 'pending',
      createdAt: Date.now(),
      completedAt: null,
    });
  };

  // Pulled out so both the automatic run (right after the last signature)
  // and a manual retry can share the same logic.
  // The heavy lifting happens in a Cloud Function now - see
  // assembleSignedDocument. The record updates when it finishes, and the
  // listener picks that up, so nothing here waits on the result.
  const assemble = async (id) => {
    const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'assembleSignedDocument');
    await fn({ orderId: id });
  };

  const retryPdfGeneration = async (order) => {
    await assemble(order.id);
  };

  const signWorkOrder = async (id, signatureImageDataUrl) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const ref_ = doc(db, COLLECTION, id);
    let justCompleted = null;

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref_);
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.signatures.some((s) => s.uid === uid)) return;
      const newSignatures = [
        ...data.signatures,
        { uid, name: user?.name ?? 'Unknown', signedAt: Date.now(), signatureImageDataUrl: signatureImageDataUrl ?? null },
      ];
      const allSigned = data.assignedUids.every((assignedUid) => newSignatures.some((s) => s.uid === assignedUid));
      tx.update(ref_, {
        signatures: newSignatures,
        status: allSigned ? 'completed' : 'pending',
        completedAt: allSigned ? Date.now() : null,
      });
      if (allSigned) {
        justCompleted = { title: data.title, originalFileUrl: data.originalFileUrl, signatures: newSignatures };
      }
    });

    // PDF generation happens outside the transaction — Storage
    // reads/writes and pdf-lib work aren't allowed inside one, and it's
    // fine for this to happen a moment after the signature itself is
    // recorded, since the queue/status already updated live either way.
    if (justCompleted && justCompleted.originalFileUrl) {
      await assemble(id);
    }
  };

  // Once the sender's downloaded the signed document, the actual file
  // bytes in Storage can be cleared out — the Firestore record (who
  // signed, when) stays untouched, this only removes the files themselves.
  // Downloads the finished document, records that it happened, then removes
  // the stored files. The order matters: if the fetch fails we must not have
  // deleted anything, and if the deletion fails the record still says
  // downloaded - which is correct, because the person has their file.
  //
  // Replaces a plain <a href> download. A link runs no code, so nothing could
  // record the download or clean up after it, and the notification dot had no
  // way to know it was done.
  const markDownloadedAndCleanUp = async (order) => {
    // The URL is asked for rather than stored. A Firebase download URL carries
    // a token and works for anyone holding it whatever the rules say; a signed
    // one lasts ten minutes and is only issued to a signer, the sender, or an
    // admin.
    let url;
    if (order.signedPath) {
      const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'getWorkOrderFileUrl');
      const res = await fn({ orderId: order.id });
      url = res.data.url;
    } else if (order.signedFileUrl) {
      // Older record, from before the change.
      url = order.signedFileUrl;
    } else {
      throw new Error('There is no signed document to download.');
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error('The document could not be downloaded.');
    const blob = await res.blob();

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `${order.title || 'signed-document'}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);

    // Collection is per person, and the file stays.
    //
    // It used to delete the moment anyone downloaded it, so the first person
    // to collect a document took it away from everyone else who signed it.
    // The same mistake expense reports had. A sweep ages these out instead.
    //
    // Guarded because the file is already on disk by this point - nothing
    // after the download should be able to report a failure the person can
    // see.
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        await updateDoc(doc(db, COLLECTION, order.id), {
          downloadedByUids: [...(order.downloadedByUids ?? []), uid],
        });
      }
    } catch (err) {
      console.error('[WorkOrders] collection not recorded: ' + err.message);
    }
  };

  // Anything you sent that is finished and you have not collected. Yours
  // clearing does not clear anyone else's.
  const hasUndownloadedComplete = () => {
    const uid = auth.currentUser?.uid;
    return getSentByMe().some(
      (o) =>
        o.status === 'completed' &&
        (o.signedPath || o.signedFileUrl) &&
        !(o.downloadedByUids ?? []).includes(uid)
    );
  };

  return (
    <WorkOrdersContext.Provider
      value={{
        orders,
        getMyQueue,
        getSentByMe,
        createWorkOrder,
        signWorkOrder,
        retryPdfGeneration,
        markDownloadedAndCleanUp,
        hasUndownloadedComplete,
      }}
    >
      {children}
    </WorkOrdersContext.Provider>
  );
}

export function useWorkOrders() {
  const ctx = useContext(WorkOrdersContext);
  if (!ctx) throw new Error('useWorkOrders must be used within WorkOrdersProvider');
  return ctx;
}
