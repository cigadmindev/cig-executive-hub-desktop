// Daily opening and closing checklists (Taste Starkville and Ridgeland).
//
//   fileDailyChecklist   the manager on duty signs a list off: it is drawn as
//                        a PDF in the layout of the printed sheet and filed to
//                        the location's Drive, Operations › Opening & Closing
//                        Checklists › YYYY-MM, then locked.
//   dailyChecklistWatch  17:00: today's OPENING lists not signed off → that
//                        location's GM (16 Oct 2026; was 22:00).
//   dailyClosingWatch    00:00: tonight's CLOSING lists not signed off yet →
//                        that location's GM (16 Oct 2026; was 10:00 next day).
//   dailyLateWatch       10:00: anything from yesterday still not signed off
//                        → the COO and admins.
//   dailyChecklistWeekly Monday 08:00: last week's sign-off rates → the COO.
//
// A "day" runs 4am to 4am, so a closing list finished at 12:30am still
// belongs to the night before. Same rule in src/hooks/useDailyChecklists.js.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const { Readable } = require('stream');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { notifyPeople, sendEmail, ACTION } = require('./notify');
const R = require('./routing');
const M = require('./accessMatrix.gen');
const { requireLive } = require('./caller');

const ZONE = 'America/Chicago';
const COLLECTION = 'dailyChecklists';
const FOLDER = 'application/vnd.google-apps.folder';
const DRIVE_ID = '0ANOluAAxZB7lUk9PVA';
const SHARED = { corpora: 'drive', driveId: DRIVE_ID, includeItemsFromAllDrives: true, supportsAllDrives: true };

// The lists each location runs - kept in step with src/data/dailyChecklists.js.
const LISTS = {
  'taste-starkville': [
    ['host-opening', 'Host Opening'], ['server-opening', 'Server Opening'], ['bar-opening', 'Main Bar Opening'], ['veranda-opening', 'Veranda Opening'],
    ['kitchen-opening', 'Kitchen Opening'],
    ['host-closing', 'Host Closing'], ['server-closing', 'Server / Food Runner Closing'], ['bar-closing', 'Bar Closing'], ['boh-closing', 'Kitchen Closing'],
  ],
  // Ridgeland, set up like Starkville (12 Oct 2026): its own kitchen sheets
  // and Starkville's front of house adapted for Ridgeland.
  'taste-ridgeland': [
    ['ridgeland-manager-opening', 'Manager Opening'], ['ridgeland-host-opening', 'Host Opening'], ['ridgeland-server-opening', 'Server Opening'], ['ridgeland-bar-opening', 'Main Bar Opening'],
    ['ridgeland-terrazza-opening', 'Terrazza Opening'], ['ridgeland-chef-opening', 'Kitchen Opening'],
    ['ridgeland-host-closing', 'Host Closing'], ['ridgeland-server-closing', 'Server / Food Runner Closing'], ['ridgeland-bar-closing', 'Bar Closing'],
    ['ridgeland-chef-closing', 'Kitchen Closing'], ['ridgeland-manager-closing', 'Manager Closing'],
  ],
};
const isClosing = (listId) => listId.endsWith('-closing');
// Lists that can be marked "not open today" (16 Oct 2026): Starkville's Veranda.
const NOT_OPEN_LISTS = ['veranda-opening'];

const centralKey = (d) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return g('year') + '-' + g('month') + '-' + g('day');
};
const timeOf = (t) => (t ? new Date(t).toLocaleTimeString('en-US', { timeZone: ZONE, hour: 'numeric', minute: '2-digit' }) : '');

