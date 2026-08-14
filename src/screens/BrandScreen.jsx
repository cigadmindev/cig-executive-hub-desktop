import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { brands } from '../data/mockData';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useAuth } from '../context/AuthContext';
import { useBrandAnnouncements } from '../context/BrandAnnouncementsContext';
import { useViewTracking } from '../context/ViewTrackingContext';
import PostCard from '../components/PostCard';
import { nike } from '../theme/nike';

export default function BrandScreen() {
  const { brandId } = useParams();
  const navigate = useNavigate();
  const brand = brands.find((b) => b.id === brandId);
  const { getByBrand, addLocation, deleteLocation } = useCustomLocations();
  const { user } = useAuth();
  const { getByBrand: getPostsByBrand, toggleLike, addComment, toggleCommentLike, deletePost, deleteComment } = useBrandAnnouncements();
  const { markBrandViewed, hasUnseenForLocation, hasUnseenCalendar } = useViewTracking();

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (brandId) markBrandViewed(brandId);
  }, [brandId]);

  if (!brand) return null;

  const customLocations = getByBrand(brand.id);
  const allLocations = [
    ...brand.locations.map((l) => ({ ...l, isCustom: false })),
    ...customLocations.map((l) => ({ id: l.id, name: l.name, isCustom: true })),
  ];
  const posts = [...getPostsByBrand(brand.id, allLocations.map((l) => l.id))].sort((a, b) => b.timestamp - a.timestamp);
  const hasUnseenForBrandCalendar = hasUnseenCalendar(brand.id, allLocations.map((l) => l.id));

  const handleAddLocation = async () => {
    if (!newName.trim()) return;
    await addLocation(brand.id, newName.trim());
    setNewName('');
    setAddOpen(false);
  };

  const handleDeleteLocation = (loc) => {
    if (window.confirm(`Delete "${loc.name}"? Everything under it will be removed. This cannot be undone.`)) {
      deleteLocation(loc.id);
    }
  };

  return (
    <div style={styles.page}>
      <Link to="/" style={styles.backLink}>
        ‹ All Restaurants
      </Link>
      <h1 style={{ ...styles.title, ...nike.pageTitle }}>{brand.name}</h1>

      <div style={{ position: 'relative' }}>
        <button style={{ ...styles.calendarButton, ...nike.secondaryButton }} onClick={() => navigate(`/brand/${brand.id}/calendar`)}>
          📅 Calendar
        </button>
        {hasUnseenForBrandCalendar ? <span style={styles.unseenDot} /> : null}
      </div>

      {user?.role === 'admin' ? (
        addOpen ? (
          <div style={styles.addForm}>
            <input
              style={styles.input}
              placeholder="Location name (e.g. Nashville)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <p style={styles.modalNote}>
              This location will get the same categories and directory as every other location — items
              stay as "we're on it" until connected on the backend.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={styles.cancelButton} onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button style={{ ...styles.saveButton, ...nike.primaryButton }} onClick={handleAddLocation}>
                Add Location
              </button>
            </div>
          </div>
        ) : (
          <button style={{ ...styles.addButton, ...nike.secondaryButton }} onClick={() => setAddOpen(true)}>
            + Add Location
          </button>
        )
      ) : null}

      {allLocations.length === 0 ? (
        <p style={styles.hint}>No locations yet. Check back once this brand launches.</p>
      ) : (
        <div style={styles.grid}>
          {allLocations.map((loc) => (
            <div key={loc.id} style={styles.cardWrap}>
              <button style={{ ...styles.card, ...nike.card }} onClick={() => navigate(`/brand/${brand.id}/location/${loc.id}`)}>
                <span style={nike.cardName}>{loc.name}</span>
                <span style={nike.chevron}>›</span>
              </button>
              {hasUnseenForLocation(loc.id) ? <span style={styles.unseenDot} /> : null}
              {loc.isCustom && user?.role === 'admin' ? (
                <button style={styles.deleteLink} onClick={() => handleDeleteLocation(loc)} title="Delete location">
                  ✕
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {posts.length > 0 ? (
        <div style={styles.postsSection}>
          <div style={styles.divider} />
          <h2 style={styles.postsHeader}>📌 TEAM POSTS</h2>
          {posts.map((post, index) => {
            const targetedLocation =
              post.targetId !== brand.id && post.targetId !== 'all'
                ? allLocations.find((l) => l.id === post.targetId)
                : null;
            return (
              <div key={post.id}>
                {targetedLocation ? <p style={styles.postLocationTag}>📍 Posted to {targetedLocation.name}</p> : null}
                <PostCard
                  post={post}
                  isNewest={index === 0}
                  onToggleLike={toggleLike}
                  onAddComment={addComment}
                  onToggleCommentLike={toggleCommentLike}
                  onDeletePost={deletePost}
                  onDeleteComment={deleteComment}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  page: { padding: '32px 40px', maxWidth: 800 },
  backLink: { fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-block', marginBottom: 14 },
  title: { fontSize: 24, fontWeight: 700, margin: '0 0 16px' },
  calendarButton: {
    display: 'block',
    width: '100%',
    padding: '12px 0',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid var(--border)',
    color: 'var(--accent)',
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 10,
  },
  addButton: {
    width: '100%',
    padding: '12px 0',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontWeight: 600,
    fontSize: 13,
    marginBottom: 16,
  },
  addForm: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 },
  input: {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  },
  modalNote: { fontSize: 11, color: 'var(--text-secondary)', margin: '8px 0', lineHeight: 1.5 },
  cancelButton: { flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12 },
  saveButton: { flex: 1, padding: '9px 0', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' },
  hint: { color: 'var(--text-secondary)', fontSize: 13 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 },
  cardWrap: { position: 'relative' },
  unseenDot: { position: 'absolute', top: 10, left: 10, width: 10, height: 10, borderRadius: 5, background: 'var(--danger)' },
  card: {
    width: '100%',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '18px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    textAlign: 'left',
  },
  cardName: { fontSize: 15, fontWeight: 600 },
  chevron: { color: 'var(--text-secondary)', fontSize: 18 },
  deleteLink: { position: 'absolute', top: 10, right: 10, fontSize: 12, color: 'var(--danger)', background: 'var(--bg-window)', borderRadius: 4, padding: '2px 6px' },
  postsSection: { marginTop: 32 },
  divider: { height: 1, background: 'var(--border)', marginBottom: 20 },
  postsHeader: { fontSize: 12, fontWeight: 900, color: 'var(--neon)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 14px' },
  postLocationTag: { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 4px' },
};
