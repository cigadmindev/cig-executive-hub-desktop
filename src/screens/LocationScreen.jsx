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

  const operationalTiles = [
    { key: 'event-requests', label: '🎉 Event / Promo Requests', path: 'event-requests', badge: hasUnseenEventRequests(locationId) },
    { key: 'renewals', label: '📄 License & Lease Renewals', path: 'renewals', badge: hasUpcomingRenewal },
    { key: 'opening-checklist', label: '🚀 Opening Checklist', path: 'opening-checklist' },
    { key: 'operational-poc', label: '🧾 Operational POC', path: 'operational-poc' },
    { key: 'integrations', label: '🔌 Integrations', path: 'integrations' },
  ];

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
        {operationalTiles.map((tile) => (
          <button
            key={tile.key}
            style={{ ...styles.card, ...nike.card }}
            onClick={() => navigate(`/brand/${brand.id}/location/${location.id}/${tile.path}`)}
          >
            <span style={nike.cardName}>{tile.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {tile.badge ? <span style={nike.dot} /> : null}
              <span style={nike.chevron}>›</span>
            </div>
          </button>
        ))}
      </div>

      <h3 style={{ ...styles.sectionHeader, ...nike.sectionLabel }}>Categories</h3>
      <div style={styles.grid}>
        {categories.map((cat) => {
          const allowed = hasCategoryAccess(user, cat.id);
          const pending = user ? hasPendingRequest(user.email, 'category', cat.id) : false;
          const showBadge = allowed && hasUnseenCategoryPosts(locationId, cat.id);
          return (
            <button
              key={cat.id}
              style={{ ...styles.card, ...nike.card, opacity: allowed ? 1 : 0.55 }}
              onClick={() => handleCategoryClick(cat)}
            >
              <span style={nike.cardName}>{allowed ? cat.label : `🔒 ${cat.label}`}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 },
  card: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    textAlign: 'left',
  },
};
