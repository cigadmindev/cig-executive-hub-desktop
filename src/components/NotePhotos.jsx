import React, { useEffect, useRef, useState } from 'react';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebaseConfig';
import Icon from './Icon';

// Photos on a daily checklist note (16 Oct 2026) - the broken fryer. A row
// of square thumbnails; tap one to see it full size. While the list is open
// the person working it can add photos (camera or library on a phone) and
// take one off with the x.
export default function NotePhotos({ photos = [], canEdit, onAdd, onRemove }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const room = 6 - photos.length;
  if (!photos.length && !canEdit) return null;

  const pick = async (e) => {
    const files = Array.from(e.target.files ?? []).slice(0, room);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      await onAdd(files);
    } catch (err) {
      setError(err?.message || 'Could not add the photo. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.wrap}>
      {photos.map((p) => (
        <Thumb key={p.path} path={p.path} onRemove={canEdit ? () => onRemove(p.path) : null} />
      ))}
      {canEdit && room > 0 ? (
        <>
          <button type="button" style={{ ...styles.add, ...(busy ? { opacity: 0.6 } : {}) }} disabled={busy} onClick={() => input.current?.click()}>
            <Icon name="camera" size={18} />
            <span>{busy ? 'Adding…' : photos.length ? 'Add more' : 'Add photos'}</span>
          </button>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={pick} />
        </>
      ) : null}
      {error ? <p style={styles.error}>{error}</p> : null}
    </div>
  );
}

function Thumb({ path, onRemove }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    getDownloadURL(storageRef(storage, path)).then((u) => live && setUrl(u)).catch(() => {});
    return () => { live = false; };
  }, [path]);
  return (
    <span style={styles.thumbWrap}>
      <a href={url ?? undefined} target="_blank" rel="noreferrer" style={{ ...styles.thumb, backgroundImage: url ? `url("${url}")` : 'none' }} aria-label="Open photo" />
      {onRemove ? (
        <button type="button" style={styles.remove} onClick={onRemove} aria-label="Remove photo">
          <Icon name="close" size={12} />
        </button>
      ) : null}
    </span>
  );
}

const styles = {
  wrap: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 },
  thumbWrap: { position: 'relative', display: 'inline-block' },
  thumb: {
    display: 'block', width: 64, height: 64, borderRadius: 10, backgroundColor: 'var(--bg-inset)',
    backgroundSize: 'cover', backgroundPosition: 'center', border: '1px solid var(--border)',
  },
  remove: {
    position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-card)', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', cursor: 'pointer',
  },
  add: {
    display: 'inline-flex', alignItems: 'center', gap: 8, height: 64, padding: '0 16px', borderRadius: 10,
    background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.35)', color: 'var(--neon)',
    fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', textTransform: 'none',
  },
  error: { width: '100%', fontSize: 12, color: 'var(--warn)', margin: '2px 0 0' },
};
