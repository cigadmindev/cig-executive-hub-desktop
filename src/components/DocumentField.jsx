import React, { useRef, useState } from 'react';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebaseConfig';
import { useDialog } from '../hooks/useDialog';

// One document per checklist item or renewal — the permit itself.
//
// Stored under permitDocs/{locationId}/{itemKey}/ so the opening checklist and
// the renewal record can reference the same file. A permit obtained during
// setup is the same document that expires two years later, and making someone
// upload it twice means one of the two copies goes stale.
//
// Replaces rather than accumulates: there's one current version of a permit,
// and keeping every superseded copy makes finding the live one harder.
export default function DocumentField({ locationId, itemKey, value, onChange, userName }) {
  const { dialogNode, confirm } = useDialog();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const pick = () => inputRef.current?.click();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      setError('File is over 20MB.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const path = `permitDocs/${locationId}/${itemKey}/${Date.now()}-${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      // Remove the previous file rather than orphaning it in Storage, where
      // it would keep costing money and never be reachable again.
      if (value?.path) {
        try {
          await deleteObject(ref(storage, value.path));
        } catch {
          // Already gone, or never existed. Not worth surfacing.
        }
      }

      onChange({ url, path, name: file.name, uploadedAt: Date.now(), uploadedBy: userName ?? null });
    } catch (err) {
      setError(err?.message ?? 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    confirm({
      title: `Remove ${value.name}?`,
      body: 'The file is deleted from storage.',
      confirmLabel: 'Remove',
      tone: 'danger',
      onConfirm: doRemove,
    });
  };

  const doRemove = async () => {
    setBusy(true);
    try {
      if (value.path) await deleteObject(ref(storage, value.path));
    } catch {
      // Fall through — clearing the reference matters more than the file.
    }
    onChange(null);
    setBusy(false);
  };

  return (
    <div style={styles.wrap}>
      <span style={styles.label}>Document</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: 'none' }}
        onChange={handleFile}
      />

      {value ? (
        <div style={styles.fileRow}>
          <a href={value.url} target="_blank" rel="noreferrer" style={styles.fileLink}>
            {value.name}
          </a>
          <button style={styles.smallBtn} onClick={pick} disabled={busy}>
            Replace
          </button>
          <button style={styles.smallBtn} onClick={remove} disabled={busy}>
            Remove
          </button>
        </div>
      ) : (
        <button style={styles.uploadBtn} onClick={pick} disabled={busy}>
          {busy ? 'Uploading…' : '+ Attach document'}
        </button>
      )}

      {error ? <p style={styles.error}>{error}</p> : null}
      {dialogNode}
    </div>
  );
}

const styles = {
  wrap: { marginTop: 4 },
  label: {
    display: 'block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'var(--text-tertiary)',
    marginBottom: 5,
  },
  uploadBtn: {
    padding: '7px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px dashed var(--border-strong)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 600,
  },
  fileRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  fileLink: { fontSize: 13, color: 'var(--neon)', textDecoration: 'none', flex: 1, minWidth: 0 },
  smallBtn: {
    padding: '5px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-inset)',
    color: 'var(--text-secondary)',
    fontSize: 11,
  },
  error: { fontSize: 11, color: 'var(--danger)', margin: '6px 0 0' },
};
