import ViewAsBar from '../components/ViewAsBar';
import React, { useLayoutEffect, useRef, useState } from 'react';
import UpdateBanner from '../components/UpdateBanner';
import NotificationsPanel, { NotificationsBell } from '../components/NotificationsPanel';
import { NavLink, useLocation } from 'react-router-dom';
import { Toaster, prefersReducedMotion } from '../components/Motion';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useViewTracking } from '../context/ViewTrackingContext';
import { useAvailability } from '../context/AvailabilityContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useSupportRequests } from '../context/SupportRequestsContext';
import { useWorkOrders } from '../context/WorkOrdersContext';
import { useEventRequests } from '../context/EventRequestsContext';
import { useAccessRequests } from '../context/AccessRequestsContext';
import { useExpenses } from '../context/ExpensesContext';
import { brands } from '../data/mockData';
import Icon from '../components/Icon';
import BottomBar from './BottomBar';
import { useIsNarrow } from '../hooks/useIsNarrow';
import { PageWidthContext, useMeasuredWidth, useSlimSidebar } from '../hooks/usePageWidth';
import { useHomeSummary } from '../hooks/useHomeSummary';
import { brandColors } from '../theme/colors';

// Mirrors mobile's bottom-tab structure: Home, Messages, Master Calendar,
// Directory, Profile — everything else (Availability, Support,
// Signature Directory, admin tools, account management) now lives inside
// the Directory or Profile screens instead of being loose in the
// sidebar.
export default function AppLayout({ children }) {
  const isNarrow = useIsNarrow();
  const slim = useSlimSidebar();
  // Half-screen windows (Nov 2026): the sidebar is a slim strip of icons and
  // restaurant dots, and slides out in full when you point at it or click it.
  // `shown` puts the full sidebar in place (over the strip, the same size);
  // `flyout` then widens it. Closing narrows it back first, then swaps the
  // strip back in - one surface the whole time, so nothing peeks through.
  const [flyout, setFlyoutState] = useState(false);
  const [shown, setShown] = useState(false);
  const timers = useRef({});
  const setFlyout = (open, delay = 0) => {
    const t = timers.current;
    clearTimeout(t.intent);
    t.intent = setTimeout(() => {
      clearTimeout(t.swap);
      if (open) {
        setShown(true);
        // Next frame, so it grows from the strip's width.
        requestAnimationFrame(() => requestAnimationFrame(() => setFlyoutState(true)));
      } else {
        setFlyoutState(false);
        t.swap = setTimeout(() => setShown(false), 300);
      }
    }, delay);
  };
  const [notifOpen, setNotifOpen] = useState(false);
  // Each page settles in when you arrive on it (28 Oct 2026). The page itself
  // is animated in place - nothing is re-mounted, so no page loses its state.
  const { pathname } = useLocation();
  const contentRef = useRef(null);
  const pageWidth = useMeasuredWidth(contentRef);
  useLayoutEffect(() => { if (shown) setFlyout(false); }, [pathname]);
  useLayoutEffect(() => {
    // A new page starts at the top, not wherever the last one was scrolled to.
    if (contentRef.current) contentRef.current.scrollTop = 0;
    const page = contentRef.current?.lastElementChild;
    if (!page || !page.animate || prefersReducedMotion()) return;
    // Movement only, no fading: a fade on a section would switch off the
    // glass inside it until the fade finished (Glass, Nov 2026).
    // The page's own sections rise in one after another, the same way Home
    // does - header first, then each block a fraction of a second later.
    // Pop-ups and anything pinned in place are left alone.
    const parts = [...page.children].filter((el) => {
      const pos = getComputedStyle(el).position;
      return pos !== 'fixed' && pos !== 'sticky' && !el.hasAttribute('data-modal');
    });
    const targets = parts.length > 1 ? parts.slice(0, 10) : [page];
    targets.forEach((el, i) =>
      el.animate(
        [{ transform: 'translateY(10px)' }, { transform: 'none' }],
        { duration: 460, delay: Math.min(i, 7) * 40, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' }
      )
    );
  }, [pathname]);
  const { user, hasBrandAccess, hasLocationAccess } = useAuth();
  const summary = useHomeSummary();
  const { unreadCount } = useChat();
  const { hasUnseenTimeOff, hasUnseenCalendar } = useViewTracking();
  const { weeklyAvailability, getWeekStart } = useAvailability();
  const myWeekly = weeklyAvailability.find((w) => w.uid === user?.uid);
  // Only until the usual week is set once - it carries forward, so there is
  // no Monday reminder any more.
  const myWeeklyIsStale = !myWeekly;
  const { hasNeedMatchingJob } = useEventRequests();
  const { getByBrand } = useCustomLocations();
  const { requests: supportRequests } = useSupportRequests();
  const { getMyQueue, hasUndownloadedComplete } = useWorkOrders();
  const isAdmin = user?.role === 'admin';
  const isExecutive = user?.role === 'executive';
  const { requests: accessRequests } = useAccessRequests();
  const { hasUncollectedReport } = useExpenses();

  const anyEventNeedsMyJob =
    !!user?.job &&
    brands.some((b) => {
      const locationIds = [...b.locations.filter((l) => l.status === 'active').map((l) => l.id), ...getByBrand(b.id).map((l) => l.id)];
      return hasNeedMatchingJob(locationIds, user.job, user.uid);
    });

  const visibleBrands = brands.filter((b) => hasBrandAccess(user, b.id));
  const anyCalendarUnseen = visibleBrands.some((b) =>
    hasUnseenCalendar(b.id, [...b.locations.map((l) => l.id), ...getByBrand(b.id).map((l) => l.id)])
  );

  // Same formulas as mobile's BottomBar badge logic — one aggregate dot
  // per tab, not a badge per item inside it.
  // Pending access requests were missing: the Pending Requests tile inside
  // Directory carried its own badge, but nothing told you to open Directory
  // in the first place. A dot has to lead the whole way to the thing.
  const anyPendingAccess =
    isAdmin && accessRequests.some((r) => r.status === 'pending');
  const directoryNeedsAttention =
    myWeeklyIsStale ||
    hasUnseenTimeOff() ||
    getMyQueue().length > 0 ||
    hasUndownloadedComplete() ||
    hasUncollectedReport() ||
    anyPendingAccess;
  const profileNeedsAttention = isAdmin && supportRequests.some((r) => r.status !== 'completed');

  const navItemStyle = ({ isActive }) => ({
    ...styles.navItem,
    ...(isActive ? styles.navItemActive : {}),
  });

  // Below the breakpoint the sidebar is replaced by the same notched bar
  // the iPhone uses - a phone browser gets phone navigation. The packaged
  // Mac app never crosses this, so its layout is untouched.
  if (isNarrow) {
    return (
      <div style={styles.narrowWindow}>
        <div style={styles.narrowContent} ref={contentRef}>
          <div style={styles.narrowBanner}>
            <UpdateBanner />
          </div>
          <ViewAsBar />
          <PageWidthContext.Provider value={pageWidth}>{children}</PageWidthContext.Provider>
        </div>
        <NotificationsBell floating onClick={() => setNotifOpen(true)} />
        <BottomBar
          homeBadge={anyEventNeedsMyJob}
          messagesBadge={unreadCount > 0}
          calendarBadge={anyCalendarUnseen}
          directoryBadge={directoryNeedsAttention}
          profileBadge={profileNeedsAttention}
        />
        {notifOpen ? <NotificationsPanel onClose={() => setNotifOpen(false)} /> : null}
        <Toaster bottom={130} />
      </div>
    );
  }

  const navItem = (to, icon, label, dot, end = false) => (
    <NavLink to={to} end={end} style={navItemStyle}>
      {({ isActive }) => (
        <div style={styles.navItemRow}>
          <div style={styles.navItemLabel}>
            <span style={{ display: 'flex', color: isActive ? 'var(--neon)' : 'var(--text-secondary)' }}><Icon name={icon} size={18} /></span>
            <span>{label}</span>
          </div>
          {dot ? <span style={styles.navDot} /> : null}
        </div>
      )}
    </NavLink>
  );

  const fullSidebar = (
      <div style={slim ? { ...styles.sidebar, ...styles.flyoutPanel } : styles.sidebar} data-flyout={slim ? '' : undefined}>
        <div style={styles.dragArea} />

        <div style={styles.brandRow}>
          <div style={styles.badge}>CIG</div>
          <span style={styles.brandName}>Executive Hub</span>
        </div>

        <nav style={styles.nav} aria-label="Main">
          {navItem('/', 'home', 'Home', anyEventNeedsMyJob, true)}
          {navItem('/messages', 'message', 'Messages', unreadCount > 0)}
          {navItem('/calendar', 'calendar', 'Master Calendar', anyCalendarUnseen)}
          {navItem('/directory', 'grid', 'Directory', directoryNeedsAttention)}

          <SidebarRestaurants
            user={user}
            hasBrandAccess={hasBrandAccess}
            hasLocationAccess={hasLocationAccess}
            getByBrand={getByBrand}
            pathname={pathname}
            byBrand={summary.byBrand}
            worksChecklist={summary.worksChecklist}
          />
        </nav>

        <div style={styles.sidebarFooter}>
          <UpdateBanner />

          <div style={styles.profileRow}>
            <NavLink to="/profile" style={styles.userRow}>
            <div style={styles.avatar}>{user?.name?.[0]?.toUpperCase() ?? '?'}</div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={styles.userName}>{user?.name}</div>
              <div style={styles.userRole}>{isAdmin ? 'Admin' : isExecutive ? 'Executive' : 'Manager'}</div>
            </div>
            {profileNeedsAttention ? <span style={styles.navDot} /> : null}
            </NavLink>
            <NotificationsBell onClick={() => setNotifOpen(true)} />
          </div>
        </div>
      </div>
  );

  return (
    <div style={styles.window}>
      {/* Glass sidebar (Nov 2026): a frosted panel floating over the page,
          the four main places, then every restaurant you can open. */}
      {slim ? (
        // The rest of the page softly blurs while the sidebar is out.
        <div style={{ ...styles.scrim, ...(flyout ? styles.scrimOn : {}) }} onClick={() => setFlyout(false)} aria-hidden="true" />
      ) : null}
      {slim ? (
        <div
          style={styles.railWrap}
          onMouseEnter={() => setFlyout(true, 70)}
          onMouseLeave={() => setFlyout(false, 140)}
          onFocus={() => setFlyout(true)}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFlyout(false); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setFlyout(false); }}
        >
          <SlimRail
            hidden={shown}
            onOpen={() => setFlyout(true)}
            user={user}
            hasBrandAccess={hasBrandAccess}
            byBrand={summary.byBrand}
            worksChecklist={summary.worksChecklist}
            dots={{ home: anyEventNeedsMyJob, messages: unreadCount > 0, calendar: anyCalendarUnseen, directory: directoryNeedsAttention, profile: profileNeedsAttention }}
            onBell={() => setNotifOpen(true)}
          />
          {shown ? (
            <div style={{ ...styles.flyout, ...(flyout ? styles.flyoutOpen : styles.flyoutShut) }}>
              {fullSidebar}
            </div>
          ) : null}
        </div>
      ) : (
        fullSidebar
      )}

      <div style={styles.content} ref={contentRef}>
        <ViewAsBar />
        <PageWidthContext.Provider value={pageWidth}>{children}</PageWidthContext.Provider>
      </div>
      {notifOpen ? <NotificationsPanel onClose={() => setNotifOpen(false)} /> : null}
      <Toaster />
    </div>
  );
}

