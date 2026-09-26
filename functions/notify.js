// Sending a notification to people, rather than to push tokens.
//
// Everything went through push(tokens, ...), which only reached phones with
// the iPhone app installed. On the web a red dot was all there was, so anyone
// not carrying the app heard nothing at all.
//
// This takes people. It records the notification, pushes to whoever has a
// phone, and emails - immediately for anything needing action, or gathered
// into one 8am summary for everything else. Each person's own preference
// decides which they get.
const admin = require('firebase-admin');
const { Resend } = require('resend');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const WEB_URL = 'https://hub.cigconcepts.com';
const FROM = 'CIG Executive Hub <no-reply@cigconcepts.com>';

const NOTIFICATIONS = 'notifications';

// Immediate, or saved for the morning. Anything waiting on this person is
// immediate; anything that is just worth knowing waits.
const ACTION = 'action';
const AMBIENT = 'ambient';

async function push(tokens, title, body, data = {}) {
  const valid = tokens.filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken'));
  if (valid.length === 0) return;
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(valid.map((to) => ({ to, title, body, sound: 'default', data }))),
    });
    const result = await res.json();
    console.log(`push "${title}" to ${valid.length}`, JSON.stringify(result?.data?.slice?.(0, 3) ?? result));
  } catch (err) {
    console.error(`push "${title}" failed: ${err.message}`);
  }
}

/**
 * Everyone who can sign in. Test logins are left out of other people's
 * notifications but still receive their own, which is how notifications get
 * tested at all.
 */
async function everyone() {
  const snap = await admin.firestore().collection('users').get();
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((u) => u.active !== false);
}

/**
 * Resolves an audience to people. Any of:
 *   uids:  ['abc']            - these people
 *   jobs:  ['Videographer']   - whoever holds these titles
 *   roles: ['admin']          - whoever holds these roles
 *   brandId                   - narrowed to people who can see that restaurant
 * exceptUid drops the person who caused it: nobody needs telling about their
 * own action.
 */
async function audience({ uids = [], jobs = [], roles = [], brandId = null, exceptUid = null }) {
  const all = await everyone();
  const wanted = all.filter((u) => {
    if (u.uid === exceptUid) return false;
    if (u.isGhost === true && !uids.includes(u.uid)) return false;
    const byUid = uids.includes(u.uid);
    const byJob = u.job && jobs.includes(u.job);
    const byRole = roles.includes(u.role);
    if (!byUid && !byJob && !byRole) return false;
    // A restaurant limit never applies to someone named directly - being
    // tagged is the point, whatever they can otherwise see.
    if (brandId && !byUid && u.role === 'manager') {
      const theirs = u.permissions?.brandIds ?? [];
      if (!theirs.includes(brandId)) return false;
    }
    return true;
  });
  return wanted;
}

function wantsEmail(person, kind) {
  // all | action | none. Absent means the sensible default: immediate for
  // action, a morning summary for the rest.
  const pref = person.notifyEmail ?? 'default';
  if (pref === 'none') return false;
  if (pref === 'all') return true;
  if (pref === 'action') return kind === ACTION;
  return true; // default - ambient still arrives, just in the summary
}

