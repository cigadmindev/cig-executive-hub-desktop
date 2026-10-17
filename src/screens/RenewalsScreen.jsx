import { atLeast } from '../data/accessMatrix';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRenewals, isRenewalDueSoon } from '../context/RenewalsContext';
import { brands , canEditChecklists } from '../data/mockData';
import { useCustomLocations } from '../context/CustomLocationsContext';
import DatePickerField from '../components/DatePickerField';
import { useSchedule } from '../context/ScheduleContext';
import { useDialog } from '../hooks/useDialog';
import DocumentField from '../components/DocumentField';
import { RENEWAL_TYPE_BY_KEY } from '../data/checklists';
import PageHeader from '../components/PageHeader';
import { fmtDay } from '../lib/dates';
import Pill from '../components/Pill';
import { useIsNarrow } from '../hooks/useIsNarrow';
import { modalBackdrop, modalSurface } from '../theme/modal';
import { plainError } from '../lib/errors';

const formatDate = (ts) => (ts ? fmtDay(ts) : 'Not set');

export default function RenewalsScreen() {
  const { brandId, locationId } = useParams();
  const { dialogNode, notify, confirm } = useDialog();
  const { user } = useAuth();
  const isNarrow = useIsNarrow();
  const { getByLocation, ensureSeeded, updateDates, markRenewed, addRenewal, setRenewalHidden } = useRenewals();
  // Same three as the checklist: admins, the COO and the beverage manager.
  const canEdit = canEditChecklists(user);
  // Doing the renewal work - dates, documents, marking it renewed - is the
  // Renewals column at Full (14 Oct 2026); View rows just see the list.
  const canWork = user?.role === 'admin' || atLeast(user, 'renewals', 'full');
  const [showHidden, setShowHidden] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newType, setNewType] = useState('');

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
      updateEntry(linked.id, { done: true, doneBy: user?.name ?? 'Unknown', doneAt: Date.now() }).catch((err) =>
        console.error('[Renewals] calendar task not ticked: ' + (err?.code ?? err))
      );
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

  const items = getByLocation(locationId, canEdit && showHidden);

  const openEdit = (item) => {
    setEditingItem(item);
    setEditApproved(item.approvedDate ? new Date(item.approvedDate).toISOString().slice(0, 10) : '');
    setEditExpiration(item.expirationDate ? new Date(item.expirationDate).toISOString().slice(0, 10) : '');
  };
  const saveEdit = async () => {
    const approvedTs = editApproved ? new Date(editApproved).getTime() : null;
    const expirationTs = editExpiration ? new Date(editExpiration).getTime() : null;
    try {
      await updateDates(editingItem.id, approvedTs, expirationTs);
      // Both of these follow the save and must not run if it failed - the
      // linked checklist item would be ticked off against dates that were
      // never stored.
      if (approvedTs && expirationTs) completeLinkedCalendarTask(editingItem.type);
      setEditingItem(null);
    } catch (err) {
      notify('Could not save', plainError(err, 'The dates were not saved. Try again.'));
    }
  };

  const openSignOff = (item) => {
    setSignOffItem(item);
    setSignOffName(user?.name ?? '');
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    setSignOffDate(nextYear.toISOString().slice(0, 10));
  };
  const confirmSignOff = async () => {
    try {
      await markRenewed(signOffItem.id, signOffName.trim() || user?.name || 'Unknown', new Date(signOffDate).getTime());
      completeLinkedCalendarTask(signOffItem.type);
      setSignOffItem(null);
    } catch (err) {
      // The worst silent failure in the app: the modal closes and the permit
      // still expires, but someone believes it is renewed.
      notify('Could not sign off', plainError(err, 'The renewal was not recorded. Try again.'));
    }
  };

  // One status per permit, used for the dot, the pill and the counts.
  const DAY = 24 * 60 * 60 * 1000;
  const statusOf = (item) => {
    if (!item.expirationDate) return { key: 'none', tone: 'grey', label: 'No date', color: 'var(--border-strong)' };
    const days = Math.round((item.expirationDate - Date.now()) / DAY);
    if (days < 0) return { key: 'overdue', tone: 'red', label: 'Expired', color: 'var(--bad)' };
    if (isRenewalDueSoon(item)) return { key: 'soon', tone: 'amber', label: days === 0 ? 'Today' : days + ' days left', color: 'var(--warn)' };
    return { key: 'ok', tone: 'green', label: days > 60 ? Math.round(days / 30) + ' months' : days + ' days', color: 'var(--ok)' };
  };
  const sorted = [...items].sort((a, b) => (a.expirationDate ?? Infinity) - (b.expirationDate ?? Infinity));
  const counts = { overdue: 0, soon: 0, ok: 0, none: 0 };
  for (const i of items) if (!i.hidden) counts[statusOf(i).key]++;

  if (!brand || !location) return null;

  return (
    <div style={styles.page}>
      <PageHeader
        back={{ to: `/brand/${brand.id}/location/${location.id}`, label: location.name }}
        title="License & Lease Renewals"
        subtitle="Every permit and lease for this location, and when each one needs renewing."
        actionLabel={canEdit && !addOpen ? '+ Add permit' : null}
        onAction={() => setAddOpen(true)}
      />

      {/* Per location: a permit added here is on this location's list and
          nowhere else, and one removed here is still on everyone else's. */}
      {canEdit && addOpen ? (
        <div style={isNarrow ? styles.addRowNarrow : styles.addRow}>
          <input
            style={styles.addInput}
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            placeholder="Health Department Permit"
            autoFocus
          />
          <div style={styles.addButtons}>
            <button style={styles.addCancel} onClick={() => { setAddOpen(false); setNewType(''); }}>
              Cancel
            </button>
            <button
              style={styles.addConfirm}
              disabled={!newType.trim()}
              onClick={async () => {
                try {
                  await addRenewal(locationId, newType.trim());
                  setNewType('');
                  setAddOpen(false);
                } catch (err) {
                  notify('Could not add', plainError(err, 'Try again.'));
                }
              }}
            >
              Add
            </button>
          </div>
        </div>
      ) : null}

      {/* At a glance (17 Oct 2026): how many need attention before reading
          the list. */}
      <div style={isNarrow ? styles.statsNarrow : styles.stats}>
        {[
          ['Expired', counts.overdue, 'var(--bad)'],
          ['Due soon', counts.soon, 'var(--warn)'],
          ['Up to date', counts.ok, 'var(--ok)'],
          ['No date yet', counts.none, 'var(--text-tertiary)'],
        ].map(([label, n, color]) => (
          <div key={label} style={styles.stat}>
            <span style={{ ...styles.statNum, color: n ? color : 'var(--text-tertiary)' }}>{n}</span>
            <span style={styles.statLabel}>{label}</span>
          </div>
        ))}
      </div>

      <div style={styles.card}>
        <div style={styles.cardHead}>
          <span style={styles.cardTitle}>{items.filter((i) => !i.hidden).length} permits &amp; leases</span>
          {canEdit ? (
            <button style={styles.textButton} onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? 'Hide removed' : 'Show removed'}
            </button>
          ) : null}
        </div>

        {isNarrow ? null : (
          <div style={styles.headRow}>
            <span style={styles.headName}>Permit</span>
            <span style={styles.headCol}>Approved</span>
            <span style={styles.headCol}>Expires</span>
            <span style={styles.headStatus}>Status</span>
            <span style={styles.headChevron} />
          </div>
        )}

        {/* Soonest first, unset at the bottom. */}
        {sorted.map((item) => {
          const isOpen = expandedId === item.id;
          const st = statusOf(item);
          return (
            <div key={item.id} style={styles.row}>
              <div
                data-row=""
                style={{
                  ...styles.rowMain,
                  ...(isNarrow ? styles.rowMainNarrow : {}),
                  ...(isOpen ? styles.rowOpen : {}),
                  ...(item.hidden ? styles.rowHidden : {}),
                }}
                onClick={() => setExpandedId(isOpen ? null : item.id)}
              >
                <span style={{ ...styles.dot, background: st.color }} />
                {isNarrow ? (
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={styles.rowName}>{item.type}</span>
                    <span style={styles.rowSub}>
                      {item.expirationDate ? 'Expires ' + formatDate(item.expirationDate) : 'No expiry date yet'}
                    </span>
                  </span>
                ) : (
                  <>
                    <span style={styles.rowName}>{item.type}</span>
                    <span style={styles.rowCol}>{item.approvedDate ? formatDate(item.approvedDate) : '—'}</span>
                    <span style={{ ...styles.rowCol, color: st.key === 'overdue' ? 'var(--bad)' : 'var(--text-secondary)' }}>
                      {item.expirationDate ? formatDate(item.expirationDate) : '—'}
                    </span>
                  </>
                )}
                <span style={isNarrow ? { flexShrink: 0 } : styles.headStatus}>
                  <Pill tone={st.tone}>{st.label}</Pill>
                </span>
                <span style={styles.headChevron}>{isOpen ? '▾' : '▸'}</span>
              </div>

              {isOpen ? (
                <div style={isNarrow ? styles.rowBodyNarrow : styles.rowBody} data-reveal="">
                  <div style={styles.bodyGrid}>
                    <div style={styles.bodySection}>
                      <span style={styles.bodyLabel}>Dates</span>
                      <p style={styles.bodyLine}>Approved <b style={styles.bodyValue}>{item.approvedDate ? formatDate(item.approvedDate) : 'not set'}</b></p>
                      <p style={styles.bodyLine}>Expires <b style={styles.bodyValue}>{item.expirationDate ? formatDate(item.expirationDate) : 'not set'}</b></p>
                      {item.signedOffBy ? <p style={styles.bodyLine}>Last renewed by <b style={styles.bodyValue}>{item.signedOffBy}</b></p> : null}
                    </div>
                    <div style={styles.bodySection}>
                      <DocumentField
                        locationId={locationId}
                        itemKey={item.type.replace(/\s+/g, '-').toLowerCase()}
                        value={item.document ?? null}
                        userName={user?.name}
                        readOnly={!canWork}
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
                  </div>
                  {canWork || canEdit ? (
                    <div style={styles.bodyFooter}>
                      {canEdit ? (
                        <button
                          style={styles.removeLink}
                          onClick={() =>
                            item.hidden
                              ? setRenewalHidden(item.id, false)
                              : confirm({
                                  title: `Remove "${item.type}"?`,
                                  body: "It comes off this location's list. Other locations are unaffected, and you can put it back with Show removed.",
                                  confirmLabel: 'Remove',
                                  tone: 'danger',
                                  onConfirm: () => setRenewalHidden(item.id, true),
                                })
                          }
                        >
                          {item.hidden ? 'Put back' : 'Remove'}
                        </button>
                      ) : <span />}
                      {canWork ? (
                        <div style={styles.actionRow}>
                          <button style={styles.cancelButton} onClick={() => openEdit(item)}>
                            Edit dates
                          </button>
                          <button style={styles.saveButton} onClick={() => openSignOff(item)}>
                            Mark renewed
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {editingItem ? (
        <div data-modal="" data-modal-keep="" style={styles.modalBackdrop} onClick={() => setEditingItem(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{editingItem.type}</h2>
            <label style={styles.label}>Approved Date</label>
            <DatePickerField value={editApproved} onChange={setEditApproved} placeholder="Not set" />
            <label style={styles.label}>Expiration / Renewal Due Date</label>
            <DatePickerField value={editExpiration} onChange={setEditExpiration} placeholder="Not set" />
            <p style={styles.modalNote}>Use this to correct a mistake. To actually renew, use "Mark renewed" instead.</p>
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
        <div data-modal="" data-modal-keep="" style={styles.modalBackdrop} onClick={() => setSignOffItem(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Mark renewed</h2>
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

      {dialogNode}
    </div>
  );
}

const styles = {
  // Full width like every other page (17 Oct 2026), so + Add permit sits at
  // the far right of the window.
  page: { padding: '28px max(22px, min(40px, 4vw))' },

  stats: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 },
  statsNarrow: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 },
  stat: {
    display: 'flex', flexDirection: 'column', gap: 2,
    padding: '12px 14px', borderRadius: 12,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
  },
  statNum: { fontSize: 24, fontWeight: 800, lineHeight: 1.1 },
  statLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 },

  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' },
  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' },
  cardTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  textButton: { background: 'none', border: 'none', padding: '6px 0', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },

  headRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 16px',
    borderBottom: '1px solid var(--border)',
  },
  headName: { flex: 1, paddingLeft: 20, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  headCol: { width: 140, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  headStatus: { width: 110, flexShrink: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  headChevron: { width: 12, fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 },

  row: { borderBottom: '1px solid var(--border)' },
  rowMain: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' },
  rowMainNarrow: { padding: '13px 14px', gap: 10 },
  rowOpen: { background: 'var(--bg-card-hover)' },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  rowName: { flex: 1, display: 'block', minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowSub: { display: 'block', fontSize: 12, marginTop: 3, color: 'var(--text-tertiary)' },
  rowCol: { width: 140, fontSize: 13, color: 'var(--text-secondary)' },

  rowBody: { padding: '14px 16px 16px 36px', background: 'var(--bg-card-hover)' },
  rowBodyNarrow: { padding: '12px 14px 14px', background: 'var(--bg-card-hover)' },
  bodyGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '14px 24px' },
  bodySection: { minWidth: 0 },
  bodyLabel: { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 },
  bodyLine: { margin: '0 0 4px', fontSize: 13, color: 'var(--text-secondary)' },
  bodyValue: { color: 'var(--text-primary)', fontWeight: 600 },
  bodyFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' },
  actionRow: { display: 'flex', gap: 8, flexWrap: 'nowrap' },

  // Only visible with Show removed on, and it needs to read as removed
  // rather than as another permit in the list.
  rowHidden: { opacity: 0.45 },
  removeLink: { background: 'none', border: 'none', padding: '8px 0', color: 'var(--danger)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' },
  addRow: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, justifyContent: 'flex-end' },
  addRowNarrow: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 },
  addButtons: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
  addInput: { flex: 1, maxWidth: 360, minWidth: 0, height: 40, boxSizing: 'border-box', padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-inset)', color: 'var(--text-primary)', fontSize: 13 },
  addConfirm: { height: 40, padding: '0 16px', borderRadius: 8, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 12, fontWeight: 800, cursor: 'pointer' },
  addCancel: { height: 40, padding: '0 14px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  cancelButton: { minHeight: 40, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' },
  saveButton: { minHeight: 40, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 800, fontSize: 12.5, whiteSpace: 'nowrap' },

  modalBackdrop: { ...modalBackdrop, zIndex: 100 },
  modalCard: { padding: 22, ...modalSurface, width: 'min(400px, 100%)' },
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
