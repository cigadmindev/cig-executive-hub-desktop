// When the thing itself is deleted, its "waiting on you" items go too (S13).
//
// A deleted time-off request, enquiry or renewal used to leave a dead "Decide"
// in the bell and in every 8am summary for thirty days, because nothing told
// the notifications it was gone. One trigger per collection clears every
// notification that pointed at it, marked "removed".
const { onDocumentDeleted } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const PREFIX = {
  timeOffRequests: 'timeOff',
  eventRequests: 'eventRequest',
  deviceRequests: 'deviceRequest',
  accessRequests: 'accessRequest',
  integrationRequests: 'systemsHelp',
  cateringEnquiries: 'catering',
  licenseRenewals: 'renewal',
  workOrders: 'signature', // per signer: signature/{id}/{uid}
  schedules: 'assignment', // per person: assignment/{id}/{uid}
};

// Clears "prefix/id" and anything under "prefix/id/". A range on one field
// needs no extra index; still-open ones are picked out here.
async function clearRef(base) {
  const db = admin.firestore();
  const snap = await db.collection('notifications')
    .where('ref', '>=', base)
    .where('ref', '<=', base + '/')
    .get();
  const open = snap.docs.filter((d) => d.data().resolvedAt == null && (d.data().ref === base || d.data().ref.startsWith(base + '/')));
  const now = Date.now();
  for (let i = 0; i < open.length; i += 400) {
    const batch = db.batch();
    open.slice(i, i + 400).forEach((d) => batch.update(d.ref, { resolvedAt: now, resolvedByName: 'removed', readAt: d.data().readAt ?? now }));
    await batch.commit();
  }
  return open.length;
}

for (const [collection, prefix] of Object.entries(PREFIX)) {
  const name = 'onDeleted_' + collection;
  exports[name] = onDocumentDeleted({ document: collection + '/{id}' }, async (event) => {
    const n = await clearRef(prefix + '/' + event.params.id);
    // Why someone was off is kept apart from the request (S6); when the
    // request goes, so does the reason, rather than lingering on its own.
    if (collection === 'timeOffRequests') {
      await admin.firestore().collection('timeOffReasons').doc(event.params.id).delete().catch(() => {});
    }
    if (n) console.log('Cleared ' + n + ' notification(s) for deleted ' + collection + '/' + event.params.id);
  });
}

exports.clearRef = clearRef;
