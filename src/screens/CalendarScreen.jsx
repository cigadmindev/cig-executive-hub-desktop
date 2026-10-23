import React, { useEffect, useState } from 'react';
import WhoNeedsToKnow from '../components/WhoNeedsToKnow';
import { useIsNarrow } from '../hooks/useIsNarrow';
import { Link , useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSchedule } from '../context/ScheduleContext';
import { useRenewals } from '../context/RenewalsContext';
import { useEventRequests } from '../context/EventRequestsContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { brands , hasFeature } from '../data/mockData';
import { brandColors } from '../theme/colors';
import MonthCalendar from '../components/MonthCalendar';
import TimePickerField from '../components/TimePickerField';
import DatePickerField from '../components/DatePickerField';
import { useViewTracking } from '../context/ViewTrackingContext';
import { useDialog } from '../hooks/useDialog';
import PageHeader from '../components/PageHeader';
import { fmtDay, fmtTime } from '../lib/dates';
import { modalBackdrop, modalSurface } from '../theme/modal';

// Shorter restaurant names where space is tight.
const SHORT_BRAND = { 'Taste Italian Kitchen': 'Taste', 'Blutos Greek Tavern': 'Blutos', 'Heritage Chophouse': 'Heritage', 'Sunnyside Social': 'Sunnyside' };
const shortBrand = (name) => SHORT_BRAND[name] ?? name;

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
const formatTime = (dateTime) => fmtTime(dateTime);

