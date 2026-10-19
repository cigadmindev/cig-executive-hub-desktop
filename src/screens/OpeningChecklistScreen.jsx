import React, { useEffect, useState } from 'react';
import { useIsNarrow } from '../hooks/useIsNarrow';
import Icon from '../components/Icon';
import { printOpeningSheet } from '../lib/printSheet';
import { assigneesOf, assigneeFields, shortNames, isAssignedTo } from '../data/assignees';
import { assignedWorkOnly } from '../data/accessMatrix';
import { useParams, useNavigate } from 'react-router-dom';
import { brands, canEditChecklists } from '../data/mockData';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useSchedule } from '../context/ScheduleContext';
import { useOpeningInfo } from '../context/OpeningInfoContext';
import { useOpeningOngoingContacts } from '../context/OpeningOngoingContactsContext';
import { TIMELINE_BUCKETS, getOpeningItemUrgency, getBlockingDependencies, getDependentParents, resolveDependencyIds } from '../data/openingChecklistData';
import { getTemplateForLocation, RENEWAL_TYPE_BY_KEY, isProvisionalTemplate } from '../data/checklists';
import { useRenewals, renewalDocId } from '../context/RenewalsContext';
import { useAuth } from '../context/AuthContext';
import ConfirmEditField from '../components/ConfirmEditField';
import ItemDetails from '../components/ItemDetails';
import LocationDetails from '../components/LocationDetails';
import { documentsOf } from '../components/DocumentsField';
import { PHASES, phaseOf, blockersOf, dependentsOf, isLate, startOfDay } from '../lib/openingPlan';
import SignaturePanel, { waitingOn } from '../components/SignaturePanel';
import DatePickerField from '../components/DatePickerField';
import SearchBar from '../components/SearchBar';
import { atLeast } from '../data/accessMatrix';
import { useDialog } from '../hooks/useDialog';
import PageHeader from '../components/PageHeader';
import { fmtDay } from '../lib/dates';
import { modalBackdrop, modalSurface } from '../theme/modal';
import { plainError } from '../lib/errors';

const formatDate = (ts) => (ts ? fmtDay(ts) : null);

