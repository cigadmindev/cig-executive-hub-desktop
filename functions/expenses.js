// Expense receipts — submission, image access, and cleanup.
//
// Three things live here because they share one rule: a submitted receipt is a
// financial record, not a form. It is written by the server so the client
// cannot decide its own deadline, its images are unreadable without a
// server-side permission check, and nothing is ever deleted — only voided, or
// aged out image-side after 90 days.
const { onCall, HttpsError } = require('firebase-functions/https');
const admin = require('firebase-admin');

const COLLECTION = 'expenseReceipts';

// The nine categories. Kept as stable keys with the label separate, the same
// way checklist items work — renaming a label later must not orphan every
// receipt filed under it.
const CATEGORIES = {
  airfareTravel: 'Airfare / Travel',
  lodging: 'Lodging',
  meals: 'Meals',
  groundTransport: 'Ground Transport',
  mileage: 'Mileage',
  conferenceEvents: 'Conference & Events',
  supplies: 'Supplies',
  entertainment: 'Entertainment',
  other: 'Other',
};

// Everything about this feature is anchored to Central time, so that two people
// in different states see the same deadline and the same daily boundary.
const ZONE = 'America/Chicago';

// Formats a moment as YYYY-MM-DD *as seen in Central*, regardless of where the
// server or the caller happens to be.
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

// The exact instant that 23:59:59.999 Central falls on a given Central date.
//
// Computed rather than assumed: the offset is -5 or -6 depending on daylight
// saving, and hardcoding either breaks twice a year. This finds the real offset
// for that specific date by asking what time it is in Central versus UTC.
function endOfCentralDay(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  // Start from the naive UTC midnight of the following day, then walk back.
  const guess = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  // What does that instant read as in Central? The difference is the offset.
  const asCentral = new Date(
    new Date(guess).toLocaleString('en-US', { timeZone: ZONE })
  );
  const asUtc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = asUtc.getTime() - asCentral.getTime();
  return guess + offsetMs;
}

async function callerProfile(uid) {
  const doc = await admin.firestore().collection('users').doc(uid).get();
  if (!doc.exists) throw new HttpsError('permission-denied', 'No profile found for this account.');
  return doc.data();
}

