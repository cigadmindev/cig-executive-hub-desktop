import React from 'react';
import { nike } from '../theme/nike';
import { pageHeader, pageAction } from '../theme/pageHeader';

// The one layout every request page uses:
//   title + one line on how it works, "+ New" top right
//   status filters with counts
//   a compact table on the left, the selected request's detail on the right
// Each page supplies its own columns, filters and detail panel.
export default function RequestPage({ back, title, subtitle, actionLabel, onAction, filters, filter, onFilter, columns, rows, selectedId, onSelect, detail, empty, note, children }) {
  return (
    <div style={styles.page}>
      {back}
      <div style={pageHeader}>
        <div>
          <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>{title}</h1>
          {subtitle ? <p style={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {actionLabel ? <button style={pageAction} onClick={onAction}>{actionLabel}</button> : null}
      </div>
      {children}
      <div style={styles.filters}>
        {filters.map((f) => (
          <button key={f.key} style={{ ...styles.filter, ...(filter === f.key ? styles.filterOn : {}) }} onClick={() => onFilter(f.key)}>
            {f.label}{f.count != null ? ' · ' + f.count : ''}
          </button>
        ))}
      </div>
      <div style={styles.columns}>
        <div style={{ flex: '1 1 520px', minWidth: 0 }}>
          <div style={styles.tableCard}>
            {rows.length === 0 ? (
              <p style={styles.empty}>{empty ?? 'Nothing here.'}</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>{columns.map((c) => <th key={c.key} style={styles.th}>{c.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} onClick={() => onSelect(r.id)} style={{ ...styles.tr, ...(r.id === selectedId ? styles.trOn : {}) }}>
                        {columns.map((c) => <td key={c.key} style={styles.td}>{c.render(r)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {note ? <p style={styles.note}>{note}</p> : null}
        </div>
        <div style={{ flex: '0 1 380px', minWidth: 280 }}>{detail}</div>
      </div>
    </div>
  );
}

export function Pill({ tone = 'grey', children }) {
  const t = { amber: ['#3A2A0E', '#E8B93B'], cyan: ['#0D3640', '#22D3EE'], grey: ['#24242B', '#9A9AA6'], green: ['#0E2E22', '#4ADE80'] }[tone];
  return <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', borderRadius: 5, padding: '3px 8px', background: t[0], color: t[1], whiteSpace: 'nowrap' }}>{children}</span>;
}

export const detailStyles = {
  card: { background: '#16161A', border: '1px solid var(--border)', borderRadius: 12, padding: 18, position: 'sticky', top: 16 },
  kicker: { fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#E8B93B', margin: 0 },
  title: { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '6px 0 10px' },
  row: { display: 'flex', gap: 10, fontSize: 13, padding: '4px 0' },
  k: { width: 90, flexShrink: 0, color: 'var(--text-tertiary)' },
  v: { color: 'var(--text-primary)', minWidth: 0 },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 },
  primary: { background: 'var(--neon)', color: '#0A0A0B', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer' },
  ghost: { background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer' },
  section: { borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 12 },
  sectionLabel: { fontSize: 11, fontWeight: 800, letterSpacing: 1, color: 'var(--text-tertiary)', margin: '0 0 8px' },
  input: { width: '100%', boxSizing: 'border-box', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'inherit', marginBottom: 8 },
  history: { fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7 },
  placeholder: { background: '#16161A', border: '1px dashed var(--border)', borderRadius: 12, padding: 24, color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' },
};

const styles = {
  page: { padding: '24px 28px 60px', maxWidth: 1200 },
  title: { margin: 0, color: 'var(--text-primary)' },
  subtitle: { fontSize: 14, color: 'var(--text-secondary)', margin: '6px 0 0' },
  filters: { display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 12px' },
  filter: { background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', borderRadius: 16, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  filterOn: { borderColor: 'var(--neon)', color: 'var(--neon)' },
  columns: { display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' },
  tableCard: { background: '#16161A', border: '1px solid var(--border)', borderRadius: 12, padding: '4px 8px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '9px 10px', fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  tr: { cursor: 'pointer', borderTop: '1px solid var(--border)' },
  trOn: { background: 'rgba(34,211,238,0.07)' },
  td: { padding: '11px 10px', color: 'var(--text-primary)', verticalAlign: 'middle' },
  empty: { padding: 20, color: 'var(--text-tertiary)', fontSize: 13, margin: 0 },
  note: { fontSize: 12, color: 'var(--text-tertiary)', margin: '8px 2px 0' },
};
