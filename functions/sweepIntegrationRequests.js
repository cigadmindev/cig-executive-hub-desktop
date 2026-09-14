// Done integration requests age out after ninety days.
//
// Same reasoning as the expense reports: they are kept rather than deleted on
// resolution, because the person who asked should be able to look back at the
// answer. But a year of "how do I void a check" would bury the ones that
// matter.
//
// Only done requests. Anything still open or in progress stays, however old -
// an unanswered request going stale is a signal, not clutter.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

const COLLECTION = 'integrationRequests';
const ZONE = 'America/Chicago';

exports.sweepIntegrationRequests = onSchedule(
  { schedule: '45 3 * * *', timeZone: ZONE },
  async () => {
    const db = admin.firestore();
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;

    const snap = await db
      .collection(COLLECTION)
      .where('status', '==', 'done')
      .where('respondedAt', '<', cutoff)
      .get();

    if (snap.empty) {
      console.log('No integration requests older than ninety days.');
      return;
    }

    let batch = db.batch();
    let n = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
    await batch.commit();

    console.log('Removed ' + n + ' resolved integration request(s).');
  }
);
