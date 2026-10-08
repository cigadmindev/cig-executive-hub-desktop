import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, query, where } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { reactToPost } from '../lib/reactToPost';
import { useAuth } from './AuthContext';
import { isSupportAdmin } from './SupportRequestsContext';

const SupportAnnouncementsContext = createContext(undefined);
const COLLECTION = 'supportAnnouncements';

export function SupportAnnouncementsProvider({ children }) {
  const { user } = useAuth();
  // Updates arrive from one or two listeners (sent to everyone / sent to
  // me by name), kept apart and merged, so one never wipes out the other.
  const [bySource, setBySource] = useState({});
  const [replies, setReplies] = useState([]);
  const isAdmin = isSupportAdmin(user);

  useEffect(() => {
    if (!user) {
      setBySource({});
      return;
    }
    const toPost = (d) => {
      const data = d.data();
      return {
        id: d.id,
        message: data.message,
        authorName: data.authorName,
        timestamp: data.timestamp,
        visibleToAll: data.visibleToAll ?? false,
        visibleToUids: data.visibleToUids ?? [],
        likedBy: data.likedBy ?? [],
        // Replies written before 8 Oct sat inside the update; they are moved
        // to supportReplies, and this stays empty from then on.
        comments: data.comments ?? [],
      };
    };
    // Only the updates meant for this person are asked for - the database
    // refuses anything else (B1.1). Admins see every update.
    const sources = isAdmin
      ? { all: collection(db, COLLECTION) }
      : {
          everyone: query(collection(db, COLLECTION), where('visibleToAll', '==', true)),
          me: query(collection(db, COLLECTION), where('visibleToUids', 'array-contains', user.uid)),
        };
    const unsubs = Object.entries(sources).map(([key, q]) =>
      onSnapshot(
        q,
        (snapshot) => setBySource((prev) => ({ ...prev, [key]: snapshot.docs.map(toPost) })),
        (err) => console.error('[SupportAnnouncements listener] ' + err.code + ': ' + err.message)
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [user, isAdmin]);

  // Private replies: your own, or every one for admins.
  useEffect(() => {
    if (!user) {
      setReplies([]);
      return;
    }
    const q = isAdmin
      ? collection(db, 'supportReplies')
      : query(collection(db, 'supportReplies'), where('uid', '==', user.uid));
    return onSnapshot(
      q,
      (snapshot) => setReplies(snapshot.docs.map((d) => d.data())),
      (err) => console.error('[SupportReplies listener] ' + err.code + ': ' + err.message)
    );
  }, [user, isAdmin]);

  const raw = Object.values(
    Object.fromEntries(Object.values(bySource).flat().map((p) => [p.id, p]))
  ).map((p) => ({
    ...p,
    comments: [...p.comments, ...replies.filter((r) => r.postId === p.id)].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0)),
  }));

  // Everyone sees posts targeted at them (or "everyone"); Brenner sees all
  // his own posts regardless. Comments are filtered separately below —
  // being able to see a post is not the same as seeing every comment on it.
  const visiblePosts = raw
    .filter((p) => isAdmin || p.visibleToAll || p.visibleToUids.includes(user?.uid))
    .map((p) => ({
      ...p,
      // Anyone but Brenner only ever sees their own private thread with him.
      comments: isAdmin ? p.comments : p.comments.filter((c) => c.uid === user?.uid),
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
    await reactToPost('supportAnnouncements', id, 'like');
  };

  // Adding a comment is really "replying privately to Brenner" — the
  // person only ever sees their own thread, never anyone else's, even
  // though it's stored in the same document.
  const addComment = async (postId, text) => {
    await reactToPost('supportAnnouncements', postId, 'comment', { text });
  };

  return (
    <SupportAnnouncementsContext.Provider value={{ posts: visiblePosts, postUpdate, toggleLike, addComment, isSupportAdmin: isAdmin }}>
      {children}
    </SupportAnnouncementsContext.Provider>
  );
}

export function useSupportAnnouncements() {
  const ctx = useContext(SupportAnnouncementsContext);
  if (!ctx) throw new Error('useSupportAnnouncements must be used within SupportAnnouncementsProvider');
  return ctx;
}
