import React from 'react';
import { brands } from '../data/mockData';
import { brandColors } from '../theme/colors';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { nike } from '../theme/nike';
import Icon from '../components/Icon';

export default function OverallAnalysisScreen() {
  const { getByBrand } = useCustomLocations();

  return (
    <div style={styles.page}>
      <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Overall Analysis</h1>
      <p style={styles.subtitle}>Live data pulled in from your connected tools, across every open location.</p>

      <div style={styles.connectRow}>
        <div style={styles.connectCard}>
          <p style={styles.connectLabel}>Second data source</p>
          <p style={styles.connectHint}>Reserved for whatever gets connected here next.</p>
          <button style={styles.connectButton} disabled>
            Coming Soon
          </button>
        </div>
      </div>

      {brands.map((brand) => {
        const active = brand.locations.filter((l) => l.status === 'active');
        const custom = getByBrand(brand.id);
        const locations = [...active, ...custom];
        if (locations.length === 0) return null;
        const color = brandColors[brand.name] ?? '#8A8A8A';

        return (
          <div key={brand.id} style={styles.brandSection}>
            <h2 style={{ ...styles.brandHeader, ...nike.sectionLabel, fontSize: 14 }}>{brand.name}</h2>
            <div style={styles.grid}>
              {locations.map((loc) => (
                <div key={loc.id} style={{ ...styles.card, borderColor: color }}>
                  <h3 style={styles.locationName}>{loc.name}</h3>

                  <div style={styles.section}>
                    <p style={{ ...styles.sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="creditCard" size={14} color="var(--text-secondary)" />
                      Expensify
                    </p>
                    <div style={styles.dataRow}>
                      <span style={styles.dataLabel}>Budget</span>
                      <span style={styles.notConnected}>Not connected yet</span>
                    </div>
                    <div style={styles.dataRow}>
                      <span style={styles.dataLabel}>Recent Charges</span>
                      <span style={styles.notConnected}>Not connected yet</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  page: { padding: '28px max(16px, min(40px, 4vw))' },
  title: { margin: '0 0 6px' },
  subtitle: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.5 },
  connectRow: { marginBottom: 28 },
  connectCard: {
    background: 'var(--bg-card)',
    border: '1px dashed var(--border-strong)',
    borderRadius: 14,
    padding: 16,
    maxWidth: 320,
  },
  connectLabel: { fontSize: 13, fontWeight: 700, margin: '0 0 4px' },
  connectHint: { fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 10px' },
  connectButton: { padding: '8px 14px', borderRadius: 10, border: 'none', background: 'var(--bg-inset)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700 },
  brandSection: { marginBottom: 28 },
  brandHeader: { margin: '0 0 12px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 },
  card: { background: 'var(--bg-card)', border: '2px solid', borderRadius: 14, padding: 18 },
  locationName: { fontSize: 16, fontWeight: 800, margin: '0 0 14px', textTransform: 'uppercase' },
  section: { borderTop: '1px solid var(--border)', paddingTop: 12 },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 8px' },
  dataRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' },
  dataLabel: { fontSize: 12, color: 'var(--text-primary)' },
  notConnected: { fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' },
};
