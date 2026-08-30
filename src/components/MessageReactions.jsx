import React, { useState } from 'react';

// Reactions on a message: a hover picker, and a pill showing what's been added.
//
// Monochrome line icons rather than colour emoji — colour emoji render
// differently on every platform and read as decoration next to an interface
// built entirely from stroked icons.
// Reactions for an operations thread rather than a social one — what people
// need to signal here is acknowledgment and status, not sentiment. A heart on
// a permit deadline says nothing.
// Reactions for an operations thread rather than a social one — what people
// need to signal here is acknowledgment and status, not sentiment.
//
// Marks inside a circle are drawn oversized: at 13px the circle takes the full
// viewbox and a proportionally-sized mark inside it disappears.
const OPTIONS = [
  {
    key: 'up',
    label: 'Got it',
    paths: ['M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3'],
  },
  { key: 'urgent', label: 'Urgent', paths: ['M12 3v13M12 20.5h.01'] },
  {
    key: 'question',
    label: 'Question',
    paths: ['M7.5 7.5a4.5 4.5 0 0 1 8.8 1.5c0 3-4.3 4.5-4.3 4.5M12 20.5h.01'],
  },
  {
    key: 'laugh',
    label: 'Ha',
    circle: true,
    paths: ['M18 13a6 6 0 0 1-6 5 6 6 0 0 1-6-5h12z', 'M9 9h.01', 'M15 9h.01'],
  },
];

function Glyph({ option, size = 13, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {option.circle ? <circle cx="12" cy="12" r="10" /> : null}
      {option.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

export function ReactionPicker({ onPick }) {
  return (
    <div style={styles.inlinePicker}>
      {OPTIONS.map((o) => (
        <button key={o.key} style={styles.pickerButton} onClick={() => onPick(o.key)} title={o.label}>
          <Glyph option={o} size={13} color="var(--text-secondary)" />
        </button>
      ))}
    </div>
  );
}

// The pill sits on the bubble's inner corner — the edge facing the
// conversation. Your messages are right-aligned so that's their left corner;
// theirs are left-aligned so it's their right.
export default function MessageReactions({ reactions, onToggle, isMe, myUid, pillsOnly }) {
  const [picking, setPicking] = useState(false);

  // Grouped so five people reacting with the same thing is one pill, not five.
  const counts = OPTIONS.map((o) => ({
    option: o,
    people: reactions.filter((r) => r.emoji === o.key),
  })).filter((g) => g.people.length > 0);

  return (
    <div style={{ ...styles.wrap, ...(isMe ? { left: -6 } : { right: -6 }) }}>
      {counts.length > 0 ? (
        <div style={styles.pillRow}>
          {counts.map(({ option, people }) => {
            const mine = people.some((p) => p.uid === myUid);
            return (
              <button
                key={option.key}
                style={{ ...styles.pill, ...(mine ? styles.pillMine : {}) }}
                onClick={() => onToggle(option.key)}
                title={people.map((p) => p.name).join(', ')}
              >
                <Glyph option={option} color={mine ? 'var(--neon)' : 'var(--text-secondary)'} />
                {people.length > 1 ? <span style={styles.count}>{people.length}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

    </div>
  );
}

const styles = {
  wrap: { position: 'absolute', top: -11, display: 'flex', alignItems: 'center', gap: 4, zIndex: 2 },
  inlinePicker: { display: 'flex', gap: 2 },
  pillRow: { display: 'flex', gap: 3 },
  pill: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    padding: '2px 7px',
    borderRadius: 9,
    border: '1px solid var(--border-strong)',
    background: 'var(--bg-elevated)',
  },
  pillMine: { borderColor: 'var(--neon)' },
  count: { fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 },
  addButton: {
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    opacity: 0,
    padding: 0,
  },
  picker: {
    display: 'flex',
    gap: 2,
    padding: 3,
    borderRadius: 9,
    border: '1px solid var(--border-strong)',
    background: 'var(--bg-elevated)',
    boxShadow: 'var(--shadow-md)',
  },
  pickerButton: {
    width: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    border: 'none',
    background: 'none',
    padding: 0,
  },
};
