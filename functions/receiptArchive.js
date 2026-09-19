// A month's receipt photos, zipped, alongside the monthly report.
//
// Photos age out after ninety days. This goes out on the first of the month
// covering the month just ended, so finance has the images sixty days before
// anything is removed - rather than a zip arriving at the ninety-day mark,
// when nobody is thinking about it and missing it means losing them.
//
// Stored next to the CSV and collected the same way, through a signed URL
// that checks the caller is an admin or holds the Financials job. Not emailed:
// a month of photos would exceed what an email will carry.
const admin = require('firebase-admin');
const archiver = require('archiver');
const { PassThrough } = require('stream');

const ZONE = 'America/Chicago';

// 2026-09-14_Michele_142.77_Marriott-Birmingham.jpg
//
// Date first so they sort chronologically in any file browser, then who
// submitted it, the amount, and where - readable without opening anything.
function nameFor(r, index) {
  const safe = (v) =>
    String(v ?? '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40);

  const ext = (r.storagePath ?? '').split('.').pop()?.toLowerCase() || 'jpg';
  const amount = ((r.amountCents ?? 0) / 100).toFixed(2);

  // The index keeps two receipts from the same person, day and place from
  // colliding inside the zip.
  return [
    r.dateSpent ?? 'undated',
    safe(r.submittedByName),
    amount,
    safe(r.where),
    String(index + 1).padStart(3, '0'),
  ].join('_') + '.' + ext;
}

/**
 * Builds the zip and returns its storage path, or null when the month had no
 * photos worth archiving.
 */
async function buildReceiptArchive(receipts, monthKey) {
  const bucket = admin.storage().bucket();

  const withPhotos = receipts.filter((r) => r.storagePath && !r.imageDeletedAt && !r.voided);
  if (withPhotos.length === 0) return null;

  const path = `expenseReports/${monthKey}-receipts.zip`;
  const file = bucket.file(path);

  const passthrough = new PassThrough();
  const upload = file.createWriteStream({ contentType: 'application/zip' });
  passthrough.pipe(upload);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(passthrough);

  let added = 0;

  for (let i = 0; i < withPhotos.length; i++) {
    const r = withPhotos[i];
    try {
      const [bytes] = await bucket.file(r.storagePath).download();
      archive.append(bytes, { name: nameFor(r, i) });
      added++;
    } catch (err) {
      // One unreadable photo should not cost the whole archive.
      console.error('Receipt photo skipped: ' + r.storagePath + ' - ' + err.message);
    }
  }

  if (added === 0) {
    archive.abort();
    return null;
  }

  await archive.finalize();
  await new Promise((resolve, reject) => {
    upload.on('finish', resolve);
    upload.on('error', reject);
  });

  console.log('Archived ' + added + ' receipt photo(s) for ' + monthKey + '.');
  return path;
}

module.exports = { buildReceiptArchive };
