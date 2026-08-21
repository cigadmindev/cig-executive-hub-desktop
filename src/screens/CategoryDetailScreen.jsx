import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { categories, brands } from '../data/mockData';
import { useAnnouncements } from '../context/AnnouncementsContext';
import { useAuth } from '../context/AuthContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useViewTracking } from '../context/ViewTrackingContext';
import { useCategoryDriveLinks } from '../context/CategoryDriveLinksContext';
import PostCard from '../components/PostCard';
import { nike } from '../theme/nike';

export default function CategoryDetailScreen() {
  const { brandId, locationId, categoryId } = useParams();
  const navigate = useNavigate();
  const category = categories.find((c) => c.id === categoryId);
  const brand = brands.find((b) => b.id === brandId);
  const { getByBrand } = useCustomLocations();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { getByCategory, toggleLike, addComment, toggleCommentLike, deletePost, deleteComment } = useAnnouncements();
  const { markCategoryViewed } = useViewTracking();
  const { getLink, setLink } = useCategoryDriveLinks();
  const [connectingItem, setConnectingItem] = useState(null);
  const [linkDraft, setLinkDraft] = useState('');

  useEffect(() => {
    if (locationId && categoryId) markCategoryViewed(locationId, categoryId);
  }, [locationId, categoryId]);

  if (!brand || !category) return null;
  const allLocations = [...brand.locations, ...getByBrand(brand.id).map((l) => ({ id: l.id, name: l.name }))];
  const location = allLocations.find((l) => l.id === locationId);
  if (!location) return null;

  const posts = [...getByCategory(categoryId, locationId)].sort((a, b) => b.timestamp - a.timestamp);

  const handleItemClick = (itemName) => {
    // Permits & Licenses no longer exists as its own screen — it's fully
    // merged into the Opening Checklist's Initial Set-Up POC now, so this
    // item deep-links there instead.
    if (itemName === 'Permits, Licenses & Certifications') {
      navigate(`/brand/${brand.id}/location/${location.id}/opening-checklist`);
      return;
    }
    const link = getLink(locationId, categoryId, itemName);
    if (link) {
      window.open(link, '_blank');
      return;
    }
    if (isAdmin) {
      setConnectingItem(itemName);
      setLinkDraft('');
      setSaveError(null);
      return;
    }
    alert(`"${itemName}" isn't connected to a Drive folder yet — ask an admin to connect it.`);
  };

  const [savingLink, setSavingLink] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const saveLink = async () => {
    if (!linkDraft.trim()) return;
    setSavingLink(true);
    setSaveError(null);
    try {
      await setLink(locationId, categoryId, connectingItem, linkDraft.trim());
      setConnectingItem(null);
      setLinkDraft('');
    } catch (err) {
      setSaveError(err.message || 'Could not save this link.');
    } finally {
      setSavingLink(false);
    }
  };

  return (
    <div style={styles.page}>
      <Link to={`/brand/${brand.id}/location/${location.id}`} style={styles.backLink}>
        ‹ {location.name}
      </Link>
      <div style={styles.header}>
        <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>{category.label}</h1>
        {user?.role === 'admin' || user?.role === 'executive' ? (
          <button
            style={{ ...styles.postButton, ...nike.primaryButton }}
            onClick={() => navigate(`/brand/${brand.id}/location/${location.id}/category/${categoryId}/announcements`)}
          >
            + New Post
          </button>
        ) : null}
      </div>
      <p style={styles.note}>
        {isAdmin
          ? 'Tap an item to open its Drive folder — or connect one if it isn\'t linked yet.'
          : 'Tap an item to open its Drive folder.'}
      </p>

      <div style={styles.itemsList}>
        {category.items.map((item) => {
          if (item === 'Permits, Licenses & Certifications') {
            return (
              <button key={item} style={{ ...styles.row, ...nike.card }} onClick={() => handleItemClick(item)}>
                <span style={styles.itemName}>{item}</span>
                <span style={nike.chevron}>›</span>
              </button>
            );
          }
          const link = getLink(locationId, categoryId, item);
          const isConnecting = connectingItem === item;
          return (
            <div key={item}>
              <button style={{ ...styles.row, ...nike.card }} onClick={() => handleItemClick(item)}>
                <span style={styles.itemName}>{item}</span>
                {link && isAdmin ? (
                  <span style={{ ...styles.connectedBadge, color: 'var(--neon)' }}>✓</span>
                ) : link ? (
                  <span style={nike.chevron}>›</span>
                ) : isAdmin ? (
                  <span style={{ ...styles.connectHint, color: 'var(--neon)' }}>+ Connect</span>
                ) : (
                  <span style={nike.chevron}>›</span>
                )}
              </button>
              {isConnecting ? (
                <>
                  <div style={styles.connectRow}>
                    <input
                      style={styles.connectInput}
                      placeholder="Paste the Google Drive folder link…"
                      value={linkDraft}
                      onChange={(e) => setLinkDraft(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && saveLink()}
                    />
                    <button style={{ ...styles.connectSaveButton, ...nike.primaryButton }} onClick={saveLink} disabled={savingLink}>
                      {savingLink ? 'Saving…' : 'Save'}
                    </button>
                    <button style={styles.connectCancelButton} onClick={() => setConnectingItem(null)}>
                      ✕
                    </button>
                  </div>
                  {saveError ? <p style={styles.connectError}>Couldn't save — {saveError}</p> : null}
                </>
              ) : null}
              {link && isAdmin && !isConnecting ? (
                <button
                  style={styles.editLinkButton}
                  onClick={() => {
                    setConnectingItem(item);
                    setLinkDraft(link);
                    setSaveError(null);
                  }}
                >
                  Edit link
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {posts.length > 0 ? (
        <div style={styles.postsSection}>
          <div style={styles.divider} />
          <h2 style={{ ...styles.postsHeader, ...nike.sectionLabel, fontSize: 12 }}>TEAM POSTS</h2>
          {posts.map((post, index) => (
            <PostCard
              key={post.id}
              post={post}
              isNewest={index === 0}
              onToggleLike={toggleLike}
              onAddComment={addComment}
              onToggleCommentLike={toggleCommentLike}
              onDeletePost={deletePost}
              onDeleteComment={deleteComment}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  page: { padding: '28px 36px', maxWidth: 640 },
  backLink: { fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-block', marginBottom: 14 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  postButton: { padding: '8px 14px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' },
  note: { fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 16px' },
  itemsList: {},
  row: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    textAlign: 'left',
    marginBottom: 6,
  },
  itemName: { fontSize: 13 },
  chevron: { color: 'var(--text-tertiary)', fontSize: 14 },
  connectedBadge: { fontSize: 11, fontWeight: 600, color: 'var(--success)' },
  connectHint: { fontSize: 11, fontWeight: 600, color: 'var(--accent)' },
  connectRow: { display: 'flex', gap: 8, marginBottom: 8, marginTop: 4 },
  connectError: { fontSize: 11, color: 'var(--danger)', marginBottom: 8 },
  connectInput: {
    flex: 1,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-strong)',
    background: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    fontSize: 12,
    outline: 'none',
  },
  connectSaveButton: { padding: '0 14px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' },
  connectCancelButton: { padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12 },
  editLinkButton: { fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8, marginLeft: 4 },
  postsSection: { marginTop: 28 },
  divider: { height: 1, background: 'var(--border)', marginBottom: 18 },
  postsHeader: { fontSize: 15, fontWeight: 800, margin: '0 0 12px', letterSpacing: 0.5 },
};
