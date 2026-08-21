import React from 'react';

// A small local icon set, built from simple SVG primitives (no new npm
// dependency — that risk was flagged earlier and this avoids it
// entirely). Every icon uses stroke="currentColor", so setting `color`
// on the wrapping element tints the icon directly — the same mechanism
// mobile's Ionicons use to render in the neon accent color, which plain
// emoji characters can't do (they're fixed-color glyphs, not
// recolorable shapes — that's why the grayscale-filter approach on
// emoji didn't actually match mobile's look).
const base = { fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

const PATHS = {
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="7.5" y1="3" x2="7.5" y2="7" />
      <line x1="16.5" y1="3" x2="16.5" y2="7" />
    </>
  ),
  signature: (
    <>
      <path d="M4 17c3-1 4-5 6-5s2 3 4 3 3-4 6-4" />
      <line x1="4" y1="20.5" x2="20" y2="20.5" />
    </>
  ),
  box: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M4 7.5L12 12l8-4.5" />
      <line x1="12" y1="12" x2="12" y2="21" />
    </>
  ),
  document: (
    <>
      <path d="M6 3h8l4 4v14H6V3z" />
      <path d="M14 3v4h4" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </>
  ),
  barChart: (
    <>
      <line x1="5" y1="20" x2="5" y2="12" />
      <line x1="12" y1="20" x2="12" y2="6" />
      <line x1="19" y1="20" x2="19" y2="15" />
      <line x1="3" y1="20" x2="21" y2="20" />
    </>
  ),
  megaphone: (
    <>
      <path d="M4 10v4a1 1 0 001 1h2l7 4V5l-7 4H5a1 1 0 00-1 1z" />
      <path d="M17 9a4 4 0 010 6" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </>
  ),
  lifeBuoy: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <line x1="5.5" y1="5.5" x2="9" y2="9" />
      <line x1="15" y1="15" x2="18.5" y2="18.5" />
      <line x1="18.5" y1="5.5" x2="15" y2="9" />
      <line x1="9" y1="15" x2="5.5" y2="18.5" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
      <circle cx="17" cy="8.5" r="2.6" />
      <path d="M15.5 14.7c2.6.3 4.5 2.4 4.5 5.3" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3.5l9.5 16.5h-19L12 3.5z" />
      <line x1="12" y1="10" x2="12" y2="14.5" />
      <circle cx="12" cy="17.3" r="0.15" fill="currentColor" stroke="none" />
    </>
  ),
  exit: (
    <>
      <path d="M13 4H6a1.5 1.5 0 00-1.5 1.5v13A1.5 1.5 0 006 20h7" />
      <line x1="10" y1="12" x2="21" y2="12" />
      <path d="M17 8l4 4-4 4" />
    </>
  ),
  trash: (
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <path d="M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" />
      <line x1="9" y1="7" x2="9" y2="4.5" />
      <line x1="15" y1="7" x2="15" y2="4.5" />
      <path d="M9 4.5h6" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.5M12 18v2.5M20.5 12H18M6 12H3.5M17.7 6.3l-1.8 1.8M8.1 15.9l-1.8 1.8M17.7 17.7l-1.8-1.8M8.1 8.1L6.3 6.3" />
    </>
  ),
  cash: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <line x1="5.5" y1="9" x2="5.5" y2="9.01" />
      <line x1="18.5" y1="15" x2="18.5" y2="15.01" />
    </>
  ),
  utensils: (
    <>
      <line x1="7" y1="3" x2="7" y2="21" />
      <path d="M4.5 3v6a2.5 2.5 0 005 0V3" />
      <path d="M17 3c-1.7 0-3 2-3 5s1.3 5 3 5v8" />
    </>
  ),
  wrench: (
    <>
      <path d="M14.5 6.5a4 4 0 00-5.4 5.1L4 16.7V20h3.3l5.1-5.1a4 4 0 005.1-5.4l-2.8 2.8-2-2 2.8-2.8z" />
    </>
  ),
  hammer: (
    <>
      <path d="M6 21l7-7" />
      <path d="M11 12l4.5-4.5 3 3L14 15" />
      <path d="M17 5l2 2-1.5 1.5-2-2z" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4.5" width="14" height="17" rx="2" />
      <rect x="9" y="3" width="6" height="3" rx="1" />
      <line x1="8" y1="11" x2="16" y2="11" />
      <line x1="8" y1="15" x2="16" y2="15" />
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <rect x="9.5" y="9.5" width="5" height="5" />
      <line x1="12" y1="2.5" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="21.5" />
      <line x1="2.5" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="21.5" y2="12" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="5" rx="1.5" />
      <path d="M5 9v9a2 2 0 002 2h10a2 2 0 002-2V9" />
      <line x1="10" y1="13" x2="14" y2="13" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M19 15l0.7 2 2 0.7-2 0.7-0.7 2-0.7-2-2-0.7 2-0.7z" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 2.5c3 1.7 4.5 5 4.5 8.5 0 3-1 5.5-2.3 7l-2.2-1-2.2 1c-1.3-1.5-2.3-4-2.3-7 0-3.5 1.5-6.8 4.5-8.5z" />
      <circle cx="12" cy="10" r="1.6" />
      <path d="M8.5 15.5L6 17.5v3l3-1.5" />
      <path d="M15.5 15.5L18 17.5v3l-3-1.5" />
    </>
  ),
  phone: (
    <>
      <path d="M5 4h3l1.5 4.5-2 1.5a13 13 0 006 6l1.5-2L19 15.5v3a1.5 1.5 0 01-1.6 1.5A15.5 15.5 0 013.5 5.6 1.5 1.5 0 015 4z" />
    </>
  ),
  network: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <line x1="8" y1="7.3" x2="16" y2="7.3" />
      <line x1="7" y1="8.3" x2="10.5" y2="16" />
      <line x1="17" y1="8.3" x2="13.5" y2="16" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7.5a4 4 0 018 0V11" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="15.5" y1="15.5" x2="20.5" y2="20.5" />
    </>
  ),
  close: (
    <>
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </>
  ),
  home: (
    <>
      <path d="M4 11.5L12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 001 1h10a1 1 0 001-1v-9" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6-6.5-11.5a6.5 6.5 0 0113 0C18.5 15 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </>
  ),
  thumbsUp: (
    <>
      <path d="M7 20V10" />
      <path d="M7 10l3.5-6a1.8 1.8 0 013 1.5l-1 4.5H18a2 2 0 012 2.3l-1.5 7A2 2 0 0116.5 21H9a2 2 0 01-2-2v-9z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  refresh: (
    <>
      <path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3" />
      <path d="M18 3.5V7h-3.5" />
      <path d="M6 20.5V17h3.5" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v6M15 3v6" />
      <path d="M6 9h12v3a6 6 0 01-12 0V9z" />
      <path d="M12 18v3" />
    </>
  ),
  creditCard: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <line x1="2.5" y1="10" x2="21.5" y2="10" />
      <line x1="6" y1="14.5" x2="10" y2="14.5" />
    </>
  ),
  message: (
    <>
      <path d="M4 5.5h16a1 1 0 011 1V16a1 1 0 01-1 1H9l-4.5 4v-4H4a1 1 0 01-1-1V6.5a1 1 0 011-1z" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.2" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.2" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.2" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.2" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20c0-4 3.4-6.8 7.5-6.8s7.5 2.8 7.5 6.8" />
    </>
  ),
};

export default function Icon({ name, size = 20, color = 'currentColor', filled = false, style }) {
  const content = PATHS[name];
  if (!content) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} stroke={color} fill={filled ? color : 'none'} style={style}>
      {content}
    </svg>
  );
}
