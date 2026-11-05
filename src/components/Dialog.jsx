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
    <div data-modal="" style={styles.backdrop} onClick={onClose}>
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
    background: 'rgba(20,24,32,0.28)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 400,
  },
  // Glass (Nov 2026): like an iPhone alert - centred, rounded, clear buttons.
  card: {
    width: 'min(360px, calc(100vw - 32px))',
    maxWidth: '90vw',
    background: 'rgba(var(--paper-rgb), 0.94)',
    border: '1px solid rgba(var(--paper-rgb), 0.8)',
    borderRadius: 24,
    padding: '24px 22px 20px',
    boxShadow: '0 24px 60px rgba(30,40,60,0.22)',
    textAlign: 'center',
  },
  title: { fontSize: 19, fontWeight: 700, letterSpacing: -0.3, color: 'var(--text-primary)', margin: '0 0 8px' },
  body: { fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 20px' },
  buttons: { display: 'flex', gap: 10 },
  button: { flex: 1, minHeight: 44, padding: '10px 0', borderRadius: 999, fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' },
  cancel: { border: 'none', background: 'rgba(var(--ink-rgb), 0.07)', color: 'var(--text-primary)' },
  confirm: { border: 'none', background: 'var(--ink)', color: 'var(--ink-text)' },
  danger: { background: 'var(--danger)', color: '#FFFFFF' },
};
