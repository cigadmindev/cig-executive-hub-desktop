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
      <span style={styles.text}>The Hub has been updated.</span>
      <button style={styles.reload} onClick={() => window.location.reload()}>
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

const styles = {
  bar: {
    position: 'fixed',
    bottom: 18,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    borderRadius: 12,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-strong)',
    boxShadow: 'var(--shadow-lg)',
    maxWidth: 'calc(100vw - 32px)',
  },
  text: { fontSize: 13, color: 'var(--text-primary)' },
  reload: {
    padding: '6px 12px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--neon)',
    color: 'var(--neon-text)',
    fontSize: 12,
    fontWeight: 800,
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  dismiss: {
    background: 'none',
    border: 'none',
    padding: 4,
    color: 'var(--text-tertiary)',
    fontSize: 13,
    cursor: 'pointer',
  },
};