// The slim sidebar for half-screen windows (Nov 2026): the four main places
// as icons, a coloured dot per restaurant, and you at the bottom. Red dots
// stay. Pointing at it (or clicking it) slides the full sidebar out.
function SlimRail({ hidden, onOpen, user, hasBrandAccess, byBrand, worksChecklist, dots, onBell }) {
  const { pathname } = useLocation();
  const icon = (to, name, label, dot, end = false) => (
    <NavLink to={to} end={end} aria-label={label} title={label} style={({ isActive }) => ({ ...styles.railItem, ...(isActive ? styles.railItemActive : {}) })}>
      {({ isActive }) => (
        <>
          <Icon name={name} size={19} color={isActive ? 'var(--neon)' : 'var(--text-secondary)'} />
          {dot ? <span style={styles.railDot} /> : null}
        </>
      )}
    </NavLink>
  );
  const mine = brands.filter((b) => hasBrandAccess(user, b.id));
  return (
    <div style={{ ...styles.rail, visibility: hidden ? 'hidden' : 'visible' }}>
      <div style={styles.dragArea} />
      <button style={{ ...styles.badge, border: 'none', cursor: 'pointer', marginBottom: 14 }} onClick={onOpen} aria-label="Open the sidebar">CIG</button>
      {icon('/', 'home', 'Home', dots.home, true)}
      {icon('/messages', 'message', 'Messages', dots.messages)}
      {icon('/calendar', 'calendar', 'Master Calendar', dots.calendar)}
      {icon('/directory', 'grid', 'Directory', dots.directory)}
      {mine.length ? <div style={styles.railSep} /> : null}
      <div style={styles.railBrands}>
        {mine.map((b) => {
          const here = pathname === '/brand/' + b.id || pathname.startsWith('/brand/' + b.id + '/');
          const late = worksChecklist ? byBrand?.[b.id]?.overdue ?? 0 : 0;
          return (
            <NavLink key={b.id} to={'/brand/' + b.id} aria-label={b.name + (late ? ', ' + late + ' late' : '')} title={b.name} style={{ ...styles.railItem, ...(here ? styles.railItemActive : {}) }}>
              <span style={{ ...styles.brandDot, width: 12, height: 12, borderRadius: 6, boxShadow: 'inset 0 0 0 1px rgba(var(--ink-rgb), 0.28)', background: brandColors[b.name] ?? '#A1A1AA' }} />
              {late > 0 ? <span style={styles.railDot} /> : null}
            </NavLink>
          );
        })}
      </div>
      <div style={{ flex: 1 }} />
      <NotificationsBell onClick={onBell} />
      <NavLink to="/profile" aria-label="Profile" title="Profile" style={{ position: 'relative', marginTop: 8, textDecoration: 'none' }}>
        <div style={styles.avatar}>{user?.name?.[0]?.toUpperCase() ?? '?'}</div>
        {dots.profile ? <span style={styles.railDot} /> : null}
      </NavLink>
    </div>
  );
}

