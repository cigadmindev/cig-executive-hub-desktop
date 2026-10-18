import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { brands } from '../data/mockData';
import { listsFor, tasksFor, dayName } from '../data/dailyChecklists';
import { useDailyRecords, todayKey } from '../hooks/useDailyChecklists';
import { currentSlot } from '../components/TempLog';
import PageHeader from '../components/PageHeader';
import { fmtTime, fmtDayKey } from '../lib/dates';
import Pill from '../components/Pill';
import Icon from '../components/Icon';
import { useDialog } from '../hooks/useDialog';
import { useIsNarrow } from '../hooks/useIsNarrow';
import { printDailySheets } from '../lib/printSheet';

// A location's daily checklists - every opening and closing list it runs
// for a day, with where each one stands.
const shift = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
};
const pretty = (key) => fmtDayKey(key);
const time = (t) => fmtTime(t);

export default function DailyChecklistsScreen() {
  const { brandId, locationId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const dateKey = params.get('date') ?? todayKey();
  const records = useDailyRecords(locationId, brandId, dateKey);
  const brand = brands.find((b) => b.id === brandId);
  const location = brand?.locations?.find((l) => l.id === locationId);
  const isToday = dateKey === todayKey();
  const lists = listsFor(locationId);
  const { dialogNode, notify } = useDialog();
  const isNarrow = useIsNarrow();
  // Every list this location runs, one per page, to post for the team (17 Oct 2026).
  const printAll = () =>
    printDailySheets({ location: location?.name ?? '', brand: brand?.name ?? '', lists: lists.filter((l) => l.kind !== 'log') }) ||
    notify('Print window blocked', 'Your browser stopped the print window from opening. Allow pop-ups for the Hub and try again.');

  // The temperature log's card (18 Oct 2026): which checks are in and
  // which one is next.
  const logCard = (list) => {
    const r = records[list.id];
    const times = r?.times ?? list.times;
    const items = r?.items ?? list.items;
    const cells = r?.cells ?? {};
    const doneAt = (c) => items.every((_, i) => cells[i + '_' + c]);
    const filled = Object.keys(cells).length, total = items.length * times.length;
    const doneTimes = times.filter((_, c) => doneAt(c));
    const now = currentSlot(isToday);
    const next = times.findIndex((_, c) => !doneAt(c));
    let pill = ['Not started', 'amber'];
    if (r?.status === 'filed') pill = ['Done · filed to Drive', 'grey'];
    else if (filled) pill = [(doneTimes.length ? doneTimes[doneTimes.length - 1].replace(':00', '') + ' done' : 'In progress') + (next >= 0 ? ' · ' + times[next].replace(':00', '') + ' next' : ''), 'cyan'];
    return (
      <button key={list.id} style={styles.card} onClick={() => navigate(`/brand/${brandId}/location/${locationId}/daily-checklists/${list.id}?date=${dateKey}`)}>
        <span style={styles.cardTitle}>{list.title}</span>
        <span style={styles.cardMeta}>
          {r?.status === 'filed'
            ? 'Signed off by ' + (r.filedByName ?? '') + ' ' + time(r.filedAt)
            : items.length + ' items × ' + times.length + ' checks' + (filled ? ' · ' + filled + ' of ' + total + ' logged' : '') + (isToday && now >= 0 && next >= 0 ? ' · next check ' + times[Math.max(now, next)] : '')}
        </span>
        <span style={styles.bar}><span style={{ ...styles.fill, width: (total ? (filled / total) * 100 : 0) + '%' }} /></span>
        <span style={{ alignSelf: 'flex-start' }}><Pill tone={pill[1]}>{pill[0]}</Pill></span>
      </button>
    );
  };

  const card = (list) => {
    if (list.kind === 'log') return logCard(list);
    const r = records[list.id];
    const tasks = r?.tasks ?? tasksFor(list, dateKey);
    const real = tasks.filter((t) => !t.group);
    const done = real.filter((t) => t.done).length;
    // Tasks that only show on some days (one weekday, or a few - 16 Oct 2026).
    const dayTasks = tasksFor(list, dateKey).filter((t) => t.day !== undefined || t.days !== undefined);
    const todayName = dayName(new Date(dateKey + 'T12:00:00').getDay());
    let pill = ['Not started', 'amber'];
    if (r?.status === 'filed') pill = ['Done · filed to Drive', 'grey'];
    else if (done > 0) pill = ['In progress', 'cyan'];
    else if (list.kind === 'closing' && isToday) pill = ['Tonight', 'grey'];
    return (
      <button key={list.id} style={styles.card} onClick={() => navigate(`/brand/${brandId}/location/${locationId}/daily-checklists/${list.id}?date=${dateKey}`)}>
        <span style={styles.cardTitle}>{list.title.replace(' Checklist', '')}</span>
        <span style={styles.cardMeta}>
          {r?.status === 'filed'
            ? Object.entries(r.workers ?? {}).filter(([, v]) => v).map(([k, v]) => k + ': ' + v).join(' · ') + ' · signed off by ' + (r.filedByName ?? '') + ' ' + time(r.filedAt)
            : real.length + ' tasks' + (done ? ' · ' + done + ' ticked' : '') + (dayTasks.length ? ' · incl. ' + todayName + ': ' + dayTasks.map((t) => t.title.toLowerCase()).join(', ') : '')}
        </span>
        <span style={styles.bar}><span style={{ ...styles.fill, width: (real.length ? (done / real.length) * 100 : 0) + '%' }} /></span>
        <span style={{ alignSelf: 'flex-start' }}><Pill tone={pill[1]}>{pill[0]}</Pill></span>
      </button>
    );
  };

  return (
    <div style={styles.page}>
      <PageHeader
        back={{ to: `/brand/${brandId}/location/${locationId}`, label: location?.name ?? 'Location' }}
        title="Daily checklists"
        subtitle="The manager on duty ticks each task once it's checked. Signed-off lists are filed to Drive as the usual printed sheet."
        extras={
          <div style={styles.dateBar}>
            <button style={isNarrow ? styles.printIcon : styles.printBtn} onClick={printAll} title="Print every list to post" aria-label="Print every list to post">
              <Icon name="printer" size={16} />{isNarrow ? null : <span>Print all lists</span>}
            </button>
            <button style={styles.dateBtn} aria-label="Day before" onClick={() => setParams({ date: shift(dateKey, -1) })}>‹</button>
            <span style={styles.date}>{pretty(dateKey)}</span>
            <button style={styles.dateBtn} aria-label="Day after" disabled={isToday} onClick={() => setParams({ date: shift(dateKey, 1) })}>›</button>
          </div>
        }
      />
      <p style={styles.label}>Opening</p>
      <div style={styles.grid}>{lists.filter((l) => l.kind === 'opening').map(card)}</div>
      <p style={styles.label}>Closing</p>
      <div style={styles.grid}>{lists.filter((l) => l.kind === 'closing').map(card)}</div>
      {lists.some((l) => l.kind === 'log') ? (
        <>
          <p style={styles.label}>Food safety</p>
          <div style={styles.grid}>{lists.filter((l) => l.kind === 'log').map(card)}</div>
        </>
      ) : null}
      <p style={styles.note}>Openings not signed off by 5pm, or closings by midnight → this location's GM is emailed. Still not signed off by 10am the next day → the COO and admins are emailed. The kitchen closing is verified by the GM the next morning: the GM is reminded at 10am, and the COO and admins at 3pm. The temperature log is the chefs': they are reminded 30 minutes after a check with nothing logged, and at 11pm if it is not signed off.</p>
      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '28px max(22px, min(36px, 4vw)) 60px', maxWidth: 1200 },
  dateBar: { display: 'flex', gap: 6, alignItems: 'center' },
  printBtn: { display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginRight: 6, whiteSpace: 'nowrap', fontFamily: 'inherit' },
  printIcon: { width: 36, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer', padding: 0, marginRight: 4 },
  dateBtn: { background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' },
  date: { border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 14px', color: 'var(--text-primary)', fontWeight: 700, fontSize: 13 },
  label: { fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '22px 0 10px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 },
  card: { textAlign: 'left', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 118 },
  cardTitle: { fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' },
  cardMeta: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 },
  bar: { height: 4, background: 'var(--border)', borderRadius: 2, display: 'block', marginTop: 'auto' },
  fill: { height: 4, background: 'var(--neon)', borderRadius: 2, display: 'block' },
  note: { fontSize: 12, color: 'var(--text-tertiary)', marginTop: 16 },
};
