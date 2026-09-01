import { useEffect, useState } from 'react';

// Below this, the sidebar is replaced by the bottom bar.
export const NARROW_BREAKPOINT = 768;

const QUERY = `(max-width: ${NARROW_BREAKPOINT - 1}px)`;

/**
 * Whether the viewport is currently narrow enough to need phone layout.
 *
 * Deliberately measures the viewport rather than sniffing the user agent.
 * Device strings misreport tablets, miss new hardware, and say nothing at
 * all when someone drags a desktop window narrow — the viewport is the
 * thing that actually decides whether a layout fits.
 *
 * matchMedia rather than a resize listener: resize fires continuously
 * during a drag and would need throttling, while this fires once, only
 * when the threshold is genuinely crossed. It also covers orientation
 * changes and browser zoom for free.
 *
 * In the packaged Mac app this is always false — an Electron window is
 * never phone-width — so the desktop layout is unaffected.
 */
export function useIsNarrow() {
  const [isNarrow, setIsNarrow] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia(QUERY);
    const onChange = (e) => setIsNarrow(e.matches);

    // Safari below 14 only has the deprecated addListener form.
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);

    // The query may have changed between first render and this running.
    setIsNarrow(mql.matches);

    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, []);

  return isNarrow;
}