function emailHtml({ name, title, body, link, kind }) {
  const needsYou = kind === ACTION;
  const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0A0B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0B;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;">
<tr><td style="font-family:${F};font-size:13px;color:#22D3EE;padding-bottom:18px;">CIG Executive Hub</td></tr>
${needsYou ? `<tr><td style="padding-bottom:16px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#3A2A0E" style="border-radius:6px;padding:7px 12px;font-family:${F};font-size:12px;font-weight:bold;color:#E8B93B;letter-spacing:0.4px;">NEEDS YOUR ATTENTION</td></tr></table></td></tr>` : ""}
<tr><td style="font-family:${F};font-size:19px;font-weight:bold;color:#FFFFFF;padding-bottom:8px;">${title}</td></tr>
<tr><td style="font-family:${F};font-size:14px;line-height:21px;color:#B4B4BB;padding-bottom:22px;">${body}</td></tr>
<tr><td><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td bgcolor="#22D3EE" style="border-radius:8px;">
<a href="${link}" style="display:inline-block;padding:11px 22px;font-family:${F};font-size:14px;font-weight:bold;color:#0A0A0B;text-decoration:none;">Open in the Hub</a>
</td></tr></table></td></tr>
<tr><td style="font-family:${F};font-size:12px;line-height:18px;color:#6C6C76;padding-top:26px;">
${name ? name + ', this' : 'This'} was sent because it needs you or your role. Replies to this address are not read &mdash; everything happens in the Hub.
</td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * The one way anything tells people about anything.
 *
 * Writes a record per person - which is what makes the morning summary
 * possible, and what Phase 5 reads to put tagged items on someone's home
 * screen - then pushes and emails according to what each of them wants.
 */
// One email per conversation, then nothing for twenty minutes - so a
// back-and-forth does not fill an inbox. Applies to chat only.
const THROTTLE_MS = 20 * 60 * 1000;

async function recentlyEmailed(db, uid, throttleKey) {
  const since = Date.now() - THROTTLE_MS;
  const snap = await db
    .collection(NOTIFICATIONS)
    .where('uid', '==', uid)
    .where('throttleKey', '==', throttleKey)
    .where('emailedAt', '>', since)
    .limit(1)
    .get();
  return snap.empty === false;
}

async function notify({ to, title, body, path = '/', kind = AMBIENT, throttleKey = null, data = {} }) {
  const people = await audience(to);
  if (people.length === 0) return { sent: 0 };

  const db = admin.firestore();
  const link = WEB_URL + path;
  const now = Date.now();

  const batch = db.batch();
  people.forEach((p) => {
    batch.set(db.collection(NOTIFICATIONS).doc(), {
      uid: p.uid,
      title,
      body,
      path,
      kind,
      createdAt: now,
      readAt: null,
      emailedAt: kind === ACTION ? now : null,
      throttleKey,
      ...data,
    });
  });
  await batch.commit();

  await push(people.map((p) => p.pushToken).filter(Boolean), title, body, { ...data, path });

  // Action items go out now. Ambient ones wait for the 8am summary, which is
  // what stops a busy day becoming a dozen separate emails.
  if (kind === ACTION && process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    for (const p of people) {
      if (!p.email || !wantsEmail(p, kind)) continue;
      if (throttleKey && (await recentlyEmailed(db, p.uid, throttleKey))) continue;
      try {
        await resend.emails.send({
          from: FROM,
          to: [p.email],
          // Says what it is before they open it.
          subject: (kind === ACTION ? 'Needs you: ' : '') + title,
          html: emailHtml({ name: p.name, title, body, link, kind }),
        });
      } catch (err) {
        console.error('email to ' + p.email + ' failed: ' + err.message);
      }
    }
  }

  console.log(`notify "${title}" to ${people.length} (${kind})`);
  return { sent: people.length };
}

/**
 * For triggers that have already worked out who should hear. Records the
 * notification, pushes, and emails on the same rules as notify.
 *
 * speed is 'action' - waiting on them, so it emails now - or 'ambient',
 * which waits for the 8am summary.
 */
async function notifyPeople(people, title, body, { speed = AMBIENT, path = '/', throttleKey = null, ...data } = {}) {
  const wanted = (people ?? []).filter((p) => p && p.uid);
  if (wanted.length === 0) return { sent: 0 };

  const db = admin.firestore();
  const now = Date.now();
  const batch = db.batch();
  wanted.forEach((p) => {
    batch.set(db.collection(NOTIFICATIONS).doc(), {
      uid: p.uid,
      title,
      body,
      path,
      kind: speed,
      throttleKey,
      createdAt: now,
      readAt: null,
      emailedAt: speed === ACTION ? now : null,
      ...data,
    });
  });
  await batch.commit();

  await push(wanted.map((p) => p.pushToken).filter(Boolean), title, body, { ...data, path });

  if (speed === ACTION && process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    for (const p of wanted) {
      if (!p.email || !wantsEmail(p, speed)) continue;
      if (throttleKey && (await recentlyEmailed(db, p.uid, throttleKey))) continue;
      try {
        await resend.emails.send({
          from: FROM,
          to: [p.email],
          subject: 'Needs you: ' + title,
          html: emailHtml({ name: p.name, title, body, link: WEB_URL + path, kind: ACTION }),
        });
      } catch (err) {
        console.error('email to ' + p.email + ' failed: ' + err.message);
      }
    }
  }

  console.log(`notify "${title}" to ${wanted.length} (${speed})`);
  return { sent: wanted.length };
}

module.exports = { notify, notifyPeople, audience, push, everyone, emailHtml, ACTION, AMBIENT, FROM, WEB_URL };
