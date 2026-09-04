import React, { useState } from 'react';
import { useDialog } from '../hooks/useDialog';
import ConfirmEditField from './ConfirmEditField';
import DocumentField from './DocumentField';

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
}) {
  const { dialogNode, confirm } = useDialog();
  // Fields added this session but not yet saved — without this they'd vanish
  // the moment the picker closes, since they hold no value to render from.
  const [added, setAdded] = useState([]);

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

  return (
    <div style={styles.wrap}>
      {visible.length > 0 ? (
        <div style={styles.fieldRow}>
          {visible.map((f) => (
            <div key={f.key} style={f.wide ? styles.fieldWide : styles.field}>
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
            </div>
          ))}
        </div>
      ) : null}

      {assignableUsers ? (
        <div style={styles.assignWrap}>
          <span style={styles.assignLabel}>Assigned to</span>
          <select
            style={styles.assignSelect}
            value={item.assignedToUid ?? ''}
            onChange={(e) => onAssign(item, e.target.value)}
          >
            <option value="">Nobody yet</option>
            {assignableUsers.map((u) => (
              <option key={u.uid} value={u.uid}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* The permit itself. Kept out of the field picker because it isn't
          one of several optional notes — it's the artifact the task exists
          to produce, and it travels into the renewal record afterwards. */}
      {locationId && item.setupKey ? (
        <DocumentField
          locationId={locationId}
          itemKey={item.setupKey}
          value={item.document ?? null}
          userName={userName}
          onChange={(doc) => onSave(item, '__document', doc)}
        />
      ) : null}

      {available.length > 0 ? (
        <div style={styles.pickerWrap}>
        <span style={styles.pickerLabel}>Add a field</span>
        <select
          style={styles.picker}
          value=""
          onChange={(e) => {
            if (e.target.value) setAdded((a) => [...a, e.target.value]);
          }}
        >
          <option value="">Choose a field</option>
          {available.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        </div>
      ) : null}
      {onDeleteItem ? (
        <div style={styles.removeItemWrap}>
          <button style={styles.removeItemLink} onClick={() => onDeleteItem(item)}>
            Remove this item from the checklist
          </button>
        </div>
      ) : null}

      {dialogNode}
    </div>
  );
}

const styles = {
  wrap: { padding: '10px 16px 14px 46px' },
  // Stacked rather than side by side — a row of narrow boxes reads as a form
  // to fill out; a short vertical list reads as the few things this item
  // actually holds.
  fieldRow: { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10, maxWidth: 420 },
  field: { position: 'relative' },
  fieldWide: { position: 'relative' },
  // Sits on the label line rather than floating over the field's corner,
  // and uses flex centring so the glyph is actually centred in its circle.
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
  assignWrap: { marginBottom: 12, maxWidth: 420 },
  assignLabel: {
    display: 'block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'var(--text-tertiary)',
    marginBottom: 5,
  },
  assignSelect: {
    width: '100%',
    boxSizing: 'border-box',
    height: 36,
    padding: '0 11px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid transparent',
    background: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    fontSize: 13,
  },
  removeItemWrap: {
    marginTop: 4,
    paddingTop: 10,
    borderTop: '1px solid var(--border)',
    maxWidth: 420,
  },
  removeItemLink: {
    background: 'none',
    border: 'none',
    padding: 0,
    color: 'var(--danger)',
    opacity: 0.75,
    fontSize: 11,
    cursor: 'pointer',
  },
  pickerWrap: { marginBottom: 14, maxWidth: 420 },
  pickerLabel: {
    display: 'block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'var(--text-tertiary)',
    marginBottom: 5,
  },
  picker: {
    width: '100%',
    boxSizing: 'border-box',
    height: 36,
    padding: '0 11px',
    borderRadius: 'var(--radius-sm)',
    border: '1px dashed var(--border-strong)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 13,
  },
};
