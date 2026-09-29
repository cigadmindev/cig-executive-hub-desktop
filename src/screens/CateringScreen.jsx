import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCatering } from '../context/CateringContext';
import { useDialog } from '../hooks/useDialog';
import { nike } from '../theme/nike';

// Catering orders and private event bookings.
//
// The conversation stays in email - that is the right tool for gathering
// details. What lives here is where each one stands, what was agreed on the
// phone, and who is handling it, so nobody has to ask.
const MENU_URL = 'https://drive.google.com/drive/folders/1GX2vfJlL5r-Uekwjw7oEma2jksWqH_O-';

const dateText = (t, fallback) => {
  if (!t) return fallback || 'No date';
  return new Date(t).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

const GROUPS = [
  { key: 'new', label: 'Needs a first reply', tone: 'danger' },
  { key: 'talking', label: 'Talking to them', tone: 'warning' },
  { key: 'confirmed', label: 'Confirmed', tone: 'accent' },
];

export default function CateringScreen() {
  const { user } = useAuth();
  const { enquiries, claim, setStatus, update, markInvoiced, markPaid } = useCatering();
  const { dialogNode, confirm, notify } = useDialog();
  const [openId, setOpenId] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [draft, setDraft] = useState({});

  const open = enquiries.filter((e) => ['new', 'talking', 'confirmed'].includes(e.status));
  const finished = enquiries.filter((e) => ['done', 'lost'].includes(e.status));

  const saveDetails = async (e) => {
    const d = draft[e.id] ?? {};
    await update(e.id, {
      minimum: d.minimum ?? e.minimum,
      finalGuests: d.finalGuests ?? e.finalGuests,
      details: d.details ?? e.details,
    });
    notify('Saved', 'Everyone looking after this location can see it.');
  };

  // Opens a reply in Gmail with the address filled in - the thread belongs in
  // email, not here.
  const mailto = (e, subject, body) =>
    `mailto:${e.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const card = (e) => {
    const isOpen = openId === e.id;
    const d = draft[e.id] ?? {};
    const isCatering = e.kind === 'catering';

    return (
      <div key={e.id} style={{ ...styles.card, ...(e.status === 'new' ? styles.cardNew : {}) }}>
        <button style={styles.head} onClick={() => setOpenId(isOpen ? null : e.id)}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={styles.name}>
              {e.name || 'No name'}
              {e.organisation ? <span style={styles.org}> · {e.organisation}</span> : null}
            </p>
            <p style={styles.meta}>
              {isCatering ? e.fulfilment || 'Catering' : e.occasion || 'Private event'} ·{' '}
              {dateText(e.preferredDate, e.preferredDateText)}
              {e.preferredTime ? ', ' + e.preferredTime : ''} · {e.locationName || 'No location'}
            </p>
            <p style={styles.meta}>
              {e.guests ? e.guests + ' guests' : 'Guest count not given'}
              {e.ownerName ? ' · ' + e.ownerName + ' is on it' : ''}
              {e.minimum ? ' · ' + e.minimum + ' minimum' : ''}
              {e.paidAt ? ' · paid' : e.invoicedAt ? ' · invoiced' : ''}
            </p>
          </div>
          <span style={{ ...styles.pill, ...(isCatering ? styles.pillCatering : styles.pillEvent) }}>
            {isCatering ? 'Catering' : 'Private event'}
          </span>
        </button>

        {isOpen ? (
          <div style={styles.body}>
            <p style={styles.sectionLabel}>Them</p>
            <div style={styles.contactRow}>
              {e.email ? (
                <a href={'mailto:' + e.email} style={styles.contact}>
                  {e.email}
                </a>
              ) : null}
              {e.phone ? (
                <a href={'tel:' + e.phone.replace(/[^\d+]/g, '')} style={styles.contact}>
                  {e.phone}
                </a>
              ) : null}
            </div>

            {isCatering ? (
              <>
                <p style={styles.sectionLabel}>The order</p>
                <p style={styles.detail}>
                  {e.fulfilment || 'Not said'}
                  {e.address ? ' to ' + e.address : ''}
                  {e.preferredTime ? ' at ' + e.preferredTime : ''}
                </p>
              </>
            ) : (
              <>
                <p style={styles.sectionLabel}>What they asked for</p>
                <p style={styles.detail}>
                  {[e.space, e.style].filter(Boolean).join(' · ') || 'Nothing specified'}
                </p>
                {e.about ? <p style={styles.detail}>{e.about}</p> : null}
              </>
            )}

            <p style={styles.sectionLabel}>What you have agreed</p>
            <div style={styles.twoCol}>
              <input
                style={styles.input}
                placeholder={isCatering ? 'Order total' : 'Food & beverage minimum'}
                value={d.minimum ?? e.minimum}
                onChange={(ev) => setDraft({ ...draft, [e.id]: { ...d, minimum: ev.target.value } })}
              />
              <input
                style={styles.input}
                placeholder="Final headcount"
                value={d.finalGuests ?? e.finalGuests}
                onChange={(ev) => setDraft({ ...draft, [e.id]: { ...d, finalGuests: ev.target.value } })}
              />
            </div>
            <textarea
              style={{ ...styles.input, ...styles.textarea }}
              placeholder="Menu, room, timings, anything agreed on the phone"
              value={d.details ?? e.details}
              onChange={(ev) => setDraft({ ...draft, [e.id]: { ...d, details: ev.target.value } })}
            />
            <button style={styles.quiet} onClick={() => saveDetails(e)}>
              Save
            </button>

            <p style={styles.sectionLabel}>Do</p>
            <div style={styles.actions}>
              <a
                href={mailto(e, `Your ${isCatering ? 'catering order' : 'event'} at Taste ${e.locationName}`, `Hi ${(e.name || '').split(' ')[0]},\n\n`)}
                style={styles.button}
              >
                Reply
              </a>

              {isCatering ? (
                <a
                  href={mailto(
                    e,
                    'Taste Italian Kitchen — catering menu',
                    `Hi ${(e.name || '').split(' ')[0]},\n\nThanks for getting in touch. Have you had a chance to look at our catering menu? You can see it here:\n\n${MENU_URL}\n\nLet me know what you would like and I will take it from there.\n\n`
                  )}
                  style={styles.button}
                >
                  Send the menu
                </a>
              ) : null}

              {!e.ownerUid ? (
                <button style={styles.button} onClick={() => claim(e.id)}>
                  I'm on it
                </button>
              ) : null}

              {e.status !== 'confirmed' ? (
                <button style={styles.button} onClick={() => setStatus(e.id, 'confirmed')}>
                  Confirmed
                </button>
              ) : null}

              {isCatering && e.status === 'confirmed' && !e.invoicedAt ? (
                <button style={styles.button} onClick={() => markInvoiced(e.id)}>
                  Invoiced
                </button>
              ) : null}

              {isCatering && e.invoicedAt && !e.paidAt ? (
                <button style={styles.button} onClick={() => markPaid(e.id)}>
                  Paid
                </button>
              ) : null}

              {e.status === 'confirmed' ? (
                <button style={styles.quiet} onClick={() => setStatus(e.id, 'done')}>
                  Done
                </button>
              ) : null}

              <button
                style={styles.quiet}
                onClick={() =>
                  confirm({
                    title: 'They are not going ahead?',
                    body: 'It moves out of the way but stays on the record.',
                    confirmLabel: 'Not going ahead',
                    onConfirm: () => setStatus(e.id, 'lost'),
                  })
                }
              >
                Not going ahead
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div style={styles.page}>
      <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Catering &amp; Events</h1>
      <p style={styles.subtitle}>Everything that has come in, and where each one stands.</p>

      {open.length === 0 ? <p style={styles.empty}>Nothing outstanding.</p> : null}

      {GROUPS.map((g) => {
        const items = open.filter((e) => e.status === g.key);
        if (items.length === 0) return null;
        return (
          <div key={g.key} style={styles.group}>
            <p style={{ ...styles.groupLabel, color: `var(--${g.tone === 'accent' ? 'neon' : g.tone})` }}>
              {g.label} — {items.length}
            </p>
            {items.map(card)}
          </div>
        );
      })}

      {finished.length > 0 ? (
        <>
          <button style={styles.showDone} onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Hide' : 'Show'} finished ({finished.length})
          </button>
          {showDone ? finished.slice(0, 40).map(card) : null}
        </>
      ) : null}

      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '28px max(22px, min(36px, 4vw))', maxWidth: 740 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 20px' },
  empty: { fontSize: 13, color: 'var(--text-tertiary)' },

  group: { marginBottom: 20 },
  groupLabel: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', margin: '0 0 8px' },

  card: { background: 'var(--bg-card)', borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  cardNew: { border: '1px solid rgba(232,82,75,0.4)' },
  head: { display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', padding: '13px 15px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' },
  name: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 },
  org: { fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' },
  meta: { fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' },
  pill: { fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap' },
  pillCatering: { background: 'rgba(201,162,39,0.16)', color: '#C9A227' },
  pillEvent: { background: 'rgba(34,211,238,0.14)', color: 'var(--neon)' },

  body: { padding: '0 15px 15px' },
  sectionLabel: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '14px 0 6px' },
  contactRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  contact: { fontSize: 12, padding: '7px 11px', borderRadius: 9, border: '1px solid var(--border-strong)', color: 'var(--neon)', textDecoration: 'none' },
  detail: { fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)', margin: '0 0 6px' },

  twoCol: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8, marginBottom: 8 },
  input: { width: '100%', boxSizing: 'border-box', minHeight: 38, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-inset)', color: 'var(--text-primary)', fontSize: 13 },
  textarea: { minHeight: 60, resize: 'vertical', marginBottom: 8 },

  actions: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  button: { display: 'inline-block', padding: '7px 12px', borderRadius: 9, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' },
  quiet: { padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  showDone: { background: 'none', border: 'none', padding: '8px 0', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' },
};
