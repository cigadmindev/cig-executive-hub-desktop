// "Needs a signature from…" on a checklist item (Mark, 10 Oct 2026).
//
//   onSignatureRequested   someone finished an item and asked another person
//                          to sign it: that person is told (and it waits on
//                          them until they sign or send it back). Sent back:
//                          the person who asked is told why.
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { notifyPeople, resolveRef, ACTION } = require('./notify');
const R = require('./routing');

async function person(uid) {
  if (!uid) return null;
  const snap = await admin.firestore().collection('users').doc(uid).get();
  if (!snap.exists || snap.data().active === false) return null;
  return { uid, ...snap.data() };
}

exports.onSignatureRequested = onDocumentUpdated(
  { document: 'schedules/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    const was = before.signature ?? null;
    const now = after.signature ?? null;
    if (JSON.stringify(was) === JSON.stringify(now)) return;

    // Whatever it was waiting on before is no longer waiting.
    if (was?.status === 'waiting' && (now?.status !== 'waiting' || now?.requestedAt !== was.requestedAt || after.done)) {
      await resolveRef('signature/' + event.params.id + '/' + was.requestedOfUid);
    }

    const brandId = await R.brandForLocation(after.locationId);
    const path = brandId && after.locationId ? '/brand/' + brandId + '/location/' + after.locationId + '/opening-checklist' : '/';
    const where = after.locationId ? await R.locationName(after.locationId) : '';
    const title = after.title || 'a checklist item';

    if (now?.status === 'waiting' && now.requestedAt !== was?.requestedAt && !after.done) {
      const p = await person(now.requestedOfUid);
      if (!p) return;
      await notifyPeople([p], 'Your signature is needed: ' + title, (now.requestedByName || 'Someone') + ' finished it' + (where ? ' for ' + where : '') + (now.note ? ' · "' + now.note + '"' : '') + '.', {
        speed: ACTION, path, topic: 'assignment', ref: 'signature/' + event.params.id + '/' + p.uid,
        button: 'Open the checklist', why: 'You got this because ' + (now.requestedByName || 'someone') + ' asked you to sign this.',
        locationId: after.locationId ?? null,
      });
      return;
    }

    if (now?.status === 'sentBack' && was?.status === 'waiting') {
      const p = await person(now.requestedByUid);
      if (!p) return;
      await notifyPeople([p], 'Sent back: ' + title, (now.requestedOfName || 'They') + ' did not sign it yet: "' + (now.backNote || '') + '"', {
        speed: ACTION, path, topic: 'assignment',
        button: 'Open the checklist', why: 'You got this because you asked ' + (now.requestedOfName || 'them') + ' to sign this.',
        locationId: after.locationId ?? null,
      });
    }
  }
);
