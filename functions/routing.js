// WHO HEARS ABOUT WHAT
//
// Every notification the Hub sends is decided here. If a person is getting
// something they should not, or missing something they should, this is the
// file to change. The table is printed in the handover.
//
// Topic           When                                Who                                              How
// --------------  ----------------------------------  -----------------------------------------------  -------
// timeOff         a request is made                   the COO and admins                               urgent
// timeOff         it is decided                       the person who asked                             urgent
// eventRequest    a request is made                   the COO and admins                               urgent
// eventRequest    it is approved or denied            the person who asked; if approved, the people    urgent
//                                                     named on it and the chosen jobs at that location
// accessRequest   a request is made                   admins                                           urgent
// accessRequest   it is decided (reason if declined)  the person who asked                             urgent
// accessRequest   an admin changes the answer         the person who asked (access follows the answer) urgent
// deviceRequest   a request is made                   the COO and admins                               urgent
// deviceRequest   approved, declined, ordered         the person who asked                             urgent
// systemsHelp     a request is made                   IT & Training and admins                         urgent
// systemsHelp     answered or done                    the person who asked                             urgent
// catering        a new enquiry                       that location's GM, Catering & Events and chefs  urgent
// catering        confirmed (via its calendar entry)  that location's GM, AGMs, chefs, Catering & Ev.  urgent
// catering        an admin changes its status         whoever claimed it; if nobody, the catering team urgent
// tagged          a job is tagged on a calendar entry that job at that entry's location only           urgent
// renewal         60, 30, 7 days out, and expiry      admins, the COO, and that location's GM          urgent
// signature       a document is sent                  each person who must sign                        urgent
// signature       everyone has signed                 the person who sent it                           urgent
// message         a new message                       the conversation, not the sender (throttled)     urgent
// tagged          tagged on a calendar entry          the people tagged                                urgent
// assignment      a checklist item is assigned        the person assigned                              urgent
// expenses        catch-up week Monday / Thursday     everyone who can submit receipts                 urgent
// expenses        calendar about to run out           admins and finance                               urgent
// post            a restaurant or company post        everyone who can see it                          summary
// folderPost      a post in a location's folder       everyone whose Who sees what row (or an approved summary
//                                                     request) opens that folder, at that location
//
// "Urgent" emails straight away. "Summary" waits for the 8am email.
// Finance (job: Financials) hears about expenses, Financials folder posts,
// company and restaurant posts, and anything they are named on - nothing else.
// Admins can see everything in the Hub; they are emailed only for what is
// routed to them above.
const admin = require('firebase-admin');

// Static locations, until brands and locations have one home (cleanup phase).
// Locations added in the app carry their own brandId.
const STATIC_LOCATION_BRAND = {
  'taste-starkville': 'taste',
  'taste-ridgeland': 'taste',
  'blutos-starkville': 'blutos',
  'heritage-starkville': 'heritage',
};
const BRAND_IDS = ['taste', 'blutos', 'heritage', 'pronto', 'stellas'];
const STATIC_LOCATION_NAME = {
  'taste-starkville': 'Taste Starkville',
  'taste-ridgeland': 'Taste Ridgeland',
  'blutos-starkville': 'Blutos Starkville',
  'heritage-starkville': 'Heritage Chophouse Starkville',
};

async function locationName(locationId) {
  if (!locationId) return '';
  if (STATIC_LOCATION_NAME[locationId]) return STATIC_LOCATION_NAME[locationId];
  const snap = await admin.firestore().collection('customLocations').doc(locationId).get();
  return snap.exists ? snap.data().name ?? locationId : locationId;
}

const isAdmin = (u) => u.role === 'admin';
const isCoo = (u) => u.job === 'COO';
const isFinance = (u) => u.job === 'Financials';
const notGhost = (u) => u.isGhost !== true;

async function activeUsers() {
  const snap = await admin.firestore().collection('users').get();
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((u) => u.active !== false);
}

