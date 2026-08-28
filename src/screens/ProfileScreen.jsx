import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSupportRequests } from '../context/SupportRequestsContext';
import { useTheme } from '../context/ThemeContext';
import Icon from '../components/Icon';

export default function ProfileScreen() {
  const navigate = useNavigate();
  const { user, logout, deleteMyAccount, updateMyProfile } = useAuth();
  const { requests: supportRequests } = useSupportRequests();
  const { hue, intensity, setAccentTheme, previewHue, previewIntensity } = useTheme();
  const isAdmin = user?.role === 'admin';
  const isExecutive = user?.role === 'executive';

  const [draggingHue, setDraggingHue] = useState(null);
  const [draggingIntensity, setDraggingIntensity] = useState(null);
  const handleHueDrag = (e) => {
    const next = Number(e.target.value);
    setDraggingHue(next);
    previewHue(next);
  };
  const handleIntensityDrag = (e) => {
    const next = Number(e.target.value);
    setDraggingIntensity(next);
    previewIntensity(next);
  };
  const commitTheme = async () => {
    const nextHue = draggingHue ?? hue;
    const nextIntensity = draggingIntensity ?? intensity;
    setDraggingHue(null);
    setDraggingIntensity(null);
    await setAccentTheme(nextHue, nextIntensity, user?.name ?? 'Unknown');
  };

  const [editOpen, setEditOpen] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState('');
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const openProfileEdit = () => {
    setProfileNameDraft(user?.name ?? '');
    setProfilePhotoFile(null);
    setProfilePhotoPreview(null);
    setEditOpen(true);
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
      setEditOpen(false);
    } finally {
      setSavingProfile(false);
    }
  };

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const closeDeleteModal = () => {
    setDeleteOpen(false);
    setPassword('');
    setDeleteError('');
  };
  const handleDeleteAccount = async () => {
    setDeleteError('');
    setDeleting(true);
    const result = await deleteMyAccount(password);
    setDeleting(false);
    if (!result.success) {
      setDeleteError(result.error ?? 'Something went wrong.');
      return;
    }
    closeDeleteModal();
  };

  const menuItems = [
    {
      key: 'support',
      icon: 'lifeBuoy',
      label: 'Support',
      badge: isAdmin && supportRequests.some((r) => r.status !== 'completed'),
      onClick: () => navigate('/support'),
    },
    ...(isAdmin ? [{ key: 'manageLogins', icon: 'people', label: 'Manage Logins', onClick: () => navigate('/admin/users') }] : []),
    ...(isAdmin ? [{ key: 'resetData', icon: 'warning', label: 'Reset App Data', danger: true, onClick: () => navigate('/reset-app-data') }] : []),
  ];

  return (
    <div style={styles.page}>
      <div style={styles.profileCard}>
        <button style={styles.avatarWrap} onClick={openProfileEdit}>
          {user?.photoUrl ? (
            <img src={user.photoUrl} alt="" style={styles.avatarImage} />
          ) : (
            <div style={styles.avatarPlaceholder}>{user?.name?.[0]?.toUpperCase() ?? '?'}</div>
          )}
          <div style={styles.editBadge}>✎</div>
        </button>
        <div style={styles.name}>{user?.name}</div>
        <div style={styles.role}>{isAdmin ? 'Admin' : isExecutive ? 'Executive' : 'Manager'}</div>
        <button style={styles.editProfileButton} onClick={openProfileEdit}>
          Edit Profile
        </button>
      </div>

      <div style={styles.menuCard}>
        {menuItems.map((item) => (
          <button key={item.key} style={styles.menuItem} onClick={item.onClick}>
            <Icon name={item.icon} color={item.danger ? 'var(--danger)' : '#FFFFFF'} />
            <span style={{ ...styles.menuItemText, ...(item.danger ? { color: 'var(--danger)' } : {}) }}>{item.label}</span>
            {item.badge ? <span style={styles.menuDot} /> : null}
          </button>
        ))}
      </div>

      <div style={styles.menuCard}>
        <button style={styles.menuItem} onClick={logout}>
          <Icon name="exit" color="#FFFFFF" />
          <span style={styles.menuItemText}>Sign Out</span>
        </button>
        <button style={styles.menuItem} onClick={() => setDeleteOpen(true)}>
          <Icon name="trash" color="var(--danger)" />
          <span style={{ ...styles.menuItemText, color: 'var(--danger)' }}>Delete My Account</span>
        </button>
      </div>

      {editOpen ? (
        <div style={styles.modalBackdrop} onClick={() => !savingProfile && setEditOpen(false)}>
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

            {isAdmin ? (
              <div style={styles.customizeSection}>
                <h3 style={styles.customizeTitle}>Customize</h3>
                <p style={styles.customizeNote}>
                  Sets the app's accent color for every login — everyone sees this live the moment you release a
                  slider.
                </p>
                <div style={styles.sliderLabelRow}>
                  <span style={styles.sliderLabel}>Color</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={359}
                  value={draggingHue ?? hue}
                  onChange={handleHueDrag}
                  onMouseUp={commitTheme}
                  onTouchEnd={commitTheme}
                  className="hue-slider"
                />
                <div style={styles.sliderLabelRow}>
                  <span style={styles.sliderLabel}>Pastel</span>
                  <span style={styles.sliderLabel}>Vivid</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={draggingIntensity ?? intensity}
                  onChange={handleIntensityDrag}
                  onMouseUp={commitTheme}
                  onTouchEnd={commitTheme}
                  className="intensity-slider"
                />
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button style={styles.cancelButton} onClick={() => setEditOpen(false)} disabled={savingProfile}>
                Cancel
              </button>
              <button style={styles.saveProfileButton} onClick={saveProfileEdit} disabled={savingProfile || !profileNameDraft.trim()}>
                {savingProfile ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteOpen ? (
        <div style={styles.modalBackdrop} onClick={closeDeleteModal}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Delete My Account</h2>
            <p style={styles.modalBody}>
              This permanently deletes your login. This cannot be undone. Confirm your password to continue.
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
              <button style={styles.cancelButton} onClick={closeDeleteModal}>
                Cancel
              </button>
              <button style={styles.dangerButton} disabled={deleting || !password} onClick={handleDeleteAccount}>
                {deleting ? 'Deleting…' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  page: { padding: '28px 36px', maxWidth: 480 },
  profileCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'var(--bg-card)',
    borderRadius: 16,
    padding: 28,
    marginBottom: 18,
  },
  avatarWrap: { position: 'relative', marginBottom: 12, border: 'none', background: 'none', padding: 0, cursor: 'pointer' },
  avatarImage: { width: 76, height: 76, borderRadius: 38, objectFit: 'cover' },
  avatarPlaceholder: {
    width: 76,
    height: 76,
    borderRadius: 38,
    background: 'var(--accent)',
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    background: 'var(--neon)',
    color: 'var(--neon-text)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid var(--bg-card)',
    fontSize: 11,
  },
  name: { fontSize: 18, fontWeight: 900, color: '#FFFFFF', textTransform: 'uppercase' },
  role: { fontSize: 12, fontWeight: 700, color: 'var(--neon)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2, marginBottom: 14 },
  editProfileButton: {
    border: '1px solid var(--border-strong)',
    borderRadius: 10,
    padding: '8px 18px',
    background: 'none',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  menuCard: { background: 'var(--bg-card)', borderRadius: 16, marginBottom: 18, overflow: 'hidden' },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '15px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    width: '100%',
    textAlign: 'left',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
  },
  menuItemText: { color: '#FFFFFF', fontSize: 14, fontWeight: 600, flex: 1 },
  menuDot: { width: 9, height: 9, borderRadius: 4.5, background: 'var(--danger)' },

  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { width: 380, background: 'var(--bg-elevated)', border: 'none', borderRadius: 18, padding: 24, boxShadow: 'var(--shadow-lg)' },
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
  customizeSection: { marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border)' },
  customizeTitle: { fontSize: 12, fontWeight: 900, color: 'var(--neon)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  customizeNote: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 },
  sliderLabelRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 4, marginTop: 12 },
  sliderLabel: { fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  saveProfileButton: { flex: 1, padding: '10px 0', borderRadius: 'var(--radius-sm)', background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 800, fontSize: 13 },
};
