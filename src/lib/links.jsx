import React from 'react';

// Long web addresses pasted into a field (23 Oct 2026): a 200-character
// tracking link ran off the card and over the next column. Shown instead as
// the site's name ("culliganquench.com/…"), and as a link where a link fits.
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

const hostOf = (url) => {
  try {
    const u = new URL(/^https?:/i.test(url) ? url : 'https://' + url);
    // The site's own name: portal.culliganquench.com → culliganquench.com.
    return u.hostname.split('.').slice(-2).join('.');
  } catch {
    return url.length > 40 ? url.slice(0, 37) + '…' : url;
  }
};
const hrefOf = (url) => (/^https?:/i.test(url) ? url : 'https://' + url);

export const hasUrl = (text) => new RegExp(URL_RE.source, 'i').test(String(text ?? ''));

// Plain text with every address shortened, for places a link can't go
// (inside a button).
export function shortenUrls(text) {
  return String(text ?? '').replace(URL_RE, (m) => hostOf(m));
}

// The first address in the text, for an "Open" link beside a field.
export function firstUrl(text) {
  const m = String(text ?? '').match(URL_RE);
  return m ? { href: hrefOf(m[0]), label: hostOf(m[0]) } : null;
}

// Text with each address shown short and clickable. Clicks don't reach the
// row underneath (so opening the link doesn't also open the row).
export function Linkified({ text, style }) {
  const s = String(text ?? '');
  const parts = [];
  let last = 0;
  s.replace(URL_RE, (m, _g, i) => {
    if (i > last) parts.push(s.slice(last, i));
    parts.push(
      <a key={i} href={hrefOf(m)} target="_blank" rel="noreferrer" title={m} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--neon)', textDecoration: 'none', ...style }}>
        {hostOf(m)} ↗
      </a>
    );
    last = i + m.length;
    return m;
  });
  if (last < s.length) parts.push(s.slice(last));
  return <>{parts}</>;
}
