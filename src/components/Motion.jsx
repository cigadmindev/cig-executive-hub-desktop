import React, { useEffect, useRef, useState } from 'react';

// Motion pieces shared across the Hub (28 Oct 2026, sketch 35).
// The rules: quick (everything settles in under half a second), only on
// open or on change (nothing moves while you read), one easing everywhere,
// and nothing at all for anyone with "reduce motion" switched on.

export const EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)';

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// A number that counts up from zero the first time it shows, then simply
// follows the real value. A null value renders nothing, same as before.
export function CountUp({ value, duration = 700, style }) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  const played = useRef(false);
  useEffect(() => {
    if (value === null || value === undefined) return undefined;
    if (played.current || prefersReducedMotion() || !value) {
      setShown(value);
      played.current = played.current || !!value;
      return undefined;
    }
    played.current = true;
    let raf;
    const start = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(eased * value));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  if (value === null || value === undefined) return null;
  return <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{shown}</span>;
}

// A progress ring that fills to its percentage when it first appears.
export function Ring({ pct = 0, size = 46, stroke = 4.5, color = 'var(--neon)', label }) {
  const [p, setP] = useState(() => (prefersReducedMotion() ? pct : 0));
  useEffect(() => {
    const id = requestAnimationFrame(() => setP(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span style={{ position: 'relative', width: size, height: size, flexShrink: 0, display: 'inline-block' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(100, p)) / 100)}
          style={{ transition: `stroke-dashoffset 0.9s ${EASE}` }}
        />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 800, color: 'var(--text-primary)' }}>
        {label ?? `${Math.round(pct)}%`}
      </span>
    </span>
  );
}

// Placeholder rows that shimmer while a list loads, so a page never sits
// blank or reads as broken.
export function SkeletonRows({ rows = 4, padding = '13px 16px' }) {
  const widths = [68, 54, 74, 48, 62, 57];
  return (
    <div aria-label="Loading" role="status">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding, borderBottom: '1px solid var(--border)' }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span data-skeleton="" style={{ height: 12, width: `${widths[i % widths.length]}%` }} />
            <span data-skeleton="" style={{ height: 9, width: `${widths[(i + 3) % widths.length] / 2}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

// Small confirmation that slides up after an action ("Claimed.", "Approved.").
// Call toast('Claimed.', 'It is yours at Ridgeland.') from anywhere; the one
// <Toaster /> in the layout shows it. It never blocks anything.
const listeners = new Set();
export function toast(title, body) {
  listeners.forEach((fn) => fn({ id: Date.now() + Math.random(), title, body }));
}

export function Toaster({ bottom = 24 }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const add = (t) => {
      setItems((cur) => [...cur.slice(-2), t]);
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), 2800);
    };
    listeners.add(add);
    return () => listeners.delete(add);
  }, []);
  if (items.length === 0) return null;
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom, zIndex: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none', padding: '0 16px' }} aria-live="polite">
      {items.map((t) => (
        <div key={t.id} data-toast="" style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: '10px 15px', fontSize: 13, color: 'var(--text-secondary)', boxShadow: 'var(--shadow-lg)', maxWidth: 420 }}>
          <b style={{ color: 'var(--neon)', fontWeight: 800 }}>{t.title}</b>
          {t.body ? <span> {t.body}</span> : null}
        </div>
      ))}
    </div>
  );
}
