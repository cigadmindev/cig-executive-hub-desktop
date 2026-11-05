import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { createPortal } from 'react-dom';

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
  // Opens on top of everything so a pop-up can't cut the list off.
  const [pos, setPos] = useState(null);
  const place = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const h = 230;
    const below = window.innerHeight - r.bottom;
    const top = below < h + 12 && r.top > h + 12 ? r.top - h - 6 : r.bottom + 6;
    setPos({ top, left: r.left, width: Math.max(150, r.width) });
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target) && !(listRef.current && listRef.current.contains(e.target))) setOpen(false);
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
      <button type="button" style={styles.trigger} onClick={() => { place(); setOpen((v) => !v); }}>
        <span style={{ color: value ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{display}</span>
        <Icon name="clock" size={14} color="var(--text-secondary)" />
      </button>

      {open && pos ? createPortal(
        <div style={{ ...styles.popover, position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 1000 }} ref={listRef} data-reveal="">
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
  popover: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    zIndex: 50,
    width: '100%',
    minWidth: 140,
    maxHeight: 220,
    overflowY: 'auto',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 18,
    boxShadow: '0 18px 44px rgba(30,40,60,0.18)',
    padding: 6,
  },
  option: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '9px 12px',
    borderRadius: 10,
    border: 'none',
    background: 'none',
    color: 'var(--text-primary)',
    fontSize: 14,
  },
  optionActive: { background: 'rgba(10,126,164,0.1)', color: 'var(--neon)', fontWeight: 600 },
};
