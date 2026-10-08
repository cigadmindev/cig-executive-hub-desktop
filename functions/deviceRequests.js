// Telling people where a device request has got to.
//
// Raised: the COO and admins, since they decide. Decided, ordered or arriving:
// whoever asked, because they are waiting on it and otherwise have to keep
// checking the page.
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { notifyPeople, resolveRef, ACTION } = require('./notify');

const PATH = '/device-requests';
const ZONE = 'America/Chicago';

async function person(uid) {
  if (!uid) return null;
  const snap = await admin.firestore().collection('users').doc(uid).get();
  if (!snap.exists || snap.data().active === false) return null;
  return { uid, ...snap.data() };
}

exports.onDeviceRequestCreated = onDocumentCreated(
  { document: 'deviceRequests/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
  const r = event.data?.data();
  if (!r) return;

  const snap = await admin.firestore().collection('users').get();
  const deciders = snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((u) => u.active !== false && u.uid !== r.requestedByUid)
    .filter((u) => u.role === 'admin' || u.job === 'COO');

  const who = r.requestedByName || 'Someone';
  const forWhom = r.forWhom ? ' — for ' + r.forWhom : '';

  await notifyPeople(deciders, who + ' asked for a ' + r.deviceType, (r.locationName ?? '') + forWhom, {
    speed: ACTION,
    path: PATH,
    topic: 'deviceRequest',
    ref: 'deviceRequest/' + event.params.id,
    button: 'Approve or decline',
    why: 'You got this because you approve device requests.',
    locationId: r.locationId ?? null,
  });
  }
);

exports.onDeviceRequestMoved = onDocumentUpdated(
  { document: 'deviceRequests/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after || before.status === after.status) return;
  // Decided - no longer waiting on the other deciders.
  if (before.status === 'requested') await resolveRef('deviceRequest/' + event.params.id, after.decidedByName ?? null);

  // Whoever asked is the one waiting. Arriving is their own doing, so that
  // one tells nobody.
  const asker = await person(after.requestedByUid);
  if (!asker || after.status === 'arrived') return;

  let title = null;
  let body = '';
  const STEP = { requested: 'waiting on a decision', approved: 'approved', ordered: 'ordered', arrived: 'arrived', declined: 'declined' };

  // An admin moved it by hand - say exactly what changed and why.
  if (after.statusChangedAt && after.statusChangedAt !== before.statusChangedAt) {
    title = 'Update on your ' + after.deviceType + ' request';
    body = (after.statusChangedByName || 'An admin') + ' changed it from ' + (STEP[before.status] ?? before.status) + ' to ' + (STEP[after.status] ?? after.status) + '. ' + (after.statusChangeReason || '');
  } else if (after.status === 'approved') {
    title = 'Approved: ' + after.deviceType;
    body = (after.decidedByName || 'It') + ' approved it — ordering next';
  } else if (after.status === 'declined') {
    title = 'Declined: ' + after.deviceType;
    body = after.declineReason || 'No reason given';
  } else if (after.status === 'ordered') {
    title = 'Ordered: ' + after.deviceType;
    if (after.expectedArrival) {
      const when = new Date(after.expectedArrival).toLocaleDateString('en-US', {
        timeZone: ZONE,
        month: 'long',
        day: 'numeric',
      });
      body = 'Expected ' + when + (after.orderNotes ? ' — ' + after.orderNotes : '');
    } else {
      body = after.orderNotes || 'On its way';
    }
  }

  if (!title) return;

  await notifyPeople([asker], title, body, {
    speed: ACTION,
    path: PATH,
    topic: 'deviceRequest',
    button: 'See your request',
    why: 'You got this because you asked for this device.',
    locationId: after.locationId ?? null,
  });
  }
);
