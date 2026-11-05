// The permanent design language for the app — bold heavy type, high
// contrast, one loud neon accent used for arrows/badges/labels, slightly
// rounded corners (not sharp like true Nike, not soft like Apple — just a
// restrained, intentional curve).

export const nike = {
  pageTitle: { fontSize: 38, fontWeight: 800, letterSpacing: -1.2, textTransform: 'none', color: 'var(--text-primary)' },
  pageTitleSm: { fontSize: 26, fontWeight: 800, letterSpacing: -0.6, textTransform: 'none', color: 'var(--text-primary)' },
  sectionLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-tertiary)',
    textTransform: 'none',
    letterSpacing: 0,
  },
  card: {
    background: 'var(--bg-card)',
    border: 'none',
    borderRadius: 24,
    padding: '20px 22px',
    boxShadow: 'var(--shadow-md)',
  },
  cardName: { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'none', letterSpacing: -0.2 },
  chevron: { color: 'var(--text-tertiary)', fontSize: 20, fontWeight: 400, lineHeight: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, background: 'var(--neon)' },
  primaryButton: {
    background: 'var(--ink)',
    border: 'none',
    borderRadius: 999,
    color: 'var(--ink-text)',
    fontWeight: 600,
    textTransform: 'none',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    background: 'var(--bg-card)',
    border: 'none',
    borderRadius: 999,
    color: 'var(--text-primary)',
    fontWeight: 600,
  },
  input: {
    background: 'var(--bg-card)',
    border: 'none',
    borderRadius: 12,
    color: 'var(--text-primary)',
  },
  tab: {
    background: 'var(--bg-card)',
    border: 'none',
    borderRadius: 20,
    color: 'var(--text-secondary)',
    fontWeight: 800,
    // Sentence case like every other filter pill (15 Oct 2026).
    textTransform: 'none',
    letterSpacing: 0.3,
  },
  tabActive: {
    background: 'var(--ink)',
    color: 'var(--ink-text)',
  },
  modalCard: {
    background: 'var(--bg-card)',
    border: 'none',
    borderRadius: 24,
  },
  badge: {
    borderRadius: 8,
    fontWeight: 800,
    textTransform: 'none',
    letterSpacing: 0.3,
  },
};

