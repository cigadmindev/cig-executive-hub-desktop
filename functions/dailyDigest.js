// One email at 8am with everything that did not need someone straight away.
//
// Anything needing action emails immediately. Everything else - posts,
// announcements, someone else's receipt - waits for this, so a busy day is one
// email rather than a dozen.
//
// Nothing is sent when there is nothing. A daily email that is usually empty
// teaches people to ignore it.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { Resend } = require('resend');
const { everyone, FROM, WEB_URL } = require('./notify');

const ZONE = 'America/Chicago';
const NOTIFICATIONS = 'notifications';
const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

function digestHtml({ name, items }) {
  const rows = items
    .map(
      (n, i) => `<tr><td style="border-top:1px solid #232327;${i === items.length - 1 ? 'border-bottom:1px solid #232327;' : ''}padding:12px 0;">
<div style="font-family:${F};font-size:14px;color:#FFFFFF;padding-bottom:3px;">${n.title}</div>
<div style="font-family:${F};font-size:12px;line-height:18px;color:#B4B4BB;">${n.body ?? ''}</div>
</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0A0B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0B;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;">
<tr><td style="font-family:${F};font-size:13px;color:#22D3EE;padding-bottom:16px;">CIG Executive Hub</td></tr>
<tr><td style="font-family:${F};font-size:19px;font-weight:bold;color:#FFFFFF;padding-bottom:4px;">Yesterday in the Hub</td></tr>
<tr><td style="font-family:${F};font-size:13px;color:#6C6C76;padding-bottom:18px;">${items.length} thing${items.length === 1 ? '' : 's'} worth knowing. Nothing here needs you today.</td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
<tr><td style="padding-top:22px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td bgcolor="#22D3EE" style="border-radius:8px;">
<a href="${WEB_URL}" style="display:inline-block;padding:11px 22px;font-family:${F};font-size:14px;font-weight:bold;color:#0A0A0B;text-decoration:none;">Open the Hub</a>
</td></tr></table></td></tr>
<tr><td style="font-family:${F};font-size:12px;line-height:18px;color:#6C6C76;padding-top:26px;">
One email a day, sent at 8am, covering anything that did not need you straight away. Change this under Notifications in your profile.
</td></tr>
</table></td></tr></table></body></html>`;
}

exports.sendDailyDigest = onSchedule(
  { schedule: '0 8 * * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'] },
  async () => {
    const db = admin.firestore();
    const people = await everyone();

    let sent = 0;
    const resend = new Resend(process.env.RESEND_API_KEY);

    for (const person of people) {
      if (!person.email) continue;
      // none turns everything off. all and action both already had their
      // immediate emails; only the default gathers ambient ones here.
      const pref = person.notifyEmail ?? 'default';
      if (pref === 'none' || pref === 'action') continue;

      const snap = await db
        .collection(NOTIFICATIONS)
        .where('uid', '==', person.uid)
        .where('kind', '==', 'ambient')
        .where('emailedAt', '==', null)
        .orderBy('createdAt', 'desc')
        .limit(25)
        .get();

      if (snap.empty) continue;

      const items = snap.docs.map((d) => d.data());
      try {
        await resend.emails.send({
          from: FROM,
          to: [person.email],
          subject: `Yesterday in the Hub — ${items.length} thing${items.length === 1 ? '' : 's'}`,
          html: digestHtml({ name: person.name, items }),
        });
        const batch = db.batch();
        const now = Date.now();
        snap.docs.forEach((d) => batch.update(d.ref, { emailedAt: now }));
        await batch.commit();
        sent++;
      } catch (err) {
        console.error('digest to ' + person.email + ' failed: ' + err.message);
      }
    }

    console.log('Daily digest sent to ' + sent + ' of ' + people.length + '.');
  }
);
