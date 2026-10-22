// Employee files: archive a person's folder when they leave (22 Oct 2026,
// sketch 27, for Cameron).
//
// Each location's Drive has Staffing › Employee Files, one folder per person
// ("Last, First"). When someone leaves, their folder moves to Archives ›
// Historical Staffing & Training › Archived Employee Files, renamed
// "[Archived] Last, First". Two steps, in order:
//   1. someone marks that all offboarding documentation is in their file;
//   2. only then can the folder be archived.
// Nothing is deleted, and an archive can be undone (the folder moves back).
//
// Who: anyone who has that location and its Staffing folder in the Hub (the
// same answer the screens give). The record of who marked and who archived
// lives in employeeFiles/{locationId}_{folderId}, written only here.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const { requireLive } = require('./caller');
const R = require('./routing');

const FOLDER = 'application/vnd.google-apps.folder';
const ARCHIVE_NAME = 'Archived Employee Files';
const PREFIX = '[Archived] ';

async function driveClient() {
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive'] });
  return google.drive({ version: 'v3', auth: await auth.getClient() });
}
const ALL = { supportsAllDrives: true, includeItemsFromAllDrives: true };
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const folderIdOf = (url) => (String(url ?? '').match(/folders\/([\w-]+)/) ?? [])[1] ?? null;

// The Drive folder the Hub has linked for one item of a location's File
// Directory, e.g. Staffing › Employee Files.
async function linkedFolder(db, locationId, categoryId, itemName) {
  const snap = await db.collection('categoryDriveLinks').doc(`${locationId}_${categoryId}_${encodeURIComponent(itemName)}`).get();
  return snap.exists ? folderIdOf(snap.data().driveUrl) : null;
}

async function allowed(request, locationId) {
  const me = await requireLive(request);
  if (!locationId) throw new HttpsError('invalid-argument', 'Which location?');
  const brandId = await R.brandForLocation(locationId);
  const matrix = await R.liveMatrix();
  if (!R.seesLocation(me, brandId, locationId) || !R.hearsFolder(me, 'staffing', matrix)) {
    throw new HttpsError('permission-denied', "You don't have this location's Staffing folder.");
  }
  return me;
}

