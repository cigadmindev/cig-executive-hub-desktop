import React, { useEffect } from 'react';
import Icon from '../components/Icon';
import { printPocSheet } from '../lib/printSheet';
import AssigneePicker from '../components/AssigneePicker';
import { assigneesOf, shortNames, isAssignedTo } from '../data/assignees';
import { assignedWorkOnly } from '../data/accessMatrix';
import { useDialog } from '../hooks/useDialog';
import { useParams } from 'react-router-dom';
import { brands } from '../data/mockData';
import { accessLevel, atLeast } from '../data/accessMatrix';
import { modalBackdrop, modalSurface } from '../theme/modal';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useOpeningOngoingContacts } from '../context/OpeningOngoingContactsContext';
import { useAuth } from '../context/AuthContext';
import { ALL_CONTACT_SECTIONS } from '../data/openingChecklistData';
import ConfirmEditField from '../components/ConfirmEditField';
import SearchBar from '../components/SearchBar';
import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useIsNarrow } from '../hooks/useIsNarrow';
import { plainError } from '../lib/errors';

export default function OperationalPOCScreen() {
  const { brandId, locationId } = useParams();
  const brand = brands.find((b) => b.id === brandId);
  const { getByBrand } = useCustomLocations();
  const [expandedId, setExpandedId] = useState(null);
  const { loaded, watch, assignContacts, getByLocation: getContacts, ensureSeeded, updateContactField, addContact, deleteContact } =
    useOpeningOngoingContacts();
  // Load this location's contacts while the page is open (15 Oct 2026).
  useEffect(() => watch(brandId, locationId), [brandId, locationId]);
  const { user, activeUsers, hasLocationAccess, refreshUsers } = useAuth();
  const isNarrow = useIsNarrow();
  const { dialogNode, notify, confirm } = useDialog();
  // Full on the Operational POC column of Who sees what fills in, adds and
  // removes; View only reads (14 Oct 2026). Before, anyone could fill in but
  // only the pre-opening checklist editors could add - so GMs and assistant
  // managers could not add a contact.
  const canEdit = user?.role === 'admin' || atLeast(user, 'operationalPoc', 'full');
  // Assign (15 Oct 2026, Ronnie): the COO and admins hand contacts to the
  // people at this location who fill POC in.
  const canAssign = user?.role === 'admin' || accessLevel(user, 'operationalPoc') === 'assign';
  // Assigned work only (16 Oct 2026, Ben): just the contacts given to him,
  // which he can fill in. Nothing else on the list shows.
  const mineOnly = assignedWorkOnly(user, 'operationalPoc');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSection, setBulkSection] = useState('all');
  const [bulkUids, setBulkUids] = useState([]);
  const [assigning, setAssigning] = useState(false);
  useEffect(() => {
    if (canAssign && !(activeUsers ?? []).length && refreshUsers) refreshUsers().catch(() => {});
  }, [canAssign]);
  const [addOpen, setAddOpen] = useState(false);
  const [newSection, setNewSection] = useState('');
  const [newItem, setNewItem] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!mineOnly) ensureSeeded(locationId);
  }, [locationId]);

  if (!brand) return null;
  const allLocations = [...brand.locations, ...getByBrand(brand.id).map((l) => ({ id: l.id, name: l.name }))];
  const location = allLocations.find((l) => l.id === locationId);
  if (!location) return null;

  const contacts = getContacts(locationId).filter((c) => !mineOnly || isAssignedTo(c, user?.uid));
  // People who can be given a contact here: managers on this location (or a
  // second job here) who can fill POC in. The server checks the same.
  const assignable = (activeUsers ?? [])
    // The same people the opening checklist offers (15 Oct 2026): anyone who
    // can open this location and edit its POC - its managers, executives like
    // Shannon and Bobbie whose job reaches every restaurant, and admins.
    .filter((u) => (hasLocationAccess(u, brandId, locationId) || u.alsoJob?.locationId === locationId) && (atLeast(u, 'operationalPoc', 'full') || u.assignedWork === true))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const isFilled = (c) => !!((c.vendor ?? '').trim() || (c.contactNameNumber ?? '').trim());
  const bulkCount = contacts.filter((c) => !isFilled(c) && !assigneesOf(c).uids.length && (bulkSection === 'all' || c.section === bulkSection)).length;
  const assignOne = async (c, uids) => {
    try {
      await assignContacts({ brandId, locationId, contactIds: [c.id], uids });
    } catch (err) {
      notify('Could not assign', plainError(err, 'Try again.'));
    }
  };
  const assignBulk = async () => {
    setAssigning(true);
    try {
      const n = await assignContacts({ brandId, locationId, section: bulkSection, uids: bulkUids });
      const who = bulkUids.length === 1 ? assignable.find((u) => u.uid === bulkUids[0])?.name ?? 'them' : bulkUids.length + ' people';
      setBulkOpen(false);
      notify('Assigned', n + ' contact' + (n === 1 ? '' : 's') + ' given to ' + who + '. They have been emailed.');
    } catch (err) {
      notify('Could not assign', plainError(err, 'Try again.'));
    } finally {
      setAssigning(false);
    }
  };
  const printIt = () => printPocSheet({
    location: location?.name ?? '',
    brand: brand?.name ?? '',
    sections: ALL_CONTACT_SECTIONS.map((sec) => ({ label: sec.label, items: contacts.filter((c) => c.section === sec.label) })),
  }) || notify('Print window blocked', 'Your browser stopped the print window from opening. Allow pop-ups for the Hub and try again.');
  const q = searchQuery.trim().toLowerCase();
  const visibleContacts = contacts.filter((c) => !q || c.item.toLowerCase().includes(q));

  return (
    <div style={styles.page}>
      <PageHeader
        back={{ to: `/brand/${brand.id}/location/${location.id}`, label: location.name }}
        title="Operational POC"
        // On a phone the extras sit under the title (17 Oct 2026): with Print
        // beside Search they no longer fit next to it.
        phoneExtras={canAssign || (contacts.length && !mineOnly) ? 'below' : 'inline'}
        subtitle="Who to call for this location: vendors, service companies and suppliers."
        extras={
          <>
            {/* A sheet to fill in by hand (16 Oct 2026). */}
            {contacts.length && !mineOnly ? (
              <button style={{ ...styles.ghostAction, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, ...(isNarrow ? { width: 40, padding: 0 } : {}) }} onClick={printIt} title="Print a fill-in sheet" aria-label="Print a fill-in sheet">
                <Icon name="printer" size={16} />{isNarrow ? null : <span>Print fill-in sheet</span>}
              </button>
            ) : null}
            {canAssign ? (
              <button style={styles.ghostAction} onClick={() => { setBulkSection('all'); setBulkUids([]); setBulkOpen(true); }}>{isNarrow ? 'Assign…' : 'Assign unfilled…'}</button>
            ) : null}
            <SearchBar query={searchQuery} onChange={setSearchQuery} suggestions={contacts.map((c) => c.item)} placeholder="Search contacts…" />
          </>
        }
        actionLabel={canEdit && !addOpen ? '+ Add contact' : null}
        onAction={() => setAddOpen(true)}
      />

      {q ? <p style={styles.searchHint}>Showing results for "{searchQuery}".</p> : null}

      {canEdit && addOpen ? (
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
                style={styles.addCancel}
                onClick={() => {
                  setAddOpen(false);
                  setNewItem('');
                  setNewSection('');
                }}
              >
                Cancel
              </button>
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
                    notify('Could not add', plainError(err, 'Try again.'));
                  }
                }}
              >
                Add
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {mineOnly ? <p style={styles.assignedNote}>Showing only what's assigned to you at {location.name}.</p> : null}
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
                    {/* On a phone the company and number go under the item
                        (15 Oct 2026); three columns cut the number off. */}
                    {isNarrow ? (
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ ...styles.rowTitle, display: 'block' }}>{c.item}</span>
                        <span style={{ display: 'block', fontSize: 12, marginTop: 2, color: c.vendor || c.contactNameNumber ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                          {[c.vendor, c.contactNameNumber].filter(Boolean).join(' · ') || 'Not filled in yet'}
                          {assigneesOf(c).uids.length && !isFilled(c) ? <span style={{ color: 'var(--neon)' }}> · {assigneesOf(c).names.join(', ')}</span> : null}
                        </span>
                      </span>
                    ) : (
                      <>
                        <span style={styles.rowTitle}>{c.item}</span>
                        <span style={styles.rowVendor}>{c.vendor || '—'}</span>
                        <span style={styles.rowContact}>{c.contactNameNumber || '—'}</span>
                        {/* Who has it, while it is not filled in. */}
                        <span style={styles.rowAssigned}>
                          {assigneesOf(c).uids.length && !isFilled(c) ? <span style={styles.assignedChip} title={assigneesOf(c).names.join(', ')}>{shortNames(assigneesOf(c).names)}</span> : !isFilled(c) && canAssign ? <span style={styles.assignLink}>Assign</span> : null}
                        </span>
                      </>
                    )}
                    <span style={styles.chevron}>{isOpen ? '▾' : '▸'}</span>
                  </div>
                  {isOpen ? (
                    <div style={styles.rowBody} data-reveal="">
                      <ConfirmEditField label="Who" value={c.who} onSave={(v) => updateContactField(c.id, 'who', v)} readOnly={!canEdit && !mineOnly} />
                      <ConfirmEditField label="Vendor / Company" value={c.vendor} onSave={(v) => updateContactField(c.id, 'vendor', v)} readOnly={!canEdit && !mineOnly} />
                      <ConfirmEditField
                        label="Contact Name / #"
                        value={c.contactNameNumber}
                        onSave={(v) => updateContactField(c.id, 'contactNameNumber', v)}
                        readOnly={!canEdit && !mineOnly}
                      />
                      {canAssign ? (
                        <div style={{ marginBottom: 10 }}>
                          <span style={styles.fieldLabel}>Assigned to</span>
                          <AssigneePicker {...assigneesOf(c)} people={assignable} onChange={(uids) => assignOne(c, uids)} />
                        </div>
                      ) : assigneesOf(c).uids.length ? (
                        <p style={styles.assignedNote}>Assigned to {assigneesOf(c).names.join(', ')}{c.assignedByName ? ' by ' + c.assignedByName : ''}</p>
                      ) : null}
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
                                    notify('Could not remove', plainError(err, 'Try again.'));
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

      {contacts.length === 0 ? (
        <p style={styles.hint}>{!loaded ? 'Loading…' : mineOnly ? 'Nothing here is assigned to you.' : 'No contacts for this location yet.' + (canEdit ? ' Add the first one with + Add contact.' : '')}</p>
      ) : null}
      {bulkOpen ? (
        <div data-modal="" data-modal-keep="" style={styles.bulkBackdrop} onClick={() => !assigning && setBulkOpen(false)}>
          <div style={styles.bulkCard} onClick={(e) => e.stopPropagation()}>
            <p style={styles.bulkTitle}>Assign unfilled contacts</p>
            <p style={styles.assignedNote}>Every contact at {location.name} that is not filled in and not already assigned goes to the people you tick. Each gets one email listing them.</p>
            <span style={styles.fieldLabel}>Section</span>
            <select style={{ ...styles.assignSelect, marginBottom: 12 }} value={bulkSection} onChange={(e) => setBulkSection(e.target.value)}>
              <option value="all">All sections</option>
              {ALL_CONTACT_SECTIONS.map((sec) => <option key={sec.key} value={sec.label}>{sec.label}</option>)}
            </select>
            <span style={styles.fieldLabel}>To</span>
            <div style={styles.tickList}>
              {assignable.map((u) => (
                <label key={u.uid} style={styles.tickRow}>
                  <input
                    type="checkbox"
                    checked={bulkUids.includes(u.uid)}
                    onChange={(e) => setBulkUids((l) => (e.target.checked ? [...l, u.uid] : l.filter((x) => x !== u.uid)))}
                  />
                  <span>{u.name}</span>
                  {u.job ? <span style={styles.tickJob}>{u.job}</span> : null}
                </label>
              ))}
            </div>
            {assignable.length === 0 ? <p style={styles.assignedNote}>Nobody at this location can fill in contacts yet.</p> : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button style={styles.ghostAction} disabled={assigning} onClick={() => setBulkOpen(false)}>Cancel</button>
              <button data-primary="" style={{ ...styles.ghostAction, background: 'var(--neon)', color: 'var(--neon-text)', border: 'none', fontWeight: 800 }} disabled={!bulkUids.length || !bulkCount || assigning} onClick={assignBulk}>
                {assigning ? 'Assigning…' : 'Assign ' + bulkCount + ' contact' + (bulkCount === 1 ? '' : 's') + (bulkUids.length > 1 ? ' to ' + bulkUids.length + ' people' : '')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '28px max(22px, min(40px, 4vw))' },
  searchHint: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px' },
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
  rowAssigned: { flex: '0 0 96px', display: 'flex', justifyContent: 'flex-start' },
  assignedChip: { fontSize: 11, fontWeight: 700, color: 'var(--neon)', background: 'rgba(34,211,238,0.14)', borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 96 },
  assignLink: { fontSize: 12, color: 'var(--accent)' },
  fieldLabel: { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 },
  assignSelect: { width: '100%', height: 40, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-inset)', color: 'var(--text-primary)', padding: '0 10px', fontFamily: 'inherit', fontSize: 13 },
  assignedNote: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px' },
  ghostAction: { background: 'none', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 10, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', minHeight: 40 },
  bulkBackdrop: { ...modalBackdrop },
  bulkCard: { ...modalSurface, padding: 22, width: 'min(460px, 100%)' },
  tickList: { maxHeight: 260, overflowY: 'auto', marginBottom: 12, display: 'flex', flexDirection: 'column' },
  tickRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px', fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' },
  tickJob: { fontSize: 12, color: 'var(--text-tertiary)' },
  bulkTitle: { fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' },
  chevron: { fontSize: 10, color: 'var(--text-tertiary)' },
  rowBody: { padding: '4px 14px 14px 14px', maxWidth: 420 },

  removeWrap: { marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' },
  removeLink: { background: 'none', border: 'none', padding: 0, color: 'var(--danger)', opacity: 0.75, fontSize: 11, cursor: 'pointer' },
  addRow: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' },
  addInput: { flex: 1, minWidth: 180, maxWidth: 260, height: 34, boxSizing: 'border-box', padding: '0 11px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-inset)', color: 'var(--text-primary)', fontSize: 13 },
  addConfirm: { height: 40, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 12, fontWeight: 800, cursor: 'pointer' },
  addCancel: { height: 40, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  hint: { fontSize: 13, color: 'var(--text-secondary)' },
};
