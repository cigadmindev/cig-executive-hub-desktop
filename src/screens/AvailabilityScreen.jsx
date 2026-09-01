import React, { useEffect, useState } from 'react';
import { useAvailability } from '../context/AvailabilityContext';
import { useAuth } from '../context/AuthContext';
import { useViewTracking } from '../context/ViewTrackingContext';
import DatePickerField from '../components/DatePickerField';
import TimePickerField from '../components/TimePickerField';
import { PTO_ALLOWANCE_DAYS } from '../context/AvailabilityContext';
import { useDialog } from '../hooks/useDialog';
import { nike } from '../theme/nike';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LABELS = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
const STATUS_COLORS = { pending: '#C9A227', approved: '#5C7A52', denied: '#C0392B' };

function formatDate(ts) {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AvailabilityScreen() {
  const { dialogNode, confirm, notify } = useDialog();
  const { user } = useAuth();
  const {
    timeOffRequests,
    weeklyAvailability,
    submitTimeOff,
    resolveTimeOff,
    updateTimeOffRequest,
    deleteTimeOffRequest,
    setMyWeeklyAvailability,
    getWeekStart,
    ptoUsed,
  } = useAvailability();
  const { markTimeOffViewed } = useViewTracking();
  const isAdmin = user?.role === 'admin';
  const isExecutive = user?.role === 'executive';

  useEffect(() => {
    markTimeOffViewed();
  }, []);

  const [tab, setTab] = useState(isAdmin || isExecutive ? 'weekly' : 'mine');
  // 0 is this week, 1 next, -1 last. Set-ahead matters more than history, but
  // both are cheap once the week is a parameter rather than a constant.
  const [weekOffset, setWeekOffset] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const [denyingId, setDenyingId] = useState(null);
  const [denyReason, setDenyReason] = useState('');

  const [editingRequest, setEditingRequest] = useState(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editReason, setEditReason] = useState('');

  const [viewingPerson, setViewingPerson] = useState(null);

  const myTimeOff = timeOffRequests.filter((r) => r.uid === user?.uid);
  const myWeekly = weeklyAvailability.find((w) => w.uid === user?.uid);
  const otherWeekly = weeklyAvailability.filter((w) => w.uid !== user?.uid);
  const pendingCount = timeOffRequests.filter((r) => r.status === 'pending').length;

  // A new week starting means last week's answers no longer apply — treat
  // it as if nothing's been set yet, rather than showing stale info.
  const currentWeekStart = getWeekStart(weekOffset);
  const myWeeklyIsCurrent = myWeekly && myWeekly.weekStartDate === currentWeekStart;
  const weekRangeLabel = (() => {
    const start = new Date(currentWeekStart);
    const end = new Date(currentWeekStart + 6 * 24 * 60 * 60 * 1000);
    return `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  })();

  // Saves one day immediately rather than collecting a form and submitting.
  // Seven fields behind a Save button meant losing everything if you navigated
  // away, and there's no reason a single day's hours needs a transaction.
  const setDayHours = async (day, hours) => {
    const base = myWeeklyIsCurrent ? myWeekly : {};
    const next = Object.fromEntries(DAYS.map((d) => [d, base?.[d] ?? null]));
    next[day] = hours;
    await setMyWeeklyAvailability(next, currentWeekStart);
  };

  // Approved time off replaces a day's hours — you're not available, and
  // showing pickers next to "approved" would invite editing something that's
  // already been decided.
  const timeOffOnDay = (dayMs) =>
    timeOffRequests.some(
      (r) => r.uid === user?.uid && r.status === 'approved' && dayMs >= r.startDate && dayMs <= r.endDate
    );

  const usedDays = ptoUsed(user?.uid);

  const weekEndMs = currentWeekStart + 7 * 24 * 60 * 60 * 1000;
  const offThisWeek = timeOffRequests.filter(
    (r) => r.status === 'approved' && r.startDate < weekEndMs && r.endDate >= currentWeekStart
  );

  const handleSubmit = async () => {
    if (!startDate || !endDate || !reason.trim()) return;
    await submitTimeOff(new Date(startDate).getTime(), new Date(endDate).getTime(), reason.trim());
    setFormOpen(false);
    setStartDate('');
    setEndDate('');
    setReason('');
  };

  const openDeny = (id) => {
    setDenyingId(id);
    setDenyReason('');
  };
  const confirmDeny = async () => {
    await resolveTimeOff(denyingId, 'denied', denyReason.trim());
    setDenyingId(null);
  };

  const openEdit = (r) => {
    setEditingRequest(r);
    setEditStart(new Date(r.startDate).toISOString().slice(0, 10));
    setEditEnd(new Date(r.endDate).toISOString().slice(0, 10));
    setEditReason(r.reason);
  };
  const saveEdit = async () => {
    await updateTimeOffRequest(editingRequest.id, {
      startDate: new Date(editStart).getTime(),
      endDate: new Date(editEnd).getTime(),
      reason: editReason.trim(),
    });
    setEditingRequest(null);
  };
  const handleDelete = (r) => {
    confirm({
      title: 'Delete this request?',
      body: 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: () => deleteTimeOffRequest(r.id),
    });
  };


  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Availability</h1>
        <div style={styles.tabRow}>
          {isAdmin || isExecutive ? null : (
            <button style={{ ...styles.tab, ...(tab === 'mine' ? styles.tabActive : {}) }} onClick={() => setTab('mine')}>
              My Time Off
            </button>
          )}
          <button style={{ ...styles.tab, ...(tab === 'weekly' ? styles.tabActive : {}) }} onClick={() => setTab('weekly')}>
            Weekly Availability
          </button>
          <button style={{ ...styles.tab, ...(tab === 'team' ? styles.tabActive : {}) }} onClick={() => setTab('team')}>
            Team
          </button>
          {isAdmin || isExecutive ? (
            <button style={{ ...styles.tab, ...(tab === 'admin' ? styles.tabActive : {}) }} onClick={() => setTab('admin')}>
              All Requests {pendingCount > 0 ? `(${pendingCount})` : ''}
            </button>
          ) : null}
        </div>
      </header>

      <div style={styles.body}>
        {tab === 'mine' ? (
          <>
            {myTimeOff.length === 0 ? (
              <p style={styles.hint}>No time off requested yet.</p>
            ) : (
              myTimeOff.map((r) => (
                <div key={r.id} style={styles.card}>
                  <div style={styles.cardHeaderRow}>
                    <span style={styles.cardDates}>
                      {formatDate(r.startDate)} – {formatDate(r.endDate)}
                    </span>
                    <span style={{ ...styles.statusBadge, background: STATUS_COLORS[r.status] }}>{r.status.toUpperCase()}</span>
                  </div>
                  <p style={styles.cardReason}>{r.reason}</p>
                  {r.status === 'denied' && r.denialReason ? (
                    <p style={styles.denialReason}>Reason for denial: {r.denialReason}</p>
                  ) : null}
                  {r.status === 'denied' ? (
                    <button style={styles.linkButtonDanger} onClick={() => handleDelete(r)}>
                      Delete Request
                    </button>
                  ) : null}
                </div>
              ))
            )}
            <button style={styles.addButton} onClick={() => setFormOpen(true)}>
              + Request Time Off
            </button>
          </>
        ) : null}

        {tab === 'weekly' ? (
          <>
            <div style={styles.weekNav}>
              <button style={styles.weekArrow} onClick={() => setWeekOffset((w) => w - 1)}>
                ‹
              </button>
              <span style={styles.weekLabel}>{weekRangeLabel}</span>
              <button style={styles.weekArrow} onClick={() => setWeekOffset((w) => w + 1)}>
                ›
              </button>
              {weekOffset !== 0 ? (
                <button style={styles.thisWeekLink} onClick={() => setWeekOffset(0)}>
                  This week
                </button>
              ) : null}
            </div>

            {/* One editable grid rather than a banner, a read-only view, and a
                modal. Three states for what is really just seven rows meant
                you couldn't see and change your week at the same time. */}
            <div style={styles.weekCard}>
              {DAYS.map((day, i) => {
                const dayDate = new Date(currentWeekStart + i * 24 * 60 * 60 * 1000);
                const value = myWeeklyIsCurrent ? myWeekly?.[day] : null;
                const hours = typeof value === 'object' && value ? value : null;
                const legacy = typeof value === 'string' && value ? value : null;
                const off = timeOffOnDay(dayDate.getTime());

                return (
                  <div key={day} data-row="" style={styles.dayRow}>
                    <span style={styles.dayLabel}>
                      {DAY_LABELS[day].slice(0, 3)} <span style={styles.dayNum}>{dayDate.getDate()}</span>
                    </span>

                    {off ? (
                      <span style={styles.timeOffNote}>Time off approved</span>
                    ) : legacy ? (
                      // Written before hours became structured. Shown as-is so
                      // nothing is lost, and replaced the next time it's set.
                      <span style={styles.legacyValue}>{legacy}</span>
                    ) : hours ? (
                      <>
                        <TimePickerField value={hours.start} onChange={(v) => setDayHours(day, { ...hours, start: v })} />
                        <span style={styles.toLabel}>to</span>
                        <TimePickerField value={hours.end} onChange={(v) => setDayHours(day, { ...hours, end: v })} />
                        <div style={{ flex: 1 }} />
                        <button style={styles.clearDay} onClick={() => setDayHours(day, null)}>
                          Unavailable
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={styles.unavailable}>Unavailable</span>
                        <div style={{ flex: 1 }} />
                        <button style={styles.setHours} onClick={() => setDayHours(day, { start: '09:00', end: '17:00' })}>
                          Set hours
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={isAdmin || isExecutive ? styles.ptoGridSolo : styles.ptoGrid}>
              {isAdmin || isExecutive ? null : (
              <div>
                <p style={styles.zoneLabel}>Paid time off</p>
                <div style={styles.ptoCard}>
                  <div style={styles.ptoTop}>
                    <span style={styles.ptoBig}>{PTO_ALLOWANCE_DAYS - usedDays}</span>
                    <span style={styles.ptoOf}>of {PTO_ALLOWANCE_DAYS} days left</span>
                  </div>
                  <div style={styles.ptoTrack}>
                    <div style={{ ...styles.ptoFill, width: `${Math.min(100, (usedDays / PTO_ALLOWANCE_DAYS) * 100)}%` }} />
                  </div>
                  <p style={styles.ptoNote}>Resets January 1</p>
                  <button style={styles.requestLink} onClick={() => setFormOpen(true)}>
                    Request time off
                  </button>
                </div>
              </div>
              )}

              <div>
                <p style={styles.zoneLabel}>Who's off this week</p>
                <div style={styles.panel}>
                  {offThisWeek.length === 0 ? (
                    <p style={styles.emptyNote}>Nobody's off this week.</p>
                  ) : (
                    offThisWeek.map((r) => (
                      <div key={r.id} data-row="" style={styles.offRow}>
                        <span style={styles.offName}>{r.name}</span>
                        <span style={styles.offDates}>
                          {formatDate(r.startDate)}
                          {r.endDate !== r.startDate ? ` – ${formatDate(r.endDate)}` : ''}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        ) : null}

        {tab === 'team' ? (
          <>
            {otherWeekly.length === 0 ? (
              <p style={styles.emptyNote}>Nobody else has set their availability yet.</p>
            ) : (
              otherWeekly.map((w) => (
                <button key={w.uid} data-row="" style={styles.personRow} onClick={() => setViewingPerson(w)}>
                  <span>{w.name}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>›</span>
                </button>
              ))
            )}
          </>
        ) : null}

        {tab === 'admin' && (isAdmin || isExecutive) ? (
          <>
            {timeOffRequests.length === 0 ? (
              <p style={styles.hint}>No requests yet.</p>
            ) : (
              [...timeOffRequests]
                .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1))
                .map((r) => {
                  const isOwnRequest = r.uid === user?.uid;
                  const canResolve = (isAdmin || (isExecutive && !isOwnRequest)) && r.status === 'pending';
                  return (
                  <div key={r.id} style={styles.card}>
                    <div style={styles.cardHeaderRow}>
                      <span style={styles.cardDates}>{r.name}</span>
                      <span style={{ ...styles.statusBadge, background: STATUS_COLORS[r.status] }}>{r.status.toUpperCase()}</span>
                    </div>
                    <p style={styles.cardReason}>
                      {formatDate(r.startDate)} – {formatDate(r.endDate)}
                    </p>
                    <p style={styles.cardReason}>{r.reason}</p>
                    {r.status === 'denied' && r.denialReason ? (
                      <p style={styles.denialReason}>Reason for denial: {r.denialReason}</p>
                    ) : null}
                    {isExecutive && isOwnRequest && r.status === 'pending' ? (
                      <p style={styles.hint}>This is your own request — another admin or executive needs to approve it.</p>
                    ) : null}
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      {canResolve ? (
                        <>
                          <button style={styles.saveButton} onClick={() => resolveTimeOff(r.id, 'approved')}>
                            Approve
                          </button>
                          <button style={styles.cancelButton} onClick={() => openDeny(r.id)}>
                            Deny
                          </button>
                        </>
                      ) : null}
                      {isAdmin ? (
                        <>
                          <button style={styles.linkButton} onClick={() => openEdit(r)}>
                            Edit
                          </button>
                          <button style={styles.linkButtonDanger} onClick={() => handleDelete(r)}>
                            Delete
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  );
                })
            )}
          </>
        ) : null}
      </div>

      {formOpen ? (
        <div style={styles.modalBackdrop} onClick={() => setFormOpen(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Request Time Off</h2>
            <label style={styles.label}>Start Date</label>
            <DatePickerField value={startDate} onChange={setStartDate} placeholder="Start date" />
            <label style={styles.label}>End Date</label>
            <DatePickerField value={endDate} onChange={setEndDate} placeholder="End date" />
            <label style={styles.label}>Reason</label>
            <input style={styles.input} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button style={styles.cancelButton} onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <button style={styles.saveButton} onClick={handleSubmit}>
                Submit
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {denyingId ? (
        <div style={styles.modalBackdrop} onClick={() => setDenyingId(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Reason for Denial</h2>
            <input style={styles.input} value={denyReason} onChange={(e) => setDenyReason(e.target.value)} placeholder="e.g. Short staffed those dates" />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button style={styles.cancelButton} onClick={() => setDenyingId(null)}>
                Cancel
              </button>
              <button style={styles.saveButton} onClick={confirmDeny}>
                Confirm Deny
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingRequest ? (
        <div style={styles.modalBackdrop} onClick={() => setEditingRequest(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Edit Request</h2>
            <label style={styles.label}>Start Date</label>
            <DatePickerField value={editStart} onChange={setEditStart} placeholder="Start date" />
            <label style={styles.label}>End Date</label>
            <DatePickerField value={editEnd} onChange={setEditEnd} placeholder="End date" />
            <label style={styles.label}>Reason</label>
            <input style={styles.input} value={editReason} onChange={(e) => setEditReason(e.target.value)} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button style={styles.cancelButton} onClick={() => setEditingRequest(null)}>
                Cancel
              </button>
              <button style={styles.saveButton} onClick={saveEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {viewingPerson ? (
        <div style={styles.modalBackdrop} onClick={() => setViewingPerson(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{viewingPerson.name}</h2>
            {DAYS.map((day) => (
              <div key={day} style={styles.viewRow}>
                <span style={styles.viewDayLabel}>{DAY_LABELS[day]}</span>
                <span>{viewingPerson[day] || 'Not set'}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {dialogNode}
    </div>
  );
}

const styles = {
  weekNav: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 },
  weekArrow: { padding: '2px 8px', fontSize: 15, color: 'var(--text-secondary)', background: 'none', border: 'none' },
  weekLabel: { fontSize: 13, fontWeight: 700, letterSpacing: 0.3, color: 'var(--text-primary)' },
  thisWeekLink: { fontSize: 11, color: 'var(--neon)', background: 'none', border: 'none', marginLeft: 4 },
  ptoGridSolo: { display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 20 },
  requestLink: { fontSize: 11, color: 'var(--neon)', background: 'none', border: 'none', padding: '8px 0 0' },
  weekCard: { background: 'var(--bg-card)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 },
  dayRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '11px 14px',
    borderBottom: '1px solid var(--border)',
  },
  dayLabel: { width: 90, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 },
  dayNum: { color: 'var(--text-tertiary)', fontWeight: 400 },
  toLabel: { fontSize: 12, color: 'var(--text-tertiary)' },
  unavailable: { fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic' },
  legacyValue: { fontSize: 13, color: 'var(--text-secondary)', flex: 1 },
  timeOffNote: { fontSize: 13, color: 'var(--neon)', flex: 1 },
  setHours: { fontSize: 11, color: 'var(--neon)', background: 'none', border: 'none', padding: '4px 6px' },
  clearDay: { fontSize: 11, color: 'var(--text-tertiary)', background: 'none', border: 'none', padding: '4px 6px' },

  ptoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 },
  zoneLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'var(--text-tertiary)',
    margin: '0 0 8px',
  },
  ptoCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 15 },
  ptoTop: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 },
  ptoBig: { fontSize: 26, fontWeight: 800, color: 'var(--text-primary)' },
  ptoOf: { fontSize: 13, color: 'var(--text-tertiary)' },
  ptoTrack: { height: 5, background: 'rgba(255,255,255,0.13)', borderRadius: 3, marginBottom: 10 },
  ptoFill: { height: 5, background: 'var(--neon)', borderRadius: 3 },
  ptoNote: { fontSize: 11, color: 'var(--text-tertiary)', margin: 0 },

  panel: { background: 'var(--bg-card)', borderRadius: 10, overflow: 'hidden' },
  emptyNote: { fontSize: 12, color: 'var(--text-tertiary)', padding: '14px 16px', margin: 0 },
  offRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' },
  offName: { flex: 1, fontSize: 13, color: 'var(--text-primary)' },
  offDates: { fontSize: 11, color: 'var(--text-tertiary)' },

  page: { padding: '28px max(22px, min(36px, 4vw))', maxWidth: 700 },
  header: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, margin: '0 0 14px' },
  tabRow: { display: 'flex', gap: 8 },
  tab: { padding: '7px 14px', borderRadius: 20, border: 'none', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' },
  tabActive: { background: 'var(--neon)', color: 'var(--neon-text)' },
  body: {},
  hint: { color: 'var(--text-secondary)', fontSize: 13 },
  card: { background: 'var(--bg-card)', border: 'none', borderRadius: 10, padding: 16, marginBottom: 10 },
  cardHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardDates: { fontSize: 14, fontWeight: 700 },
  cardReason: { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' },
  denialReason: { fontSize: 12, color: 'var(--danger)', fontStyle: 'italic', margin: '6px 0 0' },
  statusBadge: { fontSize: 10, fontWeight: 700, color: '#FFFFFF', borderRadius: 6, padding: '3px 8px' },
  addButton: { padding: '11px 0', width: '100%', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 14, marginTop: 4, textTransform: 'uppercase' },
  label: { display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, marginTop: 10 },
  input: { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
  saveButton: { padding: '8px 16px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' },
  cancelButton: { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12 },
  linkButton: { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 },
  linkButtonDanger: { fontSize: 12, color: 'var(--danger)', fontWeight: 600 },
  personRow: { display: 'flex', justifyContent: 'space-between', width: '100%', padding: '10px 14px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: 6, fontSize: 13 },
  viewRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 },
  viewDayLabel: { color: 'var(--accent)', fontWeight: 600 },

  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { width: 'min(360px, calc(100vw - 32px))', background: 'var(--bg-elevated)', border: 'none', borderRadius: 18, padding: 22, maxHeight: '80vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' },
  modalTitle: { fontSize: 19, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.2, color: '#FFFFFF', margin: '0 0 12px' },
};
