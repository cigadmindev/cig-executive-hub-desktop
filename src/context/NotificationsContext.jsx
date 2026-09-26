import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc, addDoc, query, where, orderBy, limit, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useAuth } from './AuthContext';

// Everything this person has been told, and everything they have done.
//
// The functions write a record whenever something is sent to someone. This
// reads those back, and adds the other half: a line when you act, so "did I
// actually sign that" has an answer.
//
// Nothing before this existed can be recovered - the Hub changed the thing
// itself and wrote nothing down. The list fills as people work.
const COLLECTION = 'notifications';

const NotificationsContext = createContext(undefined);

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!user?.uid) {
      setItems([]);
      return;
    }
    // The most recent few hundred. Older than that belongs in the thing
    // itself, not in a list of what you were told about it.
    return onSnapshot(
      query(collection(db, COLLECTION), where('uid', '==', user.uid), orderBy('createdAt', 'desc'), limit(200)),
      (snapshot) =>
        setItems(
          snapshot.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              title: x.title ?? '',
              body: x.body ?? '',
              path: x.path ?? '/',
              kind: x.kind ?? 'ambient',
              // 'sent' is something that came to you; 'did' is your own action.
              source: x.source === 'did' ? 'did' : 'sent',
              createdAt: x.createdAt ?? 0,
              readAt: x.readAt ?? null,
            };
          })
        ),
      (err) => console.error('[Notifications] ' + err.code + ': ' + err.message)
    );
  }, [user]);

  const forYou = items.filter((i) => i.source === 'sent');
  const youDid = items.filter((i) => i.source === 'did');
  const unreadCount = forYou.filter((i) => !i.readAt).length;

  const markRead = async (id) => {
    const item = items.find((i) => i.id === id);
    if (!item || item.readAt) return;
    await updateDoc(doc(db, COLLECTION, id), { readAt: Date.now() });
  };

  const markAllRead = async () => {
    const unread = forYou.filter((i) => !i.readAt);
    if (unread.length === 0) return;
    // In batches, since Firestore caps a batch at 500 writes.
    for (let i = 0; i < unread.length; i += 400) {
      const batch = writeBatch(db);
      const now = Date.now();
      unread.slice(i, i + 400).forEach((n) => batch.update(doc(db, COLLECTION, n.id), { readAt: now }));
      await batch.commit();
    }
  };

  return (
    <NotificationsContext.Provider value={{ items, forYou, youDid, unreadCount, markRead, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider');
  return ctx;
}

/**
 * A line saying you did something.
 *
 * Called from wherever an action happens rather than from a trigger, because
 * the app knows what the person meant - the database only sees a field change.
 * Never throws: failing to record what you did should not stop you doing it.
 */
export async function recordDid(title, body, path = '/') {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await addDoc(collection(db, COLLECTION), {
      uid,
      title,
      body,
      path,
      kind: 'ambient',
      source: 'did',
      createdAt: Date.now(),
      // Your own actions are never unread - you were there.
      readAt: Date.now(),
      emailedAt: Date.now(),
    });
  } catch (err) {
    console.error('[recordDid] ' + err.message);
  }
}
