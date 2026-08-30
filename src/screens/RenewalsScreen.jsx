import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRenewals, isRenewalDueSoon } from '../context/RenewalsContext';
import { brands } from '../data/mockData';
import { useCustomLocations } from '../context/CustomLocationsContext';
import DatePickerField from '../components/DatePickerField';
import { useSchedule } from '../context/ScheduleContext';
import DocumentField from '../components/DocumentField';
import { RENEWAL_TYPE_BY_KEY } from '../data/checklists';
import { nike } from '../theme/nike';

function formatDate(ts) {
  if (!ts) return 'Not set';
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RenewalsScreen() {
  const { brandId, locationId } = useParams();
  const { user } = useAuth();
  const { getByLocation, ensureSeeded, updateDates, markRenewed } = useRenewals();

  // Maps a renewal type back to the checklist item that produced it, so a
  // document removed here also clears there.
  const clearChecklistDocument = (type) => {
    const key = Object.keys(RENEWAL_TYPE_BY_KEY).find((k) => RENEWAL_TYPE_BY_KEY[k] === type);
    if (!key) return;
    const match = entries.find(
      (e) => e.locationId === locationId && e.setupKey === key && e.document
    );
    if (match) updateEntry(match.id, { document: null });
  };
  const { getByBrand } = useCustomLocations();
  const { entries, updateEntry } = useSchedule();

  // If this permit/license has an initial "get this for the first time"
  // calendar task still open, saving real dates here completes it — same
  // document, so it disappears from the Calendar's urgent list right away.
  const completeLinkedCalendarTask = (type) => {
    const linked = entries.find(
      (e) => e.locationId === locationId && e.renewalItem && e.renewalType === type && !e.done
    );
    if (linked) {
      updateEntry(linked.id, { done: true, doneBy: user?.name ?? 'Unknown', doneAt: Date.now() });
    }
  };

  const brand = brands.find((b) => b.id === brandId);
  const allLocations = brand ? [...brand.locations, ...getByBrand(brand.id).map((l) => ({ id: l.id, name: l.name }))] : [];
  const location = allLocations.find((l) => l.id === locationId);

  const [editingItem, setEditingItem] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [editApproved, setEditApproved] = useState('');
  const [editExpiration, setEditExpiration] = useState('');

  const [signOffItem, setSignOffItem] = useState(null);
  const [signOffName, setSignOffName] = useState('');
  const [signOffDate, setSignOffDate] = useState('');

  useEffect(() => {
    if (locationId) ensureSeeded(locationId);
  }, [locationId]);

  const items = getByLocation(locationId);

  const openEdit = (item) => {
    setEditingItem(item);
    setEditApproved(item.approvedDate ? new Date(item.approvedDate).toISOString().slice(0, 10) : '');
    setEditExpiration(item.expirationDate ? new Date(item.expirationDate).toISOString().slice(0, 10) : '');
  };
  const saveEdit = async () => {
    const approvedTs = editApproved ? new Date(editApproved).getTime() : null;
    const expirationTs = editExpiration ? new Date(editExpiration).getTime() : null;
    await updateDates(editingItem.id, approvedTs, expirationTs);
    if (approvedTs && expirationTs) completeLinkedCalendarTask(editingItem.type);
    setEditingItem(null);
  };

  const openSignOff = (item) => {
    setSignOffItem(item);
    setSignOffName(user?.name ?? '');
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    setSignOffDate(nextYear.toISOString().slice(0, 10));
  };
  const confirmSignOff = async () => {
    await markRenewed(signOffItem.id, signOffName.trim() || user?.name || 'Unknown', new Date(signOffDate).getTime());
    completeLinkedCalendarTask(signOffItem.type);
    setSignOffItem(null);
  };

  if (!brand || !location) return null;

  return (
    <div style={styles.page}>
      <Link to={`/brand/${brand.id}/location/${location.id}`} style={styles.backLink}>
        ‹ {location.name}
      </Link>
      <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>License & Lease Renewals</h1>

      <div style={styles.body}>
        <div style={styles.headRow}>
          <span style={styles.headName}>Permit</span>
          <span style={styles.headCol}>Approved</span>
          <span style={styles.headCol}>Expires</span>
          <span style={styles.headStatus} />
          <span style={styles.headChevron} />
        </div>

        {/* Soonest first, unset at the bottom. The old order came from the
            renewalTypes array, which put whatever happens to be listed first
            at the top regardless of whether it needed attention. */}
        {[...items]
          .sort((a, b) => (a.expirationDate ?? Infinity) - (b.expirationDate ?? Infinity))
          .map((item) => {
            const dueSoon = isRenewalDueSoon(item);
            const isOpen = expandedId === item.id;
            const days = item.expirationDate
              ? Math.round((item.expirationDate - Date.now()) / (24 * 60 * 60 * 1000))
              : null;
            return (
              <div key={item.id} style={styles.row}>
                <div
                  data-row=""
                  style={{ ...styles.rowMain, ...(dueSoon ? styles.rowDue : {}) }}
                  onClick={() => setExpandedId(isOpen ? null : item.id)}
                >
                  <span style={styles.rowName}>{item.type}</span>
                  <span style={styles.rowCol}>{item.approvedDate ? formatDate(item.approvedDate) : '—'}</span>
                  <span style={{ ...styles.rowCol, color: dueSoon ? 'var(--danger)' : 'var(--text-secondary)' }}>
                    {item.expirationDate ? formatDate(item.expirationDate) : '—'}
                    {days != null && days >= 0 ? <span style={styles.daysNote}> · {days}d</span> : null}
                  </span>
                  <span style={styles.headStatus}>
                    {dueSoon ? <span style={styles.dueBadge}>DUE SOON</span> : null}
                  </span>
                  <span style={styles.headChevron}>{isOpen ? '▾' : '▸'}</span>
                </div>

                {isOpen ? (
                  <div style={styles.rowBody} data-reveal="">
                    <div style={styles.actionRow}>
                      <button style={styles.cancelButton} onClick={() => openEdit(item)}>
                        Edit Dates
                      </button>
                      <button style={styles.saveButton} onClick={() => openSignOff(item)}>
                        Mark Renewed
                      </button>
                    </div>
                    {item.signedOffBy ? (
                      <p style={styles.signOffNote}>Last renewed by {item.signedOffBy}</p>
                    ) : null}
                    <DocumentField
                      locationId={locationId}
                      itemKey={item.type.replace(/\s+/g, '-').toLowerCase()}
                      value={item.document ?? null}
                      userName={user?.name}
                      onChange={(docRef) => {
                        updateDates(item.id, item.approvedDate, item.expirationDate, docRef);
                        // Removing a permit should clear it everywhere it was
                        // shared — the file is gone from Storage, so leaving
                        // the checklist pointing at it is a dead link.
                        // Attaching stays one-way: after a renewal the new
                        // document belongs to the renewal, not the original
                        // setup task.
                        if (docRef === null) clearChecklistDocument(item.type);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
      </div>

      {editingItem ? (
        <div style={styles.modalBackdrop} onClick={() => setEditingItem(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{editingItem.type}</h2>
            <label style={styles.label}>Approved Date</label>
            <DatePickerField value={editApproved} onChange={setEditApproved} placeholder="Not set" />
            <label style={styles.label}>Expiration / Renewal Due Date</label>
            <DatePickerField value={editExpiration} onChange={setEditExpiration} placeholder="Not set" />
            <p style={styles.modalNote}>Use this to correct a mistake. To actually renew, use "Mark Renewed" instead.</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button style={styles.cancelButton} onClick={() => setEditingItem(null)}>
                Cancel
              </button>
              <button style={styles.saveButton} onClick={saveEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {signOffItem ? (
        <div style={styles.modalBackdrop} onClick={() => setSignOffItem(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Mark Renewed</h2>
            <p style={styles.modalBody}>{signOffItem.type} — who's signing off?</p>
            <label style={styles.label}>Name</label>
            <input style={styles.input} value={signOffName} onChange={(e) => setSignOffName(e.target.value)} />
            <label style={styles.label}>New expiration / next renewal due date</label>
            <DatePickerField value={signOffDate} onChange={setSignOffDate} />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button style={styles.cancelButton} onClick={() => setSignOffItem(null)}>
                Cancel
              </button>
              <button style={styles.saveButton} onClick={confirmSignOff}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  // A table, because that's what this is — seven rows of the same three
  // fields. As cards it was three screens of scrolling and you couldn't
  // compare expiry dates without reading each one.
  headRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 14px',
    borderBottom: '1px solid var(--border-strong)',
  },
  headName: { flex: 1, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-primary)' },
  headCol: { width: 130, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  headStatus: { width: 84, flexShrink: 0 },
  headChevron: { width: 12, fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 },

  row: { borderBottom: '1px solid var(--border)' },
  rowMain: { display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', cursor: 'pointer' },
  rowDue: { background: 'rgba(232,82,75,0.07)' },
  rowName: { flex: 1, fontSize: 14, color: 'var(--text-primary)' },
  rowCol: { width: 130, fontSize: 13, color: 'var(--text-secondary)' },
  daysNote: { color: 'var(--text-tertiary)' },
  dueBadge: { fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: 'var(--danger)' },
  rowBody: { padding: '4px 14px 16px' },
  actionRow: { display: 'flex', gap: 10, marginBottom: 10 },

  page: { padding: '28px 36px', maxWidth: 640 },
  backLink: { fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-block', marginBottom: 14 },
  title: { fontSize: 22, fontWeight: 700, margin: '0 0 20px' },
  body: {},
  signOffNote: { fontSize: 11, color: 'var(--text-secondary)', margin: '6px 0 0' },
  cancelButton: { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12 },
  saveButton: { padding: '8px 16px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' },

  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { width: 360, background: 'var(--bg-elevated)', border: 'none', borderRadius: 18, padding: 22, boxShadow: 'var(--shadow-lg)' },
  modalTitle: { fontSize: 19, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.2, color: '#FFFFFF', margin: '0 0 12px' },
  modalBody: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 },
  modalNote: { fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 },
  label: { display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, marginTop: 10 },
  input: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 7,
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  },
};
