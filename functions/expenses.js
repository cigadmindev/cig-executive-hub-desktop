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
const { loadPeriods, assignPeriod, isOpenOn } = require('./fiscal');
const { requireLive } = require('./caller');
const { EXEC_CATEGORIES, levelOf } = require('./expenseAccounts');

const ACCOUNTS = 'expenseAccounts';
const REPORTS = 'expenseReports';

// The nine old categories. Receipts are now filed under Sam's accounts (9 Oct
// 2026); these stay so receipts filed before then keep their label, and so a
// browser still running the old page can file a receipt - it arrives "not
// coded yet" for Finance to give it an account.
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

// The COO sees the restaurants' and Catering & Events' receipts - never
// another executive's (Brenner, 10 Oct). Everyone else sees only their own.
function seesStoreReceipts(profile) {
  return profile.job === 'COO';
}

// ---------------------------------------------------------------------------
// Shared checks - the same rules for a new receipt and an edited one
// ---------------------------------------------------------------------------

// The account it was for: one of Sam's, still open. Name and heading are read
// here, never taken from the caller.
async function resolveAccount(db, code) {
  const c = String(code ?? '').trim();
  if (!c || c.includes('/')) throw new HttpsError('invalid-argument', 'Choose what it was for.');
  const snap = await db.collection(ACCOUNTS).doc(c).get();
  if (!snap.exists || snap.data().retired) {
    throw new HttpsError('invalid-argument', 'That account is no longer open. Choose another.');
  }
  const a = snap.data();
  return { accountCode: snap.id, accountName: a.name, accountHeading: a.heading ?? '' };
}

// Which location it goes with: Corporate unless one of the Hub's own
// locations is picked (Brenner, 9 Oct). The name is built here.
const BRAND_NAMES = {
  taste: 'Taste Italian Kitchen',
  blutos: 'Blutos Greek Tavern',
  heritage: 'Heritage Chophouse',
  pronto: 'Pronto Gusto',
  stellas: 'Sunnyside Social',
  cajun: 'Cajun Depot',
};
const STATIC_LOCATIONS = {
  'taste-starkville': ['taste', 'Starkville'],
  'taste-ridgeland': ['taste', 'Ridgeland'],
  'blutos-starkville': ['blutos', 'Starkville'],
  'heritage-starkville': ['heritage', 'Starkville'],
};
// Opening or operating, for Sam (Brenner, 10 Oct): a location is opening
// until its opening date passes. One with no opening date is operating if it
// is one of the original four, opening if it was added in the Hub (a new
// restaurant whose date isn't set yet). Decided when the receipt is filed,
// so a receipt keeps the stage it was spent in after the restaurant opens.
async function stageOf(db, id) {
  const info = await db.collection('openingLocationInfo').doc(id).get();
  const openingDate = info.exists ? info.data().openingDate : null;
  if (typeof openingDate === 'number') return openingDate > Date.now() ? 'opening' : 'operating';
  return STATIC_LOCATIONS[id] ? 'operating' : 'opening';
}

async function resolveLocation(db, locationId, current = null) {
  const id = String(locationId ?? '').trim();
  // Editing a receipt filed before 9 Oct under the old charge-to list
  // ("General", "Events"…): left as it was unless a location is picked.
  if (id === 'keep' && current) {
    return { locationId: current.locationId ?? null, chargeToId: current.chargeToId ?? null, chargeToName: current.chargeToName ?? 'Corporate', locationStage: current.locationStage ?? null };
  }
  if (!id || id === 'corporate') return { locationId: null, chargeToId: null, chargeToName: 'Corporate', locationStage: null };
  // The same location as before keeps the stage it was filed with.
  if (current && current.locationId === id && current.locationStage) {
    return { locationId: id, chargeToId: null, chargeToName: current.chargeToName, locationStage: current.locationStage };
  }
  let brandId = null;
  let name = null;
  if (STATIC_LOCATIONS[id]) {
    [brandId, name] = STATIC_LOCATIONS[id];
  } else if (!id.includes('/')) {
    const snap = await db.collection('customLocations').doc(id).get();
    if (snap.exists) {
      brandId = snap.data().brandId ?? null;
      name = snap.data().name ?? null;
    }
  }
  if (!name) throw new HttpsError('invalid-argument', 'That location is no longer in the Hub. Pick another, or Corporate.');
  const label = (BRAND_NAMES[brandId] ? BRAND_NAMES[brandId] + ' · ' : '') + name;
  return { locationId: id, chargeToId: null, chargeToName: label, locationStage: await stageOf(db, id) };
}

