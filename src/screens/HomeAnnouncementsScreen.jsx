import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { brands } from '../data/mockData';
import { useBrandAnnouncements } from '../context/BrandAnnouncementsContext';
import { useAuth } from '../context/AuthContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { nike } from '../theme/nike';

export default function HomeAnnouncementsScreen() {
  const { addAnnouncement } = useBrandAnnouncements();
  const { user } = useAuth();
  const { getByBrand } = useCustomLocations();
  const navigate = useNavigate();
  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const [selectedLabel, setSelectedLabel] = useState(null);
  const [expandedBrandId, setExpandedBrandId] = useState(null);
  const [message, setMessage] = useState('');

  if (user?.role !== 'admin' && user?.role !== 'executive') {
    return (
      <div style={styles.page}>
        <p style={{ color: 'var(--text-secondary)' }}>Admins and executives only.</p>
      </div>
    );
  }

  const pickAll = () => {
    setSelectedTargetId('all');
    setSelectedLabel('Everywhere');
    setExpandedBrandId(null);
  };

  const toggleBrand = (brand) => {
    setExpandedBrandId((prev) => (prev === brand.id ? null : brand.id));
  };

  const pickBrand = (brand) => {
    setSelectedTargetId(brand.id);
    setSelectedLabel(brand.name);
  };

  const pickLocation = (brand, loc) => {
    setSelectedTargetId(loc.id);
    setSelectedLabel(`${brand.name} — ${loc.name}`);
  };

  const handlePost = async () => {
    if (!selectedTargetId || !message.trim()) return;
    await addAnnouncement(selectedTargetId, message.trim(), user?.name ?? 'Unknown');
    navigate('/');
  };

  return (
    <div style={styles.page}>
      <Link to="/" style={styles.backLink}>
        ‹ Home
      </Link>
      <h1 style={{ ...styles.title, ...nike.pageTitleSm, fontSize: 24 }}>New Announcement</h1>

      <label style={styles.label}>Post to</label>

      <button style={{ ...styles.allButton, ...(selectedTargetId === 'all' ? styles.allButtonActive : {}) }} onClick={pickAll}>
        Everywhere
      </button>

      <div style={styles.brandList}>
        {brands.map((brand) => {
          const locations = [...brand.locations, ...getByBrand(brand.id).map((l) => ({ id: l.id, name: l.name }))];
          const expanded = expandedBrandId === brand.id;
          const brandSelected = selectedTargetId === brand.id;
          return (
            <div key={brand.id} style={styles.brandGroup}>
              <div style={styles.brandRow}>
                <button
                  style={{ ...styles.brandButton, ...(brandSelected ? styles.brandButtonActive : {}) }}
                  onClick={() => pickBrand(brand)}
                >
                  {brand.name}
                </button>
                {locations.length > 0 ? (
                  <button style={styles.expandButton} onClick={() => toggleBrand(brand)}>
                    {expanded ? 'Hide locations ▲' : 'Choose a location ▼'}
                  </button>
                ) : null}
              </div>

              {expanded ? (
                <div style={styles.locationRow}>
                  {locations.map((loc) => (
                    <button
                      key={loc.id}
                      style={{ ...styles.locationChip, ...(selectedTargetId === loc.id ? styles.locationChipActive : {}) }}
                      onClick={() => pickLocation(brand, loc)}
                    >
                      {loc.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <label style={styles.label}>Announcement</label>
      <textarea
        style={styles.textarea}
        placeholder="Type your announcement…"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      <button style={styles.postButton} disabled={!selectedTargetId || !message.trim()} onClick={handlePost}>
        {selectedLabel ? `Post to ${selectedLabel}` : 'Select where to post first'}
      </button>

      <p style={styles.note}>
        Posting to a specific location shows it on that location's restaurant page. Posting to a whole
        restaurant shows it there regardless of location. "Everywhere" shows it on every restaurant's
        page.
      </p>
    </div>
  );
}

const styles = {
  page: { padding: '28px 36px', maxWidth: 560 },
  backLink: { fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-block', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: 700, margin: '0 0 20px', letterSpacing: -0.2 },
  label: { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, marginTop: 16 },
  allButton: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 12,
    border: 'none',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontWeight: 700,
    textAlign: 'left',
    marginBottom: 10,
  },
  allButtonActive: { background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900 },
  brandList: { display: 'flex', flexDirection: 'column', gap: 6 },
  brandGroup: { background: 'var(--bg-card)', border: 'none', borderRadius: 12, padding: 8 },
  brandRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  brandButton: {
    flex: 1,
    padding: '7px 10px',
    borderRadius: 10,
    border: 'none',
    background: 'none',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontWeight: 700,
    textAlign: 'left',
  },
  brandButtonActive: { background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900 },
  expandButton: { fontSize: 11, color: 'var(--text-secondary)', padding: '4px 8px', border: 'none' },
  locationRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, paddingLeft: 6 },
  locationChip: {
    padding: '5px 12px',
    borderRadius: 16,
    border: 'none',
    background: 'var(--bg-inset)',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 600,
  },
  locationChipActive: { background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900 },
  textarea: {
    width: '100%',
    minHeight: 100,
    padding: 14,
    borderRadius: 14,
    border: 'none',
    background: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  postButton: { width: '100%', padding: '12px 0', borderRadius: 12, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 14, marginTop: 16, textTransform: 'uppercase' },
  note: { marginTop: 14, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 },
};
