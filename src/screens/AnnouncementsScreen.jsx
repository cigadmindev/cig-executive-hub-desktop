import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { categories, brands } from '../data/mockData';
import { useAnnouncements } from '../context/AnnouncementsContext';
import { useAuth } from '../context/AuthContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { nike } from '../theme/nike';

export default function AnnouncementsScreen() {
  const { brandId, locationId, categoryId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addAnnouncement } = useAnnouncements();
  const category = categories.find((c) => c.id === categoryId);
  const brand = brands.find((b) => b.id === brandId);
  const { getByBrand } = useCustomLocations();
  const [message, setMessage] = useState('');

  if (user?.role !== 'admin' && user?.role !== 'executive') {
    return (
      <div style={styles.page}>
        <p style={{ color: 'var(--text-secondary)' }}>Admins and executives only.</p>
      </div>
    );
  }
  if (!brand || !category) return null;
  const allLocations = [...brand.locations, ...getByBrand(brand.id).map((l) => ({ id: l.id, name: l.name }))];
  const location = allLocations.find((l) => l.id === locationId);
  if (!location) return null;

  const backPath = `/brand/${brand.id}/location/${location.id}/category/${categoryId}`;

  const handlePost = async () => {
    if (!message.trim()) return;
    await addAnnouncement(categoryId, locationId, message.trim(), user.name);
    navigate(backPath);
  };

  return (
    <div style={styles.page}>
      <Link to={backPath} style={styles.backLink}>
        ‹ {category.label}
      </Link>
      <h1 style={{ ...styles.title, ...nike.pageTitleSm, fontSize: 24 }}>New Post — {category.label}</h1>
      <p style={styles.note}>Posting for: {location.name}</p>

      <textarea
        style={styles.textarea}
        placeholder="What's going on?"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        autoFocus
      />

      <p style={styles.note}>
        Your post will appear at the top of this category's page with your name and the time posted.
        The team can like it and reply in a comment thread.
      </p>

      <div style={{ display: 'flex', gap: 10 }}>
        <button style={styles.cancelButton} onClick={() => navigate(backPath)}>
          Cancel
        </button>
        <button style={styles.postButton} onClick={handlePost}>
          Post
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: '28px max(16px, min(36px, 4vw))', maxWidth: 560 },
  backLink: { fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-block', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: 700, margin: '0 0 4px' },
  note: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px' },
  textarea: {
    width: '100%',
    minHeight: 120,
    padding: 14,
    borderRadius: 14,
    border: 'none',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 12,
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  cancelButton: { flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: 'var(--bg-inset)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700 },
  postButton: { flex: 1, padding: '10px 0', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },
};
