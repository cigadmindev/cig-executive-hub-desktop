// Monthly expense report.
//
// Runs at 00:05 Central on the first of each month, covering the month that
// just ended. Same shape as the daily report, plus a category summary at the
// top - what was spent on what, before the itemised list.
//
// Reads the receipt records rather than the daily reports. Dailies are deleted
// once collected, so by month end most are gone; the receipts themselves are
// permanent. A missed daily therefore loses nothing from the monthly.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { Resend } = require('resend');

const RECEIPTS = 'expenseReceipts';
const REPORTS = 'expenseReports';
const ZONE = 'America/Chicago';

function centralParts(date) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t) => p.find((x) => x.type === t).value;
  return { year: get('year'), month: get('month'), day: get('day') };
}

function money(cents) {
  return (cents / 100).toFixed(2);
}

// Every field quoted, quotes doubled. Reasons are free text and a comma in one
// would otherwise shift every column after it.
function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

exports.closeExpenseMonth = onSchedule(
  { schedule: '5 0 1 * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'] },
  async () => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();

    // The month that just ended - step back a day from the 1st.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { year, month } = centralParts(yesterday);
    const monthKey = `${year}-${month}`;

    // dateSpent is stored as YYYY-MM-DD, so a prefix range picks the month.
    const snap = await db
      .collection(RECEIPTS)
      .where('dateSpent', '>=', `${monthKey}-01`)
      .where('dateSpent', '<=', `${monthKey}-31`)
      .get();

    if (snap.empty) {
      console.log(`Expense month ${monthKey}: nothing submitted, no report.`);
      return;
    }

    const receipts = snap.docs.map((d) => d.data());

    // Category totals first - the question finance actually asks.
    const byCategory = {};
    let total = 0;
    for (const r of receipts) {
      if (r.voided) continue;
      const label = r.categoryLabel ?? 'Uncategorised';
      byCategory[label] = (byCategory[label] ?? 0) + (r.amountCents ?? 0);
      total += r.amountCents ?? 0;
    }

    const label = new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleDateString('en-US', {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric',
    });

    const lines = [];

    lines.push([csvCell(label + ' — Expense Summary')].join(','));
    lines.push('');
    lines.push([csvCell('Category'), csvCell('Total')].join(','));
    Object.keys(byCategory)
      .sort((a, b) => byCategory[b] - byCategory[a])
      .forEach((cat) => lines.push([csvCell(cat), csvCell(money(byCategory[cat]))].join(',')));
    lines.push('');
    lines.push([csvCell('TOTAL'), csvCell(money(total))].join(','));
    lines.push('');
    lines.push('');

    lines.push([csvCell('Every receipt')].join(','));
    lines.push('');
    lines.push(
      ['Date spent', 'Submitted by', 'Amount', 'Category', 'Where', 'Reason', 'Submitted at', 'Voided']
        .map(csvCell)
        .join(',')
    );

    receipts
      .sort((a, b) => (a.dateSpent ?? '').localeCompare(b.dateSpent ?? ''))
      .forEach((r) => {
        lines.push(
          [
            r.dateSpent,
            r.submittedByName,
            money(r.amountCents ?? 0),
            r.categoryLabel,
            r.where,
            r.reason,
            r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-US', { timeZone: ZONE }) : '',
            r.voided ? 'VOIDED' : '',
          ]
            .map(csvCell)
            .join(',')
        );
      });

    const path = `expenseReports/${monthKey}-monthly.csv`;
    await bucket.file(path).save(lines.join('\n'), { contentType: 'text/csv' });

    // Same collection as the dailies, with kind marking which is which - the
    // screen shows both without needing anything new.
    await db.collection(REPORTS).doc(`${monthKey}-monthly`).set({
      dateKey: `${monthKey}-monthly`,
      kind: 'monthly',
      label: label,
      receiptCount: receipts.length,
      totalCents: total,
      storagePath: path,
      generatedAt: Date.now(),
      downloadedAt: null,
      downloadedBy: null,
    });

    // Tell finance it is waiting.
    const usersSnap = await db.collection('users').where('active', '==', true).get();
    const recipients = usersSnap.docs
      .map((d) => d.data())
      .filter((u) => u.role === 'admin' || u.job === 'Financials')
      .map((u) => u.email)
      .filter(Boolean);

    if (recipients.length) {
      const summaryRows = Object.keys(byCategory)
        .sort((a, b) => byCategory[b] - byCategory[a])
        .map(
          (cat) =>
            `<tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#9A9AA6;padding:6px 0;">${cat}</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#FFFFFF;text-align:right;padding:6px 0;">$${money(byCategory[cat])}</td></tr>`
        )
        .join('');

      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: 'CIG Executive Hub <no-reply@cigconcepts.com>',
        to: recipients,
        subject: `Monthly expense report — ${label}`,
        html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;padding:0;background-color:#0A0A0B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0A0A0B;">
<tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
    <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:bold;letter-spacing:-0.4px;text-transform:uppercase;color:#FFFFFF;padding-bottom:12px;">CIG Executive Hub</td></tr>
    <tr><td style="padding-bottom:26px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="width:48px;height:3px;background-color:#22D3EE;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
    <tr><td style="background-color:#1C1C22;border:1px solid #2A2A33;border-radius:10px;padding:32px;">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#22D3EE;padding-bottom:12px;">Monthly expenses</div>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:24px;font-weight:bold;letter-spacing:-0.4px;color:#FFFFFF;padding-bottom:20px;">${label}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${summaryRows}
        <tr><td colspan="2" style="border-top:1px solid #2A2A33;padding-top:10px;"></td></tr>
        <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;padding:6px 0;">Total</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;text-align:right;padding:6px 0;">$${money(total)}</td></tr>
      </table>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:23px;color:#9A9AA6;padding-top:20px;">
        ${receipts.length} receipt${receipts.length === 1 ? '' : 's'}. The full report is at the top of the Expenses page and stays there until you download it.
      </div>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`,
      });
      if (error) console.error(`Monthly report email failed: ${error.message}`);
    }

    console.log(`Expense month ${monthKey}: ${receipts.length} receipt(s), $${money(total)}.`);
  }
);
