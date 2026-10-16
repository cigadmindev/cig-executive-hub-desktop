import React, { useEffect, useRef, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../hooks/useDialog';
import PageHeader from '../components/PageHeader';
import Icon from '../components/Icon';
import { plainError } from '../lib/errors';
import { fmtDay } from '../lib/dates';

// Pre-Opening Documents (16 Oct 2026): blank forms and templates that most
// new locations need - permit applications, vendor set-up forms, staffing
// templates - in one Drive folder, listed here. Executives and admins see it
// and add to it; each file opens in Drive.
const call = (name, timeout) => httpsCallable(getFunctions(undefined, 'us-central1'), name, timeout ? { timeout } : undefined);

export default function PreOpeningDocsScreen() {
  const { user } = useAuth();
  const { dialogNode, notify } = useDialog();
  const [state, setState] = useState({ loading: true, files: [], folderUrl: null, error: null });
  const [adding, setAdding] = useState(false);
  const input = useRef(null);

  const load = async () => {
    try {
      const res = await call('preOpeningDocsList')();
      setState({ loading: false, files: res.data?.files ?? [], folderUrl: res.data?.folderUrl ?? null, error: null });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: plainError(err, 'Could not load the documents.') }));
    }
  };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setAdding(true);
    try {
      for (const f of files) {
        if (f.size > 7 * 1024 * 1024) throw new Error(f.name + ' is over 7 MB. Add it straight to the Drive folder instead.');
        const dataBase64 = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
          r.onerror = () => reject(new Error('Could not read ' + f.name + '.'));
          r.readAsDataURL(f);
        });
        await call('preOpeningDocsAdd', 120000)({ name: f.name, mimeType: f.type, dataBase64 });
      }
      notify('Added', files.length === 1 ? files[0].name + ' is in the folder.' : files.length + ' documents are in the folder.');
      await load();
    } catch (err) {
      notify('Could not add it', plainError(err, err?.message || 'Try again.'));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div style={styles.page}>
      <PageHeader
        back={{ to: '/directory', label: 'Directory' }}
        title="Pre-Opening Documents"
        subtitle="Blank forms and templates to pull from whenever a new location is opening."
        extras={state.folderUrl ? <a href={state.folderUrl} target="_blank" rel="noreferrer" style={styles.ghost}>Open in Drive ↗</a> : null}
        actionLabel={user ? (adding ? 'Adding…' : '+ Add document') : null}
        onAction={() => !adding && input.current?.click()}
      />
      <input ref={input} type="file" multiple hidden onChange={add} />

      <div style={styles.card}>
        {state.loading ? <p style={styles.muted}>Loading…</p> : null}
        {state.error ? <p style={styles.muted}>{state.error}</p> : null}
        {!state.loading && !state.error && state.files.length === 0 ? (
          <p style={styles.muted}>Nothing here yet. Add the first blank form with + Add document.</p>
        ) : null}
        {state.files.map((f, i) => (
          <a key={f.id} href={f.url} target="_blank" rel="noreferrer" style={{ ...styles.row, ...(i === 0 ? { borderTop: 'none' } : {}) }}>
            <span style={styles.icon}><Icon name="document" size={18} color="var(--neon)" /></span>
            <span style={styles.name}>{f.name}</span>
            <span style={styles.meta}>{[f.byName, f.at ? fmtDay(f.at) : null].filter(Boolean).join(' · ')}</span>
          </a>
        ))}
      </div>
      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '28px max(22px, min(36px, 4vw)) 60px', maxWidth: 900 },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '6px 0', marginTop: 10 },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderTop: '1px solid var(--border)', color: 'var(--text-primary)', textDecoration: 'none' },
  icon: { width: 34, height: 34, borderRadius: 17, background: 'rgba(34,211,238,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  name: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' },
  muted: { fontSize: 13, color: 'var(--text-secondary)', padding: '14px 18px', margin: 0 },
  ghost: { display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 14px', borderRadius: 8, border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' },
};
