import React, { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../context/AuthContext';
import { useExecutiveNotes } from '../context/ExecutiveNotesContext';
import Icon from '../components/Icon';
import { nike } from '../theme/nike';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function ExecutiveNotesScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { driveUrl, setLink } = useExecutiveNotes();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState(null); // { file } or { error } or null (loading)

  useEffect(() => {
    if (!driveUrl) {
      setPreview(null);
      return;
    }
    setPreview(null);
    // Runs server-side: the Drive credential lives in Secret Manager and the
    // admin/executive check happens in the function, not here. A role check in
    // the renderer only hides the tile — it doesn't protect the data.
    const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'getExecutiveNotesFile');
    fn({ driveUrl })
      .then((res) => setPreview(res.data))
      .catch((err) => setPreview({ error: err.message || 'Could not reach Google Drive.' }));
  }, [driveUrl]);

  const startEdit = () => {
    setDraft(driveUrl ?? '');
    setEditing(true);
  };

  const save = async () => {
    if (!draft.trim()) return;
    await setLink(draft.trim(), user?.name ?? 'Unknown');
    setEditing(false);
  };

  return (
    <div style={styles.page}>
      <h1 style={{ ...styles.title, ...nike.pageTitleSm, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="document" size={22} color="#FFFFFF" />
        Executive Notes
      </h1>
      <p style={styles.subtitle}>Documented notes from executive meetings — an overview, not tied to any one location.</p>

      {driveUrl && !editing ? (
        <div style={styles.card}>
          <p style={styles.cardText}>Executive notes are stored in Google Drive.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button style={styles.openButton} onClick={() => window.open(driveUrl, '_blank')}>
              Open in Google Drive
            </button>
            {isAdmin && !(preview && preview.error) ? (
              <button style={styles.editButton} onClick={startEdit}>
                Edit link
              </button>
            ) : null}
          </div>

          <div style={styles.previewBlock}>
            <p style={styles.previewLabel}>Most recently updated document</p>
            {preview === null ? (
              <p style={styles.cardText}>Checking Drive…</p>
            ) : preview.error ? (
              <p style={styles.cardText}>{preview.error}</p>
            ) : (
              <a
                href={preview.file.webViewLink}
                target="_blank"
                rel="noreferrer"
                style={styles.previewCard}
              >
                {preview.file.iconLink ? <img src={preview.file.iconLink} alt="" style={styles.previewIcon} /> : null}
                <div style={{ minWidth: 0 }}>
                  <p style={styles.previewFileName}>{preview.file.name}</p>
                  <p style={styles.previewMeta}>Updated {formatDate(preview.file.modifiedTime)}</p>
                </div>
              </a>
            )}
          </div>
        </div>
      ) : editing ? (
        <div style={styles.card}>
          <label style={styles.label}>Google Drive folder link</label>
          <input
            style={styles.input}
            placeholder="Paste the Drive folder link…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button style={styles.cancelButton} onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button style={styles.openButton} onClick={save}>
              Save
            </button>
          </div>
        </div>
      ) : (
        <div style={styles.card}>
          <p style={styles.cardText}>
            {isAdmin ? 'Not connected yet — connect your executive notes Drive folder.' : 'Not connected yet — ask an admin to connect it.'}
          </p>
          {isAdmin ? (
            <button style={{ ...styles.openButton, marginTop: 14 }} onClick={startEdit}>
              Connect Drive Folder
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { padding: '28px 36px', maxWidth: 560 },
  title: { fontSize: 22, fontWeight: 700, margin: '0 0 6px' },
  subtitle: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.5 },
  card: { background: 'var(--bg-card)', border: 'none', borderRadius: 14, padding: 20 },
  cardText: { fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 },
  input: {
    width: '100%',
    padding: '9px 11px',
    borderRadius: 10,
    border: 'none',
    background: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  },
  openButton: { padding: '10px 18px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },
  editButton: { padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--bg-inset)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700 },
  cancelButton: { padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--bg-inset)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700 },
  previewBlock: { marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' },
  previewLabel: { fontSize: 11, fontWeight: 900, color: 'var(--neon)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' },
  previewError: { fontSize: 12, color: 'var(--danger)', lineHeight: 1.5, margin: 0 },
  previewCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    background: 'var(--bg-inset)',
    border: 'none',
    textDecoration: 'none',
  },
  previewIcon: { width: 28, height: 28, flexShrink: 0 },
  previewFileName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  previewMeta: { fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0 0' },
};
