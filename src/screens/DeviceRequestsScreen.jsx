import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDeviceRequests } from '../context/DeviceRequestsContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { brands } from '../data/mockData';
import { useDialog } from '../hooks/useDialog';
import DatePickerField from '../components/DatePickerField';
import { nike } from '../theme/nike';

// Asking for a new company device, and following it through to arriving.
//
// Different from Systems Help, which is a till behaving oddly, and from
// hardware repairs, which is something broken. This is "a new assistant
// manager starts Monday and needs an iPad".
const dateText = (t) => (t ? new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '');

const STATE_LABEL = {
  requested: 'Waiting on a decision',
  approved: 'Approved — to be ordered',
  ordered: 'Ordered',
  arrived: 'Arrived',
  declined: 'Declined',
};

export default function DeviceRequestsScreen() {
  const { user } = useAuth();
  const { open, closed, addRequest, decide, markOrdered, markArrived } = useDeviceRequests();
  const { getByBrand } = useCustomLocations();
  const { dialogNode, notify, confirm } = useDialog();

  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deviceType, setDeviceType] = useState('');
  const [forWhom, setForWhom] = useState('');
  const [setupNotes, setSetupNotes] = useState('');
  const [locationId, setLocationId] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const [ordering, setOrdering] = useState(null);
  const [orderNotes, setOrderNotes] = useState('');
  const [expected, setExpected] = useState('');

  const decides = user?.role === 'admin' || user?.job === 'COO';

  const places = brands
    .filter((b) => user?.role === 'admin' || user?.role === 'executive' || (user?.permissions?.brandIds ?? []).includes(b.id))
    .flatMap((b) => [
      ...(b.locations ?? []).map((l) => ({ id: l.id, name: l.name, brandId: b.id, brandName: b.name })),
      ...getByBrand(b.id).map((l) => ({ id: l.id, name: l.name, brandId: b.id, brandName: b.name })),
    ]);

  const submit = async () => {
    const place = places.find((p) => p.id === locationId);
    if (!deviceType.trim()) return notify('What is needed?', 'Say what kind of device.');
    if (!place) return notify('Which location?', 'Pick where it is going.');

    setSaving(true);
    try {
      await addRequest({
        deviceType,
        forWhom,
        setupNotes,
        locationId: place.id,
        locationName: place.name,
        brandId: place.brandId,
        brandName: place.brandName,
        neededBy: neededBy ? new Date(neededBy + 'T12:00:00').getTime() : null,
      });
      setFormOpen(false);
      setDeviceType('');
      setForWhom('');
      setSetupNotes('');
      setLocationId('');
      setNeededBy('');
      notify('Sent', 'Ronnie and the admins will see it.');
    } catch (err) {
      notify('Could not send', err?.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const confirmOrdered = async () => {
    setSaving(true);
    try {
      await markOrdered(ordering.id, {
        orderNotes,
        expectedArrival: expected ? new Date(expected + 'T12:00:00').getTime() : null,
      });
      setOrdering(null);
      setOrderNotes('');
      setExpected('');
    } catch (err) {
      notify('Could not save', err?.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const card = (r) => (
    <div key={r.id} style={styles.card}>
      <div style={styles.cardHead}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={styles.device}>{r.deviceType}</p>
          <p style={styles.meta}>
            {r.brandName} · {r.locationName}
            {r.forWhom ? ' · for ' + r.forWhom : ''}
            {r.neededBy ? ' · needed by ' + dateText(r.neededBy) : ''}
          </p>
          <p style={styles.meta}>
            Asked by {r.requestedByName}
            {r.decidedByName ? ' · ' + (r.status === 'declined' ? 'declined' : 'approved') + ' by ' + r.decidedByName : ''}
            {r.orderedByName ? ' · ordered by ' + r.orderedByName : ''}
          </p>
        </div>
        <span style={{ ...styles.pill, ...(r.status === 'declined' ? styles.pillOff : {}) }}>{STATE_LABEL[r.status]}</span>
      </div>

      {r.setupNotes ? <p style={styles.notes}>{r.setupNotes}</p> : null}
      {r.declineReason ? <p style={styles.declined}>{r.declineReason}</p> : null}
      {r.status === 'ordered' ? (
        <p style={styles.ordered}>
          {r.expectedArrival ? 'Expected ' + dateText(r.expectedArrival) : 'On its way'}
          {r.orderNotes ? ' — ' + r.orderNotes : ''}
        </p>
      ) : null}

      <div style={styles.actions}>
        {decides && r.status === 'requested' ? (
          <>
            <button style={styles.button} onClick={() => decide(r.id, true)}>
              Approve
            </button>
            <button
              style={styles.buttonQuiet}
              onClick={() =>
                confirm({
                  title: 'Decline this request?',
                  body: r.requestedByName + ' will be told. Add a reason if there is one worth giving.',
                  confirmLabel: 'Decline',
                  tone: 'danger',
                  onConfirm: () => decide(r.id, false, ''),
                })
              }
            >
              Decline
            </button>
          </>
        ) : null}

        {decides && r.status === 'approved' ? (
          <button style={styles.button} onClick={() => setOrdering(r)}>
            Mark as ordered
          </button>
        ) : null}

        {r.status === 'ordered' && (r.requestedByUid === user?.uid || user?.role === 'admin') ? (
          <button style={styles.button} onClick={() => markArrived(r.id)}>
            It arrived
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div style={styles.page}>
      <div style={styles.headRow}>
        <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Device Requests</h1>
        <button style={styles.newButton} onClick={() => setFormOpen(true)}>
          + Request a device
        </button>
      </div>
      <p style={styles.subtitle}>
        A new laptop, iPad or phone for someone. For something broken, use Systems Help.
      </p>

      {open.length === 0 ? <p style={styles.empty}>Nothing outstanding.</p> : open.map(card)}

      {closed.length > 0 ? (
        <>
          <button style={styles.showClosed} onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? 'Hide' : 'Show'} finished ({closed.length})
          </button>
          {showClosed ? closed.slice(0, 30).map(card) : null}
        </>
      ) : null}

      {formOpen ? (
        <div style={styles.backdrop} onClick={() => !saving && setFormOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Request a device</h2>

            <label style={styles.label}>What is needed</label>
            <input
              style={styles.input}
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
              placeholder="MacBook Air, iPad, iPhone…"
            />

            <label style={styles.label}>Who it is for</label>
            <input style={styles.input} value={forWhom} onChange={(e) => setForWhom(e.target.value)} placeholder="Name or role" />

            <label style={styles.label}>Which location</label>
            <select style={styles.input} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Pick one…</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brandName} · {p.name}
                </option>
              ))}
            </select>

            <label style={styles.label}>Needed by</label>
            <DatePickerField value={neededBy} onChange={setNeededBy} placeholder="No particular date" />

            <label style={styles.label}>What has to be on it</label>
            <textarea
              style={{ ...styles.input, ...styles.textarea }}
              value={setupNotes}
              onChange={(e) => setSetupNotes(e.target.value)}
              placeholder="Toast, R365, their email — whatever they need on day one"
            />

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

      {ordering ? (
        <div style={styles.backdrop} onClick={() => !saving && setOrdering(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Ordered</h2>
            <p style={styles.hint}>
              {ordering.deviceType} for {ordering.locationName}. Whatever you put here is what {ordering.requestedByName} sees.
            </p>

            <label style={styles.label}>Expected to arrive</label>
            <DatePickerField value={expected} onChange={setExpected} placeholder="If you know" />

            <label style={styles.label}>Anything worth saying</label>
            <textarea
              style={{ ...styles.input, ...styles.textarea }}
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="What was ordered, where it is going, how it will be set up"
            />

            <div style={styles.modalButtons}>
              <button style={styles.buttonQuiet} onClick={() => setOrdering(null)} disabled={saving}>
                Cancel
              </button>
              <button style={styles.button} onClick={confirmOrdered} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
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
  page: { padding: '28px max(22px, min(36px, 4vw))', maxWidth: 820 },
  headRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 20px' },
  newButton: { padding: '9px 14px', borderRadius: 10, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer' },
  empty: { fontSize: 13, color: 'var(--text-tertiary)' },

  card: { background: 'var(--bg-card)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 },
  cardHead: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  device: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 },
  meta: { fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' },
  pill: { fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: 'rgba(34,211,238,0.14)', color: 'var(--neon)', whiteSpace: 'nowrap' },
  pillOff: { background: 'var(--bg-inset)', color: 'var(--text-tertiary)' },
  notes: { fontSize: 13, color: 'var(--text-secondary)', margin: '10px 0 0', lineHeight: 1.5 },
  declined: { fontSize: 13, color: 'var(--danger)', margin: '8px 0 0' },
  ordered: { fontSize: 13, color: 'var(--neon)', margin: '8px 0 0' },
  actions: { display: 'flex', gap: 8, marginTop: 12 },
  button: { padding: '7px 12px', borderRadius: 9, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  buttonQuiet: { padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  showClosed: { background: 'none', border: 'none', padding: '8px 0', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' },

  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 },
  modal: { width: 'min(420px, 100%)', maxHeight: '86vh', overflowY: 'auto', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, padding: 22 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5, marginTop: 12 },
  input: { width: '100%', boxSizing: 'border-box', minHeight: 38, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 },
  textarea: { minHeight: 70, resize: 'vertical' },
  hint: { fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 4px', lineHeight: 1.5 },
  modalButtons: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
};
