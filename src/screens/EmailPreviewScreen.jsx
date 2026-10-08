import React, { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../hooks/useDialog';
import PageHeader from '../components/PageHeader';

// Admin only. Every email the Hub sends, drawn by the real template with
// sample content, with who gets it and what triggers it - and a button to
// send yourself a copy. This replaces testing emails with a test login.
const call = (data) => httpsCallable(getFunctions(undefined, 'us-central1'), 'emailPreview')(data).then((r) => r.data);

export default function EmailPreviewScreen() {
  const { user } = useAuth();
  const { dialogNode, notify } = useDialog();
  const [list, setList] = useState([]);
  const [current, setCurrent] = useState(null);
  const [html, setHtml] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    call({}).then((r) => {
      setList(r.list);
      if (r.list[0]) setCurrent(r.list[0].id);
    }).catch((err) => notify('Could not load', err?.message ?? 'Try again.'));
  }, [user?.uid]);

  useEffect(() => {
    if (!current) return;
    setHtml('');
    call({ id: current }).then((r) => setHtml(r.html)).catch(() => setHtml(''));
  }, [current]);

  if (user?.role !== 'admin') {
    return <div style={styles.page}><p style={{ color: 'var(--text-secondary)' }}>Admins only.</p></div>;
  }

  const item = list.find((l) => l.id === current);
  const groups = [...new Set(list.map((l) => l.group))];

  const sendMe = async () => {
    setSending(true);
    try {
      const r = await call({ id: current, send: true });
      notify('Sent', 'A copy is on its way to ' + r.sent + '.');
    } catch (err) {
      notify('Could not send', err?.message ?? 'Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={styles.page}>
      <PageHeader title="Email preview" subtitle="Every email the Hub sends, exactly as it arrives. Pick one to see who gets it, or send yourself a copy." />
      <div style={styles.columns}>
        <div style={styles.listCard}>
          {groups.map((g) => (
            <div key={g}>
              <p style={styles.group}>{g}</p>
              {list.filter((l) => l.group === g).map((l) => (
                <button key={l.id} style={{ ...styles.item, ...(l.id === current ? styles.itemOn : {}) }} onClick={() => setCurrent(l.id)}>
                  <span style={styles.itemName}>{l.name}</span>
                  <span style={styles.itemTo}>{l.to} · {l.speed}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div style={{ flex: '1 1 520px', minWidth: 0 }}>
          {item ? (
            <div style={styles.detail}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <p style={styles.detailName}>{item.name}</p>
                  <p style={styles.detailMeta}>When: {item.when}</p>
                  <p style={styles.detailMeta}>Goes to: {item.to}</p>
                </div>
                <button style={styles.sendButton} disabled={sending} onClick={sendMe}>
                  {sending ? 'Sending…' : 'Send me this one'}
                </button>
              </div>
              <iframe title="Email preview" srcDoc={html} style={styles.frame} sandbox="" />
              <p style={styles.note}>Sample content. The real email fills in its own details.</p>
            </div>
          ) : null}
        </div>
      </div>
      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '24px 28px 60px', maxWidth: 1200 },
  columns: { display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' },
  listCard: { flex: '0 0 300px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '6px 0 10px' },
  group: { fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '14px 16px 4px' },
  item: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderLeft: '3px solid transparent', padding: '9px 16px', cursor: 'pointer' },
  itemOn: { background: 'var(--accent-soft)', borderLeftColor: 'var(--neon)' },
  itemName: { display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  itemTo: { display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 },
  detail: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
  detailName: { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 },
  detailMeta: { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' },
  sendButton: { background: 'var(--neon)', color: '#0A0A0B', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 800, fontSize: 14, cursor: 'pointer' },
  frame: { width: '100%', height: 640, border: 'none', borderRadius: 10, marginTop: 16, background: '#0A0A0B' },
  note: { fontSize: 12, color: 'var(--text-tertiary)', margin: '10px 0 0' },
};
