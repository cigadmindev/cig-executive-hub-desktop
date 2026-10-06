import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { brands } from '../data/mockData';
import { useBrandAnnouncements } from '../context/BrandAnnouncementsContext';
import { useAuth } from '../context/AuthContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { nike } from '../theme/nike';
import { accessLevel } from '../data/accessMatrix';
import { useDialog } from '../hooks/useDialog';

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
  const { user, users, refreshUsers } = useAuth();
  // The people list is loaded on demand; the audience count needs it.
  useEffect(() => {
    if (!(users ?? []).length && refreshUsers) refreshUsers().catch(() => {});
  }, []);
  const { getByBrand } = useCustomLocations();
  const navigate = useNavigate();
  const [scope, setScope] = useState('all'); // all | brand | location
  const [brandId, setBrandId] = useState(brands[0].id);
  const [locationId, setLocationId] = useState(null);
  const [message, setMessage] = useState('');
  const [pinDays, setPinDays] = useState(7);
  const [posting, setPosting] = useState(false);

  const locationsOf = (bid) => {
    const b = brands.find((x) => x.id === bid);
    return [...(b?.locations ?? []), ...getByBrand(bid).map((l) => ({ id: l.id, name: l.name }))];
  };
  const brand = brands.find((b) => b.id === brandId);
  const location = locationsOf(brandId).find((l) => l.id === locationId) ?? null;

  const target =
    scope === 'all'
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
      await addAnnouncement(target.id, message.trim(), user?.name ?? 'Unknown', target.label, pinDays, brandId);
      navigate('/');
    } catch (err) {
      notify('Could not post', err?.message ?? 'Your announcement was not posted. Try again.');
    } finally {
      setPosting(false);
    }
  };

  const scopeCard = (key, title, sub) => (
    <button style={{ ...styles.scope, ...(scope === key ? styles.scopeOn : {}) }} onClick={() => setScope(key)}>
      <span style={styles.scopeTitle}>{title}</span>
      <span style={styles.scopeSub}>{sub}</span>
    </button>
  );

  return (
    <div style={styles.page}>
      <Link to="/" style={styles.backLink}>‹ Home</Link>
      <div style={styles.columns}>
        <div style={{ flex: '1 1 460px', minWidth: 0 }}>
          <h1 style={{ ...styles.title, ...nike.pageTitleSm, fontSize: 26 }}>New announcement</h1>
          <p style={styles.subtitle}>
            Posts to the top of Home for everyone you choose, and goes in their morning summary. People can like and
            comment on it.
          </p>

          <p style={styles.step}>1 · Who is it for?</p>
          <div style={styles.scopes}>
            {scopeCard('all', 'Everyone', 'The whole company')}
            {scopeCard('brand', 'A restaurant', 'Every location of one')}
            {scopeCard('location', 'One location', 'Just that restaurant')}
          </div>
          {scope !== 'all' ? (
            <div style={styles.pickers}>
              <select style={styles.select} value={brandId} onChange={(e) => { setBrandId(e.target.value); setLocationId(null); }}>
                {brands.map((b) => (
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
          <textarea
            style={styles.textarea}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your announcement…"
          />

          <p style={styles.step}>3 · Keep it at the top of Home for</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PIN.map((p) => (
              <button key={p.key} style={{ ...styles.pin, ...(pinDays === p.key ? styles.pinOn : {}) }} onClick={() => setPinDays(p.key)}>
                {p.label}
              </button>
            ))}
          </div>

          <button
            style={{ ...styles.postButton, ...(!target || !message.trim() || posting ? { opacity: 0.4 } : {}) }}
            disabled={!target || !message.trim() || posting}
            onClick={handlePost}
          >
            {posting ? 'Posting…' : target ? `Post to ${target.id === 'all' ? 'everyone' : target.label} (${audience})` : 'Choose a location'}
          </button>
        </div>

        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <p style={{ ...styles.step, marginTop: 64 }}>How it will look on Home</p>
          <div style={styles.preview}>
            <p style={styles.previewKicker}>Announcement · {target ? target.label : '—'}</p>
            <p style={styles.previewText}>{message.trim() || 'Your message appears here.'}</p>
            <p style={styles.previewMeta}>{user?.name ?? ''} · just now · Like · Comment</p>
          </div>
        </div>
      </div>
      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '24px 28px 60px', maxWidth: 1000 },
  backLink: { color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13 },
  columns: { display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 12 },
  title: { margin: '0 0 6px', color: 'var(--text-primary)' },
  subtitle: { fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 22px' },
  step: { fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', margin: '20px 0 8px' },
  scopes: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  scope: { textAlign: 'left', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 },
  scopeOn: { borderColor: 'var(--neon)', background: 'var(--accent-soft)' },
  scopeTitle: { fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' },
  scopeSub: { fontSize: 12, color: 'var(--text-secondary)' },
  pickers: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  select: { background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit' },
  textarea: { width: '100%', boxSizing: 'border-box', minHeight: 120, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' },
  pin: { background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  pinOn: { borderColor: 'var(--neon)', color: 'var(--neon)' },
  postButton: { marginTop: 24, background: 'var(--neon)', color: '#0A0A0B', border: 'none', borderRadius: 8, padding: '11px 20px', fontWeight: 800, fontSize: 14, cursor: 'pointer' },
  preview: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: '3px solid var(--neon)', borderRadius: 12, padding: 18 },
  previewKicker: { fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--neon)', margin: 0 },
  previewText: { fontSize: 15, lineHeight: 1.5, color: 'var(--text-primary)', margin: '8px 0', whiteSpace: 'pre-wrap' },
  previewMeta: { fontSize: 12, color: 'var(--text-tertiary)', margin: 0 },
};
