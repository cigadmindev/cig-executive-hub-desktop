import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { brands } from '../data/mockData';
import Icon from '../components/Icon';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useAuth } from '../context/AuthContext';
import { useBrandAnnouncements } from '../context/BrandAnnouncementsContext';
import { useViewTracking } from '../context/ViewTrackingContext';
import PostCard from '../components/PostCard';
import { useDialog } from '../hooks/useDialog';
import { nike } from '../theme/nike';
import { SEC_CITIES, SEC_STATE_NAMES } from '../data/secCities';

export default function BrandScreen() {
  const { dialogNode, confirm, notify } = useDialog();
  const { brandId } = useParams();
  const navigate = useNavigate();
  const brand = brands.find((b) => b.id === brandId);
  const { getByBrand, addLocation, deleteLocation } = useCustomLocations();
  const { user } = useAuth();
  const { getByBrand: getPostsByBrand, toggleLike, addComment, toggleCommentLike, deletePost, deleteComment } = useBrandAnnouncements();
  const { markBrandViewed, hasUnseenForLocation } = useViewTracking();

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLat, setNewLat] = useState('');
  const [newLng, setNewLng] = useState('');
  const [pickedState, setPickedState] = useState(null);

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

  const handleAddLocation = async () => {
    if (!newName.trim()) return;
    const lat = parseFloat(newLat);
    const lng = parseFloat(newLng);
    if (newLat.trim() === '' || newLng.trim() === '' || isNaN(lat) || isNaN(lng)) {
      notify('Location needed', "Pick a city above, or enter this location's latitude and longitude manually.");
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      notify('Coordinates out of range', 'Latitude has to be between -90 and 90, longitude between -180 and 180.');
      return;
    }
    try {
      await addLocation(brand.id, newName.trim(), lat, lng);
      closeAddForm();
    } catch (err) {
      notify('Could not add location', err?.message ?? 'Something went wrong saving this location. Please try again.');
    }
  };

  const selectCity = (city) => {
    setNewName(city.name);
    setNewLat(String(city.latitude));
    setNewLng(String(city.longitude));
  };

  const closeAddForm = () => {
    setAddOpen(false);
    setNewName('');
    setNewLat('');
    setNewLng('');
    setPickedState(null);
  };

  const handleDeleteLocation = (loc) => {
    confirm({
      title: `Delete "${loc.name}"?`,
      body: 'Everything under it will be removed. This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: () => deleteLocation(loc.id),
    });
  };

  return (
    <div style={styles.page}>
      <Link to="/" style={styles.backLink}>
        ‹ All Restaurants
      </Link>
      <h1 style={{ ...styles.title, ...nike.pageTitle }}>{brand.name}</h1>

      {user?.role === 'admin' ? (
        addOpen ? (
          <div style={styles.addForm}>
            <p style={styles.pickerLabel}>State</p>
            <div style={styles.chipWrap}>
              {Object.keys(SEC_STATE_NAMES).map((abbr) => (
                <button
                  key={abbr}
                  style={{ ...styles.stateChip, ...(pickedState === abbr ? styles.stateChipActive : {}) }}
                  onClick={() => setPickedState(abbr)}
                >
                  {SEC_STATE_NAMES[abbr]}
                </button>
              ))}
            </div>

            {pickedState ? (
              <>
                <p style={styles.pickerLabel}>City</p>
                <div style={styles.chipWrap}>
                  {SEC_CITIES[pickedState].map((city) => (
                    <button
                      key={city.name}
                      style={{ ...styles.stateChip, ...(newName === city.name ? styles.stateChipActive : {}) }}
                      onClick={() => selectCity(city)}
                    >
                      {city.name}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            <p style={styles.pickerLabel}>Location name</p>
            <input
              style={styles.input}
              placeholder="Location name (e.g. Nashville)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <p style={styles.pickerLabel}>Coordinates — filled in automatically from the city above</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                style={{ ...styles.input, flex: 1 }}
                placeholder="Latitude (e.g. 33.4504)"
                value={newLat}
                onChange={(e) => setNewLat(e.target.value)}
              />
              <input
                style={{ ...styles.input, flex: 1 }}
                placeholder="Longitude (e.g. -88.8184)"
                value={newLng}
                onChange={(e) => setNewLng(e.target.value)}
              />
            </div>
            <p style={styles.modalNote}>
              This location will get the same categories and directory as every other location — items
              stay as "we're on it" until connected on the backend.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={styles.cancelButton} onClick={closeAddForm}>
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
          <h2 style={styles.postsHeader}>TEAM POSTS</h2>
          {posts.map((post, index) => {
            const targetedLocation =
              post.targetId !== brand.id && post.targetId !== 'all'
                ? allLocations.find((l) => l.id === post.targetId)
                : null;
            return (
              <div key={post.id}>
                {targetedLocation ? (
                  <p style={styles.postLocationTag}>
                    <Icon name="pin" size={11} color="var(--text-secondary)" style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Posted to {targetedLocation.name}
                  </p>
                ) : null}
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
      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '32px max(16px, min(40px, 4vw))', maxWidth: 800 },
  backLink: { fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-block', marginBottom: 14 },
  title: { fontSize: 24, fontWeight: 700, margin: '0 0 16px' },
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
  pickerLabel: { fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, margin: '10px 0 6px' },
  chipWrap: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  stateChip: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '7px 12px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  stateChipActive: { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#0A0A0B', fontWeight: 800 },
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
