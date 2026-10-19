import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { brands, canEditChecklists } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { useSchedule } from '../context/ScheduleContext';
import { useOpeningInfo } from '../context/OpeningInfoContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useDialog } from '../hooks/useDialog';
import { useIsNarrow } from '../hooks/useIsNarrow';
import PageHeader from '../components/PageHeader';
import { planLocation, planWrites, PHASES, DAY } from '../lib/openingPlan';
import { fmtDay } from '../lib/dates';
import { plainError } from '../lib/errors';

// Re-plan preview (19 Oct 2026, sketch 24). Every location still opening,
// with what the plan would do to each unfinished item: its old date, its
// new one and why. Nothing is written until Apply. Signed-off items, items
// waiting on a signature, dates set by hand and anything already in the works
// keep their dates; assignees, details, documents and the location's
// details are never touched.
export default function OpeningReplanScreen() {
  const { user } = useAuth();
  const { entries } = useSchedule();
  const { getInfo } = useOpeningInfo();
  const { getByBrand } = useCustomLocations();
  const { dialogNode, notify, confirm } = useDialog();
  const isNarrow = useIsNarrow();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [applying, setApplying] = useState(false);
  const [now] = useState(Date.now());

  const plans = useMemo(() => {
    const all = brands.flatMap((b) => [
      ...b.locations.map((l) => ({ ...l, brandId: b.id, brandName: b.name })),
      ...getByBrand(b.id).map((l) => ({ ...l, brandId: b.id, brandName: b.name })),
    ]);
    return all
      .map((loc) => ({ loc, info: getInfo(loc.id) }))
      .filter(({ loc, info }) => info?.openingDate && info.openingDate > now && !info.operating && entries.some((e) => e.locationId === loc.id && e.openingItem))
      .sort((a, b) => a.info.openingDate - b.info.openingDate)
      .map(({ loc, info }) => {
        const items = entries.filter((e) => e.locationId === loc.id && e.openingItem);
        return { loc, info, items, plan: planLocation({ locationId: loc.id, openingDate: info.openingDate, items, now }) };
      });
  }, [entries, getInfo, getByBrand, now]);

  const [pick, setPick] = useState(params.get('location'));
  const shown = plans.find((p) => p.loc.id === pick) ?? plans[0];
  // "Heritage Chophouse · Starkville": several brands share a town.
  const placeOf = (p) => p.loc.brandName + ' · ' + p.loc.name;

  if (!canEditChecklists(user)) return <div style={styles.page}><p style={styles.muted}>Only the people who edit the opening checklists can re-plan them.</p></div>;

  const apply = (which) => confirm({
    title: which.length === 1 ? 'Re-plan ' + placeOf(which[0]) + '?' : 'Re-plan all ' + which.length + ' locations?',
    body: 'Only the dates shown as changing are moved, and their calendar entries move with them. Signed-off items, anything in the works, dates set by hand, assignees, details, documents and location details stay exactly as they are.',
    confirmLabel: 'Apply',
    onConfirm: async () => {
      setApplying(true);
      try {
        const writes = which.flatMap((p) => planWrites(p.plan.rows, now));
        // Firestore takes 500 writes per batch.
        for (let i = 0; i < writes.length; i += 400) {
          const batch = writeBatch(db);
          writes.slice(i, i + 400).forEach(([id, fields]) => batch.update(doc(db, 'schedules', id), fields));
          await batch.commit();
        }
        notify('Re-planned', writes.length + ' dates moved across ' + which.map(placeOf).join(', ') + '.');
        if (which.length === 1) navigate('/brand/' + which[0].loc.brandId + '/location/' + which[0].loc.id + '/opening-checklist');
      } catch (err) {
        notify('Could not re-plan', plainError(err, 'Some dates may not have moved. Open the preview again and re-apply.'));
      } finally {
        setApplying(false);
      }
    },
  });

  const days = (t) => Math.ceil((t - now) / DAY);

  return (
    <div style={styles.page}>
      <PageHeader
        back={shown ? { to: '/brand/' + shown.loc.brandId + '/location/' + shown.loc.id + '/opening-checklist', label: shown.loc.name } : undefined}
        title="Re-plan preview"
        subtitle="Nothing changes until you apply it. Signed-off items and anything already in the works keep their dates."
        actionLabel={plans.length > 1 ? (applying ? 'Applying…' : 'Apply to all ' + plans.length) : null}
        onAction={() => apply(plans)}
        actionDisabled={applying}
      />

      {plans.length === 0 ? <p style={styles.muted}>No location is still opening with a checklist to re-plan.</p> : null}

      <div style={{ ...styles.cards, gridTemplateColumns: isNarrow ? 'repeat(2, minmax(0, 1fr))' : `repeat(${Math.min(4, plans.length) || 1}, minmax(0, 1fr))` }}>
        {plans.map((p) => {
          const s = p.plan.summary;
          const on = shown?.loc.id === p.loc.id;
          return (
            <button key={p.loc.id} style={{ ...styles.card, ...(on ? styles.cardOn : {}) }} onClick={() => setPick(p.loc.id)}>
              <b style={styles.cardTitle}>{p.loc.brandName}<span style={{ display: 'block', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12.5 }}>{p.loc.name}</span></b>
              <span style={styles.row}><span>Opens</span><span>{fmtDay(p.info.openingDate)} · {days(p.info.openingDate)} days</span></span>
              <span style={styles.row}><span>Signed off (kept)</span><span>{s.kept}</span></span>
              <span style={styles.row}><span>In the works (kept)</span><span>{s.inTheWorks}</span></span>
              <span style={styles.row}><span>Re-dated</span><span>{s.redated}</span></span>
              <span style={styles.row}><span>At risk</span><span style={{ color: s.atRisk ? 'var(--warn)' : 'var(--success)' }}>{s.atRisk}</span></span>
            </button>
          );
        })}
      </div>

      {shown ? (
        <div style={styles.tableCard}>
          <div style={styles.tableHead}>
            <div>
              <p style={styles.tableTitle}>{placeOf(shown)}</p>
              <p style={styles.muted}>
                {shown.plan.summary.squeeze < 1 ? 'Less time than the normal plan: the steps are squeezed into ' + Math.round(shown.plan.summary.squeeze * 100) + '% of the usual runway.' : 'The full normal runway.'}
              </p>
            </div>
            <button style={styles.applyOne} onClick={() => apply([shown])} disabled={applying}>Apply to this location</button>
          </div>
          {isNarrow ? (
            shown.plan.rows.map((r) => (
              <div key={r.item.id} style={styles.mRow}>
                <div style={styles.mTop}>
                  <span style={styles.mTitle}>{r.item.title}</span>
                  {r.atRisk ? <span style={styles.risk}>At risk</span> : null}
                </div>
                <div style={styles.mDates}>
                  {r.keep ? <span style={styles.muted}>{fmtDay(r.oldDate)} · kept</span> : <><span style={styles.old}>{fmtDay(r.oldDate)}</span><span style={styles.new}>{fmtDay(r.newDate)}</span></>}
                </div>
                <div style={styles.why}>{r.phase ? 'Phase ' + r.phase + ' · ' : 'Timeline · '}{r.why}</div>
              </div>
            ))
          ) : (
            <table style={styles.table}>
              <thead>
                <tr><th style={{ ...styles.th, width: '28%' }}>Item</th><th style={styles.th}>Phase</th><th style={styles.th}>Was due</th><th style={styles.th}>New date</th><th style={{ ...styles.th, width: '36%' }}>Why</th></tr>
              </thead>
              <tbody>
                {shown.plan.rows.map((r) => (
                  <tr key={r.item.id}>
                    <td style={styles.td}>{r.item.title}</td>
                    <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{r.phase ? r.phase + ' · ' + PHASES[r.phase - 1].label : 'Timeline · ' + r.item.openingSection}</td>
                    <td style={{ ...styles.td, ...(r.keep ? styles.mutedCell : styles.old) }}>{fmtDay(r.oldDate)}</td>
                    <td style={{ ...styles.td, ...(r.keep ? styles.mutedCell : styles.new) }}>{r.keep ? 'Kept' : fmtDay(r.newDate)}</td>
                    <td style={{ ...styles.td, color: 'var(--text-tertiary)' }}>
                      {r.atRisk ? <span style={{ ...styles.risk, marginRight: 6 }}>At risk</span> : null}{r.why}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ ...styles.muted, padding: '12px 16px' }}>Calendar entries are the same records, so the location calendar and the Master Calendar move with them.</p>
        </div>
      ) : null}
      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: 'var(--page-pad, 24px)', maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 },
  muted: { margin: 0, fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.5 },
  cards: { display: 'grid', gap: 10 },
  card: { textAlign: 'left', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 5, cursor: 'pointer', color: 'var(--text-primary)', fontFamily: 'inherit', textTransform: 'none', minWidth: 0 },
  cardOn: { borderColor: 'var(--neon)', boxShadow: 'inset 0 0 0 1px var(--neon)' },
  cardTitle: { fontSize: 13.5, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--text-tertiary)' },
  tableCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  tableHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' },
  tableTitle: { margin: 0, fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4 },
  applyOne: { height: 38, padding: '0 14px', borderRadius: 8, background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'none' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  th: { textAlign: 'left', fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', padding: '9px 12px', borderBottom: '1px solid var(--border-strong)' },
  td: { padding: '9px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', verticalAlign: 'top' },
  old: { color: '#F2928D', textDecoration: 'line-through', textDecorationColor: 'rgba(242,146,141,0.5)' },
  new: { color: 'var(--success)', fontWeight: 700 },
  mutedCell: { color: 'var(--text-tertiary)' },
  risk: { fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--warn)', background: 'rgba(232,185,59,0.14)', borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap' },
  mRow: { padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 3 },
  mTop: { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  mTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  mDates: { display: 'flex', gap: 10, fontSize: 12.5 },
  why: { fontSize: 12, color: 'var(--text-tertiary)' },
};
