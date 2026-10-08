import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCatering } from '../context/CateringContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useDialog } from '../hooks/useDialog';
import { atLeast } from '../data/accessMatrix';
import { brands } from '../data/mockData';
import DatePickerField from '../components/DatePickerField';
import RequestPage, { Pill, detailStyles as d } from '../components/RequestPage';
import { fmtDay } from '../lib/dates';

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
  lost: ['Lost', 'red'],
};
const FILTERS = Object.entries(STEP).map(([k, [l]]) => [k, l]);

const BLANK = { kind: 'catering', locationId: '', name: '', email: '', phone: '', organisation: '', occasion: '', guests: '', date: '', preferredTime: '', fulfilment: '', address: '', about: '' };

export default function CateringScreen() {
  const { user, hasLocationAccess } = useAuth();
  const { getByBrand } = useCustomLocations();
  const { enquiries, addEnquiry, claim, setStatus, lose, adminSetStatus, update, correct, markInvoiced, markPaid } = useCatering();
  const { dialogNode, notify } = useDialog();
  const isAdmin = user?.role === 'admin';
  const canAct = atLeast(user, 'catering', 'claim');

  const firstWithItems = ['new', 'talking', 'confirmed'].find((k) => enquiries.some((e) => e.status === k)) ?? 'new';
  const [filter, setFilter] = useState(null);
  const shown = filter ?? firstWithItems;
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState({});
  const [losing, setLosing] = useState(null);
  const [changing, setChanging] = useState(null);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(null);
  const [busy, setBusy] = useState(false);

  // Every location this person can reach - where a phoned-in enquiry can go.
  const locationOptions = [];
  for (const b of brands) {
    for (const l of [...(b.locations ?? []), ...(getByBrand(b.id) ?? [])]) {
      if (hasLocationAccess(user, b.id, l.id)) locationOptions.push({ id: l.id, name: l.name, brandId: b.id, brandName: b.name });
    }
  }

  const run = async (fn, after) => {
    setBusy(true);
    try {
      const note = await fn();
      after?.();
      if (typeof note === 'string') notify('Done, with one thing left', note);
    } catch (err) {
      notify('Nothing was changed', err?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setLosing(null); setChanging(null); };
  const rows = enquiries
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
      ['Marked lost', e.lostAt, e.lostByName],
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
        <div style={d.row}><span style={d.k}>Where</span><span style={d.v}>{e.locationName ? (e.brandName ? e.brandName + ' · ' : '') + e.locationName : 'No location'}</span></div>
        <div style={d.row}>
          <span style={d.k}>Contact</span>
          <span style={d.v}>
            {e.email ? <a href={'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(e.email)} target="_blank" rel="noreferrer" style={styles.link}>{e.email}</a> : null}
            {e.email && e.phone ? <br /> : null}
            {e.phone ? <a href={'tel:' + e.phone.replace(/[^\d+]/g, '')} style={styles.link}>{e.phone}</a> : null}
            {!e.email && !e.phone ? 'None given' : null}
          </span>
        </div>
        {!isCatering && (e.space || e.style) ? <div style={d.row}><span style={d.k}>Asked for</span><span style={d.v}>{[e.space, e.style].filter(Boolean).join(' · ')}</span></div> : null}
        {e.about ? <div style={d.row}><span style={d.k}>They wrote</span><span style={{ ...d.v, whiteSpace: 'pre-wrap' }}>{e.about}</span></div> : null}
        {e.status === 'lost' && e.lostReason ? <div style={d.row}><span style={d.k}>Why lost</span><span style={d.v}>{e.lostReason}</span></div> : null}

        {canAct ? (
          <>
            {losing === e.id ? (
              <div style={{ marginTop: 14 }}>
                <input style={d.input} autoFocus placeholder="Why they are not going ahead" value={changing?.reason ?? ''} onChange={(ev) => setChanging({ reason: ev.target.value })} />
                <div style={{ ...d.actions, marginTop: 0 }}>
                  <button style={d.primary} disabled={busy || !(changing?.reason ?? '').trim()} onClick={() => run(() => lose(e.id, changing.reason), () => { reset(); setSelectedId(e.id); setFilter('lost'); })}>Mark lost</button>
                  <button style={d.ghost} onClick={reset}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={d.actions}>
                {!e.ownerUid && ['new', 'talking'].includes(e.status) ? <button style={d.primary} disabled={busy} onClick={() => run(() => claim(e.id), () => { setSelectedId(e.id); setFilter('talking'); })}>Claim</button> : null}
                {e.status === 'new' && e.ownerUid ? <button style={d.ghost} disabled={busy} onClick={() => run(() => setStatus(e.id, 'talking'), () => { setSelectedId(e.id); setFilter('talking'); })}>Talking</button> : null}
                {['new', 'talking'].includes(e.status) ? <button style={d.ghost} disabled={busy} onClick={() => run(() => setStatus(e.id, 'confirmed'), () => { setSelectedId(e.id); setFilter('confirmed'); })}>Confirmed</button> : null}
                {e.status === 'confirmed' ? <button style={d.ghost} disabled={busy} onClick={() => run(() => setStatus(e.id, 'done'), () => { setSelectedId(e.id); setFilter('done'); })}>Done</button> : null}
                {['new', 'talking', 'confirmed'].includes(e.status) ? <button style={d.ghost} onClick={() => { setChanging({ reason: '' }); setLosing(e.id); }}>Lost…</button> : null}
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
                  <button style={d.primary} disabled={busy || changing.status === e.status || !changing.reason.trim()} onClick={() => run(() => adminSetStatus(e.id, changing.status, changing.reason), () => { setSelectedId(e.id); setFilter(changing.status); reset(); })}>Change status</button>
                  <button style={d.ghost} onClick={reset}>Cancel</button>
                </div>
              </>
            ) : (
              <div style={{ ...d.actions, marginTop: 0 }}>
                <button style={d.ghost} onClick={() => setEditing({ ...e })}>Edit details</button>
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
    await addEnquiry({
      kind: adding.kind,
      name: adding.name.trim(), email: adding.email.trim(), phone: adding.phone.trim(),
      organisation: adding.organisation.trim(), occasion: adding.occasion.trim(), guests: adding.guests.trim(),
      preferredDate: when, preferredDateText: when ? longDate(when) : '', preferredTime: adding.preferredTime.trim(),
      fulfilment: isCatering ? adding.fulfilment : '', address: isCatering ? adding.address.trim() : '',
      space: '', style: '', about: adding.about.trim(),
      locationId: place.id, locationName: place.name, brandId: place.brandId, brandName: place.brandName,
    });
  };

  return (
    <div>
      <RequestPage
        title="Catering"
        subtitle="Catering orders and private events. The GM, Catering & Events or a chef claims each one."
        actionLabel={canAct ? '+ Add enquiry' : null}
        onAction={() => setAdding({ ...BLANK, locationId: locationOptions.length === 1 ? locationOptions[0].id : '' })}
        filters={FILTERS.map(([k, l]) => ({ key: k, label: l, count: ['done', 'lost'].includes(k) ? null : enquiries.filter((e) => e.status === k).length }))}
        filter={shown}
        onFilter={(k) => { setFilter(k); setSelectedId(null); reset(); }}
        columns={[
          { key: 'who', label: 'Enquiry', render: (e) => <><strong>{e.name || 'No name'}</strong><div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{e.kind === 'catering' ? 'Catering' + (e.fulfilment ? ' · ' + e.fulfilment.toLowerCase() : '') : e.occasion || 'Private event'}</div></> },
          ...(manyLocations ? [{ key: 'where', label: 'Location', render: (e) => e.locationName || '—' }] : []),
          { key: 'when', label: 'Date', render: (e) => (e.preferredDate ? dateText(e.preferredDate) : e.preferredDateText || '—') },
          { key: 'guests', label: 'Guests', render: (e) => e.finalGuests || e.guests || '—' },
          { key: 'owner', label: 'Owner', render: (e) => (e.ownerName ? e.ownerName : <span style={{ color: 'var(--text-tertiary)' }}>Unclaimed</span>) },
          { key: 'status', label: 'Status', render: (e) => <Pill tone={STEP[e.status]?.[1]}>{STEP[e.status]?.[0]}</Pill> },
        ]}
        rows={rows}
        selectedId={selected?.id}
        onSelect={(id) => { setSelectedId(id); reset(); }}
        detail={detail}
        empty="Nothing in this list."
        note={canAct ? null : 'You can see these but not change them. The GM, Catering & Events and chefs handle them.'}
      >
        <div style={styles.howNote}>
          <strong>How enquiries get here:</strong> forward any catering or private event enquiry to{' '}
          <a href="mailto:catering@cigconcepts.com" style={{ color: 'var(--neon)', fontWeight: 700 }}>catering@cigconcepts.com</a>
          . It shows up here within five minutes, and that location's GM, catering lead and chefs are emailed. One that came in by phone? Use + Add enquiry.
        </div>
      </RequestPage>

      {adding ? (
        <div style={styles.backdrop} onClick={() => !busy && setAdding(null)}>
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

      {editing ? (
        <div style={styles.backdrop} onClick={() => setEditing(null)}>
          <div style={styles.modal} onClick={(ev) => ev.stopPropagation()}>
            <h2 style={styles.modalTitle}>Edit details</h2>
            <p style={styles.hint}>Fix anything that came through wrong. What they originally sent is kept on the record.</p>
            {[
              ['name', 'Name'], ['email', 'Email'], ['phone', 'Phone'], ['organisation', 'Organisation'], ['occasion', 'Occasion'],
              ['guests', 'Guests'], ['preferredDateText', 'Date'], ['preferredTime', 'Time'], ['space', 'Space'], ['style', 'Style'],
              ['fulfilment', 'Pick-up or delivery'], ['address', 'Address'],
            ].map(([key, label]) => (
              <React.Fragment key={key}>
                <label style={styles.fieldLabel}>{label}</label>
                <input style={d.input} value={editing[key] ?? ''} onChange={(ev) => setEditing({ ...editing, [key]: ev.target.value })} />
              </React.Fragment>
            ))}
            <label style={styles.fieldLabel}>What they wrote</label>
            <textarea style={{ ...d.input, minHeight: 60, resize: 'vertical' }} value={editing.about ?? ''} onChange={(ev) => setEditing({ ...editing, about: ev.target.value })} />
            <div style={styles.modalButtons}>
              <button style={d.ghost} onClick={() => setEditing(null)}>Cancel</button>
              <button
                style={d.primary}
                disabled={busy}
                onClick={() => run(() => correct(editing.id, Object.fromEntries(['name', 'email', 'phone', 'organisation', 'occasion', 'guests', 'preferredDateText', 'preferredTime', 'space', 'style', 'about', 'fulfilment', 'address'].map((k) => [k, editing[k] ?? '']))), () => setEditing(null))}
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
  howNote: { fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)', background: '#16161A', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 },
  link: { color: 'var(--neon)', textDecoration: 'none' },
  linkButton: { display: 'inline-block', background: 'none', border: '1px solid var(--border-strong)', color: 'var(--neon)', borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 12, textDecoration: 'none' },
  done: { fontSize: 12, color: '#4ADE80', alignSelf: 'center' },
  hint: { fontSize: 12, lineHeight: 1.5, color: 'var(--text-tertiary)', margin: '8px 0 0' },
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 },
  modal: { width: 'min(440px, 100%)', maxHeight: '86vh', overflowY: 'auto', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, padding: 22 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' },
  fieldLabel: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', margin: '10px 0 4px' },
  modalButtons: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  kind: { flex: 1, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  kindOn: { background: 'var(--neon)', color: '#0A0A0B', borderColor: 'var(--neon)' },
};
