// GENERATED from src/data/accessMatrix.js by sync-access-matrix.cjs - do not edit.
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
const ALL_FOLDERS = ['operations', 'financials', 'inventory', 'menu', 'staffing', 'marketing', 'maintenance', 'projects', 'compliance', 'techai', 'archives'];

// Each column, and the levels it can be set to, strongest first.
const COLUMNS = [
  { key: 'where', label: 'Where', options: [['all', 'All'], ['brands', 'All brands'], ['own', 'Own location']] },
  { key: 'folders', label: 'Folders', folders: true },
  { key: 'openingChecklist', label: 'Pre-opening checklist', options: [['edit', 'Edit'], ['tick', 'Tick'], ['view', 'View'], ['none', '—']] },
  // The daily opening and closing checklists (14 Oct 2026): Work ticks and
  // signs them off, at the person's own location.
  { key: 'dailyChecklists', label: 'Daily checklists', options: [['work', 'Work'], ['none', '—']] },
  { key: 'openingDates', label: 'Opening dates', options: [['full', 'Yes'], ['none', '—']] },
  { key: 'renewals', label: 'Renewals', options: [['full', 'Full'], ['view', 'View'], ['none', '—']] },
  // Assign (15 Oct 2026): Full, plus handing contacts to people to fill in.
  { key: 'operationalPoc', label: 'Operational POC', options: [['assign', 'Assign'], ['full', 'Full'], ['view', 'View'], ['none', '—']] },
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
const ROWS = [
  { id: 'owner', label: 'Owner · CEO', jobs: ['Owner', 'CEO'], d: r('all', ALL, 'tick', 'full', 'view', 'view', 'full', 'team', 'own', 'full', 'view', 'ask', 'ask', 'raise', 'full', 'post', 'full') },
  { id: 'coo', label: 'COO', jobs: ['COO'], d: r('all', ALL, 'edit', 'full', 'full', 'full', 'full', 'approve', 'own', 'full', 'view', 'approve', 'approve', 'raise', 'full', 'post', 'full', 'Approves time off, events, devices; sees the restaurants\' receipts (not executives\') and gets them by email at 7am') },
  { id: 'financials', label: 'Financials', jobs: ['Financials'], d: r('all', ['financials'], 'view', 'full', 'none', 'none', 'full', 'team', 'all', 'own', 'none', 'none', 'ask', 'raise', 'none', 'post', 'full') },
  { id: 'culinary', label: 'Culinary Dir. / Mgr', jobs: ['Culinary Director', 'Culinary Manager'], d: r('all', ALL, 'edit', 'full', 'view', 'view', 'full', 'team', 'own', 'own', 'view', 'ask', 'ask', 'raise', 'read', 'post', 'full') },
  { id: 'beverage', label: 'Beverage Manager', jobs: ['Beverage Manager'], d: r('all', 'all', 'edit', 'full', 'view', 'view', 'full', 'team', 'own', 'own', 'view', 'ask', 'ask', 'raise', 'read', 'post', 'full') },
  { id: 'gm', label: 'General Manager', jobs: ['General Manager'], d: r('own', ALL, 'none', 'full', 'full', 'full', 'full', 'team', 'own', 'own', 'view', 'ask', 'ask', 'raise', 'read', 'read', 'none', 'Gets renewals for their location; sees catering, Catering & Events claims it') },
  { id: 'agm', label: 'Assistant Manager', jobs: ['Assistant Manager'], d: r('own', NO_FIN, 'none', 'full', 'view', 'view', 'full', 'own', 'own', 'own', 'view', 'ask', 'ask', 'raise', 'read', 'read', 'none') },
  { id: 'km', label: 'Kitchen Manager', jobs: ['Kitchen Manager'], d: r('own', KITCHEN, 'tick', 'full', 'view', 'view', 'full', 'own', 'own', 'own', 'view', 'ask', 'ask', 'raise', 'read', 'read', 'none') },
  { id: 'chef', label: 'Executive Chef', jobs: ['Executive Chef'], d: r('own', KITCHEN, 'none', 'full', 'view', 'view', 'full', 'own', 'own', 'own', 'view', 'ask', 'ask', 'raise', 'read', 'read', 'none', 'Hears when an event is confirmed') },
  { id: 'sous', label: 'Sous Chef', jobs: ['Sous Chef'], d: r('own', ['operations', 'menu', 'inventory', 'maintenance'], 'none', 'full', 'none', 'full', 'full', 'own', 'own', 'own', 'view', 'none', 'ask', 'raise', 'read', 'read', 'none', 'Gets catering for their location') },
  { id: 'catering', label: 'Catering & Events', jobs: ['Catering & Events'], d: r('own', ['marketing', 'menu', 'operations'], 'none', 'full', 'none', 'full', 'full', 'own', 'own', 'own', 'claim', 'ask', 'ask', 'raise', 'read', 'read', 'none') },
  { id: 'it', label: 'IT & Training', jobs: ['IT & Training'], d: r('all', ALL, 'none', 'full', 'full', 'full', 'full', 'team', 'own', 'full', 'view', 'ask', 'view', 'handle', 'full', 'post', 'full', 'Everything except the pre-opening checklist; handles Systems Help') },
  { id: 'marketing', label: 'Marketing & Media', jobs: ['Marketing', 'Communications'], d: r('brands', ['marketing', 'archives'], 'none', 'full', 'none', 'none', 'full', 'none', 'none', 'none', 'none', 'none', 'none', 'raise', 'none', 'read', 'none', 'Includes the agency logins') },
  { id: 'video', label: 'Videographer', jobs: ['Videographer'], d: r('brands', ['marketing'], 'none', 'full', 'none', 'none', 'full', 'none', 'none', 'own', 'none', 'none', 'none', 'raise', 'none', 'read', 'none') },
  { id: 'hr', label: 'HR', jobs: ['HR'], d: r('all', ['staffing'], 'none', 'full', 'none', 'none', 'full', 'team', 'own', 'own', 'none', 'none', 'ask', 'raise', 'full', 'read', 'none') },
  { id: 'realestate', label: 'Real Estate', jobs: ['Real Estate'], d: r('all', ['projects', 'compliance'], 'view', 'full', 'view', 'none', 'full', 'none', 'own', 'own', 'none', 'none', 'none', 'raise', 'none', 'read', 'none') },
];

// Brought up to date 14 Oct 2026: the Daily checklists column (GMs,
// assistant managers and chefs work them), everyone can open HR (only the
// insurance section on it is executives-only), and notes that say what each
// row actually does now.
const DAILY_WORK = ['gm', 'agm', 'chef', 'sous'];
const NOTES = {
  coo: "Approves time off, events, devices; sees the restaurants' receipts (not executives') with a 7am email; hears when yesterday's daily checklists were not signed off",
  financials: "Sees every receipt; looks after the accounts, entities and each person's default entity",
  gm: 'Works the daily checklists and gets renewals for their location; sees catering, Catering & Events claims it',
  agm: 'Works the daily checklists at their location',
  chef: 'Works the daily checklists at their location; hears when an event is confirmed',
  sous: 'Works the daily checklists at their location; gets catering for their location',
  catering: 'Claims, works and edits catering and private events at their location; adds event costs',
  it: 'Everything except the pre-opening checklist; handles Systems Help. Their restaurants come from their login',
};
// Operational POC (14 Oct 2026): Mark wants every location's contacts filled
// in, and that is the job of the GMs, assistant managers, Shannon, Ronnie and
// Bobbie - so they are Full (fill in, add and remove at their places). View
// is now read-only on the page.
const POC_FULL = ['coo', 'culinary', 'beverage', 'gm', 'agm'];
ROWS.forEach((row) => {
  if (POC_FULL.includes(row.id)) row.d.operationalPoc = 'full';
  // The COO also assigns who fills each contact in (Brenner, 15 Oct 2026).
  if (row.id === 'coo') row.d.operationalPoc = 'assign';
  row.d.dailyChecklists = DAILY_WORK.includes(row.id) ? 'work' : 'none';
  if (row.d.hr === 'none') row.d.hr = 'read';
  if (NOTES[row.id]) row.d.note = NOTES[row.id];
});

function rowForJob(job) {
  return ROWS.find((row) => row.jobs.includes(job)) ?? null;
}

// Executives don't ask for time off; they put in the dates they'll be
// unavailable (Brenner, 14 Oct 2026). Executive logins only - not IT &
// Training (Cameron), Marketing or the videographer. Kept in step with
// usesUnavailableDates() in firestore.rules.
const NOT_UNAVAILABLE_ROWS = ['it', 'marketing', 'video'];
function usesUnavailableDates(user) {
  if (user?.role !== 'executive') return false;
  return !NOT_UNAVAILABLE_ROWS.includes(rowForJob(user.job)?.id);
}

// The live table, set by AccessMatrixProvider whenever it changes, so plain
// functions (hasFeature, hasCategoryAccess) can read it without a hook.
let LIVE = null;
function setLiveMatrix(m) {
  LIVE = m;
}

// The level a person has for a column. Admins: always the top level.
// matrix is the live table (defaults with admin edits applied).
function accessLevel(user, column, matrix = LIVE) {
  const col = COLUMNS.find((c) => c.key === column);
  if (!user || !col) return 'none';
  if (user.role === 'admin') return col.folders ? ALL : col.options[0][0];
  const row = rowForJob(user.job);
  if (!row) return col.folders ? [] : 'none';
  const v = (matrix?.[row.id] ?? row.d)[column];
  // Everyone can open HR (14 Oct 2026), even a row saved as "—" before.
  if (column === 'hr' && (v === 'none' || v == null)) return 'read';
  // A row saved before the Daily checklists column existed gets its default.
  if (column === 'dailyChecklists' && v == null) return row.d.dailyChecklists;
  // Same for Operational POC (15 Oct 2026): the Assistant Manager, Catering
  // and Executive Chef rows were saved before it was a column, so they read as
  // blank - the page treated AGMs as unable to fill it in, while the rules
  // (which fall back to the built-in) let them.
  if (column === 'operationalPoc' && v == null) return row.d.operationalPoc;
  return v;
}

// Every restaurant, without needing them ticked on the login? Admins, and
// executives whose row says All / All brands. A manager's own login always
// decides their restaurants and locations (Brenner, 14 Oct 2026): taking a
// location off Cameron's login has to take it away, even though her row
// (IT & Training) says All. The server's emails already worked this way.
function seesEveryRestaurant(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'manager') return false;
  return ['all', 'brands'].includes(accessLevel(user, 'where'));
}

