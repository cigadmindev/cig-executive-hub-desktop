import React, { useState } from 'react';
import { UnderRepairControls } from '../components/UnderRepair';
import { useAuth } from '../context/AuthContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { useAccessPresets } from '../context/AccessPresetsContext';
import { useOffboarding } from '../context/OffboardingContext';
import { brands, categories, FEATURES } from '../data/mockData';
import { JOB_OPTIONS } from '../context/EventRequestsContext';
import { useDialog } from '../hooks/useDialog';
import { nike } from '../theme/nike';

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
  brandIds: [],
  // brandId -> the locations they may see there. No entry, or an empty one,
  // means every location in that restaurant.
  locationsByBrand: {},
  // Everything on by default. Untick what this person should not reach.
  categoryIds: ALL_CATEGORY_IDS,
  features: ALL_FEATURE_KEYS,
});

export default function AdminUsersScreen() {
  const { dialogNode, confirm, notify } = useDialog();
  const {
    users,
    addUser,
    sendPasswordReset,
    setUserActive,
    updateUserRole,
    updateUserJob,
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

  // Every location in a restaurant, built-in and added later - Chelsea is one
  // of the added ones.
  const locationsFor = (brandId) => {
    const brand = brands.find((b) => b.id === brandId);
    return [
      ...(brand?.locations ?? []).map((l) => ({ id: l.id, name: l.name })),
      ...getByBrand(brandId).map((l) => ({ id: l.id, name: l.name })),
    ];
  };

  if (currentUser?.role !== 'admin') {
    return (
      <div style={styles.page}>
        <p style={{ color: 'var(--text-secondary)' }}>Admins only.</p>
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
        notify('Could not create login', err?.message ?? 'Something went wrong.');
      } finally {
        setSaving(false);
      }
      return;
    }

    const target = users.find((u) => u.uid === panelMode);
    if (!target) return;
    setSaving(true);
    try {
      if (draft.role !== target.role) await updateUserRole(target.uid, draft.role);
      if (draft.job !== (target.job ?? null)) await updateUserJob(target.uid, draft.job);
      await updatePermissions(target.uid, { ...(target.permissions ?? {}), ...permissionsFromDraft() });
      setPanelMode(null);
    } catch (err) {
      notify('Could not save', err?.message ?? 'Nothing was changed. Try again.');
    } finally {
      setSaving(false);
    }
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
          notify('Could not send', err?.message ?? 'Something went wrong.');
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
          notify('Could not reactivate', err?.message ?? 'Something went wrong.');
        }
      },
    });
  };

  const handleDeactivate = (uid, targetName) => {
    confirm({
      title: `Deactivate ${targetName}?`,
      body: "They won't be able to sign in, and they'll drop out of every assignee picker and team list. Their account and everything they've entered stays put, and you can switch them back on here at any time.",
      confirmLabel: 'Deactivate',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await setUserActive(uid, false);
          // Opens the checklist of what to revoke outside the Hub.
          await startOffboarding(users.find((u) => u.uid === uid) ?? { uid, name: targetName }, currentUser?.name);
        } catch (err) {
          notify('Could not deactivate', err?.message ?? 'Something went wrong.');
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
    if (u.role === 'manager') parts.push(whereText(u.permissions));
    return parts.join(' · ');
  };

  const exceptions = (all, have, labelOf) => all.filter((x) => !have.includes(x)).map(labelOf);

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Manage Logins</h1>
        <button style={styles.newButton} onClick={openCreate}>
          + New login
        </button>
      </div>

      <div style={styles.list}>
        {users.map((item) => {
          const open = expandedUserId === item.uid;
          return (
            <div key={item.uid} style={{ ...styles.row, ...(!item.active ? styles.rowInactive : {}) }}>
              <button style={styles.rowHead} onClick={() => setExpandedUserId(open ? null : item.uid)}>
                <span style={styles.rowName}>{item.name}</span>
                {item.isGhost ? <span style={styles.ghostBadge}>TEST</span> : null}
                {!item.active ? <span style={styles.inactiveBadge}>DEACTIVATED</span> : null}
                <span style={styles.rowSummary}>{summaryLine(item)}</span>
                <span style={styles.chevron}>{open ? '▾' : '▸'}</span>
              </button>

              {open ? (
                <div style={styles.rowBody}>
                  <p style={styles.email}>{item.email}</p>

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
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

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

      <button style={styles.repairRow} onClick={() => setRepairOpen((v) => !v)}>
        <span>🚧 Pages under repair</span>
        <span style={styles.chevron}>{repairOpen ? '▾' : '▸'}</span>
      </button>
      {repairOpen ? <UnderRepairControls /> : null}

      {panelMode ? (
        <AccessPanel
          mode={panelMode === 'create' ? 'create' : 'edit'}
          draft={draft}
          setDraft={setDraft}
          locationsFor={locationsFor}
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
function AccessPanel({ mode, draft, setDraft, locationsFor, presets, savePreset, saving, onSave, onClose }) {
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
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.panelTitle}>{mode === 'create' ? 'New login' : `Edit access — ${draft.name}`}</h2>

        {mode === 'create' && presets.length > 0 ? (
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
            <option value="">No job / department</option>
            {JOB_OPTIONS.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </div>

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

            <div style={styles.twoCol}>
              <div>
                <p style={styles.sectionLabel}>Folders</p>
                <button style={styles.summaryBox} onClick={() => setFoldersOpen((v) => !v)}>
                  <span>{folderSummary}</span>
                  <span style={styles.chevron}>{foldersOpen ? '▾' : '▸'}</span>
                </button>
              </div>
              <div>
                <p style={styles.sectionLabel}>Can reach</p>
                <button style={styles.summaryBox} onClick={() => setReachOpen((v) => !v)}>
                  <span>{reachSummary}</span>
                  <span style={styles.chevron}>{reachOpen ? '▾' : '▸'}</span>
                </button>
              </div>
            </div>

            {foldersOpen ? (
              <div style={styles.box}>
                <div style={styles.boxHead}>
                  <span style={styles.sectionLabelInline}>Folders</span>
                  <button style={styles.linkButton} onClick={() => set({ categoryIds: ALL_CATEGORY_IDS })}>All</button>
                  <button style={styles.linkButton} onClick={() => set({ categoryIds: [] })}>None</button>
                </div>
                <div style={styles.locGrid}>
                  {categories.map((c) => (
                    <label key={c.id} style={styles.checkRow}>
                      <input
                        type="checkbox"
                        checked={draft.categoryIds.includes(c.id)}
                        onChange={() => set({ categoryIds: toggleInArray(draft.categoryIds, c.id) })}
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {reachOpen ? (
              <div style={styles.box}>
                <div style={styles.boxHead}>
                  <span style={styles.sectionLabelInline}>Can reach</span>
                  <button style={styles.linkButton} onClick={() => set({ features: ALL_FEATURE_KEYS })}>All</button>
                  <button style={styles.linkButton} onClick={() => set({ features: [] })}>None</button>
                </div>
                <div style={styles.locGrid}>
                  {FEATURES.map((f) => (
                    <label key={f.key} style={styles.checkRow}>
                      <input
                        type="checkbox"
                        checked={draft.features.includes(f.key)}
                        onChange={() => set({ features: toggleInArray(draft.features, f.key) })}
                      />
                      <span>{f.label}</span>
                    </label>
                  ))}
                </div>
                <p style={styles.note}>Messages, the calendar and their profile are always available.</p>
              </div>
            ) : null}
          </>
        ) : (
          <p style={styles.note}>
            {draft.role === 'executive'
              ? "Executives see everything, and can approve requests, post announcements and manage the calendar — but can't manage logins, connect Drive folders, set an opening date, or approve their own requests."
              : 'Admins see everything.'}
            {mode === 'edit' ? ' Their manager access stays saved, so switching back restores exactly what they had.' : ''}
          </p>
        )}

        {draft.role === 'manager' ? (
          <button
            style={styles.linkButton}
            onClick={async () => {
              const name = window.prompt('Name this preset — for example, Assistant Manager');
              if (!name || !name.trim()) return;
              try {
                await savePreset({
                  name,
                  role: draft.role,
                  job: draft.job,
                  categoryIds: draft.categoryIds,
                  features: draft.features,
                });
              } catch (err) {
                console.error('[Presets] ' + err.message);
              }
            }}
          >
            Save these settings as a preset
          </button>
        ) : null}

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
  page: { padding: '28px max(22px, min(36px, 4vw))', maxWidth: 760 },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  newButton: { padding: '9px 14px', borderRadius: 10, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer' },

  list: { background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', marginBottom: 14 },
  row: { borderBottom: '1px solid var(--border)' },
  rowInactive: { opacity: 0.55 },
  rowHead: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)' },
  rowName: { fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' },
  rowSummary: { flex: 1, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  ghostBadge: { fontSize: 10, fontWeight: 700, color: '#C9A227', letterSpacing: 0.5 },
  inactiveBadge: { fontSize: 10, fontWeight: 700, color: 'var(--danger)', letterSpacing: 0.5 },
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
  sectionLabelInline: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', flex: 1 },
  twoCol: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8, marginBottom: 8 },
  input: { width: '100%', boxSizing: 'border-box', height: 38, padding: '0 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 },
  readOnly: { fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' },
  box: { border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', marginBottom: 8 },
  boxHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
  brandBlock: { padding: '2px 0' },
  checkRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', padding: '4px 0', cursor: 'pointer' },
  nested: { paddingLeft: 26, marginBottom: 4 },
  locGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', columnGap: 12 },
  summaryBox: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', minHeight: 38, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12, textAlign: 'left', cursor: 'pointer' },
  linkButton: { background: 'none', border: 'none', padding: 0, color: 'var(--neon)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  note: { fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5, margin: '6px 0 0' },
  panelFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 20, flexWrap: 'wrap' },
  cancelButton: { padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  saveButton: { padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 13, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer' },
};
