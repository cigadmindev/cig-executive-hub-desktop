import React, { useState } from 'react';
import DatePickerField from '../components/DatePickerField';
import { useAuth } from '../context/AuthContext';
import { useInvoices } from '../context/InvoicesContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { brands } from '../data/mockData';
import { useDialog } from '../hooks/useDialog';
import { nike } from '../theme/nike';

// Invoices waiting to be paid, and who is on each.
//
// A GM uploads; the file goes to that location's Financials folder in Drive.
// Michele and Sam see the same list, grouped by restaurant with the oldest due
// first, and claim one before working it - so neither starts something the
// other has already picked up.
const money = (cents) => (cents == null ? '' : '$' + (cents / 100).toFixed(2));
const dateText = (t) => (t ? new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'No due date');

export default function InvoicesScreen() {
  const { user } = useAuth();
  const { outstanding, paid, addInvoice, claim, unclaim, markPaid } = useInvoices();
  const { getByBrand } = useCustomLocations();
  const { dialogNode, notify, confirm } = useDialog();

  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState(null);
  const [locationId, setLocationId] = useState('');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [showPaid, setShowPaid] = useState(false);

  const handles = user?.role === 'admin' || user?.job === 'Financials' || user?.job === 'Owner';

  // Only where this person can actually file one.
  const places = brands
    .filter((b) => user?.role === 'admin' || user?.role === 'executive' || (user?.permissions?.brandIds ?? []).includes(b.id))
    .flatMap((b) => [
      ...(b.locations ?? []).map((l) => ({ id: l.id, name: l.name, brandId: b.id, brandName: b.name })),
      ...getByBrand(b.id).map((l) => ({ id: l.id, name: l.name, brandId: b.id, brandName: b.name })),
    ]);

  const reset = () => {
    setFile(null);
    setLocationId('');
    setVendor('');
    setAmount('');
    setDueDate('');
    setNote('');
  };

  const submit = async () => {
    const place = places.find((p) => p.id === locationId);
    if (!file) return notify('Attach the invoice', 'Pick the file first.');
    if (!place) return notify('Which location?', 'Pick where this invoice belongs.');

    setSaving(true);
    try {
      await addInvoice({
        file,
        locationId: place.id,
        locationName: place.name,
        brandId: place.brandId,
        brandName: place.brandName,
        vendor,
        amountCents: amount ? Math.round(parseFloat(amount) * 100) : null,
        dueDate: dueDate ? new Date(dueDate + 'T12:00:00').getTime() : null,
        note,
      });
      setFormOpen(false);
      reset();
      notify('Sent', 'It will show for whoever handles paying, and the file is filed in Drive.');
    } catch (err) {
      notify('Could not send', err?.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  // Grouped by restaurant and location, oldest due first inside each.
  const groups = [];
  const byPlace = new Map();
  outstanding.forEach((i) => {
    const label = [i.brandName, i.locationName].filter(Boolean).join(' · ') || 'Not specified';
    if (!byPlace.has(label)) byPlace.set(label, []);
    byPlace.get(label).push(i);
  });
  [...byPlace.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([label, list]) =>
      groups.push({ label, list: list.sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)) })
    );

  const row = (i) => {
    const overdue = i.dueDate && i.dueDate < Date.now() && !i.paidAt;
    return (
      <div key={i.id} style={styles.row}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={styles.vendor}>
            {i.vendor || 'Invoice'} {i.amountCents != null ? <span style={styles.amount}>{money(i.amountCents)}</span> : null}
          </p>
          <p style={{ ...styles.meta, ...(overdue ? styles.metaOverdue : {}) }}>
            {overdue ? 'Overdue · due ' : 'Due '}
            {dateText(i.dueDate)}
            {i.submittedByName ? ' · from ' + i.submittedByName : ''}
            {i.paidAt ? ' · paid by ' + i.paidByName : i.claimedByName ? ' · ' + i.claimedByName + ' is on it' : ''}
          </p>
          {i.note ? <p style={styles.note}>{i.note}</p> : null}
          {i.driveError ? <p style={styles.error}>Not filed in Drive yet — {i.driveError}</p> : null}
        </div>

        {i.driveUrl ? (
          <a href={i.driveUrl} target="_blank" rel="noreferrer" style={styles.link}>
            Open
          </a>
        ) : (
          <span style={styles.filing}>Filing…</span>
        )}

        {handles && !i.paidAt ? (
          <>
            {i.claimedByUid === user?.uid ? (
              <button style={styles.buttonQuiet} onClick={() => unclaim(i.id)}>
                Not me
              </button>
            ) : !i.claimedByUid ? (
              <button style={styles.buttonQuiet} onClick={() => claim(i.id)}>
                I'm on it
              </button>
            ) : null}
            <button
              style={styles.button}
              onClick={() =>
                confirm({
                  title: 'Mark as paid?',
                  body: (i.vendor || 'This invoice') + ' will show as paid by you, and the GM who sent it will see that.',
                  confirmLabel: 'Mark paid',
                  onConfirm: () => markPaid(i.id),
                })
              }
            >
              Paid
            </button>
          </>
        ) : null}
      </div>
    );
  };

  return (
    <div style={styles.page}>
      <div style={styles.headRow}>
        <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Invoices</h1>
        <button style={styles.newButton} onClick={() => setFormOpen(true)}>
          + Send an invoice
        </button>
      </div>
      <p style={styles.subtitle}>
        {handles
          ? 'Everything waiting to be paid. Claim one before you start so nobody doubles up.'
          : 'Invoices you have sent, and where each one is.'}
      </p>

      {outstanding.length === 0 ? (
        <p style={styles.empty}>Nothing outstanding.</p>
      ) : (
        groups.map((g) => (
          <div key={g.label} style={styles.group}>
            <p style={styles.groupLabel}>{g.label}</p>
            <div style={styles.list}>{g.list.map(row)}</div>
          </div>
        ))
      )}

      {paid.length > 0 ? (
        <>
          <button style={styles.showPaid} onClick={() => setShowPaid((v) => !v)}>
            {showPaid ? 'Hide' : 'Show'} paid ({paid.length})
          </button>
          {showPaid ? <div style={styles.list}>{paid.slice(0, 40).map(row)}</div> : null}
        </>
      ) : null}

      {formOpen ? (
        <div style={styles.backdrop} onClick={() => !saving && setFormOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Send an invoice</h2>

            <label style={styles.label}>The invoice</label>
            <input style={styles.input} type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

            <label style={styles.label}>Which location</label>
            <select style={styles.input} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Pick one…</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brandName} · {p.name}
                </option>
              ))}
            </select>

            <label style={styles.label}>Vendor</label>
            <input style={styles.input} value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Who it is from" />

            <label style={styles.label}>Amount</label>
            <input style={styles.input} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />

            <label style={styles.label}>Due date</label>
            <DatePickerField value={dueDate} onChange={setDueDate} placeholder="Due date" />

            <label style={styles.label}>Anything they should know</label>
            <textarea style={{ ...styles.input, ...styles.textarea }} value={note} onChange={(e) => setNote(e.target.value)} />

            <p style={styles.hint}>Only the file and the location are needed. The rest makes the list easier to work through.</p>

            <div style={styles.modalButtons}>
              <button style={styles.buttonQuiet} onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </button>
              <button style={styles.button} onClick={submit} disabled={saving}>
                {saving ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '28px max(22px, min(36px, 4vw))', maxWidth: 760 },
  headRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 20px' },
  newButton: { padding: '9px 14px', borderRadius: 10, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer' },
  empty: { fontSize: 13, color: 'var(--text-tertiary)' },

  group: { marginBottom: 18 },
  groupLabel: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '0 0 6px' },
  list: { background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden' },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)' },
  vendor: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 },
  amount: { color: 'var(--text-secondary)', fontWeight: 500 },
  meta: { fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' },
  metaOverdue: { color: 'var(--danger)' },
  note: { fontSize: 12, color: 'var(--text-tertiary)', margin: '3px 0 0' },
  error: { fontSize: 12, color: 'var(--danger)', margin: '3px 0 0' },
  link: { fontSize: 12, color: 'var(--neon)', textDecoration: 'none', whiteSpace: 'nowrap' },
  filing: { fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' },
  button: { padding: '7px 12px', borderRadius: 9, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  buttonQuiet: { padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  showPaid: { background: 'none', border: 'none', padding: '8px 0', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' },

  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 },
  modal: { width: 'min(420px, 100%)', maxHeight: '86vh', overflowY: 'auto', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, padding: 22 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 12px' },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5, marginTop: 12 },
  input: { width: '100%', boxSizing: 'border-box', minHeight: 38, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 },
  textarea: { minHeight: 64, resize: 'vertical' },
  hint: { fontSize: 12, color: 'var(--text-tertiary)', margin: '12px 0 0' },
  modalButtons: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
};
