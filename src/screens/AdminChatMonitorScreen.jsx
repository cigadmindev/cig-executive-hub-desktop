import React, { useRef, useState } from 'react';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import { nike } from '../theme/nike';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export default function AdminChatMonitorScreen() {
  const { allConversations, getMessagesForConversation, sendMessage } = useChat();
  const { user } = useAuth();
  const [activeId, setActiveId] = useState(null);
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  if (user?.role !== 'admin') {
    return (
      <div style={styles.page}>
        <p style={{ color: 'var(--text-secondary)' }}>Admins only.</p>
      </div>
    );
  }

  const activeConvo = allConversations.find((c) => c.id === activeId);
  const isMember = !!user && !!activeConvo && activeConvo.memberUids.includes(user.uid);
  const activeMessages = activeId ? getMessagesForConversation(activeId) : [];

  const autoGrow = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleSend = () => {
    if (!text.trim() || !activeId || !isMember) return;
    sendMessage(activeId, text.trim());
    setText('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  return (
    <div style={styles.page}>
      <div style={styles.list}>
        <div style={{ ...styles.listHeader, ...nike.pageTitleSm, fontSize: 20 }}>Monitor All Chats</div>
        <p style={styles.note}>Every conversation in the app — for oversight only.</p>
        <div style={styles.listScroll}>
          {allConversations.length === 0 ? (
            <p style={styles.empty}>No conversations yet.</p>
          ) : (
            allConversations.map((c) => (
              <div
                key={c.id}
                style={{ ...styles.convoRow, ...(activeId === c.id ? styles.convoRowActive : {}) }}
                onClick={() => setActiveId(c.id)}
              >
                <span style={styles.convoName}>
                  {c.type === 'group' ? '👥 ' : '💬 '}
                  {c.name}
                </span>
                <span style={styles.convoMembers}>{c.memberNames.join(', ')}</span>
                <span style={styles.convoPreview}>{c.lastMessageText || 'No messages yet'}</span>
                <span style={styles.convoTime}>{formatTime(c.lastMessageTimestamp)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={styles.thread}>
        {!activeConvo ? (
          <div style={styles.threadEmpty}>Select a conversation</div>
        ) : (
          <>
            <div style={styles.threadHeader}>{activeConvo.name}</div>
            <p style={styles.disclaimer}>{isMember ? "Messages here aren't private." : "You're viewing this as oversight — you're not a participant."}</p>
            <div style={styles.threadScroll}>
              {activeMessages.map((m) => {
                const isMe = m.senderUid === user?.uid;
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                    <div style={{ ...styles.bubble, ...(isMe ? styles.bubbleMe : styles.bubbleOther) }}>
                      {!isMe ? <div style={styles.senderName}>{m.senderName}</div> : null}
                      <div>{m.text}</div>
                      <div style={styles.msgTime}>
                        {formatTime(m.timestamp)}
                        {m.edited ? ' · edited' : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {isMember ? (
              <div style={styles.inputRow}>
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
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { display: 'flex', height: '100%' },
  list: { width: 300, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' },
  listHeader: { padding: '16px 16px 2px', fontSize: 16, fontWeight: 700 },
  note: { padding: '0 16px 10px', fontSize: 11, color: 'var(--text-secondary)' },
  listScroll: { flex: 1, overflowY: 'auto', padding: '0 8px' },
  empty: { padding: 16, fontSize: 13, color: 'var(--text-secondary)' },
  convoRow: { display: 'flex', flexDirection: 'column', padding: '10px 8px', borderRadius: 8, marginBottom: 2, cursor: 'pointer' },
  convoRowActive: { background: 'var(--accent-soft)', borderLeft: '3px solid var(--neon)' },
  convoName: { fontSize: 13, fontWeight: 700 },
  convoMembers: { fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 },
  convoPreview: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 },
  convoTime: { fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 },
  thread: { flex: 1, display: 'flex', flexDirection: 'column' },
  threadEmpty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 14 },
  threadHeader: { padding: '16px 20px 4px', fontSize: 16, fontWeight: 700 },
  disclaimer: { padding: '0 20px 10px', fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' },
  threadScroll: { flex: 1, overflowY: 'auto', padding: '0 20px' },
  bubble: { maxWidth: '60%', borderRadius: 12, padding: '10px 12px', fontSize: 13 },
  bubbleMe: { background: 'var(--accent)', color: '#FFFFFF' },
  bubbleOther: { background: 'var(--bg-card)', color: 'var(--text-primary)' },
  senderName: { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 2 },
  msgTime: { fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: 'right' },
  inputRow: { display: 'flex', gap: 8, padding: 16, borderTop: '1px solid var(--border)', alignItems: 'flex-end' },
  input: {
    flex: 1,
    padding: '9px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
    resize: 'none',
    maxHeight: 160,
    overflowY: 'auto',
    lineHeight: 1.4,
  },
  sendButton: { padding: '0 18px', borderRadius: 12, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },
};
