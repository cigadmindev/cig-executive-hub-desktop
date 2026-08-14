import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSupportRequests, SUPPORT_AREAS, SUPPORT_ERROR_TYPES, BRENNER_EMAIL } from '../context/SupportRequestsContext';
import { useSupportAnnouncements } from '../context/SupportAnnouncementsContext';
import { nike } from '../theme/nike';

function formatDateTime(ts) {
  const d = new Date(ts);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

// Live urgency coloring — green for plenty of time left, ramping to red as
// the 48-hour window closes in. Once completed, urgency no longer applies.
function getUrgency(timestamp, status, now) {
  if (status === 'completed') return { label: 'Completed', color: 'var(--success)', hoursRemaining: null };
  const hoursRemaining = 48 - (now - timestamp) / (1000 * 60 * 60);
  if (hoursRemaining > 24) return { label: `${Math.ceil(hoursRemaining)}h left`, color: 'var(--success)', hoursRemaining };
  if (hoursRemaining > 12) return { label: `${Math.ceil(hoursRemaining)}h left`, color: '#C9A227', hoursRemaining };
  if (hoursRemaining > 8) return { label: `${Math.ceil(hoursRemaining)}h left`, color: '#D9822B', hoursRemaining };
  if (hoursRemaining > 0) return { label: `${Math.ceil(hoursRemaining)}h left`, color: 'var(--danger)', hoursRemaining };
  return { label: 'Overdue', color: 'var(--danger)', hoursRemaining };
}

export default function SupportScreen() {
  const { user } = useAuth();
  const isBrenner = user?.email === BRENNER_EMAIL;
  return isBrenner ? <BrennerSupportView /> : <RegularSupportView />;
}

// ---------- Regular users: submit a request, or view Brenner's updates ----------

function RegularSupportView() {
  const { submitRequest } = useSupportRequests();
  const { posts, toggleLike, addComment } = useSupportAnnouncements();
  const [tab, setTab] = useState('submit');
  const [area, setArea] = useState(SUPPORT_AREAS[0]);
  const [errorType, setErrorType] = useState(SUPPORT_ERROR_TYPES[0]);
  const [description, setDescription] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState({});

  const handleSubmit = async () => {
    if (!description.trim()) return;
    await submitRequest({ area, errorType, description: description.trim() });
    setDescription('');
    setConfirmOpen(true);
  };

  const handleAddComment = (postId) => {
    const text = (commentDrafts[postId] ?? '').trim();
    if (!text) return;
    addComment(postId, text);
    setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
  };

  return (
    <div style={styles.page}>
      <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Support</h1>
      <div style={styles.tabRow}>
        <button style={{ ...styles.tab, ...(tab === 'submit' ? styles.tabActive : {}) }} onClick={() => setTab('submit')}>
          Submit a Request
        </button>
        <button style={{ ...styles.tab, ...(tab === 'updates' ? styles.tabActive : {}) }} onClick={() => setTab('updates')}>
          Hub Software Updates
        </button>
      </div>

      {tab === 'submit' ? (
        <div style={styles.form}>
          <label style={styles.label}>What area is this about?</label>
          <select style={styles.input} value={area} onChange={(e) => setArea(e.target.value)}>
            {SUPPORT_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <label style={styles.label}>What kind of issue is it?</label>
          <select style={styles.input} value={errorType} onChange={(e) => setErrorType(e.target.value)}>
            {SUPPORT_ERROR_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <label style={styles.label}>Describe the problem or what you need</label>
          <textarea
            style={{ ...styles.input, minHeight: 120 }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Be as specific as you can — what were you doing, what happened, what did you expect instead?"
          />

          <button style={styles.submitButton} onClick={handleSubmit} disabled={!description.trim()}>
            Submit Request
          </button>
        </div>
      ) : (
        <div>
          {posts.length === 0 ? (
            <p style={styles.hint}>No updates yet.</p>
          ) : (
            posts.map((post) => (
              <div key={post.id} style={styles.postCard}>
                <div style={styles.postHeaderRow}>
                  <span style={styles.postAuthor}>{post.authorName}</span>
                  <span style={styles.postTime}>{formatDateTime(post.timestamp)}</span>
                </div>
                <p style={styles.postMessage}>{post.message}</p>
                <button
                  style={{ ...styles.likeButton, color: post.likedByMe ? 'var(--accent)' : 'var(--text-secondary)' }}
                  onClick={() => toggleLike(post.id)}
                >
                  👍 {post.likes > 0 ? post.likes : ''}
                </button>

                <div style={styles.commentsBlock}>
                  <p style={styles.commentsLabel}>Your private reply to Brenner</p>
                  {post.comments.map((c) => (
                    <p key={c.id} style={styles.myComment}>
                      {c.text}
                    </p>
                  ))}
                  <div style={styles.commentInputRow}>
                    <input
                      style={styles.commentInput}
                      placeholder="Reply privately…"
                      value={commentDrafts[post.id] ?? ''}
                      onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)}
                    />
                    <button style={styles.commentSendButton} onClick={() => handleAddComment(post.id)}>
                      Send
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {confirmOpen ? (
        <div style={styles.modalBackdrop} onClick={() => setConfirmOpen(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Request Sent</h2>
            <p style={styles.modalBody}>
              Your request has been sent and will be reviewed within 48 hours. Thank you!
            </p>
            <button style={styles.submitButton} onClick={() => setConfirmOpen(false)}>
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------- Brenner: review queue + post updates ----------

function BrennerSupportView() {
  const { requests, setStatus } = useSupportRequests();
  const { users } = useAuth();
  const { posts, postUpdate } = useSupportAnnouncements();
  const [tab, setTab] = useState('requests');
  const [now, setNow] = useState(Date.now());

  const [message, setMessage] = useState('');
  const [visibleToAll, setVisibleToAll] = useState(true);
  const [visibleToUids, setVisibleToUids] = useState([]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const sortedRequests = [...requests].sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (b.status === 'completed' && a.status !== 'completed') return -1;
    return a.timestamp - b.timestamp;
  });

  const toggleRecipient = (uid) => {
    setVisibleToUids((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  };

  const handlePost = async () => {
    if (!message.trim()) return;
    if (!visibleToAll && visibleToUids.length === 0) return;
    await postUpdate({ message: message.trim(), visibleToAll, visibleToUids });
    setMessage('');
    setVisibleToAll(true);
    setVisibleToUids([]);
  };

  return (
    <div style={styles.page}>
      <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Support</h1>
      <div style={styles.tabRow}>
        <button style={{ ...styles.tab, ...(tab === 'requests' ? styles.tabActive : {}) }} onClick={() => setTab('requests')}>
          Requests {requests.filter((r) => r.status !== 'completed').length > 0 ? `(${requests.filter((r) => r.status !== 'completed').length})` : ''}
        </button>
        <button style={{ ...styles.tab, ...(tab === 'post' ? styles.tabActive : {}) }} onClick={() => setTab('post')}>
          Post Update
        </button>
      </div>

      {tab === 'requests' ? (
        <div>
          {sortedRequests.length === 0 ? (
            <p style={styles.hint}>No requests yet.</p>
          ) : (
            sortedRequests.map((r) => {
              const urgency = getUrgency(r.timestamp, r.status, now);
              return (
                <div key={r.id} style={styles.requestCard}>
                  <div style={styles.requestHeaderRow}>
                    <span style={styles.requestSubmitter}>{r.submitterName}</span>
                    <span style={{ ...styles.urgencyBadge, background: urgency.color }}>{urgency.label}</span>
                  </div>
                  <p style={styles.requestMeta}>
                    {r.area} · {r.errorType} · {r.platform} · {formatDateTime(r.timestamp)}
                  </p>
                  <p style={styles.requestDescription}>{r.description}</p>
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    {r.status === 'new' ? (
                      <button style={styles.actionButton} onClick={() => setStatus(r.id, 'in_progress')}>
                        Mark In Progress
                      </button>
                    ) : null}
                    {r.status !== 'completed' ? (
                      <button style={styles.actionButton} onClick={() => setStatus(r.id, 'completed')}>
                        Mark Completed
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div>
          <div style={styles.form}>
            <label style={styles.label}>Message</label>
            <textarea
              style={{ ...styles.input, minHeight: 100 }}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What got fixed or changed?"
            />

            <label style={styles.label}>Who should see this?</label>
            <button
              style={{ ...styles.everyoneButton, ...(visibleToAll ? styles.everyoneButtonActive : {}) }}
              onClick={() => setVisibleToAll(true)}
            >
              Everyone
            </button>
            <div style={styles.chipWrap}>
              {users.map((u) => (
                <button
                  key={u.uid}
                  style={{
                    ...styles.chip,
                    ...(!visibleToAll && visibleToUids.includes(u.uid) ? styles.chipActive : {}),
                  }}
                  onClick={() => {
                    setVisibleToAll(false);
                    toggleRecipient(u.uid);
                  }}
                >
                  {u.name}
                </button>
              ))}
            </div>

            <button style={styles.submitButton} onClick={handlePost} disabled={!message.trim()}>
              Post Update
            </button>
          </div>

          <div style={{ marginTop: 24 }}>
            {posts.map((post) => (
              <div key={post.id} style={styles.postCard}>
                <div style={styles.postHeaderRow}>
                  <span style={styles.postAuthor}>
                    {post.visibleToAll ? 'Everyone' : `${post.visibleToUids.length} selected`}
                  </span>
                  <span style={styles.postTime}>{formatDateTime(post.timestamp)}</span>
                </div>
                <p style={styles.postMessage}>{post.message}</p>
                <p style={styles.likeCount}>👍 {post.likes}</p>
                {post.comments.length > 0 ? (
                  <div style={styles.commentsBlock}>
                    {post.comments.map((c) => (
                      <p key={c.id} style={styles.brennerComment}>
                        <strong>{c.authorName}:</strong> {c.text}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { padding: '28px 36px', maxWidth: 680 },
  title: { fontSize: 22, fontWeight: 700, margin: '0 0 16px' },
  tabRow: { display: 'flex', gap: 8, marginBottom: 20 },
  tab: { padding: '7px 14px', borderRadius: 20, border: 'none', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' },
  tabActive: { background: 'var(--neon)', color: 'var(--neon-text)' },
  hint: { color: 'var(--text-secondary)', fontSize: 13 },

  form: { background: 'var(--bg-card)', border: 'none', borderRadius: 12, padding: 18 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, marginTop: 12 },
  input: {
    width: '100%',
    padding: '9px 11px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  submitButton: { width: '100%', padding: '11px 0', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 14, marginTop: 16, textTransform: 'uppercase' },

  postCard: { background: 'var(--bg-card)', border: 'none', borderRadius: 12, padding: 16, marginBottom: 12 },
  postHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  postAuthor: { fontSize: 13, fontWeight: 700 },
  postTime: { fontSize: 11, color: 'var(--text-tertiary)' },
  postMessage: { fontSize: 13, margin: '8px 0', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  likeButton: { fontSize: 12, fontWeight: 600 },
  likeCount: { fontSize: 12, color: 'var(--text-secondary)' },
  commentsBlock: { marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' },
  commentsLabel: { fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 6 },
  myComment: { fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-inset)', borderRadius: 8, padding: '6px 10px', marginBottom: 6 },
  brennerComment: { fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 },
  commentInputRow: { display: 'flex', gap: 8, marginTop: 6 },
  commentInput: {
    flex: 1,
    padding: '7px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    fontSize: 12,
    outline: 'none',
  },
  commentSendButton: { padding: '0 14px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' },

  requestCard: { background: 'var(--bg-card)', border: 'none', borderRadius: 12, padding: 16, marginBottom: 12 },
  requestHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  requestSubmitter: { fontSize: 14, fontWeight: 700 },
  urgencyBadge: { fontSize: 10, fontWeight: 700, color: '#FFFFFF', borderRadius: 6, padding: '3px 8px' },
  requestMeta: { fontSize: 11, color: 'var(--accent)', fontWeight: 600, margin: '4px 0 0', textTransform: 'capitalize' },
  requestDescription: { fontSize: 13, margin: '8px 0 0', lineHeight: 1.5 },
  actionButton: { padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600 },

  everyoneButton: { padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-inset)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600 },
  everyoneButtonActive: { background: 'var(--neon)', color: 'var(--neon-text)', borderColor: 'var(--neon)' },
  chipWrap: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { padding: '6px 12px', borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg-inset)', color: 'var(--text-secondary)', fontSize: 12 },
  chipActive: { background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, borderColor: 'var(--neon)' },

  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { width: 380, background: 'var(--bg-card)', border: 'none', borderRadius: 18, padding: 24, boxShadow: 'var(--shadow-lg)', textAlign: 'center' },
  modalTitle: { fontSize: 19, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.2, color: '#FFFFFF', margin: '0 0 12px' },
  modalBody: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18, lineHeight: 1.6 },
};
