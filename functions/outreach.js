// Outreach follow-ups (26 Oct 2026, sketch 30).
//
// Each visit a Catering & Events manager logs sets the place's next follow-up
// (a month later unless they choose another date). At 7:47 each morning the
// location's Catering & Events managers get one email listing the places
// due that day or overdue and not yet reminded about - once per follow-up
// date, so a place is not emailed every day. Logging the next visit sets a
// new date, and the reminder starts again from there.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { notifyPeople, ACTION } = require('./notify');
const R = require('./routing');

const ZONE = 'America/Chicago';
const fmt = (t) => new Date(t).toLocaleDateString('en-US', { timeZone: ZONE, month: 'short', day: 'numeric' });

exports.outreachFollowUps = onSchedule(
  { schedule: '47 7 * * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'], timeoutSeconds: 300 },
  async () => {
    const db = admin.firestore();
    // The end of today, Chicago time.
    const now = new Date();
    const today = now.toLocaleDateString('en-CA', { timeZone: ZONE });
    const endOfDay = new Date(today + 'T23:59:59-06:00').getTime();
    const snap = await db.collection('outreachPlaces').where('nextFollowUpAt', '<=', endOfDay).get();
    const due = snap.docs.filter((d) => d.data().nextFollowUpAt && d.data().remindedFor !== d.data().nextFollowUpAt);
    if (!due.length) return console.log('No outreach follow-ups to remind about.');

    const byLoc = {};
    for (const d of due) (byLoc[d.data().locationId] ??= []).push(d);
    const users = await R.activeUsers();
    let told = 0;
    for (const [locId, docs] of Object.entries(byLoc)) {
      const team = await R.cateringClaimers(users, locId);
      const where = await R.locationName(locId);
      if (team.length) {
        await notifyPeople(
          team,
          'Outreach follow-up' + (docs.length > 1 ? 's' : '') + ' due · ' + docs.length + (where ? ' at ' + where : ''),
          docs.map((d) => d.data().name).join(', '),
          {
            speed: ACTION,
            topic: 'catering',
            path: '/catering?tab=outreach',
            button: 'Open Outreach',
            details: docs.map((d) => [d.data().name, 'due ' + fmt(d.data().nextFollowUpAt) + (d.data().contactName ? ' · ' + d.data().contactName : '')]),
            why: 'You got this because you look after catering and events' + (where ? ' at ' + where : '') + ' and these places are due a follow-up visit.',
            locationId: locId,
          }
        );
        told += team.length;
      } else {
        console.log('No Catering & Events manager at ' + locId + ' to remind about ' + docs.length + ' place(s).');
      }
      const batch = db.batch();
      docs.forEach((d) => batch.update(d.ref, { remindedFor: d.data().nextFollowUpAt }));
      await batch.commit();
    }
    console.log('Outreach reminders: ' + due.length + ' place(s), ' + told + ' email(s).');
  }
);
