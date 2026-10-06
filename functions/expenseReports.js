// Expense reports - downloading them, marking them collected, and ageing them
// out. The reports themselves are built in expensePeriods.js.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/https');
const admin = require('firebase-admin');

const REPORTS = 'expenseReports';
const ZONE = 'America/Chicago';

// The nightly CSV and the 5am finance email are gone: finance works from the
// period report (expensePeriods.js), and the COO gets a daily email of what
// came in (expenseDailyToCoo). The daily reports already stored age out below.

// ---------------------------------------------------------------------------
// Download a report
// ---------------------------------------------------------------------------
//
// Storage denies reads to every client, so this is the only route to the file.
// Downloading is what marks it collected - the same rule as the signed work
// order documents.
exports.getExpenseReportUrl = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const db = admin.firestore();
  const profile = await db.collection('users').doc(request.auth.uid).get();
  if (!profile.exists) throw new HttpsError('permission-denied', 'No profile found for this account.');
  const p = profile.data();
  if (p.role !== 'admin' && p.job !== 'Financials') {
    throw new HttpsError('permission-denied', 'Expense reports are restricted.');
  }

  const { dateKey } = request.data || {};
  if (!dateKey) throw new HttpsError('invalid-argument', 'Which report?');

  const ref = db.collection(REPORTS).doc(dateKey);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That report no longer exists.');

  const report = snap.data();

  // A monthly report carries the month's receipt photos as a zip alongside
  // the CSV. Photos age out at ninety days; this goes out on the first, so
  // finance has them sixty days before anything is removed.
  const { which } = request.data || {};
  const path = which === 'photos' ? report.archivePath : report.storagePath;
  if (!path) {
    throw new HttpsError(
      'not-found',
      which === 'photos' ? 'That period had no receipt photos.' : 'That report file is no longer stored.'
    );
  }

  const [url] = await admin
    .storage()
    .bucket()
    .file(path)
    .getSignedUrl({ action: 'read', expires: Date.now() + 15 * 60 * 1000 });

  return { url, label: report.label };
});

// Called once the browser has the file. Separate from issuing the URL so a
// failed download does not delete the report.
// Collection is per person, not per report.
//
// This used to delete the file once anyone downloaded it, which meant the
// first person to collect a report took it away from everyone else - if
// Brenner downloaded it, Sam could not. That was a bad trade: the files are a
// few kilobytes and availability matters more than the storage.
//
// Now the file stays until it ages out, and each person's red dot clears when
// they personally collect it.
exports.confirmExpenseReportDownloaded = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const db = admin.firestore();
  const profile = await db.collection('users').doc(request.auth.uid).get();
  if (!profile.exists) throw new HttpsError('permission-denied', 'No profile found.');
  const p = profile.data();
  if (p.role !== 'admin' && p.job !== 'Financials') {
    throw new HttpsError('permission-denied', 'Expense reports are restricted.');
  }

  const { dateKey } = request.data || {};
  const ref = db.collection(REPORTS).doc(dateKey);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true };

  const existing = snap.data().downloadedByUids ?? [];
  if (!existing.includes(request.auth.uid)) {
    await ref.update({
      downloadedByUids: [...existing, request.auth.uid],
      downloadedByNames: [...(snap.data().downloadedByNames ?? []), p.name ?? 'Unknown'],
    });

    // A monthly report covers the same receipts as that month's dailies, so
    // collecting it collects them - rather than leaving a row of red dots for
    // data already in hand.
    if (snap.data().kind === 'monthly') {
      const monthKey = (snap.id || '').replace('-monthly', '');
      const dailies = await db
        .collection(REPORTS)
        .where('kind', '==', 'daily')
        .get();
      const batch = db.batch();
      let marked = 0;
      dailies.forEach((d) => {
        if (!d.id.startsWith(monthKey)) return;
        const already = d.data().downloadedByUids ?? [];
        if (already.includes(request.auth.uid)) return;
        batch.update(d.ref, {
          downloadedByUids: [...already, request.auth.uid],
          downloadedByNames: [...(d.data().downloadedByNames ?? []), p.name ?? 'Unknown'],
        });
        marked++;
      });
      if (marked > 0) {
        await batch.commit();
        console.log('Collecting ' + monthKey + ' also collected ' + marked + ' daily report(s).');
      }
    }
  }

  return { ok: true };
});

// Reports age out after ninety days. They are kept rather than deleted on
// download - see confirmExpenseReportDownloaded - so without this they would
// accumulate forever. Ninety days covers a quarter, which is the window
// anyone is realistically going back over.
//
// The receipt records themselves are permanent. This only removes the
// compiled report.
exports.sweepOldExpenseReports = onSchedule(
  { schedule: '30 3 * * *', timeZone: ZONE },
  async () => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;

    const snap = await db.collection(REPORTS).where('generatedAt', '<', cutoff).get();
    if (snap.empty) {
      console.log('No expense reports older than ninety days.');
      return;
    }

    let removed = 0;
    for (const d of snap.docs) {
      const r = d.data();
      try {
        if (r.storagePath) await bucket.file(r.storagePath).delete({ ignoreNotFound: true });
        if (r.archivePath) await bucket.file(r.archivePath).delete({ ignoreNotFound: true });
        await d.ref.delete();
        removed++;
      } catch (err) {
        console.error('Could not remove report ' + d.id + ': ' + err.message);
      }
    }

    console.log('Removed ' + removed + ' expense report(s) older than ninety days.');
  }
);
