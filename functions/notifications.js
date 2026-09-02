// Push notifications for everything that raises a red dot in the app.
//
// One notification per base-level item, not one per dot along the path to it.
// A post inside a category inside a location dots all three on the way down;
// it sends one notification, about the post.
//
// Everyone only hears about things they can actually open. Sending someone to
// a screen they have no access to is worse than saying nothing.
//
// Opening checklist items are deliberately excluded: people working a
// checklist are in it daily, and a notification per item would be noise.
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// The static locations, as a location-to-brand map. Safe to keep here rather
// than share with the app: brands do not change - the group opens new
// locations under these five, not new restaurants. Custom locations are added
// through the app and carry their own brandId in Firestore, read below.
const STATIC_LOCATION_BRAND = {
  'taste-starkville': 'taste',
  'taste-ridgeland': 'taste',
  'blutos-starkville': 'blutos',
  'heritage-starkville': 'heritage',
};
const BRAND_IDS = ['taste', 'blutos', 'heritage', 'pronto', 'stellas'];

// Same shape as chatAndEventPush's sender, plus a data payload so tapping the
// notification can open the thing it is about rather than just the app.
async function push(tokens, title, body, data = {}) {
  const valid = tokens.filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken'));
  if (valid.length === 0) return;

  const messages = valid.map((to) => ({ to, title, body, sound: 'default', data }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    const result = await res.json();
    console.log(`push "${title}" to ${valid.length}`, JSON.stringify(result?.data?.slice?.(0, 3) ?? result));
  } catch (err) {
    console.error(`push "${title}" failed: ${err.message}`);
  }
}

async function activeUsers() {
  const snap = await admin.firestore().collection('users').get();
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((u) => u.active !== false && u.pushToken);
}

// Resolves any location to its brand: the static four from the map above, and
// admin-added ones from Firestore, which store brandId when created.
async function brandForLocation(locationId) {
  if (!locationId) return null;
  if (STATIC_LOCATION_BRAND[locationId]) return STATIC_LOCATION_BRAND[locationId];
  const snap = await admin.firestore().collection('customLocations').doc(locationId).get();
  return snap.exists ? snap.data().brandId ?? null : null;
}

// A brand post's targetId is a brand, a location, or 'all'.
async function brandForTarget(targetId) {
  if (!targetId || targetId === 'all') return null;
  if (BRAND_IDS.includes(targetId)) return targetId;
  return brandForLocation(targetId);
}

// The server's copy of hasBrandAccess. Admins and executives see every brand;
// a manager sees the ones granted to them. A null brand means everyone.
function canSee(user, brandId) {
  if (!brandId) return true;
  if (user.role === 'admin' || user.role === 'executive') return true;
  return (user.permissions?.brandIds ?? []).includes(brandId);
}

const isReviewer = (u) => u.role === 'admin' || u.role === 'executive';
const isFinance = (u) => u.role === 'admin' || u.job === 'Financials';

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------
exports.onBrandPostCreated = onDocumentCreated('brandPosts/{id}', async (event) => {
  const post = event.data?.data();
  if (!post) return;

  const brandId = await brandForTarget(post.targetId);
  const users = await activeUsers();
  const tokens = users
    .filter((u) => u.uid !== post.authorUid && canSee(u, brandId))
    .map((u) => u.pushToken);

  await push(
    tokens,
    post.targetName ? `New post — ${post.targetName}` : 'New post',
    `${post.authorName ?? 'Someone'}: ${(post.message ?? '').slice(0, 90)}`,
    { kind: 'brandPost', brandId }
  );
});

exports.onCategoryPostCreated = onDocumentCreated('categoryPosts/{id}', async (event) => {
  const post = event.data?.data();
  if (!post) return;

  const brandId = await brandForLocation(post.locationId);
  const users = await activeUsers();
  const tokens = users
    .filter((u) => u.uid !== post.authorUid && canSee(u, brandId))
    .map((u) => u.pushToken);

  await push(
    tokens,
    post.categoryLabel ? `New post — ${post.categoryLabel}` : 'New post',
    `${post.authorName ?? 'Someone'}: ${(post.message ?? '').slice(0, 90)}`,
    { kind: 'categoryPost', locationId: post.locationId, categoryId: post.categoryId }
  );
});

// ---------------------------------------------------------------------------
// Work orders
// ---------------------------------------------------------------------------
exports.onWorkOrderCreated = onDocumentCreated('workOrders/{id}', async (event) => {
  const order = event.data?.data();
  if (!order) return;

  const assignees = (order.assignedUids ?? []).filter((uid) => uid !== order.uploadedByUid);
  if (assignees.length === 0) return;

  const users = await activeUsers();
  const tokens = users.filter((u) => assignees.includes(u.uid)).map((u) => u.pushToken);

  await push(
    tokens,
    'Signature needed',
    `${order.uploadedByName ?? 'Someone'} sent "${order.title}" for your signature`,
    { kind: 'workOrder', orderId: event.params.id }
  );
});

// Complete and ready to collect - only the person who sent it. The status
// flips before the PDF has finished being assembled, so this waits for the
// file rather than the status alone.
exports.onWorkOrderCompleted = onDocumentUpdated('workOrders/{id}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  if (!after.signedFileUrl || before.signedFileUrl) return;

  const users = await activeUsers();
  const tokens = users.filter((u) => u.uid === after.uploadedByUid).map((u) => u.pushToken);

  await push(
    tokens,
    'Document ready',
    `Everyone has signed "${after.title}" — it's ready to download`,
    { kind: 'workOrder', orderId: event.params.id }
  );
});

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------
exports.onExpenseReceiptCreated = onDocumentCreated('expenseReceipts/{id}', async (event) => {
  const receipt = event.data?.data();
  if (!receipt) return;

  const users = await activeUsers();
  const tokens = users
    .filter((u) => isFinance(u) && u.uid !== receipt.submittedByUid)
    .map((u) => u.pushToken);

  const amount = ((receipt.amountCents ?? 0) / 100).toFixed(2);
  await push(
    tokens,
    'New receipt',
    `${receipt.submittedByName ?? 'Someone'} submitted $${amount} — ${receipt.categoryLabel}`,
    { kind: 'expense' }
  );
});

