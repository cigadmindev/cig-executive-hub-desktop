import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAvailability } from '../context/AvailabilityContext';
import { brands } from '../data/mockData';
import { atLeast, accessLevel, rowForJob, usesUnavailableDates } from '../data/accessMatrix';

// Who sees what rows for people outside the company.
const OUTSIDE_JOBS = ['marketing', 'video'];
import { useCustomLocations } from '../context/CustomLocationsContext';
import DatePickerField from '../components/DatePickerField';
import { useDialog } from '../hooks/useDialog';
import PageHeader from '../components/PageHeader';
import { fmtDay } from '../lib/dates';
import Pill from '../components/Pill';
import { plainError } from '../lib/errors';

// Availability - one page, the same for everyone:
//   Waiting on you  (the COO and admins) time off to approve or deny
//   My hours        your usual week, set once, carried forward every week;
//                   "only this week is different" for one-offs
//   My time off     your requests and where each stands
//   My team         (GMs and up) a week grid, time off shaded; executives
//                   also get "Executive team" - each other (Mark, 10 Oct 2026)
//
// Each working day can say where you'll be (10 Oct 2026): the Corporate
// office, a restaurant in general, one of its locations, on the road, or
// working from home. Stored on the day as where: 'corporate' | 'road' |
// 'home' | 'brand:<id>' | 'loc:<id>'.
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
const BLANK = { off: true, start: '09:00', end: '17:00' };
const DAY = 24 * 60 * 60 * 1000;

const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function mondayOf(offsetWeeks = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7);
  return d;
}
const fmt = (t) => {
  const [h, m] = t.split(':').map(Number);
  const hh = ((h + 11) % 12) + 1;
  return hh + (m ? ':' + String(m).padStart(2, '0') : '') + (h < 12 ? 'a' : 'p');
};
const span = (d) => (!d || d.off ? null : fmt(d.start) + '–' + fmt(d.end));
const shortDate = (ms) => fmtDay(ms);
const range = (r) => (r.endDate && r.endDate !== r.startDate ? shortDate(r.startDate) + ' – ' + shortDate(r.endDate) : shortDate(r.startDate));

// What someone is working on a given week: that week's override, or the usual.
function weekFor(record, mondayKey) {
  if (!record) return null;
  return record.overrides?.[mondayKey] ?? record;
}

