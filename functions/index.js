const { onCall, HttpsError } = require('firebase-functions/https');
const { setGlobalOptions } = require('firebase-functions');
const admin = require('firebase-admin');

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