function canSeeEverything(profile) {
  return profile.role === 'admin' || profile.job === 'Financials';
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------
//
// The client uploads its image to Storage first — the rules there already
// restrict a person to their own path — then calls this with the details. The
// record is written here rather than by the client for three reasons:
//
//   1. editableUntil has to come from the server clock. A phone set to another
//      timezone would otherwise grant itself a different deadline.
//   2. Every field is validated somewhere the caller cannot skip.
//   3. submittedByUid is taken from the auth token, not the request body, so a
//      receipt cannot be filed in someone else's name.
exports.submitExpenseReceipt = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const uid = request.auth.uid;
  const profile = await callerProfile(uid);

  const { amountCents, categoryKey, where, dateSpent, reason, storagePath } = request.data || {};

  // Amount. Held as integer cents so report totals cannot drift by rounding;
  // the client types and sees 214.77 and converts on the way in.
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new HttpsError('invalid-argument', 'Enter an amount greater than zero.');
  }
  if (amountCents > 100000000) {
    throw new HttpsError('invalid-argument', 'That amount looks wrong — over $1,000,000.');
  }

  if (!CATEGORIES[categoryKey]) {
    throw new HttpsError('invalid-argument', 'Choose a category.');
  }

  const whereTrimmed = String(where ?? '').trim();
  if (whereTrimmed.length < 2) throw new HttpsError('invalid-argument', 'Enter where this was spent.');
  if (whereTrimmed.length > 120) throw new HttpsError('invalid-argument', 'That location is too long.');

  const reasonTrimmed = String(reason ?? '').trim();
  if (reasonTrimmed.length < 2) throw new HttpsError('invalid-argument', 'Enter a reason.');
  if (reasonTrimmed.length > 500) throw new HttpsError('invalid-argument', 'That reason is too long.');

  // Date spent is when the money left, which is not necessarily today. A
  // future date is a mistake: a flight booked today for next month was paid
  // today. Compared in Central so the boundary is the same for everyone.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateSpent ?? ''))) {
    throw new HttpsError('invalid-argument', 'Choose the date this was spent.');
  }
  const todayKey = centralDateKey(new Date());
  if (dateSpent > todayKey) {
    throw new HttpsError('invalid-argument', "That date is in the future — use the day the money was spent.");
  }

  // The image must live under this person's own folder. Belt and braces: the
  // Storage rules enforce the same thing, but a mismatch here would mean a
  // record pointing at a file its owner cannot be verified against.
  const expectedPrefix = `receipts/${uid}/`;
  if (typeof storagePath !== 'string' || !storagePath.startsWith(expectedPrefix)) {
    throw new HttpsError('invalid-argument', 'The receipt photo is missing.');
  }

  const [exists] = await admin.storage().bucket().file(storagePath).exists();
  if (!exists) {
    throw new HttpsError('failed-precondition', 'The receipt photo did not finish uploading. Try again.');
  }

  const now = Date.now();
  // The cutoff belongs to the day it was *submitted*, not the day it was
  // spent — someone entering a two-week-old receipt still gets today to fix a
  // typo. Stored as a fixed instant so the security rule can compare it
  // without knowing anything about timezones.
  const editableUntil = endOfCentralDay(centralDateKey(new Date(now)));

  const ref = admin.firestore().collection(COLLECTION).doc();
  await ref.set({
    submittedByUid: uid,
    submittedByName: profile.name ?? 'Unknown',
    amountCents,
    categoryKey,
    categoryLabel: CATEGORIES[categoryKey],
    where: whereTrimmed,
    reason: reasonTrimmed,
    dateSpent,                       // YYYY-MM-DD, Central. The accounting date.
    submittedAt: now,
    submittedDateKey: centralDateKey(new Date(now)),
    editableUntil,
    storagePath,
    imageDeletedAt: null,            // set by the 90-day sweep
    voided: false,
    voidedBy: null,
    voidedReason: null,
  });

  return { id: ref.id, editableUntil };
});

// ---------------------------------------------------------------------------
// Signed image URLs
// ---------------------------------------------------------------------------
//
// Storage denies reads to every client, so this is the only way to see a
// receipt image. The check that Storage rules cannot make — is this person the
// owner, an admin, or finance — happens here, where Firestore is reachable.
//
// Takes a batch of ids rather than one: a page of twenty receipts should be one
// round trip, not twenty.
//
// Deployment note: this needs the function's service account to hold
// iam.serviceAccountTokenCreator on itself. It is not granted by default on v2
// functions, and without it getSignedUrl fails at runtime with a message that
// does not mention the missing role.
exports.getReceiptUrls = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const uid = request.auth.uid;
  const profile = await callerProfile(uid);
  const seesAll = canSeeEverything(profile);

  const ids = Array.isArray(request.data?.ids) ? request.data.ids.slice(0, 100) : [];
  if (ids.length === 0) return { urls: {} };

  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const docs = await db.getAll(...ids.map((id) => db.collection(COLLECTION).doc(id)));

  // Fifteen minutes: long enough to look through a page of receipts, short
  // enough that a copied link is not a lasting hole.
  const expires = Date.now() + 15 * 60 * 1000;
  const urls = {};

  for (const doc of docs) {
    if (!doc.exists) continue;
    const r = doc.data();
    if (!seesAll && r.submittedByUid !== uid) continue;   // silent — no leak of what exists
    if (!r.storagePath || r.imageDeletedAt) continue;     // swept, or never had one

    try {
      const [url] = await bucket.file(r.storagePath).getSignedUrl({ action: 'read', expires });
      urls[doc.id] = url;
    } catch (err) {
      // One unreadable file should not fail the whole page.
      console.error(`Signed URL failed for ${doc.id}: ${err.message}`);
    }
  }

  return { urls };
});

// Receipt photos are deleted nightly by closeExpenseDay, once the day's
// report exists. A 90-day sweep used to do it and is gone - it could only
// ever find images the nightly close had already removed.

exports.EXPENSE_CATEGORIES = CATEGORIES;
