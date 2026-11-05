import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { COLUMNS, ROWS, ALL_FOLDERS } from '../data/accessMatrix';
import { categories } from '../data/mockData';
import { useAccessMatrix } from '../context/AccessMatrixContext';
import { useAuth } from '../context/AuthContext';

// Manage Logins → Who sees what. The table every login's access comes from.
// Click a cell to change it; the change applies to everyone with that job.
const FULL = new Set(['edit', 'full', 'all', 'approve', 'claim', 'handle', 'post']);
const folderLabel = (ids) =>
  ids === 'all' ? 'All' : ids.length === 0 ? '—' : ids.map((id) => categories.find((c) => c.id === id)?.label ?? id).join(', ');

// The whole table at once, kept as the "Compare jobs" view (2 Nov 2026).
function CompareTable() {
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
    return <span style={{ color: FULL.has(v) ? 'var(--neon)' : 'var(--warn)', marginRight: 4 }}>{FULL.has(v) ? '●' : '◐'}</span>;
  };

  return (
    <div style={styles.wrap}>
      <p style={styles.title}>Compare jobs</p>
      <p style={styles.note}>
        One row per job. Everyone gets their job's row. Admins see everything and are not a row. Click any cell to change
        it — it applies to everyone with that job straight away. <span style={{ color: 'var(--neon)' }}>●</span> full ·{' '}
        <span style={{ color: 'var(--warn)' }}>◐</span> limited · — not shown
      </p>
      <p style={styles.note}>
        <b>Where:</b> a manager always gets exactly the restaurants and locations ticked on their own login, whatever
        their row says — untick one and it is gone. Executives get what their row says.{' '}
        <b>Set on each login, not here:</b> Also works as (a second job at one location) and My space.
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
  wrap: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 20 },
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
  changed: { borderColor: 'var(--warn)' },
  menu: { position: 'absolute', top: '100%', left: 0, zIndex: 5, background: '#1E1E24', border: '1px solid var(--border-strong)', borderRadius: 8, padding: 6, minWidth: 170, boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column' },
  menuItem: { background: 'none', border: 'none', textAlign: 'left', padding: '7px 8px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' },
  check: { fontSize: 13, color: 'var(--text-primary)', padding: '4px 8px', display: 'block' },
};


// ---------------------------------------------------------------------------
// Who sees what, reorganised (2 Nov 2026, sketch "Hub November Fixes" 3).
// Pick a job; its settings are grouped and each says, in a sentence, what it
// lets that job do. The emails a job gets and the one-person exceptions are
// shown beside it. Same table underneath: a change still applies to everyone
// with that job straight away.
// ---------------------------------------------------------------------------

const SAYS = {
  where: { all: 'Every restaurant and location.', brands: "Every brand's restaurants and locations.", own: 'Only the restaurants and locations ticked on their own login.' },
  openingChecklist: { edit: 'Ticks, edits, adds items and changes dates.', tick: "Ticks items off and adds notes; can't change the plan.", view: "Can open and read it. Can't tick or be assigned, and it never lands on their Home.", none: "Doesn't see it." },
  dailyChecklists: { work: 'Ticks and signs off the daily opening and closing lists at their location.', none: "Doesn't see the daily lists." },
  openingDates: { full: 'Sees when each restaurant opens.', none: "Doesn't see opening dates." },
  renewals: { full: 'Adds and updates permits and licences.', view: 'Can read permits and licences.', none: "Doesn't see renewals." },
  operationalPoc: { assign: 'Fills in contacts and hands them to people to fill in.', full: 'Fills in, adds and removes contacts at their places.', view: 'Can read location contacts.', none: "Doesn't see location contacts." },
  calendar: { full: 'Uses the Master Calendar and Messages.', none: "Doesn't use the calendar or Messages." },
  availability: { approve: "Approves time off and sees everyone's availability.", team: "Sees their team's availability and asks for their own time off.", own: 'Sets their own availability and asks for time off.', none: "Not on any location's team; doesn't use availability." },
  expenses: { all: 'Sees every receipt.', own: 'Files their own receipts.', none: "Doesn't file receipts in the Hub." },
  signatures: { full: 'Sends documents to sign and sees every signature record.', own: "Signs what's sent to them.", none: "Isn't sent documents to sign." },
  catering: { claim: 'Claims, works and edits enquiries at their location.', view: 'Can read catering enquiries at their places.', none: "Doesn't see catering enquiries." },
  eventRequests: { approve: 'Approves event requests.', ask: 'Can ask for an event.', none: "Can't ask for events." },
  deviceRequests: { approve: 'Approves device requests.', view: 'Can read device requests.', ask: 'Can ask for a device.', none: "Can't ask for devices." },
  systemsHelp: { handle: 'Answers Systems Help requests.', raise: 'Can ask for help with a system.', none: "Can't ask for Systems Help." },
  hr: { full: 'Manages HR and emergency info.', read: 'Can read HR and emergency info.', none: 'Can read HR and emergency info.' },
  announcements: { post: 'Can post announcements.', read: 'Reads announcements.' },
  executiveNotes: { full: 'Sees executive notes.', none: "Doesn't see executive notes." },
};

