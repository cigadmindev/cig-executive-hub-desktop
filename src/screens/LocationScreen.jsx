import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { brands, categories } from '../data/mockData';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useRenewals, isRenewalDueSoon } from '../context/RenewalsContext';
import { useAuth } from '../context/AuthContext';
import { useAccessRequests } from '../context/AccessRequestsContext';
import { useViewTracking } from '../context/ViewTrackingContext';
import RequestAccessModal from '../components/RequestAccessModal';
import { nike } from '../theme/nike';
import Icon from '../components/Icon';
import { iconName } from '../utils/iconGlyphs';

// Same directory-card language as mobile's LocationScreen: icon circle,
// title, subtitle, badge, chevron.
const OPERATIONAL_ITEMS = [
  { key: 'event-requests', icon: 'sparkles-outline', title: 'Event / Promo Requests', subtitle: 'Request and track events & promotions', path: 'event-requests' },
  { key: 'renewals', icon: 'document-text-outline', title: 'License & Lease Renewals', subtitle: 'Expiration dates and renewals', path: 'renewals' },
  { key: 'opening-checklist', icon: 'rocket-outline', title: 'Opening Checklist', subtitle: 'Everything needed before opening day', path: 'opening-checklist' },
  { key: 'operational-poc', icon: 'call-outline', title: 'Operational POC', subtitle: 'Points of contact and set-up info', path: 'operational-poc' },
  { key: 'integrations', icon: 'git-network-outline', title: 'Integrations', subtitle: 'Toast, R365, OpenTable & more', path: 'integrations' },
];

export default function LocationScreen() {
  const { brandId, locationId } = useParams();
  const navigate = useNavigate();
  const brand = brands.find((b) => b.id === brandId);
  const { getByBrand } = useCustomLocations();
  const { getByLocation } = useRenewals();
  const { user, hasCategoryAccess } = useAuth();
  const { addRequest, hasPendingRequest } = useAccessRequests();
  const { hasUnseenEventRequests, hasUnseenCategoryPosts } = useViewTracking();
  const [requestTarget, setRequestTarget] = useState(null);

  if (!brand) return null;

  const allLocations = [...brand.locations, ...getByBrand(brand.id).map((l) => ({ id: l.id, name: l.name }))];
  const location = allLocations.find((l) => l.id === locationId);
  if (!location) return null;

  const hasUpcomingRenewal = getByLocation(locationId).some(isRenewalDueSoon);

  const handleCategoryClick = (cat) => {
    const allowed = hasCategoryAccess(user, cat.id);
    if (allowed) {
      navigate(`/brand/${brand.id}/location/${location.id}/category/${cat.id}`);
      return;
    }
    if (!user) return;
    if (hasPendingRequest(user.email, 'category', cat.id)) {
      alert(`Your request for ${cat.label} is still waiting on approval.`);
      return;
    }
    setRequestTarget({ id: cat.id, label: cat.label });
  };

  const submitRequest = async (reason) => {
    await addRequest({
      userEmail: user.email,
      userName: user.name,
      type: 'category',
      targetId: requestTarget.id,
      targetLabel: requestTarget.label,
      reason,
    });
    setRequestTarget(null);
    alert(`Request sent — an admin will review your request for access to ${requestTarget.label}.`);
  };

  return (
    <div style={styles.page}>
      <Link to={`/brand/${brand.id}`} style={styles.backLink}>
        ‹ {brand.name}
      </Link>
      <h1 style={{ ...styles.title, ...nike.pageTitle }}>{location.name}</h1>

      <h3 style={{ ...styles.sectionHeader, ...nike.sectionLabel }}>Operations</h3>
      <div style={styles.grid}>
        {OPERATIONAL_ITEMS.map((item) => {
          const showRenewalBadge = item.key === 'renewals' && hasUpcomingRenewal;
          const showEventBadge = item.key === 'event-requests' && hasUnseenEventRequests(locationId);
          const showBadge = showRenewalBadge || showEventBadge;
          return (
            <button
              key={item.key}
              style={{ ...styles.card, ...nike.card }}
              onClick={() => navigate(`/brand/${brand.id}/location/${location.id}/${item.path}`)}
            >
              <div style={styles.iconCircle}>
                <Icon name={iconName(item.icon)} color="var(--neon)" />
              </div>
              <div style={styles.textCol}>
                <span style={nike.cardName}>{item.title}</span>
                <span style={styles.cardSubtitle}>{item.subtitle}</span>
              </div>
              <div style={styles.trailingCol}>
                {showBadge ? <span style={nike.dot} /> : null}
                <span style={nike.chevron}>›</span>
              </div>
            </button>
          );
        })}
      </div>

      <h3 style={{ ...styles.sectionHeader, ...nike.sectionLabel }}>File Directories</h3>
      <div style={styles.grid}>
        {categories.map((cat) => {
          const allowed = hasCategoryAccess(user, cat.id);
          const pending = user ? hasPendingRequest(user.email, 'category', cat.id) : false;
          const showBadge = allowed && hasUnseenCategoryPosts(locationId, cat.id);
          return (
            <button
              key={cat.id}
              style={{ ...styles.card, ...nike.card, opacity: allowed ? 1 : 0.6 }}
              onClick={() => handleCategoryClick(cat)}
            >
              <div style={styles.iconCircle}>
                <Icon name={iconName(allowed ? cat.icon : 'lock-closed-outline')} color={allowed ? 'var(--neon)' : 'var(--text-tertiary)'} />
              </div>
              <div style={styles.textCol}>
                <span style={nike.cardName}>{cat.label}</span>
                {!allowed ? (
                  <span style={styles.cardSubtitle}>{pending ? 'Request pending' : 'Tap to request access'}</span>
                ) : null}
              </div>
              <div style={styles.trailingCol}>
                {showBadge ? <span style={nike.dot} /> : null}
                <span style={nike.chevron}>{allowed ? '›' : pending ? 'Pending' : 'Request'}</span>
              </div>
            </button>
          );
        })}
      </div>

      {requestTarget ? (
        <RequestAccessModal target={requestTarget} onSubmit={submitRequest} onClose={() => setRequestTarget(null)} />
      ) : null}
    </div>
  );
}

const styles = {
  page: { padding: '32px 40px', maxWidth: 760 },
  backLink: { fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-block', marginBottom: 20 },
  title: { margin: '4px 0 32px' },
  sectionHeader: { margin: '32px 0 12px' },
  grid: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    textAlign: 'left',
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    background: 'rgba(34,211,238,0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textCol: { display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 },
  cardSubtitle: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, fontWeight: 400, textTransform: 'none', letterSpacing: 0 },
  trailingCol: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
};
