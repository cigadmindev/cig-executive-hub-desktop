// WHO SEES WHAT - one row per job, one column per part of the Hub.
//
// This is the source of truth for access. A person gets their job's row;
// the restaurants and locations on their own login narrow anything marked
// "own location". Admins see everything and are not a row here.
//
// The defaults below are the table Brenner approved on 6 October 2026.
// Admins can change any cell in Manage Logins → Who sees what; a change is
// stored in Firestore (accessMatrix/{job}) and overrides the default here.
// The folder ids, in the order the Hub shows them (data/mockData categories).
// Listed here rather than imported, so mockData can import this file.
export const ALL_FOLDERS = ['operations', 'financials', 'inventory', 'menu', 'staffing', 'marketing', 'maintenance', 'projects', 'compliance', 'techai', 'archives'];

// Each column, and the levels it can be set to, strongest first.
export const COLUMNS = [
  { key: 'where', label: 'Where', options: [['all', 'All'], ['brands', 'All brands'], ['own', 'Own location']] },
  { key: 'folders', label: 'Folders', folders: true },
  { key: 'openingChecklist', label: 'Pre-opening checklist', options: [['edit', 'Edit'], ['tick', 'Tick'], ['view', 'View'], ['none', '—']] },
  { key: 'openingDates', label: 'Opening dates', options: [['full', 'Yes'], ['none', '—']] },
  { key: 'renewals', label: 'Renewals', options: [['full', 'Full'], ['view', 'View'], ['none', '—']] },
  { key: 'operationalPoc', label: 'Operational POC', options: [['full', 'Full'], ['view', 'View'], ['none', '—']] },
  { key: 'calendar', label: 'Calendar & messages', options: [['full', 'Yes'], ['none', '—']] },
  { key: 'availability', label: 'Availability', options: [['approve', 'Approve'], ['team', 'Team'], ['own', 'Own'], ['none', '—']] },
  { key: 'expenses', label: 'Expenses', options: [['all', 'All'], ['own', 'Own'], ['none', '—']] },
  { key: 'signatures', label: 'Signature Directory', options: [['full', 'Full'], ['own', 'Own'], ['none', '—']] },
  { key: 'catering', label: 'Catering', options: [['claim', 'Claim'], ['view', 'View'], ['none', '—']] },
  { key: 'eventRequests', label: 'Event requests', options: [['approve', 'Approve'], ['ask', 'Ask'], ['none', '—']] },
  { key: 'deviceRequests', label: 'Device requests', options: [['approve', 'Approve'], ['view', 'View'], ['ask', 'Ask'], ['none', '—']] },
  { key: 'systemsHelp', label: 'Systems Help', options: [['handle', 'Handle'], ['raise', 'Raise'], ['none', '—']] },
  { key: 'hr', label: 'HR & Emergency', options: [['full', 'Full'], ['read', 'Read'], ['none', '—']] },
  { key: 'announcements', label: 'Announcements', options: [['post', 'Post'], ['read', 'Read']] },
  { key: 'executiveNotes', label: 'Executive notes', options: [['full', 'Yes'], ['none', '—']] },
];

const r = (where, folders, openingChecklist, openingDates, renewals, operationalPoc, calendar, availability, expenses, signatures, catering, eventRequests, deviceRequests, systemsHelp, hr, announcements, executiveNotes, note = '') => ({
  where, folders, openingChecklist, openingDates, renewals, operationalPoc, calendar, availability, expenses, signatures, catering, eventRequests, deviceRequests, systemsHelp, hr, announcements, executiveNotes, note,
});
const ALL = 'all';
const OPS4 = ['operations', 'menu', 'inventory', 'compliance'];
const KITCHEN = ['operations', 'menu', 'inventory', 'maintenance', 'compliance'];
const NO_FIN = ALL_FOLDERS.filter((f) => f !== 'financials');

