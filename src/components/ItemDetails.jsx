import React, { useState } from 'react';
import { useDialog } from '../hooks/useDialog';
import ConfirmEditField from './ConfirmEditField';
import DocumentsField, { documentsOf } from './DocumentsField';
import AssigneePicker from './AssigneePicker';
import DependencyPicker from './DependencyPicker';
import { assigneesOf } from '../data/assignees';
import { useIsNarrow } from '../hooks/useIsNarrow';

// The expanded body of a checklist row. The row itself owns whether this is
// shown — one chevron per item rather than a separate Details button, which
// halves the collapsed height of a 56-item list.
//
// Only fields holding something are rendered. Everything else is behind the
// picker, so an item with a permit number shows one field instead of six
// empty ones. Every field stays available on every item — guessing which
// belong where means someone eventually has nowhere to put something.
const FIELDS = [
  { key: 'notes', label: 'Notes', multiline: true, wide: true },
  { key: 'reference', label: 'Reference / Permit #' },
  { key: 'expiry', label: 'Expiry', type: 'date' },
  { key: 'company', label: 'Company' },
  { key: 'accountNumber', label: 'Account Number' },
  { key: 'contact', label: 'Contact' },
];

export default function ItemDetails({
  item,
  onSave,
  locationId,
  userName,
  // Assignment and deletion are only offered to admins, the COO and the
  // beverage manager - the screen decides, this just renders what it is given.
  assignableUsers = null,
  onAssign = null,
  onDeleteItem = null,
  // Every other item at this location, for the dependency picker. Null when
  // the person cannot restructure the checklist.
  dependencyOptions = null,
  onChangeDependencies = null,
  templateDependencyIds = null,
  // View-only people see what has been filled in, with nothing to change.
  readOnly = false,
  // The person asked to sign can still add the signed copy (10 Oct 2026).
  canAddDocuments = false,
  // The action bar's buttons (Mark done, the date, Needs a signature) and
  // what shows under it (description, date editor) - 17 Oct 2026.
  actions = null,
  intro = null,
}) {
  const { dialogNode, confirm } = useDialog();
  // Fields added this session but not yet saved — without this they'd vanish
  // the moment the picker closes, since they hold no value to render from.
  const [added, setAdded] = useState([]);

  // Whatever this item waits on - its own list if it has been edited here,
  // otherwise the template's baseline. Touching any chip writes the resolved
  // list onto the record, and from then on this location owns it.
  const resolvedDependencies = item.dependsOnIds ?? templateDependencyIds ?? [];

  const hasValue = (f) => Boolean(item.openingFields?.[f.key]);
  const visible = FIELDS.filter((f) => hasValue(f) || added.includes(f.key));
  const available = FIELDS.filter((f) => !visible.includes(f));

  const removeField = (key, label) => {
    setAdded((a) => a.filter((k) => k !== key));
    // Only confirm when there's something to lose — dismissing an empty field
    // someone just added is harmless, and a dialog there would be friction.
    const value = item.openingFields?.[key];
    if (!value) return;
    confirm({
      title: `Remove ${label}?`,
      body: `"${value}" will be deleted.`,
      confirmLabel: 'Remove',
      tone: 'danger',
      onConfirm: () => onSave(item, key, ''),
    });
  };

  const isNarrow = useIsNarrow();
  const assignees = assigneesOf(item);
  const docs = documentsOf(item);

  // One labelled row per part of the item (17 Oct 2026, sketch 20): label and
  // count on the left, the thing itself on the right. On a phone the label
  // sits above. Read-only people only see rows that hold something.
  const prop = (labelText, count, body, key) => (
    <div key={key} style={{ ...(isNarrow ? styles.propNarrow : styles.prop), ...(rows.length ? {} : { borderTop: 'none' }) }}>
      <div style={isNarrow ? styles.propLabelNarrow : styles.propLabel}>
        {labelText}
        {count ? <span style={styles.count}>{count}</span> : null}
      </div>
      <div style={styles.propValue}>{body}</div>
    </div>
  );

  const rows = [];
  if (assignableUsers) {
    rows.push(prop('Assigned to', assignees.uids.length, (
      <AssigneePicker {...assignees} people={assignableUsers} onChange={(uids) => onAssign(item, uids)} />
    ), 'a'));
  } else if (assignees.uids.length) {
    rows.push(prop('Assigned to', assignees.uids.length, <span style={styles.plain}>{assignees.names.join(', ')}</span>, 'a'));
  }

  if (dependencyOptions) {
    rows.push(prop('Waits for', resolvedDependencies.length, (
      <div style={styles.stack}>
        {resolvedDependencies.length > 0 ? (
          <div style={styles.chipRow}>
            {resolvedDependencies.map((id) => {
              const dep = dependencyOptions.find((o) => o.id === id);
              return (
                <span key={id} style={styles.dep}>
                  <span style={{ ...styles.depDot, background: dep?.done ? 'var(--ok)' : 'var(--warn)' }} />
                  <span style={styles.depName}>{dep?.title ?? 'Removed item'}</span>
                  <span style={styles.depState}>{dep?.done ? 'done' : 'not done'}</span>
                  <button
                    type="button"
                    style={styles.depX}
                    aria-label={'Take ' + (dep?.title ?? 'it') + ' off'}
                    onClick={() => onChangeDependencies(item, resolvedDependencies.filter((x) => x !== id))}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}
        <DependencyPicker
          options={dependencyOptions}
          selected={resolvedDependencies}
          selfId={item.id}
          onAdd={(ids) => onChangeDependencies(item, [...resolvedDependencies, ...ids.filter((x) => !resolvedDependencies.includes(x))])}
        />
      </div>
    ), 'w'));
  }

  // Every item can hold its documents - items added in the Hub (no setupKey)
  // too, filed under the item's own id (8 Oct 2026).
  const docsReadOnly = readOnly && !canAddDocuments;
  if (locationId && (!docsReadOnly || docs.length)) {
    rows.push(prop('Documents', docs.length, (
      <DocumentsField
        hideLabel
        locationId={locationId}
        itemKey={item.setupKey || item.id}
        value={docs}
        userName={userName}
        readOnly={docsReadOnly}
        onChange={(list) => onSave(item, '__documents', list)}
      />
    ), 'd'));
  }

  if (visible.length > 0 || (!readOnly && available.length > 0)) {
    rows.push(prop('Details', FIELDS.filter(hasValue).length, (
      <div style={styles.stack}>
        {visible.length > 0 ? (
          <div style={isNarrow ? styles.fieldGridNarrow : styles.fieldGrid}>
            {visible.map((f) => (
              <div key={f.key} style={f.wide ? styles.fieldWide : styles.field}>
                {readOnly ? (
                  <p style={styles.readOnlyField}>
                    <span style={styles.readOnlyLabel}>{f.label}</span>
                    {item.openingFields?.[f.key]}
                  </p>
                ) : (
                  <>
                    <button
                      style={styles.remove}
                      onClick={() => removeField(f.key, f.label)}
                      title={`Remove ${f.label}`}
                    >
                      ×
                    </button>
                    <ConfirmEditField
                      label={f.label}
                      type={f.type}
                      multiline={f.multiline}
                      value={item.openingFields?.[f.key]}
                      onSave={(v) => onSave(item, f.key, v)}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        ) : null}
        {!readOnly && available.length > 0 ? (
          <select
            style={styles.picker}
            value=""
            aria-label="Add a field"
            onChange={(e) => {
              if (e.target.value) setAdded((a) => [...a, e.target.value]);
            }}
          >
            <option value="">Add a field…</option>
            {available.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    ), 'f'));
  }

  const removeButton = onDeleteItem ? (
    <button style={styles.removeItem} onClick={() => onDeleteItem(item)}>
      Remove item
    </button>
  ) : null;

  return (
    <div style={styles.wrap}>
      {/* What you do to the item, in one bar at the top. Remove sits apart on
          the right - at the very bottom on a phone, away from thumbs. */}
      {actions || (removeButton && !isNarrow) ? (
        <div style={isNarrow ? { ...styles.bar, gap: 6, padding: '10px' } : styles.bar}>
          {actions}
          {isNarrow ? null : <span style={{ flex: 1 }} />}
          {isNarrow ? null : removeButton}
        </div>
      ) : null}
      {intro ? <div style={styles.intro}>{intro}</div> : null}
      {rows.length ? <div style={styles.rows}>{rows}</div> : null}
      {isNarrow && removeButton ? <div style={styles.bottom}>{removeButton}</div> : null}
      {dialogNode}
    </div>
  );
}

const styles = {
  readOnlyField: { margin: '4px 0', fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' },
  readOnlyLabel: { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 },
  wrap: { display: 'flex', flexDirection: 'column' },
  bar: {
    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    padding: '12px 14px', borderBottom: '1px solid var(--border)',
  },
  intro: { padding: '12px 14px 2px' },
  rows: { display: 'flex', flexDirection: 'column', padding: '4px 0 6px' },
  prop: {
    display: 'grid', gridTemplateColumns: '130px minmax(0, 1fr)', gap: 12, alignItems: 'start',
    padding: '12px 14px', borderTop: '1px solid var(--border)',
  },
  propNarrow: { display: 'flex', flexDirection: 'column', gap: 8, padding: '12px', borderTop: '1px solid var(--border)' },
  propLabel: { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', paddingTop: 8, display: 'flex', alignItems: 'center', gap: 8 },
  propLabelNarrow: { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 },
  count: { fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', background: 'var(--bg-inset)', borderRadius: 5, padding: '1px 6px' },
  propValue: { minWidth: 0 },
  plain: { fontSize: 13, color: 'var(--text-primary)', lineHeight: '34px' },
  stack: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', minWidth: 0 },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  dep: {
    display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%',
    background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '4px 2px 4px 10px', fontSize: 13, color: 'var(--text-primary)',
  },
  depDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  depName: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  depState: { fontSize: 11.5, color: 'var(--text-tertiary)', flexShrink: 0 },
  depX: { background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 16, lineHeight: 1, padding: '2px 7px', cursor: 'pointer', textTransform: 'none' },
  fieldGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '2px 12px', width: '100%' },
  fieldGridNarrow: { display: 'flex', flexDirection: 'column', gap: 2, width: '100%' },
  field: { position: 'relative', minWidth: 0 },
  fieldWide: { position: 'relative', minWidth: 0, gridColumn: '1 / -1' },
  remove: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 16,
    height: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-tertiary)',
    fontSize: 14,
    lineHeight: 1,
    padding: 0,
    zIndex: 1,
  },
  picker: {
    minWidth: 180,
    boxSizing: 'border-box',
    height: 34,
    padding: '0 11px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-inset)',
    color: 'var(--text-secondary)',
    fontSize: 13,
    fontFamily: 'inherit',
  },
  removeItem: {
    flex: '0 0 auto',
    minHeight: 36,
    padding: '0 10px',
    borderRadius: 8,
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--danger)',
    fontSize: 12.5,
    fontWeight: 700,
    cursor: 'pointer',
    textTransform: 'none',
  },
  bottom: { display: 'flex', justifyContent: 'flex-end', padding: '6px 8px', borderTop: '1px solid var(--border)' },
};
