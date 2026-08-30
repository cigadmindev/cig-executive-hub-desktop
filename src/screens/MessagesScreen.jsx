import React, { useRef, useState } from 'react';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import MessageReactions, { ReactionPicker } from '../components/MessageReactions';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebaseConfig';
import ChatAttachment from '../components/ChatAttachment';
import { useDialog } from '../hooks/useDialog';
import { nike } from '../theme/nike';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Every sender in a group chat gets a consistent color derived from their
// uid, so at a glance you can tell who's who without reading every name —
// same person always lands on the same color, every time you open the app.
const SENDER_COLORS = ['#DFFF4F', '#4A90D9', '#E8524B', '#5FA377', '#D9822B', '#B48EEA', '#4FD1DF'];
function colorForSender(uid) {
  if (!uid) return SENDER_COLORS[0];
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  return SENDER_COLORS[hash % SENDER_COLORS.length];
}

export default function MessagesScreen() {
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
  const { user, users } = useAuth();
  const [activeId, setActiveId] = useState(null);
  const [text, setText] = useState('');
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editText, setEditText] = useState('');

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState('dm'); // 'dm' | 'group'
  const [selectedUids, setSelectedUids] = useState([]);
  const [groupName, setGroupName] = useState('');
  const { dialogNode, confirm, notify } = useDialog();
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

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
      const url = await getDownloadURL(fileRefStorage);
      await sendMessage(activeId, '', {
        url,
        path,
        name: file.name,
        contentType: file.type,
        size: file.size,
        viewedBy: [],
      });
    } catch (err) {
      notify('Upload failed', err?.message ?? 'Something went wrong sending that file.');
    } finally {
      setUploading(false);
    }
  };

  const otherUsers = users.filter((u) => u.uid !== user?.uid && u.active);
  const activeConvo = conversations.find((c) => c.id === activeId);
  const activeMessages = activeId ? getMessagesForConversation(activeId) : [];

  const openConversation = (id) => {
    setActiveId(id);
    markConversationRead(id);
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
    sendMessage(activeId, text.trim());
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
      onConfirm: () => {
        deleteConversation(id);
        if (activeId === id) setActiveId(null);
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

  return (
    <div style={styles.page}>
      <div style={styles.list}>
        <div style={{ ...styles.listHeader, ...nike.pageTitleSm, fontSize: 20 }}>Messages</div>

        <div style={styles.newButtonsRow}>
          <button style={{ ...styles.newButton, ...nike.primaryButton }} onClick={() => openPicker('dm')}>
            + New Message
          </button>
          {user?.role === 'admin' || user?.role === 'executive' ? (
            <button style={{ ...styles.newButton, ...nike.primaryButton }} onClick={() => openPicker('group')}>
              + New Group
            </button>
          ) : null}
        </div>

        <div style={styles.listScroll}>
          {conversations.length === 0 ? (
            <p style={styles.emptyList}>No conversations yet. Start one above.</p>
          ) : (
            conversations.map((c) => {
              const unread = getUnreadCountForConversation(c.id);
              return (
                <div
                  key={c.id}
                  data-row=""
                  style={{ ...styles.convoRow, ...(activeId === c.id ? styles.convoRowActive : {}) }}
                  onClick={() => openConversation(c.id)}
                >
                  {/* Initials rather than a glyph — you recognise a person by
                      their name, and every conversation looking identical
                      makes the list something to read rather than scan. */}
                  <div
                    style={{
                      ...styles.convoAvatar,
                      ...(c.type === 'group' ? styles.convoAvatarGroup : {}),
                      background: c.type === 'group' ? 'transparent' : `${colorForSender(c.id)}22`,
                      color: c.type === 'group' ? 'var(--text-secondary)' : colorForSender(c.id),
                    }}
                  >
                    {c.type === 'group' ? (c.memberUids?.length ?? '') : (c.name || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...styles.convoName, ...(unread > 0 ? styles.convoNameUnread : {}) }}>
                      {c.name}
                      {c.type === 'group' ? <span style={styles.groupTag}>GROUP</span> : null}
                    </div>
                    <div style={styles.convoPreview}>{c.lastMessageText || 'No messages yet'}</div>
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

      <div style={styles.thread}>
        {!activeConvo ? (
          <div style={styles.threadEmpty}>Select a conversation</div>
        ) : (
          <>
            <div style={styles.threadHeader}>{activeConvo.name}</div>
            <p style={styles.disclaimer}>Messages here aren't private — stored in our database, message with that in mind.</p>
            <div style={styles.threadScroll}>
              {activeMessages.map((m, index) => {
                const isMe = m.senderUid === user?.uid;
                const isEditing = editingMsgId === m.id;
                const isGroup = activeConvo.type === 'group';
                const prevMsg = activeMessages[index - 1];
                const showSenderInfo = !isMe && isGroup && (!prevMsg || prevMsg.senderUid !== m.senderUid);
                return (
                  <div
                    key={m.id}
                    style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 18, gap: 8, alignItems: 'flex-end' }}
                    onMouseEnter={() => setHoveredMsgId(m.id)}
                    onMouseLeave={() => setHoveredMsgId((prev) => (prev === m.id ? null : prev))}
                  >
                    {!isMe && isGroup ? (
                      <div
                        style={{
                          ...styles.groupAvatar,
                          background: colorForSender(m.senderUid),
                          visibility: showSenderInfo ? 'visible' : 'hidden',
                        }}
                      >
                        {(m.senderName || '?').charAt(0).toUpperCase()}
                      </div>
                    ) : null}
                    {hoveredMsgId === m.id && !isEditing ? (
                      <div style={{ ...styles.msgActions, order: isMe ? -1 : 1 }}>
                        <ReactionPicker onPick={(emoji) => toggleReaction(m.id, emoji, m.reactions ?? [])} />
                        {isMe ? (
                          <>
                            <button style={styles.msgActionButton} onClick={() => startEditMessage(m)} title="Edit">
                              ✎
                            </button>
                            <button style={styles.msgActionButton} onClick={() => handleDeleteMessage(m.id)} title="Delete">
                              ✕
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    {isEditing ? (
                      <div style={{ ...styles.bubble, ...styles.bubbleMe, maxWidth: '100%', width: 380, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                      <div data-bubble="" style={{ ...styles.bubble, ...(isMe ? styles.bubbleMe : styles.bubbleOther) }}>
                        {showSenderInfo ? (
                          <div style={{ ...styles.senderName, color: colorForSender(m.senderUid) }}>{m.senderName}</div>
                        ) : null}

                        {m.text ? <div>{m.text}</div> : null}
                        {m.attachment ? (
                          <ChatAttachment
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
                          onToggle={(emoji) => toggleReaction(m.id, emoji, m.reactions ?? [])}
                          pillsOnly
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={styles.inputRow}>
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
                style={styles.input}
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
        <div style={styles.modalBackdrop} onClick={closePicker}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{pickerMode === 'dm' ? 'New Message' : 'New Group'}</h2>

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
                    <span>{u.name}</span>
                    {pickerMode === 'group' ? <span style={styles.personCheck}>{selected ? '✓' : ''}</span> : null}
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
                  Create Group
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {dialogNode}
    </div>
  );
}

const styles = {
  page: { display: 'flex', height: '100%' },
  list: { width: 300, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' },
  listHeader: { padding: '16px 16px 10px', fontSize: 16, fontWeight: 700 },
  newButtonsRow: { display: 'flex', gap: 8, padding: '0 12px 10px' },
  newButton: {
    flex: 1,
    padding: '8px 0',
    borderRadius: 8,
    background: 'var(--accent)',
    color: '#FFFFFF',
    fontWeight: 600,
    fontSize: 12,
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
  listScroll: { flex: 1, overflowY: 'auto', padding: '0 8px' },
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
  convoRowActive: { background: 'rgba(255,255,255,0.09)' },
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
  thread: { flex: 1, display: 'flex', flexDirection: 'column' },
  threadEmpty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 14 },
  threadHeader: { padding: '16px 20px 4px', fontSize: 16, fontWeight: 700 },
  disclaimer: { padding: '0 20px 10px', fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' },
  // Top padding leaves room for a reaction pill on the first message — it
  // overlaps the bubble's top corner, so a flush start clips it.
  threadScroll: { flex: 1, overflowY: 'auto', padding: '18px 20px 0' },
  // Squared with a hairline border, matching every other surface in the app.
  // The old solid --accent fill read as a different material from the cards
  // around it, and rounded tails borrow a shape that isn't ours.
  bubble: {
    maxWidth: '68%',
    borderRadius: 10,
    padding: '11px 14px',
    fontSize: 14,
    lineHeight: 1.4,
    position: 'relative',
  },
  bubbleMe: {
    background: 'rgba(34, 211, 238, 0.14)',
    border: '1px solid rgba(34, 211, 238, 0.3)',
    color: 'var(--text-primary)',
  },
  bubbleOther: {
    background: 'rgba(255, 255, 255, 0.085)',
    border: '1px solid rgba(255, 255, 255, 0.13)',
    color: 'var(--text-primary)',
  },
  senderName: { fontSize: 11, fontWeight: 900, marginBottom: 2 },
  groupAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    color: 'var(--neon-text)',
    fontSize: 11,
    fontWeight: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  msgTime: { fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: 'right' },
  msgActions: { display: 'flex', alignItems: 'center', gap: 4 },
  msgActionButton: { fontSize: 11, color: 'var(--text-secondary)', padding: '4px 6px', borderRadius: 4 },
  editInput: {
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid rgba(0,0,0,0.2)',
    background: 'rgba(255,255,255,0.6)',
    color: '#FFFFFF',
    fontSize: 13,
    outline: 'none',
  },
  editSmallButton: { fontSize: 11, color: '#FFFFFF', padding: '2px 8px' },
  attachButton: {
    width: 36,
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
  inputRow: { display: 'flex', gap: 8, padding: 16, borderTop: '1px solid var(--border)', alignItems: 'center' },
  input: {
    flex: 1,
    padding: '11px 14px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    fontSize: 13,
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
    borderRadius: 10,
    background: 'var(--neon)',
    color: 'var(--neon-text)',
    fontWeight: 900,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { width: 360, background: 'var(--bg-elevated)', border: 'none', borderRadius: 18, padding: 22, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' },
  modalTitle: { fontSize: 19, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.2, color: '#FFFFFF', margin: '0 0 12px' },
  input2: {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 12,
  },
  pickerList: { overflowY: 'auto', flex: 1 },
  personRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 8px',
    borderBottom: '1px solid var(--border)',
    fontSize: 13,
    cursor: 'pointer',
  },
  personRowSelected: { background: 'var(--accent-soft)' },
  personCheck: { color: 'var(--accent)', fontWeight: 700 },
  cancelButton: { flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 13 },
  createButton: { flex: 1, padding: '9px 0', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },
};
