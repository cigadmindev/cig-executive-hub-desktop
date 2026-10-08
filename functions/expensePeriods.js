// Expenses by fiscal period.
//
//   closeExpensePeriod     Saturday 00:05 - the period whose catch-up window
//                          ended Friday gets its report: spreadsheet + photo zip,
//                          and an email to finance.
//   rebuildPeriodReport    Finance or admin - rebuild a period from its receipts
//                          as they stand now.
//   moveReceiptPeriod      Finance only - put a receipt in a different period,
//                          open or shut.
//   expenseDailyToCoo      07:00 - yesterday's receipts, by email, to the COO,
//                          so he can follow up with whoever submitted them.
//   expensePeriodJobs      08:00 - Monday "period closed, due Friday", Thursday
//                          "last day tomorrow", and a warning when the loaded
//                          calendar is about to run out.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { Resend } = require('resend');
const { buildReceiptArchive } = require('./receiptArchive');
const T = require('./emailTemplate');
const { ZONE, PERIODS, centralDateKey, addDays, weekday, loadPeriods, periodFor, periodRange } = require('./fiscal');
const { requireLive } = require('./caller');

const RECEIPTS = 'expenseReceipts';
const REPORTS = 'expenseReports';
const FROM = 'CIG Executive Hub <no-reply@cigconcepts.com>';
const WEB = 'https://hub.cigconcepts.com';

const money = (cents) => (cents / 100).toFixed(2);
const csvCell = (v) => '"' + (v === null || v === undefined ? '' : String(v)).replace(/"/g, '""') + '"';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function isFinance(u) {
  return u?.job === 'Financials';
}

// Who may submit receipts: admins and executives always; a manager when their
// feature list includes expenses (no list at all still means everything, until
// Phase 4 changes that default).
function canSubmitExpenses(u) {
  if (u.active === false) return false;
  if (u.role === 'admin' || u.role === 'executive') return true;
  const f = u.permissions?.features;
  return !Array.isArray(f) || f.includes('expenses');
}

async function ghostUids(db) {
  const snap = await db.collection('users').where('isGhost', '==', true).get();
  return new Set(snap.docs.map((d) => d.id));
}

// ---------------------------------------------------------------------------
// The period report - one builder for the scheduled close and the rebuild
// ---------------------------------------------------------------------------
async function buildPeriod(period) {
  const db = admin.firestore();
  const ghosts = await ghostUids(db);
  const snap = await db.collection(RECEIPTS).where('periodId', '==', period.id).get();
  const receipts = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => !ghosts.has(r.submittedByUid));

  const byCategory = {};
  const byChargeTo = {};
  let total = 0;
  for (const r of receipts) {
    if (r.voided) continue;
    const c = r.categoryLabel ?? 'Uncategorised';
    byCategory[c] = (byCategory[c] ?? 0) + (r.amountCents ?? 0);
    const t = r.chargeToName ?? 'Corporate';
    byChargeTo[t] = (byChargeTo[t] ?? 0) + (r.amountCents ?? 0);
    total += r.amountCents ?? 0;
  }

  const range = periodRange(period);
  const title = period.label + ' (' + range + ')';
  const lines = [];
  const sorted = (o) => Object.keys(o).sort((a, b) => o[b] - o[a]);

  lines.push(csvCell(title + ' — Expense Summary'), '');
  lines.push([csvCell('Category'), csvCell('Total')].join(','));
  sorted(byCategory).forEach((k) => lines.push([csvCell(k), csvCell(money(byCategory[k]))].join(',')));
  lines.push('', [csvCell('TOTAL'), csvCell(money(total))].join(','), '', '');

  lines.push(csvCell('By charge to'), '');
  lines.push([csvCell('Charged to'), csvCell('Total')].join(','));
  sorted(byChargeTo).forEach((k) => lines.push([csvCell(k), csvCell(money(byChargeTo[k]))].join(',')));
  lines.push('', '');

  lines.push(csvCell('Every receipt'), '');
  lines.push(
    ['Period', 'Date spent', 'Submitted by', 'Amount', 'Category', 'Charge to', 'Where', 'Reason', 'Submitted at', 'Voided', 'Moved by finance']
      .map(csvCell)
      .join(',')
  );
  receipts
    .slice()
    .sort((a, b) => (a.dateSpent ?? '').localeCompare(b.dateSpent ?? ''))
    .forEach((r) =>
      lines.push(
        [
          period.label,
          r.dateSpent,
          r.submittedByName,
          money(r.amountCents ?? 0),
          r.categoryLabel,
          r.chargeToName ?? 'Corporate',
          r.where,
          r.reason,
          r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-US', { timeZone: ZONE }) : '',
          r.voided ? 'VOIDED' : '',
          r.movedByName ? r.movedByName + ' (from ' + (r.previousPeriodLabel ?? '?') + ')' : '',
        ]
          .map(csvCell)
          .join(',')
      )
    );

  const path = 'expenseReports/' + period.id + '.csv';
  await admin.storage().bucket().file(path).save(lines.join('\n'), { contentType: 'text/csv' });

  let archivePath = null;
  try {
    archivePath = await buildReceiptArchive(receipts, period.id);
  } catch (err) {
    console.error('Receipt archive failed for ' + period.id + ': ' + err.message);
  }

  return { receipts, byCategory, total, title, path, archivePath };
}

