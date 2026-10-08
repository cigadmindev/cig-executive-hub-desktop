import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEventRequests, EVENT_NEEDS_OPTIONS } from '../context/EventRequestsContext';
import { brands } from '../data/mockData';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useViewTracking } from '../context/ViewTrackingContext';
import DatePickerField from '../components/DatePickerField';
import TimePickerField from '../components/TimePickerField';
import { useDialog } from '../hooks/useDialog';
import RequestPage, { Pill, detailStyles as d } from '../components/RequestPage';
import { atLeast } from '../data/accessMatrix';
import { fmtDayTime } from '../lib/dates';

const STATUS_COLORS = { pending: '#C9A227', approved: '#5C7A52', denied: '#C0392B' };

const formatDateTime = (dt) => fmtDayTime(dt);


// Older records stored needs/jobs with a leading emoji — normalize for
// display and for matching, so old data keeps working with new labels.
function cleanNeed(n) {
  return (n || '').replace(/^[^\u0000-\u007F]+\s*/, '');
}

export default function EventRequestsScreen() {
  const { dialogNode, confirm, notify } = useDialog();
  const { brandId, locationId } = useParams();
  const { user, activeUsers: users } = useAuth();
  const { getByLocation, submitRequest, resolveRequest, approveAndSchedule, updateEventRequest, deleteEventRequest, adminSetStatus } = useEventRequests();
  const [filter, setFilter] = useState('pending');
  const [selectedId, setSelectedId] = useState(null);
  const [changing, setChanging] = useState(null);
  const { getByBrand } = useCustomLocations();
  const { markEventRequestsViewed } = useViewTracking();
  const isAdmin = user?.role === 'admin';

  const brand = brands.find((b) => b.id === brandId);
  const allLocations = brand ? [...brand.locations, ...getByBrand(brand.id).map((l) => ({ id: l.id, name: l.name }))] : [];
  const location = allLocations.find((l) => l.id === locationId);

  useEffect(() => {
    if (locationId) markEventRequestsViewed(locationId);
  }, [locationId]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('18:00');
  const [formAttendees, setFormAttendees] = useState('');
  const [formDetails, setFormDetails] = useState('');
  const [formNeeds, setFormNeeds] = useState([]);
  // Named people alongside whole roles. A role covers the usual case; this is
  // for the person who needs to know but isn't in any of them.
  const [formPeople, setFormPeople] = useState([]);

  const addNeedRole = (need) => setFormNeeds((prev) => (prev.includes(need) ? prev : [...prev, need]));
  const addNeedPerson = (uid) => setFormPeople((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
  const removeNeedPerson = (uid) => setFormPeople((prev) => prev.filter((u) => u !== uid));

  const [denyingId, setDenyingId] = useState(null);
  const [denyReason, setDenyReason] = useState('');

  const requests = getByLocation(locationId);
  // Who sees what: the COO and admins see every request; everyone else sees
  // the ones they asked for, and ones they are named or needed on. Approved
  // events still show on the calendar for everyone.
  const seesAllRequests = user?.role === 'admin' || atLeast(user, 'eventRequests', 'approve');
  const visibleRequests = seesAllRequests
    ? requests
    : requests.filter(
        (r) =>
          r.requestedByUid === user?.uid ||
          (r.notifyUids ?? []).includes(user?.uid) ||
          (!!user?.job && (r.needs ?? []).map(cleanNeed).includes(cleanNeed(user.job)))
      );
  const sortedRequests = [...visibleRequests].sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1));

  const openNewForm = () => {
    setEditingRequest(null);
    setFormTitle('');
    setFormDate('');
    setFormTime('18:00');
    setFormAttendees('');
    setFormDetails('');
    setFormNeeds([]);
    setFormPeople([]);
    setFormOpen(true);
  };

  const openEditForm = (r) => {
    const d = new Date(r.dateTime);
    setEditingRequest(r);
    setFormTitle(r.title);
    setFormDate(d.toISOString().slice(0, 10));
    setFormTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    setFormAttendees(r.expectedAttendees);
    setFormDetails(r.details);
    setFormNeeds(r.needs ?? []);
    setFormPeople(r.notifyUids ?? []);
    setFormOpen(true);
  };

  const toggleNeed = (need) => {
    setFormNeeds((prev) => (prev.includes(need) ? prev.filter((n) => n !== need) : [...prev, need]));
  };

  const handleSaveForm = async () => {
    if (!formTitle.trim() || !formDate) return;
    const [hours, minutes] = formTime.split(':').map(Number);
    const dateTime = new Date(formDate);
    dateTime.setHours(hours, minutes, 0, 0);

    try {
      if (editingRequest) {
        await updateEventRequest(editingRequest.id, {
          title: formTitle.trim(),
          dateTime: dateTime.getTime(),
          expectedAttendees: formAttendees.trim(),
          details: formDetails.trim(),
          needs: formNeeds,
          notifyUids: formPeople,
        });
      } else {
        await submitRequest({
          locationId,
          locationName: location?.name ?? '',
          title: formTitle.trim(),
          dateTime: dateTime.getTime(),
          expectedAttendees: formAttendees.trim(),
          details: formDetails.trim(),
          needs: formNeeds,
          notifyUids: formPeople,
          requestedBy: user?.name ?? 'Unknown',
        });
      }
      // Only closes on success, or the form clears while nothing was sent.
      setFormOpen(false);
    } catch (err) {
      notify(
        editingRequest ? 'Could not save' : 'Could not submit',
        err?.message ?? 'Nothing was changed. Try again.'
      );
    }
  };

  const handleApprove = async (r) => {
    let ok;
    try {
      ok = await approveAndSchedule(r.id, {
        locationId: r.locationId,
        // Without its restaurant, managers' calendars never showed it (S13).
        brandId: r.brandId ?? brandId ?? null,
        title: r.title,
        dateTime: r.dateTime,
        note: `${r.details}${r.expectedAttendees ? ` — Expected: ${r.expectedAttendees}` : ''}`,
        authorName: user?.name ?? 'Unknown',
      });
    } catch (err) {
      notify('Could not approve', err?.message ?? 'Nothing was changed. Try again.');
      return;
    }
    if (!ok) {
      notify('Already resolved', 'Someone else handled this request — no changes made.');
    }
  };

  const openDeny = (id) => {
    setDenyingId(id);
    setDenyReason('');
  };
  const confirmDeny = async () => {
    try {
      await resolveRequest(denyingId, 'denied', denyReason.trim());
      setDenyingId(null);
    } catch (err) {
      notify('Could not deny', err?.message ?? 'Nothing was changed. Try again.');
    }
  };
  const handleDelete = (r) => {
    confirm({
      title: `Delete "${r.title}"?`,
      body: 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: () => deleteEventRequest(r.id),
    });
  };

  if (!brand || !location) return null;

  const STATUS = { pending: ['Waiting', 'amber'], approved: ['Approved', 'green'], denied: ['Declined', 'red'] };
  const rows = sortedRequests.filter((r) => r.status === filter);
  const selected = sortedRequests.find((r) => r.id === selectedId) ?? rows[0] ?? null;
  const approvesHere = isAdmin || atLeast(user, 'eventRequests', 'approve');

  const detail = !selected ? (
    <div style={d.placeholder}>Pick a request to see it here.</div>
  ) : (() => {
    const r = selected;
    const isOwnRequest = r.requestedByUid === user?.uid;
    const canResolve = (isAdmin || (approvesHere && !isOwnRequest)) && r.status === 'pending';
    const needsMe = !!user?.job && (r.needs ?? []).map(cleanNeed).includes(cleanNeed(user.job));
    return (
      <div style={d.card}>
        <p style={{ ...d.kicker, ...(r.status !== 'pending' ? { color: 'var(--neon)' } : {}) }}>{STATUS[r.status]?.[0]} · {location.name}</p>
        <p style={d.title}>{r.title}</p>
        {needsMe ? <p style={styles.needsMeBadge}>This needs you — {cleanNeed(user.job)}</p> : null}
        <div style={d.row}><span style={d.k}>When</span><span style={d.v}>{formatDateTime(r.dateTime)}</span></div>
        {r.expectedAttendees ? <div style={d.row}><span style={d.k}>Guests</span><span style={d.v}>{r.expectedAttendees}</span></div> : null}
        <div style={d.row}><span style={d.k}>Asked by</span><span style={d.v}>{r.requestedBy}</span></div>
        {r.details ? <div style={d.row}><span style={d.k}>Details</span><span style={{ ...d.v, whiteSpace: 'pre-wrap' }}>{r.details}</span></div> : null}
        {r.needs && r.needs.length ? <div style={d.row}><span style={d.k}>Needs</span><span style={d.v}>{r.needs.map(cleanNeed).join(', ')}</span></div> : null}
        {r.status === 'denied' && r.denialReason ? <div style={d.row}><span style={d.k}>Reason</span><span style={d.v}>{r.denialReason}</span></div> : null}
        {approvesHere && !isAdmin && isOwnRequest && r.status === 'pending' ? <p style={{ ...styles.hint, marginTop: 10 }}>Your own request — the COO or an admin approves it.</p> : null}
        {canResolve ? (
          <div style={d.actions}>
            <button style={d.primary} onClick={() => handleApprove(r)}>Approve</button>
            <button style={d.ghost} onClick={() => openDeny(r.id)}>Deny…</button>
          </div>
        ) : null}
        {isAdmin ? (
          <div style={d.section}>
            <p style={d.sectionLabel}>ADMIN</p>
            {changing ? (
              <>
                <select style={d.input} value={changing.status} onChange={(e) => setChanging({ ...changing, status: e.target.value })}>
                  <option value="pending">Waiting</option>
                  <option value="approved">Approved</option>
                  <option value="denied">Declined</option>
                </select>
                <input style={d.input} autoFocus placeholder="Reason - emailed to the person who asked" value={changing.reason} onChange={(e) => setChanging({ ...changing, reason: e.target.value })} />
                {changing.status === 'approved' && r.status !== 'approved' ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 8px' }}>To put it on the calendar too, set it to Waiting and use Approve.</p> : null}
                <div style={d.actions}>
                  <button style={d.primary} disabled={changing.status === r.status || !changing.reason.trim()} onClick={async () => {
                    try { await adminSetStatus(r.id, changing.status, changing.reason); setChanging(null); setFilter(changing.status); }
                    catch (err) { notify('Could not change it', err?.message ?? 'Try again.'); }
                  }}>Change status</button>
                  <button style={d.ghost} onClick={() => setChanging(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <div style={{ ...d.actions, marginTop: 0 }}>
                <button style={d.ghost} onClick={() => openEditForm(r)}>Edit details</button>
                <button style={d.ghost} onClick={() => setChanging({ status: r.status, reason: '' })}>Change status…</button>
                <button style={{ ...d.ghost, color: 'var(--danger)' }} onClick={() => handleDelete(r)}>Delete</button>
              </div>
            )}
          </div>
        ) : null}
        <div style={d.section}>
          <p style={d.sectionLabel}>HISTORY</p>
          <div style={d.history}>
            {r.createdAt ? <div>{formatDateTime(r.createdAt)} · asked by {r.requestedBy}</div> : <div>Asked by {r.requestedBy}</div>}
            {r.resolvedAt ? <div>{formatDateTime(r.resolvedAt)} · {r.status === 'denied' ? 'declined' : 'decided'}</div> : null}
            {r.statusChangedAt ? <div>{formatDateTime(r.statusChangedAt)} · changed by {r.statusChangedByName} — “{r.statusChangeReason}”</div> : null}
          </div>
        </div>
      </div>
    );
  })();

  return (
    <div>
      <RequestPage
        back={{ to: `/brand/${brand.id}/location/${location.id}`, label: location.name }}
        title="Event / Promo Requests"
        subtitle={location.name + ' · ask for an event or promotion. The COO decides, and approved events go on the calendar.'}
        actionLabel="+ Request an Event"
        onAction={openNewForm}
        filters={Object.entries(STATUS).map(([k, [l]]) => ({ key: k, label: l, count: sortedRequests.filter((r) => r.status === k).length }))}
        filter={filter}
        onFilter={(k) => { setFilter(k); setSelectedId(null); setChanging(null); }}
        columns={[
          { key: 'what', label: 'Event', render: (r) => <strong>{r.title}</strong> },
          { key: 'when', label: 'When', render: (r) => formatDateTime(r.dateTime) },
          { key: 'who', label: 'Asked by', render: (r) => r.requestedBy },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={STATUS[r.status]?.[1]}>{STATUS[r.status]?.[0]}</Pill> },
        ]}
        rows={rows}
        selectedId={selected?.id}
        onSelect={(id) => { setSelectedId(id); setChanging(null); }}
        detail={detail}
        empty="Nothing in this list."
        note={approvesHere ? null : 'You see your own requests, and ones that name you or need your job.'}
      />

      {formOpen ? (
        <div style={styles.modalBackdrop} onClick={() => setFormOpen(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{editingRequest ? 'Edit Event Request' : 'New Event Request'}</h2>

            <label style={styles.label}>Title</label>
            <input style={styles.input} value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. Wine Dinner" autoFocus />

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Date</label>
                <DatePickerField value={formDate} onChange={setFormDate} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Time</label>
                <TimePickerField value={formTime} onChange={setFormTime} />
              </div>
            </div>

            <label style={styles.label}>Expected Attendees</label>
            <input style={styles.input} value={formAttendees} onChange={(e) => setFormAttendees(e.target.value)} placeholder="e.g. 40 guests" />

            <label style={styles.label}>Details</label>
            <textarea
              style={{ ...styles.input, minHeight: 70 }}
              value={formDetails}
              onChange={(e) => setFormDetails(e.target.value)}
              placeholder="Wine/menu needs, dinner service, setup, anything else"
            />

            <div style={styles.divider} />

            <label style={styles.label}>Notify on approval</label>
            <p style={styles.subLabel}>Pick a role — everyone in it is added, and you can add anyone else</p>

            {/* Fourteen role tiles took more room than the rest of the form.
                A role adds its people; a person can be added on their own. */}
            <div style={styles.notifyRow}>
              <select
                style={styles.input}
                value=""
                onChange={(e) => {
                  if (e.target.value) addNeedRole(e.target.value);
                }}
              >
                <option value="">Add a role…</option>
                {EVENT_NEEDS_OPTIONS.filter((n) => !formNeeds.includes(n)).map((need) => (
                  <option key={need} value={need}>
                    {need}
                  </option>
                ))}
              </select>

              <select
                style={styles.input}
                value=""
                onChange={(e) => {
                  if (e.target.value) addNeedPerson(e.target.value);
                }}
              >
                <option value="">Add a person…</option>
                {users
                  .filter((u) => !u.isGhost)
                  .filter((u) => u.active !== false && !formPeople.includes(u.uid))
                  .map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.name}
                      {u.job ? ` — ${u.job}` : ''}
                    </option>
                  ))}
              </select>
            </div>

            {formNeeds.length > 0 || formPeople.length > 0 ? (
              <div style={styles.notifyList}>
                {formNeeds.map((need) => (
                  <div key={need} data-row="" style={styles.notifyItem}>
                    <span style={styles.notifyName}>Everyone in {need}</span>
                    <span style={styles.notifyMeta}>
                      {users.filter((u) => u.job === need && u.active !== false && !u.isGhost).length} people
                    </span>
                    <button data-hover-only="" style={styles.notifyRemove} onClick={() => toggleNeed(need)}>
                      ×
                    </button>
                  </div>
                ))}
                {formPeople.map((uid) => {
                  const person = users.find((u) => u.uid === uid);
                  if (!person) return null;
                  return (
                    <div key={uid} data-row="" style={styles.notifyItem}>
                      <span style={styles.notifyName}>{person.name}</span>
                      <span style={styles.notifyMeta}>{person.job || person.role}</span>
                      <button data-hover-only="" style={styles.notifyRemove} onClick={() => removeNeedPerson(uid)}>
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button style={styles.cancelButton} onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <button style={styles.saveButton} onClick={handleSaveForm}>
                {editingRequest ? 'Save' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {denyingId ? (
        <div style={styles.modalBackdrop} onClick={() => setDenyingId(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Reason for Denial</h2>
            <input style={styles.input} value={denyReason} onChange={(e) => setDenyReason(e.target.value)} placeholder="e.g. Kitchen is already booked that night" />
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
      {dialogNode}
    </div>
  );
}

const styles = {
  divider: { height: 1, background: 'var(--border)', margin: '18px 0 16px' },
  subLabel: { fontSize: 11, color: 'var(--text-tertiary)', margin: '-2px 0 10px' },
  notifyRow: { display: 'flex', gap: 8, marginBottom: 10 },
  notifyList: { background: 'var(--bg-inset)', borderRadius: 9, overflow: 'hidden', marginBottom: 4 },
  notifyItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 12px',
    borderBottom: '1px solid var(--border)',
    position: 'relative',
  },
  notifyName: { flex: 1, fontSize: 13, color: 'var(--text-primary)' },
  notifyMeta: { fontSize: 11, color: 'var(--text-tertiary)' },
  notifyRemove: {
    width: 18,
    height: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    border: 'none',
    background: 'none',
    color: 'var(--text-tertiary)',
    fontSize: 15,
    padding: 0,
  },

  hint: { color: 'var(--text-secondary)', fontSize: 13 },
  needsMeBadge: { fontSize: 11, fontWeight: 700, color: 'var(--accent)', margin: '0 0 8px' },
  saveButton: { padding: '8px 16px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' },
  cancelButton: { padding: '8px 16px', borderRadius: 10, border: 'none', background: 'var(--bg-inset)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700 },

  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { width: 'min(380px, calc(100vw - 32px))', background: 'var(--bg-elevated)', border: 'none', borderRadius: 18, padding: 22, maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' },
  modalTitle: { fontSize: 19, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.2, color: '#FFFFFF', margin: '0 0 12px' },
  label: { display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, marginTop: 10 },
  input: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 7,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  },
};
