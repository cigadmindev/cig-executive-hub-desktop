import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, deleteDoc, runTransaction } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useAuth } from './AuthContext';

const AnnouncementsContext = createContext(undefined);
const COLLECTION = 'categoryPosts';

export function AnnouncementsProvider({ children }) {
  const [raw, setRaw] = useState([]);
  const { user } = useAuth();

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
          categoryId: data.categoryId,
          locationId: data.locationId ?? '',
          message: data.message,
          authorName: data.authorName,
          authorUid: data.authorUid ?? null,
          timestamp: data.timestamp,
          likedBy: data.likedBy ?? [],
          comments: data.comments ?? [],
        };
      });
      setRaw(list);
    });
    return unsubscribe;
  }, [user]);

  const toShapedComment = (c) => {
    const uid = auth.currentUser?.uid;
    return {
      id: c.id,
      text: c.text,
      authorName: c.authorName,
      timestamp: c.timestamp,
      likes: c.likedBy.length,
      likedByMe: !!uid && c.likedBy.includes(uid),
    };
  };

  const toShaped = (a) => {
    const uid = auth.currentUser?.uid;
    return {
      id: a.id,
      categoryId: a.categoryId,
      locationId: a.locationId,
      message: a.message,
      authorName: a.authorName,
      authorUid: a.authorUid,
      timestamp: a.timestamp,
      likes: a.likedBy.length,
      likedByMe: !!uid && a.likedBy.includes(uid),
      comments: a.comments.map(toShapedComment),
    };
  };

  const addAnnouncement = async (categoryId, locationId, message, authorName) => {
    await addDoc(collection(db, COLLECTION), {
      categoryId,
      locationId,
      message,
      authorName,
      authorUid: auth.currentUser?.uid ?? null,
      timestamp: Date.now(),
      likedBy: [],
      comments: [],
    });
    // Note: mobile also sends a push notification here — not wired up for
    // desktop yet, same as Chat/Event Requests.
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

  const addComment = async (announcementId, text, authorName) => {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, COLLECTION, announcementId);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const comments = snap.data().comments ?? [];
      const newComment = { id: Date.now().toString(), text, authorName, timestamp: Date.now(), likedBy: [] };
      tx.update(ref, { comments: [...comments, newComment], timestamp: Date.now() });
    });
  };

  const toggleCommentLike = async (announcementId, commentId) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await runTransaction(db, async (tx) => {
      const ref = doc(db, COLLECTION, announcementId);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const comments = snap.data().comments ?? [];
      const updated = comments.map((c) =>
        c.id === commentId
          ? { ...c, likedBy: c.likedBy.includes(uid) ? c.likedBy.filter((x) => x !== uid) : [...c.likedBy, uid] }
          : c
      );
      tx.update(ref, { comments: updated });
    });
  };

  const getByCategory = (categoryId, locationId) =>
    raw.filter((a) => a.categoryId === categoryId && a.locationId === locationId).map(toShaped);

  const deletePost = async (id) => {
    await deleteDoc(doc(db, COLLECTION, id));
  };

  const deleteComment = async (announcementId, commentId) => {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, COLLECTION, announcementId);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const comments = snap.data().comments ?? [];
      tx.update(ref, { comments: comments.filter((c) => c.id !== commentId) });
    });
  };

  return (
    <AnnouncementsContext.Provider
      value={{
        announcements: raw.map(toShaped),
        addAnnouncement,
        toggleLike,
        addComment,
        toggleCommentLike,
        deletePost,
        deleteComment,
        getByCategory,
      }}
    >
      {children}
    </AnnouncementsContext.Provider>
  );
}

export function useAnnouncements() {
  const ctx = useContext(AnnouncementsContext);
  if (!ctx) throw new Error('useAnnouncements must be used within AnnouncementsProvider');
  return ctx;
}
