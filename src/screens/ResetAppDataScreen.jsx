import React, { useState } from 'react';
import { collection, getDocs, writeBatch, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { brands } from '../data/mockData';
import { nike } from '../theme/nike';
import Icon from '../components/Icon';

// Grouped for the checkbox picker — each group maps to one or more actual
// Firestore collections, but admins choose at this human-readable level.
// Only content that ages out. The destructive groups that used to live here —
// opening checklist, renewals, availability, signed work orders, custom
// locations — were removed before rollout: those are operational records, and
// a button that permanently deletes them doesn't belong in a UI a future
// admin might click through out of curiosity. Wipe them from the Firebase
// console if it's ever genuinely needed.
//
// Groups with `filterable` can be narrowed to one brand or location instead
// of clearing everything.
const RESET_GROUPS = [
  { key: 'messages', label: 'Messages & Conversations', collections: ['conversations', 'messages'] },
  {
    // The locationId filter here is untested — categoryPosts was still empty
    // when this was written, so there was no document to check the field name
    // against. brandPosts turned out to store location ids in a field called
    // targetId, so verify this one against a real post before trusting it.
    key: 'categoryPosts',
    label: 'Category Announcements',
    collections: ['categoryPosts'],
    filterable: 'location',
  },
  {
    key: 'brandPosts',
    label: 'Brand Announcements',
    collections: ['brandPosts'],
    filterable: 'brand',
  },
  { key: 'accessRequests', label: 'Access Requests', collections: ['accessRequests'] },
  { key: 'support', label: 'Support Requests & Hub Updates', collections: ['supportRequests', 'supportAnnouncements'] },
  { key: 'notifications', label: 'Notification / Seen-Status Tracking', collections: ['viewTracking'] },
];

// Explicitly kept, never selectable — logins and every Drive connection.
const COLLECTIONS_KEPT = ['users', 'categoryDriveLinks', 'appSettings (Executive Notes link)'];

// filter is { field, value } or null. Announcements can be narrowed to a
// single brand or location; everything else clears wholesale.
async function wipeCollection(name, filter) {
  const ref = collection(db, name);
  const snap = await getDocs(filter ? query(ref, where(filter.field, '==', filter.value)) : ref);
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
  const { getByBrand } = useCustomLocations();
  // Locations are split between the static list on each brand and any the
  // team has added since, so the picker has to merge both.
  const allLocations = brands.flatMap((b) => [
    ...b.locations.map((l) => ({ id: l.id, name: `${b.name} — ${l.name}` })),
    ...getByBrand(b.id).map((l) => ({ id: l.id, name: `${b.name} — ${l.name}` })),
  ]);
  const isAdmin = user?.role === 'admin';
  const [selectedGroups, setSelectedGroups] = useState(() => new Set(RESET_GROUPS.map((g) => g.key)));
  const [confirmText, setConfirmText] = useState('');
  // { [groupKey]: brandId | locationId } — empty means clear everything.
  const [groupFilters, setGroupFilters] = useState({});
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
    // Carry the group with each collection so filterable groups know which
    // brand or location was picked. An unpicked filter means clear the lot,
    // which matches the old all-or-nothing behaviour.
    const targets = RESET_GROUPS.filter((g) => selectedGroups.has(g.key)).flatMap((g) =>
      g.collections.map((name) => ({ name, group: g }))
    );
    let currentCollection = null;
    try {
      for (const { name, group } of targets) {
        currentCollection = name;
        const picked = groupFilters[group.key];
        const filter =
          group.filterable && picked
            ? { field: group.filterable === 'brand' ? 'targetId' : 'locationId', value: picked }
            : null;
        total += await wipeCollection(name, filter);
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
          <div key={g.key}>
            <label style={styles.checkboxRow}>
              <input type="checkbox" checked={selectedGroups.has(g.key)} onChange={() => toggleGroup(g.key)} style={styles.checkbox} />
              {g.label}
            </label>
            {g.filterable && selectedGroups.has(g.key) ? (
              <select
                style={styles.input}
                value={groupFilters[g.key] ?? ''}
                onChange={(e) => setGroupFilters((f) => ({ ...f, [g.key]: e.target.value }))}
              >
                <option value="">Everything</option>
                {(g.filterable === 'brand'
                  ? // targetId holds a brand id when a post targets a whole
                    // brand, and a location id when it targets one restaurant,
                    // so both belong in this list.
                    [...brands.map((b) => ({ id: b.id, name: b.name })), ...allLocations]
                  : allLocations
                ).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
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
