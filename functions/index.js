const { onCall, HttpsError } = require('firebase-functions/https');
const { setGlobalOptions } = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');

admin.initializeApp();

setGlobalOptions({ maxInstances: 10, region: 'us-central1' });

// Creates a login for a new team member.
//
// This exists because public sign-up is disabled on the project — anyone with
// the (public, by design) Firebase API key could otherwise create an account
// and satisfy every `isSignedIn()` rule in Firestore. With sign-up closed, the
// client SDK can no longer create users at all, so account creation has to
// happen here, where the Admin SDK acts with project authority rather than
// asking permission as a client.
//
// The caller's admin role is verified server-side against their own users
// document. A client-side role check would be trivially bypassed by calling
// this endpoint directly.
exports.createUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const callerDoc = await admin
    .firestore()
    .collection('users')
    .doc(request.auth.uid)
    .get();

  if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can create users.');
  }

  const { name, email, password, role, permissions, job } = request.data || {};

  if (!email || !password || !name || !role) {
    throw new HttpsError('invalid-argument', 'Name, email, password, and role are required.');
  }
  if (!['admin', 'executive', 'manager'].includes(role)) {
    throw new HttpsError('invalid-argument', `Unrecognized role: ${role}`);
  }
  if (password.length < 6) {
    throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.');
  }

  let userRecord;
  try {
    userRecord = await admin.auth().createUser({
      email: email.trim(),
      password,
      displayName: name.trim(),
    });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'That email already has a login.');
    }
    throw new HttpsError('internal', err.message);
  }

  // If this write fails we delete the auth user we just made. Otherwise we'd
  // leave someone who can sign in but has no profile document — which reads
  // as "signed out" in the app and is confusing to diagnose later.
  try {
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      email: email.trim(),
      name: name.trim(),
      role,
      job: job || null,
      permissions: permissions || { brandIds: [], categoryIds: [] },
      active: true,
      pushToken: null,
      photoUrl: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: request.auth.uid,
    });
  } catch (err) {
    await admin.auth().deleteUser(userRecord.uid);
    throw new HttpsError('internal', `Profile write failed, login rolled back: ${err.message}`);
  }

  return { uid: userRecord.uid, email: email.trim() };
});

// Executive Notes — returns metadata for the most recently modified file in
// the executive notes Drive folder.
//
// The previous version ran in the Electron main process with the service
// account key bundled inside the app. That key could be extracted from
// app.asar by anyone who had the DMG, which meant every manager with the app
// installed could read the executive folder regardless of the role check —
// that check only hid the tile in the renderer, it didn't gate the data.
//
// Here the credential is held in Secret Manager and never reaches a client.
// The role check runs server-side against the caller's own users document,
// so it can't be bypassed by calling the endpoint directly.
exports.getExecutiveNotesFile = onCall({ secrets: ['DRIVE_SA_KEY'] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const callerDoc = await admin
    .firestore()
    .collection('users')
    .doc(request.auth.uid)
    .get();

  if (!callerDoc.exists) {
    throw new HttpsError('permission-denied', 'No profile found for this account.');
  }
  const role = callerDoc.data().role;
  if (role !== 'admin' && role !== 'executive') {
    throw new HttpsError('permission-denied', 'Executive Notes is restricted.');
  }

  const { driveUrl } = request.data || {};
  if (!driveUrl) {
    throw new HttpsError('invalid-argument', 'No Drive folder is configured.');
  }

  // Accepts either a /folders/<id> share URL or a bare folder id.
  const match = String(driveUrl).match(/[-\w]{25,}/);
  if (!match) {
    throw new HttpsError('invalid-argument', "That doesn't look like a Drive folder link.");
  }
  const folderId = match[0];

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.DRIVE_SA_KEY),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth: await auth.getClient() });

  let res;
  try {
    res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      orderBy: 'modifiedTime desc',
      pageSize: 1,
      fields: 'files(name,webViewLink,iconLink,modifiedTime)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
  } catch (err) {
    return { error: `Couldn't reach Google Drive: ${err.message}` };
  }

  const file = res.data.files && res.data.files[0];
  if (!file) {
    return { error: 'That folder is empty, or the connection account cannot see it.' };
  }

  return { file };
});
