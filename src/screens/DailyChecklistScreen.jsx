import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDailyRecord, todayKey, isManagerOnDuty } from '../hooks/useDailyChecklists';
import { brands } from '../data/mockData';
import { useDialog } from '../hooks/useDialog';
import PageHeader from '../components/PageHeader';
import NotePhotos from '../components/NotePhotos';
import Icon from '../components/Icon';
import { printDailySheets } from '../lib/printSheet';
import { useIsNarrow } from '../hooks/useIsNarrow';
import { fmtTime, fmtDayKey } from '../lib/dates';
import { plainError } from '../lib/errors';

// One daily checklist, laid out like the printed sheet. The manager on duty
// ticks each task once it's verified; every GM or assistant manager who
// opens it before it is filed is signed onto it as a manager on duty.
const time = (t) => fmtTime(t);
// Lists that can be marked "not open today" - the same list as the server's.
const NOT_OPEN_LISTS = ['veranda-opening'];
const pretty = (key) => fmtDayKey(key);

export default function DailyChecklistScreen() {
  const { brandId, locationId, listId } = useParams();
  const [params] = useSearchParams();
  const dateKey = params.get('date') ?? todayKey();
  const { user } = useAuth();
  const isNarrow = useIsNarrow();
  const { dialogNode, notify, confirm } = useDialog();
  const { list, record, toggle, setNote, setWorker, setSheetNote, signOff, markNotOpen, undoNotOpen, addPhotos, removePhoto } = useDailyRecord(locationId, brandId, dateKey, listId);
  // "Starkville", "Ridgeland" - for the sheet's heading and the Drive path.
  const brand = brands.find((b) => b.id === brandId);
  const brandName = brand?.name ?? '';
  const place = brand?.locations?.find((l) => l.id === locationId)?.name ?? '';
  const [noting, setNoting] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [filing, setFiling] = useState(false);

  if (!list) return <div style={styles.page}><p style={styles.muted}>No such checklist.</p></div>;
  const canWork = (user?.role === 'admin' || isManagerOnDuty(user, locationId, brandId)) && record?.status !== 'filed';
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
          notify('Could not file it', plainError(err, 'Try again.'));
        } finally {
          setFiling(false);
        }
      },
    });

  // The Veranda only (16 Oct 2026): filed as "not open", counts as done.
  const notOpenIt = () =>
    confirm({
      title: 'Mark the Veranda as not open on ' + pretty(dateKey) + '?',
      body: 'The list is locked and a one-page "not open" record is filed to Drive. Nobody is alerted, and it counts as done for the week.',
      confirmLabel: 'Mark as not open',
      onConfirm: async () => {
        setFiling(true);
        try {
          await markNotOpen();
          notify('Marked as not open', 'Filed to Drive.');
        } catch (err) {
          notify('Could not mark it', plainError(err, 'Try again.'));
        } finally {
          setFiling(false);
        }
      },
    });
  const undoIt = () =>
    confirm({
      title: 'Undo "not open"?',
      body: 'The list opens again so it can be worked and signed off, and the "not open" PDF is moved to Drive\'s trash.',
      confirmLabel: 'Undo',
      onConfirm: async () => {
        try {
          await undoNotOpen();
        } catch (err) {
          notify('Could not undo it', plainError(err, 'Try again.'));
        }
      },
    });

  return (
    <div style={styles.page}>
      {/* Same header as every page (14 Oct 2026). The restaurant comes from
          the location, so a Bluto's or Heritage list says so. */}
      <PageHeader
        back={{ to: `/brand/${brandId}/location/${locationId}/daily-checklists?date=${dateKey}`, label: 'Daily checklists' + (place ? ' · ' + place : '') }}
        title={list.title}
        subtitle={[brandName, place, pretty(dateKey)].filter(Boolean).join(' · ') + (list.subtitle ? ' — ' + list.subtitle : '')}
        phoneExtras="inline"
        extras={
          // This list as a blank sheet to post for the team (17 Oct 2026).
          <button
            style={isNarrow ? styles.printIcon : styles.printBtn}
            title="Print this list to post"
            aria-label="Print this list to post"
            onClick={() => printDailySheets({ location: place, brand: brandName, lists: [list] }) || notify('Print window blocked', 'Your browser stopped the print window from opening. Allow pop-ups for the Hub and try again.')}
          >
            <Icon name="printer" size={16} />{isNarrow ? null : <span>Print to post</span>}
          </button>
        }
      />
      <div style={styles.columns}>
        <div style={isNarrow ? { ...styles.sheet, padding: '16px 14px' } : styles.sheet}>
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
                  placeholder={/time/i.test(w) ? 'e.g. 7:45 AM' : 'Name'}
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
                      {/* A note on a ticked task is information for the team;
                          on an unticked one it says why it couldn't be done. */}
                      {t.note ? <div style={t.done ? styles.infoNote : styles.note}>{t.done ? 'Note: ' : "Couldn't be done: "}{t.note}{t.noteByName ? ' — ' + t.noteByName : ''}</div> : null}
                      {noting === i ? (
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <input style={{ ...styles.input, flex: 1 }} autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={t.done ? 'A note for the team' : "What couldn't be done, and why"} />
                          <button style={styles.ghost} onClick={async () => { await setNote(i, noteText.trim()); setNoting(null); }}>Save</button>
                        </div>
                      ) : null}
                      {/* Photos with the note (16 Oct 2026): added while the
                          note is open, shown under it afterwards. */}
                      <NotePhotos
                        photos={t.photos ?? []}
                        canEdit={canWork && noting === i}
                        onAdd={(files) => addPhotos(i, files)}
                        onRemove={(path) => removePhoto(i, path)}
                      />
                    </td>
                    {record?.sections ? <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{t.section ?? ''}</td> : null}
                    <td style={styles.td}>
                      <button
                        className="hit-40"
                        disabled={!canWork}
                        onClick={() => toggle(i)}
                        style={{ ...styles.box, ...(t.done ? styles.boxOn : {}) }}
                        aria-label={t.done ? 'Untick' : 'Tick'}
                      >
                        {t.done ? '✓' : ''}
                      </button>
                      {t.done ? <span style={styles.stamp}>{time(t.at)}</span> : null}
                      {canWork && noting !== i ? (
                        <button style={styles.link} onClick={() => { setNoting(i); setNoteText(t.note ?? ''); }}>{t.note ? 'Edit note' : 'Note'}</button>
                      ) : null}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
          {(list.notes ?? []).map(([key, label]) => (
            <div key={key} style={{ marginTop: 14 }}>
              <p style={styles.fieldLabel}>{label.toUpperCase()}</p>
              <textarea
                style={{ ...styles.input, minHeight: 56, resize: 'vertical' }}
                disabled={!canWork}
                defaultValue={record?.notes?.[key] ?? ''}
                key={(record?.id ?? '') + key + '|' + (record?.notes?.[key] ?? '')}
                placeholder={canWork ? 'Write it here, or leave blank' : ''}
                onBlur={(e) => e.target.value.trim() !== (record?.notes?.[key] ?? '') && setSheetNote(key, e.target.value.trim())}
              />
            </div>
          ))}
        </div>
        <div style={isNarrow ? { ...styles.side, flex: '1 1 100%', position: 'static' } : styles.side}>
          <div style={styles.card}>
            <p style={styles.big}>{done} of {real.length} verified</p>
            <div style={styles.bar}><div style={{ ...styles.fill, width: (real.length ? (done / real.length) * 100 : 0) + '%' }} /></div>
            {record?.status === 'filed' && record.notOpen ? (
              <>
                <p style={styles.okLine}>Not open today · marked by {record.filedByName} at {time(record.filedAt)} · filed to Drive</p>
                {user?.role === 'admin' ? <button style={{ ...styles.ghost, marginTop: 10 }} onClick={undoIt}>Undo - it was open</button> : null}
              </>
            ) : record?.status === 'filed' ? (
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
                {NOT_OPEN_LISTS.includes(listId) ? (
                  <button style={{ ...styles.ghost, width: '100%', marginTop: 14, ...(!canWork || filing ? { opacity: 0.4 } : {}) }} disabled={!canWork || filing} onClick={notOpenIt}>
                    The Veranda wasn't open today
                  </button>
                ) : null}
              </>
            )}
          </div>
          <div style={styles.card}>
            <p style={{ ...styles.big, fontSize: 13 }}>Filed to Drive as</p>
            <p style={styles.small}>Taste {place} › Operations › Opening &amp; Closing Checklists › {dateKey.slice(0, 7)} ›<br /><span style={{ color: 'var(--text-primary)' }}>{dateKey} {list.title.replace(' Checklist', '')}.pdf</span></p>
          </div>
        </div>
      </div>
      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '28px max(22px, min(36px, 4vw)) 60px', maxWidth: 1200 },
  columns: { display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 10 },
  sheet: { flex: '1 1 600px', minWidth: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 22px' },
  side: { flex: '0 1 320px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 16 },
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
  note: { fontSize: 12, color: 'var(--warn)', marginTop: 4 },
  infoNote: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 },
  box: { width: 24, height: 24, borderRadius: 6, border: '2px solid var(--border-strong)', background: 'none', color: '#0A0A0B', fontWeight: 900, cursor: 'pointer', verticalAlign: 'middle' },
  boxOn: { background: 'var(--neon)', borderColor: 'var(--neon)' },
  stamp: { fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6 },
  link: { background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 11, cursor: 'pointer', marginLeft: 6 },
  ghost: { minHeight: 40, background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', borderRadius: 7, padding: '6px 10px', fontSize: 12, cursor: 'pointer' },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 },
  big: { fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: 0 },
  bar: { height: 5, background: 'var(--border)', borderRadius: 3, margin: '10px 0' },
  fill: { height: 5, background: 'var(--neon)', borderRadius: 3 },
  primary: { marginTop: 12, background: 'var(--neon)', color: '#0A0A0B', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer' },
  printBtn: { display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 14px', borderRadius: 8, background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  printIcon: { width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 },
  okLine: { fontSize: 13, color: '#9FD3B0', background: 'rgba(95,163,119,0.12)', border: '1px solid rgba(95,163,119,0.45)', borderRadius: 8, padding: '10px 12px', margin: '6px 0 0', lineHeight: 1.5 },
  small: { fontSize: 12, color: 'var(--text-tertiary)', margin: '8px 0 0', lineHeight: 1.5 },
};
