const { onCall, HttpsError } = require('firebase-functions/https');
const { setGlobalOptions } = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const { Resend } = require('resend');
const { welcomeHtml } = require('./welcomeEmail');

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
  const heading = isReset ? 'Reset your password' : 'Your account is ready';
  const body = isReset
    ? 'Use the button below to choose a new password for your CIG Executive Hub account.'
    : 'An account has been created for you in the CIG Executive Hub. Set a password to get started.';
  const cta = isReset ? 'Set new password' : 'Set your password';

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
</head>
<body style="margin:0;padding:0;background-color:#0A0A0B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0A0A0B;">
<tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">

    <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:bold;letter-spacing:-0.4px;text-transform:uppercase;color:#FFFFFF;padding-bottom:12px;">CIG Executive Hub</td></tr>
    <tr><td style="padding-bottom:26px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="width:48px;height:3px;background-color:#22D3EE;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>

    <tr><td style="background-color:#1C1C22;border:1px solid #2A2A33;border-radius:10px;padding:32px;">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#22D3EE;padding-bottom:12px;">${isReset ? 'Password reset' : 'Welcome'}</div>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:24px;font-weight:bold;letter-spacing:-0.4px;text-transform:uppercase;color:#FFFFFF;padding-bottom:14px;">${heading}</div>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:23px;color:#9A9AA6;padding-bottom:28px;">${name ? name + ',<br><br>' : ''}${body}</div>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="background-color:#22D3EE;border-radius:8px;">
          <a href="${link}" style="display:inline-block;padding:14px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;color:#0A0A0B;text-decoration:none;">${cta}</a>
        </td></tr>
      </table>

      <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#9A9AA6;padding-top:28px;">If the button doesn't work, paste this into your browser:</div>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#22D3EE;word-break:break-all;padding-top:6px;">${link}</div>
    </td></tr>

    <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#6A6A76;padding-top:22px;">This link expires in one hour. If you weren't expecting it, you can ignore this email.</td></tr>

  </table>
</td></tr>
</table>
</body></html>`;
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
    link = await admin.auth().generatePasswordResetLink(email.trim());
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'No account exists for that email.');
    }
    throw new HttpsError('internal', err.message);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: 'CIG Executive Hub <no-reply@cigconcepts.com>',
    to: [email.trim()],
    subject: isReset ? 'Reset your CIG Executive Hub password' : 'Set up your CIG Executive Hub account',
    html: isReset ? inviteHtml({ name, link, isReset: true }) : welcomeHtml({ name, link }),
  });

  if (error) {
    throw new HttpsError('internal', `Email failed to send: ${error.message}`);
  }

  return { sent: true, email: email.trim() };
});

// Push notification triggers live in their own module.
Object.assign(exports, require('./pushNotifications'));

Object.assign(exports, require('./chatCleanup'));
