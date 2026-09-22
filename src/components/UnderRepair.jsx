import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';

// Pages that can be switched to "under repair" while they are being worked
// on. Admins still reach them - that is who is doing the work - and everyone
// else sees a notice instead of something half-finished that looks broken.
//
// Matched by what the address contains rather than exactly, so a
// location-scoped page is covered at every location at once.
export const REPAIRABLE_PAGES = [
  { key: 'restaurant', label: 'Restaurant pages', test: /^\/brand\/[^/]+$/ },
  { key: 'location', label: 'Location pages', test: /^\/brand\/[^/]+\/location\/[^/]+$/ },
  { key: 'openingChecklist', label: 'Opening Checklist', test: /\/opening-checklist$/ },
  { key: 'renewals', label: 'License & Lease Renewals', test: /\/renewals$/ },
  { key: 'operationalPoc', label: 'Operational POC', test: /\/operational-poc$/ },
  { key: 'eventRequests', label: 'Event Requests', test: /\/event-requests$/ },
  { key: 'integrations', label: 'Integrations', test: /\/integrations$/ },
  { key: 'fileFolders', label: 'File Directory folders', test: /\/category\// },
  { key: 'calendar', label: 'Calendar', test: /^\/calendar/ },
  { key: 'messages', label: 'Messages', test: /^\/messages/ },
  { key: 'directory', label: 'Directory', test: /^\/directory/ },
  { key: 'availability', label: 'Availability', test: /^\/availability/ },
  { key: 'workOrders', label: 'Signature Directory', test: /^\/work-orders/ },
  { key: 'expenses', label: 'Expenses & Receipts', test: /^\/expenses/ },
  { key: 'systemsHelp', label: 'Systems Help', test: /^\/integration-requests/ },
  { key: 'support', label: 'Support', test: /^\/support/ },
  { key: 'openingSoon', label: 'Opening Soon', test: /^\/opening-soon/ },
  { key: 'wares', label: 'Wares Inventory', test: /^\/wares-inventory/ },
  { key: 'executiveNotes', label: 'Executive Notes', test: /^\/executive-notes/ },
  { key: 'announcements', label: 'New Announcement', test: /^\/announcements/ },
  { key: 'pendingRequests', label: 'Pending Requests', test: /^\/admin\/pending-requests/ },
  { key: 'profile', label: 'Profile', test: /^\/profile/ },
];

// Stored in appSettings, which everyone signed in can read and only admins
// can write - so the rule that protects it already exists.
const SETTINGS_DOC = doc(db, 'appSettings', 'underRepair');

function useUnderRepair() {
  const [keys, setKeys] = useState([]);
  useEffect(
    () =>
      onSnapshot(
        SETTINGS_DOC,
        (snap) => setKeys(snap.exists() ? snap.data().keys ?? [] : []),
        (err) => console.error('[UnderRepair] ' + err.code + ': ' + err.message)
      ),
    []
  );
  return keys;
}

/**
 * Wraps the routes. Shows the notice in place of any page switched off,
 * unless the person is an admin.
 */
export function UnderRepairGate({ children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const keys = useUnderRepair();

  const closed = REPAIRABLE_PAGES.find((p) => keys.includes(p.key) && p.test.test(pathname));

  if (!user) return children;

  if (user.role === 'admin') {
    if (!closed) return children;
    return (
      <>
        <div style={styles.adminBanner}>
          🚧 {closed.label} is under repair — everyone but admins sees a notice here.
        </div>
        {children}
      </>
    );
  }

  if (!closed) return children;

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.icon}>🚧</div>
        <h1 style={styles.title}>Under repair</h1>
        <p style={styles.body}>
          {closed.label} is being worked on and will be open again soon.
        </p>
        <button style={styles.button} onClick={() => navigate('/')}>
          Back to Home
        </button>
      </div>
    </div>
  );
}

/**
 * The admin switches. Lives in Manage Logins with the other admin tools.
 */
export function UnderRepairControls() {
  const keys = useUnderRepair();
  const [saving, setSaving] = useState(false);

  const toggle = async (key) => {
    setSaving(true);
    try {
      const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
      await setDoc(SETTINGS_DOC, { keys: next, updatedAt: Date.now() }, { merge: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.panel}>
      <p style={styles.panelTitle}>Pages under repair</p>
      <p style={styles.panelNote}>
        Switched-on pages show an "under repair" notice to everyone except admins. Use it while a
        page is being worked on, so nobody runs into something half-finished.
      </p>
      <div style={styles.chips}>
        {REPAIRABLE_PAGES.map((p) => {
          const on = keys.includes(p.key);
          return (
            <button
              key={p.key}
              disabled={saving}
              onClick={() => toggle(p.key)}
              style={{ ...styles.chip, ...(on ? styles.chipOn : {}) }}
            >
              {on ? '🚧 ' : ''}
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  adminBanner: { background: 'rgba(201,162,39,0.16)', color: '#C9A227', fontSize: 12, fontWeight: 600, padding: '8px 16px', textAlign: 'center' },
  wrap: { minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { maxWidth: 420, textAlign: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, padding: '32px 28px' },
  icon: { fontSize: 40, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.4, margin: '0 0 8px', color: 'var(--text-primary)' },
  body: { fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)', margin: '0 0 20px' },
  button: { padding: '11px 20px', borderRadius: 10, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 13, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer' },

  panel: { background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 22 },
  panelTitle: { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '0 0 6px' },
  panelNote: { fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)', margin: '0 0 12px' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  chipOn: { background: 'rgba(201,162,39,0.16)', borderColor: '#C9A227', color: '#C9A227' },
};
