import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetNote, setResetNote] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const result = await login(email.trim(), password);
    setSubmitting(false);
    if (result === 'invalid-credentials') setError('Incorrect email or password.');
    else if (result === 'no-profile') setError('No account found for this login.');
    else if (result === 'deactivated') setError('This account has been deactivated.');
  };

  return (
    <div style={styles.window}>
      <div style={styles.card}>
        <div style={styles.badge}>CIG</div>
        <h1 style={styles.title}>Executive Hub</h1>
        <p style={styles.subtitle}>Culinary Innovations Group</p>

        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <p style={styles.error}>{error}</p> : null}
          <button type="submit" style={styles.button} disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {/* Self-serve rather than "ask an administrator": links expire after an
            hour, so anyone who missed one was stuck until someone noticed. */}
        <button
          type="button"
          style={styles.forgotButton}
          disabled={resetBusy}
          onClick={async () => {
            if (!email.trim()) {
              setResetNote('Type your email above first, then tap this again.');
              return;
            }
            setResetBusy(true);
            try {
              const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'requestPasswordReset');
              await fn({ email: email.trim() });
            } catch {
              // Same message either way - it never says whether an account exists.
            }
            setResetNote('If that address has an account, a reset link is on its way. It lasts one hour.');
            setResetBusy(false);
          }}
        >
          {resetBusy ? 'Sending…' : 'Forgot your password?'}
        </button>
        {resetNote ? <p style={styles.helpNote}>{resetNote}</p> : null}
      </div>
    </div>
  );
}

const styles = {
  window: {
    // Login is the one screen every user types on, on a phone, with the
    // keyboard open. vh ignores the keyboard; dvh tracks the visible area.
    height: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    WebkitAppRegion: 'drag', // lets the whole window be dragged from here, like native Mac apps
  },
  card: {
    width: 340,
    background: 'rgba(var(--paper-rgb), 0.62)',
    backdropFilter: 'blur(24px) saturate(160%)',
    border: '1px solid var(--glass-edge)',
    borderRadius: 26,
    boxShadow: 'var(--shadow-md)',
    padding: '36px 32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    WebkitAppRegion: 'no-drag',
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    background: 'var(--ink)',
    color: 'var(--ink-text)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    marginBottom: 16,
  },
  title: { color: 'var(--text-primary)', fontSize: 28, fontWeight: 800, letterSpacing: -0.8, margin: 0 },
  subtitle: { color: 'var(--text-tertiary)', fontSize: 15, marginTop: 4, marginBottom: 26 },
  input: {
    width: '100%',
    padding: '13px 16px',
    borderRadius: 14,
    border: '1px solid var(--glass-edge)',
    background: 'rgba(var(--paper-rgb), 0.75)',
    color: 'var(--text-primary)',
    fontSize: 15,
    marginBottom: 10,
    outline: 'none',
  },
  error: { color: 'var(--bad)', fontSize: 12, marginTop: -2, marginBottom: 10 },
  // There's deliberately no self-service reset link. An unauthenticated
  // reset endpoint would let anyone probe which addresses have accounts,
  // so resets run through an admin who already has a session.
  forgotButton: { background: 'none', border: 'none', padding: '10px 0 0', color: 'var(--neon)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center', width: '100%' },
  helpNote: { color: 'var(--text-secondary)', fontSize: 12, lineHeight: '17px', textAlign: 'center', marginTop: 18, marginBottom: 0, opacity: 0.75 },
  button: {
    width: '100%',
    padding: '14px 0',
    borderRadius: 999,
    border: 'none',
    background: 'var(--ink)',
    color: 'var(--ink-text)',
    fontWeight: 600,
    fontSize: 16,
    marginTop: 8,
  },
};
