import React, { useEffect, useRef, useState } from 'react';

// A row that scrolls sideways and works with a mouse too (Nov 2026).
// A trackpad or a phone swipes it as usual; a mouse wheel scrolls it
// sideways while the pointer is over it, and round arrow buttons appear at
// whichever end has more to see. The edges fade so it's clear the row
// keeps going.
export default function SideScroller({ style, children, label = 'More' }) {
  const ref = useRef(null);
  const [ends, setEnds] = useState({ left: false, right: false });

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setEnds({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    measure();
    // A mouse wheel moves up and down; turn that into sideways movement
    // while there's still somewhere to go, then let the page scroll on.
    const onWheel = (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // a trackpad already scrolls sideways
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = el.scrollLeft >= max - 1 && e.deltaY > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('scroll', measure, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('scroll', measure);
      ro?.disconnect();
    };
  }, []);

  const nudge = (dir) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  const fade = ends.left && ends.right
    ? 'linear-gradient(90deg, transparent 0, #000 44px, #000 calc(100% - 44px), transparent 100%)'
    : ends.left
      ? 'linear-gradient(90deg, transparent 0, #000 44px)'
      : ends.right
        ? 'linear-gradient(90deg, #000 calc(100% - 44px), transparent 100%)'
        : 'none';

  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <div
        ref={ref}
        className="hub-side-scroll"
        style={{ ...style, overflowX: 'auto', scrollbarWidth: 'none', WebkitMaskImage: fade, maskImage: fade }}
      >
        {children}
      </div>
      {ends.left ? (
        <button type="button" style={{ ...arrow, left: 0 }} onClick={() => nudge(-1)} aria-label={'Scroll back'}>‹</button>
      ) : null}
      {ends.right ? (
        <button type="button" style={{ ...arrow, right: 0 }} onClick={() => nudge(1)} aria-label={label}>›</button>
      ) : null}
    </div>
  );
}

const arrow = {
  position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, borderRadius: 999,
  border: '1px solid var(--border-strong)', background: 'var(--bg-elevated)', color: 'var(--text-primary)',
  fontSize: 17, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', boxShadow: '0 4px 14px rgba(20,24,32,0.18)', padding: 0, zIndex: 2,
};
