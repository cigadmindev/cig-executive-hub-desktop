// Every page with something to add - a request, a receipt, a document - puts
// its button in the same place: top right, beside the title, the same size.
export const pageHeader = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 };
export const pageAction = {
  flexShrink: 0, background: 'var(--neon)', color: '#0A0A0B', border: 'none', borderRadius: 10,
  padding: '10px 16px', fontWeight: 800, fontSize: 13, letterSpacing: 0.2, textTransform: 'none',
  cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', minHeight: 40,
};

// "‹ Taste Starkville" above the title - the same on every page.
export const backLink = {
  display: 'inline-block', fontSize: 13, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', marginBottom: 10,
};