exports.closeExpensePeriod = onSchedule(
  { schedule: '5 0 * * 6', timeZone: ZONE, secrets: ['RESEND_API_KEY'], memory: '1GiB', timeoutSeconds: 540 },
  async () => {
    const db = admin.firestore();
    const friday = addDays(centralDateKey(new Date()), -1);
    const periods = await loadPeriods(db);
    const period = periods.find((p) => p.windowEndKey === friday);
    if (!period) {
      console.log('No period window ended ' + friday + '.');
      return;
    }

    const { receipts, byCategory, total, title, path, archivePath } = await buildPeriod(period);

    await db.collection(REPORTS).doc(period.id).set({
      dateKey: period.id,
      kind: 'period',
      periodId: period.id,
      label: title,
      receiptCount: receipts.length,
      totalCents: total,
      storagePath: path,
      archivePath,
      generatedAt: Date.now(),
      downloadedByUids: [],
      downloadedByNames: [],
      changedReceiptIds: [],
      staleSince: null,
    });

    const users = await db.collection('users').where('active', '==', true).get();
    const to = users.docs
      .map((d) => d.data())
      .filter((u) => u.role === 'admin' || isFinance(u))
      .map((u) => u.email)
      .filter(Boolean);

    if (to.length && process.env.RESEND_API_KEY) {
      const cats = Object.keys(byCategory).sort((a, b) => byCategory[b] - byCategory[a]);
      const top = cats.slice(0, 4).map((c) => [c, '$' + money(byCategory[c])]);
      const rest = cats.slice(4).reduce((s, c) => s + byCategory[c], 0);
      const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: FROM,
        to,
        subject: period.label + ' expense report is ready',
        html: T.layout({
          kicker: 'Expenses',
          title: period.label + ' report is ready',
          intro: periodRange(period) + '. The catch-up week closed Friday, so this is final.',
          details: [['Receipts', String(receipts.length)], ['Total', '$' + money(total)], ...top, ...(rest ? [['Other categories', '$' + money(rest)]] : [])],
          button: { label: 'Download the report and photos', url: WEB + '/expenses' },
          footer: 'You got this because you are finance. Save a copy - the Hub keeps reports ninety days.',
        }),
      });
      if (error) console.error('Period report email failed: ' + error.message);
    }
    console.log(period.id + ': ' + receipts.length + ' receipt(s), $' + money(total) + '.');
  }
);

async function financeOrAdmin(uid) {
  const me = await admin.firestore().collection('users').doc(uid).get();
  return me.exists ? me.data() : null;
}

exports.rebuildPeriodReport = onCall({ memory: '1GiB', timeoutSeconds: 540 }, async (request) => {
  await requireLive(request);
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const me = await financeOrAdmin(request.auth.uid);
  if (!me || (me.role !== 'admin' && !isFinance(me))) throw new HttpsError('permission-denied', 'Finance and admins only.');

  const db = admin.firestore();
  const periodId = String(request.data?.periodId ?? '');
  const periodDoc = await db.collection(PERIODS).doc(periodId).get();
  if (!periodDoc.exists) throw new HttpsError('not-found', 'No such period.');
  const reportRef = db.collection(REPORTS).doc(periodId);
  const report = await reportRef.get();
  if (!report.exists) throw new HttpsError('failed-precondition', 'That period has not closed yet - there is no report to rebuild.');

  const was = report.data();
  const { receipts, total, title, path, archivePath } = await buildPeriod({ id: periodDoc.id, ...periodDoc.data() });
  await reportRef.update({
    label: title,
    receiptCount: receipts.length,
    totalCents: total,
    storagePath: path,
    archivePath,
    regeneratedAt: Date.now(),
    changedReceiptIds: [],
    staleSince: null,
    // What anyone downloaded before is no longer the report.
    downloadedByUids: [],
    downloadedByNames: [],
  });
  return { ok: true, receipts: receipts.length, previousReceipts: was.receiptCount ?? 0, totalCents: total };
});

