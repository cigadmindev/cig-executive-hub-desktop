import React, { useEffect, useRef, useState } from 'react';

// value/onChange work with plain 'YYYY-MM-DD' strings, same as a native
// date input, so this drops in wherever one was used before.
export default function DatePickerField({ value, onChange, placeholder = 'Select date' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const selected = value ? new Date(`${value}T00:00:00`) : null;
  const [viewDate, setViewDate] = useState(selected ?? new Date());

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
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

  const pick = (day) => {
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
      <button type="button" style={styles.trigger} onClick={() => setOpen((v) => !v)}>
        <span style={{ color: selected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{display}</span>
        
      </button>

      {open ? (
        <div style={styles.popover}>
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
              return (
                <button
                  key={day}
                  type="button"
                  style={{
                    ...styles.cell,
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
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  wrap: { position: 'relative' },
  trigger: {
    width: '100%',
    padding: '9px 11px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    fontSize: 13,
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
    width: 260,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-lg)',
    padding: 14,
  },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  monthLabel: { fontSize: 13, fontWeight: 700 },
  navButton: {
    width: 22,
    height: 22,
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-inset)',
    color: 'var(--text-secondary)',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 },
  weekdayLabel: { textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' },
  cell: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px 0', margin: 0 },
  dayButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    border: 'none',
    background: 'none',
    color: 'var(--text-primary)',
    fontSize: 12,
    margin: '0 auto',
  },
  dayToday: { border: '1px solid var(--text-secondary)' },
  daySelected: { background: 'var(--text-primary)', color: 'var(--bg-window)', fontWeight: 700 },
};
