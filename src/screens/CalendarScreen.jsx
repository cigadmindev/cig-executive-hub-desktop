import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSchedule } from '../context/ScheduleContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { brands } from '../data/mockData';
import { brandColors } from '../theme/colors';
import MonthCalendar from '../components/MonthCalendar';
import TimePickerField from '../components/TimePickerField';
import DatePickerField from '../components/DatePickerField';
import { useViewTracking } from '../context/ViewTrackingContext';
import { getOpeningItemUrgency } from '../data/openingChecklistData';
import { nike } from '../theme/nike';

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function formatTime(dateTime) {
  return new Date(dateTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function CalendarScreen() {
  const { user, hasBrandAccess } = useAuth();
  const { entries, addEntry, updateEntry, deleteEntry, toggleOpeningItemDone } = useSchedule();
  const { getByBrand } = useCustomLocations();
  const { markCalendarViewed, hasUnseenCalendar } = useViewTracking();
  const isAdmin = user?.role === 'admin';
  const isExecutive = user?.role === 'executive';

  const visibleBrands = brands.filter((b) => hasBrandAccess(user, b.id));
  const [filterBrandId, setFilterBrandId] = useState('all');
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingOpeningDateId, setEditingOpeningDateId] = useState(null);
  // One row open at a time, same as the checklist and renewals.
  const [expandedEntryId, setExpandedEntryId] = useState(null);
  const [openingDateDraft, setOpeningDateDraft] = useState('');
  const [confirmingOpeningDate, setConfirmingOpeningDate] = useState(null); // { entry, newDate }
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formLocationId, setFormLocationId] = useState('');
  const [formTime, setFormTime] = useState('12:00');

  const locationInfo = {};
  visibleBrands.forEach((b) => {
    const color = brandColors[b.name] ?? '#8A8A8A';
    b.locations.forEach((l) => (locationInfo[l.id] = { locationName: l.name, brandName: b.name, brandId: b.id, color }));
    getByBrand(b.id).forEach((l) => (locationInfo[l.id] = { locationName: l.name, brandName: b.name, brandId: b.id, color }));
  });

  useEffect(() => {
    if (filterBrandId === 'all') {
      visibleBrands.forEach((b) => markCalendarViewed(b.id));
    } else {
      markCalendarViewed(filterBrandId);
    }
  }, [filterBrandId]);

  // No longer blocked for managers — visibleBrands (from hasBrandAccess)
  // already scopes everything below to only what this user can see, the
  // same fix mobile got: a filtered view instead of a hard block.

  const filteredEntries = entries.filter((e) => {
    const info = locationInfo[e.locationId];
    if (!info) return false;
    if (filterBrandId !== 'all' && info.brandId !== filterBrandId) return false;
    return true;
  });

  const markersByDay = {};
  filteredEntries.forEach((e) => {
    const key = dayKey(new Date(e.dateTime));
    if (!markersByDay[key]) markersByDay[key] = [];
    markersByDay[key].push({ date: e.dateTime, color: locationInfo[e.locationId].color });
  });

  const selectedEntries = selectedDate
    ? filteredEntries.filter((e) => dayKey(new Date(e.dateTime)) === dayKey(selectedDate)).sort((a, b) => a.dateTime - b.dateTime)
    : [];

  const allLocationOptions = Object.entries(locationInfo).map(([id, info]) => ({ id, ...info }));

  const openNewForm = () => {
    setEditingEntry(null);
    setFormTitle('');
    setFormNote('');
    setFormLocationId(allLocationOptions[0]?.id ?? '');
    setFormTime('12:00');
    setFormOpen(true);
  };

  const openEditForm = (entry) => {
    const d = new Date(entry.dateTime);
    setEditingEntry(entry);
    setFormTitle(entry.title);
    setFormNote(entry.note);
    setFormLocationId(entry.locationId);
    setFormTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    setFormOpen(true);
  };

  const closeForm = () => setFormOpen(false);

  const handleSaveForm = async () => {
    if (!formTitle.trim() || !selectedDate || !formLocationId) return;
    const [hours, minutes] = formTime.split(':').map(Number);
    const dateTime = new Date(selectedDate);
    dateTime.setHours(hours, minutes, 0, 0);

    if (editingEntry) {
      await updateEntry(editingEntry.id, { title: formTitle.trim(), note: formNote.trim(), dateTime: dateTime.getTime() });
    } else {
      await addEntry({
        locationId: formLocationId,
        title: formTitle.trim(),
        note: formNote.trim(),
        dateTime: dateTime.getTime(),
        authorName: user?.name ?? 'Unknown',
      });
    }
    closeForm();
  };

  const handleDelete = (entry) => {
    if (window.confirm(`Delete "${entry.title}"? This cannot be undone.`)) {
      deleteEntry(entry.id);
    }
  };

  // Same capability as on the Opening Checklist screen — anyone can move an
  // individual item's due date, with a confirmation step first. Since it's
  // the exact same document, this stays in sync with the Checklist
  // automatically, no separate update needed there.
  const startEditOpeningDate = (entry) => {
    setEditingOpeningDateId(entry.id);
    setOpeningDateDraft(new Date(entry.dateTime).toISOString().slice(0, 10));
  };
  const requestOpeningDateChange = (entry) => {
    if (!openingDateDraft) return;
    setConfirmingOpeningDate({ entry, newDate: new Date(openingDateDraft).getTime() });
  };
  const confirmOpeningDateChange = () => {
    updateEntry(confirmingOpeningDate.entry.id, { dateTime: confirmingOpeningDate.newDate });
    setConfirmingOpeningDate(null);
    setEditingOpeningDateId(null);
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Calendar</h1>
        <div style={styles.filterRow}>
          <button
            style={{ ...styles.filterChip, ...(filterBrandId === 'all' ? styles.filterChipActive : {}) }}
            onClick={() => setFilterBrandId('all')}
          >
            All
          </button>
          {visibleBrands.map((b) => (
            <button
              key={b.id}
              style={{ ...styles.filterChip, ...(filterBrandId === b.id ? styles.filterChipActive : {}), position: 'relative' }}
              onClick={() => setFilterBrandId(b.id)}
            >
              <span style={{ ...styles.filterDot, background: brandColors[b.name] ?? '#8A8A8A' }} />
              {b.name}
              {hasUnseenCalendar(b.id, [...b.locations.map((l) => l.id), ...getByBrand(b.id).map((l) => l.id)]) ? (
                <span style={styles.chipUnseenDot} />
              ) : null}
            </button>
          ))}
        </div>
      </header>

      <div style={styles.body}>
        <div style={styles.calendarCol}>
          <MonthCalendar markersByDay={markersByDay} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </div>

        <div style={styles.detailCol}>
          {!selectedDate ? (
            <div style={styles.emptyState}>
              
              <p style={styles.hint}>Select a date to see what's scheduled.</p>
            </div>
          ) : (
            <>
              <div style={styles.detailHeaderRow}>
                <div>
                  <p style={styles.detailEyebrow}>{selectedDate.toLocaleDateString([], { weekday: 'long' })}</p>
                  <h2 style={styles.detailTitle}>{selectedDate.toLocaleDateString([], { month: 'long', day: 'numeric' })}</h2>
                </div>
                {isAdmin || isExecutive ? (
                  <button style={styles.addButton} onClick={openNewForm}>
                    + Add Event
                  </button>
                ) : null}
              </div>

              {selectedEntries.length === 0 ? (
                <p style={styles.hint}>Nothing scheduled this day.</p>
              ) : (
                selectedEntries.map((e) => {
                  const info = locationInfo[e.locationId];
                  const isChecklist = e.openingItem || e.renewalItem;
                  const isOpen = expandedEntryId === e.id;
                  const overdue = isChecklist && !e.done && e.dateTime < Date.now();
                  return (
                    <div key={e.id} style={styles.row}>
                      <div
                        data-row=""
                        style={{
                          ...styles.rowMain,
                          ...(overdue ? styles.rowOverdue : {}),
                          ...(isChecklist && e.done ? styles.rowDone : {}),
                        }}
                        onClick={() => setExpandedEntryId(isOpen ? null : e.id)}
                      >
                        {/* Read-only here. Signing off from a calendar row means
                            doing it without seeing what the task depends on or
                            attaching the permit it produced — the checklist is
                            where that context lives, so this points there. */}
                        {isChecklist ? (
                          <span style={{ ...styles.check, ...(e.done ? styles.checkDone : {}) }}>
                            {e.done ? '✓' : ''}
                          </span>
                        ) : (
                          <span style={{ ...styles.dot, background: info.color }} />
                        )}

                        <div style={styles.rowText}>
                          <div style={{ ...styles.rowTitle, ...(isChecklist && e.done ? styles.rowTitleDone : {}) }}>
                            {e.title}
                          </div>
                          {/* Location on its own line — as a suffix it crowded
                              the title and every row read the same width. */}
                          <div style={styles.rowWhere}>
                            {info.brandName} · {info.locationName}
                            {e.renewalItem ? ' · Renewal' : e.openingItemType === 'timeline' ? ' · Opening timeline' : ''}
                          </div>
                        </div>

                        {e.done ? (
                          <span style={styles.rowMeta}>{e.doneBy || 'Done'}</span>
                        ) : overdue ? (
                          <span style={styles.rowOverdueLabel}>Overdue</span>
                        ) : (
                          <span style={styles.rowMeta}>
                            {new Date(e.dateTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        )}
                        <span style={styles.chevron}>{isOpen ? '▾' : '▸'}</span>
                      </div>

                      {isOpen ? (
                        <div style={styles.rowBody} data-reveal="">
                          {e.note ? <p style={styles.rowNote}>{e.note}</p> : null}
                          <div style={styles.rowActions}>
                            {isChecklist ? (
                              <>
                                <DatePickerField
                                  value={
                                    editingOpeningDateId === e.id
                                      ? openingDateDraft
                                      : new Date(e.dateTime).toISOString().slice(0, 10)
                                  }
                                  onChange={(v) => {
                                    setEditingOpeningDateId(e.id);
                                    setOpeningDateDraft(v);
                                  }}
                                />
                                {editingOpeningDateId === e.id ? (
                                  <button style={styles.saveButton} onClick={() => requestOpeningDateChange(e)}>
                                    Save
                                  </button>
                                ) : null}
                                <div style={{ flex: 1 }} />
                                <Link
                                  to={
                                    e.renewalItem
                                      ? `/brand/${info.brandId}/location/${e.locationId}/renewals`
                                      : `/brand/${info.brandId}/location/${e.locationId}/opening-checklist`
                                  }
                                  style={styles.linkButton}
                                >
                                  {e.renewalItem ? 'Open renewals →' : 'Open checklist →'}
                                </Link>
                              </>
                            ) : isAdmin || isExecutive ? (
                              <>
                                <button style={styles.linkButton} onClick={() => openEditForm(e)}>
                                  Edit
                                </button>
                                <button
                                  style={{ ...styles.linkButton, color: 'var(--danger)' }}
                                  onClick={() => handleDelete(e)}
                                >
                                  Delete
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>

      {formOpen ? (
        <div style={styles.modalBackdrop} onClick={closeForm}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{editingEntry ? 'Edit Event' : 'Add Event'}</h2>
            {/* The day is already chosen — stating it is context, not another
                field to fill in. */}
            <p style={styles.modalDate}>
              {selectedDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>

            <label style={styles.label}>Title</label>
            <input
              style={styles.input}
              placeholder="What's happening?"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              autoFocus
            />

            <div style={styles.formRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={styles.label}>Location</label>
                <select style={styles.input} value={formLocationId} onChange={(e) => setFormLocationId(e.target.value)}>
                  {allLocationOptions.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.brandName} — {loc.locationName}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ width: 120, flexShrink: 0 }}>
                <label style={styles.label}>Time</label>
                <TimePickerField value={formTime} onChange={setFormTime} />
              </div>
            </div>

            <label style={styles.label}>Note</label>
            <textarea style={{ ...styles.input, minHeight: 70 }} value={formNote} onChange={(e) => setFormNote(e.target.value)} />

            <div style={styles.modalButtonsRow}>
              <button style={styles.cancelButton} onClick={closeForm}>
                Cancel
              </button>
              <button style={styles.saveButton} onClick={handleSaveForm}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}


      {confirmingOpeningDate ? (
        <div style={styles.modalBackdrop} onClick={() => setConfirmingOpeningDate(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Change this due date?</h2>
            <p style={styles.confirmOpeningBody}>
              <strong>{confirmingOpeningDate.entry.title}</strong> will move to{' '}
              <strong>{new Date(confirmingOpeningDate.newDate).toLocaleDateString()}</strong> — updated on
              the Opening Checklist automatically, since it's the same entry.
            </p>
            <div style={styles.modalButtonsRow}>
              <button style={styles.cancelButton} onClick={() => setConfirmingOpeningDate(null)}>
                Cancel
              </button>
              <button style={styles.saveButton} onClick={confirmOpeningDateChange}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  modalDate: { fontSize: 12, color: 'var(--text-tertiary)', margin: '-6px 0 16px' },
  formRow: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  row: { borderBottom: '1px solid var(--border)' },
  rowMain: { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', cursor: 'pointer' },
  rowOverdue: { background: 'rgba(232,82,75,0.07)' },
  rowDone: { opacity: 0.55 },
  check: {
    width: 18,
    height: 18,
    flexShrink: 0,
    borderRadius: 5,
    border: '1.5px solid var(--border-strong)',
    background: 'transparent',
    color: '#0F0F12',
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { background: '#5FA377', borderColor: '#5FA377' },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0, marginLeft: 5, marginRight: 5 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, color: 'var(--text-primary)' },
  rowTitleDone: { textDecoration: 'line-through', color: 'var(--text-secondary)' },
  rowWhere: { fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 },
  rowMeta: { fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 },
  rowOverdueLabel: { fontSize: 12, fontWeight: 600, color: 'var(--danger)', flexShrink: 0 },
  chevron: { fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 },
  rowBody: { padding: '2px 14px 14px 44px' },
  rowNote: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px' },
  rowActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },

  page: { padding: '32px 40px', minHeight: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
  header: { marginBottom: 24 },
  title: { fontSize: 30, fontWeight: 900, letterSpacing: -0.7, textTransform: 'uppercase', color: '#FFFFFF', margin: '0 0 14px' },
  filterRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  filterChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '6px 13px',
    borderRadius: 20,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 500,
  },
  filterChipActive: { background: 'var(--neon)', color: 'var(--neon-text)', borderColor: 'var(--neon)', fontWeight: 800 },
  filterDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  chipUnseenDot: { width: 6, height: 6, borderRadius: 3, background: 'var(--danger)', marginLeft: 2, flexShrink: 0 },
  body: { display: 'flex', flexWrap: 'wrap', gap: 32, flex: 1, minHeight: 0 },
  calendarCol: { width: 420, flexShrink: 0 },
  detailCol: { flex: 1, minWidth: 340, overflowY: 'auto', paddingTop: 4 },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 },
  hint: { color: 'var(--text-secondary)', fontSize: 13 },
  detailHeaderRow: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
  detailEyebrow: { fontSize: 11, fontWeight: 900, color: 'var(--neon)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 2px' },
  detailTitle: { fontSize: 24, fontWeight: 900, letterSpacing: -0.5, margin: 0, textTransform: 'uppercase', color: '#FFFFFF' },
  addButton: {
    padding: '8px 16px',
    borderRadius: 10,
    background: 'var(--neon)',
    color: 'var(--neon-text)',
    fontSize: 12,
    fontWeight: 900,
    textTransform: 'uppercase',
  },
  confirmOpeningBody: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 18 },
  linkButton: { fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 },

  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.78)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Without this the card stacked below the calendar grid, so dates showed
    // through the form.
    zIndex: 100,
  },
  modalCard: {
    width: 380,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 24,
    boxShadow: 'var(--shadow-lg)',
  },
  modalTitle: { fontSize: 19, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.2, color: '#FFFFFF', margin: '0 0 12px' },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5, marginTop: 12 },
  input: {
    width: '100%',
    padding: '9px 11px',
    borderRadius: 10,
    border: 'none',
    background: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  },
  modalButtonsRow: { display: 'flex', gap: 10, marginTop: 22 },
  cancelButton: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 10,
    border: 'none',
    background: 'var(--bg-inset)',
    color: 'var(--text-secondary)',
    fontSize: 13,
    fontWeight: 700,
  },
  saveButton: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 10,
    background: 'var(--neon)',
    color: 'var(--neon-text)',
    fontWeight: 900,
    fontSize: 13,
    textTransform: 'uppercase',
  },
};
