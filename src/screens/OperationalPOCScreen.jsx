import React, { useEffect } from 'react';
import { useDialog } from '../hooks/useDialog';
import { useParams, Link } from 'react-router-dom';
import { brands , canEditChecklists } from '../data/mockData';
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
  const [expandedId, setExpandedId] = useState(null);
  const { getByLocation: getContacts, ensureSeeded, updateContactField, addContact, deleteContact } =
    useOpeningOngoingContacts();
  const { user } = useAuth();
  const { dialogNode, notify, confirm } = useDialog();
  // Same three as the checklist and renewals.
  const canEdit = canEditChecklists(user);
  const [addOpen, setAddOpen] = useState(false);
  const [newSection, setNewSection] = useState('');
  const [newItem, setNewItem] = useState('');
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

      {canEdit ? (
        <div style={styles.addRow}>
          {addOpen ? (
            <>
              <select style={styles.addInput} value={newSection} onChange={(e) => setNewSection(e.target.value)}>
                <option value="">Which section</option>
                {ALL_CONTACT_SECTIONS.map((sec) => (
                  <option key={sec.key} value={sec.label}>
                    {sec.label}
                  </option>
                ))}
              </select>
              <input
                style={styles.addInput}
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="Knife Sharpening"
              />
              <button
                style={styles.addConfirm}
                disabled={!newSection || !newItem.trim()}
                onClick={async () => {
                  try {
                    await addContact(locationId, newSection, newItem.trim());
                    setNewItem('');
                    setNewSection('');
                    setAddOpen(false);
                  } catch (err) {
                    notify('Could not add', err?.message ?? 'Try again.');
                  }
                }}
              >
                Add
              </button>
              <button
                style={styles.addCancel}
                onClick={() => {
                  setAddOpen(false);
                  setNewItem('');
                  setNewSection('');
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button style={styles.addCancel} onClick={() => setAddOpen(true)}>
              + Add contact
            </button>
          )}
        </div>
      ) : null}

      {ALL_CONTACT_SECTIONS.map((section) => {
        const items = visibleContacts.filter((c) => c.section === section.label);
        if (items.length === 0) return null;
        return (
          <div key={section.key} style={styles.section}>
            <div style={styles.sectionHead}>
              <span style={styles.sectionName}>{section.label}</span>
            </div>
            {items.map((c) => {
              const isOpen = expandedId === c.id;
              return (
                <div key={c.id} style={styles.row}>
                  {/* Unlike the checklist, values stay visible when collapsed —
                      on a contact list the number is the content, so hiding it
                      behind a disclosure would defeat the point. */}
                  <div style={styles.rowMain} data-row="" onClick={() => setExpandedId(isOpen ? null : c.id)}>
                    <span style={styles.rowTitle}>{c.item}</span>
                    <span style={styles.rowVendor}>{c.vendor || '—'}</span>
                    <span style={styles.rowContact}>{c.contactNameNumber || '—'}</span>
                    <span style={styles.chevron}>{isOpen ? '▾' : '▸'}</span>
                  </div>
                  {isOpen ? (
                    <div style={styles.rowBody} data-reveal="">
                      <ConfirmEditField label="Who" value={c.who} onSave={(v) => updateContactField(c.id, 'who', v)} />
                      <ConfirmEditField label="Vendor / Company" value={c.vendor} onSave={(v) => updateContactField(c.id, 'vendor', v)} />
                      <ConfirmEditField
                        label="Contact Name / #"
                        value={c.contactNameNumber}
                        onSave={(v) => updateContactField(c.id, 'contactNameNumber', v)}
                      />
                      {canEdit ? (
                        <div style={styles.removeWrap}>
                          <button
                            style={styles.removeLink}
                            onClick={() =>
                              confirm({
                                title: `Remove "${c.item}"?`,
                                body: "It comes off this location's list along with anything filled in. Other locations are unaffected.",
                                confirmLabel: 'Remove',
                                tone: 'danger',
                                onConfirm: async () => {
                                  try {
                                    await deleteContact(c.id);
                                  } catch (err) {
                                    notify('Could not remove', err?.message ?? 'Try again.');
                                  }
                                },
                              })
                            }
                          >
                            Remove this contact from the list
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })}

      {contacts.length === 0 ? <p style={styles.hint}>Loading…</p> : null}
      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '28px max(22px, min(40px, 4vw))' },
  backLink: { fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-block', marginBottom: 14 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  titleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  searchHint: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px' },
  subtitle: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.5 },
  section: { background: 'var(--bg-card)', border: 'none', borderRadius: 12, padding: 18, marginBottom: 16 },
  sectionHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 14px 9px',
    borderBottom: '1px solid var(--border-strong)',
  },
  sectionName: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-primary)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: { borderBottom: '1px solid var(--border)' },
  rowMain: { display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', cursor: 'pointer' },
  rowTitle: { fontSize: 14, color: 'var(--text-primary)', flex: '0 0 190px' },
  rowVendor: { fontSize: 13, color: 'var(--text-secondary)', flex: 1, minWidth: 0 },
  rowContact: { fontSize: 13, color: 'var(--text-secondary)', flex: '0 0 150px' },
  chevron: { fontSize: 10, color: 'var(--text-tertiary)' },
  rowBody: { padding: '4px 14px 14px 14px', maxWidth: 420 },

  removeWrap: { marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' },
  removeLink: { background: 'none', border: 'none', padding: 0, color: 'var(--danger)', opacity: 0.75, fontSize: 11, cursor: 'pointer' },
  addRow: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' },
  addInput: { flex: 1, minWidth: 180, maxWidth: 260, height: 34, boxSizing: 'border-box', padding: '0 11px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-inset)', color: 'var(--text-primary)', fontSize: 13 },
  addConfirm: { height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 12, fontWeight: 800, cursor: 'pointer' },
  addCancel: { height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  hint: { fontSize: 13, color: 'var(--text-secondary)' },
};