export default function AvailabilityScreen() {
  const { user, users, refreshUsers, hasLocationAccess, hasBrandAccess } = useAuth();
  const { timeOffRequests, weeklyAvailability, unavailableDates, addUnavailable, removeUnavailable, submitTimeOff, resolveTimeOff, deleteTimeOffRequest, setMyWeeklyAvailability, setWeekOverride } = useAvailability();
  const { getByBrand } = useCustomLocations();
  const { dialogNode, notify, confirm } = useDialog();

  const approves = user?.role === 'admin' || atLeast(user, 'availability', 'approve');
  const isExec = user?.role === 'admin' || user?.role === 'executive';
  const seesTeam = isExec || atLeast(user, 'availability', 'team');
  // Executives put in when they're unavailable instead of asking for time
  // off (14 Oct 2026). Not Cameron (IT & Training), Marketing or video.
  const away = usesUnavailableDates(user);

  useEffect(() => {
    if (seesTeam && !(users ?? []).length && refreshUsers) refreshUsers().catch(() => {});
  }, [seesTeam]);

  // ---- My hours ----
  const mine = weeklyAvailability.find((w) => w.uid === user?.uid);
  const thisMonday = ymd(mondayOf(0));
  const [editing, setEditing] = useState(null); // 'usual' | 'week'
  const [draft, setDraft] = useState(null);
  const startEdit = (kind) => {
    const base = kind === 'week' ? weekFor(mine, thisMonday) : mine;
    setDraft(Object.fromEntries(DAYS.map((d) => [d, { ...(base?.[d] ?? BLANK) }])));
    setEditing(kind);
  };
  const saveHours = async () => {
    try {
      if (editing === 'usual') await setMyWeeklyAvailability(draft);
      else await setWeekOverride(thisMonday, draft);
      setEditing(null);
      notify('Saved', editing === 'usual' ? 'Your usual week carries forward every week.' : 'Saved for this week only.');
    } catch (err) {
      notify('Could not save', plainError(err, 'Try again.'));
    }
  };
  const hasUsual = !!mine && DAYS.some((d) => mine[d] && !mine[d].off);
  const thisWeekDiffers = !!mine?.overrides?.[thisMonday];
  const shownWeek = weekFor(mine, thisMonday);

  // ---- Time off ----
  const [formOpen, setFormOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const submit = async () => {
    if (!from) return;
    const s = new Date(from + 'T12:00:00').getTime();
    const e = to ? new Date(to + 'T12:00:00').getTime() : s;
    if (e < s) return notify('Check the dates', 'The last day is before the first.');
    try {
      if (away) await addUnavailable(s, e, reason.trim());
      else await submitTimeOff(s, e, reason.trim());
      setFormOpen(false);
      setFrom(''); setTo(''); setReason('');
      if (away) notify('Added', 'The executive team will see these dates.');
      else notify('Sent', 'Ronnie or an admin will decide, and you will be emailed the answer.');
    } catch (err) {
      notify(away ? 'Could not add' : 'Could not send', plainError(err, 'Try again.'));
    }
  };
  const myUnavailable = unavailableDates.filter((u) => u.uid === user?.uid).sort((a, b) => a.startDate - b.startDate);
  const myRequests = timeOffRequests.filter((r) => r.uid === user?.uid).sort((a, b) => b.startDate - a.startDate);
  const waiting = approves ? timeOffRequests.filter((r) => r.status === 'pending' && (user?.role === 'admin' || r.uid !== user?.uid)) : [];
  const [denying, setDenying] = useState(null);
  const [denyReason, setDenyReason] = useState('');

  // ---- Team ----
  const myLocations = useMemo(() => {
    const out = [];
    brands.forEach((b) => {
      [...(b.locations ?? []), ...getByBrand(b.id).map((l) => ({ id: l.id, name: l.name }))].forEach((l) => {
        if (user?.role === 'admin' || hasLocationAccess(user, b.id, l.id)) out.push({ brandId: b.id, id: l.id, label: b.name + ' · ' + l.name });
      });
    });
    return out;
  }, [user?.uid, getByBrand]);
  // Where someone can say they'll be: Corporate, each restaurant they can
  // see in general and each of its locations, on the road, from home.
  const placeGroups = useMemo(
    () =>
      brands
        .filter((b) => hasBrandAccess(user, b.id) || !b.execOnly)
        .map((b) => ({
          label: b.name,
          options: [
            { value: 'brand:' + b.id, label: b.name + ' (general)' },
            ...[...(b.locations ?? []), ...getByBrand(b.id)].map((l) => ({ value: 'loc:' + l.id, label: b.name + ' · ' + l.name })),
          ],
        })),
    [user?.uid, getByBrand]
  );
  const placeName = useMemo(() => {
    const m = { corporate: 'Corporate', road: 'On the road', home: 'From home' };
    brands.forEach((b) => {
      const short = b.name.split(' ')[0] === 'Cajun' ? b.name : b.name.split(' ')[0];
      m['brand:' + b.id] = b.name;
      [...(b.locations ?? []), ...getByBrand(b.id)].forEach((l) => (m['loc:' + l.id] = short + ' · ' + l.name));
    });
    return m;
  }, [getByBrand]);
  const whereOf = (day) => (day && !day.off && day.where ? placeName[day.where] ?? 'Elsewhere' : null);

  // Executives see each other as a team of their own (Mark, 10 Oct 2026).
  const EXEC = '__exec';
  const teamChoices = [...(isExec ? [{ id: EXEC, label: 'Executive team' }] : []), ...myLocations];
  const [locKey, setLocKey] = useState('');
  const loc = teamChoices.find((l) => l.id === locKey) ?? teamChoices[0];
  const [weekOffset, setWeekOffset] = useState(0);
  const teamMonday = mondayOf(weekOffset);
  const teamKey = ymd(teamMonday);
  const team = loc?.id === EXEC
    ? (users ?? [])
        .filter((u) => u.active !== false && !u.isGhost && (u.role === 'executive' || u.role === 'admin'))
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    : (users ?? [])
    .filter((u) => u.active !== false && !u.isGhost && u.role !== 'admin' && loc)
    // A location's team is the people who work there (14 Oct 2026). Outside
    // people with a login - the agency (Marketing: Ben, Erica, Laci) and the
    // videographer (Nico) - are left off by their job, whatever the
    // Availability column says, and so is any job with no Availability. A
    // login with no job set stays on. The Executive team view is unchanged.
    .filter((u) => {
      const row = rowForJob(u.job);
      if (!row) return true;
      return !OUTSIDE_JOBS.includes(row.id) && accessLevel(u, 'availability') !== 'none';
    })
    .filter((u) => {
      // A second job at this location (Cameron, Starkville GM) puts them here.
      if (u.alsoJob?.locationId === loc.id) return true;
      if (u.role !== 'manager' || !(u.permissions?.brandIds ?? []).includes(loc.brandId)) return false;
      const only = u.permissions?.locationsByBrand?.[loc.brandId];
      return !Array.isArray(only) || only.length === 0 || only.includes(loc.id);
    })
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const offOn = (uid, dayIndex) => {
    const t = teamMonday.getTime() + dayIndex * DAY + DAY / 2;
    return timeOffRequests.some((r) => r.uid === uid && r.status === 'approved' && r.startDate - DAY / 2 <= t && t <= r.endDate + DAY / 2);
  };
  // An executive's unavailable dates on that day, if any (shaded the same).
  const unavailableOn = (uid, dayIndex) => {
    const t = teamMonday.getTime() + dayIndex * DAY + DAY / 2;
    return unavailableDates.find((u) => u.uid === uid && u.startDate - DAY / 2 <= t && t <= u.endDate + DAY / 2) ?? null;
  };

  // Built only while editing - draft is empty the rest of the time.
  const dayEditor = () => (
    <div style={styles.editor}>
      {DAYS.map((d) => (
        <div key={d} style={styles.editRow}>
          <span style={styles.editDay}>{SHORT[d]}</span>
          <label style={styles.offLabel}>
            <input type="checkbox" checked={!draft?.[d]?.off} onChange={(e) => setDraft({ ...draft, [d]: { ...draft[d], off: !e.target.checked } })} /> Working
          </label>
          {!draft?.[d]?.off ? (
            <>
              <input type="time" style={styles.time} value={draft[d].start} onChange={(e) => setDraft({ ...draft, [d]: { ...draft[d], start: e.target.value } })} />
              <span style={styles.muted}>to</span>
              <input type="time" style={styles.time} value={draft[d].end} onChange={(e) => setDraft({ ...draft, [d]: { ...draft[d], end: e.target.value } })} />
              <select
                style={{ ...styles.select, minWidth: 190 }}
                aria-label={'Where on ' + SHORT[d]}
                value={draft[d].where ?? ''}
                onChange={(e) => setDraft({ ...draft, [d]: { ...draft[d], where: e.target.value || null } })}
              >
                <option value="">Where? (optional)</option>
                <option value="corporate">Corporate office</option>
                {placeGroups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </optgroup>
                ))}
                <option value="road">On the road</option>
                <option value="home">Working from home</option>
              </select>
            </>
          ) : <span style={styles.muted}>Off</span>}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button style={styles.ghost} onClick={() => setEditing(null)}>Cancel</button>
        <button style={styles.primary} onClick={saveHours}>{editing === 'usual' ? 'Save my usual week' : 'Save for this week only'}</button>
      </div>
    </div>
  );

  return (
    <div style={styles.page}>
      <PageHeader
        title="Availability"
        subtitle={`Your usual hours and ${away ? 'when you\'re unavailable' : 'your time off'}${seesTeam ? ', and your team\'s' : ''}.`}
        actionLabel={away ? '+ Add unavailable dates' : '+ Request time off'}
        onAction={() => setFormOpen(true)}
      />

      {formOpen ? (
        <div style={styles.card}>
          <p style={styles.cardTitle}>{away ? 'Add unavailable dates' : 'Request time off'}</p>
          <div style={styles.formRow}>
            <div style={{ flex: 1 }}><p style={styles.label}>First day</p><DatePickerField value={from} onChange={setFrom} /></div>
            <div style={{ flex: 1 }}><p style={styles.label}>Last day (leave blank for one day)</p><DatePickerField value={to} onChange={setTo} min={from || undefined} /></div>
          </div>
          <p style={styles.label}>{away ? 'Note (optional)' : 'Reason (optional)'}</p>
          <input style={styles.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={away ? 'e.g. Thanksgiving with family' : 'e.g. Family wedding'} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button style={styles.ghost} onClick={() => setFormOpen(false)}>Cancel</button>
            <button style={{ ...styles.primary, ...(from ? {} : { opacity: 0.4 }) }} disabled={!from} onClick={submit}>{away ? 'Add' : 'Send request'}</button>
          </div>
        </div>
      ) : null}

      {waiting.length > 0 ? (
        <div style={{ ...styles.card, borderLeft: '3px solid var(--warn)' }}>
          <p style={styles.cardTitle}>{waiting.length} request{waiting.length === 1 ? '' : 's'} waiting on you</p>
          {waiting.map((r) => (
            <div key={r.id} style={styles.row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={styles.strong}>{r.name}</strong>
                <span style={styles.muted}> · {range(r)}{r.reason ? ' · “' + r.reason + '”' : ''}</span>
                {denying === r.id ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input style={{ ...styles.input, flex: 1 }} autoFocus value={denyReason} onChange={(e) => setDenyReason(e.target.value)} placeholder="Reason - they will see this" />
                    <button style={styles.ghost} onClick={() => { setDenying(null); setDenyReason(''); }}>Cancel</button>
                    <button style={styles.primarySmall} onClick={async () => { await resolveTimeOff(r.id, 'denied', denyReason.trim()); setDenying(null); setDenyReason(''); }}>Decline</button>
                  </div>
                ) : null}
              </div>
              {denying !== r.id ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={styles.primarySmall} onClick={() => resolveTimeOff(r.id, 'approved')}>Approve</button>
                  <button style={styles.ghost} onClick={() => { setDenying(r.id); setDenyReason(''); }}>Decline…</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div style={styles.twoCol}>
        <div style={styles.card}>
          <p style={styles.cardTitle}>My hours</p>
          <p style={styles.note}>Set your usual week once — it carries forward every week. If one week is different, change just that week.</p>
          {editing && draft ? dayEditor() : (
            <>
              {!hasUsual ? <p style={styles.note}><strong style={styles.strong}>You haven't set your usual week yet.</strong></p> : null}
              {thisWeekDiffers ? <p style={styles.badge}>This week is different from usual</p> : null}
              {DAYS.map((d) => (
                <div key={d} style={styles.hourRow}>
                  <span>{SHORT[d]}</span>
                  <span style={span(shownWeek?.[d]) ? styles.strong : styles.muted}>
                    {span(shownWeek?.[d]) ?? 'Off'}
                    {whereOf(shownWeek?.[d]) ? <span style={styles.muted}> · {whereOf(shownWeek?.[d])}</span> : null}
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button style={styles.ghost} onClick={() => startEdit('usual')}>{hasUsual ? 'Edit my usual week' : 'Set my usual week'}</button>
                {hasUsual ? <button style={styles.ghost} onClick={() => startEdit('week')}>Only this week is different</button> : null}
                {thisWeekDiffers ? <button style={styles.ghost} onClick={() => setWeekOverride(thisMonday, null)}>Back to usual this week</button> : null}
              </div>
            </>
          )}
        </div>

        {away ? (
          <div style={styles.card}>
            <p style={styles.cardTitle}>When I'm unavailable · {new Date().getFullYear()}</p>
            <p style={styles.note}>Add dates with the button at the top. Nobody approves them; the executive team sees them on its view.</p>
            {myUnavailable.length === 0 ? <p style={styles.muted}>No dates added.</p> : null}
            {myUnavailable.map((u) => {
              const past = u.endDate < Date.now() - DAY / 2;
              return (
                <div key={u.id} style={{ ...styles.row, ...(past ? { opacity: 0.5 } : {}) }}>
                  <div style={{ flex: 1 }}>
                    <strong style={styles.strong}>{range(u)}</strong>
                    {u.note ? <span style={styles.muted}> · {u.note}</span> : null}
                  </div>
                  {!past ? (
                    <button style={styles.linkDanger} onClick={() => confirm({ title: 'Remove these dates?', confirmLabel: 'Remove', onConfirm: () => removeUnavailable(u.id) })}>Remove</button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
        <div style={styles.card}>
          <p style={styles.cardTitle}>My time off</p>
          <p style={styles.note}>Ask with the button at the top. Ronnie or an admin decides, and you're emailed the answer.</p>
          {myRequests.length === 0 ? <p style={styles.muted}>Nothing requested.</p> : null}
          {myRequests.map((r) => (
            <div key={r.id} style={styles.row}>
              <div style={{ flex: 1 }}>
                <strong style={styles.strong}>{range(r)}</strong>
                {r.reason ? <span style={styles.muted}> · {r.reason}</span> : null}
                {r.status === 'denied' && r.denialReason ? <div style={styles.muted}>“{r.denialReason}”</div> : null}
              </div>
              <Pill tone={r.status === 'approved' ? 'green' : r.status === 'denied' ? 'red' : 'amber'}>
                {r.status === 'pending' ? 'Pending' : r.status === 'approved' ? 'Approved' : 'Declined'}
              </Pill>
              {r.status === 'pending' ? (
                <button style={styles.linkDanger} onClick={() => confirm({ title: 'Withdraw this request?', confirmLabel: 'Withdraw', onConfirm: () => deleteTimeOffRequest(r.id) })}>Withdraw</button>
              ) : null}
            </div>
          ))}
        </div>
        )}
      </div>

      {seesTeam && loc ? (
        <div style={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <p style={{ ...styles.cardTitle, margin: 0, flex: 1 }}>
              {loc.id === EXEC ? 'Executive team' : 'My team'} <span style={styles.muted}>· week of {teamMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </p>
            <button style={styles.ghost} onClick={() => setWeekOffset(weekOffset - 1)}>‹</button>
            <select style={styles.select} value={loc.id} onChange={(e) => setLocKey(e.target.value)}>
              {teamChoices.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            <button style={styles.ghost} onClick={() => setWeekOffset(weekOffset + 1)}>›</button>
          </div>
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={styles.grid}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, textAlign: 'left' }}>Person</th>
                  {DAYS.map((d, i) => (
                    <th key={d} style={styles.th}>{SHORT[d]} {new Date(teamMonday.getTime() + i * DAY).getDate()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {team.length === 0 ? (
                  <tr><td style={styles.td} colSpan={8}>{loc.id === EXEC ? 'No executives found.' : 'Nobody is assigned to this location yet.'}</td></tr>
                ) : team.map((u) => {
                  const rec = weekFor(weeklyAvailability.find((w) => w.uid === u.uid), teamKey);
                  return (
                    <tr key={u.uid}>
                      <td style={{ ...styles.td, textAlign: 'left', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{u.name} <span style={styles.muted}>· {u.job ?? ''}</span></td>
                      {DAYS.map((d, i) => {
                        const ua = unavailableOn(u.uid, i);
                        const off = !ua && offOn(u.uid, i);
                        const s = span(rec?.[d]);
                        return (
                          <td key={d} title={ua?.note || undefined} style={{ ...styles.td, ...(off || ua ? styles.offCell : {}) }}>
                            {ua ? 'Unavailable' : off ? 'Off' : !rec ? <span style={styles.muted}>not set</span> : s ?? '—'}
                            {!off && !ua && s && whereOf(rec?.[d]) ? <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{whereOf(rec?.[d])}</div> : null}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ ...styles.note, marginTop: 8 }}>Amber is approved time off{loc.id === EXEC ? ' or unavailable dates (hover for the note)' : ''}. “Not set” means they haven't filled in their usual week.</p>
        </div>
      ) : null}
      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '28px max(22px, min(36px, 4vw)) 60px', maxWidth: 1100 },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' },
  note: { fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 },
  row: { display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--border)', padding: '10px 0', fontSize: 14 },
  hourRow: { display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', padding: '8px 0', fontSize: 13, color: 'var(--text-secondary)' },
  strong: { color: 'var(--text-primary)', fontWeight: 700 },
  muted: { color: 'var(--text-tertiary)', fontSize: 13 },
  badge: { display: 'inline-block', fontSize: 11, fontWeight: 800, color: 'var(--warn)', background: '#3A2A0E', borderRadius: 5, padding: '3px 8px', margin: '0 0 8px' },
  primary: { background: 'var(--neon)', color: '#0A0A0B', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer' },
  primarySmall: { background: 'var(--neon)', color: '#0A0A0B', border: 'none', borderRadius: 7, padding: '6px 12px', fontWeight: 800, fontSize: 12, cursor: 'pointer' },
  ghost: { minHeight: 40, background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer' },
  linkDanger: { background: 'none', border: 'none', color: 'var(--danger)', fontSize: 12, cursor: 'pointer' },
  label: { fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 6px' },
  input: { width: '100%', boxSizing: 'border-box', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)', fontFamily: 'inherit' },
  formRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  select: { background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'inherit' },
  editor: { marginTop: 4 },
  editRow: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderTop: '1px solid var(--border)', padding: '7px 0', fontSize: 13, color: 'var(--text-secondary)' },
  editDay: { width: 36, fontWeight: 700, color: 'var(--text-primary)' },
  offLabel: { width: 90, display: 'flex', alignItems: 'center', gap: 4 },
  time: { background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 6px', color: 'var(--text-primary)', fontFamily: 'inherit' },
  grid: { borderCollapse: 'collapse', width: '100%', minWidth: 760, fontSize: 12 },
  th: { color: 'var(--text-secondary)', fontWeight: 700, padding: '6px', textAlign: 'center', borderBottom: '1px solid var(--border)' },
  td: { border: '1px solid var(--border)', padding: '7px 6px', textAlign: 'center', color: 'var(--text-secondary)' },
  offCell: { background: '#3A2A0E', color: 'var(--warn)', fontWeight: 700 },
};
