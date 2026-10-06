// The CIG fiscal calendar, and which period a receipt belongs to.
//
// Periods come from the fiscalPeriods collection, loaded from finance's
// calendar by hub-migrations/expense-periods-setup.js. Nothing here hard-codes
// a date: a new year is a data load, not a deploy.
//
// A period runs Monday to Sunday. The five weekdays after it - Monday to Friday
// - are its catch-up window: a receipt spent in that period and handed in
// during the window still goes into it. After Friday the period is shut, and a
// receipt spent in it goes into whichever period is current. Holidays are not
// considered; finance asked for it to follow the calendar only.
const admin = require('firebase-admin');

const ZONE = 'America/Chicago';
const PERIODS = 'fiscalPeriods';

// YYYY-MM-DD as seen in Central, wherever the server is.
function centralDateKey(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Calendar arithmetic on date keys, done at noon UTC so no clock change can
// push a day across a boundary.
function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 12) + n * 86400000);
  return t.toISOString().slice(0, 10);
}

function weekday(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); // 0 Sunday .. 6 Saturday
}

async function loadPeriods(db = admin.firestore()) {
  const snap = await db.collection(PERIODS).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.startKey.localeCompare(b.startKey));
}

function periodFor(periods, dateKey) {
  return periods.find((p) => p.startKey <= dateKey && dateKey <= p.endKey) ?? null;
}

// Whether a period is still taking receipts on a given day.
function isOpenOn(period, todayKey) {
  return todayKey <= period.windowEndKey;
}

// The period a receipt goes into, judged on the day it is submitted.
//   Spent in the current period             -> current period
//   Spent in a period still in its window   -> that period
//   Spent in a period that has shut         -> current period
// Returns null when today is outside the loaded calendar.
function assignPeriod(periods, dateSpent, todayKey) {
  const current = periodFor(periods, todayKey);
  if (!current) return null;
  const spent = periodFor(periods, dateSpent);
  if (spent && spent.id !== current.id && isOpenOn(spent, todayKey)) return spent;
  return current;
}

function periodRange(p) {
  const fmt = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
    });
  };
  return fmt(p.startKey) + ' – ' + fmt(p.endKey);
}

module.exports = { ZONE, PERIODS, centralDateKey, addDays, weekday, loadPeriods, periodFor, isOpenOn, assignPeriod, periodRange };
