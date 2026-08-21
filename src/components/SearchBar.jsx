import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icon';

// Click the icon to reveal a text input; clearing the text (or clicking
// the icon again) collapses it back. `query` is lifted to the parent so it
// can filter whatever lists it's placed above.
//
// `suggestions` is the full, unfiltered pool of searchable labels (task
// titles, contact names, etc.) from every list on the page — this
// component does its own substring narrowing against `query` and shows the
// top matches in a dropdown, the same way a Google search box narrows
// suggestions as you type. Picking one calls `onChange` with that exact
// label, which then also drives whatever filtering the parent screen does
// with `query`.
export default function SearchBar({ query, onChange, suggestions = [], placeholder = 'Search…' }) {
  const [open, setOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const close = () => {
    onChange('');
    setOpen(false);
    setDropdownOpen(false);
  };

  const q = query.trim().toLowerCase();
  const matches = q
    ? [...new Set(suggestions)]
        .filter((s) => s.toLowerCase().includes(q))
        .sort((a, b) => a.toLowerCase().indexOf(q) - b.toLowerCase().indexOf(q))
        .slice(0, 8)
    : [];

  const pickSuggestion = (label) => {
    onChange(label);
    setDropdownOpen(false);
  };

  if (!open) {
    return (
      <button style={styles.iconButton} onClick={() => setOpen(true)} title="Search">
        <Icon name="search" size={15} color="#FFFFFF" />
      </button>
    );
  }

  return (
    <div style={styles.outerWrap} ref={wrapRef}>
      <div style={styles.wrap}>
        <Icon name="search" size={14} color="var(--neon)" />
        <input
          ref={inputRef}
          style={styles.input}
          value={query}
          onChange={(e) => {
            onChange(e.target.value);
            setDropdownOpen(true);
          }}
          onFocus={() => setDropdownOpen(true)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === 'Escape' && close()}
        />
        <button style={styles.clearButton} onClick={close} title="Close search">
          <Icon name="close" size={13} color="var(--text-secondary)" />
        </button>
      </div>
      {dropdownOpen && matches.length > 0 ? (
        <div style={styles.dropdown}>
          {matches.map((label) => (
            <button key={label} style={styles.dropdownItem} onMouseDown={() => pickSuggestion(label)}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-inset)',
    cursor: 'pointer',
  },
  outerWrap: { position: 'relative', maxWidth: 320, width: '100%' },
  wrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-strong)',
    background: 'var(--bg-inset)',
  },
  input: {
    flex: 1,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: 13,
  },
  clearButton: { fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-sm)',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 300,
    overflow: 'hidden',
  },
  dropdownItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--text-primary)',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
  },
};
