import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where, orderBy, addDoc, updateDoc, deleteDoc, setDoc, writeBatch, arrayUnion } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useIsNarrow } from '../hooks/useIsNarrow';
import { accessLevel, rowForJob } from '../data/accessMatrix';
import RequestPage, { Pill, detailStyles as d } from './RequestPage';
import DatePickerField from './DatePickerField';
import { fmtDay } from '../lib/dates';
import { plainError } from '../lib/errors';
import { modalBackdrop, modalSurface } from '../theme/modal';

// Outreach (26 Oct 2026, sketch 30): Ronnie's local-marketing binder as a tab
// on Catering & Events. Catering & Events managers keep a list of the places
// they have been or want to go - schools, churches, businesses, hotels - log
// each visit, and are reminded by email when a follow-up comes due (a month
// after a visit unless they pick another date). The binder's event plan sheet
// is the Planned events list underneath. Executives see every location; the
// COO (and admins) can set a monthly visit goal per location, and anyone who
// can see a place can leave a note on it that the manager sees.
export const BUCKETS = {
  fundraising: { label: 'Fundraising', color: '#E8B33A' },
  schools: { label: 'Schools', color: '#4FB3F6' },
  sports: { label: 'Sports', color: '#7ED3A0' },
  neighborhood: { label: 'Neighborhood', color: '#C084FC' },
};
const TYPES = ['Business', 'School', 'Church', 'Hotel', 'Apartment complex', 'Military', 'Sports team or league', 'Nonprofit', 'Other'];
const STATUS = {
  toVisit: ['To visit', 'amber'],
  visited: ['Visited', 'grey'],
  talking: ['Talking', 'cyan'],
  booked: ['Booked', 'green'],
};
const LEFT = ['Catering menu', 'Gift card', 'Sample tray', 'Business card'];
const DAY = 24 * 60 * 60 * 1000;
const FOLLOW_UP_DAYS = 30;

const toInput = (t) => {
  if (!t) return '';
  const x = new Date(t);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
};
const fromInput = (s) => (s ? new Date(s + 'T12:00:00').getTime() : null);
const endOfToday = () => { const x = new Date(); x.setHours(23, 59, 59, 999); return x.getTime(); };
const monthStart = () => { const x = new Date(); x.setDate(1); x.setHours(0, 0, 0, 0); return x.getTime(); };
const quarterStart = () => { const x = new Date(); x.setMonth(Math.floor(x.getMonth() / 3) * 3, 1); x.setHours(0, 0, 0, 0); return x.getTime(); };
const isDue = (p) => p.nextFollowUpAt && p.nextFollowUpAt <= endOfToday();

const BLANK_PLACE = { name: '', type: 'Business', bucket: 'neighborhood', contactName: '', phone: '', email: '', address: '', locationId: '' };
const BLANK_EVENT = { title: '', placeId: '', contactName: '', bucket: 'neighborhood', date: '', expected: '', locationId: '' };

function Bucket({ id }) {
  const b = BUCKETS[id] ?? { label: 'Other', color: '#83838E' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: b.color, flexShrink: 0 }} />
      {b.label}
    </span>
  );
}

