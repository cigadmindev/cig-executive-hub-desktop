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
//                        Not the kitchen closing (18 Oct 2026) - the GM
//                        usually verifies that the next morning.
//   dailyLateWatch       10:00: anything from yesterday still not signed off
//                        → the COO and admins, except the kitchen closing;
//                        last night's kitchen closing → the GM instead.
//   dailyKitchenLateWatch 15:00: last night's kitchen closing still not
//                        verified → the COO and admins (18 Oct 2026).
//   dailyChecklistWeekly Monday 08:00: last week's sign-off rates → the COO.
//
// A "day" runs 4am to 4am, so a closing list finished at 12:30am still
// belongs to the night before. Same rule in src/hooks/useDailyChecklists.js.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const { Readable } = require('stream');
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
// The kitchen closings are verified by the GM the next morning (Brenner,
// 18 Oct 2026): GMs are rarely there all the way to close.
const KITCHEN_CLOSING = ['boh-closing', 'ridgeland-chef-closing'];
const isKitchenClosing = (listId) => KITCHEN_CLOSING.includes(listId);
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

// ---- The PDF: the signed-off record (18 Oct 2026) ----
// In the CIG Concepts acknowledgement style: "I, [manager], confirm...",
// then each section of the list with every task, who ticked it and when,
// any note (with its photos), then the sheet's notes boxes and the sign-off
// block. Long lists carry on to a second page under the same frame.
// photos: { [taskIndex]: [{ bytes, type }] } - from the notes (16 Oct 2026).
const BRAND_NAMES = { taste: 'Taste Italian Kitchen', blutos: "Bluto's Greek Tavern", heritage: 'Heritage Chophouse', pronto: 'Pronto Gusto', stellas: 'Sunnyside Social', cajun: 'Cajun Depot' };
const prettyDay = (key) => new Date(key + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const signedOn = (t) => (t ? new Date(t).toLocaleDateString('en-US', { timeZone: ZONE, month: 'long', day: 'numeric', year: 'numeric' }) + ' · ' + timeOf(t) : '');
const initialsOf = (name) => String(name ?? '').split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase() + '.').join('');

