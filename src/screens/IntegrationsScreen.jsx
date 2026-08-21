import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { brands } from '../data/mockData';
import Icon from '../components/Icon';
import { useCustomLocations } from '../context/CustomLocationsContext';

const INTEGRATIONS = [
  { key: 'toast', label: 'Toast POS', blurb: 'Sales, labor, and shift data pulled in from Toast.' },
  { key: 'r365', label: 'Restaurant365', blurb: 'Financial and inventory data pulled in from R365.' },
  { key: 'opentable', label: 'OpenTable', blurb: 'Reservation and covers data pulled in from OpenTable.' },
];

export default function IntegrationsScreen() {
  const { brandId, locationId } = useParams();
  const brand = brands.find((b) => b.id === brandId);
  const { getByBrand } = useCustomLocations();

  if (!brand) return null;
  const allLocations = [...brand.locations, ...getByBrand(brand.id).map((l) => ({ id: l.id, name: l.name }))];
  const location = allLocations.find((l) => l.id === locationId);
  if (!location) return null;

  return (
    <div style={styles.page}>
      <Link to={`/brand/${brand.id}/location/${location.id}`} style={styles.backLink}>
        ‹ {location.name}
      </Link>
      <h1 style={{ ...styles.title, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="plug" size={22} color="#FFFFFF" />
        Integrations
      </h1>
      <p style={styles.subtitle}>Connections specific to this location — set these up whenever you're ready.</p>

      <div style={styles.grid}>
        {INTEGRATIONS.map((i) => (
          <div key={i.key} style={styles.card}>
            <h2 style={styles.cardTitle}>{i.label}</h2>
            <p style={styles.cardBlurb}>{i.blurb}</p>
            <button style={styles.connectButton} disabled>
              Coming Soon
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  page: { padding: '28px 36px', maxWidth: 760 },
  backLink: { fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-block', marginBottom: 14 },
  title: { fontSize: 22, fontWeight: 700, margin: '0 0 6px' },
  subtitle: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 22px', lineHeight: 1.5 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 },
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 20,
    textAlign: 'center',
  },
  cardIcon: { fontSize: 28, margin: '0 0 8px' },
  cardTitle: { fontSize: 14, fontWeight: 700, margin: '0 0 8px' },
  cardBlurb: { fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px', minHeight: 34 },
  connectButton: {
    width: '100%',
    padding: '9px 0',
    borderRadius: 10,
    border: '1px solid var(--border)',
    color: 'var(--text-tertiary)',
    fontSize: 12,
    fontWeight: 600,
  },
};
