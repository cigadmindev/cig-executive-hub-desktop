import React from 'react';

// Reactions on a message (rebuilt Nov 2026): a rounded bar of six clear
// marks, like a phone's tapbacks, and a small pill on the bubble showing what
// has been added. One reaction per person - picking another swaps it, picking
// the same one again takes it off.
//
// Line icons rather than colour emoji, so they look the same on every
// computer and phone. The keys of the first four ('up', 'urgent',
// 'question', 'laugh') are the ones older messages already use.
const OPTIONS = [
  { key: 'up', label: 'Got it', paths: ['M7 10v11', 'M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 7A2 2 0 0 1 17.5 21H7V10l4.3-7.4A1.9 1.9 0 0 1 15 5.9z'] },
  { key: 'done', label: 'Done', paths: ['M5 12.5l4.5 4.5L19 7'] },
  { key: 'heart', label: 'Love it', paths: ['M19.5 13.6 12 21l-7.5-7.4A5 5 0 0 1 12 6.7a5 5 0 0 1 7.5 6.9z'] },
  { key: 'urgent', label: 'Urgent', paths: ['M9 4v10', 'M15 4v10', 'M9 19.5h.01', 'M15 19.5h.01'] },
  { key: 'question', label: 'Question', paths: ['M8.5 8.5a3.6 3.6 0 0 1 7 1.2c0 2.4-3.5 3.3-3.5 5.3', 'M12 19.5h.01'] },
  { key: 'laugh', label: 'Ha', circle: true, paths: ['M8 14a4.5 4.5 0 0 0 8 0z', 'M9 9.5h.01', 'M15 9.5h.01'] },
];

function Glyph({ option, size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {option.circle ? <circle cx="12" cy="12" r="9.5" /> : null}
      {option.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

// The bar that appears beside a message when you point at it (or tap it on
// a phone). The one you've already picked is lit.
export function ReactionPicker({ onPick, mine }) {
  return (
    <div style={styles.bar} data-reveal="" onClick={(e) => e.stopPropagation()}>
      {OPTIONS.map((o) => {
        const on = mine === o.key;
        return (
          <button
            key={o.key}
            style={{ ...styles.barButton, ...(on ? styles.barButtonOn : {}) }}
            onClick={() => onPick(o.key)}
            title={o.label}
            aria-label={o.label}
            aria-pressed={on}
          >
            <Glyph option={o} color={on ? 'var(--neon-text)' : 'var(--text-primary)'} />
          </button>
        );
      })}
    </div>
  );
}

// The pill sits on the bubble's inner top corner - the edge facing the
// conversation. Your messages are on the right, so it's their left corner.
export default function MessageReactions({ reactions, onToggle, isMe, myUid }) {
  const counts = OPTIONS.map((o) => ({
    option: o,
    people: reactions.filter((r) => r.emoji === o.key),
  })).filter((g) => g.people.length > 0);
  if (counts.length === 0) return null;

  return (
    <div style={{ ...styles.wrap, ...(isMe ? { left: -8 } : { right: -8 }) }}>
      {counts.map(({ option, people }) => {
        const mineHere = people.some((p) => p.uid === myUid);
        return (
          <button
            key={option.key}
            style={{ ...styles.pill, ...(mineHere ? styles.pillMine : {}) }}
            onClick={(e) => { e.stopPropagation(); onToggle(option.key); }}
            title={option.label + ' · ' + people.map((p) => p.name).join(', ')}
          >
            <Glyph option={option} size={14} color={mineHere ? 'var(--neon-text)' : 'var(--text-primary)'} />
            {people.length > 1 ? <span style={{ ...styles.count, ...(mineHere ? { color: 'var(--neon-text)' } : {}) }}>{people.length}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

const styles = {
  bar: {
    display: 'flex',
    gap: 2,
    padding: 4,
    borderRadius: 999,
    background: 'var(--surface-pop)',
    border: '1px solid var(--border)',
    boxShadow: '0 8px 24px rgba(30,40,60,0.16)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    backdropFilter: 'blur(20px) saturate(180%)',
  },
  barButton: {
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    border: 'none',
    background: 'none',
    padding: 0,
    cursor: 'pointer',
  },
  barButtonOn: { background: 'var(--neon)' },
  wrap: { position: 'absolute', top: -14, display: 'flex', gap: 4, zIndex: 2 },
  pill: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: 26,
    padding: '0 8px',
    borderRadius: 13,
    border: '1px solid var(--border)',
    background: 'var(--surface-pop)',
    boxShadow: '0 2px 8px rgba(30,40,60,0.12)',
    cursor: 'pointer',
  },
  pillMine: { background: 'var(--neon)', borderColor: 'var(--neon)' },
  count: { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700 },
};
