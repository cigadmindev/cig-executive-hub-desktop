import React, { useState } from 'react';
import { useAccessRequests } from '../context/AccessRequestsContext';
import { useAuth } from '../context/AuthContext';
import { brands, categories, marketAnalysisId, marketAnalysisLabel } from '../data/mockData';
import { nike } from '../theme/nike';

function formatDateTime(ts) {
  const d = new Date(ts);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function toggleInArray(arr, id) {
  return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
}

export default function PendingRequestsScreen() {
  const { requests, resolveRequest } = useAccessRequests();
  const { user, users, updatePermissions } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isExecutive = user?.role === 'executive';

  const [reviewingRequest, setReviewingRequest] = useState(null);
  const [brandIds, setBrandIds] = useState([]);
  const [categoryIds, setCategoryIds] = useState([]);

  if (!isAdmin && !isExecutive) {
    return (
      <div style={styles.page}>
        <p style={{ color: 'var(--text-secondary)' }}>Admins and executives only.</p>
      </div>
    );
  }

  const pending = requests.filter((r) => r.status === 'pending').sort((a, b) => b.timestamp - a.timestamp);

  const openReview = (req) => {
    const targetUser = users.find((u) => u.email === req.userEmail);
    const existing = targetUser?.permissions ?? { brandIds: [], categoryIds: [] };
    // Pre-check what they already have, plus whatever they just asked for —
    // admin can add or remove anything else before confirming.
    setBrandIds(
      req.type === 'brand' ? [...new Set([...existing.brandIds, req.targetId])] : [...existing.brandIds]
    );
    setCategoryIds(
      req.type === 'category' ? [...new Set([...existing.categoryIds, req.targetId])] : [...existing.categoryIds]
    );
    setReviewingRequest(req);
  };

  const closeReview = () => setReviewingRequest(null);

  const confirmApprove = async () => {
    const targetUser = users.find((u) => u.email === reviewingRequest.userEmail);
    if (targetUser) {
      await updatePermissions(targetUser.uid, { brandIds, categoryIds });
    }
    await resolveRequest(reviewingRequest.id, 'approved');
    closeReview();
  };

  const handleDeny = (req) => {
    resolveRequest(req.id, 'denied');
  };

  return (
    <div style={styles.page}>
      <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Pending Requests</h1>
      {pending.length === 0 ? (
        <p style={styles.empty}>No pending requests.</p>
      ) : (
        pending.map((item) => {
          const isOwnRequest = item.userEmail === user?.email;
          const canResolve = isAdmin || (isExecutive && !isOwnRequest);
          return (
          <div key={item.id} style={styles.card}>
            <p style={styles.name}>{item.userName}</p>
            <p style={styles.detail}>
              Requesting access to: <span style={styles.bold}>{item.targetLabel}</span>
            </p>
            {item.reason ? <p style={styles.reason}>"{item.reason}"</p> : null}
            <p style={styles.timestamp}>{formatDateTime(item.timestamp)}</p>
            {isExecutive && isOwnRequest ? (
              <p style={styles.reason}>This is your own request — another admin or executive needs to approve it.</p>
            ) : null}
            {canResolve ? (
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button style={styles.approveButton} onClick={() => openReview(item)}>
                  Review & Approve
                </button>
                <button style={styles.denyButton} onClick={() => handleDeny(item)}>
                  Deny
                </button>
              </div>
            ) : null}
          </div>
          );
        })
      )}

      {reviewingRequest ? (
        <div style={styles.modalBackdrop} onClick={closeReview}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Grant Access</h2>
            <p style={styles.modalBody}>
              Choose exactly what <strong style={{ color: 'var(--text-primary)' }}>{reviewingRequest.userName}</strong> should
              have access to. What they asked for is already checked — adjust as needed.
            </p>
            {reviewingRequest.reason ? (
              <p style={styles.modalReason}>Their reason: "{reviewingRequest.reason}"</p>
            ) : null}

            <p style={styles.permissionLabel}>Restaurants</p>
            <div style={styles.chipWrap}>
              {[...brands, { id: marketAnalysisId, name: marketAnalysisLabel }].map((b) => (
                <button
                  key={b.id}
                  style={{ ...styles.chip, ...(brandIds.includes(b.id) ? styles.chipActive : {}) }}
                  onClick={() => setBrandIds(toggleInArray(brandIds, b.id))}
                >
                  {b.name}
                </button>
              ))}
            </div>

            <p style={styles.permissionLabel}>Categories</p>
            <div style={styles.chipWrap}>
              {categories.map((c) => (
                <button
                  key={c.id}
                  style={{ ...styles.chip, ...(categoryIds.includes(c.id) ? styles.chipActive : {}) }}
                  onClick={() => setCategoryIds(toggleInArray(categoryIds, c.id))}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div style={styles.modalButtonsRow}>
              <button style={styles.cancelButton} onClick={closeReview}>
                Cancel
              </button>
              <button style={styles.confirmButton} onClick={confirmApprove}>
                Grant Access
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  page: { padding: '28px max(16px, min(36px, 4vw))', maxWidth: 640 },
  title: { fontSize: 22, fontWeight: 700, margin: '0 0 20px' },
  empty: { color: 'var(--text-secondary)', fontSize: 13 },
  card: { background: 'var(--bg-card)', border: 'none', borderRadius: 14, padding: 16, marginBottom: 12 },
  name: { fontSize: 15, fontWeight: 700, margin: 0 },
  detail: { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' },
  bold: { fontWeight: 700, color: 'var(--text-primary)' },
  reason: { fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', margin: '8px 0 0', lineHeight: 1.5 },
  timestamp: { fontSize: 11, color: 'var(--text-tertiary)', margin: '6px 0 0' },
  approveButton: { flex: 1, padding: '10px 0', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },
  denyButton: { flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: 'var(--bg-inset)', color: 'var(--text-primary)', fontWeight: 600, fontSize: 13 },

  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: {
    width: 'min(460px, calc(100vw - 32px))',
    maxHeight: '82vh',
    overflowY: 'auto',
    background: 'var(--bg-elevated)',
    border: 'none',
    borderRadius: 16,
    padding: 24,
    boxShadow: 'var(--shadow-lg)',
  },
  modalTitle: { fontSize: 19, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.2, color: '#FFFFFF', margin: '0 0 12px' },
  modalBody: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 8px' },
  modalReason: { fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', margin: '0 0 14px', lineHeight: 1.5 },
  permissionLabel: { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '14px 0 8px' },
  chipWrap: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { padding: '6px 12px', borderRadius: 20, border: 'none', background: 'var(--bg-inset)', color: 'var(--text-primary)', fontSize: 12 },
  chipActive: { background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, borderColor: 'var(--neon)' },
  modalButtonsRow: { display: 'flex', gap: 10, marginTop: 22 },
  cancelButton: { flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: 'var(--bg-inset)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700 },
  confirmButton: { flex: 1, padding: '10px 0', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },
};
