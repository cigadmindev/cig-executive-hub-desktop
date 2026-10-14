import React, { useState } from 'react';
import { arrayUnion } from 'firebase/firestore';

// "Done — needs a signature from…" on a checklist item (Mark, 10 Oct 2026).
//
// The person who finished the task picks who has to sign it (Michele, or
// anyone who can open this checklist) and can add a note. That person is
// notified, and the item stays open - shown "Waiting on Michele" - until
// they press "I've signed it", which ticks it off as done by the one who did
// the work and signed by them. They can also send it back with a note.
//
// The signature itself happens on paper or in the document; the signed copy
// goes on the task with + Add documents.
export const waitingOn = (item) =>
  item?.signature?.status === 'waiting' && !item.done ? item.signature.requestedOfName : null;

export default function SignaturePanel({ item, me, canRequest, people, save, notify }) {
  const s = item.signature ?? null;
  const [asking, setAsking] = useState(false);
  const [who, setWho] = useState('');
  const [note, setNote] = useState('');
  const [backNote, setBackNote] = useState('');
  const [sendingBack, setSendingBack] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = (name) => String(name ?? '').split(' ')[0];

  const run = async (fields, done) => {
    setBusy(true);
    try {
      await save(fields);
      done?.();
    } catch (err) {
      notify('Nothing was changed', err?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const request = () => {
    const person = people.find((p) => p.uid === who);
    if (!person) return;
    run(
      {
        signature: {
          requestedOfUid: person.uid,
          requestedOfName: person.name ?? '',
          requestedByUid: me.uid,
          requestedByName: me.name ?? '',
          requestedAt: Date.now(),
          note: note.trim(),
          status: 'waiting',
          signedAt: null,
          backNote: '',
        },
      },
      () => {
        setAsking(false);
        setWho('');
        setNote('');
      }
    );
  };

  const sign = () => {
    const at = Date.now();
    const by = s.requestedByName + ' · signed by ' + (me.name ?? '');
    run({
      signature: { ...s, status: 'signed', signedAt: at },
      done: true,
      doneBy: by,
      doneAt: at,
      signOffHistory: arrayUnion({ done: true, by, at }),
    });
  };

  const sendBack = () =>
    run({ signature: { ...s, status: 'sentBack', backNote: backNote.trim(), sentBackAt: Date.now() } }, () => {
      setSendingBack(false);
      setBackNote('');
    });

  // Waiting, and this is the person who has to sign.
  if (s?.status === 'waiting' && !item.done && s.requestedOfUid === me?.uid) {
    return (
      <div style={styles.mine}>
        <p style={styles.mineTitle}>Waiting on your signature</p>
        <p style={styles.text}>
          {s.requestedByName} finished this and asked you to sign{s.note ? ': "' + s.note + '"' : '.'}
        </p>
        <p style={styles.small}>Open the documents below, sign, then add the signed copy with + Add documents.</p>
        {sendingBack ? (
          <div style={styles.row}>
            <input style={styles.input} autoFocus placeholder={'What ' + first(s.requestedByName) + ' needs to fix'} value={backNote} onChange={(e) => setBackNote(e.target.value)} />
            <button style={styles.ghost} disabled={busy} onClick={() => setSendingBack(false)}>Cancel</button>
            <button style={styles.primary} disabled={busy || !backNote.trim()} onClick={sendBack}>Send back</button>
          </div>
        ) : (
          <div style={styles.row}>
            <button style={styles.ghost} disabled={busy} onClick={() => setSendingBack(true)}>Send back with a note</button>
            <button style={styles.primary} disabled={busy} onClick={sign}>I've signed it</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ margin: '4px 0 12px' }}>
      {s?.status === 'waiting' && !item.done ? (
        <p style={styles.waiting}>
          Waiting on {s.requestedOfName} to sign · asked by {s.requestedByName}{s.note ? ' · "' + s.note + '"' : ''}
          {canRequest ? <button style={styles.link} disabled={busy} onClick={() => run({ signature: null })}>Cancel the request</button> : null}
        </p>
      ) : null}
      {s?.status === 'signed' ? <p style={styles.small}>Signed by {s.requestedOfName}{s.signedAt ? ' · ' + new Date(s.signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</p> : null}
      {s?.status === 'sentBack' && !item.done ? (
        <p style={styles.back}>{s.requestedOfName} sent it back: "{s.backNote}"</p>
      ) : null}
      {canRequest && !item.done && s?.status !== 'waiting' ? (
        asking ? (
          <div style={styles.ask}>
            <span style={styles.label}>Done — needs a signature from</span>
            <select style={styles.input} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who needs to sign">
              <option value="">Choose who signs</option>
              {people
                .filter((p) => p.uid !== me?.uid)
                .map((p) => (
                  <option key={p.uid} value={p.uid}>{p.name}{p.job ? ' · ' + p.job : ''}</option>
                ))}
            </select>
            <input style={styles.input} placeholder="A note for them (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div style={styles.row}>
              <button style={styles.ghost} disabled={busy} onClick={() => setAsking(false)}>Cancel</button>
              <button style={styles.primary} disabled={busy || !who} onClick={request}>Send for signature</button>
            </div>
          </div>
        ) : (
          <button style={styles.ghost} onClick={() => setAsking(true)}>Needs a signature…</button>
        )
      ) : null}
    </div>
  );
}

const styles = {
  mine: { background: 'rgba(232,185,59,0.1)', border: '1px solid rgba(232,185,59,0.4)', borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  mineTitle: { margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--warn)' },
  text: { margin: '4px 0 0', fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 },
  small: { margin: '4px 0 0', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 },
  waiting: { margin: '0 0 6px', fontSize: 12, color: 'var(--warn)', lineHeight: 1.5 },
  back: { margin: '0 0 6px', fontSize: 12, color: 'var(--bad)', lineHeight: 1.5 },
  ask: { display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420 },
  label: { fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  row: { display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 8, alignItems: 'center' },
  input: { flex: 1, minWidth: 160, boxSizing: 'border-box', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', minHeight: 40, fontSize: 13, color: 'var(--text-primary)', fontFamily: 'inherit' },
  primary: { background: 'var(--neon)', color: '#0A0A0B', border: 'none', borderRadius: 8, padding: '0 14px', minHeight: 40, fontWeight: 800, fontSize: 13, cursor: 'pointer' },
  ghost: { background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', borderRadius: 8, padding: '0 12px', minHeight: 40, fontWeight: 700, fontSize: 12, cursor: 'pointer' },
  link: { background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 12, cursor: 'pointer', marginLeft: 8, textDecoration: 'underline' },
};
