import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, runTransaction } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useAuth } from './AuthContext';
import { BRENNER_EMAIL } from './SupportRequestsContext';

const SupportAnnouncementsContext = createContext(undefined);
const COLLECTION = 'supportAnnouncements';

export function SupportAnnouncementsProvider({ children }) {
  const { user } = useAuth();
  const [raw, setRaw] = useState([]);

  useEffect(() => {
    if (!user) {
      setRaw([]);
      return;
    }
    const unsubscribe = onSnapshot(collection(db, COLLECTION), (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          message: data.message,
          authorName: data.authorName,
          timestamp: data.timestamp,
          visibleToAll: data.visibleToAll ?? false,
          visibleToUids: data.visibleToUids ?? [],
          likedBy: data.likedBy ?? [],
          comments: data.comments ?? [], // [{ id, uid, authorName, text, timestamp }]
        };
      });
      setRaw(list);
    });
    return unsubscribe;
  }, [user]);

  // Everyone sees posts targeted at them (or "everyone"); Brenner sees all
  // his own posts regardless. Comments are filtered separately below —
  // being able to see a post is not the same as seeing every comment on it.
  const isBrenner = user?.email === BRENNER_EMAIL;
  const visiblePosts = raw
    .filter((p) => isBrenner || p.visibleToAll || p.visibleToUids.includes(user?.uid))
    .map((p) => ({
      ...p,
      // Anyone but Brenner only ever sees their own private thread with him.
      comments: isBrenner ? p.comments : p.comments.filter((c) => c.uid === user?.uid),
      likes: p.likedBy.length,
      likedByMe: !!user && p.likedBy.includes(user.uid),
    }))
    .sort((a, b) => b.timestamp - a.timestamp);

  const postUpdate = async ({ message, visibleToAll, visibleToUids }) => {
    await addDoc(collection(db, COLLECTION), {
      message,
      authorName: user?.name ?? 'Brenner',
      timestamp: Date.now(),
      visibleToAll,
      visibleToUids: visibleToAll ? [] : visibleToUids,
      likedBy: [],
      comments: [],
    });
  };

  const toggleLike = async (id) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await runTransaction(db, async (tx) => {
      const ref = doc(db, COLLECTION, id);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const likedBy = snap.data().likedBy ?? [];
      const next = likedBy.includes(uid) ? likedBy.filter((x) => x !== uid) : [...likedBy, uid];
      tx.update(ref, { likedBy: next });
    });
  };

  // Adding a comment is really "replying privately to Brenner" — the
  // person only ever sees their own thread, never anyone else's, even
  // though it's stored in the same document.
  const addComment = async (postId, text) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await runTransaction(db, async (tx) => {
      const ref = doc(db, COLLECTION, postId);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const comments = snap.data().comments ?? [];
      const newComment = { id: Date.now().toString(), uid, authorName: user?.name ?? 'Unknown', text, timestamp: Date.now() };
      tx.update(ref, { comments: [...comments, newComment] });
    });
  };

  return (
    <SupportAnnouncementsContext.Provider value={{ posts: visiblePosts, postUpdate, toggleLike, addComment, isBrenner }}>
      {children}
    </SupportAnnouncementsContext.Provider>
  );
}

export function useSupportAnnouncements() {
  const ctx = useContext(SupportAnnouncementsContext);
  if (!ctx) throw new Error('useSupportAnnouncements must be used within SupportAnnouncementsProvider');
  return ctx;
}
