// Removing someone's Drive access, and putting it back.
//
// The audit found eleven people added to the shared drive individually, with
// folder membership differing between folders - so revoking someone by hand
// means finding every place they were added and hoping none was missed.
//
// This finds every permission they hold on the shared drive and its folders,
// records exactly what it removed, and can put back precisely that. Without
// recording it first, restoring would be guesswork: once a permission is
// gone there is nothing left to read.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { google } = require('googleapis');

const DRIVE_ID = '0ANOluAAxZB7lUk9PVA';
const FOLDER = 'application/vnd.google-apps.folder';

const SHARED = {
  corpora: 'drive',
  driveId: DRIVE_ID,
  includeItemsFromAllDrives: true,
  supportsAllDrives: true,
};

async function driveClient() {
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive'] });
  return google.drive({ version: 'v3', auth: await auth.getClient() });
}

async function requireAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const snap = await admin.firestore().collection('users').doc(request.auth.uid).get();
  if (!snap.exists || snap.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can change Drive access.');
  }
}

// Every folder in the drive, plus the drive itself. Paged, because a few
// hundred folders is normal once every location has its tree.
async function allFolderIds(drive) {
  const ids = [DRIVE_ID];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `mimeType = '${FOLDER}' and trashed = false`,
      fields: 'nextPageToken, files(id)',
      pageSize: 1000,
      pageToken,
      ...SHARED,
    });
    (res.data.files ?? []).forEach((f) => ids.push(f.id));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return ids;
}

exports.removeDriveAccess = onCall({ timeoutSeconds: 540, memory: '512MiB' }, async (request) => {
  await requireAdmin(request);
  const email = String(request.data?.email ?? '').trim().toLowerCase();
  const uid = String(request.data?.uid ?? '');
  if (!email || !uid) throw new HttpsError('invalid-argument', 'Who is being removed?');

  const drive = await driveClient();
  const removed = [];

  for (const fileId of await allFolderIds(drive)) {
    let perms;
    try {
      const res = await drive.permissions.list({
        fileId,
        fields: 'permissions(id, emailAddress, role, type)',
        supportsAllDrives: true,
        useDomainAdminAccess: false,
      });
      perms = res.data.permissions ?? [];
    } catch {
      continue; // Not ours to read - leave it alone.
    }

    for (const p of perms) {
      if ((p.emailAddress ?? '').toLowerCase() !== email) continue;
      try {
        await drive.permissions.delete({ fileId, permissionId: p.id, supportsAllDrives: true });
        // Recorded so it can be put back exactly as it was.
        removed.push({ fileId, role: p.role, type: p.type });
      } catch (err) {
        console.error('Could not remove ' + email + ' from ' + fileId + ': ' + err.message);
      }
    }
  }

  await admin.firestore().collection('offboarding').doc(uid).set(
    { driveRemoved: { at: Date.now(), email, entries: removed }, driveRestoredAt: null },
    { merge: true }
  );

  console.log('Removed ' + email + ' from ' + removed.length + ' place(s) in Drive.');
  return { removed: removed.length };
});

exports.restoreDriveAccess = onCall({ timeoutSeconds: 540, memory: '512MiB' }, async (request) => {
  await requireAdmin(request);
  const uid = String(request.data?.uid ?? '');
  if (!uid) throw new HttpsError('invalid-argument', 'Who is being restored?');

  const ref = admin.firestore().collection('offboarding').doc(uid);
  const snap = await ref.get();
  const record = snap.exists ? snap.data().driveRemoved : null;
  if (!record?.entries?.length) {
    throw new HttpsError('failed-precondition', 'There is no record of what was removed.');
  }

  const drive = await driveClient();
  let restored = 0;

  for (const entry of record.entries) {
    try {
      await drive.permissions.create({
        fileId: entry.fileId,
        requestBody: { type: entry.type || 'user', role: entry.role, emailAddress: record.email },
        sendNotificationEmail: false,
        supportsAllDrives: true,
      });
      restored++;
    } catch (err) {
      console.error('Could not restore ' + record.email + ' on ' + entry.fileId + ': ' + err.message);
    }
  }

  await ref.set({ driveRestoredAt: Date.now() }, { merge: true });
  console.log('Restored ' + record.email + ' to ' + restored + ' place(s) in Drive.');
  return { restored, of: record.entries.length };
});
