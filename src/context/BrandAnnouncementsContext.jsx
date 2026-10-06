import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, deleteDoc, runTransaction, query, where, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { brands, brandIdForTarget } from '../data/mockData';
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
    // targetId is 'all', a restaurant, or a location. Admins and executives
    // read everything. Everyone else reads two ways, because the database can
    // only prove one thing per query: company-wide and restaurant posts by
    // targetId, and location posts by the restaurant they belong to (brandId).
    // Which location within a restaurant is narrowed in the app.
    const seesAll = user.role === 'admin' || user.role === 'executive';
    const mine = (user.permissions?.brandIds ?? []).slice(0, 29);
    const map = (snapshot) =>
      snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          targetId: data.targetId,
          targetName: data.targetName ?? null,
          brandId: data.brandId ?? null,
          message: data.message,
          authorName: data.authorName,
          authorUid: data.authorUid ?? null,
          timestamp: data.timestamp,
          // Kept at the top of Home until this time; 'forever' until removed.
          pinnedUntil: data.pinnedUntil ?? null,
          likedBy: data.likedBy ?? [],
          comments: data.comments ?? [],
        };
      });
    const onErr = (err) => console.error('[BrandAnnouncements listener] ' + err.code + ': ' + err.message);
    if (seesAll) return onSnapshot(collection(db, COLLECTION), (s) => setRaw(map(s)), onErr);

    let byTarget = [];
    let byBrand = [];
    const merge = () => {
      const seen = new Set();
      setRaw([...byTarget, ...byBrand].filter((p) => (seen.has(p.id) ? false : seen.add(p.id))));
    };
    const u1 = onSnapshot(query(collection(db, COLLECTION), where('targetId', 'in', ['all', ...mine])), (s) => { byTarget = map(s); merge(); }, onErr);
    const u2 = mine.length
      ? onSnapshot(query(collection(db, COLLECTION), where('brandId', 'in', mine)), (s) => { byBrand = map(s); merge(); }, onErr)
      : () => {};
    return () => { u1(); u2(); };
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
      targetName: a.targetName,
      brandId: a.brandId,
      pinnedUntil: a.pinnedUntil,
    };
  };

  // pinDays: how long it stays at the top of Home - a number of days, or
  // 'forever' to keep it until someone removes it.
  const addAnnouncement = async (targetId, message, authorName, targetLabel, pinDays = 7, brandIdOfTarget = null) => {
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
      // The restaurant it belongs to, so people at that restaurant can read a
      // post aimed at one of its locations. Null for company-wide posts.
      brandId: targetId === 'all' ? null : brand ? brand.id : brandIdOfTarget,
      pinnedUntil: pinDays === 'forever' ? 'forever' : Date.now() + pinDays * 24 * 60 * 60 * 1000,
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
        unpin: (id) => updateDoc(doc(db, COLLECTION, id), { pinnedUntil: null }),
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
