// The permanent design language for the app — bold heavy type, high
// contrast, one loud neon accent used for arrows/badges/labels, slightly
// rounded corners (not sharp like true Nike, not soft like Apple — just a
// restrained, intentional curve).

export const nike = {
  pageTitle: { fontSize: 36, fontWeight: 900, letterSpacing: -0.8, textTransform: 'uppercase', color: '#FFFFFF' },
  pageTitleSm: { fontSize: 26, fontWeight: 900, letterSpacing: -0.5, textTransform: 'uppercase', color: '#FFFFFF' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 900,
    color: 'var(--neon)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    background: 'var(--bg-card)',
    border: 'none',
    borderRadius: 10,
    padding: '18px 20px',
    boxShadow: 'none',
  },
  cardName: { fontSize: 14, fontWeight: 800, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.3 },
  chevron: { color: 'var(--neon)', fontSize: 16, fontWeight: 900 },
  dot: { width: 8, height: 8, borderRadius: 4, background: 'var(--neon)' },
  primaryButton: {
    background: 'var(--neon)',
    border: 'none',
    borderRadius: 10,
    color: 'var(--neon-text)',
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    background: 'var(--bg-card)',
    border: 'none',
    borderRadius: 10,
    color: '#FFFFFF',
    fontWeight: 700,
  },
  input: {
    background: 'var(--bg-card)',
    border: 'none',
    borderRadius: 10,
    color: '#FFFFFF',
  },
  tab: {
    background: 'var(--bg-card)',
    border: 'none',
    borderRadius: 20,
    color: 'var(--text-secondary)',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tabActive: {
    background: 'var(--neon)',
    color: 'var(--neon-text)',
  },
  modalCard: {
    background: '#161618',
    border: 'none',
    borderRadius: 16,
  },
  badge: {
    borderRadius: 8,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
};