const SECTIONS = [
  ['Where', ['where', 'folders']],
  ['Checklists & openings', ['openingChecklist', 'dailyChecklists', 'openingDates', 'operationalPoc', 'renewals']],
  ['Requests & people', ['availability', 'eventRequests', 'deviceRequests', 'systemsHelp', 'calendar', 'hr']],
  ['Money & catering', ['expenses', 'signatures', 'catering']],
  ['Company', ['announcements', 'executiveNotes']],
];

const JOB_GROUPS = [
  ['Executives', ['owner', 'coo', 'financials', 'culinary', 'beverage', 'it']],
  ['Restaurant managers', ['gm', 'agm', 'km', 'chef', 'sous', 'catering']],
  ['Outside & support', ['marketing', 'video', 'hr', 'realestate']],
];

// The emails a job gets, worked out the way the server sends them
// (functions/routing.js and the jobs that call it, 2 Nov 2026).
function emailsFor(rowId, v) {
  const out = ['Messages to them', 'Things tagged or assigned to them', 'Documents sent to them to sign', 'Answers to their own requests'];
  if (rowId === 'coo') out.push('Time off and event requests', 'Renewals at every restaurant', "Yesterday's unsigned checklists (one email at 3pm)", 'Receipts at 7am and the Monday checklist report', 'Checklist reminders where a location has no GM or AGM');
  if (rowId === 'gm') out.push('Renewals at their location', 'Daily checklist reminders (5pm, midnight, 10am)');
  if (rowId === 'agm') out.push("Daily checklist reminders when their location has no GM");
  if (rowId === 'chef' || rowId === 'sous') out.push('Temperature log reminders');
  if (rowId === 'catering') out.push('New catering enquiries and outreach follow-ups');
  if (rowId === 'it' || v.systemsHelp === 'handle') out.push('Systems Help requests');
  if (!['marketing', 'video'].includes(rowId)) out.push('Company and restaurant posts, in the 8am summary');
  out.push("Folder posts, only when the poster ticks \"Email the team\"");
  return out;
}

const optLabel = (label) => (label === '—' ? 'Off' : label);

