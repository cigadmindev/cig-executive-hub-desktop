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
const { notifyPeople, resolveRef, ACTION, AMBIENT } = require('./notify');

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

exports.onTaggedEntryCreated = onDocumentCreated(
  { document: 'schedules/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
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
    {
      speed: ACTION, path: dayPath(entry.dateTime), topic: 'tagged', button: 'See it on the calendar',
      why: 'You got this because you were tagged on it.', locationId: entry.locationId ?? null,
    }
  );
  }
);

// Tagged onto something that already existed, or the date moved.
exports.onTaggedEntryUpdated = onDocumentUpdated(
  { document: 'schedules/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
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
  }
);

const STATIC_LOCATION_BRANDS = {
  'taste-starkville': 'taste',
  'taste-ridgeland': 'taste',
  'blutos-starkville': 'blutos',
  'heritage-starkville': 'heritage',
};

// A location's restaurant, so the link can go to the checklist itself rather
// than dropping someone on the calendar to find it. The same lookup
// notifications.js has - copied rather than moved, since that file has twelve
// working triggers reading it and this is five lines.
async function brandForLocation(locationId) {
  if (!locationId) return null;
  if (STATIC_LOCATION_BRANDS[locationId]) return STATIC_LOCATION_BRANDS[locationId];
  const snap = await admin.firestore().collection('customLocations').doc(locationId).get();
  return snap.exists ? snap.data().brandId ?? null : null;
}

// Assigning a checklist item wrote a field and told nobody, so handing someone
// a job relied on them noticing it.
//
// Separate from the tagged triggers above, which skip checklist items: those
// are generated in bulk and a date change would fire hundreds at once. An
// assignment is one person, one item, deliberate.
exports.onChecklistAssigned = onDocumentUpdated(
  { document: 'schedules/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;

  // Done, or handed to someone else: it is no longer waiting on the person
  // who held it.
  if (before.assignedToUid && (before.assignedToUid !== after.assignedToUid || (!before.done && after.done))) {
    await resolveRef('assignment/' + event.params.id + '/' + before.assignedToUid);
  }

  // Taken off it: tell the person who was holding it.
  if (before.assignedToUid && before.assignedToUid !== after.assignedToUid) {
    const oldSnap = await admin.firestore().collection('users').doc(before.assignedToUid).get();
    if (oldSnap.exists && oldSnap.data().active !== false) {
      await notifyPeople(
        [{ uid: before.assignedToUid, ...oldSnap.data() }],
        'No longer assigned to you: ' + (after.title || 'a checklist item'),
        after.assignedToName ? 'It is now with ' + after.assignedToName : 'Nobody is on it now',
        { speed: AMBIENT, path: '/', topic: 'assignment', locationId: after.locationId ?? null }
      );
    }
  }

  const uid = after.assignedToUid;
  if (!uid || uid === before.assignedToUid) return;

  const snap = await admin.firestore().collection('users').doc(uid).get();
  if (!snap.exists || snap.data().active === false) return;
  const person = { uid, ...snap.data() };

  const brandId = after.openingItem ? await brandForLocation(after.locationId) : null;
  const path =
    brandId && after.locationId
      ? '/brand/' + brandId + '/location/' + after.locationId + '/opening-checklist'
      : dayPath(after.dateTime);

  const section = after.openingSection ? ' · ' + after.openingSection : '';

  await notifyPeople(
    [person],
    'Assigned to you: ' + (after.title || 'a checklist item'),
    'Due ' + whenText(after.dateTime) + section,
    {
      speed: ACTION, path, topic: 'assignment', ref: 'assignment/' + event.params.id + '/' + uid,
      button: 'Open the checklist', why: 'You got this because this item was assigned to you.',
      locationId: after.locationId ?? null,
    }
  );
  }
);
