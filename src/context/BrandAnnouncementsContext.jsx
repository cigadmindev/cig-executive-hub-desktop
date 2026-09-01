import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, deleteDoc, runTransaction } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { brands } from '../data/mockData';
import { useAuth } from './AuthContext';

const BrandAnnouncementsContext = createContext(undefined);
const COLLECTION = 'brandPosts';

export function BrandAnnouncementsProvider({ children }) {
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
          targetId: data.targetId,
          message: data.message,
          authorName: data.authorName,
          authorUid: data.authorUid ?? null,
          timestamp: data.timestamp,
          likedBy: data.likedBy ?? [],
          comments: data.comments ?? [],
        };
      });
      setRaw(list);
    },
      (err) => console.error('[BrandAnnouncements listener] ' + err.code + ': ' + err.message)
    );
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
      targetId: a.targetId,
      message: a.message,
      authorName: a.authorName,
      authorUid: a.authorUid,
      timestamp: a.timestamp,
      likes: a.likedBy.length,
      likedByMe: !!uid && a.likedBy.includes(uid),
      comments: a.comments.map(toShapedComment),
    };
  };

  const addAnnouncement = async (targetId, message, authorName, targetLabel) => {
    // targetName is stored on the document so the push-notification function
    // can name the brand. Brands live in mockData inside the app, so the
    // server has no way to resolve an id like 'taste' on its own.
    const brand = brands.find((b) => b.id === targetId);
    await addDoc(collection(db, COLLECTION), {
      targetId,
      // targetId can be a brand OR a location — a brand-only lookup left
      // targetName null for location posts, so the notification lost the name.
      targetName: targetId === 'all' ? null : targetLabel ?? brand?.name ?? null,
      message,
      authorName,
      authorUid: auth.currentUser?.uid ?? null,
      timestamp: Date.now(),
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

  // A brand page shows posts aimed at the whole brand, "everywhere" posts,
  // and posts targeted at any specific location under this brand.
  const getByBrand = (brandId, locationIds = []) =>
    raw.filter((a) => a.targetId === brandId || a.targetId === 'all' || locationIds.includes(a.targetId)).map(toShaped);

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
    <BrandAnnouncementsContext.Provider
      value={{
        announcements: raw.map(toShaped),
        addAnnouncement,
        toggleLike,
        addComment,
        toggleCommentLike,
        deletePost,
        deleteComment,
        getByBrand,
      }}
    >
      {children}
    </BrandAnnouncementsContext.Provider>
  );
}

export function useBrandAnnouncements() {
  const ctx = useContext(BrandAnnouncementsContext);
  if (!ctx) throw new Error('useBrandAnnouncements must be used within BrandAnnouncementsProvider');
  return ctx;
}
