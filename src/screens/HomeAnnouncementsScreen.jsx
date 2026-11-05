import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { brands } from '../data/mockData';
import { useBrandAnnouncements } from '../context/BrandAnnouncementsContext';
import { useAuth } from '../context/AuthContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { accessLevel } from '../data/accessMatrix';
import PostCard from '../components/PostCard';
import { useDialog } from '../hooks/useDialog';
import PageHeader from '../components/PageHeader';
import { useIsNarrow } from '../hooks/useIsNarrow';
import { plainError } from '../lib/errors';

// New announcement, in three steps: who it is for, what it says, and how long
// it stays at the top of Home. The preview on the right is the card people
// will see, likes and comments included once it is posted.
const PIN = [
  { key: 7, label: '1 week' },
  { key: 14, label: '2 weeks' },
  { key: 'forever', label: 'Until I remove it' },
];

export default function HomeAnnouncementsScreen() {
  const { dialogNode, notify } = useDialog();
  const { addAnnouncement } = useBrandAnnouncements();
  const { user, users, refreshUsers, hasBrandAccess } = useAuth();
  // The people list is loaded on demand; the audience count needs it.
  useEffect(() => {
    if (!(users ?? []).length && refreshUsers) refreshUsers().catch(() => {});
  }, []);
  const { getByBrand } = useCustomLocations();
  const navigate = useNavigate();
  const [scope, setScope] = useState('all'); // home | all | brand | location
  const [title, setTitle] = useState('');
  const [brandId, setBrandId] = useState(brands[0].id);
  const [locationId, setLocationId] = useState(null);
  const [message, setMessage] = useState('');
  const [toHome, setToHome] = useState(true);
  const [pinDays, setPinDays] = useState(7);
  const [posting, setPosting] = useState(false);

  const locationsOf = (bid) => {
    const b = brands.find((x) => x.id === bid);
    return [...(b?.locations ?? []), ...getByBrand(bid).map((l) => ({ id: l.id, name: l.name }))];
  };
  const brand = brands.find((b) => b.id === brandId);
  const location = locationsOf(brandId).find((l) => l.id === locationId) ?? null;

  const homeOnly = scope === 'home';
  const target =
    scope === 'home'
      ? { id: 'all', label: 'Home' }
      : scope === 'all'
      ? { id: 'all', label: 'Everyone' }
      : scope === 'brand'
        ? { id: brandId, label: brand?.name }
        : location
          ? { id: location.id, label: brand?.name + ' · ' + location.name }
          : null;

  // Who will see it - the same test the app uses to show it.
  const audience = useMemo(() => {
    const active = (users ?? []).filter((u) => u.active !== false && !u.isGhost);
    if (!target) return 0;
    return active.filter((u) => {
      if (target.id === 'all' || u.role === 'admin' || u.role === 'executive') return true;
      const theirs = u.permissions?.brandIds ?? [];
      if (!theirs.includes(brandId)) return false;
      if (scope !== 'location') return true;
      const only = u.permissions?.locationsByBrand?.[brandId];
      return !Array.isArray(only) || only.length === 0 || only.includes(target.id);
    }).length;
  }, [users, target?.id, brandId, scope]);

  if (accessLevel(user, 'announcements') !== 'post') {
    return (
      <div style={styles.page}>
        <p style={{ color: 'var(--text-secondary)' }}>Only people who can post announcements.</p>
      </div>
    );
  }

  const handlePost = async () => {
    if (!target || !message.trim()) return;
    setPosting(true);
    try {
      if (homeOnly) {
        await addAnnouncement('all', message.trim(), user?.name ?? 'Unknown', null, pinDays, null, { homeOnly: true, title });
      } else {
        await addAnnouncement(target.id, message.trim(), user?.name ?? 'Unknown', target.label, toHome ? pinDays : null, brandId);
      }
      navigate('/');
    } catch (err) {
      notify('Could not post', plainError(err, 'Your announcement was not posted. Try again.'));
    } finally {
      setPosting(false);
    }
  };

  // One card per line on a phone (15 Oct 2026); three across squeezed the words.
  const isNarrow = useIsNarrow();
  const scopeCard = (key, title, sub) => (
    <button style={{ ...styles.scope, ...(scope === key ? styles.scopeOn : {}) }} onClick={() => setScope(key)}>
      <span style={styles.scopeTitle}>{title}</span>
      <span style={styles.scopeSub}>{sub}</span>
    </button>
  );

  return (
    <div style={styles.page}>
      <PageHeader back={{ to: '/', label: 'Home' }} title="New announcement" subtitle={homeOnly ? 'A note at the top of everyone\'s Home. Nobody is emailed and it isn\'t in the morning summary.' : 'Goes to the restaurant or location you choose and into people\'s morning summary. Turn on "Post to Home" to pin it on their Home too.'} />
      <div style={styles.columns}>
        <div style={{ flex: '1 1 460px', minWidth: 0 }}>

          <p style={styles.step}>1 · Who is it for?</p>
          <div style={isNarrow ? { ...styles.scopes, gridTemplateColumns: '1fr' } : styles.scopes}>
            {scopeCard('home', 'Home only', 'Everyone\'s Home. No email')}
            {scopeCard('all', 'Everyone', 'The whole company')}
            {scopeCard('brand', 'A restaurant', 'Every location of one')}
            {scopeCard('location', 'One location', 'Just that restaurant')}
          </div>
          {scope === 'brand' || scope === 'location' ? (
            <div style={styles.pickers}>
              <select style={styles.select} value={brandId} onChange={(e) => { setBrandId(e.target.value); setLocationId(null); }}>
                {brands.filter((b) => !b.execOnly || hasBrandAccess(user, b.id)).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              {scope === 'location' ? (
                <select style={styles.select} value={locationId ?? ''} onChange={(e) => setLocationId(e.target.value || null)}>
                  <option value="">Choose a location</option>
                  {locationsOf(brandId).map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              ) : null}
            </div>
          ) : null}

          <p style={styles.step}>2 · What do you want to say?</p>
          {homeOnly ? (
            <input
              style={{ ...styles.textarea, minHeight: 0, height: 'auto', marginBottom: 10, fontWeight: 700 }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional), e.g. What's new in the Hub"
            />
          ) : null}
          <textarea
            style={styles.textarea}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your announcement…"
          />

          <p style={styles.step}>{homeOnly ? '3 · How long it stays on Home' : '3 · Where should it show?'}</p>
          {homeOnly ? (
            <div style={{ ...styles.whereCard, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {PIN.map((p) => (
                <button key={p.key} style={{ ...styles.pin, ...(pinDays === p.key ? styles.pinOn : {}) }} onClick={() => setPinDays(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
          ) : (
          <div style={styles.whereCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>Post to Home</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Pinned at the top of Home for the people above</div>
              </div>
              <button
                role="switch"
                aria-checked={toHome}
                onClick={() => setToHome((v) => !v)}
                style={{ ...styles.switch, ...(toHome ? styles.switchOn : {}) }}
              >
                <span style={{ ...styles.knob, ...(toHome ? { left: 19 } : {}) }} />
              </button>
            </div>
            {toHome ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Keep it on Home for</span>
                {PIN.map((p) => (
                  <button key={p.key} style={{ ...styles.pin, ...(pinDays === p.key ? styles.pinOn : {}) }} onClick={() => setPinDays(p.key)}>
                    {p.label}
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '10px 0 0' }}>
                Off: it appears only on {scope === 'all' ? 'every restaurant page' : "the restaurant's page"}, and in people's morning summary.
              </p>
            )}
          </div>
          )}

          <button
            style={{ ...styles.postButton, ...(!target || !message.trim() || posting ? { opacity: 0.4 } : {}) }}
            disabled={!target || !message.trim() || posting}
            onClick={handlePost}
          >
            {posting ? 'Posting…' : homeOnly ? `Post to Home (${audience})` : target ? `Post to ${target.id === 'all' ? 'everyone' : target.label} (${audience})` : 'Choose a location'}
          </button>
        </div>

        <div style={{ flex: '1 1 340px', minWidth: 0 }}>
          {/* Exactly how it will look, in each place it will show, before it is posted. */}
          <p style={{ ...styles.step, marginTop: 64 }}>Here's how it will look</p>
          {toHome || homeOnly ? (
            <>
              <p style={styles.where}>On Home{pinDays === 'forever' ? ' · until you remove it' : ' · for ' + (pinDays === 7 ? '1 week' : '2 weeks')}</p>
              <p style={styles.previewKicker}>{homeOnly ? 'Hub update' : target ? (target.id === 'all' ? 'Everyone' : target.label) : '—'} · pinned to Home</p>
              <div style={styles.previewFrame}>
                <PostCard post={{ id: 'preview', title: homeOnly ? title.trim() || null : null, authorName: user?.name ?? '', authorUid: user?.uid, message: message.trim() || 'Your message appears here.', timestamp: Date.now(), likes: 0, likedByMe: false, comments: [] }} isNewest={false} />
              </div>
            </>
          ) : null}
          {homeOnly ? null : (<>
          <p style={styles.where}>
            {scope === 'all' ? 'On every restaurant page' : scope === 'brand' ? 'On the ' + (brand?.name ?? '') + ' page' : location ? 'On the ' + brand?.name + ' page, for ' + location.name + ' only' : 'On the restaurant page'}
          </p>
          <div style={styles.previewFrame}>
            <PostCard post={{ id: 'preview', authorName: user?.name ?? '', authorUid: user?.uid, message: message.trim() || 'Your message appears here.', timestamp: Date.now(), likes: 0, likedByMe: false, comments: [] }} isNewest />
          </div>
          </>)}
          <p style={styles.previewMeta}>Likes and comments work once it is posted.</p>
        </div>
      </div>
      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '40px max(22px, min(48px, 4vw)) 60px', maxWidth: 1000 },
  columns: { display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 12 },
  step: { fontSize: 17, fontWeight: 700, letterSpacing: -0.2, color: 'var(--text-primary)', margin: '22px 0 10px' },
  scopes: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 },
  scope: { textAlign: 'left', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 },
  scopeOn: { borderColor: 'var(--neon)', background: 'var(--accent-soft)' },
  scopeTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  scopeSub: { fontSize: 12, color: 'var(--text-secondary)' },
  pickers: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  select: { background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit' },
  textarea: { width: '100%', boxSizing: 'border-box', minHeight: 120, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' },
  pin: { background: 'rgba(var(--paper-rgb), 0.6)', border: '1px solid rgba(var(--ink-rgb), 0.1)', color: 'var(--text-secondary)', borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  pinOn: { borderColor: 'var(--neon)', color: 'var(--neon)' },
  postButton: { marginTop: 24, background: 'var(--ink)', color: 'var(--ink-text)', border: 'none', borderRadius: 999, padding: '11px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  whereCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '14px 16px' },
  switch: { position: 'relative', width: 40, height: 23, borderRadius: 12, border: 'none', background: 'var(--border-strong)', cursor: 'pointer', flexShrink: 0 },
  switchOn: { background: 'var(--neon)' },
  knob: { position: 'absolute', top: 3, left: 3, width: 17, height: 17, borderRadius: 9, background: 'var(--surface)', boxShadow: '0 1px 3px rgba(30,40,60,0.3)', transition: 'left .15s' },
  where: { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '14px 0 6px' },
  previewFrame: { pointerEvents: 'none' },
  previewKicker: { fontSize: 12, fontWeight: 700, letterSpacing: 0, textTransform: 'none', color: 'var(--neon)', margin: 0 },
  previewMeta: { fontSize: 12, color: 'var(--text-tertiary)', margin: 0 },
};
