// Opening checklists, re-planned (19 Oct 2026, sketch 24).
//
// Every set-up item belongs to a phase (Foundation, Applications, Build &
// inspections, Final permits) and the phases run one after another before
// opening day. Inside a phase an item is always dated after everything it
// waits for. Nothing is dated before tomorrow. The same plan is used when an
// admin re-plans a checklist and when an opening date is set or changed.
//
// What it never touches: anything signed off, anything waiting on a
// signature, a date someone set by hand, and anything already in the works
// (documents or details added). Those keep their dates, and the plan works
// around them. Assignees, details, documents and the location's details are
// never written by this at all - only the date.
import { resolveDependencyIds, TIMELINE_BUCKETS } from '../data/openingChecklistData';
import { getTemplateForLocation } from '../data/checklists';
import { assigneesOf } from '../data/assignees';
// Same as DocumentsField's, kept here so this file has no UI imports.
const documentsOf = (item) => item?.documents ?? (item?.document ? [item.document] : []);

export const DAY = 24 * 60 * 60 * 1000;

export const PHASES = [
  { n: 1, label: 'Foundation', blurb: 'Entity, tax IDs, bank, insurance and utilities. Almost everything else waits on these.', from: 0, to: 0.25 },
  { n: 2, label: 'Applications', blurb: 'Health, liquor, building and sign paperwork, and the orders that take longest to arrive.', from: 0.25, to: 0.6 },
  { n: 3, label: 'Build & inspections', blurb: 'The inspections, once the build-out is under way.', from: 0.6, to: 0.8 },
  { n: 4, label: 'Final permits', blurb: 'The permits themselves, the Certificate of Occupancy and the info binder. Done 1–2 weeks before opening.', from: 0.8, to: 1 },
];

// An item added in the app has no template entry; its section decides.
const SECTION_PHASE = { Bank: 1, CPA: 1, 'Utilities & Building': 1, 'Health Dept': 2, 'Liquor License': 2, 'Business License': 2, Purveyors: 2, 'Final Steps': 4 };

// Approvals from outside agencies: the ones that go at risk when the runway
// is squeezed, because nobody at CIG can make them go faster.
const GATES = ['foodPermit', 'liquorLicense', 'beerPermit', 'privilegeLicense', 'buildingPermit', 'finalCertOccupancy'];
const SQUEEZED = 0.6;
// No one gets more than this many re-planned items due in one week.
const PER_WEEK = 5;

export const phaseOf = (item, template) =>
  template?.items.find((t) => t.key === item.setupKey)?.phase ?? SECTION_PHASE[item.openingSection] ?? 2;

