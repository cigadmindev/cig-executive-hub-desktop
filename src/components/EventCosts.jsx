import React, { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { db, storage } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useExpenses, EXEC_CATEGORIES, isStoreLevel, parseAmount } from '../context/ExpensesContext';
import { detailStyles as d } from './RequestPage';
import { plainError } from '../lib/errors';

// What a catering order or private event cost (Mark, 10 Oct 2026). Receipts
// are added here while the event is being worked; when it closes - Paid for
// catering, Done for a private event - the server files every one to
// Expenses under the event's location, marked "billed to the customer", so
// Sam sees them as costs the customer paid for. Added after it closed? Filed
// straight away.
//
// What it was for is asked the same way as in Expenses: Sam's accounts for
// restaurant and Catering & Events people, Mark's six for executives.
const money = (cents) => '$' + ((cents ?? 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function EventCosts({ enquiry, canAdd, notify }) {
  const { user } = useAuth();
  const { accounts } = useExpenses();
  const storeUser = isStoreLevel(user);
  const [costs, setCosts] = useState([]);
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState(null);
  const [amount, setAmount] = useState('');
  const [forWhat, setForWhat] = useState('');
  const [where, setWhere] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'cateringEnquiries', enquiry.id, 'costs'),
        (snap) => setCosts(snap.docs.map((x) => ({ id: x.id, ...x.data() })).sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0))),
        (err) => console.error('[EventCosts] ' + err.code + ': ' + err.message)
      ),
    [enquiry.id]
  );

  const closed = enquiry.kind === 'catering' ? !!enquiry.paidAt : enquiry.status === 'done';
  const when = enquiry.kind === 'catering' ? 'Paid' : 'Done';
  const total = costs.reduce((n, c) => n + (c.amountCents ?? 0), 0);
  const labelFor = (c) =>
    c.execCategory
      ? EXEC_CATEGORIES.find(([k]) => k === c.execCategory)?.[1] ?? 'Cost'
      : accounts.find((a) => a.code === c.accountCode)?.name ?? 'Cost';
  const live = accounts.filter((a) => !a.retired);
  const headings = [...new Set(live.map((a) => a.heading))];

  const reset = () => {
    setAdding(false);
    setFile(null);
    setAmount('');
    setForWhat('');
    setWhere('');
  };

  const save = async () => {
    const cents = parseAmount(amount);
    if (!file) return notify('Add the receipt photo', 'Take or choose a photo of the receipt first.');
    if (cents === null) return notify('Check the amount', 'Enter an amount greater than zero.');
    if (!forWhat) return notify('What was it for?', 'Pick what the cost was for.');
    if (where.trim().length < 2) return notify('Where was it bought?', 'Add the business on the receipt.');
    if (file.size >= 12 * 1024 * 1024) return notify('That file is too large', 'Receipts can be up to 12 MB.');
    setSaving(true);
    try {
      const path = `receipts/${user.uid}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${file.name}`;
      await uploadBytes(storageRef(storage, path), file);
      await addDoc(collection(db, 'cateringEnquiries', enquiry.id, 'costs'), {
        amountCents: cents,
        accountCode: storeUser ? forWhat : null,
        execCategory: storeUser ? null : forWhat,
        where: where.trim(),
        storagePath: path,
        addedByUid: user.uid,
        addedByName: user.name ?? '',
        addedAt: Date.now(),
        filedReceiptId: null,
      });
      reset();
    } catch (err) {
      notify('Could not add it', plainError(err, 'Nothing was saved. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={d.section}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <p style={d.sectionLabel}>COSTS FOR THIS EVENT</p>
        {costs.length ? <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>{money(total)}</span> : null}
      </div>
      {costs.map((c) => (
        <div key={c.id} style={styles.row}>
          <span style={{ flex: 1, minWidth: 0 }}>
            {labelFor(c)} <span style={styles.muted}>· {c.where} · {c.addedByName}</span>
            {c.filedReceiptId ? <span style={styles.filed}> · in Expenses</span> : null}
          </span>
          <span style={{ fontWeight: 700 }}>{money(c.amountCents)}</span>
          {!c.filedReceiptId && c.addedByUid === user?.uid ? (
            <button
              style={styles.remove}
              aria-label="Remove this cost"
              onClick={() => deleteDoc(doc(db, 'cateringEnquiries', enquiry.id, 'costs', c.id)).catch((err) => notify('Nothing was changed', plainError(err)))}
            >
              ✕
            </button>
          ) : null}
        </div>
      ))}
      {canAdd && !adding ? (
        <button style={styles.add} onClick={() => setAdding(true)}>+ Add a cost (photo of the receipt)</button>
      ) : null}
      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <button style={styles.add} onClick={() => fileRef.current?.click()}>{file ? 'Photo: ' + file.name : '+ Take or choose a photo of the receipt'}</button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(ev) => setFile(ev.target.files?.[0] ?? null)} />
          <input style={d.input} inputMode="decimal" placeholder="Amount, e.g. 186.40" value={amount} onChange={(ev) => setAmount(ev.target.value.replace(/[^0-9.]/g, ''))} aria-label="Amount" />
          <select style={d.input} value={forWhat} onChange={(ev) => setForWhat(ev.target.value)} aria-label="What was it for">
            <option value="">What was it for?</option>
            {storeUser
              ? headings.map((h) => (
                  <optgroup key={h} label={h}>
                    {live.filter((a) => a.heading === h).map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
                  </optgroup>
                ))
              : EXEC_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input style={d.input} placeholder="Where - the business on the receipt" value={where} onChange={(ev) => setWhere(ev.target.value)} aria-label="Where" />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={d.ghost} disabled={saving} onClick={reset}>Cancel</button>
            <button style={d.primary} disabled={saving} onClick={save}>{saving ? 'Adding…' : 'Add cost'}</button>
          </div>
        </div>
      ) : null}
      <p style={styles.hint}>
        {closed
          ? 'This event has closed, so each cost goes to Expenses as soon as it is added.'
          : `When this event is marked ${when}, these go to Expenses under ${enquiry.brandName ? enquiry.brandName + ' · ' : ''}${enquiry.locationName || 'its location'}, marked "billed to the customer", so Sam sees them as costs the customer paid for.`}
      </p>
    </div>
  );
}

const styles = {
  row: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', padding: '8px 0', borderTop: '1px solid var(--border)' },
  muted: { color: 'var(--text-tertiary)' },
  filed: { color: '#4ADE80' },
  remove: { background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', width: 32, height: 32, borderRadius: 8 },
  add: { width: '100%', minHeight: 44, border: '1px dashed var(--border-strong)', borderRadius: 10, background: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8 },
  hint: { fontSize: 12, lineHeight: 1.5, color: 'var(--text-tertiary)', margin: '8px 0 0' },
};
