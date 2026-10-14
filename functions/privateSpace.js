// My space (12 Oct 2026): a private Drive folder, built by the Hub.
//
// Cameron asked for a place in the Hub and on Drive that only she can get
// into. The Hub makes a folder in the CIG shared drive, gives her access, and
// then switches the folder to limited access - so the shared drive's members
// no longer get in just by being members. Only the people added to the folder
// itself (her) can open it. A manager of the shared drive can still switch
// that back off; Google allows that on every shared drive.
//
// If Drive will not make the folder private, the folder is put in the trash
// rather than left open, and she is told.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const { requireLive } = require('./caller');

const DRIVE_ID = '0ANOluAAxZB7lUk9PVA';
const FOLDER = 'application/vnd.google-apps.folder';

async function driveClient() {
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive'] });
  return google.drive({ version: 'v3', auth: await auth.getClient() });
}

// Made for this person, once. Returns the folder's link.
async function makeFolderFor(me) {
  if (!me.email) throw new HttpsError('failed-precondition', 'This login has no email address to share the folder with.');

  const ref = admin.firestore().collection('privateSpaces').doc(me.uid);
  const existing = (await ref.get()).data() ?? {};
  if (existing.driveFolderId) return { url: existing.driveFolderUrl, existed: true };

  const drive = await driveClient();
  const made = await drive.files.create({
    requestBody: { name: (me.name ?? 'Private') + ' — Private', mimeType: FOLDER, parents: [DRIVE_ID] },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  const id = made.data.id;

  let step = 'sharing it with ' + me.email;
  try {
    await drive.permissions.create({
      fileId: id,
      supportsAllDrives: true,
      sendNotificationEmail: false,
      requestBody: { type: 'user', role: 'writer', emailAddress: me.email },
    });
    step = 'switching it to limited access';
    const locked = await drive.files.update({
      fileId: id,
      supportsAllDrives: true,
      requestBody: { inheritedPermissionsDisabled: true },
      fields: 'id, inheritedPermissionsDisabled',
    });
    if (locked.data.inheritedPermissionsDisabled !== true) throw new Error('Drive did not confirm limited access.');
  } catch (err) {
    console.error('Private folder for ' + me.uid + ' not made private - failed at ' + step + ': ' + (err?.message ?? err));
    await drive.files.update({ fileId: id, supportsAllDrives: true, requestBody: { trashed: true } }).catch(() => {});
    throw new HttpsError('failed-precondition', 'Drive would not make the folder private (at ' + step + '), so it was removed. Let Brenner know. (' + (err?.message ?? 'unknown') + ')');
  }

  await ref.set({ driveFolderId: id, driveFolderUrl: made.data.webViewLink, driveFolderAt: Date.now() }, { merge: true });
  return { url: made.data.webViewLink };
}

// Built the moment an admin switches My space on, so the person finds it
// ready ("let us build it for her", Brenner).
exports.onPrivateSpaceSwitchedOn = onDocumentUpdated({ document: 'users/{uid}', timeoutSeconds: 120 }, async (event) => {
  const before = event.data.before.data() ?? {};
  const after = event.data.after.data() ?? {};
  if (before.privateSpace === true || after.privateSpace !== true) return;
  if (after.active === false || after.isGhost === true) return;
  try {
    await makeFolderFor({ uid: event.params.uid, ...after });
  } catch (err) {
    // The button on My space tries again and says what went wrong.
    console.error('Private folder for ' + event.params.uid + ' not made: ' + (err?.message ?? err));
  }
});

// The same, from the button on My space - if the automatic one failed.
exports.createPrivateDriveFolder = onCall({ timeoutSeconds: 120 }, async (request) => {
  const me = await requireLive(request);
  if (me.privateSpace !== true) throw new HttpsError('permission-denied', 'My space is not switched on for this login.');
  return makeFolderFor(me);
});

// ---------------------------------------------------------------------------
// Files on My space live in the Drive folder (Brenner, 12 Oct 2026): one
// place for everything. The page lists what is in the folder - including
// anything she adds from Drive itself - uploads into it, and removes from it.
//
// An upload goes to the Hub's private storage first (only she can write
// there), then the server moves it into the folder and deletes the copy.
// ---------------------------------------------------------------------------
async function myFolder(request) {
  const me = await requireLive(request);
  if (me.privateSpace !== true) throw new HttpsError('permission-denied', 'My space is not switched on for this login.');
  const ref = admin.firestore().collection('privateSpaces').doc(me.uid);
  const space = (await ref.get()).data() ?? {};
  if (!space.driveFolderId) throw new HttpsError('failed-precondition', 'Your Drive folder is not made yet.');
  return { me, ref, folderId: space.driveFolderId, folderUrl: space.driveFolderUrl ?? null };
}

// Moves one file from Hub storage into the folder, then deletes the copy.
async function moveIntoFolder(drive, folderId, storagePath, name, type) {
  const file = admin.storage().bucket().file(storagePath);
  const made = await drive.files.create({
    requestBody: { name: String(name || 'File').slice(0, 200), parents: [folderId] },
    media: { mimeType: type || 'application/octet-stream', body: file.createReadStream() },
    fields: 'id',
    supportsAllDrives: true,
  });
  await file.delete().catch(() => {});
  return made.data.id;
}

exports.privateFolderFiles = onCall({ timeoutSeconds: 120 }, async (request) => {
  const { me, ref, folderId, folderUrl } = await myFolder(request);
  const drive = await driveClient();

  // Anything uploaded before files went to Drive is moved in, once.
  const old = await ref.collection('files').get();
  for (const d of old.docs) {
    const f = d.data();
    try {
      if (f.storagePath?.startsWith('private/' + me.uid + '/')) await moveIntoFolder(drive, folderId, f.storagePath, f.name, f.type);
      await d.ref.delete();
    } catch (err) {
      console.error('Could not move ' + d.id + ' into the private folder: ' + (err?.message ?? err));
    }
  }

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, modifiedTime, webViewLink, size)',
    orderBy: 'modifiedTime desc',
    pageSize: 200,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  // The folder's link too, so the page shows it even if its own read of
  // My space is slow or fails (14 Oct 2026).
  return { files: res.data.files ?? [], folderUrl };
});

exports.addToPrivateFolder = onCall({ timeoutSeconds: 300, memory: '512MiB' }, async (request) => {
  const { me, folderId } = await myFolder(request);
  const { storagePath, name, type } = request.data || {};
  if (typeof storagePath !== 'string' || !storagePath.startsWith('private/' + me.uid + '/') || storagePath.includes('..')) {
    throw new HttpsError('invalid-argument', 'That upload is not yours.');
  }
  const [exists] = await admin.storage().bucket().file(storagePath).exists();
  if (!exists) throw new HttpsError('failed-precondition', 'The upload did not finish. Try again.');
  const id = await moveIntoFolder(await driveClient(), folderId, storagePath, name, type);
  return { id };
});

exports.removeFromPrivateFolder = onCall(async (request) => {
  const { folderId } = await myFolder(request);
  const fileId = String(request.data?.fileId ?? '');
  if (!fileId || fileId.includes('/')) throw new HttpsError('invalid-argument', 'Which file?');
  const drive = await driveClient();
  const f = await drive.files.get({ fileId, fields: 'parents', supportsAllDrives: true });
  // Only something directly in her folder - never anything else in the drive.
  if (!(f.data.parents ?? []).includes(folderId)) throw new HttpsError('permission-denied', 'That file is not in your folder.');
  await drive.files.update({ fileId, supportsAllDrives: true, requestBody: { trashed: true } });
  return { ok: true };
});
