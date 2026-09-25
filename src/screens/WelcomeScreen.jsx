import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebaseConfig';

// Setting a password from the welcome email.
//
// Firebase password links expire after an hour, which is why logins had to be
// created live during the rollout and why two of Ben's links were dead by the
// time he opened them. The email carries a one-time token instead: it works
// until it is used.
export default function WelcomeScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [account, setAccount] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Who this link belongs to, so they can see the address before committing.
  useEffect(() => {
    if (!token) {
      setLoadError('This link is missing its code. Check the link in your email, or ask for a new invite.');
      return;
    }
    (async () => {
      try {
        const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'describeAccountSetup');
        const res = await fn({ token });
        setAccount(res.data);
      } catch (err) {
        setLoadError(err?.message ?? 'This link is no longer valid.');
      }
    })();
  }, [token]);

  const submit = async () => {
    setError(null);
    if (password.length < 8) return setError('Use at least eight characters.');
    if (password !== confirm) return setError('Those two do not match.');

    setSaving(true);
    try {
      const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'completeAccountSetup');
      const res = await fn({ token, password });
      // Straight in, rather than sending them back to sign in with something
      // they typed ten seconds ago.
      await signInWithEmailAndPassword(auth, res.data.email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err?.message ?? 'Something went wrong. Try again.');
      setSaving(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.brandRow}>
          <div style={styles.badge}>CIG</div>
          <span style={styles.brandName}>Executive Hub</span>
        </div>

        {loadError ? (
          <>
            <p style={styles.title}>This link has expired</p>
            <p style={styles.body}>{loadError}</p>
            <button style={styles.button} onClick={() => navigate('/', { replace: true })}>
              Go to sign in
            </button>
          </>
        ) : !account ? (
          <p style={styles.body}>One moment…</p>
        ) : (
          <>
            <p style={styles.title}>Welcome{account.name ? ', ' + account.name.split(' ')[0] : ''}</p>
            <p style={styles.body}>
              You&rsquo;re setting up the login for <span style={styles.email}>{account.email}</span>. Pick a
              password and you&rsquo;re in.
            </p>

            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />

            <label style={styles.label}>Confirm password</label>
            <input
              style={styles.input}
              type="password"
              placeholder="Type it again"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />

            {error ? <p style={styles.error}>{error}</p> : null}

            <button style={styles.button} onClick={submit} disabled={saving}>
              {saving ? 'Setting up…' : 'Set password and sign in'}
            </button>

            <div style={styles.note}>
              You&rsquo;ll stay signed in on this device from now on — no need to save your password anywhere or
              type it again. You&rsquo;ll only be asked for it if you sign out or use a different device.
            </div>

            <p style={styles.footNote}>
              The Hub works at hub.cigconcepts.com on any computer or phone. Bookmark it once you&rsquo;re in.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--bg-app)' },
  card: { width: 'min(400px, 100%)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 26 },
  brandRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 },
  badge: { width: 34, height: 34, borderRadius: 8, background: 'var(--neon)', color: 'var(--neon-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900 },
  brandName: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' },
  title: { fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' },
  body: { fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', margin: '0 0 20px' },
  email: { color: 'var(--text-primary)' },
  label: { display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 5 },
  input: { width: '100%', boxSizing: 'border-box', height: 40, padding: '0 12px', marginBottom: 12, borderRadius: 9, border: '1px solid var(--border-strong)', background: 'var(--bg-inset)', color: 'var(--text-primary)', fontSize: 14 },
  error: { fontSize: 12, color: 'var(--danger)', margin: '0 0 12px' },
  button: { width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 14, fontWeight: 800, cursor: 'pointer' },
  note: { marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' },
  footNote: { fontSize: 12, lineHeight: 1.6, color: 'var(--text-tertiary)', margin: '14px 0 0' },
};