export default function OpeningChecklistScreen() {
  const { dialogNode, notify, confirm } = useDialog();
  const { brandId, locationId } = useParams();
  const navigate = useNavigate();
  const { user, activeUsers, hasLocationAccess } = useAuth();
  const isAdmin = user?.role === 'admin';
  // Admins, the COO and the beverage manager can restructure the list itself -
  // add an item, remove one, or put someone's name against it.
  const canEdit = canEditChecklists(user);
  // Tick or Edit can change dates, notes and documents. View rows (Financials,
  // Real Estate) only read - the database refuses their saves, so the screen
  // doesn't offer them (8 Oct 2026).
  // Assigned work only (16 Oct 2026, Ben): just the items given to him, which
  // he can tick off and fill in. Nothing else on the list shows.
  const mineOnly = assignedWorkOnly(user, 'openingChecklist');
  const isNarrow = useIsNarrow();
  const canTick = atLeast(user, 'openingChecklist', 'tick') || mineOnly;

  // Adding items in the app is what removes the need for a per-city template.
  // Birmingham adds its own permits rather than someone writing a checklist
  // definition first.
  const [addingToList, setAddingToList] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [newSection, setNewSection] = useState('');
  const [newSectionCustom, setNewSectionCustom] = useState('');
  const [newDate, setNewDate] = useState('');
  const [savingNew, setSavingNew] = useState(false);

  const openAddForm = (list) => {
    setAddingToList(list);
    setNewTitle('');
    setNewSection('');
    setNewSectionCustom('');
    setNewDate('');
  };

  const handleAddItem = async () => {
    const section = newSection === '__new__' ? newSectionCustom.trim() : newSection;
    if (!newTitle.trim() || !section || !newDate) return;

    setSavingNew(true);
    try {
      // Same shape as a seeded item, minus setupKey - that links to a template
      // entry and this has none. Everything else about it behaves identically:
      // it can be signed off, hold fields and a document, be assigned, and
      // wait on other items.
      await addEntry({
        title: newTitle.trim(),
        locationId,
        openingItem: true,
        openingItemType: addingToList,
        openingSection: section,
        dateTime: new Date(newDate).getTime(),
        setupKey: null,
        openingFields: null,
        note: '',
        done: false,
        doneBy: null,
        doneAt: null,
        attentionFlag: false,
        authorName: user?.name ?? 'Unknown',
      });
      setAddingToList(null);
    } catch (err) {
      notify('Could not add', plainError(err, 'The item was not added. Try again.'));
    } finally {
      setSavingNew(false);
    }
  };

  // Only people who can already open this location. Assigning someone a task
  // they cannot reach would put a row on their home screen that goes nowhere.
  // Access to the location is not enough - they also need to be able to open
  // the checklist. Assigning someone a task they cannot reach would put a row
  // on their home screen that goes nowhere.
  // This location, not just the restaurant, and able to tick (14 Oct 2026).
  const assignableUsers = (activeUsers ?? []).filter(
    (u) => hasLocationAccess(u, brandId, locationId) && (u.role === 'admin' || atLeast(u, 'openingChecklist', 'tick') || u.assignedWork === true)
  );

  // One or several people (15 Oct 2026). The server emails whoever was added
  // and tells whoever was taken off.
  const handleAssign = async (item, uids) => {
    try {
      // Someone already on it who is no longer in the list keeps their name.
      const current = assigneesOf(item);
      const known = [...assignableUsers, ...current.uids.map((uid, i) => ({ uid, name: current.names[i] }))];
      await updateEntry(item.id, assigneeFields(uids, known));
    } catch (err) {
      notify('Could not assign', plainError(err, 'Nothing was changed. Try again.'));
    }
  };

  // Stored on the record rather than the template, so an item added here can
  // wait on something the template has never heard of. Editable at any time
  // by the same three people who can add and assign.
  const handleChangeDependencies = async (item, ids) => {
    try {
      await updateEntry(item.id, { dependsOnIds: ids });
    } catch (err) {
      notify('Could not save', plainError(err, 'Nothing was changed. Try again.'));
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
          notify('Could not delete', plainError(err, 'The item was not removed. Try again.'));
        }
      },
    });
  };
  const brand = brands.find((b) => b.id === brandId);
  const { getByBrand } = useCustomLocations();
  const { updateDates, setRenewalDocument } = useRenewals();
  const { getOpeningItemsByLocation, toggleOpeningItemDone, updateEntry, deleteEntry, addEntry, releaseWaiting } = useSchedule();
  const { getInfo, updateInfoField, setOpeningDate, markOperating, unmarkOperating } = useOpeningInfo();
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
  // Filter chips and the section list (17 Oct 2026, sketch 19).
  const [filter, setFilter] = useState('all');
  const [hideDone, setHideDone] = useState(false);
  const [activeSection, setActiveSection] = useState(null);
  // Operating Checklist (18 Oct 2026): marking open, and the finished timeline.
  const [markOpenDraft, setMarkOpenDraft] = useState(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [markingOpen, setMarkingOpen] = useState(false);
  // By category (Bank, CPA, Liquor License...) or by phase (19 Oct 2026).
  // Category is the default; the choice is remembered on this device.
  const [groupBy, setGroupByState] = useState(() => { try { return localStorage.getItem('openingGroupBy') || 'category'; } catch { return 'category'; } });
  const [showMenu, setShowMenu] = useState(false);
  const setGroupBy = (v) => { setGroupByState(v); try { localStorage.setItem('openingGroupBy', v); } catch { /* private window */ } };

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
  const openingItems = getOpeningItemsByLocation(locationId).filter((i) => !mineOnly || isAssignedTo(i, user?.uid));
  const setupItems = openingItems.filter((i) => i.openingItemType === 'setup');

  const printIt = () => {
    const bySection = (items) => [...new Set(items.map((i) => i.openingSection))].map((section) => ({
      section,
      items: items.filter((i) => i.openingSection === section),
    }));
    // Everything an item holds in the Hub except its documents (18 Oct 2026).
    const sheetItem = (i) => ({
      title: i.title,
      done: i.done,
      due: i.dateTime ? new Date(i.dateTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '',
      assigned: assigneesOf(i).names.join(', '),
      waitsFor: (template ? resolveDependencyIds(i, openingItems, template) : []).map((id) => openingItems.find((o) => o.id === id)?.title).filter(Boolean).join(', '),
      fields: i.openingFields ?? {},
      doneOn: i.doneAt ? fmtDay(i.doneAt) : '',
      docs: documentsOf(i).length,
    });
    // Once open (18 Oct 2026): the record of what was set up, with anything
    // still open from opening first.
    if (info.operating) {
      const okRec = printOpeningSheet({
        location: location?.name ?? '',
        brand: brand?.name ?? '',
        operating: info.operating,
        setup: [
          ...(carried.length ? [{ section: 'Still open from opening', still: true, items: carried.map(sheetItem) }] : []),
          ...bySection(recordItems).map((g) => ({ section: g.section, items: g.items.map(sheetItem) })),
        ],
        timeline: [],
      });
      if (!okRec) notify('Print window blocked', 'Your browser stopped the print window from opening. Allow pop-ups for the Hub and try again.');
      return;
    }
    const ok = printOpeningSheet({
      location: location?.name ?? '',
      brand: brand?.name ?? '',
      openingDate: info.openingDate ?? null,
      setup: bySection(setupItems).map((g) => ({ section: g.section, items: g.items.map(sheetItem) })),
      timeline: TIMELINE_BUCKETS.map((b) => ({
        section: b.label,
        items: openingItems.filter((i) => i.openingItemType === 'timeline' && i.openingSection === b.label)
          .sort((x, y) => (x.dateTime ?? 0) - (y.dateTime ?? 0))
          .map(sheetItem),
      })),
    });
    if (!ok) notify('Print window blocked', 'Your browser stopped the print window from opening. Allow pop-ups for the Hub and try again.');
  };

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
      notify('Could not set the date', plainError(err, 'The checklist was not rebuilt. Try again.'));
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
  // View-only people (who-sees-what table: View) can read the list but not
  // sign items off.
  const requestToggleDone = (item) => {
    if (!atLeast(user, 'openingChecklist', 'tick')) return;
    setConfirmingItem(item);
  };
  const confirmToggleDone = async () => {
    const item = confirmingItem;
    setConfirmingItem(null);
    // Waited for, so a refused or failed save says so instead of looking
    // ticked and quietly not being (8 Oct 2026).
    try {
      await toggleOpeningItemDone(item.id, !item.done, user?.name ?? 'Unknown');
    } catch (err) {
      notify(item.done ? 'Could not un-tick it' : 'Could not sign it off', plainError(err, 'Nothing was changed. Try again.'));
      return;
    }

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
      notify('Could not save', plainError(err, 'The renewal dates were not saved. Try again.'));
    }
  };

  // Anyone can move an individual item's due date — this is separate from
  // setting the overall opening date (admin-only, since that regenerates
  // everything). This just nudges one task. It's the same document the
  // Calendar reads, so the move shows up there automatically too.
  const startEditItemDate = (item) => {
    if (!canTick) return;
    setEditingDateItemId(item.id);
    setItemDateDraft(new Date(item.dateTime).toISOString().slice(0, 10));
  };
  const requestItemDateChange = (item) => {
    if (!itemDateDraft) return;
    setConfirmingItemDate({ item, newDate: new Date(itemDateDraft).getTime() });
  };
  // Waited for, so a refused or failed save says so instead of showing the
  // new date and quietly going back (8 Oct 2026).
  const confirmItemDateChange = async () => {
    const { item, newDate } = confirmingItemDate;
    setConfirmingItemDate(null);
    setEditingDateItemId(null);
    try {
      // Chosen by hand (19 Oct 2026): the re-plan keeps it, and it is no
      // longer late.
      await updateEntry(item.id, { dateTime: newDate, dateSetByHand: true, attentionFlag: false, lateSince: null, slidWhileWaiting: false });
    } catch (err) {
      notify('Could not change the date', plainError(err, 'Nothing was changed. Try again.'));
    }
  };

  const updateSetupField = async (item, field, value) => {
    // The person asked to sign can add the signed copy even without the
    // checklist (10 Oct 2026) - documents only.
    const signer = item.signature?.status === 'waiting' && item.signature.requestedOfUid === user?.uid;
    if (!canTick && !(signer && field === '__documents')) return;
    try {
      // The document sits at the top level rather than inside openingFields —
      // it's a file reference, not a text field, and the renewal record reads
      // it from there when a permit is signed off.
      // Several documents now (10 Oct 2026); the first is still the one the
      // renewal record carries.
      if (field === '__documents') {
        const first = value[0] ?? null;
        await updateEntry(item.id, { documents: value, document: first });
        const type = RENEWAL_TYPE_BY_KEY[item.setupKey];
        if (type && (first?.path ?? null) !== (item.document?.path ?? null)) await setRenewalDocument(renewalDocId(locationId, type), first);
        return;
      }
      if (field === '__document') {
        // The checklist first: if that is refused, the renewal record is not
        // changed either, so the two never disagree.
        await updateEntry(item.id, { document: value });
        // Both places hold the same permit, so attaching it once should be
        // enough. Waiting for sign-off meant a document could sit on the
        // checklist for weeks while the renewal record showed nothing.
        const type = RENEWAL_TYPE_BY_KEY[item.setupKey];
        if (type) await setRenewalDocument(renewalDocId(locationId, type), value);
        return;
      }
      await updateEntry(item.id, { openingFields: { ...item.openingFields, [field]: value } });
    } catch (err) {
      notify('Could not save', plainError(err, 'Nothing was changed. Try again.'));
    }
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

  // ---- The page's numbers, filters and sections (17 Oct 2026) ----
  const DAY = 24 * 60 * 60 * 1000;
  const timelineItems = openingItems.filter((i) => i.openingItemType === 'timeline');
  const allDone = openingItems.filter((i) => i.done).length;
  const allPct = openingItems.length ? Math.round((allDone / openingItems.length) * 100) : 0;
  const daysToOpen = info.openingDate ? Math.ceil((info.openingDate - now) / DAY) : null;
  // Waiting is not late (19 Oct 2026, sketch 24): an item is overdue only
  // when it could have been done and wasn't.
  const blockersFor = (i) => blockersOf(i, setupItems, template);
  const isWaiting = (i) => !i.done && blockersFor(i).length > 0;
  const isOverdue = (i) => isLate(i, isWaiting(i), now);
  const isWaitingSignature = (i) => !i.done && i.signature?.status === 'waiting';
  const weekEnd = startOfDay(now) + 7 * DAY;
  const isDueThisWeek = (i) => !i.done && !isWaiting(i) && !isOverdue(i) && i.dateTime != null && i.dateTime < weekEnd;
  const isAtRisk = (i) => !i.done && !!i.atRisk;
  const counts = {
    overdue: openingItems.filter(isOverdue).length,
    mine: openingItems.filter((i) => !i.done && isAssignedTo(i, user?.uid)).length,
    signature: openingItems.filter(isWaitingSignature).length,
    week: openingItems.filter(isDueThisWeek).length,
    waiting: openingItems.filter(isWaiting).length,
    atRisk: openingItems.filter(isAtRisk).length,
  };
  const currentPhase = PHASES.find((ph) => setupItems.some((i) => !i.done && phaseOf(i, template) === ph.n));
  // ---- Operating Checklist (18 Oct 2026, sketch 23) ----
  // Once an admin marks the restaurant open, the set-up items are its record:
  // what was set up, with the company, account, permit and documents. Anything
  // not finished from opening stays on top until it is done.
  const operating = !!info.operating;
  const isRecord = (i) => i.done || i.recordOnly;
  const carried = openingItems.filter((i) => !isRecord(i));
  const recordItems = setupItems.filter(isRecord);
  const hasDetails = (i) => Object.values(i.openingFields ?? {}).some((v) => String(v ?? '').trim()) || documentsOf(i).length > 0;
  const expiryDays = (i) => {
    const e = i.openingFields?.expiry;
    const t = e ? new Date(String(e).length === 10 ? e + 'T12:00:00' : e).getTime() : NaN;
    return Number.isFinite(t) ? Math.ceil((t - now) / DAY) : null;
  };
  const expiresSoon = (i) => { const d = expiryDays(i); return d != null && d <= 60; };
  const opCounts = {
    record: recordItems.length,
    missing: recordItems.filter((i) => !hasDetails(i)).length,
    docs: recordItems.reduce((a, i) => a + documentsOf(i).length, 0),
    withDocs: recordItems.filter((i) => documentsOf(i).length).length,
    expiring: recordItems.filter(expiresSoon).length,
    open: carried.length,
  };
  const passesOp = (i) =>
    filter === 'all' ||
    (filter === 'missing' && !hasDetails(i)) ||
    (filter === 'docs' && documentsOf(i).length > 0) ||
    (filter === 'expiring' && expiresSoon(i));

  // The Show menu's choices (sketch 26 B), with their counts.
  const filterOptions = (operating ? [
    ['all', 'All items', null],
    ['missing', 'Missing details', opCounts.missing],
    ['docs', 'Has documents', opCounts.withDocs],
    ['expiring', 'Expires soon', opCounts.expiring],
  ] : [
    ['all', 'All items', null],
    ['week', 'Due this week', counts.week],
    ['waiting', 'Waiting on another item', counts.waiting],
    ['risk', 'At risk', counts.atRisk],
    ['overdue', 'Overdue', counts.overdue],
    ['mine', 'Assigned to me', counts.mine],
    ['signature', 'Waiting on a signature', counts.signature],
  ]).filter(([key]) => !(mineOnly && key === 'mine'));
  const currentFilter = filterOptions.find(([key]) => key === filter) ?? filterOptions[0];
  const SHORT = { all: 'All', week: 'This week', waiting: 'Waiting', risk: 'At risk', overdue: 'Overdue', mine: 'Mine', signature: 'Signature', missing: 'Missing', docs: 'Documents', expiring: 'Expiring' };
  const shortLabel = ([key]) => SHORT[key] ?? 'All';
  const countTone = (key) => (key === 'risk' || key === 'expiring' ? { color: 'var(--warn)' } : key === 'overdue' ? { color: 'var(--danger)' } : {});

  const passes = (i) =>
    (!hideDone || !i.done) &&
    (filter === 'all' ||
      (filter === 'overdue' && isOverdue(i)) ||
      (filter === 'week' && isDueThisWeek(i)) ||
      (filter === 'waiting' && isWaiting(i)) ||
      (filter === 'risk' && isAtRisk(i)) ||
      (filter === 'mine' && isAssignedTo(i, user?.uid)) ||
      (filter === 'signature' && isWaitingSignature(i)));
  const slug = (t) => 'sec-' + String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const sectionOf = (prefix, name, all, visible) => ({
    id: slug(prefix + '-' + name),
    name,
    total: all.length,
    done: all.filter((i) => i.done).length,
    shown: visible.filter(passes),
  });
  const navGroups = [
    {
      // The paper's categories, in the template's order, or the four phases.
      label: 'Initial set-up',
      sections: groupBy === 'category'
        ? [...new Set([...template.items.map((t) => t.section), ...setupItems.map((i) => i.openingSection)])]
          .filter((name) => setupItems.some((i) => i.openingSection === name))
          .map((name) => sectionOf('setup', name, setupItems.filter((i) => i.openingSection === name), visibleSetupItems.filter((i) => i.openingSection === name)))
        : PHASES.filter((ph) => setupItems.some((i) => phaseOf(i, template) === ph.n)).map((ph) => ({
        ...sectionOf('phase', ph.label, setupItems.filter((i) => phaseOf(i, template) === ph.n), visibleSetupItems.filter((i) => phaseOf(i, template) === ph.n)),
        num: ph.n,
        blurb: ph.blurb,
      })),
    },
    {
      label: 'Opening timeline',
      sections: TIMELINE_BUCKETS.filter((b) => timelineItems.some((i) => i.openingSection === b.label)).map((b) =>
        sectionOf('timeline', b.label, timelineItems.filter((i) => i.openingSection === b.label), visibleTimelineItems.filter((i) => i.openingSection === b.label))
      ),
    },
  ].filter((g) => g.sections.length);
  if (operating) {
    const visible = (i) => matchesQuery(i.title);
    const opGroups = [];
    if (carried.length) {
      opGroups.push({
        label: 'Still open', tone: 'carried',
        sections: [{ id: 'sec-still-open', name: 'From opening', total: carried.length, done: 0, countOnly: true, shown: carried.filter(visible) }],
      });
    }
    opGroups.push({
      label: 'On record',
      sections: [...new Set(recordItems.map((i) => i.openingSection))].map((name) => {
        const all = recordItems.filter((i) => i.openingSection === name);
        return { id: slug('record-' + name), name, total: all.length, done: all.length, countOnly: true, record: true, shown: all.filter((i) => visible(i) && passesOp(i)) };
      }),
    });
    if (showTimeline) {
      opGroups.push({
        label: 'Opening timeline (finished)',
        sections: TIMELINE_BUCKETS.map((b) => {
          const all = timelineItems.filter((i) => i.openingSection === b.label && i.done);
          return { id: slug('done-' + b.label), name: b.label, total: all.length, done: all.length, countOnly: true, shown: all.filter(visible) };
        }).filter((x) => x.total),
      });
    }
    navGroups.splice(0, navGroups.length, ...opGroups.filter((g) => g.sections.length));
  }

  // Jump to a section. If the filter is hiding it, clear the filter first.
  const jumpTo = (id) => {
    setActiveSection(id);
    const go = () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!document.getElementById(id)) {
      setFilter('all');
      setHideDone(false);
      setSearchQuery('');
      setTimeout(go, 60);
    } else go();
  };

  const initial = (n) => (n ?? '?').trim().charAt(0).toUpperCase();
  const opStats = (
    <div style={isNarrow ? styles.heroStatsNarrow : styles.heroStats}>
      <div><b style={styles.heroNum}>{opCounts.record}</b><span style={styles.heroLabel}>On record</span></div>
      <div><b style={{ ...styles.heroNum, color: opCounts.missing ? 'var(--warn)' : 'var(--text-tertiary)' }}>{opCounts.missing}</b><span style={styles.heroLabel}>Missing details</span></div>
      <div><b style={styles.heroNum}>{opCounts.docs}</b><span style={styles.heroLabel}>Documents</span></div>
      <div><b style={{ ...styles.heroNum, color: opCounts.open ? 'var(--warn)' : 'var(--text-tertiary)' }}>{opCounts.open}</b><span style={styles.heroLabel}>Still open from opening</span></div>
    </div>
  );
  // Under the title on a computer; across the whole card on a phone.
  const heroStats = (
    <div style={isNarrow ? styles.heroStatsNarrow : styles.heroStats}>
      <div><b style={{ ...styles.heroNum, color: counts.week ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{counts.week}</b><span style={styles.heroLabel}>Due this week</span></div>
      <div><b style={{ ...styles.heroNum, color: 'var(--text-tertiary)' }}>{counts.waiting}</b><span style={styles.heroLabel}>Waiting on another item</span></div>
      <div><b style={{ ...styles.heroNum, color: counts.atRisk ? 'var(--warn)' : 'var(--text-tertiary)' }}>{counts.atRisk}</b><span style={styles.heroLabel}>At risk</span></div>
      <div><b style={{ ...styles.heroNum, color: counts.overdue ? 'var(--danger)' : 'var(--success)' }}>{counts.overdue}</b><span style={styles.heroLabel}>Overdue</span></div>
    </div>
  );

  // One row, the same for Set-up and Timeline. Who has it (initials), one
  // status pill only when something is off, and the date. Opened, it shows
  // the item card from sketch 20.
  const renderItem = (item) => {
    const isSetup = item.openingItemType === 'setup';
    const blockedBy = isSetup ? getBlockingDependencies(item, setupItems, template) : [];
    const isLocked = blockedBy.length > 0 && !item.done;
    const neededFor = isSetup ? getDependentParents(item, template) : [];
    const isOpen = expandedItemId === item.id;
    const overdue = isOverdue(item);
    // From the date it was due when it first went late, not today's roll-forward.
    const daysLate = overdue ? Math.max(1, Math.floor((startOfDay(now) - startOfDay(item.lateSince ?? item.dateTime)) / DAY)) : 0;
    const holdingUp = overdue && isSetup ? dependentsOf(item, setupItems, template) : [];
    const atRisk = isAtRisk(item);
    const who = assigneesOf(item);
    const description = describeItem(item.setupKey);
    const waiting = !item.done ? waitingOn(item) : null;

    const pill = item.done ? (
      <span style={styles.rowMeta}>{item.doneBy || 'Done'}</span>
    ) : waiting ? (
      <span style={styles.waitingPill}>Waiting on {waiting.split(' ')[0]}</span>
    ) : isLocked && isNarrow ? null : isLocked ? (
      // Grey, never red: it cannot start yet (19 Oct 2026).
      <span style={styles.lockedPill} title={'Waiting on ' + blockedBy.join(', ')}>
        Waiting on {blockedBy[0]}{blockedBy.length > 1 ? ' +' + (blockedBy.length - 1) : ''}
      </span>
    ) : overdue ? (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        {holdingUp.length && !isNarrow ? <span style={styles.holdingPill}>Holding up {holdingUp.length}</span> : null}
        <span style={styles.latePill}>{daysLate === 1 ? '1 day late' : daysLate + ' days late'}</span>
      </span>
    ) : atRisk ? (
      <span style={styles.waitingPill} title="Won't fit before opening at this pace">At risk</span>
    ) : null;

    const openDateEditor = (e) => {
      e?.stopPropagation();
      setExpandedItemId(item.id);
      startEditItemDate(item);
    };

    const actions = (
      <>
        {canTick && !isLocked ? (
          <button style={item.done ? styles.ghostSmall : styles.primarySmall} onClick={() => requestToggleDone(item)}>
            {item.done ? 'Undo done' : isNarrow ? '✓ Done' : '✓ Mark done'}
          </button>
        ) : null}
        {canTick && !item.done ? (
          <button style={styles.ghostSmall} onClick={openDateEditor}>
            {isNarrow ? fmtDay(item.dateTime) : fmtDay(item.dateTime) + ' · Change date'}
          </button>
        ) : (
          <span style={styles.barDate}>{fmtDay(item.dateTime)}</span>
        )}
        <SignaturePanel
          compact={isNarrow}
          item={item}
          me={user}
          canRequest={canTick && !mineOnly}
          people={assignableUsers}
          save={async (fields) => { await updateEntry(item.id, fields); if (fields.done) releaseWaiting({ ...item, done: true }); }}
          notify={notify}
        />
      </>
    );

    const intro =
      description || neededFor.length || isLocked || holdingUp.length || atRisk || (item.done && item.doneBy) || editingDateItemId === item.id ? (
        <>
          {/* Looked up from the template rather than stored on each record:
              one description per item type, so a wording change reaches
              every location at once. */}
          {description ? <p style={styles.itemDescription}>{description}</p> : null}
          {isLocked ? <p style={styles.neededForNote}>Waiting on {blockedBy.join(', ')}. It can't be ticked until {blockedBy.length > 1 ? 'they are' : 'that is'} done, and it is never counted as late while it waits.</p> : null}
          {holdingUp.length ? <p style={{ ...styles.neededForNote, color: 'var(--danger)' }}>Holding up {holdingUp.map((d) => d.title).join(', ')}.</p> : null}
          {atRisk && !item.done ? <p style={{ ...styles.neededForNote, color: 'var(--warn)' }}>At risk: this won't fit before opening at the current pace. Push it, or talk about the opening date.</p> : null}
          {neededFor.length > 0 ? <p style={styles.neededForNote}>Needed for {neededFor.join(', ')}</p> : null}
          {item.done && item.doneBy ? <p style={styles.neededForNote}>Signed off by {item.doneBy}</p> : null}
          {editingDateItemId === item.id ? (
            <div style={styles.dateEditRow}>
              <DatePickerField value={itemDateDraft} onChange={setItemDateDraft} />
              <button style={styles.saveDateButton} onClick={() => requestItemDateChange(item)}>
                Save
              </button>
              <button style={styles.cancelDateButton} onClick={() => setEditingDateItemId(null)}>
                Cancel
              </button>
            </div>
          ) : null}
        </>
      ) : null;

    return (
      <div key={item.id} style={styles.row}>
        {/* The whole row toggles - a chevron alone is a tiny target. */}
        <div
          style={{
            ...styles.rowMain,
            ...(overdue ? styles.rowOverdue : {}),
            ...(isOpen ? styles.rowOpen : {}),
          }}
          data-row=""
          onClick={() => setExpandedItemId(isOpen ? null : item.id)}
        >
          <button
            className="hit-40"
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
            aria-label={item.done ? 'Undo ' + item.title : 'Tick off ' + item.title}
            title={isLocked ? `Locked — requires: ${blockedBy.join(', ')}` : undefined}
          >
            {item.done ? '✓' : isLocked ? '–' : ''}
          </button>

          <span style={styles.rowText}>
            <span style={{ ...styles.rowTitle, ...(item.done ? styles.rowTitleDone : {}), ...(isOpen ? { fontWeight: 700 } : {}) }}>{item.title}</span>
            {isNarrow ? (
              <span style={styles.rowSub}>
                {[who.uids.length ? shortNames(who.names) : null, isLocked && !item.done ? 'Waiting on ' + blockedBy[0] + (blockedBy.length > 1 ? ' +' + (blockedBy.length - 1) : '') : null, (isLocked && !item.done ? 'then by ' : '') + fmtDay(item.dateTime)].filter(Boolean).join(' · ')}
              </span>
            ) : null}
          </span>

          {!isNarrow && who.uids.length ? (
            <span style={styles.avatars} title={who.names.join(', ')}>
              {who.names.slice(0, 3).map((n, i) => (
                <span key={i} style={{ ...styles.avatar, ...(i ? { marginLeft: -6 } : {}) }}>{initial(n)}</span>
              ))}
              {who.names.length > 3 ? <span style={{ ...styles.avatar, marginLeft: -6 }}>+{who.names.length - 3}</span> : null}
            </span>
          ) : null}

          {pill}

          {isNarrow || item.done ? null : canTick ? (
            <button style={{ ...styles.rowDateButton, ...(isLocked ? { color: 'var(--text-tertiary)' } : {}) }} onClick={openDateEditor}>{isLocked ? 'Then by ' : ''}{fmtDay(item.dateTime)}</button>
          ) : (
            <span style={styles.rowMeta}>{isLocked ? 'Then by ' : ''}{fmtDay(item.dateTime)}</span>
          )}

          <span style={styles.chevron}>{isOpen ? '▾' : '▸'}</span>
        </div>

        {isOpen ? (
          <div style={isNarrow ? styles.detailCardNarrow : styles.detailCard} data-reveal="">
            <ItemDetails
              item={item}
              actions={actions}
              intro={intro}
              onSave={updateSetupField}
              readOnly={!canTick}
              canAddDocuments={item.signature?.status === 'waiting' && item.signature.requestedOfUid === user?.uid}
              locationId={locationId}
              userName={user?.name}
              assignableUsers={canEdit ? assignableUsers : null}
              onAssign={canEdit ? handleAssign : null}
              onDeleteItem={canEdit ? handleDeleteItem : null}
              dependencyOptions={canEdit ? openingItems : null}
              onChangeDependencies={canEdit ? handleChangeDependencies : null}
              templateDependencyIds={canEdit ? resolveDependencyIds(item, openingItems, template) : null}
            />
          </div>
        ) : null}
      </div>
    );
  };

  // One record row (Operating Checklist): the main details, how many
  // documents, and when it was done. Opened, the same card as the checklist,
  // so anything can still be filled in or attached.
  const renderRecord = (item) => {
    const isOpen = expandedItemId === item.id;
    const f = item.openingFields ?? {};
    const parts = [
      f.company ? ['Company', f.company] : null,
      f.accountNumber ? ['Acct', f.accountNumber] : null,
      f.reference ? ['Permit #', f.reference] : null,
      f.contact && !f.company ? ['Contact', f.contact] : null,
    ].filter(Boolean).slice(0, 2);
    const docs = documentsOf(item).length;
    const exp = expiryDays(item);
    const filledIn = hasDetails(item);
    const description = describeItem(item.setupKey);
    return (
      <div key={item.id} style={styles.row}>
        <div style={{ ...styles.recRow, ...(isNarrow ? styles.recRowNarrow : {}), ...(isOpen ? styles.rowOpen : {}) }} data-row="" onClick={() => setExpandedItemId(isOpen ? null : item.id)}>
          <span style={filledIn ? styles.recOk : styles.recMissing} title={filledIn ? 'Details filled in' : 'Details missing'}>{filledIn ? '✓' : ''}</span>
          <span style={styles.rowText}>
            <span style={{ ...styles.rowTitle, ...(isOpen ? { fontWeight: 700 } : {}) }}>{item.title}</span>
            {isNarrow ? (
              <span style={{ ...styles.rowSub, ...(filledIn ? {} : { color: 'var(--warn)' }) }}>
                {parts.length ? parts.map(([k, v]) => k + ' ' + v).join(' · ') : 'Missing details'}{docs ? ' · ' + docs + (docs === 1 ? ' document' : ' documents') : ''}
              </span>
            ) : null}
          </span>
          {isNarrow ? null : (
            <span style={{ ...styles.recDetail, ...(filledIn ? {} : { color: 'var(--warn)' }) }}>
              {parts.length ? parts.map(([k, v], n) => <span key={k}>{n ? ' · ' : ''}<b style={styles.recKey}>{k}</b>{v}</span>) : 'Missing details'}
            </span>
          )}
          {isNarrow ? null : <span style={docs ? styles.recDocs : styles.recNoDocs}>{docs ? docs + (docs === 1 ? ' document' : ' documents') : 'No documents'}</span>}
          {exp != null && exp <= 60 ? (
            <span style={exp < 0 ? styles.latePill : styles.waitingPill}>{exp < 0 ? 'Expired' : 'Expires in ' + exp + 'd'}</span>
          ) : isNarrow ? null : (
            <span style={styles.recWhen}>{item.doneAt ? fmtDay(item.doneAt) : ''}</span>
          )}
          <span style={styles.chevron}>{isOpen ? '▾' : '▸'}</span>
        </div>
        {isOpen ? (
          <div style={isNarrow ? styles.detailCardNarrow : styles.detailCard} data-reveal="">
            <ItemDetails
              item={item}
              intro={description || item.doneBy ? (
                <>
                  {description ? <p style={styles.itemDescription}>{description}</p> : null}
                  {item.doneBy ? <p style={styles.neededForNote}>Done by {item.doneBy}{item.doneAt ? ' · ' + fmtDay(item.doneAt) : ''}</p> : null}
                </>
              ) : null}
              onSave={updateSetupField}
              readOnly={!canTick}
              locationId={locationId}
              userName={user?.name}
              assignableUsers={null}
              onDeleteItem={canEdit ? handleDeleteItem : null}
            />
          </div>
        ) : null}
      </div>
    );
  };

  const startMarkOpen = () => setMarkOpenDraft(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }));
  const confirmMarkOpen = async () => {
    setMarkingOpen(true);
    try {
      await markOperating(locationId, markOpenDraft ? new Date(markOpenDraft + 'T12:00:00').getTime() : Date.now());
      setMarkOpenDraft(null);
      setFilter('all');
      setHideDone(false);
    } catch (err) {
      notify('Could not mark it open', plainError(err, 'Nothing was changed. Try again.'));
    } finally {
      setMarkingOpen(false);
    }
  };
  const backToOpening = () => confirm({
    title: 'Back to the Opening Checklist?',
    body: 'The checklist goes back to being the Opening Checklist, with its countdown and due dates. Nothing on it is deleted.',
    confirmLabel: 'Back to opening',
    onConfirm: () => unmarkOperating(locationId).catch((err) => notify('Could not change it', plainError(err, 'Try again.'))),
  });

  return (
    <div style={styles.page}>
      <PageHeader
        back={{ to: `/brand/${brand.id}/location/${location.id}`, label: location.name }}
        title={operating ? 'Operating Checklist' : 'Opening Checklist'}
        subtitle={operating ? "This location's permits, accounts, contacts and documents — what was set up, and where to find it." : 'Everything that has to happen before this location opens, and who is doing it.'}
        phoneExtras="inline"
        extras={
          <>
            {/* A sheet to fill in by hand (16 Oct 2026). */}
            {openingItems.length && !mineOnly ? (
              // On a phone just the printer icon, beside the search icon
              // (17 Oct 2026) - the words squeezed the title to one letter wide.
              <button style={isNarrow ? styles.printIcon : styles.printButton} onClick={printIt} title="Print a fill-in sheet" aria-label="Print a fill-in sheet">
                <Icon name="printer" size={16} />{isNarrow ? null : <span>{operating ? 'Print record' : 'Print fill-in sheet'}</span>}
              </button>
            ) : null}
            <SearchBar query={searchQuery} onChange={setSearchQuery} suggestions={searchSuggestions} placeholder={operating ? 'Search items…' : 'Search tasks…'} />
            {/* Admins only (18 Oct 2026): the restaurant is open. */}
            {isAdmin && !operating && !mineOnly && !isNarrow ? (
              <button style={styles.markOpenButton} onClick={startMarkOpen}>Mark as open</button>
            ) : null}
          </>
        }
        actionLabel={canEdit && (info.openingDate || operating) ? '+ Add item' : null}
        onAction={() => openAddForm('setup')}
      />
      {q ? <p style={styles.searchHint}>Showing results for "{searchQuery}" across Initial Set-Up and Timeline.</p> : null}

      {mineOnly ? (
        <p style={styles.mineOnlyNote}>Showing only what's assigned to you at {location?.name ?? 'this location'}.</p>
      ) : (
      <div style={styles.summaryCard}>
        {/* One summary card (17 Oct 2026, sketch 19): the opening date and
            countdown, how far along it is, and the numbers that matter. The
            location details people use most show at a glance; the rest fold
            away behind "Show all location details". */}
        {operating ? (
          <div style={isNarrow ? styles.heroNarrow : styles.hero}>
            <div style={{ ...styles.openBadge, ...(isNarrow ? styles.openBadgeSmall : {}) }}>OPEN</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={styles.heroTitle}>Open since {new Date(info.operating.openedOn ?? info.operating.at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
              <div style={styles.heroSub}>Marked open{info.operating.byName ? ' by ' + info.operating.byName : ''} · {Math.max(0, Math.floor((now - (info.operating.openedOn ?? info.operating.at)) / DAY))} days</div>
              {isNarrow ? null : opStats}
            </div>
            {isNarrow ? opStats : null}
            <div style={isNarrow ? styles.heroSideNarrow : styles.heroSide}>
              {timelineItems.some((i) => i.done) ? (
                <button style={styles.textLink} onClick={() => setShowTimeline((v) => !v)}>{showTimeline ? 'Hide the opening timeline' : 'Opening timeline (finished)'}</button>
              ) : null}
              {isAdmin ? <button style={styles.textLink} onClick={backToOpening}>Back to opening</button> : null}
            </div>
          </div>
        ) : (
        <div style={isNarrow ? styles.heroNarrow : styles.hero}>
          {/* A thin ring drawn around the number, with nothing behind the
              number itself, so the percent always reads (17 Oct 2026). */}
          <div style={{ ...styles.ring, ...(isNarrow ? styles.ringSmall : {}) }}>
            <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden="true">
              <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
              <circle cx="50" cy="50" r="44" fill="none" stroke="var(--neon)" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${(allPct / 100) * 2 * Math.PI * 44} ${2 * Math.PI * 44}`} style={{ display: allPct ? 'block' : 'none' }} />
            </svg>
            <span style={isNarrow ? styles.ringTextSmall : styles.ringText}>{allPct}%</span>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={styles.heroTitle}>
              {info.openingDate ? 'Opens ' + new Date(info.openingDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'No opening date yet'}
            </div>
            <div style={styles.heroSub}>
              {info.openingDate ? (daysToOpen >= 0 ? daysToOpen + (daysToOpen === 1 ? ' day' : ' days') + ' to go · ' : 'Opened · ') : ''}
              {allDone} of {openingItems.length} done
              {currentPhase ? ' · Now in phase ' + currentPhase.n + ' · ' + currentPhase.label : ''}
            </div>
            {isNarrow ? null : heroStats}
          </div>
          {isNarrow ? heroStats : null}
          <div style={isNarrow ? styles.heroSideNarrow : styles.heroSide}>
            {isProvisionalTemplate(locationId) && info.checkedForArea ? (
              <div style={styles.checkedNote}>
                <span>Checked for {location?.name ?? 'this location'} by {info.checkedForArea.byName} · {new Date(info.checkedForArea.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                {isAdmin ? (
                  <button style={styles.checkedUndo} onClick={() => updateInfoField(locationId, 'checkedForArea', null).catch((err) => notify('Could not save', plainError(err, 'Try again.')))}>Undo</button>
                ) : null}
              </div>
            ) : null}
            {isAdmin && info.openingDate && !dateDraft ? (
              <button style={styles.textLink} onClick={() => setDateDraft(new Date(info.openingDate).toISOString().slice(0, 10))}>
                Change opening date
              </button>
            ) : null}
            {/* Sketch 24: the preview first, then apply. */}
            {canEdit && info.openingDate && !mineOnly ? (
              <button style={styles.textLink} onClick={() => navigate('/opening-replan?location=' + locationId)}>Re-plan dates</button>
            ) : null}
            {/* On a phone the header has no room for it (18 Oct 2026). */}
            {isAdmin && !mineOnly && isNarrow ? (
              <button style={styles.markOpenButton} onClick={startMarkOpen}>Mark as open</button>
            ) : null}
          </div>
        </div>
        )}

        {!operating && isAdmin && (dateDraft || !info.openingDate) ? (
          <div style={styles.cardBlock}>
            <p style={styles.label}>Projected opening date</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1, maxWidth: 360 }}>
                <DatePickerField value={dateDraft} onChange={setDateDraft} placeholder="Set opening date" />
              </div>
              <button style={styles.setDateButton} onClick={handleSetOpeningDate} disabled={!dateDraft}>
                {info.openingDate ? 'Update' : 'Set date'}
              </button>
              {info.openingDate ? (
                <button style={styles.cancelDateButton} onClick={() => setDateDraft('')}>Cancel</button>
              ) : null}
            </div>
            {/* Shown only while the date is being changed. */}
            {dateDraft ? (
              <p style={styles.hint}>
                {info.openingDate
                  ? 'Re-spreads unfinished tasks across the new window and adds anything missing. Completed work keeps its date.'
                  : 'Builds the checklist and spreads it across the calendar, with permits landing after everything they depend on.'}
              </p>
            ) : null}
          </div>
        ) : null}
        {!operating && !isAdmin && !info.openingDate ? <div style={styles.cardBlock}><p style={styles.hint}>Ask an admin to set the opening date to generate the checklist below.</p></div> : null}

        {/* A location with no template of its own falls back to Starkville's.
            Until an admin checks it for this area (16 Oct 2026) the yellow
            note stays, for everyone. */}
        {!operating && isProvisionalTemplate(locationId) && !info.checkedForArea ? (
          <div style={styles.cardBlock}>
            <div style={styles.provisionalNote}>
              This checklist is based on Starkville and has not been verified for this city. Permits and timelines may
              differ — check with the local authority before relying on it.
            </div>
            {isAdmin ? (
              <button style={styles.checkAreaButton} onClick={() => confirm({
                title: 'Mark as checked for ' + (location?.name ?? 'this location') + '?',
                body: 'You have gone through this checklist and it is right for this area. The yellow note goes away for everyone.',
                confirmLabel: 'Mark as checked',
                onConfirm: () => updateInfoField(locationId, 'checkedForArea', { byName: user?.name ?? '', at: Date.now() })
                  .catch((err) => notify('Could not save', plainError(err, 'Try again.'))),
              })}>
                Mark as checked for {location?.name ?? 'this location'}
              </button>
            ) : null}
          </div>
        ) : null}

        <LocationDetails
          info={info}
          canEdit={canTick && !mineOnly}
          onSave={(field, value) => updateInfoField(locationId, field, value)}
          notify={notify}
        />
      </div>
      )}

      {openingItems.length === 0 && !operating ? (
        <div style={styles.section}>
          <p style={styles.hint}>{mineOnly ? 'Nothing on this checklist is assigned to you.' : 'Set an opening date above to generate this checklist.'}</p>
        </div>
      ) : (
      <div style={isNarrow ? styles.layoutNarrow : styles.layout}>
        {/* Every section with its progress (17 Oct 2026). A column on a
            computer; chips you scroll sideways on a phone. Tapping one jumps
            to it. */}
        {isNarrow ? (
          <div style={styles.navChips}>
            {navGroups.flatMap((g) => g.sections).map((s) => (
              <button key={s.id} style={{ ...styles.navChip, ...(activeSection === s.id ? styles.navChipOn : {}) }} onClick={() => jumpTo(s.id)}>
                {s.num ? s.num + ' ' : ''}{s.name} <span style={styles.navChipCount}>{s.countOnly ? s.total : s.done + '/' + s.total}</span>
              </button>
            ))}
          </div>
        ) : (
          <div style={styles.nav}>
            {navGroups.map((g) => (
              <div key={g.label}>
                <p style={styles.navGroup}>{g.label}</p>
                {g.sections.map((s) => (
                  <button key={s.id} style={{ ...styles.navItem, ...(activeSection === s.id ? styles.navItemOn : {}) }} onClick={() => jumpTo(s.id)}>
                    {s.num ? <span style={{ ...styles.phaseNum, ...(activeSection === s.id ? styles.phaseNumOn : {}) }}>{s.num}</span> : null}
                    <span style={styles.navName}>{s.name}</span>
                    {s.countOnly || s.num ? null : <span style={styles.navMini}><span style={{ ...styles.navMiniFill, width: (s.total ? Math.round((s.done / s.total) * 100) : 0) + '%' }} /></span>}
                    <span style={{ ...styles.navCount, ...(g.tone === 'carried' ? { color: 'var(--warn)' } : {}), ...(activeSection === s.id ? { color: 'var(--neon)' } : {}) }}>{s.countOnly ? s.total : s.done + '/' + s.total}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        <div style={styles.listCard}>
          {/* One row (19 Oct 2026, sketch 26 B): how set-up is grouped, a
              Show menu holding the filters and their counts, and Hide done. */}
          <div style={styles.filters}>
            {operating ? null : (
              <div style={styles.seg} role="group" aria-label="Group set-up by">
                {[['category', isNarrow ? 'Category' : 'By category'], ['phase', isNarrow ? 'Phase' : 'By phase']].map(([k, label]) => (
                  <button key={k} style={{ ...styles.segBtn, ...(groupBy === k ? styles.segOn : {}) }} onClick={() => setGroupBy(k)} aria-pressed={groupBy === k}>{label}</button>
                ))}
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <button style={styles.showBtn} onClick={() => setShowMenu((v) => !v)} aria-expanded={showMenu} aria-haspopup="menu">
                {isNarrow ? null : <span style={{ color: 'var(--text-tertiary)' }}>Show:</span>}
                <b style={styles.showVal}>{isNarrow ? shortLabel(currentFilter) : currentFilter[1]}</b>
                {filter !== 'all' && currentFilter[2] != null ? <span style={{ ...styles.menuCount, ...countTone(currentFilter[0]) }}>{currentFilter[2]}</span> : null}
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>▾</span>
              </button>
              {showMenu ? (
                <>
                  <div style={styles.menuCatch} onClick={() => setShowMenu(false)} />
                  <div style={{ ...styles.menu, ...(isNarrow ? styles.menuNarrow : {}) }} role="menu">
                    {filterOptions.map(([key, label, n]) => (
                      <button key={key} role="menuitemradio" aria-checked={filter === key} style={{ ...styles.menuItem, ...(filter === key ? styles.menuItemOn : {}) }} onClick={() => { setFilter(key); setShowMenu(false); }}>
                        <span>{label}</span>
                        {n != null ? <span style={{ ...styles.menuCount, ...(n ? countTone(key) : {}) }}>{n}</span> : null}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
            <span style={{ flex: 1 }} />
            {operating ? null : (
              <button style={styles.toggle} onClick={() => setHideDone((v) => !v)} role="switch" aria-checked={hideDone}>
                <span style={{ ...styles.switchTrack, ...(hideDone ? styles.switchOn : {}) }}><span style={{ ...styles.switchKnob, ...(hideDone ? styles.switchKnobOn : {}) }} /></span>
                Hide done
              </button>
            )}
          </div>

          {navGroups.every((g) => g.sections.every((s) => s.shown.length === 0)) ? (
            <p style={{ ...styles.hint, padding: '16px' }}>
              {q ? `Nothing matches "${searchQuery}".` : 'Nothing here with this filter.'}
            </p>
          ) : null}

          {navGroups.map((g) =>
            g.sections.some((s) => s.shown.length) ? (
              <div key={g.label}>
                <p style={{ ...styles.listGroup, ...(g.tone === 'carried' ? { color: 'var(--warn)' } : {}) }}>{g.label}</p>
                {g.tone === 'carried' ? <p style={styles.carriedNote}>Not finished before opening. These stay here until they are done, then move to the record.</p> : null}
                {g.sections.map((s) =>
                  s.shown.length ? (
                    <div key={s.id} id={s.id} style={{ ...styles.sectionBlock, ...(g.tone === 'carried' ? styles.carriedBlock : {}) }}>
                      <div style={styles.sectionHead}>
                        <span style={styles.sectionName}>{s.num ? 'Phase ' + s.num + ' · ' : ''}{s.name}</span>
                        <span style={styles.sectionCount}>{s.countOnly ? s.total + (s.total === 1 ? ' item' : ' items') : s.done + ' of ' + s.total}</span>
                        {s.countOnly ? null : (
                          <div style={styles.sectionBarTrack}>
                            <div style={{ ...styles.sectionBarFill, width: `${s.total ? Math.round((s.done / s.total) * 100) : 0}%` }} />
                          </div>
                        )}
                      </div>
                      {s.blurb ? <p style={styles.phaseBlurb}>{s.blurb}</p> : null}
                      {s.shown.map((item) => (s.record ? renderRecord(item) : renderItem(item)))}
                    </div>
                  ) : null
                )}
              </div>
            ) : null
          )}
        </div>
      </div>
      )}

      {markOpenDraft ? (
        <div data-modal="" style={styles.confirmBackdrop} onClick={() => !markingOpen && setMarkOpenDraft(null)}>
          <div style={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
            <p style={styles.confirmTitle}>Mark {location?.name ?? 'this location'} as open?</p>
            <p style={styles.confirmBody}>
              The Opening Checklist becomes the Operating Checklist: a record of every permit, account,
              contact and document that was set up. Anything not finished yet stays on top until it is
              done. Nothing is deleted, and you can switch it back.
            </p>
            <p style={styles.markOpenLabel}>Opened on</p>
            <DatePickerField value={markOpenDraft} onChange={setMarkOpenDraft} />
            <div style={{ ...styles.confirmButtonsRow, marginTop: 16 }}>
              <button style={styles.cancelBtnFull} onClick={() => setMarkOpenDraft(null)} disabled={markingOpen}>Cancel</button>
              <button style={{ ...styles.saveBtnFull, background: 'var(--success)', borderColor: 'var(--success)' }} onClick={confirmMarkOpen} disabled={markingOpen}>
                {markingOpen ? 'Marking…' : 'Mark as open'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmingDate ? (
        <div data-modal="" style={styles.confirmBackdrop} onClick={() => setConfirmingDate(false)}>
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
        <div data-modal="" data-modal-keep="" style={styles.confirmBackdrop}>
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
        <div data-modal="" style={styles.confirmBackdrop} onClick={() => setConfirmingItem(null)}>
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
        <div data-modal="" style={styles.confirmBackdrop} onClick={() => setConfirmingItemDate(null)}>
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
        <div data-modal="" style={styles.confirmBackdrop} onClick={() => !regenerating && setConfirmingRegenerate(false)}>
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
      {addingToList ? (
        <div data-modal="" data-modal-keep="" style={styles.modalBackdrop} onClick={() => !savingNew && setAddingToList(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Add a checklist item</h2>
            {/* One "+ Add item" at the top of the page (V1); which list it
                goes on is chosen here. */}
            <p style={styles.modalFieldLabel}>Which list</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              {[['setup', 'Initial Set-Up POC'], ['timeline', 'Opening Timeline']].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  style={{ ...styles.listChoice, ...(addingToList === key ? styles.listChoiceOn : {}) }}
                  onClick={() => {
                    setAddingToList(key);
                    setNewSection('');
                    setNewSectionCustom('');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <p style={styles.modalFieldLabel}>What is it</p>
            <input
              style={styles.modalInput}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Health Department Permit"
              autoFocus
            />

            <p style={styles.modalFieldLabel}>Which section</p>
            <select style={styles.modalInput} value={newSection} onChange={(e) => setNewSection(e.target.value)}>
              <option value="">Choose a section</option>
              {[
                ...new Set(
                  openingItems
                    .filter((i) => i.openingItemType === addingToList)
                    .map((i) => i.openingSection)
                ),
              ].map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
              {/* A new city may need a section this checklist has never had -
                  that is the difference between adding items to a checklist
                  and building one. */}
              <option value="__new__">+ New section…</option>
            </select>

            {newSection === '__new__' ? (
              <input
                style={styles.modalInput}
                value={newSectionCustom}
                onChange={(e) => setNewSectionCustom(e.target.value)}
                placeholder="Name the section"
              />
            ) : null}

            <p style={styles.modalFieldLabel}>When it is due</p>
            <div style={{ marginBottom: 14 }}>
              <DatePickerField value={newDate} onChange={setNewDate} placeholder="Pick a date" />
            </div>

            <p style={styles.modalNote}>
              Once added you can assign it, attach a document, add fields, and set what it waits on — the same as
              any other item.
            </p>

            <button style={styles.addConfirmButton} onClick={handleAddItem} disabled={savingNew}>
              {savingNew ? 'Adding…' : 'Add item'}
            </button>
          </div>
        </div>
      ) : null}

    {dialogNode}
    </div>
  );
}

const styles = {
  // ---- Summary card, section list, filters (17 Oct 2026) ----
  summaryCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 16, overflow: 'hidden' },
  seg: { display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 999, padding: 2, marginRight: 4, flexShrink: 0 },
  segBtn: { height: 28, padding: '0 11px', borderRadius: 999, border: 'none', background: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'none', whiteSpace: 'nowrap' },
  segOn: { background: 'var(--neon)', color: 'var(--neon-text)' },
  // Phases (19 Oct 2026).
  phaseNum: { width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  phaseNumOn: { background: 'var(--neon)', color: 'var(--neon-text)' },
  phaseBlurb: { margin: 0, padding: '8px 14px 4px', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 },
  holdingPill: { fontSize: 10.5, fontWeight: 700, color: 'var(--danger)', whiteSpace: 'nowrap' },
  // Operating Checklist (18 Oct 2026).
  markOpenButton: { display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 14px', borderRadius: 8, background: 'rgba(95,163,119,0.1)', border: '1px solid rgba(95,163,119,0.5)', color: 'var(--success)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'none', fontFamily: 'inherit' },
  markOpenLabel: { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '4px 0 6px' },
  openBadge: { width: 92, height: 92, borderRadius: '50%', border: '3px solid var(--success)', background: 'rgba(95,163,119,0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, letterSpacing: 1.5, flexShrink: 0 },
  openBadgeSmall: { width: 64, height: 64, fontSize: 13, letterSpacing: 1 },
  carriedNote: { margin: '4px 14px 0', fontSize: 12, color: 'var(--text-tertiary)' },
  carriedBlock: { margin: '8px 10px 4px', border: '1px solid rgba(232,185,59,0.35)', borderRadius: 10, background: 'rgba(232,185,59,0.05)', overflow: 'hidden' },
  recRow: { display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, padding: '8px 14px', cursor: 'pointer' },
  recRowNarrow: { gap: 10, padding: '8px 12px' },
  recOk: { width: 22, height: 22, borderRadius: '50%', background: 'var(--success)', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  recMissing: { width: 22, height: 22, boxSizing: 'border-box', borderRadius: '50%', border: '2px dashed var(--warn)', flexShrink: 0 },
  recDetail: { flex: 1.3, minWidth: 0, fontSize: 12.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  recKey: { fontWeight: 700, color: 'var(--text-tertiary)', marginRight: 4 },
  recDocs: { fontSize: 12, fontWeight: 700, color: 'var(--neon)', width: 92, flexShrink: 0, whiteSpace: 'nowrap' },
  recNoDocs: { fontSize: 12, color: 'var(--text-tertiary)', width: 92, flexShrink: 0, whiteSpace: 'nowrap' },
  recWhen: { fontSize: 12, color: 'var(--text-tertiary)', width: 92, flexShrink: 0, textAlign: 'right', whiteSpace: 'nowrap' },
  hero: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 22, alignItems: 'center', padding: '18px 20px' },
  heroNarrow: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 14, alignItems: 'center', padding: 14 },
  ring: { position: 'relative', width: 84, height: 84, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ringText: { position: 'relative', fontSize: 19, fontWeight: 800, color: 'var(--text-primary)' },
  ringTextSmall: { position: 'relative', fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' },
  ringSmall: { width: 64, height: 64 },
  ringInner: { width: 66, height: 66, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800 },
  ringInnerSmall: { width: 50, height: 50, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 },
  heroTitle: { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' },
  heroSub: { fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 3 },
  heroStats: { display: 'flex', gap: 28, marginTop: 12, flexWrap: 'wrap' },
  heroStatsNarrow: { gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 14px', padding: '10px 0 0', borderTop: '1px solid var(--border)' },
  heroNum: { display: 'block', fontSize: 19, fontWeight: 800, color: 'var(--text-primary)' },
  heroLabel: { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  heroSide: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, maxWidth: 320 },
  heroSideNarrow: { gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 },
  textLink: { background: 'none', border: 'none', padding: '6px 0', color: 'var(--neon)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textTransform: 'none' },
  cardBlock: { padding: '0 20px 14px' },
  glance: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px 18px', padding: '14px 20px', borderTop: '1px solid var(--border)' },
  glanceNarrow: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px 14px', padding: 14, borderTop: '1px solid var(--border)' },
  glanceLabel: { display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 3 },
  glanceValue: { display: 'block', fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  layout: { display: 'grid', gridTemplateColumns: '230px minmax(0, 1fr)', gap: 16, alignItems: 'start' },
  layoutNarrow: { display: 'flex', flexDirection: 'column', gap: 10 },
  nav: { position: 'sticky', top: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 8 },
  navGroup: { fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: 0, padding: '12px 10px 6px' },
  navItem: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, textAlign: 'left', cursor: 'pointer', textTransform: 'none', fontFamily: 'inherit' },
  navItemOn: { background: 'rgba(34,211,238,0.1)', color: 'var(--neon)' },
  navName: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  navMini: { width: 34, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', flexShrink: 0 },
  navMiniFill: { display: 'block', height: 4, background: 'var(--neon)' },
  navCount: { fontSize: 11.5, color: 'var(--text-tertiary)', fontWeight: 700, flexShrink: 0, minWidth: 30, textAlign: 'right' },
  navChips: { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, WebkitOverflowScrolling: 'touch' },
  navChip: { flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 999, border: '1px solid var(--border-strong)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', textTransform: 'none' },
  navChipOn: { borderColor: 'var(--neon)', color: 'var(--neon)' },
  navChipCount: { fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 700 },

  listCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', minWidth: 0 },
  filters: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--border)' },
  showBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-secondary)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'none', whiteSpace: 'nowrap' },
  showVal: { color: 'var(--text-primary)', fontWeight: 700 },
  menuCatch: { position: 'fixed', inset: 0, zIndex: 40 },
  menu: { position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 41, width: 260, background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: 6, boxShadow: '0 12px 32px rgba(0,0,0,0.45)' },
  menuNarrow: { left: 'auto', right: -60, width: 240 },
  menuItem: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 6, border: 'none', background: 'none', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'none', textAlign: 'left' },
  menuItemOn: { background: 'rgba(34,211,238,0.12)', color: 'var(--neon)' },
  menuCount: { fontWeight: 700, color: 'var(--text-tertiary)', fontSize: 12.5 },
  toggle: { display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'none', padding: '4px 0', whiteSpace: 'nowrap' },
  switchTrack: { width: 30, height: 18, borderRadius: 999, background: 'rgba(255,255,255,0.12)', position: 'relative', flexShrink: 0, transition: 'background 0.15s' },
  switchOn: { background: 'var(--neon)' },
  switchKnob: { position: 'absolute', left: 2, top: 2, width: 14, height: 14, borderRadius: '50%', background: 'var(--text-tertiary)', transition: 'left 0.15s' },
  switchKnobOn: { left: 14, background: 'var(--neon-text)' },
  filterChip: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 999, border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'none', fontFamily: 'inherit' },
  filterChipOn: { background: 'var(--neon)', borderColor: 'var(--neon)', color: 'var(--neon-text)' },
  filterCount: { fontWeight: 800, opacity: 0.7 },
  listGroup: { margin: 0, padding: '16px 14px 0', fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--neon)' },
  sectionBlock: { scrollMarginTop: 12, marginBottom: 6 },
  rowOpen: { background: 'rgba(255,255,255,0.035)', boxShadow: 'inset 3px 0 0 var(--neon)' },
  rowText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  rowSub: { fontSize: 11.5, color: 'var(--text-tertiary)' },
  avatars: { display: 'inline-flex', alignItems: 'center', flexShrink: 0 },
  avatar: { width: 24, height: 24, borderRadius: 12, background: '#3A3A44', border: '2px solid var(--bg-card)', color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' },
  lockedPill: { fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: '#B4B4C0', background: '#24242B', borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1, minWidth: 0 },
  latePill: { fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--danger)', background: 'rgba(232,82,75,0.14)', borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap', flexShrink: 0 },
  primarySmall: { height: 36, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', textTransform: 'none', whiteSpace: 'nowrap' },
  ghostSmall: { height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textTransform: 'none', whiteSpace: 'nowrap' },
  barDate: { fontSize: 12.5, color: 'var(--text-secondary)', padding: '0 4px' },
  waitingPill: { fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--warn)', background: 'rgba(232,185,59,0.14)', borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap' },
  page: { padding: '28px max(22px, min(40px, 4vw))' },
  searchHint: { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px' },
  section: { background: 'var(--bg-card)', border: 'none', borderRadius: 12, padding: 18, marginBottom: 16 },
  modalBackdrop: { ...modalBackdrop, zIndex: 100 },
  modalCard: { padding: 22, ...modalSurface, width: 'min(460px, 100%)' },
  modalTitle: { fontSize: 19, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.2, color: '#FFFFFF', margin: '0 0 4px' },
  modalFieldLabel: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '0 0 5px' },
  modalInput: { width: '100%', boxSizing: 'border-box', height: 36, padding: '0 11px', marginBottom: 14, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-inset)', color: 'var(--text-primary)', fontSize: 13 },
  modalNote: { fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6, margin: '4px 0 0' },
  addConfirmButton: { width: '100%', marginTop: 18, padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 13, fontWeight: 900, textTransform: 'none', cursor: 'pointer' },
  sectionHeaderRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 14px' },
  sectionHeader: { fontSize: 15, fontWeight: 700, margin: 0 },
  listChoice: { background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', borderRadius: 16, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  listChoiceOn: { borderColor: 'var(--neon)', color: 'var(--neon)' },
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
  mineOnlyNote: { fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', margin: '0 0 16px' },
  printIcon: { width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, flexShrink: 0 },
  printButton: { display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 14px', borderRadius: 8, background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'none', fontFamily: 'inherit' },
  checkAreaButton: { marginTop: 10, background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', textTransform: 'none' },
  checkedNote: { marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 13, color: '#9FD3B0', background: 'rgba(95,163,119,0.12)', border: '1px solid rgba(95,163,119,0.45)', borderRadius: 8, padding: '10px 14px' },
  checkedUndo: { background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 12, cursor: 'pointer', textTransform: 'none' },
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
  setDateButton: { padding: '9px 16px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'none' },


  // Rows, not cards. A card per item meant ~110px each and a 6000px page;
  // these are ~40px and the whole section fits on screen. Separated by a hair
  // line rather than gaps and shadows, so the list reads as one thing.
  infoToggle: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
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
  // The open item as its own card under the row (17 Oct 2026), lined up with
  // the item's title rather than floating at an odd indent.
  detailCard: {
    margin: '2px 14px 12px 44px',
    padding: 0,
    overflow: 'hidden',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--bg-window)',
  },
  detailCardNarrow: {
    margin: '2px 8px 12px',
    padding: 0,
    overflow: 'hidden',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--bg-window)',
  },

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
  itemDescription: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0 0 8px' },
  neededForNote: { fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 6px' },
  urgencyBadge: { fontSize: 10, fontWeight: 700, color: '#FFFFFF', borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap', margin: 0, cursor: 'pointer' },

  dateEditRow: { display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px', flexWrap: 'wrap' },
  saveDateButton: { padding: '9px 14px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 12, flexShrink: 0, textTransform: 'none' },
  cancelDateButton: { padding: '9px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, flexShrink: 0 },

  confirmBackdrop: { ...modalBackdrop, zIndex: 200 },
  confirmCard: { padding: 22, ...modalSurface, width: 'min(400px, 100%)' },
  confirmTitle: { fontSize: 15, fontWeight: 700, marginBottom: 10 },
  confirmBody: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 18 },
  confirmButtonsRow: { display: 'flex', gap: 10 },
  cancelBtnFull: { minHeight: 40, flex: 1, padding: '10px 0', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 13 },
  saveBtnFull: { flex: 1, padding: '10px 0', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'none' },
};