// What it was for. Executives pick one of Mark's six, which files under
// Sam's account for it; store managers pick the account itself (10 Oct).
// On an edit, keeping the same choice keeps whatever account Finance gave it.
async function resolveFor(db, { execCategory, accountCode }, current = null) {
  if (execCategory) {
    const cat = EXEC_CATEGORIES[execCategory];
    if (!cat) throw new HttpsError('invalid-argument', 'Choose what it was for.');
    if (current && current.execCategory === execCategory && current.accountCode) {
      return { accountCode: current.accountCode, accountName: current.accountName, accountHeading: current.accountHeading ?? '', execCategory, execCategoryLabel: cat.label };
    }
    return { ...(await resolveAccount(db, cat.account)), execCategory, execCategoryLabel: cat.label };
  }
  if (accountCode) {
    if (current && current.accountCode === accountCode) {
      return { accountCode, accountName: current.accountName, accountHeading: current.accountHeading ?? '', execCategory: null, execCategoryLabel: null };
    }
    return { ...(await resolveAccount(db, accountCode)), execCategory: null, execCategoryLabel: null };
  }
  return null;
}

// Amount, where and why - the same rules everywhere. There is no date to
// check: a receipt is dated the day it is filed (Brenner, 10 Oct).
function checkDetails({ amountCents, where, reason }) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new HttpsError('invalid-argument', 'Enter an amount greater than zero.');
  }
  if (amountCents > 100000000) {
    throw new HttpsError('invalid-argument', 'That amount looks wrong — over $1,000,000.');
  }
  const whereTrimmed = String(where ?? '').trim();
  if (whereTrimmed.length < 2) throw new HttpsError('invalid-argument', 'Enter where this was spent.');
  if (whereTrimmed.length > 120) throw new HttpsError('invalid-argument', 'That location is too long.');
  const reasonTrimmed = String(reason ?? '').trim();
  if (reasonTrimmed.length < 2) throw new HttpsError('invalid-argument', 'Enter a reason.');
  if (reasonTrimmed.length > 500) throw new HttpsError('invalid-argument', 'That reason is too long.');
  return { where: whereTrimmed, reason: reasonTrimmed };
}

// Is this receipt's period still open to its owner? Until the period's
// report is made - the Saturday after its catch-up week - the person who
// filed it can still change or void it (Brenner, 9 Oct). Both locks are
// checked: the calendar (the window has not ended) and the report itself
// (not made yet), so a period whose report was swept after ninety days, or
// one from before period reports, can't be reopened.
async function reportMade(db, periodId) {
  if (!periodId) return false;
  return (await db.collection(REPORTS).doc(periodId).get()).exists;
}
async function stillOpen(db, periodId) {
  if (!periodId) return false;
  const p = await db.collection('fiscalPeriods').doc(periodId).get();
  if (!p.exists || !isOpenOn(p.data(), centralDateKey(new Date()))) return false;
  return !(await reportMade(db, periodId));
}
const receiptRef = (db, id) => {
  const s = String(id ?? '');
  if (!s || s.includes('/')) throw new HttpsError('invalid-argument', 'Which receipt?');
  return db.collection(COLLECTION).doc(s);
};

