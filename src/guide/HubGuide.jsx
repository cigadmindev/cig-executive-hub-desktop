import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Orb from './Orb';
import Icon from '../components/Icon';
import { answer, liveMatches, openingLines, docsAnswer } from './brain';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { brands } from '../data/mockData';
import { accessLevel, seesEveryRestaurant } from '../data/accessMatrix';
import { useAuth } from '../context/AuthContext';
import { useSchedule } from '../context/ScheduleContext';
import { useRenewals } from '../context/RenewalsContext';
import { useOpeningInfo } from '../context/OpeningInfoContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useOpeningOngoingContacts } from '../context/OpeningOngoingContactsContext';
import { useAvailability } from '../context/AvailabilityContext';
import { useExpenses } from '../context/ExpensesContext';
import { useCatering } from '../context/CateringContext';
import { useWorkOrders } from '../context/WorkOrdersContext';
import { useHomeSummary, calendarLink } from '../hooks/useHomeSummary';
import { useIsNarrow } from '../hooks/useIsNarrow';

// The Hub Guide (Nov 2026): the glowing orb in the corner. Ask it anything
// about the Hub and it answers in plain words, with buttons to the right
// place. It reads only what this person's Hub has already loaded (or loads
// it the same way the page would), so it never shows more than they could
// open. No AI behind it - see brain.js. ⌘K / Ctrl+K opens it.

// Admins and executives first; switch on for everyone once it has settled.
const FOR_EVERYONE = false;

const ICON = { doc: 'document', check: 'clipboard', phone: 'phone', folder: 'folder', page: 'document', person: 'person', cal: 'calendar', pin: 'pin' };

function useGuideContext(pathname) {
  const { user, activeUsers, hasLocationAccess, hasBrandAccess, viewAs } = useAuth();
  const { entries } = useSchedule();
  const { getByLocation: renewalsFor } = useRenewals();
  const { getInfo } = useOpeningInfo();
  const { getByBrand } = useCustomLocations();
  const contacts = useOpeningOngoingContacts();
  const { timeOffRequests } = useAvailability();
  const { receipts, periods, seesAll } = useExpenses();
  const { enquiries } = useCatering();
  const { getMyQueue } = useWorkOrders();
  const summary = useHomeSummary();

  const locations = useMemo(
    () =>
      brands
        .filter((b) => hasBrandAccess(user, b.id))
        .flatMap((b) => [
          ...b.locations.filter((l) => l.status === 'active').map((l) => ({ ...l, brandId: b.id, brandName: b.name })),
          ...getByBrand(b.id).map((l) => ({ ...l, brandId: b.id, brandName: b.name, isCustom: true })),
        ])
        .filter((l) => hasLocationAccess(user, l.brandId, l.id)),
    [user, getByBrand, hasBrandAccess, hasLocationAccess]
  );

  const m = pathname.match(/^\/brand\/([^/]+)(?:\/location\/([^/]+))?/);
  const hereLoc = m?.[2] ? locations.find((l) => l.id === m[2]) : null;

  return {
    now: Date.now(),
    user,
    viewAsUid: viewAs?.uid ?? null,
    users: activeUsers ?? [],
    isAdmin: user?.role === 'admin',
    can: (col) => user?.role === 'admin' || !['none', undefined, null].includes(accessLevel(user, col)),
    seesEverything: (u) => seesEveryRestaurant(u),
    hasLocationAccess,
    locations,
    here: { brandId: m?.[1], locationId: m?.[2], loc: hereLoc },
    pathname,
    entries: entries ?? [],
    renewalsFor,
    getInfo,
    contactsFor: (id) => {
      const list = contacts.getByLocation(id);
      return list.length ? list : null;
    },
    watchContacts: contacts.watch,
    pocMine: contacts.assignedToMe ?? [],
    timeOff: timeOffRequests ?? [],
    receipts: receipts ?? [],
    periods: periods ?? [],
    seesAllReceipts: !!seesAll,
    enquiries: enquiries ?? [],
    signQueue: getMyQueue?.() ?? [],
    summary,
    calendarLink,
  };
}

