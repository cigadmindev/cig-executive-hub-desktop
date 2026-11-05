import { atLeast } from '../data/accessMatrix';
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { categories, brands } from '../data/mockData';
import { useAnnouncements } from '../context/AnnouncementsContext';
import { useAuth } from '../context/AuthContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useViewTracking } from '../context/ViewTrackingContext';
import { useCategoryDriveLinks } from '../context/CategoryDriveLinksContext';
import { useDialog } from '../hooks/useDialog';
import PostCard from '../components/PostCard';
import EmployeeFilesPanel from '../components/EmployeeFilesPanel';
import { nike } from '../theme/nike';
import PageHeader from '../components/PageHeader';
import { plainError } from '../lib/errors';

export default function CategoryDetailScreen() {
  const { dialogNode, notify } = useDialog();
  const { brandId, locationId, categoryId } = useParams();
  const navigate = useNavigate();
  const category = categories.find((c) => c.id === categoryId);
  const brand = brands.find((b) => b.id === brandId);
  const { getByBrand } = useCustomLocations();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { getByCategory, toggleLike, addComment, toggleCommentLike, deletePost, deleteComment } = useAnnouncements();
  const { markCategoryViewed } = useViewTracking();
  const { getLink, setLink } = useCategoryDriveLinks(brandId, locationId, categoryId);
  const [connectingItem, setConnectingItem] = useState(null);
  const [linkDraft, setLinkDraft] = useState('');
  // Above the early returns: a hook after one crashes the page when a new
  // location's list arrives a moment late (14 Oct 2026).
  const [savingLink, setSavingLink] = useState(false);
  const [saveError, setSaveError] = useState(null);

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
    notify('Not connected yet', `"${itemName}" isn't linked to a Drive folder — ask an admin to connect it.`);
  };

  const saveLink = async () => {
    if (!linkDraft.trim()) return;
    setSavingLink(true);
    setSaveError(null);
    try {
      await setLink(locationId, categoryId, connectingItem, linkDraft.trim());
      setConnectingItem(null);
      setLinkDraft('');
    } catch (err) {
      setSaveError(plainError(err, 'Could not save this link.'));
    } finally {
      setSavingLink(false);
    }
  };

  return (
    <div style={styles.page}>
      <PageHeader
        back={{ to: `/brand/${brand.id}/location/${location.id}`, label: location.name }}
        title={category.label}
        subtitle={isAdmin ? 'Tap an item to open its Drive folder, or connect one if it isn\'t linked yet.' : 'Tap an item to open its Drive folder.'}
        actionLabel={atLeast(user, 'announcements', 'post') ? '+ New post' : null}
        onAction={() => navigate(`/brand/${brand.id}/location/${location.id}/category/${categoryId}/announcements`)}
      />

      <div style={styles.itemsList}>
        {category.items.map((item, idx) => {
          const first = idx === 0 ? { borderTop: 'none' } : {};
          if (item === 'Permits, Licenses & Certifications') {
            return (
              <div key={item} style={{ ...styles.rowWrap, ...first }}>
                <button data-row="" data-inset="flush" style={{ ...styles.row, borderTop: 'none' }} onClick={() => handleItemClick(item)}>
                  <span style={styles.itemName}>{item}</span>
                  <span style={nike.chevron}>›</span>
                </button>
              </div>
            );
          }
          const link = getLink(locationId, categoryId, item);
          const isConnecting = connectingItem === item;
          return (
            <div key={item} style={{ ...styles.rowWrap, ...first }}>
              {/* One glass list, one line per folder (Glass, Nov 2026). The
                  admin's Edit sits inside the line instead of under it. */}
              <div data-row="" data-inset="flush" style={styles.rowLine}>
              <button data-row-part="" style={{ ...styles.row, borderTop: 'none' }} onClick={() => handleItemClick(item)}>
                <span style={styles.itemName}>{item}</span>
                {link && isAdmin ? (
                  <span style={styles.connectedBadge}>Linked</span>
                ) : link ? (
                  <span style={nike.chevron}>›</span>
                ) : isAdmin ? (
                  <span style={{ ...styles.connectHint, color: 'var(--neon)' }}>+ Connect</span>
                ) : (
                  <span style={nike.chevron}>›</span>
                )}
              </button>
              {link && isAdmin && !isConnecting ? (
                <button
                  style={styles.editLinkButton}
                  onClick={() => {
                    setConnectingItem(item);
                    setLinkDraft(link);
                    setSaveError(null);
                  }}
                >
                  Edit
                </button>
              ) : null}
              </div>
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
                    <button style={styles.connectCancelButton} onClick={() => setConnectingItem(null)}>
                      ✕
                    </button>
                    <button style={{ ...styles.connectSaveButton, ...nike.primaryButton }} onClick={saveLink} disabled={savingLink}>
                      {savingLink ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  {saveError ? <p style={styles.connectError}>Couldn't save — {saveError}</p> : null}
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Archive a leaver's folder once their offboarding docs are marked (22 Oct 2026). */}
      {categoryId === 'staffing' ? <EmployeeFilesPanel locationId={locationId} locationName={location.name} notify={notify} /> : null}

      {posts.length > 0 ? (
        <div style={styles.postsSection}>
          <div style={styles.divider} />
          <h2 style={styles.postsHeader}>Team posts</h2>
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
      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '40px max(22px, min(48px, 4vw))', maxWidth: 760 },
  itemsList: { background: 'var(--bg-card)', border: '1px solid var(--glass-edge)', borderRadius: 24, padding: '8px 12px', overflow: 'hidden' },
  rowWrap: { borderTop: '1px solid var(--border)' },
  rowLine: { display: 'flex', alignItems: 'center' },
  row: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    textAlign: 'left',
    background: 'none',
    border: 'none',
    borderTop: '1px solid var(--border)',
    borderRadius: 0,
    padding: '15px 14px',
    minHeight: 54,
    cursor: 'pointer',
    fontFamily: 'inherit',
    color: 'var(--text-primary)',
    width: '100%',
  },
  itemName: { fontSize: 15.5, fontWeight: 600 },
  connectedBadge: { fontSize: 13, fontWeight: 600, color: 'var(--success)' },
  connectHint: { fontSize: 13.5, fontWeight: 600, color: 'var(--neon)' },
  connectRow: { display: 'flex', gap: 8, padding: '0 14px 14px' },
  connectError: { fontSize: 12.5, color: 'var(--danger)', padding: '0 14px 12px', margin: 0 },
  connectInput: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid var(--border-strong)',
    background: 'rgba(var(--paper-rgb), 0.8)',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
  },
  connectSaveButton: { padding: '0 18px', borderRadius: 999, fontWeight: 600, fontSize: 14, textTransform: 'none', minHeight: 40 },
  connectCancelButton: { minHeight: 40, padding: '0 14px', borderRadius: 999, border: '1px solid rgba(var(--ink-rgb), 0.1)', background: 'rgba(var(--paper-rgb), 0.6)', color: 'var(--text-secondary)', fontSize: 13 },
  editLinkButton: { flexShrink: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', background: 'rgba(var(--ink-rgb), 0.05)', border: 'none', borderRadius: 999, padding: '6px 12px', marginRight: 10, cursor: 'pointer', fontFamily: 'inherit' },
  postsSection: { marginTop: 28 },
  divider: { height: 1, background: 'var(--border)', marginBottom: 18 },
  postsHeader: { fontSize: 22, fontWeight: 700, margin: '0 0 12px', letterSpacing: -0.4 },
};
