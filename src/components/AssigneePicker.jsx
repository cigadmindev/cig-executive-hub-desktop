import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

// One or more people on an item. Used by the opening checklist and the
// Operational POC, so both work the same way. The screen decides who may be
// picked and what saving does.
//
// Redone 17 Oct 2026 (sketch 20): a name tag per person with an x, and a
// plain "Add a person…" box like the Hub's other drop-downs. It opens a list
// you can search, this location's people first and then executives, with a
// tick by everyone who already has it. Several can be ticked in one go.
export default function AssigneePicker({ uids: savedUids, names, people, onChange, busy = false }) {
  const [open, setOpen] = useState(false);
  // Ticks show straight away and build on each other, so ticking two people
  // quickly saves both rather than the second save overwriting the first.
  const [pending, setPending] = useState(null);
  const savedKey = savedUids.join(',');
  useEffect(() => { setPending(null); }, [savedKey]);
  const uids = pending ?? savedUids;
  const save = (next) => { setPending(next); onChange(next); };
  const [q, setQ] = useState('');
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('touchstart', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const words = q.trim().toLowerCase();
  const match = (p) => !words || (p.name ?? '').toLowerCase().includes(words) || (p.job ?? '').toLowerCase().includes(words);
  const byName = (a, b) => (a.name ?? '').localeCompare(b.name ?? '');
  const here = people.filter((p) => p.role === 'manager' && match(p)).sort(byName);
  const execs = people.filter((p) => p.role !== 'manager' && match(p)).sort(byName);
  const toggle = (uid) => save(uids.includes(uid) ? uids.filter((u) => u !== uid) : [...uids, uid]);

  const group = (label, list) =>
    list.length ? (
      <div key={label}>
        <p style={styles.groupLabel}>{label}</p>
        {list.map((p) => {
          const on = uids.includes(p.uid);
          return (
            <button
              key={p.uid}
              type="button"
              disabled={busy}
              style={{ ...styles.option, ...(on ? styles.optionOn : {}) }}
              onClick={() => toggle(p.uid)}
              aria-pressed={on}
            >
              <span style={{ ...styles.tick, ...(on ? styles.tickOn : {}) }}>{on ? '✓' : ''}</span>
              <span style={styles.avatar}>{(p.name ?? '?').trim().charAt(0).toUpperCase()}</span>
              <span style={styles.optionName}>{p.name}</span>
              {p.job ? <span style={styles.optionJob}>{p.job}</span> : null}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <div ref={wrap} style={styles.wrap}>
      <div style={styles.row}>
        {uids.map((uid) => {
          const name = people.find((p) => p.uid === uid)?.name ?? names[savedUids.indexOf(uid)] ?? '';
          return (
          <span key={uid} style={styles.tag}>
            <span style={styles.avatar}>{(name || '?').trim().charAt(0).toUpperCase()}</span>
            {name}
            <button
              type="button"
              style={styles.x}
              disabled={busy}
              aria-label={'Take ' + name + ' off'}
              onClick={() => save(uids.filter((u) => u !== uid))}
            >
              ×
            </button>
          </span>
          );
        })}
        {people.length ? (
          <button
            type="button"
            style={{ ...styles.box, ...(open ? styles.boxOn : {}) }}
            disabled={busy}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <span>{uids.length ? 'Add a person…' : 'Choose people…'}</span>
            <span style={styles.caret}>▾</span>
          </button>
        ) : uids.length === 0 ? (
          <span style={styles.none}>Nobody can be given this here yet</span>
        ) : null}
      </div>
      {/* In the page's flow rather than floating, so nothing shows through it
          and it scrolls with the item - on a phone too. */}
      {open ? (
        <div style={styles.panel}>
          <div style={styles.search}>
            <Icon name="search" size={15} color="var(--text-tertiary)" />
            <input
              style={styles.input}
              value={q}
              autoFocus={typeof window !== 'undefined' && window.innerWidth >= 768}
              placeholder="Search people"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div style={styles.list}>
            {group('This location', here)}
            {group('Executives & admins', execs)}
            {!here.length && !execs.length ? <p style={styles.empty}>Nobody matches “{q}”.</p> : null}
          </div>
          <div style={styles.panelFoot}>
            <button type="button" style={styles.done} onClick={() => { setOpen(false); setQ(''); }}>Done</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  wrap: { minWidth: 0 },
  row: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  tag: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    background: 'var(--bg-inset)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '3px 2px 3px 4px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
  },
  avatar: {
    width: 22, height: 22, borderRadius: 11, background: '#3A3A44', color: '#fff',
    fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  x: {
    background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 16, lineHeight: 1,
    padding: '2px 7px', cursor: 'pointer', textTransform: 'none',
  },
  box: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    minWidth: 180, height: 34, padding: '0 12px', boxSizing: 'border-box',
    borderRadius: 8, background: 'var(--bg-inset)', border: '1px solid var(--border)',
    color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', textTransform: 'none',
  },
  boxOn: { borderColor: 'var(--neon)', color: 'var(--text-primary)' },
  caret: { fontSize: 11, color: 'var(--text-tertiary)' },
  none: { fontSize: 12, color: 'var(--text-tertiary)' },
  panel: {
    marginTop: 8, maxWidth: 360, background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
    borderRadius: 10, padding: 6, boxShadow: '0 10px 28px rgba(0,0,0,.35)',
  },
  search: { display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 10px', borderRadius: 7, background: 'var(--bg-inset)', marginBottom: 4 },
  input: { flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' },
  list: { maxHeight: 280, overflowY: 'auto' },
  groupLabel: { fontSize: 10, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: 0, padding: '8px 8px 4px' },
  option: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, padding: '6px 8px', borderRadius: 7,
    background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 13, textAlign: 'left',
    cursor: 'pointer', fontFamily: 'inherit', textTransform: 'none',
  },
  optionOn: { background: 'rgba(34,211,238,.1)' },
  tick: {
    width: 16, height: 16, borderRadius: 4, border: '2px solid rgba(255,255,255,.3)', boxSizing: 'border-box',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, flexShrink: 0,
  },
  tickOn: { background: 'var(--neon)', borderColor: 'var(--neon)', color: 'var(--neon-text)' },
  optionName: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  optionJob: { fontSize: 11.5, color: 'var(--text-tertiary)', flexShrink: 0 },
  empty: { fontSize: 12, color: 'var(--text-tertiary)', padding: 10, margin: 0 },
  panelFoot: { display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 6 },
  done: { background: 'none', border: 'none', color: 'var(--neon)', fontSize: 13, fontWeight: 700, padding: '6px 10px', cursor: 'pointer', textTransform: 'none' },
};
