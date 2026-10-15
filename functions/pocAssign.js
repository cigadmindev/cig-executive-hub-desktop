// Operational POC: who fills each contact in (15 Oct 2026, Ronnie).
//
// The COO (anyone on the Assign level of the Operational POC column in Who
// sees what) and admins hand a contact - or every unfilled one at a location
// - to a person at that location who can fill POC in. Done here, not from the
// browser, so the rules can keep the assignment fields server-only and a bulk
// assignment sends one email, not one per contact.
//
// Several people can share a contact (15 Oct 2026): assignedToUids and
// assignedToNames hold them, and the first is kept in assignedToUid /
// assignedToName so older copies of the app still show someone.
//
// A contact stays on the person's Home (Needs you) until a company or a
// contact name / number is filled in; the screens work that out live.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { requireLive } = require('./caller');
const { notifyPeople, resolveRef, ACTION, AMBIENT } = require('./notify');
const R = require('./routing');
const M = require('./accessMatrix.gen');

const COLLECTION = 'openingOngoingContacts';
const filled = (c) => !!((c.vendor ?? '').trim() || (c.contactNameNumber ?? '').trim());
const pocLevel = (u, matrix) => (u.role === 'admin' ? 'assign' : M.accessLevel(u, 'operationalPoc', matrix));
const holdersOf = (c) => (Array.isArray(c.assignedToUids) && c.assignedToUids.length ? c.assignedToUids : c.assignedToUid ? [c.assignedToUid] : []);
const listOf = (items) => (items.length <= 8 ? items.join(', ') : items.slice(0, 8).join(', ') + ' and ' + (items.length - 8) + ' more');

// Someone who can be given a contact at this location: active, a manager with
// that location on their login or a second job there, and able to fill POC in.
function canHold(u, brandId, locationId, matrix) {
  if (!u || u.active === false || u.isGhost) return false;
  const here = R.seesLocation(u, brandId, locationId) || u.alsoJob?.locationId === locationId;
  return here && ['full', 'assign'].includes(pocLevel(u, matrix));
}

exports.assignPocContacts = onCall({ secrets: ['RESEND_API_KEY'], timeoutSeconds: 120 }, async (request) => {
  const me = await requireLive(request);
  const { brandId, locationId, contactIds, section } = request.data || {};
  // uids is the list; a single uid is still accepted from an older page.
  const raw = Array.isArray(request.data?.uids) ? request.data.uids : request.data?.uid ? [request.data.uid] : [];
  const uids = [...new Set(raw.map(String))].slice(0, 20);
  if (typeof brandId !== 'string' || typeof locationId !== 'string') throw new HttpsError('invalid-argument', 'Which location?');
  const matrix = await R.liveMatrix();
  if (pocLevel(me, matrix) !== 'assign') throw new HttpsError('permission-denied', 'Only the COO and admins can assign contacts.');
  if (!R.seesLocation(me, brandId, locationId)) throw new HttpsError('permission-denied', 'That location is not one of yours.');

  const db = admin.firestore();
  const people = [];
  for (const uid of uids) {
    const snap = await db.collection('users').doc(uid).get();
    const person = snap.exists ? { uid: snap.id, ...snap.data() } : null;
    if (!canHold(person, brandId, locationId, matrix)) throw new HttpsError('failed-precondition', (person?.name ?? 'That person') + ' cannot fill in contacts at this location.');
    people.push(person);
  }

  // Which contacts: the ones named (set to exactly these people), or every
  // unfilled one nobody has yet (in a section, or all).
  let docs;
  if (Array.isArray(contactIds) && contactIds.length) {
    const snaps = await Promise.all(contactIds.slice(0, 500).map((id) => db.collection(COLLECTION).doc(String(id)).get()));
    docs = snaps.filter((s) => s.exists && s.data().locationId === locationId && s.data().brandId === brandId);
  } else {
    if (!people.length) throw new HttpsError('invalid-argument', 'Who to?');
    const snap = await db.collection(COLLECTION).where('brandId', '==', brandId).where('locationId', '==', locationId).get();
    docs = snap.docs.filter((d) => !filled(d.data()) && !holdersOf(d.data()).length && (!section || section === 'all' || d.data().section === section));
  }
  if (!docs.length) return { assigned: 0 };

  const now = Date.now();
  const names = people.map((p) => p.name ?? '');
  const batch = db.batch();
  const before = [];
  for (const d of docs) {
    before.push({ id: d.id, item: d.data().item, old: holdersOf(d.data()) });
    batch.update(d.ref, people.length
      ? { assignedToUids: uids, assignedToNames: names, assignedToUid: uids[0], assignedToName: names[0], assignedByName: me.name ?? '', assignedAt: now }
      : {
          assignedToUids: FieldValue.delete(), assignedToNames: FieldValue.delete(),
          assignedToUid: FieldValue.delete(), assignedToName: FieldValue.delete(), assignedByName: FieldValue.delete(), assignedAt: FieldValue.delete(),
        });
  }
  await batch.commit();

  const place = await R.locationName(locationId);
  const path = '/brand/' + brandId + '/location/' + locationId + '/operational-poc';
  const nowWith = names.length ? 'Now with ' + names.join(', ') : 'Nobody is on it now';

  // Taken off: tell each person once, and clear it from their waiting list.
  const lost = {};
  for (const b of before) {
    for (const oldUid of b.old) {
      if (uids.includes(oldUid)) continue;
      await resolveRef('pocAssign/' + b.id + '/' + oldUid);
      (lost[oldUid] = lost[oldUid] ?? []).push(b.item);
    }
  }
  for (const [oldUid, items] of Object.entries(lost)) {
    const s = await db.collection('users').doc(oldUid).get();
    if (!s.exists || s.data().active === false) continue;
    await notifyPeople([{ uid: oldUid, ...s.data() }], 'No longer assigned to you: ' + (items.length === 1 ? items[0] : items.length + ' contacts'),
      nowWith + ' · ' + place,
      { speed: AMBIENT, path, topic: 'pocAssignment', locationId });
  }

  // Each newly added person: one message, however many contacts. Someone
  // already on a contact is not emailed about it again.
  for (const person of people) {
    const fresh = before.filter((b) => !b.old.includes(person.uid));
    if (!fresh.length) continue;
    const items = fresh.map((b) => b.item);
    await notifyPeople([person],
      'Fill in for ' + place + ': ' + (items.length === 1 ? items[0] : items.length + ' contacts'),
      (me.name ?? 'The COO') + ' asked you to fill in ' + (items.length === 1 ? 'this Operational POC contact' : 'these Operational POC contacts') + ': ' + listOf(items) + '.'
        + (people.length > 1 ? ' Shared with ' + names.filter((n, i) => people[i].uid !== person.uid).join(', ') + '.' : ''),
      {
        speed: ACTION, emailLater: true, path, topic: 'pocAssignment', locationId,
        ref: items.length === 1 ? 'pocAssign/' + fresh[0].id + '/' + person.uid : null,
        button: 'Open Operational POC', why: 'You got this because these contacts were assigned to you.',
      });
  }
  return { assigned: docs.length };
});

// Filled in: no longer waiting on anyone who had it.
exports.onPocContactFilled = onDocumentUpdated({ document: COLLECTION + '/{id}' }, async (event) => {
  const b = event.data?.before?.data();
  const a = event.data?.after?.data();
  if (!a || filled(b ?? {}) || !filled(a)) return;
  for (const uid of holdersOf(a)) await resolveRef('pocAssign/' + event.params.id + '/' + uid);
});
