import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  window: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(180deg, var(--bg-card) 0%, #131314 100%)',
    WebkitAppRegion: 'drag', // lets the whole window be dragged from here, like native Mac apps
  },
  card: {
    width: 340,
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 16,
    padding: '36px 32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    WebkitAppRegion: 'no-drag',
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: 'var(--accent)',
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    marginBottom: 16,
  },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: 700, margin: 0 },
  subtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 4, marginBottom: 24 },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.06)',
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 10,
    outline: 'none',
  },
  error: { color: '#E8524B', fontSize: 12, marginTop: -2, marginBottom: 10 },
  button: {
    width: '100%',
    padding: '11px 0',
    borderRadius: 8,
    background: '#FFFFFF',
    color: '#1A1A1A',
    fontWeight: 600,
    fontSize: 14,
    marginTop: 6,
  },
};
