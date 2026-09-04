import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { brands, canEditChecklists } from '../data/mockData';
import Icon from '../components/Icon';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useSchedule } from '../context/ScheduleContext';
import { useOpeningInfo } from '../context/OpeningInfoContext';
import { useOpeningOngoingContacts } from '../context/OpeningOngoingContactsContext';
import { TIMELINE_BUCKETS, getOpeningItemUrgency, getBlockingDependencies, getDependentParents } from '../data/openingChecklistData';
import { getTemplateForLocation, RENEWAL_TYPE_BY_KEY, isProvisionalTemplate } from '../data/checklists';
import { useRenewals, renewalDocId } from '../context/RenewalsContext';
import { useAuth } from '../context/AuthContext';
import ConfirmEditField from '../components/ConfirmEditField';
import ItemDetails from '../components/ItemDetails';
import DatePickerField from '../components/DatePickerField';
import SearchBar from '../components/SearchBar';
import { nike } from '../theme/nike';
import { useDialog } from '../hooks/useDialog';

function formatDate(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function OpeningChecklistScreen() {
  const { dialogNode, notify } = useDialog();
  const { brandId, locationId } = useParams();
  const { user, activeUsers, hasBrandAccess } = useAuth();
  const isAdmin = user?.role === 'admin';
  // Admins, the COO and the beverage manager can restructure the list itself -
  // add an item, remove one, or put someone's name against it.
  const canEdit = canEditChecklists(user);

  // Only people who can already open this location. Assigning someone a task
  // they cannot reach would put a row on their home screen that goes nowhere.
  const assignableUsers = (activeUsers ?? []).filter((u) => hasBrandAccess(u, brandId));

  const handleAssign = async (item, uid) => {
    const person = assignableUsers.find((u) => u.uid === uid);
    try {
      await updateEntry(item.id, {
        assignedToUid: uid || null,
        assignedToName: person?.name ?? null,
      });
    } catch (err) {
      notify('Could not assign', err?.message ?? 'Nothing was changed. Try again.');
    }
  };

  const handleDeleteItem = (item) => {
    confirm({
      title: `Delete "${item.title}"?`,
      body: 'This removes the item from this location\'s checklist for everyone. Any sign-off on it goes too. Other locations are unaffected.',
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await deleteEntry(item.id);
        } catch (err) {
          notify('Could not delete', err?.message ?? 'The item was not removed. Try again.');
        }
      },
    });
  };
  const brand = brands.find((b) => b.id === brandId);
  const { getByBrand } = useCustomLocations();
  const { updateDates, setRenewalDocument } = useRenewals();
  const { getOpeningItemsByLocation, toggleOpeningItemDone, updateEntry, deleteEntry } = useSchedule();
  const { getInfo, updateInfoField, setOpeningDate } = useOpeningInfo();
  const { regenerateForLocation } = useOpeningOngoingContacts();

  const [now, setNow] = useState(Date.now());
  const [dateDraft, setDateDraft] = useState('');
  const [confirmingDate, setConfirmingDate] = useState(false);
  const [confirmingItem, setConfirmingItem] = useState(null); // item pending a sign-off confirmation
  const [editingDateItemId, setEditingDateItemId] = useState(null); // item whose due date is being edited inline
  // One row open at a time. With 56 items, leaving several expanded loses the
  // compactness the row layout exists for.
  const [expandedItemId, setExpandedItemId] = useState(null);
  // Location Info is reference data — set once, read occasionally. Left open
  // it pushes the checklist a full screen down, so it starts collapsed with a
  // summary and opens on demand.
  const [infoOpen, setInfoOpen] = useState(false);
  // A permit being signed off is the one moment someone has the document in
  // hand, so it's the right time to capture its expiry — rather than making
  // them re-enter it on the Renewals screen later, or never.
  const [renewalPrompt, setRenewalPrompt] = useState(null); // { item, type }
  const [renewalExpiry, setRenewalExpiry] = useState('');
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

  // Which city's requirements apply here. Dependency lookups resolve against
  // this rather than one global list, so a Birmingham checklist doesn't get
  // told it's blocked by a Mississippi item that doesn't exist there.
  const template = getTemplateForLocation(locationId);

  // Setup items come from the location's template; timeline items come from
  // the shared buckets. Both store their id in setupKey, so one lookup
  // covers the whole checklist.
  const describeItem = (setupKey) => {
    if (!setupKey) return null;
    const fromTemplate = template?.items?.find((t) => t.key === setupKey);
    if (fromTemplate?.description) return fromTemplate.description;
    for (const bucket of TIMELINE_BUCKETS) {
      const hit = bucket.items.find((t) => t.key === setupKey);
      if (hit?.description) return hit.description;
    }
    return null;
  };
  const info = getInfo(locationId);
  const openingItems = getOpeningItemsByLocation(locationId);
  const setupItems = openingItems.filter((i) => i.openingItemType === 'setup');

  const handleSetOpeningDate = () => {
    if (!dateDraft) return;
    setConfirmingDate(true);
  };

  const confirmSetOpeningDate = async () => {
    try {
      await setOpeningDate(locationId, new Date(dateDraft).getTime());
      setConfirmingDate(false);
      setDateDraft('');
    } catch (err) {
      // This rebuilds the whole checklist, so a failure is worth surfacing
      // rather than leaving someone wondering why the dates did not move.
      notify('Could not set the date', err?.message ?? 'The checklist was not rebuilt. Try again.');
      return;
    }
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
    const item = confirmingItem;
    toggleOpeningItemDone(item.id, !item.done, user?.name ?? 'Unknown');
    setConfirmingItem(null);

    // Permits and licenses have a second life after they're obtained. Rather
    // than making someone re-enter the same dates on the Renewals screen —
    // which in practice means it never happens — ask for the expiry here,
    // while the document is in front of them.
    const type = RENEWAL_TYPE_BY_KEY[item.setupKey];
    if (type && !item.done) {
      setRenewalExpiry('');
      setRenewalPrompt({ item, type });
    }
  };

  const saveRenewalFromSignOff = async () => {
    if (!renewalPrompt) return;
    const { type, item } = renewalPrompt;
    // Read the item fresh rather than trusting the copy captured when the
    // checkbox was clicked — a document attached moments earlier isn't on
    // that snapshot, and the whole point is that it travels across.
    const current = setupItems.find((i) => i.id === item.id) ?? item;
    try {
      await updateDates(
        renewalDocId(locationId, type),
        Date.now(),
        renewalExpiry ? new Date(renewalExpiry).getTime() : null,
        current.document ?? null
      );
      setRenewalPrompt(null);
    } catch (err) {
      notify('Could not save', err?.message ?? 'The renewal dates were not saved. Try again.');
    }
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
    // The document sits at the top level rather than inside openingFields —
    // it's a file reference, not a text field, and the renewal record reads
    // it from there when a permit is signed off.
    if (field === '__document') {
      updateEntry(item.id, { document: value });
      // Both places hold the same permit, so attaching it once should be
      // enough. Waiting for sign-off meant a document could sit on the
      // checklist for weeks while the renewal record showed nothing.
      const type = RENEWAL_TYPE_BY_KEY[item.setupKey];
      if (type) setRenewalDocument(renewalDocId(locationId, type), value);
      return;
    }
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
        <button style={styles.infoToggle} onClick={() => setInfoOpen((v) => !v)}>
          <h2 style={styles.sectionHeader}>Location Info</h2>
          <span style={styles.infoChevron}>{infoOpen ? 'Hide' : 'Show'}</span>
        </button>
        <div style={{ ...styles.grid2, display: infoOpen ? 'grid' : 'none' }}>
          <ConfirmEditField label="Property Manager" value={info.propertyManager} onSave={(v) => updateInfoField(locationId, 'propertyManager', v)} />
          <ConfirmEditField label="Property Manager Contact" value={info.propertyManagerContact} onSave={(v) => updateInfoField(locationId, 'propertyManagerContact', v)} />
          <ConfirmEditField label="Landlord" value={info.landlord} onSave={(v) => updateInfoField(locationId, 'landlord', v)} />
          <ConfirmEditField label="Landlord Contact" value={info.landlordContact} onSave={(v) => updateInfoField(locationId, 'landlordContact', v)} />
          <ConfirmEditField label="Contractor" value={info.contractor} onSave={(v) => updateInfoField(locationId, 'contractor', v)} />
          <ConfirmEditField label="Contractor Contact" value={info.contractorContact} onSave={(v) => updateInfoField(locationId, 'contractorContact', v)} />
          <ConfirmEditField label="Project Manager" value={info.projectManager} onSave={(v) => updateInfoField(locationId, 'projectManager', v)} />
        </div>

        <p style={{ ...styles.label, display: infoOpen ? 'block' : 'none' }}>Important Numbers</p>
        <div style={{ ...styles.grid2, display: infoOpen ? 'grid' : 'none' }}>
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
        {/* Shown only while the date is being changed — this is surprising
            enough to warrant explaining, but only at the moment it applies. */}
        {dateDraft ? (
          <p style={styles.hint}>
            {info.openingDate
              ? 'Re-spreads unfinished tasks across the new window and adds anything missing. Completed work keeps its date.'
              : 'Builds the checklist and spreads it across the calendar, with permits landing after everything they depend on.'}
          </p>
        ) : null}
        {!isAdmin && !info.openingDate ? <p style={styles.hint}>Ask an admin to set the opening date to generate the checklist below.</p> : null}

        {/* A location with no template of its own falls back to Starkville's
            so it has a working checklist on day one. Mississippi permits are
            not Alabama's or Tennessee's, and a borrowed list that looks
            authoritative is worse than one that admits what it is. */}
        {isProvisionalTemplate(locationId) ? (
          <div style={styles.provisionalNote}>
            This checklist is based on Starkville and has not been verified for this city. Permits and timelines may
            differ — check with the local authority before relying on it.
          </div>
        ) : null}
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionHeader}>Initial Set-Up POC</h2>
        {setupItems.length === 0 ? (
          <p style={styles.hint}>Set an opening date above to generate this checklist.</p>
        ) : visibleSetupItems.length === 0 ? (
          <p style={styles.hint}>No Initial Set-Up items match "{searchQuery}".</p>
        ) : (
          [...new Set(visibleSetupItems.map((i) => i.openingSection))].map((sectionName) => (
            <div key={sectionName} style={{ marginBottom: 22 }}>
              {(() => {
                // Progress per section, so you can see how far along Health
                // Dept is without counting rows.
                const inSection = visibleSetupItems.filter((i) => i.openingSection === sectionName);
                const doneCount = inSection.filter((i) => i.done).length;
                const pct = inSection.length ? Math.round((doneCount / inSection.length) * 100) : 0;
                return (
                  <div style={styles.sectionHead}>
                    <span style={styles.sectionName}>{sectionName}</span>
                    <span style={styles.sectionCount}>
                      {doneCount} of {inSection.length}
                    </span>
                    <div style={styles.sectionBarTrack}>
                      <div style={{ ...styles.sectionBarFill, width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}
              {visibleSetupItems
                .filter((i) => i.openingSection === sectionName)
                .map((item) => {
                  const urgency = getOpeningItemUrgency(item, now);
                  const blockedBy = getBlockingDependencies(item, setupItems, template);
                  const isLocked = blockedBy.length > 0 && !item.done;
                  const neededFor = getDependentParents(item, template);
                  const isOpen = expandedItemId === item.id;
                  const hasDetails = Object.values(item.openingFields ?? {}).some(Boolean);
                  const overdue = !item.done && item.dateTime < now;
                  return (
                    <div key={item.id} style={styles.row}>
                      {/* The whole row toggles — a chevron alone is a tiny target,
                          and there's nothing else on the row to click. */}
                      <div
                        style={{
                          ...styles.rowMain,
                          ...(overdue ? styles.rowOverdue : {}),
                          ...(item.done ? styles.rowDone : {}),
                        }}
                        data-row=""
                        onClick={() => setExpandedItemId(isOpen ? null : item.id)}
                      >
                        <button
                          style={{
                            ...styles.check,
                            ...(item.done ? styles.checkDone : {}),
                            ...(isLocked ? styles.checkLocked : {}),
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isLocked) requestToggleDone(item);
                          }}
                          disabled={isLocked}
                          title={isLocked ? `Locked — requires: ${blockedBy.join(', ')}` : undefined}
                        >
                          {item.done ? '✓' : isLocked ? '–' : ''}
                        </button>

                        <span style={{ ...styles.rowTitle, ...(item.done ? styles.rowTitleDone : {}) }}>
                          {item.title}
                        </span>

                        {/* A dot rather than a count — you only need to know
                            something's there, and the number isn't meaningful. */}
                        {item.assignedToName && !isOpen ? (
                          <span style={styles.assignedChip}>{item.assignedToName}</span>
                        ) : null}
                        {hasDetails && !isOpen ? <span style={styles.detailDot} /> : null}

                        {/* Status by exception. A pending item on schedule says
                            nothing but its date; red is reserved for actually
                            overdue, so it means something when it appears. */}
                        {item.done ? (
                          <span style={styles.rowMeta}>{item.doneBy || 'Done'}</span>
                        ) : overdue ? (
                          <span style={styles.rowOverdueLabel}>Overdue</span>
                        ) : (
                          <button
                            style={styles.rowDateButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditItemDate(item);
                            }}
                          >
                            {new Date(item.dateTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </button>
                        )}

                        <span style={styles.chevron}>{isOpen ? '▾' : '▸'}</span>
                      </div>

                      {/* Dependencies stay visible when collapsed — whether you
                          can start something matters more than its details. */}
                      {isLocked ? <p style={styles.blockedNote}>Requires {blockedBy.join(', ')}</p> : null}

                      {isOpen ? (
                        <div style={styles.rowBody} data-reveal="">
                          {/* Looked up from the template rather than stored on
                              each record: one description per item type, so a
                              wording change reaches every location at once. */}
                          {describeItem(item.setupKey) ? (
                            <p style={styles.itemDescription}>{describeItem(item.setupKey)}</p>
                          ) : null}
                          {neededFor.length > 0 ? (
                            <p style={styles.neededForNote}>Needed for {neededFor.join(', ')}</p>
                          ) : null}
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
                          <ItemDetails
                            item={item}
                            onSave={updateSetupField}
                            locationId={locationId}
                            userName={user?.name}
                            assignableUsers={canEdit ? assignableUsers : null}
                            onAssign={canEdit ? handleAssign : null}
                            onDeleteItem={canEdit ? handleDeleteItem : null}
                          />
                        </div>
                      ) : null}
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
            <div key={bucket.key} style={{ marginBottom: 22 }}>
              {(() => {
                const doneCount = items.filter((i) => i.done).length;
                const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
                return (
                  <div style={styles.sectionHead}>
                    <span style={styles.sectionName}>{bucket.label}</span>
                    <span style={styles.sectionCount}>
                      {doneCount} of {items.length}
                    </span>
                    <div style={styles.sectionBarTrack}>
                      <div style={{ ...styles.sectionBarFill, width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}
              {items.map((item) => {
                const overdue = !item.done && item.dateTime < now;
                const isOpen = expandedItemId === item.id;
                const description = describeItem(item.setupKey);
                return (
                  <div key={item.id} style={styles.row}>
                    <div
                      style={{
                        ...styles.rowMain,
                        ...(overdue ? styles.rowOverdue : {}),
                        ...(item.done ? styles.rowDone : {}),
                      }}
                      data-row=""
                      onClick={() => setExpandedItemId(isOpen ? null : item.id)}
                    >
                      <button
                        style={{ ...styles.check, ...(item.done ? styles.checkDone : {}) }}
                        onClick={(e) => {
                          e.stopPropagation();
                          requestToggleDone(item);
                        }}
                      >
                        {item.done ? '✓' : ''}
                      </button>
                      <span style={{ ...styles.rowTitle, ...(item.done ? styles.rowTitleDone : {}) }}>
                        {item.title}
                      </span>
                      {item.done ? (
                        <span style={styles.rowMeta}>{item.doneBy || 'Done'}</span>
                      ) : overdue ? (
                        <span style={styles.rowOverdueLabel}>Overdue</span>
                      ) : (
                        <button
                          style={styles.rowDateButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditItemDate(item);
                          }}
                        >
                          {new Date(item.dateTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </button>
                      )}

                      <span style={styles.chevron}>{isOpen ? '▾' : '▸'}</span>
                    </div>

                    {isOpen ? (
                      <div style={styles.rowBody} data-reveal="">
                        {description ? <p style={styles.itemDescription}>{description}</p> : null}
                        {item.done && item.doneBy ? (
                          <p style={styles.neededForNote}>Signed off by {item.doneBy}</p>
                        ) : null}
                      </div>
                    ) : null}
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
              {info.openingDate ? ' Anything already signed off keeps its sign-off and date - only unfinished items get re-spread.' : ''}
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

      {/* Appears right after a permit is signed off. The alternative is
          asking for this on the Renewals screen, which means asking someone
          to go find a document they already had open. */}
      {renewalPrompt ? (
        <div style={styles.confirmBackdrop}>
          <div style={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
            <p style={styles.confirmTitle}>{renewalPrompt.type} obtained</p>
            <p style={styles.confirmBody}>
              When does it expire? This fills in the renewal record so it starts tracking, and you
              won't be asked again.
            </p>
            <div style={{ margin: '14px 0' }}>
              <DatePickerField value={renewalExpiry} onChange={setRenewalExpiry} />
            </div>
            <div style={styles.confirmButtonsRow}>
              <button style={styles.cancelBtnFull} onClick={saveRenewalFromSignOff}>
                Skip for now
              </button>
              <button style={styles.saveBtnFull} onClick={saveRenewalFromSignOff}>
                Save
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
            <p style={styles.confirmTitle}>Bring this location up to date?</p>
            <p style={styles.confirmBody}>
              Adds any checklist, timeline, or contact items introduced since <strong>{location.name}</strong>{' '}
              was set up, and removes anything no longer in use. Completed work keeps its sign-off and its
              date, filled-in fields are kept, and renewal records aren't touched.
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
    {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '28px max(22px, min(40px, 4vw))' },
  backLink: { fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-block', marginBottom: 14 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  titleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  regenerateButton: { padding: '8px 14px', borderRadius: 10, border: 'none', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  searchHint: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px' },
  section: { background: 'var(--bg-card)', border: 'none', borderRadius: 12, padding: 18, marginBottom: 16 },
  sectionHeader: { fontSize: 15, fontWeight: 700, margin: '0 0 14px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  label: { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', margin: '14px 0 8px' },
  provisionalNote: {
    background: 'rgba(201, 162, 39, 0.12)',
    border: '1px solid rgba(201, 162, 39, 0.4)',
    borderRadius: 10,
    padding: '12px 14px',
    fontSize: 12,
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
    marginTop: 12,
  },
  // Sits below the fields inside an open item. Visible only to admins, the
  // COO and the beverage manager.
  assignedChip: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
    marginRight: 10,
    whiteSpace: 'nowrap',
  },
  hint: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 },
  openingDateRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  openingDateValue: { fontSize: 16, fontWeight: 700 },
  smallLinkButton: { fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 },
  setDateButton: { padding: '9px 16px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },


  // Rows, not cards. A card per item meant ~110px each and a 6000px page;
  // these are ~40px and the whole section fits on screen. Separated by a hair
  // line rather than gaps and shadows, so the list reads as one thing.
  infoToggle: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
    width: '100%',
    padding: 0,
    background: 'none',
    border: 'none',
    textAlign: 'left',
    marginBottom: 12,
  },
  infoChevron: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-sm)',
    padding: '4px 10px',
  },
  row: { borderBottom: '1px solid var(--border)' },
  rowMain: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    cursor: 'pointer',
  },
  rowOverdue: { background: 'rgba(232,82,75,0.07)' },
  rowDone: { opacity: 0.55 },
  check: {
    width: 18,
    height: 18,
    flexShrink: 0,
    borderRadius: 5,
    border: '1.5px solid var(--border-strong)',
    background: 'transparent',
    color: 'var(--neon-text)',
    fontSize: 11,
    lineHeight: '15px',
    padding: 0,
  },
  checkDone: { background: '#5FA377', borderColor: '#5FA377', color: '#0F0F12' },
  checkLocked: { borderStyle: 'dashed', fontSize: 9, cursor: 'not-allowed' },
  rowTitle: { fontSize: 14, flex: 1, minWidth: 0, color: 'var(--text-primary)' },
  rowTitleDone: { textDecoration: 'line-through', color: 'var(--text-secondary)' },
  // Presence, not a count — you need to know something's attached, and the
  // number of fields isn't information anyone acts on.
  detailDot: { width: 5, height: 5, borderRadius: 3, background: 'var(--neon)', flexShrink: 0 },
  rowMeta: { fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 },
  rowOverdueLabel: { fontSize: 12, fontWeight: 600, color: 'var(--danger)', flexShrink: 0 },
  rowDateButton: {
    fontSize: 12,
    color: 'var(--text-tertiary)',
    background: 'none',
    border: 'none',
    padding: '2px 4px',
    flexShrink: 0,
  },
  chevron: { fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 },
  blockedNote: { fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 8px 44px' },
  rowBody: { paddingBottom: 4 },

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
  sectionCount: { fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 },
  sectionBarTrack: { flex: 1, height: 3, background: 'var(--border)', borderRadius: 2, minWidth: 40 },
  sectionBarFill: { height: 3, background: 'var(--neon)', borderRadius: 2 },
  itemDescription: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, margin: '4px 0 8px' },
  neededForNote: { fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', margin: '2px 0 0' },
  urgencyBadge: { fontSize: 10, fontWeight: 700, color: '#FFFFFF', borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap', margin: 0, cursor: 'pointer' },

  dateEditRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  saveDateButton: { padding: '9px 14px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 12, flexShrink: 0, textTransform: 'uppercase' },
  cancelDateButton: { padding: '9px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, flexShrink: 0 },

  confirmBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  confirmCard: { width: 'min(400px, calc(100vw - 32px))', background: 'var(--bg-elevated)', border: 'none', borderRadius: 16, padding: 22, boxShadow: 'var(--shadow-lg)' },
  confirmTitle: { fontSize: 15, fontWeight: 700, marginBottom: 10 },
  confirmBody: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 18 },
  confirmButtonsRow: { display: 'flex', gap: 10 },
  cancelBtnFull: { flex: 1, padding: '10px 0', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 13 },
  saveBtnFull: { flex: 1, padding: '10px 0', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },
};