async function drawPdf(r, locationName, photos = {}) {
  const { CigDoc, iconFor, LEFT, RIGHT, MUTED } = require('./cigPdf');
  const brand = BRAND_NAMES[r.brandId] ?? 'Taste Italian Kitchen';
  const d = await CigDoc.create({ eyebrow: brand + ' · ' + locationName, title: r.title, category: 'Daily Checklist' });
  const signer = r.filedByName || (r.managers ?? [])[0] || '';
  const day = prettyDay(r.dateKey);

  // The Veranda was not open (16 Oct 2026): a one-page record, no tasks.
  if (r.notOpen) {
    d.header('I, ' + signer + ', confirm that the ' + r.title.replace(/ (Opening |Closing )?Checklist$/, '') + ' was not open on ' + day + ', so nothing on this list was needed. It counts as done for the week.');
    d.y -= 8;
    d.label('Sign-Off');
    d.y -= 16; d.field(LEFT, (LEFT + RIGHT) / 2 - 12, 'Name (Printed)', signer);
    d.y -= 18; d.field(LEFT, (LEFT + RIGHT) / 2 - 12, 'Marked in the Hub', signedOn(r.filedAt));
    return d.save();
  }

  d.header('I, ' + signer + ', confirm that every task on the ' + r.title + ' for ' + day + ' was completed or noted below.');

  const embedded = {};
  for (const [i, list] of Object.entries(photos)) {
    embedded[i] = [];
    for (const ph of list) {
      try { const u8 = new Uint8Array(ph.bytes); embedded[i].push(ph.type === 'png' ? await d.pdf.embedPng(u8) : await d.pdf.embedJpg(u8)); } catch (e) { /* an unreadable photo is skipped, not fatal */ }
    }
  }

  // Sections: the list's own groups, or the whole list as one when it has none.
  const blocks = [];
  let cur = null;
  r.tasks.forEach((t, i) => {
    if (t.group) { cur = { name: t.group.replace(/^\d+\.\s*/, ''), tasks: [] }; blocks.push(cur); return; }
    if (!cur) { cur = { name: r.title.replace(/ Checklist$/, ''), tasks: [] }; blocks.push(cur); }
    cur.tasks.push({ ...t, i });
  });

  d.label(r.kind === 'opening' || /opening/.test(r.listId ?? '') ? 'Opening Verification' : 'Close-Out Verification');
  // One time stamp per section (Brenner, 18 Oct 2026): who ticked it and
  // when the last task was ticked, under the section name - not on every line.
  const NAME_X = LEFT + 30, NAME_W = 112, TASK_X = NAME_X + NAME_W + 10, TASK_W = RIGHT - TASK_X;
  const SZ = 6.6, LH = 8.6, PH = 70;
  for (const b of blocks) {
    // Measure every task first, so a section that fits is never split.
    const rows = b.tasks.map((t) => {
      // A task with what-it-involves text gets its title a little heavier
      // and the details under it, as on the printed sheet.
      const tf = t.details ? 'medium' : 'light';
      const title = d.wrap(t.title + (t.section ? ' (' + t.section + ')' : ''), SZ, TASK_W, tf);
      const details = t.details ? d.wrap(t.details, SZ - 0.4, TASK_W, 'light') : [];
      const note = t.note ? d.wrap((t.done ? 'Note: ' : "Couldn't be done: ") + t.note + (t.noteByName ? ' - ' + t.noteByName : ''), SZ, TASK_W, 'italic') : [];
      const pics = embedded[t.i] ?? [];
      return { t, tf, title, details, note, pics, h: (title.length + note.length) * LH + details.length * (LH - 0.6) + (details.length ? 2 : 0) + (pics.length ? PH + 4 : 0) };
    });
    const done = b.tasks.filter((t) => t.done).length;
    const total = rows.reduce((a, x) => a + x.h, 0);
    const nameLines = d.wrap(b.name, 8.2, NAME_W, 'bold');
    const head = Math.max(30, nameLines.length * 10 + 21);
    d.need(Math.min(total, 200) + 10);
    const top = d.y - 5;
    d.badge(LEFT, top, iconFor(b.name), 21);
    let ny = top - 8;
    for (const l of nameLines) { d.text(l, { x: NAME_X, y: ny, size: 8.2, font: 'bold' }); ny -= 10; }
    d.text(done + ' of ' + b.tasks.length + ' done', { x: NAME_X, y: ny, size: 6.4, font: 'regular' });
    const ticked = b.tasks.filter((t) => t.done && t.at);
    if (ticked.length) {
      const who = [...new Set(ticked.map((t) => initialsOf(t.byName)).filter(Boolean))].join(', ');
      const last = Math.max(...ticked.map((t) => t.at));
      ny -= 8.5;
      d.text((who ? who + ' · ' : '') + timeOf(last), { x: NAME_X, y: ny, size: 6.4, font: 'medium' });
    }
    let y = top - 6;
    for (const row of rows) {
      if (y - row.h < 74) {
        // Runs past the page: carry on overleaf under the same section name.
        d.y = y; d.newPage(true); y = d.y - 5;
        d.text(b.name + ' (continued)', { x: NAME_X, y: y - 2, size: 8.2, font: 'bold' });
        y -= 6;
      }
      const t = row.t;
      row.title.forEach((l, k) => d.text(l, { x: TASK_X, y: y - k * LH, size: SZ, font: row.tf }));
      let yy = y - row.title.length * LH;
      row.details.forEach((l) => { d.text(l, { x: TASK_X, y: yy, size: SZ - 0.4, font: 'light', color: MUTED }); yy -= LH - 0.6; });
      if (row.details.length) yy -= 2;
      row.note.forEach((l) => { d.text(l, { x: TASK_X, y: yy, size: SZ, font: 'italic', color: t.done ? MUTED : undefined }); yy -= LH; });
      let px = TASK_X;
      for (const img of row.pics) {
        const w = Math.min((img.width / img.height) * PH, 120);
        const hh = (w / img.width) * img.height;
        if (px + w > TASK_X + TASK_W) break;
        d.page.drawImage(img, { x: px, y: yy - hh + 4, width: w, height: hh });
        px += w + 5;
      }
      y -= row.h;
    }
    d.y = Math.min(y, top - head) - 4;
    d.rule();
  }

  // The boxes at the foot of the sheet ("Maintenance / Equipment Issues"…).
  if ((r.noteLabels ?? []).length) {
    d.y -= 14;
    d.label('Notes');
    for (const { key, label } of r.noteLabels) {
      const body = d.wrap(r.notes?.[key] || 'Nothing noted.', 7.4, RIGHT - LEFT, 'light');
      d.need(16 + body.length * 10);
      d.y -= 12;
      d.text(label, { size: 7.4, font: 'bold' });
      d.y -= 10;
      for (const l of body) { d.text(l, { size: 7.4, font: 'light' }); d.y -= 10; }
    }
  }

  // Closing line and the sign-off block.
  d.need(110);
  d.y -= 14;
  d.para('By signing off in the Hub, I affirm this list was checked and that any issue noted above has been reported.', { size: 7.8 });
  d.y -= 8;
  const mid = (LEFT + RIGHT) / 2, colL = [LEFT, mid - 14], colR = [mid + 14, RIGHT];
  const workers = Object.entries(r.workers ?? {});
  const photoCount = Object.values(embedded).reduce((a, x) => a + x.length, 0);
  const startY = d.y;
  const block = (cols, title, fields) => {
    d.y = startY;
    d.page.drawLine({ start: { x: cols[0], y: d.y }, end: { x: cols[1], y: d.y }, thickness: 0.75, color: require('./cigPdf').FRAME });
    d.spaced(title.toUpperCase(), cols[0], d.y - 10, 7, 1.3, require('./cigPdf').BURGUNDY);
    d.y -= 14;
    for (const [k, v] of fields) { d.y -= 14; d.field(cols[0], cols[1], k, v); }
  };
  block(colL, 'Team', workers.length ? workers.map(([k, v]) => [k, v || '']) : [['Name (Printed)', '']]);
  const leftEnd = d.y;
  block(colR, 'Manager Sign-Off', [
    ['Name (Printed)', (r.managers ?? []).join(', ') || signer],
    ['Signed in the Hub', signedOn(r.filedAt)],
    ['Photos attached (Y/N)', photoCount ? 'Y · ' + photoCount : 'N'],
  ]);
  d.y = Math.min(leftEnd, d.y);
  return d.save();
}

