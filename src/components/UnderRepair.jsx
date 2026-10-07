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
  { key: 'catering', label: 'Catering', test: /^\/catering/ },
  { key: 'deviceRequests', label: 'Device Requests', test: /^\/device-requests/ },
  { key: 'hr', label: 'HR', test: /^\/hr/ },
  { key: 'emergency', label: 'Emergency Procedures', test: /^\/emergency/ },
  { key: 'executiveNotes', label: 'Executive Notes', test: /^\/executive-notes/ },
  { key: 'announcements', label: 'New Announcement', test: /^\/announcements/ },
  { key: 'pendingRequests', label: 'Pending Requests', test: /^\/admin\/pending-requests/ },
  { key: 'profile', label: 'Profile', test: /^\/profile/ },
];

// Stored in appSettings, which everyone signed in can read and only admins
// can write - so the rule that protects it already exists.
const SETTINGS_DOC = doc(db, 'appSettings', 'underRepair');

// keys: the pages closed. notes: per page, what is being done, when it is
// back, and what to do meanwhile - all optional.
function useUnderRepair() {
  const [state, setState] = useState({ keys: [], notes: {} });
  useEffect(
    () =>
      onSnapshot(
        SETTINGS_DOC,
        (snap) => setState({ keys: snap.exists() ? snap.data().keys ?? [] : [], notes: snap.exists() ? snap.data().notes ?? {} : {} }),
        (err) => console.error('[UnderRepair] ' + err.code + ': ' + err.message)
      ),
    []
  );
  return state;
}

function prettyDate(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' });
}

/**
 * Wraps the routes. A closed page shows everyone except admins a short
 * "being improved" notice; admins get the page with a banner on top.
 */
export function UnderRepairGate({ children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { keys, notes } = useUnderRepair();

  const closed = REPAIRABLE_PAGES.find((p) => keys.includes(p.key) && p.test.test(pathname));
  if (!user || !closed) return children;
  const note = notes[closed.key] ?? {};

  if (user.role === 'admin') {
    return (
      <>
        <div style={styles.adminBanner}>
          <strong>Admin only:</strong> {closed.label} is closed for everyone else
          {note.backBy ? ' until ' + prettyDate(note.backBy) : ''}. You can still use it.
        </div>
        {children}
      </>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.icon}>⚙</div>
        <p style={styles.kicker}>Being improved</p>
        <h1 style={styles.title}>{closed.label} is closed for a moment</h1>
        <p style={styles.body}>
          {note.reason || 'It is being worked on so it is easier to use.'}
          {note.backBy ? (
            <>
              <br />
              Back by <strong style={{ color: 'var(--text-primary)' }}>{prettyDate(note.backBy)}</strong>.
            </>
          ) : null}
        </p>
        {note.meanwhile ? <div style={styles.meanwhile}>{note.meanwhile}</div> : null}
        <button style={styles.button} onClick={() => navigate('/')}>
          Back to Home
        </button>
      </div>
    </div>
  );
}

/**
 * The admin controls. Lives in Manage Logins with the other admin tools.
 */
export function UnderRepairControls() {
  const { keys, notes } = useUnderRepair();
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const save = async (patch) => {
    setSaving(true);
    try {
      await setDoc(SETTINGS_DOC, { ...patch, updatedAt: Date.now() }, { merge: true });
    } finally {
      setSaving(false);
    }
  };
  const toggle = (key) => save({ keys: keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key] });
  const setNote = (key, field, value) => save({ notes: { ...notes, [key]: { ...(notes[key] ?? {}), [field]: value } } });

  // Closed pages first, so what is switched off is never hidden in a list.
  const ordered = [...REPAIRABLE_PAGES].sort((a, b) => keys.includes(b.key) - keys.includes(a.key));
  const shown = showAll ? ordered : ordered.filter((p, i) => keys.includes(p.key) || i < keys.length + 3);

  return (
    <div style={styles.panel}>
      <p style={styles.panelTitle}>Pages being improved</p>
      <p style={styles.panelNote}>
        Close a page while it is being worked on. Everyone except admins sees a short notice instead; admins still get
        in, with a banner saying it is closed for everyone else.
      </p>
      {shown.map((p) => {
        const on = keys.includes(p.key);
        const n = notes[p.key] ?? {};
        return (
          <div key={p.key} style={styles.pageRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, fontWeight: 700 }}>
                {p.label} {on ? <span style={styles.closedPill}>Closed</span> : null}
              </span>
              <button style={styles.rowButton} disabled={saving} onClick={() => toggle(p.key)}>
                {on ? 'Open it' : 'Close it'}
              </button>
            </div>
            {on ? (
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                <input
                  style={styles.input}
                  defaultValue={n.reason ?? ''}
                  placeholder="What is being done - e.g. Rebuilding how time off works"
                  onBlur={(e) => setNote(p.key, 'reason', e.target.value.trim())}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
                  <input
                    type="date"
                    style={styles.input}
                    defaultValue={n.backBy ?? ''}
                    onBlur={(e) => setNote(p.key, 'backBy', e.target.value)}
                  />
                  <input
                    style={styles.input}
                    defaultValue={n.meanwhile ?? ''}
                    placeholder="Meanwhile - e.g. Need time off? Message Ronnie."
                    onBlur={(e) => setNote(p.key, 'meanwhile', e.target.value.trim())}
                  />
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
      {!showAll ? (
        <button style={styles.moreButton} onClick={() => setShowAll(true)}>
          Show all {REPAIRABLE_PAGES.length} pages
        </button>
      ) : null}
    </div>
  );
}

const styles = {
  adminBanner: { background: 'var(--accent-soft)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 10, padding: '10px 14px', margin: '16px 24px 0', fontSize: 13 },
  wrap: { minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { maxWidth: 480, width: '100%', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '40px 30px' },
  icon: { width: 54, height: 54, borderRadius: 14, background: '#3A2A0E', color: '#E8B93B', fontSize: 26, lineHeight: '54px', margin: '0 auto 16px' },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: '#E8B93B', margin: 0 },
  title: { fontSize: 24, fontWeight: 800, margin: '8px 0', color: 'var(--text-primary)' },
  body: { fontSize: 15, lineHeight: 1.55, color: 'var(--text-secondary)', margin: '0 0 18px' },
  meanwhile: { textAlign: 'left', background: 'var(--accent-soft)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', fontSize: 14, lineHeight: 1.5, color: 'var(--text-primary)', marginBottom: 20 },
  button: { background: 'var(--neon)', color: '#0A0A0B', border: 'none', borderRadius: 8, padding: '11px 20px', fontWeight: 800, fontSize: 14, cursor: 'pointer' },
  panel: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 20 },
  panelTitle: { fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text-primary)' },
  panelNote: { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 12px', lineHeight: 1.5 },
  pageRow: { borderTop: '1px solid var(--border)', padding: '12px 0', color: 'var(--text-primary)', fontSize: 14 },
  closedPill: { marginLeft: 6, fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: '#E8B93B', background: '#3A2A0E', borderRadius: 5, padding: '3px 7px' },
  rowButton: { background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  input: { background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  moreButton: { background: 'none', border: 'none', color: 'var(--neon)', fontWeight: 700, fontSize: 13, padding: '10px 0 0', cursor: 'pointer' },
};
