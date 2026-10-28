import React, { useState } from 'react';
import { useIsNarrow } from '../hooks/useIsNarrow';
import { useNavigate , Link } from 'react-router-dom';
import { MySpaceCard } from './MySpaceScreen';
import RequestPill from '../components/RequestPill';
import { useAuth } from '../context/AuthContext';
import { brands , hasFeature } from '../data/mockData';
import { useDialog } from '../hooks/useDialog';
import { brandColors } from '../theme/colors';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useViewTracking } from '../context/ViewTrackingContext';
import { useAccessRequests } from '../context/AccessRequestsContext';
import { useEventRequests } from '../context/EventRequestsContext';
import RequestAccessModal from '../components/RequestAccessModal';
import { useHomeSummary } from '../hooks/useHomeSummary';
import { useBrandAnnouncements } from '../context/BrandAnnouncementsContext';
import PostCard from '../components/PostCard';
import { accessLevel } from '../data/accessMatrix';
import { brandIdForTarget } from '../data/mockData';
import { fmtDay } from '../lib/dates';
import PageHeader from '../components/PageHeader';
import Pill from '../components/Pill';
import { CountUp, Ring } from '../components/Motion';

export default function HomeScreen() {
  const isNarrow = useIsNarrow();
  const { dialogNode, notify } = useDialog();
  const { user, hasBrandAccess } = useAuth();
  const navigate = useNavigate();
  const { getByBrand } = useCustomLocations();
  const { hasUnseenForBrand } = useViewTracking();
  const { addRequest, hasPendingRequest } = useAccessRequests();
  const { hasNeedMatchingJob } = useEventRequests();
  const [requestTarget, setRequestTarget] = useState(null);
  const summary = useHomeSummary();
  const { announcements, toggleLike, addComment, toggleCommentLike, deletePost, deleteComment, unpin } = useBrandAnnouncements();
  // Pinned announcements this person should see, newest first. Location
  // narrowing is applied here, the same as everywhere else in the app.
  const pinned = announcements
    .filter((a) => a.pinnedUntil === 'forever' || (typeof a.pinnedUntil === 'number' && a.pinnedUntil > Date.now()))
    .filter((a) => {
      if (a.targetId === 'all' || user?.role === 'admin' || user?.role === 'executive') return true;
      const bid = a.brandId ?? brandIdForTarget(a.targetId);
      if (!(user?.permissions?.brandIds ?? []).includes(bid)) return false;
      if (a.targetId === bid) return true;
      const only = user?.permissions?.locationsByBrand?.[bid];
      return !Array.isArray(only) || only.length === 0 || only.includes(a.targetId);
    })
    .sort((x, y) => (y.timestamp ?? 0) - (x.timestamp ?? 0));

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

  const handleOpeningClick = (loc) => {
    if (hasFeature(user, 'openingChecklist')) {
      navigate(`/brand/${loc.brandId}/location/${loc.id}/opening-checklist`);
      return;
    }
    // Opening date only for this person - nothing to open, nothing to request.
    if (!user || accessLevel(user, 'openingChecklist') === 'none') return;
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
      type: requestTarget.type ?? 'brand',
      targetId: requestTarget.id,
      targetLabel: requestTarget.label,
      reason,
    });
    setRequestTarget(null);
    notify('Request sent', `An admin will review your request for access to ${requestTarget.label}.`);
  };

  // How many things are actually on this person (headers don't count).
  const needCount = summary.attention.filter((a) => a.level !== 'header').length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.name?.split(' ')[0] ?? '';

  // The visible restaurants follow the same rule as before: an exec-only
  // brand (Cajun Depot) only appears for someone who already has access.
  const visibleBrands = brands.filter((b) => !b.execOnly || hasBrandAccess(user, b.id));
  const showOpenings = summary.openingSoon.length > 0;
  const canOpenChecklist = hasFeature(user, 'openingChecklist');

  return (
    <div style={styles.page}>
      {/* Home, upgraded (28 Oct 2026, sketch 35): a bigger greeting that
          says how many things need you, the counts count up as the page
          opens, restaurants as one row of chips, your work first, and the
          openings as rings. Every rule underneath is the same as before. */}
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle={
          <>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            {' · '}
            <span style={{ color: needCount ? 'var(--neon)' : 'var(--text-secondary)', fontWeight: needCount ? 700 : 400 }}>
              {needCount ? `${needCount} thing${needCount === 1 ? '' : 's'} need${needCount === 1 ? 's' : ''} you` : 'nothing needs you right now'}
            </span>
          </>
        }
        extras={
          <div style={isNarrow ? styles.tilesNarrow : styles.tiles} data-stagger="">
            {/* Always shown, zeros included: a number that disappears at zero
                reads as missing rather than good news. Zero is grey. */}
            {summary.counts.overdue !== null ? (
              <div style={styles.tile}>
                <CountUp value={summary.counts.overdue} style={{ ...styles.tileValue, color: summary.counts.overdue > 0 ? 'var(--danger)' : 'var(--text-tertiary)' }} />
                <span style={styles.tileLabel}>Overdue</span>
              </div>
            ) : null}
            <div style={styles.tile}>
              <CountUp value={summary.counts.renewals} style={{ ...styles.tileValue, color: summary.counts.renewals > 0 ? 'var(--warn)' : 'var(--text-tertiary)' }} />
              <span style={styles.tileLabel}>Renewals</span>
            </div>
            <div style={styles.tile}>
              <CountUp value={summary.counts.thisWeek} style={{ ...styles.tileValue, color: summary.counts.thisWeek > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }} />
              <span style={styles.tileLabel}>This week</span>
            </div>
          </div>
        }
      />

      {/* Restaurants as proper tiles again (28 Oct 2026): full names, the
          brand colour down the side, how many locations and how each is
          doing. Each still opens the restaurant, or asks for access when
          it's locked, exactly as before. */}
      <div style={isNarrow ? styles.tilesGridNarrow : styles.tilesGrid} data-stagger="">
        {visibleBrands.map((item) => {
          const allowed = hasBrandAccess(user, item.id);
          const activeLocations = item.locations.filter((l) => l.status === 'active');
          const customLocations = getByBrand(item.id);
          const color = brandColors[item.name] ?? '#8A8A8A';
          const allLocationIds = [...activeLocations.map((l) => l.id), ...customLocations.map((l) => l.id)];
          const hasUnseen =
            allowed && (hasUnseenForBrand(item.id, allLocationIds) || hasNeedMatchingJob(allLocationIds, user?.job, user?.uid));
          const totalLocations = activeLocations.length + customLocations.length;
          const pendingRequest = !allowed && user ? hasPendingRequest(user.email, 'brand', item.id) : false;
          let stat = null;
          if (allowed && summary.byBrand[item.id]) {
            const b = summary.byBrand[item.id];
            if (b.overdue > 0) stat = { text: `${b.overdue} overdue`, color: 'var(--danger)' };
            else if (b.dueSoon > 0) stat = { text: `${b.dueSoon} due soon`, color: 'var(--warn)' };
            else if (b.total > 0 && b.done < b.total) stat = { text: `${Math.round((b.done / b.total) * 100)}% ready`, color: 'var(--neon)' };
            else stat = { text: 'All clear', color: 'var(--success)' };
          }
          return (
            <button
              key={item.id}
              data-card=""
              style={{ ...styles.brandTile, opacity: allowed ? 1 : 0.55, borderLeftColor: allowed ? color : 'var(--border-strong)' }}
              onClick={() => handleCardClick(item, allowed)}
            >
              <span style={styles.brandName}>{item.name}</span>
              {allowed ? (
                <>
                  <span style={styles.brandMeta}>
                    {totalLocations > 0 ? `${totalLocations} location${totalLocations > 1 ? 's' : ''}` : 'In progress'}
                  </span>
                  {stat ? <span style={{ ...styles.brandStat, color: stat.color }}>{stat.text}</span> : null}
                </>
              ) : (
                <span style={{ marginTop: 'auto' }}><RequestPill pending={pendingRequest} /></span>
              )}
              {hasUnseen ? <span style={styles.unseenDot} aria-label="Something new" /> : null}
            </button>
          );
        })}
      </div>
      <MySpaceCard user={user} />

      {pinned.length > 0 ? (
        <div style={{ marginBottom: 22 }} data-rise="">
          <p style={styles.zoneLabel}>Announcements</p>
          {pinned.map((post) => (
            <div key={post.id} style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--neon)', margin: '0 0 6px' }}>
                {post.targetId === 'all' ? 'Everyone' : post.targetName ?? ''}
                {user?.role === 'admin' || post.authorUid === user?.uid ? (
                  <button
                    onClick={() => unpin(post.id)}
                    style={{ marginLeft: 10, background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 700, cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}
                  >
                    Remove from Home
                  </button>
                ) : null}
              </p>
              <PostCard
                post={post}
                isNewest={false}
                onToggleLike={toggleLike}
                onAddComment={addComment}
                onToggleCommentLike={toggleCommentLike}
                onDeletePost={deletePost}
                onDeleteComment={deleteComment}
              />
            </div>
          ))}
        </div>
      ) : null}

      {/* Four panels in two rows that line up (28 Oct 2026): Needs you beside
          Opening soon, This week beside Recent. Needs you scrolls inside its
          own box, sized by the row, so a long list never pushes the page. */}
      <div style={isNarrow ? styles.quadNarrow : styles.quad}>
        <div style={{ ...styles.zone, ...styles.zoneFill, ...(!showOpenings && !isNarrow ? { gridColumn: '1 / -1' } : {}) }}>
          <p style={styles.zoneLabel}>Needs you{needCount ? ` · ${needCount}` : ''}</p>
          <div style={isNarrow ? styles.needsPlain : styles.needsScroll}>
            <div style={isNarrow ? styles.needsInnerNarrow : { ...styles.panel, ...styles.needsInner }} data-stagger="">
              {summary.attention.length === 0 ? <p style={styles.emptyNote}>Nothing needs your attention.</p> : null}
              {summary.attention.map((a, i) => {
                if (a.level === 'header') return <p key={'h' + i} style={styles.attentionHeader}>{a.text}</p>;
                // A row waiting on you shows its action as a button (Decide,
                // Claim, Sign, Answer, Download); the rest open quietly.
                const parts = String(a.where ?? '').split(' · ');
                const verb = a.level === 'waiting' && ACTIONS.includes(parts[0]) ? parts[0] : null;
                const sub = verb ? parts.slice(1).join(' · ') : a.where;
                return (
                  <button
                    key={i}
                    data-row=""
                    data-marked={a.mine ? '' : undefined}
                    style={{ ...styles.attentionRow, ...(a.mine ? styles.attentionRowMine : {}) }}
                    onClick={() => navigate(a.to)}
                  >
                    <span
                      style={{
                        ...styles.dot,
                        ...(a.level === 'tagged' ? { background: 'var(--neon)' } : {}),
                        ...(a.level === 'todo'
                          ? { background: 'transparent', border: '1.5px solid var(--text-tertiary)', boxSizing: 'border-box' }
                          : a.level === 'tagged'
                            ? {}
                            : { background: a.level === 'overdue' ? 'var(--danger)' : 'var(--warn)' }),
                      }}
                    />
                    <span style={styles.rowText}>
                      <span style={styles.rowTitle}>{a.text}</span>
                      {sub ? <span style={styles.rowSub}>{sub}</span> : null}
                    </span>
                    {verb ? <span style={styles.actionBtn}>{verb}</span> : <span aria-hidden="true" style={styles.chev}>›</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Opening soon stays hidden when nothing is opening. */}
        {showOpenings ? (
          <div style={{ ...styles.zone, ...styles.zoneFill }}>
            <div style={styles.zoneHead}>
              <p style={styles.zoneLabel}>Opening soon · {summary.openingSoon.length}</p>
              <Link to="/opening-soon" style={styles.zoneLink}>See all ›</Link>
            </div>
            <div style={{ ...styles.panel, flex: 1 }} data-stagger="">
              {summary.openingSoon.slice(0, 4).map((loc) => {
                const pct = loc.total ? Math.round((loc.done / loc.total) * 100) : 0;
                const late = (loc.overdue ?? 0) + (loc.timelineOverdue ?? 0);
                return (
                  <button key={loc.id} data-row="" style={styles.openRow} onClick={() => handleOpeningClick(loc)}>
                    {canOpenChecklist ? (
                      <Ring pct={pct} />
                    ) : (
                      <span style={styles.daysBox}><b style={{ fontSize: 15 }}>{loc.daysOut}</b><span style={{ fontSize: 9, fontWeight: 800 }}>DAYS</span></span>
                    )}
                    <span style={styles.rowText}>
                      <span style={{ ...styles.rowTitle, fontWeight: 700 }}>{loc.brandName} · {loc.name}</span>
                      <span style={styles.rowSub}>Opens {fmtDay(loc.openingDate)} · {loc.daysOut} days out</span>
                    </span>
                    {canOpenChecklist && late > 0 ? <Pill tone="red">{late} late</Pill> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div style={{ ...styles.zone, ...styles.zoneFill }}>
          <div style={styles.zoneHead}>
            <p style={styles.zoneLabel}>This week</p>
            <Link to="/calendar" style={styles.zoneLink}>Calendar ›</Link>
          </div>
          <div style={styles.panel} data-stagger="">
            {summary.thisWeek.length === 0 ? (
              <p style={styles.emptyNote}>Nothing scheduled in the next seven days.</p>
            ) : (
              summary.thisWeek.slice(0, 3).map((e) => (
                <button
                  key={e.id}
                  data-row=""
                  data-marked={e.mine ? '' : undefined}
                  style={{ ...styles.attentionRow, ...(e.mine ? styles.attentionRowMine : {}) }}
                  onClick={() => navigate(e.to)}
                >
                  <span style={styles.weekDay}>
                    {new Date(e.dateTime).toLocaleDateString([], { weekday: 'short', day: 'numeric' }).toUpperCase()}
                  </span>
                  <span style={styles.rowText}>
                    <span style={styles.rowTitleOne} title={e.title}>{e.title}</span>
                    {e.where ? <span style={styles.rowSub}>{e.where}</span> : null}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* What's been done lately. */}
        <div style={{ ...styles.zone, ...styles.zoneFill }}>
          <p style={styles.zoneLabel}>Recent</p>
          <div style={styles.panel} data-stagger="">
            {summary.recent.length === 0 ? (
              <p style={styles.emptyNote}>No recent sign-offs.</p>
            ) : (
              summary.recent.slice(0, 3).map((r) => (
                <div key={r.id} style={styles.recentRow}>
                  <span style={{ ...styles.dot, background: 'var(--success)' }} />
                  <span style={styles.rowText}>
                    <span style={styles.rowTitleOne} title={r.text}>{r.text}</span>
                    {r.where ? <span style={styles.rowSub}>{r.where}</span> : null}
                  </span>
                  <span style={styles.recentWhen}>{fmtDay(r.at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      {requestTarget ? (
        <RequestAccessModal target={requestTarget} onSubmit={submitRequest} onClose={() => setRequestTarget(null)} />
      ) : null}
      {dialogNode}
    </div>
  );
}

// The verbs a "waiting on you" row can lead with.
const ACTIONS = ['Decide', 'Claim', 'Sign', 'Answer', 'Download'];


const styles = {
  page: { padding: '36px max(22px, min(44px, 4vw)) 48px', maxWidth: 1120 },
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(3, 96px)', gap: 8, alignSelf: 'flex-end' },
  tilesNarrow: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, width: '100%' },
  tile: { background: 'var(--bg-card)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' },
  tileValue: { fontSize: 24, fontWeight: 900, lineHeight: 1.05 },
  tileLabel: { fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase', color: 'var(--text-tertiary)' },

  // One row that slides sideways when there are more restaurants than fit
  // (28 Oct 2026), so a sixth never sits alone on a second line.
  tilesGrid: { display: 'flex', gap: 10, margin: '-4px -6px 16px', padding: '8px 6px 10px', overflowX: 'auto', scrollSnapType: 'x proximity', scrollbarWidth: 'thin' },
  tilesGridNarrow: { display: 'flex', gap: 9, margin: '-4px -22px 14px', padding: '8px 22px 10px', scrollPaddingLeft: 22, overflowX: 'auto', scrollSnapType: 'x proximity', scrollbarWidth: 'none' },
  brandTile: {
    position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5, minHeight: 96,
    flex: '0 0 calc((100% - 50px) / 5.4)', minWidth: 158, scrollSnapAlign: 'start',
    padding: '14px 14px 13px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: '4px solid',
    borderRadius: 12, textAlign: 'left', width: '100%',
  },
  brandName: { fontSize: 13, fontWeight: 900, letterSpacing: -0.1, textTransform: 'uppercase', lineHeight: 1.2, color: 'var(--text-primary)', paddingRight: 12 },
  brandMeta: { fontSize: 12, color: 'var(--text-tertiary)' },
  brandStat: { fontSize: 12, fontWeight: 700, marginTop: 'auto' },
  unseenDot: { position: 'absolute', top: 12, right: 12, width: 9, height: 9, borderRadius: 5, background: 'var(--danger)', boxShadow: '0 0 0 3px var(--bg-card)' },

  quad: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', columnGap: 20, alignItems: 'stretch' },
  quadNarrow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' },
  zoneFill: { display: 'flex', flexDirection: 'column' },
  // The list scrolls inside a box the row sizes, so Needs you always ends
  // level with Opening soon.
  needsScroll: { position: 'relative', flex: 1, minHeight: 260 },
  needsInner: { position: 'absolute', inset: 0, overflowY: 'auto' },
  needsPlain: {},
  needsInnerNarrow: { background: 'var(--bg-card)', borderRadius: 14, overflow: 'hidden auto', maxHeight: 380, display: 'flex', flexDirection: 'column' },
  recentRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' },
  recentWhen: { fontSize: 11.5, color: 'var(--text-tertiary)', flexShrink: 0 },
  zone: { marginBottom: 22, minWidth: 0 },
  zoneHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  zoneLabel: { fontSize: 11, fontWeight: 800, letterSpacing: 0.9, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '0 0 9px' },
  zoneLink: { fontSize: 12, fontWeight: 700, color: 'var(--neon)', textDecoration: 'none', background: 'none', border: 'none', padding: 0, whiteSpace: 'nowrap' },
  panel: { background: 'var(--bg-card)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  emptyNote: { fontSize: 13, color: 'var(--text-tertiary)', padding: '16px', margin: 0 },
  attentionHeader: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: 0, padding: '12px 16px 6px' },
  attentionRowMine: { boxShadow: 'inset 3px 0 0 var(--neon)', background: 'rgba(34,211,238,0.05)' },
  attentionRow: {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px',
    background: 'none', border: 'none', borderBottom: '1px solid var(--border)', borderRadius: 0, textAlign: 'left', cursor: 'pointer',
  },
  dot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  rowText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  rowTitle: { fontSize: 14, color: 'var(--text-primary)', overflowWrap: 'anywhere' },
  rowSub: { fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowTitleOne: { fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  actionBtn: { flexShrink: 0, fontSize: 12, fontWeight: 800, color: 'var(--neon-text)', background: 'var(--neon)', borderRadius: 7, padding: '5px 11px' },
  chev: { flexShrink: 0, color: 'var(--text-tertiary)', fontSize: 16 },
  weekDay: { fontSize: 11, fontWeight: 800, color: 'var(--neon)', width: 54, flexShrink: 0 },
  moreNote: { fontSize: 12, color: 'var(--text-tertiary)', margin: '9px 2px 0' },
  openRow: {
    display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '12px 16px',
    background: 'none', border: 'none', borderBottom: '1px solid var(--border)', borderRadius: 0, textAlign: 'left', cursor: 'pointer',
  },
  daysBox: { width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexShrink: 0, lineHeight: 1.1 },
};
