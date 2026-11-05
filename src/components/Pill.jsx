import React, { useEffect, useRef, useState } from 'react';

// The one status label (V2, 8 Oct 2026). A colour always means the same thing:
//   amber  someone needs to act      Pending, New, Due soon
//   cyan   someone is on it          In progress, Talking, Ordered
//   green  good to go                Approved, Confirmed, Renewed
//   grey   finished                  Done
//   red    stopped or late           Declined, Overdue, Lost
// Glass (Nov 2026): soft tinted pills with dark text of the same colour.
const TONES = {
  amber: ['var(--amber-bg)', 'var(--amber-fg)'],
  cyan: ['var(--cyan-bg)', 'var(--cyan-fg)'],
  green: ['var(--green-bg)', 'var(--green-fg)'],
  grey: ['rgba(var(--ink-rgb), 0.06)', 'var(--text-secondary)'],
  red: ['var(--red-bg)', '#B42318'],
};

export default function Pill({ tone = 'grey', children }) {
  const [bg, fg] = TONES[tone] ?? TONES.grey;
  // One small pulse when the status changes while you're looking at it
  // (28 Oct 2026). Not on first appearance - a page full of pulsing labels
  // would be noise.
  const label = typeof children === 'string' ? children : String(tone);
  const prev = useRef(label);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (prev.current !== label) {
      prev.current = label;
      setPulse((n) => n + 1);
    }
  }, [label]);
  return (
    <span key={pulse} data-pulse={pulse ? '' : undefined} style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0, textTransform: 'none', borderRadius: 999, padding: '4px 10px', background: bg, color: fg, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {children}
    </span>
  );
}
