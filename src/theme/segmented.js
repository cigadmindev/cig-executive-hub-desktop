// One look for every set of tabs or filters in the Hub (Glass, Nov 2026):
// a soft grey track, and the chosen one is a white "thumb" sitting in it,
// the way iOS and macOS segmented controls look. Use segTrack on the row
// and segItem / segItemOn on each button.
export const segTrack = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  padding: 4,
  borderRadius: 999,
  background: 'rgba(var(--ink-rgb), 0.06)',
  boxShadow: 'inset 0 1px 2px rgba(30,40,60,0.06)',
  maxWidth: '100%',
  overflowX: 'auto',
  scrollbarWidth: 'none',
  flexWrap: 'nowrap',
  border: 'none',
  boxSizing: 'border-box',
};

export const segItem = {
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 600,
  letterSpacing: 0,
  textTransform: 'none',
  padding: '0 14px',
  minHeight: 34,
  height: 34,
  borderRadius: 999,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  margin: 0,
};

// The thumb's colour is a token so the hover rule in index.css can keep it
// white instead of greying it.
export const segItemOn = {
  background: 'var(--seg-thumb)',
  color: 'var(--text-primary)',
  fontWeight: 700,
  boxShadow: '0 1px 2px rgba(30,40,60,0.08), 0 4px 12px rgba(30,40,60,0.08)',
};

// Pick-one-or-more chips (states, filters you tick): selected is black.
export const chipOn = { background: 'var(--ink)', color: 'var(--ink-text)', borderColor: 'var(--ink)' };
