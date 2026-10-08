import React from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { brands } from '../data/mockData';
import { DAILY_CHECKLISTS, tasksFor, dayName } from '../data/dailyChecklists';
import { useDailyRecords, todayKey } from '../hooks/useDailyChecklists';
import { nike } from '../theme/nike';

// Taste Starkville › Daily checklists - every opening and closing list for a
// day, with where each one stands.
const shift = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
};
const pretty = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
};
const time = (t) => (t ? new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '');

export default function DailyChecklistsScreen() {
  const { brandId, locationId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const dateKey = params.get('date') ?? todayKey();
  const records = useDailyRecords(locationId, dateKey);
  const brand = brands.find((b) => b.id === brandId);
  const location = brand?.locations?.find((l) => l.id === locationId);
  const isToday = dateKey === todayKey();

  const card = (list) => {
    const r = records[list.id];
    const tasks = r?.tasks ?? tasksFor(list, dateKey);
    const real = tasks.filter((t) => !t.group);
    const done = real.filter((t) => t.done).length;
    const dayTasks = tasksFor(list, dateKey).filter((t) => t.day !== undefined);
    let pill = ['Not started', styles.pillGrey];
    if (r?.status === 'filed') pill = ['Done · filed to Drive', styles.pillDone];
    else if (done > 0) pill = ['In progress', styles.pillAmber];
    else if (list.kind === 'closing' && isToday) pill = ['Tonight', styles.pillGrey];
    return (
      <button key={list.id} style={styles.card} onClick={() => navigate(`/brand/${brandId}/location/${locationId}/daily-checklists/${list.id}?date=${dateKey}`)}>
        <span style={styles.cardTitle}>{list.title.replace(' Checklist', '')}</span>
        <span style={styles.cardMeta}>
          {r?.status === 'filed'
            ? Object.entries(r.workers ?? {}).filter(([, v]) => v).map(([k, v]) => k + ': ' + v).join(' · ') + ' · signed off by ' + (r.filedByName ?? '') + ' ' + time(r.filedAt)
            : real.length + ' tasks' + (done ? ' · ' + done + ' ticked' : '') + (dayTasks.length ? ' · incl. ' + dayName(dayTasks[0].day) + ': ' + dayTasks.map((t) => t.title.toLowerCase()).join(', ') : '')}
        </span>
        <span style={styles.bar}><span style={{ ...styles.fill, width: (real.length ? (done / real.length) * 100 : 0) + '%' }} /></span>
        <span style={{ ...styles.pill, ...pill[1] }}>{pill[0]}</span>
      </button>
    );
  };

  return (
    <div style={styles.page}>
      <Link to={`/brand/${brandId}/location/${locationId}`} style={styles.back}>‹ {location?.name ?? 'Location'}</Link>
      <div style={styles.head}>
        <div>
          <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Daily checklists</h1>
          <p style={styles.sub}>The manager on duty ticks each task once it's verified. Signed-off lists are filed to Drive as the usual printed sheet.</p>
        </div>
        <div style={styles.dateBar}>
          <button style={styles.dateBtn} onClick={() => setParams({ date: shift(dateKey, -1) })}>‹</button>
          <span style={styles.date}>{pretty(dateKey)}</span>
          <button style={styles.dateBtn} disabled={isToday} onClick={() => setParams({ date: shift(dateKey, 1) })}>›</button>
        </div>
      </div>
      <p style={styles.label}>Opening</p>
      <div style={styles.grid}>{DAILY_CHECKLISTS.filter((l) => l.kind === 'opening').map(card)}</div>
      <p style={styles.label}>Closing</p>
      <div style={styles.grid}>{DAILY_CHECKLISTS.filter((l) => l.kind === 'closing').map(card)}</div>
      <p style={styles.note}>Not signed off by 10pm → this location's GM is emailed. Still not signed off the next day → the COO and admins are emailed.</p>
    </div>
  );
}

const styles = {
  page: { padding: '24px 28px 60px', maxWidth: 1200 },
  back: { color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginTop: 8 },
  title: { margin: 0, color: 'var(--text-primary)' },
  sub: { fontSize: 14, color: 'var(--text-secondary)', margin: '6px 0 0' },
  dateBar: { display: 'flex', gap: 6, alignItems: 'center' },
  dateBtn: { background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' },
  date: { border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 14px', color: 'var(--text-primary)', fontWeight: 700, fontSize: 13 },
  label: { fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '22px 0 10px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 },
  card: { textAlign: 'left', background: '#16161A', border: '1px solid var(--border)', borderRadius: 12, padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 118 },
  cardTitle: { fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' },
  cardMeta: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 },
  bar: { height: 4, background: 'var(--border)', borderRadius: 2, display: 'block', marginTop: 'auto' },
  fill: { height: 4, background: 'var(--neon)', borderRadius: 2, display: 'block' },
  pill: { alignSelf: 'flex-start', fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', borderRadius: 5, padding: '3px 8px' },
  pillGrey: { background: '#24242B', color: '#9A9AA6' },
  pillAmber: { background: '#3A2A0E', color: '#E8B93B' },
  pillDone: { background: '#0E2E22', color: '#4ADE80' },
  note: { fontSize: 12, color: 'var(--text-tertiary)', marginTop: 16 },
};
