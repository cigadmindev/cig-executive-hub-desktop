// The 8am morning summary.
//
// Two parts, and only sent when there is something in either:
//   Waiting on you   - everything still open for this person: a request to
//                      decide, a document to sign, an item assigned to them.
//                      Taken from notifications that carry a ref and have not
//                      been resolved - so it empties itself as things are done.
//   Since yesterday  - everything that did not need them straight away,
//                      grouped by topic.
//
// Who gets it: anyone on the default email setting. "Everything" already had
// each item as it happened; "urgent only" and "nothing" asked not to.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { everyone, sendEmail, WEB_URL } = require('./notify');
const T = require('./emailTemplate');

const ZONE = 'America/Chicago';
const NOTIFICATIONS = 'notifications';
const DAY = 24 * 60 * 60 * 1000;

// What the link on a waiting item says.
const ACTION_WORD = {
  timeOff: 'Decide', eventRequest: 'Decide', accessRequest: 'Decide', deviceRequest: 'Decide',
  systemsHelp: 'Answer', catering: 'Claim', renewal: 'Renew', signature: 'Sign', assignment: 'Open',
};
// How the news is grouped, in this order.
const GROUPS = [
  ['Posts', ['post', 'folderPost']],
  ['Opening checklists', ['assignment']],
  ['Calendar', ['tagged', 'calendar']],
  ['Expenses', ['expenses']],
];

async function buildFor(db, person, now) {
  const snap = await db
    .collection(NOTIFICATIONS)
    .where('uid', '==', person.uid)
    .where('createdAt', '>', now - 30 * DAY)
    .orderBy('createdAt', 'desc')
    .limit(300)
    .get();
  const docs = snap.docs.filter((d) => d.data().source !== 'did');

  // Waiting: open items with a ref, newest notice per ref.
  const seen = new Set();
  const waiting = [];
  for (const d of docs) {
    const n = d.data();
    if (n.kind !== 'action' || !n.ref || n.resolvedAt || seen.has(n.ref)) continue;
    seen.add(n.ref);
    waiting.push({ title: n.title, line: n.body, url: WEB_URL + (n.path ?? '/'), action: ACTION_WORD[n.topic] ?? 'Open' });
  }

  // News: not urgent, not already emailed, from the last day and a bit.
  const news = docs.filter((d) => {
    const n = d.data();
    return n.kind === 'ambient' && !n.emailedAt && n.createdAt > now - 1.25 * DAY;
  });
  const groups = [];
  const used = new Set();
  for (const [heading, topics] of GROUPS) {
    const items = news.filter((d) => topics.includes(d.data().topic));
    items.forEach((d) => used.add(d.id));
    if (items.length) groups.push({ heading, items: items.map((d) => toItem(d.data())) });
  }
  const other = news.filter((d) => !used.has(d.id));
  if (other.length) groups.push({ heading: 'Other', items: other.map((d) => toItem(d.data())) });

  return { waiting, groups, newsDocs: news };
}

function toItem(n) {
  return { title: n.title, line: n.body, url: WEB_URL + (n.path ?? '/'), action: 'Open' };
}

exports.sendDailyDigest = onSchedule(
  { schedule: '0 8 * * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'], timeoutSeconds: 540 },
  async () => {
    const db = admin.firestore();
    const people = await everyone();
    const now = Date.now();
    const dateLabel = new Date(now).toLocaleDateString('en-US', { timeZone: ZONE, weekday: 'short', month: 'short', day: 'numeric' });
    let sent = 0;

    for (const person of people) {
      if (!person.email) continue;
      if ((person.notifyEmail ?? 'default') !== 'default') continue;

      const { waiting, groups, newsDocs } = await buildFor(db, person, now);
      if (!waiting.length && !groups.length) continue;

      const count = waiting.length + groups.reduce((s, g) => s + g.items.length, 0);
      const res = await sendEmail({
        to: [person.email],
        subject: waiting.length
          ? waiting.length + ' waiting on you · morning summary'
          : 'Morning summary · ' + count + ' thing' + (count === 1 ? '' : 's') + ' since yesterday',
        html: T.morningSummary({ name: person.name, dateLabel, waiting, groups }),
      });
      // Only stamped when it went, so a failed summary's news comes round again.
      if (!res.ok) continue;
      for (let i = 0; i < newsDocs.length; i += 400) {
        const batch = db.batch();
        newsDocs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { emailedAt: now }));
        await batch.commit();
      }
      sent++;
    }
    console.log('Morning summary sent to ' + sent + ' of ' + people.length + '.');
  }
);
