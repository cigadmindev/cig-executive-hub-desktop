import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { plainError } from '../lib/errors';

// A file on a message. Transient by design: the scheduled sweep deletes it
// from Storage once everyone in the thread has viewed it, so anyone who needs
// to keep a copy downloads it to their own device.
//
// The lifecycle is stated on the row rather than left as a surprise — a file
// quietly disappearing is worse than one that told you it would.
// Opened through a ten-minute link the server hands out only to people in the
// conversation - never a stored link that works for anyone who has it.
export default function ChatAttachment({ messageId, attachment, onView }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  if (!attachment) return null;

  const open = async () => {
    setBusy(true);
    setFailed('');
    const tab = window.open('', '_blank');
    try {
      const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'getChatAttachmentUrl');
      const res = await fn({ messageId });
      if (tab) tab.location.href = res.data.url;
      else window.location.assign(res.data.url);
      onView?.();
    } catch (err) {
      if (tab) tab.close();
      setFailed(plainError(err, 'Could not open it.'));
    } finally {
      setBusy(false);
    }
  };

  if (attachment.removed) {
    return (
      <div style={{ ...styles.row, opacity: 0.5 }}>
        <div style={styles.badge}>—</div>
        <div style={styles.meta}>
          <div style={styles.name}>{attachment.name}</div>
          <div style={styles.note}>No longer available</div>
        </div>
      </div>
    );
  }

  const isImage = (attachment.contentType ?? '').startsWith('image/');
  const kind = isImage ? 'IMG' : (attachment.name.split('.').pop() ?? 'FILE').slice(0, 4).toUpperCase();

  return (
    <div style={styles.row}>
      <div style={styles.badge}>{kind}</div>
      <div style={styles.meta}>
        <div style={styles.name}>{attachment.name}</div>
        <div style={styles.note}>{failed || 'Removed once everyone has seen it'}</div>
      </div>
      <button type="button" style={{ ...styles.download, background: 'none', cursor: 'pointer', fontFamily: 'inherit' }} onClick={open} disabled={busy}>
        {busy ? 'OPENING…' : 'DOWNLOAD'}
      </button>
    </div>
  );
}

const styles = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 0 2px',
    // Was minWidth 260, which forced the row wider than a phone bubble and
    // truncated the filename regardless of available space. Wrapping lets
    // the download button drop below the name when there isn't room.
    flexWrap: 'wrap',
    rowGap: 8,
  },
  badge: {
    width: 34,
    height: 34,
    flexShrink: 0,
    borderRadius: 7,
    border: '1px solid var(--border-strong)',
    color: 'var(--text-tertiary)',
    fontSize: 9,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flex: '1 1 140px', minWidth: 0 },
  // Break long filenames across lines rather than cutting them off - the
  // extension is often the useful part and an ellipsis eats it.
  name: { fontSize: 13, color: 'var(--text-primary)', overflowWrap: 'anywhere' },
  note: { fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 },
  download: {
    padding: '5px 10px',
    borderRadius: 7,
    border: '1px solid var(--border-strong)',
    color: 'var(--text-secondary)',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 0.4,
    textDecoration: 'none',
    flexShrink: 0,
  },
};
