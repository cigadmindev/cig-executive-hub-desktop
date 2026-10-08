import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, deleteDoc, query, where } from 'firebase/firestore';
import { ALL_FOLDERS, canSeeFolder } from '../data/accessMatrix';
import { db, auth } from '../firebaseConfig';
import { categories } from '../data/mockData';
import { reactToPost } from '../lib/reactToPost';
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
    // Financials folder posts are readable only by people who have Financials
    // (S5). Everyone else asks for the folders they can open, which is what
    // the rule allows - a query the rule cannot prove is refused whole.
    const folders = ALL_FOLDERS.filter((f) => canSeeFolder(user, f));
    if (folders.length === 0) {
      setRaw([]);
      return undefined;
    }
    const source = user.role === 'admin' || folders.includes('financials')
      ? collection(db, COLLECTION)
      : query(collection(db, COLLECTION), where('categoryId', 'in', folders));
    const unsubscribe = onSnapshot(source, (snapshot) => {
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
    },
      (err) => console.error('[Announcements listener] ' + err.code + ': ' + err.message)
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
    // categoryLabel is stored on the document so the push-notification
    // function can name the category without knowing our taxonomy.
    const category = categories.find((c) => c.id === categoryId);
    await addDoc(collection(db, COLLECTION), {
      categoryId,
      categoryLabel: category?.label ?? null,
      locationId,
      message,
      authorName,
      authorUid: auth.currentUser?.uid ?? null,
      timestamp: Date.now(),
      likedBy: [],
      comments: [],
    });
  };

  const toggleLike = async (id) => {
    await reactToPost('categoryPosts', id, 'like');
  };

  // The server stamps who wrote it; authorName is kept in the signature for
  // the screens that pass it.
  const addComment = async (announcementId, text, _authorName) => {
    await reactToPost('categoryPosts', announcementId, 'comment', { text });
  };

  const toggleCommentLike = async (announcementId, commentId) => {
    await reactToPost('categoryPosts', announcementId, 'commentLike', { commentId });
  };

  const getByCategory = (categoryId, locationId) =>
    raw.filter((a) => a.categoryId === categoryId && a.locationId === locationId).map(toShaped);

  const deletePost = async (id) => {
    await deleteDoc(doc(db, COLLECTION, id));
  };

  const deleteComment = async (announcementId, commentId) => {
    await reactToPost('categoryPosts', announcementId, 'deleteComment', { commentId });
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
