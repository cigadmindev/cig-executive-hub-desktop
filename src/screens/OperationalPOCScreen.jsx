import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { brands } from '../data/mockData';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useOpeningOngoingContacts } from '../context/OpeningOngoingContactsContext';
import { useAuth } from '../context/AuthContext';
import { ALL_CONTACT_SECTIONS } from '../data/openingChecklistData';
import ConfirmEditField from '../components/ConfirmEditField';
import SearchBar from '../components/SearchBar';
import { useState } from 'react';
import { nike } from '../theme/nike';

export default function OperationalPOCScreen() {
  const { brandId, locationId } = useParams();
  const brand = brands.find((b) => b.id === brandId);
  const { getByBrand } = useCustomLocations();
  const { getByLocation: getContacts, ensureSeeded, updateContactField } = useOpeningOngoingContacts();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    ensureSeeded(locationId);
  }, [locationId]);

  if (!brand) return null;
  const allLocations = [...brand.locations, ...getByBrand(brand.id).map((l) => ({ id: l.id, name: l.name }))];
  const location = allLocations.find((l) => l.id === locationId);
  if (!location) return null;

  const contacts = getContacts(locationId);
  const q = searchQuery.trim().toLowerCase();
  const visibleContacts = contacts.filter((c) => !q || c.item.toLowerCase().includes(q));

  return (
    <div style={styles.page}>
      <Link to={`/brand/${brand.id}/location/${location.id}`} style={styles.backLink}>
        ‹ {location.name}
      </Link>
      <div style={styles.titleRow}>
        <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Operational POC</h1>
        <SearchBar query={searchQuery} onChange={setSearchQuery} suggestions={contacts.map((c) => c.item)} placeholder="Search contacts…" />
      </div>
      <p style={styles.subtitle}>
        Permanent point-of-contact reference — vendor relationships and opening/operational orders, not tied to
        the calendar. Initial Set-Up items and licenses/permits now live on the Opening Checklist and License &
        Lease Renewals screens instead.
      </p>

      {q ? <p style={styles.searchHint}>Showing results for "{searchQuery}".</p> : null}

      {ALL_CONTACT_SECTIONS.map((section) => {
        const items = visibleContacts.filter((c) => c.section === section.label);
        if (items.length === 0) return null;
        return (
          <div key={section.key} style={styles.section}>
            <h2 style={styles.sectionHeader}>{section.label}</h2>
            {items.map((c) => (
              <div key={c.id} style={styles.itemCard}>
                <p style={styles.itemTitle}>{c.item}</p>
                <div style={styles.grid3}>
                  <ConfirmEditField label="Who" value={c.who} onSave={(v) => updateContactField(c.id, 'who', v)} />
                  <ConfirmEditField label="Vendor / Company" value={c.vendor} onSave={(v) => updateContactField(c.id, 'vendor', v)} />
                  <ConfirmEditField label="Contact Name / #" value={c.contactNameNumber} onSave={(v) => updateContactField(c.id, 'contactNameNumber', v)} />
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {contacts.length === 0 ? <p style={styles.hint}>Loading…</p> : null}
    </div>
  );
}

const styles = {
  page: { padding: '28px 40px' },
  backLink: { fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-block', marginBottom: 14 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  titleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  searchHint: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px' },
  subtitle: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.5 },
  section: { background: 'var(--bg-card)', border: 'none', borderRadius: 12, padding: 18, marginBottom: 16 },
  sectionHeader: { fontSize: 15, fontWeight: 700, margin: '0 0 14px' },
  itemCard: { background: 'var(--bg-inset)', border: 'none', borderRadius: 10, padding: 12, marginBottom: 8 },
  itemTitle: { fontSize: 13, fontWeight: 600, margin: '0 0 4px' },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 8 },
  hint: { fontSize: 13, color: 'var(--text-secondary)' },
};
