// Expense daily reports.
//
// Two scheduled functions:
//
//   At 23:59 Central - the day's receipts lock, a CSV covering every account
//   is generated and stored, and every receipt photo from that day is deleted.
//   The report is the durable artifact; the photos are not.
//
//   At 05:00 Central - a notification that the report is waiting. It is only
//   a notification: the report already exists by then, because it cannot be
//   built after its source photos have gone.
//
// A report stays until it is downloaded, not until the next one arrives.
// Superseding it would give finance one day to collect it, and a day off would
// mean a lost report with no way to regenerate it.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/https');
const admin = require('firebase-admin');
const { Resend } = require('resend');

const RECEIPTS = 'expenseReceipts';
const REPORTS = 'expenseReports';
const ZONE = 'America/Chicago';

// YYYY-MM-DD as seen in Central, wherever the server happens to be.
function centralDateKey(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function prettyDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function money(cents) {
  return (cents / 100).toFixed(2);
}

// Every field quoted, and quotes inside a field doubled. The reason field is
// free text - "Dinner with Mark, Ben and Cameron" would otherwise split across
// three columns and shift every column after it.
function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function buildCsv(receipts, dateKey) {
  const header = [
    'Date spent',
    'Submitted by',
    'Amount',
    'Category',
    'Where',
    'Reason',
    'Submitted at',
    'Voided',
  ];

  const rows = receipts.map((r) => [
    r.dateSpent,
    r.submittedByName,
    money(r.amountCents),
    r.categoryLabel,
    r.where,
    r.reason,
    new Date(r.submittedAt).toLocaleString('en-US', { timeZone: ZONE }),
    r.voided ? 'VOIDED' : '',
  ]);

  // Voided receipts are part of the day's record but count as nothing.
  const total = receipts.reduce((sum, r) => sum + (r.voided ? 0 : r.amountCents), 0);

  const lines = [
    header.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
    '',
    [csvCell('TOTAL'), '', csvCell(money(total)), '', '', '', '', ''].join(','),
  ];

  return { csv: lines.join('\n'), total };
}

// ---------------------------------------------------------------------------
// 23:59 Central - lock the day, build the report, delete the photos
// ---------------------------------------------------------------------------
exports.closeExpenseDay = onSchedule(
  { schedule: '59 23 * * *', timeZone: ZONE },
  async () => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();

    const dateKey = centralDateKey(new Date());

    const snap = await db.collection(RECEIPTS).where('dateSpent', '==', dateKey).get();
    if (snap.empty) {
      console.log(`Expense day ${dateKey}: nothing submitted, no report.`);
      return;
    }

    const receipts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const { csv, total } = buildCsv(receipts, dateKey);

    const path = `expenseReports/${dateKey}.csv`;
    await bucket.file(path).save(csv, { contentType: 'text/csv' });

    await db.collection(REPORTS).doc(dateKey).set({
      dateKey,
      label: prettyDate(dateKey),
      receiptCount: receipts.length,
      totalCents: total,
      storagePath: path,
      generatedAt: Date.now(),
      // Stays until collected. See the note at the top of this file.
      downloadedAt: null,
      downloadedBy: null,
    });

    // The photos go now the report exists. Anything already swept, or that
    // never had an image, is skipped rather than treated as a failure.
    let removed = 0;
    for (const r of receipts) {
      if (!r.storagePath || r.imageDeletedAt) continue;
      try {
        await bucket.file(r.storagePath).delete({ ignoreNotFound: true });
        await db.collection(RECEIPTS).doc(r.id).update({ imageDeletedAt: Date.now() });
        removed++;
      } catch (err) {
        console.error(`Photo not removed for receipt ${r.id}: ${err.message}`);
      }
    }

    console.log(
      `Expense day ${dateKey}: ${receipts.length} receipt(s), $${money(total)}, ${removed} photo(s) removed.`
    );
  }
);

// ---------------------------------------------------------------------------
// 05:00 Central - tell finance the report is waiting
// ---------------------------------------------------------------------------
exports.notifyExpenseReport = onSchedule(
  { schedule: '0 5 * * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'] },
  async () => {
    const db = admin.firestore();

    // Yesterday in Central - the day that closed a few hours ago.
    const yesterday = centralDateKey(new Date(Date.now() - 6 * 60 * 60 * 1000));

    const reportSnap = await db.collection(REPORTS).doc(yesterday).get();
    if (!reportSnap.exists) {
      console.log(`No expense report for ${yesterday}; nothing to send.`);
      return;
    }
    const report = reportSnap.data();
    if (report.downloadedAt) {
      console.log(`Report for ${yesterday} already collected.`);
      return;
    }

    // Admins and anyone whose job is Financials.
    const usersSnap = await db.collection('users').where('active', '==', true).get();
    const recipients = usersSnap.docs
      .map((d) => d.data())
      .filter((u) => u.role === 'admin' || u.job === 'Financials')
      .map((u) => u.email)
      .filter(Boolean);

    if (recipients.length === 0) {
      console.log('No finance or admin recipients for the expense report.');
      return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: 'CIG Executive Hub <no-reply@cigconcepts.com>',
      to: recipients,
      subject: `Expense report — ${report.label}`,
      html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;padding:0;background-color:#0A0A0B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0A0A0B;">
<tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
    <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:bold;letter-spacing:-0.4px;text-transform:uppercase;color:#FFFFFF;padding-bottom:12px;">CIG Executive Hub</td></tr>
    <tr><td style="padding-bottom:26px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="width:48px;height:3px;background-color:#22D3EE;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
    <tr><td style="background-color:#1C1C22;border:1px solid #2A2A33;border-radius:10px;padding:32px;">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#22D3EE;padding-bottom:12px;">Expenses</div>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:24px;font-weight:bold;letter-spacing:-0.4px;color:#FFFFFF;padding-bottom:14px;">${report.label}</div>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:23px;color:#9A9AA6;padding-bottom:20px;">
        ${report.receiptCount} receipt${report.receiptCount === 1 ? '' : 's'} totalling <strong style="color:#FFFFFF;">$${money(report.totalCents)}</strong>.
      </div>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:23px;color:#9A9AA6;">
        The report is waiting at the top of the Expenses page. It stays there until you download it.
      </div>
    </td></tr>
    <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#6A6A76;padding-top:22px;">Receipt photos are removed once the report is generated. The report is the record.</td></tr>
  </table>
</td></tr>
</table>
</body></html>`,
    });

    if (error) {
      console.error(`Expense report email failed: ${error.message}`);
      return;
    }
    console.log(`Expense report for ${yesterday} sent to ${recipients.length} recipient(s).`);
  }
);

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
  const [url] = await admin
    .storage()
    .bucket()
    .file(report.storagePath)
    .getSignedUrl({ action: 'read', expires: Date.now() + 15 * 60 * 1000 });

  return { url, label: report.label };
});

// Called once the browser has the file. Separate from issuing the URL so a
// failed download does not delete the report.
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

  const report = snap.data();

  // Recorded, then the file goes. The document stays so the page can show it
  // was collected and by whom, without keeping a second copy of the data.
  await ref.update({ downloadedAt: Date.now(), downloadedBy: p.name ?? 'Unknown' });

  try {
    await admin.storage().bucket().file(report.storagePath).delete({ ignoreNotFound: true });
  } catch (err) {
    console.error(`Report file not removed for ${dateKey}: ${err.message}`);
  }

  return { ok: true };
});