async function drive() {
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive'] });
  return google.drive({ version: 'v3', auth: await auth.getClient() });
}
async function ensureChild(d, parentId, name) {
  const esc = String(name).replace(/'/g, "\\'");
  const found = await d.files.list({ q: `'${parentId}' in parents and name = '${esc}' and mimeType = '${FOLDER}' and trashed = false`, fields: 'files(id)', pageSize: 1, ...SHARED });
  if (found.data.files?.[0]) return found.data.files[0].id;
  const made = await d.files.create({ requestBody: { name, mimeType: FOLDER, parents: [parentId] }, fields: 'id', supportsAllDrives: true });
  return made.data.id;
}

// The location's "Opening & Closing Checklists" folder, from the link the
// Drive setup recorded for it.
// Looked up by location and folder name rather than by document id: older
// links (Starkville's) were saved before ids were encoded, so the same folder
// can sit under either spelling (10 Oct 2026).
async function checklistsFolder(locationId) {
  const snap = await admin.firestore().collection('categoryDriveLinks')
    .where('locationId', '==', locationId)
    .where('categoryId', '==', 'operations')
    .where('itemName', '==', 'Opening & Closing Checklists')
    .get();
  const url = snap.docs.map((d) => d.data().driveUrl).find(Boolean) ?? null;
  const m = url && url.match(/folders\/([\w-]+)/);
  if (!m) throw new HttpsError('failed-precondition', "This location's Drive folders aren't set up yet - run Drive setup for it first.");
  return m[1];
}

// ---- The PDF: the printed sheet, filled in ----
// photos: { [taskIndex]: [{ bytes, type }] } - from the notes (16 Oct 2026).
async function drawPdf(r, locationName, photos = {}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 46;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ink = rgb(0.1, 0.1, 0.1), soft = rgb(0.42, 0.42, 0.45), line = rgb(0.82, 0.82, 0.84), accent = rgb(0.04, 0.55, 0.65);
  const clean = (s) => String(s ?? '').replace(/·/g, '-').replace(/[–—]/g, '-').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/½/g, '1/2').replace(/°/g, ' deg').replace(/[éèê]/g, 'e').replace(/[ÉÈ]/g, 'E').replace(/[^\x20-\x7E\n]/g, '');
  const wrap = (text, f, size, width) => {
    const out = [];
    for (const para of clean(text).split('\n')) {
      let cur = '';
      for (const w of para.split(' ')) {
        const next = cur ? cur + ' ' + w : w;
        if (f.widthOfTextAtSize(next, size) > width && cur) { out.push(cur); cur = w; } else cur = next;
      }
      out.push(cur);
    }
    return out;
  };
  const need = (h) => { if (y - h < M + 20) { page = pdf.addPage([W, H]); y = H - M; } };
  const text = (s, x, size, f = font, color = ink) => page.drawText(clean(s), { x, y, size, font: f, color });

  text('TASTE ITALIAN KITCHEN - ' + locationName.toUpperCase(), M, 9, font, soft); y -= 22;
  text(r.title.toUpperCase(), M, 18, bold); y -= 16;
  text(r.subtitle, M, 10, font, soft); y -= 24;
  const fields = [['DATE', r.dateKey], ...Object.entries(r.workers ?? {}).map(([k, v]) => [k.toUpperCase(), v || '-']), ['MANAGER ON DUTY', (r.managers ?? []).join(', ') || '-']];
  const colW = (W - 2 * M) / fields.length;
  fields.forEach(([k, v], i) => { page.drawText(clean(k), { x: M + i * colW, y, size: 7, font, color: soft }); page.drawText(clean(v), { x: M + i * colW, y: y - 12, size: 10, font: bold, color: ink }); });
  y -= 32;
  for (const l of wrap(r.intro ?? '', font, 8, W - 2 * M)) { text(l, M, 8, font, soft); y -= 11; }
  y -= 6;
  const secW = r.sections ? 70 : 0, initW = 90, taskW = W - 2 * M - secW - initW;
  page.drawText('TASK', { x: M, y, size: 7, font: bold, color: soft });
  if (r.sections) page.drawText('SECTION', { x: M + taskW, y, size: 7, font: bold, color: soft });
  page.drawText('INITIAL', { x: W - M - initW, y, size: 7, font: bold, color: soft });
  y -= 8;
  // The Veranda was not open (16 Oct 2026): a one-page record, no tasks.
  if (r.notOpen) {
    y -= 10;
    text('NOT OPEN TODAY', M, 16, bold, accent); y -= 20;
    text('Marked by ' + (r.filedByName ?? '') + ' at ' + timeOf(r.filedAt) + ', ' + r.dateKey + '.', M, 10, font, ink); y -= 14;
    text('Nothing on this list was needed. It counts as done for the week.', M, 9, font, soft); y -= 30;
    text('CIG Executive Hub', M, 8, font, soft);
    return pdf.save();
  }
  const embedded = {};
  for (const [i, list] of Object.entries(photos)) {
    embedded[i] = [];
    for (const ph of list) {
      try { embedded[i].push(ph.type === 'png' ? await pdf.embedPng(ph.bytes) : await pdf.embedJpg(ph.bytes)); } catch (e) { /* an unreadable photo is skipped, not fatal */ }
    }
  }
  const PH = 96; // photo row height
  for (const [ti, t] of r.tasks.entries()) {
    if (t.group) {
      need(24); y -= 14;
      text(t.group.toUpperCase(), M, 9, bold, accent); y -= 6;
      continue;
    }
    const lines = wrap(t.details ?? '', font, 8, taskW - 8);
    const titleLines = wrap(t.title, bold, 10, taskW - 8);
    // A ticked task's note is information; an unticked one's says why it
    // couldn't be done (15 Oct 2026). Wrapped, so a long note stays on the page.
    const noteLines = t.note ? wrap(clean((t.done ? 'Note: ' : "Couldn't be done: ") + t.note + (t.noteByName ? ' - ' + t.noteByName : '')), font, 8, taskW - 8) : [];
    const pics = embedded[ti] ?? [];
    const h = 8 + titleLines.length * 13 + (t.details ? lines.length * 10 : 0) + noteLines.length * 10 + (noteLines.length ? 2 : 0) + 6 + (pics.length ? PH + 8 : 0);
    need(h);
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: line });
    let yy = y - 14;
    for (const l of titleLines) { page.drawText(l, { x: M, y: yy, size: 10, font: bold, color: ink }); yy -= 13; }
    if (t.details) for (const l of lines) { page.drawText(l, { x: M, y: yy, size: 8, font, color: soft }); yy -= 10; }
    for (const l of noteLines) { page.drawText(l, { x: M, y: yy, size: 8, font, color: t.done ? soft : rgb(0.7, 0.45, 0) }); yy -= 10; }
    // The note's photos in a row underneath it.
    let px = M;
    for (const img of pics) {
      const w = Math.min((img.width / img.height) * PH, 150);
      const hh = (w / img.width) * img.height;
      if (px + w > M + taskW) break;
      page.drawImage(img, { x: px, y: yy - hh - 2, width: w, height: hh });
      px += w + 6;
    }
    if (r.sections && t.section) page.drawText(clean(t.section), { x: M + taskW, y: y - 14, size: 9, font, color: ink });
    const bx = W - M - initW;
    page.drawRectangle({ x: bx, y: y - 22, width: 14, height: 14, borderColor: soft, borderWidth: 0.8 });
    if (t.done) {
      page.drawText('X', { x: bx + 3.5, y: y - 19, size: 10, font: bold, color: accent });
      const who = (t.byName ?? '').split(' ').map((p) => p[0]).join('');
      page.drawText(clean(who + ' ' + timeOf(t.at)), { x: bx + 20, y: y - 18, size: 8, font, color: ink });
    }
    y -= h;
  }
  // The boxes at the foot of the sheet ("Maintenance / Equipment Issues"…),
  // filled in or not, as on paper.
  for (const { key, label } of r.noteLabels ?? []) {
    const body = wrap(r.notes?.[key] || '-', font, 9, W - 2 * M);
    need(26 + body.length * 12);
    y -= 18;
    text(String(label).toUpperCase(), M, 7, bold, soft); y -= 13;
    for (const l of body) { text(l, M, 9, font, ink); y -= 12; }
  }
  need(40); y -= 18;
  text('Signed off by ' + (r.filedByName ?? '') + ' at ' + timeOf(r.filedAt) + ', ' + r.dateKey + ' - CIG Executive Hub', M, 8, font, soft);
  return pdf.save();
}

