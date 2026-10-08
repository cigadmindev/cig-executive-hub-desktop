// Daily opening and closing checklists (Taste Starkville).
//
//   fileDailyChecklist   the manager on duty signs a list off: it is drawn as
//                        a PDF in the layout of the printed sheet and filed to
//                        the location's Drive, Operations › Opening & Closing
//                        Checklists › YYYY-MM, then locked.
//   dailyChecklistWatch  22:00 every night: any of today's lists not signed
//                        off → that location's GM is emailed. Any of
//                        yesterday's still not signed off → the COO and admins.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const { Readable } = require('stream');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { notifyPeople, ACTION } = require('./notify');
const R = require('./routing');

const ZONE = 'America/Chicago';
const COLLECTION = 'dailyChecklists';
const FOLDER = 'application/vnd.google-apps.folder';
const DRIVE_ID = '0ANOluAAxZB7lUk9PVA';
const SHARED = { corpora: 'drive', driveId: DRIVE_ID, includeItemsFromAllDrives: true, supportsAllDrives: true };

// The lists each location runs - kept in step with src/data/dailyChecklists.js.
const LISTS = {
  'taste-starkville': [
    ['host-opening', 'Host Opening'], ['server-opening', 'Server Opening'], ['bar-opening', 'Main Bar Opening'], ['veranda-opening', 'Veranda Opening'],
    ['host-closing', 'Host Closing'], ['server-closing', 'Server / Food Runner Closing'], ['bar-closing', 'Bar Closing'], ['boh-closing', 'Kitchen Closing'],
  ],
};

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
async function checklistsFolder(locationId) {
  const id = locationId + '_operations_' + encodeURIComponent('Opening & Closing Checklists');
  const link = await admin.firestore().collection('categoryDriveLinks').doc(id).get();
  const url = link.exists ? link.data().driveUrl : null;
  const m = url && url.match(/folders\/([\w-]+)/);
  if (!m) throw new HttpsError('failed-precondition', "This location's Drive folders aren't set up yet - run Drive setup for it first.");
  return m[1];
}

// ---- The PDF: the printed sheet, filled in ----
async function drawPdf(r, locationName) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 46;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ink = rgb(0.1, 0.1, 0.1), soft = rgb(0.42, 0.42, 0.45), line = rgb(0.82, 0.82, 0.84), accent = rgb(0.04, 0.55, 0.65);
  const clean = (s) => String(s ?? '').replace(/[–—]/g, '-').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/½/g, '1/2').replace(/°/g, ' deg').replace(/[éèê]/g, 'e').replace(/[ÉÈ]/g, 'E').replace(/[^\x20-\x7E\n]/g, '');
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
  for (const t of r.tasks) {
    if (t.group) {
      need(24); y -= 14;
      text(t.group.toUpperCase(), M, 9, bold, accent); y -= 6;
      continue;
    }
    const lines = wrap(t.details ?? '', font, 8, taskW - 8);
    const titleLines = wrap(t.title, bold, 10, taskW - 8);
    const h = 8 + titleLines.length * 13 + (t.details ? lines.length * 10 : 0) + (t.note ? 12 : 0) + 6;
    need(h);
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: line });
    let yy = y - 14;
    for (const l of titleLines) { page.drawText(l, { x: M, y: yy, size: 10, font: bold, color: ink }); yy -= 13; }
    if (t.details) for (const l of lines) { page.drawText(l, { x: M, y: yy, size: 8, font, color: soft }); yy -= 10; }
    if (t.note) { page.drawText(clean("Couldn't be done: " + t.note + (t.noteByName ? ' - ' + t.noteByName : '')), { x: M, y: yy, size: 8, font, color: rgb(0.7, 0.45, 0) }); }
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
  need(40); y -= 18;
  text('Signed off by ' + (r.filedByName ?? '') + ' at ' + timeOf(r.filedAt) + ', ' + r.dateKey + ' - CIG Executive Hub', M, 8, font, soft);
  return pdf.save();
}

