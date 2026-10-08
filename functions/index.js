const { onCall, HttpsError } = require('firebase-functions/https');
const { setGlobalOptions } = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const { Resend } = require('resend');
const { welcomeHtml } = require('./welcomeEmail');
const { issueSetupToken } = require('./accountSetup');

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
  // Executives, and IT & Training (Cameron, on her way to an executive role).
  if (role !== 'admin' && role !== 'executive' && callerDoc.data().job !== 'IT & Training') {
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

// Branded invite / password-reset email.
//
// Firebase's own templates are uneditable on this project and its mail lands
// in spam, so we generate the action link with the Admin SDK — which returns
// the URL without sending anything — and deliver it ourselves through Resend
// from an authenticated domain we control.
//
// Table-based layout with explicit per-cell backgrounds: Outlook renders with
// Word's engine and ignores flexbox, and several clients won't inherit a dark
// background reliably.
function inviteHtml({ name, link, isReset }) {
  const T = require('./emailTemplate');
  return T.layout({
    kicker: isReset ? 'Password reset' : 'Welcome',
    title: isReset ? 'Reset your password' : 'Your account is ready',
    intro: (name ? name.split(' ')[0] + ', ' : '') +
      (isReset ? 'use the button below to choose a new password for your CIG Executive Hub account.' : 'an account has been created for you in the CIG Executive Hub. Set a password to get started.'),
    bodyHtml: '<div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#6C6C76;">If the button does not work, paste this into your browser:<br><span style="color:#22D3EE;word-break:break-all;">' + T.esc(link) + '</span></div>',
    button: { label: isReset ? 'Set a new password' : 'Set your password', url: link },
    footer: 'This link expires in one hour. If you were not expecting it, you can ignore this email.',
    settingsLine: false,
  });
}

exports.sendInviteEmail = onCall({ secrets: ['RESEND_API_KEY'] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const callerDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can send invites.');
  }

  const { email, name, isReset } = request.data || {};
  if (!email) {
    throw new HttpsError('invalid-argument', 'An email address is required.');
  }

  let link;
  try {
    if (!isReset) {
      // The welcome link carries a one-time token rather than a Firebase
      // link, which expires after an hour. This one works until it is used.
      const userRecord = await admin.auth().getUserByEmail(email.trim());
      const token = await issueSetupToken(userRecord.uid, email.trim());
      link = 'https://hub.cigconcepts.com/welcome?token=' + token;
    } else {
      link = await admin.auth().generatePasswordResetLink(email.trim());
    }
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'No account exists for that email.');
    }
    throw new HttpsError('internal', err.message);
  }

  // Their job and where they work, for "You've been set up as..." and the
  // "What you'll use" list in the welcome email.
  let job = null;
  let where = null;
  if (!isReset) {
    const R = require('./routing');
    const found = await admin.firestore().collection('users').where('email', '==', email.trim()).limit(1).get();
    const p = found.empty ? null : found.docs[0].data();
    job = p?.job ?? null;
    const brands = p?.permissions?.brandIds ?? [];
    const own = ['General Manager', 'Assistant Manager', 'Kitchen Manager', 'Executive Chef', 'Sous Chef', 'Catering & Events'].includes(job);
    if (own && brands.length === 1) {
      const locs = p?.permissions?.locationsByBrand?.[brands[0]] ?? [];
      where = locs.length === 1 ? await R.locationName(locs[0]) : null;
    }
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: 'CIG Executive Hub <no-reply@cigconcepts.com>',
    to: [email.trim()],
    subject: isReset ? 'Reset your CIG Executive Hub password' : 'Set up your CIG Executive Hub account',
    html: isReset ? inviteHtml({ name, link, isReset: true }) : welcomeHtml({ name, link, job, where }),
  });

  if (error) {
    throw new HttpsError('internal', `Email failed to send: ${error.message}`);
  }

  return { sent: true, email: email.trim() };
});

// Push notification triggers live in their own module.
// pushNotifications.js removed 6 Oct 2026: its onAnnouncementCreated sent a
// second notification for every folder post (onCategoryPostCreated sends the one).

Object.assign(exports, require('./chatCleanup'));
Object.assign(exports, require('./chatAndEventPush'));

Object.assign(exports, require('./expenses'));

Object.assign(exports, require('./expenseReports'));

Object.assign(exports, require('./notifications'));

Object.assign(exports, require('./expensePeriods'));

Object.assign(exports, require('./sweepIntegrationRequests'));

Object.assign(exports, require('./documentUrls'));

Object.assign(exports, require('./assembleSignedDocument'));

Object.assign(exports, require('./sweepSignedDocuments'));

Object.assign(exports, require('./sweepReceiptPhotos'));


// Self-serve password reset, from the sign-in page.
//
// The only function anyone can call without being signed in, so it is
// careful in three ways. It never says whether an address has an account -
// the answer is the same either way - so it cannot be used to find out who
// works here. It refuses a second request for the same address within a
// minute, so it cannot be used to flood someone's inbox. And deactivated
// accounts get nothing.
//
// Needed because setup and reset links expire after an hour, a Firebase limit
// that cannot be extended, and the sign-in page used to tell people to ask an
// administrator. Anyone who missed the window was stuck until someone noticed.
exports.requestPasswordReset = onCall({ secrets: ['RESEND_API_KEY'] }, async (request) => {
  const email = String(request.data?.email ?? '').trim().toLowerCase();
  const ok = { sent: true };

  if (!email || !email.includes('@') || email.length > 200) return ok;

  const db = admin.firestore();

  const throttleRef = db.collection('passwordResetRequests').doc(email);
  const last = await throttleRef.get();
  if (last.exists && Date.now() - (last.data().at ?? 0) < 60 * 1000) return ok;
  await throttleRef.set({ at: Date.now() });

  const profiles = await db.collection('users').where('email', '==', email).limit(1).get();
  if (profiles.empty) return ok;
  const profile = profiles.docs[0].data();
  if (profile.active === false) return ok;

  let link;
  try {
    link = await admin.auth().generatePasswordResetLink(email);
  } catch {
    return ok;
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'CIG Executive Hub <no-reply@cigconcepts.com>',
      to: [email],
      subject: 'Reset your CIG Executive Hub password',
      html: inviteHtml({ name: profile.name, link, isReset: true }),
    });
  } catch (err) {
    console.error('Self-serve reset email failed: ' + err.message);
  }

  return ok;
});

Object.assign(exports, require('./sweepOrphanDocs'));

Object.assign(exports, require('./driveSetup'));

Object.assign(exports, require('./accountSetup'));

Object.assign(exports, require('./driveAccess'));

Object.assign(exports, require('./dailyDigest'));

Object.assign(exports, require('./taggedItems'));

// Invoices were removed on 6 October 2026.
Object.assign(exports, require('./emailPreview'));
Object.assign(exports, require('./dailyChecklists'));

Object.assign(exports, require('./deviceRequests'));

Object.assign(exports, require('./cateringIntake'));
