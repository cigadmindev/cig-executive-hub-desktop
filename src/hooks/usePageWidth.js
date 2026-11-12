import { createContext, useContext, useEffect, useState } from 'react';
import { useIsNarrow } from './useIsNarrow';

// How wide the page area is, beside the sidebar (Nov 2026, half-screen
// windows). Pages use this instead of the window width, because a page next
// to the sidebar has less room than the window suggests. AppLayout measures
// its content area and shares the width here.
export const PageWidthContext = createContext(Infinity);

export function usePageWidth() {
  return useContext(PageWidthContext);
}

// Measures an element's inner width and keeps it up to date.
export function useMeasuredWidth(ref) {
  const [w, setW] = useState(Infinity);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setW(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

// Below this window width (and above the phone layout) the sidebar
// becomes a slim strip of icons.
export const SLIM_SIDEBAR_MAX = 1099;

export function useSlimSidebar() {
  const q = `(min-width: 768px) and (max-width: ${SLIM_SIDEBAR_MAX}px)`;
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener?.('change', f);
    f();
    return () => m.removeEventListener?.('change', f);
  }, [q]);
  return on;
}

// True on a phone, and also when the page area is narrower than `min`
// pixels (a half-screen window). Pages that already have a tidy phone layout
// use it for tight windows too, instead of squeezing the desktop layout.
export function useTight(min) {
  const narrow = useIsNarrow();
  const w = usePageWidth();
  return narrow || w < min;
}
