import React from 'react';

// The one status label (V2, 8 Oct 2026). A colour always means the same thing:
//   amber  someone needs to act      Waiting, New, Due soon
//   cyan   someone is on it          In progress, Talking, Ordered
//   green  good to go                Approved, Confirmed, Renewed
//   grey   finished                  Done
//   red    stopped or late           Declined, Overdue, Lost
const TONES = {
  amber: ['#3A2A0E', '#E8B93B'],
  cyan: ['#0D3640', '#22D3EE'],
  green: ['#0E2E22', '#4ADE80'],
  grey: ['#24242B', '#B4B4C0'],
  red: ['#3A1614', '#F87171'],
};

export default function Pill({ tone = 'grey', children }) {
  const [bg, fg] = TONES[tone] ?? TONES.grey;
  return (
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', borderRadius: 5, padding: '3px 8px', background: bg, color: fg, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {children}
    </span>
  );
}