// ---- The Daily Time & Temperature Log (18 Oct 2026) ----
const CHEF_JOBS = ['Executive Chef', 'Sous Chef'];
const TEMP_LOG_ID = 'temp-log';
const TEMP_LOG_LOCATIONS = ['taste-starkville', 'taste-ridgeland'];
const TEMP_LOG_TIMES = ['11:00 AM', '1:00 PM', '3:00 PM', '5:00 PM', '7:00 PM', '9:00 PM'];
const TEMP_LOG_HOURS = [11, 13, 15, 17, 19, 21];
function chefHere(me, brandId, locationId) {
  if (CHEF_JOBS.includes(me.alsoJob?.job) && me.alsoJob?.locationId === locationId) return true;
  return CHEF_JOBS.includes(me.job) && R.seesLocation(me, brandId, locationId);
}
const chefsAt = (users, brandId, locationId) => R.atLocation(users, CHEF_JOBS, brandId, locationId);

// Operations › Temperature Logs, next to the checklists folder. Made the first
// time, and linked to the Hub's "Temperature Logs" tile so chefs can open it.
async function tempLogsFolder(d, locationId, brandId) {
  const checklists = await checklistsFolder(locationId);
  const meta = await d.files.get({ fileId: checklists, fields: 'parents', supportsAllDrives: true });
  const operations = meta.data.parents?.[0];
  if (!operations) throw new HttpsError('failed-precondition', "This location's Operations folder could not be found in Drive.");
  const id = await ensureChild(d, operations, 'Temperature Logs');
  await admin.firestore().collection('categoryDriveLinks').doc(locationId + '_operations_' + encodeURIComponent('Temperature Logs')).set({
    locationId, brandId: brandId ?? null, categoryId: 'operations', itemName: 'Temperature Logs',
    driveUrl: 'https://drive.google.com/drive/folders/' + id, updatedAt: Date.now(), updatedBy: 'Set up automatically',
  }, { merge: true });
  return id;
}

