// Late opening checklist items (19 Oct 2026, sketch 24).
//
// An item is late only when it could have been done and wasn't: the app sets
// attentionFlag when an item's date goes by and nothing it waits on is still
// open (an item that is waiting is never flagged). Each morning, whoever an
// item is assigned to gets one email listing their late items - the first
// morning after one goes late, then once a week until it is signed off or
// given a new date. Unassigned items email nobody; they show red in the Hub.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { everyone, sendEmail, WEB_URL } = require('./notify');
const T = require('./emailTemplate');
const R = require('./routing');

const ZONE = 'America/Chicago';
const DAY = 24 * 60 * 60 * 1000;
const fmt = (t) => new Date(t).toLocaleDateString('en-US', { timeZone: ZONE, month: 'short', day: 'numeric' });

exports.openingLateWatch = onSchedule(
  { schedule: '52 7 * * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'], timeoutSeconds: 540 },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    const snap = await db.collection('schedules').where('attentionFlag', '==', true).get();
    const late = snap.docs.filter((d) => d.data().openingItem === true && d.data().done !== true);
    if (!late.length) return console.log('No late opening items.');

    // Due an email: never emailed for this lateness, or a week since.
    const due = late.filter((d) => {
      const x = d.data();
      // A new spell of lateness (a later lateSince) starts the count again.
      return !x.lateEmailedAt || x.lateEmailedAt < (x.lateSince ?? 0) || now - x.lateEmailedAt > 6.5 * DAY;
    });
    if (!due.length) return console.log(late.length + ' late, none due an email today.');

    // What each late item is holding up: unfinished items at the same
    // location that list it (on the record) as something they wait on.
    const byLoc = {};
    for (const d of due) (byLoc[d.data().locationId] ??= []).push(d);
    const holding = {};
    for (const loc of Object.keys(byLoc)) {
      const all = await db.collection('schedules').where('locationId', '==', loc).where('openingItem', '==', true).get();
      for (const d of byLoc[loc]) {
        holding[d.id] = all.docs.filter((o) => o.data().done !== true && Array.isArray(o.data().dependsOnIds) && o.data().dependsOnIds.includes(d.id)).length;
      }
    }
    const names = {};
    for (const loc of Object.keys(byLoc)) names[loc] = await R.locationName(loc);

    const people = await everyone();
    const perPerson = {};
    for (const d of due) {
      const x = d.data();
      const uids = Array.isArray(x.assignedToUids) && x.assignedToUids.length ? x.assignedToUids : x.assignedToUid ? [x.assignedToUid] : [];
      uids.forEach((u) => (perPerson[u] ??= []).push(d));
    }

    const emailed = new Set();
    let sent = 0;
    for (const [uid, docs] of Object.entries(perPerson)) {
      const person = people.find((p) => p.uid === uid);
      if (!person?.email || (person.notifyEmail ?? 'default') === 'none') continue;
      const items = docs
        .sort((a, b) => (a.data().lateSince ?? a.data().dateTime ?? 0) - (b.data().lateSince ?? b.data().dateTime ?? 0))
        .map((d) => {
          const x = d.data();
          const since = x.lateSince ?? x.dateTime;
          const days = since ? Math.max(1, Math.floor((now - since) / DAY)) : null;
          const brandPath = x.brandId ? '/brand/' + x.brandId + '/location/' + x.locationId + '/opening-checklist' : '/';
          return {
            title: x.title,
            line: [names[x.locationId], since ? 'was due ' + fmt(since) + (days ? ' · ' + days + (days === 1 ? ' day' : ' days') + ' late' : '') : null, holding[d.id] ? 'holding up ' + holding[d.id] + (holding[d.id] === 1 ? ' item' : ' items') : null].filter(Boolean).join(' · '),
            url: WEB_URL + brandPath,
            action: 'Open',
          };
        });
      const res = await sendEmail({
        to: [person.email],
        subject: items.length === 1 ? 'Late on the opening checklist: ' + items[0].title : items.length + ' opening checklist items are late',
        html: T.layout({
          urgent: true,
          kicker: 'Opening checklists · late',
          title: (person.name ? person.name.split(' ')[0] + ', ' : '') + (items.length === 1 ? 'this one is late' : 'these are late'),
          intro: 'Each could have been done and has not been. Sign it off, or give it a new date in the Hub if the plan has changed.',
          bodyHtml: T.section('Assigned to you', items.length, T.itemList(items)),
          button: { label: 'Open the Hub', url: WEB_URL },
          footer: 'Sent the morning after something goes late, then once a week until it is done. Items waiting on something else are never counted as late.',
        }),
      });
      if (!res.ok) continue;
      sent++;
      docs.forEach((d) => emailed.add(d.id));
    }

    // Only stamped when it went, so a failed email comes round again.
    const ids = [...emailed];
    for (let i = 0; i < ids.length; i += 400) {
      const batch = db.batch();
      ids.slice(i, i + 400).forEach((id) => batch.update(db.collection('schedules').doc(id), { lateEmailedAt: now }));
      await batch.commit();
    }
    console.log('Late opening items: ' + late.length + ' late, ' + due.length + ' due an email, ' + sent + ' emails sent.');
  }
);
