import React, { useEffect, useRef, useState } from 'react';

// A small bar when a newer version has been deployed.
//
// The build writes dist/version.json with a timestamp. This reads it on load,
// keeps that first value, and checks again every few minutes; when the file
// says something newer, a deploy has happened since this tab was opened.
//
// Dismissing hides it for four hours rather than forever - a permissions fix
// should not sit unloaded all day because someone tapped the X in the morning.
const CHECK_EVERY = 5 * 60 * 1000;
const HIDE_FOR = 4 * 60 * 60 * 1000;

export default function UpdateBanner() {
  const [stale, setStale] = useState(false);
  const [hiddenUntil, setHiddenUntil] = useState(0);
  // The version this tab is running. Set once, on the first successful read.
  const mine = useRef(null);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      try {
        // Cache-busted, or the browser would keep handing back the copy it
        // already has and the check would never notice anything.
        const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const { built } = await res.json();
        if (!alive || typeof built !== 'number') return;
        if (mine.current === null) {
          mine.current = built;
          return;
        }
        if (built > mine.current) setStale(true);
      } catch {
        // Offline, or the file is not there yet. Nothing to say either way.
      }
    };

    check();
    const timer = setInterval(check, CHECK_EVERY);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!stale || Date.now() < hiddenUntil) return null;

  return (
    <div style={styles.bar}>
      <span style={styles.dot} />
      <span style={styles.text}>The Hub was updated. Reload when you can.</span>
      <button data-primary="" style={styles.reload} onClick={() => window.location.reload()}>
        Reload
      </button>
      <button
        style={styles.dismiss}
        onClick={() => setHiddenUntil(Date.now() + HIDE_FOR)}
        aria-label="Hide for now"
        title="Hide for now"
      >
        ✕
      </button>
    </div>
  );
}

// Glass, like the rest of the Hub (Nov 2026): a soft frosted card with a
// small accent dot, a pill Reload button in the Hub's main button style, and
// a round hide button.
const styles = {
  // Placed in the layout rather than floating over the page - inline in the
  // sidebar above the profile, and in the header on a phone.
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 8px 8px 14px',
    marginBottom: 10,
    borderRadius: 18,
    background: 'rgba(var(--paper-rgb), 0.55)',
    border: '1px solid var(--glass-border)',
    boxShadow: '0 4px 14px rgba(20, 25, 35, 0.08)',
  },
  dot: { width: 8, height: 8, borderRadius: 4, background: 'var(--neon)', flexShrink: 0, boxShadow: '0 0 0 3px color-mix(in srgb, var(--neon) 22%, transparent)' },
  text: { flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 },
  reload: {
    height: 32,
    padding: '0 14px',
    borderRadius: 999,
    border: 'none',
    background: 'var(--ink)',
    color: 'var(--ink-text)',
    fontSize: 12.5,
    fontWeight: 700,
    fontFamily: 'inherit',
    textTransform: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  },
  dismiss: {
    width: 28,
    height: 28,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    background: 'rgba(var(--ink-rgb), 0.06)',
    border: 'none',
    padding: 0,
    color: 'var(--text-tertiary)',
    fontSize: 11,
    cursor: 'pointer',
  },
};
