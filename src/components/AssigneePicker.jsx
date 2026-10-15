import React from 'react';

// One or more people on an item (15 Oct 2026): a chip per person with an x
// to take them off, and an "+ Add person" list of whoever else can be given
// it. Used by the opening checklist and Operational POC, so both work the
// same way. The screen decides who may be picked and what saving does.
export default function AssigneePicker({ uids, names, people, onChange, busy = false }) {
  const others = people.filter((p) => !uids.includes(p.uid));
  return (
    <div style={styles.wrap}>
      {uids.map((uid, i) => (
        <span key={uid} style={styles.chip}>
          {names[i]}
          <button
            type="button"
            style={styles.x}
            disabled={busy}
            aria-label={'Take ' + names[i] + ' off'}
            onClick={() => onChange(uids.filter((u) => u !== uid))}
          >
            ×
          </button>
        </span>
      ))}
      {others.length ? (
        <span style={styles.addWrap}>
          <select
            style={styles.addSelect}
            value=""
            disabled={busy}
            aria-label="Add person"
            onChange={(e) => e.target.value && onChange([...uids, e.target.value])}
          >
            <option value="">+ Add person</option>
            {others.map((p) => (
              <option key={p.uid} value={p.uid}>{p.name}{p.job ? ' · ' + p.job : ''}</option>
            ))}
          </select>
        </span>
      ) : uids.length === 0 ? (
        <span style={styles.none}>Nobody can be given this here yet</span>
      ) : null}
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: 'rgba(34,211,238,.12)', color: 'var(--neon)',
    borderRadius: 999, padding: '4px 4px 4px 11px', fontSize: 13, fontWeight: 700,
  },
  x: {
    background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 16, lineHeight: 1,
    padding: '2px 6px', cursor: 'pointer', textTransform: 'none',
  },
  addWrap: { position: 'relative', display: 'inline-flex' },
  addSelect: {
    appearance: 'none', WebkitAppearance: 'none',
    background: 'none', border: '1px dashed rgba(255,255,255,.25)', borderRadius: 999,
    color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, padding: '5px 12px', cursor: 'pointer',
    fontFamily: 'inherit', maxWidth: 220,
  },
  none: { fontSize: 12, color: 'var(--text-tertiary)' },
};