// A report already made no longer matches once a receipt in it changes. Say
// so on the report, the same way moving a receipt does.
async function flagReport(db, periodId, receiptId) {
  if (!periodId) return;
  const ref = db.collection(REPORTS).doc(periodId);
  const rep = await ref.get();
  if (!rep.exists) return;
  await ref.update({
    changedReceiptIds: admin.firestore.FieldValue.arrayUnion(receiptId),
    staleSince: rep.data().staleSince ?? Date.now(),
  });
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
exports.submitExpenseReceipt = onCall({ secrets: ['RESEND_API_KEY'] }, async (request) => {
  await requireLive(request);
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const uid = request.auth.uid;
  const profile = await callerProfile(uid);

  const { amountCents, execCategory, accountCode, locationId, categoryKey, where, reason, storagePath } = request.data || {};

  // Amount is held as integer cents so report totals cannot drift by
  // rounding. The date is today in Central - the day it was filed - whatever
  // the device says (Brenner, 10 Oct: no "date spent").
  const details = checkDetails({ amountCents, where, reason });
  const todayKey = centralDateKey(new Date());
  const dateSpent = todayKey;
  const db = admin.firestore();

  // What it was for: one of Mark's six or one of Sam's accounts. A browser
  // still running a much older page sends a category instead; that receipt
  // is kept, "not coded yet".
  let account = await resolveFor(db, { execCategory, accountCode });
  if (!account) {
    if (!CATEGORIES[categoryKey]) throw new HttpsError('invalid-argument', 'Choose what it was for.');
    account = { accountCode: null, accountName: null, accountHeading: null, execCategory: null, execCategoryLabel: null };
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

  // Which location it goes with: Corporate unless one is picked.
  const place = await resolveLocation(db, locationId);

  // Which fiscal period it belongs to - decided here, on the server's clock,
  // so a device cannot put a receipt into a period that has shut.
  const periods = await loadPeriods(db);
  const period = assignPeriod(periods, dateSpent, todayKey);
  if (!period) {
    throw new HttpsError(
      'failed-precondition',
      "Today is outside the fiscal calendar loaded in the Hub, so receipts can't be filed. Let finance know."
    );
  }

  const now = Date.now();
  // The cutoff belongs to the day it was *submitted*, not the day it was
  // spent — someone entering a two-week-old receipt still gets today to fix a
  // typo. Stored as a fixed instant so the security rule can compare it
  // without knowing anything about timezones.
  const editableUntil = endOfCentralDay(centralDateKey(new Date(now)));

  const ref = db.collection(COLLECTION).doc();
  await ref.set({
    submittedByUid: uid,
    submittedByName: profile.name ?? 'Unknown',
    amountCents,
    ...account,                      // accountCode / accountName / accountHeading / execCategory / execCategoryLabel
    // Executive or store - who gets to see it besides the owner and Finance.
    // Taken from the profile, never the request.
    submitterLevel: levelOf(profile),
    categoryKey: account.accountCode ? null : categoryKey,
    categoryLabel: account.accountCode ? null : CATEGORIES[categoryKey],
    where: details.where,
    reason: details.reason,
    dateSpent,                       // YYYY-MM-DD, Central - the day it was filed. The accounting date.
    ...place,                        // locationId / chargeToId / chargeToName / locationStage, resolved above
    periodId: period.id,             // the fiscal period - see fiscal.js
    periodLabel: period.label,
    submittedAt: now,
    submittedDateKey: centralDateKey(new Date(now)),
    editableUntil,
    storagePath,
    imageDeletedAt: null,            // set by the 90-day sweep
    voided: false,
    voidedBy: null,
    voidedReason: null,
  });

  return { id: ref.id, editableUntil, periodId: period.id, periodLabel: period.label };
});

// ---------------------------------------------------------------------------
// Change your own receipt, until its period's report is made
// ---------------------------------------------------------------------------
exports.editExpenseReceipt = onCall(async (request) => {
  const me = await requireLive(request);
  const db = admin.firestore();
  const { receiptId, amountCents, execCategory, accountCode, locationId, where, reason } = request.data || {};
  const ref = receiptRef(db, receiptId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That receipt no longer exists.');
  const r = snap.data();
  if (r.submittedByUid !== me.uid) throw new HttpsError('permission-denied', 'Only the person who filed it can change it.');
  if (r.voided) throw new HttpsError('failed-precondition', 'That receipt was voided.');
  if (!(await stillOpen(db, r.periodId))) {
    throw new HttpsError('failed-precondition', "This period has closed. Ask Finance to change it.");
  }

  // The date and period never change on an edit - a receipt is dated the
  // day it was filed. Choosing nothing new keeps what it was for.
  const details = checkDetails({ amountCents, where, reason });
  const account = await resolveFor(db, { execCategory, accountCode }, r);
  if (!account && !r.accountCode) throw new HttpsError('invalid-argument', 'Choose what it was for.');
  const place = await resolveLocation(db, locationId, r);

  const update = {
    amountCents,
    ...(account ?? {}),
    ...(account ? { categoryKey: null, categoryLabel: null } : {}),
    where: details.where,
    reason: details.reason,
    ...place,
    editedAt: Date.now(),
  };
  const changed = Object.keys(update).filter((k) => k !== 'editedAt' && JSON.stringify(update[k] ?? null) !== JSON.stringify(r[k] ?? null));
  if (changed.length === 0) return { ok: true, unchanged: true };
  update.editHistory = admin.firestore.FieldValue.arrayUnion({ at: update.editedAt, byName: me.name ?? 'Unknown', fields: changed });
  await ref.update(update);
  return { ok: true, periodLabel: r.periodLabel };
});

// ---------------------------------------------------------------------------
// Void a receipt: yours until the report is made; Finance and admins any time
// ---------------------------------------------------------------------------
exports.voidExpenseReceipt = onCall(async (request) => {
  const me = await requireLive(request);
  const db = admin.firestore();
  const reason = String(request.data?.reason ?? '').trim();
  if (reason.length < 2) throw new HttpsError('invalid-argument', 'Say why it is being voided.');
  if (reason.length > 300) throw new HttpsError('invalid-argument', 'That reason is too long.');
  const ref = receiptRef(db, request.data?.receiptId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That receipt no longer exists.');
  const r = snap.data();
  if (r.voided) return { ok: true, unchanged: true };
  const made = await reportMade(db, r.periodId);
  const finance = canSeeEverything(me);
  if (!finance) {
    if (r.submittedByUid !== me.uid) throw new HttpsError('permission-denied', 'Only the person who filed it can void it.');
    if (!(await stillOpen(db, r.periodId))) throw new HttpsError('failed-precondition', 'This period has closed. Ask Finance to void it.');
  }
  await ref.update({ voided: true, voidedBy: me.name ?? 'Unknown', voidedByUid: me.uid, voidedAt: Date.now(), voidedReason: reason });
  // Voided after the report went out: the report no longer matches.
  if (made) await flagReport(db, r.periodId, ref.id);
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Finance (and admins) give a receipt its account - never its amount
// ---------------------------------------------------------------------------
exports.recodeExpenseReceipt = onCall(async (request) => {
  const me = await requireLive(request);
  if (!canSeeEverything(me)) throw new HttpsError('permission-denied', 'Only Finance can change a receipt\'s account.');
  const db = admin.firestore();
  const ref = receiptRef(db, request.data?.receiptId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That receipt no longer exists.');
  const r = snap.data();
  const account = await resolveAccount(db, request.data?.accountCode);
  if (account.accountCode === r.accountCode) return { ok: true, unchanged: true };
  await ref.update({
    ...account,
    recodes: admin.firestore.FieldValue.arrayUnion({
      at: Date.now(),
      byName: me.name ?? 'Finance',
      from: r.accountCode ? r.accountCode + ' ' + (r.accountName ?? '') : 'not coded (' + (r.categoryLabel ?? '—') + ')',
      to: account.accountCode + ' ' + account.accountName,
    }),
  });
  await flagReport(db, r.periodId, ref.id);
  return { ok: true };
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
  await requireLive(request);
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const uid = request.auth.uid;
  const profile = await callerProfile(uid);
  const seesAll = canSeeEverything(profile);
  const seesStores = seesStoreReceipts(profile);

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
    // Silent - no leak of what exists. The same three tiers as the rules:
    // your own, the COO for store receipts, Finance and admins for all.
    const allowed = seesAll || r.submittedByUid === uid || (seesStores && r.submitterLevel === 'store');
    if (!allowed) continue;
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

// Receipt photos age out at ninety days in sweepReceiptPhotos. Each period's
// go to finance as a zip with the period report.

exports.EXPENSE_CATEGORIES = CATEGORIES;
