import React, { useEffect, useRef, useState } from 'react';
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
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import Pill from '../components/Pill';
import { CountUp, Ring } from '../components/Motion';

// Too narrow for two panels side by side (a half-width window on a laptop):
// the panels stack and the opening rows get room for their names (2 Nov 2026).
function useStacked() {
  const q = '(max-width: 1179px)';
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener?.('change', f);
    return () => m.removeEventListener?.('change', f);
  }, []);
  return on;
}

export default function HomeScreen() {
  const isNarrow = useIsNarrow();
  const stacked = useStacked() || isNarrow;
  const needsRef = useRef(null);
  const { dialogNode, notify } = useDialog();
  const { user, hasBrandAccess } = useAuth();
  const navigate = useNavigate();
  const { getByBrand } = useCustomLocations();
  const { hasUnseenForBrand } = useViewTracking();
  const { addRequest, hasPendingRequest } = useAccessRequests();
  const { hasNeedMatchingJob } = useEventRequests();
  const [requestTarget, setRequestTarget] = useState(null);
  // Which Hub update is opened out (Nov 2026: updates are one line until read).
  const [openPost, setOpenPost] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  // Escape closes the + New menu, like any menu on a Mac.
  useEffect(() => {
    if (!newOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setNewOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newOpen]);
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
      // Straight to the late items when there are any (2 Nov 2026).
      const late = (loc.overdue ?? 0) + (loc.timelineOverdue ?? 0);
      navigate(`/brand/${loc.brandId}/location/${loc.id}/opening-checklist` + (late > 0 && summary.worksChecklist ? '?show=overdue' : ''));
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

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // The four numbers (2 Nov 2026), now glass tiles (Nov 2026 redesign).
  // Always shown, zeros included: a number that disappears at zero reads as
  // missing rather than good news. Zero is grey. Each one opens something.
  const tiles = [
    summary.counts.overdue !== null
      ? { key: 'mine', n: summary.counts.overdue, label: 'Your late items', color: summary.counts.overdue > 0 ? 'var(--bad)' : 'var(--text-quaternary)', go: () => needsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), hint: 'Your own late items, in For you' }
      : null,
    summary.counts.unassigned !== null
      ? { key: 'unassigned', n: summary.counts.unassigned, label: 'Late, unassigned', color: summary.counts.unassigned > 0 ? 'var(--orange-fg)' : 'var(--text-quaternary)', go: summary.counts.unassignedTo ? () => navigate(summary.counts.unassignedTo) : null, hint: 'Late items with nobody assigned' }
      : null,
    { key: 'renewals', n: summary.counts.renewals, label: summary.counts.renewals === 1 ? 'Renewal due' : 'Renewals due', color: summary.counts.renewals > 0 ? 'var(--warn)' : 'var(--text-quaternary)', go: summary.counts.renewalsTo ? () => navigate(summary.counts.renewalsTo) : null, hint: 'Renewals due soon' },
    { key: 'week', n: summary.counts.thisWeek, label: 'This week', color: summary.counts.thisWeek > 0 ? 'var(--text-primary)' : 'var(--text-quaternary)', go: () => navigate('/calendar'), hint: 'The next seven days on the calendar' },
  ].filter(Boolean);

  // A row's little square on the left: its colour says what kind of thing
  // it is, the same colours as the status pills.
  // And a small picture of what kind of thing it is (Glass, Nov 2026).
  const rowGlyph = (a) => {
    const to = String(a.to ?? '');
    if (to.includes('operational-poc')) return 'phone';
    if (to.includes('opening-checklist')) return 'clipboard';
    if (to.includes('daily-checklists')) return 'checkCircle';
    if (to.includes('renewals')) return 'calendar';
    if (to.includes('catering') || to.includes('event-requests')) return 'utensils';
    if (to.includes('access-requests')) return 'lock';
    if (to.includes('expenses')) return 'creditCard';
    if (to.includes('device-requests')) return 'cpu';
    if (to.includes('work-orders') || to.includes('signature')) return 'signature';
    if (to.includes('availability')) return 'clock';
    if (to.includes('messages')) return 'message';
    if (to.includes('integration')) return 'plug';
    return null;
  };
  const rowIcon = (a) => {
    if (a.level === 'waiting') return { bg: 'var(--cyan-bg)', fg: 'var(--cyan-fg)' };
    if (a.level === 'overdue') return { bg: 'var(--red-bg)', fg: '#B42318' };
    if (a.level === 'soon' || a.level === 'assigned') return { bg: 'var(--amber-bg)', fg: 'var(--amber-fg)' };
    if (a.level === 'tagged') return { bg: 'var(--cyan-bg)', fg: '#0A7EA4' };
    return { bg: 'rgba(var(--ink-rgb), 0.06)', fg: 'var(--text-secondary)' };
  };

  // "+ New" (Nov 2026): the things you can start from anywhere, only the
  // ones your job allows. Each opens the page where it's done.
  const lvl = (col) => (user?.role === 'admin' ? 'all' : accessLevel(user, col));
  const newItems = [
    lvl('announcements') === 'post' || user?.role === 'admin' ? { label: 'Post an announcement', sub: 'To Home, a restaurant or everyone', to: '/announcements/new', icon: 'megaphone' } : null,
    lvl('calendar') !== 'none' ? { label: 'Add to the calendar', sub: 'An event, a deadline, a reminder', to: '/calendar', icon: 'calendar' } : null,
    lvl('availability') !== 'none' ? { label: 'Request time off', sub: 'Your manager decides', to: '/availability', icon: 'clock' } : null,
    lvl('expenses') !== 'none' ? { label: 'Add a receipt', sub: 'Photo it and code it', to: '/expenses', icon: 'creditCard' } : null,
    lvl('catering') !== 'none' ? { label: 'Log a catering enquiry', sub: 'One that came in by phone', to: '/catering', icon: 'utensils' } : null,
    lvl('deviceRequests') !== 'none' ? { label: 'Request a device', sub: 'Laptop, iPad or phone', to: '/device-requests', icon: 'cpu' } : null,
    lvl('systemsHelp') !== 'none' ? { label: 'Ask Systems Help', sub: 'Toast, R365, OpenTable', to: '/integration-requests', icon: 'plug' } : null,
  ].filter(Boolean);
  const recentCard = summary.recent.length > 0 ? (
            <section style={styles.card}>
              <h2 style={styles.cardTitle}>Recently signed off</h2>
              <div style={styles.list}>
                {summary.recent.slice(0, 3).map((r) => (
                  <button key={r.id} data-row="" style={styles.weekRow} onClick={() => navigate(r.to)}>
                    <span style={{ ...styles.rowDot, background: 'var(--success)', marginTop: 6 }} />
                    <span style={styles.rowText}>
                      <span style={styles.rowTitleOne} title={r.text}>{r.text}</span>
                      <span style={styles.rowSub}>{r.where} · {fmtDay(r.at)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
  ) : null;

  const newButton = newItems.length ? (
    <div style={{ position: 'relative' }}>
      <button data-primary="" style={styles.newBtn} onClick={() => setNewOpen((v) => !v)} aria-expanded={newOpen} aria-haspopup="menu">+ New</button>
      {newOpen ? (
        <>
          <div style={styles.menuCatch} onClick={() => setNewOpen(false)} />
          <div role="menu" style={styles.newMenu} data-reveal="">
            {newItems.map((m) => (
              <button key={m.to + m.label} role="menuitem" style={styles.newItem} onClick={() => { setNewOpen(false); navigate(m.to); }}>
                <span style={styles.newIcon}><Icon name={m.icon} size={17} color="var(--neon)" /></span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span style={styles.newItemLabel}>{m.label}</span>
                  <span style={styles.newItemSub}>{m.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  ) : null;

  return (
    <div style={isNarrow ? styles.pageNarrow : styles.page}>
      {/* Home, glass (Nov 2026 redesign, canvas board E2): a big greeting,
          one line per Hub update, four numbers, your work, then what's
          coming. The restaurants live in the sidebar on a computer and in
          their own card on a phone. The rules underneath are unchanged. */}
      <header style={styles.hero}>
        <div style={styles.heroTop}>
          <p style={styles.date}>{today}</p>
          {newButton}
        </div>
        <h1 style={isNarrow ? styles.greetingNarrow : styles.greeting}>{greeting}, {firstName}.</h1>
        <p style={styles.needLine}>
          {needCount ? (
            <span style={{ color: 'var(--neon)', fontWeight: 600 }}>{needCount} thing{needCount === 1 ? '' : 's'} need{needCount === 1 ? 's' : ''} you</span>
          ) : (
            'Nothing needs you right now.'
          )}
        </p>
      </header>

      <MySpaceCard user={user} />

      {pinned.length > 0 ? (
        <div style={styles.updates} data-stagger="">
          {pinned.map((post) => {
            const open = openPost === post.id;
            const firstLine = post.title || String(post.message ?? '').split('\n')[0];
            return (
              <div key={post.id} style={styles.updateWrap}>
                <button style={styles.updateRow} onClick={() => setOpenPost(open ? null : post.id)} aria-expanded={open}>
                  <span style={styles.updateLabel}>{post.homeOnly ? 'Hub update' : post.targetId === 'all' ? 'Everyone' : post.targetName ?? 'Update'}</span>
                  <span style={styles.updateText}>{firstLine}</span>
                  <span style={styles.updateRead}>{open ? 'Close' : 'Read'}</span>
                </button>
                {open ? (
                  <div style={{ marginTop: 10 }} data-reveal="">
                    <PostCard
                      post={post}
                      isNewest
                      onToggleLike={toggleLike}
                      onAddComment={addComment}
                      onToggleCommentLike={toggleCommentLike}
                      onDeletePost={deletePost}
                      onDeleteComment={deleteComment}
                    />
                    {user?.role === 'admin' || post.authorUid === user?.uid ? (
                      <button style={styles.unpin} onClick={() => unpin(post.id)}>Remove from Home</button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div style={isNarrow ? { ...styles.tiles, gridTemplateColumns: '1fr 1fr', gap: 10 } : styles.tiles} data-stagger="">
        {tiles.map((t) => (
          <button key={t.key} style={{ ...styles.tile, ...(isNarrow ? { padding: '14px 16px', borderRadius: 20, gap: 4 } : {}), cursor: t.go ? 'pointer' : 'default' }} onClick={() => t.go && t.go()} title={t.hint}>
            <CountUp value={t.n} style={{ ...styles.tileValue, ...(isNarrow ? { fontSize: 32 } : {}), color: t.color }} />
            <span style={styles.tileLabel}>{t.label}</span>
          </button>
        ))}
      </div>

      <div style={stacked ? styles.colsStacked : styles.cols}>
        {/* Left column: what needs you, then what got done lately - so on a
            computer the two columns end at about the same height. */}
        <div style={styles.side}>
        <section ref={needsRef} style={{ ...styles.card, ...styles.forYou, scrollMarginTop: 16 }}>
          <h2 style={styles.cardTitle}>For you</h2>
          {summary.attention.length === 0 ? <p style={styles.empty}>Nothing needs your attention.</p> : null}
          <div style={styles.list} data-stagger="">
            {summary.attention.map((a, i) => {
              if (a.level === 'header') return <p key={'h' + i} style={styles.groupLabel}>{a.text}</p>;
              if (a.level === 'unassigned') {
                return (
                  <button key={i} data-row="" style={styles.unassignedRow} onClick={() => navigate(a.to)}>
                    <span style={{ ...styles.rowIcon, background: 'var(--orange-bg)', color: 'var(--orange-fg)' }} aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6" /><path d="M17 15v6M14 18h6" /></svg>
                    </span>
                    <span style={styles.rowText}>
                      <span style={styles.rowTitle}>{a.text}</span>
                      <span style={styles.rowSub}>{a.where}</span>
                    </span>
                    <span style={styles.actionPill}>Assign</span>
                  </button>
                );
              }
              // A row waiting on you shows its action as a button (Decide,
              // Claim, Sign, Answer, Download); the rest open quietly.
              const parts = String(a.where ?? '').split(' · ');
              const verb = a.level === 'waiting' && ACTIONS.includes(parts[0]) ? parts[0] : null;
              const sub = verb ? parts.slice(1).join(' · ') : a.where;
              const ic = rowIcon(a);
              return (
                <button key={i} data-row="" data-marked={a.mine ? '' : undefined} style={styles.row} onClick={() => navigate(a.to)}>
                  <span style={{ ...styles.rowIcon, background: ic.bg, color: ic.fg }} aria-hidden="true">
                    {a.level === 'todo' ? <span style={styles.todoRing} /> : rowGlyph(a) ? <Icon name={rowGlyph(a)} size={17} color={ic.fg} /> : <span style={{ ...styles.rowDot, background: ic.fg }} />}
                  </span>
                  <span style={styles.rowText}>
                    <span style={styles.rowTitle}>{a.text}</span>
                    {sub ? <span style={styles.rowSub}>{sub}</span> : null}
                  </span>
                  {verb ? <span style={styles.actionPill}>{verb}</span> : <span aria-hidden="true" style={styles.chev}>›</span>}
                </button>
              );
            })}
          </div>
        </section>
        {stacked ? null : recentCard}
        </div>

        <div style={styles.side}>
          {/* On a phone there is no sidebar, so the restaurants get a card of
              their own here. A locked one asks for access, as before. */}
          {isNarrow ? (
            <section style={styles.card}>
              <h2 style={styles.cardTitle}>Restaurants</h2>
              {/* One line each, like a phone's settings list (Glass, Nov 2026). */}
              <div style={styles.restList}>
                {visibleBrands.map((item) => {
                  const allowed = hasBrandAccess(user, item.id);
                  const b = summary.byBrand[item.id];
                  const late = allowed && summary.worksChecklist ? b?.overdue ?? 0 : 0;
                  const pendingRequest = !allowed && user ? hasPendingRequest(user.email, 'brand', item.id) : false;
                  return (
                    <button key={item.id} data-row="" style={{ ...styles.restRow, opacity: allowed ? 1 : 0.6 }} onClick={() => handleCardClick(item, allowed)}>
                      <span style={{ ...styles.chipDot, background: brandColors[item.name] ?? '#A1A1AA' }} />
                      <span style={{ ...styles.chipName, flex: 1 }}>{item.name}</span>
                      {late > 0 ? <span style={styles.chipLate}>{late} late</span> : null}
                      {!allowed ? <RequestPill pending={pendingRequest} /> : <span aria-hidden="true" style={styles.chev}>›</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Opening soon stays hidden when nothing is opening. */}
          {showOpenings ? (
            <section style={styles.card}>
              <div style={styles.cardHead}>
                <h2 style={styles.cardTitle}>Openings</h2>
                <Link to="/opening-soon" style={styles.cardLink}>See all</Link>
              </div>
              <div style={styles.list} data-stagger="">
                {summary.openingSoon.slice(0, 4).map((loc) => {
                  const pct = loc.total ? Math.round((loc.done / loc.total) * 100) : 0;
                  const late = (loc.overdue ?? 0) + (loc.timelineOverdue ?? 0);
                  return (
                    <button key={loc.id} data-row="" style={styles.openRow} onClick={() => handleOpeningClick(loc)}>
                      <span style={styles.openTop}>
                        <span style={styles.openName}>{loc.brandName} · {loc.name}</span>
                        <span style={styles.openDays}>{loc.daysOut} days</span>
                      </span>
                      {canOpenChecklist ? (
                        <span style={styles.bar}><span style={{ ...styles.barFill, width: Math.max(2, pct) + '%' }} /></span>
                      ) : null}
                      <span style={styles.openSub}>
                        Opens {fmtDay(loc.openingDate)}{canOpenChecklist ? ' · ' + pct + '% ready' : ''}
                        {summary.worksChecklist && late > 0 ? <span style={{ color: 'var(--bad)', fontWeight: 600 }}> · {late} late{loc.unassigned ? ', ' + loc.unassigned + ' unassigned' : ''}</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section style={styles.card}>
            <div style={styles.cardHead}>
              <h2 style={styles.cardTitle}>This week</h2>
              <Link to="/calendar" style={styles.cardLink}>Calendar</Link>
            </div>
            {summary.thisWeek.length === 0 ? (
              <p style={styles.empty}>Nothing scheduled in the next seven days.</p>
            ) : (
              <div style={styles.list} data-stagger="">
                {summary.thisWeek.slice(0, 4).map((e) => (
                  <button key={e.id} data-row="" data-marked={e.mine ? '' : undefined} style={styles.weekRow} onClick={() => navigate(e.to)}>
                    <span style={styles.weekDay}>{new Date(e.dateTime).toLocaleDateString([], { weekday: 'short', day: 'numeric' })}</span>
                    <span style={styles.rowText}>
                      <span style={styles.rowTitleOne} title={e.title}>{e.title}</span>
                      {e.where ? <span style={styles.rowSub}>{e.where}</span> : null}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Restaurants you can't open yet aren't in the sidebar, so on a
              computer you ask for them here (on a phone, in the card above). */}
          {!isNarrow && visibleBrands.some((b) => !hasBrandAccess(user, b.id)) ? (
            <section style={styles.card}>
              <h2 style={styles.cardTitle}>Other restaurants</h2>
              <div style={styles.chips}>
                {visibleBrands.filter((b) => !hasBrandAccess(user, b.id)).map((item) => (
                  <button key={item.id} style={styles.chip} onClick={() => handleCardClick(item, false)}>
                    <span style={{ ...styles.chipDot, background: brandColors[item.name] ?? '#A1A1AA' }} />
                    <span style={styles.chipName}>{item.name}</span>
                    <RequestPill pending={user ? hasPendingRequest(user.email, 'brand', item.id) : false} />
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {stacked ? recentCard : null}
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


const glass = {
  background: 'var(--bg-card)', border: '1px solid var(--glass-edge)', borderRadius: 28, boxShadow: 'var(--shadow-md)',
};
const styles = {
  restList: { display: 'flex', flexDirection: 'column', marginTop: 4 },
  restRow: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 48, padding: '10px 4px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', borderRadius: 0, textAlign: 'left', fontFamily: 'inherit', color: 'var(--text-primary)', cursor: 'pointer' },
  page: { padding: '40px max(22px, min(48px, 4vw)) 56px', maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 20 },
  pageNarrow: { padding: '22px 16px 40px', display: 'flex', flexDirection: 'column', gap: 16 },
  hero: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 2 },
  heroTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  newBtn: { background: 'var(--ink)', color: 'var(--ink-text)', border: 'none', borderRadius: 999, padding: '11px 20px', minHeight: 44, fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },
  menuCatch: { position: 'fixed', inset: 0, zIndex: 40 },
  newMenu: {
    position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 41, width: 280, padding: 6,
    background: 'rgba(var(--paper-rgb), 0.92)', border: '1px solid var(--glass-edge)', borderRadius: 20,
    boxShadow: 'var(--shadow-lg)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)',
    display: 'flex', flexDirection: 'column',
  },
  newIcon: { width: 34, height: 34, borderRadius: 10, background: 'rgba(10,126,164,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  newItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', border: 'none', borderRadius: 14, background: 'none', textAlign: 'left', fontFamily: 'inherit', color: 'inherit', cursor: 'pointer' },
  newItemLabel: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' },
  newItemSub: { fontSize: 12.5, color: 'var(--text-tertiary)' },
  date: { margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-tertiary)' },
  greeting: { margin: 0, fontSize: 50, fontWeight: 800, letterSpacing: -1.6, lineHeight: 1.04, color: 'var(--text-primary)' },
  greetingNarrow: { margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: -1.1, lineHeight: 1.06, color: 'var(--text-primary)' },
  needLine: { margin: '2px 0 0', fontSize: 16, color: 'var(--text-tertiary)' },

  updates: { display: 'flex', flexDirection: 'column', gap: 10 },
  updateWrap: {},
  updateRow: {
    display: 'flex', alignItems: 'center', gap: 14, width: '100%', minHeight: 52, padding: '12px 18px', textAlign: 'left',
    background: 'rgba(var(--paper-rgb), 0.5)', border: '1px solid var(--glass-edge)', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
  },
  updateLabel: { fontSize: 12.5, fontWeight: 700, color: 'var(--neon)', flexShrink: 0 },
  updateText: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  updateRead: { fontSize: 14, fontWeight: 600, color: 'var(--neon)', flexShrink: 0 },
  unpin: { marginTop: 8, background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '6px 4px' },

  tiles: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 },
  tile: { ...glass, borderRadius: 24, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', fontFamily: 'inherit', color: 'inherit' },
  tileValue: { fontSize: 40, fontWeight: 800, letterSpacing: -1, lineHeight: 1 },
  tileLabel: { fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' },

  cols: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(300px, 1fr)', gap: 18, alignItems: 'start' },
  colsStacked: { display: 'flex', flexDirection: 'column', gap: 16 },
  side: { display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 },
  card: { ...glass, padding: '20px 22px', minWidth: 0 },
  forYou: { paddingBottom: 12 },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  cardTitle: { margin: '0 0 10px', fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: 'var(--text-primary)' },
  cardLink: { fontSize: 14, fontWeight: 600, color: 'var(--neon)', textDecoration: 'none' },
  list: { display: 'flex', flexDirection: 'column' },
  empty: { fontSize: 14, color: 'var(--text-tertiary)', margin: '4px 0 8px' },
  groupLabel: { fontSize: 13, fontWeight: 700, color: 'var(--text-tertiary)', margin: '14px 0 4px' },

  row: {
    display: 'flex', alignItems: 'center', gap: 14, width: '100%', minHeight: 56, padding: '10px 8px', textAlign: 'left',
    background: 'none', border: 'none', borderTop: '1px solid var(--border)', borderRadius: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
  },
  unassignedRow: {
    display: 'flex', alignItems: 'center', gap: 14, width: '100%', minHeight: 56, padding: '12px 12px', margin: '8px 0 4px', textAlign: 'left',
    background: 'var(--orange-bg)', border: '1px dashed rgba(194,65,12,0.35)', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
  },
  rowIcon: { width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  rowDot: { width: 9, height: 9, borderRadius: 5, flexShrink: 0, display: 'inline-block' },
  todoRing: { width: 12, height: 12, borderRadius: 6, border: '2px solid currentColor', boxSizing: 'border-box' },
  rowText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  rowTitle: { fontSize: 15.5, fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' },
  rowTitleOne: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowSub: { fontSize: 13, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  actionPill: { flexShrink: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink-text)', background: 'var(--ink)', borderRadius: 999, padding: '8px 16px' },
  chev: { flexShrink: 0, color: 'var(--text-tertiary)', fontSize: 18 },

  openRow: {
    display: 'flex', flexDirection: 'column', gap: 7, width: '100%', padding: '12px 4px', textAlign: 'left',
    background: 'none', border: 'none', borderTop: '1px solid var(--border)', borderRadius: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
  },
  openTop: { display: 'flex', justifyContent: 'space-between', gap: 10 },
  openName: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', minWidth: 0 },
  openDays: { fontSize: 13, color: 'var(--text-tertiary)', flexShrink: 0 },
  bar: { display: 'block', height: 8, borderRadius: 4, background: 'rgba(var(--ink-rgb), 0.08)', overflow: 'hidden' },
  barFill: { display: 'block', height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, var(--neon), var(--neon))' },
  openSub: { fontSize: 13, color: 'var(--text-tertiary)' },

  weekRow: {
    display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', padding: '11px 4px', textAlign: 'left',
    background: 'none', border: 'none', borderTop: '1px solid var(--border)', borderRadius: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
  },
  weekDay: { width: 58, flexShrink: 0, fontSize: 13, fontWeight: 700, color: 'var(--neon)', paddingTop: 2 },

  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: {
    display: 'flex', alignItems: 'center', gap: 9, minHeight: 44, padding: '8px 14px 8px 10px', borderRadius: 999,
    background: 'rgba(var(--paper-rgb), 0.7)', border: '1px solid var(--glass-edge)', fontFamily: 'inherit', color: 'inherit', cursor: 'pointer',
  },
  chipDot: { width: 20, height: 20, borderRadius: 10, flexShrink: 0, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.7)' },
  chipName: { fontSize: 14, fontWeight: 600 },
  chipLate: { fontSize: 12.5, fontWeight: 600, color: 'var(--bad)' },
};
