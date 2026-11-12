import React, { useEffect, useMemo, useRef, useState } from 'react';
import { personColor } from '../lib/personColor';
import { usePageWidth } from '../hooks/usePageWidth';
import { useIsNarrow } from '../hooks/useIsNarrow';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import MessageReactions, { ReactionPicker } from '../components/MessageReactions';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { storage } from '../firebaseConfig';
import ChatAttachment from '../components/ChatAttachment';
import Icon from '../components/Icon';
import { useDialog } from '../hooks/useDialog';
import { fmtDay, fmtTime, fmtDayTime } from '../lib/dates';
import { plainError } from '../lib/errors';
import PageHeader from '../components/PageHeader';

// Today: the time. Before today: the day.
function formatTime(ts) {
  if (!ts) return '';
  return fmtDayTime(ts).startsWith('Today') ? fmtTime(ts) : fmtDay(ts);
}

// Everyone has their own colour (18 Oct 2026): the same in every chat and on
// every avatar, never shared - see src/lib/personColor.js.
// The search term, lit up wherever it appears in a message or a name.
function highlight(text, q, current = false) {
  const t = String(text ?? '');
  const needle = q.trim().toLowerCase();
  if (!needle) return t;
  const out = [];
  let i = 0;
  const low = t.toLowerCase();
  while (i < t.length) {
    const at = low.indexOf(needle, i);
    if (at === -1) {
      out.push(t.slice(i));
      break;
    }
    if (at > i) out.push(t.slice(i, at));
    out.push(
      <mark key={at} style={current ? styles.markCurrent : styles.mark}>
        {t.slice(at, at + needle.length)}
      </mark>
    );
    i = at + needle.length;
  }
  return out;
}

