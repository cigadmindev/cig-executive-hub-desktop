import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UnderRepairControls } from '../components/UnderRepair';
import AccessMatrixEditor from '../components/AccessMatrixEditor';
import AccessSummary from '../components/AccessSummary';
import ViewAsPicker from '../components/ViewAsPicker';
import { useAuth } from '../context/AuthContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useAccessPresets } from '../context/AccessPresetsContext';
import { useOffboarding } from '../context/OffboardingContext';
import { brands, categories, FEATURES } from '../data/mockData';
import { JOB_OPTIONS } from '../context/EventRequestsContext';
import { useDialog } from '../hooks/useDialog';
import PageHeader from '../components/PageHeader';
import Icon from '../components/Icon';
import { plainError } from '../lib/errors';
import { useIsNarrow } from '../hooks/useIsNarrow';

function toggleInArray(arr, id) {
  return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
}

function cleanJob(j) {
  return (j || '').replace(/^[^\u0000-\u007F]+\s*/, '');
}

// Nobody ever types this: the setup email and Forgot password both let people
// choose their own. It only exists because an account needs one to be created.
function throwawayPassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('') + 'Aa9!';
}

const ALL_CATEGORY_IDS = categories.map((c) => c.id);
const ALL_FEATURE_KEYS = FEATURES.map((f) => f.key);

const blankDraft = () => ({
  name: '',
  email: '',
  role: 'manager',
  job: null,
  // A second job at one location: { job, locationId } or null.
  alsoJob: null,
  privateSpace: false,
  brandIds: [],
  // brandId -> the locations they may see there. No entry, or an empty one,
  // means every location in that restaurant.
  locationsByBrand: {},
  // Everything on by default. Untick what this person should not reach.
  categoryIds: ALL_CATEGORY_IDS,
  features: ALL_FEATURE_KEYS,
});