const RANK = { assign: 4, work: 3, none: 0, read: 1, raise: 1, ask: 1, view: 1, own: 1, tick: 2, team: 2, full: 3, claim: 3, all: 3, post: 3, handle: 3, approve: 4, edit: 4 };

// Does this person have at least this level? e.g. atLeast(user, 'availability', 'team').
function atLeast(user, column, level) {
  return (RANK[accessLevel(user, column)] ?? 0) >= (RANK[level] ?? 0);
}

// A person's job row decides their folders. On top of that, an admin can
// give one person one extra folder by approving an access request - stored
// as permissions.extraFolders, and listed in Manage Logins under "Also given".
function canSeeFolder(user, folderId) {
  const f = accessLevel(user, 'folders');
  if (f === 'all' || (Array.isArray(f) && f.includes(folderId))) return true;
  return (user?.permissions?.extraFolders ?? []).includes(folderId);
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
// Assigned work only (16 Oct 2026, Ben): a login switched on by an admin can
// be given opening checklist items and POC contacts, and sees just those -
// on Home and on those pages - without the rest of either list.
const ASSIGNED_WORK_FEATURES = ['openingChecklist', 'operationalPoc'];
function assignedWorkOnly(user, key) {
  return !!user && user.assignedWork === true && ASSIGNED_WORK_FEATURES.includes(key) && !featureAllowed(user, key);
}

function featureAllowed(user, key) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (key === 'support') return true;
  // One extra part of the Hub given to one person by an approved request.
  if ((user.permissions?.extraFeatures ?? []).includes(key)) return true;
  const col = FEATURE_COLUMN[key];
  return col ? accessLevel(user, col) !== 'none' : true;
}

module.exports = { ALL_FOLDERS, COLUMNS, ROWS, rowForJob, NOT_UNAVAILABLE_ROWS, usesUnavailableDates, setLiveMatrix, accessLevel, seesEveryRestaurant, atLeast, canSeeFolder, assignedWorkOnly, featureAllowed };
