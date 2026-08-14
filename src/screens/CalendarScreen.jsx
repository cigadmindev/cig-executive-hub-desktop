import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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
  const { brandId: lockedBrandId } = useParams(); // present only on /brand/:brandId/calendar
  const { user, hasBrandAccess } = useAuth();
  const { entries, addEntry, updateEntry, deleteEntry, toggleOpeningItemDone } = useSchedule();
  const { getByBrand } = useCustomLocations();
  const { markCalendarViewed, hasUnseenCalendar } = useViewTracking();
  const isAdmin = user?.role === 'admin';
  const isExecutive = user?.role === 'executive';
  const lockedBrand = lockedBrandId ? brands.find((b) => b.id === lockedBrandId) : null;

  const visibleBrands = brands.filter((b) => hasBrandAccess(user, b.id));
  const [filterBrandId, setFilterBrandId] = useState(lockedBrandId ?? 'all');
  const [selectedDate, setSelectedDate] = useState(null);
  const [confirmingOpeningItem, setConfirmingOpeningItem] = useState(null);
  const [editingOpeningDateId, setEditingOpeningDateId] = useState(null);
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

  // The unscoped Master Calendar (/calendar, no brandId) is admin/executive
  // only — managers land here only via /brand/:brandId/calendar, scoped to
  // a restaurant they actually have access to. Placed after every hook
  // call above so hook order never changes between renders.
  if (!lockedBrandId && !isAdmin && !isExecutive) {
    return (
      <div style={{ padding: '28px 36px' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          The Master Calendar is available to admins and executives. Open a specific restaurant to see
          its calendar instead.
        </p>
      </div>
    );
  }

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

  const allLocationOptions = Object.entries(locationInfo)
    .map(([id, info]) => ({ id, ...info }))
    .filter((loc) => !lockedBrandId || loc.brandId === lockedBrandId);

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
        {lockedBrand ? (
          <>
            <Link to={`/brand/${lockedBrand.id}`} style={styles.backLink}>
              ‹ {lockedBrand.name}
            </Link>
            <h1 style={styles.title}>Calendar</h1>
          </>
        ) : (
          <>
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
          </>
        )}
      </header>

      <div style={styles.body}>
        <div style={styles.calendarCol}>
          <MonthCalendar markersByDay={markersByDay} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </div>

        <div style={styles.detailCol}>
          {!selectedDate ? (
            <div style={styles.emptyState}>
              <span style={styles.emptyStateIcon}>📅</span>
              <p style={styles.hint}>Select a date to see what's scheduled.</p>
            </div>
          ) : (
            <>
              <div style={styles.detailHeaderRow}>
                <div>
                  <p style={styles.detailEyebrow}>{selectedDate.toLocaleDateString([], { weekday: 'long' })}</p>
                  <h2 style={styles.detailTitle}>{selectedDate.toLocaleDateString([], { month: 'long', day: 'numeric' })}</h2>
                </div>
                {isAdmin ? (
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
                  const urgency = e.openingItem || e.renewalItem ? getOpeningItemUrgency(e, Date.now()) : null;
                  return (
                    <div key={e.id} style={styles.entryCard}>
                      <div style={{ ...styles.entryAccentBar, background: info.color }} />
                      <div style={styles.entryContent}>
                        <div style={styles.entryHeaderRow}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {e.openingItem ? (
                              <button
                                style={styles.openingCheckbox}
                                onClick={() => setConfirmingOpeningItem(e)}
                              >
                                <span style={{ ...styles.openingCheckboxInner, ...(e.done ? styles.openingCheckboxChecked : {}) }}>
                                  {e.done ? '✓' : ''}
                                </span>
                              </button>
                            ) : null}
                            <span style={{ ...styles.entryTitle, ...((e.openingItem || e.renewalItem) && e.done ? styles.entryTitleDone : {}) }}>
                              {e.title}
                            </span>
                          </div>
                          {e.renewalItem ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                              <span style={{ ...styles.openingBadge, background: urgency.color }}>
                                {e.done ? 'Done' : e.attentionFlag ? '🚨 Needs Attention' : '🔑 License/Permit'}
                              </span>
                              {!e.done ? (
                                <Link
                                  to={`/brand/${info.brandId}/location/${e.locationId}/renewals`}
                                  style={styles.linkButton}
                                >
                                  Go to Renewals
                                </Link>
                              ) : null}
                            </div>
                          ) : e.openingItem ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                              <span style={{ ...styles.openingBadge, background: urgency.color }}>
                                {e.done ? 'Done' : e.attentionFlag ? '🚨 Needs Attention' : '🚀 Opening'}
                              </span>
                              {!e.done ? (
                                <button style={styles.linkButton} onClick={() => startEditOpeningDate(e)}>
                                  Change Date
                                </button>
                              ) : null}
                            </div>
                          ) : isAdmin ? (
                            <div style={{ display: 'flex', gap: 10 }}>
                              <button style={styles.linkButton} onClick={() => openEditForm(e)}>
                                Edit
                              </button>
                              <button style={{ ...styles.linkButton, color: 'var(--danger)' }} onClick={() => handleDelete(e)}>
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {(e.openingItem || e.renewalItem) && e.done && e.doneBy ? (
                          <p style={styles.signedOffNote}>Signed off by {e.doneBy}</p>
                        ) : null}
                        {editingOpeningDateId === e.id ? (
                          <div style={styles.dateEditRow}>
                            <DatePickerField value={openingDateDraft} onChange={setOpeningDateDraft} />
                            <button style={styles.saveDateButton} onClick={() => requestOpeningDateChange(e)}>
                              Save
                            </button>
                            <button style={styles.cancelDateButton} onClick={() => setEditingOpeningDateId(null)}>
                              ✕
                            </button>
                          </div>
                        ) : null}
                        <span style={styles.entryMeta}>
                          {info.brandName} · {info.locationName} · {formatTime(e.dateTime)}
                        </span>
                        {e.note ? <p style={styles.entryNote}>{e.note}</p> : null}
                      </div>
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
            <h2 style={styles.modalTitle}>{editingEntry ? 'Edit Event' : 'New Event'}</h2>

            <label style={styles.label}>Title</label>
            <input style={styles.input} value={formTitle} onChange={(e) => setFormTitle(e.target.value)} autoFocus />

            <label style={styles.label}>Location</label>
            <select style={styles.input} value={formLocationId} onChange={(e) => setFormLocationId(e.target.value)}>
              {allLocationOptions.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.brandName} — {loc.locationName}
                </option>
              ))}
            </select>

            <label style={styles.label}>Time</label>
            <TimePickerField value={formTime} onChange={setFormTime} />

            <label style={styles.label}>Notes</label>
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

      {confirmingOpeningItem ? (
        <div style={styles.modalBackdrop} onClick={() => setConfirmingOpeningItem(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {confirmingOpeningItem.done ? 'Un-sign this off?' : 'Sign off on this task?'}
            </h2>
            <p style={styles.confirmOpeningBody}>
              <strong>{confirmingOpeningItem.title}</strong>
              {confirmingOpeningItem.done
                ? ' will be marked not done again.'
                : ` will be marked done, with your name (${user?.name ?? 'you'}) recorded as who signed off — visible here and on the Opening Checklist.`}
            </p>
            <div style={styles.modalButtonsRow}>
              <button style={styles.cancelButton} onClick={() => setConfirmingOpeningItem(null)}>
                Cancel
              </button>
              <button
                style={styles.saveButton}
                onClick={() => {
                  toggleOpeningItemDone(confirmingOpeningItem.id, !confirmingOpeningItem.done, user?.name ?? 'Unknown');
                  setConfirmingOpeningItem(null);
                }}
              >
                Confirm
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
  page: { padding: '32px 40px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
  header: { marginBottom: 24 },
  backLink: { fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-block', marginBottom: 8 },
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
  body: { display: 'flex', gap: 32, flex: 1, minHeight: 0 },
  calendarCol: { width: 420, flexShrink: 0 },
  detailCol: { flex: 1, overflowY: 'auto', paddingTop: 4 },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 },
  emptyStateIcon: { fontSize: 28, opacity: 0.4 },
  hint: { color: 'var(--text-secondary)', fontSize: 13 },
  detailHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
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
  entryCard: {
    display: 'flex',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 10,
    overflow: 'hidden',
    boxShadow: 'var(--shadow-sm)',
  },
  entryAccentBar: { width: 4, flexShrink: 0 },
  entryContent: { padding: '14px 16px', flex: 1, minWidth: 0 },
  entryHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  entryTitle: { fontSize: 14, fontWeight: 700 },
  entryTitleDone: { textDecoration: 'line-through', color: 'var(--text-tertiary)' },
  signedOffNote: { fontSize: 11, color: 'var(--success)', fontWeight: 600, margin: '2px 0 4px' },
  dateEditRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 6, flexWrap: 'wrap' },
  saveDateButton: { padding: '9px 14px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 12, flexShrink: 0, textTransform: 'uppercase' },
  cancelDateButton: { padding: '9px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, flexShrink: 0 },
  confirmOpeningBody: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 18 },
  openingBadge: { fontSize: 10, fontWeight: 700, color: '#FFFFFF', borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap' },
  openingCheckbox: { flexShrink: 0 },
  openingCheckboxInner: {
    width: 18,
    height: 18,
    borderRadius: 5,
    border: '1.5px solid var(--border-strong)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    color: '#FFFFFF',
  },
  openingCheckboxChecked: { background: 'var(--success)', borderColor: 'var(--success)' },
  entryMeta: { fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 },
  entryNote: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.55 },
  linkButton: { fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 },

  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: 380,
    background: 'var(--bg-card)',
    border: 'none',
    borderRadius: 16,
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
