// Every page with something to add - a request, a receipt, a document - puts
// its button in the same place: top right, beside the title, the same size.
export const pageHeader = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 };
// Glass (Nov 2026): a near-black pill, like the mockups.
export const pageAction = {
  flexShrink: 0, background: 'var(--ink)', color: 'var(--ink-text)', border: 'none', borderRadius: 999,
  padding: '11px 20px', fontWeight: 600, fontSize: 15, letterSpacing: 0, textTransform: 'none',
  cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', minHeight: 44,
};

// "‹ Taste Starkville" above the title - the same on every page.
export const backLink = {
  display: 'inline-block', fontSize: 14, fontWeight: 600, color: 'var(--neon)', textDecoration: 'none', marginBottom: 8,
};
