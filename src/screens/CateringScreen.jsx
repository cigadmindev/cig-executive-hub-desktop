import { accessLevel } from '../data/accessMatrix';
import React, { useState } from 'react';
import { toast } from '../components/Motion';
import { useAuth } from '../context/AuthContext';
import { useCatering } from '../context/CateringContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useDialog } from '../hooks/useDialog';
import { brands } from '../data/mockData';
import DatePickerField from '../components/DatePickerField';
import EventCosts from '../components/EventCosts';
import RequestPage, { Pill, detailStyles as d } from '../components/RequestPage';
import OutreachPanel from '../components/OutreachPanel';
import { useSearchParams } from 'react-router-dom';
import { doc as fsDoc, updateDoc as fsUpdate } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { fmtDay } from '../lib/dates';
import { modalBackdrop, modalSurface } from '../theme/modal';
import { plainError } from '../lib/errors';

// Catering orders and private event bookings, on the same layout as every
// other request page: status filters, a table, the selected one on the right.
//
// The conversation stays in email - that is the right tool for gathering
// details. What lives here is where each one stands, what was agreed on the
// phone, and who is handling it, so nobody has to ask.
const MENU_URL = 'https://drive.google.com/drive/u/1/folders/1pynbcFvlkT0bymTd-HTrcFTzp72TjTqc';

const dateText = (t) => fmtDay(t);
const longDate = (t, fallback) =>
  t ? fmtDay(t) : fallback || 'No date';

const STEP = {
  new: ['New', 'amber'],
  talking: ['Talking', 'cyan'],
  confirmed: ['Confirmed', 'green'],
  done: ['Done', 'grey'],
  // "Didn't book" (Brenner, 10 Oct 2026): it never went ahead. Kept as 'lost'
  // underneath so older records still read.
  lost: ["Didn't book", 'red'],
};
const FILTERS = Object.entries(STEP).map(([k, [l]]) => [k, l]);

// The jobs that look after events at their location (firestore.rules,
// handlesEventsFor): they see their location's enquiries and can add one.

const BLANK = { kind: 'catering', locationId: '', name: '', email: '', phone: '', organisation: '', occasion: '', guests: '', date: '', preferredTime: '', fulfilment: '', address: '', about: '' };

