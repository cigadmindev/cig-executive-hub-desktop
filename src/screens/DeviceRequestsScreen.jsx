import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDeviceRequests } from '../context/DeviceRequestsContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { brands } from '../data/mockData';
import { atLeast } from '../data/accessMatrix';
import { useDialog } from '../hooks/useDialog';
import DatePickerField from '../components/DatePickerField';
import RequestPage, { Pill, detailStyles as d } from '../components/RequestPage';
import { fmtDay } from '../lib/dates';

// Asking for a new company device, and following it through to arriving.
// Different from Systems Help (a till behaving oddly) and from repairs
// (something broken): this is "a new assistant manager starts Monday and
// needs an iPad". The COO and admins decide and order; the person who asked
// confirms it arrived. Everyone else sees only their own requests.
const dateText = (t) => fmtDay(t);
const ymd = (t) => (t ? new Date(t).toISOString().slice(0, 10) : '');
const STEP = {
  requested: ['Waiting', 'amber'],
  approved: ['Approved', 'green'],
  ordered: ['Ordered', 'cyan'],
  arrived: ['Done', 'grey'],
  declined: ['Declined', 'red'],
};
const FILTERS = [
  ['requested', 'Waiting'],
  ['approved', 'Approved'],
  ['ordered', 'Ordered'],
  ['arrived', 'Done'],
  ['declined', 'Declined'],
];

