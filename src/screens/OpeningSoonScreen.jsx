import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHomeSummary } from '../hooks/useHomeSummary';
import { useAuth } from '../context/AuthContext';
import { useAccessRequests } from '../context/AccessRequestsContext';
import { useDialog } from '../hooks/useDialog';
import { hasFeature } from '../data/mockData';
import RequestAccessModal from '../components/RequestAccessModal';
import RequestPill from '../components/RequestPill';
import PageHeader from '../components/PageHeader';
import { fmtDay } from '../lib/dates';
import { brandColors } from '../theme/colors';

// Every restaurant with an opening date set, soonest first.
//
// The home screen shows the two nearest; this is where the rest live. It reads
// the same summary, so brand access is already applied - someone without
// Heritage does not see Heritage here any more than they do on the home
// screen or the calendar.
//
// Only dated openings. A location marked in progress with no date has no
// checklist yet and nothing to show.
export default function OpeningSoonScreen() {
  const navigate = useNavigate();
  const summary = useHomeSummary();
  const { user } = useAuth();
  const { addRequest, hasPendingRequest } = useAccessRequests();
  const { dialogNode, notify } = useDialog();
  const [requestTarget, setRequestTarget] = useState(null);

  // Opening dates are for everyone with "Opening dates" in Who sees what; the
  // progress and the checklist behind it only for those who have the checklist.
  const seesChecklist = hasFeature(user, 'openingChecklist');
  // Without the checklist, a card asks for it instead of doing nothing.
  const handleClick = (loc) => {
    if (hasFeature(user, 'openingChecklist')) {
      navigate(`/brand/${loc.brandId}/location/${loc.id}/opening-checklist`);
      return;
    }
    if (!user) return;
    if (hasPendingRequest(user.email, 'feature', 'openingChecklist')) {
      notify('Already requested', 'Your request for the opening checklist is still waiting on approval.');
      return;
    }
    setRequestTarget({
      type: 'feature',
      id: 'openingChecklist',
      label: `the opening checklist (${loc.brandName} · ${loc.name})`,
    });
  };

  const submitRequest = async (reason) => {
    await addRequest({
      userEmail: user.email,
      userName: user.name,
      type: requestTarget.type,
      targetId: requestTarget.id,
      targetLabel: requestTarget.label,
      reason,
    });
    const label = requestTarget.label;
    setRequestTarget(null);
    notify('Request sent', `An admin will review your request for access to ${label}.`);
  };

  const openings = summary.openingSoon;

  return (
    <div style={styles.wrap}>
      <PageHeader
        title="Opening Soon"
        subtitle={
          openings.length === 0
            ? 'No restaurant has an opening date set.'
            : `${openings.length} restaurant${openings.length === 1 ? '' : 's'} opening, soonest first.`
        }
      />

      <div style={styles.grid}>
        {openings.map((loc) => (
          <button
            key={loc.id}
            data-card=""
            style={styles.card}
            onClick={() => handleClick(loc)}
          >
            {/* Glass (Nov 2026): the place first and big, the countdown on the
                right, then set-up and timeline as two labelled bars. */}
            <span style={styles.top}>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={styles.brand}>
                  <span style={{ ...styles.dot, background: brandColors[loc.brandName] ?? 'var(--neon)' }} />
                  {loc.brandName}
                </span>
                <span style={styles.name}>{loc.name}</span>
                <span style={styles.meta}>Opens {fmtDay(loc.openingDate)}</span>
              </span>
              <span style={styles.days}>
                <span style={styles.daysN}>{loc.daysOut}</span>
                <span style={styles.daysL}>days</span>
              </span>
            </span>
            {seesChecklist ? null : <RequestPill pending={!!user && hasPendingRequest(user.email, 'feature', 'openingChecklist')} />}

            {seesChecklist ? (
              <>
                {[
                  ['Set-up', loc.done, loc.total, loc.overdue, 'var(--neon)'],
                  ['Timeline', loc.timelineDone, loc.timelineTotal, loc.timelineOverdue, 'var(--text-quaternary)'],
                ].map(([label, done, total, late, color]) => (
                  <span key={label} style={styles.stat}>
                    <span style={styles.statRow}>
                      <span style={styles.statLabel}>{label}</span>
                      <span style={styles.meta}>
                        {done} of {total}
                        {late > 0 ? <span style={styles.overdue}> · {late} late</span> : null}
                      </span>
                    </span>
                    <span style={styles.barTrack}>
                      <span style={{ ...styles.barFill, background: color, width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
                    </span>
                  </span>
                ))}
              </>
            ) : null}
          </button>
        ))}
      </div>
      {requestTarget ? (
        <RequestAccessModal target={requestTarget} onSubmit={submitRequest} onClose={() => setRequestTarget(null)} />
      ) : null}
      {dialogNode}
    </div>
  );
}

const styles = {
  wrap: { padding: '40px max(22px, min(48px, 4vw)) 60px', maxWidth: 1180 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 14 },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
    textAlign: 'left',
    background: 'var(--bg-card)',
    border: '1px solid var(--glass-edge)',
    borderRadius: 24,
    padding: '20px 22px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    color: 'var(--text-primary)',
  },
  top: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  brand: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)' },
  dot: { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  name: { display: 'block', fontSize: 24, fontWeight: 700, letterSpacing: -0.5, margin: '4px 0 2px' },
  meta: { fontSize: 13.5, color: 'var(--text-tertiary)' },
  days: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 },
  daysN: { fontSize: 34, fontWeight: 800, letterSpacing: -1, lineHeight: 1 },
  daysL: { fontSize: 12.5, fontWeight: 600, color: 'var(--text-tertiary)' },
  stat: { display: 'flex', flexDirection: 'column', gap: 6 },
  statRow: { display: 'flex', justifyContent: 'space-between', gap: 8 },
  statLabel: { fontSize: 13.5, fontWeight: 600, color: 'var(--text-secondary)' },
  barTrack: { display: 'block', height: 6, background: 'rgba(var(--ink-rgb), 0.08)', borderRadius: 3, overflow: 'hidden' },
  barFill: { display: 'block', height: '100%', borderRadius: 3 },
  overdue: { color: 'var(--bad)', fontWeight: 600 },
};