export default function CateringScreen() {
  const { user, hasLocationAccess } = useAuth();
  const { getByBrand } = useCustomLocations();
  const { enquiries, loaded, addEnquiry, claim, setStatus, lose, adminSetStatus, update, correct, markInvoiced, markPaid, putOnCalendar } = useCatering();
  const { dialogNode, notify } = useDialog();
  const isAdmin = user?.role === 'admin';
  // Only Catering & Events managers claim and work enquiries (Brenner,
  // 10 Oct 2026) - not GMs, chefs or admins. Admins keep the ADMIN section.
  // The Catering column of Who sees what (14 Oct 2026): Claim works the
  // enquiries, View sees and adds them.
  const cateringLevel = accessLevel(user, 'catering');
  const canAct = cateringLevel === 'claim';
  // Anyone who looks after events at a location, and every executive, can
  // add one that came in by phone or in person, and add costs to an event.
  const canAdd = isAdmin || ['view', 'claim'].includes(cateringLevel);

  // All / Catering / Private dining (27 Oct 2026, sketch 32), remembered on
  // this device. Everything below - counts, the first list with something
  // in it, the rows - follows it.
  const [kind, setKindState] = useState(() => {
    try { return ['catering', 'privateEvent'].includes(localStorage.getItem('cateringKind')) ? localStorage.getItem('cateringKind') : 'all'; } catch { return 'all'; }
  });
  const setKind = (k) => { setKindState(k); try { localStorage.setItem('cateringKind', k); } catch { /* private window */ } };
  const allEnquiries = enquiries;
  const ofKind = (e) => kind === 'all' || (kind === 'catering' ? e.kind === 'catering' : e.kind !== 'catering');
  const kindRows = allEnquiries.filter(ofKind);
  const firstWithItems = ['new', 'talking', 'confirmed'].find((k) => kindRows.some((e) => e.status === k)) ?? 'new';
  const [filter, setFilter] = useState(null);
  const shown = filter ?? firstWithItems;
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState({});
  const [losing, setLosing] = useState(null);
  const [changing, setChanging] = useState(null);
  const [editing, setEditing] = useState(null);
  // The date as the picker wants it (YYYY-MM-DD), from the event's own date.
  const toDateInput = (t) => {
    if (!t) return '';
    const dt = new Date(t);
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  };
  const openEdit = (e) => setEditing({ ...e, dateInput: toDateInput(e.preferredDate) });
  const [adding, setAdding] = useState(null);
  // Enquiries | Outreach (26 Oct 2026, sketch 30). The reminder email links
  // to /catering?tab=outreach.
  const [params] = useSearchParams();
  const showsOutreach = isAdmin || user?.role === 'executive' || cateringLevel === 'claim';
  const [tab, setTab] = useState(params.get('tab') === 'outreach' && showsOutreach ? 'outreach' : 'enquiries');
  // Claiming one with no location: which of their locations it is for.
  const [claiming, setClaiming] = useState(null); // { id, name, placeId }
  const [busy, setBusy] = useState(false);

  // Every location this person can reach - where a phoned-in enquiry can go.
  const locationOptions = [];
  for (const b of brands) {
    for (const l of [...(b.locations ?? []), ...(getByBrand(b.id) ?? [])]) {
      if (hasLocationAccess(user, b.id, l.id)) locationOptions.push({ id: l.id, name: l.name, brandId: b.id, brandName: b.name });
    }
  }

  const run = async (fn, after, done = 'Saved.') => {
    setBusy(true);
    try {
      const note = await fn();
      after?.();
      if (typeof note === 'string') notify('Done, with one thing left', note);
      else toast(done);
    } catch (err) {
      notify('Nothing was changed', plainError(err, 'Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setLosing(null); setChanging(null); };
  const rows = kindRows
    .filter((e) => e.status === shown)
    .sort((a, b) => (['new', 'talking', 'confirmed'].includes(shown) ? (a.preferredDate ?? 9e15) - (b.preferredDate ?? 9e15) : b.createdAt - a.createdAt));
  const selected = enquiries.find((e) => e.id === selectedId) ?? rows[0] ?? null;
  const manyLocations = new Set(enquiries.map((e) => e.locationId)).size > 1;

  // Opens a reply in Gmail with the address filled in - the thread belongs in
  // email, not here.
  const mailto = (e, subject, body) =>
    'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(e.email) +
    '&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);

  const history = (e) =>
    [
      [e.addedByHand ? 'Added by hand' : 'Arrived by email', e.createdAt, e.addedByHand ? e.addedByName : ''],
      ['Claimed', e.claimedAt, e.ownerName],
      ['Confirmed', e.confirmedAt, e.confirmedByName],
      ['Invoiced', e.invoicedAt, ''],
      ['Paid', e.paidAt, ''],
      ['Done', e.doneAt, e.doneByName],
      ["Marked didn't book", e.lostAt, e.lostByName],
      ['Details corrected', e.correctedAt, e.correctedByName],
      ['Changed by hand', e.statusChangedAt, e.statusChangedByName],
    ]
      .filter(([, t]) => t)
      .sort((a, b) => a[1] - b[1]);

  const detail = (() => {
    if (!selected) return <div style={d.placeholder}>Pick an enquiry to see it here.</div>;
    const e = selected;
    const isCatering = e.kind === 'catering';
    const dr = draft[e.id] ?? {};
    const first = (e.name || '').split(' ')[0];
    const label = e.status === 'new' ? 'Arrived ' + dateText(e.createdAt) : e.ownerName ? e.ownerName + ' is on it' : 'Nobody has claimed it';
    return (
      <div style={d.card}>
        <p style={d.kicker}>{STEP[e.status]?.[0]} · {label}</p>
        <p style={d.title}>{e.name || 'No name'}{e.organisation ? <span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}> · {e.organisation}</span> : null}</p>
        <div style={d.row}><span style={d.k}>{isCatering ? 'Catering' : 'Event'}</span><span style={d.v}>{isCatering ? [e.fulfilment || 'Not said', e.address].filter(Boolean).join(' to ') : e.occasion || 'Private event'}</span></div>
        <div style={d.row}><span style={d.k}>When</span><span style={d.v}>{longDate(e.preferredDate, e.preferredDateText)}{e.preferredTime ? ' · ' + e.preferredTime : ''}</span></div>
        <div style={d.row}><span style={d.k}>Guests</span><span style={d.v}>{e.guests || 'Not given'}</span></div>
        <div style={d.row}><span style={d.k}>Where</span><span style={d.v}>{e.locationName ? (e.brandName ? e.brandName + ' · ' : '') + e.locationName : <>No location yet{canAct && !e.ownerUid ? ' - claim it to choose one' : ''}</>}</span></div>
        <div style={d.row}>
          <span style={d.k}>Contact</span>
          <span style={d.v}>
            {e.email ? <a href={'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(e.email)} target="_blank" rel="noreferrer" style={styles.link}>{e.email}</a> : null}
            {e.email && e.phone ? <br /> : null}
            {e.phone ? <a href={'tel:' + e.phone.replace(/[^\d+]/g, '')} style={styles.link}>{e.phone}</a> : null}
            {!e.email && !e.phone ? 'None given' : null}
          </span>
        </div>
        {!isCatering && (e.space || e.style || e.beverage) ? <div style={d.row}><span style={d.k}>Asked for</span><span style={d.v}>{[e.space, e.style, e.beverage].filter(Boolean).join(' · ')}</span></div> : null}
        {e.about ? <div style={d.row}><span style={d.k}>They wrote</span><span style={{ ...d.v, whiteSpace: 'pre-wrap' }}>{e.about}</span></div> : null}
        {e.status === 'lost' && e.lostReason ? <div style={d.row}><span style={d.k}>Why it didn't book</span><span style={d.v}>{e.lostReason}</span></div> : null}

        {canAct ? (
          <>
            {losing === e.id ? (
              <div style={{ marginTop: 14 }}>
                <input style={d.input} autoFocus placeholder="Why they are not going ahead" value={changing?.reason ?? ''} onChange={(ev) => setChanging({ reason: ev.target.value })} />
                <div style={{ ...d.actions, marginTop: 0 }}>
                  <button style={d.ghost} onClick={reset}>Cancel</button>
                  <button style={d.primary} disabled={busy || !(changing?.reason ?? '').trim()} onClick={() => run(() => lose(e.id, changing.reason), () => { reset(); setSelectedId(e.id); setFilter('lost'); })}>Mark didn't book</button>
                </div>
              </div>
            ) : (
              <div style={d.actions}>
                {!e.ownerUid && ['new', 'talking'].includes(e.status) ? (
                  <button
                    style={d.primary}
                    disabled={busy}
                    onClick={() =>
                      !e.locationId
                        ? setClaiming({ id: e.id, name: e.name || 'this', placeId: locationOptions.length === 1 ? locationOptions[0].id : '' })
                        : run(() => claim(e.id), () => { setSelectedId(e.id); setFilter('talking'); }, 'Claimed. It is yours now.')
                    }
                  >
                    Claim
                  </button>
                ) : null}
                {e.status === 'new' && e.ownerUid ? <button style={d.ghost} disabled={busy} onClick={() => run(() => setStatus(e.id, 'talking'), () => { setSelectedId(e.id); setFilter('talking'); })}>Talking</button> : null}
                {['new', 'talking'].includes(e.status) ? <button style={d.ghost} disabled={busy} onClick={() => run(() => setStatus(e.id, 'confirmed'), () => { setSelectedId(e.id); setFilter('confirmed'); }, 'Confirmed.')}>Confirmed</button> : null}
                {e.status === 'confirmed' && !e.calendarEntryId ? <button style={d.primary} disabled={busy} onClick={() => run(() => putOnCalendar(e))}>Add to calendar</button> : null}
                {e.status === 'confirmed' ? <button style={d.ghost} disabled={busy} onClick={() => run(() => setStatus(e.id, 'done'), () => { setSelectedId(e.id); setFilter('done'); })}>Done</button> : null}
                {['new', 'talking', 'confirmed'].includes(e.status) ? <button style={d.ghost} onClick={() => { setChanging({ reason: '' }); setLosing(e.id); }}>Didn't book</button> : null}
                {/* Catering & Events can fix an order's details (14 Oct 2026). */}
                <button style={d.ghost} onClick={() => openEdit(e)}>Edit</button>
              </div>
            )}
            {isCatering && e.status === 'confirmed' ? (
              <div style={d.actions}>
                {!e.invoicedAt ? <button style={d.ghost} disabled={busy} onClick={() => run(() => markInvoiced(e.id))}>Invoiced</button> : <span style={styles.done}>Invoiced {dateText(e.invoicedAt)}</span>}
                {e.invoicedAt && !e.paidAt ? <button style={d.ghost} disabled={busy} onClick={() => run(() => markPaid(e.id))}>Paid</button> : null}
                {e.paidAt ? <span style={styles.done}>Paid {dateText(e.paidAt)}</span> : null}
              </div>
            ) : null}
            {['new', 'talking'].includes(e.status) ? (
              <p style={styles.hint}>Confirmed puts it on the calendar and tells the location's GM, AGMs, chefs and Catering &amp; Events.{isCatering ? ' Invoiced and Paid appear once it is confirmed.' : ''}</p>
            ) : null}

            {e.email ? (
              <div style={d.actions}>
                <a style={styles.linkButton} target="_blank" rel="noreferrer" href={mailto(e, `Your ${isCatering ? 'catering order' : 'event'} at ${e.brandName || 'Taste'} ${e.locationName}`, `Hi ${first},\n\n`)}>Reply by email</a>
                {isCatering ? (
                  <a style={styles.linkButton} target="_blank" rel="noreferrer" href={mailto(e, (e.brandName || 'Taste Italian Kitchen') + ' — catering menu', `Hi ${first},\n\nThanks for getting in touch. Have you had a chance to look at our catering menu? You can see it here:\n\n${MENU_URL}\n\nLet me know what you would like and I will take it from there.\n\n`)}>Send the menu</a>
                ) : null}
              </div>
            ) : null}

            <div style={d.section}>
              <p style={d.sectionLabel}>WHAT YOU HAVE AGREED</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={d.input} placeholder={isCatering ? 'Order total' : 'F&B minimum'} value={dr.minimum ?? e.minimum} onChange={(ev) => setDraft({ ...draft, [e.id]: { ...dr, minimum: ev.target.value } })} />
                <input style={d.input} placeholder="Final headcount" value={dr.finalGuests ?? e.finalGuests} onChange={(ev) => setDraft({ ...draft, [e.id]: { ...dr, finalGuests: ev.target.value } })} />
              </div>
              <textarea style={{ ...d.input, minHeight: 60, resize: 'vertical' }} placeholder="Menu, room, timings, anything agreed on the phone" value={dr.details ?? e.details} onChange={(ev) => setDraft({ ...draft, [e.id]: { ...dr, details: ev.target.value } })} />
              <button style={d.ghost} disabled={busy} onClick={() => run(() => update(e.id, { minimum: dr.minimum ?? e.minimum, finalGuests: dr.finalGuests ?? e.finalGuests, details: dr.details ?? e.details }), () => notify('Saved', 'Everyone looking after this location can see it.'))}>Save</button>
            </div>
          </>
        ) : (
          <>
            {e.minimum || e.finalGuests || e.details ? (
              <div style={d.section}>
                <p style={d.sectionLabel}>WHAT HAS BEEN AGREED</p>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{[e.minimum && (isCatering ? 'Order ' : 'Minimum ') + e.minimum, e.finalGuests && e.finalGuests + ' guests', e.details].filter(Boolean).join('\n')}</div>
              </div>
            ) : null}
          </>
        )}

        {e.status !== 'lost' && e.locationId ? <EventCosts enquiry={e} canAdd={canAdd} notify={notify} /> : null}

        {isAdmin ? (
          <div style={d.section}>
            <p style={d.sectionLabel}>ADMIN</p>
            {changing && changing.status ? (
              <>
                <select style={d.input} value={changing.status} onChange={(ev) => setChanging({ ...changing, status: ev.target.value })}>
                  {FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <input style={d.input} autoFocus placeholder={e.ownerName ? 'Reason - emailed to ' + e.ownerName : "Reason - emailed to the location's catering team"} value={changing.reason} onChange={(ev) => setChanging({ ...changing, reason: ev.target.value })} />
                <div style={{ ...d.actions, marginTop: 0 }}>
                  <button style={d.ghost} onClick={reset}>Cancel</button>
                  <button style={d.primary} disabled={busy || changing.status === e.status || !changing.reason.trim()} onClick={() => run(() => adminSetStatus(e.id, changing.status, changing.reason), () => { setSelectedId(e.id); setFilter(changing.status); reset(); })}>Change status</button>
                </div>
              </>
            ) : (
              <div style={{ ...d.actions, marginTop: 0 }}>
                <button style={d.ghost} onClick={() => openEdit(e)}>Edit</button>
                <button style={d.ghost} onClick={() => { setLosing(null); setChanging({ status: e.status, reason: '' }); }}>Change status…</button>
              </div>
            )}
          </div>
        ) : null}

        <div style={d.section}>
          <p style={d.sectionLabel}>HISTORY</p>
          <div style={d.history}>
            {history(e).map(([what, t, who], i) => (
              <div key={i}>{dateText(t)} · {what}{who ? ' by ' + who : ''}</div>
            ))}
            {e.statusChangeReason ? <div>“{e.statusChangeReason}”</div> : null}
          </div>
        </div>
      </div>
    );
  })();

  const saveNew = async () => {
    const place = locationOptions.find((l) => l.id === adding.locationId);
    if (!place) throw new Error('Choose the location it is for.');
    if (!adding.name.trim()) throw new Error('Add their name.');
    if (!adding.email.trim() && !adding.phone.trim()) throw new Error('Add an email or a phone number, so someone can get back to them.');
    const when = adding.date ? new Date(adding.date + 'T12:00:00').getTime() : null;
    const isCatering = adding.kind === 'catering';
    const id = await addEnquiry({
      kind: adding.kind,
      name: adding.name.trim(), email: adding.email.trim(), phone: adding.phone.trim(),
      organisation: adding.organisation.trim(), occasion: adding.occasion.trim(), guests: adding.guests.trim(),
      preferredDate: when, preferredDateText: when ? longDate(when) : '', preferredTime: adding.preferredTime.trim(),
      fulfilment: isCatering ? adding.fulfilment : '', address: isCatering ? adding.address.trim() : '',
      space: '', style: '', about: adding.about.trim(),
      locationId: place.id, locationName: place.name, brandId: place.brandId, brandName: place.brandName,
      ...(adding.outreachPlaceId ? { outreachPlaceId: adding.outreachPlaceId } : {}),
    });
    // From Outreach: the place is now in talks, and shows Booked once this
    // enquiry is confirmed (the server does that part).
    if (adding.outreachPlaceId && id) {
      try { await fsUpdate(fsDoc(db, 'outreachPlaces', adding.outreachPlaceId), { status: 'talking', enquiryId: id }); } catch { /* the enquiry is what matters */ }
    }
  };

  const tabBar = showsOutreach ? (
    <div style={styles.tabs}>
      {[['enquiries', 'Enquiries'], ['outreach', 'Outreach']].map(([k, l]) => (
        <button key={k} style={{ ...styles.tab, ...(tab === k ? styles.tabOn : {}) }} onClick={() => setTab(k)}>{l}</button>
      ))}
    </div>
  ) : null;

  if (tab === 'outreach') {
    return (
      <div>
        <OutreachPanel
          tabs={tabBar}
          locationOptions={locationOptions}
          locationName={(id) => { const l = locationOptions.find((x) => x.id === id); return l ? l.brandName.replace(' Italian Kitchen', '').replace(' Greek Tavern', '') + ' · ' + l.name : ''; }}
          notify={notify}
          onMakeEnquiry={(p) => {
            setTab('enquiries');
            setAdding({ ...BLANK, kind: 'catering', locationId: p.locationId, name: p.contactName || p.name, email: p.email || '', phone: p.phone || '', organisation: p.name, outreachPlaceId: p.id });
          }}
        />
        {dialogNode}
      </div>
    );
  }

  return (
    <div>
      <RequestPage
        title="Catering"
        subtitle="Catering orders and private events. Catering & Events claims and handles each one."
        header={
          <>
            {tabBar}
            <div style={styles.kindSeg} role="group" aria-label="Show">
              {[['all', 'All'], ['catering', 'Catering'], ['privateEvent', 'Private dining']].map(([k, l], i) => (
                <button key={k} style={{ ...styles.kindBtn, ...(i === 0 ? { borderLeft: 'none' } : {}), ...(kind === k ? styles.kindSegOn : {}) }} onClick={() => { setKind(k); setSelectedId(null); reset(); }}>
                  {l}<span style={{ opacity: 0.7, fontWeight: 600, marginLeft: 5 }}>{allEnquiries.filter((e) => k === 'all' || (k === 'catering' ? e.kind === 'catering' : e.kind !== 'catering')).filter((e) => ['new', 'talking', 'confirmed'].includes(e.status)).length}</span>
                </button>
              ))}
            </div>
          </>
        }
        actionLabel={canAdd ? '+ Add enquiry' : null}
        onAction={() => setAdding({ ...BLANK, locationId: locationOptions.length === 1 ? locationOptions[0].id : '' })}
        filters={FILTERS.map(([k, l]) => ({ key: k, label: l, count: ['done', 'lost'].includes(k) ? null : kindRows.filter((e) => e.status === k).length }))}
        filter={shown}
        onFilter={(k) => { setFilter(k); setSelectedId(null); reset(); }}
        columns={[
          ...(kind === 'all' ? [{ key: 'type', label: 'Type', render: (e) => <span style={styles.kindTag}>{e.kind === 'catering' ? 'Catering' : 'Private dining'}</span> }] : []),
          { key: 'who', label: 'Enquiry', render: (e) => <><strong>{e.name || 'No name'}</strong><div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{e.kind === 'catering' ? 'Catering' + (e.fulfilment ? ' · ' + e.fulfilment.toLowerCase() : '') : e.occasion || 'Private event'}</div></> },
          ...(manyLocations ? [{ key: 'where', label: 'Location', render: (e) => e.locationName || <Pill tone="amber">No location</Pill> }] : []),
          { key: 'when', label: 'Date', render: (e) => (e.preferredDate ? dateText(e.preferredDate) : e.preferredDateText || '—') },
          { key: 'guests', label: 'Guests', render: (e) => e.finalGuests || e.guests || '—' },
          { key: 'owner', label: 'Owner', render: (e) => (e.ownerName ? e.ownerName : <span style={{ color: 'var(--text-tertiary)' }}>Unclaimed</span>) },
          { key: 'status', label: 'Status', render: (e) => <Pill tone={STEP[e.status]?.[1]}>{STEP[e.status]?.[0]}</Pill> },
        ]}
        rows={rows}
        selectedId={selected?.id}
        onSelect={(id) => { setSelectedId(id); reset(); }}
        detail={detail}
        empty={loaded ? 'No enquiries in this list.' : 'Loading…'}
        phoneRow={(e) => (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{e.name || 'No name'}</span>
              <span style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                {kind === 'all' ? (e.kind === 'catering' ? 'Catering · ' : 'Private dining · ') : ''}
                {e.preferredDate ? dateText(e.preferredDate) : e.preferredDateText || 'No date'}
                {manyLocations ? ' · ' + (e.locationName || 'No location') : ''}
                {' · '}{e.ownerName || 'Unclaimed'}
              </span>
            </span>
            <Pill tone={STEP[e.status]?.[1]}>{STEP[e.status]?.[0]}</Pill>
          </span>
        )}
        note={canAct ? null : canAdd ? 'You can add enquiries and event costs. Catering & Events claims and handles them.' : 'You can see these but not change them. Catering & Events handles them.'}
      >
        <div style={styles.howNote}>
          <strong>How enquiries get here:</strong> forward any catering or private event enquiry to{' '}
          <a href="mailto:catering@cigconcepts.com" style={{ color: 'var(--neon)', fontWeight: 700 }}>catering@cigconcepts.com</a>
          . It shows up here within five minutes, and that location's Catering &amp; Events manager is asked to claim it. One that came in by phone? Use + Add enquiry.
        </div>
      </RequestPage>

      {adding ? (
        <div data-modal="" data-modal-keep="" style={styles.backdrop} onClick={() => !busy && setAdding(null)}>
          <div style={styles.modal} onClick={(ev) => ev.stopPropagation()}>
            <h2 style={styles.modalTitle}>Add enquiry</h2>
            <p style={styles.hint}>For one that came in by phone, in person or another way. It lands in New, like the emailed ones.</p>
            <label style={styles.fieldLabel}>What kind</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['catering', 'Catering'], ['privateEvent', 'Private event']].map(([k, l]) => (
                <button key={k} style={{ ...styles.kind, ...(adding.kind === k ? styles.kindOn : {}) }} onClick={() => setAdding({ ...adding, kind: k })}>{l}</button>
              ))}
            </div>
            <label style={styles.fieldLabel}>Location</label>
            <select style={d.input} value={adding.locationId} onChange={(ev) => setAdding({ ...adding, locationId: ev.target.value })}>
              <option value="">Choose one</option>
              {locationOptions.map((l) => <option key={l.id} value={l.id}>{l.brandName} · {l.name}</option>)}
            </select>
            {[
              ['name', 'Name'], ['email', 'Email'], ['phone', 'Phone'], ['organisation', 'Organisation (optional)'],
              ...(adding.kind === 'catering' ? [] : [['occasion', 'Occasion']]),
              ['guests', 'Guests'],
            ].map(([k, l]) => (
              <React.Fragment key={k}>
                <label style={styles.fieldLabel}>{l}</label>
                <input style={d.input} value={adding[k]} onChange={(ev) => setAdding({ ...adding, [k]: ev.target.value })} />
              </React.Fragment>
            ))}
            <label style={styles.fieldLabel}>Date</label>
            <DatePickerField value={adding.date} onChange={(v) => setAdding({ ...adding, date: v })} placeholder="Choose a date" />
            <label style={styles.fieldLabel}>Time</label>
            <input style={d.input} placeholder="6:30pm" value={adding.preferredTime} onChange={(ev) => setAdding({ ...adding, preferredTime: ev.target.value })} />
            {adding.kind === 'catering' ? (
              <>
                <label style={styles.fieldLabel}>Pick-up or delivery</label>
                <select style={d.input} value={adding.fulfilment} onChange={(ev) => setAdding({ ...adding, fulfilment: ev.target.value })}>
                  <option value="">Not said yet</option>
                  <option value="Pick-up">Pick-up</option>
                  <option value="Delivery">Delivery</option>
                </select>
                {adding.fulfilment === 'Delivery' ? (
                  <>
                    <label style={styles.fieldLabel}>Address</label>
                    <input style={d.input} value={adding.address} onChange={(ev) => setAdding({ ...adding, address: ev.target.value })} />
                  </>
                ) : null}
              </>
            ) : null}
            <label style={styles.fieldLabel}>What they asked for</label>
            <textarea style={{ ...d.input, minHeight: 70, resize: 'vertical' }} value={adding.about} onChange={(ev) => setAdding({ ...adding, about: ev.target.value })} />
            <div style={styles.modalButtons}>
              <button style={d.ghost} onClick={() => setAdding(null)}>Cancel</button>
              <button style={d.primary} disabled={busy} onClick={() => run(saveNew, () => { setAdding(null); setFilter('new'); })}>Add enquiry</button>
            </div>
          </div>
        </div>
      ) : null}

      {claiming ? (
        <div data-modal="" style={styles.backdrop} onClick={() => setClaiming(null)}>
          <div style={styles.modal} onClick={(ev) => ev.stopPropagation()}>
            <h2 style={styles.modalTitle}>Claim {claiming.name === 'this' ? 'this enquiry' : claiming.name + "'s enquiry"}</h2>
            <p style={styles.hint}>It came in without a location. Which restaurant is it for?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {locationOptions.map((l) => (
                <label key={l.id} style={{ ...styles.place, ...(claiming.placeId === l.id ? styles.placeOn : {}) }}>
                  <input type="radio" name="claim-place" checked={claiming.placeId === l.id} onChange={() => setClaiming({ ...claiming, placeId: l.id })} />
                  {l.brandName} · {l.name}
                </label>
              ))}
            </div>
            <div style={styles.modalButtons}>
              <button style={d.ghost} onClick={() => setClaiming(null)}>Cancel</button>
              <button
                style={d.primary}
                disabled={busy || !claiming.placeId}
                onClick={() => {
                  const c = claiming;
                  const place = locationOptions.find((l) => l.id === c.placeId);
                  setClaiming(null);
                  run(() => claim(c.id, place), () => { setSelectedId(c.id); setFilter('talking'); }, 'Claimed. It is yours now.');
                }}
              >
                Claim
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div data-modal="" data-modal-keep="" style={styles.backdrop} onClick={() => setEditing(null)}>
          <div style={styles.modal} onClick={(ev) => ev.stopPropagation()}>
            <h2 style={styles.modalTitle}>Edit details</h2>
            <p style={styles.hint}>Fix anything that came through wrong. What they originally sent is kept on the record.</p>
            {/* Which restaurant it is for (16 Oct 2026) - an enquiry that came
                in through Taste but is really for Bluto's moves across. */}
            {locationOptions.length > 1 ? (
              <>
                <label style={styles.fieldLabel}>Location</label>
                <select style={d.input} value={editing.locationId ?? ''} onChange={(ev) => setEditing({ ...editing, locationId: ev.target.value })}>
                  {!locationOptions.some((l) => l.id === editing.locationId) ? <option value={editing.locationId ?? ''}>{editing.locationName || 'No location'}</option> : null}
                  {locationOptions.map((l) => <option key={l.id} value={l.id}>{l.brandName} · {l.name}</option>)}
                </select>
              </>
            ) : null}
            {[
              ['name', 'Name'], ['email', 'Email'], ['phone', 'Phone'], ['organisation', 'Organisation'], ['occasion', 'Occasion'],
              ['guests', 'Guests'], ['preferredTime', 'Time'], ['space', 'Space'], ['style', 'Style'],
              ['fulfilment', 'Pick-up or delivery'], ['address', 'Address'],
            ].map(([key, label]) => (
              <React.Fragment key={key}>
                <label style={styles.fieldLabel}>{label}</label>
                <input style={d.input} value={editing[key] ?? ''} onChange={(ev) => setEditing({ ...editing, [key]: ev.target.value })} />
              </React.Fragment>
            ))}
            <label style={styles.fieldLabel}>Date</label>
            <input type="date" style={{ ...d.input, colorScheme: 'dark' }} value={editing.dateInput ?? ''} onChange={(ev) => setEditing({ ...editing, dateInput: ev.target.value })} />
            {!editing.dateInput && editing.preferredDateText ? <p style={styles.hint}>They wrote: {editing.preferredDateText}</p> : null}
            <label style={styles.fieldLabel}>What they wrote</label>
            <textarea style={{ ...d.input, minHeight: 60, resize: 'vertical' }} value={editing.about ?? ''} onChange={(ev) => setEditing({ ...editing, about: ev.target.value })} />
            <div style={styles.modalButtons}>
              <button style={d.ghost} onClick={() => setEditing(null)}>Cancel</button>
              <button
                style={d.primary}
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      correct(editing.id, {
                        ...Object.fromEntries(['name', 'email', 'phone', 'organisation', 'occasion', 'guests', 'preferredTime', 'space', 'style', 'about', 'fulfilment', 'address'].map((k) => [k, editing[k] ?? ''])),
                        ...(() => {
                          const place = locationOptions.find((l) => l.id === editing.locationId);
                          return place && place.id !== enquiries.find((x) => x.id === editing.id)?.locationId
                            ? { locationId: place.id, locationName: place.name, brandId: place.brandId, brandName: place.brandName }
                            : {};
                        })(),
                        ...(editing.dateInput && editing.dateInput !== toDateInput(editing.preferredDate)
                          ? (() => {
                              const [y, m, dd] = editing.dateInput.split('-').map(Number);
                              // Only the day changes - the time it was set for stays.
                              const old = editing.preferredDate ? new Date(editing.preferredDate) : null;
                              const when = new Date(y, m - 1, dd, old ? old.getHours() : 12, old ? old.getMinutes() : 0).getTime();
                              return { preferredDate: when, preferredDateText: new Date(when).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) };
                            })()
                          : {}),
                      }),
                    () => setEditing(null)
                  )
                }
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dialogNode}
    </div>
  );
}

const styles = {
  howNote: { fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 },
  link: { color: 'var(--neon)', textDecoration: 'none' },
  linkButton: { display: 'inline-block', background: 'none', border: '1px solid var(--border-strong)', color: 'var(--neon)', borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 12, textDecoration: 'none' },
  done: { fontSize: 12, color: 'var(--ok)', alignSelf: 'center' },
  hint: { fontSize: 12, lineHeight: 1.5, color: 'var(--text-tertiary)', margin: '8px 0 0' },
  backdrop: { ...modalBackdrop, zIndex: 100 },
  modal: { padding: 22, ...modalSurface, width: 'min(460px, 100%)' },
  modalTitle: { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' },
  fieldLabel: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', margin: '10px 0 4px' },
  modalButtons: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  kind: { flex: 1, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  place: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '0 12px', border: '1px solid var(--border-strong)', borderRadius: 10, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' },
  placeOn: { borderColor: 'var(--neon)', background: 'rgba(34,211,238,0.06)' },
  kindSeg: { display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 9, overflow: 'hidden', margin: '0 0 10px', maxWidth: '100%' },
  kindBtn: { background: 'none', border: 'none', borderLeft: '1px solid var(--border)', padding: '8px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', textTransform: 'none' },
  kindSegOn: { background: 'var(--neon)', color: '#0A0A0B' },
  kindTag: { fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', borderRadius: 5, padding: '3px 7px', background: 'rgba(255,255,255,0.07)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' },
  tabs: { display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', margin: '0 0 14px' },
  tab: { background: 'none', border: 'none', borderBottom: '2px solid transparent', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text-tertiary)', cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1 },
  tabOn: { color: 'var(--neon)', borderBottomColor: 'var(--neon)' },
  kindOn: { background: 'var(--neon)', color: '#0A0A0B', borderColor: 'var(--neon)' },
};
