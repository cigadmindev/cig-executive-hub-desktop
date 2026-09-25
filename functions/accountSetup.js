// Setting a password from the welcome email, without the hour limit.
//
// Firebase password links expire after an hour and that cannot be changed.
// Anyone who opened the email later was stuck - it happened to Ben twice, and
// it is why logins had to be created live during the manager rollout.
//
// So the welcome email carries a one-time token instead. It works until it is
// used rather than for an hour, and it is cleared the moment a password is
// set. No second email, because a fresh link would go to the same inbox
// anyway.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

const TOKENS = 'accountSetupTokens';

/**
 * Made when a login is created, and stored away from the profile so nobody
 * signed in can read someone else's.
 */
async function issueSetupToken(uid, email) {
  const token = crypto.randomBytes(32).toString('hex');
  await admin.firestore().collection(TOKENS).doc(token).set({
    uid,
    email: String(email).trim().toLowerCase(),
    createdAt: Date.now(),
    usedAt: null,
  });
  return token;
}

/**
 * What the welcome page asks for on load: whose account this is, so it can
 * greet them and show the address they are setting up.
 */
const describeAccountSetup = onCall(async (request) => {
  const token = String(request.data?.token ?? '');
  if (!token) throw new HttpsError('invalid-argument', 'No setup link.');

  const snap = await admin.firestore().collection(TOKENS).doc(token).get();
  if (!snap.exists || snap.data().usedAt) {
    throw new HttpsError('not-found', 'This link has already been used. Use Forgot password on the sign-in page instead.');
  }

  const { uid, email } = snap.data();
  const profile = await admin.firestore().collection('users').doc(uid).get();
  return { email, name: profile.exists ? profile.data().name ?? null : null };
});

/**
 * Sets the password and spends the token. Deliberately not reusable: a link
 * that keeps working is worse than one that expires.
 */
const completeAccountSetup = onCall(async (request) => {
  const token = String(request.data?.token ?? '');
  const password = String(request.data?.password ?? '');

  if (!token) throw new HttpsError('invalid-argument', 'No setup link.');
  if (password.length < 8) throw new HttpsError('invalid-argument', 'Use at least eight characters.');

  const db = admin.firestore();
  const ref = db.collection(TOKENS).doc(token);

  // Claimed in one step, so a link opened twice at once cannot be spent twice.
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().usedAt) return null;
    tx.update(ref, { usedAt: Date.now() });
    return snap.data();
  });

  if (!claimed) {
    throw new HttpsError('not-found', 'This link has already been used. Use Forgot password on the sign-in page instead.');
  }

  try {
    await admin.auth().updateUser(claimed.uid, { password });
  } catch (err) {
    // Give the link back rather than stranding them on a spent token.
    await ref.update({ usedAt: null });
    throw new HttpsError('internal', 'Could not set that password: ' + err.message);
  }

  return { email: claimed.email };
});

module.exports = { issueSetupToken, describeAccountSetup, completeAccountSetup };