// The filed log: a landscape page laid out like the kitchen's paper sheet,
// every box filled in with the temperature and the initials of who took it.
async function drawLogPdf(r, locationName) {
  const { CigDoc, BURGUNDY, FRAME, HAIR } = require('./cigPdf');
  const brand = BRAND_NAMES[r.brandId] ?? 'Taste Italian Kitchen';
  const d = await CigDoc.create({ eyebrow: brand + ' · ' + locationName, title: r.title, category: 'Food Safety Log', landscape: true });
  d.header(null, r.subtitle);
  const L = d.left, Rt = d.right;
  const items = r.items ?? [], times = r.times ?? TEMP_LOG_TIMES, cells = r.cells ?? {};
  const recorders = [...new Set(Object.values(cells).map((c) => c.byName).filter(Boolean))];
  // Date and Recorded by, as on the paper sheet.
  const mid = (L + Rt) / 2;
  d.y -= 2;
  d.field(mid - 250, mid - 20, 'Date', prettyDay(r.dateKey));
  d.field(mid + 20, mid + 250, 'Recorded by', recorders.join(', '));
  d.y -= 14;
  const NAME_W = 150, colW = (Rt - L - NAME_W) / times.length, tW = colW * 0.55;
  const top = d.y;
  const line = (x0, y, x1, color = HAIR, t = 0.6) => d.page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: t, color });
  const vline = (x, y0, y1, color = FRAME, t = 0.75) => d.page.drawLine({ start: { x, y: y0 }, end: { x, y: y1 }, thickness: t, color });
  line(L, top, Rt, FRAME, 1.1);
  d.spaced('ITEM', L + 4, top - 12, 6.8, 1, BURGUNDY);
  times.forEach((t, c) => d.spaced(t.toUpperCase(), L + NAME_W + c * colW + colW / 2, top - 12, 6.8, 0.8, BURGUNDY, 'center'));
  line(L + NAME_W, top - 16, Rt);
  times.forEach((_, c) => {
    const x = L + NAME_W + c * colW;
    d.spaced('TEMP (°F)', x + tW / 2, top - 24, 5, 0.6, BURGUNDY, 'center');
    d.spaced('INITIALS', x + tW + (colW - tW) / 2, top - 24, 5, 0.6, BURGUNDY, 'center');
  });
  const headBottom = top - 28;
  line(L, headBottom, Rt, FRAME, 1.1);
  const RH = Math.min(19, (headBottom - 120) / Math.max(items.length, 1));
  items.forEach((name, i) => {
    const yTop = headBottom - i * RH;
    const cy = yTop - RH / 2 - 2.4;
    d.badge(L + 1, yTop - (RH - 13) / 2, 'thermo', 13);
    d.text(name, { x: L + 18, y: cy, size: 7.2, font: 'bold' });
    times.forEach((_, c) => {
      const x = L + NAME_W + c * colW;
      const v = cells[i + '_' + c];
      if (v?.temp) {
        d.text(v.temp + '°', { x: x + tW / 2, y: cy, size: 7.4, font: 'medium', align: 'center' });
        d.text(initialsOf(v.byName), { x: x + tW + (colW - tW) / 2, y: cy, size: 6.4, font: 'regular', align: 'center' });
      } else if (v?.note) {
        d.text(String(v.note).slice(0, 22), { x: x + colW / 2, y: cy, size: 6, font: 'italic', align: 'center' });
      }
      // The line between temperature and initials, except across a note.
      if (!v?.note) vline(x + tW, yTop, yTop - RH, HAIR, 0.6);
    });
    line(L, yTop - RH, Rt, i === items.length - 1 ? FRAME : HAIR, i === items.length - 1 ? 1.1 : 0.6);
  });
  const bottom = headBottom - items.length * RH;
  times.forEach((_, c) => {
    const x = L + NAME_W + c * colW;
    vline(x, top, bottom);
    vline(x + tW, top - 16, headBottom, HAIR, 0.6);
  });
  d.y = bottom - 22;
  const third = (Rt - L) / 3;
  d.field(L, L + third - 16, 'Signed off by', r.filedByName ?? '');
  d.field(L + third, L + 2 * third - 16, 'Signed in the Hub', signedOn(r.filedAt));
  const notes = Object.values(cells).filter((c) => c.note).length;
  d.field(L + 2 * third, Rt, 'Notes', notes ? notes + ' box' + (notes === 1 ? '' : 'es') + ' noted instead of a temperature' : 'None');
  return d.save();
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
  // The temperature log is the chefs' (18 Oct 2026): the executive chef or
  // sous chef at this location signs it off.
  const isLog = first.data().kind === 'log';
  if (isLog && me.role !== 'admin' && !chefHere(me, first.data().brandId, first.data().locationId)) {
    throw new HttpsError('permission-denied', 'Only the executive chef or sous chef at this location can sign the temperature log off.');
  }
  if (me.role !== 'admin' && !onDuty && !isLog) {
    throw new HttpsError('permission-denied', 'Only the manager on duty at this location can sign a checklist off.');
  }

  // Claimed in one step, so a double tap or a retry files one PDF, not two.
  // A claim older than five minutes is a run that died - it can be taken over.
  const claim = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const x = s.data();
    if (x.status === 'filed') return { already: true, r: x };
    if (x.status === 'filing' && Date.now() - (x.filingAt ?? 0) < 5 * 60 * 1000) return { busy: true };
    const open = notOpen ? [] : x.kind === 'log'
      ? (x.items ?? []).flatMap((_, i) => (x.times ?? []).map((__, c) => x.cells?.[i + '_' + c])).filter((v) => !v || (!v.temp && !v.note))
      : (x.tasks ?? []).filter((t) => !t.group && !t.done && !t.note);
    if (open.length) return { open: open.length };
    tx.update(ref, { status: 'filing', filingAt: Date.now() });
    return { r: x };
  });
  if (claim.already) return { ok: true, already: true, fileUrl: claim.r.fileUrl };
  if (claim.busy) throw new HttpsError('aborted', 'Someone is signing this off right now - give it a moment.');
  if (claim.open) throw new HttpsError('failed-precondition', isLog ? claim.open + ' box(es) still have no temperature or note.' : claim.open + ' task(s) are neither ticked nor noted.');
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
  const bytes = isLog ? await drawLogPdf(full, locationName.replace(/^Taste\s+/i, '')) : await drawPdf(full, locationName.replace(/^Taste\s+/i, ''), photos);

  const d = await drive();
  // The temperature log has its own folder beside the checklists (18 Oct 2026).
  const parent = isLog ? await tempLogsFolder(d, r.locationId, r.brandId) : await checklistsFolder(r.locationId);
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
      const closingMissing = (await missingLists(db, locationId, lists, tonight)).filter(([id]) => isClosing(id) && !isKitchenClosing(id));
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
      const missing = await missingLists(db, locationId, lists, yesterday);
      // Last night's kitchen closing goes to the GM to verify, not up the
      // line yet (18 Oct 2026). The COO hears at 3pm if it is still open.
      const kitchen = missing.filter(([id]) => isKitchenClosing(id));
      if (kitchen.length) {
        const gms = R.atLocation(users, ['General Manager'], brandId, locationId);
        await notifyPeople(gms.length ? gms : R.admins(users), 'Last night\'s kitchen closing not verified yet · ' + where, 'Check the kitchen and sign off ' + names(kitchen) + ' for last night.', {
          speed: ACTION, topic: 'assignment', path: path + '?date=' + yesterday, button: 'Verify it',
          why: gms.length ? 'You got this because you are the GM at ' + where + '.' : 'You got this because ' + where + ' has no GM in the Hub.',
          throttleKey: 'daily-kitchen-gm-' + locationId + '-' + yesterday,
        });
      }
      const lateMissing = missing.filter(([id]) => !isKitchenClosing(id));
      if (!lateMissing.length) continue;
      await notifyPeople(R.approvers(users), 'Yesterday\'s checklists were never signed off · ' + where, names(lateMissing), {
        speed: ACTION, topic: 'assignment', path: path + '?date=' + yesterday, button: 'See them',
        why: 'You got this because you are the COO or an admin.', throttleKey: 'daily-late-' + locationId + '-' + yesterday,
      });
    }
  }
);