// Every restaurant this person can open, in the sidebar (Nov 2026). A
// restaurant opens out to its locations; the one you are in opens by itself,
// and the ones you open stay open on this computer. The late count is for
// the people who work the checklists, the same rule as Home.
function SidebarRestaurants({ user, hasBrandAccess, hasLocationAccess, getByBrand, pathname, byBrand, worksChecklist }) {
  const [open, setOpen] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sidebarOpenBrands') || '[]'); } catch { return []; }
  });
  const toggle = (id) => {
    const next = open.includes(id) ? open.filter((x) => x !== id) : [...open, id];
    setOpen(next);
    try { localStorage.setItem('sidebarOpenBrands', JSON.stringify(next)); } catch { /* private window */ }
  };
  const mine = brands.filter((b) => hasBrandAccess(user, b.id) && (!b.execOnly || hasBrandAccess(user, b.id)));
  if (!mine.length) return null;
  return (
    <div style={styles.restaurants}>
      <p style={styles.sectionLabel}>Restaurants</p>
      {mine.map((b) => {
        const locs = [
          ...b.locations.filter((l) => l.status === 'active'),
          ...getByBrand(b.id).map((l) => ({ id: l.id, name: l.name })),
        ].filter((l) => hasLocationAccess(user, b.id, l.id));
        const here = pathname === '/brand/' + b.id || pathname.startsWith('/brand/' + b.id + '/');
        const isOpen = here || open.includes(b.id);
        const late = worksChecklist ? byBrand?.[b.id]?.overdue ?? 0 : 0;
        return (
          <div key={b.id}>
            <div style={styles.brandItem}>
              <NavLink to={'/brand/' + b.id} end style={({ isActive }) => ({ ...styles.brandLink, ...(isActive ? styles.brandLinkActive : {}) })}>
                <span style={{ ...styles.brandDot, background: brandColors[b.name] ?? '#A1A1AA' }} />
                <span style={styles.brandLabel}>{b.name}</span>
                {late > 0 ? <span style={styles.lateCount}>{late}</span> : null}
              </NavLink>
              {locs.length > 1 ? (
                <button
                  style={styles.chevBtn}
                  onClick={() => toggle(b.id)}
                  aria-expanded={isOpen}
                  aria-label={(isOpen ? 'Hide ' : 'Show ') + b.name + ' locations'}
                >
                  <span style={{ display: 'inline-block', transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'none' }}>›</span>
                </button>
              ) : null}
            </div>
            {isOpen && locs.length > 1
              ? locs.map((l) => (
                  <NavLink
                    key={l.id}
                    to={'/brand/' + b.id + '/location/' + l.id}
                    style={() => {
                      const at = pathname === '/brand/' + b.id + '/location/' + l.id || pathname.startsWith('/brand/' + b.id + '/location/' + l.id + '/');
                      return { ...styles.locLink, ...(at ? styles.locLinkActive : {}) };
                    }}
                  >
                    {l.name}
                  </NavLink>
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  // The page sits on the colour wash; the sidebar floats on it as glass.
  window: { display: 'flex', height: '100vh', background: 'transparent', padding: 14, gap: 14, boxSizing: 'border-box', position: 'relative' },
  railWrap: { position: 'relative', flexShrink: 0, display: 'flex', zIndex: 60 },
  rail: {
    width: 64, background: 'var(--bg-sidebar)', border: '1px solid var(--glass-edge)', borderRadius: 22, boxShadow: 'var(--shadow-md)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0 0 14px', boxSizing: 'border-box', overflow: 'hidden',
  },
  railItem: { transition: 'background-color 0.22s ease, box-shadow 0.22s ease', position: 'relative', width: 42, height: 40, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', flexShrink: 0 },
  railItemActive: { background: 'var(--surface)', boxShadow: '0 2px 10px rgba(30,40,60,0.08)' },
  railDot: { position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 4, background: 'var(--danger)' },
  railSep: { width: 26, height: 1, background: 'var(--border)', margin: '10px 0' },
  railBrands: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, overflowY: 'auto', minHeight: 0 },
  // The full sidebar sliding out over the page from the slim strip.
  // The full sidebar out of the strip (Nov 2026): it starts exactly where
  // and as big as the strip, then widens - only its size animates. It is
  // glass like the strip (Brenner), frosted without the lens bend so it
  // stays smooth while it moves.
  flyout: { position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 61, overflow: 'hidden', boxShadow: '0 20px 60px rgba(20,24,32,0.30)', willChange: 'width' },
  flyoutOpen: { width: 256, borderRadius: 26, transition: 'width 0.36s cubic-bezier(0.22, 1, 0.36, 1), border-radius 0.36s' },
  flyoutShut: { width: 64, borderRadius: 22, boxShadow: 'none', transition: 'width 0.28s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.28s, box-shadow 0.28s' },
  flyoutPanel: { width: 256, height: '100%', boxSizing: 'border-box', borderRadius: 26 },
  scrim: { position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(20, 24, 32, 0.16)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', opacity: 0, pointerEvents: 'none', transition: 'opacity 0.3s ease' },
  scrimOn: { opacity: 1, pointerEvents: 'auto' },
  // dvh, not vh: the phone container has to shrink when the keyboard opens,
  // or the fixed bar strands itself mid-screen.
  narrowWindow: { height: '100dvh', background: 'transparent' },
  // Bottom padding clears the floating bar: its height, its 24px offset,
  // and the home button poking out of the top.
  narrowContent: {
    height: '100dvh',
    overflowX: 'hidden',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingBottom: 'calc(130px + env(safe-area-inset-bottom, 0px))',
  },
  sidebar: {
    width: 256,
    background: 'var(--bg-sidebar)',
    border: '1px solid var(--glass-edge)',
    borderRadius: 26,
    boxShadow: 'var(--shadow-md)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden',
  },
  dragArea: { height: 14, WebkitAppRegion: 'drag' },
  brandRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 20px 18px' },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: 'var(--ink)',
    color: 'var(--ink-text)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.3,
  },
  brandName: { fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' },
  nav: { flex: 1, padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' },
  navItem: {
    display: 'block',
    padding: '10px 12px',
    borderRadius: 14,
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textDecoration: 'none',
    transition: 'background-color 0.22s ease, color 0.22s ease, box-shadow 0.22s ease',
  },
  navItemActive: { background: 'var(--surface)', color: 'var(--text-primary)', boxShadow: '0 2px 10px rgba(30,40,60,0.08)' },
  navItemRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  navItemLabel: { display: 'flex', alignItems: 'center', gap: 10 },
  navDot: { width: 8, height: 8, borderRadius: 4, background: 'var(--danger)', flexShrink: 0 },
  restaurants: { marginTop: 18, display: 'flex', flexDirection: 'column', gap: 1 },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', margin: '0 12px 6px' },
  brandItem: { display: 'flex', alignItems: 'center', gap: 2 },
  brandLink: {
    flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12,
    fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none',
    transition: 'background-color 0.22s ease, box-shadow 0.22s ease',
  },
  brandLinkActive: { background: 'var(--surface)', boxShadow: '0 2px 10px rgba(30,40,60,0.08)' },
  brandDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0, boxShadow: 'inset 0 0 0 1px rgba(var(--ink-rgb), 0.12)' },
  brandLabel: { flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  lateCount: { fontSize: 11.5, fontWeight: 700, color: 'var(--bad)' },
  chevBtn: { width: 30, height: 30, border: 'none', borderRadius: 999, background: 'none', color: 'var(--text-tertiary)', fontSize: 17, fontWeight: 600, padding: 0, flexShrink: 0 },
  locLink: { display: 'block', padding: '7px 12px 7px 32px', borderRadius: 10, fontSize: 13.5, fontWeight: 500, color: 'var(--text-secondary)', textDecoration: 'none' },
  locLinkActive: { background: 'var(--surface)', color: 'var(--neon)', fontWeight: 700, boxShadow: '0 2px 10px rgba(30,40,60,0.08)' },
  narrowBanner: { padding: '10px 14px 0' },
  profileRow: { display: 'flex', alignItems: 'center', gap: 8 },
  sidebarFooter: { padding: 14, borderTop: '1px solid var(--border)' },
  userRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    textDecoration: 'none',
    padding: '6px 4px',
    borderRadius: 12,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    background: 'linear-gradient(135deg, #8EC5FC, #E0C3FC)',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarImage: { width: 34, height: 34, borderRadius: 17, objectFit: 'cover', flexShrink: 0 },
  userName: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  userRole: { fontSize: 12, color: 'var(--text-tertiary)' },
  // The page scrolls inside its own area, on the wash.
  content: { flex: 1, overflow: 'auto', background: 'var(--bg-window)', borderRadius: 26, minWidth: 0 },
};