async function listAll(drive, q, fields) {
  const out = [];
  let pageToken;
  do {
    const res = await drive.files.list({ q, fields: 'nextPageToken, files(' + fields + ')', pageSize: 200, pageToken, ...ALL });
    out.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return out;
}

async function ensureArchiveFolder(drive, historicalId) {
  const found = await listAll(drive, `'${historicalId}' in parents and name = '${esc(ARCHIVE_NAME)}' and mimeType = '${FOLDER}' and trashed = false`, 'id');
  if (found[0]) return found[0].id;
  const res = await drive.files.create({ requestBody: { name: ARCHIVE_NAME, mimeType: FOLDER, parents: [historicalId] }, fields: 'id', supportsAllDrives: true });
  return res.data.id;
}

// Everyone in Employee Files, with how many files each holds, whether their
// offboarding docs are marked, and the last 10 archived.
exports.employeeFilesList = onCall({ timeoutSeconds: 120 }, async (request) => {
  const { locationId } = request.data || {};
  await allowed(request, locationId);
  const db = admin.firestore();
  const employeeFiles = await linkedFolder(db, locationId, 'staffing', 'Employee Files');
  if (!employeeFiles) return { connected: false, people: [], archived: [] };
  const drive = await driveClient();
  const folders = await listAll(drive, `'${employeeFiles}' in parents and mimeType = '${FOLDER}' and trashed = false`, 'id, name, createdTime');
  // File counts, eight folders at a time.
  const counts = {};
  for (let i = 0; i < folders.length; i += 8) {
    await Promise.all(folders.slice(i, i + 8).map(async (f) => {
      const files = await listAll(drive, `'${f.id}' in parents and trashed = false`, 'id');
      counts[f.id] = files.length;
    }));
  }
  const recs = {};
  (await db.collection('employeeFiles').where('locationId', '==', locationId).get()).forEach((d) => { recs[d.data().folderId] = d.data(); });
  const people = folders
    .map((f) => ({ folderId: f.id, name: f.name, files: counts[f.id] ?? 0, url: 'https://drive.google.com/drive/folders/' + f.id, docsMarked: recs[f.id]?.docsMarked ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const archived = Object.values(recs)
    .filter((r) => r.archived)
    .sort((a, b) => b.archived.at - a.archived.at)
    .slice(0, 10)
    .map((r) => ({ folderId: r.folderId, name: r.name, archived: r.archived, docsMarked: r.docsMarked ?? null }));
  return { connected: true, employeeFilesUrl: 'https://drive.google.com/drive/folders/' + employeeFiles, people, archived };
});

// Step one: all offboarding documentation is in their file (or take it back).
exports.employeeDocsMark = onCall(async (request) => {
  const { locationId, folderId, marked } = request.data || {};
  const me = await allowed(request, locationId);
  const db = admin.firestore();
  const employeeFiles = await linkedFolder(db, locationId, 'staffing', 'Employee Files');
  const drive = await driveClient();
  const f = (await drive.files.get({ fileId: folderId, fields: 'id, name, parents', supportsAllDrives: true })).data;
  if (!employeeFiles || !(f.parents ?? []).includes(employeeFiles)) throw new HttpsError('failed-precondition', "That folder isn't in this location's Employee Files.");
  await db.collection('employeeFiles').doc(`${locationId}_${folderId}`).set({
    locationId, folderId, name: f.name,
    docsMarked: marked ? { byUid: me.uid, byName: me.name ?? '', at: Date.now() } : null,
  }, { merge: true });
  return { ok: true };
});

// Step two: move the folder to Archived Employee Files, renamed. Refused
// until step one is done.
exports.employeeArchive = onCall({ timeoutSeconds: 60 }, async (request) => {
  const { locationId, folderId, lastDay } = request.data || {};
  const me = await allowed(request, locationId);
  const db = admin.firestore();
  const ref = db.collection('employeeFiles').doc(`${locationId}_${folderId}`);
  const rec = (await ref.get()).data();
  if (!rec?.docsMarked) throw new HttpsError('failed-precondition', 'Mark that all offboarding documentation is in their file first.');
  const employeeFiles = await linkedFolder(db, locationId, 'staffing', 'Employee Files');
  const historical = await linkedFolder(db, locationId, 'archives', 'Historical Staffing & Training');
  if (!employeeFiles || !historical) throw new HttpsError('failed-precondition', "This location's Employee Files or Historical Staffing & Training folder isn't connected in the Hub.");
  const drive = await driveClient();
  const f = (await drive.files.get({ fileId: folderId, fields: 'id, name, parents', supportsAllDrives: true })).data;
  if (!(f.parents ?? []).includes(employeeFiles)) throw new HttpsError('failed-precondition', "That folder isn't in Employee Files any more.");
  const target = await ensureArchiveFolder(drive, historical);
  const newName = f.name.startsWith(PREFIX) ? f.name : PREFIX + f.name;
  await drive.files.update({ fileId: folderId, addParents: target, removeParents: employeeFiles, requestBody: { name: newName }, fields: 'id', supportsAllDrives: true });
  await ref.set({ name: f.name, archived: { at: Date.now(), byUid: me.uid, byName: me.name ?? '', lastDay: lastDay ?? null, archiveFolderId: target } }, { merge: true });
  return { ok: true, name: newName };
});

// Undo: back to Employee Files with its old name; the docs mark stays.
exports.employeeUnarchive = onCall({ timeoutSeconds: 60 }, async (request) => {
  const { locationId, folderId } = request.data || {};
  await allowed(request, locationId);
  const db = admin.firestore();
  const ref = db.collection('employeeFiles').doc(`${locationId}_${folderId}`);
  const rec = (await ref.get()).data();
  if (!rec?.archived) throw new HttpsError('failed-precondition', "That folder wasn't archived from the Hub.");
  const employeeFiles = await linkedFolder(db, locationId, 'staffing', 'Employee Files');
  const drive = await driveClient();
  const f = (await drive.files.get({ fileId: folderId, fields: 'id, name, parents', supportsAllDrives: true })).data;
  const from = (f.parents ?? []).join(',');
  await drive.files.update({ fileId: folderId, addParents: employeeFiles, removeParents: from, requestBody: { name: rec.name }, fields: 'id', supportsAllDrives: true });
  await ref.set({ archived: null }, { merge: true });
  return { ok: true };
});
