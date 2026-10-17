import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOffboarding } from '../context/OffboardingContext';
import { useSupportRequests } from '../context/SupportRequestsContext';
import { useTheme } from '../context/ThemeContext';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import { modalBackdrop, modalSurface } from '../theme/modal';

export default function ProfileScreen() {
  const navigate = useNavigate();
  const { user, logout, deleteMyAccount, updateMyProfile , setMyEmailPreference } = useAuth();
  const { outstanding: offboardingOutstanding } = useOffboarding();
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
      await updateMyProfile({ name: profileNameDraft });
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

  const [colorOpen, setColorOpen] = useState(false);
  const roleLabel = isAdmin ? 'Admin' : isExecutive ? 'Executive' : 'Manager';
  const pref = user?.notifyEmail ?? 'default';
  const EMAIL_OPTIONS = [
    { key: 'default', label: 'What needs me now, plus one summary at 8am', sub: 'Recommended' },
    { key: 'action', label: 'Only what needs me', sub: 'No morning summary' },
    { key: 'all', label: 'Everything, as it happens', sub: 'More email' },
    { key: 'none', label: 'No emails', sub: 'Red dots in the Hub only' },
  ];
  // Admin tools in one place (17 Oct 2026), apart from the everyday links.
  const adminLinks = isAdmin
    ? [
        { key: 'logins', label: 'Manage Logins', hint: 'People, access, View as', onClick: () => navigate('/admin/users') },
        { key: 'offboarding', label: 'Offboarding', hint: offboardingOutstanding() ? 'Steps still open' : 'Nothing open', badge: offboardingOutstanding(), onClick: () => navigate('/admin/offboarding') },
        { key: 'support', label: 'Support requests', hint: supportRequests.some((r) => r.status !== 'completed') ? 'Waiting on you' : 'All answered', badge: supportRequests.some((r) => r.status !== 'completed'), onClick: () => navigate('/support') },
      ]
    : [];

  return (
    <div style={styles.page}>
      <PageHeader title="Profile" subtitle="Your details, and how the Hub emails you." />
      <div style={styles.columns}>
        <div style={styles.column}>
          <div style={styles.card}>
            <div style={styles.hero}>
              <span style={{ ...styles.avatar, ...(user?.photoUrl ? { background: `center / cover url("${user.photoUrl}")` } : {}) }}>
                {user?.photoUrl ? null : user?.name?.[0]?.toUpperCase() ?? '?'}
              </span>
              <span style={styles.heroText}>
                <span style={styles.name}>{user?.name}</span>
                <span style={styles.email}>{user?.email}</span>
                <span style={styles.tagRow}>
                  <span style={{ ...styles.tag, ...styles.tagCyan }}>{roleLabel}</span>
                  {user?.job ? <span style={styles.tag}>{user.job}</span> : null}
                </span>
              </span>
              <button style={styles.smallButton} onClick={openProfileEdit}>Edit</button>
            </div>
          </div>

          <div style={styles.card}>
            <p style={styles.sectionLabel}>Email from the Hub</p>
            <div style={styles.prefWrap}>
              {EMAIL_OPTIONS.map((opt) => (
                <button key={opt.key} style={{ ...styles.prefRow, ...(pref === opt.key ? styles.prefRowOn : {}) }} onClick={() => setMyEmailPreference(opt.key)} aria-pressed={pref === opt.key}>
                  <span style={{ ...styles.radio, ...(pref === opt.key ? styles.radioOn : {}) }} />
                  <span style={{ flex: 1 }}>
                    <span style={styles.prefLabel}>{opt.label}</span>
                    <span style={styles.prefSub}>{opt.sub}</span>
                  </span>
                </button>
              ))}
            </div>
            <p style={styles.cardNote}>Anything assigned to you comes in one email at 5pm, whichever you pick (unless you pick No emails).</p>
          </div>
        </div>

        <div style={styles.column}>
          {user?.privateSpace ? (
            <div style={styles.card}>
              <p style={styles.sectionLabel}>Yours</p>
              <button style={styles.linkRow} onClick={() => navigate('/my-space')}>
                <Icon name="lock" size={18} color="var(--text-secondary)" /><span style={styles.linkText}>My space</span><span style={styles.linkHint}>›</span>
              </button>
            </div>
          ) : null}

          {isAdmin ? (
            <div style={styles.card}>
              <p style={styles.sectionLabel}>Admin</p>
              {adminLinks.map((l) => (
                <button key={l.key} style={styles.linkRow} onClick={l.onClick}>
                  <span style={styles.linkText}>{l.label}</span>
                  {l.badge ? <span style={styles.menuDot} /> : null}
                  <span style={styles.linkHint}>{l.hint} ›</span>
                </button>
              ))}
              <button style={styles.linkRow} onClick={() => setColorOpen((v) => !v)} aria-expanded={colorOpen}>
                <span style={styles.linkText}>Accent color</span>
                <span style={styles.linkHint}>Everyone's Hub {colorOpen ? '▾' : '›'}</span>
              </button>
              {colorOpen ? (
                <div style={styles.colorBox}>
                  <p style={styles.cardNote}>Sets the accent color for every login. Everyone sees it the moment you let go of a slider.</p>
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
            </div>
          ) : null}

          {/* Help & policies: public pages, so they open in a new tab. */}
          <div style={styles.card}>
            <p style={styles.sectionLabel}>Help &amp; policies</p>
            {[
              { label: 'How to get help', sub: 'Who to contact, and how', href: '/support.html' },
              { label: 'Privacy policy', sub: 'What the Hub keeps about you, and why', href: '/privacy.html' },
            ].map((l) => (
              <a key={l.label} href={l.href} target="_blank" rel="noreferrer" style={{ ...styles.linkRow, textDecoration: 'none' }}>
                <span style={{ flex: 1 }}>
                  <span style={{ ...styles.linkText, display: 'block' }}>{l.label}</span>
                  <span style={styles.helpSub}>{l.sub}</span>
                </span>
                <span style={styles.linkHint}>↗</span>
              </a>
            ))}
          </div>

          <div style={styles.card}>
            <button style={styles.signOut} onClick={logout}>
              <Icon name="exit" size={18} /><span>Sign out</span>
            </button>
            <button style={styles.deleteLink} onClick={() => setDeleteOpen(true)}>Delete my account</button>
          </div>
        </div>
      </div>

      {editOpen ? (
        <div data-modal="" data-modal-keep="" style={styles.modalBackdrop} onClick={() => !savingProfile && setEditOpen(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Edit profile</h2>

            <label style={styles.fieldLabel}>Name</label>
            <input
              style={styles.input}
              value={profileNameDraft}
              onChange={(e) => setProfileNameDraft(e.target.value)}
              autoFocus
            />


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
        <div data-modal="" data-modal-keep="" style={styles.modalBackdrop} onClick={closeDeleteModal}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Delete my account</h2>
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
                {deleting ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  helpLabel: { fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '14px 16px 4px' },
  helpSub: { display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 },
  helpArrow: { fontSize: 16, color: 'var(--text-secondary)', marginLeft: 10 },
  page: { padding: '28px max(22px, min(36px, 4vw))', maxWidth: 980 },
  // Two columns on a computer, one on a phone (17 Oct 2026).
  columns: { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' },
  column: { flex: '1 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 },
  card: { background: 'var(--bg-card)', borderRadius: 14, padding: 18 },
  hero: { display: 'flex', alignItems: 'center', gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, flexShrink: 0, background: 'var(--accent)', color: '#FFFFFF', fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  email: { fontSize: 12.5, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag: { fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', borderRadius: 6, padding: '3px 7px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)' },
  tagCyan: { background: 'rgba(34,211,238,0.14)', color: 'var(--neon)' },
  smallButton: { border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 14px', background: 'none', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0, textTransform: 'none', fontFamily: 'inherit' },
  sectionLabel: { fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '0 0 10px' },
  cardNote: { fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5, margin: '10px 0 0' },
  radio: { width: 16, height: 16, borderRadius: 8, border: '2px solid var(--border-strong)', flexShrink: 0, marginTop: 1, boxSizing: 'border-box' },
  radioOn: { borderColor: 'var(--neon)', background: 'var(--neon)', boxShadow: 'inset 0 0 0 3px var(--bg-card)' },
  linkRow: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 2px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)', fontFamily: 'inherit', textTransform: 'none' },
  linkText: { flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  linkHint: { fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' },
  colorBox: { padding: '4px 2px 6px' },
  signOut: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 44, borderRadius: 10, border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, cursor: 'pointer', textTransform: 'none', fontFamily: 'inherit' },
  deleteLink: { display: 'block', margin: '12px auto 0', background: 'none', border: 'none', color: 'var(--danger)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'none', fontFamily: 'inherit' },
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

  modalBackdrop: { ...modalBackdrop, zIndex: 100 },
  modalCard: { padding: 24, ...modalSurface, width: 'min(400px, 100%)' },
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
  cancelButton: { minHeight: 40, flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: 'var(--bg-inset)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700 },
  dangerButton: { flex: 1, padding: '10px 0', borderRadius: 10, background: 'var(--danger)', color: '#FFFFFF', fontWeight: 900, fontSize: 13, textTransform: 'none' },
  prefWrap: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 },
  prefRow: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', textAlign: 'left' },
  prefRowOn: { borderColor: 'var(--neon)', background: 'rgba(34,211,238,0.08)' },
  prefTick: { color: 'var(--neon)', fontSize: 12, lineHeight: '18px' },
  prefLabel: { display: 'block', fontSize: 13, color: 'var(--text-primary)' },
  prefSub: { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 },
  fieldLabel: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 },
  customizeSection: { marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border)' },
  customizeTitle: { fontSize: 12, fontWeight: 900, color: 'var(--neon)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  customizeNote: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 },
  sliderLabelRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 4, marginTop: 12 },
  sliderLabel: { fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  saveProfileButton: { flex: 1, padding: '10px 0', borderRadius: 'var(--radius-sm)', background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 800, fontSize: 13 },
};