// Does this person work the daily checklists at this location?
async function worksHere(me, brandId, locationId) {
  const matrix = await R.liveMatrix();
  const works = (job) => {
    const row = M.rowForJob(job);
    return !!row && (matrix[row.id] ?? row.d).dailyChecklists === 'work';
  };
  if (works(me.job) && R.seesLocation(me, brandId, locationId)) return true;
  return works(me.alsoJob?.job) && me.alsoJob?.locationId === locationId && R.seesLocation(me, brandId, locationId);
}

exports.fileDailyChecklist = onCall({ timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  await requireLive(request);
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const db = admin.firestore();
  const me = (await db.collection('users').doc(request.auth.uid).get()).data() ?? {};
  const ref = db.collection(COLLECTION).doc(String(request.data?.id ?? ''));
  const first = await ref.get();
  if (!first.exists) throw new HttpsError('not-found', 'No such checklist.');
  // "The Veranda wasn't open today" (16 Oct 2026) - only on lists that can
  // be closed for the day.
  const notOpen = request.data?.notOpen === true;
  if (notOpen && !NOT_OPEN_LISTS.includes(first.data().listId)) throw new HttpsError('invalid-argument', 'This list cannot be marked as not open.');
  // An admin taking a "not open" back, the same day it was marked.
  if (request.data?.undoNotOpen === true) {
    if (me.role !== 'admin') throw new HttpsError('permission-denied', 'Only an admin can undo this.');
    const x = first.data();
    if (!x.notOpen) throw new HttpsError('failed-precondition', 'This list was not marked as not open.');
    if (x.fileId) await (await drive()).files.update({ fileId: x.fileId, requestBody: { trashed: true }, supportsAllDrives: true }).catch(() => {});
    await ref.update({ status: 'open', notOpen: false, fileId: null, fileUrl: null, filedAt: null, filedByName: null });
    return { ok: true };
  }
  // Who signs off (14 Oct 2026): the Daily checklists column of Who sees
  // what - GMs, AGMs and chefs by default - at this location, by their own
  // job or by a second job here (Cameron, Starkville GM). The same answer
  // the rules and the screens give.
  const onDuty = await worksHere(me, first.data().brandId, first.data().locationId);
  if (me.role !== 'admin' && !onDuty) {
    throw new HttpsError('permission-denied', 'Only the manager on duty at this location can sign a checklist off.');
  }

  // Claimed in one step, so a double tap or a retry files one PDF, not two.
  // A claim older than five minutes is a run that died - it can be taken over.
  const claim = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const x = s.data();
    if (x.status === 'filed') return { already: true, r: x };
    if (x.status === 'filing' && Date.now() - (x.filingAt ?? 0) < 5 * 60 * 1000) return { busy: true };
    const open = notOpen ? [] : (x.tasks ?? []).filter((t) => !t.group && !t.done && !t.note);
    if (open.length) return { open: open.length };
    tx.update(ref, { status: 'filing', filingAt: Date.now() });
    return { r: x };
  });
  if (claim.already) return { ok: true, already: true, fileUrl: claim.r.fileUrl };
  if (claim.busy) throw new HttpsError('aborted', 'Someone is signing this off right now - give it a moment.');
  if (claim.open) throw new HttpsError('failed-precondition', claim.open + ' task(s) are neither ticked nor noted.');
  const r = claim.r;
  try {

  const filedAt = Date.now();
  const managers = Array.from(new Set([...(r.managers ?? []), ...(onDuty ? [me.name] : [])]));
  const full = { ...r, managers, filedByName: me.name ?? '', filedAt, notOpen };
  const locationName = await R.locationName(r.locationId);
  // Photos on notes (16 Oct 2026), read from Storage for the PDF and copied
  // next to it in Drive.
  const photos = {};
  const bucket = admin.storage().bucket();
  if (!notOpen) {
    for (const [i, t] of (r.tasks ?? []).entries()) {
      for (const ph of (t.photos ?? []).slice(0, 6)) {
        if (typeof ph?.path !== 'string' || !ph.path.startsWith('dailyChecklistPhotos/' + ref.id + '/')) continue;
        try {
          const [bytes] = await bucket.file(ph.path).download();
          (photos[i] = photos[i] ?? []).push({ bytes, type: /\.png$/i.test(ph.path) ? 'png' : 'jpg', title: t.title });
        } catch (e) { console.error('Photo ' + ph.path + ': ' + e.message); }
      }
    }
  }
  const bytes = await drawPdf(full, locationName.replace(/^Taste\s+/i, ''), photos);

  const d = await drive();
  const parent = await checklistsFolder(r.locationId);
  const month = await ensureChild(d, parent, r.dateKey.slice(0, 7));
  const name = r.dateKey + ' ' + r.title.replace(' Checklist', '') + (notOpen ? ' (not open)' : '') + '.pdf';
  // Already in Drive from a run that uploaded but did not finish? Use that
  // one rather than filing a second copy.
  const esc = name.replace(/'/g, "\\'");
  const existing = await d.files.list({ q: `'${month}' in parents and name = '${esc}' and trashed = false`, fields: 'files(id, webViewLink)', pageSize: 1, ...SHARED });
  const file = existing.data.files?.[0]
    ? { data: existing.data.files[0] }
    : await d.files.create({
        requestBody: { name, parents: [month], mimeType: 'application/pdf' },
        media: { mimeType: 'application/pdf', body: Readable.from(Buffer.from(bytes)) },
        fields: 'id, webViewLink',
        supportsAllDrives: true,
      });
  // The photos themselves, beside the PDF: "2026-10-16 Kitchen Opening - Fryer 1.jpg".
  let n = 0;
  for (const list of Object.values(photos)) {
    for (const ph of list) {
      n++;
      const pname = r.dateKey + ' ' + r.title.replace(' Checklist', '') + ' - ' + String(ph.title).replace(/[\\/:*?"<>|]/g, '').slice(0, 40) + ' ' + n + '.' + ph.type;
      const pesc = pname.replace(/'/g, "\\'");
      const dupe = await d.files.list({ q: `'${month}' in parents and name = '${pesc}' and trashed = false`, fields: 'files(id)', pageSize: 1, ...SHARED });
      if (dupe.data.files?.[0]) continue;
      await d.files.create({
        requestBody: { name: pname, parents: [month] },
        media: { mimeType: ph.type === 'png' ? 'image/png' : 'image/jpeg', body: Readable.from(ph.bytes) },
        fields: 'id', supportsAllDrives: true,
      }).catch((e) => console.error('Photo to Drive: ' + e.message));
    }
  }
  await ref.update({ status: 'filed', notOpen, managers, filedByName: me.name ?? '', filedAt, fileId: file.data.id, fileUrl: file.data.webViewLink, filingAt: null });
  return { ok: true, fileUrl: file.data.webViewLink };
  } catch (err) {
    // Handed back so it can be tried again.
    await ref.update({ status: 'open', filingAt: null }).catch(() => {});
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', 'Could not file it: ' + err.message);
  }
});

// A list is "missing" for a day until it is filed.
async function missingLists(db, locationId, lists, day) {
  const snap = await db.collection(COLLECTION).where('locationId', '==', locationId).where('dateKey', '==', day).get();
  const filed = new Set(snap.docs.filter((x) => x.data().status === 'filed').map((x) => x.data().listId));
  return lists.filter(([id]) => !filed.has(id));
}
const names = (ls) => ls.map(([, n]) => n).join(', ');
const daysAgo = (n) => centralKey(new Date(Date.now() - n * 24 * 60 * 60 * 1000));

// When people are told (16 Oct 2026): the GM at 5pm about today's openings
// and at midnight about tonight's closings, while there is still time to get
// them done; the COO and admins at 10am about anything from yesterday that
// still never got signed off. A day runs 4am to 4am, so a closing list
// finished at 12:30am still clears the next morning's email.
exports.dailyChecklistWatch = onSchedule(
  { schedule: '0 17 * * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'], timeoutSeconds: 540 },
  async () => {
    const db = admin.firestore();
    const users = await R.activeUsers();
    const today = centralKey(new Date());
    for (const [locationId, lists] of Object.entries(LISTS)) {
      const brandId = await R.brandForLocation(locationId);
      const where = await R.locationName(locationId);
      const path = '/brand/' + brandId + '/location/' + locationId + '/daily-checklists';
      const openingMissing = (await missingLists(db, locationId, lists, today)).filter(([id]) => !isClosing(id));
      if (!openingMissing.length) continue;
      const gms = R.atLocation(users, ['General Manager'], brandId, locationId);
      await notifyPeople(gms.length ? gms : R.admins(users), openingMissing.length + ' opening checklist' + (openingMissing.length === 1 ? '' : 's') + ' not signed off · ' + where, names(openingMissing), {
        speed: ACTION, topic: 'assignment', path: path + '?date=' + today, button: 'Open the checklists',
        why: gms.length ? 'You got this because you are the GM at ' + where + '.' : 'You got this because ' + where + ' has no GM in the Hub.',
        throttleKey: 'daily-' + locationId + '-' + today,
      });
    }
  }
);

exports.dailyClosingWatch = onSchedule(
  { schedule: '0 0 * * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'], timeoutSeconds: 540 },
  async () => {
    const db = admin.firestore();
    const users = await R.activeUsers();
    // Midnight: the business day that is closing is yesterday's date.
    const tonight = daysAgo(1);
    for (const [locationId, lists] of Object.entries(LISTS)) {
      const brandId = await R.brandForLocation(locationId);
      const where = await R.locationName(locationId);
      const path = '/brand/' + brandId + '/location/' + locationId + '/daily-checklists';
      const closingMissing = (await missingLists(db, locationId, lists, tonight)).filter(([id]) => isClosing(id));
      if (!closingMissing.length) continue;
      const gms = R.atLocation(users, ['General Manager'], brandId, locationId);
      await notifyPeople(gms.length ? gms : R.admins(users), 'Tonight\'s closing checklist' + (closingMissing.length === 1 ? '' : 's') + ' not signed off yet · ' + where, names(closingMissing), {
        speed: ACTION, topic: 'assignment', path: path + '?date=' + tonight, button: 'Open the checklists',
        why: gms.length ? 'You got this because you are the GM at ' + where + '.' : 'You got this because ' + where + ' has no GM in the Hub.',
        throttleKey: 'daily-closing-' + locationId + '-' + tonight,
      });
    }
  }
);