async function brandForLocation(locationId) {
  if (!locationId) return null;
  if (STATIC_LOCATION_BRAND[locationId]) return STATIC_LOCATION_BRAND[locationId];
  const snap = await admin.firestore().collection('customLocations').doc(locationId).get();
  return snap.exists ? snap.data().brandId ?? null : null;
}

async function brandForTarget(targetId) {
  if (!targetId || targetId === 'all') return null;
  if (BRAND_IDS.includes(targetId)) return targetId;
  return brandForLocation(targetId);
}

// Can this person open that restaurant (and, if given, that location)?
// Admins and executives see every location; a manager sees what they were given.
function seesLocation(u, brandId, locationId = null) {
  if (!brandId) return true;
  if (u.role === 'admin' || u.role === 'executive') return true;
  if (!(u.permissions?.brandIds ?? []).includes(brandId)) return false;
  if (!locationId) return true;
  const only = u.permissions?.locationsByBrand?.[brandId];
  return !Array.isArray(only) || only.length === 0 || only.includes(locationId);
}

// The live Who sees what table: the approved defaults plus any cell an admin
// changed in Manage Logins (accessMatrix/{row}). Read once per send.
const M = require('./accessMatrix.gen');
async function liveMatrix() {
  const snap = await admin.firestore().collection('accessMatrix').get();
  const overrides = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
  return Object.fromEntries(M.ROWS.map((row) => [row.id, { ...row.d, ...(overrides[row.id] ?? {}) }]));
}

// Should this person be told about a post in this folder? The same answer
// the screens give: their job's folders in Who sees what, plus any folder an
// admin gave them by approving a request. It used to read the old per-person
// folder list, which nothing else reads any more - so someone without
// Financials could be emailed a Financials post.
function hearsFolder(u, categoryId, matrix) {
  if (isAdmin(u)) return true;
  const f = M.accessLevel(u, 'folders', matrix);
  if (f === 'all' || (Array.isArray(f) && f.includes(categoryId))) return true;
  return (u.permissions?.extraFolders ?? []).includes(categoryId);
}

// The people with these jobs who work at this location.
function atLocation(users, jobs, brandId, locationId) {
  return users.filter(
    (u) => jobs.includes(u.job) && u.role !== 'admin' && seesLocation(u, brandId, locationId) &&
      // An executive with a location job title is company-wide, not "at" one.
      u.role === 'manager'
  );
}

// --- The audiences --------------------------------------------------------

const approvers = (users) => users.filter((u) => isAdmin(u) || isCoo(u));
const admins = (users) => users.filter(isAdmin);

async function cateringTeam(users, locationId) {
  const brandId = await brandForLocation(locationId);
  return atLocation(users, ['General Manager', 'Catering & Events', 'Executive Chef', 'Sous Chef'], brandId, locationId);
}

async function renewalTeam(users, locationId) {
  const brandId = await brandForLocation(locationId);
  const gms = atLocation(users, ['General Manager'], brandId, locationId);
  return dedupe([...users.filter((u) => isAdmin(u) || isCoo(u)), ...gms]);
}

async function postAudience(users, post) {
  const brandId = await brandForTarget(post.targetId);
  return users.filter((u) => u.uid !== post.authorUid && notGhost(u) && seesLocation(u, brandId));
}

async function folderPostAudience(users, post) {
  const brandId = await brandForLocation(post.locationId);
  const matrix = await liveMatrix();
  return users.filter(
    (u) => u.uid !== post.authorUid && notGhost(u) && seesLocation(u, brandId, post.locationId) && hearsFolder(u, post.categoryId, matrix)
  );
}

function dedupe(people) {
  const seen = new Set();
  return people.filter((p) => (seen.has(p.uid) ? false : seen.add(p.uid)));
}

const without = (people, uid) => people.filter((p) => p.uid !== uid);

module.exports = {
  activeUsers, brandForLocation, brandForTarget, locationName, seesLocation, hearsFolder, atLocation,
  approvers, admins, cateringTeam, renewalTeam, postAudience, folderPostAudience,
  dedupe, without, isAdmin, isCoo, isFinance, notGhost,
};
