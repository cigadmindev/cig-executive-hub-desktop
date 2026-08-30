// Push notifications for chat messages and event requests.
//
// These used to be sent client-side, from whichever device happened to
// perform the action. That works right up until it doesn't: the send only
// fires if the sender's app stays foregrounded long enough to complete it,
// so closing the app straight after sending a message means nobody gets
// notified. A Firestore trigger has no such dependency — the write already
// happened, so the notification always follows.
//
// Message content is deliberately excluded. Notifications appear on lock
// screens, and an operations thread carries permit numbers and staffing
// decisions that shouldn't be readable to anyone holding the phone.
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Sends to a set of Expo push tokens.
 *
 * Expo accepts a batch, so this is one request regardless of recipient count.
 * Failures are logged rather than thrown: a notification that doesn't arrive
 * is a nuisance, but a throw here would retry the whole trigger and could
 * double-send to everyone whose token did work.
 */
async function sendToTokens(tokens, title, body) {
  const valid = tokens.filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken'));
  if (valid.length === 0) return;

  const messages = valid.map((to) => ({ to, title, body, sound: 'default' }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    const result = await response.json();
    console.log(`push sent to ${valid.length}`, JSON.stringify(result?.data?.slice?.(0, 3) ?? result));
  } catch (err) {
    console.error('push send failed', err.message);
  }
}

/** Looks up push tokens for a list of uids, skipping deactivated accounts. */
async function tokensForUids(uids) {
  if (!uids || uids.length === 0) return [];
  const db = admin.firestore();
  // Firestore caps `in` queries at 30 values, so chunk for large groups.
  const chunks = [];
  for (let i = 0; i < uids.length; i += 30) chunks.push(uids.slice(i, i + 30));

  const tokens = [];
  for (const chunk of chunks) {
    const snap = await db
      .collection('users')
      .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
      .get();
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data.active === false) return;
      if (data.pushToken) tokens.push(data.pushToken);
    });
  }
  return tokens;
}

/** A new chat message — everyone in the conversation except the sender. */
exports.onChatMessageCreated = onDocumentCreated('messages/{id}', async (event) => {
  const msg = event.data?.data();
  if (!msg) return;

  const recipients = (msg.memberUids ?? []).filter((uid) => uid !== msg.senderUid);
  if (recipients.length === 0) return;

  const tokens = await tokensForUids(recipients);
  await sendToTokens(tokens, 'New Message', `You have a new message from ${msg.senderName ?? 'someone'}`);
});

/**
 * A new event request — admins, so it doesn't sit unseen.
 *
 * Requests are time-sensitive in a way most things here aren't: a wine dinner
 * three weeks out still needs the kitchen told this week.
 */
exports.onEventRequestCreated = onDocumentCreated('eventRequests/{id}', async (event) => {
  const req = event.data?.data();
  if (!req) return;

  const db = admin.firestore();
  const snap = await db.collection('users').where('role', '==', 'admin').get();
  const tokens = snap.docs
    .filter((d) => d.id !== req.requestedByUid && d.data().active !== false && d.data().pushToken)
    .map((d) => d.data().pushToken);

  await sendToTokens(
    tokens,
    'New Event Request',
    `${req.requestedBy ?? 'Someone'} requested "${req.title}" at ${req.locationName ?? 'a location'}`
  );
});

/**
 * An event request resolved — the requester, plus anyone flagged to be told
 * once it's approved.
 *
 * Only fires on the pending -> resolved transition. Editing an already-
 * approved request shouldn't re-notify everyone.
 */
exports.onEventRequestResolved = onDocumentUpdated('eventRequests/{id}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  if (before.status !== 'pending' || after.status === 'pending') return;

  const approved = after.status === 'approved';
  const title = approved ? 'Event Request Approved' : 'Event Request Denied';
  const body = `"${after.title}" at ${after.locationName ?? 'a location'} was ${after.status}`;

  // The requester always hears back.
  const uids = new Set();
  if (after.requestedByUid) uids.add(after.requestedByUid);

  if (approved) {
    // People named directly on the request.
    (after.notifyUids ?? []).forEach((uid) => uids.add(uid));

    // Everyone whose job matches one of the roles picked.
    const roles = after.needs ?? [];
    if (roles.length > 0) {
      const db = admin.firestore();
      const snap = await db.collection('users').where('job', 'in', roles.slice(0, 30)).get();
      snap.docs.forEach((d) => {
        if (d.data().active !== false) uids.add(d.id);
      });
    }
  }

  const tokens = await tokensForUids([...uids]);
  await sendToTokens(tokens, title, body);
});
