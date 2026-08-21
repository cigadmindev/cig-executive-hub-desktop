import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { brands } from '../data/mockData';
import { brandColors } from '../theme/colors';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useViewTracking } from '../context/ViewTrackingContext';
import { useAccessRequests } from '../context/AccessRequestsContext';
import { useEventRequests } from '../context/EventRequestsContext';
import RequestAccessModal from '../components/RequestAccessModal';
import { nike } from '../theme/nike';

export default function HomeScreen() {
  const { user, hasBrandAccess } = useAuth();
  const navigate = useNavigate();
  const { getByBrand } = useCustomLocations();
  const { hasUnseenForBrand } = useViewTracking();
  const { addRequest, hasPendingRequest } = useAccessRequests();
  const { hasNeedMatchingJob } = useEventRequests();
  const [hoveredId, setHoveredId] = useState(null);
  const [requestTarget, setRequestTarget] = useState(null);

  const handleCardClick = (item, allowed) => {
    if (allowed) {
      navigate(`/brand/${item.id}`);
      return;
    }
    if (!user) return;
    if (hasPendingRequest(user.email, 'brand', item.id)) {
      alert(`Your request for ${item.name} is still waiting on approval.`);
      return;
    }
    setRequestTarget({ id: item.id, label: item.name });
  };

  const submitRequest = async (reason) => {
    await addRequest({
      userEmail: user.email,
      userName: user.name,
      type: 'brand',
      targetId: requestTarget.id,
      targetLabel: requestTarget.label,
      reason,
    });
    setRequestTarget(null);
    alert(`Request sent — an admin will review your request for access to ${requestTarget.label}.`);
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <p style={{ ...styles.eyebrow, color: 'var(--neon)' }}>Overview</p>
        <h1 style={{ ...styles.title, ...nike.pageTitle, fontSize: 32 }}>Welcome back, {user?.name?.split(' ')[0]}</h1>
        <p style={styles.subtitle}>Pick a restaurant to get started.</p>
      </header>

      <div style={styles.grid}>
        {brands.map((item) => {
          const allowed = hasBrandAccess(user, item.id);
          const activeLocations = item.locations.filter((l) => l.status === 'active');
          const customLocations = getByBrand(item.id);
          const color = brandColors[item.name] ?? '#8A8A8A';
          const clickable = true;
          const allLocationIds = [...activeLocations.map((l) => l.id), ...customLocations.map((l) => l.id)];
          const hasUnseen =
            allowed && (hasUnseenForBrand(item.id, allLocationIds) || hasNeedMatchingJob(allLocationIds, user?.job));
          const totalLocations = activeLocations.length + customLocations.length;
          const isHovered = hoveredId === item.id && clickable;
          const pendingRequest = !allowed && user ? hasPendingRequest(user.email, 'brand', item.id) : false;

          return (
            <div key={item.id} style={{ position: 'relative' }}>
              <button
                onClick={() => handleCardClick(item, allowed)}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  ...styles.card,
                  borderColor: allowed ? color : 'var(--border)',
                  opacity: allowed ? 1 : 0.5,
                  cursor: clickable ? 'pointer' : 'default',
                  transform: isHovered ? 'translateY(-2px)' : 'none',
                  boxShadow: isHovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                }}
              >
                <div style={styles.cardBody}>
                  <span style={styles.cardName}>{item.name}</span>
                  <span style={styles.cardMeta}>
                    {!allowed
                      ? pendingRequest
                        ? 'Request pending'
                        : 'Tap to request access'
                      : totalLocations > 0
                      ? `${totalLocations} location${totalLocations > 1 ? 's' : ''}`
                      : 'In Progress'}
                  </span>
                </div>
              </button>
              {hasUnseen ? <span style={styles.unseenDot} /> : null}
            </div>
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
  page: { padding: '36px 44px', maxWidth: 1040 },
  header: { marginBottom: 32 },
  eyebrow: { fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.7, margin: '0 0 6px' },
  title: { fontSize: 26, fontWeight: 700, letterSpacing: -0.4, margin: 0 },
  subtitle: { fontSize: 14, color: 'var(--text-secondary)', marginTop: 6 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 18,
  },
  card: {
    width: '100%',
    background: 'var(--bg-card)',
    border: '2px solid var(--border)',
    borderRadius: 14,
    textAlign: 'left',
    overflow: 'hidden',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  cardBody: { padding: '28px 26px', display: 'flex', flexDirection: 'column', gap: 10 },
  cardName: { fontSize: 19, fontWeight: 900, letterSpacing: -0.2, textTransform: 'uppercase' },
  cardMeta: { fontSize: 13, color: 'var(--text-secondary)' },
  unseenDot: { position: 'absolute', top: 14, right: 14, width: 9, height: 9, borderRadius: 5, background: 'var(--danger)', boxShadow: '0 0 0 3px var(--bg-card)' },
};
