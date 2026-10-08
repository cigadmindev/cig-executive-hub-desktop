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
const { layout } = require('./emailTemplate');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const { WEB_URL } = require('./emailTemplate');
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

// Leavers and ghost accounts hear nothing, from anywhere (S11).
const reachable = (u) => !!u && u.active !== false && u.isGhost !== true;

async function everyone() {
  const snap = await admin.firestore().collection('users').get();
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() })).filter(reachable);
}

// The one way the Hub sends an email (S11, 8 Oct).
//
// Resend does not throw when a send fails - it returns { error }. Nothing
// checked it, so a failed email was recorded as sent and dropped out of the
// morning summary. This checks the result, waits and tries once more when
// Resend says "too many at once", and paces sends to stay under its limit
// (about two a second). Returns { ok, error }.
let lastSendAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function sendEmail(message) {
  if (!process.env.RESEND_API_KEY) {
    console.error('Email not sent - RESEND_API_KEY is missing from this function. "' + message.subject + '"');
    return { ok: false, error: 'no API key' };
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const wait = lastSendAt + 600 - Date.now();
    if (wait > 0) await sleep(wait);
    lastSendAt = Date.now();
    let result;
    try {
      result = await resend.emails.send({ from: FROM, ...message });
    } catch (err) {
      result = { error: { message: err.message, name: 'exception' } };
    }
    if (!result?.error) return { ok: true, id: result?.data?.id ?? null };
    const tooMany = result.error.statusCode === 429 || /rate/i.test(result.error.name ?? '') || /rate/i.test(result.error.message ?? '');
    if (tooMany && attempt === 1) {
      await sleep(1500);
      continue;
    }
    console.error('Email to ' + [].concat(message.to).join(', ') + ' failed: ' + (result.error.message ?? JSON.stringify(result.error)));
    return { ok: false, error: result.error.message ?? 'failed' };
  }
  return { ok: false, error: 'failed' };
}

// Whether this person is emailed straight away for this notification.
//   default  urgent now; everything else in the 8am summary
//   all      everything now
//   action   urgent now; nothing else
//   none     nothing
function emailsNow(person, speed) {
  const pref = person.notifyEmail ?? 'default';
  if (pref === 'none') return false;
  if (pref === 'all') return true;
  return speed === ACTION;
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
const THROTTLE_MS = 10 * 60 * 1000;

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


/**
 * Stamped after a send succeeds, so emailedAt means an email went out rather
 * than that one was intended. The throttle reads it, and reading an intention
 * is what made chat block its own emails.
 */
// Stamped after a send succeeds, on the record written for this person in
// this same call (matched by its createdAt), so the throttle and the 8am
// summary both know an email actually went out.
async function markEmailed(db, uid, throttleKey, at, createdAt) {
  const snap = await db.collection(NOTIFICATIONS).where('uid', '==', uid).where('createdAt', '==', createdAt).get();
  await Promise.all(snap.docs.filter((d) => !d.data().emailedAt).map((d) => d.ref.update({ emailedAt: at })));
}

// What each topic is called at the top of its email.
const TOPIC_LABEL = {
  timeOff: 'Time off', eventRequest: 'Event request', accessRequest: 'Access request',
  deviceRequest: 'Device request', systemsHelp: 'Systems Help', catering: 'Catering',
  renewal: 'Renewal', signature: 'Signature', message: 'Message', tagged: 'Calendar',
  assignment: 'Opening checklist', expenses: 'Expenses', post: 'Post', folderPost: 'Post', calendar: 'Calendar',
};

/**
 * The one way anything tells people about anything.
 *
 *   people     who - already worked out by routing.js
 *   title      what happened, in a sentence
 *   body       one line of detail
 *   speed      ACTION (urgent: emails now) or AMBIENT (waits for 8am)
 *   topic      what kind of thing - a key of TOPIC_LABEL
 *   ref        the thing itself, e.g. 'timeOff/abc'. When it is dealt with,
 *              resolveRef(ref) clears it for everyone who was told.
 *   details    [label, value] rows for the email
 *   button     the email button's label
 *   why        the footer line: why this person got it
 *
 * Each person gets a record (the bell, and the 8am summary read these), a
 * push if they have the app, and an email according to their preference.
 */
async function notifyPeople(people, title, body, opts = {}) {
  const {
    speed = AMBIENT, path = '/', throttleKey = null, topic: topicIn = null, kind: legacyTopic = null,
    ref = null, details = null, button = null, why = null, ...data
  } = opts;
  const topic = topicIn ?? legacyTopic ?? null;
  // The one backstop: whatever list a caller worked out, nobody inactive or
  // ghost is told anything.
  const wanted = (people ?? []).filter((p) => p && p.uid && reachable(p));
  if (wanted.length === 0) return { sent: 0 };

  const db = admin.firestore();
  const now = Date.now();
  // Worked out before anything is written: afterwards every record looks
  // like a recent email and blocks itself.
  const throttled = new Set();
  if (throttleKey) {
    for (const t of wanted) {
      if (await recentlyEmailed(db, t.uid, throttleKey)) throttled.add(t.uid);
    }
  }

  const batch = db.batch();
  wanted.forEach((p) => {
    batch.set(db.collection(NOTIFICATIONS).doc(), {
      ...data,
      uid: p.uid,
      title,
      body,
      path,
      // Urgency and topic are separate fields. Writing the topic into kind
      // is what emptied the 8am summary - it looks for kind 'ambient'.
      kind: speed,
      topic,
      ref,
      throttleKey,
      createdAt: now,
      readAt: null,
      emailedAt: null,
      resolvedAt: null,
    });
  });
  await batch.commit();

  await push(wanted.map((p) => p.pushToken).filter(Boolean), title, body, { path });

  for (const p of wanted) {
    if (!p.email || !emailsNow(p, speed) || throttled.has(p.uid)) continue;
    const res = await sendEmail({
      to: [p.email],
      subject: (speed === ACTION ? 'Needs you: ' : '') + title,
      html: layout({
        urgent: speed === ACTION,
        kicker: TOPIC_LABEL[topic] ?? 'Update',
        title,
        intro: body,
        details,
        button: { label: button ?? 'Open in the Hub', url: WEB_URL + path },
        footer: why,
      }),
    });
    // Only marked emailed when it really went - otherwise it stays for the
    // morning summary.
    if (res.ok) await markEmailed(db, p.uid, throttleKey, Date.now(), now);
  }

  console.log('notify "' + title + '" to ' + wanted.length + ' (' + speed + (topic ? ', ' + topic : '') + ')');
  return { sent: wanted.length };
}

/**
 * Someone dealt with it - approved the time off, claimed the enquiry. Every
 * notification about that thing stops showing as waiting, for everyone who
 * was told, in the bell, on Home and in the 8am summary.
 */
async function resolveRef(ref, byName = null) {
  if (!ref) return 0;
  const db = admin.firestore();
  const snap = await db.collection(NOTIFICATIONS).where('ref', '==', ref).where('resolvedAt', '==', null).get();
  if (snap.empty) return 0;
  const now = Date.now();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    snap.docs.slice(i, i + 400).forEach((d) =>
      batch.update(d.ref, { resolvedAt: now, resolvedByName: byName, readAt: d.data().readAt ?? now })
    );
    await batch.commit();
  }
  return snap.size;
}

module.exports = { notifyPeople, resolveRef, push, everyone, emailsNow, sendEmail, reachable, ACTION, AMBIENT, FROM, WEB_URL, TOPIC_LABEL };
