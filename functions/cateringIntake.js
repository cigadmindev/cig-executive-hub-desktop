// Catering and private event enquiries, straight off the website form.
//
// The form emails Sarah and Ann Marie; they forward to catering@cigconcepts.com,
// which is an alias on info@ where a filter labels it. This reads that label
// every few minutes and creates a record, so nothing is retyped and nothing
// sits unnoticed in an inbox.
//
// Reading a mailbox on the domain needs domain-wide delegation, granted in the
// admin console to this project's service account with gmail.modify. The
// label is removed once an enquiry is filed, which is also what stops it being
// created twice.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { google } = require('googleapis');
const { notifyPeople, resolveRef, ACTION } = require('./notify');
const R = require('./routing');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');

const MAILBOX = 'info@cigconcepts.com';
const LABEL = 'catering';
const ZONE = 'America/Chicago';

// Who forwarded it tells us where it belongs - the two forms are separate and
// neither says which restaurant it is for.
const FORWARDER_LOCATIONS = {
  'sarah@tasteitaliankitchen.com': { locationId: 'taste-starkville', locationName: 'Starkville', brandId: 'taste', brandName: 'Taste Italian Kitchen' },
  'annmarie@tasteitaliankitchen.com': { locationId: 'taste-ridgeland', locationName: 'Ridgeland', brandId: 'taste', brandName: 'Taste Italian Kitchen' },
};

// The form's own labels, as they appear in the table.
const FIELDS = {
  name: ['Name'],
  email: ['Email'],
  phone: ['Phone'],
  organisation: ['Company, University Department or Organization', 'Company', 'Organization'],
  occasion: ['What are you celebrating or planning?', 'What are you celebrating'],
  preferredDate: ['Preferred Event Date', 'Event Date', 'Date'],
  preferredTime: ['Preferred Start Time', 'Start Time', 'Time for Pickup/Delivery'],
  guests: ['How many people?', 'Estimated Number of Guests', 'Number of Guests', 'Guest Count'],
  space: ['Do you have a space in mind?'],
  style: ['What style of event are you planning?'],
  about: ['Tell us a little about your event.', 'Tell us a little about your event'],
  // Catering only.
  locationText: ['Location'],
  fulfilment: ['Pick-up or Delivery?'],
  address: ['Where is the location?'],
};

async function gmailAs(userEmail) {
  const key = JSON.parse(process.env.DRIVE_SA_KEY);
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    // Acting as the mailbox, which is what the delegation grants.
    subject: userEmail,
  });
  await auth.authorize();
  return google.gmail({ version: 'v1', auth });
}

