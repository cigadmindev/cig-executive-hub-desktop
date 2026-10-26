import React, { useState } from 'react';
import { useIsNarrow } from '../hooks/useIsNarrow';

// The location's contacts on the opening checklist (17 Oct 2026, sketch 21).
// A small card per person - name, and a number you can tap to call - the
// address with Open in Maps, and the four important numbers. Anything empty
// says "Not set", so gaps are easy to spot. "Edit details" turns it all into
// one form with a single Save; "Hide" folds it away and is remembered on
// this device.
const HIDE_KEY = 'hub.locationDetailsHidden';
const readHidden = () => {
  try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
};
const writeHidden = (v) => {
  try { localStorage.setItem(HIDE_KEY, v ? '1' : '0'); } catch { /* private window */ }
};

const NUMBER_LABELS = ['GM', 'KM / Chef', 'MGR', 'Other'];

// A phone number becomes a call link, an email a mail link, anything else
// stays plain text.
// Several in one box, split by " · " (26 Oct 2026: a cell, an office line and
// an email for Opry Mills' manager) - each on its own line, each tappable.
function ContactLink({ value, style }) {
  const v = (value ?? '').trim();
  if (!v) return null;
  const parts = v.split(/\s+·\s+/).filter(Boolean);
  if (parts.length > 1) {
    return (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        {parts.map((p, i) => <ContactLink key={i} value={p} style={style} />)}
      </span>
    );
  }
  if (/@/.test(v)) return <a href={'mailto:' + v} style={style}>{v}</a>;
  const digits = v.replace(/[^\d+]/g, '');
  if (digits.replace('+', '').length >= 7) return <a href={'tel:' + digits} style={style}>{v}</a>;
  return <span style={{ ...style, color: 'var(--text-secondary)' }}>{v}</span>;
}

