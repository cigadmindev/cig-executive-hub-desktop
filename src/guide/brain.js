// The Hub Guide's thinking (Nov 2026). No AI: it tidies up what was typed,
// works out which kind of question it is, and builds a plain-English answer
// from the data this person's Hub has already loaded - so it can never show
// anything they couldn't open themselves.
//
// answer(text, ctx, memory) -> { text, cards, chips, mood, memory, load }
//   cards: { icon, title, sub, tag: [text, tone], to, copy, whyId }
//   load:  { brandId, locationId } when it needs a location's contacts first
import { PAGES, SAME, SPELLING, BRAND_NICKNAMES, JOKES, OUTSIDE_WORDS, RUDE_WORDS, FOLDER_WORDS } from './knowledge';
import { categories } from '../data/mockData';
import { canSeeFolder } from '../data/accessMatrix';
import { assigneesOf, isAssignedTo } from '../data/assignees';
import { blockersOf, dependentsOf, isLate, phaseOf, PHASES } from '../lib/openingPlan';
import { getTemplateForLocation } from '../data/checklists';
import { TIMELINE_BUCKETS } from '../data/openingChecklistData';

const DAY = 86400000;
const pick = (list, seed) => list[Math.abs(seed ?? Math.floor(Math.random() * 1e9)) % list.length];
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const fmtDay = (t) => new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ------------------------------------------------------------- tidy up
export function tidy(raw) {
  let s = ' ' + String(raw).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim() + ' ';
  s = s.replace(/[a-z']+/g, (w) => SPELLING[w] ?? w);
  Object.keys(SAME).sort((a, b) => b.length - a.length).forEach((k) => {
    s = s.replace(new RegExp(`(^|[^a-z])${esc(k)}(?=[^a-z]|$)`, 'g'), `$1${SAME[k]}`);
  });
  return s;
}
const has = (s, ...words) => words.some((w) => new RegExp(`(^|[^a-z])${esc(w)}(?=[^a-z]|$)`).test(s));
const re = (s, r) => r.test(s);

// ------------------------------------------------------------- places
function findPlaces(s, ctx) {
  const hits = [];
  for (const loc of ctx.locations) {
    const city = loc.name.toLowerCase();
    const brandWords = BRAND_NICKNAMES[loc.brandId] ?? [loc.brandName.toLowerCase()];
    const cityHit = has(s, city);
    const brandHit = brandWords.some((w) => has(s, w)) || has(s, loc.brandName.toLowerCase());
    if (cityHit || brandHit) hits.push({ loc, score: (cityHit ? 2 : 0) + (brandHit ? 1 : 0) });
  }
  if (!hits.length) return { list: [], brandOnly: false };
  const best = Math.max(...hits.map((h) => h.score));
  const list = hits.filter((h) => h.score === best).map((h) => h.loc);
  return { list, brandOnly: best === 1 };
}
// The one place a question is about: named, or the page you're on, or the
// last place we talked about. Several matches -> ask which.
function placeFor(s, ctx, memory) {
  const { list, brandOnly } = findPlaces(s, ctx);
  if (list.length === 1) return { loc: list[0] };
  if (list.length > 1) {
    const here = list.find((l) => l.id === ctx.here?.locationId);
    if (here) return { loc: here };
    if (brandOnly) return { brand: list[0].brandId, many: list };
    return { many: list };
  }
  if (/\b(here|this location|this place|this restaurant|this one)\b/.test(s) && ctx.here?.loc) return { loc: ctx.here.loc };
  if (ctx.here?.loc) return { loc: ctx.here.loc, implied: true };
  const last = ctx.locations.find((l) => l.id === memory.lastLocId);
  if (last) return { loc: last, implied: true };
  if (ctx.locations.length === 1) return { loc: ctx.locations[0], implied: true };
  return {};
}
const whichOne = (many, question) => ({
  text: 'Which one do you mean?',
  chips: many.slice(0, 6).map((l) => `${question} ${l.brandName} ${l.name}`),
});
const locLabel = (l) => `${l.brandName} ${l.name}`;
const shortLoc = (l) => `${String(l.brandName).split(' ')[0]} ${l.name}`;
const locPath = (l, rest = '') => `/brand/${l.brandId}/location/${l.id}${rest}`;

// ------------------------------------------------------------- opening items
function openingAt(ctx, loc) {
  const all = ctx.entries.filter((e) => e.locationId === loc.id && e.openingItem);
  const setup = all.filter((e) => e.openingItemType === 'setup');
  const tpl = getTemplateForLocation(loc.id);
  const blocked = (i) => blockersOf(i, setup, tpl).length > 0;
  const late = all.filter((i) => isLate(i, blocked(i), ctx.now)).sort((a, b) => (a.dateTime ?? 0) - (b.dateTime ?? 0));
  return { all, setup, tpl, blocked, late };
}
function itemCard(i, loc, ctx, extra = {}) {
  const who = assigneesOf(i);
  const days = i.dateTime ? Math.floor((startOfDay(ctx.now) - startOfDay(i.dateTime)) / DAY) : null;
  const late = !i.done && !extra.waiting && (i.attentionFlag || (days != null && days > 0));
  const tag = i.done ? ['Done', 'green'] : extra.waiting ? ['Waiting', 'amber'] : late ? [days > 0 ? plural(days, 'day') + ' late' : 'Needs attention', 'red'] : i.dateTime ? [fmtDay(i.dateTime), 'grey'] : null;
  return {
    icon: 'check', title: i.title,
    sub: `${who.names.length ? who.names.join(', ') : 'Nobody assigned'}${loc ? ' · ' + loc.name : ''}`,
    tag, to: locPath(loc, '/opening-checklist'), whyId: i.id,
  };
}

// ------------------------------------------------------------- people
function findPeople(s, ctx) {
  const words = s.trim().split(/[^a-z']+/).map((w) => w.replace(/'s?$/, '')).filter((w) => w.length >= 3);
  return ctx.users.filter((u) => {
    const parts = String(u.name ?? '').toLowerCase().split(/\s+/).filter((p) => p.length >= 3);
    return parts.some((p) => words.includes(p));
  });
}
const JOB_WORDS = [
  ['assistant general manager', 'Assistant General Manager'], ['general manager', 'General Manager'], ['kitchen manager', 'Kitchen Manager'],
  ['chef', 'Chef'], ['coo', 'COO'], ['ceo', 'CEO'], ['cfo', 'CFO'], ['finance', 'Finance'], ['bartender', 'Bartender'], ['beverage', 'Beverage'],
  ['culinary', 'Culinary'], ['owner', 'Owner'], ['it ', 'IT'], ['marketing', 'Marketing'], ['event', 'Event'], ['catering', 'Catering'],
];
function personCard(u) {
  return { icon: 'person', title: u.name, sub: [u.job, u.email].filter(Boolean).join(' · '), copy: u.email, to: '/messages', chat: u.uid };
}

// ------------------------------------------------------------- folders
function findFolder(s) {
  let best = null;
  for (const cat of categories) {
    for (const item of cat.items) {
      const extra = (FOLDER_WORDS[item] ?? []).map((w) => (s.includes(w) ? w.length + 3 : 0));
      const score = Math.max(0, s.includes(item.toLowerCase()) ? item.length : 0, ...extra);
      if (score > (best?.score ?? 0)) best = { cat, item, score };
    }
    if (has(s, cat.label.toLowerCase()) && (best?.score ?? 0) < 4) best = { cat, item: null, score: 4 };
  }
  return best && best.score >= 4 ? best : null;
}

// ------------------------------------------------------------- the answers
function lateAnswer(s, ctx, memory, onlyUnassigned = false) {
  if (!ctx.can('openingChecklist')) return { text: "Opening checklists aren't part of your access." };
  const p = placeFor(s, ctx, memory);
  const named = findPlaces(s, ctx).list.length > 0 || /\bhere\b/.test(s);
  const openings = (ctx.summary?.openingSoon ?? []);
  if (!named && (!p.loc || p.implied) && openings.length > 1) {
    const rows = openings.map((o) => {
      const loc = ctx.locations.find((l) => l.id === o.id);
      const n = loc ? openingAt(ctx, loc).late.filter((i) => !onlyUnassigned || assigneesOf(i).uids.length === 0).length : 0;
      return { loc, n };
    }).filter((r) => r.loc && r.n > 0).sort((a, b) => b.n - a.n);
    if (!rows.length) return { text: onlyUnassigned ? 'Every late item has someone on it. Nice.' : 'Nothing is late on any opening checklist. Somebody frame this moment.' };
    return {
      text: `${onlyUnassigned ? 'Late items with nobody on them' : 'Late opening checklist items'}: ${rows.map((r) => `${shortLoc(r.loc)} ${r.n}`).join(', ')}.`,
      cards: rows.slice(0, 4).map((r) => ({ icon: 'check', title: locLabel(r.loc), sub: plural(r.n, 'late item'), tag: [String(r.n), 'red'], to: locPath(r.loc, '/opening-checklist?show=' + (onlyUnassigned ? 'unassigned' : 'overdue')) })),
      chips: rows.slice(0, 2).map((r) => `What's late in ${r.loc.name}?`),
    };
  }
  if (p.many) return whichOne(p.many, onlyUnassigned ? "What's unassigned at" : "What's late at");
  if (!p.loc) return { text: 'Which location? For example "what\'s late in Chelsea?"' };
  const { late } = openingAt(ctx, p.loc);
  const list = onlyUnassigned ? late.filter((i) => assigneesOf(i).uids.length === 0) : late;
  const memo = { lastLocId: p.loc.id, lastIntent: onlyUnassigned ? 'unassigned' : 'late', lastItemId: list[0]?.id ?? memory.lastItemId };
  if (!list.length) return { text: onlyUnassigned ? `Every late item at ${p.loc.name} has someone on it.` : `Nothing is late at ${locLabel(p.loc)}. Somebody's on top of things.`, memory: memo };
  const oldest = list[0];
  const days = Math.floor((startOfDay(ctx.now) - startOfDay(oldest.dateTime)) / DAY);
  const who = assigneesOf(oldest).names;
  return {
    text: `${locLabel(p.loc)} has ${plural(list.length, 'late item')}${onlyUnassigned ? ' with nobody assigned' : ''}. The oldest is ${oldest.title}, ${days > 0 ? plural(days, 'day') + ' late' : 'flagged as needing attention'}${onlyUnassigned ? '' : who.length ? `, with ${who.join(' and ')}` : ', and nobody is on it'}.`,
    cards: list.slice(0, 3).map((i) => itemCard(i, p.loc, ctx)),
    chips: [`Why does ${shortTitle(oldest.title)} matter?`, list.length > 3 ? `Show all ${list.length}` : null, onlyUnassigned ? null : 'Which have nobody assigned?', ...(ctx.summary?.openingSoon ?? []).filter((o) => o.id !== p.loc.id).slice(0, 2).map((o) => `What about ${shortLoc(o)}?`)].filter(Boolean),
    go: { to: locPath(p.loc, '/opening-checklist?show=' + (onlyUnassigned ? 'unassigned' : 'overdue')), label: `See all ${list.length}` },
    memory: memo,
  };
}
const shortTitle = (t) => t.replace(/\s*\(.*?\)\s*/g, ' ').trim();

function weekAnswer(s, ctx, memory) {
  const p = placeFor(s, ctx, memory);
  if (p.many) return whichOne(p.many, "What's due this week at");
  if (!p.loc) return null;
  const end = startOfDay(ctx.now) + 7 * DAY;
  const { all } = openingAt(ctx, p.loc);
  const list = all.filter((i) => !i.done && i.dateTime && i.dateTime >= startOfDay(ctx.now) && i.dateTime < end).sort((a, b) => a.dateTime - b.dateTime);
  if (!list.length) return { text: `Nothing on ${p.loc.name}'s opening checklist is due in the next 7 days.`, memory: { lastLocId: p.loc.id, lastIntent: 'week' } };
  return { text: `${plural(list.length, 'item')} on ${p.loc.name}'s opening checklist ${list.length === 1 ? 'is' : 'are'} due in the next 7 days:`, cards: list.slice(0, 4).map((i) => itemCard(i, p.loc, ctx)), go: { to: locPath(p.loc, '/opening-checklist?show=week'), label: 'See them all' }, memory: { lastLocId: p.loc.id, lastIntent: 'week' } };
}

function readyAnswer(s, ctx, memory) {
  const p = placeFor(s, ctx, memory);
  if (p.many) return whichOne(p.many, 'How ready is');
  if (!p.loc) {
    const o = ctx.summary?.openingSoon ?? [];
    if (!o.length) return { text: 'No locations are opening soon.' };
    return { text: 'Coming up:', cards: o.map((x) => ({ icon: 'cal', title: `${x.brandName} ${x.name}`, sub: `Opens ${fmtDay(x.openingDate)} · ${x.total ? Math.round((x.done / x.total) * 100) : 0}% ready`, tag: [plural(x.daysOut, 'day'), 'grey'], to: `/brand/${x.brandId}/location/${x.id}/opening-checklist` })) };
  }
  const o = (ctx.summary?.openingSoon ?? []).find((x) => x.id === p.loc.id);
  const memo = { lastLocId: p.loc.id, lastIntent: 'ready' };
  if (!o) return { text: `${locLabel(p.loc)} is already open, or doesn't have an opening date yet.`, memory: memo };
  const pct = o.total ? Math.round((o.done / o.total) * 100) : 0;
  return {
    text: `${locLabel(p.loc)} opens ${fmtDay(o.openingDate)}, ${plural(o.daysOut, 'day')} from now. It's ${pct}% ready: ${o.done} of ${o.total} set-up items done${o.overdue ? `, ${o.overdue} late` : ''}.`,
    cards: [{ icon: 'check', title: 'Opening checklist', sub: `${locLabel(p.loc)}`, tag: [pct + '%', 'green'], to: locPath(p.loc, '/opening-checklist') }],
    chips: [`What's late in ${p.loc.name}?`, `What's due this week in ${p.loc.name}?`], memory: memo,
  };
}

function mineAnswer(s, ctx) {
  const mine = ctx.entries.filter((e) => e.openingItem && !e.done && isAssignedTo(e, ctx.user?.uid)).sort((a, b) => (a.dateTime ?? 0) - (b.dateTime ?? 0));
  const contacts = (ctx.pocMine ?? []).filter((c) => !(c.vendor ?? '').trim() && !(c.contactNameNumber ?? '').trim());
  const queue = ctx.signQueue ?? [];
  const parts = [];
  if (mine.length) parts.push(plural(mine.length, 'opening checklist item'));
  if (contacts.length) parts.push(plural(contacts.length, 'contact') + ' to fill in');
  if (queue.length) parts.push(plural(queue.length, 'document') + ' to sign');
  if (!parts.length) return { text: "Nothing is waiting on you right now. Enjoy it while it lasts." };
  const cards = [
    ...mine.slice(0, 3).map((i) => itemCard(i, ctx.locations.find((l) => l.id === i.locationId) ?? { name: '', brandId: i.brandId, id: i.locationId }, ctx)),
    ...queue.slice(0, 2).map((w) => ({ icon: 'page', title: w.title, sub: 'Waiting for your signature', to: '/work-orders' })),
    ...contacts.slice(0, 3).map((c) => { const l = ctx.locations.find((x) => x.id === c.locationId); return { icon: 'phone', title: c.item, sub: `Contact to fill in${l ? ' · ' + shortLoc(l) : ''}`, to: l ? locPath(l, '/operational-poc') : '/' }; }),
  ].slice(0, 5);
  return { text: `You have ${parts.join(', ')}.`, cards, go: { to: '/', label: 'Open Home' } };
}

function renewalsAnswer(s, ctx, memory) {
  if (!ctx.can('renewals')) return { text: "Renewals aren't part of your access." };
  const p = placeFor(s, ctx, memory);
  const named = findPlaces(s, ctx).list.length > 0;
  const locs = named && p.loc ? [p.loc] : p.many ?? ctx.locations;
  const rows = [];
  for (const loc of locs) for (const r of ctx.renewalsFor(loc.id) ?? []) if (r.expirationDate && !r.hidden) rows.push({ r, loc, days: Math.round((r.expirationDate - ctx.now) / DAY) });
  const typeWord = ['liquor', 'beer', 'food', 'health', 'privilege', 'business', 'lease', 'sign', 'building', 'occupancy'].find((w) => has(s, w));
  let list = typeWord ? rows.filter((x) => String(x.r.type).toLowerCase().includes(typeWord)) : rows;
  const expired = /expired/.test(s);
  if (expired) list = list.filter((x) => x.days < 0);
  else if (!typeWord) list = list.filter((x) => x.days <= 60);
  list.sort((a, b) => a.days - b.days);
  if (!list.length) return { text: expired ? 'Nothing has expired. ' : typeWord ? `I can't find a ${typeWord} renewal${named ? ' there' : ''}.` : 'Nothing renews in the next 60 days.', memory: { lastIntent: 'renewals', lastLocId: p.loc?.id } };
  const first = list[0];
  return {
    text: list.length === 1 || typeWord
      ? `${locLabel(first.loc)}'s ${first.r.type} ${first.days < 0 ? `expired ${fmtDay(first.r.expirationDate)}` : `expires ${fmtDay(first.r.expirationDate)}, ${plural(first.days, 'day')} from now`}.`
      : `${plural(list.length, 'renewal')} ${expired ? 'have expired' : 'are due in the next 60 days'}:`,
    cards: list.slice(0, 4).map((x) => ({ icon: 'cal', title: `${x.r.type}`, sub: `${locLabel(x.loc)} · ${x.days < 0 ? 'expired' : 'expires'} ${fmtDay(x.r.expirationDate)}`, tag: x.days < 0 ? ['Expired', 'red'] : x.days <= 30 ? ['Due soon', 'amber'] : [plural(x.days, 'day'), 'grey'], to: locPath(x.loc, '/renewals') })),
    memory: { lastIntent: 'renewals', lastLocId: first.loc.id },
  };
}

function calendarAnswer(s, ctx, memory) {
  if (!ctx.can('calendar')) return null;
  const today = startOfDay(ctx.now);
  let from = today, to = today + DAY, label = 'today';
  if (has(s, 'tomorrow')) { from = today + DAY; to = today + 2 * DAY; label = 'tomorrow'; }
  else if (/this week|the week|coming up|upcoming/.test(s)) { to = today + 7 * DAY; label = 'in the next 7 days'; }
  const { list: named } = findPlaces(s, ctx);
  const ids = named.length ? new Set(named.map((l) => l.id)) : null;
  const evs = ctx.entries.filter((e) => !e.openingItem && e.dateTime >= from && e.dateTime < to && (!ids || ids.has(e.locationId))).sort((a, b) => a.dateTime - b.dateTime);
  if (!evs.length) return { text: `Nothing on the calendar ${label}${named.length ? ' there' : ''}.`, go: { to: '/calendar', label: 'Open the calendar' } };
  return {
    text: `${plural(evs.length, 'thing')} on the calendar ${label}:`,
    cards: evs.slice(0, 5).map((e) => { const loc = ctx.locations.find((l) => l.id === e.locationId); return { icon: 'cal', title: e.title, sub: `${label === 'today' || label === 'tomorrow' ? fmtTime(e.dateTime) : fmtDay(e.dateTime) + ' ' + fmtTime(e.dateTime)}${loc ? ' · ' + locLabel(loc) : ''}`, to: ctx.calendarLink(e) }; }),
    go: { to: '/calendar', label: 'Open the calendar' },
  };
}

function contactAnswer(s, ctx, memory) {
  if (!ctx.can('operationalPoc')) return null;
  const p = placeFor(s, ctx, memory);
  if (p.many) return whichOne(p.many, 'Who is the contact at');
  if (!p.loc) return { text: 'Which location? For example "who\'s the Toast contact at Chelsea?"' };
  const contacts = ctx.contactsFor(p.loc.id);
  if (!contacts) return { load: { brandId: p.loc.brandId, locationId: p.loc.id }, text: '' };
  const memo = { lastLocId: p.loc.id, lastIntent: 'contact' };
  if (/missing|not filled|empty|unfilled|still need/.test(s)) {
    const empty = contacts.filter((c) => !(c.vendor || '').trim() && !(c.contactNameNumber || '').trim());
    return { text: `${plural(empty.length, 'contact')} at ${p.loc.name} ${empty.length === 1 ? "isn't" : "aren't"} filled in yet.`, cards: empty.slice(0, 4).map((c) => ({ icon: 'phone', title: c.item, sub: assigneesOf(c).names.join(', ') || 'Nobody assigned', to: locPath(p.loc, '/operational-poc') })), memory: memo };
  }
  const words = s.split(/[^a-z0-9&/]+/).filter((w) => w.length >= 3 && !['who', 'the', 'contact', 'what', 'our', 'for', 'whos', "who's", 'is', 'at', 'in'].includes(w) && !has(p.loc.name.toLowerCase(), w));
  const scored = contacts.map((c) => {
    const hay = `${c.item} ${c.vendor} ${c.who} ${c.contactNameNumber}`.toLowerCase();
    return { c, n: words.filter((w) => hay.includes(w)).length };
  }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  if (!scored.length) return { text: `I couldn't find that contact at ${p.loc.name}. Here's the full list.`, go: { to: locPath(p.loc, '/operational-poc'), label: `${p.loc.name}'s contacts` }, memory: memo };
  const c = scored[0].c;
  const filled = (c.vendor || c.contactNameNumber || '').trim();
  return {
    text: filled ? `${locLabel(p.loc)}'s ${c.item} is ${[c.vendor, c.who && `(${c.who})`].filter(Boolean).join(' ')}${c.contactNameNumber ? ', ' + c.contactNameNumber : ''}.` : `${locLabel(p.loc)}'s ${c.item} isn't filled in yet${assigneesOf(c).names.length ? `. ${assigneesOf(c).names.join(' and ')} ${assigneesOf(c).names.length > 1 ? 'are' : 'is'} on it` : ''}.`,
    cards: scored.slice(0, 3).map(({ c: x }) => ({ icon: 'phone', title: x.item, sub: [x.vendor, x.contactNameNumber].filter(Boolean).join(' · ') || 'Not filled in yet', copy: (x.contactNameNumber || '').trim() || undefined, to: locPath(p.loc, '/operational-poc') })),
    chips: [`Which contacts are missing at ${p.loc.name}?`], memory: memo,
  };
}

function detailsAnswer(s, ctx, memory) {
  const p = placeFor(s, ctx, memory);
  if (p.many) return whichOne(p.many, 'Address of');
  if (!p.loc) return null;
  const info = ctx.getInfo(p.loc.id) ?? {};
  const roles = [['landlord', 'Landlord', 'landlordContact'], ['contractor', 'Contractor', 'contractorContact'], ['project manager', 'Project manager', 'projectManagerContact', 'projectManager'], ['property manager', 'Property manager', 'propertyManagerContact', 'propertyManager']];
  for (const [word, label, contactKey, nameKey] of roles) {
    if (has(s, word)) {
      const name = info[nameKey ?? word] ?? '';
      if (!name && !info[contactKey]) return { text: `${p.loc.name}'s ${label.toLowerCase()} isn't filled in yet.`, go: { to: locPath(p.loc, '/opening-checklist'), label: 'Location details' } };
      return { text: `${p.loc.name}'s ${label.toLowerCase()} is ${name}${info[contactKey] ? ', ' + info[contactKey] : ''}.`, cards: [{ icon: 'person', title: name || label, sub: info[contactKey] || '', copy: info[contactKey] || undefined, to: locPath(p.loc, '/opening-checklist') }], memory: { lastLocId: p.loc.id } };
    }
  }
  if (info.address) return { text: `${locLabel(p.loc)} is at ${info.address}.`, cards: [{ icon: 'pin', title: info.address, sub: locLabel(p.loc), copy: info.address, href: 'https://maps.google.com/?q=' + encodeURIComponent(info.address) }], memory: { lastLocId: p.loc.id } };
  return { text: `I don't have an address saved for ${locLabel(p.loc)}.`, memory: { lastLocId: p.loc.id } };
}

function folderAnswer(s, ctx, memory, folder) {
  const p = placeFor(s, ctx, memory);
  if (p.many) return whichOne(p.many, `${folder.item ?? folder.cat.label} folder for`);
  if (!p.loc) return { text: `${folder.item ?? folder.cat.label} is a folder at every location. Which location?`, chips: ctx.locations.slice(0, 5).map((l) => `${folder.item ?? folder.cat.label} ${locLabel(l)}`) };
  if (!canSeeFolder(ctx.user, folder.cat.id)) return { text: `${folder.cat.label} folders aren't part of your access.` };
  return {
    text: folder.item ? `${folder.item} for ${locLabel(p.loc)} is in ${folder.cat.label} › ${folder.item}. It opens in Google Drive.` : `${locLabel(p.loc)}'s ${folder.cat.label} folders:`,
    cards: [{ icon: 'folder', title: folder.item ?? folder.cat.label, sub: `${locLabel(p.loc)} · ${folder.cat.label}`, to: locPath(p.loc, '/category/' + folder.cat.id) }],
    memory: { lastLocId: p.loc.id, lastIntent: 'folder' },
  };
}

function peopleAnswer(s, ctx, memory) {
  // "who is the GM at X", "who works at X"
  const job = JOB_WORDS.find(([w]) => s.includes(' ' + w));
  const { list: places } = findPlaces(s, ctx);
  if (job && /who|name/.test(s)) {
    const jw = job[1].toLowerCase();
    const mainJob = (u) => String(u.job ?? '').toLowerCase().includes(jw) && !(jw === 'general manager' && String(u.job ?? '').toLowerCase().includes('assistant'));
    const side = (u) => (u.alsoJob?.job ?? '').toLowerCase().includes(jw);
    let list = ctx.users.filter((u) => mainJob(u) || side(u));
    if (places.length) list = list.filter((u) => places.some((l) => (side(u) && u.alsoJob.locationId === l.id) || (mainJob(u) && u.role === 'manager' && ctx.hasLocationAccess(u, l.brandId, l.id) && !ctx.seesEverything(u))));
    const where = places.length ? ' at ' + locLabel(places[0]) : '';
    if (!list.length) return { text: `I can't find a ${job[1]}${where} in the Hub.` };
    return { text: list.length === 1 ? `${list[0].name} is the ${side(list[0]) && !mainJob(list[0]) ? list[0].alsoJob.job : list[0].job}${where}.` : `${where ? 'The ' + job[1] + 's' + where + ' are' : 'They are'} ${list.map((u) => u.name).join(' and ')}.`, cards: list.slice(0, 4).map(personCard) };
  }
  if (/who works|who is at|who's at|team at|staff at|people at/.test(s) && places.length) {
    const l = places[0];
    const list = ctx.users.filter((u) => u.role === 'manager' && ctx.hasLocationAccess(u, l.brandId, l.id) && !ctx.seesEverything(u));
    return { text: `${plural(list.length, 'person', 'people')} work${list.length === 1 ? 's' : ''} at ${locLabel(l)}${list.length ? ':' : '.'}`, cards: list.slice(0, 6).map(personCard) };
  }
  const people = findPeople(s, ctx);
  if (!people.length) return null;
  const u = people[0];
  if (/email|mail/.test(s)) return { text: `${u.name}'s email is ${u.email}.`, cards: [personCard(u)] };
  if (/phone|number|call/.test(s)) return { text: `I don't have a phone number for ${u.name} in the Hub. Their email is ${u.email}.`, cards: [personCard(u)] };
  if (/working on|assigned|items|tasks/.test(s)) {
    const items = ctx.entries.filter((e) => e.openingItem && !e.done && isAssignedTo(e, u.uid));
    return { text: items.length ? `${u.name} has ${plural(items.length, 'opening checklist item')}.` : `${u.name} has nothing open on the opening checklists.`, cards: items.slice(0, 3).map((i) => itemCard(i, ctx.locations.find((l) => l.id === i.locationId) ?? { name: '', id: i.locationId, brandId: i.brandId }, ctx)) };
  }
  return { text: people.length > 1 ? `I found ${people.length} people:` : u.job ? `${u.name}: ${u.job}. Their email is ${u.email}.` : `${u.name} is on the team. Their email is ${u.email}.`, cards: people.slice(0, 4).map(personCard), chips: [`Message ${u.name.split(' ')[0]}`] };
}

function timeOffAnswer(s, ctx) {
  if (/who('s| is)? (off|out)|out this week|off this week|off today|out today/.test(s)) {
    const now = ctx.now, end = startOfDay(now) + 7 * DAY;
    const list = (ctx.timeOff ?? []).filter((r) => r.status === 'approved' && r.endDate >= startOfDay(now) && r.startDate < end);
    if (!list.length) return { text: 'Nobody has approved time off in the next 7 days.', go: { to: '/availability', label: 'Availability' } };
    return { text: `${plural(list.length, 'person', 'people')} off in the next 7 days:`, cards: list.slice(0, 6).map((r) => { const u = ctx.users.find((x) => x.uid === r.uid); return { icon: 'person', title: u?.name ?? 'Someone', sub: `${fmtDay(r.startDate)} – ${fmtDay(r.endDate)}`, to: '/availability' }; }) };
  }
  if (/my (time off|request)|approved|been approved|status of my/.test(s)) {
    const mine = (ctx.timeOff ?? []).filter((r) => r.uid === ctx.user?.uid).sort((a, b) => b.timestamp - a.timestamp);
    if (!mine.length) return { text: "You don't have any time off requests.", go: { to: '/availability', label: 'Request time off' } };
    const r = mine[0];
    return { text: `Your request for ${fmtDay(r.startDate)} – ${fmtDay(r.endDate)} is ${r.status === 'pending' ? 'waiting for a decision' : r.status}.`, cards: mine.slice(0, 3).map((x) => ({ icon: 'cal', title: `${fmtDay(x.startDate)} – ${fmtDay(x.endDate)}`, sub: 'Time off', tag: [x.status, x.status === 'approved' ? 'green' : x.status === 'pending' ? 'amber' : 'red'], to: '/availability' })) };
  }
  return null;
}

function expensesAnswer(s, ctx) {
  if (!ctx.can('expenses')) return null;
  const todayKey = new Date(ctx.now).toISOString().slice(0, 10);
  const period = (ctx.periods ?? []).find((p) => p.startKey <= todayKey && todayKey <= p.endKey);
  if (/how much|spent|my total/.test(s)) {
    const mine = (ctx.receipts ?? []).filter((r) => r.submittedByUid === ctx.user?.uid && !r.voided && (!period || (r.dateSpent >= period.startKey && r.dateSpent <= period.endKey)));
    const total = mine.reduce((n, r) => n + (r.amountCents ?? 0), 0);
    return { text: `${period ? 'This period' : 'So far'} you've added ${plural(mine.length, 'receipt')} totalling $${(total / 100).toFixed(2)}.`, go: { to: '/expenses', label: 'Expenses' } };
  }
  if (/uncoded|not coded/.test(s) && ctx.seesAllReceipts) {
    const list = (ctx.receipts ?? []).filter((r) => !r.voided && !r.accountCode);
    return { text: `${plural(list.length, 'receipt')} ${list.length === 1 ? "isn't" : "aren't"} coded yet.`, go: { to: '/expenses', label: 'Expenses' } };
  }
  if (period && /period|report|due|deadline/.test(s)) {
    return { text: `We're in ${period.label ?? period.id}, ${period.startKey} to ${period.endKey}. Receipts for it should be in by the end of the period, when the report goes to Sam.`, go: { to: '/expenses', label: 'Expenses' } };
  }
  return null;
}

function cateringAnswer(s, ctx) {
  if (!ctx.can('catering')) return null;
  const list = ctx.enquiries ?? [];
  if (/confirmed/.test(s)) {
    const c = list.filter((e) => e.status === 'confirmed');
    return { text: `${plural(c.length, 'confirmed event')}${c.length ? ':' : '.'}`, cards: c.slice(0, 4).map((e) => ({ icon: 'cal', title: e.name || 'No name', sub: `${e.locationName || ''} · ${e.preferredDate ? fmtDay(e.preferredDate) : e.preferredDateText || 'date tbc'} · ${e.guests || '?'} guests`, to: '/catering' })) };
  }
  const n = list.filter((e) => e.status === 'new');
  return { text: n.length ? `${plural(n.length, 'new enquiry', 'new enquiries')} waiting:` : 'No new enquiries right now.', cards: n.slice(0, 4).map((e) => ({ icon: 'cal', title: e.name || 'No name', sub: `${e.locationName || 'No location'} · ${e.guests || '?'} guests`, tag: [e.ownerName ? e.ownerName : 'Unclaimed', e.ownerName ? 'grey' : 'amber'], to: '/catering' })), go: { to: '/catering', label: 'Catering & Events' } };
}

// ------------------------------------------------------------- why
const STOP = new Set(['the', 'and', 'for', 'does', 'need', 'needs', 'done', 'this', 'that', 'matter', 'matters', 'item', 'what', "what's", 'whats', 'late', 'locked', 'waiting', 'with', 'have', 'there', 'about', 'important', 'why', 'how', 'who', 'where', "where's", 'wheres', 'status', 'show', 'tell', 'me', 'is', 'it', 'at', 'in', 'of', 'to', 'our', 'its', 'are', 'was', 'can', 'did', 'has', 'any', 'all', 'still', 'yet', 'get', 'got', 'assigned', "who's", 'whos', 'due', 'when']);
const itemWords = (s) => s.split(/[^a-z0-9/]+/).filter((w) => w.length >= 3 && !STOP.has(w));
// Whole words count most; a longer word that matches counts more.
const wordScore = (words, title) => {
  const t = ' ' + title.toLowerCase().replace(/[^a-z0-9/]+/g, ' ') + ' ';
  const hit = words.reduce((n, w) => n + (t.includes(' ' + w + ' ') ? w.length + 2 : t.includes(w) ? Math.floor(w.length / 2) : 0), 0);
  // Of two equal matches, the one with fewer other words wins
  // ("Liquor License" over "Floor Plan (Liquor License)").
  return hit ? hit - t.trim().split(' ').length * 0.01 : 0;
};
function findItem(s, ctx, memory) {
  const words = itemWords(s);
  const p = placeFor(s, ctx, memory);
  const pool = ctx.entries.filter((e) => e.openingItem && (!p.loc || e.locationId === p.loc.id));
  let best = null;
  if (words.length) for (const e of pool) {
    const n = wordScore(words, e.title);
    if (n > 0 && (!best || n > best.n || (n === best.n && !e.done && best.e.done))) best = { e, n };
  }
  return best?.e ?? ctx.entries.find((e) => e.id === memory.lastItemId) ?? null;
}
function whyFor(item, ctx) {
  const tpl = getTemplateForLocation(item.locationId);
  const t = tpl?.items.find((x) => x.key === item.setupKey);
  if (t?.description) return t.description;
  for (const b of TIMELINE_BUCKETS) { const x = b.items.find((i) => i.key === item.setupKey || i.name === item.title); if (x?.description) return x.description; }
  return item.description || null;
}
function whyAnswer(s, ctx, memory) {
  if (/(see|access|open)\b/.test(s) && !/item|insurance|license|permit/.test(s)) return { text: "You only see the restaurants and pages your job has access to. If you need one, press 'Request access' next to it on Home. An admin decides and you'll get an email.", go: { to: '/', label: 'Home' } };
  if (/email|notif/.test(s)) {
    const pref = { default: "'What needs me now, plus one summary'", action: "'Only what needs me'", all: "'Everything, as it happens'", none: "'No emails'" }[ctx.user?.notifyEmail ?? 'default'];
    return { text: `Your email setting is ${pref}. ${ctx.user?.notifyEmail === 'none' ? 'So the Hub only shows red dots and sends no emails.' : 'You can change it in Profile.'}`, go: { to: '/profile', label: 'Profile' } };
  }
  if (/daily|sign off|signoff|tick the daily/.test(s)) return { text: 'Only the manager on duty can tick off and sign the daily checklists for their location.' };
  if (/delete/.test(s)) return { text: 'Only admins can delete that. Ask Brenner or an admin.' };
  const item = findItem(s, ctx, memory);
  if (!item) return { text: "Ask me why about a specific item and I'll tell you what it's for and what's waiting on it. For example: \"why does water service matter?\"" };
  const loc = ctx.locations.find((l) => l.id === item.locationId) ?? { name: '', id: item.locationId, brandId: item.brandId, brandName: '' };
  const { setup, tpl } = openingAt(ctx, loc);
  const memo = { lastItemId: item.id, lastLocId: loc.id, lastIntent: 'why' };
  if (/late|overdue/.test(s)) {
    if (item.done) return { text: `${item.title} is done, so it isn't late any more.`, memory: memo };
    const days = item.dateTime ? Math.floor((startOfDay(ctx.now) - startOfDay(item.dateTime)) / DAY) : 0;
    const ph = PHASES.find((x) => x.n === phaseOf(item, tpl));
    const who = assigneesOf(item).names;
    return { text: `${item.title} was due ${fmtDay(item.dateTime)}${days > 0 ? ` (${plural(days, 'day')} ago)` : ''} and hasn't been ticked off yet. Its date comes from ${loc.name}'s opening date${ph ? `: it's in the ${ph.label} phase, ${ph.blurb.charAt(0).toLowerCase() + ph.blurb.slice(1)}` : '.'} ${who.length ? `${who.join(' and ')} ${who.length > 1 ? 'are' : 'is'} assigned.` : 'Nobody is assigned yet.'}`, cards: [itemCard(item, loc, ctx)], chips: ['Why does it matter?', 'Who can I ask?'], memory: memo };
  }
  const blockers = blockersOf(item, setup, tpl);
  if (/locked|can't tick|cant tick|waiting|blocked/.test(s)) {
    if (!blockers.length) return { text: `${item.title} isn't waiting on anything. It can be ticked off now.`, memory: memo };
    return { text: `${item.title} is waiting on ${blockers.map((b) => b.title).join(' and ')}. It can't be ticked off until ${blockers.length > 1 ? 'those are' : 'that is'} done.`, cards: blockers.map((b) => itemCard(b, loc, ctx)), memory: memo };
  }
  const why = whyFor(item, ctx);
  const deps = dependentsOf(item, setup, tpl);
  const text = `${why ?? `${item.title} is part of getting ${loc.name} ready to open.`}${deps.length ? ` Right now it's holding up ${plural(deps.length, 'item')}:` : ''}`;
  return { text, cards: deps.slice(0, 4).map((d) => itemCard(d, loc, ctx, { waiting: true })), chips: [item.done ? null : 'Why is it late?', 'Who can I ask?'].filter(Boolean), memory: memo };
}

// "Show me the Starkville opening checklist" / "open Chelsea's contacts".
function navAnswer(s, ctx, memory) {
  if (!/^ ?(show me|open|take me to|go to|bring up|pull up|show)\b/.test(s)) return null;
  const parts = [['opening checklist', '/opening-checklist', 'opening checklist'], ['daily', '/daily-checklists', 'daily checklists'], ['contact', '/operational-poc', 'contacts'], ['renewal', '/renewals', 'renewals'], ['event', '/event-requests', 'event requests'], ['folders', '', 'folders']];
  const part = parts.find(([w]) => s.includes(w));
  const { list } = findPlaces(s, ctx);
  if (!list.length) return null;
  const p = placeFor(s, ctx, memory);
  if (p.many) return whichOne(p.many, `Show me the ${part ? part[2] : 'page'} for`);
  if (!p.loc) return null;
  const to = locPath(p.loc, part ? part[1] : '');
  return { text: `Here's ${locLabel(p.loc)}${part ? "'s " + part[2] : ''}.`, go: { to, label: `Open ${part ? part[2] : p.loc.name}` }, memory: { lastLocId: p.loc.id } };
}

// "liquor license chelsea": how one checklist item stands.
function itemStatus(s, ctx, memory) {
  if (!ctx.can('openingChecklist')) return null;
  const words = itemWords(s).filter((w) => !ctx.locations.some((l) => l.name.toLowerCase() === w));
  if (!words.length) return null;
  const p = placeFor(s, ctx, memory);
  const pool = ctx.entries.filter((e) => e.openingItem && (!p.loc || e.locationId === p.loc.id));
  const scored = pool.map((e) => ({ e, n: wordScore(words, e.title) })).filter((x) => x.n >= 4).sort((a, b) => b.n - a.n || Number(a.e.done) - Number(b.e.done));
  if (!scored.length) return null;
  const item = scored[0].e;
  const loc = ctx.locations.find((l) => l.id === item.locationId);
  if (!loc) return null;
  const { setup, tpl } = openingAt(ctx, loc);
  const blockers = blockersOf(item, setup, tpl);
  const who = assigneesOf(item).names;
  const state = item.done ? 'is done' : blockers.length ? `is waiting on ${blockers.map((b) => b.title).join(' and ')}` : `is due ${fmtDay(item.dateTime)}`;
  return {
    text: `${item.title} at ${locLabel(loc)} ${state}${item.done ? '' : who.length ? `, with ${who.join(' and ')}` : ', and nobody is assigned'}.`,
    cards: scored.slice(0, 3).map((x) => itemCard(x.e, ctx.locations.find((l) => l.id === x.e.locationId) ?? loc, ctx)),
    chips: [`Why does ${shortTitle(item.title)} matter?`],
    memory: { lastItemId: item.id, lastLocId: loc.id },
  };
}

// ------------------------------------------------------------- pages
function pageAnswer(s, ctx, memory) {
  let best = null;
  for (const p of PAGES) {
    const score = p.k.reduce((n, k) => {
      if (s.includes(k)) return n + k.length + 2;
      const kw = k.split(' ').filter((w) => w.length >= 3);
      return kw.length >= 2 && kw.every((w) => has(s, w)) ? n + k.length : n;
    }, 0);
    if (score > (best?.score ?? 0)) best = { p, score };
  }
  if (!best || best.score < 5) return null;
  const p = best.p;
  if (p.admin && !ctx.isAdmin) return { text: "That's something only admins can do. Ask Brenner or an admin." };
  if (p.need && !ctx.can(p.need)) return { text: `${p.label ?? 'That'} isn't part of your access. If you think it should be, ask Brenner.` };
  const out = { text: p.a, chips: p.chips, serious: p.serious };
  if (p.to) out.go = { to: p.to, label: p.label ?? 'Take me there' };
  if (p.loc) {
    const pl = placeFor(s, ctx, memory);
    if (pl.loc) out.go = { to: locPath(pl.loc, '/' + p.loc), label: `${pl.loc.name} · ${p.label ?? 'Open'}` };
  }
  if (p.folder) {
    const pl = placeFor(s, ctx, memory);
    const cat = categories.find((c) => c.id === p.folder[0]);
    if (pl.loc && cat) out.cards = [{ icon: 'folder', title: p.folder[1], sub: `${locLabel(pl.loc)} · ${cat.label}`, to: locPath(pl.loc, '/category/' + cat.id) }];
  }
  return out;
}

// ------------------------------------------------------------- fallback search
function searchAll(s, ctx) {
  const words = s.split(/[^a-z0-9&]+/).filter((w) => w.length >= 3);
  if (!words.length) return [];
  const hits = [];
  const score = (t) => words.filter((w) => t.toLowerCase().includes(w)).length;
  ctx.users.forEach((u) => { const n = score(`${u.name} ${u.job ?? ''}`); if (n) hits.push({ n: n + 0.5, card: personCard(u) }); });
  ctx.locations.forEach((l) => { const n = score(locLabel(l)); if (n) hits.push({ n, card: { icon: 'pin', title: locLabel(l), sub: 'Location', to: locPath(l) } }); });
  PAGES.forEach((p) => { if (!p.to || (p.admin && !ctx.isAdmin)) return; const n = score(`${p.label ?? ''} ${p.k.join(' ')}`); if (n) hits.push({ n: n - 0.2, card: { icon: 'page', title: p.label ?? p.to, sub: p.a.slice(0, 70) + '…', to: p.to } }); });
  ctx.entries.forEach((e) => { if (!e.openingItem || e.done) return; const n = score(e.title); if (n) { const l = ctx.locations.find((x) => x.id === e.locationId); if (l) hits.push({ n: n - 0.3, card: itemCard(e, l, ctx) }); } });
  const seen = new Set();
  return hits.sort((a, b) => b.n - a.n).filter((h) => { const k = h.card.title + h.card.sub; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 3).map((h) => h.card);
}

// Matches shown above the box while typing.
export function liveMatches(raw, ctx) {
  const s = tidy(raw);
  if (s.trim().length < 2) return [];
  return searchAll(s, ctx).slice(0, 4);
}

// ------------------------------------------------------------- main
export function answer(raw, ctx, memory = {}) {
  const s = tidy(raw);
  const t = s.trim();
  const first = String(ctx.user?.name ?? '').split(' ')[0] || 'there';
  const hour = new Date(ctx.now).getHours();
  const part = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const done = (a) => ({ cards: [], chips: [], ...a, memory: { ...memory, ...(a.memory ?? {}) } });

  if (!t) return done(pageAnswer(' what can you do ', ctx, memory));
  const smash = !t.includes(' ') && t.length >= 4 && (/[bcdfghjklmnpqrstvwxz]{4,}/.test(t) || /asdf|qwer|zxcv|hjkl|jkl;|sdfg|dfgh|fghj/.test(t));
  if (!/[aeiouy]/.test(t) || /^[^a-z]+$/.test(t) || smash || (t.length <= 2 && !/^(hi|yo|ok|k|no)$/.test(t))) return done({ text: pick(JOKES.gibberish), mood: 'joke' });

  // Emergencies are always straight.
  const page = pageAnswer(s, ctx, memory);
  if (page?.serious) return done(page);

  // Small talk.
  if (/^(hi|hey|hello|yo|hiya|howdy|sup|good (morning|afternoon|evening)|morning|evening)\b[ !.]*$/.test(t)) {
    const late = hour >= 23 || hour < 4 ? ' ' + pick(JOKES.late) : '';
    return done({ text: pick(JOKES.hello).replace('{first}', first).replace('{part}', part) + late, chips: ['What needs me?', "What's late?", 'How do I request time off?'], mood: 'joke' });
  }
  if (/^(thanks|thank you|thx|ty|cheers|appreciate it|you're the best|youre the best|perfect|great|awesome)\b/.test(t)) return done({ text: pick(JOKES.thanks), mood: 'joke' });
  if (/how are you|how's it going|hows it going|how you doing/.test(s)) return done({ text: pick(JOKES.howareyou), mood: 'joke' });
  if (/\bjoke\b|make me laugh|something funny|another one/.test(s)) return done({ text: pick(JOKES.joke), chips: ['Another one', 'What needs me?'], mood: 'joke' });
  if (/i love you|marry me|be my/.test(s)) return done({ text: pick(JOKES.love), mood: 'joke' });
  if (/meaning of life/.test(s)) return done({ text: pick(JOKES.meaning), mood: 'joke' });
  if (/^(lol|lmao|haha+|hah|hehe|😂)\b/.test(t)) return done({ text: pick(JOKES.laugh), mood: 'joke' });
  if (/^(ok|okay|k|kk|cool|yes|yep|yeah|no|nope|nah|sure|alright|got it|nice)[ !.]*$/.test(t)) return done({ text: pick(JOKES.ack) });
  if (/^(ugh|sigh|ugh+|smh|bruh|wow)[ !.]*$/.test(t)) return done({ text: pick(JOKES.sigh), mood: 'joke' });
  if (/what time is it|what's the time|whats the time|what day is it|what's today's date|todays date/.test(s)) return done({ text: pick(JOKES.time).replace('{time}', new Date(ctx.now).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' })), mood: 'joke' });
  if (memory.lastItemId && /who can i ask|who('s| is) (on|assigned to|handling|doing) (it|this|that)|who do i ask/.test(s)) {
    const item = ctx.entries.find((e) => e.id === memory.lastItemId);
    if (item) {
      const who = assigneesOf(item).uids.map((id) => ctx.users.find((u) => u.uid === id)).filter(Boolean);
      const loc = ctx.locations.find((l) => l.id === item.locationId);
      const gm = loc && ctx.users.find((u) => (u.alsoJob?.locationId === loc.id && /general manager/i.test(u.alsoJob.job)) || (u.role === 'manager' && /^general manager/i.test(u.job ?? '') && ctx.hasLocationAccess(u, loc.brandId, loc.id) && !ctx.seesEverything(u)));
      const coo = ctx.users.find((u) => u.job === 'COO');
      const people = who.length ? who : [gm, coo].filter(Boolean);
      return done({ text: who.length ? `${who.map((u) => u.name).join(' and ')} ${who.length > 1 ? 'are' : 'is'} on ${item.title}.` : `Nobody is on ${item.title} yet. ${people.length ? `Try ${people.map((u) => u.name).join(' or ')}.` : ''}`, cards: people.slice(0, 3).map(personCard) });
    }
  }
  if (memory.lastItemId && /^(what's it|what is it|whats it|is it) (waiting|blocked|holding)|what('s| is) (it|this) waiting on|what's holding it up/.test(t)) return done(whyAnswer('why is it locked waiting', ctx, memory));
  const nav = navAnswer(s, ctx, memory); if (nav) return done(nav);
  if (/^(who|what) are you|are you (a )?(robot|bot|ai|real|human)|your name/.test(t)) return done({ text: pick(JOKES.who), chips: ['What can you do?'], mood: 'joke' });
  if (RUDE_WORDS.some((w) => has(s, w)) && t.split(' ').length <= 6) return done({ text: pick(JOKES.rude), chips: ["What's late?", 'How do I request time off?'], mood: 'joke' });

  // "What about Nashville?" repeats the last question somewhere else.
  const follow = /^(what|how) about |^and |^same for /.test(t);
  if (follow && memory.lastIntent) {
    const redo = { late: () => lateAnswer(s, ctx, memory), unassigned: () => lateAnswer(s, ctx, memory, true), week: () => weekAnswer(s, ctx, memory), ready: () => readyAnswer(s, ctx, memory), renewals: () => renewalsAnswer(s, ctx, memory), contact: () => contactAnswer(memory.lastQuery + s, ctx, memory), folder: () => { const f = findFolder(memory.lastQuery ?? ''); return f ? folderAnswer(s, ctx, memory, f) : null; } }[memory.lastIntent];
    const a = redo?.();
    if (a) return done(a);
  }

  if (/\bwhy\b|what('s| is) .* for\b|what does .* do\b|why does|how come/.test(s)) return done(whyAnswer(s, ctx, memory));

  // Live data questions.
  const how = /^(how do|how can|how to|where do i|can i|where can i)/.test(t);
  if (!how) {
    if (/what needs me|my (items|tasks|to-?do|work)|assigned to me|on my plate|what do i (have|need)|anything for me/.test(s)) return done(mineAnswer(s, ctx));
    if (/unassigned|nobody assigned|no one assigned|nobody on/.test(s)) return done(lateAnswer(s, ctx, memory, true));
    if (/\blate\b/.test(s) && !/time off/.test(s)) return done(lateAnswer(s, ctx, memory));
    if (/due (this|next) week|this week.*(checklist|opening)|coming up on/.test(s)) { const a = weekAnswer(s, ctx, memory); if (a) return done(a); }
    if (/how ready|how far|progress|percent|% ready|when does .* open|opening date|when .* opens?|how close/.test(s)) return done(readyAnswer(s, ctx, memory));
    if (/renew|expir|\blease\b/.test(s) || (/\b(license|permit)\b/.test(s) && /when|expire/.test(s))) return done(renewalsAnswer(s, ctx, memory));
    const t1 = timeOffAnswer(s, ctx); if (t1) return done(t1);
    if (/\bcontact\b|toast|payroll|gift card|music|linen|pest|grease|hood|knife|uniform|alarm|security|produce|dairy|beer distributor|wine distributor/.test(s) && /who|contact|number|email|what|which/.test(s)) {
      const a = contactAnswer(s, ctx, memory); if (a) return done({ ...a, memory: { ...(a.memory ?? {}), lastQuery: s } });
    }
    if (/address|where is .* (location|restaurant)|landlord|contractor|project manager|property manager/.test(s)) { const a = detailsAnswer(s, ctx, memory); if (a) return done(a); }
    if (/today|tomorrow|this week|calendar|what's on|whats on|happening|events?\b/.test(s) && !/add|how/.test(s)) { const a = calendarAnswer(s, ctx, memory); if (a) return done(a); }
    if (/catering|enquir|inquir|leads?\b|parties|party\b|confirmed|private dining/.test(s)) { const a = cateringAnswer(s, ctx); if (a) return done(a); }
    if (/period|how much .*spent|spent this|uncoded|not coded|report due/.test(s)) { const a = expensesAnswer(s, ctx); if (a) return done(a); }
    if (/to sign|signature.*(waiting|me)|anything to sign/.test(s)) { const q = ctx.signQueue ?? []; return done({ text: q.length ? `${plural(q.length, 'document')} ${q.length === 1 ? 'is' : 'are'} waiting for your signature:` : 'Nothing is waiting for your signature.', cards: q.slice(0, 4).map((w) => ({ icon: 'page', title: w.title, sub: 'Signature Directory', to: '/work-orders' })) }); }
    if (/what restaurants|which restaurants|our restaurants|list (of )?(the )?(restaurants|locations)|how many (restaurants|locations)/.test(s)) {
      return done({ text: `You can open ${plural(ctx.locations.length, 'location')}:`, cards: ctx.locations.slice(0, 6).map((l) => ({ icon: 'pin', title: locLabel(l), sub: 'Open its page', to: locPath(l) })) });
    }
  }
  const folder = findFolder(s);
  if (folder && (/where|folder|find|put|upload|save/.test(s) || !page)) { const f = folderAnswer(s, ctx, memory, folder); return done({ ...f, memory: { ...(f.memory ?? {}), lastQuery: s } }); }
  if (page && how) return done(page);
  const ppl = peopleAnswer(s, ctx, memory); if (ppl) return done(ppl);
  if (!page) { const st = itemStatus(s, ctx, memory); if (st) return done(st); }
  if (page) return done(page);
  if (OUTSIDE_WORDS.some((w) => s.includes(w))) return done({ text: pick(JOKES.outside), chips: ['What can you do?', "What's late?"], mood: 'joke' });

  const cards = searchAll(s, ctx);
  return done({ text: `${pick(JOKES.lost)} ${cards.length ? 'Maybe one of these?' : 'Try a couple of key words, like "Chelsea late" or "time off".'}`, cards, chips: ['What can you do?', 'Ask Brenner in Support'], mood: 'joke' });
}

// What to suggest when the Guide opens, based on the page you're on.
export function openingLines(ctx) {
  const first = String(ctx.user?.name ?? '').split(' ')[0] || 'there';
  const hour = new Date(ctx.now).getHours();
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const here = ctx.here?.loc;
  const path = ctx.pathname ?? '/';
  let where = '', chips = ['What needs me?', 'How do I request time off?', "What's late?"];
  if (here && /opening-checklist/.test(path)) { where = ` You're on ${here.name}'s opening checklist.`; chips = ["What's late here?", "What's due this week here?", `How ready is ${here.name}?`]; }
  else if (here && /operational-poc/.test(path)) { where = ` You're on ${here.name}'s contacts.`; chips = [`Which contacts are missing at ${here.name}?`, `Who's the Toast contact at ${here.name}?`]; }
  else if (here) { where = ` You're at ${locLabel(here)}.`; chips = [`What's late at ${here.name}?`, `Where's the recipe folder for ${here.name}?`, `What renews at ${here.name}?`]; }
  else if (path.startsWith('/expenses')) { where = " You're on Expenses."; chips = ['How do I add a receipt?', 'How much have I spent this period?']; }
  else if (path.startsWith('/calendar')) { where = " You're on the calendar."; chips = ["What's on today?", 'What is happening this week?', 'How do I add an event?']; }
  else if (path.startsWith('/catering')) { where = " You're on Catering."; chips = ['Any new enquiries?', 'What is confirmed?', 'What do the stages mean?']; }
  const night = hour >= 23 || hour < 4 ? ' ' + pick(JOKES.late) : '';
  return { text: `Good ${part}, ${first}.${where} Ask me anything about the Hub.${night}`, chips };
}
