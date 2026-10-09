// How every pop-up behaves (V2, 8 Oct 2026):
//   - Escape closes the top pop-up, the same as clicking outside it;
//   - a pop-up with a form in it (data-modal-keep) does NOT close when the
//     mouse clicks outside it, so a half-filled form is never lost by a
//     stray click. Its Cancel / ✕ / Escape still close it.
// Backdrops carry data-modal; this listens once for the whole Hub.
if (typeof document !== 'undefined' && !window.__hubModalKeys) {
  window.__hubModalKeys = true;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = document.querySelectorAll('[data-modal]');
    const top = open[open.length - 1];
    if (!top) return;
    e.preventDefault();
    top.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  // Capture phase, before React sees it: a real click on the backdrop itself
  // (not inside the card) of a form pop-up is ignored.
  document.addEventListener(
    'click',
    (e) => {
      if (e.isTrusted && e.target instanceof window.Element && e.target.hasAttribute('data-modal-keep')) {
        e.stopPropagation();
      }
    },
    true
  );
}
