// "Assigned to you today" - one email at 5pm (15 Oct 2026).
//
// Being assigned an opening checklist item or an Operational POC contact
// used to email straight away, one email per assignment. With Ronnie handing
// out a day's worth at once that was twenty emails. Now each assignment goes
// to the bell and Home at once (unchanged) and this sends one list at the end
// of the day. Nothing to list, no email.
//
// Who gets it: anyone not on "nothing" for email. Only assignments still open
// are listed; ones already done or taken back are left out but marked, so
// they are not picked up tomorrow.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { everyone, sendEmail, WEB_URL } = require('./notify');
const T = require('./emailTemplate');

const ZONE = 'America/Chicago';
const DAY = 24 * 60 * 60 * 1000;
const GROUPS = [
  ['Opening checklists', 'assignment'],
  ['Operational POC', 'pocAssignment'],
];

exports.sendAssignmentSummary = onSchedule(
  { schedule: '0 17 * * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'], timeoutSeconds: 540 },
  async () => {
    const db = admin.firestore();
    const people = await everyone();
    const now = Date.now();
    const dateLabel = new Date(now).toLocaleDateString('en-US', { timeZone: ZONE, weekday: 'short', month: 'short', day: 'numeric' });
    let sent = 0;

    for (const person of people) {
      if (!person.email || (person.notifyEmail ?? 'default') === 'none') continue;
      // The same query the morning summary uses, so no new index. A day and
      // a bit, so a missed run is caught up by the next one.
      const snap = await db.collection('notifications')
        .where('uid', '==', person.uid)
        .where('createdAt', '>', now - 1.25 * DAY)
        .orderBy('createdAt', 'desc')
        .limit(300)
        .get();
      const due = snap.docs.filter((d) => d.data().emailLater === true && !d.data().emailedAt);
      if (!due.length) continue;
      const open = due.filter((d) => !d.data().resolvedAt);

      if (open.length) {
        const parts = [];
        for (const [heading, topic] of GROUPS) {
          const items = open.filter((d) => d.data().topic === topic)
            .map((d) => ({ title: d.data().title.replace(/^Assigned to you: /, ''), line: d.data().body, url: WEB_URL + (d.data().path ?? '/'), action: 'Open' }));
          if (items.length) parts.push(T.section(heading, items.length, T.itemList(items)));
        }
        const rest = open.filter((d) => !GROUPS.some(([, t]) => t === d.data().topic))
          .map((d) => ({ title: d.data().title, line: d.data().body, url: WEB_URL + (d.data().path ?? '/'), action: 'Open' }));
        if (rest.length) parts.push(T.section('Other', rest.length, T.itemList(rest)));

        const res = await sendEmail({
          to: [person.email],
          subject: open.length + ' thing' + (open.length === 1 ? '' : 's') + ' assigned to you today',
          html: T.layout({
            kicker: 'Assigned to you · ' + dateLabel,
            title: (person.name ? person.name.split(' ')[0] + ', h' : 'H') + 'ere is what was assigned to you today',
            intro: 'Each one is also on your Home under Tagged for you, and leaves when it is done.',
            bodyHtml: parts.join(''),
            button: { label: 'Open the Hub', url: WEB_URL },
            footer: 'Sent at 5pm on days something was assigned to you, never when nothing was.',
          }),
        });
        // Only stamped when it went, so a failed email comes round again.
        if (!res.ok) continue;
        sent++;
      }
      const batch = db.batch();
      due.forEach((d) => batch.update(d.ref, { emailedAt: now }));
      await batch.commit();
    }
    console.log('Assignment summary sent to ' + sent + ' of ' + people.length + '.');
  }
);
