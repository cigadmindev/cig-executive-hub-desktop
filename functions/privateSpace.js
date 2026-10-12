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

  try {
    await drive.permissions.create({
      fileId: id,
      supportsAllDrives: true,
      sendNotificationEmail: false,
      requestBody: { type: 'user', role: 'writer', emailAddress: me.email },
    });
    const locked = await drive.files.update({
      fileId: id,
      supportsAllDrives: true,
      requestBody: { inheritedPermissionsDisabled: true },
      fields: 'id, inheritedPermissionsDisabled',
    });
    if (locked.data.inheritedPermissionsDisabled !== true) throw new Error('Drive did not confirm limited access.');
  } catch (err) {
    console.error('Private folder for ' + me.uid + ' not made private: ' + (err?.message ?? err));
    await drive.files.update({ fileId: id, supportsAllDrives: true, requestBody: { trashed: true } }).catch(() => {});
    throw new HttpsError('failed-precondition', 'Drive would not make the folder private, so it was removed. Let Brenner know. (' + (err?.message ?? 'unknown') + ')');
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
