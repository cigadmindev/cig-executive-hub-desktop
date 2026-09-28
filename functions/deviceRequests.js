// Telling people where a device request has got to.
//
// Raised: the COO and admins, since they decide. Decided, ordered or arriving:
// whoever asked, because they are waiting on it and otherwise have to keep
// checking the page.
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { notifyPeople, ACTION } = require('./notify');

const PATH = '/device-requests';
const ZONE = 'America/Chicago';

async function person(uid) {
  if (!uid) return null;
  const snap = await admin.firestore().collection('users').doc(uid).get();
  if (!snap.exists || snap.data().active === false) return null;
  return { uid, ...snap.data() };
}

exports.onDeviceRequestCreated = onDocumentCreated('deviceRequests/{id}', async (event) => {
  const r = event.data?.data();
  if (!r) return;

  const snap = await admin.firestore().collection('users').get();
  const deciders = snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((u) => u.active !== false && u.uid !== r.requestedByUid)
    .filter((u) => u.role === 'admin' || u.job === 'COO');

  const who = r.requestedByName || 'Someone';
  const forWhom = r.forWhom ? ' — for ' + r.forWhom : '';

  await notifyPeople(deciders, 'Device request: ' + r.deviceType, who + ' at ' + r.locationName + forWhom, {
    speed: ACTION,
    path: PATH,
    kind: 'deviceRequest',
    locationId: r.locationId ?? null,
  });
});

exports.onDeviceRequestMoved = onDocumentUpdated('deviceRequests/{id}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after || before.status === after.status) return;

  // Whoever asked is the one waiting. Arriving is their own doing, so that
  // one tells nobody.
  const asker = await person(after.requestedByUid);
  if (!asker || after.status === 'arrived') return;

  let title = null;
  let body = '';

  if (after.status === 'approved') {
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
    kind: 'deviceRequest',
    locationId: after.locationId ?? null,
  });
});