// ---------------------------------------------------------------------------
// Finance moves a receipt between periods
// ---------------------------------------------------------------------------
exports.moveReceiptPeriod = onCall(async (request) => {
  await requireLive(request);
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const me = await financeOrAdmin(request.auth.uid);
  if (!me || !isFinance(me)) throw new HttpsError('permission-denied', 'Only finance can move a receipt between periods.');

  const db = admin.firestore();
  const receiptId = String(request.data?.receiptId ?? '');
  const periodId = String(request.data?.periodId ?? '');
  const [rSnap, pSnap] = await Promise.all([
    db.collection(RECEIPTS).doc(receiptId).get(),
    db.collection(PERIODS).doc(periodId).get(),
  ]);
  if (!rSnap.exists) throw new HttpsError('not-found', 'That receipt no longer exists.');
  if (!pSnap.exists) throw new HttpsError('not-found', 'No such period.');
  const r = rSnap.data();
  const fromPeriodId = r.periodId ?? null;   // captured before the write below
  if (fromPeriodId === periodId) return { ok: true, unchanged: true };

  const now = Date.now();
  await rSnap.ref.update({
    periodId,
    periodLabel: pSnap.data().label,
    previousPeriodId: fromPeriodId,
    previousPeriodLabel: r.periodLabel ?? null,
    movedByUid: request.auth.uid,
    movedByName: me.name ?? 'Finance',
    movedAt: now,
  });

  // A report already built for either side no longer matches. Say so on it.
  const flagged = [];
  for (const id of [fromPeriodId, periodId].filter(Boolean)) {
    const ref = db.collection(REPORTS).doc(id);
    const rep = await ref.get();
    if (!rep.exists) continue;
    await ref.update({
      changedReceiptIds: admin.firestore.FieldValue.arrayUnion(receiptId),
      staleSince: rep.data().staleSince ?? now,
    });
    flagged.push(id);
  }
  return { ok: true, flagged };
});

// ---------------------------------------------------------------------------
// 07:00 - yesterday's receipts to the COO
// ---------------------------------------------------------------------------
exports.expenseDailyToCoo = onSchedule(
  { schedule: '0 7 * * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'] },
  async () => {
    const db = admin.firestore();
    const yesterday = addDays(centralDateKey(new Date()), -1);
    const ghosts = await ghostUids(db);
    const snap = await db.collection(RECEIPTS).where('submittedDateKey', '==', yesterday).get();
    const receipts = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((r) => !ghosts.has(r.submittedByUid))
      .sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));
    if (receipts.length === 0) {
      console.log('No receipts submitted ' + yesterday + '; no COO email.');
      return;
    }

    const users = await db.collection('users').where('active', '==', true).get();
    const people = users.docs.map((d) => ({ uid: d.id, ...d.data() }));
    const emailOf = new Map(people.map((u) => [u.uid, u.email]));
    const to = people.filter((u) => u.job === 'COO').map((u) => u.email).filter(Boolean);
    if (to.length === 0 || !process.env.RESEND_API_KEY) {
      console.log('No COO to send to.');
      return;
    }

    // Links last seven days, the longest Storage allows - long enough to look
    // through the week's emails.
    const bucket = admin.storage().bucket();
    const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
    let total = 0;
    const rows = [];
    for (const r of receipts) {
      if (!r.voided) total += r.amountCents ?? 0;
      let url = null;
      if (r.storagePath && !r.imageDeletedAt) {
        try {
          [url] = await bucket.file(r.storagePath).getSignedUrl({ action: 'read', expires });
        } catch (err) {
          console.error('Signed URL failed for ' + r.id + ': ' + err.message);
        }
      }
      const mail = emailOf.get(r.submittedByUid);
      const first = String(r.submittedByName ?? '').split(' ')[0];
      const mailto = mail ? 'mailto:' + mail + '?subject=' + encodeURIComponent('Receipt: $' + money(r.amountCents) + ' at ' + r.where) : null;
      rows.push({
        title: '$' + money(r.amountCents) + (r.voided ? ' · VOID' : '') + ' · ' + r.submittedByName,
        line: [r.categoryLabel, r.where, r.chargeToName ?? 'Corporate', r.periodLabel].filter(Boolean).join(' · ') + ' · "' + r.reason + '"',
        url: url ?? mailto,
        action: url ? 'View receipt' : 'Email ' + first,
        url2: url ? mailto : null,
        action2: 'Email ' + first,
      });
    }

    const pretty = new Date(yesterday + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' });
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: FROM,
      to,
      subject: 'Receipts submitted ' + pretty + ' — $' + money(total),
      html: T.layout({
        kicker: 'Expenses · daily',
        title: 'Receipts submitted ' + pretty,
        intro: receipts.length + ' receipt' + (receipts.length === 1 ? '' : 's') + ' totalling $' + money(total) + '. Any questions, reach out to whoever submitted it.',
        bodyHtml: T.itemList(rows),
        footer: 'You got this because you are COO. For review only - finance works from the period report. Receipt links work for seven days.',
      }),
    });
    if (error) console.error('COO daily email failed: ' + error.message);
    else console.log('COO daily for ' + yesterday + ': ' + receipts.length + ' receipt(s).');
  }
);

