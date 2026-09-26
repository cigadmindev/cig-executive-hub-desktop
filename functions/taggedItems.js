// Someone tagged on something hears about it.
//
// Event requests already notified the people picked on them, but anything put
// straight on the calendar reached nobody - so "marketing needs to know about
// this" only worked if it went through an approval first.
//
// Reads the same two fields the tagging control writes:
//   needs       job titles - whoever holds them, now and later
//   notifyUids  particular people
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { notifyPeople, ACTION } = require('./notify');

/** The people behind a set of titles and uids, without duplicates. */
async function taggedPeople({ needs = [], notifyUids = [] }, exceptUid) {
  if (needs.length === 0 && notifyUids.length === 0) return [];
  const snap = await admin.firestore().collection('users').get();
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((u) => u.active !== false)
    .filter((u) => u.uid !== exceptUid)
    .filter((u) => notifyUids.includes(u.uid) || (u.job && needs.includes(u.job)));
}

// Straight to the day it is on, rather than to today.
function dayPath(dateTime) {
  if (!dateTime) return '/calendar';
  return '/calendar?date=' + new Date(dateTime).toISOString().slice(0, 10);
}

function whenText(dateTime) {
  if (!dateTime) return 'a date not set yet';
  return new Date(dateTime).toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

exports.onTaggedEntryCreated = onDocumentCreated('schedules/{id}', async (event) => {
  const entry = event.data?.data();
  if (!entry) return;
  // Checklist items are generated in bulk; only things someone typed carry
  // tags, and only those should ever notify.
  if (entry.openingItem === true) return;

  const people = await taggedPeople(entry, entry.authorUid);
  if (people.length === 0) return;

  const who = entry.authorName || 'Someone';
  const note = entry.note ? ' — ' + entry.note : '';

  await notifyPeople(
    people,
    entry.title || 'Something needs you',
    who + ' added this for ' + whenText(entry.dateTime) + note,
    { speed: ACTION, path: dayPath(entry.dateTime), kind: 'calendar', locationId: entry.locationId ?? null }
  );
});

// Tagged onto something that already existed, or the date moved.
exports.onTaggedEntryUpdated = onDocumentUpdated('schedules/{id}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after || after.openingItem === true) return;

  const was = new Set([...(before.needs ?? []), ...(before.notifyUids ?? [])]);
  const addedNeeds = (after.needs ?? []).filter((x) => !was.has(x));
  const addedUids = (after.notifyUids ?? []).filter((x) => !was.has(x));
  const movedDate = before.dateTime !== after.dateTime;

  // Only the newly tagged - unless the date moved, in which case everyone
  // tagged needs telling, because the thing they were told about has changed.
  const audience = movedDate
    ? { needs: after.needs ?? [], notifyUids: after.notifyUids ?? [] }
    : { needs: addedNeeds, notifyUids: addedUids };

  const people = await taggedPeople(audience, after.authorUid);
  if (people.length === 0) return;

  const who = after.authorName || 'Someone';

  await notifyPeople(
    people,
    after.title || 'Something needs you',
    movedDate
      ? 'Moved to ' + whenText(after.dateTime)
      : who + ' added this for ' + whenText(after.dateTime),
    { speed: ACTION, path: dayPath(after.dateTime), kind: 'calendar', locationId: after.locationId ?? null }
  );
});
