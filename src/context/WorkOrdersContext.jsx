import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc, runTransaction, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, auth, storage } from '../firebaseConfig';
import { useAuth } from './AuthContext';
import { embedSignatures } from '../utils/pdfSigning';

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
  const generateSignedPdf = async (id, title, originalFileUrl, signatures) => {
    const ref_ = doc(db, COLLECTION, id);
    try {
      const originalRef = ref(storage, decodeStorageUrlToPath(originalFileUrl));
      const originalBytes = await getBytes(originalRef);
      const signedBytes = await embedSignatures(originalBytes, title, signatures);
      const signedRef = ref(storage, `workOrders/${id}/signed.pdf`);
      await uploadBytes(signedRef, signedBytes, { contentType: 'application/pdf' });
      const signedFileUrl = await getDownloadURL(signedRef);
      await updateDoc(ref_, { signedFileUrl, signedPdfError: null });
    } catch (err) {
      // Writes the real reason onto the work order itself, so "Sent by
      // Me" can show exactly what went wrong instead of a permanent
      // "putting it together" loading state with no explanation.
      await updateDoc(ref_, { signedPdfError: err.message || 'Something went wrong generating the signed document.' });
    }
  };

  const retryPdfGeneration = async (order) => {
    if (!order.originalFileUrl) return;
    await generateSignedPdf(order.id, order.title, order.originalFileUrl, order.signatures);
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
      await generateSignedPdf(id, justCompleted.title, justCompleted.originalFileUrl, justCompleted.signatures);
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
    if (!order.signedFileUrl) throw new Error('There is no signed document to download.');

    const res = await fetch(order.signedFileUrl);
    if (!res.ok) throw new Error('The document could not be downloaded.');
    const blob = await res.blob();

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${order.title || 'signed-document'}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    // Recorded before the cleanup: the download is what clears the dot, and it
    // has already happened by this point.
    //
    // Guarded for the same reason as the cleanup below - the file is already on
    // disk, so nothing after this point should be able to report a failure the
    // person can see. A rejected write here used to say the download had not
    // worked while the PDF sat in their downloads folder.
    try {
      await updateDoc(doc(db, COLLECTION, order.id), { downloadedAt: Date.now() });
    } catch (err) {
      console.error('[WorkOrders] downloadedAt not recorded: ' + err.message);
    }

    // Best effort - a failure here leaves files in storage, which the sweep
    // and the 90-day rules can deal with. It must not undo the download.
    try {
      await deleteStoredFiles(order);
    } catch (err) {
      console.error('[WorkOrders] files not removed after download: ' + err.message);
    }
  };

  // Anything you sent that is finished and not yet downloaded. Drives the
  // dot on the card, the Directory tile and the nav.
  const hasUndownloadedComplete = () =>
    getSentByMe().some((o) => o.status === 'completed' && o.signedFileUrl && !o.downloadedAt);

  const deleteStoredFiles = async (order) => {
    const deletions = [];
    if (order.originalFileUrl) deletions.push(deleteObject(ref(storage, decodeStorageUrlToPath(order.originalFileUrl))).catch(() => {}));
    if (order.signedFileUrl) deletions.push(deleteObject(ref(storage, decodeStorageUrlToPath(order.signedFileUrl))).catch(() => {}));
    await Promise.all(deletions);
    await updateDoc(doc(db, COLLECTION, order.id), { filesDeleted: true });
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
        deleteStoredFiles,
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
