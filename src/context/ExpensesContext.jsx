import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { recordDid } from './NotificationsContext';
import { collection, onSnapshot, query, where, orderBy, doc, setDoc, updateDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage } from '../firebaseConfig';
import { useAuth } from './AuthContext';

// Receipts are filed under Sam's accounts (9 Oct 2026) - the expenseAccounts
// collection, which Finance looks after in the Hub. Receipts filed before
// then keep their old category label until they are given an account.
//
// The one account that asks who was there.
export const ATTENDEES_ACCOUNT = '7255';

const ExpensesContext = createContext(undefined);
const COLLECTION = 'expenseReceipts';
const REPORTS = 'expenseReports';

export function ExpensesProvider({ children }) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
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
              categoryKey: data.categoryKey ?? null,
              categoryLabel: data.categoryLabel ?? null,
              accountCode: data.accountCode ?? null,
              accountName: data.accountName ?? null,
              accountHeading: data.accountHeading ?? null,
              attendees: data.attendees ?? null,
              locationId: data.locationId ?? null,
              recodes: data.recodes ?? [],
              editHistory: data.editHistory ?? [],
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
              voidedAt: data.voidedAt ?? null,
              chargeToId: data.chargeToId ?? null,
              chargeToName: data.chargeToName ?? 'Corporate',
              // The fiscal period, set by the server. Finance can move it.
              periodId: data.periodId ?? null,
              periodLabel: data.periodLabel ?? null,
              movedByName: data.movedByName ?? null,
              previousPeriodLabel: data.previousPeriodLabel ?? null,
            };
          })
        );
        setLoading(false);
      },
      // Clears the spinner and says why. Stopping the spinner without
      // logging is the silent-failure pattern this pass is removing.
      (err) => {
        console.error('[Expenses listener] ' + err.code + ': ' + err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user?.uid, seesAll]);


  // Daily reports. Only finance and admins can read the collection at all -
  // the rules reject anyone else - so the listener does not mount for them.
  useEffect(() => {
    if (!user || !seesAll) {
      setReports([]);
      return undefined;
    }
    const q = query(collection(db, REPORTS), orderBy('dateKey', 'desc'));
    return onSnapshot(
      q,
      (snapshot) => {
        setReports(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              dateKey: d.id,
              label: data.label ?? d.id,
              // 'monthly' or 'daily'. Without it the page cannot tell them
              // apart, and the month never gets its own block.
              kind: data.kind ?? (d.id.endsWith('-monthly') ? 'monthly' : 'daily'),
              // A monthly report carries that month's receipt photos as a zip.
              // Null on dailies, and on months that had none.
              archivePath: data.archivePath ?? null,
              // Receipts dated into this month that arrived after it closed.
              lateReceiptIds: data.lateReceiptIds ?? [],
              // Receipts finance moved into or out of this period after it was built.
              changedReceiptIds: data.changedReceiptIds ?? [],
              staleSince: data.staleSince ?? null,
              regeneratedAt: data.regeneratedAt ?? null,
              receiptCount: data.receiptCount ?? 0,
              totalCents: data.totalCents ?? 0,
              // Collection is per person now: the report used to be deleted when
              // anyone downloaded it, which took it away from everyone else.
              downloadedByUids: data.downloadedByUids ?? [],
              downloadedByNames: data.downloadedByNames ?? [],
              downloadedBy: data.downloadedBy ?? null,
            };
          })
        );
      },
      (err) => console.error('[ExpenseReports listener] ' + err.code + ': ' + err.message)
    );
  }, [user?.uid, seesAll]);

  // Sam's accounts, in his order. Read by everyone who files receipts.
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    if (!user) {
      setAccounts([]);
      return undefined;
    }
    return onSnapshot(
      collection(db, 'expenseAccounts'),
      (snap) =>
        setAccounts(
          snap.docs
            .map((d) => ({ code: d.id, ...d.data() }))
            .sort((a, b) => (a.headingOrder ?? 99) - (b.headingOrder ?? 99) || (a.order ?? 999) - (b.order ?? 999) || a.code.localeCompare(b.code))
        ),
      (err) => console.error('[ExpenseAccounts listener] ' + err.code + ': ' + err.message)
    );
  }, [user?.uid]);

  // The fiscal calendar - a few dozen small documents, read by everyone so
  // the form can say which period a receipt will go into.
  const [periods, setPeriods] = useState([]);
  useEffect(() => {
    if (!user) {
      setPeriods([]);
      return undefined;
    }
    return onSnapshot(
      collection(db, 'fiscalPeriods'),
      (snap) =>
        setPeriods(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.startKey.localeCompare(b.startKey))
        ),
      (err) => console.error('[FiscalPeriods listener] ' + err.code + ': ' + err.message)
    );
  }, [user?.uid]);

  // Two calls rather than one: the URL is issued first, and only once the
  // browser has the file do we mark it collected and delete it. A failed
  // download must not lose the report.
  // which: 'csv' by default, or 'photos' for the monthly receipt archive.
  const downloadReport = async (dateKey, which = 'csv') => {
    const fns = getFunctions(undefined, 'us-central1');
    const res = await httpsCallable(fns, 'getExpenseReportUrl')({ dateKey, which });
    const { url, label } = res.data;

    const file = await fetch(url);
    if (!file.ok) throw new Error('The report could not be downloaded.');
    const blob = await file.blob();

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    // The server names the file: old reports are .csv, new ones .xlsx.
    a.download = res.data.fileName ?? (which === 'photos' ? 'receipts-' + dateKey + '.zip' : 'expenses-' + dateKey + '.xlsx');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);

    if (which !== 'photos') {
      await httpsCallable(fns, 'confirmExpenseReportDownloaded')({ dateKey });
    }
  };

  // Rebuilds a closed month from the receipts as they stand now. Admins only.
  const rebuildPeriod = async (periodId) => {
    const fns = getFunctions(undefined, 'us-central1');
    const res = await httpsCallable(fns, 'rebuildPeriodReport', { timeout: 540000 })({ periodId });
    return res.data;
  };

  // Finance and admins - enforced by the function.
  const movePeriod = async (receiptId, periodId) => {
    const fns = getFunctions(undefined, 'us-central1');
    const res = await httpsCallable(fns, 'moveReceiptPeriod')({ receiptId, periodId });
    return res.data;
  };

  // Uncollected by you specifically. Someone else downloading it does not
  // clear your dot, and yours does not clear theirs.
  // Period reports only - the old dailies are history and age out on their own.
  const hasUncollectedReport = () =>
    reports.some((r) => r.kind === 'period' && !(r.downloadedByUids ?? []).includes(user?.uid));

  // Upload first, then record. The Storage rules already restrict a person to
  // their own folder, and the Cloud Function verifies the file exists before
  // writing anything — so a record can never point at a missing image.
  //
  // Takes a File straight from an <input type="file">, which uploadBytes
  // accepts as-is. The mobile version has to fetch its local URI into a blob
  // first; same destination, different starting point.
  const submitReceipt = async ({ file, amountCents, accountCode, attendees, locationId, where: whereText, reason, dateSpent }) => {
    recordDid('You submitted a receipt', 'Submitted from the Hub', '/expenses');
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
    const res = await fn({
      amountCents,
      accountCode,
      attendees: attendees ?? null,
      locationId: locationId ?? null,
      where: whereText,
      reason,
      dateSpent,
      storagePath: path,
    });
    return res.data;
  };

  // Every change goes through the server, which checks who is asking and
  // keeps a record of it (9 Oct 2026).
  const call = async (name, data) => (await httpsCallable(getFunctions(undefined, 'us-central1'), name)(data)).data;
  const editReceipt = (receiptId, fields) => call('editExpenseReceipt', { receiptId, ...fields });
  const recodeReceipt = (receiptId, accountCode) => call('recodeExpenseReceipt', { receiptId, accountCode });

  // Finance and admins look after the account list. An account is never
  // deleted - retired, so old receipts and reports keep their name.
  const addAccount = async ({ code, name, heading }) => {
    const c = String(code).trim();
    if (!/^[0-9][0-9A-Za-z-]{1,15}$/.test(c)) throw new Error('Use the account number from the books, e.g. 7260.');
    if (accounts.some((a) => a.code === c)) throw new Error('Account ' + c + ' is already on the list.');
    const sameHeading = accounts.filter((a) => a.heading === heading);
    await setDoc(doc(db, 'expenseAccounts', c), {
      code: c,
      name: String(name).trim(),
      heading,
      headingOrder: sameHeading[0]?.headingOrder ?? 99,
      order: Math.max(0, ...accounts.map((a) => a.order ?? 0)) + 1,
      retired: false,
      addedByName: user?.name ?? null,
      addedAt: Date.now(),
    });
  };
  const setAccountRetired = (code, retired) =>
    updateDoc(doc(db, 'expenseAccounts', code), retired ? { retired: true, retiredByName: user?.name ?? null, retiredAt: Date.now() } : { retired: false });

  // Storage denies reads to every client, so this is the only way to see a
  // receipt image. Batched: a page of receipts should not be a round trip each.
  const getImageUrls = async (ids) => {
    if (ids.length === 0) return {};
    const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'getReceiptUrls');
    const res = await fn({ ids });
    return res.data?.urls ?? {};
  };

  // Your own, until the period's report is made; Finance and admins any time.
  const voidReceipt = (receiptId, reason) => call('voidExpenseReceipt', { receiptId, reason });

  // Your own receipt can be changed until its period's report is made - the
  // Saturday after the catch-up week ends. The server makes the real check;
  // this only decides whether to offer the buttons.
  const isEditable = (r) => {
    if (r.voided || r.submittedByUid !== user?.uid) return false;
    const p = periods.find((x) => x.id === r.periodId);
    return !p || centralDateKey(new Date()) <= p.windowEndKey;
  };

  const value = useMemo(
    () => ({
      receipts,
      reports,
      seesAll,
      loading,
      submitReceipt,
      editReceipt,
      recodeReceipt,
      getImageUrls,
      voidReceipt,
      isEditable,
      accounts,
      addAccount,
      setAccountRetired,
      downloadReport,
      rebuildPeriod,
      movePeriod,
      periods,
      hasUncollectedReport,
    }),
    [receipts, reports, periods, accounts, seesAll, loading, user?.uid]
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



// The same rule the server applies (functions/fiscal.js), used only to tell
// the person in advance where their receipt will go. The server decides.
export function previewPeriod(periods, dateSpent, todayKey) {
  const find = (k) => periods.find((p) => p.startKey <= k && k <= p.endKey) ?? null;
  const current = find(todayKey);
  if (!current) return null;
  const spent = find(dateSpent);
  if (spent && spent.id !== current.id && todayKey <= spent.windowEndKey) return spent;
  return current;
}

// "Sep 28 – Oct 25"
export function periodRange(p) {
  const fmt = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  };
  return p ? fmt(p.startKey) + ' – ' + fmt(p.endKey) : '';
}

// "Friday, Oct 30"
export function prettyDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' });
}

