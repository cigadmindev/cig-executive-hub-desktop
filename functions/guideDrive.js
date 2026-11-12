// The Hub Guide's document search (Nov 2026). Someone asks the Guide for a
// file ("the Chelsea lease", "October temperature logs at Ridgeland"); this
// searches the CIG shared drive - names and the words inside PDFs, Docs and
// Sheets - and hands back only files that sit inside a location folder the
// person can open, in a folder type their job can see. The same rules as
// the folder pages: seesLocation + hearsFolder (Who sees what, plus any
// folder an admin added for them). Admins see every match in the drive.
//
// It never lists who else can see a file, never changes anything, and
// returns at most 15 files.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const { requireLive } = require('./caller');
const { liveMatrix, seesLocation, hearsFolder } = require('./routing');

const DRIVE_ID = '0ANOluAAxZB7lUk9PVA';
const FOLDER = 'application/vnd.google-apps.folder';
const SHARED = { corpora: 'drive', driveId: DRIVE_ID, includeItemsFromAllDrives: true, supportsAllDrives: true };
const FILE_FIELDS = 'nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink, parents, lastModifyingUser(displayName))';

let driveP = null;
function drive() {
  if (!driveP) {
    const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
    driveP = auth.getClient().then((c) => google.drive({ version: 'v3', auth: c }));
  }
  return driveP;
}

// Every linked Hub folder, by Drive folder id. Kept for 10 minutes.
let linksCache = { at: 0, byFolder: new Map(), list: [] };
async function links() {
  if (Date.now() - linksCache.at < 10 * 60 * 1000) return linksCache;
  const snap = await admin.firestore().collection('categoryDriveLinks').get();
  const list = [];
  snap.forEach((d) => {
    const x = d.data();
    const m = String(x.driveUrl ?? '').match(/folders\/([A-Za-z0-9_-]+)/);
    if (m) list.push({ folderId: m[1], brandId: x.brandId, locationId: x.locationId, categoryId: x.categoryId, itemName: x.itemName });
  });
  linksCache = { at: Date.now(), byFolder: new Map(list.map((l) => [l.folderId, l])), list };
  return linksCache;
}

// A folder's name and parent, remembered between searches for an hour.
const folderCache = new Map();
async function folderInfo(d, id) {
  const c = folderCache.get(id);
  if (c && Date.now() - c.at < 60 * 60 * 1000) return c;
  try {
    const f = (await d.files.get({ fileId: id, fields: 'id, name, parents', supportsAllDrives: true })).data;
    const v = { at: Date.now(), name: f.name, parent: f.parents?.[0] ?? null };
    folderCache.set(id, v);
    return v;
  } catch {
    const v = { at: Date.now(), name: '', parent: null };
    folderCache.set(id, v);
    return v;
  }
}

// Walks up from a file to the Hub folder it lives in (if any), collecting
// the folder names on the way so the Guide can say where it is.
async function placeOf(d, file, byFolder) {
  const path = [];
  let id = file.parents?.[0] ?? null;
  for (let depth = 0; id && depth < 8; depth++) {
    const link = byFolder.get(id);
    if (link) return { link, path };
    const info = await folderInfo(d, id);
    if (info.name) path.unshift(info.name);
    id = info.parent;
  }
  return { link: null, path };
}