export default function DeviceRequestsScreen() {
  const { user } = useAuth();
  const { requests, addRequest, decide, markOrdered, markArrived, adminEdit, adminSetStatus } = useDeviceRequests();
  const { getByBrand } = useCustomLocations();
  const { dialogNode, notify } = useDialog();

  const isAdmin = user?.role === 'admin';
  const decides = isAdmin || atLeast(user, 'deviceRequests', 'approve');

  const [filter, setFilter] = useState('requested');
  const [selectedId, setSelectedId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ deviceType: '', forWhom: '', setupNotes: '', locationId: '', neededBy: '' });
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [order, setOrder] = useState({ notes: '', expected: '' });
  const [editing, setEditing] = useState(null);
  const [changing, setChanging] = useState(null);

  const places = brands
    .filter((b) => isAdmin || user?.role === 'executive' || (user?.permissions?.brandIds ?? []).includes(b.id))
    .flatMap((b) => [
      ...(b.locations ?? []).map((l) => ({ id: l.id, name: l.name, brandId: b.id, brandName: b.name })),
      ...getByBrand(b.id).map((l) => ({ id: l.id, name: l.name, brandId: b.id, brandName: b.name })),
    ]);

  const rows = requests.filter((r) => r.status === filter);
  const selected = requests.find((r) => r.id === selectedId) ?? rows[0] ?? null;

  const run = async (fn, done) => {
    setBusy(true);
    try {
      await fn();
      done?.();
    } catch (err) {
      notify('Could not save', err?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const place = places.find((p) => p.id === form.locationId);
    if (!form.deviceType.trim()) return notify('What is needed?', 'Say what kind of device.');
    if (!place) return notify('Which location?', 'Pick where it is going.');
    run(
      () => addRequest({
        deviceType: form.deviceType, forWhom: form.forWhom, setupNotes: form.setupNotes,
        locationId: place.id, locationName: place.name, brandId: place.brandId, brandName: place.brandName,
        neededBy: form.neededBy ? new Date(form.neededBy + 'T12:00:00').getTime() : null,
      }),
      () => {
        setFormOpen(false);
        setForm({ deviceType: '', forWhom: '', setupNotes: '', locationId: '', neededBy: '' });
        setFilter('requested');
        notify('Sent', 'Ronnie and the admins will see it, and you will be emailed each step.');
      }
    );
  };

  const history = (r) =>
    [
      ['Asked', r.createdAt, r.requestedByName],
      [r.status === 'declined' ? 'Declined' : 'Approved', r.decidedAt, r.decidedByName],
      ['Ordered', r.orderedAt, r.orderedByName],
      ['Arrived', r.arrivedAt, r.arrivedByName],
      ['Changed by hand', r.statusChangedAt, r.statusChangedByName],
      ['Details edited', r.editedAt, r.editedByName],
    ]
      .filter(([, t]) => t)
      .sort((a, b) => a[1] - b[1]);

  const detail = !selected ? (
    <div style={d.placeholder}>Pick a request to see it here.</div>
  ) : (
    <div style={d.card}>
      <p style={d.kicker}>{STEP[selected.status]?.[0]} · asked {dateText(selected.createdAt)}</p>
      <p style={d.title}>{selected.deviceType}</p>
      <div style={d.row}><span style={d.k}>Who</span><span style={d.v}>{selected.requestedByName}</span></div>
      {selected.forWhom ? <div style={d.row}><span style={d.k}>For</span><span style={d.v}>{selected.forWhom}</span></div> : null}
      <div style={d.row}><span style={d.k}>Where</span><span style={d.v}>{selected.brandName} · {selected.locationName}</span></div>
      {selected.neededBy ? <div style={d.row}><span style={d.k}>Needed by</span><span style={d.v}>{dateText(selected.neededBy)}</span></div> : null}
      {selected.setupNotes ? <div style={d.row}><span style={d.k}>Set-up</span><span style={d.v}>{selected.setupNotes}</span></div> : null}
      {selected.orderNotes || selected.expectedArrival ? (
        <div style={d.row}><span style={d.k}>Order</span><span style={d.v}>{selected.orderNotes}{selected.expectedArrival ? ' · expected ' + dateText(selected.expectedArrival) : ''}</span></div>
      ) : null}
      {selected.status === 'declined' && selected.declineReason ? <div style={d.row}><span style={d.k}>Reason</span><span style={d.v}>{selected.declineReason}</span></div> : null}

      {/* The next step, for whoever takes it */}
      {decides && selected.status === 'requested' ? (
        declining ? (
          <div style={{ marginTop: 14 }}>
            <input style={d.input} autoFocus placeholder="Reason - they will see this" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
            <div style={d.actions}>
              <button style={d.primary} disabled={busy || !declineReason.trim()} onClick={() => run(() => decide(selected.id, false, declineReason.trim()), () => { setDeclining(false); setDeclineReason(''); })}>Decline</button>
              <button style={d.ghost} onClick={() => setDeclining(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={d.actions}>
            <button style={d.primary} disabled={busy} onClick={() => run(() => decide(selected.id, true))}>Approve</button>
            <button style={d.ghost} onClick={() => setDeclining(true)}>Decline…</button>
          </div>
        )
      ) : null}
      {decides && selected.status === 'approved' ? (
        ordering ? (
          <div style={{ marginTop: 14 }}>
            <input style={d.input} placeholder="What was ordered, and where" value={order.notes} onChange={(e) => setOrder({ ...order, notes: e.target.value })} />
            <DatePickerField value={order.expected} onChange={(v) => setOrder({ ...order, expected: v })} placeholder="Expected arrival" />
            <div style={d.actions}>
              <button style={d.primary} disabled={busy} onClick={() => run(() => markOrdered(selected.id, { orderNotes: order.notes, expectedArrival: order.expected ? new Date(order.expected + 'T12:00:00').getTime() : null }), () => { setOrdering(false); setOrder({ notes: '', expected: '' }); })}>Mark ordered</button>
              <button style={d.ghost} onClick={() => setOrdering(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={d.actions}><button style={d.primary} onClick={() => setOrdering(true)}>Mark ordered…</button></div>
        )
      ) : null}
      {selected.status === 'ordered' && selected.requestedByUid === user?.uid ? (
        <div style={d.actions}><button style={d.primary} disabled={busy} onClick={() => run(() => markArrived(selected.id))}>It arrived</button></div>
      ) : null}

      {/* Admins can correct anything, and move a request to any step. */}
      {isAdmin ? (
        <div style={d.section}>
          <p style={d.sectionLabel}>ADMIN</p>
          {editing ? (
            <>
              <input style={d.input} value={editing.deviceType} onChange={(e) => setEditing({ ...editing, deviceType: e.target.value })} placeholder="Device" />
              <input style={d.input} value={editing.forWhom} onChange={(e) => setEditing({ ...editing, forWhom: e.target.value })} placeholder="For whom" />
              <input style={d.input} value={editing.setupNotes} onChange={(e) => setEditing({ ...editing, setupNotes: e.target.value })} placeholder="Set-up notes" />
              <DatePickerField value={editing.neededBy} onChange={(v) => setEditing({ ...editing, neededBy: v })} placeholder="Needed by" />
              <div style={d.actions}>
                <button style={d.primary} disabled={busy} onClick={() => run(() => adminEdit(selected.id, { deviceType: editing.deviceType.trim(), forWhom: editing.forWhom.trim(), setupNotes: editing.setupNotes.trim(), neededBy: editing.neededBy ? new Date(editing.neededBy + 'T12:00:00').getTime() : null }), () => setEditing(null))}>Save details</button>
                <button style={d.ghost} onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </>
          ) : changing ? (
            <>
              <select style={d.input} value={changing.status} onChange={(e) => setChanging({ ...changing, status: e.target.value })}>
                {FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <input style={d.input} autoFocus placeholder="Reason - emailed to the person who asked" value={changing.reason} onChange={(e) => setChanging({ ...changing, reason: e.target.value })} />
              <div style={d.actions}>
                <button style={d.primary} disabled={busy || changing.status === selected.status || !changing.reason.trim()} onClick={() => run(() => adminSetStatus(selected.id, changing.status, changing.reason), () => { setChanging(null); setFilter(changing.status); })}>Change status</button>
                <button style={d.ghost} onClick={() => setChanging(null)}>Cancel</button>
              </div>
            </>
          ) : (
            <div style={{ ...d.actions, marginTop: 0 }}>
              <button style={d.ghost} onClick={() => setEditing({ deviceType: selected.deviceType, forWhom: selected.forWhom ?? '', setupNotes: selected.setupNotes ?? '', neededBy: ymd(selected.neededBy) })}>Edit details</button>
              <button style={d.ghost} onClick={() => setChanging({ status: selected.status, reason: '' })}>Change status…</button>
            </div>
          )}
        </div>
      ) : null}

      <div style={d.section}>
        <p style={d.sectionLabel}>HISTORY</p>
        <div style={d.history}>
          {history(selected).map(([what, t, who], i) => (
            <div key={i}>{dateText(t)} · {what}{who ? ' by ' + who : ''}</div>
          ))}
          {selected.statusChangeReason ? <div>“{selected.statusChangeReason}”</div> : null}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <RequestPage
        title="Device requests"
        subtitle="Ask for a laptop, tablet or phone. The COO decides, and you're emailed each step."
        actionLabel="+ New request"
        onAction={() => setFormOpen(true)}
        filters={FILTERS.map(([k, l]) => ({ key: k, label: l, count: requests.filter((r) => r.status === k).length }))}
        filter={filter}
        onFilter={(k) => { setFilter(k); setSelectedId(null); }}
        columns={[
          { key: 'what', label: 'Request', render: (r) => <><strong>{r.deviceType}</strong>{r.forWhom ? <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{r.forWhom}</div> : null}</> },
          { key: 'who', label: 'Who', render: (r) => r.requestedByName },
          { key: 'where', label: 'Location', render: (r) => r.locationName },
          { key: 'when', label: 'Asked', render: (r) => dateText(r.createdAt) },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={STEP[r.status]?.[1]}>{STEP[r.status]?.[0]}</Pill> },
        ]}
        rows={rows}
        selectedId={selected?.id}
        onSelect={(id) => { setSelectedId(id); setDeclining(false); setOrdering(false); setEditing(null); setChanging(null); }}
        detail={detail}
        empty="Nothing in this list."
        note={decides || atLeast(user, 'deviceRequests', 'view') ? null : 'You see only your own requests.'}
      >
        {formOpen ? (
          <div style={{ ...d.card, position: 'static', marginBottom: 16 }}>
            <p style={{ ...d.title, marginTop: 0 }}>New device request</p>
            <input style={d.input} placeholder="What is needed - e.g. MacBook Air, iPad" value={form.deviceType} onChange={(e) => setForm({ ...form, deviceType: e.target.value })} />
            <input style={d.input} placeholder="Who is it for (optional)" value={form.forWhom} onChange={(e) => setForm({ ...form, forWhom: e.target.value })} />
            <select style={d.input} value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
              <option value="">Which location?</option>
              {places.map((p) => <option key={p.id} value={p.id}>{p.brandName} · {p.name}</option>)}
            </select>
            <input style={d.input} placeholder="Set-up notes (optional)" value={form.setupNotes} onChange={(e) => setForm({ ...form, setupNotes: e.target.value })} />
            <DatePickerField value={form.neededBy} onChange={(v) => setForm({ ...form, neededBy: v })} placeholder="Needed by (optional)" />
            <div style={d.actions}>
              <button style={d.primary} disabled={busy} onClick={submit}>Send request</button>
              <button style={d.ghost} onClick={() => setFormOpen(false)}>Cancel</button>
            </div>
          </div>
        ) : null}
      </RequestPage>
      {dialogNode}
    </>
  );
}
