import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAccessRequests } from '../context/AccessRequestsContext';
import { useViewTracking } from '../context/ViewTrackingContext';
import { useAvailability } from '../context/AvailabilityContext';
import { useWorkOrders } from '../context/WorkOrdersContext';
import { useDialog } from '../hooks/useDialog';
import { nike } from '../theme/nike';
import Icon from '../components/Icon';

// Everything that used to be scattered loose in the sidebar now lives
// here as one consolidated list, matching mobile's Directory tab exactly
// — same items, same visibility rules, same grouping logic.
export default function DirectoryScreen() {
  const { dialogNode, notify } = useDialog();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { requests: accessRequests } = useAccessRequests();
  const { hasUnseenTimeOff } = useViewTracking();
  const { weeklyAvailability, getWeekStart } = useAvailability();
  const { getMyQueue } = useWorkOrders();
  const myWeekly = weeklyAvailability.find((w) => w.uid === user?.uid);
  const myWeeklyIsStale = !myWeekly || myWeekly.weekStartDate !== getWeekStart();
  const canPostAnnouncements = user?.role === 'admin' || user?.role === 'executive';
  const anyPendingAccessRequests = accessRequests.some((r) => r.status === 'pending');

  const items = [
    {
      key: 'availability',
      icon: 'calendar',
      title: 'Availability',
      subtitle: 'Set your weekly hours, request time off',
      badge: hasUnseenTimeOff() || myWeeklyIsStale,
      onClick: () => navigate('/availability'),
    },
    {
      key: 'workOrders',
      icon: 'signature',
      title: 'Signature Directory',
      subtitle: "Sign documents, track who's signed what",
      badge: getMyQueue().length > 0,
      onClick: () => navigate('/work-orders'),
    },
    {
      key: 'waresInventory',
      icon: 'box',
      title: 'Wares Inventory',
      subtitle: 'Coming soon',
      comingSoon: true,
      onClick: () => notify('Wares Inventory', "Not built yet — we'll be working on this soon."),
    },
    ...(canPostAnnouncements
      ? [
          {
            key: 'executiveNotes',
            icon: 'document',
            title: 'Executive Notes',
            subtitle: 'Meeting notes, connected to your Drive folder',
            onClick: () => navigate('/executive-notes'),
          },
          {
            key: 'overallAnalysis',
            icon: 'barChart',
            title: 'Expenses & Receipts',
            subtitle: 'Coming soon',
            comingSoon: true,
            onClick: () =>
              notify('Expenses & Receipts', "Not built yet — we'll be working on this soon."),
          },
          {
            key: 'announcement',
            icon: 'megaphone',
            title: 'New Announcement',
            subtitle: 'Post an update to the team',
            onClick: () => navigate('/announcements/new'),
          },
          {
            key: 'pendingRequests',
            icon: 'checkCircle',
            title: 'Pending Requests',
            subtitle: 'Approve or deny access requests',
            badge: anyPendingAccessRequests,
            onClick: () => navigate('/admin/pending-requests'),
          },
        ]
      : []),
  ];

  return (
    <div style={styles.page}>
      <h1 style={{ ...styles.title, ...nike.pageTitle }}>Directory</h1>
      <div style={styles.grid}>
        {items.map((item) => (
          <button key={item.key} data-card="" style={{ ...styles.card, ...nike.card }} onClick={item.onClick}>
            <div style={styles.iconCircle}>
              <Icon name={item.icon} color="var(--neon)" />
            </div>
            <div style={styles.textCol}>
              <div style={styles.cardTitleRow}>
                <span style={styles.cardTitle}>{item.title}</span>
                {item.comingSoon ? <span style={styles.soonPill}>SOON</span> : null}
              </div>
              <span style={styles.cardSubtitle}>{item.subtitle}</span>
            </div>
            {item.badge ? <span style={styles.badgeDot} /> : null}
          </button>
        ))}
      </div>
      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '28px max(22px, min(36px, 4vw))', maxWidth: 720 },
  title: { fontSize: 24, fontWeight: 700, margin: '0 0 20px' },
  grid: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    textAlign: 'left',
    width: '100%',
    position: 'relative',
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    background: 'rgba(34,211,238,0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textCol: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
  cardTitleRow: { display: 'flex', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.2 },
  cardSubtitle: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 },
  badgeDot: { position: 'absolute', top: 16, right: 16, width: 10, height: 10, borderRadius: 5, background: 'var(--danger)' },
  soonPill: {
    background: 'rgba(255,255,255,0.08)',
    color: 'var(--text-secondary)',
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 0.5,
    padding: '3px 6px',
    borderRadius: 6,
    textTransform: 'uppercase',
  },
};
