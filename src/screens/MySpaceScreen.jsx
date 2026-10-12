import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import Icon from '../components/Icon';
import { useDialog } from '../hooks/useDialog';
import { plainError } from '../lib/errors';

// My space (sketch approved 12 Oct 2026). A private page for one person -
// Cameron first: her own Drive folder, files, notes and to-dos.
//
// Nobody else can open any of it, admins included: the Firestore and Storage
// rules only let the person it belongs to in, and only while their login has
// My space switched on (Manage Logins). The Drive folder is made by the Hub
// in the CIG shared drive with limited access, shared with her alone.
//
// Stored at privateSpaces/{uid} (notes, Drive link) and its todos. Files are
// the Drive folder's own contents (Brenner, 12 Oct 2026): an upload passes
// through Storage private/{uid}/ and the server moves it into the folder.
const MAX_MB = 50;
const call = async (name, data = {}) => (await httpsCallable(getFunctions(undefined, 'us-central1'), name)(data)).data;

export default function MySpaceScreen() {
  const { user, viewAs } = useAuth();
  const { dialogNode, confirm, notify } = useDialog();
  const fileRef = useRef(null);
  const uid = user?.uid;
  const on = user?.privateSpace === true;

  const [space, setSpace] = useState(null);
  // The Drive folder's contents: null while loading.
  const [files, setFiles] = useState(null);
  const [filesError, setFilesError] = useState(null);
  const [todos, setTodos] = useState([]);
  const [notes, setNotes] = useState('');
  const [notesState, setNotesState] = useState('');
  const [uploading, setUploading] = useState(false);
  const [makingFolder, setMakingFolder] = useState(false);
  const [newTodo, setNewTodo] = useState('');
  const [newDue, setNewDue] = useState('');
  const typed = useRef(false);

  useEffect(() => {
    if (!uid || !on || viewAs) return undefined;
    const base = doc(db, 'privateSpaces', uid);
    const unsubs = [
      onSnapshot(base, (snap) => {
        const data = snap.exists() ? snap.data() : {};
        setSpace(data);
        // Not while typing - the box would jump under the cursor.
        if (!typed.current) setNotes(data.notes ?? '');
      }, (err) => {
        console.error('[MySpace] ' + err.code + ': ' + err.message);
        setSpace({ loadError: err.code || 'unknown' });
      }),
      onSnapshot(collection(base, 'todos'), (snap) => setTodos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (err) => console.error('[MySpace todos] ' + err.code)),
    ];
    return () => unsubs.forEach((u) => u());
  }, [uid, on, viewAs]);

  const folderUrl = space?.driveFolderUrl ?? null;
  const loadFiles = async () => {
    try {
      const res = await call('privateFolderFiles');
      setFiles(res.files ?? []);
      setFilesError(null);
    } catch (err) {
      setFilesError(plainError(err, 'Could not read your folder.'));
      setFiles([]);
    }
  };
  useEffect(() => {
    if (folderUrl) loadFiles();
  }, [folderUrl]);

  // Notes save a moment after typing stops.
  useEffect(() => {
    if (!typed.current || !uid) return undefined;
    setNotesState('Saving…');
    const t = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'privateSpaces', uid), { notes, notesUpdatedAt: Date.now() }, { merge: true });
        setNotesState('Saved');
      } catch (err) {
        setNotesState('Not saved - ' + plainError(err, 'try again'));
      }
    }, 800);
    return () => clearTimeout(t);
  }, [notes, uid]);

  // An admin using View as is still signed in as themselves, and the rules
  // only let the person in - so say so rather than load forever.
  if (viewAs) {
    return (
      <div style={styles.page}>
        <PageHeader back={{ to: '/', label: 'Home' }} title="My space" />
        <p style={styles.muted}>🔒 This is {viewAs.name ?? 'their'}'s private space. Nobody else can open it - not even an admin viewing as them. They see it on their own login.</p>
      </div>
    );
  }

  if (!on) {
    return (
      <div style={styles.page}>
        <PageHeader back={{ to: '/', label: 'Home' }} title="My space" />
        <p style={styles.muted}>My space isn't switched on for your login.</p>
      </div>
    );
  }

  const upload = async (e) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!picked.length) return;
    const big = picked.filter((f) => f.size > MAX_MB * 1024 * 1024);
    if (big.length) {
      notify('Too large', big.map((f) => f.name).join(', ') + ' - files can be up to ' + MAX_MB + ' MB. Nothing was added.');
      return;
    }
    if (!folderUrl) {
      notify('No Drive folder yet', 'Files go into your private Drive folder. Make it first.');
      return;
    }
    setUploading(true);
    try {
      for (const f of picked) {
        const safe = f.name.replace(/[^\w.\- ]+/g, '_').slice(-120);
        const path = 'private/' + uid + '/' + Date.now() + '-' + safe;
        await uploadBytes(storageRef(storage, path), f, { contentType: f.type || 'application/octet-stream' });
        await call('addToPrivateFolder', { storagePath: path, name: f.name, type: f.type || '' });
      }
    } catch (err) {
      notify('Could not upload', plainError(err, 'Try again.'));
    } finally {
      setUploading(false);
      loadFiles();
    }
  };

  const openFile = (f) => window.open(f.webViewLink, '_blank', 'noopener');

  const removeFile = (f) =>
    confirm({
      title: 'Delete ' + f.name + '?',
      body: 'It goes to the shared drive\'s trash.',
      tone: 'danger',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await call('removeFromPrivateFolder', { fileId: f.id });
          setFiles((list) => (list ?? []).filter((x) => x.id !== f.id));
        } catch (err) {
          notify('Could not delete it', plainError(err, 'Try again.'));
        }
      },
    });

  const makeFolder = async () => {
    setMakingFolder(true);
    try {
      await call('createPrivateDriveFolder');
    } catch (err) {
      notify('No folder yet', plainError(err, 'Try again.'));
    } finally {
      setMakingFolder(false);
    }
  };

  const addTodo = async () => {
    const text = newTodo.trim();
    if (!text) return;
    try {
      await addDoc(collection(db, 'privateSpaces', uid, 'todos'), { text, due: newDue || null, done: false, doneAt: null, createdAt: Date.now() });
      setNewTodo('');
      setNewDue('');
    } catch (err) {
      notify('Not added', plainError(err, 'Try again.'));
    }
  };
  const toggleTodo = (t) =>
    updateDoc(doc(db, 'privateSpaces', uid, 'todos', t.id), { done: !t.done, doneAt: t.done ? null : Date.now() }).catch((err) => notify('Nothing was changed', plainError(err)));
  const removeTodo = (t) => deleteDoc(doc(db, 'privateSpaces', uid, 'todos', t.id)).catch((err) => notify('Nothing was changed', plainError(err)));

  const open = todos.filter((t) => !t.done).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt - b.createdAt);
  const done = todos.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 10);

  return (
    <div style={styles.page}>
      <PageHeader
        back={{ to: '/', label: 'Home' }}
        title="My space"
        subtitle="🔒 Only you can see this - not admins, not anyone else in the Hub."
        actionLabel={uploading ? 'Uploading…' : '+ Upload files'}
        actionDisabled={uploading || !folderUrl}
        onAction={() => fileRef.current?.click()}
      />
      <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={upload} />

      <div style={styles.cols}>
        <div style={styles.col}>
          <p style={styles.cap}>My Drive folder</p>
          <div style={styles.card}>
            {space?.driveFolderUrl ? (
              <>
                <div style={styles.row}>
                  <span style={{ fontSize: 18 }}>📁</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{(user?.name ?? '') + ' — Private'}</span>
                  <a href={space.driveFolderUrl} target="_blank" rel="noreferrer" style={styles.link}>Open in Drive ↗</a>
                </div>
                <p style={styles.note}>In the CIG shared drive, with limited access: other members of the drive can't open it. Google always lets the shared drive's Managers in.</p>
              </>
            ) : space === null ? (
              <p style={styles.note}>Loading…</p>
            ) : space.loadError ? (
              <p style={{ ...styles.note, color: '#F87171' }}>My space could not be opened ({space.loadError}). Send Brenner a screenshot of this.</p>
            ) : (
              <>
                <p style={styles.note}>The Hub makes a folder in the CIG shared drive that only you can open.</p>
                <div>
                  <button style={styles.primary} disabled={makingFolder} onClick={makeFolder}>{makingFolder ? 'Making it…' : 'Make my private Drive folder'}</button>
                </div>
              </>
            )}
          </div>

          <p style={{ ...styles.cap, marginTop: 8 }}>Files</p>
          <div style={styles.card}>
            {!folderUrl ? <p style={styles.note}>Files go into your private Drive folder once it is made.</p> : null}
            {folderUrl && files === null ? <p style={styles.note}>Loading your folder…</p> : null}
            {filesError ? <p style={{ ...styles.note, color: '#F87171' }}>{filesError}</p> : null}
            {folderUrl && files && files.length === 0 && !filesError ? <p style={styles.note}>Nothing here yet.</p> : null}
            {(files ?? []).map((f) => (
              <div key={f.id} style={styles.row}>
                <span style={styles.badge}>{f.mimeType === 'application/vnd.google-apps.folder' ? 'DIR' : (f.name.includes('.') ? f.name.split('.').pop() : 'DOC').slice(0, 4).toUpperCase()}</span>
                <button style={styles.fileName} onClick={() => openFile(f)}>{f.name}</button>
                <span style={styles.note}>{f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                <button style={styles.x} aria-label={'Delete ' + f.name} onClick={() => removeFile(f)}>✕</button>
              </div>
            ))}
            <button style={styles.dashed} disabled={uploading || !folderUrl} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : '+ Upload files (several at once)'}</button>
            {folderUrl ? <p style={styles.note}>These are the files in your Drive folder - including anything you add from Drive.</p> : null}
          </div>
        </div>

        <div style={styles.col}>
          <p style={styles.cap}>Notes</p>
          <div style={styles.card}>
            <textarea
              style={styles.notes}
              value={notes}
              placeholder="Anything you want to keep to yourself."
              onChange={(e) => {
                typed.current = true;
                setNotes(e.target.value);
              }}
            />
            <p style={styles.note}>{notesState || 'Saves as you type.'}</p>
          </div>

          <p style={{ ...styles.cap, marginTop: 8 }}>To do</p>
          <div style={styles.card}>
            {open.length === 0 && done.length === 0 ? <p style={styles.note}>Nothing to do.</p> : null}
            {[...open, ...done].map((t) => (
              <div key={t.id} style={{ ...styles.row, ...(t.done ? { opacity: 0.55 } : {}) }}>
                <input type="checkbox" checked={!!t.done} onChange={() => toggleTodo(t)} aria-label={t.text} style={{ width: 18, height: 18 }} />
                <span style={{ flex: 1, minWidth: 0, textDecoration: t.done ? 'line-through' : 'none' }}>{t.text}</span>
                {t.due ? <span style={styles.note}>{new Date(t.due + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span> : null}
                <button style={styles.x} aria-label={'Remove ' + t.text} onClick={() => removeTodo(t)}>✕</button>
              </div>
            ))}
            <div style={styles.addRow}>
              <input style={{ ...styles.input, flex: '1 1 160px' }} value={newTodo} placeholder="Add a to-do" onChange={(e) => setNewTodo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTodo()} />
              <input style={{ ...styles.input, flex: '0 0 150px' }} type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} aria-label="Date (optional)" />
              <button style={styles.primary} disabled={!newTodo.trim()} onClick={addTodo}>Add</button>
            </div>
            <p style={styles.note}>Private - never on the shared calendar, never in anyone's "Needs you".</p>
          </div>
        </div>
      </div>
      {dialogNode}
    </div>
  );
}

