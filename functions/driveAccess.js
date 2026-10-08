// Removing someone's Drive access, and putting it back.
//
// The audit found eleven people added to the shared drive individually, with
// folder membership differing between folders - so revoking someone by hand
// means finding every place they were added and hoping none was missed.
//
// This finds every permission they hold on the shared drive, its folders and
// any file shared with them directly, records exactly what it removed, and
// can put back precisely that. Without recording it first, restoring would be
// guesswork: once a permission is gone there is nothing left to read.
//
// Since 8 Oct 2026 (S1) it runs on its own the moment someone is deactivated
// (leavers.js). The Offboarding page's button is now for running it again.
//
// Made safe to run twice and to stop part-way:
//   - each permission is recorded BEFORE it is deleted, added to the list
//     rather than replacing it, so a timeout or a second run loses nothing;
//   - anything it could not remove is recorded as a failure, and the
//     Offboarding step stays unticked until a clean run;
//   - inherited permissions (from drive membership) are skipped - they go
//     when the membership goes.
//
// Runs as the functions' default service account, which must be a Manager of
// the shared drive to remove members. Moving it onto DRIVE_SA_KEY (the
// documented Workspace account) is a separate step - see the plan, S1.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const { requireLive } = require('./caller');

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
  const me = await requireLive(request);
  if (me.role !== 'admin') throw new HttpsError('permission-denied', 'Only admins can change Drive access.');
  return me;
}

async function listAll(drive, q) {
  const ids = [];
  let pageToken;
  do {
    const res = await drive.files.list({ q, fields: 'nextPageToken, files(id)', pageSize: 1000, pageToken, ...SHARED });
    (res.data.files ?? []).forEach((f) => ids.push(f.id));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return ids;
}

// The drive itself first (removing membership there removes every inherited
// permission below it), then every folder, then any file shared with them.
async function placesToCheck(drive, email) {
  const folders = await listAll(drive, `mimeType = '${FOLDER}' and trashed = false`);
  let files = [];
  try {
    files = await listAll(drive, `mimeType != '${FOLDER}' and trashed = false and ('${email}' in readers or '${email}' in writers)`);
  } catch (err) {
    console.error('Could not search files shared with ' + email + ': ' + err.message);
  }
  return [DRIVE_ID, ...new Set([...folders, ...files])];
}

// A few at a time: fast enough for several hundred folders, gentle enough on
// Drive's rate limits.
async function inBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

const FV = admin.firestore.FieldValue;

/**
 * Removes one person from the shared drive. Used by the button and by the
 * deactivation trigger. Returns { removed, failures }.
 */
async function removeAccess(uid, rawEmail) {
  const email = String(rawEmail ?? '').trim().toLowerCase();
  if (!email || !uid) throw new Error('Who is being removed?');
  const ref = admin.firestore().collection('offboarding').doc(uid);

  // Started, with the list kept: a second run adds to it rather than
  // replacing it, so the record of what to restore is never wiped.
  await ref.set({ driveRemoved: { email, startedAt: Date.now(), finished: false, failures: [] }, driveRestoredAt: null }, { merge: true });

  const drive = await driveClient();
  const failures = [];
  let removed = 0;

  await inBatches(await placesToCheck(drive, email), 5, async (fileId) => {
    let perms;
    try {
      const res = await drive.permissions.list({
        fileId,
        fields: 'permissions(id, emailAddress, role, type, permissionDetails(inherited))',
        supportsAllDrives: true,
      });
      perms = res.data.permissions ?? [];
    } catch (err) {
      failures.push({ fileId, error: 'could not read: ' + err.message });
      return;
    }

    for (const p of perms) {
      if ((p.emailAddress ?? '').toLowerCase() !== email) continue;
      const details = p.permissionDetails ?? [];
      if (fileId !== DRIVE_ID && details.length > 0 && details.every((d) => d.inherited)) continue;
      const entry = { fileId, role: p.role, type: p.type };
      // Recorded first, so a timeout between these two lines loses nothing.
      await ref.update({ 'driveRemoved.entries': FV.arrayUnion(entry) });
      try {
        await drive.permissions.delete({ fileId, permissionId: p.id, supportsAllDrives: true });
        removed++;
      } catch (err) {
        failures.push({ fileId, error: err.message });
      }
    }
  });

  await ref.update({
    'driveRemoved.at': Date.now(),
    'driveRemoved.finished': true,
    'driveRemoved.failures': failures.slice(0, 50),
  });
  console.log('Drive: removed ' + email + ' from ' + removed + ' place(s); ' + failures.length + ' failure(s).');
  return { removed, failures: failures.length };
}

exports.removeAccess = removeAccess;

exports.removeDriveAccess = onCall({ timeoutSeconds: 540, memory: '512MiB' }, async (request) => {
  await requireAdmin(request);
  try {
    return await removeAccess(String(request.data?.uid ?? ''), request.data?.email);
  } catch (err) {
    throw new HttpsError('internal', err.message);
  }
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
  const failures = [];

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
      failures.push({ fileId: entry.fileId, error: err.message });
    }
  }

  await ref.set({ driveRestoredAt: Date.now(), driveRestoreFailures: failures.slice(0, 50) }, { merge: true });
  console.log('Restored ' + record.email + ' to ' + restored + ' place(s) in Drive.');
  return { restored, of: record.entries.length };
});
