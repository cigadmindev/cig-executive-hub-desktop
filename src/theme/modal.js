// One pop-up look (V2, 8 Oct 2026). Every pop-up's backdrop and card build on
// these, so they share one shade, one border, one corner and one shadow, and
// a tall one scrolls inside the screen on a phone instead of running off it.
export const modalBackdrop = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100, boxSizing: 'border-box',
};
export const modalLook = {
  background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16,
  boxShadow: 'var(--shadow-lg)', maxWidth: '100%', boxSizing: 'border-box',
};
export const modalSurface = { ...modalLook, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' };
