import React from 'react';

// The one way a locked restaurant, location or folder says so (14 Oct 2026):
// a quiet pill on the right, "Request access" or "Pending" - no lock emoji,
// the same on every page.
export default function RequestPill({ pending }) {
  return <span style={{ ...styles.pill, ...(pending ? styles.pending : {}) }}>{pending ? 'Pending' : 'Request access'}</span>;
}

const styles = {
  pill: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.3,
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-strong)',
    borderRadius: 999,
    padding: '4px 10px',
    whiteSpace: 'nowrap',
    textTransform: 'none',
  },
  pending: { color: 'var(--warn)', borderColor: 'rgba(232,185,59,0.5)' },
};
