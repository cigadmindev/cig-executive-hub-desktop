import React, { useState } from 'react';

// Click to edit inline; hitting Save shows a confirmation step with the
// old and new value side by side before it actually commits.
export default function ConfirmEditField({ label, value, placeholder, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [confirming, setConfirming] = useState(false);

  const startEdit = () => {
    setDraft(value || '');
    setEditing(true);
  };

  const requestSave = () => {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setConfirming(true);
  };

  const confirmSave = () => {
    onSave(draft);
    setConfirming(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={styles.wrap}>
        {label ? <span style={styles.label}>{label}</span> : null}
        <div style={styles.editRow}>
          <input
            style={styles.input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && requestSave()}
          />
          <button style={styles.saveBtn} onClick={requestSave}>
            Save
          </button>
          <button style={styles.cancelBtn} onClick={() => setEditing(false)}>
            ✕
          </button>
        </div>

        {confirming ? (
          <div style={styles.confirmBackdrop} onClick={() => setConfirming(false)}>
            <div style={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
              <p style={styles.confirmTitle}>Confirm change{label ? ` — ${label}` : ''}</p>
              <div style={styles.confirmDiffRow}>
                <span style={styles.confirmOld}>{value || '(empty)'}</span>
                <span style={styles.confirmArrow}>→</span>
                <span style={styles.confirmNew}>{draft || '(empty)'}</span>
              </div>
              <div style={styles.confirmButtonsRow}>
                <button style={styles.cancelBtnFull} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button style={styles.saveBtnFull} onClick={confirmSave}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      {label ? <span style={styles.label}>{label}</span> : null}
      <button style={styles.displayButton} onClick={startEdit}>
        <span style={{ color: value ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
          {value || placeholder || 'Tap to add'}
        </span>
        <span style={styles.editIcon}>✎</span>
      </button>
    </div>
  );
}

const styles = {
  wrap: { marginBottom: 10, minWidth: 0, maxWidth: '100%' },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 },
  displayButton: {
    width: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-inset)',
    fontSize: 13,
    textAlign: 'left',
  },
  editIcon: { fontSize: 11, color: 'var(--text-tertiary)' },
  editRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  input: {
    flex: '1 1 100px',
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-strong)',
    background: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
  },
  saveBtn: { padding: '0 12px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 12, fontWeight: 900, flexShrink: 0, textTransform: 'uppercase' },
  cancelBtn: { padding: '0 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, flexShrink: 0 },

  confirmBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  confirmCard: { width: 340, background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-lg)', padding: 20, boxShadow: 'var(--shadow-lg)' },
  confirmTitle: { fontSize: 13, fontWeight: 700, marginBottom: 12 },
  confirmDiffRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 16, flexWrap: 'wrap' },
  confirmOld: { color: 'var(--text-tertiary)', textDecoration: 'line-through' },
  confirmArrow: { color: 'var(--text-secondary)' },
  confirmNew: { color: 'var(--text-primary)', fontWeight: 700 },
  confirmButtonsRow: { display: 'flex', gap: 10 },
  cancelBtnFull: { flex: 1, padding: '9px 0', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 13 },
  saveBtnFull: { flex: 1, padding: '9px 0', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },
};
