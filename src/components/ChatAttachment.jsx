import React from 'react';

// A file on a message. Transient by design: the scheduled sweep deletes it
// from Storage once everyone in the thread has viewed it, so anyone who needs
// to keep a copy downloads it to their own device.
//
// The lifecycle is stated on the row rather than left as a surprise — a file
// quietly disappearing is worse than one that told you it would.
export default function ChatAttachment({ attachment, onView }) {
  if (!attachment) return null;

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
        <div style={styles.note}>Removed once everyone has seen it</div>
      </div>
      <a
        href={attachment.url}
        download={attachment.name}
        target="_blank"
        rel="noreferrer"
        style={styles.download}
        onClick={onView}
      >
        DOWNLOAD
      </a>
    </div>
  );
}

const styles = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 0 2px',
    minWidth: 260,
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
  meta: { flex: 1, minWidth: 0 },
  name: { fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
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
