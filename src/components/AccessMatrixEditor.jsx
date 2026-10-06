import React, { useState } from 'react';
import { COLUMNS, ROWS, ALL_FOLDERS } from '../data/accessMatrix';
import { categories } from '../data/mockData';
import { useAccessMatrix } from '../context/AccessMatrixContext';
import { useAuth } from '../context/AuthContext';

// Manage Logins → Who sees what. The table every login's access comes from.
// Click a cell to change it; the change applies to everyone with that job.
const FULL = new Set(['edit', 'full', 'all', 'approve', 'claim', 'handle', 'post']);
const folderLabel = (ids) =>
  ids === 'all' ? 'All' : ids.length === 0 ? '—' : ids.map((id) => categories.find((c) => c.id === id)?.label ?? id).join(', ');

export default function AccessMatrixEditor() {
  const { matrix, setCell, changed } = useAccessMatrix();
  const { users } = useAuth();
  const [open, setOpen] = useState(null); // { row, col }
  const isAdmin = true;

  const people = (row) => (users ?? []).filter((u) => u.active !== false && row.jobs.includes(u.job)).length;

  const cellText = (col, v) => {
    if (col.folders) return folderLabel(v);
    return col.options.find(([k]) => k === v)?.[1] ?? v;
  };
  const dot = (col, v) => {
    if (col.folders || col.key === 'where') return null;
    if (v === 'none') return null;
    return <span style={{ color: FULL.has(v) ? 'var(--neon)' : '#E8B93B', marginRight: 4 }}>{FULL.has(v) ? '●' : '◐'}</span>;
  };

  return (
    <div style={styles.wrap}>
      <p style={styles.title}>Who sees what</p>
      <p style={styles.note}>
        One row per job. Everyone gets their job's row; the locations on their own login narrow "Own location". Admins
        see everything and are not a row. Click any cell to change it — it applies to everyone with that job straight
        away. <span style={{ color: 'var(--neon)' }}>●</span> full · <span style={{ color: '#E8B93B' }}>◐</span> limited · — not shown
      </p>
      <div style={styles.scroll}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, ...styles.sticky }}>Job</th>
              {COLUMNS.map((c) => <th key={c.key} style={styles.th}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.id}>
                <td style={{ ...styles.td, ...styles.sticky, ...styles.job }}>
                  {row.label}
                  <div style={styles.sub}>{row.jobs.join(', ')} · {people(row)} {people(row) === 1 ? 'person' : 'people'}</div>
                  {matrix[row.id].note ? <div style={styles.sub}>{matrix[row.id].note}</div> : null}
                </td>
                {COLUMNS.map((col) => {
                  const v = matrix[row.id][col.key];
                  const isOpen = open && open.row === row.id && open.col === col.key;
                  return (
                    <td key={col.key} style={{ ...styles.td, position: 'relative' }}>
                      <button
                        style={{ ...styles.cell, color: v === 'none' ? 'var(--text-tertiary)' : 'var(--text-primary)', ...(changed(row.id, col.key) ? styles.changed : {}) }}
                        onClick={() => setOpen(isOpen ? null : { row: row.id, col: col.key })}
                        title={changed(row.id, col.key) ? 'Changed from the approved table' : ''}
                      >
                        {dot(col, v)}
                        {cellText(col, v)}
                      </button>
                      {isOpen && isAdmin ? (
                        <div style={styles.menu}>
                          {col.folders ? (
                            <>
                              <button style={styles.menuItem} onClick={() => setCell(row.id, col.key, 'all')}>All folders</button>
                              {ALL_FOLDERS.map((id) => {
                                const list = v === 'all' ? ALL_FOLDERS : v;
                                const on = list.includes(id);
                                return (
                                  <label key={id} style={styles.check}>
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      onChange={() => setCell(row.id, col.key, on ? list.filter((x) => x !== id) : [...list, id])}
                                    />{' '}
                                    {categories.find((c) => c.id === id)?.label ?? id}
                                  </label>
                                );
                              })}
                            </>
                          ) : (
                            col.options.map(([k, label]) => (
                              <button
                                key={k}
                                style={{ ...styles.menuItem, ...(k === v ? { color: 'var(--neon)' } : {}) }}
                                onClick={() => { setCell(row.id, col.key, k); setOpen(null); }}
                              >
                                {label}
                              </button>
                            ))
                          )}
                          <button style={{ ...styles.menuItem, color: 'var(--text-tertiary)' }} onClick={() => setOpen(null)}>Close</button>
                        </div>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  wrap: { background: '#16161A', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 20 },
  title: { fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text-primary)' },
  note: { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 14px', lineHeight: 1.5 },
  scroll: { overflowX: 'auto' },
  table: { borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1700 },
  // Solid colours, not the theme's see-through card colour: these sit on top
  // of other cells while the table scrolls sideways.
  th: { textAlign: 'left', verticalAlign: 'bottom', padding: '8px 6px', color: 'var(--text-secondary)', fontWeight: 700, borderBottom: '1px solid var(--border)', background: '#16161A' },
  td: { padding: '6px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' },
  sticky: { position: 'sticky', left: 0, background: '#16161A', zIndex: 2, boxShadow: '6px 0 8px -6px rgba(0,0,0,0.8)', borderRight: '1px solid var(--border)' },
  job: { fontWeight: 800, fontSize: 13.5, color: 'var(--text-primary)', minWidth: 170 },
  sub: { fontWeight: 400, fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, maxWidth: 200 },
  cell: { background: 'none', border: '1px solid transparent', borderRadius: 6, padding: '4px 6px', textAlign: 'left', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit', maxWidth: 170 },
  changed: { borderColor: '#E8B93B' },
  menu: { position: 'absolute', top: '100%', left: 0, zIndex: 5, background: '#1E1E24', border: '1px solid var(--border-strong)', borderRadius: 8, padding: 6, minWidth: 170, boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column' },
  menuItem: { background: 'none', border: 'none', textAlign: 'left', padding: '7px 8px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' },
  check: { fontSize: 13, color: 'var(--text-primary)', padding: '4px 8px', display: 'block' },
};