// 3pm: last night's kitchen closing, still not verified after the GM's 10am
// reminder → the COO and admins (18 Oct 2026).
exports.dailyKitchenLateWatch = onSchedule(
  { schedule: '0 15 * * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'], timeoutSeconds: 540 },
  async () => {
    const db = admin.firestore();
    const users = await R.activeUsers();
    const yesterday = daysAgo(1);
    for (const [locationId, lists] of Object.entries(LISTS)) {
      const brandId = await R.brandForLocation(locationId);
      const where = await R.locationName(locationId);
      const path = '/brand/' + brandId + '/location/' + locationId + '/daily-checklists';
      const kitchen = (await missingLists(db, locationId, lists, yesterday)).filter(([id]) => isKitchenClosing(id));
      if (!kitchen.length) continue;
      await notifyPeople(R.approvers(users), 'Last night\'s kitchen closing was never verified · ' + where, names(kitchen) + ' is still not signed off. The GM was reminded at 10am.', {
        speed: ACTION, topic: 'assignment', path: path + '?date=' + yesterday, button: 'See it',
        why: 'You got this because you are the COO or an admin.', throttleKey: 'daily-kitchen-late-' + locationId + '-' + yesterday,
      });
    }
  }
);

// The temperature log's reminders (18 Oct 2026) - to that location's
// executive chef and sous chef only. 30 minutes after each check time, if
// nothing at all has been logged for it...
exports.tempLogSlotWatch = onSchedule(
  { schedule: '30 11,13,15,17,19,21 * * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'], timeoutSeconds: 300 },
  async () => {
    const db = admin.firestore();
    const users = await R.activeUsers();
    const today = centralKey(new Date());
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', hour12: false }).format(new Date()));
    const c = TEMP_LOG_HOURS.lastIndexOf(TEMP_LOG_HOURS.filter((h) => h <= hour).pop());
    if (c < 0) return;
    for (const locationId of TEMP_LOG_LOCATIONS) {
      const snap = await db.collection(COLLECTION).doc(locationId + '_' + today + '_' + TEMP_LOG_ID).get();
      const x = snap.exists ? snap.data() : null;
      if (x?.status === 'filed') continue;
      const items = x?.items ?? [];
      if (x && items.some((_, i) => x.cells?.[i + '_' + c])) continue;
      const brandId = await R.brandForLocation(locationId);
      const chefs = chefsAt(users, brandId, locationId);
      if (!chefs.length) continue;
      const where = await R.locationName(locationId);
      await notifyPeople(chefs, TEMP_LOG_TIMES[c] + ' temperatures not logged yet · ' + where, 'The ' + TEMP_LOG_TIMES[c] + " check on today's Daily Time & Temperature Log has nothing in it yet.", {
        speed: ACTION, topic: 'assignment', path: '/brand/' + brandId + '/location/' + locationId + '/daily-checklists/' + TEMP_LOG_ID + '?date=' + today, button: 'Open the log',
        why: 'You got this because you are a chef at ' + where + '.', throttleKey: 'templog-' + locationId + '-' + today + '-' + c,
      });
    }
  }
);

// ...and at 11pm if the day's log has not been signed off.
exports.tempLogUnsignedWatch = onSchedule(
  { schedule: '0 23 * * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'], timeoutSeconds: 300 },
  async () => {
    const db = admin.firestore();
    const users = await R.activeUsers();
    const today = centralKey(new Date());
    for (const locationId of TEMP_LOG_LOCATIONS) {
      const snap = await db.collection(COLLECTION).doc(locationId + '_' + today + '_' + TEMP_LOG_ID).get();
      if (snap.exists && snap.data().status === 'filed') continue;
      const brandId = await R.brandForLocation(locationId);
      const chefs = chefsAt(users, brandId, locationId);
      if (!chefs.length) continue;
      const where = await R.locationName(locationId);
      await notifyPeople(chefs, "Today's temperature log not signed off yet · " + where, 'Sign off the Daily Time & Temperature Log once every box has a temperature or a note.', {
        speed: ACTION, topic: 'assignment', path: '/brand/' + brandId + '/location/' + locationId + '/daily-checklists/' + TEMP_LOG_ID + '?date=' + today, button: 'Open the log',
        why: 'You got this because you are a chef at ' + where + '.', throttleKey: 'templog-unsigned-' + locationId + '-' + today,
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