// ---------------------------------------------------------------------------
// 08:00 - reminders, and a warning before the calendar runs out
// ---------------------------------------------------------------------------
exports.expensePeriodJobs = onSchedule(
  { schedule: '0 8 * * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'] },
  async () => {
    const { notifyPeople, ACTION } = require('./notify');
    const db = admin.firestore();
    const today = centralDateKey(new Date());
    const day = weekday(today);
    const periods = await loadPeriods(db);
    const users = (await db.collection('users').where('active', '==', true).get()).docs.map((d) => ({ uid: d.id, ...d.data() }));

    // Monday: the period that ended yesterday is in its catch-up week.
    // Thursday: tomorrow is its last day.
    const closing =
      day === 1 ? periods.find((p) => p.endKey === addDays(today, -1)) :
      day === 4 ? periods.find((p) => p.windowEndKey === addDays(today, 1)) :
      null;
    if (closing) {
      const due = new Date(closing.windowEndKey + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' });
      const people = users.filter(canSubmitExpenses);
      const [title, body] =
        day === 1
          ? [closing.label + ' closed yesterday', 'Submit any receipts from ' + periodRange(closing) + ' by ' + due + '. After that they go into the next period.']
          : ['Last day tomorrow for ' + closing.label, 'Receipts from ' + periodRange(closing) + ' are due by end of day ' + due + '.'];
      await notifyPeople(people, title, body, {
        speed: ACTION,
        path: '/expenses',
        topic: 'expenses',
        button: 'Add a receipt',
        why: 'You got this because you can submit expenses.',
        throttleKey: 'period-reminder-' + closing.id + '-' + day,
      });
      console.log('Reminder sent for ' + closing.id + ' to ' + people.length + ' people.');
    }

    // The calendar has to be loaded before it runs out, or receipts stop
    // being accepted. Warn finance and admins 45 days ahead, then weekly.
    const last = periods[periods.length - 1];
    if (last) {
      const daysLeft = Math.round((Date.parse(last.endKey) - Date.parse(today)) / 86400000);
      if (daysLeft <= 45 && (daysLeft === 45 || day === 1)) {
        const people = users.filter((u) => u.role === 'admin' || isFinance(u));
        await notifyPeople(
          people,
          'The fiscal calendar ends in ' + daysLeft + ' days',
          'The last period loaded in the Hub is ' + last.label + ', ending ' + last.endKey + '. Load the next year before then or receipts cannot be submitted.',
          { speed: ACTION, path: '/expenses', topic: 'expenses', why: 'You got this because you are an admin or finance.', throttleKey: 'calendar-ending-' + today }
        );
      }
    } else {
      console.error('No fiscal periods loaded.');
    }
  }
);