const TABS = [['people', 'People'], ['matrix', 'Who sees what'], ['viewAs', 'See the Hub as someone'], ['email', 'Email preview'], ['repair', 'Pages being improved']];
const FILTERS = [
  ['all', 'Everyone', () => true],
  ['exec', 'Executives', (u) => u.active && u.role !== 'manager'],
  ['managers', 'Managers', (u) => u.active && u.role === 'manager'],
  ['off', 'Switched off', (u) => !u.active],
  ['test', 'Test', (u) => u.isGhost],
];
const TAG_TONES = {
  grey: { background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)' },
  amber: { background: 'rgba(201,162,39,0.16)', color: '#E8D48A' },
  red: { background: 'rgba(232,82,75,0.15)', color: '#F2928D' },
};
const EMAIL_PREF = {
  default: 'What needs them now, plus one summary at 8am',
  action: 'Only what needs them',
  all: 'Everything, as it happens',
  none: 'No emails',
};
// When someone last opened the Hub (recorded from 17 Oct 2026).
function lastActiveText(u) {
  if (!u.lastActiveAt) return 'Not since Oct 17';
  const days = Math.floor((Date.now() - u.lastActiveAt) / 86400000);
  if (days <= 0) return 'Active today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return days + ' days ago';
  return new Date(u.lastActiveAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function lastActiveLong(u) {
  if (!u.lastActiveAt) return 'Not since the Hub started noting it (Oct 17)';
  return new Date(u.lastActiveAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function Avatar({ person, size = 38 }) {
  return (
    <span style={{ width: size, height: size, borderRadius: size / 2, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: person.photoUrl ? `center / cover url("${person.photoUrl}")` : 'var(--bg-inset)', color: 'var(--text-primary)', fontWeight: 800, fontSize: size * 0.4 }}>
      {person.photoUrl ? null : (person.name ?? '?')[0].toUpperCase()}
    </span>
  );
}

export default function AdminUsersScreen() {
  const { dialogNode, confirm, notify } = useDialog();
  const navigate = useNavigate();
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [viewAsOpen, setViewAsOpen] = useState(false);
  const {
    users,
    addUser,
    sendPasswordReset,
    sendWelcomeLink,
    setUserActive,
    updateUserRole,
    updateUserJob,
    updateUserAlsoJob,
    updateUserPrivateSpace,
    updatePermissions,
    setUserGhost,
    user: currentUser,
  } = useAuth();
  const { getByBrand } = useCustomLocations();
  const { presets, savePreset, deletePreset } = useAccessPresets();
  const { startOffboarding, markReactivated } = useOffboarding();

  // One panel for creating and editing, so the two never drift apart.
  // mode is 'create', or the uid being edited.
  const [panelMode, setPanelMode] = useState(null);
  const [draft, setDraft] = useState(blankDraft);
  const [saving, setSaving] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [repairOpen, setRepairOpen] = useState(false);
  // The redesigned page (17 Oct 2026): tabs, search, filters, grouped list
  // and a details panel beside it (a full page on a phone).
  const isNarrow = useIsNarrow();
  const [tab, setTab] = useState('people');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);

  // Every location in a restaurant, built-in and added later - Chelsea is one
  // of the added ones.
  const locationsFor = (brandId) => {
    const brand = brands.find((b) => b.id === brandId);
    return [
      ...(brand?.locations ?? []).map((l) => ({ id: l.id, name: l.name })),
      ...getByBrand(brandId).map((l) => ({ id: l.id, name: l.name })),
    ];
  };

  // Every location, labelled with its restaurant, for "Also works as".
  const allLocations = brands.flatMap((b) => locationsFor(b.id).map((l) => ({ id: l.id, label: b.name + ' · ' + l.name })));

  if (currentUser?.role !== 'admin') {
    return (
      <div style={styles.page}>
        <PageHeader title="Manage Logins" subtitle="Only admins can see this page." />
      </div>
    );
  }

  const openCreate = () => {
    setDraft(blankDraft());
    setPanelMode('create');
  };

  const openEdit = (u) => {
    setDraft({
      name: u.name,
      email: u.email,
      role: u.role,
      job: u.job ?? null,
      alsoJob: u.alsoJob ?? null,
      privateSpace: u.privateSpace === true,
      brandIds: u.permissions?.brandIds ?? [],
      locationsByBrand: u.permissions?.locationsByBrand ?? {},
      categoryIds: u.permissions?.categoryIds ?? [],
      features: u.permissions?.features ?? ALL_FEATURE_KEYS,
    });
    setPanelMode(u.uid);
  };

  const closePanel = () => {
    if (!saving) setPanelMode(null);
  };

  // All four written together. Writing only some of them replaces the rest -
  // the old editor saved three and would have wiped location narrowing.
  const permissionsFromDraft = () => {
    const locationsByBrand = {};
    for (const b of draft.brandIds) {
      const only = draft.locationsByBrand[b];
      if (Array.isArray(only) && only.length > 0) locationsByBrand[b] = only;
    }
    return {
      brandIds: draft.brandIds,
      locationsByBrand,
      categoryIds: draft.categoryIds,
      features: draft.features,
    };
  };

  const handleSave = async () => {
    if (panelMode === 'create') {
      if (!draft.name.trim() || !draft.email.trim()) {
        notify('Missing details', 'Enter a name and an email address.');
        return;
      }
      if (draft.role !== 'admin' && !draft.job) {
        notify('Choose a job', 'The job decides what they can see. Pick one before creating the login.');
        return;
      }
      setSaving(true);
      try {
        const created = await addUser({
          name: draft.name.trim(),
          email: draft.email.trim(),
          password: throwawayPassword(),
          role: draft.role,
          permissions: permissionsFromDraft(),
          job: draft.job,
        });
        setPanelMode(null);
        notify(
          'Login created',
          created?.invited
            ? `${draft.name.trim()} has been emailed a link to set their password. If it expires, they can use Forgot password on the sign-in page.`
            : `${draft.name.trim()} was created, but the setup email didn't send. They can use Forgot password on the sign-in page.`
        );
      } catch (err) {
        notify('Could not create login', plainError(err, 'Something went wrong.'));
      } finally {
        setSaving(false);
      }
      return;
    }

    const target = users.find((u) => u.uid === panelMode);
    if (!target) return;
    if (draft.alsoJob?.job && !draft.alsoJob.locationId) {
      notify('Choose where', 'Pick the location for ' + draft.alsoJob.job + ', or set "No second job".');
      return;
    }
    // A manager's places come from their login (14 Oct 2026), so the second
    // job's location has to be ticked under Where or they can't reach it.
    if (draft.alsoJob?.locationId && draft.role === 'manager') {
      const b = brands.find((x) => locationsFor(x.id).some((l) => l.id === draft.alsoJob.locationId));
      const only = b ? draft.locationsByBrand?.[b.id] ?? [] : [];
      if (b && (!draft.brandIds.includes(b.id) || (only.length > 0 && !only.includes(draft.alsoJob.locationId)))) {
        notify('Tick it under Where', 'Their second job is at ' + (allLocations.find((l) => l.id === draft.alsoJob.locationId)?.label ?? 'that location') + ', which is not ticked under Where. Tick it, then save.');
        return;
      }
    }
    setSaving(true);
    try {
      if (draft.role !== target.role) await updateUserRole(target.uid, draft.role);
      if (draft.job !== (target.job ?? null)) await updateUserJob(target.uid, draft.job);
      if (JSON.stringify(draft.alsoJob ?? null) !== JSON.stringify(target.alsoJob ?? null)) await updateUserAlsoJob(target.uid, draft.alsoJob);
      if ((draft.privateSpace === true) !== (target.privateSpace === true)) await updateUserPrivateSpace(target.uid, draft.privateSpace);
      await updatePermissions(target.uid, { ...(target.permissions ?? {}), ...permissionsFromDraft() });
      setPanelMode(null);
    } catch (err) {
      notify('Could not save', plainError(err, 'Nothing was changed. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSendWelcome = (targetEmail, targetName) => {
    confirm({
      title: 'Send a welcome link?',
      body: targetName + ' will get an email with a link to set their password. It does not expire.',
      confirmLabel: 'Send',
      onConfirm: async () => {
        try {
          await sendWelcomeLink(targetEmail, targetName);
          notify('Sent', targetName + ' can set their password whenever they get to it.');
        } catch (err) {
          notify('Could not send', plainError(err, 'Something went wrong.'));
        }
      },
    });
  };

  const handleSendReset = (targetEmail, targetName) => {
    confirm({
      title: 'Send a password reset?',
      body: `${targetName} will get an email to set a new password.`,
      confirmLabel: 'Send',
      onConfirm: async () => {
        try {
          await sendPasswordReset(targetEmail, targetName);
          notify('Reset sent', `${targetName} will get an email to set a new password.`);
        } catch (err) {
          notify('Could not send', plainError(err, 'Something went wrong.'));
        }
      },
    });
  };

  const handleReactivate = (uid, targetName) => {
    confirm({
      title: `Reactivate ${targetName}?`,
      body: 'They can sign in again with the same email address, and everything they entered before is still attached to them.',
      confirmLabel: 'Reactivate',
      onConfirm: async () => {
        try {
          await setUserActive(uid, true);
          await markReactivated(uid);
        } catch (err) {
          notify('Could not reactivate', plainError(err, 'Something went wrong.'));
        }
      },
    });
  };

  const handleDeactivate = (uid, targetName) => {
    confirm({
      title: `Deactivate ${targetName}?`,
      body: "Straight away: their sign-in stops working everywhere, any unused welcome link stops working, and they are removed from the shared Drive. They drop out of every picker and team list. Their account and everything they've entered stays put, and you can switch them back on here at any time (Drive is put back from Offboarding).",
      confirmLabel: 'Deactivate',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await setUserActive(uid, false);
          // Opens the checklist of what to revoke outside the Hub.
          await startOffboarding(users.find((u) => u.uid === uid) ?? { uid, name: targetName }, currentUser?.name);
        } catch (err) {
          notify('Could not deactivate', plainError(err, 'Something went wrong.'));
        }
      },
    });
  };

  // "Taste Italian Kitchen (Ridgeland), Blutos Greek Tavern"
  const whereText = (perms) => {
    const ids = perms?.brandIds ?? [];
    if (ids.length === 0) return 'No restaurants yet';
    return brands
      .filter((b) => ids.includes(b.id))
      .map((b) => {
        const only = perms?.locationsByBrand?.[b.id];
        if (!Array.isArray(only) || only.length === 0) return b.name;
        const names = locationsFor(b.id)
          .filter((l) => only.includes(l.id))
          .map((l) => l.name);
        return `${b.name} (${names.join(', ')})`;
      })
      .join(', ');
  };

  const summaryLine = (u) => {
    const role = u.role === 'admin' ? 'Admin' : u.role === 'executive' ? 'Executive' : 'Manager';
    const parts = [role];
    if (u.job) parts.push(cleanJob(u.job));
    if (u.alsoJob?.job) parts.push('also ' + cleanJob(u.alsoJob.job) + ', ' + (allLocations.find((l) => l.id === u.alsoJob.locationId)?.label ?? 'a location'));
    if (u.role === 'manager') parts.push(whereText(u.permissions));
    return parts.join(' · ');
  };

  const exceptions = (all, have, labelOf) => all.filter((x) => !have.includes(x)).map(labelOf);

  const words = q.trim().toLowerCase();
  const filterTest = FILTERS.find(([key]) => key === filter)?.[2] ?? (() => true);
  const shown = users.filter(filterTest).filter((u) => !words || [u.name, u.email, u.job, u.alsoJob?.job].some((v) => (v ?? '').toLowerCase().includes(words)));
  const byName = (a, b) => (a.name ?? '').localeCompare(b.name ?? '');
  // Admins and executives; then each restaurant and location; switched-off last.
  const groups = (() => {
    const out = [];
    const live = shown.filter((u) => u.active);
    const top = live.filter((u) => u.role !== 'manager').sort(byName);
    if (top.length) out.push({ label: 'Admins & executives', people: top });
    const placed = new Set();
    for (const b of brands) {
      for (const l of locationsFor(b.id)) {
        const here = live.filter((u) => u.role === 'manager' && (u.permissions?.brandIds ?? []).includes(b.id) && (() => {
          const only = u.permissions?.locationsByBrand?.[b.id];
          return !Array.isArray(only) || only.length === 0 || only.includes(l.id);
        })()).sort(byName);
        here.forEach((u) => placed.add(u.uid));
        if (here.length) out.push({ label: b.name + ' · ' + l.name, people: here });
      }
    }
    const loose = live.filter((u) => u.role === 'manager' && !placed.has(u.uid)).sort(byName);
    if (loose.length) out.push({ label: 'No restaurant yet', people: loose });
    const off = shown.filter((u) => !u.active).sort(byName);
    if (off.length) out.push({ label: 'Switched off', people: off });
    return out;
  })();
  const selected = users.find((u) => u.uid === selectedId) ?? null;
  const tagsFor = (u) => [
    u.assignedWork ? ['Assigned work only', 'amber'] : null,
    u.alsoJob?.job ? ['Also ' + cleanJob(u.alsoJob.job) + ' · ' + (allLocations.find((l) => l.id === u.alsoJob.locationId)?.label.split(' · ').pop() ?? ''), 'grey'] : null,
    u.privateSpace ? ['My space', 'grey'] : null,
    u.isGhost ? ['Test', 'amber'] : null,
    !u.active ? ['Switched off', 'red'] : null,
  ].filter(Boolean);

  return (
    <div style={styles.page}>
      <PageHeader
        title="Manage Logins"
        subtitle="Everyone with a Hub login, what they can see, and turning access on or off."
        actionLabel={tab === 'people' ? '+ New login' : null}
        onAction={openCreate}
      />

      {/* Tabs across the top (17 Oct 2026): the tools that sat at the
          bottom of the page are easy to find. */}
      <div style={styles.tabs} role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} style={{ ...styles.tab, ...(tab === key ? styles.tabOn : {}) }} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'people' ? (
        <>
          <div style={styles.filterRow}>
            <input style={styles.search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or job…" aria-label="Search logins" />
            <div style={styles.chips}>
              {FILTERS.map(([key, label, test]) => (
                <button key={key} style={{ ...styles.chip, ...(filter === key ? styles.chipOn : {}) }} onClick={() => setFilter(key)}>
                  {label} <span style={styles.chipCount}>{users.filter(test).length}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={isNarrow ? null : styles.split}>
            {isNarrow && selected ? null : (
              <div style={styles.listCol}>
                {groups.length === 0 ? <p style={styles.empty}>Nobody matches.</p> : null}
                {groups.map((g) => (
                  <div key={g.label} style={styles.list}>
                    <p style={styles.groupLabel}>{g.label}</p>
                    {g.people.map((item) => (
                      <button
                        key={item.uid}
                        style={{ ...styles.personRow, ...(selected?.uid === item.uid ? styles.personRowOn : {}), ...(!item.active ? styles.rowInactive : {}) }}
                        onClick={() => setSelectedId(item.uid)}
                      >
                        <Avatar person={item} />
                        <span style={styles.personText}>
                          <span style={styles.rowName}>{item.name}</span>
                          <span style={styles.personJob}>
                            {[item.role === 'admin' ? 'Admin' : null, cleanJob(item.job) || (item.role === 'executive' ? 'Executive' : 'Manager')].filter(Boolean).join(' · ')}
                            {tagsFor(item).map(([label, tone]) => <span key={label} style={{ ...styles.tag, ...TAG_TONES[tone] }}>{label}</span>)}
                          </span>
                        </span>
                        <span style={styles.lastActive}>{lastActiveText(item)}</span>
                      </button>
                    ))}
                  </div>
                ))}
              {presets.length > 0 ? (
                <div style={styles.list}>
                  <p style={{ ...styles.accessLabel, padding: '12px 14px 0', margin: 0 }}>Presets</p>
                  {presets.map((x) => (
                    <div key={x.id} style={styles.row}>
                      <div style={styles.rowHead}>
                        <span style={styles.rowName}>{x.name}</span>
                        <span style={styles.rowSummary}>
                          {x.role === 'manager' ? 'Manager' : x.role} · {x.categoryIds.length} folders · {x.features.length} features
                        </span>
                        <button
                          style={styles.linkButton}
                          onClick={() =>
                            confirm({
                              title: `Delete the ${x.name} preset?`,
                              body: 'Nobody already set up from it is affected.',
                              confirmLabel: 'Delete',
                              tone: 'danger',
                              onConfirm: () => deletePreset(x.id),
                            })
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              </div>
            )}
            {selected ? (
              <div style={isNarrow ? null : styles.detailCol}>
                <div style={styles.detail}>
                  {isNarrow ? <button style={styles.backButton} onClick={() => setSelectedId(null)}>‹ Everyone</button> : null}
                  <div style={styles.detailHead}>
                    <Avatar person={selected} size={52} />
                    <div style={{ minWidth: 0 }}>
                      <p style={styles.detailName}>{selected.name}</p>
                      <p style={styles.email}>{selected.email}</p>
                    </div>
                  </div>
                  <div style={styles.tagRow}>
                    <span style={{ ...styles.tag, ...TAG_TONES.grey, marginLeft: 0 }}>{selected.role === 'admin' ? 'Admin' : selected.role === 'executive' ? 'Executive' : 'Manager'}</span>
                    {selected.job ? <span style={{ ...styles.tag, ...TAG_TONES.grey }}>{cleanJob(selected.job)}</span> : null}
                    {tagsFor(selected).map(([label, tone]) => <span key={label} style={{ ...styles.tag, ...TAG_TONES[tone] }}>{label}</span>)}
                  </div>
                  <p style={styles.accessLabel}>Last active</p>
                  <p style={styles.accessValue}>{lastActiveLong(selected)}</p>
                  <p style={styles.accessLabel}>Email from the Hub</p>
                  <p style={styles.accessValue}>{EMAIL_PREF[selected.notifyEmail ?? 'default']}</p>
                  {(() => {
                    const item = selected;
                    return (
                      <>

                                  {item.role === 'manager' ? (
                                    <>
                                      <p style={styles.accessLabel}>Where</p>
                                      <p style={styles.accessValue}>{whereText(item.permissions)}</p>

                                      <p style={styles.accessLabel}>Folders</p>
                                      <p style={styles.accessValue}>
                                        {(() => {
                                          const have = item.permissions?.categoryIds ?? [];
                                          if (have.length === 0) return 'None';
                                          const not = exceptions(ALL_CATEGORY_IDS, have, (id) => categories.find((c) => c.id === id)?.label);
                                          return not.length === 0 ? 'All folders' : `All except ${not.join(', ')}`;
                                        })()}
                                      </p>

                                      {/* An absent features list means everything. */}
                                      <p style={styles.accessLabel}>Can reach</p>
                                      <p style={styles.accessValue}>
                                        {(() => {
                                          const have = item.permissions?.features;
                                          if (!Array.isArray(have)) return 'Everything';
                                          if (have.length === 0) return 'Nothing beyond messages, calendar and profile';
                                          const not = exceptions(ALL_FEATURE_KEYS, have, (k) => FEATURES.find((f) => f.key === k)?.label);
                                          return not.length === 0 ? 'Everything' : `Everything except ${not.join(', ')}`;
                                        })()}
                                      </p>
                                    </>
                                  ) : (
                                    /* Their manager permissions stay saved for if they move
                                       back, but showing them would suggest they apply now. */
                                    <p style={styles.accessValue}>Everything — all restaurants, all locations, every part of the app.</p>
                                  )}
                                  <div style={styles.actions}>
                                    {item.uid !== currentUser?.uid ? (
                                      <>
                                        <button
                                          style={styles.actionButton}
                                          onClick={() =>
                                            confirm({
                                              title: item.isGhost ? `Make ${item.name} a real login?` : `Make ${item.name} a test login?`,
                                              body: item.isGhost
                                                ? 'They will appear in team lists, pickers and reports like anyone else.'
                                                : "They disappear from every list, picker, report and activity feed - everywhere but here. Use it to try things out without cluttering anyone else's Hub.",
                                              confirmLabel: item.isGhost ? 'Make real' : 'Make test',
                                              onConfirm: () => setUserGhost(item.uid, !item.isGhost),
                                            })
                                          }
                                        >
                                          {item.isGhost ? 'Make real login' : 'Make test login'}
                                        </button>
                                        <button style={styles.actionButton} onClick={() => openEdit(item)}>
                                          Edit access
                                        </button>
                                        <button style={styles.actionButton} onClick={() => handleSendWelcome(item.email, item.name)}>
                                          Send welcome link
                                        </button>
                                        <button style={styles.actionButton} onClick={() => handleSendReset(item.email, item.name)}>
                                          Send password reset
                                        </button>
                                        {item.active ? (
                                          <button style={styles.dangerButton} onClick={() => handleDeactivate(item.uid, item.name)}>
                                            Deactivate
                                          </button>
                                        ) : (
                                          <button style={styles.actionButton} onClick={() => handleReactivate(item.uid, item.name)}>
                                            Reactivate
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <button style={styles.actionButton} onClick={() => handleSendReset(item.email, item.name)}>
                                          Send password reset
                                        </button>
                                        <span style={styles.selfNote}>This is your own account</span>
                                      </>
                                    )}
                                  </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : !isNarrow ? (
              <div style={styles.detailCol}><div style={{ ...styles.detail, ...styles.detailEmpty }}>Pick someone to see their access and what you can do.</div></div>
            ) : null}
          </div>
        </>
      ) : null}

      {tab === 'matrix' ? <AccessMatrixEditor /> : null}
      {tab === 'viewAs' ? <ViewAsPicker /> : null}
      {tab === 'email' ? (
        <div style={styles.toolCard}>
          <p style={styles.accessValue}>Every email the Hub sends, filled in with sample details, so you can see exactly what people receive.</p>
          <button style={styles.saveButton} onClick={() => navigate('/admin/email-preview')}>Open the email preview</button>
        </div>
      ) : null}
      {tab === 'repair' ? <UnderRepairControls /> : null}

      {panelMode ? (
        <AccessPanel
          mode={panelMode === 'create' ? 'create' : 'edit'}
          draft={draft}
          setDraft={setDraft}
          locationsFor={locationsFor}
          allLocations={allLocations}
          presets={presets}
          savePreset={savePreset}
          saving={saving}
          onSave={handleSave}
          onClose={closePanel}
        />
      ) : null}

      {dialogNode}
    </div>
  );
}

// The create and edit form. Grouped into who, where, folders and reach, with
// folders and reach defaulting to everything and opening only when something
// needs unticking - rather than twenty chips on screen every time.
function AccessPanel({ mode, draft, setDraft, locationsFor, allLocations, presets, savePreset, saving, onSave, onClose }) {
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [reachOpen, setReachOpen] = useState(false);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const toggleBrand = (brandId) => {
    const on = draft.brandIds.includes(brandId);
    const brandIds = toggleInArray(draft.brandIds, brandId);
    const locationsByBrand = { ...draft.locationsByBrand };
    if (on) delete locationsByBrand[brandId];
    set({ brandIds, locationsByBrand });
  };

  const setAllLocations = (brandId) => {
    const locationsByBrand = { ...draft.locationsByBrand };
    delete locationsByBrand[brandId];
    set({ locationsByBrand });
  };

  const setOnlyLocations = (brandId) => {
    // Starts with the first location ticked, so "only" is never empty - an
    // empty list means every location.
    const first = locationsFor(brandId)[0]?.id;
    set({ locationsByBrand: { ...draft.locationsByBrand, [brandId]: first ? [first] : [] } });
  };

  const toggleLocation = (brandId, locId) => {
    const current = draft.locationsByBrand[brandId] ?? [];
    const next = toggleInArray(current, locId);
    // Unticking the last one would silently mean "all" - keep at least one.
    if (next.length === 0) return;
    set({ locationsByBrand: { ...draft.locationsByBrand, [brandId]: next } });
  };

  const folderNot = categories.filter((c) => !draft.categoryIds.includes(c.id)).map((c) => c.label);
  const reachNot = FEATURES.filter((f) => !draft.features.includes(f.key)).map((f) => f.label);

  const folderSummary =
    draft.categoryIds.length === 0 ? 'None' : folderNot.length === 0 ? 'All folders' : `All except ${folderNot.join(', ')}`;
  const reachSummary =
    draft.features.length === 0 ? 'Nothing extra' : reachNot.length === 0 ? 'Everything' : `Everything except ${reachNot.join(', ')}`;

  return (
    <div data-modal="" data-modal-keep="" style={styles.backdrop} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.panelTitle}>{mode === 'create' ? 'New login' : `Edit access — ${draft.name}`}</h2>

        {false && mode === 'create' && presets.length > 0 ? (
          <>
            <p style={styles.sectionLabel}>Start from</p>
            <div style={styles.twoCol}>
              <select
                style={styles.input}
                value=""
                onChange={(e) => {
                  const preset = presets.find((x) => x.id === e.target.value);
                  if (preset) {
                    // Everything except where they work - that belongs to the
                    // person, not the role.
                    setDraft((d) => ({
                      ...d,
                      role: preset.role,
                      job: preset.job,
                      categoryIds: preset.categoryIds,
                      features: preset.features,
                    }));
                  }
                }}
              >
                <option value="">Start blank</option>
                {presets.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              <span style={styles.note}>Fills in everything but where they work.</span>
            </div>
          </>
        ) : null}

        <p style={styles.sectionLabel}>Who</p>
        {mode === 'create' ? (
          <div style={styles.twoCol}>
            <input style={styles.input} placeholder="Full name" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            <input style={styles.input} placeholder="name@company.com" value={draft.email} onChange={(e) => set({ email: e.target.value })} />
          </div>
        ) : (
          <p style={styles.readOnly}>{draft.email}</p>
        )}
        <div style={styles.twoCol}>
          <select style={styles.input} value={draft.role} onChange={(e) => set({ role: e.target.value })}>
            <option value="manager">Manager</option>
            <option value="executive">Executive</option>
            <option value="admin">Admin</option>
          </select>
          <select style={styles.input} value={draft.job ?? ''} onChange={(e) => set({ job: e.target.value || null })}>
            <option value="">Choose a job (required)</option>
            {JOB_OPTIONS.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </div>

        {mode !== 'create' ? (
          <>
            <p style={styles.sectionLabel}>Also works as</p>
            <div style={styles.twoCol}>
              <select
                style={styles.input}
                value={draft.alsoJob?.job ?? ''}
                onChange={(e) => set({ alsoJob: e.target.value ? { job: e.target.value, locationId: draft.alsoJob?.locationId ?? '' } : null })}
                aria-label="Second job"
              >
                <option value="">No second job</option>
                {JOB_OPTIONS.filter((j) => j !== draft.job).map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
              <select
                style={styles.input}
                value={draft.alsoJob?.locationId ?? ''}
                disabled={!draft.alsoJob?.job}
                onChange={(e) => set({ alsoJob: { ...draft.alsoJob, locationId: e.target.value } })}
                aria-label="Where"
              >
                <option value="">At which location</option>
                {allLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <p style={styles.note}>One extra job at one location - Cameron is IT &amp; Training and also Starkville's GM. Leave it empty for everyone else.</p>

            <p style={styles.sectionLabel}>My space</p>
            <label style={styles.checkRow}>
              <input type="checkbox" checked={draft.privateSpace === true} onChange={(e) => set({ privateSpace: e.target.checked })} />
              <span>A private page and Drive folder only they can open</span>
            </label>
            <p style={styles.note}>Switching it on does not let admins see inside. Switching it off hides the page; nothing in it is deleted.</p>
          </>
        ) : null}

        {draft.role === 'manager' ? (
          <>
            <p style={styles.sectionLabel}>Where</p>
            <div style={styles.box}>
              {brands.map((b) => {
                const on = draft.brandIds.includes(b.id);
                const only = draft.locationsByBrand[b.id];
                const narrowed = Array.isArray(only) && only.length > 0;
                const locs = locationsFor(b.id);
                return (
                  <div key={b.id} style={styles.brandBlock}>
                    <label style={styles.checkRow}>
                      <input type="checkbox" checked={on} onChange={() => toggleBrand(b.id)} />
                      <span>{b.name}</span>
                    </label>
                    {on && locs.length > 1 ? (
                      <div style={styles.nested}>
                        <label style={styles.checkRow}>
                          <input type="radio" checked={!narrowed} onChange={() => setAllLocations(b.id)} />
                          <span>All locations</span>
                        </label>
                        <label style={styles.checkRow}>
                          <input type="radio" checked={narrowed} onChange={() => setOnlyLocations(b.id)} />
                          <span>Only these:</span>
                        </label>
                        {narrowed ? (
                          <div style={styles.locGrid}>
                            {locs.map((l) => (
                              <label key={l.id} style={styles.checkRow}>
                                <input type="checkbox" checked={only.includes(l.id)} onChange={() => toggleLocation(b.id, l.id)} />
                                <span>{l.name}</span>
                              </label>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Folders and sections come from the job's row in Who sees what. */}
            <AccessSummary person={{ ...draft, permissions: { brandIds: draft.brandIds ?? [], locationsByBrand: draft.locationsByBrand ?? {} } }} />
          </>
        ) : (
          <AccessSummary person={{ ...draft, permissions: { brandIds: draft.brandIds ?? [], locationsByBrand: draft.locationsByBrand ?? {} } }} />
        )}

        <div style={styles.panelFooter}>
          <span style={styles.note}>{mode === 'create' ? 'A setup email sends when you create the login.' : ''}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={styles.cancelButton} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button style={styles.saveButton} onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : mode === 'create' ? 'Create login' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: '28px max(22px, min(36px, 4vw))', maxWidth: 1180 },
  tabs: { display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', margin: '6px 0 16px', overflowX: 'auto', scrollbarWidth: 'none' },
  tab: { background: 'none', border: 'none', borderBottom: '2px solid transparent', padding: '10px 12px', color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'none', fontFamily: 'inherit' },
  tabOn: { color: 'var(--text-primary)', borderBottomColor: 'var(--neon)' },
  filterRow: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 },
  search: { flex: '1 1 240px', minWidth: 0, height: 40, boxSizing: 'border-box', padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-inset)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' },
  chips: { display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', maxWidth: '100%' },
  chip: { border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-secondary)', borderRadius: 999, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'none', fontFamily: 'inherit' },
  chipOn: { background: 'var(--neon)', color: 'var(--neon-text)', borderColor: 'var(--neon)' },
  chipCount: { opacity: 0.7, marginLeft: 2 },
  split: { display: 'flex', gap: 16, alignItems: 'flex-start' },
  listCol: { flex: '1 1 520px', minWidth: 0 },
  detailCol: { flex: '0 1 380px', minWidth: 320, position: 'sticky', top: 16 },
  groupLabel: { fontSize: 10.5, fontWeight: 800, letterSpacing: 0.9, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: 0, padding: '12px 14px 6px' },
  personRow: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)', fontFamily: 'inherit', textTransform: 'none' },
  personRowOn: { background: 'rgba(34,211,238,0.07)' },
  personText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  personJob: { fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  tag: { display: 'inline-block', fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', borderRadius: 6, padding: '2px 6px', marginLeft: 4 },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0 14px' },
  lastActive: { fontSize: 11.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' },
  empty: { fontSize: 13, color: 'var(--text-tertiary)', padding: 14 },
  detail: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
  detailEmpty: { color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: '40px 18px' },
  detailHead: { display: 'flex', alignItems: 'center', gap: 12 },
  detailName: { fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' },
  backButton: { background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, padding: '0 0 12px', cursor: 'pointer', textTransform: 'none', fontFamily: 'inherit' },
  toolCard: { background: 'var(--bg-card)', borderRadius: 12, padding: 18 },

  list: { background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', marginBottom: 14 },
  row: { borderBottom: '1px solid var(--border)' },
  rowInactive: { opacity: 0.55 },
  rowHead: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)' },
  rowName: { fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' },
  rowSummary: { flex: 1, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  ghostBadge: { fontSize: 10, fontWeight: 700, color: 'var(--warn)', letterSpacing: 0.5 },
  inactiveBadge: { fontSize: 10, fontWeight: 700, color: 'var(--danger)', letterSpacing: 0.5 },
  repairLabel: { display: 'flex', alignItems: 'center', gap: 10 },
  chevron: { fontSize: 11, color: 'var(--text-tertiary)' },
  rowBody: { padding: '0 14px 14px' },
  email: { fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 10px' },
  accessLabel: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '0 0 3px' },
  accessValue: { fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', margin: '0 0 10px' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4, alignItems: 'center' },
  actionButton: { padding: '7px 12px', borderRadius: 10, border: 'none', background: 'var(--bg-inset)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  dangerButton: { padding: '7px 12px', borderRadius: 10, border: 'none', background: 'rgba(232,82,75,0.12)', color: 'var(--danger)', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  selfNote: { color: 'var(--text-secondary)', fontSize: 11, fontStyle: 'italic' },

  repairRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '10px 14px', borderRadius: 12, border: 'none', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 12 },

  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  panel: { width: 'min(560px, calc(100vw - 32px))', maxHeight: '86vh', overflowY: 'auto', background: 'var(--bg-elevated)', borderRadius: 18, padding: 22, boxShadow: 'var(--shadow-lg)' },
  panelTitle: { fontSize: 19, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.2, color: 'var(--text-primary)', margin: '0 0 6px' },
  sectionLabel: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '16px 0 6px' },
  twoCol: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8, marginBottom: 8 },
  input: { width: '100%', boxSizing: 'border-box', height: 38, padding: '0 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 },
  readOnly: { fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' },
  box: { border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', marginBottom: 8 },
  brandBlock: { padding: '2px 0' },
  checkRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', padding: '4px 0', cursor: 'pointer' },
  nested: { paddingLeft: 26, marginBottom: 4 },
  locGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', columnGap: 12 },
  linkButton: { background: 'none', border: 'none', padding: 0, color: 'var(--neon)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  note: { fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5, margin: '6px 0 0' },
  panelFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 20, flexWrap: 'wrap' },
  cancelButton: { minHeight: 40, padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  saveButton: { padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 13, fontWeight: 900, textTransform: 'none', cursor: 'pointer' },
};