// ---------------------------------------------------------------------------
// Time off
// ---------------------------------------------------------------------------
exports.onTimeOffCreated = onDocumentCreated('timeOffRequests/{id}', async (event) => {
  const req = event.data?.data();
  if (!req) return;

  const users = await activeUsers();
  const tokens = users.filter((u) => isReviewer(u) && u.uid !== req.uid).map((u) => u.pushToken);

  await push(tokens, 'Time off request', `${req.name ?? 'Someone'} requested time off`, {
    kind: 'timeOff',
  });
});

exports.onTimeOffResolved = onDocumentUpdated('timeOffRequests/{id}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  if (before.status !== 'pending' || after.status === 'pending') return;

  const users = await activeUsers();
  const tokens = users.filter((u) => u.uid === after.uid).map((u) => u.pushToken);

  await push(
    tokens,
    after.status === 'approved' ? 'Time off approved' : 'Time off denied',
    after.status === 'denied' && after.denialReason
      ? `Your request was denied — ${after.denialReason}`
      : 'Your time off request has been resolved',
    { kind: 'timeOff' }
  );
});

// ---------------------------------------------------------------------------
// Access requests
// ---------------------------------------------------------------------------
exports.onAccessRequestCreated = onDocumentCreated('accessRequests/{id}', async (event) => {
  const req = event.data?.data();
  if (!req) return;

  const users = await activeUsers();
  const tokens = users
    .filter((u) => isReviewer(u) && u.email !== req.userEmail)
    .map((u) => u.pushToken);

  await push(
    tokens,
    'Access request',
    `${req.userName ?? 'Someone'} asked for access to ${req.targetLabel ?? 'something'}`,
    { kind: 'accessRequest' }
  );
});

exports.onAccessRequestResolved = onDocumentUpdated('accessRequests/{id}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  if (before.status !== 'pending' || after.status === 'pending') return;

  const snap = await admin.firestore().collection('users').where('email', '==', after.userEmail).get();
  const tokens = snap.docs
    .map((d) => d.data())
    .filter((u) => u.active !== false && u.pushToken)
    .map((u) => u.pushToken);

  await push(
    tokens,
    after.status === 'approved' ? 'Access granted' : 'Access request denied',
    after.status === 'approved'
      ? `You now have access to ${after.targetLabel ?? 'a new area'}`
      : `Your request for ${after.targetLabel ?? 'access'} was denied`,
    { kind: 'accessRequest' }
  );
});

// ---------------------------------------------------------------------------
// Renewals
// ---------------------------------------------------------------------------
//
// Fires when an expiry moves into the warning window, not on a schedule - so
// it announces the change rather than nagging daily.
exports.onRenewalDueSoon = onDocumentUpdated('licenseRenewals/{id}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after || !after.expirationDate) return;

  const WARNING_DAYS = 60;
  const DAY = 24 * 60 * 60 * 1000;
  const daysOut = Math.round((after.expirationDate - Date.now()) / DAY);
  const wasOut = before.expirationDate
    ? Math.round((before.expirationDate - Date.now()) / DAY)
    : Infinity;

  // Only on the crossing into the window - not every edit afterwards.
  if (daysOut > WARNING_DAYS || wasOut <= WARNING_DAYS) return;

  const brandId = await brandForLocation(after.locationId);
  const users = await activeUsers();
  const tokens = users.filter((u) => canSee(u, brandId)).map((u) => u.pushToken);

  await push(
    tokens,
    'Renewal due soon',
    daysOut < 0 ? `${after.type} has expired` : `${after.type} expires in ${daysOut} day${daysOut === 1 ? '' : 's'}`,
    { kind: 'renewal', locationId: after.locationId }
  );
});