/** The readable text of a message, whichever part it is hiding in. */
function textOf(payload) {
  const parts = [];
  const walk = (p) => {
    if (!p) return;
    if (p.body?.data) {
      parts.push({ mime: p.mimeType, text: Buffer.from(p.body.data, 'base64').toString('utf8') });
    }
    (p.parts ?? []).forEach(walk);
  };
  walk(payload);
  const plain = parts.find((p) => p.mime === 'text/plain');
  if (plain) return plain.text;
  const html = parts.find((p) => p.mime === 'text/html');
  if (!html) return '';
  // The form sends a table; the labels and values survive stripping the tags,
  // one per line, which is all the parsing below needs.
  return html.text
    .replace(/<\/(td|tr|div|p|h\d)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

/** The value under a label, since the form puts each on its own line. */
function valueFor(lines, labels, multiline = false) {
  // A label may arrive as "Name", "*Name*" or "**Name**" depending on which
  // form sent it and what the forward did to the formatting.
  const clean = (x) => x.replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const allLabels = Object.values(FIELDS).flat().map(clean);

  for (let i = 0; i < lines.length; i++) {
    if (!labels.some((l) => clean(lines[i]) === clean(l))) continue;
    const collected = [];
    for (let j = i + 1; j < lines.length; j++) {
      const v = lines[j].replace(/\*/g, '').trim();
      if (allLabels.includes(clean(v))) break;
      if (!v) {
        if (collected.length > 0 && !multiline) break;
        continue;
      }
      collected.push(v);
      if (!multiline) return v;
      // A paragraph, not the rest of the email.
      if (collected.length >= 12) break;
    }
    if (collected.length > 0) return collected.join(' ');
  }
  return '';
}

function headerOf(message, name) {
  const h = (message.payload?.headers ?? []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

/** 05/08/2027 or 2027-05-08, whichever the form sends. */
function parseDate(text) {
  if (!text) return null;
  const us = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]), 12).getTime();
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12).getTime();
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

exports.pullCateringEnquiries = onSchedule(
  { schedule: 'every 5 minutes', timeZone: ZONE, timeoutSeconds: 300, secrets: ['DRIVE_SA_KEY', 'RESEND_API_KEY'] },
  async () => {
    let gmail;
    try {
      gmail = await gmailAs(MAILBOX);
    } catch (err) {
      console.error('Could not reach the mailbox: ' + err.message);
      return;
    }

    const labels = await gmail.users.labels.list({ userId: 'me' });
    const label = (labels.data.labels ?? []).find((l) => l.name.toLowerCase() === LABEL);
    if (!label) {
      console.error('No "' + LABEL + '" label on ' + MAILBOX);
      return;
    }

    const list = await gmail.users.messages.list({ userId: 'me', labelIds: [label.id], maxResults: 25 });
    const messages = list.data.messages ?? [];
    if (messages.length === 0) {
      console.log('Nothing new.');
      return;
    }

    const db = admin.firestore();
    const users = await R.activeUsers();
    let created = 0;

    // Tells the right people about one enquiry, and records that it did, so
    // a crash between saving and telling is caught on the next run (S12).
    const announce = async (docRef, e) => {
      const isPrivateEvent = e.kind === 'privateEvent';
      const who = e.name || 'Someone';
      const what = (isPrivateEvent ? 'Private event' : 'Catering') + (e.guests ? ' for ' + e.guests : '');
      let team = e.locationId ? await R.cateringTeam(users, e.locationId) : [];
      const placed = e.locationId && team.length > 0;
      // No location, or nobody at that location to tell: admins, rather than
      // everyone or no one.
      if (!placed) team = R.admins(users);
      await notifyPeople(
        team,
        e.locationId
          ? 'New ' + (isPrivateEvent ? 'private event' : 'catering') + ' enquiry · ' + e.locationName
          : 'Catering enquiry needs a location',
        who + ' · ' + what,
        {
          speed: ACTION,
          topic: 'catering',
          ref: 'catering/' + docRef.id,
          path: '/catering',
          details: [['Name', who], ['When', e.preferredDateText ?? ''], ['Guests', e.guests ?? ''], ['Occasion', e.occasion ?? '']].filter(([, v]) => v),
          button: e.locationId ? 'Claim it' : 'Choose its location',
          why: placed
            ? 'You got this because you look after catering at ' + e.locationName + '.'
            : e.locationId
              ? 'You got this because you are an admin and nobody looks after catering at ' + e.locationName + ' in the Hub.'
              : 'You got this because you are an admin and nobody else could be told.',
          locationId: e.locationId ?? null,
        }
      );
      await docRef.update({ notifiedAt: Date.now() });
    };

    const unlabel = (id) => gmail.users.messages.modify({ userId: 'me', id, requestBody: { removeLabelIds: [label.id] } });

    for (const ref of messages) {
      // One email that keeps failing no longer stops every email after it.
      try {
        const res = await gmail.users.messages.get({ userId: 'me', id: ref.id, format: 'full' });
        const message = res.data;

        const subject = headerOf(message, 'Subject');
        const from = headerOf(message, 'From').toLowerCase();
        const forwardedBy = Object.keys(FORWARDER_LOCATIONS).find((addr) => from.includes(addr));
        let place = forwardedBy ? FORWARDER_LOCATIONS[forwardedBy] : null;

        const body = textOf(message.payload);
        const lines = body.split('\n');
        const named = valueFor(lines, FIELDS.locationText);
        if (named) {
          const match = Object.values(FORWARDER_LOCATIONS).find(
            (l) => l.locationName.toLowerCase() === named.trim().toLowerCase()
          );
          // The catering form says where it is for, which beats guessing from
          // whoever happened to forward it.
          if (match) place = match;
        }
        const get = (key) => valueFor(lines, FIELDS[key]);

        // The only difference between the two: a private event says so.
        const isPrivateEvent = /private\s*(dining|event)/i.test(subject);

        // Filed under the email's own id, so the same email can never become
        // two enquiries - even if taking its label off fails.
        const docRef = db.collection('cateringEnquiries').doc('gmail-' + ref.id);
        const existing = await docRef.get();
        if (existing.exists) {
          if (!existing.data().notifiedAt) await announce(docRef, existing.data());
          await unlabel(ref.id);
          continue;
        }

        // The same form forwarded by both Sarah and Ann Marie arrives as two
        // emails with different ids. What the customer typed is the same, so
        // that is what identifies it (S12).
        const norm = (x) => String(x ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
        const fingerprint = crypto
          .createHash('sha256')
          .update([isPrivateEvent ? 'p' : 'c', norm(get('email')) || norm(get('phone')), norm(get('name')), norm(get('preferredDate')), norm(get('guests')), norm(valueFor(lines, FIELDS.about, true)).slice(0, 300)].join('|'))
          .digest('hex');
        const twin = await db.collection('cateringEnquiries').where('fingerprint', '==', fingerprint).limit(1).get();
        if (!twin.empty) {
          await twin.docs[0].ref.update({ alsoForwardedBy: admin.firestore.FieldValue.arrayUnion(forwardedBy ?? from) });
          console.log('Same enquiry forwarded again by ' + (forwardedBy ?? from) + ' - kept as one.');
          await unlabel(ref.id);
          continue;
        }

        const data = {
          kind: isPrivateEvent ? 'privateEvent' : 'catering',
          name: get('name'),
          email: get('email'),
          phone: get('phone'),
          organisation: get('organisation'),
          space: get('space'),
          style: get('style'),
          about: valueFor(lines, FIELDS.about, true),
          fulfilment: get('fulfilment'),
          address: get('address'),
          occasion: get('occasion'),
          guests: get('guests'),
          preferredDate: parseDate(get('preferredDate')),
          preferredDateText: get('preferredDate'),
          preferredTime: get('preferredTime'),

          locationId: place?.locationId ?? null,
          locationName: place?.locationName ?? '',
          brandId: place?.brandId ?? null,
          brandName: place?.brandName ?? '',
          // Kept so an unrecognised forwarder can be put right by hand rather
          // than the enquiry being lost.
          forwardedBy: forwardedBy ?? from,
          subject,
          fingerprint,

          status: 'new',
          ownerUid: null,
          ownerName: '',
          minimum: '',
          finalGuests: '',
          details: '',
          invoicedAt: null,
          paidAt: null,
          calendarEntryId: null,
          createdAt: Date.now(),
          notifiedAt: null,
        };
        await docRef.set(data);
        created++;
        await announce(docRef, data);

        // Filed, so it does not come round again.
        await unlabel(ref.id);
      } catch (err) {
        console.error('Catering email ' + ref.id + ' could not be filed: ' + err.message);
      }
    }

    console.log('Catering enquiries created: ' + created);

  }
);

// Claimed - it is no longer waiting on the rest of the location's team.
// Moved by an admin - whoever is on it is told what changed and why; if
// nobody has claimed it, the location's catering team is.
const STEP = { new: 'New', talking: 'Talking', confirmed: 'Confirmed', done: 'Done', lost: 'Lost' };
exports.onCateringEnquiryUpdated = onDocumentUpdated({ document: 'cateringEnquiries/{id}', secrets: ['RESEND_API_KEY'] }, async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  if (!before.ownerUid && after.ownerUid) await resolveRef('catering/' + event.params.id, after.ownerName || null);

  if (after.statusChangedAt && after.statusChangedAt !== before.statusChangedAt) {
    const users = await R.activeUsers();
    // Whoever claimed it; if nobody, the location's team; with no location
    // or nobody there, admins (S12) - never everyone.
    let people = after.ownerUid ? users.filter((u) => u.uid === after.ownerUid) : [];
    if (!people.length && after.locationId) people = await R.cateringTeam(users, after.locationId);
    if (!people.length) people = R.admins(users);
    await notifyPeople(
      people,
      'Catering enquiry changed · ' + (after.name || 'No name'),
      (after.statusChangedByName || 'An admin') + ' changed it from ' + (STEP[before.status] ?? before.status) + ' to ' + (STEP[after.status] ?? after.status) + '. ' + (after.statusChangeReason || ''),
      {
        speed: ACTION, topic: 'catering', path: '/catering', button: 'Open Catering', locationId: after.locationId ?? null,
        why: after.ownerUid ? 'You got this because you are handling this enquiry.' : 'You got this because you look after catering at ' + (after.locationName || 'this location') + '.',
      }
    );
  }
});
