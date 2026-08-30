import React, { useState } from 'react';
import { useDialog } from '../hooks/useDialog';
import { useAuth } from '../context/AuthContext';
import Icon from './Icon';

function formatDateTime(ts) {
  const d = new Date(ts);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

export default function PostCard({ post, isNewest, onToggleLike, onAddComment, onToggleCommentLike, onDeletePost, onDeleteComment }) {
  const { dialogNode, confirm } = useDialog();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canDeletePost = isAdmin || post.authorUid === user?.uid;
  const [commentText, setCommentText] = useState('');
  const [showComments, setShowComments] = useState(false);

  const handleDeletePost = () => {
    confirm({
      title: 'Delete this post?',
      body: 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: () => onDeletePost?.(post.id),
    });
  };
  const handleDeleteComment = (commentId) => {
    confirm({
      title: 'Delete this comment?',
      body: 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: () => onDeleteComment?.(post.id, commentId),
    });
  };
  const handleAddComment = () => {
    if (!commentText.trim()) return;
    onAddComment(post.id, commentText.trim(), user?.name ?? 'Unknown');
    setCommentText('');
    setShowComments(true);
  };

  return (
    <div style={{ ...styles.card, opacity: isNewest ? 1 : 0.9 }}>
      <div style={styles.headerRow}>
        <div style={styles.avatar}>{initials(post.authorName)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={styles.author}>{post.authorName}</p>
          <p style={styles.time}>{formatDateTime(post.timestamp)}</p>
        </div>
        {canDeletePost ? (
          <button style={styles.deleteButton} onClick={handleDeletePost} title="Delete post">
            ✕
          </button>
        ) : null}
      </div>

      <p style={styles.message}>{post.message}</p>

      <div style={styles.actionsRow}>
        <button
          style={{ ...styles.actionPill, ...(post.likedByMe ? styles.actionPillActive : {}) }}
          onClick={() => onToggleLike(post.id)}
        >
          <Icon name="thumbsUp" size={14} filled={post.likedByMe} color={post.likedByMe ? 'var(--neon)' : '#96969C'} />
          <span>{post.likes > 0 ? post.likes : 'Like'}</span>
        </button>
        <button
          style={{ ...styles.actionPill, ...(showComments ? styles.actionPillOpen : {}) }}
          onClick={() => setShowComments((v) => !v)}
        >
          <span>{post.comments.length > 0 ? 'Comments' : 'Comment'}</span>
          {post.comments.length > 0 ? <span>{post.comments.length}</span> : null}
        </button>
      </div>

      {showComments ? (
        <div style={styles.commentsBlock}>
          {post.comments.length === 0 ? (
            <p style={styles.noComments}>No comments yet — be the first.</p>
          ) : (
            post.comments.map((c) => (
              <div key={c.id} style={styles.commentRow}>
                <div style={styles.commentAvatar}>{initials(c.authorName)}</div>
                <div style={styles.commentBubble}>
                  <p style={styles.commentAuthor}>{c.authorName}</p>
                  <p style={styles.commentText}>{c.text}</p>
                  <div style={styles.commentMetaRow}>
                    <button
                      style={{
                        ...styles.commentLike,
                        color: c.likedByMe ? 'var(--accent)' : 'var(--text-tertiary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                      onClick={() => onToggleCommentLike(post.id, c.id)}
                    >
                      <Icon name="thumbsUp" size={12} filled={c.likedByMe} color="currentColor" />
                      {c.likes > 0 ? c.likes : ''}
                    </button>
                    {isAdmin ? (
                      <button style={styles.commentDelete} onClick={() => handleDeleteComment(c.id)}>
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
          <div style={styles.commentInputRow}>
            <div style={styles.commentInputAvatar}>{initials(user?.name)}</div>
            <input
              style={styles.commentInput}
              placeholder="Write a comment…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
            />
            <button style={styles.commentSendButton} onClick={handleAddComment} disabled={!commentText.trim()}>
              Send
            </button>
          </div>
        </div>
      ) : null}
      {dialogNode}
    </div>
  );
}

const styles = {
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
  },
  headerRow: { display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    background: 'var(--accent)',
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
    flexShrink: 0,
  },
  author: { fontSize: 13, fontWeight: 700, margin: 0 },
  time: { fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0 0' },
  deleteButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    color: 'var(--text-tertiary)',
    fontSize: 12,
    flexShrink: 0,
  },
  message: { fontSize: 14, margin: '0 0 14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' },
  actionsRow: { display: 'flex', gap: 8 },
  actionPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 20,
    background: 'var(--bg-inset)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 600,
  },
  actionPillActive: { background: 'rgba(108,108,118,0.35)', borderColor: 'var(--accent)', color: 'var(--accent)' },
  actionPillOpen: { borderColor: 'var(--border-strong)', color: 'var(--text-primary)' },
  commentsBlock: { marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' },
  noComments: { fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic', margin: '0 0 12px' },
  commentRow: { display: 'flex', gap: 10, marginBottom: 12 },
  commentAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    background: 'var(--bg-inset)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  },
  commentBubble: {
    flex: 1,
    background: 'var(--bg-inset)',
    borderRadius: 12,
    padding: '8px 12px',
  },
  commentAuthor: { fontSize: 11, fontWeight: 700, margin: '0 0 2px' },
  commentText: { fontSize: 12, color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 },
  commentMetaRow: { display: 'flex', gap: 14, marginTop: 6 },
  commentLike: { fontSize: 10, fontWeight: 700 },
  commentDelete: { fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)' },
  commentInputRow: { display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 },
  commentInputAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    background: 'var(--bg-inset)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  },
  commentInput: {
    flex: 1,
    padding: '9px 12px',
    borderRadius: 18,
    border: '1px solid var(--border)',
    background: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    fontSize: 12,
    outline: 'none',
  },
  commentSendButton: {
    padding: '8px 16px',
    borderRadius: 18,
    background: 'var(--accent)',
    color: '#FFFFFF',
    fontWeight: 700,
    fontSize: 12,
    flexShrink: 0,
  },
};
