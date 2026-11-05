// Scroll bars show only while something is being scrolled (4 Nov 2026).
// One listener for the whole app: whatever box scrolls gets .is-scrolling
// (index.css shows its bar), taken off 900ms after it stops.
const timers = new WeakMap();

function onScroll(e) {
  const el = e.target === document || e.target === window ? document.documentElement : e.target;
  if (!(el instanceof Element)) return;
  el.classList.add('is-scrolling');
  clearTimeout(timers.get(el));
  timers.set(el, setTimeout(() => el.classList.remove('is-scrolling'), 900));
}

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
}
