import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// value/onChange work with plain 'YYYY-MM-DD' strings, same as a native
// date input, so this drops in wherever one was used before.
export default function DatePickerField({ value, onChange, placeholder = 'Select date', min, max }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const popRef = useRef(null);
  // The calendar opens on top of everything, placed under the field (or
  // above it when there isn't room), so a pop-up or a card can never cut it
  // off (Glass, Nov 2026).
  const [pos, setPos] = useState(null);
  const place = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const h = 330;
    const below = window.innerHeight - r.bottom;
    const top = below < h + 12 && r.top > h + 12 ? r.top - h - 6 : r.bottom + 6;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 298));
    setPos({ top, left });
  };
  const selected = value ? new Date(`${value}T00:00:00`) : null;
  const [viewDate, setViewDate] = useState(selected ?? new Date());

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target) && !(popRef.current && popRef.current.contains(e.target))) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const cells = [...Array(firstDayOfMonth).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  // Both are 'YYYY-MM-DD', same as value - so a caller passes what it would
  // have passed a native input.
  const isoFor = (day) => {
    const d = new Date(year, month, day);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const outOfRange = (day) => {
    const iso = isoFor(day);
    return (min && iso < min) || (max && iso > max);
  };

  const pick = (day) => {
    if (outOfRange(day)) return;
    const d = new Date(year, month, day);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    onChange(iso);
    setOpen(false);
  };

  const display = selected
    ? selected.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    : placeholder;

  return (
    <div style={styles.wrap} ref={wrapRef}>
      <button type="button" style={styles.trigger} onClick={() => { place(); setOpen((v) => !v); }}>
        <span style={{ color: selected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{display}</span>
        
      </button>

      {open && pos ? createPortal(
        <div ref={popRef} data-reveal="" style={{ ...styles.popover, position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000 }}>
          <div style={styles.headerRow}>
            <button type="button" style={styles.navButton} onClick={() => setViewDate(new Date(year, month - 1, 1))}>
              ‹
            </button>
            <span style={styles.monthLabel}>{viewDate.toLocaleDateString([], { month: 'long', year: 'numeric' })}</span>
            <button type="button" style={styles.navButton} onClick={() => setViewDate(new Date(year, month + 1, 1))}>
              ›
            </button>
          </div>
          <div style={styles.weekdayRow}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((l, i) => (
              <span key={i} style={styles.weekdayLabel}>
                {l}
              </span>
            ))}
          </div>
          <div style={styles.grid}>
            {cells.map((day, i) => {
              if (day === null) return <div key={`e-${i}`} style={styles.cell} />;
              const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
              const isSelected =
                !!selected && selected.getFullYear() === year && selected.getMonth() === month && selected.getDate() === day;
              const blocked = outOfRange(day);
              return (
                <button
                  key={day}
                  type="button"
                  disabled={blocked}
                  style={{
                    ...styles.cell,
                    ...(blocked ? { opacity: 0.3, cursor: 'default' } : {}),
                    ...styles.dayButton,
                    ...(isSelected ? styles.daySelected : {}),
                    ...(isToday && !isSelected ? styles.dayToday : {}),
                  }}
                  onClick={() => pick(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}

const styles = {
  wrap: { position: 'relative' },
  trigger: {
    width: '100%',
    minHeight: 40,
    padding: '9px 12px',
    borderRadius: 12,
    border: '1px solid rgba(var(--ink-rgb), 0.12)',
    background: 'rgba(var(--paper-rgb), 0.78)',
    color: 'var(--text-primary)',
    fontSize: 14,
    fontFamily: 'inherit',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    textAlign: 'left',
  },
  icon: { fontSize: 12, opacity: 0.6 },
  popover: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    // Above the confirm modals, which sit at 200 — otherwise the calendar
    // opens behind the dialog that contains it.
    zIndex: 300,
    width: 290,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 18,
    boxShadow: '0 18px 44px rgba(30,40,60,0.18)',
    padding: 14,
  },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  monthLabel: { fontSize: 15, fontWeight: 700 },
  navButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    border: 'none',
    background: 'rgba(var(--ink-rgb), 0.06)',
    color: 'var(--text-secondary)',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 },
  weekdayLabel: { textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' },
  cell: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px 0', margin: 0 },
  dayButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    border: 'none',
    background: 'none',
    color: 'var(--text-primary)',
    fontSize: 14,
    padding: 0,
    margin: '0 auto',
  },
  dayToday: { color: 'var(--neon)', fontWeight: 700 },
  daySelected: { background: 'var(--ink)', color: 'var(--ink-text)', fontWeight: 700 },
};
