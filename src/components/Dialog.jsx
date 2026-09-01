import React from 'react';

// One dialog for confirmations and messages, replacing window.confirm and
// window.alert throughout.
//
// Browser dialogs render as OS chrome — a different typeface, buttons in the
// wrong order, no relation to anything around them. On a screen someone uses
// all day that reads as unfinished, and a destructive confirmation is exactly
// where you want the app to look like it knows what it's doing.
//
// tone 'danger' turns the confirm button red. Used for anything that can't be
// undone, so the button itself carries the warning rather than relying on the
// wording alone.
export default function Dialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onClose,
}) {
  if (!open) return null;

  const messageOnly = !onConfirm;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()} data-reveal="">
        <p style={styles.title}>{title}</p>
        {body ? <p style={styles.body}>{body}</p> : null}
        <div style={styles.buttons}>
          {messageOnly ? (
            <button style={{ ...styles.button, ...styles.confirm }} onClick={onClose}>
              OK
            </button>
          ) : (
            <>
              <button style={{ ...styles.button, ...styles.cancel }} onClick={onClose}>
                {cancelLabel}
              </button>
              <button
                style={{
                  ...styles.button,
                  ...styles.confirm,
                  ...(tone === 'danger' ? styles.danger : {}),
                }}
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
              >
                {confirmLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.78)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 400,
  },
  card: {
    width: 'min(380px, calc(100vw - 32px))',
    maxWidth: '90vw',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 22,
    boxShadow: 'var(--shadow-lg)',
  },
  title: { fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' },
  body: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 18px' },
  buttons: { display: 'flex', gap: 10 },
  button: { flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 12, fontWeight: 700 },
  cancel: { border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-secondary)' },
  confirm: { border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, letterSpacing: 0.4 },
  danger: { background: 'var(--danger)', color: '#FFFFFF' },
};
