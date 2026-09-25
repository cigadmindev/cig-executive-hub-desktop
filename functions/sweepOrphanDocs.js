// Permit and checklist documents nothing points at any more.
//
// Removing an attached document clears it from the item, but the browser's
// delete is refused by the Storage rules - correctly, since a client deleting
// files directly is what we closed. So the file stays with nothing referencing
// it: unreachable, because reads go through a function that checks the record.
//
// Weekly rather than daily. A file is only orphaned deliberately, and a week's
// grace means a removal someone regrets can still be recovered from the
// console.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

const ZONE = 'America/Chicago';
const GRACE_DAYS = 7;

exports.sweepOrphanDocs = onSchedule({ schedule: '30 4 * * 1', timeZone: ZONE }, async () => {
  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  // Everything still attached to something.
  const referenced = new Set();
  for (const c of ['schedules', 'licenseRenewals']) {
    const snap = await db.collection(c).get();
    snap.forEach((d) => {
      const path = d.data().document?.path;
      if (path) referenced.add(path);
    });
  }

  const [files] = await bucket.getFiles({ prefix: 'permitDocs/' });
  const cutoff = Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;

  for (const file of files) {
    if (referenced.has(file.name)) continue;
    // Uploaded within the grace window - it may be attached moments from now.
    const created = new Date(file.metadata.timeCreated ?? 0).getTime();
    if (created > cutoff) continue;
    try {
      await file.delete({ ignoreNotFound: true });
      removed++;
    } catch (err) {
      console.error('Could not remove ' + file.name + ': ' + err.message);
    }
  }

  console.log('Orphaned documents removed: ' + removed + ' of ' + files.length + ' stored.');
});
