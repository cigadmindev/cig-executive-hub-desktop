import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

// What an item waits for (16 Oct 2026): type to narrow the list, pick an
// item, or add a whole section at once. A section is saved as each of its
// items, so any one of them can still be taken off on its own.
export default function DependencyPicker({ options, selected, selfId, onAdd }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const words = q.trim().toLowerCase();
  const available = options.filter((o) => o.id !== selfId && !selected.includes(o.id));
  const sections = [...new Set(options.map((o) => o.openingSection))];
  const groups = sections
    .map((section) => {
      const all = available.filter((o) => o.openingSection === section);
      const sectionHit = words && (section ?? '').toLowerCase().includes(words);
      const items = !words || sectionHit ? all : all.filter((o) => (o.title ?? '').toLowerCase().includes(words));
      return { section, all, items };
    })
    .filter((g) => g.items.length);

  return (
    <div ref={wrap} style={styles.wrap}>
      {/* A box like the other drop-downs (17 Oct 2026); the search lives
          inside the list it opens. */}
      <button type="button" style={{ ...styles.box, ...(open ? styles.fieldOn : {}) }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>Add dependencies…</span>
        <span style={styles.caret}>▾</span>
      </button>
      {open ? (
        <div style={styles.panel}>
          <div style={styles.field}>
            <Icon name="search" size={15} color="var(--text-tertiary)" />
            <input
              style={styles.input}
              value={q}
              autoFocus={typeof window !== 'undefined' && window.innerWidth >= 768}
              placeholder="Search items or sections"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
            />
          </div>
          {groups.length === 0 ? <p style={styles.empty}>Nothing matches “{q}”.</p> : null}
          {groups.map((g) => (
            <div key={g.section}>
              <div style={styles.secRow}>
                <span style={styles.secName}>{g.section}</span>
                {g.all.length > 1 ? (
                  <button type="button" style={styles.secAdd} onClick={() => { onAdd(g.all.map((o) => o.id)); setQ(''); }}>
                    + Add whole section ({g.all.length})
                  </button>
                ) : null}
              </div>
              {g.items.map((o) => (
                <button key={o.id} type="button" style={styles.item} onClick={() => { onAdd([o.id]); }}>
                  <span>{o.title}</span>
                  <span style={styles.itemAdd}>Add</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  wrap: { position: 'relative', minWidth: 0 },
  box: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    minWidth: 180, height: 34, padding: '0 12px', boxSizing: 'border-box',
    borderRadius: 8, background: 'var(--bg-inset)', border: '1px solid var(--border)',
    color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', textTransform: 'none',
  },
  caret: { fontSize: 11, color: 'var(--text-tertiary)' },
  field: { display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 10px', borderRadius: 7, background: 'var(--bg-inset)', margin: '2px 2px 4px' },
  fieldOn: { borderColor: 'var(--neon)', color: 'var(--text-primary)' },
  input: { flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' },
  // In the page's flow rather than floating, so nothing below shows through
  // it and it scrolls with the item.
  panel: { marginTop: 8, maxWidth: 420, maxHeight: 340, overflowY: 'auto', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: 4, boxShadow: '0 10px 28px rgba(0,0,0,.35)' },
  secRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 10px 4px' },
  secName: { fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  secAdd: { background: 'none', border: 'none', color: 'var(--neon)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, textTransform: 'none' },
  item: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 13, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'none' },
  itemAdd: { fontSize: 11, color: 'var(--text-tertiary)' },
  empty: { fontSize: 12, color: 'var(--text-tertiary)', padding: '10px', margin: 0 },
};
