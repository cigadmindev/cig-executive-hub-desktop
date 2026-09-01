import React, { useState } from 'react';
import { useIsNarrow } from '../hooks/useIsNarrow';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { brands } from '../data/mockData';
import { useDialog } from '../hooks/useDialog';
import { brandColors } from '../theme/colors';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useViewTracking } from '../context/ViewTrackingContext';
import { useAccessRequests } from '../context/AccessRequestsContext';
import { useEventRequests } from '../context/EventRequestsContext';
import RequestAccessModal from '../components/RequestAccessModal';
import { useHomeSummary } from '../hooks/useHomeSummary';
import { nike } from '../theme/nike';

export default function HomeScreen() {
  const isNarrow = useIsNarrow();
  const { dialogNode, notify } = useDialog();
  const { user, hasBrandAccess } = useAuth();
  const navigate = useNavigate();
  const { getByBrand } = useCustomLocations();
  const { hasUnseenForBrand } = useViewTracking();
  const { addRequest, hasPendingRequest } = useAccessRequests();
  const { hasNeedMatchingJob } = useEventRequests();
  const [hoveredId, setHoveredId] = useState(null);
  const [requestTarget, setRequestTarget] = useState(null);
  const summary = useHomeSummary();

  const handleCardClick = (item, allowed) => {
    if (allowed) {
      navigate(`/brand/${item.id}`);
      return;
    }
    if (!user) return;
    if (hasPendingRequest(user.email, 'brand', item.id)) {
      notify('Already requested', `Your request for ${item.name} is still waiting on approval.`);
      return;
    }
    setRequestTarget({ id: item.id, label: item.name });
  };

  const submitRequest = async (reason) => {
    await addRequest({
      userEmail: user.email,
      userName: user.name,
      type: 'brand',
      targetId: requestTarget.id,
      targetLabel: requestTarget.label,
      reason,
    });
    setRequestTarget(null);
    notify('Request sent', `An admin will review your request for access to ${requestTarget.label}.`);
  };

  return (
    <div style={styles.page}>
      <header style={{ ...styles.header, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <p style={{ ...styles.eyebrow, color: 'var(--neon)' }}>
            {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 style={{ ...styles.title, ...nike.pageTitle, fontSize: 32 }}>Welcome back, {user?.name?.split(' ')[0]}</h1>
        </div>
        {/* The shape of the day in three numbers, before reading anything. */}
        {summary.counts.overdue + summary.counts.soon > 0 ? (
          <div style={styles.headerCounts}>
            {summary.counts.overdue > 0 ? (
              <div>
                <div style={{ ...styles.countValue, color: 'var(--danger)' }}>{summary.counts.overdue}</div>
                <div style={styles.countLabel}>Overdue</div>
              </div>
            ) : null}
            {summary.counts.soon > 0 ? (
              <div>
                <div style={{ ...styles.countValue, color: '#C9A227' }}>{summary.counts.soon}</div>
                <div style={styles.countLabel}>Due soon</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* What needs you, before where you want to go. The brand grid alone
          answered navigation but not "what should I be doing", which is the
          actual question someone opens this with. */}
      <div style={isNarrow ? styles.topGridNarrow : styles.topGrid}>
      {summary.attention.length > 0 ? (
        <div style={styles.zone}>
          <p style={styles.zoneLabel}>Needs you</p>
          <div style={{ ...styles.panel, minHeight: 196 }}>
            {summary.attention.slice(0, 5).map((a, i) => (
              <button key={i} data-row="" style={styles.attentionRow} onClick={() => navigate(a.to)}>
                <span
                  style={{
                    ...styles.dot,
                    background: a.level === 'overdue' ? 'var(--danger)' : '#C9A227',
                  }}
                />
                <span style={styles.attentionText}>{a.text}</span>
                <span style={styles.attentionWhere}>{a.where}</span>
              </button>
            ))}
          </div>
          {summary.attention.length > 5 ? (
            <p style={styles.moreNote}>{summary.attention.length - 5} more</p>
          ) : null}
        </div>
      ) : null}

      {summary.openingSoon.length > 0 ? (
        <div style={styles.zone}>
          <p style={styles.zoneLabel}>Opening soon</p>
          <div style={styles.openingGrid}>
            {summary.openingSoon.map((loc) => (
              <button
                key={loc.id}
                data-card=""
                style={styles.openingCard}
                onClick={() => navigate(`/brand/${loc.brandId}/location/${loc.id}/opening-checklist`)}
              >
                <span style={styles.openingName}>{loc.brandName}</span>
                <span style={styles.openingMeta}>
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
                <div style={styles.openingStatRow}>
                  <span style={styles.openingMeta}>{loc.done} of {loc.total} setup</span>
                  {loc.overdue > 0 ? <span style={styles.openingOverdue}>{loc.overdue} overdue</span> : null}
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
                <div style={styles.openingStatRow}>
                  <span style={styles.openingMeta}>{loc.timelineDone} of {loc.timelineTotal} timeline</span>
                  {loc.timelineOverdue > 0 ? (
                    <span style={styles.openingOverdue}>{loc.timelineOverdue} overdue</span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      </div>

      <div style={isNarrow ? styles.topGridNarrow : styles.topGrid}>
        <div style={styles.zone}>
          <p style={styles.zoneLabel}>This week</p>
          <div style={{ ...styles.panel, minHeight: 148 }}>
            {summary.thisWeek.length === 0 ? (
              <p style={styles.emptyNote}>Nothing scheduled in the next seven days.</p>
            ) : (
              summary.thisWeek.slice(0, 3).map((e) => (
                <button key={e.id} data-row="" style={styles.attentionRow} onClick={() => navigate(e.to)}>
                  <span style={styles.weekDay}>
                    {new Date(e.dateTime).toLocaleDateString([], { weekday: 'short', day: 'numeric' }).toUpperCase()}
                  </span>
                  <span style={styles.attentionText}>{e.title}</span>
                  <span style={styles.attentionWhere}>{e.where}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div style={styles.zone}>
          <p style={styles.zoneLabel}>Recent</p>
          <div style={{ ...styles.panel, minHeight: 148 }}>
            {summary.recent.length === 0 ? (
              <p style={styles.emptyNote}>No recent sign-offs.</p>
            ) : (
              summary.recent.slice(0, 3).map((r) => (
                <div key={r.id} style={styles.recentRow}>
                  <span style={styles.recentText}>{r.text}</span>
                  <span style={styles.attentionWhere}>
                    {new Date(r.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <p style={styles.zoneLabel}>Restaurants</p>
      <div style={styles.grid}>
        {brands.map((item) => {
          const allowed = hasBrandAccess(user, item.id);
          const activeLocations = item.locations.filter((l) => l.status === 'active');
          const customLocations = getByBrand(item.id);
          const color = brandColors[item.name] ?? '#8A8A8A';
          const clickable = true;
          const allLocationIds = [...activeLocations.map((l) => l.id), ...customLocations.map((l) => l.id)];
          const hasUnseen =
            allowed && (hasUnseenForBrand(item.id, allLocationIds) || hasNeedMatchingJob(allLocationIds, user?.job, user?.uid));
          const totalLocations = activeLocations.length + customLocations.length;
          const isHovered = hoveredId === item.id && clickable;
          const pendingRequest = !allowed && user ? hasPendingRequest(user.email, 'brand', item.id) : false;

          return (
            <div key={item.id} style={{ position: 'relative' }}>
              <button
                data-card=""
                onClick={() => handleCardClick(item, allowed)}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  ...styles.card,
                  borderColor: allowed ? color : 'var(--border)',
                  opacity: allowed ? 1 : 0.5,
                  cursor: clickable ? 'pointer' : 'default',
                  transform: isHovered ? 'translateY(-2px)' : 'none',
                  boxShadow: isHovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                }}
              >
                <div style={styles.cardBody}>
                  <span style={styles.cardName}>{item.name}</span>
                  <span style={styles.cardMeta}>
                    {!allowed
                      ? pendingRequest
                        ? 'Request pending'
                        : 'Tap to request access'
                      : totalLocations > 0
                      ? `${totalLocations} location${totalLocations > 1 ? 's' : ''}`
                      : 'In Progress'}
                  </span>
                  {/* Each tile carries its own state, so the strip is a status
                      board rather than just a set of links. */}
                  {allowed && summary.byBrand[item.id] ? (
                    (() => {
                      const b = summary.byBrand[item.id];
                      if (b.overdue > 0)
                        return <span style={{ ...styles.cardStat, color: 'var(--danger)' }}>{b.overdue} overdue</span>;
                      if (b.dueSoon > 0)
                        return <span style={{ ...styles.cardStat, color: '#C9A227' }}>{b.dueSoon} due soon</span>;
                      if (b.total > 0 && b.done < b.total)
                        return (
                          <span style={{ ...styles.cardStat, color: 'var(--neon)' }}>
                            {Math.round((b.done / b.total) * 100)}% ready
                          </span>
                        );
                      return <span style={{ ...styles.cardStat, color: 'var(--success)' }}>All clear</span>;
                    })()
                  ) : null}
                </div>
              </button>
              {hasUnseen ? <span style={styles.unseenDot} /> : null}
            </div>
          );
        })}
      </div>

      {requestTarget ? (
        <RequestAccessModal target={requestTarget} onSubmit={submitRequest} onClose={() => setRequestTarget(null)} />
      ) : null}
      {dialogNode}
    </div>
  );
}

const styles = {
  topGrid: { display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 18, alignItems: 'start' },
  // Two columns at ~170px each on a phone left every card clipping its own
  // text mid-word. One column, full width.
  topGridNarrow: { display: 'grid', gridTemplateColumns: '1fr', gap: 14, alignItems: 'start' },
  zone: { marginBottom: 22, minWidth: 0 },
  zoneLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'var(--text-tertiary)',
    margin: '0 0 9px',
  },
  // Fixed heights so a quiet day doesn't shuffle the layout. A dashboard that
  // reflows whenever something clears is one whose positions you stop trusting,
  // and hunting for a panel that moved costs more than the empty space.
  panel: { background: 'var(--bg-card)', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  emptyNote: { fontSize: 12, color: 'var(--text-tertiary)', padding: '14px 16px', margin: 0 },
  weekDay: { fontSize: 11, fontWeight: 700, color: 'var(--neon)', width: 52, flexShrink: 0 },
  recentRow: { display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderBottom: '1px solid var(--border)' },
  recentText: { flex: 1, fontSize: 13, color: 'var(--text-primary)' },
  openingStatRow: { display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' },
  openingOverdue: { fontSize: 11, color: 'var(--danger)' },
  attentionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    width: '100%',
    padding: '12px 14px',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid var(--border)',
    textAlign: 'left',
    cursor: 'pointer',
  },
  dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  attentionText: { flex: 1, fontSize: 14, color: 'var(--text-primary)' },
  attentionWhere: { fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 },
  moreNote: { fontSize: 12, color: 'var(--text-tertiary)', margin: '9px 2px 0' },

  openingGrid: { display: 'flex', flexDirection: 'column', gap: 8 },
  openingCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    padding: 16,
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    textAlign: 'left',
    cursor: 'pointer',
  },
  openingName: { fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.2 },
  openingMeta: { fontSize: 12, color: 'var(--text-tertiary)' },
  barTrack: { height: 5, width: '100%', background: 'rgba(255,255,255,0.13)', borderRadius: 3, margin: '8px 0 5px' },
  barFill: { height: 5, background: 'var(--neon)', borderRadius: 3 },

  headerCounts: { display: 'flex', gap: 22, textAlign: 'right' },
  countValue: { fontSize: 22, fontWeight: 800, lineHeight: 1.1 },
  countLabel: { fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-tertiary)' },

  page: { padding: '36px max(22px, min(44px, 4vw))', maxWidth: 1040 },
  header: { marginBottom: 32 },
  eyebrow: { fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.7, margin: '0 0 6px' },
  title: { fontSize: 26, fontWeight: 700, letterSpacing: -0.4, margin: 0 },
  grid: {
    display: 'grid',
    // min() caps the track minimum at the container width, so a narrow
    // screen drops to a single column instead of squeezing two 175px
    // tiles that clip their own names. Desktop is unaffected.
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
    gap: 9,
  },
  card: {
    width: '100%',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    textAlign: 'left',
    overflow: 'hidden',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  cardBody: { padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 5, minHeight: 92 },
  cardName: { fontSize: 12, fontWeight: 800, letterSpacing: -0.1, textTransform: 'uppercase', lineHeight: 1.25 },
  cardMeta: { fontSize: 11, color: 'var(--text-tertiary)' },
  cardStat: { fontSize: 11 },
  unseenDot: { position: 'absolute', top: 14, right: 14, width: 9, height: 9, borderRadius: 5, background: 'var(--danger)', boxShadow: '0 0 0 3px var(--bg-card)' },
};
