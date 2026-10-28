import { SkeletonRows } from './Motion';
import React, { useEffect, useRef, useState } from 'react';
import PageHeader from './PageHeader';
import { useIsNarrow } from '../hooks/useIsNarrow';

// The one layout every request page uses:
//   title + one line on how it works, "+ New" top right
//   status filters with counts
//   a compact table on the left, the selected request's detail on the right
// Each page supplies its own columns, filters and detail panel.
// header: shown above the filters, like children. footer: under the list
// (Outreach's planned events, 26 Oct 2026).
const DRAWER_MS = 300;

export default function RequestPage({ back, title, subtitle, actionLabel, onAction, filters, filter, onFilter, columns, rows, selectedId, onSelect, detail, empty, note, children, header, footer, phoneRow }) {
  // On a phone the list and the detail don't fit side by side, and the
  // detail used to land under the list where nobody saw it. Tapping a row now
  // opens it full-screen with a way back to the list (V3).
  const isNarrow = useIsNarrow();
  const [phoneOpen, setPhoneOpen] = useState(false);
  // Too narrow for the list and the details side by side (27 Oct 2026,
  // Brenner on a laptop): the details used to drop below the whole list, so
  // clicking an enquiry meant scrolling to the bottom to read it. Now they
  // open right under the row that was clicked.
  const columnsRef = useRef(null);
  const [stacked, setStacked] = useState(false);
  useEffect(() => {
    const el = columnsRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    // The two columns wrap when their starting widths don't fit side by
    // side: 520 (list) + 18 (gap) + 380 (details). Wrapping goes by those,
    // not by how far the details could shrink - 818 here missed widths
    // between the two (27 Oct 2026, Brenner's laptop).
    const ro = new ResizeObserver(([e]) => setStacked(e.contentRect.width < 918));
    ro.observe(el);
    return () => ro.disconnect();
  }, [isNarrow, phoneOpen]);
  const inline = stacked && !isNarrow;

  // The details slide open out of the row that was clicked, and the one
  // that was open slides shut (27 Oct 2026, Brenner: "it just spams open").
  // Clicking the open row again closes it. Nothing is open until a row is
  // clicked - the page picks a first row to show beside the list, which
  // here would open on its own.
  const [collapsed, setCollapsed] = useState(true);
  const shownId = inline && !collapsed ? selectedId : null;
  // What each drawer showed, so one closing can keep its content while the
  // page moves on to the next.
  const snapshots = useRef({});
  if (shownId != null) snapshots.current[shownId] = detail;
  const [closingId, setClosingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const lastShown = useRef(null);
  const rowRefs = useRef({});
  useEffect(() => {
    const prev = lastShown.current;
    lastShown.current = shownId;
    if (prev === shownId) return undefined;
    const timers = [];
    if (prev != null) {
      setClosingId(prev);
      timers.push(setTimeout(() => setClosingId((c) => (c === prev ? null : c)), DRAWER_MS));
    }
    setExpandedId(null);
    let raf = 0;
    if (shownId != null) {
      // Starts shut, then opens on the next frame so the change animates.
      raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => setExpandedId(shownId)); });
      // Once open, make sure the row and its details are on screen.
      timers.push(setTimeout(() => rowRefs.current[shownId]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), DRAWER_MS + 20));
    }
    return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); };
  }, [shownId]);
  const clickRow = (id) => {
    if (inline && id === selectedId) { setCollapsed((c) => !c); return; }
    setCollapsed(false);
    onSelect(id);
    if (isNarrow) setPhoneOpen(true);
  };
  useEffect(() => {
    if (!isNarrow) setPhoneOpen(false);
  }, [isNarrow]);

  if (isNarrow && phoneOpen) {
    return (
      <div style={styles.page}>
        <button style={styles.phoneBack} onClick={() => setPhoneOpen(false)}>‹ {title}</button>
        {detail}
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <PageHeader back={back} title={title} subtitle={subtitle} actionLabel={actionLabel} onAction={onAction} />
      {header}
      {children}
      {/* One row that slides sideways on a phone (15 Oct 2026), not two. */}
      <div style={isNarrow ? { ...styles.filters, ...styles.filtersNarrow } : styles.filters}>
        {filters.map((f) => (
          <button key={f.key} style={{ ...styles.filter, ...(filter === f.key ? styles.filterOn : {}), flexShrink: 0, whiteSpace: 'nowrap' }} onClick={() => onFilter(f.key)}>
            {f.label}{f.count != null ? ' · ' + f.count : ''}
          </button>
        ))}
      </div>
      <div ref={columnsRef} style={styles.columns}>
        <div style={{ flex: '1 1 520px', minWidth: 0 }}>
          <div style={styles.tableCard}>
            {rows.length === 0 ? (
              // A list still loading shows placeholder rows rather than the
              // word "Loading…" (28 Oct 2026).
              empty === 'Loading…' ? <SkeletonRows rows={4} /> : <p style={styles.empty}>{empty ?? 'Nothing here.'}</p>
            ) : isNarrow && phoneRow ? (
              // On a phone a page can give each row a compact two-line form
              // instead of a table that scrolls sideways.
              rows.map((r, i) => (
                <button key={r.id} data-rise="" style={{ ...styles.phoneRow, animationDelay: Math.min(i, 7) * 40 + 'ms' }} onClick={() => { onSelect(r.id); setPhoneOpen(true); }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{phoneRow(r)}</span>
                  <span aria-hidden="true" style={styles.phoneChevron}>›</span>
                </button>
              ))
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>{columns.map((c) => <th key={c.key} style={styles.th}>{c.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const open = r.id === shownId;
                      // The one that was open closes from the very first frame:
                      // lastShown still holds it until the effect runs.
                      const closing = !open && (r.id === closingId || (r.id === lastShown.current && shownId !== lastShown.current));
                      const wide = open && expandedId === r.id;
                      return (
                        <React.Fragment key={r.id}>
                          <tr data-rise="" ref={(el) => { rowRefs.current[r.id] = el; }} onClick={() => clickRow(r.id)} style={{ animationDelay: Math.min(i, 7) * 40 + 'ms', ...styles.tr, ...(r.id === selectedId && !isNarrow && (!inline || open) ? styles.trOn : {}) }}>
                            {columns.map((c) => <td key={c.key} style={styles.td}>{c.render(r)}</td>)}
                          </tr>
                          {open || closing ? (
                            <tr>
                              <td colSpan={columns.length} style={styles.inlineTd}>
                                <div style={{ ...styles.drawer, gridTemplateRows: wide ? '1fr' : '0fr', opacity: wide ? 1 : 0 }}>
                                  <div style={styles.drawerInner}>
                                    <div style={{ ...styles.inlineDetail, transform: wide ? 'none' : 'translateY(-10px)' }}>{open ? detail : snapshots.current[r.id]}</div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {note ? <p style={styles.note}>{note}</p> : null}
          {footer}
        </div>
        {isNarrow || inline ? null : <div style={{ flex: '0 1 380px', minWidth: 280 }}>{detail}</div>}
      </div>
    </div>
  );
}

// The status label lives in its own file now (V2); still offered here so the
// request pages keep one import.
export { default as Pill } from './Pill';

export const detailStyles = {
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, position: 'sticky', top: 16 },
  kicker: { fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--warn)', margin: 0 },
  title: { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '6px 0 10px' },
  row: { display: 'flex', gap: 10, fontSize: 13, padding: '4px 0' },
  k: { width: 90, flexShrink: 0, color: 'var(--text-tertiary)' },
  v: { color: 'var(--text-primary)', minWidth: 0 },
  // Every button in one row (17 Oct 2026), sharing the width - never a
  // second row under the first.
  actions: { display: 'flex', gap: 8, flexWrap: 'nowrap', marginTop: 14 },
  primary: { flex: '1 1 auto', minWidth: 0, minHeight: 40, background: 'var(--neon)', color: '#0A0A0B', border: 'none', borderRadius: 8, padding: '8px 10px', fontWeight: 800, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' },
  ghost: { flex: '1 1 auto', minWidth: 0, minHeight: 40, background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', borderRadius: 8, padding: '7px 10px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' },
  section: { borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 12 },
  sectionLabel: { fontSize: 11, fontWeight: 800, letterSpacing: 1, color: 'var(--text-tertiary)', margin: '0 0 8px' },
  input: { width: '100%', boxSizing: 'border-box', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'inherit', marginBottom: 8 },
  history: { fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7 },
  placeholder: { background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 12, padding: 24, color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' },
};

const styles = {
  page: { padding: '28px max(22px, min(36px, 4vw)) 60px', maxWidth: 1200 },
  phoneRow: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'none', border: 'none', borderTop: '1px solid var(--border)', padding: '12px 6px', color: 'var(--text-primary)', fontFamily: 'inherit', cursor: 'pointer' },
  phoneChevron: { color: 'var(--text-tertiary)', fontSize: 18 },
  phoneBack: { background: 'none', border: 'none', padding: '4px 0', marginBottom: 12, fontSize: 13, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit' },
  filters: { display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 12px' },
  filtersNarrow: { flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none', marginRight: -22, paddingRight: 22 },
  filter: { background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', borderRadius: 16, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  filterOn: { borderColor: 'var(--neon)', color: 'var(--neon)' },
  columns: { display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' },
  tableCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '4px 8px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '9px 10px', fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  tr: { cursor: 'pointer', borderTop: '1px solid var(--border)' },
  trOn: { background: 'rgba(34,211,238,0.07)' },
  inlineTd: { padding: 0, borderTop: 'none' },
  // width 0 / min-width 100%: the details fill the row but don't count when
  // the table works out its column widths, so the columns above don't shift
  // when one opens (27 Oct 2026).
  drawer: { display: 'grid', width: 0, minWidth: '100%', transition: 'grid-template-rows 280ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 220ms ease' },
  drawerInner: { overflow: 'hidden', minHeight: 0 },
  inlineDetail: { position: 'relative', padding: '2px 0 12px', transition: 'transform 280ms cubic-bezier(0.2, 0.7, 0.2, 1)' },
  td: { padding: '11px 10px', color: 'var(--text-primary)', verticalAlign: 'middle' },
  empty: { padding: 20, color: 'var(--text-tertiary)', fontSize: 13, margin: 0 },
  note: { fontSize: 12, color: 'var(--text-tertiary)', margin: '8px 2px 0' },
};