exports.fileDailyChecklist = onCall({ timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const db = admin.firestore();
  const me = (await db.collection('users').doc(request.auth.uid).get()).data() ?? {};
  if (me.role !== 'admin' && !['General Manager', 'Assistant Manager'].includes(me.job)) {
    throw new HttpsError('permission-denied', 'Only the manager on duty can sign a checklist off.');
  }
  const ref = db.collection(COLLECTION).doc(String(request.data?.id ?? ''));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'No such checklist.');
  const r = snap.data();
  if (r.status === 'filed') return { ok: true, already: true, fileUrl: r.fileUrl };
  const open = (r.tasks ?? []).filter((t) => !t.group && !t.done && !t.note);
  if (open.length) throw new HttpsError('failed-precondition', open.length + ' task(s) are neither ticked nor noted.');

  const filedAt = Date.now();
  const managers = Array.from(new Set([...(r.managers ?? []), ...(['General Manager', 'Assistant Manager'].includes(me.job) ? [me.name] : [])]));
  const full = { ...r, managers, filedByName: me.name ?? '', filedAt };
  const locationName = await R.locationName(r.locationId);
  const bytes = await drawPdf(full, locationName.replace(/^Taste\s+/i, ''));

  const d = await drive();
  const parent = await checklistsFolder(r.locationId);
  const month = await ensureChild(d, parent, r.dateKey.slice(0, 7));
  const file = await d.files.create({
    requestBody: { name: r.dateKey + ' ' + r.title.replace(' Checklist', '') + '.pdf', parents: [month], mimeType: 'application/pdf' },
    media: { mimeType: 'application/pdf', body: Readable.from(Buffer.from(bytes)) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  await ref.update({ status: 'filed', managers, filedByName: me.name ?? '', filedAt, fileId: file.data.id, fileUrl: file.data.webViewLink });
  return { ok: true, fileUrl: file.data.webViewLink };
});

exports.dailyChecklistWatch = onSchedule(
  { schedule: '0 22 * * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'] },
  async () => {
    const db = admin.firestore();
    const users = await R.activeUsers();
    const today = centralKey(new Date());
    const yesterday = centralKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    for (const [locationId, lists] of Object.entries(LISTS)) {
      const brandId = await R.brandForLocation(locationId);
      const where = await R.locationName(locationId);
      const missing = async (day) => {
        const snap = await db.collection(COLLECTION).where('locationId', '==', locationId).where('dateKey', '==', day).get();
        const filed = new Set(snap.docs.filter((x) => x.data().status === 'filed').map((x) => x.data().listId));
        return lists.filter(([id]) => !filed.has(id)).map(([, name]) => name);
      };
      const path = '/brand/' + brandId + '/location/' + locationId + '/daily-checklists';
      const todayMissing = await missing(today);
      if (todayMissing.length) {
        const gms = R.atLocation(users, ['General Manager'], brandId, locationId);
        await notifyPeople(gms, todayMissing.length + ' daily checklist' + (todayMissing.length === 1 ? '' : 's') + ' not signed off · ' + where, todayMissing.join(', '), {
          speed: ACTION, topic: 'assignment', path: path + '?date=' + today, button: 'Open the checklists',
          why: 'You got this because you are the GM at ' + where + '.', throttleKey: 'daily-' + locationId + '-' + today,
        });
      }
      const lateMissing = await missing(yesterday);
      if (lateMissing.length) {
        const up = R.approvers(users);
        await notifyPeople(up, 'Yesterday\'s checklists were never signed off · ' + where, lateMissing.join(', '), {
          speed: ACTION, topic: 'assignment', path: path + '?date=' + yesterday, button: 'See them',
          why: 'You got this because you are the COO or an admin.', throttleKey: 'daily-late-' + locationId + '-' + yesterday,
        });
      }
    }
  }
);
