// One way to write dates and times everywhere (V2, 8 Oct 2026), always in
// Central time - the restaurants' time, whoever is looking.
//
//   fmtDay(ms)       Thu, Oct 8        (another year: Jan 31, 2027)
//   fmtTime(ms)      3:20 PM
//   fmtDayTime(ms)   Today · 3:20 PM   /  Thu, Oct 8 · 3:20 PM
//   fmtDayKey(key)   the same as fmtDay, for a stored 'YYYY-MM-DD' day
//
// Page headings (Home's "Thursday, October 8", the calendar's day title)
// keep their long form on purpose; these are for lists, rows and details.
export const TZ = 'America/Chicago';

const valid = (ms) => ms != null && ms !== '' && !Number.isNaN(new Date(ms).getTime());
const yearOf = (d) => d.toLocaleDateString('en-US', { timeZone: TZ, year: 'numeric' });
const dayOf = (d) => d.toLocaleDateString('en-CA', { timeZone: TZ });

export function fmtDay(ms) {
  if (!valid(ms)) return '';
  const d = new Date(ms);
  return yearOf(d) === yearOf(new Date())
    ? d.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' })
    : d.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtTime(ms) {
  if (!valid(ms)) return '';
  return new Date(ms).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
}

export function fmtDayTime(ms) {
  if (!valid(ms)) return '';
  const d = new Date(ms);
  const day = dayOf(d) === dayOf(new Date()) ? 'Today' : fmtDay(ms);
  return day + ' · ' + fmtTime(ms);
}

// A stored day ('2026-10-08') is a day, not a moment: read at noon Central
// so it can never slip to the day before.
export function fmtDayKey(key) {
  if (!key || typeof key !== 'string') return '';
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return '';
  return fmtDay(Date.UTC(y, m - 1, d, 17));
}
