// Assembling the signed document, server-side.
//
// This used to run in the browser of whoever signed last: download the
// original, embed the signatures, upload the result. Two problems with that.
//
// It depended on that person's session surviving the whole operation - a
// dropped connection left the document stuck until someone pressed retry.
//
// And it needed the browser to read the original from Storage, which meant
// Storage had to allow reads to any signed-in user. That is what made every
// signed contract in the system readable by anyone with a login.
//
// Here it runs with the Admin SDK, which ignores Storage rules, so the rules
// can be closed.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const COLLECTION = 'workOrders';

// pdf-lib's built-in fonts cannot encode every Unicode character, and a stray
// one - most often a narrow no-break space from toLocaleString's AM/PM - was
// enough to fail generation entirely.
function sanitizeForPdf(text) {
  return String(text ?? '')
    .replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x00-\xFF]/g, '?');
}

// atob is a browser function; Node has Buffer.
function dataUrlToBytes(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] ?? '';
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

// A dedicated signature page appended at the end, rather than drawing over
// whatever is on the last page - which could land on top of real content.
async function embedSignatures(originalPdfBytes, title, signatures) {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();

  page.drawText('Signature Record', { x: 50, y: height - 60, size: 16, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(sanitizeForPdf(title), { x: 50, y: height - 82, size: 11, font, color: rgb(0.35, 0.35, 0.35) });

  let y = height - 140;
  const rowHeight = 130;

  for (const sig of signatures ?? []) {
    if (y < 140) break;

    let cursorY = y;

    if (sig.signatureImageDataUrl) {
      try {
        const pngImage = await pdfDoc.embedPng(dataUrlToBytes(sig.signatureImageDataUrl));
        const imgDims = pngImage.scaleToFit(180, 50);
        // drawImage's y is the bottom-left corner and the image grows upward,
        // so this puts its top at cursorY and lets it fill downward.
        page.drawImage(pngImage, {
          x: 50,
          y: cursorY - imgDims.height,
          width: imgDims.width,
          height: imgDims.height,
        });
        cursorY -= imgDims.height + 10;
      } catch {
        // A malformed signature image should not take the whole document
        // down - the name and timestamp below still record that they signed.
      }
    }

    page.drawText(sanitizeForPdf(sig.name), { x: 50, y: cursorY - 12, size: 11, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(sanitizeForPdf('Signed ' + new Date(sig.signedAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })), {
      x: 50,
      y: cursorY - 28,
      size: 9,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
    page.drawLine({
      start: { x: 50, y: cursorY - 38 },
      end: { x: width - 50, y: cursorY - 38 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });

    y -= rowHeight;
  }

  return pdfDoc.save();
}

exports.assembleSignedDocument = onCall({ timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const { orderId } = request.data || {};
  if (!orderId) throw new HttpsError('invalid-argument', 'Which document?');

  const db = admin.firestore();
  const ref = db.collection(COLLECTION).doc(String(orderId));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That document no longer exists.');

  const order = snap.data();

  // Only someone involved can trigger assembly. The last signer normally
  // does, but the sender retrying is legitimate too.
  const uid = request.auth.uid;
  const involved = (order.assignedUids ?? []).includes(uid) || order.uploadedByUid === uid;
  if (!involved) {
    const profile = await db.collection('users').doc(uid).get();
    if (!profile.exists || profile.data().role !== 'admin') {
      throw new HttpsError('permission-denied', 'This document is not yours to assemble.');
    }
  }

  if (!order.originalPath && !order.originalFileUrl) {
    throw new HttpsError('failed-precondition', 'The original document is missing.');
  }

  const bucket = admin.storage().bucket();

  // Path is the new shape; a stored URL is the old one, kept working until
  // the migration has run everywhere.
  const originalPath =
    order.originalPath ??
    decodeURIComponent(String(order.originalFileUrl).split('/o/')[1]?.split('?')[0] ?? '');

  if (!originalPath) throw new HttpsError('failed-precondition', 'The original could not be located.');

  try {
    const [originalBytes] = await bucket.file(originalPath).download();
    const signedBytes = await embedSignatures(originalBytes, order.title, order.signatures);

    const signedPath = `workOrders/${orderId}/signed.pdf`;
    await bucket.file(signedPath).save(Buffer.from(signedBytes), { contentType: 'application/pdf' });

    // The path, not a download URL. A Firebase download URL carries a token
    // and works for anyone holding it regardless of Storage rules - storing
    // one on a record any signed-in person can read is what made these
    // documents readable by everyone.
    await ref.update({ signedPath, signedFileUrl: null, signedPdfError: null });

    return { ok: true };
  } catch (err) {
    // Written onto the record so the sender sees the real reason rather than
    // a permanent "putting it together" with no explanation.
    await ref.update({
      signedPdfError: err.message || 'Something went wrong generating the signed document.',
    });
    throw new HttpsError('internal', err.message || 'Could not assemble the document.');
  }
});
