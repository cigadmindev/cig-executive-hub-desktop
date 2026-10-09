import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { brands } from '../data/mockData';
import { useDialog } from '../hooks/useDialog';
import RequestPage, { Pill, detailStyles as d } from '../components/RequestPage';
import {
  useIntegrationRequests,
  SYSTEMS,
  KINDS,
} from '../context/IntegrationRequestsContext';
import { fmtDay } from '../lib/dates';
import { modalBackdrop, modalSurface } from '../theme/modal';

const when = (ts) => fmtDay(ts);

export default function IntegrationRequestsScreen() {
  const { user, hasBrandAccess } = useAuth();
  const { getByBrand } = useCustomLocations();
  const { dialogNode, notify } = useDialog();
  const { requests, handlesRequests, submitRequest, respond, markSeen } = useIntegrationRequests();

  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState('change');
  const [system, setSystem] = useState('');
  const [locationId, setLocationId] = useState('');
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);

  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState('open');
  const [draftResponse, setDraftResponse] = useState('');

  // Every location this person can reach, so a request can say where it
  // applies. A change to a Toast menu at one restaurant is not the same job as
  // the same change everywhere.
  const locationOptions = [];
  for (const b of brands) {
    if (!hasBrandAccess(user, b.id)) continue;
    for (const l of b.locations ?? []) locationOptions.push({ id: l.id, name: `${b.name} · ${l.name}` });
  }
  for (const b of brands) {
    if (!hasBrandAccess(user, b.id)) continue;
    for (const l of getByBrand(b.id) ?? []) {
      locationOptions.push({ id: l.id, name: `${b.name} · ${l.name}` });
    }
  }

  // Opening the queue is what clears the dot for the handler - the same rule
  // as everywhere else in the app: seen when looked at, not when acted on.
  useEffect(() => {
    if (!handlesRequests) return;
    requests.filter((r) => !r.seenByHandler).forEach((r) => markSeen(r.id));
  }, [handlesRequests, requests, markSeen]);

  const canSubmit = system && detail.trim().length >= 5;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await submitRequest({
        kind,
        system,
        locationId,
        locationName: locationOptions.find((l) => l.id === locationId)?.name ?? '',
        detail,
      });
      setFormOpen(false);
      setKind('change');
      setSystem('');
      setLocationId('');
      setDetail('');
      notify('Sent', 'It will go to whoever looks after the integrations.');
    } catch (err) {
      notify('Could not send', err?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRespond = async (r, status) => {
    try {
      await respond(r.id, { response: draftResponse, status });
      setFilter(status);
      notify(
        status === 'done' ? 'Marked done' : status === 'open' ? 'Reopened' : 'Marked in progress',
        draftResponse.trim() ? 'They will see your reply.' : 'No reply was sent.'
      );
    } catch (err) {
      notify('Could not save', err?.message ?? 'Try again.');
    }
  };

  const open = requests.filter((r) => r.status === 'open');
  const working = requests.filter((r) => r.status === 'in_progress');
  const done = requests.filter((r) => r.status === 'done');

  const renderRequest = (r) => {
    const isOpen = openId === r.id;
    return (
      <div key={r.id} style={styles.card}>
        <button
          style={styles.cardHead}
          onClick={() => {
            setOpenId(isOpen ? null : r.id);
            setDraftResponse(r.response ?? '');
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.cardTitle}>
              <span style={r.kind === 'help' ? styles.pillHelp : styles.pillChange}>
                {r.kind === 'help' ? 'Help' : 'Change'}
              </span>
              {r.status === 'in_progress' ? <Pill tone="cyan">In progress</Pill> : null}
              {r.status === 'done' ? <Pill tone="grey">Done</Pill> : null}
              {r.system}
              {r.locationName ? <span style={styles.cardWhere}> · {r.locationName}</span> : null}
            </div>
            <div style={styles.cardMeta}>
              {handlesRequests ? `${r.createdByName} · ` : ''}
              {when(r.createdAt)}
              {r.respondedByName ? ` · answered by ${r.respondedByName}` : ''}
            </div>
          </div>
          <span style={styles.chevron}>{isOpen ? '▾' : '▸'}</span>
        </button>

        {isOpen ? (
          <div style={styles.cardBody}>
            <p style={styles.detail}>{r.detail}</p>

            {r.response ? (
              <div style={styles.responseBlock}>
                <p style={styles.responseLabel}>
                  {r.respondedByName} · {when(r.respondedAt)}
                </p>
                <p style={styles.detail}>{r.response}</p>
              </div>
            ) : null}

            {handlesRequests ? (
              <>
                {r.createdByUid === user?.uid ? (
                  <p style={styles.ownNote}>
                    You raised this one. You can answer it because you also handle these.
                  </p>
                ) : null}
                <p style={styles.label}>Reply</p>
                <textarea
                  style={styles.textarea}
                  value={draftResponse}
                  onChange={(e) => setDraftResponse(e.target.value)}
                  placeholder={r.kind === 'help' ? 'How to do it…' : 'What you changed, and where…'}
                />
                <div style={styles.actionRow}>
                  {r.status !== 'in_progress' ? (
                    <button style={styles.secondaryButton} onClick={() => handleRespond(r, 'in_progress')}>
                      Mark as being worked on
                    </button>
                  ) : null}
                  <button style={styles.primaryButton} onClick={() => handleRespond(r, 'done')}>
                    Mark as done
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const STATUS = { open: ['Waiting', 'amber'], in_progress: ['In progress', 'cyan'], done: ['Done', 'grey'] };
  const rows = requests.filter((r) => r.status === filter).sort((a, b) => b.createdAt - a.createdAt);
  const selected = requests.find((r) => r.id === openId) ?? rows[0] ?? null;
  const isAdmin = user?.role === 'admin';

  const detailPanel = !selected ? (
    <div style={d.placeholder}>Pick a request to see it here.</div>
  ) : (
    <div style={d.card}>
      <p style={d.kicker}>{STATUS[selected.status]?.[0]} · {selected.kind === 'help' ? 'Help' : 'Change'}</p>
      <p style={d.title}>{selected.system}</p>
      <div style={d.row}><span style={d.k}>From</span><span style={d.v}>{selected.createdByName}</span></div>
      {selected.locationName ? <div style={d.row}><span style={d.k}>Where</span><span style={d.v}>{selected.locationName}</span></div> : null}
      <div style={d.row}><span style={d.k}>Asked</span><span style={d.v}>{when(selected.createdAt)}</span></div>
      <div style={d.row}><span style={d.k}>Details</span><span style={{ ...d.v, whiteSpace: 'pre-wrap' }}>{selected.detail}</span></div>
      {selected.response ? (
        <div style={d.section}>
          <p style={d.sectionLabel}>REPLY · {selected.respondedByName} · {when(selected.respondedAt)}</p>
          <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0, whiteSpace: 'pre-wrap' }}>{selected.response}</p>
        </div>
      ) : null}
      {handlesRequests ? (
        <div style={d.section}>
          <p style={d.sectionLabel}>{selected.status === 'done' && !isAdmin ? 'UPDATE THE REPLY' : 'REPLY'}</p>
          {selected.createdByUid === user?.uid ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 8px' }}>You raised this one; you can answer it because you also handle these.</p> : null}
          <textarea
            style={{ ...d.input, minHeight: 80, resize: 'vertical' }}
            value={draftResponse}
            onChange={(e) => setDraftResponse(e.target.value)}
            placeholder={selected.kind === 'help' ? 'How to do it…' : 'What you changed, and where…'}
          />
          <div style={{ ...d.actions, marginTop: 4 }}>
            {selected.status !== 'in_progress' ? <button style={d.ghost} onClick={() => handleRespond(selected, 'in_progress')}>Being worked on</button> : null}
            {selected.status !== 'done' ? <button style={d.primary} onClick={() => handleRespond(selected, 'done')}>Mark as done</button> : null}
            {selected.status === 'done' ? <button style={d.ghost} onClick={() => handleRespond(selected, 'open')}>Reopen</button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div>
      <RequestPage
        title="Systems Help"
        subtitle={handlesRequests ? 'Everything anyone has asked about Toast, R365 and OpenTable.' : 'Something that needs changing in Toast, R365 or OpenTable — or help with any of them.'}
        actionLabel="+ New Request"
        onAction={() => setFormOpen(true)}
        filters={Object.entries(STATUS).map(([k, [l]]) => ({ key: k, label: l, count: requests.filter((r) => r.status === k).length }))}
        filter={filter}
        onFilter={(k) => { setFilter(k); setOpenId(null); }}
        columns={[
          { key: 'what', label: 'Request', render: (r) => <><strong>{r.system}</strong><div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{r.kind === 'help' ? 'Help' : 'Change'}{r.locationName ? ' · ' + r.locationName : ''}</div></> },
          ...(handlesRequests ? [{ key: 'who', label: 'From', render: (r) => r.createdByName }] : []),
          { key: 'when', label: 'Asked', render: (r) => when(r.createdAt) },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={STATUS[r.status]?.[1]}>{STATUS[r.status]?.[0]}</Pill> },
        ]}
        rows={rows}
        selectedId={selected?.id}
        onSelect={(id) => { setOpenId(id); setDraftResponse(requests.find((r) => r.id === id)?.response ?? ''); }}
        detail={detailPanel}
        empty="Nothing in this list."
        note={handlesRequests ? null : 'You see only your own requests. IT & Training answers them, and you are emailed the reply.'}
      />

      {formOpen ? (
        <div data-modal="" data-modal-keep="" style={styles.backdrop} onClick={() => !saving && setFormOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>New Request</h2>

            <p style={styles.label}>What kind</p>
            <div style={styles.kindRow}>
              {KINDS.map((k) => (
                <button
                  key={k.key}
                  style={{ ...styles.kindButton, ...(kind === k.key ? styles.kindButtonActive : {}) }}
                  onClick={() => setKind(k.key)}
                >
                  {k.label}
                </button>
              ))}
            </div>

            <p style={styles.label}>Which system</p>
            <select style={styles.input} value={system} onChange={(e) => setSystem(e.target.value)}>
              <option value="">Choose one</option>
              {SYSTEMS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <p style={styles.label}>Which location (optional)</p>
            <select style={styles.input} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">All, or not location-specific</option>
              {locationOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>

            <p style={styles.label}>{kind === 'help' ? 'What do you need help with' : 'What needs changing'}</p>
            <textarea
              style={styles.textarea}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={
                kind === 'help'
                  ? 'Be as specific as you can — what you were doing and what happened.'
                  : 'What it is now, and what it should be.'
              }
            />

            <button style={{ ...styles.primaryButton, flex: 'none', width: '100%' }} onClick={handleSubmit} disabled={!canSubmit || saving}>
              {saving ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      ) : null}

      {dialogNode}
    </div>
  );
}

const styles = {

  card: { background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  cardHead: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'none', border: 'none', padding: '14px 16px', cursor: 'pointer', textAlign: 'left' },
  cardTitle: { fontSize: 14, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 },
  cardWhere: { color: 'var(--text-tertiary)' },
  cardMeta: { fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 },
  chevron: { color: 'var(--text-tertiary)', fontSize: 12 },
  cardBody: { padding: '0 16px 16px' },
  detail: { fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', margin: '0 0 12px', whiteSpace: 'pre-wrap' },

  pillChange: { fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', padding: '3px 7px', borderRadius: 6, background: 'rgba(34,211,238,0.14)', color: 'var(--neon)' },
  pillHelp: { fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', padding: '3px 7px', borderRadius: 6, background: 'rgba(201,162,39,0.16)', color: '#C9A227' },

  responseBlock: { borderLeft: '2px solid var(--border-strong)', paddingLeft: 12, margin: '0 0 12px' },
  responseLabel: { fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 4px' },

  ownNote: { fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic', margin: '10px 0 0' },
  label: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '14px 0 5px' },
  input: { width: '100%', boxSizing: 'border-box', height: 36, padding: '0 11px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-inset)', color: 'var(--text-primary)', fontSize: 13 },
  textarea: { width: '100%', boxSizing: 'border-box', minHeight: 90, padding: 11, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-inset)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' },

  kindRow: { display: 'flex', gap: 8 },
  kindButton: { flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  kindButtonActive: { background: 'var(--neon)', color: 'var(--neon-text)', borderColor: 'var(--neon)' },

  actionRow: { display: 'flex', gap: 8, marginTop: 14 },
  primaryButton: { flex: 1, padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 13, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer', marginTop: 18 },
  secondaryButton: { flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 18 },

  backdrop: { ...modalBackdrop, zIndex: 100 },
  modal: { padding: 22, ...modalSurface, width: 'min(460px, 100%)' },
  modalTitle: { fontSize: 19, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.2, color: '#FFFFFF', margin: '0 0 4px' },
};