export default function CalendarScreen() {
  const isNarrow = useIsNarrow();
  const { dialogNode, confirm, notify } = useDialog();
  const { user, hasBrandAccess, hasLocationAccess } = useAuth();

  const isMyOwnEntry = (e) =>
    !!user && e.authorUid === user.uid && !e.openingItem && !e.renewalItem && !e.source;
  const { renewals } = useRenewals();
  const { requests } = useEventRequests();
  const { entries, addEntry, updateEntry, deleteEntry, toggleOpeningItemDone } = useSchedule();
  const { getByBrand } = useCustomLocations();
  const { markCalendarViewed, hasUnseenCalendar } = useViewTracking();
  const isAdmin = user?.role === 'admin';
  const isExecutive = user?.role === 'executive';

  const visibleBrands = brands.filter((b) => hasBrandAccess(user, b.id));
  const [filterBrandId, setFilterBrandId] = useState('all');
  const [menuOpen, setMenuOpen] = useState(false);
  // An email about an event links to its own day - /calendar?date=2026-10-14 -
  // so clicking through lands where the event is rather than on today.
  const [searchParams] = useSearchParams();
  const linkedDate = (() => {
    const raw = searchParams.get('date');
    if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const [y, m, d] = raw.split('-').map(Number);
    const parsed = new Date(y, m - 1, d);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  })();
  const [selectedDate, setSelectedDate] = useState(linkedDate ?? null);
  const [editingOpeningDateId, setEditingOpeningDateId] = useState(null);
  // One row open at a time, same as the checklist and renewals. A link from
  // Home's This week opens its entry: /calendar?date=…&entry=… (14 Oct 2026).
  const [expandedEntryId, setExpandedEntryId] = useState(searchParams.get('entry'));
  // Following another link while already here moves to its day and entry.
  const linkKey = searchParams.get('date') + '|' + searchParams.get('entry');
  useEffect(() => {
    if (linkedDate) setSelectedDate(linkedDate);
    const id = searchParams.get('entry');
    if (!id) return;
    setExpandedEntryId(id);
    const t = setTimeout(() => document.getElementById('entry-' + id)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
    return () => clearTimeout(t);
  }, [linkKey]);
  // One location's overdue list open at a time - opening every group at once
  // puts back the wall of red this folds away.
  // Open on a computer; folded on a phone so the day's own items come first.
  const [overdueOpen, setOverdueOpen] = useState(() => !(typeof window !== 'undefined' && window.innerWidth < 760));
  const [openingDateDraft, setOpeningDateDraft] = useState('');
  const [confirmingOpeningDate, setConfirmingOpeningDate] = useState(null); // { entry, newDate }
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formLocationId, setFormLocationId] = useState('');
  // Job titles and particular people, the same two fields event requests use.
  const [formNeeds, setFormNeeds] = useState([]);
  const [formPeople, setFormPeople] = useState([]);
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

  // Renewals and approved events are read directly rather than generated as
  // schedule records. One date, one place: a permit's expiry lives on the
  // renewal record, so nothing can drift out of step. The cost is that these
  // rows are read-only here - tapping opens the screen that owns them.
  const virtualEntries = [
    ...renewals
      .filter((r) => r.expirationDate && !r.hidden)
      .map((r) => ({
        id: 'renewal:' + r.id,
        locationId: r.locationId,
        dateTime: r.expirationDate,
        title: r.type + ' expires',
        source: 'renewal',
        note: '',
      })),
    ...requests
      .filter((r) => r.status === 'approved' && r.dateTime)
      .map((r) => ({
        id: 'event:' + r.id,
        locationId: r.locationId,
        dateTime: r.dateTime,
        title: r.title,
        source: 'event',
        note: '',
      })),
  ];

  const reachableEntries = [...entries, ...virtualEntries].filter((e) => {
    // Entries tied to a location someone does not have stay off their
    // calendar. Company-wide entries carry no location and pass through.
    const locInfo = e.locationId ? locationInfo[e.locationId] : null;
    if (locInfo && !hasLocationAccess(user, locInfo.brandId, e.locationId)) return false;
    const info = locationInfo[e.locationId];
    if (!info) return false;

    // The calendar shows what you can reach. Someone without the opening
    // checklist keeps the calendar - it simply holds fewer things, rather
    // than listing work they cannot open.
    //
    // Filtered here, where the markers and the day list both read from, and
    // not at each display site: the home screen leak survived because it was
    // filtered on the tiles and missed in the totals.
    if (e.openingItem && !hasFeature(user, 'openingChecklist')) return false;
    if (e.source === 'renewal' && !hasFeature(user, 'renewals')) return false;
    if (e.source === 'event' && !hasFeature(user, 'eventRequests')) return false;

    return true;
  });
  // The restaurant picked in the menu (23 Oct 2026, sketch 29 A).
  const filteredEntries = filterBrandId === 'all'
    ? reachableEntries
    : reachableEntries.filter((e) => locationInfo[e.locationId].brandId === filterBrandId);

  const markersByDay = {};
  filteredEntries.forEach((e) => {
    const key = dayKey(new Date(e.dateTime));
    if (!markersByDay[key]) markersByDay[key] = [];
    markersByDay[key].push({ date: e.dateTime, color: locationInfo[e.locationId].color });
  });

  const upcoming = (() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = start.getTime() + 14 * 24 * 60 * 60 * 1000;
    return filteredEntries
      .filter((e) => e.dateTime >= start.getTime() && e.dateTime < end && !e.done)
      .sort((a, b) => a.dateTime - b.dateTime)
      .slice(0, 12);
  })();

  // One button instead of two rows of restaurant chips (23 Oct 2026, sketch
  // 29 A). The list is also the colour key; the red dot for something new
  // sits on the button and on the restaurant inside.
  const unseenFor = (b) => hasUnseenCalendar(b.id, [...b.locations.map((l) => l.id), ...getByBrand(b.id).map((l) => l.id)]);
  const anyUnseen = visibleBrands.some(unseenFor);
  const soonByBrand = {};
  {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = start.getTime() + 14 * 24 * 60 * 60 * 1000;
    reachableEntries.forEach((e) => {
      if (e.done || e.dateTime < start.getTime() || e.dateTime >= end) return;
      const b = locationInfo[e.locationId].brandId;
      soonByBrand[b] = (soonByBrand[b] ?? 0) + 1;
    });
  }
  const pickedBrand = visibleBrands.find((b) => b.id === filterBrandId);
  const restaurantMenu = visibleBrands.length > 1 ? (
    <div style={{ position: 'relative', ...(isNarrow ? { width: '100%' } : {}) }}>
      <button style={{ ...styles.menuButton, ...(isNarrow ? { width: '100%' } : {}) }} onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
        <span style={{ ...styles.filterDot, background: pickedBrand ? brandColors[pickedBrand.name] ?? '#8A8A8A' : 'var(--neon)' }} />
        <span style={{ flex: 1, textAlign: 'left' }}>{pickedBrand ? pickedBrand.name : 'All restaurants'}</span>
        {anyUnseen ? <span style={styles.chipUnseenDot} /> : null}
        <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>▾</span>
      </button>
      {menuOpen ? (
        <>
          <div style={styles.menuCatch} onClick={() => setMenuOpen(false)} />
          <div style={{ ...styles.menu, ...(isNarrow ? { left: 0, right: 0, width: 'auto' } : {}) }}>
            {[{ id: 'all', name: 'All restaurants' }, ...visibleBrands].map((b) => (
              <button
                key={b.id}
                style={{ ...styles.menuItem, ...(filterBrandId === b.id ? styles.menuItemOn : {}) }}
                onClick={() => { setFilterBrandId(b.id); setMenuOpen(false); }}
              >
                {b.id === 'all' ? null : <span style={{ ...styles.filterDot, background: brandColors[b.name] ?? '#8A8A8A' }} />}
                <span style={{ flex: 1 }}>{b.name}</span>
                {b.id !== 'all' && unseenFor(b) ? <span style={styles.chipUnseenDot} /> : null}
                {b.id !== 'all' && soonByBrand[b.id] ? <span style={styles.menuCount}>{soonByBrand[b.id]}</span> : null}
              </button>
            ))}
            <p style={styles.menuFoot}>Numbers: what's coming up in the next two weeks.</p>
          </div>
        </>
      ) : null}
    </div>
  ) : null;

  const selectedEntries = selectedDate
    ? filteredEntries.filter((e) => dayKey(new Date(e.dateTime)) === dayKey(selectedDate)).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || a.dateTime - b.dateTime)
    : [];

  // What is actually due on the selected day, and what is overdue from
  // earlier and carried forward. Split so a real event is not buried under
  // twenty-six red rows: the overdue checklist work folds into a count per
  // location instead.
  //
  // An overdue renewal or event does not fold - that is exactly the sort of
  // thing someone opened this date to find.
  const dueToday = [];
  const overdueByLocation = {};

  for (const e of selectedEntries) {
    const isVirtual = e.source === 'renewal' || e.source === 'event';
    const isChecklist = !isVirtual && (e.openingItem || e.renewalItem);
    const isOverdue = isChecklist && !e.done && e.dateTime < Date.now();

    if (isOverdue) {
      const key = e.locationId ?? 'unknown';
      (overdueByLocation[key] ??= []).push(e);
    } else {
      dueToday.push(e);
    }
  }

  const overdueGroups = Object.entries(overdueByLocation).sort((a, b) => b[1].length - a[1].length);
  const overdueTotal = overdueGroups.reduce((n, [, items]) => n + items.length, 0);

  // Only locations they can actually open. locationInfo covers every location
  // in their restaurants because it labels entries too, which is wider than
  // where they may put one.
  const allLocationOptions = Object.entries(locationInfo)
    .filter(([id, info]) => hasLocationAccess(user, info.brandId, id))
    .map(([id, info]) => ({ id, ...info }));

  const openNewForm = () => {
    setEditingEntry(null);
    setFormTitle('');
    setFormNote('');
    setFormLocationId(allLocationOptions[0]?.id ?? '');
    setFormNeeds([]);
    setFormPeople([]);
    setFormTime('12:00');
    setFormOpen(true);
  };

  const openEditForm = (entry) => {
    const d = new Date(entry.dateTime);
    setEditingEntry(entry);
    setFormTitle(entry.title);
    setFormNote(entry.note);
    setFormLocationId(entry.locationId);
    setFormNeeds(entry.needs ?? []);
    setFormPeople(entry.notifyUids ?? []);
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
        needs: formNeeds,
        notifyUids: formPeople,
        title: formTitle.trim(),
        note: formNote.trim(),
        dateTime: dateTime.getTime(),
        authorName: user?.name ?? 'Unknown',
      });
    }
    closeForm();
  };

  const handleDelete = (entry) => {
    confirm({
      title: `Delete "${entry.title}"?`,
      body: 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: () => deleteEntry(entry.id),
    });
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
        <PageHeader
          title="Calendar"
          subtitle="What's scheduled across your restaurants: events, permits, checklists and time off."
          extras={restaurantMenu}
          actionLabel="+ Add event"
          onAction={() => {
            if (!selectedDate) setSelectedDate(new Date());
            openNewForm();
          }}
        />
      </header>

      {/* Side by side on desktop; stacked on a phone. Both panes stay
          visible - unlike Messages, you need the month and the selected
          day's items at once. The fixed 420 + 340 minimum was forcing the
          whole page to pan sideways. */}
      <div style={{ ...styles.body, ...(isNarrow ? styles.bodyNarrow : {}) }}>
        <div style={isNarrow ? styles.calendarColNarrow : styles.calendarCol}>
          <MonthCalendar markersByDay={markersByDay} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </div>

        <div style={isNarrow ? styles.detailColNarrow : styles.detailCol}>
          {!selectedDate ? (
            // The next two weeks instead of an empty half page (17 Oct
            // 2026). Tapping one opens its day.
            <div>
              <p style={styles.detailEyebrow}>Next two weeks</p>
              <h2 style={styles.detailTitle}>Coming up</h2>
              {upcoming.length === 0 ? (
                <p style={styles.hint}>Nothing scheduled. Pick a date to add something.</p>
              ) : (
                <div style={styles.upList}>
                  {upcoming.map((e, i) => {
                    const info = locationInfo[e.locationId];
                    const d = new Date(e.dateTime);
                    const newDay = i === 0 || dayKey(new Date(upcoming[i - 1].dateTime)) !== dayKey(d);
                    return (
                      <React.Fragment key={e.id ?? i}>
                        {newDay ? (
                          <p style={styles.upDay}>{d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                        ) : null}
                        <button data-row="" style={styles.upRow} onClick={() => setSelectedDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()))}>
                          <span style={{ ...styles.upBar, background: info?.color ?? 'var(--border-strong)' }} />
                          <span style={styles.upText}>
                            <span style={styles.upTitle}>{e.title}</span>
                            <span style={styles.upWhere}>{info ? info.brandName + ' · ' + info.locationName : ''}</span>
                          </span>
                          <span style={styles.upTime}>{d.getHours() || d.getMinutes() ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</span>
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
            {/* The day panel, tidied (23 Oct 2026, sketch 29): a small date
                header with arrows to step a day, the time on the left and a
                colour bar per restaurant, done items last, and overdue work
                as one card instead of a box per opening. */}
            <div style={styles.dayCard}>
              <div style={styles.dayHead}>
                <h2 style={styles.dayTitle}>{selectedDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</h2>
                <span style={{ flex: 1 }} />
                <button style={styles.dayArrow} aria-label="Previous day" onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() - 1))}>‹</button>
                <button style={styles.dayArrow} aria-label="Next day" onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1))}>›</button>
                <button style={styles.backToUpcoming} onClick={() => setSelectedDate(null)}>Coming up</button>
              </div>

              <p style={styles.secLabel}><span>On this day</span><span>{dueToday.length || ''}</span></p>
              {dueToday.length === 0 ? (
                <p style={{ ...styles.hint, padding: '4px 18px 14px', margin: 0 }}>{selectedEntries.length === 0 ? 'Nothing scheduled this day.' : 'Nothing else is due this day.'}</p>
              ) : (
                dueToday.map((e) => {
                  const info = locationInfo[e.locationId];
                  // Read straight from the renewal or event request, not a
                  // schedule record - so there is nothing here to edit.
                  //
                  // Everything below reads schedule-entry fields - done,
                  // doneBy, openingItem. On a virtual row those are simply
                  // absent, so the checklist branches happen not to run.
                  // Making that explicit rather than relying on undefined
                  // being falsy: the mobile version is type-checked and
                  // states the same thing, and this file has no checker to
                  // catch a future field read that assumes otherwise.
                  //
                  // These two come first: everything after depends on them,
                  // and isChecklist used to sit above real - which parses and
                  // builds fine, then throws the moment a date is opened.
                  const isVirtual = e.source === 'renewal' || e.source === 'event';
                  const real = isVirtual ? null : e;
                  const isChecklist = real !== null && (real.openingItem || real.renewalItem);
                  const isOpen = expandedEntryId === e.id;
                  const overdue = isVirtual
                    ? e.dateTime < Date.now()
                    : isChecklist && !real.done && e.dateTime < Date.now();
                  return (
                    <div key={e.id} id={'entry-' + e.id} style={styles.row}>
                      <div
                        data-row=""
                        style={{
                          ...styles.rowMain,
                          ...(overdue ? styles.rowOverdue : {}),
                          ...(isChecklist && real.done ? styles.rowDone : {}),
                        }}
                        onClick={() => setExpandedEntryId(isOpen ? null : e.id)}
                      >
                        {/* Read-only here: signing off happens on the
                            checklist, where what it depends on is visible. */}
                        {real && real.done ? (
                          <span style={{ ...styles.rowTime, color: 'var(--success)' }}>✓ Done</span>
                        ) : overdue ? (
                          <span style={{ ...styles.rowTime, color: 'var(--danger)' }}>{e.source === 'renewal' ? 'Expired' : 'Overdue'}</span>
                        ) : (
                          <span style={styles.rowTime}>{e.source === 'renewal' ? 'All day' : fmtTime(e.dateTime)}</span>
                        )}
                        <span style={{ ...styles.rowBar, background: info.color }} />

                        <div style={styles.rowText}>
                          <div style={{ ...styles.rowTitle, ...(isChecklist && real.done ? styles.rowTitleDone : {}) }}>
                            {e.title}
                          </div>
                          <div style={styles.rowWhere}>
                            {shortBrand(info.brandName)} · {info.locationName}
                            {e.source === 'renewal'
                              ? ' · Expires'
                              : e.source === 'event'
                                ? ' · Event'
                                : e.renewalItem
                                  ? ' · Renewal'
                                  : e.openingItemType === 'timeline'
                                    ? ' · Opening timeline'
                                    : e.openingItem
                                      ? ' · Opening checklist'
                                      : ''}
                            {real && real.done && real.doneBy ? ' · ' + real.doneBy : ''}
                          </div>
                        </div>

                        <span style={styles.chevron}>{isOpen ? '▾' : '▸'}</span>
                      </div>

                      {isOpen ? (
                        <div style={isNarrow ? { ...styles.rowBody, paddingLeft: 16 } : styles.rowBody} data-reveal="">
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
                            ) : isVirtual ? (
                              /* Read straight from the renewal or event
                                 request. There is no schedule record to edit
                                 or delete, and the date lives on the record
                                 that owns it - so this only points there. */
                              <Link
                                to={
                                  e.source === 'renewal'
                                    ? '/brand/' + info.brandId + '/location/' + e.locationId + '/renewals'
                                    : '/brand/' + info.brandId + '/location/' + e.locationId + '/event-requests'
                                }
                                style={styles.linkButton}
                              >
                                {e.source === 'renewal' ? 'Open renewals →' : 'Open event requests →'}
                              </Link>
                            ) : isAdmin || isExecutive || isMyOwnEntry(e) ? (
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

              {/* Overdue work carried forward: one card, a slim line per
                  location, each opening its checklist on the late items. */}
              {overdueGroups.length > 0 ? (
                <>
                  <p style={styles.secLabel}><span>Overdue, carried forward</span><span /></p>
                  <div style={styles.odCard}>
                    <button style={styles.odHead} onClick={() => setOverdueOpen((o) => !o)} aria-expanded={overdueOpen}>
                      <span style={{ flex: 1 }}>
                        {overdueTotal} {overdueTotal === 1 ? 'item' : 'items'} across {overdueGroups.length} {overdueGroups.length === 1 ? 'location' : 'locations'}
                      </span>
                      <span style={styles.odCount}>{overdueTotal}</span>
                      <span style={styles.chevron}>{overdueOpen ? '▾' : '▸'}</span>
                    </button>
                    {overdueOpen
                      ? overdueGroups.map(([locId, items]) => {
                          const g = locationInfo[locId];
                          const allRenewals = items.every((i) => i.renewalItem);
                          return (
                            <Link
                              key={locId}
                              data-row=""
                              style={styles.odRow}
                              to={g ? '/brand/' + g.brandId + '/location/' + locId + (allRenewals ? '/renewals' : '/opening-checklist?show=overdue') : '/calendar'}
                            >
                              <span style={{ ...styles.filterDot, background: g?.color ?? 'var(--border-strong)' }} />
                              <span style={{ flex: 1, minWidth: 0 }}>{g ? shortBrand(g.brandName) + ' · ' + g.locationName : 'Unknown location'}</span>
                              <span style={styles.odCount}>{items.length}</span>
                              <span style={styles.chevron}>›</span>
                            </Link>
                          );
                        })
                      : null}
                  </div>
                </>
              ) : null}
            </div>
            </>
          )}
        </div>
      </div>

      {formOpen ? (
        <div data-modal="" data-modal-keep="" style={styles.modalBackdrop} onClick={closeForm}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{editingEntry ? 'Edit event' : 'Add event'}</h2>
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
                <WhoNeedsToKnow
                  needs={formNeeds}
                  people={formPeople}
                  onChange={({ needs, people }) => {
                    setFormNeeds(needs);
                    setFormPeople(people);
                  }}
                />
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
        <div data-modal="" style={styles.modalBackdrop} onClick={() => setConfirmingOpeningDate(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Change this due date?</h2>
            <p style={styles.confirmOpeningBody}>
              <strong>{confirmingOpeningDate.entry.title}</strong> will move to{' '}
              <strong>{fmtDay(confirmingOpeningDate.newDate)}</strong> — updated on
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
      {dialogNode}
    </div>
  );
}

const styles = {
  modalDate: { fontSize: 12, color: 'var(--text-tertiary)', margin: '-6px 0 16px' },
  formRow: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  row: { borderTop: '1px solid var(--border)' },
  rowMain: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px 10px 10px', cursor: 'pointer' },
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
  rowBody: { padding: '2px 16px 14px 99px' },
  rowNote: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px' },
  rowActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },

  page: { padding: '32px max(22px, min(40px, 4vw))', minHeight: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
  header: { marginBottom: 24 },
  filterRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  filterRowNarrow: { flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2, marginRight: -22, paddingRight: 22 },
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
  bodyNarrow: { display: 'block', flex: 'none', minHeight: 0, gap: 0 },
  calendarColNarrow: { width: '100%', minWidth: 0 },
  detailColNarrow: { width: '100%', minWidth: 0, paddingTop: 18 },
  backToUpcoming: { background: 'none', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 12px', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  upList: { display: 'flex', flexDirection: 'column', marginTop: 6 },
  upDay: { fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '16px 0 6px' },
  upRow: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 14px', marginBottom: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'left', cursor: 'pointer' },
  upBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, flexShrink: 0 },
  upText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  upTitle: { fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  upWhere: { fontSize: 11.5, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  upTime: { fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 },
  overdueGroupLabel: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '22px 0 8px' },
  overdueGroup: { background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 7, overflow: 'hidden' },
  overdueGroupHead: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', padding: '12px 15px', cursor: 'pointer', textAlign: 'left' },
  overdueChevron: { color: 'var(--text-tertiary)', fontSize: 11 },
  overdueGroupName: { flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' },
  overdueGroupCount: { fontSize: 12, color: 'var(--danger)' },
  overdueGroupBody: { padding: '0 10px 8px' },
  overdueItem: { textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', borderTop: '1px solid var(--border)', padding: '10px 8px', cursor: 'pointer', textAlign: 'left' },
  overdueItemTitle: { flex: 1, fontSize: 13, color: 'var(--text-primary)' },
  overdueItemLabel: { fontSize: 11, color: 'var(--danger)' },
  hint: { color: 'var(--text-secondary)', fontSize: 13 },
  menuButton: { display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'none', fontFamily: 'inherit' },
  menuCatch: { position: 'fixed', inset: 0, zIndex: 40 },
  menu: { position: 'absolute', top: 46, right: 0, width: 270, zIndex: 41, background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 12, padding: 6, display: 'flex', flexDirection: 'column', boxShadow: '0 12px 32px rgba(0,0,0,0.45)' },
  menuItem: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, padding: '0 10px', borderRadius: 8, border: 'none', background: 'none', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', textTransform: 'none', fontFamily: 'inherit' },
  menuItemOn: { background: 'rgba(34,211,238,0.1)', color: 'var(--neon)' },
  menuCount: { fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 },
  menuFoot: { margin: '4px 10px 6px', fontSize: 11, color: 'var(--text-tertiary)' },
  dayCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  dayHead: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border)' },
  dayTitle: { margin: 0, fontSize: 18, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.2, color: '#FFFFFF' },
  dayArrow: { width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-secondary)', fontSize: 16, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  secLabel: { display: 'flex', justifyContent: 'space-between', margin: 0, padding: '14px 18px 6px', fontSize: 10.5, fontWeight: 800, letterSpacing: 0.9, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  rowTime: { width: 62, flexShrink: 0, textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' },
  rowBar: { width: 3, alignSelf: 'stretch', minHeight: 32, borderRadius: 2, flexShrink: 0 },
  odCard: { margin: '4px 16px 16px', border: '1px solid rgba(242,146,141,0.25)', background: 'rgba(242,146,141,0.05)', borderRadius: 10, overflow: 'hidden' },
  odHead: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '0 14px', background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left', textTransform: 'none', fontFamily: 'inherit' },
  odRow: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, padding: '0 14px', borderTop: '1px solid var(--border)', fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none' },
  odCount: { fontSize: 11, fontWeight: 800, color: '#F2928D', background: 'rgba(232,82,75,0.18)', borderRadius: 5, padding: '2px 7px' },
  detailHeaderRow: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
  detailEyebrow: { fontSize: 11, fontWeight: 900, color: 'var(--neon)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 2px' },
  detailTitle: { fontSize: 24, fontWeight: 900, letterSpacing: -0.5, margin: 0, textTransform: 'uppercase', color: '#FFFFFF' },
  confirmOpeningBody: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 18 },
  linkButton: { fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 },

  modalBackdrop: { ...modalBackdrop, zIndex: 100 },
  modalCard: { padding: 24, ...modalSurface, width: 'min(460px, 100%)' },
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
    minHeight: 40,
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
    textTransform: 'none',
  },
};