export default function OutreachPanel({ tabs, locationOptions, locationName, onMakeEnquiry, notify }) {
  const { user } = useAuth();
  const isNarrow = useIsNarrow();
  const isAdmin = user?.role === 'admin';
  const seesAll = isAdmin || user?.role === 'executive';
  const isCoo = rowForJob(user?.job)?.id === 'coo';
  const canWork = isAdmin || accessLevel(user, 'catering') === 'claim';
  const canSetGoals = isAdmin || isCoo;
  // Where this person can add a place: their own locations.
  const myPlaces = canWork ? locationOptions : [];

  const [places, setPlaces] = useState([]);
  const [events, setEvents] = useState([]);
  const [goals, setGoals] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('all');
  const [locFilter, setLocFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [visits, setVisits] = useState([]);
  const [notes, setNotes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [editingPlace, setEditingPlace] = useState(null);
  const [logging, setLogging] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [editingEvent, setEditingEvent] = useState(null);
  const [goalDraft, setGoalDraft] = useState(null);

  // The same questions the catering list asks: everything for executives,
  // otherwise one per restaurant or per location on their login - the
  // database only answers questions it can see are theirs.
  useEffect(() => {
    if (!user) return undefined;
    const mine = user.permissions?.brandIds ?? [];
    const sourcesFor = (name) => {
      const col = collection(db, name);
      if (seesAll) return [col];
      if (!canWork) return [];
      return mine.slice(0, 30).flatMap((b) => {
        const only = user.permissions?.locationsByBrand?.[b];
        return Array.isArray(only) && only.length
          ? only.map((l) => query(col, where('brandId', '==', b), where('locationId', '==', l)))
          : [query(col, where('brandId', '==', b))];
      });
    };
    const listen = (name, set) => {
      const sources = sourcesFor(name);
      if (!sources.length) { set([]); return []; }
      const parts = sources.map(() => null);
      return sources.map((s, i) => onSnapshot(s, (snap) => {
        parts[i] = snap.docs.map((x) => ({ id: x.id, ...x.data() }));
        if (parts.every(Boolean)) { set(parts.flat()); setLoaded(true); }
      }, () => { parts[i] = []; if (parts.every(Boolean)) { set(parts.flat()); setLoaded(true); } }));
    };
    const unsubs = [
      ...listen('outreachPlaces', setPlaces),
      ...listen('outreachEvents', setEvents),
      onSnapshot(collection(db, 'outreachGoals'), (snap) => {
        const g = {};
        snap.docs.forEach((x) => { g[x.id] = x.data(); });
        setGoals(g);
      }, () => setGoals({})),
    ];
    if (!seesAll && !canWork) setLoaded(true);
    return () => unsubs.forEach((u) => u());
  }, [user?.uid, seesAll, canWork]);

  const inLoc = (x) => locFilter === 'all' || x.locationId === locFilter;
  const scoped = places.filter(inLoc);
  const shownPlaces = scoped
    .filter((p) => filter === 'all' || (filter === 'due' ? isDue(p) : p.bucket === filter))
    .sort((a, b) => (isDue(b) ? 1 : 0) - (isDue(a) ? 1 : 0) || (a.nextFollowUpAt ?? 9e15) - (b.nextFollowUpAt ?? 9e15) || a.name.localeCompare(b.name));
  const selected = places.find((p) => p.id === selectedId) ?? shownPlaces[0] ?? null;

  useEffect(() => {
    setVisits([]); setNotes([]);
    if (!selected) return undefined;
    const a = onSnapshot(query(collection(db, 'outreachPlaces', selected.id, 'visits'), orderBy('at', 'desc')), (s) => setVisits(s.docs.map((x) => ({ id: x.id, ...x.data() }))), () => setVisits([]));
    const b = onSnapshot(query(collection(db, 'outreachPlaces', selected.id, 'notes'), orderBy('at', 'desc')), (s) => setNotes(s.docs.map((x) => ({ id: x.id, ...x.data() }))), () => setNotes([]));
    return () => { a(); b(); };
  }, [selected?.id]);

  // The numbers across the top, for whichever locations are in view.
  const locIdsInView = locFilter === 'all' ? [...new Set([...places.map((p) => p.locationId), ...myPlaces.map((l) => l.id)])] : [locFilter];
  const visitsThisMonth = (ps) => ps.reduce((n, p) => n + (p.visitDates ?? []).filter((t) => t >= monthStart()).length, 0);
  const bookedThisQuarter = (ps) => ps.filter((p) => p.bookedAt && p.bookedAt >= quarterStart()).length;
  const goalFor = (ids) => {
    const set = ids.map((id) => goals[id]?.monthlyVisits).filter((n) => typeof n === 'number' && n > 0);
    return set.length ? set.reduce((a, b) => a + b, 0) : null;
  };
  const monthCount = visitsThisMonth(scoped);
  const goal = goalFor(locIdsInView);
  const dueCount = scoped.filter(isDue).length;

  const run = async (fn, done) => {
    setBusy(true);
    try { await fn(); done?.(); } catch (err) { notify('Nothing was changed', plainError(err, 'Try again.')); } finally { setBusy(false); }
  };

  const savePlace = () => run(async () => {
    const p = editingPlace;
    if (!p.name.trim()) throw new Error('Add the name of the place.');
    const loc = locationOptions.find((l) => l.id === p.locationId);
    if (!loc) throw new Error('Choose which of your locations it is for.');
    const fields = {
      name: p.name.trim(), type: p.type, bucket: p.bucket, contactName: p.contactName.trim(), phone: p.phone.trim(),
      email: p.email.trim(), address: p.address.trim(), locationId: loc.id, brandId: loc.brandId,
    };
    if (p.id) {
      await updateDoc(doc(db, 'outreachPlaces', p.id), fields);
    } else {
      const ref = await addDoc(collection(db, 'outreachPlaces'), {
        ...fields, status: 'toVisit', visitDates: [], lastVisitAt: null, nextFollowUpAt: null,
        createdByUid: user.uid, createdByName: user.name ?? '', createdAt: Date.now(),
      });
      setSelectedId(ref.id);
    }
  }, () => setEditingPlace(null));

  const removePlace = (p) => run(async () => {
    await deleteDoc(doc(db, 'outreachPlaces', p.id));
  }, () => { setEditingPlace(null); setSelectedId(null); });

  const saveVisit = () => run(async () => {
    const v = logging;
    const at = fromInput(v.date);
    if (!at) throw new Error('Pick the date of the visit.');
    if (!v.note.trim()) throw new Error('Add a line about what happened.');
    const next = fromInput(v.next);
    const p = places.find((x) => x.id === v.placeId);
    const batch = writeBatch(db);
    batch.set(doc(collection(db, 'outreachPlaces', p.id, 'visits')), {
      at, note: v.note.trim(), left: v.left, byUid: user.uid, byName: user.name ?? '', createdAt: Date.now(),
    });
    batch.update(doc(db, 'outreachPlaces', p.id), {
      visitDates: arrayUnion(at),
      lastVisitAt: Math.max(at, p.lastVisitAt ?? 0),
      nextFollowUpAt: next,
      ...(p.status === 'toVisit' ? { status: 'visited' } : {}),
    });
    await batch.commit();
  }, () => { setSelectedId(logging.placeId); setLogging(null); });

  const setStatus = (p, status) => run(() => updateDoc(doc(db, 'outreachPlaces', p.id), { status, ...(status === 'booked' && !p.bookedAt ? { bookedAt: Date.now() } : {}) }));

  const addNote = (p) => run(async () => {
    if (!noteDraft.trim()) return;
    await addDoc(collection(db, 'outreachPlaces', p.id, 'notes'), { text: noteDraft.trim(), byUid: user.uid, byName: user.name ?? '', at: Date.now() });
  }, () => setNoteDraft(''));

  const saveEvent = () => run(async () => {
    const e = editingEvent;
    if (!e.title.trim()) throw new Error('Name the event.');
    const place = places.find((p) => p.id === e.placeId);
    const loc = locationOptions.find((l) => l.id === (place?.locationId ?? e.locationId));
    if (!loc) throw new Error('Choose which of your locations it is for.');
    const fields = {
      title: e.title.trim(), placeId: place?.id ?? null, placeName: place?.name ?? '', contactName: e.contactName.trim() || place?.contactName || '',
      bucket: e.bucket, date: fromInput(e.date), expected: e.expected.trim(), actual: (e.actual ?? '').trim(),
      locationId: loc.id, brandId: loc.brandId,
    };
    if (e.id) await updateDoc(doc(db, 'outreachEvents', e.id), fields);
    else await addDoc(collection(db, 'outreachEvents'), { ...fields, createdByUid: user.uid, createdByName: user.name ?? '', createdAt: Date.now() });
  }, () => setEditingEvent(null));

  const removeEvent = (e) => run(() => deleteDoc(doc(db, 'outreachEvents', e.id)), () => setEditingEvent(null));

  const saveGoals = () => run(async () => {
    for (const [locId, raw] of Object.entries(goalDraft)) {
      const n = parseInt(String(raw).trim(), 10);
      const value = Number.isFinite(n) && n > 0 ? n : null;
      if ((goals[locId]?.monthlyVisits ?? null) === value) continue;
      await setDoc(doc(db, 'outreachGoals', locId), { monthlyVisits: value, setByName: user.name ?? '', setAt: Date.now() }, { merge: true });
    }
  }, () => setGoalDraft(null));

  const manyLocations = new Set(places.map((p) => p.locationId)).size > 1 || locationOptions.length > 1;
  const nameOf = (id) => locationName(id) || 'Unknown location';
  const canEditPlace = (p) => canWork && (isAdmin || myPlaces.some((l) => l.id === p.locationId));

  // ---- The selected place, on the right -------------------------------
  const detail = (() => {
    if (!selected) return <div style={d.placeholder}>{canWork ? 'Add the first place you are reaching out to with + Add place.' : 'Nothing here yet.'}</div>;
    const p = selected;
    const mine = canEditPlace(p);
    return (
      <div style={d.card}>
        <p style={{ ...d.kicker, color: isDue(p) ? 'var(--danger)' : 'var(--text-tertiary)' }}>
          {isDue(p) ? 'Follow-up due ' + fmtDay(p.nextFollowUpAt) : p.nextFollowUpAt ? 'Next follow-up ' + fmtDay(p.nextFollowUpAt) : p.lastVisitAt ? 'No follow-up set' : 'Not visited yet'}
        </p>
        <p style={d.title}>{p.name}</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
          <Bucket id={p.bucket} /><span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{p.type}</span>
          <Pill tone={STATUS[p.status]?.[1]}>{STATUS[p.status]?.[0] ?? 'To visit'}</Pill>
        </div>
        {manyLocations ? <div style={d.row}><span style={d.k}>Location</span><span style={d.v}>{nameOf(p.locationId)}</span></div> : null}
        <div style={d.row}><span style={d.k}>Contact</span><span style={d.v}>{p.contactName || 'Not added'}</span></div>
        {p.phone ? <div style={d.row}><span style={d.k}>Phone</span><a style={{ ...d.v, color: 'var(--neon)', textDecoration: 'none' }} href={'tel:' + p.phone.replace(/[^\d+]/g, '')}>{p.phone}</a></div> : null}
        {p.email ? <div style={d.row}><span style={d.k}>Email</span><a style={{ ...d.v, color: 'var(--neon)', textDecoration: 'none', overflowWrap: 'anywhere' }} href={'mailto:' + p.email}>{p.email}</a></div> : null}
        {p.address ? <div style={d.row}><span style={d.k}>Address</span><a style={{ ...d.v, color: 'var(--neon)', textDecoration: 'none' }} target="_blank" rel="noreferrer" href={'https://maps.google.com/?q=' + encodeURIComponent(p.address)}>{p.address}</a></div> : null}

        {mine ? (
          <>
            <div style={d.actions}>
              <button style={d.primary} disabled={busy} onClick={() => setLogging({ placeId: p.id, date: toInput(Date.now()), note: '', left: [], next: toInput(Date.now() + FOLLOW_UP_DAYS * DAY) })}>+ Log a visit</button>
              <button style={d.ghost} onClick={() => setEditingPlace({ ...BLANK_PLACE, ...p })}>Edit</button>
            </div>
            <div style={d.actions}>
              <button style={d.ghost} disabled={busy} onClick={() => onMakeEnquiry(p)}>Turn into catering enquiry</button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              {Object.entries(STATUS).map(([k, [label]]) => (
                <button key={k} style={{ ...styles.statusChip, ...(p.status === k ? styles.statusOn : {}) }} disabled={busy || p.status === k} onClick={() => setStatus(p, k)}>{label}</button>
              ))}
            </div>
          </>
        ) : null}

        <div style={d.section}>
          <p style={d.sectionLabel}>VISITS</p>
          {visits.length === 0 ? <p style={styles.muted}>No visits logged yet.</p> : visits.map((v) => (
            <div key={v.id} style={styles.visit}>
              <b style={{ color: 'var(--text-primary)' }}>{fmtDay(v.at)}</b> · {v.byName}
              <div style={{ whiteSpace: 'pre-wrap' }}>{v.note}</div>
              {v.left?.length ? <div style={styles.mutedSmall}>Left: {v.left.join(', ').toLowerCase()}</div> : null}
            </div>
          ))}
        </div>

        {/* Notes: Ronnie's, or anyone's who can see the place - the manager
            sees them all. */}
        <div style={d.section}>
          <p style={d.sectionLabel}>NOTES</p>
          {notes.map((n) => (
            <div key={n.id} style={{ ...styles.visit, borderLeftColor: 'var(--warn)' }}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
              <div style={styles.mutedSmall}>{n.byName}, {fmtDay(n.at)}</div>
            </div>
          ))}
          <textarea style={{ ...d.input, minHeight: 54, resize: 'vertical' }} placeholder="Add a note" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
          {noteDraft.trim() ? <button style={{ ...d.ghost, flex: 'none', width: '100%' }} disabled={busy} onClick={() => addNote(p)}>Save note</button> : null}
        </div>
      </div>
    );
  })();

  // ---- Above the list: the numbers, and for executives every location ---
  const header = (
    <>
      {tabs}
      <div style={isNarrow ? styles.tilesNarrow : styles.tiles}>
        <div style={styles.tile}>
          <span style={styles.tileLabel}>Visits this month</span>
          <b style={styles.tileNum}>{monthCount}{goal ? <small style={styles.tileOf}> of {goal} goal</small> : null}</b>
          {goal ? <div style={styles.bar}><div style={{ ...styles.barFill, width: Math.min(100, Math.round((monthCount / goal) * 100)) + '%' }} /></div> : null}
        </div>
        <button style={{ ...styles.tile, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }} onClick={() => setFilter('due')}>
          <span style={styles.tileLabel}>Follow-ups due</span>
          <b style={{ ...styles.tileNum, color: dueCount ? 'var(--danger)' : 'var(--text-primary)' }}>{dueCount}</b>
        </button>
        {isNarrow ? null : (
          <div style={styles.tile}>
            <span style={styles.tileLabel}>Booked this quarter</span>
            <b style={{ ...styles.tileNum, color: 'var(--success)' }}>{bookedThisQuarter(scoped)}</b>
          </div>
        )}
      </div>

      {/* The playbook (Community Outreach SOP), also in every location's
          Operations › Standard Operating Procedures folder in Drive. */}
      <a href="/docs/community-outreach-sop.pdf" target="_blank" rel="noreferrer" style={styles.playbook}>Community Outreach playbook (PDF) ›</a>

      {seesAll ? (
        <div style={styles.overview}>
          <div style={styles.overHead}>
            <span style={styles.overTitle}>By location · {new Date().toLocaleDateString([], { month: 'long' })}</span>
            {canSetGoals ? <button style={styles.smallBtn} onClick={() => setGoalDraft(Object.fromEntries(locationOptions.map((l) => [l.id, goals[l.id]?.monthlyVisits ?? ''])))}>Set monthly goals</button> : null}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead><tr>{['Location', 'Visits / goal', 'Follow-ups due', 'Booked (qtr)', 'Places'].map((h) => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {[...new Set([...places.map((p) => p.locationId), ...Object.keys(goals).filter((k) => goals[k]?.monthlyVisits)])].map((locId) => {
                  const ps = places.filter((p) => p.locationId === locId);
                  const g = goals[locId]?.monthlyVisits;
                  return (
                    <tr key={locId} style={{ ...styles.tr, ...(locFilter === locId ? styles.trOn : {}) }} onClick={() => { setLocFilter(locFilter === locId ? 'all' : locId); setSelectedId(null); }}>
                      <td style={{ ...styles.td, fontWeight: 700 }}>{nameOf(locId)}</td>
                      <td style={styles.td}>{visitsThisMonth(ps)} / {g || <span style={{ color: 'var(--text-tertiary)' }}>no goal</span>}</td>
                      <td style={{ ...styles.td, color: ps.filter(isDue).length ? 'var(--danger)' : undefined }}>{ps.filter(isDue).length}</td>
                      <td style={styles.td}>{bookedThisQuarter(ps)}</td>
                      <td style={styles.td}>{ps.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {locFilter !== 'all' ? <button style={{ ...styles.linkBtn, margin: '8px 4px 0' }} onClick={() => setLocFilter('all')}>Showing {nameOf(locFilter)} only · show all</button> : <p style={styles.mutedSmall}>Tap a location to see only its places.</p>}
        </div>
      ) : null}
    </>
  );

  // ---- Below the list: planned community events ------------------------
  const plannedEvents = events.filter(inLoc).sort((a, b) => (a.date ?? 9e15) - (b.date ?? 9e15));
  const footer = (
    <div style={styles.events}>
      <div style={styles.overHead}>
        <span style={styles.overTitle}>Planned community events</span>
        {canWork && myPlaces.length ? <button style={styles.smallBtn} onClick={() => setEditingEvent({ ...BLANK_EVENT, locationId: myPlaces.length === 1 ? myPlaces[0].id : '' })}>+ Plan an event</button> : null}
      </div>
      {plannedEvents.length === 0 ? <p style={styles.muted}>Nothing planned yet. Fundraisers, school nights, 5Ks, festivals: add them here.</p> : isNarrow ? (
        plannedEvents.map((e) => (
          <button key={e.id} style={styles.evRow} onClick={() => (canEditPlace(e) ? setEditingEvent({ ...BLANK_EVENT, ...e, date: toInput(e.date), placeId: e.placeId ?? '' }) : null)}>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{e.title}</span>
            <span style={styles.mutedSmall}>{[e.date ? fmtDay(e.date) : null, BUCKETS[e.bucket]?.label, e.expected ? e.expected + ' expected' : null, e.actual ? e.actual + ' came' : null].filter(Boolean).join(' · ')}</span>
          </button>
        ))
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead><tr>{['Event', 'Contact', 'Bucket', 'Date', 'Expected', 'Came'].map((h) => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
            <tbody>
              {plannedEvents.map((e) => (
                <tr key={e.id} style={styles.tr} onClick={() => (canEditPlace(e) ? setEditingEvent({ ...BLANK_EVENT, ...e, date: toInput(e.date), placeId: e.placeId ?? '' }) : null)}>
                  <td style={{ ...styles.td, fontWeight: 700 }}>{e.title}{manyLocations ? <div style={styles.mutedSmall}>{nameOf(e.locationId)}</div> : null}</td>
                  <td style={styles.td}>{e.contactName || e.placeName || '-'}</td>
                  <td style={styles.td}><Bucket id={e.bucket} /></td>
                  <td style={{ ...styles.td, whiteSpace: 'nowrap', color: e.date && e.date < Date.now() ? 'var(--text-tertiary)' : undefined }}>{e.date ? fmtDay(e.date) : '-'}</td>
                  <td style={styles.td}>{e.expected || '-'}</td>
                  <td style={styles.td}>{e.actual || <span style={{ color: 'var(--text-tertiary)' }}>-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const counts = (key) => scoped.filter((p) => (key === 'due' ? isDue(p) : p.bucket === key)).length;

  return (
    <>
      <RequestPage
        title="Catering"
        subtitle="Enquiries, and the places Catering & Events is reaching out to."
        actionLabel={canWork && myPlaces.length ? '+ Add place' : null}
        onAction={() => setEditingPlace({ ...BLANK_PLACE, locationId: myPlaces.length === 1 ? myPlaces[0].id : '' })}
        filters={[
          { key: 'all', label: 'All', count: scoped.length },
          ...Object.entries(BUCKETS).map(([k, b]) => ({ key: k, label: b.label, count: counts(k) })),
          { key: 'due', label: 'Follow-up due', count: counts('due') },
        ]}
        filter={filter}
        onFilter={(k) => { setFilter(k); setSelectedId(null); }}
        columns={[
          { key: 'name', label: 'Place', render: (p) => <><strong>{p.name}</strong><div style={{ marginTop: 3, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Bucket id={p.bucket} />{p.contactName ? <span style={styles.mutedSmall}>{p.contactName}</span> : null}</div></> },
          ...(manyLocations ? [{ key: 'loc', label: 'Location', render: (p) => nameOf(p.locationId) }] : []),
          { key: 'last', label: 'Last visit', render: (p) => (p.lastVisitAt ? <span style={{ whiteSpace: 'nowrap' }}>{fmtDay(p.lastVisitAt)}</span> : <span style={{ color: 'var(--text-tertiary)' }}>-</span>) },
          { key: 'next', label: 'Next', render: (p) => (isDue(p) ? <span style={{ color: 'var(--danger)', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtDay(p.nextFollowUpAt)} · due</span> : p.nextFollowUpAt ? <span style={{ whiteSpace: 'nowrap' }}>{fmtDay(p.nextFollowUpAt)}</span> : <span style={{ color: 'var(--text-tertiary)' }}>{p.lastVisitAt ? 'None' : 'Not yet'}</span>) },
          { key: 'status', label: 'Status', render: (p) => <Pill tone={STATUS[p.status]?.[1]}>{STATUS[p.status]?.[0] ?? 'To visit'}</Pill> },
        ]}
        rows={shownPlaces}
        selectedId={selected?.id}
        onSelect={(id) => setSelectedId(id)}
        detail={detail}
        empty={!loaded ? 'Loading…' : filter === 'due' ? 'No follow-ups due.' : canWork ? 'No places yet. Add the schools, churches, businesses and hotels you are reaching out to.' : 'No places yet.'}
        phoneRow={(p) => (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</span>
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{BUCKETS[p.bucket]?.label} · {p.lastVisitAt ? 'last ' + fmtDay(p.lastVisitAt) : 'not visited yet'}</span>
            {isDue(p) ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>Follow-up due</span> : p.nextFollowUpAt ? <span style={styles.mutedSmall}>Next {fmtDay(p.nextFollowUpAt)}</span> : null}
          </span>
        )}
        header={header}
        footer={footer}
      />

      {editingPlace ? (
        <div data-modal="" data-modal-keep="" style={styles.backdrop} onClick={() => setEditingPlace(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{editingPlace.id ? 'Edit place' : 'Add a place'}</h2>
            <label style={styles.label}>Name</label>
            <input style={d.input} autoFocus placeholder="Starkville Academy" value={editingPlace.name} onChange={(e) => setEditingPlace({ ...editingPlace, name: e.target.value })} />
            <div style={styles.two}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={styles.label}>Type</label>
                <select style={d.input} value={editingPlace.type} onChange={(e) => setEditingPlace({ ...editingPlace, type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={styles.label}>Bucket</label>
                <select style={d.input} value={editingPlace.bucket} onChange={(e) => setEditingPlace({ ...editingPlace, bucket: e.target.value })}>{Object.entries(BUCKETS).map(([k, b]) => <option key={k} value={k}>{b.label}</option>)}</select>
              </div>
            </div>
            {myPlaces.length > 1 ? (
              <>
                <label style={styles.label}>Location</label>
                <select style={d.input} value={editingPlace.locationId} onChange={(e) => setEditingPlace({ ...editingPlace, locationId: e.target.value })}>
                  <option value="">Choose…</option>
                  {myPlaces.map((l) => <option key={l.id} value={l.id}>{l.brandName} · {l.name}</option>)}
                </select>
              </>
            ) : null}
            <label style={styles.label}>Contact person</label>
            <input style={d.input} placeholder="Name and role" value={editingPlace.contactName} onChange={(e) => setEditingPlace({ ...editingPlace, contactName: e.target.value })} />
            <div style={styles.two}>
              <div style={{ flex: 1, minWidth: 0 }}><label style={styles.label}>Phone</label><input style={d.input} value={editingPlace.phone} onChange={(e) => setEditingPlace({ ...editingPlace, phone: e.target.value })} /></div>
              <div style={{ flex: 1, minWidth: 0 }}><label style={styles.label}>Email</label><input style={d.input} value={editingPlace.email} onChange={(e) => setEditingPlace({ ...editingPlace, email: e.target.value })} /></div>
            </div>
            <label style={styles.label}>Address</label>
            <input style={d.input} value={editingPlace.address} onChange={(e) => setEditingPlace({ ...editingPlace, address: e.target.value })} />
            <div style={styles.buttons}>
              {editingPlace.id ? <button style={{ ...d.ghost, flex: 'none', color: 'var(--danger)' }} disabled={busy} onClick={() => removePlace(editingPlace)}>Delete</button> : null}
              <span style={{ flex: 1 }} />
              <button style={{ ...d.ghost, flex: 'none' }} onClick={() => setEditingPlace(null)}>Cancel</button>
              <button style={{ ...d.primary, flex: 'none', padding: '8px 18px' }} disabled={busy} onClick={savePlace}>Save</button>
            </div>
          </div>
        </div>
      ) : null}

      {logging ? (
        <div data-modal="" data-modal-keep="" style={styles.backdrop} onClick={() => setLogging(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Log a visit</h2>
            <p style={styles.muted}>{places.find((p) => p.id === logging.placeId)?.name}</p>
            <label style={styles.label}>Date</label>
            <DatePickerField value={logging.date} onChange={(v) => setLogging({ ...logging, date: v, next: v ? toInput(fromInput(v) + FOLLOW_UP_DAYS * DAY) : logging.next })} />
            <label style={styles.label}>What happened</label>
            <textarea style={{ ...d.input, minHeight: 70, resize: 'vertical' }} autoFocus placeholder="Who you spoke to, what they need, anything to remember" value={logging.note} onChange={(e) => setLogging({ ...logging, note: e.target.value })} />
            <label style={styles.label}>What you left</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {LEFT.map((x) => {
                const on = logging.left.includes(x);
                return <button key={x} style={{ ...styles.statusChip, ...(on ? styles.statusOn : {}) }} onClick={() => setLogging({ ...logging, left: on ? logging.left.filter((y) => y !== x) : [...logging.left, x] })}>{x}</button>;
              })}
            </div>
            <label style={styles.label}>Next follow-up</label>
            <DatePickerField value={logging.next} onChange={(v) => setLogging({ ...logging, next: v })} />
            <p style={styles.mutedSmall}>A month after the visit unless you change it. You get an email the morning it's due.{logging.next ? '' : ' No date: no reminder.'}</p>
            {logging.next ? <button style={{ ...styles.linkBtn, marginTop: 4 }} onClick={() => setLogging({ ...logging, next: '' })}>No follow-up needed</button> : null}
            <div style={styles.buttons}>
              <span style={{ flex: 1 }} />
              <button style={{ ...d.ghost, flex: 'none' }} onClick={() => setLogging(null)}>Cancel</button>
              <button style={{ ...d.primary, flex: 'none', padding: '8px 18px' }} disabled={busy} onClick={saveVisit}>Save visit</button>
            </div>
          </div>
        </div>
      ) : null}

      {editingEvent ? (
        <div data-modal="" data-modal-keep="" style={styles.backdrop} onClick={() => setEditingEvent(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{editingEvent.id ? 'Edit event' : 'Plan an event'}</h2>
            <label style={styles.label}>Event</label>
            <input style={d.input} autoFocus placeholder="Fall festival booth" value={editingEvent.title} onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })} />
            <label style={styles.label}>With (optional)</label>
            <select style={d.input} value={editingEvent.placeId} onChange={(e) => { const p = places.find((x) => x.id === e.target.value); setEditingEvent({ ...editingEvent, placeId: e.target.value, ...(p ? { bucket: p.bucket, locationId: p.locationId, contactName: editingEvent.contactName || p.contactName || '' } : {}) }); }}>
              <option value="">Not one of your places</option>
              {places.filter((p) => canEditPlace(p)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {!editingEvent.placeId && myPlaces.length > 1 ? (
              <>
                <label style={styles.label}>Location</label>
                <select style={d.input} value={editingEvent.locationId} onChange={(e) => setEditingEvent({ ...editingEvent, locationId: e.target.value })}>
                  <option value="">Choose…</option>
                  {myPlaces.map((l) => <option key={l.id} value={l.id}>{l.brandName} · {l.name}</option>)}
                </select>
              </>
            ) : null}
            <div style={styles.two}>
              <div style={{ flex: 1, minWidth: 0 }}><label style={styles.label}>Contact person</label><input style={d.input} value={editingEvent.contactName} onChange={(e) => setEditingEvent({ ...editingEvent, contactName: e.target.value })} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={styles.label}>Bucket</label>
                <select style={d.input} value={editingEvent.bucket} onChange={(e) => setEditingEvent({ ...editingEvent, bucket: e.target.value })}>{Object.entries(BUCKETS).map(([k, b]) => <option key={k} value={k}>{b.label}</option>)}</select>
              </div>
            </div>
            <label style={styles.label}>Date</label>
            <DatePickerField value={editingEvent.date} onChange={(v) => setEditingEvent({ ...editingEvent, date: v })} />
            <div style={styles.two}>
              <div style={{ flex: 1, minWidth: 0 }}><label style={styles.label}>Expected people</label><input style={d.input} inputMode="numeric" value={editingEvent.expected} onChange={(e) => setEditingEvent({ ...editingEvent, expected: e.target.value })} /></div>
              {editingEvent.id ? <div style={{ flex: 1, minWidth: 0 }}><label style={styles.label}>How many came</label><input style={d.input} inputMode="numeric" value={editingEvent.actual ?? ''} onChange={(e) => setEditingEvent({ ...editingEvent, actual: e.target.value })} /></div> : null}
            </div>
            <div style={styles.buttons}>
              {editingEvent.id ? <button style={{ ...d.ghost, flex: 'none', color: 'var(--danger)' }} disabled={busy} onClick={() => removeEvent(editingEvent)}>Delete</button> : null}
              <span style={{ flex: 1 }} />
              <button style={{ ...d.ghost, flex: 'none' }} onClick={() => setEditingEvent(null)}>Cancel</button>
              <button style={{ ...d.primary, flex: 'none', padding: '8px 18px' }} disabled={busy} onClick={saveEvent}>Save</button>
            </div>
          </div>
        </div>
      ) : null}

      {goalDraft ? (
        <div data-modal="" data-modal-keep="" style={styles.backdrop} onClick={() => setGoalDraft(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Monthly visit goals</h2>
            <p style={styles.muted}>How many outreach visits each location should make a month. Leave a box empty for no goal.</p>
            {locationOptions.map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{l.brandName} · {l.name}</span>
                <input style={{ ...d.input, width: 80, marginBottom: 0 }} inputMode="numeric" placeholder="None" value={goalDraft[l.id] ?? ''} onChange={(e) => setGoalDraft({ ...goalDraft, [l.id]: e.target.value.replace(/[^\d]/g, '') })} />
              </div>
            ))}
            <div style={styles.buttons}>
              <span style={{ flex: 1 }} />
              <button style={{ ...d.ghost, flex: 'none' }} onClick={() => setGoalDraft(null)}>Cancel</button>
              <button style={{ ...d.primary, flex: 'none', padding: '8px 18px' }} disabled={busy} onClick={saveGoals}>Save goals</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const styles = {
  tiles: { display: 'flex', gap: 12, margin: '4px 0 14px' },
  tilesNarrow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '4px 0 14px' },
  tile: { flex: 1, minWidth: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 },
  tileLabel: { fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  tileNum: { fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' },
  tileOf: { fontSize: 12.5, color: 'var(--text-tertiary)', fontWeight: 600 },
  bar: { height: 6, borderRadius: 3, background: 'var(--bg-inset)', overflow: 'hidden' },
  barFill: { height: '100%', background: 'var(--neon)' },
  overview: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 12px 10px', marginBottom: 14 },
  events: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 12px 10px', marginTop: 18 },
  overHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '2px 4px 8px' },
  overTitle: { fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-secondary)' },
  smallBtn: { background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  playbook: { display: 'inline-block', margin: '0 2px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--neon)', textDecoration: 'none' },
  linkBtn: { background: 'none', border: 'none', padding: 0, color: 'var(--neon)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' },
  tr: { cursor: 'pointer', borderTop: '1px solid var(--border)' },
  trOn: { background: 'rgba(34,211,238,0.07)' },
  evRow: { display: 'flex', flexDirection: 'column', gap: 3, width: '100%', textAlign: 'left', background: 'none', border: 'none', borderTop: '1px solid var(--border)', padding: '11px 4px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' },
  td: { padding: '10px 10px', color: 'var(--text-primary)', verticalAlign: 'middle' },
  statusChip: { background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', borderRadius: 16, padding: '6px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  statusOn: { borderColor: 'var(--neon)', color: 'var(--neon)', background: 'rgba(34,211,238,0.07)' },
  visit: { borderLeft: '2px solid var(--border-strong)', padding: '2px 0 2px 12px', margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 },
  muted: { fontSize: 12.5, color: 'var(--text-tertiary)', margin: '0 0 6px', lineHeight: 1.5 },
  mutedSmall: { fontSize: 11.5, color: 'var(--text-tertiary)', margin: '4px 0 0' },
  backdrop: { ...modalBackdrop, zIndex: 100 },
  modal: { padding: 22, ...modalSurface, width: 'min(480px, 100%)', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', margin: '8px 0 4px' },
  two: { display: 'flex', gap: 10 },
  buttons: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 },
};
