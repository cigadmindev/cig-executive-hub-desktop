// Who is calling, and are they still allowed to call anything at all.
//
// Deactivating someone disables their sign-in and cancels their sessions, but
// a token issued just before keeps working for up to an hour. Every callable
// starts with requireLive, so a leaver - or a ghost account - is refused
// straight away rather than when the token runs out (8 Oct 2026, S1).
const { HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

async function requireLive(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const snap = await admin.firestore().collection('users').doc(request.auth.uid).get();
  const me = snap.exists ? { uid: snap.id, ...snap.data() } : null;
  if (!me || me.active === false || me.isGhost === true) {
    throw new HttpsError('permission-denied', 'This login is not active.');
  }
  return me;
}

module.exports = { requireLive };
