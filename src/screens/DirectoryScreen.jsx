import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { hasFeature } from '../data/mockData';
import { useAccessRequests } from '../context/AccessRequestsContext';
import { useViewTracking } from '../context/ViewTrackingContext';
import { useAvailability } from '../context/AvailabilityContext';
import { useWorkOrders } from '../context/WorkOrdersContext';
import { useExpenses } from '../context/ExpensesContext';
import { useIntegrationRequests } from '../context/IntegrationRequestsContext';
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
  const { getMyQueue, hasUndownloadedComplete } = useWorkOrders();
  const { hasUncollectedReport } = useExpenses();
  const { hasUnseen: hasUnseenIntegration } = useIntegrationRequests();
  const myWeekly = weeklyAvailability.find((w) => w.uid === user?.uid);
  const myWeeklyIsStale = !myWeekly || myWeekly.weekStartDate !== getWeekStart();
  const canPostAnnouncements = user?.role === 'admin' || user?.role === 'executive';
  const anyPendingAccessRequests = accessRequests.some((r) => r.status === 'pending');

  const GROUPS = [
    { label: 'Day to day', keys: ['catering', 'availability', 'expenses', 'waresInventory'] },
    { label: 'Requests', keys: ['integrationRequests', 'deviceRequests', 'invoices', 'workOrders'] },
    { label: 'Reference', keys: ['hr', 'emergency'] },
    { label: 'Executive', keys: ['executiveNotes', 'announcement', 'pendingRequests'] },
  ];

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
      badge: getMyQueue().length > 0 || hasUndownloadedComplete(),
      onClick: () => navigate('/work-orders'),
    },
    {
      // Not behind feature access: anyone should be able to say a till is
      // behaving oddly, and whoever handles them is a manager themselves.
      key: 'integrationRequests',
      icon: 'plug',
      title: 'Systems Help',
      subtitle: 'Toast, R365 and OpenTable — changes and help',
      badge: hasUnseenIntegration(),
      onClick: () => navigate('/integration-requests'),
    },
    {
      key: 'catering',
      icon: 'utensils',
      title: 'Catering & Events',
      subtitle: 'Enquiries, and where each one stands',
      onClick: () => navigate('/catering'),
    },
    {
      key: 'emergency',
      icon: 'phone',
      title: 'Emergency Procedures',
      subtitle: 'What to do when something happens',
      onClick: () => navigate('/emergency'),
    },
    {
      key: 'hr',
      icon: 'clipboard',
      title: 'HR',
      subtitle: 'Forms, and who to talk to',
      onClick: () => navigate('/hr'),
    },
    {
      key: 'deviceRequests',
      icon: 'cpu',
      title: 'Device Requests',
      subtitle: 'Ask for a new laptop, iPad or phone',
      onClick: () => navigate('/device-requests'),
    },
    {
      key: 'invoices',
      icon: 'creditCard',
      title: 'Invoices',
      subtitle: 'Send one for paying, or see where yours are',
      onClick: () => navigate('/invoices'),
    },
    {
      key: 'expenses',
      badge: hasUncollectedReport(),
      icon: 'barChart',
      title: 'Expenses & Receipts',
      subtitle: 'Travel and business expenses',
      onClick: () => navigate('/expenses'),
    },
    {
      key: 'waresInventory',
      icon: 'box',
      title: 'Wares Inventory',
      subtitle: 'Tracking wares across locations',
      onClick: () => navigate('/wares-inventory'),
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
      <div>
        {/* Filtered once here rather than at each tile - the array is built
            with conditional pushes, so one filter at the render is the only
            place that catches every route in. */}
        {(() => {
          // Filtered once here rather than at each tile - the array is built
          // with conditional pushes, so one filter at the render is the only
          // place that catches every route in.
          const visible = items.filter((item) => {
            // Tile keys are camelCase here and the feature list uses its own
            // names, so they are mapped rather than renamed. A tile absent
            // from the map is ungated and always shown.
            const feature = {
              availability: 'availability',
              workOrders: 'workOrders',
              expenses: 'expenses',
              support: 'support',
            }[item.key];
            // Systems Help is deliberately not in that map: anyone should be
            // able to say a till is behaving oddly.
            if (!feature) return true;
            return hasFeature(user, feature);
          });

          const card = (item) => (
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
          );

          const grouped = GROUPS.map((g) => ({
            label: g.label,
            tiles: g.keys.map((k) => visible.find((i) => i.key === k)).filter(Boolean),
          })).filter((g) => g.tiles.length > 0);

          // Anything new that nobody has put in a group yet still appears,
          // rather than quietly vanishing from the page.
          const placed = new Set(GROUPS.flatMap((g) => g.keys));
          const rest = visible.filter((i) => !placed.has(i.key));
          if (rest.length > 0) grouped.push({ label: 'Everything else', tiles: rest });

          return grouped.map((g) => (
            <div key={g.label} style={styles.group}>
              <p style={styles.groupLabel}>{g.label}</p>
              <div style={styles.grid}>{g.tiles.map(card)}</div>
            </div>
          ));
        })()}
      </div>
      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '28px max(22px, min(36px, 4vw))', maxWidth: 720 },
  title: { fontSize: 24, fontWeight: 700, margin: '0 0 20px' },
  group: { marginBottom: 24 },
  groupLabel: { fontSize: 10, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '0 0 10px' },
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