// 10am: yesterday's lists that never got signed off, openings and closings.
exports.dailyLateWatch = onSchedule(
  { schedule: '0 10 * * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'], timeoutSeconds: 540 },
  async () => {
    const db = admin.firestore();
    const users = await R.activeUsers();
    const yesterday = daysAgo(1);
    for (const [locationId, lists] of Object.entries(LISTS)) {
      const brandId = await R.brandForLocation(locationId);
      const where = await R.locationName(locationId);
      const path = '/brand/' + brandId + '/location/' + locationId + '/daily-checklists';
      const lateMissing = await missingLists(db, locationId, lists, yesterday);
      if (!lateMissing.length) continue;
      await notifyPeople(R.approvers(users), 'Yesterday\'s checklists were never signed off · ' + where, names(lateMissing), {
        speed: ACTION, topic: 'assignment', path: path + '?date=' + yesterday, button: 'See them',
        why: 'You got this because you are the COO or an admin.', throttleKey: 'daily-late-' + locationId + '-' + yesterday,
      });
    }
  }
);

// Monday 8am: last week's sign-off rate at each location, for the COO
// (16 Oct 2026). A day counts when the list was filed - including a
// Veranda day marked "not open".
exports.dailyChecklistWeekly = onSchedule(
  { schedule: '0 8 * * 1', timeZone: ZONE, secrets: ['RESEND_API_KEY'], timeoutSeconds: 540 },
  async () => {
    const db = admin.firestore();
    const users = await R.activeUsers();
    const days = [7, 6, 5, 4, 3, 2, 1].map(daysAgo); // last Monday .. Sunday
    const label = (k) => new Date(k + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
    const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
    const T = require('./emailTemplate');
    const parts = [];
    const summary = [];
    for (const [locationId, lists] of Object.entries(LISTS)) {
      const where = await R.locationName(locationId);
      const filed = {}; // listId -> set of days
      for (const day of days) {
        const snap = await db.collection(COLLECTION).where('locationId', '==', locationId).where('dateKey', '==', day).get();
        snap.docs.filter((x) => x.data().status === 'filed').forEach((x) => { (filed[x.data().listId] = filed[x.data().listId] ?? new Set()).add(day); });
      }
      const rows = lists.map(([id, name]) => {
        const got = filed[id] ?? new Set();
        return { id, name, got: got.size, missed: days.filter((d) => !got.has(d)) };
      });
      const sum = (rs) => rs.reduce((n, r) => n + r.got, 0);
      const open = rows.filter((r) => !isClosing(r.id)), close = rows.filter((r) => isClosing(r.id));
      const all = pct(sum(rows), rows.length * 7);
      summary.push([where, all + '%']);
      const items = rows.map((r) => ({
        title: r.name + ' · ' + r.got + ' of 7',
        line: r.missed.length ? 'Missed: ' + r.missed.map(label).join(', ') : 'Every day signed off',
        url: T.WEB_URL, action: pct(r.got, 7) + '%',
      }));
      parts.push(T.section(where + ' · ' + all + '% (openings ' + pct(sum(open), open.length * 7) + '%, closings ' + pct(sum(close), close.length * 7) + '%)', rows.length, T.itemList(items)));
    }
    const coo = users.filter(R.isCoo);
    const to = (coo.length ? coo : R.admins(users)).filter((u) => u.email);
    const range = label(days[0]) + ' to ' + label(days[6]);
    for (const person of to) {
      await sendEmail({
        to: [person.email],
        subject: 'Daily checklists last week · ' + summary.map(([w, p]) => w.replace(/^Taste\s+/i, '') + ' ' + p).join(' · '),
        html: T.layout({
          kicker: 'Weekly checklist report · ' + range,
          title: 'How much of each daily checklist got signed off',
          intro: summary.map(([w, p]) => w + ': ' + p).join(' · ') + '. A day counts when the list was signed off and filed.',
          bodyHtml: parts.join(''),
          button: { label: 'Open the Hub', url: T.WEB_URL },
          footer: 'Sent Monday at 8am, for the Monday to Sunday just finished.',
        }),
      });
    }
    console.log('Weekly checklist report sent to ' + to.length + '.');
  }
);
