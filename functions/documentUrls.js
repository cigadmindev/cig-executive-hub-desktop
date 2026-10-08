// Signed URLs for documents, so Storage can stop being readable by anyone
// signed in.
//
// The pattern is the one receipts already use: Storage rules cannot read
// Firestore, so they cannot tell whether you signed a document or have access
// to a location. Rather than fall back to "any signed-in user", the Storage
// rules deny reads outright and the check happens here, where it can.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { requireLive } = require('./caller');

// Long enough to click through and download, short enough that a leaked URL
// is not a lasting problem.
const URL_MINUTES = 10;

// The Storage path of a work order's file, worked out here and never taken
// on trust. A path that does not sit under this work order's own folder is
// refused: otherwise anyone could create a work order pointing at someone
// else's receipt and be handed a link to it (8 Oct 2026, S2).
function workOrderPath(orderId, order, which) {
  const fromUrl = (url) => (url ? decodeURIComponent(String(url).split('/o/')[1]?.split('?')[0] ?? '') : '');
  const path = which === 'original'
    ? order.originalPath || fromUrl(order.originalFileUrl)
    : order.signedPath || fromUrl(order.signedFileUrl);
  if (!path) return null;
  if (!path.startsWith(`workOrders/${orderId}/`) || path.includes('..')) {
    throw new HttpsError('permission-denied', 'That file does not belong to this document.');
  }
  return path;
}
exports.workOrderPath = workOrderPath;

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
  await requireLive(request);
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
  // Reads the stored path (the signed copy has been saved as a path, not a
  // URL, since September - reading only the URL broke every new download).
  const path = workOrderPath(String(orderId), order, which === 'original' ? 'original' : 'signed');
  if (!path) throw new HttpsError('failed-precondition', 'There is no file to download yet.');
  const bucket = admin.storage().bucket();

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
  await requireLive(request);
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

    // Narrowed to specific locations within the brand, if they have been.
    const only = profile.permissions?.locationsByBrand?.[brandId];
    if (Array.isArray(only) && only.length > 0 && !only.includes(locationId)) {
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
