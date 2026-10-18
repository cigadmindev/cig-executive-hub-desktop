import React, { useEffect, useRef, useState } from 'react';
import { useIsNarrow } from '../hooks/useIsNarrow';
import { TEMP_LOG_HOURS } from '../data/dailyChecklists';

// The Daily Time & Temperature Log (18 Oct 2026, sketch 22). A box per item
// per check time. The chef types the number and the Hub adds the degree sign,
// their initials and the time; anything that is not a number is kept as a
// short note instead ("Not on today"). Enter moves down to the next item.
// On a computer it is the whole grid; on a phone, one check time at a time.

const initialsOf = (name) => String(name ?? '').split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase() + '.').join('');
export const cellText = (c) => (!c ? '' : c.temp != null && c.temp !== '' ? c.temp + '°' : c.note ?? '');

// Which check is "now": the latest check time that has started, on today's
// log; the first one before 11.
export function currentSlot(isToday) {
  if (!isToday) return -1;
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }));
  let k = 0;
  TEMP_LOG_HOURS.forEach((hh, i) => { if (h >= hh) k = i; });
  return k;
}

function Cell({ value, canEdit, onSave, autoFocus, onEnter, inputRef, big }) {
  const [draft, setDraft] = useState(null);
  const raw = value?.temp != null && value?.temp !== '' ? String(value.temp) : value?.note ?? '';
  // Shows "168°" until clicked; while typing it is just the number.
  const shown = draft ?? cellText(value);
  const isNote = !!value?.note && draft == null;
  const commit = () => {
    if (draft == null) return;
    const next = draft.trim();
    setDraft(null);
    if (next !== raw) onSave(next);
  };
  if (!canEdit) {
    return (
      <div style={{ ...styles.readCell, ...(big ? styles.readCellBig : {}), ...(isNote ? styles.noteCell : {}) }}>
        {value ? <><span>{cellText(value)}</span>{value.temp != null ? <small style={styles.ini}>{initialsOf(value.byName)}</small> : null}</> : <span style={styles.dash}>—</span>}
      </div>
    );
  }
  return (
    <div style={{ ...styles.inputWrap, ...(big ? styles.inputWrapBig : {}), ...(isNote ? styles.noteCell : {}) }}>
      <input
        ref={inputRef}
        style={{ ...styles.input, ...(big ? styles.inputBig : {}), ...(isNote ? { color: 'var(--warn)', fontSize: 11.5 } : {}) }}
        value={shown}
        inputMode={isNote ? 'text' : 'decimal'}
        enterKeyHint="next"
        placeholder={big ? '°F' : ''}
        autoFocus={autoFocus}
        aria-label="Temperature"
        onFocus={() => setDraft(raw)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); onEnter?.(); }
          if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur(); }
        }}
      />
      {/* The degree sign is the Hub's, not typed (Brenner, 18 Oct 2026). */}
      {value && !isNote && draft == null ? <small style={styles.ini}>{initialsOf(value.byName)}</small> : null}
    </div>
  );
}

