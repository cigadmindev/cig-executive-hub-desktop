import React, { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDailyRecord, todayKey, isManagerOnDuty } from '../hooks/useDailyChecklists';
import { useDialog } from '../hooks/useDialog';
import { backLink } from '../theme/pageHeader';

// One daily checklist, laid out like the printed sheet. The manager on duty
// ticks each task once it's verified; every GM or assistant manager who
// opens it before it is filed is signed onto it as a manager on duty.
const time = (t) => (t ? new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '');
const pretty = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

export default function DailyChecklistScreen() {
  const { brandId, locationId, listId } = useParams();
  const [params] = useSearchParams();
  const dateKey = params.get('date') ?? todayKey();
  const { user } = useAuth();
  const { dialogNode, notify, confirm } = useDialog();
  const { list, record, toggle, setNote, setWorker, signOff } = useDailyRecord(locationId, brandId, dateKey, listId);
  const [noting, setNoting] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [filing, setFiling] = useState(false);

  if (!list) return <div style={styles.page}><p style={styles.muted}>No such checklist.</p></div>;
  const canWork = (user?.role === 'admin' || isManagerOnDuty(user)) && record?.status !== 'filed';
  const tasks = record?.tasks ?? [];
  const real = tasks.map((t, i) => ({ t, i })).filter(({ t }) => !t.group);
  const done = real.filter(({ t }) => t.done).length;
  const settled = real.every(({ t }) => t.done || t.note);

  const fileIt = () =>
    confirm({
      title: 'Sign off and file to Drive?',
      body: 'It is saved as a PDF in Operations › Opening & Closing Checklists, and can no longer be changed.',
      confirmLabel: 'Sign off',
      onConfirm: async () => {
        setFiling(true);
        try {
          await signOff();
          notify('Filed', 'Saved to Drive.');
        } catch (err) {
          notify('Could not file it', err?.message ?? 'Try again.');
        } finally {
          setFiling(false);
        }
      },
    });

  return (
    <div style={styles.page}>
      <Link to={`/brand/${brandId}/location/${locationId}/daily-checklists?date=${dateKey}`} style={backLink}>‹ Daily checklists</Link>
      <div style={styles.columns}>
        <div style={styles.sheet}>
          <p style={styles.brand}>TASTE ITALIAN KITCHEN — STARKVILLE</p>
          <h1 style={styles.h1}>{list.title.toUpperCase()}</h1>
          <p style={styles.muted}>{list.subtitle}</p>
          <div style={styles.fields}>
            <div><p style={styles.fieldLabel}>DATE</p><p style={styles.fieldValue}>{pretty(dateKey)}</p></div>
            {(list.workers ?? []).map((w) => (
              <div key={w}>
                <p style={styles.fieldLabel}>{w.toUpperCase()}</p>
                <input
                  style={styles.input}
                  disabled={!canWork}
                  defaultValue={record?.workers?.[w] ?? ''}
                  key={(record?.id ?? '') + w}
                  placeholder="Name"
                  onBlur={(e) => e.target.value !== (record?.workers?.[w] ?? '') && setWorker(w, e.target.value.trim())}
                />
              </div>
            ))}
            <div><p style={styles.fieldLabel}>MANAGER ON DUTY</p><p style={styles.fieldValue}>{(record?.managers ?? []).join(', ') || '—'}</p></div>
          </div>
          <p style={styles.intro}>{list.intro}</p>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>TASK</th>
                {record?.sections ? <th style={{ ...styles.th, width: 90 }}>SECTION</th> : null}
                <th style={{ ...styles.th, width: 110 }}>VERIFIED</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t, i) =>
                t.group ? (
                  <tr key={i}><td colSpan={3} style={styles.group}>{t.group.toUpperCase()}</td></tr>
                ) : (
                  <tr key={i}>
                    <td style={styles.td}>
                      <div style={styles.taskTitle}>{t.title}</div>
                      {t.details ? <div style={styles.details}>{t.details}</div> : null}
                      {t.note ? <div style={styles.note}>Couldn't be done: {t.note}{t.noteByName ? ' — ' + t.noteByName : ''}</div> : null}
                      {noting === i ? (
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <input style={{ ...styles.input, flex: 1 }} autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="What couldn't be done, and why" />
                          <button style={styles.ghost} onClick={async () => { await setNote(i, noteText.trim()); setNoting(null); }}>Save</button>
                        </div>
                      ) : null}
                    </td>
                    {record?.sections ? <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{t.section ?? ''}</td> : null}
                    <td style={styles.td}>
                      <button
                        disabled={!canWork}
                        onClick={() => toggle(i)}
                        style={{ ...styles.box, ...(t.done ? styles.boxOn : {}) }}
                        aria-label={t.done ? 'Untick' : 'Tick'}
                      >
                        {t.done ? '✓' : ''}
                      </button>
                      {t.done ? <span style={styles.stamp}>{time(t.at)}</span> : null}
                      {canWork && !t.done && noting !== i ? (
                        <button style={styles.link} onClick={() => { setNoting(i); setNoteText(t.note ?? ''); }}>Note</button>
                      ) : null}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
        <div style={styles.side}>
          <div style={styles.card}>
            <p style={styles.big}>{done} of {real.length} verified</p>
            <div style={styles.bar}><div style={{ ...styles.fill, width: (real.length ? (done / real.length) * 100 : 0) + '%' }} /></div>
            {record?.status === 'filed' ? (
              <p style={styles.muted}>
                Signed off by {record.filedByName} at {time(record.filedAt)}.{' '}
                {record.fileUrl ? <a href={record.fileUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--neon)' }}>Open in Drive ↗</a> : null}
              </p>
            ) : (
              <>
                <p style={styles.muted}>Tap each box once you've checked it's done — it records your name and the time. Use "Note" for anything that couldn't be done.</p>
                <button style={{ ...styles.primary, ...(!canWork || !settled || filing ? { opacity: 0.4 } : {}) }} disabled={!canWork || !settled || filing} onClick={fileIt}>
                  {filing ? 'Filing…' : 'Sign off and file to Drive'}
                </button>
                <p style={styles.small}>Unlocks when every task is ticked, or each missing one has a note.</p>
              </>
            )}
          </div>
          <div style={styles.card}>
            <p style={{ ...styles.big, fontSize: 13 }}>Filed to Drive as</p>
            <p style={styles.small}>Taste Starkville › Operations › Opening &amp; Closing Checklists › {dateKey.slice(0, 7)} ›<br /><span style={{ color: 'var(--text-primary)' }}>{dateKey} {list.title.replace(' Checklist', '')}.pdf</span></p>
          </div>
        </div>
      </div>
      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '24px 28px 60px', maxWidth: 1200 },
  columns: { display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 10 },
  sheet: { flex: '1 1 600px', minWidth: 0, background: '#16161A', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 22px' },
  side: { flex: '0 1 320px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 16 },
  brand: { fontSize: 11, letterSpacing: 3, color: 'var(--text-secondary)', margin: 0 },
  h1: { fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '6px 0 2px' },
  muted: { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0', lineHeight: 1.5 },
  fields: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '14px 0' },
  fieldLabel: { fontSize: 10, letterSpacing: 1, color: 'var(--text-tertiary)', margin: '0 0 4px' },
  fieldValue: { fontSize: 14, color: 'var(--text-primary)', margin: 0 },
  input: { width: '100%', boxSizing: 'border-box', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 10px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'inherit' },
  intro: { fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', fontSize: 10, letterSpacing: 1, color: 'var(--text-tertiary)', padding: '8px 6px' },
  td: { borderTop: '1px solid var(--border)', padding: '10px 6px', verticalAlign: 'top' },
  group: { borderTop: '1px solid var(--border)', padding: '14px 6px 6px', fontSize: 11, fontWeight: 800, letterSpacing: 2, color: 'var(--neon)' },
  taskTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  details: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, marginTop: 3, whiteSpace: 'pre-wrap' },
  note: { fontSize: 12, color: '#E8B93B', marginTop: 4 },
  box: { width: 24, height: 24, borderRadius: 6, border: '2px solid var(--border-strong)', background: 'none', color: '#0A0A0B', fontWeight: 900, cursor: 'pointer', verticalAlign: 'middle' },
  boxOn: { background: 'var(--neon)', borderColor: 'var(--neon)' },
  stamp: { fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6 },
  link: { background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 11, cursor: 'pointer', marginLeft: 6 },
  ghost: { background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', borderRadius: 7, padding: '6px 10px', fontSize: 12, cursor: 'pointer' },
  card: { background: '#16161A', border: '1px solid var(--border)', borderRadius: 12, padding: 16 },
  big: { fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: 0 },
  bar: { height: 5, background: 'var(--border)', borderRadius: 3, margin: '10px 0' },
  fill: { height: 5, background: 'var(--neon)', borderRadius: 3 },
  primary: { marginTop: 12, background: 'var(--neon)', color: '#0A0A0B', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer' },
  small: { fontSize: 12, color: 'var(--text-tertiary)', margin: '8px 0 0', lineHeight: 1.5 },
};
