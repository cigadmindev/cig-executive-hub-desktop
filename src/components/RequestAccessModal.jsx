import React, { useState } from 'react';

// target: { label } — what's being requested, just for display.
// onSubmit(reason) — called when the person confirms.
export default function RequestAccessModal({ target, onSubmit, onClose }) {
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    onSubmit(reason.trim());
  };

  return (
    <div style={styles.modalBackdrop} onClick={onClose}>
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>Request Access</h2>
        <p style={styles.modalBody}>
          Requesting access to <strong style={{ color: 'var(--text-primary)' }}>{target.label}</strong>
        </p>

        <label style={styles.label}>What do you need this for? (optional, but helps the admin decide faster)</label>
        <textarea
          style={styles.textarea}
          placeholder="e.g. I'm covering catering orders for this location this month"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />

        <div style={styles.buttonsRow}>
          <button style={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button style={styles.submitButton} onClick={handleSubmit}>
            Send Request
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { width: 'min(380px, calc(100vw - 32px))', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-lg)', padding: 24, boxShadow: 'var(--shadow-lg)' },
  modalTitle: { fontSize: 17, fontWeight: 700, margin: '0 0 8px', letterSpacing: -0.2 },
  modalBody: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 },
  textarea: {
    width: '100%',
    minHeight: 80,
    padding: '9px 11px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  buttonsRow: { display: 'flex', gap: 10, marginTop: 18 },
  cancelButton: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    fontSize: 13,
    fontWeight: 500,
  },
  submitButton: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--accent)',
    color: '#FFFFFF',
    fontWeight: 600,
    fontSize: 13,
  },
};
