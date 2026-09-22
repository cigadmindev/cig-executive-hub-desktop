import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHomeSummary } from '../hooks/useHomeSummary';
import { useAuth } from '../context/AuthContext';
import { useAccessRequests } from '../context/AccessRequestsContext';
import { useDialog } from '../hooks/useDialog';
import { hasFeature } from '../data/mockData';
import RequestAccessModal from '../components/RequestAccessModal';

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
      <h1 style={styles.title}>Opening Soon</h1>
      <p style={styles.subtitle}>
        {openings.length === 0
          ? 'Nothing with an opening date set.'
          : `${openings.length} restaurant${openings.length === 1 ? '' : 's'} opening.`}
      </p>

      <div style={styles.grid}>
        {openings.map((loc) => (
          <button
            key={loc.id}
            data-card=""
            style={styles.card}
            onClick={() => handleClick(loc)}
          >
            <span style={styles.name}>{loc.brandName}</span>
            <span style={styles.meta}>
              {loc.name} · {new Date(loc.openingDate).toLocaleDateString([], { month: 'short', day: 'numeric' })} ·{' '}
              {loc.daysOut} days out
            </span>

            <div style={styles.barTrack}>
              <div
                style={{
                  ...styles.barFill,
                  width: `${loc.total ? Math.round((loc.done / loc.total) * 100) : 0}%`,
                }}
              />
            </div>
            <div style={styles.statRow}>
              <span style={styles.meta}>
                {loc.done} of {loc.total} setup
              </span>
              {loc.overdue > 0 ? <span style={styles.overdue}>{loc.overdue} overdue</span> : null}
            </div>

            <div style={{ ...styles.barTrack, marginTop: 9 }}>
              <div
                style={{
                  ...styles.barFill,
                  background: 'var(--text-tertiary)',
                  width: `${loc.timelineTotal ? Math.round((loc.timelineDone / loc.timelineTotal) * 100) : 0}%`,
                }}
              />
            </div>
            <div style={styles.statRow}>
              <span style={styles.meta}>
                {loc.timelineDone} of {loc.timelineTotal} timeline
              </span>
              {loc.timelineOverdue > 0 ? (
                <span style={styles.overdue}>{loc.timelineOverdue} overdue</span>
              ) : null}
            </div>
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
  wrap: { padding: '28px 32px 60px' },
  title: { fontSize: 30, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.6, margin: '0 0 6px' },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 22px' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    textAlign: 'left',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 16,
    cursor: 'pointer',
  },
  name: { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' },
  meta: { fontSize: 12, color: 'var(--text-tertiary)' },

  barTrack: { height: 4, background: 'var(--bg-inset)', borderRadius: 2, marginTop: 14, marginBottom: 7 },
  barFill: { height: '100%', background: 'var(--neon)', borderRadius: 2 },
  statRow: { display: 'flex', justifyContent: 'space-between', gap: 8 },
  overdue: { fontSize: 12, color: 'var(--danger)' },
};
