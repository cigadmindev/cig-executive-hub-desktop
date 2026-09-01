import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy, doc, updateDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage } from '../firebaseConfig';
import { useAuth } from './AuthContext';

// The nine categories, as stable keys with the label separate. Renaming a
// label later must not orphan every receipt filed under it — the same reason
// checklist items are keyed. This list is duplicated in the Cloud Function,
// which validates against it, and in the mobile app. Changing one means
// changing all three.
export const EXPENSE_CATEGORIES = [
  { key: 'airfareTravel', label: 'Airfare / Travel' },
  { key: 'lodging', label: 'Lodging' },
  { key: 'meals', label: 'Meals' },
  { key: 'groundTransport', label: 'Ground Transport' },
  { key: 'mileage', label: 'Mileage' },
  { key: 'conferenceEvents', label: 'Conference & Events' },
  { key: 'supplies', label: 'Supplies' },
  { key: 'entertainment', label: 'Entertainment' },
  { key: 'other', label: 'Other' },
];

const ExpensesContext = createContext(undefined);
const COLLECTION = 'expenseReceipts';

export function ExpensesProvider({ children }) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const seesAll = user?.role === 'admin' || user?.job === 'Financials';

  useEffect(() => {
    if (!user) {
      setReceipts([]);
      setLoading(false);
      return;
    }

    // Two different queries rather than fetching everything and filtering in
    // the app: the Firestore rules refuse to return other people's receipts,
    // so an unfiltered listener would simply fail for most accounts.
    const base = collection(db, COLLECTION);
    const q = seesAll
      ? query(base, orderBy('dateSpent', 'desc'))
      : query(base, where('submittedByUid', '==', user.uid), orderBy('dateSpent', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setReceipts(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              submittedByUid: data.submittedByUid,
              submittedByName: data.submittedByName ?? 'Unknown',
              amountCents: data.amountCents ?? 0,
              categoryKey: data.categoryKey ?? 'other',
              categoryLabel: data.categoryLabel ?? 'Other',
              where: data.where ?? '',
              reason: data.reason ?? '',
              dateSpent: data.dateSpent ?? '',
              submittedAt: data.submittedAt ?? 0,
              submittedDateKey: data.submittedDateKey ?? '',
              editableUntil: data.editableUntil ?? 0,
              storagePath: data.storagePath ?? '',
              imageDeletedAt: data.imageDeletedAt ?? null,
              voided: data.voided === true,
              voidedBy: data.voidedBy ?? null,
              voidedReason: data.voidedReason ?? null,
            };
          })
        );
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsubscribe;
  }, [user?.uid, seesAll]);

  // Upload first, then record. The Storage rules already restrict a person to
  // their own folder, and the Cloud Function verifies the file exists before
  // writing anything — so a record can never point at a missing image.
  //
  // Takes a File straight from an <input type="file">, which uploadBytes
  // accepts as-is. The mobile version has to fetch its local URI into a blob
  // first; same destination, different starting point.
  const submitReceipt = async ({ file, amountCents, categoryKey, where: whereText, reason, dateSpent }) => {
    if (!user) throw new Error('You must be signed in.');

    // Named here rather than by the server: the upload has to happen before
    // the record exists, so there is no document id to use yet.
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${file.name}`;
    const path = `receipts/${user.uid}/${fileName}`;
    await uploadBytes(storageRef(storage, path), file);

    // The server stamps editableUntil from its own clock and validates every
    // field. Writing the record here would let a device decide its own
    // deadline.
    const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'submitExpenseReceipt');
    await fn({
      amountCents,
      categoryKey,
      where: whereText,
      reason,
      dateSpent,
      storagePath: path,
    });
  };

  // Storage denies reads to every client, so this is the only way to see a
  // receipt image. Batched: a page of receipts should not be a round trip each.
  const getImageUrls = async (ids) => {
    if (ids.length === 0) return {};
    const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'getReceiptUrls');
    const res = await fn({ ids });
    return res.data?.urls ?? {};
  };

  const voidReceipt = async (id, reason) => {
    if (!user) throw new Error('You must be signed in.');
    // Admins only, enforced by the Firestore rule — which also restricts the
    // write to exactly these three fields, so voiding cannot be used to change
    // an amount after the cutoff.
    await updateDoc(doc(db, COLLECTION, id), {
      voided: true,
      voidedBy: user.name ?? 'Unknown',
      voidedReason: reason,
    });
  };

  const isEditable = (r) =>
    !r.voided && r.submittedByUid === user?.uid && Date.now() < r.editableUntil;

  const value = useMemo(
    () => ({ receipts, seesAll, loading, submitReceipt, getImageUrls, voidReceipt, isEditable }),
    [receipts, seesAll, loading, user?.uid]
  );

  return <ExpensesContext.Provider value={value}>{children}</ExpensesContext.Provider>;
}

export function useExpenses() {
  const ctx = useContext(ExpensesContext);
  if (!ctx) throw new Error('useExpenses must be used within an ExpensesProvider');
  return ctx;
}

/** Cents to a displayed amount: 21477 becomes "214.77". */
export function formatAmount(cents) {
  return (cents / 100).toFixed(2);
}

/** A typed amount to cents: "214.77" becomes 21477. Null if it isn't a number. */
export function parseAmount(text) {
  const cleaned = String(text).replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  // Rounding rather than truncating: 0.1 + 0.2 arithmetic means 214.77 can
  // arrive as 21476.999999, and a receipt should not lose a cent to that.
  return Math.round(value * 100);
}

/** YYYY-MM-DD in Central, matching what the server stores. */
export function centralDateKey(d) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function prettyDate(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "4h 12m left to edit" — shown while a receipt can still be changed. */
export function timeLeft(until, now) {
  const ms = until - now;
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m left to edit` : `${m}m left to edit`;
}
