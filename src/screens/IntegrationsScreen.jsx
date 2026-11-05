import React from 'react';
import { useParams } from 'react-router-dom';
import { brands } from '../data/mockData';
import { useCustomLocations } from '../context/CustomLocationsContext';
import PageHeader from '../components/PageHeader';
import Icon from '../components/Icon';

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
      <PageHeader
        back={{ to: `/brand/${brand.id}/location/${location.id}`, label: location.name }}
        title="Integrations"
        subtitle="The systems this location uses. Not connected to the Hub yet."
      />

      <div style={styles.grid}>
        {INTEGRATIONS.map((i) => (
          <div key={i.key} style={styles.card}>
            <span style={styles.icon}><Icon name="plug" size={20} color="var(--neon)" /></span>
            <h2 style={styles.cardTitle}>{i.label}</h2>
            <p style={styles.cardBlurb}>{i.blurb}</p>
            <span style={styles.soon}>Coming soon</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  page: { padding: '40px max(22px, min(48px, 4vw))', maxWidth: 980 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 14 },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    background: 'var(--bg-card)',
    border: '1px solid var(--glass-edge)',
    borderRadius: 24,
    padding: 22,
  },
  icon: { width: 40, height: 40, borderRadius: 12, background: 'rgba(10,126,164,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 19, fontWeight: 700, letterSpacing: -0.3, margin: '0 0 6px' },
  cardBlurb: { fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px', flex: 1 },
  soon: { fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', background: 'rgba(var(--ink-rgb), 0.06)', borderRadius: 999, padding: '5px 11px' },
};