export default function LocationDetails({ info, canEdit, onSave, notify }) {
  const isNarrow = useIsNarrow();
  const [hidden, setHidden] = useState(readHidden);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const people = [
    { label: isNarrow ? 'Property mgr' : 'Property manager', name: 'propertyManager', contact: 'propertyManagerContact', editLabel: 'Property manager' },
    { label: 'Landlord', name: 'landlord', contact: 'landlordContact', editLabel: 'Landlord' },
    { label: 'Contractor', name: 'contractor', contact: 'contractorContact', editLabel: 'Contractor' },
    { label: isNarrow ? 'Project mgr' : 'Project manager', name: 'projectManager', contact: 'projectManagerContact', editLabel: 'Project manager' },
  ];
  const numbers = info.importantNumbers ?? ['', '', '', ''];

  const toggleHidden = () => {
    setHidden((h) => { writeHidden(!h); return !h; });
  };

  const startEdit = () => {
    setDraft({
      propertyManager: info.propertyManager ?? '',
      propertyManagerContact: info.propertyManagerContact ?? '',
      landlord: info.landlord ?? '',
      landlordContact: info.landlordContact ?? '',
      contractor: info.contractor ?? '',
      contractorContact: info.contractorContact ?? '',
      projectManager: info.projectManager ?? '',
      projectManagerContact: info.projectManagerContact ?? '',
      address: info.address ?? '',
      importantNumbers: [0, 1, 2, 3].map((i) => numbers[i] ?? ''),
    });
    setEditing(true);
    setHidden(false);
  };

  // Only what changed is written, one field at a time - the same saves the
  // old boxes made, so nothing about who may save changes.
  const save = async () => {
    setSaving(true);
    try {
      for (const key of Object.keys(draft)) {
        if (key === 'importantNumbers') {
          const next = draft.importantNumbers.map((x) => x.trim());
          if (next.some((x, i) => x !== (numbers[i] ?? ''))) await onSave('importantNumbers', next);
        } else if (draft[key].trim() !== (info[key] ?? '')) {
          await onSave(key, draft[key].trim());
        }
      }
      setEditing(false);
    } catch (err) {
      notify?.('Could not save', 'Some details were not saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const input = (key, placeholder, value, onChange) => (
    <input style={styles.input} value={value ?? draft[key]} placeholder={placeholder} onChange={onChange ?? ((e) => set(key, e.target.value))} />
  );

  return (
    <div style={styles.wrap}>
      <div style={styles.head}>
        <span style={styles.title}>Location details</span>
        <div style={styles.headButtons}>
          {editing ? (
            <>
              <button style={styles.ghost} onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
              <button style={styles.primary} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </>
          ) : (
            <>
              <button style={styles.ghost} onClick={toggleHidden} aria-expanded={!hidden}>{hidden ? 'Show' : 'Hide'}</button>
              {canEdit ? <button style={styles.ghost} onClick={startEdit}>{isNarrow ? 'Edit' : 'Edit details'}</button> : null}
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div style={isNarrow ? styles.formNarrow : styles.form}>
          {people.map((p) => (
            <div key={p.name} style={styles.pair}>
              <span style={styles.role}>{p.editLabel}</span>
              <label style={styles.fieldLabel}>Name{input(p.name, 'Add a name')}</label>
              <label style={styles.fieldLabel}>Phone or email{input(p.contact, 'Add a number')}</label>
            </div>
          ))}
          <div style={{ ...styles.pair, gridColumn: '1 / -1' }}>
            <span style={styles.role}>Address</span>
            <label style={styles.fieldLabel}>Street, city, state, ZIP{input('address', '1016 Main St, Birmingham, AL 35242')}</label>
          </div>
          <div style={{ ...styles.pair, gridColumn: '1 / -1' }}>
            <span style={styles.role}>Important numbers</span>
            <div style={isNarrow ? styles.numbersFormNarrow : styles.numbersForm}>
              {NUMBER_LABELS.map((label, i) => (
                <label key={label} style={styles.fieldLabel}>
                  {label}
                  {input(null, 'Add', draft.importantNumbers[i], (e) =>
                    setDraft((d) => ({ ...d, importantNumbers: d.importantNumbers.map((x, j) => (j === i ? e.target.value : x)) }))
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : hidden ? null : (
        <>
          <div style={isNarrow ? styles.cardsNarrow : styles.cards}>
            {people.map((p) => (
              <div key={p.name} style={styles.card}>
                <span style={styles.role}>{p.label}</span>
                {info[p.name] ? <span style={styles.name}>{info[p.name]}</span> : <span style={styles.empty}>Not set</span>}
                {p.contact ? (
                  info[p.contact] ? <ContactLink value={info[p.contact]} style={styles.link} /> : info[p.name] ? <span style={styles.empty}>No number yet</span> : null
                ) : null}
              </div>
            ))}
          </div>
          <div style={isNarrow ? styles.addressWrapNarrow : styles.addressWrap}>
            <div style={styles.address}>
              <div style={{ minWidth: 0 }}>
                <span style={styles.role}>Address</span>
                {info.address ? <span style={styles.addressText}>{info.address}</span> : <span style={styles.empty}>Not set</span>}
              </div>
              {info.address ? (
                <a href={'https://maps.google.com/?q=' + encodeURIComponent(info.address)} target="_blank" rel="noreferrer" style={{ ...styles.link, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {isNarrow ? 'Maps ›' : 'Open in Maps ›'}
                </a>
              ) : null}
            </div>
          </div>
          <p style={isNarrow ? styles.subNarrow : styles.sub}>Important numbers</p>
          <div style={isNarrow ? styles.numbersNarrow : styles.numbers}>
            {NUMBER_LABELS.map((label, i) => (
              <div key={label} style={styles.card}>
                <span style={styles.role}>{label}</span>
                {numbers[i] ? <ContactLink value={numbers[i]} style={styles.link} /> : <span style={styles.empty}>Not set</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const card = {
  background: 'rgba(255,255,255,0.045)', border: '1px solid var(--border)', borderRadius: 10,
  padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
};

const styles = {
  wrap: { borderTop: '1px solid var(--border)' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 20px' },
  title: { fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' },
  headButtons: { display: 'flex', gap: 8 },
  ghost: { height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textTransform: 'none', whiteSpace: 'nowrap' },
  primary: { height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', textTransform: 'none', whiteSpace: 'nowrap' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, padding: '0 20px 10px' },
  cardsNarrow: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, padding: '0 14px 8px' },
  card,
  role: { display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  name: { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflowWrap: 'anywhere', lineHeight: 1.3 },
  link: { fontSize: 13, fontWeight: 600, color: 'var(--neon)', textDecoration: 'none', overflowWrap: 'anywhere' },
  empty: { fontSize: 13, color: 'var(--text-tertiary)' },
  addressWrap: { padding: '0 20px 14px' },
  addressWrapNarrow: { padding: '0 14px 10px' },
  address: { ...card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  addressText: { display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginTop: 3 },
  sub: { margin: 0, padding: '2px 20px 8px', fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  subNarrow: { margin: 0, padding: '2px 14px 8px', fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  numbers: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, padding: '0 20px 18px' },
  numbersNarrow: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, padding: '0 14px 14px' },
  form: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, padding: '0 20px 18px' },
  formNarrow: { display: 'flex', flexDirection: 'column', gap: 10, padding: '0 14px 14px' },
  pair: { ...card, gap: 10 },
  fieldLabel: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' },
  input: { height: 38, boxSizing: 'border-box', padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-inset)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', width: '100%' },
  numbersForm: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 },
  numbersFormNarrow: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
};
