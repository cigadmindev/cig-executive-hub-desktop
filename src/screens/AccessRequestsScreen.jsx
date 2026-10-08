import React, { useState } from 'react';
import { useAccessRequests } from '../context/AccessRequestsContext';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../hooks/useDialog';
import { brands } from '../data/mockData';
import { rowForJob, featureAllowed, canSeeFolder } from '../data/accessMatrix';
import RequestPage, { Pill, detailStyles as d } from '../components/RequestPage';

// Someone asked to see something their login can't reach. Admins decide
// (5 October 2026). Approve gives that one thing to that one person - never
// their whole job row - and they are emailed either way.
const dateText = (t) => (t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

const STEP = {
  pending: ['Waiting', 'amber'],
  approved: ['Approved', 'cyan'],
  denied: ['Declined', 'grey'],
};
const FILTERS = [
  ['pending', 'Waiting'],
  ['approved', 'Approved'],
  ['denied', 'Declined'],
];
const KIND = { category: 'Folder', brand: 'Restaurant', location: 'Location', feature: 'Page' };

export default function AccessRequestsScreen() {
  const { user, hasBrandAccess, hasLocationAccess } = useAuth();
  const { requests, approve, decline, adminSetStatus, personFor } = useAccessRequests();
  const { dialogNode, notify } = useDialog();
  const isAdmin = user?.role === 'admin';

  const [filter, setFilter] = useState('pending');
  const [selectedId, setSelectedId] = useState(null);
  const [declining, setDeclining] = useState(null);
  const [changing, setChanging] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!isAdmin) {
    return <div style={{ padding: 28, color: 'var(--text-secondary)' }}>Access requests are decided by admins.</div>;
  }

  const run = async (fn, after) => {
    setBusy(true);
    try {
      await fn();
      after?.();
    } catch (err) {
      notify('Nothing was changed', err?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const rows = requests.filter((r) => r.status === filter).sort((a, b) => b.timestamp - a.timestamp);
  const selected = requests.find((r) => r.id === selectedId) ?? rows[0] ?? null;
  const person = selected ? personFor(selected) : null;

  // Where the thing they asked for lives, in plain words.
  const where = (r) => {
    if (r.locationName) return r.locationName;
    if (r.type === 'location') return brands.find((b) => b.id === r.brandId)?.name ?? '';
    if (r.type === 'category') return 'Every location they can reach';
    return '';
  };

  // Would their job already give them this? Answered from Who sees what, so
  // an admin can see at a glance when approving goes beyond the row.
  const jobAllows = (r, p) => {
    if (!p) return null;
    const row = rowForJob(p.job);
    const has =
      r.type === 'category' ? canSeeFolder(p, r.targetId)
      : r.type === 'brand' ? hasBrandAccess(p, r.targetId)
      : r.type === 'location' ? hasLocationAccess(p, r.brandId, r.targetId)
      : r.type === 'feature' ? featureAllowed(p, r.targetId)
      : false;
    if (has) return { ok: true, text: r.status === 'approved' ? 'They have it now' : 'Yes — they already have it' };
    const who = row ? row.label + 's' : 'People without a job';
    if (r.type === 'brand' || r.type === 'location') return { ok: false, text: "No — it isn't on their login" };
    return { ok: false, text: `No — ${who} don't see ${KIND[r.type] === 'Folder' ? r.targetLabel : 'this'}` };
  };

  const history = (r) =>
    [
      ['Asked', r.timestamp, r.userName],
      [r.status === 'denied' ? 'Declined' : r.status === 'approved' ? 'Approved' : null, r.resolvedAt, r.resolvedByName],
      ['Changed by hand', r.statusChangedAt, r.statusChangedByName],
    ]
      .filter(([what, t]) => what && t)
      .sort((a, b) => a[1] - b[1]);

  const allows = selected ? jobAllows(selected, person) : null;

  const detail = !selected ? (
    <div style={d.placeholder}>Pick a request to see it here.</div>
  ) : (
    <div style={d.card}>
      <p style={d.kicker}>{STEP[selected.status]?.[0]} · Asked {dateText(selected.timestamp)}</p>
      <p style={d.title}>{selected.targetLabel}</p>
      <div style={d.row}><span style={d.k}>Who</span><span style={d.v}>{selected.userName}{person?.job ? ' · ' + person.job : ''}</span></div>
      <div style={d.row}><span style={d.k}>What</span><span style={d.v}>{KIND[selected.type] ?? 'Access'}</span></div>
      {where(selected) ? <div style={d.row}><span style={d.k}>Where</span><span style={d.v}>{where(selected)}</span></div> : null}
      <div style={d.row}><span style={d.k}>Why</span><span style={{ ...d.v, whiteSpace: 'pre-wrap' }}>{selected.reason || 'No reason given.'}</span></div>
      {allows ? (
        <div style={d.row}><span style={d.k}>Job allows</span><span style={{ ...d.v, color: allows.ok ? '#4ADE80' : '#E8B93B' }}>{allows.text}</span></div>
      ) : (
        <div style={d.row}><span style={d.k}>Login</span><span style={{ ...d.v, color: '#E8B93B' }}>No active login for {selected.userEmail}</span></div>
      )}
      {selected.status === 'denied' && selected.declineReason ? (
        <div style={d.row}><span style={d.k}>Reason</span><span style={d.v}>{selected.declineReason}</span></div>
      ) : null}

      {selected.status === 'pending' ? (
        declining === selected.id ? (
          <div style={{ marginTop: 14 }}>
            <input style={d.input} autoFocus placeholder="Reason - emailed to them" value={changing?.reason ?? ''} onChange={(e) => setChanging({ reason: e.target.value })} />
            <div style={{ ...d.actions, marginTop: 0 }}>
              <button style={d.primary} disabled={busy || !(changing?.reason ?? '').trim()} onClick={() => run(() => decline(selected, changing.reason), () => { setDeclining(null); setChanging(null); setFilter('denied'); })}>Decline</button>
              <button style={d.ghost} onClick={() => { setDeclining(null); setChanging(null); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div style={d.actions}>
              <button style={d.primary} disabled={busy || !person} onClick={() => run(() => approve(selected), () => setFilter('approved'))}>Approve</button>
              <button style={d.ghost} onClick={() => { setDeclining(selected.id); setChanging({ reason: '' }); }}>Decline…</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '8px 0 0' }}>
              Approve gives {selected.userName?.split(' ')[0] ?? 'them'} this one {(KIND[selected.type] ?? 'item').toLowerCase()}, not the whole job row. It shows in Manage Logins under "Also given".
            </p>
          </>
        )
      ) : null}

      <div style={d.section}>
        <p style={d.sectionLabel}>ADMIN</p>
        {changing && declining !== selected.id && changing.status ? (
          <>
            <select style={d.input} value={changing.status} onChange={(e) => setChanging({ ...changing, status: e.target.value })}>
              {FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input style={d.input} autoFocus placeholder="Reason - emailed to the person who asked" value={changing.reason} onChange={(e) => setChanging({ ...changing, reason: e.target.value })} />
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 8px' }}>Moving to Approved gives the access; moving away from Approved takes it back.</p>
            <div style={{ ...d.actions, marginTop: 0 }}>
              <button style={d.primary} disabled={busy || changing.status === selected.status || !changing.reason.trim() || (changing.status === 'approved' && !person)} onClick={() => run(() => adminSetStatus(selected, changing.status, changing.reason), () => { setFilter(changing.status); setChanging(null); })}>Change status</button>
              <button style={d.ghost} onClick={() => setChanging(null)}>Cancel</button>
            </div>
          </>
        ) : (
          <div style={{ ...d.actions, marginTop: 0 }}>
            <button style={d.ghost} onClick={() => { setDeclining(null); setChanging({ status: selected.status, reason: '' }); }}>Change status…</button>
          </div>
        )}
      </div>

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
    <div>
      <RequestPage
        title="Access requests"
        subtitle="Someone asked to see a page, folder or location they can't reach. Admins decide; they're emailed the answer."
        filters={FILTERS.map(([k, l]) => ({ key: k, label: l, count: requests.filter((r) => r.status === k).length }))}
        filter={filter}
        onFilter={(k) => { setFilter(k); setSelectedId(null); setDeclining(null); setChanging(null); }}
        columns={[
          { key: 'what', label: 'Wants', render: (r) => <><strong>{r.targetLabel}</strong><div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{KIND[r.type] ?? 'Access'}{where(r) && r.type !== 'category' ? ' · ' + where(r) : ''}</div></> },
          { key: 'who', label: 'Who', render: (r) => r.userName },
          { key: 'when', label: 'Asked', render: (r) => dateText(r.timestamp) },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={STEP[r.status]?.[1]}>{STEP[r.status]?.[0]}</Pill> },
        ]}
        rows={rows}
        selectedId={selected?.id}
        onSelect={(id) => { setSelectedId(id); setDeclining(null); setChanging(null); }}
        detail={detail}
        empty="Nothing in this list."
        note="Only admins see this page. Decided requests stay here as the record of who was given what."
      />
      {dialogNode}
    </div>
  );
}
