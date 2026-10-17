import React, { useRef, useState } from 'react';
import { ref, uploadBytes } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { storage } from '../firebaseConfig';
import { useDialog } from '../hooks/useDialog';
import { plainError } from '../lib/errors';

// Several documents on one checklist item (Mark, 10 Oct 2026) - the signed
// application, the floor plan that went with it, the photo of the menu.
// Picked several at a time, opened through the Hub (never a public link),
// and taken off one by one.
//
// Stored on the item as documents: [{ path, name, uploadedAt, uploadedBy }].
// An item from before this carries a single `document`; it shows as the
// first of the list and is folded in on the next change. The first in the
// list is still the one copied to the renewal record.
//
// Files live under permitDocs/{locationId}/{itemKey}/ as before. A removed
// file is left for the weekly sweep, which deletes anything nothing points
// at (the browser is not allowed to delete files).
export const documentsOf = (item) => item?.documents ?? (item?.document ? [item.document] : []);

export default function DocumentsField({ locationId, itemKey, value, onChange, userName, readOnly = false, hideLabel = false }) {
  const { dialogNode, confirm } = useDialog();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const list = value ?? [];

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    const tooBig = files.filter((f) => f.size > 20 * 1024 * 1024);
    if (tooBig.length) {
      setError(tooBig.map((f) => f.name).join(', ') + (tooBig.length === 1 ? ' is' : ' are') + ' over 20MB. Nothing was added.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const added = [];
      for (const file of files) {
        const path = `permitDocs/${locationId}/${itemKey}/${Date.now()}-${file.name}`;
        await uploadBytes(ref(storage, path), file);
        added.push({ path, name: file.name, uploadedAt: Date.now(), uploadedBy: userName ?? null });
      }
      await onChange([...list, ...added]);
    } catch (err) {
      setError(plainError(err, 'Upload failed.'));
    } finally {
      setBusy(false);
    }
  };

  const open = async (d) => {
    if (d.url) {
      window.open(d.url, '_blank', 'noreferrer');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await httpsCallable(getFunctions(undefined, 'us-central1'), 'getPermitDocUrl')({ storagePath: d.path });
      window.open(res.data.url, '_blank', 'noreferrer');
    } catch (err) {
      setError(plainError(err, 'Could not open that document.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = (d) =>
    confirm({
      title: `Remove ${d.name}?`,
      body: 'It comes off this task. Anything else on the task stays.',
      confirmLabel: 'Remove',
      tone: 'danger',
      onConfirm: () => onChange(list.filter((x) => x !== d)),
    });

  return (
    <div style={hideLabel ? styles.wrapBare : styles.wrap}>
      {hideLabel ? null : <span style={styles.label}>Documents{list.length ? ' · ' + list.length : ''}</span>}
      <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleFiles} />
      {list.map((d, i) => (
        <div key={(d.path ?? d.url ?? '') + i} style={styles.fileRow}>
          <span style={styles.type}>{/\.pdf$/i.test(d.name ?? '') ? 'PDF' : 'FILE'}</span>
          <button style={styles.fileLink} onClick={() => open(d)} disabled={busy}>{d.name}</button>
          {d.uploadedBy ? <span style={styles.by}>{d.uploadedBy}</span> : null}
          {readOnly ? null : <button style={styles.smallBtn} onClick={() => remove(d)} disabled={busy} aria-label={'Remove ' + d.name}>Remove</button>}
        </div>
      ))}
      {readOnly ? (
        list.length ? null : <span style={styles.label}>None attached yet</span>
      ) : (
        <button style={hideLabel ? styles.uploadBtnSmall : styles.uploadBtn} onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Uploading…' : hideLabel ? '+ Add documents' : '+ Add documents (pick several at once)'}
        </button>
      )}
      {error ? <p style={styles.error}>{error}</p> : null}
      {dialogNode}
    </div>
  );
}

const styles = {
  wrap: { marginTop: 0, marginBottom: 12, maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 6 },
  wrapBare: { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', minWidth: 0, width: '100%' },
  uploadBtnSmall: { alignSelf: 'flex-start', minHeight: 34, padding: '0 12px', borderRadius: 8, border: '1px dashed var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textTransform: 'none' },
  label: { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  fileRow: { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '6px 8px' },
  type: { fontSize: 9, fontWeight: 800, color: 'var(--text-tertiary)', border: '1px solid var(--border-strong)', borderRadius: 4, padding: '1px 4px' },
  fileLink: { fontSize: 13, color: 'var(--neon)', background: 'none', border: 'none', textAlign: 'left', flex: 1, minWidth: 0, cursor: 'pointer', padding: 0, overflowWrap: 'anywhere' },
  by: { fontSize: 11, color: 'var(--text-tertiary)' },
  uploadBtn: { width: '100%', boxSizing: 'border-box', minHeight: 40, textAlign: 'left', padding: '0 11px', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  smallBtn: { padding: '5px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-inset)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' },
  error: { fontSize: 11, color: 'var(--danger)', margin: '2px 0 0' },
};
