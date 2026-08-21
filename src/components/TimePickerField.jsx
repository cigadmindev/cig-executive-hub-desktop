import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';

// value/onChange work with plain 'HH:MM' (24hr) strings, same as a native
// time input, so this drops in wherever one was used before.
function buildTimeOptions() {
  const options = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const d = new Date();
      d.setHours(h, m, 0, 0);
      const label = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      options.push({ value, label });
    }
  }
  return options;
}
const TIME_OPTIONS = buildTimeOptions();

export default function TimePickerField({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && listRef.current) {
      const activeEl = listRef.current.querySelector('[data-active="true"]');
      if (activeEl) activeEl.scrollIntoView({ block: 'center' });
    }
  }, [open]);

  const display = useMemo(() => {
    const match = TIME_OPTIONS.find((o) => o.value === value);
    if (match) return match.label;
    if (!value) return 'Select time';
    const [h, m] = value.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }, [value]);

  return (
    <div style={styles.wrap} ref={wrapRef}>
      <button type="button" style={styles.trigger} onClick={() => setOpen((v) => !v)}>
        <span style={{ color: value ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{display}</span>
        <Icon name="clock" size={14} color="var(--text-secondary)" />
      </button>

      {open ? (
        <div style={styles.popover} ref={listRef}>
          {TIME_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              data-active={o.value === value}
              style={{ ...styles.option, ...(o.value === value ? styles.optionActive : {}) }}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
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
  popover: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    zIndex: 50,
    width: '100%',
    minWidth: 140,
    maxHeight: 220,
    overflowY: 'auto',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-lg)',
    padding: 6,
  },
  option: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '7px 10px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background: 'none',
    color: 'var(--text-primary)',
    fontSize: 13,
  },
  optionActive: { background: 'var(--bg-card-hover)', fontWeight: 600 },
};