export default function HubGuide() {
  const { user, realUser } = useAuth();
  // While an admin views the Hub as someone, the Guide stays, answering as them.
  const who = realUser ?? user;
  if (!user || !who || (!FOR_EVERYONE && !['admin', 'executive'].includes(who.role))) return null;
  return <GuideInner />;
}

function GuideInner() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isNarrow = useIsNarrow();
  const ctx = useGuideContext(pathname);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  // In the preview only: lets the question-bank test reach the same data.
  if (import.meta.env.DEV) window.__guideCtx = ctx;

  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]); // { id, who: 'me'|'hub', text, shown, cards, chips, go }
  const [mood, setMood] = useState('idle');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [focusMatch, setFocusMatch] = useState(-1);
  const memory = useRef({});
  const tried = useRef(new Set());
  const feedRef = useRef(null);
  const inputRef = useRef(null);
  const greeted = useRef(false);

  const matches = useMemo(() => (q.trim().length >= 2 && !busy ? liveMatches(q, ctx) : []), [q, busy, ctx]);

  // ⌘K / Ctrl+K, and Escape.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 220);
    if (!greeted.current) {
      greeted.current = true;
      const g = openingLines(ctxRef.current);
      say({ text: g.text, chips: g.chips }, 260);
    }
  }, [open]);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Types the answer out word by word, then lets the cards and chips rise in.
  async function say(a, delay = 0) {
    const id = Math.random().toString(36).slice(2);
    if (delay) await sleep(delay);
    setMood(a.mood === 'joke' ? 'joke' : 'talk');
    setMsgs((m) => [...m, { id, who: 'hub', text: a.text, shown: '', cards: [], chips: [], go: null }]);
    const words = String(a.text).split(' ');
    for (let i = 1; i <= words.length; i++) {
      const shown = words.slice(0, i).join(' ');
      setMsgs((m) => m.map((x) => (x.id === id ? { ...x, shown } : x)));
      await sleep(18 + Math.random() * 22);
    }
    setMsgs((m) => m.map((x) => (x.id === id ? { ...x, cards: a.cards ?? [], chips: a.chips ?? [], go: a.go ?? null } : x)));
    setTimeout(() => setMood('idle'), 500);
  }

  async function ask(text, extraMemory) {
    if (busy || !String(text).trim()) return;
    // A few chips are really buttons.
    const last = [...msgs].reverse().find((m) => m.who === 'hub');
    if (/^show all|^see all|^take me there|^open /i.test(text) && last?.go) return go(last.go.to);
    if (/^ask brenner in support$/i.test(text)) return go('/support');
    if (/^message /i.test(text)) return go('/messages');
    setBusy(true);
    setQ('');
    setFocusMatch(-1);
    setMsgs((m) => [...m, { id: Math.random().toString(36).slice(2), who: 'me', text }]);
    setMood('think');
    if (extraMemory) memory.current = { ...memory.current, ...extraMemory };
    await sleep(520 + Math.random() * 260);
    let a = answer(text, ctxRef.current, memory.current);
    // A location's contacts load only when asked for, the same way their page loads them.
    if (a.load) {
      const key = a.load.locationId;
      if (!tried.current.has(key)) {
        tried.current.add(key);
        ctxRef.current.watchContacts(a.load.brandId, a.load.locationId);
        for (let i = 0; i < 20 && !ctxRef.current.contactsFor(key); i++) await sleep(150);
        a = answer(text, ctxRef.current, memory.current);
        // Put back the contacts page that's open, if there is one.
        const h = ctxRef.current.here;
        if (h?.locationId && /operational-poc/.test(pathname) && h.locationId !== key) ctxRef.current.watchContacts(h.brandId, h.locationId);
      }
      if (a.load) a = { text: "I couldn't load that location's contacts just now. Here's their page.", go: { to: `/brand/${a.load.brandId}/location/${a.load.locationId}/operational-poc`, label: 'Contacts' } };
    }
    // Documents: the server searches the shared Drive and keeps only files
    // this person may open.
    if (a.search) {
      try {
        const fns = getFunctions(undefined, 'us-central1');
        const viewAs = ctxRef.current.viewAsUid;
        const res = await httpsCallable(fns, 'guideDriveSearch', { timeout: 45000 })({ ...a.search, ...(viewAs ? { asUid: viewAs } : {}) });
        a = { ...docsAnswer(res.data, a.meta, ctxRef.current), memory: a.memory };
      } catch (err) {
        console.error('[Hub Guide] Drive search', err);
        a = { text: "I couldn't reach Google Drive just now. Try again in a minute, or open the folders yourself.", memory: a.memory };
      }
    }
    memory.current = a.memory ?? memory.current;
    await say(a);
    setBusy(false);
  }

  function go(to) {
    if (/^https?:/.test(to)) window.open(to, '_blank', 'noopener');
    else navigate(to);
    if (isNarrow) setOpen(false);
  }

  const onCard = (c) => {
    if (c.href) return go(c.href);
    if (c.to) go(c.to);
  };

  const copy = async (e, text, idx) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(text); } catch { /* not allowed */ }
    e.currentTarget.textContent = 'Copied';
  };

  const pos = isNarrow ? { right: 14, bottom: 'calc(158px + env(safe-area-inset-bottom, 0px))' } : { right: 24, bottom: 24 };

  return (
    <>
      {open ? <div style={s.scrim} onClick={() => setOpen(false)} aria-hidden="true" /> : null}
      <button
        style={{ ...s.orbBtn, ...pos, ...(open ? s.orbBtnHidden : {}) }}
        onClick={() => setOpen(true)}
        onMouseEnter={() => setMood((m) => (m === 'idle' ? 'listen' : m))}
        onMouseLeave={() => setMood((m) => (m === 'listen' ? 'idle' : m))}
        aria-label="Ask the Hub (Command K)"
        title="Ask the Hub  ⌘K"
      >
        <Orb mood={open ? 'idle' : mood} size={isNarrow ? 46 : 52} stir={!open} />
      </button>

      <section
        style={{ ...s.panel, ...(isNarrow ? s.panelNarrow : {}), ...(open ? s.panelOpen : s.panelShut) }}
        aria-label="Hub Guide"
        aria-hidden={open ? undefined : true}
      >
        <div style={s.head}>
          <Orb mood={mood} size={40} />
          <div style={{ minWidth: 0 }}>
            <div style={s.title}>Hub Guide</div>
            <div style={s.sub}>Knows everything you can see in the Hub</div>
          </div>
          <button style={s.close} onClick={() => setOpen(false)} aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        </div>

        <div ref={feedRef} style={s.feed}>
          {msgs.map((m) =>
            m.who === 'me' ? (
              <div key={m.id} style={s.me} data-guide-rise="">{m.text}</div>
            ) : (
              <div key={m.id} style={s.hub} data-guide-rise="">
                <div style={s.hubText}>{m.shown}</div>
                {m.cards?.length ? (
                  <div style={s.cards}>
                    {m.cards.map((c, i) => (
                      <div key={i} role="button" tabIndex={0} style={{ ...s.card, animationDelay: i * 80 + 'ms' }} data-guide-rise="" data-row="" onClick={() => onCard(c)} onKeyDown={(e) => { if (e.key === 'Enter') onCard(c); }}>
                        <span style={s.cardIcon}><Icon name={ICON[c.icon] ?? 'document'} size={16} /></span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={s.cardTitle}>{c.title}</span>
                          {c.sub ? <span style={s.cardSub}>{c.sub}</span> : null}
                        </span>
                        {c.tag ? <span style={{ ...s.tag, ...(TONES[c.tag[1]] ?? TONES.grey) }}>{c.tag[0]}</span> : null}
                        {c.whyId ? (
                          <button style={s.mini} onClick={(e) => { e.stopPropagation(); ask(`Why does ${c.title} matter?`, { lastItemId: c.whyId }); }}>Why?</button>
                        ) : null}
                        {c.copy ? <button style={s.mini} onClick={(e) => copy(e, c.copy)}>Copy</button> : <span style={s.chev}>›</span>}
                      </div>
                    ))}
                  </div>
                ) : null}
                {m.go ? (
                  <button style={s.goBtn} onClick={() => go(m.go.to)} data-guide-rise="">{m.go.label} ›</button>
                ) : null}
                {m.chips?.length ? (
                  <div style={s.chips}>
                    {m.chips.map((c, i) => (
                      <button key={c} style={{ ...s.chip, animationDelay: i * 60 + 'ms' }} data-guide-rise="" onClick={() => ask(c)}>{c}</button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          )}
          {busy && mood === 'think' ? (
            <div style={s.dots} data-guide-rise=""><i style={s.dot} /><i style={{ ...s.dot, animationDelay: '.15s' }} /><i style={{ ...s.dot, animationDelay: '.3s' }} /></div>
          ) : null}
        </div>

        <div style={s.foot}>
          {matches.length ? (
            <div style={s.live}>
              <div style={s.liveHead}>Matches</div>
              {matches.map((c, i) => (
                <div key={i} role="button" tabIndex={-1} style={{ ...s.liveRow, ...(focusMatch === i ? s.liveRowOn : {}) }} onMouseDown={(e) => { e.preventDefault(); setQ(''); onCard(c); }}>
                  <span style={{ ...s.cardIcon, width: 24, height: 24, borderRadius: 7 }}><Icon name={ICON[c.icon] ?? 'document'} size={13} /></span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                  <span style={s.liveSub}>{c.sub}</span>
                </div>
              ))}
            </div>
          ) : null}
          <form
            style={s.inRow}
            onSubmit={(e) => {
              e.preventDefault();
              if (focusMatch >= 0 && matches[focusMatch]) { setQ(''); onCard(matches[focusMatch]); return; }
              ask(q);
            }}
          >
            <input
              ref={inputRef}
              id="hub-guide-input"
              style={s.input}
              value={q}
              placeholder="Ask anything about the Hub…"
              autoComplete="off"
              onChange={(e) => { setQ(e.target.value); setFocusMatch(-1); if (!busy) setMood('listen'); }}
              onBlur={() => !busy && setMood('idle')}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && matches.length) { e.preventDefault(); setFocusMatch((i) => Math.min(matches.length - 1, i + 1)); }
                if (e.key === 'ArrowUp' && matches.length) { e.preventDefault(); setFocusMatch((i) => Math.max(-1, i - 1)); }
              }}
              aria-label="Ask the Hub"
            />
            <button style={s.send} aria-label="Ask" disabled={busy || !q.trim()}>↑</button>
          </form>
          <div style={s.hint}>Only shows what you're allowed to see{isNarrow ? '' : ' · esc to close'}</div>
        </div>
      </section>
    </>
  );
}

const TONES = {
  red: { background: 'var(--red-bg)', color: 'var(--red-fg)' },
  amber: { background: 'var(--amber-bg)', color: 'var(--amber-fg)' },
  green: { background: 'var(--green-bg)', color: 'var(--green-fg)' },
  grey: { background: 'rgba(var(--ink-rgb), 0.06)', color: 'var(--text-secondary)' },
};

const s = {
  scrim: { position: 'fixed', inset: 0, zIndex: 280, background: 'rgba(20,24,32,0.12)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', animation: 'hubFade 0.25s ease' },
  orbBtn: {
    position: 'fixed', zIndex: 270, width: 60, height: 60, borderRadius: 30, padding: 0, border: '1px solid var(--glass-edge)',
    background: 'radial-gradient(circle at 50% 50%, #26343a, #141a1e)', boxShadow: '0 10px 30px rgba(20,24,32,0.28)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    transition: 'transform 0.3s cubic-bezier(0.22,1,0.36,1), opacity 0.2s ease',
  },
  orbBtnHidden: { transform: 'scale(0.6)', opacity: 0, pointerEvents: 'none' },
  panel: {
    position: 'fixed', right: 18, bottom: 18, top: 18, width: 410, maxWidth: 'calc(100vw - 36px)', zIndex: 290,
    display: 'flex', flexDirection: 'column', borderRadius: 26, background: 'var(--bg-card)', border: '1px solid var(--glass-edge)',
    transformOrigin: 'bottom right', transition: 'transform 0.42s cubic-bezier(0.22,1,0.36,1), opacity 0.22s ease',
  },
  panelNarrow: { left: 8, right: 8, width: 'auto', maxWidth: 'none', top: 'calc(56px + env(safe-area-inset-top, 0px))', bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' },
  panelOpen: { transform: 'none', opacity: 1, pointerEvents: 'auto' },
  panelShut: { transform: 'translateY(18px) scale(0.94)', opacity: 0, pointerEvents: 'none' },
  head: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px 12px 16px', borderBottom: '1px solid var(--border)' },
  title: { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' },
  sub: { fontSize: 12, color: 'var(--text-tertiary)' },
  close: { marginLeft: 'auto', width: 34, height: 34, borderRadius: 17, border: '1px solid var(--border)', background: 'rgba(var(--paper-rgb), 0.4)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  feed: { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, scrollBehavior: 'smooth' },
  me: { alignSelf: 'flex-end', maxWidth: '86%', background: 'color-mix(in srgb, var(--neon) 30%, var(--surface))', color: 'var(--text-primary)', padding: '9px 13px', borderRadius: '16px 16px 4px 16px', fontSize: 14, lineHeight: 1.45 },
  hub: { alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 10 },
  hubText: { fontSize: 14, lineHeight: 1.5, color: 'var(--text-primary)', maxWidth: '94%', minHeight: 20 },
  cards: { display: 'flex', flexDirection: 'column', gap: 7 },
  card: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' },
  cardIcon: { width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--neon) 14%, transparent)', color: 'var(--neon)', flexShrink: 0 },
  cardTitle: { display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardSub: { display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tag: { fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'capitalize' },
  mini: { border: '1px solid var(--border)', background: 'rgba(var(--paper-rgb), 0.5)', color: 'var(--text-secondary)', borderRadius: 999, fontSize: 11.5, fontWeight: 600, padding: '4px 9px', cursor: 'pointer', flexShrink: 0 },
  chev: { color: 'var(--text-quaternary)', fontSize: 16, flexShrink: 0 },
  goBtn: { alignSelf: 'flex-start', border: 'none', background: 'var(--ink)', color: 'var(--ink-text)', borderRadius: 999, padding: '7px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: { border: '1px solid var(--border)', background: 'rgba(var(--paper-rgb), 0.45)', color: 'var(--text-primary)', borderRadius: 999, padding: '7px 11px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
  dots: { display: 'inline-flex', gap: 4, padding: '10px 12px', borderRadius: 14, background: 'rgba(var(--paper-rgb), 0.45)', border: '1px solid var(--border)', alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, background: 'var(--text-tertiary)', animation: 'hubGuideDot 1s infinite' },
  foot: { padding: 12, borderTop: '1px solid var(--border)', position: 'relative' },
  live: { position: 'absolute', left: 12, right: 12, bottom: 'calc(100% - 4px)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, padding: 6, boxShadow: '0 14px 34px rgba(20,24,32,0.16)', display: 'flex', flexDirection: 'column', gap: 2, zIndex: 2 },
  liveHead: { fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 8px 2px' },
  liveRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 10, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' },
  liveRowOn: { background: 'color-mix(in srgb, var(--neon) 14%, transparent)' },
  liveSub: { color: 'var(--text-tertiary)', fontSize: 12, marginLeft: 'auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '45%' },
  inRow: { display: 'flex', gap: 8, alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '5px 5px 5px 14px' },
  input: { flex: 1, minWidth: 0, border: 0, background: 'transparent', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxShadow: 'none', height: 30 },
  send: { width: 34, height: 34, borderRadius: 17, border: 0, background: 'var(--ink)', color: 'var(--ink-text)', fontSize: 16, cursor: 'pointer', flexShrink: 0 },
  hint: { fontSize: 11.5, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 8 },
};
