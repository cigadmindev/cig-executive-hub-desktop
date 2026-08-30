import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEventRequests, EVENT_NEEDS_OPTIONS } from '../context/EventRequestsContext';
import { brands } from '../data/mockData';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useViewTracking } from '../context/ViewTrackingContext';
import DatePickerField from '../components/DatePickerField';
import TimePickerField from '../components/TimePickerField';
import { nike } from '../theme/nike';

const STATUS_COLORS = { pending: '#C9A227', approved: '#5C7A52', denied: '#C0392B' };

function formatDateTime(dt) {
  const d = new Date(dt);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}


// Older records stored needs/jobs with a leading emoji — normalize for
// display and for matching, so old data keeps working with new labels.
function cleanNeed(n) {
  return (n || '').replace(/^[^\u0000-\u007F]+\s*/, '');
}

export default function EventRequestsScreen() {
  const { brandId, locationId } = useParams();
  const { user, users } = useAuth();
  const { getByLocation, submitRequest, resolveRequest, approveAndSchedule, updateEventRequest, deleteEventRequest } = useEventRequests();
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
  const sortedRequests = [...requests].sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1));

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
    setFormOpen(false);
  };

  const handleApprove = async (r) => {
    const ok = await approveAndSchedule(r.id, {
      locationId: r.locationId,
      title: r.title,
      dateTime: r.dateTime,
      note: `${r.details}${r.expectedAttendees ? ` — Expected: ${r.expectedAttendees}` : ''}`,
      authorName: user?.name ?? 'Unknown',
    });
    if (!ok) {
      alert('Someone else already resolved this request — no changes made.');
    }
  };

  const openDeny = (id) => {
    setDenyingId(id);
    setDenyReason('');
  };
  const confirmDeny = async () => {
    await resolveRequest(denyingId, 'denied', denyReason.trim());
    setDenyingId(null);
  };
  const handleDelete = (r) => {
    if (window.confirm(`Delete "${r.title}"? This cannot be undone.`)) deleteEventRequest(r.id);
  };

  if (!brand || !location) return null;

  return (
    <div style={styles.page}>
      <Link to={`/brand/${brand.id}/location/${location.id}`} style={styles.backLink}>
        ‹ {location.name}
      </Link>
      <header style={styles.header}>
        <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Event / Promo Requests</h1>
        <button style={styles.addButton} onClick={openNewForm}>
          + Request an Event
        </button>
      </header>

      <div style={styles.body}>
        {sortedRequests.length === 0 ? (
          <p style={styles.hint}>No event requests yet.</p>
        ) : (
          sortedRequests.map((r) => {
            const isExecutive = user?.role === 'executive';
            const isOwnRequest = r.requestedByUid === user?.uid;
            const canResolve = (isAdmin || (isExecutive && !isOwnRequest)) && r.status === 'pending';
            const needsMe = !!user?.job && (r.needs ?? []).map(cleanNeed).includes(cleanNeed(user.job));
            return (
              <div key={r.id} style={{ ...styles.card, ...(needsMe ? styles.cardNeedsMe : {}) }}>
                {needsMe ? <p style={styles.needsMeBadge}>This needs you — {cleanNeed(user.job)}</p> : null}
                <div style={styles.cardHeaderRow}>
                  <span style={styles.cardTitle}>{r.title}</span>
                  <span style={{ ...styles.statusBadge, background: STATUS_COLORS[r.status] }}>{r.status.toUpperCase()}</span>
                </div>
                <p style={styles.cardMeta}>{formatDateTime(r.dateTime)}</p>
                {r.expectedAttendees ? <p style={styles.cardMeta}>Expected attendees: {r.expectedAttendees}</p> : null}
                <p style={styles.cardDetails}>{r.details}</p>
                {r.needs && r.needs.length > 0 ? (
                  <div style={styles.needsRow}>
                    {r.needs.map((rawN) => cleanNeed(rawN)).map((n) => (
                      <span key={n} style={{ ...styles.needChip, ...(n === user?.job ? styles.needChipMine : {}) }}>
                        {n}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p style={styles.cardRequestedBy}>Requested by {r.requestedBy}</p>
                {isExecutive && isOwnRequest && r.status === 'pending' ? (
                  <p style={styles.hint}>This is your own request — another admin or executive needs to approve it.</p>
                ) : null}
                {r.status === 'denied' && r.denialReason ? (
                  <p style={styles.denialReason}>Reason for denial: {r.denialReason}</p>
                ) : null}

                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  {canResolve ? (
                    <>
                      <button style={styles.saveButton} onClick={() => handleApprove(r)}>
                        Approve
                      </button>
                      <button style={styles.cancelButton} onClick={() => openDeny(r.id)}>
                        Deny
                      </button>
                    </>
                  ) : null}
                  {isAdmin ? (
                    <>
                      <button style={styles.linkButton} onClick={() => openEditForm(r)}>
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
      </div>

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
                      {users.filter((u) => u.job === need && u.active !== false).length} people
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

  page: { padding: '28px 36px', maxWidth: 700 },
  backLink: { fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-block', marginBottom: 14 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  addButton: { padding: '9px 16px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },
  body: {},
  hint: { color: 'var(--text-secondary)', fontSize: 13 },
  card: { background: 'var(--bg-card)', border: '2px solid transparent', borderRadius: 12, padding: 16, marginBottom: 10 },
  cardHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: 700 },
  statusBadge: { fontSize: 10, fontWeight: 700, color: '#FFFFFF', borderRadius: 6, padding: '3px 8px' },
  cardMeta: { fontSize: 12, color: 'var(--accent)', fontWeight: 600, margin: '4px 0 0' },
  cardDetails: { fontSize: 13, margin: '6px 0 0', lineHeight: 1.5 },
  needsRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  needChip: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    background: 'var(--bg-inset)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '3px 9px',
  },
  needChipMine: { background: 'var(--neon)', color: 'var(--neon-text)', borderColor: 'var(--neon)', fontWeight: 900 },
  cardNeedsMe: { borderColor: 'var(--neon)' },
  needsMeBadge: { fontSize: 11, fontWeight: 700, color: 'var(--accent)', margin: '0 0 8px' },
  cardRequestedBy: { fontSize: 11, color: 'var(--text-secondary)', margin: '8px 0 0' },
  denialReason: { fontSize: 12, color: 'var(--danger)', fontStyle: 'italic', margin: '6px 0 0' },
  saveButton: { padding: '8px 16px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' },
  cancelButton: { padding: '8px 16px', borderRadius: 10, border: 'none', background: 'var(--bg-inset)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700 },
  linkButton: { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 },
  linkButtonDanger: { fontSize: 12, color: 'var(--danger)', fontWeight: 600 },

  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { width: 380, background: 'var(--bg-elevated)', border: 'none', borderRadius: 18, padding: 22, maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' },
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
  chipWrap: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  needOption: {
    flexBasis: '48%',
    flexGrow: 1,
    textAlign: 'left',
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  needOptionActive: { background: 'rgba(223,255,79,0.10)', color: 'var(--neon)', fontWeight: 900, borderColor: 'var(--neon)' },
};
