// Pre-Opening Documents (16 Oct 2026): blank forms and templates used for
// every new location, kept in one Drive folder ("Pre-Opening Documents", at
// the top of the company shared drive) and listed on a Directory page.
// Executives and admins see it and add to it. Done here, not from the
// browser, because the Hub reaches Drive through its own service account.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { google } = require('googleapis');
const { Readable } = require('stream');
const { requireLive } = require('./caller');

const DRIVE_ID = '0ANOluAAxZB7lUk9PVA';
const FOLDER = 'application/vnd.google-apps.folder';
const NAME = 'Pre-Opening Documents';
const SHARED = { corpora: 'drive', driveId: DRIVE_ID, includeItemsFromAllDrives: true, supportsAllDrives: true };
const MAX_BYTES = 7 * 1024 * 1024;

async function drive() {
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive'] });
  return google.drive({ version: 'v3', auth: await auth.getClient() });
}
async function folderId(d) {
  const found = await d.files.list({ q: `'${DRIVE_ID}' in parents and name = '${NAME}' and mimeType = '${FOLDER}' and trashed = false`, fields: 'files(id)', pageSize: 1, ...SHARED });
  if (found.data.files?.[0]) return found.data.files[0].id;
  const made = await d.files.create({ requestBody: { name: NAME, mimeType: FOLDER, parents: [DRIVE_ID] }, fields: 'id', supportsAllDrives: true });
  return made.data.id;
}
function allowed(me) {
  if (!(me.role === 'admin' || me.role === 'executive')) throw new HttpsError('permission-denied', 'Pre-Opening Documents are for executives and admins.');
}

exports.preOpeningDocsList = onCall(async (request) => {
  const me = await requireLive(request);
  allowed(me);
  const d = await drive();
  const parent = await folderId(d);
  const res = await d.files.list({
    q: `'${parent}' in parents and trashed = false and mimeType != '${FOLDER}'`,
    fields: 'files(id, name, mimeType, webViewLink, modifiedTime, appProperties)',
    orderBy: 'name', pageSize: 500, ...SHARED,
  });
  return {
    folderUrl: 'https://drive.google.com/drive/folders/' + parent,
    files: (res.data.files ?? []).map((f) => ({
      id: f.id, name: f.name, mimeType: f.mimeType, url: f.webViewLink,
      at: f.modifiedTime ? Date.parse(f.modifiedTime) : null, byName: f.appProperties?.addedByName ?? null,
    })),
  };
});

exports.preOpeningDocsAdd = onCall({ timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  const me = await requireLive(request);
  allowed(me);
  const { name, mimeType, dataBase64 } = request.data || {};
  if (typeof name !== 'string' || !name.trim() || typeof dataBase64 !== 'string') throw new HttpsError('invalid-argument', 'Which file?');
  const bytes = Buffer.from(dataBase64, 'base64');
  if (!bytes.length) throw new HttpsError('invalid-argument', 'That file is empty.');
  if (bytes.length > MAX_BYTES) throw new HttpsError('invalid-argument', 'That file is over 7 MB. Add it straight to the Drive folder instead.');
  const d = await drive();
  const parent = await folderId(d);
  const clean = name.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 150);
  const made = await d.files.create({
    requestBody: { name: clean, parents: [parent], appProperties: { addedByName: String(me.name ?? '').slice(0, 100) } },
    media: { mimeType: typeof mimeType === 'string' && mimeType ? mimeType : 'application/octet-stream', body: Readable.from(bytes) },
    fields: 'id, webViewLink', supportsAllDrives: true,
  });
  return { ok: true, id: made.data.id, url: made.data.webViewLink };
});