export default function TempLog({ record, list, canEdit, setCell, isToday, notify }) {
  const isNarrow = useIsNarrow();
  const items = record?.items ?? list.items;
  const times = record?.times ?? list.times;
  const cells = record?.cells ?? {};
  const now = currentSlot(isToday);
  const [slot, setSlot] = useState(now >= 0 ? now : 0);
  const refs = useRef({});

  useEffect(() => { if (now >= 0) setSlot(now); }, [now]);

  const save = (r, c) => (v) => setCell(r, c, v).catch(() => notify?.('Could not save', 'That temperature was not saved. Try again.'));
  const focusNext = (r, c) => () => refs.current[(r + 1) + '_' + c]?.focus();
  const filledIn = (c) => items.filter((_, r) => cells[r + '_' + c]).length;

  if (isNarrow) {
    return (
      <div>
        <div style={styles.tabs}>
          {times.map((t, c) => {
            const n = filledIn(c);
            return (
              <button key={t} style={{ ...styles.tab, ...(slot === c ? styles.tabOn : {}) }} onClick={() => setSlot(c)}>
                {t.replace(':00', '')}
                <span style={styles.tabCount}>{n === items.length ? '✓' : n ? n + '/' + items.length : ''}</span>
              </button>
            );
          })}
        </div>
        <div style={styles.card}>
          {items.map((name, r) => (
            <div key={name} style={styles.phoneRow}>
              <span style={styles.phoneName}>{name}</span>
              <Cell
                big
                value={cells[r + '_' + slot]}
                canEdit={canEdit}
                onSave={save(r, slot)}
                inputRef={(el) => { refs.current[r + '_' + slot] = el; }}
                onEnter={focusNext(r, slot)}
              />
            </div>
          ))}
        </div>
        <p style={styles.hint}>Type the temperature; the Hub adds the ° and your initials. Type a word instead ("Not on today", "86'd") to leave a note.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.card}>
        <div style={{ ...styles.grid, gridTemplateColumns: `200px repeat(${times.length}, minmax(0, 1fr))` }}>
          <div style={styles.head}>Item</div>
          {times.map((t, c) => (
            <div key={t} style={{ ...styles.head, ...(c === now ? styles.headNow : {}) }}>
              <span>{t}</span>
              <span style={styles.headCount}>{c === now ? 'Now · ' : ''}{filledIn(c)}/{items.length}</span>
            </div>
          ))}
          {items.map((name, r) => (
            <React.Fragment key={name}>
              <div style={styles.name}><span style={styles.dot} />{name}</div>
              {times.map((t, c) => (
                <div key={t} style={{ ...styles.cell, ...(c === now ? styles.cellNow : {}) }}>
                  <Cell
                    value={cells[r + '_' + c]}
                    canEdit={canEdit}
                    onSave={save(r, c)}
                    inputRef={(el) => { refs.current[r + '_' + c] = el; }}
                    onEnter={focusNext(r, c)}
                  />
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
      <p style={styles.hint}>Click a box and type the temperature; Enter moves to the next item down. The Hub adds the °, your initials and the time. Type a word instead ("Not on today", "86'd") to leave a note.</p>
    </div>
  );
}

const styles = {
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  grid: { display: 'grid', fontSize: 12.5 },
  head: { padding: '9px 8px', fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-strong)', display: 'flex', flexDirection: 'column', gap: 2 },
  headNow: { color: 'var(--neon)' },
  headCount: { fontWeight: 600, letterSpacing: 0, textTransform: 'none', fontSize: 10.5 },
  name: { padding: '0 10px', minHeight: 44, borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' },
  dot: { width: 6, height: 6, borderRadius: 3, background: '#7A1F2B', flexShrink: 0 },
  cell: { padding: '5px 5px', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)' },
  cellNow: { background: 'rgba(34,211,238,0.05)' },
  inputWrap: { position: 'relative', display: 'flex', alignItems: 'center', height: 34, borderRadius: 7, background: 'var(--bg-inset)', border: '1px solid transparent' },
  inputWrapBig: { width: 108, height: 42, flexShrink: 0 },
  input: { width: '100%', height: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 13.5, fontWeight: 700, padding: '0 34px 0 9px', fontFamily: 'inherit', minWidth: 0 },
  inputBig: { fontSize: 16, padding: '0 40px 0 12px' },
  ini: { position: 'absolute', right: 7, fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', pointerEvents: 'none' },
  noteCell: { background: 'rgba(232,193,90,0.1)' },
  readCell: { position: 'relative', height: 34, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' },
  readCellBig: { width: 108, height: 42, flexShrink: 0, background: 'var(--bg-inset)' },
  dash: { color: 'var(--text-tertiary)', fontWeight: 400 },
  tabs: { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10 },
  tab: { flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, height: 36, padding: '0 12px', borderRadius: 999, border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 700, textTransform: 'none', fontFamily: 'inherit' },
  tabOn: { background: 'var(--neon)', borderColor: 'var(--neon)', color: 'var(--neon-text)' },
  tabCount: { fontSize: 10.5, opacity: 0.75 },
  phoneRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: '1px solid var(--border)' },
  phoneName: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  hint: { fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5, margin: '10px 2px 0' },
};
