// Invoices: getting the file into Drive, and the morning list.
//
// A browser cannot write to Drive, so the app uploads to Storage and this
// moves it into that location's Financials > Invoices & Vendor Payments
// folder. If Drive is unreachable the record says so and the file stays put,
// rather than the invoice vanishing.
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const { Resend } = require('resend');
const { everyone, FROM, WEB_URL } = require('./notify');

const DRIVE_ID = '0ANOluAAxZB7lUk9PVA';
const FOLDER = 'application/vnd.google-apps.folder';
const ZONE = 'America/Chicago';
const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

const SHARED = { corpora: 'drive', driveId: DRIVE_ID, includeItemsFromAllDrives: true, supportsAllDrives: true };

const money = (cents) => (cents == null ? '' : '$' + (cents / 100).toFixed(2));
const esc = (s) => String(s).replace(/'/g, "\\'");

async function driveClient() {
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive'] });
  return google.drive({ version: 'v3', auth: await auth.getClient() });
}

async function findChild(drive, parentId, name) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${esc(name)}' and mimeType = '${FOLDER}' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
    ...SHARED,
  });
  return res.data.files?.[0]?.id ?? null;
}

/**
 * The invoices folder for a location, found by walking the tree the Hub
 * already mirrors. Never creates anything: if the folder is missing, that is
 * worth knowing rather than papering over.
 */
async function invoicesFolder(drive, brandName, locationName) {
  const brand = await findChild(drive, DRIVE_ID, brandName);
  if (!brand) return null;
  const location = await findChild(drive, brand, locationName);
  if (!location) return null;
  const financials = await findChild(drive, location, 'Financials');
  if (!financials) return null;
  return findChild(drive, financials, 'Invoices & Vendor Payments');
}

exports.onInvoiceUploaded = onObjectFinalized(
  { region: 'us-east1', timeoutSeconds: 300, memory: '512MiB' },
  async (event) => {
  const path = event.data.name ?? '';
  if (!path.startsWith('invoiceUploads/')) return;

  const [, invoiceId, ...rest] = path.split('/');
  const fileName = rest.join('/');
  if (!invoiceId || !fileName) return;

  const db = admin.firestore();
  const ref = db.collection('invoices').doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error('No invoice record for ' + invoiceId);
    return;
  }
  const invoice = snap.data();

  try {
    const drive = await driveClient();
    const folderId = await invoicesFolder(drive, invoice.brandName, invoice.locationName);
    if (!folderId) {
      throw new Error(
        'No Invoices & Vendor Payments folder for ' + invoice.brandName + ' / ' + invoice.locationName
      );
    }

    const bucket = admin.storage().bucket(event.data.bucket);
    const stream = bucket.file(path).createReadStream();

    // Named so the folder reads usefully without opening anything.
    const dated = (invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : 'no-date');
    const vendor = (invoice.vendor || 'Invoice').replace(/[\\/]/g, '-');
    const uploaded = await drive.files.create({
      requestBody: { name: `${dated} ${vendor} ${fileName}`, parents: [folderId] },
      media: { body: stream },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    });

    await ref.update({ driveUrl: uploaded.data.webViewLink, driveError: null });
    // Only once it is safely in Drive.
    await bucket.file(path).delete({ ignoreNotFound: true });
    console.log('Invoice ' + invoiceId + ' filed for ' + invoice.locationName);
  } catch (err) {
    console.error('Invoice ' + invoiceId + ' could not be filed: ' + err.message);
    // The file stays in Storage, so nothing is lost and it can be retried.
    await ref.update({ driveError: err.message });
  }
  }
);

function digestHtml(groups, total) {
  const blocks = groups
    .map(
      (g) => `<tr><td style="padding-top:18px;">
<div style="font-family:${F};font-size:12px;font-weight:bold;color:#22D3EE;letter-spacing:0.4px;text-transform:uppercase;padding-bottom:6px;">${g.label}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${g.rows}</table>
</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0A0B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0B;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">
<tr><td style="font-family:${F};font-size:13px;color:#22D3EE;padding-bottom:16px;">CIG Executive Hub</td></tr>
<tr><td style="font-family:${F};font-size:19px;font-weight:bold;color:#FFFFFF;padding-bottom:4px;">Invoices waiting</td></tr>
<tr><td style="font-family:${F};font-size:13px;color:#6C6C76;">${total} outstanding, oldest due first within each restaurant.</td></tr>
${blocks}
<tr><td style="padding-top:26px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td bgcolor="#22D3EE" style="border-radius:8px;">
<a href="${WEB_URL}/invoices" style="display:inline-block;padding:11px 22px;font-family:${F};font-size:14px;font-weight:bold;color:#0A0A0B;text-decoration:none;">Open the list</a>
</td></tr></table></td></tr>
<tr><td style="font-family:${F};font-size:12px;line-height:18px;color:#6C6C76;padding-top:24px;">
Claiming one in the Hub tells the other person you are on it. Replies to this address are not read.
</td></tr>
</table></td></tr></table></body></html>`;
}

exports.sendInvoiceDigest = onSchedule(
  { schedule: '0 8 * * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'] },
  async () => {
    const db = admin.firestore();
    const snap = await db.collection('invoices').where('paidAt', '==', null).get();
    if (snap.empty) {
      console.log('No outstanding invoices.');
      return;
    }

    // Grouped by restaurant and location, oldest due first inside each - so
    // it reads the way someone would work through it.
    const byPlace = new Map();
    snap.docs.forEach((d) => {
      const x = d.data();
      const label = [x.brandName, x.locationName].filter(Boolean).join(' · ') || 'Not specified';
      if (!byPlace.has(label)) byPlace.set(label, []);
      byPlace.get(label).push(x);
    });

    const now = Date.now();
    const groups = [...byPlace.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, list]) => {
        const rows = list
          .sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity))
          .map((x) => {
            const overdue = x.dueDate && x.dueDate < now;
            const due = x.dueDate
              ? new Date(x.dueDate).toLocaleDateString('en-US', { timeZone: ZONE, month: 'short', day: 'numeric' })
              : 'no due date';
            const claimed = x.claimedByName ? ' &middot; ' + x.claimedByName + ' is on it' : '';
            return `<tr><td style="border-top:1px solid #232327;padding:9px 0;">
<div style="font-family:${F};font-size:14px;color:#FFFFFF;">${x.vendor || 'Invoice'} ${money(x.amountCents)}</div>
<div style="font-family:${F};font-size:12px;color:${overdue ? '#E8574B' : '#B4B4BB'};">${overdue ? 'Overdue &middot; due ' : 'Due '}${due}${claimed}</div>
</td></tr>`;
          })
          .join('');
        return { label, rows };
      });

    const people = (await everyone()).filter(
      (u) => u.email && (u.role === 'admin' || u.job === 'Financials' || u.job === 'Owner')
    );

    const resend = new Resend(process.env.RESEND_API_KEY);
    let sent = 0;
    for (const person of people) {
      if ((person.notifyEmail ?? 'default') === 'none') continue;
      try {
        await resend.emails.send({
          from: FROM,
          to: [person.email],
          subject: `Invoices waiting — ${snap.size}`,
          html: digestHtml(groups, snap.size),
        });
        sent++;
      } catch (err) {
        console.error('Invoice digest to ' + person.email + ' failed: ' + err.message);
      }
    }
    console.log('Invoice digest sent to ' + sent + '.');
  }
);