// Rows in display order. Several job titles share a row.
export const ROWS = [
  { id: 'owner', label: 'Owner · CEO', jobs: ['Owner', 'CEO'], d: r('all', ALL, 'tick', 'full', 'view', 'view', 'full', 'team', 'own', 'full', 'view', 'ask', 'ask', 'raise', 'full', 'post', 'full') },
  { id: 'coo', label: 'COO', jobs: ['COO'], d: r('all', ALL, 'edit', 'full', 'full', 'full', 'full', 'approve', 'own', 'full', 'view', 'approve', 'approve', 'raise', 'full', 'post', 'full', 'Approves time off, events, devices; gets the daily receipts email') },
  { id: 'financials', label: 'Financials', jobs: ['Financials'], d: r('all', ['financials'], 'view', 'full', 'none', 'none', 'full', 'team', 'all', 'own', 'none', 'none', 'ask', 'raise', 'none', 'post', 'full') },
  { id: 'culinary', label: 'Culinary Dir. / Mgr', jobs: ['Culinary Director', 'Culinary Manager'], d: r('all', ALL, 'edit', 'full', 'view', 'view', 'full', 'team', 'own', 'own', 'view', 'ask', 'ask', 'raise', 'read', 'post', 'full') },
  { id: 'beverage', label: 'Beverage Manager', jobs: ['Beverage Manager'], d: r('all', 'all', 'edit', 'full', 'view', 'view', 'full', 'team', 'own', 'own', 'view', 'ask', 'ask', 'raise', 'read', 'post', 'full') },
  { id: 'gm', label: 'General Manager', jobs: ['General Manager'], d: r('own', ALL, 'none', 'full', 'full', 'full', 'full', 'team', 'own', 'own', 'claim', 'ask', 'ask', 'raise', 'read', 'read', 'none', 'Gets catering and renewals for their location') },
  { id: 'agm', label: 'Assistant Manager', jobs: ['Assistant Manager'], d: r('own', NO_FIN, 'none', 'full', 'view', 'view', 'full', 'own', 'own', 'own', 'claim', 'ask', 'ask', 'raise', 'read', 'read', 'none') },
  { id: 'km', label: 'Kitchen Manager', jobs: ['Kitchen Manager'], d: r('own', KITCHEN, 'tick', 'full', 'view', 'view', 'full', 'own', 'own', 'own', 'view', 'ask', 'ask', 'raise', 'read', 'read', 'none') },
  { id: 'chef', label: 'Executive Chef', jobs: ['Executive Chef'], d: r('own', KITCHEN, 'none', 'full', 'view', 'view', 'full', 'own', 'own', 'own', 'claim', 'ask', 'ask', 'raise', 'read', 'read', 'none', 'Gets catering for their location') },
  { id: 'sous', label: 'Sous Chef', jobs: ['Sous Chef'], d: r('own', ['operations', 'menu', 'inventory', 'maintenance'], 'none', 'full', 'none', 'full', 'full', 'own', 'own', 'own', 'view', 'none', 'ask', 'raise', 'read', 'read', 'none', 'Gets catering for their location') },
  { id: 'catering', label: 'Catering & Events', jobs: ['Catering & Events'], d: r('own', ['marketing', 'menu', 'operations'], 'none', 'full', 'none', 'full', 'full', 'own', 'own', 'own', 'claim', 'ask', 'ask', 'raise', 'read', 'read', 'none') },
  { id: 'it', label: 'IT & Training', jobs: ['IT & Training'], d: r('all', ALL, 'none', 'full', 'full', 'full', 'full', 'team', 'own', 'full', 'claim', 'ask', 'view', 'handle', 'full', 'post', 'full', 'Everything except the pre-opening checklist; handles Systems Help') },
  { id: 'marketing', label: 'Marketing & Media', jobs: ['Marketing', 'Communications'], d: r('brands', ['marketing', 'archives'], 'none', 'full', 'none', 'none', 'full', 'none', 'none', 'none', 'none', 'none', 'none', 'raise', 'none', 'read', 'none', 'Includes the agency logins') },
  { id: 'video', label: 'Videographer', jobs: ['Videographer'], d: r('brands', ['marketing'], 'none', 'full', 'none', 'none', 'full', 'none', 'none', 'own', 'none', 'none', 'none', 'raise', 'none', 'read', 'none') },
  { id: 'hr', label: 'HR', jobs: ['HR'], d: r('all', ['staffing'], 'none', 'full', 'none', 'none', 'full', 'team', 'own', 'own', 'none', 'none', 'ask', 'raise', 'full', 'read', 'none') },
  { id: 'realestate', label: 'Real Estate', jobs: ['Real Estate'], d: r('all', ['projects', 'compliance'], 'view', 'full', 'view', 'none', 'full', 'none', 'own', 'own', 'none', 'none', 'none', 'raise', 'none', 'read', 'none') },
];

export function rowForJob(job) {
  return ROWS.find((row) => row.jobs.includes(job)) ?? null;
}

// The live table, set by AccessMatrixProvider whenever it changes, so plain
// functions (hasFeature, hasCategoryAccess) can read it without a hook.
let LIVE = null;
export function setLiveMatrix(m) {
  LIVE = m;
}

// The level a person has for a column. Admins: always the top level.
// matrix is the live table (defaults with admin edits applied).
export function accessLevel(user, column, matrix = LIVE) {
  const col = COLUMNS.find((c) => c.key === column);
  if (!user || !col) return 'none';
  if (user.role === 'admin') return col.folders ? ALL : col.options[0][0];
  const row = rowForJob(user.job);
  if (!row) return col.folders ? [] : 'none';
  return (matrix?.[row.id] ?? row.d)[column];
}

const RANK = { none: 0, read: 1, raise: 1, ask: 1, view: 1, own: 1, tick: 2, team: 2, full: 3, claim: 3, all: 3, post: 3, handle: 3, approve: 4, edit: 4 };

// Does this person have at least this level? e.g. atLeast(user, 'availability', 'team').
export function atLeast(user, column, level) {
  return (RANK[accessLevel(user, column)] ?? 0) >= (RANK[level] ?? 0);
}

export function canSeeFolder(user, folderId) {
  const f = accessLevel(user, 'folders');
  return f === 'all' || (Array.isArray(f) && f.includes(folderId));
}

// The old feature switches, answered by the table.
const FEATURE_COLUMN = {
  openingChecklist: 'openingChecklist',
  operationalPoc: 'operationalPoc',
  renewals: 'renewals',
  eventRequests: 'eventRequests',
  integrations: 'operationalPoc',
  availability: 'availability',
  workOrders: 'signatures',
  expenses: 'expenses',
};
export function featureAllowed(user, key) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (key === 'support') return true;
  const col = FEATURE_COLUMN[key];
  return col ? accessLevel(user, col) !== 'none' : true;
}
