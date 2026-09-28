import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { db, storage, auth } from '../firebaseConfig';
import { useAuth } from './AuthContext';

// Invoices a GM needs paying, and who is handling each.
//
// They used to arrive however they arrived - a photo in a text, an email, a
// piece of paper - and Michele and Sam had no way to tell which of them was
// already on one. Two states fix that: claimed, so nobody does the same work
// twice, then paid, so the GM can stop asking.
//
// The file lands in that location's Financials > Invoices & Vendor Payments
// folder in Drive. A browser cannot write to Drive, so it goes to Storage
// first and a function moves it across - which also means a failed Drive
// upload never loses the file.
const COLLECTION = 'invoices';

const InvoicesContext = createContext(undefined);

export function InvoicesProvider({ children }) {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    if (!user) {
      setInvoices([]);
      return;
    }
    return onSnapshot(
      query(collection(db, COLLECTION), orderBy('createdAt', 'desc')),
      (snapshot) =>
        setInvoices(
          snapshot.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              locationId: x.locationId ?? null,
              locationName: x.locationName ?? '',
              brandId: x.brandId ?? null,
              brandName: x.brandName ?? '',
              vendor: x.vendor ?? '',
              amountCents: x.amountCents ?? null,
              dueDate: x.dueDate ?? null,
              note: x.note ?? '',
              fileName: x.fileName ?? '',
              // Where it ended up in Drive, once the function has moved it.
              driveUrl: x.driveUrl ?? null,
              driveError: x.driveError ?? null,
              submittedByUid: x.submittedByUid ?? null,
              submittedByName: x.submittedByName ?? '',
              createdAt: x.createdAt ?? 0,
              // Claimed: someone is on it. Paid: it is done. Both carry a
              // name, so the two of them never duplicate each other.
              claimedByUid: x.claimedByUid ?? null,
              claimedByName: x.claimedByName ?? '',
              claimedAt: x.claimedAt ?? null,
              paidByUid: x.paidByUid ?? null,
              paidByName: x.paidByName ?? '',
              paidAt: x.paidAt ?? null,
            };
          })
        ),
      (err) => console.error('[Invoices] ' + err.code + ': ' + err.message)
    );
  }, [user]);

  const addInvoice = async ({ file, locationId, locationName, brandId, brandName, vendor, amountCents, dueDate, note }) => {
    if (!file) throw new Error('Attach the invoice.');
    if (!locationId) throw new Error('Which location is this for?');

    const created = await addDoc(collection(db, COLLECTION), {
      locationId,
      locationName: locationName ?? '',
      brandId: brandId ?? null,
      brandName: brandName ?? '',
      vendor: (vendor ?? '').trim(),
      amountCents: amountCents ?? null,
      dueDate: dueDate ?? null,
      note: (note ?? '').trim(),
      fileName: file.name,
      driveUrl: null,
      driveError: null,
      submittedByUid: auth.currentUser?.uid ?? null,
      submittedByName: user?.name ?? '',
      createdAt: Date.now(),
      claimedByUid: null,
      paidByUid: null,
    });

    // Named by the record, so the function knows which invoice it belongs to.
    try {
      await uploadBytes(storageRef(storage, `invoiceUploads/${created.id}/${file.name}`), file);
    } catch (err) {
      // The record exists before the file does, so a failed upload would
      // otherwise leave an invoice nobody can open and nobody can explain.
      await deleteDoc(doc(db, COLLECTION, created.id));
      throw err;
    }
    return created.id;
  };

  const claim = async (id) => {
    await updateDoc(doc(db, COLLECTION, id), {
      claimedByUid: auth.currentUser?.uid ?? null,
      claimedByName: user?.name ?? '',
      claimedAt: Date.now(),
    });
  };

  const unclaim = async (id) => {
    await updateDoc(doc(db, COLLECTION, id), { claimedByUid: null, claimedByName: '', claimedAt: null });
  };

  const markPaid = async (id) => {
    await updateDoc(doc(db, COLLECTION, id), {
      paidByUid: auth.currentUser?.uid ?? null,
      paidByName: user?.name ?? '',
      paidAt: Date.now(),
    });
  };

  const outstanding = invoices.filter((i) => !i.paidAt);
  const paid = invoices.filter((i) => i.paidAt);

  return (
    <InvoicesContext.Provider value={{ invoices, outstanding, paid, addInvoice, claim, unclaim, markPaid }}>
      {children}
    </InvoicesContext.Provider>
  );
}

export function useInvoices() {
  const ctx = useContext(InvoicesContext);
  if (!ctx) throw new Error('useInvoices must be used inside InvoicesProvider');
  return ctx;
}
