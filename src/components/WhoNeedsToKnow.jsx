import React from 'react';
import { useAuth } from '../context/AuthContext';
import { JOB_OPTIONS } from '../context/EventRequestsContext';

// Pointing something at the people who need to know about it.
//
// The same control event requests already used, pulled out so it can be used
// anywhere: two dropdowns that add, then a list of what has been picked with
// an × to remove. Nothing expands, so nothing needs scrolling.
//
// Two fields, matching what event requests write, so the notification code
// reads them unchanged:
//   needs       job titles - reaches whoever holds them, now and later
//   notifyUids  particular people
export default function WhoNeedsToKnow({ needs = [], people = [], onChange, label = 'Who needs to know?' }) {
  const { activeUsers: users } = useAuth();

  const setNeeds = (next) => onChange({ needs: next, people });
  const setPeople = (next) => onChange({ needs, people: next });

  const toggleNeed = (need) =>
    setNeeds(needs.includes(need) ? needs.filter((n) => n !== need) : [...needs, need]);
  const togglePerson = (uid) =>
    setPeople(people.includes(uid) ? people.filter((p) => p !== uid) : [...people, uid]);

  return (
    <>
      <label style={styles.label}>{label}</label>

      <div style={styles.row}>
        <select
          style={styles.input}
          value=""
          onChange={(e) => {
            if (e.target.value) toggleNeed(e.target.value);
          }}
        >
          <option value="">Add a role…</option>
          {JOB_OPTIONS.filter((n) => !needs.includes(n)).map((need) => (
            <option key={need} value={need}>
              {need}
            </option>
          ))}
        </select>

        <select
          style={styles.input}
          value=""
          onChange={(e) => {
            if (e.target.value) togglePerson(e.target.value);
          }}
        >
          <option value="">Add a person…</option>
          {users
            .filter((u) => u.active !== false && !people.includes(u.uid))
            .map((u) => (
              <option key={u.uid} value={u.uid}>
                {u.name}
                {u.job ? ` — ${u.job}` : ''}
              </option>
            ))}
        </select>
      </div>

      {needs.length > 0 || people.length > 0 ? (
        <div style={styles.list}>
          {needs.map((need) => (
            <div key={need} data-row="" style={styles.item}>
              <span style={styles.name}>Everyone in {need}</span>
              <span style={styles.meta}>
                {users.filter((u) => u.job === need && u.active !== false).length} people
              </span>
              <button data-hover-only="" style={styles.remove} onClick={() => toggleNeed(need)}>
                ×
              </button>
            </div>
          ))}
          {people.map((uid) => {
            const person = users.find((u) => u.uid === uid);
            if (!person) return null;
            return (
              <div key={uid} data-row="" style={styles.item}>
                <span style={styles.name}>{person.name}</span>
                <span style={styles.meta}>{person.job || person.role}</span>
                <button data-hover-only="" style={styles.remove} onClick={() => togglePerson(uid)}>
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

// Matching the event request form, so the same control looks the same
// wherever someone meets it.
const styles = {
  label: { display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 5 },
  // Stacked, not side by side: two selects sharing a modal's width cut
  // their own placeholder text off mid-word.
  row: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 },
  input: {
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    height: 38,
    padding: '0 11px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: 13,
  },
  list: { background: 'var(--bg-inset)', borderRadius: 9, overflow: 'hidden', marginBottom: 14 },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 11px',
    borderBottom: '1px solid var(--border)',
  },
  name: { flex: 1, fontSize: 13, color: 'var(--text-primary)' },
  meta: { fontSize: 11, color: 'var(--text-tertiary)' },
  remove: {
    width: 18,
    height: 18,
    lineHeight: '16px',
    textAlign: 'center',
    borderRadius: 5,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-tertiary)',
    fontSize: 15,
    cursor: 'pointer',
  },
};
