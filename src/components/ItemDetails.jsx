import React, { useState } from 'react';
import ConfirmEditField from './ConfirmEditField';

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

export default function ItemDetails({ item, onSave }) {
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
    if (window.confirm(`Remove ${label}?\n\n"${value}" will be deleted.`)) {
      onSave(item, key, '');
    }
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

      {available.length > 0 ? (
        <select
          style={styles.picker}
          value=""
          onChange={(e) => {
            if (e.target.value) setAdded((a) => [...a, e.target.value]);
          }}
        >
          <option value="">+ Add field</option>
          {available.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

const styles = {
  wrap: { padding: '10px 16px 14px 46px' },
  fieldRow: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  field: { width: 220, position: 'relative' },
  fieldWide: { width: 360, maxWidth: '100%', position: 'relative' },
  remove: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    border: 'none',
    background: 'var(--bg-card)',
    color: 'var(--text-tertiary)',
    fontSize: 13,
    lineHeight: '14px',
    zIndex: 1,
  },
  picker: {
    padding: '5px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px dashed var(--border-strong)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 600,
  },
};
