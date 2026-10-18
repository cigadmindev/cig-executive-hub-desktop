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
const { PDFDocument } = require('pdf-lib');
const { requireLive } = require('./caller');
const { workOrderPath } = require('./documentUrls');

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
// Drawn in the CIG Concepts acknowledgement style (18 Oct 2026): a row per
// signer with their signature, name and when they signed.
async function embedSignatures(originalPdfBytes, title, signatures) {
  const { CigDoc, LEFT, RIGHT } = require('./cigPdf');
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const d = await CigDoc.create({ eyebrow: 'CIG Concepts', title: 'Signature Record', category: 'Signed Document', pdf: pdfDoc });
  d.header('Everyone below signed "' + String(title ?? '') + '" in the CIG Executive Hub. Each signature was drawn by the person named, on the date and time shown.');
  d.y -= 4;
  d.label('Signatures', (signatures ?? []).length + ' of ' + (signatures ?? []).length + ' signed');
  for (const sig of signatures ?? []) {
    d.need(78);
    const top = d.y - 8;
    d.badge(LEFT, top, 'sign', 21);
    d.text(sig.name ?? '', { x: LEFT + 30, y: top - 9, size: 9, font: 'bold' });
    d.text('Signed ' + new Date(sig.signedAt).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }), { x: LEFT + 30, y: top - 21, size: 7.2, font: 'light' });
    const sx = (LEFT + RIGHT) / 2, sw = RIGHT - sx;
    if (sig.signatureImageDataUrl) {
      try {
        const img = await pdfDoc.embedPng(dataUrlToBytes(sig.signatureImageDataUrl));
        const dims = img.scaleToFit(sw - 10, 46);
        d.page.drawImage(img, { x: sx + 4, y: top - 50, width: dims.width, height: dims.height });
      } catch {
        // A malformed signature image should not take the whole document
        // down - the name and timestamp still record that they signed.
      }
    }
    d.y = top - 54;
    d.field(sx, RIGHT, 'Signature', '');
    d.y -= 12;
    d.rule();
    d.y -= 2;
  }
  return d.save();
}

exports.assembleSignedDocument = onCall({ timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  await requireLive(request);
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

  // Only once everyone has signed - the server checks, not the button.
  const signedUids = new Set((order.signatures ?? []).map((s) => s.uid));
  if (!(order.assignedUids ?? []).length || !(order.assignedUids ?? []).every((u) => signedUids.has(u))) {
    throw new HttpsError('failed-precondition', 'Not everyone has signed yet.');
  }

  const bucket = admin.storage().bucket();

  // Worked out and checked here - a path outside this document's own folder
  // is refused (S2).
  const originalPath = workOrderPath(String(orderId), order, 'original');
  if (!originalPath) throw new HttpsError('failed-precondition', 'The original document is missing.');

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
