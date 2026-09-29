import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../hooks/useDialog';
import { nike } from '../theme/nike';

// HR, in one place.
//
// It is the same at every restaurant, so it does not belong in each location's
// folders or in each location's contact list - that means several places to
// look and most of them stale.
//
// The forms live in Drive because they get revised, and Drive is where that
// happens. This points at whatever is current rather than holding a copy.
//
// Everything here is admin-editable so a changed contact or a moved folder
// does not need a deploy.
const SETTINGS_DOC = 'appSettings/hr';

const DEFAULTS = {
  correctiveUrl: '',
  disciplinaryUrl: '',
  firmName: 'Integrity People Group',
  firmEmail: 'info@integritypeoplegroup.com',
  firmPhone: '(972) 855-8009',
  repName: 'Samantha Saathoff',
  repTitle: 'HR & Talent Operations',
  repEmail: '',
  repPhone: '',
  note: '',
};

export default function HRScreen() {
  const { user } = useAuth();
  const { dialogNode, notify } = useDialog();
  const [settings, setSettings] = useState(DEFAULTS);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.role === 'admin';

  useEffect(
    () =>
      onSnapshot(
        doc(db, SETTINGS_DOC),
        (snap) => setSettings(snap.exists() ? { ...DEFAULTS, ...snap.data() } : DEFAULTS),
        (err) => console.error('[HR] ' + err.code + ': ' + err.message)
      ),
    []
  );

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, SETTINGS_DOC), draft, { merge: true });
      setEditing(false);
    } catch (err) {
      notify('Could not save', err?.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const field = (label, key, placeholder) => (
    <>
      <label style={styles.label}>{label}</label>
      <input
        style={styles.input}
        value={draft[key] ?? ''}
        placeholder={placeholder}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </>
  );

  return (
    <div style={styles.page}>
      <div style={styles.headRow}>
        <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>HR</h1>
        {isAdmin ? (
          <button
            style={styles.editButton}
            onClick={() => {
              setDraft(settings);
              setEditing(true);
            }}
          >
            Edit
          </button>
        ) : null}
      </div>
      <p style={styles.subtitle}>The same for every restaurant. Forms, and who to talk to.</p>

      <p style={styles.sectionLabel}>Forms</p>

      <div style={styles.card}>
        <p style={styles.formName}>Disciplinary Progressive Action</p>
        <p style={styles.formWhen}>
          For attendance, timekeeping, dress code and work performance. Things that improve by being told, where the
          record is that it has happened before. Verbal, then written, then final, then termination.
        </p>
        {settings.disciplinaryUrl ? (
          <a href={settings.disciplinaryUrl} target="_blank" rel="noreferrer" style={styles.link}>
            Open the form →
          </a>
        ) : (
          <p style={styles.missing}>Not linked yet.</p>
        )}
      </div>

      <div style={styles.card}>
        <p style={styles.formName}>Corrective Action</p>
        <p style={styles.formWhen}>
          When something happened. Conduct toward a guest or another team member, safety, damage, theft, anything
          involving injury or emergency services, and anything that might lead to suspension. It records the incident,
          a plan, and what follows if it happens again.
        </p>
        {settings.correctiveUrl ? (
          <a href={settings.correctiveUrl} target="_blank" rel="noreferrer" style={styles.link}>
            Open the form →
          </a>
        ) : (
          <p style={styles.missing}>Not linked yet.</p>
        )}
      </div>

      <p style={styles.formNote}>
        Whichever you use, write facts rather than impressions — what was said and done, not what someone seemed to
        feel. Get the signatures. If you are unsure which form applies, ask before filling one in.
      </p>

      <p style={styles.sectionLabel}>Who to talk to</p>

      <div style={styles.card}>
        <p style={styles.contactName}>
          {settings.repName}
          {settings.repTitle ? <span style={styles.contactTitle}> · {settings.repTitle}</span> : null}
        </p>
        <p style={styles.contactFirm}>{settings.firmName}</p>
        {settings.repEmail ? (
          <a href={'mailto:' + settings.repEmail} style={styles.link}>
            {settings.repEmail}
          </a>
        ) : null}
        {settings.repPhone ? <p style={styles.contactLine}>{settings.repPhone}</p> : null}
        {!settings.repEmail && !settings.repPhone ? (
          <p style={styles.missing}>Direct details not added yet — use the firm below.</p>
        ) : null}
      </div>

      <div style={styles.card}>
        <p style={styles.contactName}>{settings.firmName}</p>
        {settings.firmEmail ? (
          <a href={'mailto:' + settings.firmEmail} style={styles.link}>
            {settings.firmEmail}
          </a>
        ) : null}
        {settings.firmPhone ? <p style={styles.contactLine}>{settings.firmPhone}</p> : null}
      </div>

      {settings.note ? <p style={styles.formNote}>{settings.note}</p> : null}

      {editing ? (
        <div style={styles.backdrop} onClick={() => !saving && setEditing(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Edit HR page</h2>
            <p style={styles.modalBody}>Everyone sees this. Links open in Drive, so they always show the current version.</p>

            <p style={styles.sectionLabel}>Forms</p>
            {field('Disciplinary Progressive Action', 'disciplinaryUrl', 'Drive link')}
            {field('Corrective Action', 'correctiveUrl', 'Drive link')}

            <p style={styles.sectionLabel}>Representative</p>
            {field('Name', 'repName', '')}
            {field('Title', 'repTitle', '')}
            {field('Email', 'repEmail', 'Their direct address')}
            {field('Phone', 'repPhone', 'Their direct line')}

            <p style={styles.sectionLabel}>Firm</p>
            {field('Name', 'firmName', '')}
            {field('Email', 'firmEmail', '')}
            {field('Phone', 'firmPhone', '')}

            <p style={styles.sectionLabel}>Anything else</p>
            <textarea
              style={{ ...styles.input, ...styles.textarea }}
              value={draft.note ?? ''}
              placeholder="Shown at the bottom of the page"
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />

            <div style={styles.modalButtons}>
              <button style={styles.buttonQuiet} onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </button>
              <button style={styles.button} onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '28px max(22px, min(36px, 4vw))', maxWidth: 640 },
  headRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 20px' },
  editButton: { padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },

  sectionLabel: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '18px 0 8px' },
  card: { background: 'var(--bg-card)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 },
  formName: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 },
  formWhen: { fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)', margin: '6px 0 10px' },
  formNote: { fontSize: 12, lineHeight: 1.6, color: 'var(--text-tertiary)', margin: '4px 0 0' },
  link: { fontSize: 13, color: 'var(--neon)', textDecoration: 'none' },
  missing: { fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic', margin: 0 },

  contactName: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' },
  contactTitle: { fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' },
  contactFirm: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' },
  contactLine: { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' },

  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 },
  modal: { width: 'min(440px, 100%)', maxHeight: '86vh', overflowY: 'auto', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, padding: 22 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' },
  modalBody: { fontSize: 12, lineHeight: 1.5, color: 'var(--text-tertiary)', margin: '0 0 6px' },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5, marginTop: 10 },
  input: { width: '100%', boxSizing: 'border-box', minHeight: 38, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 },
  textarea: { minHeight: 64, resize: 'vertical' },
  modalButtons: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  button: { padding: '9px 14px', borderRadius: 9, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  buttonQuiet: { padding: '9px 14px', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
};
