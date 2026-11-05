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
export default function AssigneePicker({ uids: savedUids, names, people, onChange, busy = false, startOpen = false }) {
  // startOpen: shown already open (the Assign button on a line, Nov 2026).
  const [open, setOpen] = useState(startOpen);
  useEffect(() => { if (startOpen) setOpen(true); }, [startOpen]);
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
            <svg width="12" height="8" viewBox="0 0 12 8" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} aria-hidden="true">
              <path d="M1.5 1.75 6 6.25l4.5-4.5" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
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
    borderRadius: 999, padding: '4px 4px 4px 4px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
  },
  avatar: {
    width: 22, height: 22, borderRadius: 11, background: 'rgba(var(--ink-rgb), 0.1)', color: 'var(--text-secondary)',
    fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  x: {
    background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 16, lineHeight: 1,
    padding: '2px 7px', cursor: 'pointer', textTransform: 'none',
  },
  box: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    minWidth: 220, height: 40, padding: '0 15px 0 14px', boxSizing: 'border-box',
    borderRadius: 12, background: 'var(--field-bg)', border: '1px solid rgba(var(--ink-rgb), 0.12)',
    color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', textTransform: 'none',
  },
  boxOn: { borderColor: 'var(--neon)', color: 'var(--text-primary)' },
  caret: { fontSize: 11, color: 'var(--text-tertiary)' },
  none: { fontSize: 12, color: 'var(--text-tertiary)' },
  panel: {
    marginTop: 8, maxWidth: 380, background: 'var(--surface-pop)', border: '1px solid var(--glass-border)',
    borderRadius: 16, padding: 8, boxShadow: '0 14px 36px rgba(20,25,35,0.22)',
    WebkitBackdropFilter: 'blur(20px) saturate(160%)', backdropFilter: 'blur(20px) saturate(160%)',
  },
  search: { display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 12px', borderRadius: 10, background: 'var(--bg-inset)', marginBottom: 4 },
  input: { flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' },
  list: { maxHeight: 280, overflowY: 'auto' },
  groupLabel: { fontSize: 12, fontWeight: 700, letterSpacing: 0, textTransform: 'none', color: 'var(--text-tertiary)', margin: 0, padding: '8px 8px 4px' },
  option: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, padding: '6px 10px', borderRadius: 10,
    background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 13, textAlign: 'left',
    cursor: 'pointer', fontFamily: 'inherit', textTransform: 'none',
  },
  optionOn: { background: 'rgba(10,126,164,.1)' },
  tick: {
    width: 16, height: 16, borderRadius: 4, border: '2px solid rgba(var(--ink-rgb), .3)', boxSizing: 'border-box',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0,
  },
  tickOn: { background: 'var(--neon)', borderColor: 'var(--neon)', color: 'var(--neon-text)' },
  optionName: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  optionJob: { fontSize: 11.5, color: 'var(--text-tertiary)', flexShrink: 0 },
  empty: { fontSize: 12, color: 'var(--text-tertiary)', padding: 10, margin: 0 },
  panelFoot: { display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 6 },
  done: { background: 'none', border: 'none', color: 'var(--neon)', fontSize: 13, fontWeight: 700, padding: '6px 10px', cursor: 'pointer', textTransform: 'none' },
};
