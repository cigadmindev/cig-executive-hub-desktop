import React from 'react';
import { accessLevel, rowForJob, ALL_FOLDERS } from '../data/accessMatrix';
import { brands, categories } from '../data/mockData';

// "In plain words": what a person will see, can't see, and is emailed about,
// worked out from their job's row in Who sees what and the locations on
// their login. Shown before a login is created or changed.
const NAMES = {
  openingChecklist: { edit: 'the pre-opening checklist (edit)', tick: 'the pre-opening checklist (tick items off)', view: 'the pre-opening checklist (view)' },
  openingDates: { full: 'opening dates' },
  renewals: { full: 'renewals', view: 'renewals (view)' },
  operationalPoc: { full: 'Operational POC', view: 'Operational POC (view)' },
  calendar: { full: 'calendar and messages' },
  availability: { approve: "the team's availability, and approving time off", team: "the team's availability", own: 'their own availability and time off' },
  expenses: { all: 'every expense report', own: 'their own expenses' },
  signatures: { full: 'the Signature Directory', own: 'documents sent to them to sign' },
  catering: { claim: 'catering (and claim enquiries)', view: 'catering (view)' },
  eventRequests: { approve: 'event requests (approve)', ask: 'event requests (ask)' },
  deviceRequests: { approve: 'device requests (approve)', view: 'device requests (view)', ask: 'asking for a device' },
  systemsHelp: { handle: 'Systems Help (handles requests)', raise: 'Systems Help' },
  hr: { full: 'HR and Emergency', read: 'HR and Emergency (read)' },
  announcements: { post: 'posting announcements' },
  executiveNotes: { full: 'Executive notes' },
};
const CANT = { openingChecklist: 'the pre-opening checklist', executiveNotes: 'Executive notes', expenses: 'Expenses', catering: 'Catering', renewals: 'renewals', availability: "anyone's availability" };

export function describeAccess(person) {
  if (person.role === 'admin') return { where: 'everything', can: ['everything in the Hub'], cant: ['private messages they are not in'], folders: 'every folder', emails: 'whatever is routed to admins' };
  const row = rowForJob(person.job);
  if (!row) return null;
  const lv = (k) => accessLevel(person, k);
  const wide = ['all', 'brands'].includes(lv('where'));
  const where = wide
    ? 'every restaurant'
    : (person.permissions?.brandIds ?? [])
        .map((b) => {
          const brand = brands.find((x) => x.id === b);
          const only = person.permissions?.locationsByBrand?.[b];
          return Array.isArray(only) && only.length
            ? only.map((id) => (brand?.name ?? b) + ' ' + (brand?.locations?.find((l) => l.id === id)?.name ?? id)).join(', ')
            : (brand?.name ?? b) + ' (every location)';
        })
        .join(', ') || 'no restaurants yet';
  const can = Object.keys(NAMES).map((k) => NAMES[k][lv(k)]).filter(Boolean);
  const cant = Object.keys(CANT).filter((k) => lv(k) === 'none').map((k) => CANT[k]);
  const f = lv('folders');
  const list = f === 'all' ? ALL_FOLDERS : f;
  const missing = ALL_FOLDERS.filter((x) => !list.includes(x)).map((x) => categories.find((c) => c.id === x)?.label ?? x);
  const folders = missing.length === 0 ? 'every folder' : list.length === 0 ? 'no folders' : missing.length <= 3 ? 'every folder except ' + missing.join(', ') : list.map((x) => categories.find((c) => c.id === x)?.label ?? x).join(', ');
  const emails = [
    lv('catering') === 'claim' && 'catering at their location',
    lv('availability') === 'approve' && 'time off to approve',
    lv('eventRequests') === 'approve' && 'event requests to approve',
    lv('deviceRequests') === 'approve' && 'device requests to approve',
    lv('systemsHelp') === 'handle' && 'Systems Help requests',
    lv('expenses') === 'all' && 'expense reports',
    'things they are tagged on, documents to sign, and answers to their own requests',
  ].filter(Boolean).join(', ');
  // Given to this one person on top of their row, by approved access requests.
  const FEATURE_NAMES = { openingChecklist: 'the pre-opening checklist', operationalPoc: 'Operational POC', renewals: 'renewals', eventRequests: 'event requests', availability: 'availability', expenses: 'Expenses' };
  const extras = [
    ...(person.permissions?.extraFolders ?? []).filter((x) => !list.includes(x)).map((x) => (categories.find((c) => c.id === x)?.label ?? x) + ' folder'),
    ...(person.permissions?.extraFeatures ?? []).map((x) => FEATURE_NAMES[x] ?? x),
  ];
  return { where, can, cant, folders, emails, extras, row: row.label };
}

export default function AccessSummary({ person }) {
  const d = describeAccess(person);
  return (
    <div style={styles.box}>
      <p style={styles.kicker}>In plain words</p>
      {!d ? (
        <p style={styles.text}>Choose a job — that is what decides what they can see.</p>
      ) : (
        <>
          <p style={styles.text}>
            <strong>{person.name || 'They'}</strong> will see <strong>{d.where}</strong>.
          </p>
          <p style={styles.text}><span style={styles.muted}>Can open:</span> {d.can.join(', ')}.</p>
          <p style={styles.text}><span style={styles.muted}>Folders:</span> {d.folders}.</p>
          {d.extras?.length ? <p style={styles.text}><span style={styles.muted}>Also given:</span> {d.extras.join(', ')} — from approved access requests.</p> : null}
          {d.cant.length ? <p style={styles.text}><span style={styles.muted}>Can't see:</span> {d.cant.join(', ')}.</p> : null}
          <p style={styles.text}><span style={styles.muted}>Emailed about:</span> {d.emails}.</p>
          {d.row ? <p style={styles.foot}>From the {d.row} row in Who sees what. Change the row, and this changes for everyone with that job.</p> : null}
        </>
      )}
    </div>
  );
}

const styles = {
  box: { background: '#16161A', border: '1px solid var(--border)', borderLeft: '3px solid var(--neon)', borderRadius: 10, padding: '14px 16px', margin: '14px 0' },
  kicker: { fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--neon)', margin: '0 0 6px' },
  text: { fontSize: 14, lineHeight: 1.55, color: 'var(--text-primary)', margin: '0 0 6px' },
  muted: { color: 'var(--text-secondary)' },
  foot: { fontSize: 12, color: 'var(--text-tertiary)', margin: '8px 0 0' },
};
