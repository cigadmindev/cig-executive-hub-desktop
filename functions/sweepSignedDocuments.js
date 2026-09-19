// Signed documents age out after thirty days.
//
// Shorter than the ninety used elsewhere, deliberately: a signed contract is
// the most sensitive thing the system stores, and the window only needs to
// cover the people who signed it collecting their copy. Anyone who needs it
// after that should have saved it.
//
// They used to be deleted the moment anyone downloaded one, which took the
// document away from everyone else who signed it. Keeping them until they
// age out is the fix; this is what stops them accumulating instead.
//
// The Firestore record stays - who signed, when, and the signature images.
// Only the assembled PDF goes.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

const COLLECTION = 'workOrders';
const ZONE = 'America/Chicago';
const DAYS = 30;

exports.sweepSignedDocuments = onSchedule(
  { schedule: '15 4 * * *', timeZone: ZONE },
  async () => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000;

    const snap = await db
      .collection(COLLECTION)
      .where('status', '==', 'completed')
      .where('completedAt', '<', cutoff)
      .get();

    if (snap.empty) {
      console.log('No signed documents older than ' + DAYS + ' days.');
      return;
    }

    let removed = 0;

    for (const d of snap.docs) {
      const order = d.data();
      if (order.filesDeleted) continue;

      const paths = [];
      if (order.signedPath) paths.push(order.signedPath);
      if (order.originalPath) paths.push(order.originalPath);

      // Older records stored a download URL rather than a path.
      for (const url of [order.signedFileUrl, order.originalFileUrl]) {
        if (!url) continue;
        const path = decodeURIComponent(String(url).split('/o/')[1]?.split('?')[0] ?? '');
        if (path) paths.push(path);
      }

      for (const path of paths) {
        try {
          await bucket.file(path).delete({ ignoreNotFound: true });
        } catch (err) {
          console.error('Could not remove ' + path + ': ' + err.message);
        }
      }

      await d.ref.update({ filesDeleted: true, signedPath: null, signedFileUrl: null });
      removed++;
    }

    console.log('Removed the files from ' + removed + ' signed document(s).');
  }
);
