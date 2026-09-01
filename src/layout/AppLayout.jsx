import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useViewTracking } from '../context/ViewTrackingContext';
import { useAvailability } from '../context/AvailabilityContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useSupportRequests } from '../context/SupportRequestsContext';
import { useWorkOrders } from '../context/WorkOrdersContext';
import { useEventRequests } from '../context/EventRequestsContext';
import { brands } from '../data/mockData';
import Icon from '../components/Icon';
import BottomBar from './BottomBar';
import { useIsNarrow } from '../hooks/useIsNarrow';

// Mirrors mobile's bottom-tab structure: Home, Messages, Master Calendar,
// Directory, Profile — everything else (Availability, Support,
// Signature Directory, admin tools, account management) now lives inside
// the Directory or Profile screens instead of being loose in the
// sidebar.
export default function AppLayout({ children }) {
  const isNarrow = useIsNarrow();
  const { user, hasBrandAccess } = useAuth();
  const { unreadCount } = useChat();
  const { hasUnseenTimeOff, hasUnseenCalendar } = useViewTracking();
  const { weeklyAvailability, getWeekStart } = useAvailability();
  const myWeekly = weeklyAvailability.find((w) => w.uid === user?.uid);
  const myWeeklyIsStale = !myWeekly || myWeekly.weekStartDate !== getWeekStart();
  const { hasNeedMatchingJob } = useEventRequests();
  const { getByBrand } = useCustomLocations();
  const { requests: supportRequests } = useSupportRequests();
  const { getMyQueue } = useWorkOrders();
  const isAdmin = user?.role === 'admin';
  const isExecutive = user?.role === 'executive';

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
  const directoryNeedsAttention = myWeeklyIsStale || hasUnseenTimeOff() || getMyQueue().length > 0;
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
        <div style={styles.narrowContent}>{children}</div>
        <BottomBar
          homeBadge={anyEventNeedsMyJob}
          messagesBadge={unreadCount > 0}
          calendarBadge={anyCalendarUnseen}
          directoryBadge={directoryNeedsAttention}
          profileBadge={profileNeedsAttention}
        />
      </div>
    );
  }

  return (
    <div style={styles.window}>
      <div style={styles.sidebar}>
        <div style={styles.dragArea} />

        <div style={styles.brandRow}>
          <div style={styles.badge}>CIG</div>
          <span style={styles.brandName}>Executive Hub</span>
        </div>

        <nav style={styles.nav}>
          <NavLink to="/" end style={navItemStyle}>
            <div style={styles.navItemRow}>
              <div style={styles.navItemLabel}>
                <Icon name="home" size={16} color="#FFFFFF" />
                <span>Home</span>
              </div>
              {anyEventNeedsMyJob ? <span style={styles.navDot} /> : null}
            </div>
          </NavLink>
          <NavLink to="/messages" style={navItemStyle}>
            <div style={styles.navItemRow}>
              <div style={styles.navItemLabel}>
                <Icon name="message" size={16} color="#FFFFFF" />
                <span>Messages</span>
              </div>
              {unreadCount > 0 ? <span style={styles.navDot} /> : null}
            </div>
          </NavLink>
          <NavLink to="/calendar" style={navItemStyle}>
            <div style={styles.navItemRow}>
              <div style={styles.navItemLabel}>
                <Icon name="calendar" size={16} color="#FFFFFF" />
                <span>Master Calendar</span>
              </div>
              {anyCalendarUnseen ? <span style={styles.navDot} /> : null}
            </div>
          </NavLink>
          <NavLink to="/directory" style={navItemStyle}>
            <div style={styles.navItemRow}>
              <div style={styles.navItemLabel}>
                <Icon name="grid" size={16} color="#FFFFFF" />
                <span>Directory</span>
              </div>
              {directoryNeedsAttention ? <span style={styles.navDot} /> : null}
            </div>
          </NavLink>
        </nav>

        <div style={styles.sidebarFooter}>
          <NavLink to="/profile" style={styles.userRow}>
            {user?.photoUrl ? (
              <img src={user.photoUrl} alt="" style={styles.avatarImage} />
            ) : (
              <div style={styles.avatar}>{user?.name?.[0]?.toUpperCase() ?? '?'}</div>
            )}
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={styles.userName}>{user?.name}</div>
              <div style={styles.userRole}>{isAdmin ? 'Admin' : isExecutive ? 'Executive' : 'Manager'}</div>
            </div>
            {profileNeedsAttention ? <span style={styles.navDot} /> : null}
          </NavLink>
        </div>
      </div>

      <div style={styles.content}>{children}</div>
    </div>
  );
}

const styles = {
  window: { display: 'flex', height: '100vh' },
  narrowWindow: { height: '100vh', background: 'var(--bg-window)' },
  // Bottom padding clears the floating bar: its height, its 24px offset,
  // and the home button poking out of the top.
  narrowContent: {
    height: '100dvh',
    overflow: 'auto',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingBottom: 'calc(130px + env(safe-area-inset-bottom, 0px))',
  },
  sidebar: {
    width: 232,
    background: 'var(--bg-sidebar)',
    borderRight: 'none',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  dragArea: { height: 30, WebkitAppRegion: 'drag' },
  brandRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '4px 18px 20px' },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: 'var(--neon)',
    color: 'var(--neon-text)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 0.3,
  },
  brandName: { fontSize: 13, fontWeight: 900, color: '#FFFFFF', letterSpacing: 0.2, textTransform: 'uppercase' },
  nav: { flex: 1, padding: '2px 12px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' },
  navItem: {
    display: 'block',
    padding: '9px 12px',
    borderRadius: 10,
    fontSize: 12.5,
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textDecoration: 'none',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  navItemActive: { background: 'var(--bg-card)', color: 'var(--neon)', fontWeight: 900 },
  navItemRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  navItemLabel: { display: 'flex', alignItems: 'center', gap: 10 },
  navDot: { width: 7, height: 7, borderRadius: 4, background: 'var(--danger)', flexShrink: 0 },
  sidebarFooter: { padding: 14, borderTop: '1px solid var(--border)' },
  userRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    textDecoration: 'none',
    padding: '6px 4px',
    borderRadius: 10,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    background: 'var(--accent)',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: 'var(--shadow-sm)',
  },
  avatarImage: { width: 30, height: 30, borderRadius: 15, objectFit: 'cover', flexShrink: 0 },
  userName: { fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  userRole: { fontSize: 11, color: 'var(--text-tertiary)' },
  content: { flex: 1, overflow: 'auto', background: 'var(--bg-window)' },
};
