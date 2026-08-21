import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { brands } from '../data/mockData';
import Icon from '../components/Icon';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useSchedule } from '../context/ScheduleContext';
import { useOpeningInfo } from '../context/OpeningInfoContext';
import { useOpeningOngoingContacts } from '../context/OpeningOngoingContactsContext';
import { TIMELINE_BUCKETS, getOpeningItemUrgency, getBlockingDependencies, getDependentParents } from '../data/openingChecklistData';
import { useAuth } from '../context/AuthContext';
import ConfirmEditField from '../components/ConfirmEditField';
import DatePickerField from '../components/DatePickerField';
import SearchBar from '../components/SearchBar';
import { nike } from '../theme/nike';

function formatDate(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function OpeningChecklistScreen() {
  const { brandId, locationId } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const brand = brands.find((b) => b.id === brandId);
  const { getByBrand } = useCustomLocations();
  const { getOpeningItemsByLocation, toggleOpeningItemDone, updateEntry } = useSchedule();
  const { getInfo, updateInfoField, setOpeningDate } = useOpeningInfo();
  const { regenerateForLocation } = useOpeningOngoingContacts();

  const [now, setNow] = useState(Date.now());
  const [dateDraft, setDateDraft] = useState('');
  const [confirmingDate, setConfirmingDate] = useState(false);
  const [confirmingItem, setConfirmingItem] = useState(null); // item pending a sign-off confirmation
  const [editingDateItemId, setEditingDateItemId] = useState(null); // item whose due date is being edited inline
  const [itemDateDraft, setItemDateDraft] = useState('');
  const [confirmingItemDate, setConfirmingItemDate] = useState(null); // { item, newDate } pending confirmation
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  if (!brand) return null;
  const allLocations = [...brand.locations, ...getByBrand(brand.id).map((l) => ({ id: l.id, name: l.name }))];
  const location = allLocations.find((l) => l.id === locationId);
  if (!location) return null;

  const info = getInfo(locationId);
  const openingItems = getOpeningItemsByLocation(locationId);
  const setupItems = openingItems.filter((i) => i.openingItemType === 'setup');

  const handleSetOpeningDate = () => {
    if (!dateDraft) return;
    setConfirmingDate(true);
  };

  const confirmSetOpeningDate = async () => {
    await setOpeningDate(locationId, new Date(dateDraft).getTime());
    setConfirmingDate(false);
    setDateDraft('');
  };

  // Force-rebuilds this location's checklist and Operational POC from the
  // current code — wipes and reseeds both, using whatever opening date is
  // already saved. For pulling in new/changed items after an update, or
  // clearing out test data, without needing to touch the opening date
  // itself. Admin-only, same as setting the date in the first place.
  const confirmRegenerate = async () => {
    setRegenerating(true);
    try {
      if (info.openingDate) {
        await setOpeningDate(locationId, info.openingDate);
      }
      await regenerateForLocation(locationId);
    } finally {
      setRegenerating(false);
      setConfirmingRegenerate(false);
    }
  };

  // Signing off (or un-signing) requires a confirmation step, and records
  // who did it — shown right on the item afterward, on both this screen
  // and the Calendar, since they're reading the exact same document.
  const requestToggleDone = (item) => setConfirmingItem(item);
  const confirmToggleDone = () => {
    toggleOpeningItemDone(confirmingItem.id, !confirmingItem.done, user?.name ?? 'Unknown');
    setConfirmingItem(null);
  };

  // Anyone can move an individual item's due date — this is separate from
  // setting the overall opening date (admin-only, since that regenerates
  // everything). This just nudges one task. It's the same document the
  // Calendar reads, so the move shows up there automatically too.
  const startEditItemDate = (item) => {
    setEditingDateItemId(item.id);
    setItemDateDraft(new Date(item.dateTime).toISOString().slice(0, 10));
  };
  const requestItemDateChange = (item) => {
    if (!itemDateDraft) return;
    setConfirmingItemDate({ item, newDate: new Date(itemDateDraft).getTime() });
  };
  const confirmItemDateChange = () => {
    updateEntry(confirmingItemDate.item.id, { dateTime: confirmingItemDate.newDate });
    setConfirmingItemDate(null);
    setEditingDateItemId(null);
  };

  const updateSetupField = (item, field, value) => {
    updateEntry(item.id, { openingFields: { ...item.openingFields, [field]: value } });
  };

  const renderUrgencyBadge = (item, urgency, onClick) => {
    const label = item.done ? 'Done' : urgency.label === 'Needs Attention' ? urgency.label : `${formatDate(item.dateTime)} ✎`;
    return item.done ? (
      <span style={{ ...styles.urgencyBadge, background: urgency.color }}>{label}</span>
    ) : (
      <button style={{ ...styles.urgencyBadge, background: urgency.color, border: 'none' }} onClick={onClick}>
        {label}
      </button>
    );
  };

  // Search filters what's DISPLAYED in each of the three lists below, but
  // never the arrays passed into getBlockingDependencies — those need the
  // full, unfiltered set for a location to correctly resolve lock state,
  // regardless of what's currently typed in the search box.
  const q = searchQuery.trim().toLowerCase();
  const matchesQuery = (title) => !q || title.toLowerCase().includes(q);
  const visibleSetupItems = setupItems.filter((i) => matchesQuery(i.title));
  const visibleTimelineItems = openingItems.filter((i) => i.openingItemType === 'timeline' && matchesQuery(i.title));
  const searchSuggestions = [
    ...setupItems.map((i) => i.title),
    ...openingItems.filter((i) => i.openingItemType === 'timeline').map((i) => i.title),
  ];

  return (
    <div style={styles.page}>
      <Link to={`/brand/${brand.id}/location/${location.id}`} style={styles.backLink}>
        ‹ {location.name}
      </Link>
      <div style={styles.titleRow}>
        <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Opening Checklist</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SearchBar query={searchQuery} onChange={setSearchQuery} suggestions={searchSuggestions} placeholder="Search tasks…" />
          {isAdmin ? (
            <button style={{ ...styles.regenerateButton, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setConfirmingRegenerate(true)}>
              <Icon name="refresh" size={13} color="currentColor" />
              Regenerate
            </button>
          ) : null}
        </div>
      </div>
      {q ? <p style={styles.searchHint}>Showing results for "{searchQuery}" across Initial Set-Up and Timeline.</p> : null}

      <div style={styles.section}>
        <h2 style={styles.sectionHeader}>Location Info</h2>
        <div style={styles.grid2}>
          <ConfirmEditField label="Property Manager" value={info.propertyManager} onSave={(v) => updateInfoField(locationId, 'propertyManager', v)} />
          <ConfirmEditField label="Property Manager Contact" value={info.propertyManagerContact} onSave={(v) => updateInfoField(locationId, 'propertyManagerContact', v)} />
          <ConfirmEditField label="Landlord" value={info.landlord} onSave={(v) => updateInfoField(locationId, 'landlord', v)} />
          <ConfirmEditField label="Landlord Contact" value={info.landlordContact} onSave={(v) => updateInfoField(locationId, 'landlordContact', v)} />
          <ConfirmEditField label="Contractor" value={info.contractor} onSave={(v) => updateInfoField(locationId, 'contractor', v)} />
          <ConfirmEditField label="Contractor Contact" value={info.contractorContact} onSave={(v) => updateInfoField(locationId, 'contractorContact', v)} />
          <ConfirmEditField label="Project Manager" value={info.projectManager} onSave={(v) => updateInfoField(locationId, 'projectManager', v)} />
        </div>

        <p style={styles.label}>Important Numbers</p>
        <div style={styles.grid2}>
          {info.importantNumbers.map((num, i) => (
            <ConfirmEditField
              key={i}
              label={['GM', 'KM / Chef', 'MGR', 'Other'][i]}
              value={num}
              onSave={(v) => {
                const next = [...info.importantNumbers];
                next[i] = v;
                updateInfoField(locationId, 'importantNumbers', next);
              }}
            />
          ))}
        </div>

        <p style={styles.label}>Projected Opening Date</p>
        {info.openingDate ? (
          <div style={styles.openingDateRow}>
            <span style={styles.openingDateValue}>{formatDate(info.openingDate)}</span>
            {isAdmin ? (
              <button style={styles.smallLinkButton} onClick={() => setDateDraft(new Date(info.openingDate).toISOString().slice(0, 10))}>
                Change
              </button>
            ) : null}
          </div>
        ) : null}
        {isAdmin && (dateDraft || !info.openingDate) ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <DatePickerField value={dateDraft} onChange={setDateDraft} placeholder="Set opening date" />
            </div>
            <button style={styles.setDateButton} onClick={handleSetOpeningDate} disabled={!dateDraft}>
              {info.openingDate ? 'Update' : 'Set Date'}
            </button>
          </div>
        ) : null}
        {!isAdmin && !info.openingDate ? <p style={styles.hint}>Ask an admin to set the opening date to generate the checklist below.</p> : null}
        <p style={styles.hint}>
          Setting or changing this date builds (or rebuilds) the full Initial Set-Up and Timeline
          checklists below, spread across the calendar — on this location's calendar and the Master
          Calendar. Parent tasks (Food Permit, Beer Permit, Liquor License, Privilege/Business
          License) always land after everything they depend on.
        </p>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionHeader}>Initial Set-Up POC</h2>
        <p style={styles.hint}>Also shown on the Operational POC screen — same record, either place updates both.</p>
        {setupItems.length === 0 ? (
          <p style={styles.hint}>Set an opening date above to generate this checklist.</p>
        ) : visibleSetupItems.length === 0 ? (
          <p style={styles.hint}>No Initial Set-Up items match "{searchQuery}".</p>
        ) : (
          [...new Set(visibleSetupItems.map((i) => i.openingSection))].map((sectionName) => (
            <div key={sectionName} style={{ marginBottom: 18 }}>
              <p style={styles.bucketLabel}>{sectionName}</p>
              {visibleSetupItems
                .filter((i) => i.openingSection === sectionName)
                .map((item) => {
                  const urgency = getOpeningItemUrgency(item, now);
                  const blockedBy = getBlockingDependencies(item, setupItems);
                  const isLocked = blockedBy.length > 0 && !item.done;
                  const neededFor = getDependentParents(item);
                  return (
                    <div key={item.id} style={styles.itemCard}>
                      <div style={styles.itemHeaderRow}>
                        <button
                          style={styles.doneCheckbox}
                          onClick={() => (isLocked ? null : requestToggleDone(item))}
                          disabled={isLocked}
                          title={isLocked ? `Locked — requires: ${blockedBy.join(', ')}` : undefined}
                        >
                          <span
                            style={{
                              ...styles.doneCheckboxInner,
                              ...(item.done ? styles.doneCheckboxChecked : {}),
                              ...(isLocked ? styles.doneCheckboxLocked : {}),
                            }}
                          >
                            {item.done ? '✓' : isLocked ? '•' : ''}
                          </span>
                        </button>
                        <span style={{ ...styles.itemTitle, ...(item.done ? styles.itemTitleDone : {}) }}>{item.title}</span>
                        {renderUrgencyBadge(item, urgency, () => startEditItemDate(item))}
                      </div>
                      {isLocked ? <p style={styles.lockedNote}>Requires: {blockedBy.join(', ')}</p> : null}
                      {neededFor.length > 0 ? <p style={styles.neededForNote}>↳ Needed for: {neededFor.join(', ')}</p> : null}
                      {item.done && item.doneBy ? <p style={styles.signedOffNote}>Signed off by {item.doneBy}</p> : null}
                      {editingDateItemId === item.id ? (
                        <div style={styles.dateEditRow}>
                          <DatePickerField value={itemDateDraft} onChange={setItemDateDraft} />
                          <button style={styles.saveDateButton} onClick={() => requestItemDateChange(item)}>
                            Save
                          </button>
                          <button style={styles.cancelDateButton} onClick={() => setEditingDateItemId(null)}>
                            ✕
                          </button>
                        </div>
                      ) : null}
                      <div style={styles.grid3}>
                        <ConfirmEditField label="Company" value={item.openingFields?.company} onSave={(v) => updateSetupField(item, 'company', v)} />
                        <ConfirmEditField label="Account Number" value={item.openingFields?.accountNumber} onSave={(v) => updateSetupField(item, 'accountNumber', v)} />
                        <ConfirmEditField label="Contact" value={item.openingFields?.contact} onSave={(v) => updateSetupField(item, 'contact', v)} />
                      </div>
                    </div>
                  );
                })}
            </div>
          ))
        )}
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionHeader}>Opening Timeline</h2>
        {q && visibleTimelineItems.length === 0 && openingItems.some((i) => i.openingItemType === 'timeline') ? (
          <p style={styles.hint}>No Timeline items match "{searchQuery}".</p>
        ) : null}
        {TIMELINE_BUCKETS.map((bucket) => {
          const items = visibleTimelineItems.filter((i) => i.openingSection === bucket.label);
          if (items.length === 0) return null;
          return (
            <div key={bucket.key} style={{ marginBottom: 18 }}>
              <p style={styles.bucketLabel}>{bucket.label}</p>
              {items.map((item) => {
                const urgency = getOpeningItemUrgency(item, now);
                return (
                  <div key={item.id} style={styles.timelineItemWrap}>
                    <div style={styles.timelineRow}>
                      <button style={styles.doneCheckbox} onClick={() => requestToggleDone(item)}>
                        <span style={{ ...styles.doneCheckboxInner, ...(item.done ? styles.doneCheckboxChecked : {}) }}>
                          {item.done ? '✓' : ''}
                        </span>
                      </button>
                      <div style={{ flex: 1 }}>
                        <span style={{ ...styles.itemTitle, ...(item.done ? styles.itemTitleDone : {}) }}>{item.title}</span>
                        {item.done && item.doneBy ? <p style={styles.signedOffNote}>Signed off by {item.doneBy}</p> : null}
                      </div>
                      {renderUrgencyBadge(item, urgency, () => startEditItemDate(item))}
                    </div>
                    {editingDateItemId === item.id ? (
                      <div style={styles.dateEditRow}>
                        <DatePickerField value={itemDateDraft} onChange={setItemDateDraft} />
                        <button style={styles.saveDateButton} onClick={() => requestItemDateChange(item)}>
                          Save
                        </button>
                        <button style={styles.cancelDateButton} onClick={() => setEditingDateItemId(null)}>
                          ✕
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
        {openingItems.filter((i) => i.openingItemType === 'timeline').length === 0 ? (
          <p style={styles.hint}>Set an opening date above to generate this checklist.</p>
        ) : null}
      </div>

      {confirmingDate ? (
        <div style={styles.confirmBackdrop} onClick={() => setConfirmingDate(false)}>
          <div style={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
            <p style={styles.confirmTitle}>
              {info.openingDate ? 'Change opening date?' : 'Set opening date?'}
            </p>
            <p style={styles.confirmBody}>
              This will {info.openingDate ? 'rebuild' : 'generate'} the entire Initial Set-Up and Timeline
              checklist against <strong>{formatDate(new Date(dateDraft).getTime())}</strong>, creating
              calendar entries on this location's calendar and the Master Calendar.
              {info.openingDate ? ' Any progress already marked done will be lost, since the whole checklist regenerates.' : ''}
            </p>
            <div style={styles.confirmButtonsRow}>
              <button style={styles.cancelBtnFull} onClick={() => setConfirmingDate(false)}>
                Cancel
              </button>
              <button style={styles.saveBtnFull} onClick={confirmSetOpeningDate}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmingItem ? (
        <div style={styles.confirmBackdrop} onClick={() => setConfirmingItem(null)}>
          <div style={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
            <p style={styles.confirmTitle}>
              {confirmingItem.done ? 'Un-sign this off?' : 'Sign off on this task?'}
            </p>
            <p style={styles.confirmBody}>
              <strong>{confirmingItem.title}</strong>
              {confirmingItem.done
                ? ' will be marked not done again.'
                : ` will be marked done, with your name (${user?.name ?? 'you'}) recorded as who signed off — visible here and on the Calendar.`}
            </p>
            <div style={styles.confirmButtonsRow}>
              <button style={styles.cancelBtnFull} onClick={() => setConfirmingItem(null)}>
                Cancel
              </button>
              <button style={styles.saveBtnFull} onClick={confirmToggleDone}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmingItemDate ? (
        <div style={styles.confirmBackdrop} onClick={() => setConfirmingItemDate(null)}>
          <div style={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
            <p style={styles.confirmTitle}>Change this due date?</p>
            <p style={styles.confirmBody}>
              <strong>{confirmingItemDate.item.title}</strong> will move from{' '}
              <strong>{formatDate(confirmingItemDate.item.dateTime)}</strong> to{' '}
              <strong>{formatDate(confirmingItemDate.newDate)}</strong> — updated on the calendar
              automatically, since it's the same entry.
            </p>
            <div style={styles.confirmButtonsRow}>
              <button style={styles.cancelBtnFull} onClick={() => setConfirmingItemDate(null)}>
                Cancel
              </button>
              <button style={styles.saveBtnFull} onClick={confirmItemDateChange}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmingRegenerate ? (
        <div style={styles.confirmBackdrop} onClick={() => !regenerating && setConfirmingRegenerate(false)}>
          <div style={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
            <p style={styles.confirmTitle}>Regenerate this location's data?</p>
            <p style={styles.confirmBody}>
              This wipes and rebuilds the Initial Set-Up checklist, Timeline, and Operational POC for{' '}
              <strong>{location.name}</strong> from the current code — useful after an update, or to clear
              out test data. Any progress already signed off (checkboxes, filled-in Company/Account/Contact
              fields) will be lost and start fresh. This does not touch License & Lease Renewals — those
              keep their real dates.
            </p>
            <div style={styles.confirmButtonsRow}>
              <button style={styles.cancelBtnFull} onClick={() => setConfirmingRegenerate(false)} disabled={regenerating}>
                Cancel
              </button>
              <button style={styles.saveBtnFull} onClick={confirmRegenerate} disabled={regenerating}>
                {regenerating ? 'Regenerating…' : 'Regenerate'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  page: { padding: '28px 40px' },
  backLink: { fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-block', marginBottom: 14 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  titleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  regenerateButton: { padding: '8px 14px', borderRadius: 10, border: 'none', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  searchHint: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px' },
  section: { background: 'var(--bg-card)', border: 'none', borderRadius: 12, padding: 18, marginBottom: 16 },
  sectionHeader: { fontSize: 15, fontWeight: 700, margin: '0 0 14px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 8 },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 8 },
  label: { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', margin: '14px 0 8px' },
  hint: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 },
  openingDateRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  openingDateValue: { fontSize: 16, fontWeight: 700 },
  smallLinkButton: { fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 },
  setDateButton: { padding: '9px 16px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },

  itemCard: { background: 'var(--bg-inset)', border: 'none', borderRadius: 10, padding: 12, marginBottom: 8 },
  itemHeaderRow: { display: 'flex', alignItems: 'center', gap: 10 },
  itemTitle: { fontSize: 13, fontWeight: 600, flex: 1 },
  itemTitleDone: { textDecoration: 'line-through', color: 'var(--text-tertiary)' },
  signedOffNote: { fontSize: 11, color: 'var(--success)', fontWeight: 600, margin: '2px 0 0' },
  lockedNote: { fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, margin: '2px 0 0' },
  neededForNote: { fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', margin: '2px 0 0' },
  urgencyBadge: { fontSize: 10, fontWeight: 700, color: '#FFFFFF', borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap', margin: 0, cursor: 'pointer' },
  doneCheckbox: { flexShrink: 0 },
  doneCheckboxInner: {
    width: 20,
    height: 20,
    borderRadius: 5,
    border: '1.5px solid var(--border-strong)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    color: '#FFFFFF',
  },
  doneCheckboxChecked: { background: 'var(--success)', borderColor: 'var(--success)' },
  doneCheckboxLocked: { background: 'var(--bg-inset)', borderColor: 'var(--border)', opacity: 0.7 },

  bucketLabel: { fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  timelineItemWrap: { borderBottom: '1px solid var(--border)', padding: '8px 0' },
  timelineRow: { display: 'flex', alignItems: 'center', gap: 10 },
  dateEditRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  saveDateButton: { padding: '9px 14px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 12, flexShrink: 0, textTransform: 'uppercase' },
  cancelDateButton: { padding: '9px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, flexShrink: 0 },

  confirmBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  confirmCard: { width: 400, background: 'var(--bg-card)', border: 'none', borderRadius: 16, padding: 22, boxShadow: 'var(--shadow-lg)' },
  confirmTitle: { fontSize: 15, fontWeight: 700, marginBottom: 10 },
  confirmBody: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 18 },
  confirmButtonsRow: { display: 'flex', gap: 10 },
  cancelBtnFull: { flex: 1, padding: '10px 0', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 13 },
  saveBtnFull: { flex: 1, padding: '10px 0', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },
};
