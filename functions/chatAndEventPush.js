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
const { notifyPeople, ACTION, AMBIENT } = require('./notify');
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

/** The people behind a list of uids, skipping deactivated accounts. */
async function peopleForUids(uids) {
  if (!uids || uids.length === 0) return [];
  const db = admin.firestore();
  // Firestore caps `in` queries at 30 values, so chunk for large groups.
  const chunks = [];
  for (let i = 0; i < uids.length; i += 30) chunks.push(uids.slice(i, i + 30));

  const people = [];
  for (const chunk of chunks) {
    const snap = await db
      .collection('users')
      .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
      .get();
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data.active !== false) people.push({ uid: d.id, ...data });
    });
  }
  return people;
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

const R = require('./routing');
const { resolveRef } = require('./notify');
const clip = (t, n) => {
  const x = String(t ?? '').trim();
  return x.length > n ? x.slice(0, n - 1) + '…' : x;
};
const fmtWhen = (ms) =>
  ms ? new Date(ms).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

/** A new chat message — everyone in the conversation except the sender. */
exports.onChatMessageCreated = onDocumentCreated(
  { document: 'messages/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
    const msg = event.data?.data();
    if (!msg) return;
    const recipients = (msg.memberUids ?? []).filter((uid) => uid !== msg.senderUid);
    if (recipients.length === 0) return;
    const people = await peopleForUids(recipients);
    await notifyPeople(people, 'Message from ' + (msg.senderName ?? 'someone'), clip(msg.text, 160) || 'Sent you something in the Hub.', {
      speed: ACTION,
      topic: 'message',
      path: '/messages',
      // One email per conversation, then nothing for ten minutes - a
      // back-and-forth should not fill an inbox.
      throttleKey: 'chat:' + (msg.conversationId ?? 'unknown'),
      button: 'Reply in the Hub',
      why: 'You got this because you are in this conversation.',
    });
  }
);

/** A new event or promo request - the COO and admins decide. */
exports.onEventRequestCreated = onDocumentCreated(
  { document: 'eventRequests/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
    const req = event.data?.data();
    if (!req) return;
    const brandId = req.brandId ?? (await R.brandForLocation(req.locationId));
    const people = R.without(R.approvers(await R.activeUsers()), req.requestedByUid);
    await notifyPeople(people, (req.requestedBy ?? 'Someone') + ' asked for an event: ' + (req.title ?? ''), (req.locationName ?? 'A location') + (req.dateTime ? ' · ' + fmtWhen(req.dateTime) : ''), {
      speed: ACTION,
      topic: 'eventRequest',
      ref: 'eventRequest/' + event.params.id,
      // Straight to that location's requests, where it can be approved.
      path: brandId && req.locationId ? '/brand/' + brandId + '/location/' + req.locationId + '/event-requests' : '/',
      details: [['When', fmtWhen(req.dateTime)], ['Where', req.locationName ?? ''], ['Guests', String(req.expectedAttendees ?? '')], ['Details', clip(req.details, 200)]].filter(([, v]) => v),
      button: 'Approve or deny',
      why: 'You got this because you approve event and promo requests.',
    });
  }
);

/**
 * Decided - the person who asked; if approved, the people named on it and
 * whoever holds the chosen jobs at that location (not at every restaurant).
 */
exports.onEventRequestResolved = onDocumentUpdated(
  { document: 'eventRequests/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (before.status !== 'pending' || after.status === 'pending') return;
    const approved = after.status === 'approved';
    const users = await R.activeUsers();
    await resolveRef('eventRequest/' + event.params.id, users.find((u) => u.uid === after.resolvedByUid)?.name ?? null);
    const brandId = after.brandId ?? (await R.brandForLocation(after.locationId));
    const uids = new Set();
    if (after.requestedByUid) uids.add(after.requestedByUid);
    if (approved) {
      (after.notifyUids ?? []).forEach((uid) => uids.add(uid));
      R.atLocation(users, after.needs ?? [], brandId, after.locationId).forEach((u) => uids.add(u.uid));
    }
    const people = users.filter((u) => uids.has(u.uid));
    const day = after.dateTime ? new Date(after.dateTime).toISOString().slice(0, 10) : null;
    await notifyPeople(
      people,
      (approved ? 'Approved: ' : 'Denied: ') + (after.title ?? 'event request'),
      (after.locationName ?? 'A location') + (after.dateTime ? ' · ' + fmtWhen(after.dateTime) : '') + (!approved && after.denialReason ? ' · ' + after.denialReason : ''),
      {
        speed: ACTION,
        topic: 'eventRequest',
        path: day ? '/calendar?date=' + day : '/calendar',
        button: approved ? 'See it on the calendar' : 'Open the calendar',
        why: 'You got this because you asked for this event or are needed for it.',
      }
    );
  }
);