const clean = (w) => String(w).replace(/['\\]/g, '').slice(0, 40);

exports.guideDriveSearch = onCall({ timeoutSeconds: 60, memory: '512MiB' }, async (request) => {
  const caller = await requireLive(request);
  const { words = [], locationIds = null, categoryId = null, itemName = null, since = null, until = null, asUid = null } = request.data || {};
  // An admin using "See the Hub as someone" gets exactly what that person
  // would get, so the Guide can be checked for each job.
  let me = caller;
  if (asUid && caller.role === 'admin' && asUid !== caller.uid) {
    const snap = await admin.firestore().collection('users').doc(String(asUid)).get();
    if (!snap.exists) throw new HttpsError('not-found', 'That login does not exist.');
    me = { uid: snap.id, ...snap.data() };
  }
  if (!Array.isArray(words) || words.length > 8) throw new HttpsError('invalid-argument', 'Too many words.');
  const isAdmin = me.role === 'admin';
  const matrix = await liveMatrix();
  const { byFolder, list } = await links();
  const can = (l) => (isAdmin || (seesLocation(me, l.brandId, l.locationId) && hearsFolder(me, l.categoryId, matrix)))
    && (!locationIds || locationIds.includes(l.locationId))
    && (!categoryId || l.categoryId === categoryId)
    && (!itemName || l.itemName === itemName);
  const d = await drive();
  const timeQ = [since ? `modifiedTime > '${new Date(since).toISOString()}'` : null, until ? `modifiedTime < '${new Date(until).toISOString()}'` : null].filter(Boolean);
  const base = [`trashed = false`, `mimeType != '${FOLDER}'`, ...timeQ];
  const terms = words.map(clean).filter((w) => w.length >= 2);

  let found = [];
  if (terms.length) {
    // Name or contents, every word.
    const q = [...base, ...terms.map((w) => `(name contains '${w}' or fullText contains '${w}')`)].join(' and ');
    const res = await d.files.list({ q, fields: FILE_FIELDS, pageSize: 100, ...SHARED });
    found = res.data.files ?? [];
  } else if (!categoryId && !itemName) {
    // No words and no folder: the newest files anywhere they can see
    // ("what was added this week?"), two weeks back unless told otherwise.
    const sinceQ = since ? [] : [`modifiedTime > '${new Date(Date.now() - 14 * 86400000).toISOString()}'`];
    const res = await d.files.list({ q: [...base, ...sinceQ].join(' and '), fields: FILE_FIELDS, pageSize: 100, orderBy: 'modifiedTime desc', ...SHARED });
    found = res.data.files ?? [];
  } else {
    // No words: the newest files in the folders asked about (and one level
    // of sub-folders, like the month folders the checklists file into).
    const targets = list.filter(can).slice(0, 12);
    if (!targets.length) return { files: [], searched: 0 };
    for (const t of targets) {
      const kids = (await d.files.list({ q: `'${t.folderId}' in parents and trashed = false`, fields: FILE_FIELDS, pageSize: 100, orderBy: 'modifiedTime desc', ...SHARED })).data.files ?? [];
      const subs = kids.filter((k) => k.mimeType === FOLDER).slice(0, 6);
      found.push(...kids.filter((k) => k.mimeType !== FOLDER));
      for (const s of subs) {
        const inner = (await d.files.list({ q: [`'${s.id}' in parents`, ...base].join(' and '), fields: FILE_FIELDS, pageSize: 50, orderBy: 'modifiedTime desc', ...SHARED })).data.files ?? [];
        found.push(...inner);
      }
    }
    if (since) found = found.filter((f) => new Date(f.modifiedTime).getTime() > since);
    if (until) found = found.filter((f) => new Date(f.modifiedTime).getTime() < until);
  }

  // Keep only what this person may open.
  const checked = await Promise.all(found.slice(0, 60).map(async (f) => ({ f, ...(await placeOf(d, f, byFolder)) })));
  const allowed = checked.filter(({ link }) => (link ? can(link) : isAdmin && !locationIds && !categoryId && !itemName));
  allowed.sort((a, b) => new Date(b.f.modifiedTime) - new Date(a.f.modifiedTime));
  const seen = new Set();
  const files = allowed.filter(({ f }) => (seen.has(f.id) ? false : seen.add(f.id))).slice(0, 15).map(({ f, link, path }) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
    modifiedBy: f.lastModifyingUser?.displayName ?? null,
    url: f.webViewLink,
    locationId: link?.locationId ?? null,
    categoryId: link?.categoryId ?? null,
    itemName: link?.itemName ?? null,
    path: path.slice(-2),
  }));
  return { files, searched: found.length };
});
