// Signed URLs for documents, so Storage can stop being readable by anyone
// signed in.
//
// The pattern is the one receipts already use: Storage rules cannot read
// Firestore, so they cannot tell whether you signed a document or have access
// to a location. Rather than fall back to "any signed-in user", the Storage
// rules deny reads outright and the check happens here, where it can.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

// Long enough to click through and download, short enough that a leaked URL
// is not a lasting problem.
const URL_MINUTES = 10;

async function callerProfile(uid) {
  const snap = await admin.firestore().collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'No profile found.');
  return snap.data();
}

/**
 * A signed document. Readable by the people who signed it, whoever sent it,
 * and admins.
 *
 * Deliberately tighter than "anyone with access to the location": a signed
 * contract is not general reference material. Admins are the exception so
 * there is no document nobody can retrieve after someone leaves.
 */
exports.getWorkOrderFileUrl = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const uid = request.auth.uid;

  const { orderId, which } = request.data || {};
  if (!orderId) throw new HttpsError('invalid-argument', 'Which document?');

  const snap = await admin.firestore().collection('workOrders').doc(String(orderId)).get();
  if (!snap.exists) throw new HttpsError('not-found', 'That document no longer exists.');
  const order = snap.data();

  const profile = await callerProfile(uid);
  const isSigner = (order.assignedUids ?? []).includes(uid);
  const isSender = order.uploadedByUid === uid;
  const isAdmin = profile.role === 'admin';

  if (!isSigner && !isSender && !isAdmin) {
    throw new HttpsError('permission-denied', 'This document is not shared with you.');
  }

  // The assembled signed version by default; the original only if asked for.
  const url = which === 'original' ? order.originalFileUrl : order.signedFileUrl;
  if (!url) throw new HttpsError('failed-precondition', 'There is no file to download yet.');

  // Stored as a full URL rather than a path, so the bucket prefix is trimmed
  // back off to address the object.
  const bucket = admin.storage().bucket();
  const path = decodeURIComponent(String(url).split('/o/')[1]?.split('?')[0] ?? '');
  if (!path) throw new HttpsError('failed-precondition', 'That file could not be located.');

  const [signed] = await bucket.file(path).getSignedUrl({
    action: 'read',
    expires: Date.now() + URL_MINUTES * 60 * 1000,
  });

  return { url: signed };
});

/**
 * A permit or checklist document. Location-scoped rather than signer-scoped:
 * these are reference material for whoever works that restaurant, not a
 * contract between named people.
 */
exports.getPermitDocUrl = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const uid = request.auth.uid;

  const { storagePath } = request.data || {};
  if (typeof storagePath !== 'string' || !storagePath.startsWith('permitDocs/')) {
    throw new HttpsError('invalid-argument', 'That is not a permit document.');
  }

  const profile = await callerProfile(uid);

  // permitDocs/{locationId}/{itemKey}/{fileName}
  const locationId = storagePath.split('/')[1];
  if (!locationId) throw new HttpsError('invalid-argument', 'That path is malformed.');

  if (profile.role !== 'admin' && profile.role !== 'executive') {
    // A manager needs the brand this location belongs to. Static locations
    // carry their brand in the id; custom ones are looked up.
    let brandId = ['taste', 'blutos', 'heritage', 'pronto', 'stellas'].find((b) =>
      locationId.startsWith(b + '-')
    );

    if (!brandId) {
      const loc = await admin.firestore().collection('customLocations').doc(locationId).get();
      brandId = loc.exists ? loc.data().brandId : null;
    }

    const granted = profile.permissions?.brandIds ?? [];
    if (!brandId || !granted.includes(brandId)) {
      throw new HttpsError('permission-denied', 'You do not have access to that location.');
    }
  }

  const [exists] = await admin.storage().bucket().file(storagePath).exists();
  if (!exists) throw new HttpsError('not-found', 'That file no longer exists.');

  const [signed] = await admin
    .storage()
    .bucket()
    .file(storagePath)
    .getSignedUrl({ action: 'read', expires: Date.now() + URL_MINUTES * 60 * 1000 });

  return { url: signed };
});
