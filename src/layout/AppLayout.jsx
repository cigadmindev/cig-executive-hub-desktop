import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useViewTracking } from '../context/ViewTrackingContext';
import { useAvailability } from '../context/AvailabilityContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useAccessRequests } from '../context/AccessRequestsContext';
import { useSupportRequests, BRENNER_EMAIL } from '../context/SupportRequestsContext';
import { useWorkOrders } from '../context/WorkOrdersContext';
import { useEventRequests } from '../context/EventRequestsContext';
import { brands } from '../data/mockData';

export default function AppLayout({ children }) {
  const { user, logout, hasBrandAccess, deleteMyAccount, updateMyProfile } = useAuth();
  const { unreadCount } = useChat();
  const { hasUnseenTimeOff, hasUnseenCalendar } = useViewTracking();
  const { weeklyAvailability, getWeekStart } = useAvailability();
  const myWeekly = weeklyAvailability.find((w) => w.uid === user?.uid);
  const myWeeklyIsStale = !myWeekly || myWeekly.weekStartDate !== getWeekStart();
  const { hasNeedMatchingJob } = useEventRequests();
  const { getByBrand } = useCustomLocations();
  const { requests } = useAccessRequests();
  const { requests: supportRequests } = useSupportRequests();
  const { getMyQueue } = useWorkOrders();
  const anyEventNeedsMyJob =
    !!user?.job &&
    brands.some((b) => {
      const locationIds = [...b.locations.filter((l) => l.status === 'active').map((l) => l.id), ...getByBrand(b.id).map((l) => l.id)];
      return hasNeedMatchingJob(locationIds, user.job);
    });
  const isBrenner = user?.email === BRENNER_EMAIL;
  const isAdmin = user?.role === 'admin';
  const isExecutive = user?.role === 'executive';
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState('');
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const openProfileEdit = () => {
    setProfileNameDraft(user?.name ?? '');
    setProfilePhotoFile(null);
    setProfilePhotoPreview(null);
    setProfileEditOpen(true);
  };

  const handlePhotoPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfilePhotoFile(file);
    setProfilePhotoPreview(URL.createObjectURL(file));
  };

  const saveProfileEdit = async () => {
    setSavingProfile(true);
    try {
      await updateMyProfile({ name: profileNameDraft, photoFile: profilePhotoFile });
      setProfileEditOpen(false);
    } finally {
      setSavingProfile(false);
    }
  };
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const navItemStyle = ({ isActive }) => ({
    ...styles.navItem,
    ...(isActive ? styles.navItemActive : {}),
  });

  const visibleBrands = brands.filter((b) => hasBrandAccess(user, b.id));
  const anyCalendarUnseen = visibleBrands.some((b) =>
    hasUnseenCalendar(b.id, [...b.locations.map((l) => l.id), ...getByBrand(b.id).map((l) => l.id)])
  );
  const hasPendingAccessRequests = requests.some((r) => r.status === 'pending');

  const handleDeleteAccount = async () => {
    setDeleteError('');
    setDeleting(true);
    const result = await deleteMyAccount(password);
    setDeleting(false);
    if (!result.success) {
      setDeleteError(result.error ?? 'Something went wrong.');
      return;
    }
    setDeleteOpen(false);
  };

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🏠 Home</span>
              {anyEventNeedsMyJob ? <span style={styles.navDot} /> : null}
            </div>
          </NavLink>
          <NavLink to="/messages" style={navItemStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>💬 Messages</span>
              {unreadCount > 0 ? <span style={styles.navDot} /> : null}
            </div>
          </NavLink>
          {isAdmin || isExecutive ? (
            <NavLink to="/calendar" style={navItemStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>📅 Master Calendar</span>
                {anyCalendarUnseen ? <span style={styles.navDot} /> : null}
              </div>
            </NavLink>
          ) : null}
          <NavLink to="/availability" style={navItemStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🗓️ Availability</span>
              {hasUnseenTimeOff() || myWeeklyIsStale ? <span style={styles.navDot} /> : null}
            </div>
          </NavLink>
          <NavLink to="/support" style={navItemStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🛟 Support</span>
              {isBrenner && supportRequests.some((r) => r.status !== 'completed') ? (
                <span style={styles.navDot} />
              ) : null}
            </div>
          </NavLink>
          <NavLink to="/work-orders" style={navItemStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>✍️ Signature Directory</span>
              {getMyQueue().length > 0 ? <span style={styles.navDot} /> : null}
            </div>
          </NavLink>
          {/* Event Requests, Permits, and Renewals live inside each
              location itself (Home → Restaurant → Location), matching
              mobile — not top-level. */}

          {isAdmin || isExecutive ? (
            <>
              <div style={styles.navSectionLabel}>{isAdmin ? 'Admin' : 'Executive'}</div>
              <NavLink to="/announcements/new" style={navItemStyle}>
                📢 New Announcement
              </NavLink>
              {isAdmin ? (
                <NavLink to="/admin/users" style={navItemStyle}>
                  Manage Logins
                </NavLink>
              ) : null}
              <NavLink to="/admin/pending-requests" style={navItemStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Pending Requests</span>
                  {hasPendingAccessRequests ? <span style={styles.navDot} /> : null}
                </div>
              </NavLink>
              {isAdmin ? (
                <NavLink to="/admin/chats" style={navItemStyle}>
                  Monitor All Chats
                </NavLink>
              ) : null}
              <NavLink to="/executive-notes" style={navItemStyle}>
                📝 Executive Notes
              </NavLink>
              {isAdmin ? (
                <NavLink to="/reset-app-data" style={navItemStyle}>
                  ⚠️ Reset App Data
                </NavLink>
              ) : null}
            </>
          ) : null}
        </nav>

        <div style={styles.sidebarFooter}>
          <button style={styles.userRow} onClick={openProfileEdit}>
            {user?.photoUrl ? (
              <img src={user.photoUrl} alt="" style={styles.avatarImage} />
            ) : (
              <div style={styles.avatar}>{user?.name?.[0]?.toUpperCase() ?? '?'}</div>
            )}
            <div style={{ overflow: 'hidden' }}>
              <div style={styles.userName}>{user?.name}</div>
              <div style={styles.userRole}>{isAdmin ? 'Admin' : isExecutive ? 'Executive' : 'Manager'}</div>
            </div>
          </button>
          <button style={styles.signOutButton} onClick={logout}>
            Sign Out
          </button>
          <button style={styles.deleteAccountLink} onClick={() => setDeleteOpen(true)}>
            Delete My Account
          </button>
        </div>
      </div>

      <div style={styles.content}>{children}</div>

      {deleteOpen ? (
        <div style={styles.modalBackdrop} onClick={() => setDeleteOpen(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Delete My Account</h2>
            <p style={styles.modalBody}>
              This permanently deletes your login. This cannot be undone. Confirm your password to
              continue.
            </p>
            <input
              style={styles.input}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {deleteError ? <p style={styles.errorText}>{deleteError}</p> : null}
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button style={styles.cancelButton} onClick={() => setDeleteOpen(false)}>
                Cancel
              </button>
              <button style={styles.dangerButton} disabled={deleting} onClick={handleDeleteAccount}>
                {deleting ? 'Deleting…' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {profileEditOpen ? (
        <div style={styles.modalBackdrop} onClick={() => !savingProfile && setProfileEditOpen(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Edit Profile</h2>

            <div style={styles.profilePhotoRow}>
              {profilePhotoPreview || user?.photoUrl ? (
                <img src={profilePhotoPreview || user.photoUrl} alt="" style={styles.profilePhotoPreviewImg} />
              ) : (
                <div style={styles.profilePhotoPlaceholder}>{user?.name?.[0]?.toUpperCase() ?? '?'}</div>
              )}
              <label style={styles.photoPickButton}>
                Change Photo
                <input type="file" accept="image/*" onChange={handlePhotoPick} style={{ display: 'none' }} />
              </label>
            </div>

            <label style={styles.fieldLabel}>Name</label>
            <input
              style={styles.input}
              value={profileNameDraft}
              onChange={(e) => setProfileNameDraft(e.target.value)}
              autoFocus
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button style={styles.cancelButton} onClick={() => setProfileEditOpen(false)} disabled={savingProfile}>
                Cancel
              </button>
              <button style={styles.saveProfileButton} onClick={saveProfileEdit} disabled={savingProfile || !profileNameDraft.trim()}>
                {savingProfile ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  window: { display: 'flex', height: '100vh' },
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
  navSectionLabel: { fontSize: 10, fontWeight: 900, color: 'var(--neon)', textTransform: 'uppercase', letterSpacing: 1, padding: '18px 12px 6px' },
  navDot: { width: 7, height: 7, borderRadius: 4, background: 'var(--danger)' },
  sidebarFooter: { padding: 14, borderTop: '1px solid var(--border)' },
  userRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    marginBottom: 10,
    width: '100%',
    textAlign: 'left',
    border: 'none',
    background: 'none',
    padding: 0,
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
  profilePhotoRow: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 },
  profilePhotoPreviewImg: { width: 56, height: 56, borderRadius: 28, objectFit: 'cover' },
  profilePhotoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    background: 'var(--accent)',
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPickButton: {
    padding: '8px 14px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  fieldLabel: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 },
  saveProfileButton: { flex: 1, padding: '10px 0', borderRadius: 'var(--radius-sm)', background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 800, fontSize: 13 },
  signOutButton: {
    width: '100%',
    padding: '9px 0',
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: 'var(--text-primary)',
    border: 'none',
    background: 'var(--bg-card)',
  },
  deleteAccountLink: {
    width: '100%',
    padding: '7px 0',
    marginTop: 6,
    fontSize: 11,
    color: 'var(--text-tertiary)',
    textAlign: 'center',
    border: 'none',
  },
  content: { flex: 1, overflow: 'auto', background: 'var(--bg-window)' },

  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { width: 380, background: 'var(--bg-card)', border: 'none', borderRadius: 18, padding: 24, boxShadow: 'var(--shadow-lg)' },
  modalTitle: { fontSize: 19, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.2, color: '#FFFFFF', margin: '0 0 12px' },
  modalBody: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.55 },
  input: {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  },
  errorText: { color: 'var(--danger)', fontSize: 12, marginTop: 8 },
  cancelButton: { flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: 'var(--bg-inset)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700 },
  dangerButton: { flex: 1, padding: '10px 0', borderRadius: 10, background: 'var(--danger)', color: '#FFFFFF', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },
};
