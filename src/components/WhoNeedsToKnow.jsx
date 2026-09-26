import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { JOB_OPTIONS } from '../context/EventRequestsContext';

// Pointing something at the people who need to know about it.
//
// The same control everywhere - a calendar event, a checklist item, a renewal,
// a receipt - so it works the same wherever someone meets it. It sits
// alongside assignment rather than replacing it: an item can be assigned to
// one person and tag another.
//
// Two fields, matching what event requests already use, so the notification
// code reads them unchanged:
//   needs       job titles - reaches whoever holds them, now and in future
//   notifyUids  particular people
//
// A title rather than a person is usually the better choice: tagging
// "Videographer" reaches Nico today and whoever else holds it later, without
// anyone remembering to update it.
export default function WhoNeedsToKnow({ needs = [], people = [], onChange, label = 'Who needs to know?' }) {
  const { activeUsers } = useAuth();
  const [open, setOpen] = useState(false);

  const toggle = (list, value) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  const setNeeds = (next) => onChange({ needs: next, people });
  const setPeople = (next) => onChange({ needs, people: next });

  const nameFor = (uid) => activeUsers.find((u) => u.uid === uid)?.name ?? 'Someone';
  const chosen = [...needs, ...people.map(nameFor)];

  // Whoever holds a title, so the person choosing can see it reaches someone.
  const holdersOf = (job) => activeUsers.filter((u) => u.job === job);

  return (
    <div style={styles.wrap}>
      <button style={styles.head} onClick={() => setOpen((v) => !v)}>
        <span style={styles.label}>{label}</span>
        <span style={styles.summary}>
          {chosen.length === 0 ? 'Nobody yet' : chosen.join(', ')}
        </span>
        <span style={styles.chevron}>{open ? '▾' : '▸'}</span>
      </button>

      {open ? (
        <div style={styles.body}>
          <p style={styles.hint}>
            A job title reaches whoever holds it, now and later. Pick a person for someone in particular.
          </p>

          <p style={styles.sectionLabel}>By job</p>
          <div style={styles.chipWrap}>
            {JOB_OPTIONS.map((job) => {
              const holders = holdersOf(job);
              const on = needs.includes(job);
              return (
                <button
                  key={job}
                  style={{ ...styles.chip, ...(on ? styles.chipOn : {}), ...(holders.length === 0 ? styles.chipEmpty : {}) }}
                  onClick={() => setNeeds(toggle(needs, job))}
                  title={holders.length === 0 ? 'Nobody holds this title yet' : holders.map((h) => h.name).join(', ')}
                >
                  {job}
                  {holders.length > 0 ? <span style={styles.count}> {holders.length}</span> : null}
                </button>
              );
            })}
          </div>

          <p style={styles.sectionLabel}>By person</p>
          <div style={styles.chipWrap}>
            {activeUsers.map((u) => (
              <button
                key={u.uid}
                style={{ ...styles.chip, ...(people.includes(u.uid) ? styles.chipOn : {}) }}
                onClick={() => setPeople(toggle(people, u.uid))}
              >
                {u.name}
              </button>
            ))}
          </div>

          {chosen.length > 0 ? (
            <p style={styles.hint}>
              They will be emailed about this, and it will show under "Tagged for you" on their home screen.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  wrap: { border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12, overflow: 'hidden' },
  head: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' },
  label: { fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' },
  summary: { flex: 1, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chevron: { fontSize: 11, color: 'var(--text-tertiary)' },
  body: { padding: '0 12px 12px' },
  sectionLabel: { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '10px 0 6px' },
  chipWrap: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: { padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' },
  chipOn: { borderColor: 'var(--neon)', background: 'rgba(34,211,238,0.12)', color: 'var(--text-primary)' },
  chipEmpty: { opacity: 0.45 },
  count: { color: 'var(--text-tertiary)', fontSize: 11 },
  hint: { fontSize: 12, lineHeight: 1.5, color: 'var(--text-tertiary)', margin: '8px 0 0' },
};