// The card on Home, for a login with My space switched on.
export function MySpaceCard({ user }) {
  const navigate = useNavigate();
  const [openCount, setOpenCount] = useState(null);
  useEffect(() => {
    if (!user?.uid || user.privateSpace !== true) return undefined;
    return onSnapshot(
      collection(db, 'privateSpaces', user.uid, 'todos'),
      (snap) => setOpenCount(snap.docs.filter((d) => !d.data().done).length),
      () => setOpenCount(null)
    );
  }, [user?.uid, user?.privateSpace]);
  if (user?.privateSpace !== true) return null;
  return (
    <button style={styles.homeCard} onClick={() => navigate('/my-space')}>
      <Icon name="lock" color="#E8B93B" />
      <span style={{ flex: 1, textAlign: 'left', fontWeight: 800 }}>My space</span>
      {openCount ? <span style={styles.note}>{openCount} to-do{openCount === 1 ? '' : 's'}</span> : null}
      <span style={{ color: 'var(--text-tertiary)' }}>›</span>
    </button>
  );
}

const styles = {
  page: { padding: '28px max(16px, min(36px, 4vw))', maxWidth: 1180 },
  muted: { color: 'var(--text-secondary)', fontSize: 14 },
  cols: { display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 8 },
  col: { flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  cap: { margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  card: { background: '#1A1A20', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)' },
  note: { margin: 0, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 },
  link: { color: 'var(--neon)', fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' },
  badge: { fontSize: 10, fontWeight: 800, color: 'var(--neon)', border: '1px solid rgba(34,211,238,0.5)', borderRadius: 4, padding: '2px 4px', flexShrink: 0 },
  fileName: { flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', color: 'var(--neon)', fontSize: 14, cursor: 'pointer', padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  x: { background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 13, minWidth: 32, minHeight: 32 },
  dashed: { minHeight: 44, border: '1px dashed var(--border-strong)', borderRadius: 10, background: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  primary: { background: 'var(--neon)', color: '#0A0A0B', border: 'none', borderRadius: 8, padding: '0 16px', minHeight: 44, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  notes: { width: '100%', boxSizing: 'border-box', minHeight: 160, resize: 'vertical', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'var(--text-primary)', fontSize: 16, lineHeight: 1.6, fontFamily: 'inherit' },
  addRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  input: { boxSizing: 'border-box', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', minHeight: 44, fontSize: 16, color: 'var(--text-primary)', fontFamily: 'inherit', colorScheme: 'dark' },
  homeCard: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: '#1A1A20', border: '1px solid rgba(232,185,59,0.35)', borderRadius: 12, padding: '14px 16px', color: 'var(--text-primary)', fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 22 },
};