export const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const noon = (t) => startOfDay(t) + 12 * 60 * 60 * 1000;
// Offices are shut at the weekend: Saturday and Sunday move to Monday.
const weekday = (t) => { const d = new Date(t).getDay(); return d === 6 ? t + 2 * DAY : d === 0 ? t + DAY : t; };
const weekKey = (t) => { const d = new Date(startOfDay(t)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };

// The items an item is still waiting for (not signed off yet).
export function blockersOf(item, setupItems, template) {
  if (item.openingItemType !== 'setup' || item.done || !template) return [];
  return resolveDependencyIds(item, setupItems, template)
    .map((id) => setupItems.find((s) => s.id === id))
    .filter((d) => d && !d.done);
}

// The unfinished items waiting on this one.
export function dependentsOf(item, setupItems, template) {
  if (item.openingItemType !== 'setup' || !template) return [];
  return setupItems.filter((s) => !s.done && s.id !== item.id && resolveDependencyIds(s, setupItems, template).includes(item.id));
}

// Late = could have been done and wasn't. Waiting items are never late.
export function isLate(item, blocked, now = Date.now()) {
  if (item.done || blocked) return false;
  return !!item.attentionFlag || (item.dateTime != null && item.dateTime < startOfDay(now));
}

// Why an unfinished item keeps its date, or null if it can be re-dated.
export function keepReason(item) {
  if (item.done) return 'Signed off';
  if (item.signature?.status === 'waiting') return 'Waiting on a signature';
  if (item.dateSetByHand) return 'Date set by hand';
  const details = Object.values(item.openingFields ?? {}).some((v) => String(v ?? '').trim());
  if (details || documentsOf(item).length) return 'In the works (details or documents added)';
  return null;
}

/**
 * The plan for one location.
 *
 * items: that location's opening items as the app holds them (setup and
 * timeline). Returns one row per unfinished item:
 *   { item, kind, phase, oldDate, newDate, keep, why, atRisk, gapDays }
 * plus a summary. Nothing is written here.
 */
export function planLocation({ locationId, openingDate, items, now = Date.now() }) {
  const template = getTemplateForLocation(locationId);
  const setup = items.filter((i) => i.openingItemType === 'setup');
  const timeline = items.filter((i) => i.openingItemType === 'timeline');
  const first = noon(startOfDay(now) + DAY);
  // The last working day before opening.
  let lastDay = noon(openingDate - DAY);
  while ([0, 6].includes(new Date(lastDay).getDay()) && lastDay - DAY > first) lastDay -= DAY;
  const rows = [];
  const byId = new Map();
  const load = {};
  const addLoad = (item, t) => assigneesOf(item).uids.forEach((u) => { const k = u + ':' + weekKey(t); load[k] = (load[k] ?? 0) + 1; });
  const full = (item, t) => assigneesOf(item).uids.some((u) => (load[u + ':' + weekKey(t)] ?? 0) >= PER_WEEK);

  // ---- Set-up: the runway, squeezed when there is less time than normal.
  const w = template.window ?? { windowStartDaysBefore: 120, windowEndDaysBefore: 14 };
  const runStart = Math.max(first, noon(openingDate - w.windowStartDaysBefore * DAY));
  let runEnd = noon(openingDate - w.windowEndDaysBefore * DAY);
  if (runEnd < runStart + 7 * DAY) runEnd = Math.min(lastDay, runStart + 7 * DAY);
  if (runEnd < runStart) runEnd = runStart;
  const span = runEnd - runStart;
  const squeeze = span / ((w.windowStartDaysBefore - w.windowEndDaysBefore) * DAY);
  const phaseWin = (p) => {
    const ph = PHASES[p - 1];
    return [runStart + span * ph.from, runStart + span * ph.to];
  };

  const deps = new Map(setup.map((i) => [i.id, resolveDependencyIds(i, setup, template).map((id) => setup.find((s) => s.id === id)).filter(Boolean)]));
  const movable = setup.filter((i) => !i.done && !keepReason(i));
  const movableIds = new Set(movable.map((i) => i.id));

  // Fixed points the plan works around. Signed-off items count as ready now.
  setup.forEach((i) => {
    if (i.done) byId.set(i.id, first - 2 * DAY);
    else if (!movableIds.has(i.id)) {
      byId.set(i.id, i.dateTime);
      rows.push({ item: i, kind: 'setup', phase: phaseOf(i, template), oldDate: i.dateTime, newDate: i.dateTime, keep: keepReason(i), why: keepReason(i), atRisk: !!i.atRisk });
    }
  });

  // Level inside its phase: how many unfinished steps of the same phase come
  // before it. Level 0 goes at the start of the phase, the last level at its end.
  const level = new Map();
  const levelOf = (i, guard = new Set()) => {
    if (level.has(i.id)) return level.get(i.id);
    if (guard.has(i.id)) return 0;
    guard.add(i.id);
    const p = phaseOf(i, template);
    const before = (deps.get(i.id) ?? []).filter((d) => movableIds.has(d.id) && phaseOf(d, template) === p);
    const l = before.length ? 1 + Math.max(...before.map((d) => levelOf(d, guard))) : 0;
    level.set(i.id, l);
    return l;
  };
  movable.forEach((i) => levelOf(i));

  // Template order, so the plan reads like the list people know.
  const order = (i) => { const k = template.items.findIndex((t) => t.key === i.setupKey); return k < 0 ? 999 : k; };
  const placed = new Set();
  // Dependencies first, phase by phase, level by level.
  const queue = [...movable].sort((a, b) => phaseOf(a, template) - phaseOf(b, template) || level.get(a.id) - level.get(b.id) || order(a) - order(b));

  for (const p of [1, 2, 3, 4]) {
    const inPhase = queue.filter((i) => phaseOf(i, template) === p);
    if (!inPhase.length) continue;
    const [ps, pe] = phaseWin(p);
    const levels = Math.max(...inPhase.map((i) => level.get(i.id))) + 1;
    const slice = (pe - ps) / levels;
    for (let l = 0; l < levels; l++) {
      const atLevel = inPhase.filter((i) => level.get(i.id) === l);
      atLevel.forEach((item, k) => {
        const s0 = ps + l * slice, s1 = ps + (l + 1) * slice;
        let t = atLevel.length === 1 ? s0 + (s1 - s0) / 2 : s0 + ((s1 - s0) * k) / (atLevel.length - 1);
        // After everything it waits for, with two days to breathe.
        const dps = deps.get(item.id) ?? [];
        const latestDep = dps.reduce((m, d) => Math.max(m, byId.get(d.id) ?? (d.dateTime ?? first)), 0);
        if (dps.length) t = Math.max(t, latestDep + 2 * DAY);
        t = Math.max(first, noon(t));
        t = weekday(t);
        // Fair share: move along a day while this person's week is full,
        // but not past the end of the phase.
        let tries = 0;
        while (full(item, t) && t + DAY <= pe && tries < 21) { t = weekday(t + DAY); tries++; }
        let atRisk = false;
        if (t > lastDay) { t = lastDay; atRisk = true; }
        if (squeeze < SQUEEZED && GATES.includes(item.setupKey)) atRisk = true;
        byId.set(item.id, t);
        placed.add(item.id);
        addLoad(item, t);
        const gapFrom = dps.length ? Math.max(latestDep, first - DAY) : first - DAY;
        const gapDays = Math.min(21, Math.max(2, Math.round((t - gapFrom) / DAY)));
        rows.push({ item, kind: 'setup', phase: p, oldDate: item.lateSince ?? item.dateTime, newDate: t, keep: null, atRisk, gapDays, why: whyOf(item, dps, t, atRisk, squeeze) });
      });
    }
  }

  // ---- Timeline: each month window, from tomorrow if it has started.
  TIMELINE_BUCKETS.forEach((b) => {
    const mine = timeline.filter((i) => i.openingSection === b.label && !i.done);
    const kept = mine.filter((i) => keepReason(i));
    kept.forEach((i) => rows.push({ item: i, kind: 'timeline', phase: null, oldDate: i.dateTime, newDate: i.dateTime, keep: keepReason(i), why: keepReason(i), atRisk: !!i.atRisk }));
    const move = mine.filter((i) => !keepReason(i)).sort((a, b2) => (b.items.findIndex((x) => x.key === a.setupKey)) - (b.items.findIndex((x) => x.key === b2.setupKey)));
    if (!move.length) return;
    let s = Math.max(first, noon(openingDate - b.windowStartDaysBefore * DAY));
    let e = noon(openingDate - b.windowEndDaysBefore * DAY);
    const late = e < first + 6 * DAY;
    if (late) e = Math.min(lastDay, first + 10 * DAY);
    if (e < s) e = s;
    move.forEach((item, k) => {
      let t = move.length === 1 ? s + (e - s) / 2 : s + ((e - s) * k) / (move.length - 1);
      t = weekday(Math.max(first, noon(t)));
      if (t > lastDay) t = lastDay;
      addLoad(item, t);
      rows.push({
        item, kind: 'timeline', phase: null, oldDate: item.lateSince ?? item.dateTime, newDate: t, keep: null, atRisk: false,
        gapDays: Math.max(2, Math.round((t - first) / DAY)),
        why: late ? 'Its window has passed; given the next ten days' : item.attentionFlag || (item.dateTime && item.dateTime < startOfDay(now)) ? 'Was late; a fresh date inside its window' : 'Spread across its window',
      });
    });
  });

  const redated = rows.filter((r) => !r.keep && r.newDate !== r.oldDate);
  return {
    rows: rows.sort((a, b) => (a.newDate ?? 0) - (b.newDate ?? 0)),
    summary: {
      kept: items.filter((i) => i.done).length,
      inTheWorks: rows.filter((r) => r.keep).length,
      redated: redated.length,
      atRisk: rows.filter((r) => r.atRisk).length,
      overdueAfter: rows.filter((r) => r.keep && !r.item.done && (r.item.attentionFlag || (r.newDate != null && r.newDate < startOfDay(now)))).length,
      squeeze,
    },
  };

  function whyOf(item, dps, t, atRisk, sq) {
    const open = dps.filter((d) => !d.done);
    const datedBefore = dps.find((d) => item.dateTime != null && d.dateTime != null && item.dateTime < d.dateTime && !d.done);
    const parts = [];
    if (datedBefore) parts.push('Was dated before ' + datedBefore.title + '; now after it');
    else if (open.length) parts.push('Waits for ' + open[0].title + (open.length > 1 ? ' +' + (open.length - 1) : ''));
    else if (dps.length) parts.push(dps[0].title + (dps.length > 1 ? ' and the rest are' : ' is') + ' done, so it can start now');
    else if (item.attentionFlag || (item.dateTime != null && item.dateTime < startOfDay(now))) parts.push('Was late; given a fresh date');
    else parts.push('In phase order');
    if (atRisk) parts.push(t >= lastDay ? 'no room left before opening' : 'the runway is ' + Math.round(sq * 100) + '% of normal and this needs an outside approval');
    return parts.join(' · ');
  }
}

// What to write for each re-dated row. Only the date and the plan's own
// fields - never assignees, details, documents or sign-offs.
export const planWrites = (rows, now = Date.now()) =>
  rows.filter((r) => !r.keep).map((r) => [r.item.id, {
    dateTime: r.newDate,
    attentionFlag: false,
    lateSince: null,
    slidWhileWaiting: false,
    atRisk: !!r.atRisk,
    planGapDays: r.gapDays ?? 3,
    replannedAt: now,
  }]);

// After an item is signed off: anything that was waiting on it and is now
// free, but whose date went by while it waited, gets a fresh date with the
// time it was planned to have. Items still waiting on something else, or
// whose date is still ahead, are left alone.
export function unblockedWrites(doneItem, locationItems, now = Date.now()) {
  if (doneItem.openingItemType !== 'setup') return [];
  const template = getTemplateForLocation(doneItem.locationId);
  const setup = locationItems.filter((i) => i.openingItemType === 'setup').map((i) => (i.id === doneItem.id ? { ...i, done: true } : i));
  const today = startOfDay(now);
  return dependentsOf(doneItem, setup, template)
    .filter((d) => !d.dateSetByHand && blockersOf(d, setup, template).length === 0)
    .filter((d) => d.slidWhileWaiting || (d.dateTime != null && d.dateTime < today + DAY))
    .map((d) => [d.id, {
      dateTime: weekday(noon(today + (d.planGapDays ?? 3) * DAY)),
      attentionFlag: false,
      lateSince: null,
      slidWhileWaiting: false,
    }]);
}
