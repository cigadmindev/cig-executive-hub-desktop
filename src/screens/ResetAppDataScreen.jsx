import React, { useState } from 'react';
import { collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { nike } from '../theme/nike';
import Icon from '../components/Icon';

// Grouped for the checkbox picker — each group maps to one or more actual
// Firestore collections, but admins choose at this human-readable level.
const RESET_GROUPS = [
  { key: 'messages', label: 'Messages & Conversations', collections: ['conversations', 'messages'] },
  {
    key: 'opening',
    label: 'Calendar, Opening Checklist & Operational POC',
    collections: ['schedules', 'openingLocationInfo', 'openingOngoingContacts', 'openingOngoingContactsSeedMarker'],
  },
  { key: 'renewals', label: 'License & Lease Renewals', collections: ['licenseRenewals'] },
  {
    key: 'requests',
    label: 'Event Requests, Time Off & Availability',
    collections: ['eventRequests', 'timeOffRequests', 'weeklyAvailability'],
  },
  { key: 'accessPosts', label: 'Access Requests & Team Posts', collections: ['accessRequests', 'categoryPosts', 'brandPosts'] },
  { key: 'support', label: 'Support Requests & Hub Updates', collections: ['supportRequests', 'supportAnnouncements'] },
  { key: 'signatures', label: 'Signature Directory', collections: ['workOrders'] },
  { key: 'locations', label: 'Custom Locations', collections: ['customLocations'] },
  { key: 'notifications', label: 'Notification / Seen-Status Tracking', collections: ['viewTracking'] },
];

// Explicitly kept, never selectable — logins and every Drive connection.
const COLLECTIONS_KEPT = ['users', 'categoryDriveLinks', 'appSettings (Executive Notes link)'];

async function wipeCollection(name) {
  const snap = await getDocs(collection(db, name));
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 450) {
    const batch = writeBatch(db);
    docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return docs.length;
}

export default function ResetAppDataScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [selectedGroups, setSelectedGroups] = useState(() => new Set(RESET_GROUPS.map((g) => g.key)));
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState(null);
  const [resultPopup, setResultPopup] = useState(null); // { totalDeleted }

  if (!isAdmin) {
    return (
      <div style={styles.page}>
        <p style={{ color: 'var(--text-secondary)' }}>Admins only.</p>
      </div>
    );
  }

  const toggleGroup = (key) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const canConfirm = confirmText.trim().toUpperCase() === 'RESET' && selectedGroups.size > 0;

  const handleReset = async () => {
    if (!canConfirm) return;
    setResetting(true);
    setResetError(null);
    let total = 0;
    const collectionsToWipe = RESET_GROUPS.filter((g) => selectedGroups.has(g.key)).flatMap((g) => g.collections);
    let currentCollection = null;
    try {
      for (const name of collectionsToWipe) {
        currentCollection = name;
        total += await wipeCollection(name);
      }
      setConfirmText('');
      setResultPopup({ totalDeleted: total });
    } catch (err) {
      // Names the exact collection it failed on — almost always means the
      // Firestore rules for that specific one don't allow admin deletes
      // yet, which happens if the updated rules were never published.
      setResetError(
        `Failed on "${currentCollection}" — ${err.message || 'unknown error'}. ${total} records were already deleted before this point and stay deleted.`
      );
    } finally {
      setResetting(false);
    }
  };

  return (
    <div style={styles.page}>
      <h1 style={{ ...styles.title, ...nike.pageTitleSm, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="warning" size={22} color="var(--danger)" />
        Reset App Data
      </h1>
      <p style={styles.subtitle}>
        Wipes working data back to a clean slate — pick exactly what to reset below. Only for resetting
        the app before real day-to-day use begins.
      </p>

      <div style={styles.section}>
        <p style={styles.sectionLabel}>Choose what to reset</p>
        {RESET_GROUPS.map((g) => (
          <label key={g.key} style={styles.checkboxRow}>
            <input type="checkbox" checked={selectedGroups.has(g.key)} onChange={() => toggleGroup(g.key)} style={styles.checkbox} />
            {g.label}
          </label>
        ))}

        <p style={{ ...styles.sectionLabel, marginTop: 16 }}>This will NOT touch, regardless of selection:</p>
        <ul style={styles.list}>
          {COLLECTIONS_KEPT.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p style={styles.hint}>Every login stays exactly as-is, and every Drive folder you've already connected stays connected.</p>
      </div>

      <div style={styles.section}>
        <p style={styles.sectionLabel}>Type RESET to confirm</p>
        <input style={styles.input} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESET" />
        <button style={styles.resetButton} onClick={handleReset} disabled={!canConfirm || resetting}>
          {resetting ? 'Resetting…' : `Reset Selected (${selectedGroups.size} of ${RESET_GROUPS.length})`}
        </button>
        {resetError ? <p style={styles.errorText}>{resetError}</p> : null}
      </div>

      {resultPopup ? (
        <div style={styles.modalBackdrop} onClick={() => setResultPopup(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <p style={styles.modalIcon}>✓</p>
            <h2 style={styles.modalTitle}>Reset Complete</h2>
            <p style={styles.modalBody}>{resultPopup.totalDeleted} record{resultPopup.totalDeleted === 1 ? '' : 's'} deleted.</p>
            <button style={styles.modalCloseButton} onClick={() => setResultPopup(null)}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  page: { padding: '28px 36px', maxWidth: 560 },
  title: { fontSize: 22, fontWeight: 700, margin: '0 0 6px' },
  subtitle: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.5 },
  section: { background: 'var(--bg-card)', border: 'none', borderRadius: 14, padding: 18, marginBottom: 16 },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 10px' },
  checkboxRow: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-primary)', padding: '7px 0', cursor: 'pointer' },
  checkbox: { width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' },
  list: { fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.9, margin: '0 0 10px', paddingLeft: 18 },
  hint: { fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' },
  input: {
    width: '100%',
    padding: '9px 11px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--danger)',
    background: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 10,
  },
  resetButton: { width: '100%', padding: '11px 0', borderRadius: 10, background: 'var(--danger)', color: '#FFFFFF', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },
  errorText: { fontSize: 12, color: 'var(--danger)', lineHeight: 1.5, marginTop: 10 },

  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { width: 340, background: 'var(--bg-card)', border: 'none', borderRadius: 18, padding: 24, boxShadow: 'var(--shadow-lg)', textAlign: 'center' },
  modalIcon: { fontSize: 30, color: 'var(--success)', margin: '0 0 8px' },
  modalTitle: { fontSize: 19, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.2, color: '#FFFFFF', margin: '0 0 12px' },
  modalBody: { fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 18px' },
  modalCloseButton: { width: '100%', padding: '10px 0', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },
};
