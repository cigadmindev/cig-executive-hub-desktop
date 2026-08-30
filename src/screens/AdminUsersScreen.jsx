import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { brands, categories, marketAnalysisId, marketAnalysisLabel } from '../data/mockData';
import { JOB_OPTIONS } from '../context/EventRequestsContext';
import { useDialog } from '../hooks/useDialog';
import { nike } from '../theme/nike';

function toggleInArray(arr, id) {
  return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
}


function cleanJob(j) {
  return (j || '').replace(/^[^\u0000-\u007F]+\s*/, '');
}

export default function AdminUsersScreen() {
  const { dialogNode, confirm, notify } = useDialog();
  const { users, addUser, sendPasswordReset, setUserActive, updateUserRole, user: currentUser } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('manager');
  const [job, setJob] = useState(null);
  const [brandIds, setBrandIds] = useState([]);
  const [categoryIds, setCategoryIds] = useState([]);
  const [creating, setCreating] = useState(false);
  const [roleEditUser, setRoleEditUser] = useState(null);
  const [savingRole, setSavingRole] = useState(false);

  if (currentUser?.role !== 'admin') {
    return (
      <div style={styles.page}>
        <p style={{ color: 'var(--text-secondary)' }}>Admins only.</p>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      notify('Missing details', 'Fill in name, email, and password.');
      return;
    }
    if (password.length < 6) {
      notify('Password too short', 'Passwords need at least 6 characters.');
      return;
    }
    setCreating(true);
    try {
      const created = await addUser({ name: name.trim(), email: email.trim(), password, role, permissions: { brandIds, categoryIds }, job });
      setName('');
      setEmail('');
      setPassword('');
      setBrandIds([]);
      setCategoryIds([]);
      setJob(null);
      notify(
        'Login created',
        created?.invited
          ? `${name} can sign in as ${role}. They've been emailed a link to set their own password.`
          : `${name} can sign in as ${role}, but the invite email didn't send. Use "Send reset" to try again.`
      );
    } catch (err) {
      notify('Could not create login', err?.message ?? 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const handleSendReset = async (targetEmail, targetName) => {
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

  const handleDeactivate = async (uid, targetName) => {
    confirm({
      title: `Deactivate ${targetName}?`,
      body: "This removes them from the app completely — Manage Logins, every assignee picker, everywhere. They'd need a brand new login to come back.",
      confirmLabel: 'Deactivate',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await setUserActive(uid, false);
        } catch (err) {
          notify('Could not deactivate', err?.message ?? 'Something went wrong.');
        }
      },
    });
  };

  const handleChangeRole = async (newRole) => {
    if (!roleEditUser) return;
    setSavingRole(true);
    try {
      await updateUserRole(roleEditUser.uid, newRole);
      setRoleEditUser(null);
    } catch (err) {
      notify('Could not change role', err?.message ?? 'Something went wrong.');
    } finally {
      setSavingRole(false);
    }
  };

  return (
    <div style={styles.page}>
      <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Manage Logins</h1>

      <h3 style={styles.sectionTitle}>Create a Login</h3>
      <input style={styles.input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <input style={styles.input} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input style={styles.input} type="password" placeholder="Temporary password" value={password} onChange={(e) => setPassword(e.target.value)} />

      <div style={styles.roleRow}>
        <button style={{ ...styles.roleButton, ...(role === 'manager' ? styles.roleButtonActive : {}) }} onClick={() => setRole('manager')}>
          Manager
        </button>
        <button style={{ ...styles.roleButton, ...(role === 'executive' ? styles.roleButtonActive : {}) }} onClick={() => setRole('executive')}>
          Executive
        </button>
        <button style={{ ...styles.roleButton, ...(role === 'admin' ? styles.roleButtonActive : {}) }} onClick={() => setRole('admin')}>
          Admin
        </button>
      </div>

      <p style={styles.permissionLabel}>Job / Department (optional)</p>
      <div style={styles.chipWrap}>
        {JOB_OPTIONS.map((j) => (
          <button
            key={j}
            style={{ ...styles.chip, ...(job === j ? styles.chipActive : {}) }}
            onClick={() => setJob(job === j ? null : j)}
          >
            {j}
          </button>
        ))}
      </div>

      {role === 'manager' ? (
        <>
          <p style={styles.permissionLabel}>Which restaurants can they see?</p>
          <div style={styles.chipWrap}>
            {[...brands, { id: marketAnalysisId, name: marketAnalysisLabel }].map((b) => (
              <button
                key={b.id}
                style={{ ...styles.chip, ...(brandIds.includes(b.id) ? styles.chipActive : {}) }}
                onClick={() => setBrandIds(toggleInArray(brandIds, b.id))}
              >
                {b.name}
              </button>
            ))}
          </div>

          <p style={styles.permissionLabel}>Which categories can they see?</p>
          <div style={styles.chipWrap}>
            {categories.map((c) => (
              <button
                key={c.id}
                style={{ ...styles.chip, ...(categoryIds.includes(c.id) ? styles.chipActive : {}) }}
                onClick={() => setCategoryIds(toggleInArray(categoryIds, c.id))}
              >
                {c.label}
              </button>
            ))}
          </div>
        </>
      ) : role === 'executive' ? (
        <p style={styles.adminNote}>
          Executives automatically see everything, and can approve requests, post announcements, and
          manage the calendar — but can't manage logins, connect Drive folders, set an opening date, or
          approve their own requests.
        </p>
      ) : (
        <p style={styles.adminNote}>Admins automatically see everything — no need to set permissions.</p>
      )}

      <button style={styles.button} disabled={creating} onClick={handleCreate}>
        {creating ? 'Creating…' : 'Create Login'}
      </button>

      <h3 style={styles.sectionTitle}>Existing Logins</h3>
      {users.map((item) => (
        <div key={item.uid} style={{ ...styles.userRow, ...(!item.active ? styles.userRowInactive : {}) }}>
          <div style={styles.userHeaderRow}>
            <span style={styles.userName}>{item.name}</span>
            {!item.active ? <span style={styles.inactiveBadge}>DEACTIVATED</span> : null}
          </div>
          <p style={styles.userDetail}>
            {item.email} · {item.role}
            {item.job ? ` · ${cleanJob(item.job)}` : ''}
          </p>
          {item.role === 'manager' ? (
            <p style={styles.userPermissions}>
              {item.permissions.brandIds.length > 0 ? `Restaurants: ${item.permissions.brandIds.length}` : 'No restaurants granted yet'}
              {' · '}
              {item.permissions.categoryIds.length > 0 ? `Categories: ${item.permissions.categoryIds.length}` : 'No categories granted yet'}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={styles.resetButton} onClick={() => handleSendReset(item.email, item.name)}>
              Send Password Reset
            </button>
            {item.uid !== currentUser?.uid ? (
              <>
                <button style={styles.resetButton} onClick={() => setRoleEditUser({ uid: item.uid, name: item.name, role: item.role })}>
                  Change Role
                </button>
                <button style={styles.deactivateButton} onClick={() => handleDeactivate(item.uid, item.name)}>
                  Deactivate Login
                </button>
              </>
            ) : (
              <span style={styles.selfNote}>This is your own account</span>
            )}
          </div>
        </div>
      ))}

      <p style={styles.note}>
        These are real Firebase accounts — logins persist across restarts, for everyone on their own
        device. New logins get an email to set their own password automatically. If anyone forgets
        theirs later, use "Send Password Reset" above.
      </p>

      {roleEditUser ? (
        <div style={styles.modalBackdrop} onClick={() => !savingRole && setRoleEditUser(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Change Role</h2>
            <p style={styles.modalSubtitle}>{roleEditUser.name}</p>
            <div style={styles.roleRow}>
              <button
                style={{ ...styles.roleButton, ...(roleEditUser.role === 'manager' ? styles.roleButtonActive : {}) }}
                onClick={() => handleChangeRole('manager')}
                disabled={savingRole}
              >
                Manager
              </button>
              <button
                style={{ ...styles.roleButton, ...(roleEditUser.role === 'executive' ? styles.roleButtonActive : {}) }}
                onClick={() => handleChangeRole('executive')}
                disabled={savingRole}
              >
                Executive
              </button>
              <button
                style={{ ...styles.roleButton, ...(roleEditUser.role === 'admin' ? styles.roleButtonActive : {}) }}
                onClick={() => handleChangeRole('admin')}
                disabled={savingRole}
              >
                Admin
              </button>
            </div>
            {roleEditUser.role === 'manager' ? (
              <p style={styles.modalNote}>
                Switching to Admin or Executive gives full access immediately — their existing restaurant/category
                permissions stay saved, so switching back to Manager later restores exactly what they had.
              </p>
            ) : null}
            <button style={styles.cancelButton} onClick={() => setRoleEditUser(null)} disabled={savingRole}>
              {savingRole ? 'Saving…' : 'Cancel'}
            </button>
          </div>
        </div>
      ) : null}
      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '28px 36px', maxWidth: 640 },
  title: { fontSize: 22, fontWeight: 700, margin: '0 0 20px' },
  sectionTitle: { fontSize: 15, fontWeight: 700, marginTop: 20, marginBottom: 10 },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 10,
  },
  roleRow: { display: 'flex', gap: 10, marginBottom: 12 },
  roleButton: { flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 },
  roleButtonActive: { background: 'var(--neon)', color: 'var(--neon-text)', borderColor: 'var(--neon)' },
  permissionLabel: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 10, marginBottom: 6 },
  chipWrap: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    flexBasis: '48%',
    flexGrow: 1,
    textAlign: 'left',
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text-primary)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  chipActive: { background: 'rgba(223,255,79,0.10)', color: 'var(--neon)', fontWeight: 900, borderColor: 'var(--neon)' },
  adminNote: { color: 'var(--text-secondary)', fontSize: 12, fontStyle: 'italic', marginTop: 4, marginBottom: 8 },
  button: { width: '100%', padding: '12px 0', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 14, marginTop: 8, textTransform: 'uppercase' },
  userRow: { background: 'var(--bg-card)', borderRadius: 12, padding: 14, marginBottom: 8, border: 'none' },
  userRowInactive: { opacity: 0.55, borderColor: 'rgba(232,82,75,0.4)' },
  userHeaderRow: { display: 'flex', alignItems: 'center', gap: 8 },
  inactiveBadge: { fontSize: 10, fontWeight: 700, color: 'var(--danger)', letterSpacing: 0.5 },
  userName: { fontSize: 14, fontWeight: 600 },
  userDetail: { fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' },
  userPermissions: { fontSize: 11, color: 'var(--text-secondary)', margin: '4px 0 0' },
  resetButton: { padding: '7px 12px', borderRadius: 10, border: 'none', background: 'var(--bg-inset)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 },
  deactivateButton: { padding: '7px 12px', borderRadius: 10, border: 'none', background: 'rgba(232,82,75,0.12)', color: 'var(--danger)', fontSize: 12, fontWeight: 700 },
  selfNote: { color: 'var(--text-secondary)', fontSize: 11, fontStyle: 'italic', alignSelf: 'center' },
  note: { marginTop: 16, color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.6 },
  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { width: 380, background: 'var(--bg-elevated)', border: 'none', borderRadius: 18, padding: 22, boxShadow: 'var(--shadow-lg)' },
  modalTitle: { fontSize: 19, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.2, color: '#FFFFFF', margin: '0 0 4px' },
  modalSubtitle: { fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' },
  modalNote: { fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5, marginTop: 4 },
  cancelButton: {
    width: '100%',
    marginTop: 16,
    padding: '11px 0',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'none',
    color: 'var(--text-secondary)',
    fontWeight: 600,
    fontSize: 13,
  },
};
