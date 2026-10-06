import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Manage Logins → See the Hub as someone. Active people only: deactivated
// and test logins are left out.
export default function ViewAsPicker() {
  const { users, realUser, startViewAs } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const people = (users ?? [])
    .filter((u) => u.active !== false && !u.isGhost && u.uid !== realUser?.uid)
    .filter((u) => (u.name + ' ' + (u.job ?? '')).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  return (
    <div style={styles.wrap}>
      <p style={styles.title}>See the Hub as…</p>
      <p style={styles.note}>Active people only. Read-only — nothing you click changes anything until you go back to your own view.</p>
      <input style={styles.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name or job" />
      {people.map((u) => (
        <button
          key={u.uid}
          style={styles.row}
          onClick={async () => {
            await startViewAs(u.uid);
            navigate('/');
          }}
        >
          <span style={styles.name}>{u.name}</span>
          <span style={styles.job}>{u.job ?? 'No job'}</span>
        </button>
      ))}
    </div>
  );
}

const styles = {
  wrap: { background: '#16161A', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 20, maxWidth: 520 },
  title: { fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text-primary)' },
  note: { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 12px', lineHeight: 1.5 },
  input: { width: '100%', boxSizing: 'border-box', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)', fontFamily: 'inherit', marginBottom: 8 },
  row: { display: 'flex', width: '100%', textAlign: 'left', gap: 10, background: 'none', border: 'none', borderTop: '1px solid var(--border)', padding: '10px 2px', cursor: 'pointer', alignItems: 'baseline' },
  name: { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', flex: 1 },
  job: { fontSize: 12, color: 'var(--text-tertiary)' },
};
