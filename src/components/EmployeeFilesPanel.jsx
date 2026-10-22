import React, { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import DatePickerField from './DatePickerField';
import { plainError } from '../lib/errors';
import { fmtDay } from '../lib/dates';
import { useIsNarrow } from '../hooks/useIsNarrow';

// Employee files (22 Oct 2026, sketch 27, for Cameron). Everyone in this
// location's Staffing › Employee Files folder in Drive. When someone leaves:
// first mark that all their offboarding documentation is in their file, then
// archive - their folder moves to Archives › Historical Staffing & Training ›
// Archived Employee Files as "[Archived] Last, First". Archive stays locked
// until the docs are marked. Nothing is deleted; Undo moves it back.
const call = (name) => httpsCallable(getFunctions(undefined, 'us-central1'), name);
const initials = (name) => String(name ?? '').split(/[,\s]+/).filter(Boolean).slice(0, 2).reverse().map((p) => p[0]?.toUpperCase()).join('');
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

export default function EmployeeFilesPanel({ locationId, locationName, notify }) {
  const isNarrow = useIsNarrow();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(null);
  const [marking, setMarking] = useState(null);
  const [ticked, setTicked] = useState(false);
  const [archiving, setArchiving] = useState(null);
  const [lastDay, setLastDay] = useState(today());

  const load = () => call('employeeFilesList')({ locationId })
    .then((r) => { setData(r.data); setError(null); })
    .catch((err) => setError(plainError(err, 'Could not read Employee Files from Drive.')));
  useEffect(() => { setData(null); load(); }, [locationId]);

  const run = async (key, fn, failTitle) => {
    setBusy(key);
    try { await fn(); await load(); } catch (err) { notify(failTitle, plainError(err, 'Nothing was changed. Try again.')); } finally { setBusy(null); }
  };
  const mark = (p, marked) => run(p.folderId, () => call('employeeDocsMark')({ locationId, folderId: p.folderId, marked }), 'Could not save');
  const archive = (p) => run(p.folderId, () => call('employeeArchive')({ locationId, folderId: p.folderId, lastDay }), 'Could not archive');
  const undo = (p) => run(p.folderId, () => call('employeeUnarchive')({ locationId, folderId: p.folderId }), 'Could not undo');

  if (error) return <div style={styles.card}><p style={styles.title}>Employee files</p><p style={styles.muted}>{error}</p></div>;
  if (!data) return <div style={styles.card}><p style={styles.title}>Employee files</p><p style={styles.muted}>Reading Employee Files from Drive…</p></div>;
  if (!data.connected) return <div style={styles.card}><p style={styles.title}>Employee files</p><p style={styles.muted}>This location's Employee Files folder isn't connected yet.</p></div>;

  const shown = data.people.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div style={styles.card}>
      <div style={styles.head}>
        <div>
          <p style={styles.title}>Employee files</p>
          <p style={styles.muted}>{locationName} · {data.people.length} in Staffing › Employee Files. Mark offboarding docs first; then archive.</p>
        </div>
        <a style={styles.ghost} href={data.employeeFilesUrl} target="_blank" rel="noreferrer">Open in Drive</a>
      </div>
      <input style={styles.search} placeholder="Search names…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={styles.list}>
        {shown.map((p) => (
          <div key={p.folderId} style={{ ...styles.row, ...(isNarrow ? styles.rowNarrow : {}) }}>
            <span style={styles.av}>{initials(p.name)}</span>
            <span style={styles.who}>
              <a href={p.url} target="_blank" rel="noreferrer" style={styles.name}>{p.name}</a>
              <span style={styles.sub}>
                {p.files} {p.files === 1 ? 'file' : 'files'}
                {p.docsMarked ? <span style={{ color: 'var(--success)' }}> · Offboarding docs in file · marked by {p.docsMarked.byName || 'someone'}, {fmtDay(p.docsMarked.at)}</span> : null}
              </span>
            </span>
            <span style={{ ...styles.actions, ...(isNarrow ? { width: '100%', paddingLeft: 42 } : {}) }}>
              {p.docsMarked ? (
                <button style={styles.ghostBtn} disabled={busy === p.folderId} onClick={() => mark(p, false)}>Unmark</button>
              ) : (
                <button style={styles.ghostBtn} disabled={busy === p.folderId} onClick={() => { setMarking(p); setTicked(false); }}>{isNarrow ? 'Mark docs' : 'Mark offboarding docs in file'}</button>
              )}
              <button
                style={p.docsMarked ? styles.primaryBtn : { ...styles.ghostBtn, opacity: 0.4, cursor: 'not-allowed' }}
                disabled={!p.docsMarked || busy === p.folderId}
                title={p.docsMarked ? undefined : 'Mark that all offboarding documentation is in their file first'}
                onClick={() => { setArchiving(p); setLastDay(today()); }}
              >
                {busy === p.folderId ? '…' : 'Archive'}
              </button>
            </span>
          </div>
        ))}
        {shown.length === 0 ? <p style={{ ...styles.muted, padding: 14 }}>{q ? 'Nobody matches.' : 'No folders in Employee Files.'}</p> : null}
      </div>

      {data.archived.length ? (
        <>
          <p style={styles.cap}>Recently archived</p>
          <div style={styles.list}>
            {data.archived.map((p) => (
              <div key={p.folderId} style={styles.row}>
                <span style={{ ...styles.av, background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)' }}>{initials(p.name)}</span>
                <span style={styles.who}>
                  <span style={styles.name}>{p.name}</span>
                  <span style={styles.sub}>
                    Archived {fmtDay(p.archived.at)}{p.archived.byName ? ' by ' + p.archived.byName : ''}
                    {p.archived.lastDay ? ' · last day ' + fmtDay(new Date(p.archived.lastDay + 'T12:00:00').getTime()) : ''}
                    {p.docsMarked ? ' · docs marked ' + fmtDay(p.docsMarked.at) : ''}
                  </span>
                </span>
                <button style={styles.ghostBtn} disabled={busy === p.folderId} onClick={() => undo(p)}>Undo</button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {marking ? (
        <div data-modal="" style={styles.backdrop} onClick={() => setMarking(null)}>
          <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <p style={styles.dlgTitle}>Offboarding docs for {marking.name}</p>
            <p style={styles.dlgBody}>Confirm all offboarding documentation (resignation or separation form, final paperwork) is saved in their Employee Files folder.</p>
            <label style={styles.check}><input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} /> All offboarding documentation is in their file</label>
            <div style={styles.btnRow}>
              <button style={styles.ghostBtn} onClick={() => setMarking(null)}>Cancel</button>
              <button style={styles.primaryBtn} disabled={!ticked} onClick={() => { const p = marking; setMarking(null); mark(p, true); }}>Mark</button>
            </div>
          </div>
        </div>
      ) : null}

      {archiving ? (
        <div data-modal="" style={styles.backdrop} onClick={() => setArchiving(null)}>
          <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <p style={styles.dlgTitle}>Archive {archiving.name}?</p>
            <p style={styles.dlgBody}>Their folder and {archiving.files === 1 ? 'its 1 file' : 'all ' + archiving.files + ' files'} move to Historical Staffing &amp; Training › Archived Employee Files as "[Archived] {archiving.name}". Their Hub login, if they have one, is not changed here.</p>
            <p style={styles.cap}>Last day</p>
            <DatePickerField value={lastDay} onChange={setLastDay} />
            <div style={styles.btnRow}>
              <button style={styles.ghostBtn} onClick={() => setArchiving(null)}>Cancel</button>
              <button style={styles.primaryBtn} onClick={() => { const p = archiving; setArchiving(null); archive(p); }}>Archive</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const btn = { height: 32, padding: '0 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'none', whiteSpace: 'nowrap' };
const styles = {
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginTop: 22, display: 'flex', flexDirection: 'column', gap: 12 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  title: { margin: 0, fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4 },
  muted: { margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.5 },
  cap: { margin: '4px 0 0', fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  search: { height: 36, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-inset)', color: 'var(--text-primary)', padding: '0 12px', fontSize: 13, fontFamily: 'inherit' },
  list: { border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: '1px solid var(--border)' },
  rowNarrow: { flexWrap: 'wrap' },
  av: { width: 30, height: 30, borderRadius: '50%', background: 'rgba(34,211,238,0.12)', color: 'var(--neon)', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  who: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  name: { fontSize: 13.5, color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600 },
  sub: { fontSize: 11.5, color: 'var(--text-tertiary)' },
  actions: { display: 'flex', gap: 6, flexShrink: 0 },
  ghost: { ...btn, display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', textDecoration: 'none', flexShrink: 0 },
  ghostBtn: { ...btn, background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' },
  primaryBtn: { ...btn, background: 'var(--neon)', border: '1px solid var(--neon)', color: 'var(--neon-text)' },
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 },
  dialog: { width: '100%', maxWidth: 420, background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 },
  dlgTitle: { margin: 0, fontSize: 16, fontWeight: 800 },
  dlgBody: { margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 },
  check: { display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: 'var(--text-primary)' },
  btnRow: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
};