function JobView({ row, onOpenPerson }) {
  const { matrix, setCell, changed } = useAccessMatrix();
  const { users, startViewAs } = useAuth();
  const navigate = useNavigate();
  const v = matrix[row.id];
  const people = (users ?? []).filter((u) => u.active !== false && !u.isGhost && (row.jobs.includes(u.job) || row.jobs.includes(u.alsoJob?.job)));
  const special = specialAccess(users).filter((x) => row.jobs.includes(x.user.job));
  const folders = v.folders === 'all' ? ALL_FOLDERS : v.folders ?? [];

  return (
    <div style={ws.main}>
      <div style={ws.card}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <p style={ws.h2}>{row.label}</p>
          <p style={ws.sub}>Jobs: {row.jobs.join(', ')} · {people.length ? people.map((u) => u.name).join(', ') : 'nobody yet'}</p>
          {v.note ? <p style={ws.sub}>{v.note}</p> : null}
        </div>
        {people.length ? (
          <button style={ws.ghostBtn} onClick={async () => { await startViewAs(people[0].uid); navigate('/'); }}>
            See the Hub as {people[0].name.split(' ')[0]}
          </button>
        ) : null}
      </div>

      {SECTIONS.map(([name, keys]) => (
        <section key={name} style={ws.section}>
          <p style={ws.kicker}>{name}</p>
          {keys.map((key) => {
            const col = COLUMNS.find((c) => c.key === key);
            if (!col) return null;
            if (col.folders) {
              return (
                <div key={key} style={ws.row}>
                  <div style={ws.rowText}>
                    <span style={ws.rowName}>Folders{changed(row.id, key) ? <span style={ws.changed}> · changed</span> : null}</span>
                    <span style={ws.rowSays}>{folders.length === ALL_FOLDERS.length ? 'Every folder.' : folders.length ? 'Can open, add and download files in these folders.' : 'No folders.'}</span>
                  </div>
                  <div style={ws.chips}>
                    {ALL_FOLDERS.map((id) => {
                      const on = folders.includes(id);
                      return (
                        <button key={id} aria-pressed={on} style={{ ...ws.chip, ...(on ? ws.chipOn : {}) }}
                          onClick={() => setCell(row.id, key, on ? folders.filter((x) => x !== id) : [...folders, id])}>
                          {categories.find((c) => c.id === id)?.label ?? id}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }
            const cur = v[key] ?? 'none';
            return (
              <div key={key} style={ws.row}>
                <div style={ws.rowText}>
                  <span style={ws.rowName}>{col.label}{changed(row.id, key) ? <span style={ws.changed}> · changed from the approved table</span> : null}</span>
                  <span style={ws.rowSays}>{SAYS[key]?.[cur] ?? ''}</span>
                </div>
                <div style={ws.seg} role="radiogroup" aria-label={col.label}>
                  {col.options.map(([k, label]) => (
                    <button key={k} role="radio" aria-checked={k === cur}
                      style={{ ...ws.segBtn, ...(k === cur ? (k === 'none' ? ws.segOff : ws.segOn) : {}) }}
                      onClick={() => setCell(row.id, key, k)}>
                      {optLabel(label)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ))}

      <section style={ws.section}>
        <p style={ws.kicker}>Emails this job gets</p>
        <div style={{ ...ws.chips, padding: '4px 0 6px' }}>
          {emailsFor(row.id, v).map((e) => <span key={e} style={ws.tag}>{e}</span>)}
        </div>
        <p style={ws.foot}>Each person can turn emails down further in their Profile.</p>
      </section>

      {special.length ? (
        <section style={ws.section}>
          <p style={ws.kicker}>Special access for people with this job</p>
          {special.map((x, i) => <SpecialRow key={i} x={x} onOpenPerson={onOpenPerson} />)}
        </section>
      ) : null}
    </div>
  );
}

// Access given to one person rather than their whole job.
function specialAccess(users) {
  const out = [];
  for (const u of users ?? []) {
    if (u.active === false || u.isGhost) continue;
    const p = u.permissions ?? {};
    if (p.seesAllCatering === true) out.push({ user: u, what: 'Reads every catering enquiry and private event, at every location.' });
    if (u.assignedWork === true) out.push({ user: u, what: 'Can be assigned opening checklist items and POC contacts, and sees just those.' });
    for (const f of p.extraFolders ?? []) out.push({ user: u, what: 'Also given the ' + (categories.find((c) => c.id === f)?.label ?? f) + ' folder.' });
    for (const f of p.extraFeatures ?? []) out.push({ user: u, what: 'Also given ' + (FEATURE_LABEL[f] ?? f) + '.' });
    if (u.alsoJob?.job) out.push({ user: u, what: 'Also works as ' + u.alsoJob.job + ' at one location.' });
    if (u.privateSpace === true) out.push({ user: u, what: 'Has a private My space page and Drive folder.' });
  }
  return out;
}
const FEATURE_LABEL = { openingChecklist: 'the pre-opening checklist', operationalPoc: 'Operational POC', renewals: 'renewals', eventRequests: 'event requests', availability: 'availability', expenses: 'Expenses' };

function SpecialRow({ x, onOpenPerson }) {
  return (
    <div style={ws.row}>
      <span style={ws.who}>{x.user.name}</span>
      <span style={{ flex: '1 1 260px', fontSize: 13.5, color: 'var(--text-primary)' }}>{x.what}</span>
      {onOpenPerson ? <button style={ws.ghostBtn} onClick={() => onOpenPerson(x.user.uid)}>Open their login</button> : null}
    </div>
  );
}

export default function AccessMatrixEditor({ onOpenPerson }) {
  const { users } = useAuth();
  const [view, setView] = useState('job');
  const [rowId, setRowId] = useState('gm');
  const [q, setQ] = useState('');
  const count = (row) => (users ?? []).filter((u) => u.active !== false && !u.isGhost && row.jobs.includes(u.job)).length;
  const special = useMemo(() => specialAccess(users), [users]);
  const words = q.trim().toLowerCase();
  const matches = (row) =>
    !words ||
    row.label.toLowerCase().includes(words) ||
    row.jobs.some((j) => j.toLowerCase().includes(words)) ||
    (users ?? []).some((u) => row.jobs.includes(u.job) && (u.name ?? '').toLowerCase().includes(words));
  const row = ROWS.find((r) => r.id === rowId) ?? ROWS[0];

  return (
    <div>
      <div style={ws.head}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <p style={ws.title}>Who sees what</p>
          <p style={ws.sub}>Pick a job to see everything it can do. A change applies to everyone with that job straight away. Admins see everything and aren't a job here.</p>
        </div>
        <div style={ws.tabs} role="tablist">
          {[['job', 'By job'], ['special', 'Special access · ' + special.length], ['compare', 'Compare jobs']].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={view === k} style={{ ...ws.tab, ...(view === k ? ws.tabOn : {}) }} onClick={() => setView(k)}>{label}</button>
          ))}
        </div>
      </div>

      {view === 'compare' ? <CompareTable /> : null}

      {view === 'special' ? (
        <section style={ws.section}>
          <p style={ws.kicker}>Given to one person, not their whole job</p>
          {special.length === 0 ? <p style={ws.foot}>Nobody has special access.</p> : special.map((x, i) => <SpecialRow key={i} x={x} onOpenPerson={onOpenPerson} />)}
          <p style={ws.foot}>Change or remove these on the person's login.</p>
        </section>
      ) : null}

      {view === 'job' ? (
        <div style={ws.layout}>
          <nav style={ws.nav} aria-label="Jobs">
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 6px 8px' }}>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Find a job or person</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Ben, General Manager" style={ws.input} />
            </label>
            {JOB_GROUPS.map(([name, ids]) => {
              const rows = ids.map((id) => ROWS.find((r) => r.id === id)).filter((r) => r && matches(r));
              if (!rows.length) return null;
              return (
                <div key={name}>
                  <p style={{ ...ws.kicker, margin: '10px 8px 4px' }}>{name}</p>
                  {rows.map((r) => (
                    <button key={r.id} style={{ ...ws.jobBtn, ...(r.id === row.id ? ws.jobBtnOn : {}) }} onClick={() => setRowId(r.id)}>
                      <span style={{ flex: 1, textAlign: 'left' }}>{r.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{count(r)}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
          <JobView row={row} onOpenPerson={onOpenPerson} />
        </div>
      ) : null}
    </div>
  );
}

const ws = {
  head: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 14, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary)' },
  sub: { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0', lineHeight: 1.5 },
  tabs: { display: 'flex', gap: 4, background: 'var(--bg-card)', padding: 4, borderRadius: 10, flexWrap: 'wrap' },
  tab: { fontFamily: 'inherit', fontSize: 13, fontWeight: 700, padding: '8px 12px', minHeight: 38, borderRadius: 8, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' },
  tabOn: { background: 'var(--neon)', color: 'var(--neon-text)' },
  layout: { display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' },
  nav: { flex: '1 1 240px', maxWidth: 280, background: 'var(--bg-card)', borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column' },
  input: { fontFamily: 'inherit', fontSize: 13.5, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', color: 'var(--text-primary)' },
  jobBtn: { fontFamily: 'inherit', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 10px', minHeight: 40, borderRadius: 8, border: 'none', background: 'none', color: 'var(--text-primary)', cursor: 'pointer' },
  jobBtnOn: { background: 'rgba(34,211,238,0.14)', color: 'var(--neon)', fontWeight: 700 },
  main: { flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 },
  card: { background: 'var(--bg-card)', borderRadius: 14, padding: '18px 20px', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' },
  h2: { fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--text-primary)' },
  section: { background: 'var(--bg-card)', borderRadius: 14, padding: '6px 20px 10px', marginBottom: 0 },
  kicker: { fontSize: 11, fontWeight: 800, letterSpacing: 0.9, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '12px 0 6px' },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: '1px solid var(--border)' },
  rowText: { flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 },
  rowName: { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  rowSays: { fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45 },
  changed: { fontSize: 11.5, fontWeight: 600, color: 'var(--warn)' },
  seg: { display: 'flex', gap: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 9, padding: 3, flexWrap: 'wrap' },
  segBtn: { fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, padding: '7px 11px', minHeight: 34, borderRadius: 7, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' },
  segOn: { background: 'var(--neon)', color: 'var(--neon-text)' },
  segOff: { background: 'rgba(255,255,255,0.14)', color: 'var(--text-primary)' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: { fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, padding: '6px 10px', minHeight: 32, borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' },
  chipOn: { background: 'rgba(34,211,238,0.14)', borderColor: 'transparent', color: 'var(--neon)' },
  tag: { fontSize: 12.5, padding: '6px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.07)', color: 'var(--text-secondary)' },
  foot: { fontSize: 12, color: 'var(--text-tertiary)', margin: '6px 0 6px' },
  who: { fontSize: 11, fontWeight: 800, letterSpacing: 0.4, background: 'rgba(232,185,59,0.14)', color: 'var(--warn)', padding: '4px 8px', borderRadius: 6 },
  ghostBtn: { fontFamily: 'inherit', fontSize: 13, fontWeight: 700, padding: '8px 12px', minHeight: 38, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-primary)', cursor: 'pointer' },
};
