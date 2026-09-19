// Receipt photos age out after ninety days.
//
// They used to be deleted at the 23:59 day close, the moment the report was
// compiled. One day is not long enough to question a financial record - by
// the time anyone asks about a charge, the image proving it was gone.
//
// The receipt itself is permanent. Only the photo goes, which is what the
// imageDeletedAt field on the record always implied.
//
// Finance receives every month's photos as a zip with the monthly report on
// the first, so the archive goes out sixty days before anything is removed.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

const RECEIPTS = 'expenseReceipts';
const ZONE = 'America/Chicago';
const DAYS = 90;

exports.sweepReceiptPhotos = onSchedule(
  { schedule: '0 4 * * *', timeZone: ZONE },
  async () => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000;

    const snap = await db.collection(RECEIPTS).where('submittedAt', '<', cutoff).get();

    if (snap.empty) {
      console.log('No receipt photos older than ' + DAYS + ' days.');
      return;
    }

    let removed = 0;

    for (const d of snap.docs) {
      const r = d.data();
      if (!r.storagePath || r.imageDeletedAt) continue;

      try {
        await bucket.file(r.storagePath).delete({ ignoreNotFound: true });
        await d.ref.update({ imageDeletedAt: Date.now() });
        removed++;
      } catch (err) {
        console.error('Photo not removed for receipt ' + d.id + ': ' + err.message);
      }
    }

    console.log('Removed ' + removed + ' receipt photo(s) older than ' + DAYS + ' days.');
  }
);
