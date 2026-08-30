import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useAuth } from './AuthContext';

const ChatContext = createContext(undefined);

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const [allConversationsRaw, setAllConversationsRaw] = useState([]);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!user) {
      setAllConversationsRaw([]);
      setMessages([]);
      return;
    }

    // Same rule-provability requirement as mobile: admins get an unfiltered
    // listener (allowed for them), everyone else must filter by their own
    // uid or Firestore rejects the whole read.
    const isAdmin = user.role === 'admin';

    const convosQuery = isAdmin
      ? collection(db, 'conversations')
      : query(collection(db, 'conversations'), where('memberUids', 'array-contains', user.uid));

    const messagesQuery = isAdmin
      ? collection(db, 'messages')
      : query(collection(db, 'messages'), where('memberUids', 'array-contains', user.uid));

    const unsubConvos = onSnapshot(convosQuery, (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: data.type,
          name: data.name,
          memberUids: data.memberUids ?? [],
          memberNames: data.memberNames ?? [],
          createdBy: data.createdBy,
          timestamp: data.timestamp,
          lastMessageText: data.lastMessageText ?? '',
          lastMessageTimestamp: data.lastMessageTimestamp ?? data.timestamp,
          lastMessageSenderUid: data.lastMessageSenderUid ?? '',
          lastReadTimestamps: data.lastReadTimestamps ?? {},
        };
      });
      setAllConversationsRaw(list);
    });

    const unsubMessages = onSnapshot(messagesQuery, (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          conversationId: data.conversationId,
          senderUid: data.senderUid,
          senderName: data.senderName,
          text: data.text,
          timestamp: data.timestamp,
          // An array on the message rather than a subcollection. Reactions are
          // small and always wanted alongside their message, so a subcollection
          // would cost an extra read per message for data that fits inline.
          reactions: data.reactions ?? [],
          // { url, path, name, contentType, size, viewedBy: [uid] }. Cleared by
          // a scheduled function once viewedBy covers everyone in the thread —
          // deleting inline would orphan files whenever someone closes the app
          // mid-operation, and orphans in Storage cost money forever.
          attachment: data.attachment ?? null,
          memberUids: data.memberUids ?? [],
          edited: data.edited ?? false,
        };
      });
      setMessages(list);
    });

    return () => {
      unsubConvos();
      unsubMessages();
    };
  }, [user]);

  const conversations = user
    ? allConversationsRaw
        .filter((c) => c.memberUids.includes(user.uid))
        .map((c) => {
          if (c.type === 'direct') {
            const otherIndex = c.memberUids.findIndex((uid) => uid !== user.uid);
            const otherName = otherIndex >= 0 ? c.memberNames[otherIndex] : c.name;
            return { ...c, name: otherName };
          }
          return c;
        })
        .sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp)
    : [];

  const allConversations = [...allConversationsRaw].sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);

  const startDirectMessage = async (otherUid, otherName) => {
    if (!user) throw new Error('Not logged in');
    const existing = allConversationsRaw.find(
      (c) =>
        c.type === 'direct' &&
        c.memberUids.length === 2 &&
        c.memberUids.includes(user.uid) &&
        c.memberUids.includes(otherUid)
    );
    if (existing) return existing.id;

    const ref = await addDoc(collection(db, 'conversations'), {
      type: 'direct',
      name: otherName,
      memberUids: [user.uid, otherUid],
      memberNames: [user.name, otherName],
      createdBy: user.uid,
      timestamp: Date.now(),
      lastMessageText: '',
      lastMessageTimestamp: Date.now(),
      lastMessageSenderUid: '',
      lastReadTimestamps: {},
    });
    return ref.id;
  };

  const createGroup = async (name, memberUids, memberNames) => {
    const uid = auth.currentUser?.uid;
    const allUids = uid && !memberUids.includes(uid) ? [...memberUids, uid] : memberUids;
    const allNames = uid && !memberUids.includes(uid) ? [...memberNames, user?.name ?? 'Unknown'] : memberNames;

    const ref = await addDoc(collection(db, 'conversations'), {
      type: 'group',
      name,
      memberUids: allUids,
      memberNames: allNames,
      createdBy: uid ?? null,
      timestamp: Date.now(),
      lastMessageText: '',
      lastMessageTimestamp: Date.now(),
      lastMessageSenderUid: '',
      lastReadTimestamps: {},
    });
    return ref.id;
  };

  // Toggles one person's reaction. Stored as { emoji, uid, name } so the UI can
  // show who reacted without a second lookup.
  const toggleReaction = async (messageId, emoji, current) => {
    if (!user) return;
    const mine = current.find((r) => r.uid === user.uid && r.emoji === emoji);
    const next = mine
      ? current.filter((r) => !(r.uid === user.uid && r.emoji === emoji))
      : [...current.filter((r) => r.uid !== user.uid), { emoji, uid: user.uid, name: user.name }];
    await updateDoc(doc(db, 'messages', messageId), { reactions: next });
  };

  // Recorded per person so the cleanup sweep knows when everyone has seen it.
  const markAttachmentViewed = async (messageId, attachment) => {
    if (!user || !attachment) return;
    if (attachment.viewedBy?.includes(user.uid)) return;
    await updateDoc(doc(db, 'messages', messageId), {
      'attachment.viewedBy': [...(attachment.viewedBy ?? []), user.uid],
    });
  };

  const sendMessage = async (conversationId, text, attachment = null) => {
    if (!user) return;
    const convo = allConversationsRaw.find((c) => c.id === conversationId);
    await addDoc(collection(db, 'messages'), {
      conversationId,
      senderUid: user.uid,
      senderName: user.name,
      text,
      reactions: [],
      attachment,
      timestamp: Date.now(),
      memberUids: convo?.memberUids ?? [user.uid],
      edited: false,
    });
    await updateDoc(doc(db, 'conversations', conversationId), {
      // An attachment with no message would leave the conversation list blank,
      // which reads as a bug rather than a file.
      lastMessageText: text || (attachment ? `Sent ${attachment.name}` : ''),
      lastMessageTimestamp: Date.now(),
      lastMessageSenderUid: user.uid,
      [`lastReadTimestamps.${user.uid}`]: Date.now(),
    });
    // Note: real push notifications (like mobile sends) aren't wired up for
    // desktop yet — the real-time listener still means messages appear
    // instantly if the app is open, just no OS-level notification if it's
    // in the background yet.
  };

  const getMessagesForConversation = (conversationId) =>
    messages.filter((m) => m.conversationId === conversationId).sort((a, b) => a.timestamp - b.timestamp);

  const markConversationRead = async (conversationId) => {
    if (!user) return;
    await updateDoc(doc(db, 'conversations', conversationId), {
      [`lastReadTimestamps.${user.uid}`]: Date.now(),
    });
  };

  const getUnreadCountForConversation = (conversationId) => {
    if (!user) return 0;
    const convo = conversations.find((c) => c.id === conversationId);
    if (!convo) return 0;
    const lastRead = convo.lastReadTimestamps?.[user.uid] ?? 0;
    return messages.filter(
      (m) => m.conversationId === conversationId && m.timestamp > lastRead && m.senderUid !== user.uid
    ).length;
  };

  const unreadCount = user ? conversations.reduce((sum, c) => sum + getUnreadCountForConversation(c.id), 0) : 0;

  const deleteConversation = async (conversationId) => {
    const isAdminUser = user?.role === 'admin';
    const messagesQuery = isAdminUser
      ? query(collection(db, 'messages'), where('conversationId', '==', conversationId))
      : query(
          collection(db, 'messages'),
          where('conversationId', '==', conversationId),
          where('memberUids', 'array-contains', user?.uid ?? '')
        );
    const snap = await getDocs(messagesQuery);
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    await deleteDoc(doc(db, 'conversations', conversationId));
  };

  const editMessage = async (messageId, newText) => {
    await updateDoc(doc(db, 'messages', messageId), { text: newText, edited: true });
  };

  const deleteMessage = async (messageId) => {
    await deleteDoc(doc(db, 'messages', messageId));
  };

  return (
    <ChatContext.Provider
      value={{
        toggleReaction,
        markAttachmentViewed,
        conversations,
        allConversations,
        unreadCount,
        createGroup,
        startDirectMessage,
        sendMessage,
        getMessagesForConversation,
        getUnreadCountForConversation,
        markConversationRead,
        deleteConversation,
        editMessage,
        deleteMessage,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
