import React, { useEffect, useRef, useState } from 'react';
import { useIsNarrow } from '../hooks/useIsNarrow';
import { TEMP_LOG_HOURS, isTasted } from '../data/dailyChecklists';

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

// Tasted for quality (27 Oct 2026, sketch 33): a "T" beside each food
// item's temperature, green once tasted. Who and when show on hover.
const timeOf = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
function Taste({ value, canEdit, onToggle, big }) {
  const on = !!value;
  const title = on ? 'Tasted by ' + (value.byName || 'someone') + ' at ' + timeOf(value.at) : 'Tap once it has been tasted';
  const style = { ...(big ? styles.tasteBig : styles.taste), ...(on ? styles.tasteOn : {}) };
  // Spelled out on a computer too (Brenner, 27 Oct 2026): under the box.
  if (!canEdit) return <span style={{ ...style, cursor: 'default' }} title={title}>{on ? '✓ Tasted' : 'Not tasted'}</span>;
  return (
    <button type="button" style={style} title={title} aria-pressed={on} aria-label={on ? 'Tasted' : 'Mark as tasted'} onClick={onToggle}>
      {on ? '✓ Tasted' : 'Taste'}
    </button>
  );
}

export default function TempLog({ record, list, canEdit, setCell, setTasted, isToday, notify }) {
  const isNarrow = useIsNarrow();
  const items = record?.items ?? list.items;
  const times = record?.times ?? list.times;
  const cells = record?.cells ?? {};
  const tasted = record?.tasted ?? {};
  const taste = (r, c) => () => setTasted?.(r, c, !tasted[r + '_' + c]).catch(() => notify?.('Could not save', 'That was not saved. Try again.'));
  const tastedIn = (c) => items.filter((name, r) => isTasted(name) && tasted[r + '_' + c]).length;
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
              {isTasted(name) ? <Taste big value={tasted[r + '_' + slot]} canEdit={canEdit} onToggle={taste(r, slot)} /> : <span style={{ width: 86, flexShrink: 0 }} />}
            </div>
          ))}
        </div>
        <p style={styles.hint}>Type the temperature; the Hub adds the ° and your initials. Type a word instead ("Not on today", "86'd") to leave a note. Tap Taste once a food item has been tasted.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.card}>
        <div style={{ ...styles.grid, gridTemplateColumns: `clamp(130px, 15vw, 200px) repeat(${times.length}, minmax(0, 1fr))` }}>
          <div style={styles.head}>Item</div>
          {times.map((t, c) => (
            <div key={t} style={{ ...styles.head, ...(c === now ? styles.headNow : {}) }}>
              <span>{t}</span>
              <span style={styles.headCount}>{c === now ? 'Now · ' : ''}{filledIn(c)}/{items.length}{tastedIn(c) ? ' · ' + tastedIn(c) + ' tasted' : ''}</span>
            </div>
          ))}
          {items.map((name, r) => (
            <React.Fragment key={name}>
              <div style={styles.name}><span style={styles.dot} />{name}</div>
              {times.map((t, c) => (
                <div key={t} style={{ ...styles.cell, ...(c === now ? styles.cellNow : {}), display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ minWidth: 0 }}>
                    <Cell
                      value={cells[r + '_' + c]}
                      canEdit={canEdit}
                      onSave={save(r, c)}
                      inputRef={(el) => { refs.current[r + '_' + c] = el; }}
                      onEnter={focusNext(r, c)}
                    />
                  </div>
                  {isTasted(name) ? <Taste value={tasted[r + '_' + c]} canEdit={canEdit} onToggle={taste(r, c)} /> : null}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
      <p style={styles.hint}>Click a box and type the temperature; Enter moves to the next item down. The Hub adds the °, your initials and the time. Type a word instead ("Not on today", "86'd") to leave a note. Click Taste once a food item has been tasted.</p>
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
  input: { width: '100%', height: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 13.5, fontWeight: 700, padding: '0 26px 0 7px', fontFamily: 'inherit', minWidth: 0 },
  inputBig: { fontSize: 16, padding: '0 40px 0 12px' },
  ini: { position: 'absolute', right: 5, fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', pointerEvents: 'none' },
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
  taste: { width: '100%', height: 24, boxSizing: 'border-box', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, fontFamily: 'inherit', textTransform: 'none' },
  tasteBig: { width: 86, height: 42, flexShrink: 0, boxSizing: 'border-box', borderRadius: 8, border: '1.5px solid var(--border-strong)', background: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, fontFamily: 'inherit', textTransform: 'none' },
  tasteOn: { background: '#0E2E22', borderColor: '#5FA377', color: '#7ED3A0' },
  hint: { fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5, margin: '10px 2px 0' },
};