export default function MessagesScreen() {
  const isNarrow = useIsNarrow();
  // A half-screen window (Nov 2026) has no room for the list and the chat
  // side by side: like the phone, the list fills the page, and a chat opens
  // full width with a way back.
  const pageWidth = usePageWidth();
  const onePane = isNarrow || pageWidth < 820;
  const {
    conversations,
    getMessagesForConversation,
    getUnreadCountForConversation,
    sendMessage,
    markConversationRead,
    createGroup,
    startDirectMessage,
    deleteConversation,
    editMessage,
    deleteMessage,
    toggleReaction,
    markAttachmentViewed,
  } = useChat();
  const { user, activeUsers: users, users: everyone } = useAuth();
  const colorOf = (uid) => personColor(uid, everyone ?? users);
  const [activeId, setActiveId] = useState(null);
  // An open chat on a phone hides the floating bell, so it never sits on
  // top of the Send button (Glass, Nov 2026).
  useEffect(() => {
    if (!activeId) return undefined;
    document.body.setAttribute('data-chat-open', '');
    return () => document.body.removeAttribute('data-chat-open');
  }, [activeId]);
  const [text, setText] = useState('');
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  // Where a message's reaction bar goes (Nov 2026): beside the bubble when
  // there is room, so it never covers the message above; above it otherwise.
  const [barBeside, setBarBeside] = useState(true);
  const placeBar = (row, isMe) => {
    const bubble = row.querySelector('[data-bubble]');
    if (!bubble) return;
    const r = row.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const room = isMe ? b.left - r.left : r.right - b.right;
    setBarBeside(room >= 214);
  };
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editText, setEditText] = useState('');

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState('dm'); // 'dm' | 'group'
  const [selectedUids, setSelectedUids] = useState([]);
  const [groupName, setGroupName] = useState('');
  const { dialogNode, confirm, notify } = useDialog();
  // Adding a reaction: says so if it didn't save, instead of failing quietly.
  const react = (m, key) => {
    Promise.resolve(toggleReaction(m.id, key, m.reactions ?? [])).catch((err) => notify('Reaction not saved', plainError(err, 'Try again.')));
  };
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  // Search (Mark, 10 Oct 2026): across every chat from the list, and inside
  // the open chat with a count and arrows to step through the matches. Every
  // message you can see is already on the page, so it is instant.
  const [q, setQ] = useState('');
  const [threadSearch, setThreadSearch] = useState(false);
  const [tq, setTq] = useState('');
  const [hit, setHit] = useState(0);
  // The message tapped in the results, so the chat opens on that one.
  const [jumpId, setJumpId] = useState(null);
  const threadRef = useRef(null);

  // Uploads and sends in one step. A staged attachment waiting for a caption
  // is a state that can be abandoned, leaving a file in Storage with nothing
  // referencing it — sending immediately means every upload has an owner.
  const handleAttach = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeId) return;
    if (file.size > 25 * 1024 * 1024) {
      notify('File too large', 'Files need to be under 25MB.');
      return;
    }

    setUploading(true);
    try {
      const stamp = `${Date.now()}-${file.name}`;
      const path = `chatAttachments/${activeId}/${stamp}`;
      const fileRefStorage = storageRef(storage, path);
      await uploadBytes(fileRefStorage, file);
      // Where the file is, not a link to it: a link works for anyone who has
      // it. People in the conversation open it through a short link the
      // server checks (8 Oct).
      await sendMessage(activeId, '', {
        path,
        name: file.name,
        contentType: file.type,
        size: file.size,
        viewedBy: [],
      });
    } catch (err) {
      notify('Upload failed', plainError(err, 'Something went wrong sending that file.'));
    } finally {
      setUploading(false);
    }
  };

  // A to Z, so a name is quick to find (Glass, Nov 2026).
  const otherUsers = users.filter((u) => u.uid !== user?.uid && u.active).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const activeConvo = conversations.find((c) => c.id === activeId);
  const activeMessages = activeId ? getMessagesForConversation(activeId) : [];

  const openConversation = (id, find = '', messageId = null) => {
    setActiveId(id);
    markConversationRead(id);
    setThreadSearch(!!find);
    setTq(find);
    setHit(-1);
    setJumpId(messageId);
  };

  const needle = q.trim().toLowerCase();
  const chatHits = needle ? conversations.filter((c) => (c.name ?? '').toLowerCase().includes(needle)) : [];
  const messageHits = useMemo(() => {
    if (!needle) return [];
    return conversations
      .flatMap((c) => getMessagesForConversation(c.id).filter((m) => (m.text ?? '').toLowerCase().includes(needle)).map((m) => ({ m, c })))
      .sort((a, b) => (b.m.timestamp ?? 0) - (a.m.timestamp ?? 0))
      .slice(0, 60);
  }, [needle, conversations, getMessagesForConversation]);

  // Inside the open chat: the matching messages, newest last like the thread.
  const tneedle = tq.trim().toLowerCase();
  const threadHits = tneedle ? activeMessages.filter((m) => (m.text ?? '').toLowerCase().includes(tneedle)).map((m) => m.id) : [];
  const startAt = jumpId && threadHits.includes(jumpId) ? threadHits.indexOf(jumpId) : threadHits.length - 1;
  const currentHit = threadHits.length ? threadHits[(hit < 0 ? startAt : hit) % threadHits.length] : null;
  useEffect(() => {
    if (!currentHit || !threadRef.current) return;
    const el = threadRef.current.querySelector('[data-msg-id="' + currentHit + '"]');
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentHit]);
  // Opening a chat, or a new message arriving, shows the newest at the
  // bottom - unless a search is jumping to a match.
  const lastId = activeMessages[activeMessages.length - 1]?.id;
  useEffect(() => {
    if (tneedle || !threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [activeId, lastId]);

  const step = (dir) => {
    if (!threadHits.length) return;
    const now = hit < 0 ? startAt : hit;
    setHit((now + dir + threadHits.length) % threadHits.length);
  };

  // Grows the textarea to fit its content, up to a max height, then lets it
  // scroll internally — so you can always see everything you've typed.
  const autoGrow = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleSend = () => {
    if (!text.trim() || !activeId) return;
    const sent = text.trim();
    // If it does not go, say so and put the words back rather than losing them.
    sendMessage(activeId, sent).catch((err) => {
      setText(sent);
      notify('Message not sent', plainError(err, 'Try again.'));
    });
    setText('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const openPicker = (mode) => {
    setPickerMode(mode);
    setSelectedUids([]);
    setGroupName('');
    setPickerOpen(true);
  };
  const closePicker = () => setPickerOpen(false);

  const toggleSelect = (uid) => {
    setSelectedUids((prev) => (prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]));
  };

  const handleStartDM = async (otherUid, otherName) => {
    const id = await startDirectMessage(otherUid, otherName);
    closePicker();
    openConversation(id);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUids.length === 0) return;
    const memberNames = selectedUids.map((uid) => users.find((u) => u.uid === uid)?.name ?? 'Unknown');
    const id = await createGroup(groupName.trim(), selectedUids, memberNames);
    closePicker();
    openConversation(id);
  };

  const handleDeleteChat = (id, name) => {
    confirm({
      title: `Delete "${name}"?`,
      body: 'All its messages will be permanently removed for everyone. This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await deleteConversation(id);
          if (activeId === id) setActiveId(null);
        } catch (err) {
          notify('Could not delete it', plainError(err, 'Try again.'));
        }
      },
    });
  };

  const startEditMessage = (m) => {
    setEditingMsgId(m.id);
    setEditText(m.text);
  };
  const cancelEditMessage = () => {
    setEditingMsgId(null);
    setEditText('');
  };
  const saveEditMessage = () => {
    if (!editText.trim()) return;
    editMessage(editingMsgId, editText.trim());
    cancelEditMessage();
  };
  const handleDeleteMessage = (id) => {
    confirm({
      title: 'Delete this message?',
      body: 'This removes it for everyone and cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: () => deleteMessage(id),
    });
  };

  // On a phone the two panes become one: the list until you pick a
  // conversation, then the thread. Desktop shows both side by side, and
  // activeId already decides what the thread pane renders - here it also
  // decides which pane exists.
  const showList = !onePane || !activeId;
  const showThread = !onePane || !!activeId;

  // Same header as every page (14 Oct 2026): "+ New message" top right,
  // "+ New group" beside it. On a phone it shows over the chat list only;
  // inside a chat nothing changes.
  const canGroup = user?.role === 'admin' || user?.role === 'executive';
  return (
    <div style={styles.shell}>
      {showList ? (
        <div style={isNarrow ? styles.headNarrow : styles.head}>
          <PageHeader
            title="Messages"
            subtitle="Chats and groups with your team."
            // Shorter labels on a phone so both buttons sit beside the title
            // instead of "+ New group" on a row of its own (15 Oct 2026).
            extras={canGroup ? <button style={isNarrow ? { ...styles.ghostAction, padding: '9px 14px', fontSize: 14.5, minHeight: 42 } : styles.ghostAction} onClick={() => openPicker('group')}>{isNarrow ? '+ Group' : '+ New group'}</button> : null}
            phoneExtras="inline"
            actionLabel={isNarrow ? '+ New' : '+ New message'}
            onAction={() => openPicker('dm')}
          />
        </div>
      ) : null}
    <div style={isNarrow ? styles.pageNarrow : styles.page}>
      <div style={{ ...styles.list, ...(isNarrow ? styles.listNarrow : onePane ? styles.listWide : {}), ...(showList ? {} : { display: 'none' }) }}>

        <div style={isNarrow ? { ...styles.searchWrap, padding: '0 16px 10px' } : styles.searchWrap}>
          <input
            type="search"
            style={{ ...styles.search, ...(isNarrow ? { fontSize: 16, minHeight: 44 } : {}) }}
            placeholder="Search chats and messages"
            aria-label="Search chats and messages"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div style={styles.listScroll}>
          {needle ? (
            <>
              <p style={styles.resultsLabel}>Chats{chatHits.length ? ' · ' + chatHits.length : ''}</p>
              {chatHits.length === 0 ? <p style={styles.emptyList}>No chat names match.</p> : null}
              {chatHits.map((c) => (
                <div key={c.id} data-row="" style={styles.convoRow} onClick={() => openConversation(c.id)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.convoName}>{highlight(c.name, q)}</div>
                    <div style={styles.convoPreview}>{c.type === 'group' ? 'Group · ' + (c.memberUids?.length ?? 0) + ' people' : 'Chat'}</div>
                  </div>
                </div>
              ))}
              <p style={styles.resultsLabel}>Messages{messageHits.length ? ' · ' + messageHits.length : ''}</p>
              {messageHits.length === 0 ? <p style={styles.emptyList}>No messages match "{q.trim()}".</p> : null}
              {messageHits.map(({ m, c }) => (
                <div key={m.id} data-row="" style={{ ...styles.convoRow, alignItems: 'flex-start' }} onClick={() => openConversation(c.id, q.trim(), m.id)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={styles.convoName}>{c.name}</span>
                      <span style={styles.convoTime}>{formatTime(m.timestamp)}</span>
                    </div>
                    <div style={styles.resultText}>{c.type === 'group' && m.senderName ? m.senderName + ': ' : ''}{highlight(m.text, q)}</div>
                  </div>
                </div>
              ))}
            </>
          ) : conversations.length === 0 ? (
            <p style={styles.emptyList}>No conversations yet. Start one above.</p>
          ) : (
            conversations.map((c) => {
              const unread = getUnreadCountForConversation(c.id);
              return (
                <div
                  key={c.id}
                  data-row=""
                  style={{ ...styles.convoRow, ...(isNarrow ? styles.convoRowNarrow : {}), ...(activeId === c.id ? styles.convoRowActive : {}) }}
                  onClick={() => openConversation(c.id)}
                >
                  {/* Initials rather than a glyph — you recognise a person by
                      their name, and every conversation looking identical
                      makes the list something to read rather than scan. */}
                  <div
                    style={{
                      ...styles.convoAvatar,
                      ...(c.type === 'group' ? styles.convoAvatarGroup : {}),
                      background: c.type === 'group' ? 'transparent' : `${colorOf((c.memberUids ?? []).find((u) => u !== user?.uid))}22`,
                      color: c.type === 'group' ? 'var(--text-secondary)' : colorOf((c.memberUids ?? []).find((u) => u !== user?.uid)),
                    }}
                  >
                    {c.type === 'group' ? (c.memberUids?.length ?? '') : (c.name || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...styles.convoName, ...(unread > 0 ? styles.convoNameUnread : {}) }}>
                      {c.name}
                      {c.type === 'group' ? <span style={styles.groupTag}>Group</span> : null}
                    </div>
                    <div style={{ ...styles.convoPreview, ...(isNarrow ? { maxWidth: 'none', fontSize: 13 } : onePane ? { maxWidth: 'none' } : {}) }}>{c.lastMessageText || 'No messages yet'}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={styles.convoTime}>{formatTime(c.lastMessageTimestamp)}</span>
                    {unread > 0 ? <span style={styles.unreadDot} /> : null}
                  </div>
                  {/* Hidden until the row is hovered — a permanent delete next
                      to every conversation is an accident waiting to happen. */}
                  <button
                    data-hover-only=""
                    style={styles.deleteButton}
                    title="Delete chat"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteChat(c.id, c.name);
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div style={{ ...styles.thread, ...(isNarrow && activeId ? styles.threadPhone : {}), ...(showThread ? {} : { display: 'none' }) }}>
        {!activeConvo ? (
          <div style={styles.threadEmpty}>Select a conversation</div>
        ) : (
          <>
            <div style={styles.threadHeaderRow}>
              {onePane ? (
                <button style={styles.backToList} onClick={() => setActiveId(null)} aria-label="Back to chats" title="All chats">
                  ‹
                </button>
              ) : null}
              <div style={{ ...styles.threadHeader, flex: 1, minWidth: 0 }}>{activeConvo.name}</div>
              <button
                style={{ ...styles.searchToggle, ...(threadSearch ? styles.searchToggleOn : {}) }}
                aria-label="Search this chat"
                title="Search this chat"
                onClick={() => {
                  setThreadSearch((v) => !v);
                  setTq('');
                  setHit(-1);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              </button>
            </div>
            {threadSearch ? (
              <div style={styles.threadSearchBar}>
                <input
                  type="search"
                  autoFocus
                  style={{ ...styles.search, flex: 1, ...(isNarrow ? { fontSize: 16 } : {}) }}
                  placeholder="Search in this chat"
                  aria-label="Search in this chat"
                  value={tq}
                  onChange={(e) => {
                    setTq(e.target.value);
                    setHit(-1);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && step(e.shiftKey ? 1 : -1)}
                />
                <span style={styles.hitCount}>
                  {tneedle ? (threadHits.length ? (threadHits.indexOf(currentHit) + 1) + ' of ' + threadHits.length : 'None') : ''}
                </span>
                <button style={styles.stepButton} aria-label="Earlier match" disabled={!threadHits.length} onClick={() => step(-1)}>▲</button>
                <button style={styles.stepButton} aria-label="Later match" disabled={!threadHits.length} onClick={() => step(1)}>▼</button>
              </div>
            ) : null}
            <div style={styles.threadScroll} ref={threadRef}>
              {activeMessages.map((m, index) => {
                const isMe = m.senderUid === user?.uid;
                const isEditing = editingMsgId === m.id;
                const isGroup = activeConvo.type === 'group';
                const prevMsg = activeMessages[index - 1];
                const showSenderInfo = !isMe && isGroup && (!prevMsg || prevMsg.senderUid !== m.senderUid);
                return (
                  <div
                    key={m.id}
                    data-msg-id={m.id}
                    style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 18, gap: 8, alignItems: 'flex-end', position: 'relative' }}
                    // On a phone there is no hover: a tap shows the actions.
                    onClick={isNarrow ? () => setHoveredMsgId((prev) => (prev === m.id ? null : m.id)) : undefined}
                    onMouseEnter={(e) => { placeBar(e.currentTarget, isMe); setHoveredMsgId(m.id); }}
                    onMouseLeave={() => setHoveredMsgId((prev) => (prev === m.id ? null : prev))}
                  >
                    {!isMe && isGroup ? (
                      <div
                        style={{
                          ...styles.groupAvatar,
                          background: colorOf(m.senderUid),
                          visibility: showSenderInfo ? 'visible' : 'hidden',
                        }}
                      >
                        {(m.senderName || '?').charAt(0).toUpperCase()}
                      </div>
                    ) : null}
                    {hoveredMsgId === m.id && !isEditing ? (
                      <div
                        style={{
                          ...styles.msgActions,
                          ...(barBeside && !isNarrow
                            ? { ...styles.msgActionsBeside, alignItems: isMe ? 'flex-end' : 'flex-start', ...(isMe ? { right: 'var(--bar-gap)' } : { left: 'var(--bar-gap)' }) }
                            : isMe ? { right: 0 } : { left: isGroup ? 40 : 0 }),
                          '--bar-gap': (() => {
                            const row = typeof document !== 'undefined' ? document.querySelector('[data-msg-id="' + m.id + '"]') : null;
                            const bub = row && row.querySelector('[data-bubble]');
                            if (!row || !bub) return '0px';
                            const r = row.getBoundingClientRect(); const bb = bub.getBoundingClientRect();
                            return (isMe ? r.right - bb.left : bb.right - r.left) + 10 + 'px';
                          })(),
                        }}
                      >
                        <ReactionPicker mine={(m.reactions ?? []).find((r) => r.uid === user?.uid)?.emoji} onPick={(emoji) => react(m, emoji)} />
                        {isMe ? (
                          <span style={styles.msgEditRow}>
                            <button style={styles.msgActionButton} onClick={() => startEditMessage(m)} title="Edit" aria-label="Edit">
                              ✎
                            </button>
                            <button style={styles.msgActionButton} onClick={() => handleDeleteMessage(m.id)} title="Delete" aria-label="Delete">
                              <Icon name="close" size={14} />
                            </button>
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {isEditing ? (
                      <div style={{ ...styles.bubble, ...styles.bubbleOther, maxWidth: '100%', width: 'min(380px, 100%)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input
                          style={styles.editInput}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEditMessage()}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button style={styles.editSmallButton} onClick={cancelEditMessage}>
                            Cancel
                          </button>
                          <button style={{ ...styles.editSmallButton, fontWeight: 700 }} onClick={saveEditMessage}>
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div data-bubble="" style={{ ...styles.bubble, ...(isMe ? styles.bubbleMe : styles.bubbleOther), ...(isNarrow ? { maxWidth: '82%', fontSize: 15 } : {}), ...(currentHit === m.id ? styles.bubbleHit : {}) }}>
                        {showSenderInfo ? (
                          <div style={{ ...styles.senderName, color: colorOf(m.senderUid) }}>{m.senderName}</div>
                        ) : null}

                        {m.text ? <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{tneedle ? highlight(m.text, tq, currentHit === m.id) : m.text}</div> : null}
                        {m.attachment ? (
                          <ChatAttachment
                            messageId={m.id}
                            attachment={m.attachment}
                            onView={() => markAttachmentViewed(m.id, m.attachment)}
                          />
                        ) : null}
                        <div style={styles.msgTime}>
                          {formatTime(m.timestamp)}
                          {m.edited ? ' · edited' : ''}
                        </div>
                        <MessageReactions
                          reactions={m.reactions ?? []}
                          myUid={user?.uid}
                          isMe={isMe}
                          onToggle={(emoji) => react(m, emoji)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ ...styles.inputRow, ...(isNarrow ? styles.inputRowNarrow : {}) }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*,application/pdf,.doc,.docx"
                style={{ display: 'none' }}
                onChange={handleAttach}
              />
              <button
                style={styles.attachButton}
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                title="Attach a file"
              >
                {uploading ? '…' : '+'}
              </button>
              <textarea
                ref={inputRef}
                style={{ ...styles.input, ...(isNarrow ? { fontSize: 16 } : {}) }}
                placeholder="Message…"
                value={text}
                rows={1}
                onChange={(e) => {
                  setText(e.target.value);
                  autoGrow(e.target);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button style={styles.sendButton} onClick={handleSend}>
                Send
              </button>
            </div>
          </>
        )}
      </div>

      {pickerOpen ? (
        <div data-modal="" data-modal-keep="" style={styles.modalBackdrop} onClick={closePicker}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ ...styles.modalTitle, flex: 1 }}>{pickerMode === 'dm' ? 'New message' : 'New group'}</h2>
              {/* A way out without picking anyone (15 Oct 2026). */}
              <button style={styles.pickerClose} onClick={closePicker} aria-label="Close">
                <Icon name="close" size={16} />
              </button>
            </div>

            {pickerMode === 'group' ? (
              <input
                style={styles.input2}
                placeholder="Group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                autoFocus
              />
            ) : null}

            <div style={styles.pickerList}>
              {otherUsers.map((u) => {
                const selected = selectedUids.includes(u.uid);
                return (
                  <div data-row=""
                    key={u.uid}
                    style={{ ...styles.personRow, ...(selected ? styles.personRowSelected : {}) }}
                    onClick={() => (pickerMode === 'dm' ? handleStartDM(u.uid, u.name) : toggleSelect(u.uid))}
                  >
                    <span style={styles.personAvatar}>{String(u.name || '?').slice(0, 1).toUpperCase()}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{u.name}</span>
                      {u.job ? <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-tertiary)' }}>{u.job}</span> : null}
                    </span>
                    {pickerMode === 'group' ? (
                      <span style={{ ...styles.personCheck, ...(selected ? styles.personCheckOn : {}) }}>{selected ? '✓' : ''}</span>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 18 }}>›</span>
                    )}
                  </div>
                );
              })}
            </div>

            {pickerMode === 'group' ? (
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button style={styles.cancelButton} onClick={closePicker}>
                  Cancel
                </button>
                <button style={styles.createButton} onClick={handleCreateGroup}>
                  Create group
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {dialogNode}
    </div>
    </div>
  );
}

const styles = {
  // The header on top, the two panes filling what is left.
  shell: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  head: { padding: '24px max(22px, min(44px, 4vw)) 0', borderBottom: '1px solid var(--border)' },
  headNarrow: { padding: '16px 16px 0' },
  pickerClose: { width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--ink-rgb), 0.06)', border: 'none', borderRadius: 16, padding: 0, color: 'var(--text-secondary)', flexShrink: 0 },
  ghostAction: {
    background: 'rgba(var(--paper-rgb), 0.6)', border: '1px solid rgba(var(--ink-rgb), 0.1)', color: 'var(--text-primary)', borderRadius: 999,
    padding: '10px 18px', fontWeight: 600, fontSize: 15, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', minHeight: 44,
  },
  // Glass (Nov 2026): the chat list and the open chat are two glass panes
  // side by side, lined up with the title.
  page: { display: 'flex', flex: 1, minHeight: 0, gap: 14, padding: '4px max(22px, min(48px, 4vw)) 24px' },
  // On a phone the page must stay inside the space above the bottom bar: the
  // thread scrolls inside it rather than growing, or a long chat pushed the
  // typing box down behind the bar (10 Oct 2026). minHeight 0 is what lets a
  // flex child be shorter than its content.
  pageNarrow: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' },
  list: { width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', borderRadius: 24, paddingTop: 12, overflow: 'hidden' },
  listWide: { width: 'auto', flex: 1, minWidth: 0 },
  listNarrow: { width: '100%', flex: 1, minWidth: 0, minHeight: 0, background: 'none', borderRadius: 0, paddingTop: 0, overflow: 'visible' },
  backToList: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: 24,
    width: 44,
    height: 44,
    padding: 0,
    cursor: 'pointer',
    alignSelf: 'flex-start',
    WebkitTapHighlightColor: 'transparent',
  },
  convoAvatar: {
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: 9,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Dashed outline and a member count rather than initials — a group isn't a
  // person, and at a glance the shape should say so before you read the name.
  convoAvatarGroup: { border: '1.5px dashed var(--border-strong)', fontSize: 12 },
  groupTag: {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 0.5,
    color: 'var(--text-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '1px 5px',
    marginLeft: 7,
    verticalAlign: 'middle',
  },
  convoNameUnread: { fontWeight: 800 },
  listScroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px' },
  emptyList: { padding: 16, fontSize: 13, color: 'var(--text-secondary)' },
  convoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '10px 8px',
    borderRadius: 8,
    marginBottom: 2,
    cursor: 'pointer',
    position: 'relative',
  },
  // Background only. The left border collided with the hover bar, so an active
  // row showed two markers stacked and neither read cleanly.
  convoRowActive: { background: 'rgba(var(--ink-rgb), 0.09)' },
  convoRowNarrow: { padding: '12px 8px', minHeight: 56 },
  searchWrap: { padding: '0 12px 10px' },
  search: { width: '100%', boxSizing: 'border-box', minHeight: 40, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--bg-inset)', color: 'var(--text-primary)', fontSize: 13, padding: '0 12px', outline: 'none', fontFamily: 'inherit' },
  resultsLabel: { margin: '10px 8px 4px', fontSize: 12, fontWeight: 700, letterSpacing: 0, textTransform: 'none', color: 'var(--text-tertiary)' },
  resultText: { fontSize: 13, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  mark: { background: 'rgba(10,126,164,0.28)', color: 'var(--text-primary)', borderRadius: 3, padding: '0 1px' },
  markCurrent: { background: 'var(--neon)', color: 'var(--neon-text)', borderRadius: 3, padding: '0 1px' },
  threadHeaderRow: { display: 'flex', alignItems: 'center', gap: 6, paddingRight: 12, borderBottom: '1px solid var(--border)' },
  searchToggle: { width: 40, height: 40, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-inset)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  searchToggleOn: { borderColor: 'var(--neon)', color: 'var(--neon)' },
  threadSearchBar: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'rgba(var(--paper-rgb), 0.5)' },
  hitCount: { fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', minWidth: 44, textAlign: 'center' },
  stepButton: { width: 38, height: 38, borderRadius: 999, border: '1px solid rgba(var(--ink-rgb), 0.1)', background: 'rgba(var(--paper-rgb), 0.6)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', flexShrink: 0 },
  bubbleHit: { boxShadow: '0 0 0 2px var(--neon)' },
  convoName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  convoPreview: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 140,
  },
  convoTime: { fontSize: 10, color: 'var(--text-secondary)' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, background: 'var(--danger)' },
  deleteButton: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    padding: '2px 6px',
    borderRadius: 4,
    flexShrink: 0,
  },
  thread: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-card)', borderRadius: 24, overflow: 'hidden' },
  // On a phone an open chat is pinned to the screen, between the top of the
  // screen and the floating bottom bar, so the typing box can never slide
  // underneath the bar however long the chat or whatever sits above it
  // (update banner, View as bar, Safari's own bars). 142px clears the bar,
  // its 24px gap, the home button and the bell.
  threadPhone: {
    position: 'fixed',
    top: 'env(safe-area-inset-top, 0px)',
    left: 0,
    right: 0,
    bottom: 'calc(142px + env(safe-area-inset-bottom, 0px))',
    zIndex: 5,
    // The page wash, so the chat list doesn't show through the open chat.
    background: 'var(--bg-wash)',
    backgroundAttachment: 'fixed',
    borderRadius: 0,
  },
  threadEmpty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 14 },
  threadHeader: { padding: '14px 8px 12px 16px', fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  // Top padding leaves room for a reaction pill on the first message — it
  // overlaps the bubble's top corner, so a flush start clips it.
  threadScroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 20px 0' },
  // Squared with a hairline border, matching every other surface in the app.
  // The old solid --accent fill read as a different material from the cards
  // around it, and rounded tails borrow a shape that isn't ours.
  bubble: {
    maxWidth: '68%',
    borderRadius: 20,
    padding: '11px 15px',
    fontSize: 15,
    lineHeight: 1.4,
    position: 'relative',
  },
  // Glass (Nov 2026): yours in the accent colour, theirs on white glass.
  // Your messages (Nov 2026, Brenner): a softer wash of the accent instead
  // of the full bright colour, with normal text on it, in light and dark.
  bubbleMe: {
    background: 'color-mix(in srgb, var(--neon) 42%, var(--surface))',
    border: '1px solid color-mix(in srgb, var(--neon) 30%, transparent)',
    color: 'var(--text-primary)',
  },
  bubbleOther: {
    background: 'rgba(var(--paper-rgb), 0.85)',
    border: '1px solid var(--glass-edge)',
    boxShadow: 'var(--shadow-sm)',
    color: 'var(--text-primary)',
  },
  senderName: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  groupAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    color: 'var(--neon-text)',
    fontSize: 11,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  msgTime: { fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: 'right' },
  // Floats just above the message, so pointing at a message never squeezes
  // or resizes it (Nov 2026).
  msgActions: { position: 'absolute', bottom: 'calc(100% + 4px)', zIndex: 5, display: 'flex', alignItems: 'center', gap: 4, animation: 'hubBarIn 0.22s var(--spring)' },
  // Beside the bubble, level with its middle (Nov 2026). --bar-gap is the
  // bubble's far edge measured from the row's edge, plus 10px.
  msgActionsBeside: { bottom: 'auto', top: '50%', transform: 'translateY(-50%)', flexDirection: 'column', gap: 6 },
  msgEditRow: { display: 'flex', gap: 6 },
  msgActionButton: { width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: 'var(--text-secondary)', padding: 0, borderRadius: 18, border: '1px solid var(--glass-border)', background: 'var(--surface-pop)', boxShadow: '0 6px 18px rgba(20,25,35,0.16)', WebkitBackdropFilter: 'blur(20px) saturate(170%)', backdropFilter: 'blur(20px) saturate(170%)', cursor: 'pointer' },
  editInput: {
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid rgba(30,40,60,0.2)',
    background: 'var(--surface)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
  },
  editSmallButton: { minHeight: 40, fontSize: 11, color: 'var(--text-primary)', padding: '2px 10px' },
  attachButton: {
    height: 42,
    width: 42,
    flexShrink: 0,
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--bg-inset)',
    color: 'var(--text-secondary)',
    fontSize: 18,
    lineHeight: '18px',
    padding: 0,
  },
  inputRow: { display: 'flex', gap: 8, padding: '12px 14px', borderTop: '1px solid var(--border)', alignItems: 'flex-end' },
  // The floating bar sits over the bottom of the page, so the composer needs
  // to clear it: the bar's height, its offset, and the home button that
  // pokes out above it.
  // No extra bottom clearance here: AppLayout's narrow content already
  // reserves room for the floating bar, and adding more stacked two gaps.
  inputRowNarrow: {},
  input: {
    flex: 1,
    padding: '11px 16px',
    borderRadius: 22,
    border: '1px solid rgba(var(--ink-rgb), 0.08)',
    background: 'rgba(var(--paper-rgb), 0.7)',
    color: 'var(--text-primary)',
    fontSize: 15,
    outline: 'none',
    fontFamily: 'inherit',
    resize: 'none',
    maxHeight: 160,
    minHeight: 42,
    overflowY: 'auto',
    lineHeight: 1.4,
    boxSizing: 'border-box',
  },
  sendButton: {
    padding: '0 22px',
    height: 42,
    flexShrink: 0,
    borderRadius: 999,
    background: 'var(--ink)',
    color: 'var(--ink-text)',
    fontWeight: 600,
    fontSize: 15,
    textTransform: 'none',
    letterSpacing: 0,
  },

  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(20,24,32,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { width: 'min(420px, calc(100vw - 32px))', background: 'var(--bg-elevated)', border: 'none', borderRadius: 24, padding: 22, maxHeight: '76vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' },
  modalTitle: { fontSize: 21, fontWeight: 700, textTransform: 'none', letterSpacing: -0.4, color: 'var(--text-primary)', margin: '0 0 12px' },
  input2: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'rgba(var(--ink-rgb), 0.04)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 12,
  },
  pickerList: { overflowY: 'auto', flex: 1 },
  personRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '9px 10px',
    borderRadius: 14,
    cursor: 'pointer',
  },
  personRowSelected: { background: 'rgba(10,126,164,0.07)' },
  personAvatar: { width: 34, height: 34, borderRadius: 17, background: 'rgba(var(--ink-rgb), 0.07)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 },
  personCheck: { width: 22, height: 22, borderRadius: 11, border: '1.5px solid var(--text-quaternary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#FFFFFF', flexShrink: 0 },
  personCheckOn: { background: 'var(--neon)', borderColor: 'var(--neon)' },
  cancelButton: { minHeight: 44, flex: 1, padding: '9px 0', borderRadius: 999, border: '1px solid rgba(var(--ink-rgb), 0.1)', background: 'rgba(var(--ink-rgb), 0.05)', color: 'var(--text-secondary)', fontSize: 15, fontWeight: 600 },
  createButton: { minHeight: 44, flex: 1, padding: '9px 0', borderRadius: 999, background: 'var(--ink)', color: 'var(--ink-text)', fontWeight: 600, fontSize: 15, textTransform: 'none' },
};
