import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWorkOrders } from '../context/WorkOrdersContext';
import SignaturePad from '../components/SignaturePad';
import { useDialog } from '../hooks/useDialog';
import { nike } from '../theme/nike';

function formatDateTime(ts) {
  const d = new Date(ts);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export default function WorkOrdersScreen() {
  const { dialogNode, confirm } = useDialog();
  const { user, activeUsers: users } = useAuth();
  const { getMyQueue, getSentByMe, createWorkOrder, signWorkOrder, retryPdfGeneration, deleteStoredFiles } = useWorkOrders();
  const [tab, setTab] = useState('queue');
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const [file, setFile] = useState(null);
  const fileRef = useRef(null);
  const [creating, setCreating] = useState(false);
  const [assignedUids, setAssignedUids] = useState([]);
  const [signingOrder, setSigningOrder] = useState(null);
  const [signatureImage, setSignatureImage] = useState(null);
  const [successPopup, setSuccessPopup] = useState(null); // string message, or null

  const myQueue = getMyQueue();
  const sentByMe = getSentByMe();

  const toggleAssignee = (uid) => {
    setAssignedUids((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  };

  const resetCreateForm = () => {
    setTitle('');
    setDescription('');
    setDocumentUrl('');
    setFile(null);
    setAssignedUids([]);
  };

  const handleCreate = async () => {
    if (!title.trim() || assignedUids.length === 0) return;
    setCreating(true);
    try {
      await createWorkOrder({
        title: title.trim(),
        description: description.trim(),
        documentUrl: documentUrl.trim(),
        file,
        assignedUids,
      });
      resetCreateForm();
      setCreateOpen(false);
      setSuccessPopup(`Sent to ${assignedUids.length} ${assignedUids.length === 1 ? 'person' : 'people'} for signature.`);
    } finally {
      setCreating(false);
    }
  };

  const confirmSign = async () => {
    await signWorkOrder(signingOrder.id, signatureImage);
    setSigningOrder(null);
    setSignatureImage(null);
    setSuccessPopup('Your signature has been recorded and sent.');
  };

  const handleRetry = async (order) => {
    await retryPdfGeneration(order);
  };

  const handleDeleteFiles = async (order) => {
    confirm({
      title: 'Delete the stored files?',
      body: 'The signature record — who signed and when — stays. This only removes the PDF files from storage.',
      confirmLabel: 'Delete files',
      tone: 'danger',
      onConfirm: async () => {
        await deleteStoredFiles(order);
        setSuccessPopup('Files removed from storage.');
      },
    });
  };

  const nameFor = (uid) => users.find((u) => u.uid === uid)?.name ?? 'Unknown';

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Signature Directory</h1>
        <button style={styles.newButton} onClick={() => setCreateOpen(true)}>
          + New Work Order
        </button>
      </div>

      <div style={styles.tabRow}>
        <button style={{ ...styles.tab, ...(tab === 'queue' ? styles.tabActive : {}) }} onClick={() => setTab('queue')}>
          My Queue {myQueue.length > 0 ? `(${myQueue.length})` : ''}
        </button>
        <button style={{ ...styles.tab, ...(tab === 'sent' ? styles.tabActive : {}) }} onClick={() => setTab('sent')}>
          Sent by Me
        </button>
      </div>

      {tab === 'queue' ? (
        <div>
          {myQueue.length === 0 ? (
            <p style={styles.hint}>Nothing waiting on your signature.</p>
          ) : (
            myQueue.map((o) => (
              <div key={o.id} style={styles.card}>
                <div style={styles.cardHeaderRow}>
                  <span style={styles.cardTitle}>{o.title}</span>
                  <span style={styles.cardMeta}>from {o.uploadedByName}</span>
                </div>
                {o.description ? <p style={styles.cardDescription}>{o.description}</p> : null}
                {o.originalFileUrl ? (
                  <a href={o.originalFileUrl} target="_blank" rel="noreferrer" style={styles.docLink}>
                    View document{o.originalFileName ? ` — ${o.originalFileName}` : ''}
                  </a>
                ) : o.documentUrl ? (
                  <a href={o.documentUrl} target="_blank" rel="noreferrer" style={styles.docLink}>
                    View document
                  </a>
                ) : null}
                <p style={styles.progressNote}>
                  {o.signatures.length} of {o.assignedUids.length} signed
                </p>
                <button style={styles.signButton} onClick={() => setSigningOrder(o)}>
                  Sign
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        <div>
          {sentByMe.length === 0 ? (
            <p style={styles.hint}>You haven't sent any work orders yet.</p>
          ) : (
            sentByMe.map((o) => (
              <div key={o.id} style={styles.card}>
                <div style={styles.cardHeaderRow}>
                  <span style={styles.cardTitle}>{o.title}</span>
                  <span style={{ ...styles.statusBadge, background: o.status === 'completed' ? 'var(--success)' : '#C9A227' }}>
                    {o.status === 'completed' ? '✓ Completed' : 'Pending'}
                  </span>
                </div>
                {o.description ? <p style={styles.cardDescription}>{o.description}</p> : null}
                {o.status === 'completed' && o.filesDeleted ? (
                  <p style={styles.hint}>Signed document files were removed from storage after download.</p>
                ) : o.status === 'completed' && o.signedFileUrl ? (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                    <a href={o.signedFileUrl} target="_blank" rel="noreferrer" style={styles.downloadButton}>
                      Download Signed Document
                    </a>
                    <button style={styles.deleteFilesButton} onClick={() => handleDeleteFiles(o)}>
                      Delete files from storage
                    </button>
                  </div>
                ) : o.status === 'completed' && o.signedPdfError ? (
                  <div style={styles.errorBlock}>
                    <p style={styles.errorText}>Couldn't put the final document together — {o.signedPdfError}</p>
                    <button style={styles.retryButton} onClick={() => handleRetry(o)}>
                      Retry
                    </button>
                  </div>
                ) : o.status === 'completed' && o.originalFileUrl ? (
                  <div style={styles.errorBlock}>
                    <p style={styles.hint}>Everyone's signed — putting the final document together… If this seems stuck, retry.</p>
                    <button style={styles.retryButton} onClick={() => handleRetry(o)}>
                      Retry
                    </button>
                  </div>
                ) : o.status === 'completed' && o.documentUrl ? (
                  <p style={styles.hint}>
                    All signatures recorded. This order used a Drive link rather than an uploaded PDF, so there's no
                    generated signed file — the signature record lives here.
                  </p>
                ) : null}
                <div style={styles.signaturesBlock}>
                  {o.assignedUids.map((uid) => {
                    const sig = o.signatures.find((s) => s.uid === uid);
                    return (
                      <div key={uid} style={styles.signatureRow}>
                        <p style={styles.signatureLine}>
                          {sig ? '✓' : '○'} {nameFor(uid)}
                          {sig ? <span style={styles.signedNote}> — signed {formatDateTime(sig.signedAt)}</span> : null}
                        </p>
                        {sig?.signatureImageDataUrl ? (
                          <img src={sig.signatureImageDataUrl} alt={`${nameFor(uid)}'s signature`} style={styles.signatureImage} />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {createOpen ? (
        <div style={styles.modalBackdrop} onClick={() => setCreateOpen(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>New Work Order</h2>
            <p style={styles.modalSub}>Send a document out for signature</p>

            <label style={styles.label}>Title</label>
            <input
              style={styles.input}
              placeholder="What needs signing?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />

            <label style={styles.label}>Description</label>
            <textarea
              style={{ ...styles.input, minHeight: 70 }}
              placeholder="Context for whoever signs it"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <label style={styles.label}>Document</label>
            {/* The native file input is browser chrome, not ours — and once a
                file is picked it says nothing useful about what was picked. */}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div style={styles.fileRow}>
                <span style={styles.fileBadge}>PDF</span>
                <span style={styles.fileName}>{file.name}</span>
                <button style={styles.fileRemove} onClick={() => setFile(null)}>
                  ×
                </button>
              </div>
            ) : (
              <button style={styles.attachButton} onClick={() => fileRef.current?.click()}>
                + Attach a PDF
              </button>
            )}
            <p style={styles.orNote}>or paste a Drive link instead</p>
            <input
              style={styles.input}
              value={documentUrl}
              onChange={(e) => setDocumentUrl(e.target.value)}
              placeholder="Paste a link…"
            />

            <div style={styles.divider} />

            <label style={styles.label}>Signatures needed</label>
            <p style={styles.modalSub}>Each person signs independently</p>
            <select
              style={styles.input}
              value=""
              onChange={(e) => {
                if (e.target.value) toggleAssignee(e.target.value);
              }}
            >
              <option value="">Add a signer…</option>
              {users
                .filter((u) => u.uid !== user?.uid && u.active !== false && !assignedUids.includes(u.uid))
                .map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.name}
                    {u.job ? ` — ${u.job}` : ''}
                  </option>
                ))}
            </select>

            {assignedUids.length > 0 ? (
              <div style={styles.signerList}>
                {assignedUids.map((uid) => {
                  const u = users.find((x) => x.uid === uid);
                  if (!u) return null;
                  return (
                    <div key={uid} data-row="" style={styles.signerRow}>
                      <span style={styles.signerAvatar}>{(u.name || '?').slice(0, 2).toUpperCase()}</span>
                      <span style={styles.signerName}>{u.name}</span>
                      <span style={styles.signerMeta}>{u.job || u.role}</span>
                      <button data-hover-only="" style={styles.fileRemove} onClick={() => toggleAssignee(uid)}>
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <div style={styles.modalButtonsRow}>
              <button
                style={styles.cancelButton}
                onClick={() => {
                  resetCreateForm();
                  setCreateOpen(false);
                }}
              >
                Cancel
              </button>
              <button style={styles.saveButton} onClick={handleCreate} disabled={!title.trim() || assignedUids.length === 0 || creating}>
                {creating ? 'Uploading…' : 'Send for Signature'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {signingOrder ? (
        <div style={styles.modalBackdrop} onClick={() => { setSigningOrder(null); setSignatureImage(null); }}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Confirm Signature</h2>
            <p style={styles.confirmBody}>
              You're signing off on <strong>{signingOrder.title}</strong> as <strong>{user?.name}</strong>. Draw
              your signature below — this records it along with your name and the current time, visible to
              everyone on this work order.
            </p>
            <p style={styles.testNote}>
              {signingOrder.originalFileUrl
                ? "Once everyone assigned has signed, a final signed PDF is generated automatically with every signature on a dedicated signature page — the person who sent this will get a download link."
                : 'This one used a link instead of an uploaded file, so signatures are recorded here in the app, but there\'s no document to merge them into.'}
            </p>
            <SignaturePad onChange={setSignatureImage} />
            <div style={styles.modalButtonsRow}>
              <button style={styles.cancelButton} onClick={() => { setSigningOrder(null); setSignatureImage(null); }}>
                Cancel
              </button>
              <button style={styles.saveButton} onClick={confirmSign} disabled={!signatureImage}>
                Confirm Signature
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {successPopup ? (
        <div style={styles.modalBackdrop} onClick={() => setSuccessPopup(null)}>
          <div style={styles.successCard} onClick={(e) => e.stopPropagation()}>
            <p style={styles.successIcon}>✓</p>
            <p style={styles.successText}>{successPopup}</p>
            <button style={styles.successButton} onClick={() => setSuccessPopup(null)}>
              Got it
            </button>
          </div>
        </div>
      ) : null}
      {dialogNode}
    </div>
  );
}

const styles = {
  modalSub: { fontSize: 11, color: 'var(--text-tertiary)', margin: '-2px 0 14px' },
  divider: { height: 1, background: 'var(--border)', margin: '18px 0 14px' },
  attachButton: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 9,
    border: '1px dashed var(--border-strong)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 600,
  },
  fileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'var(--bg-inset)',
    border: '1px solid var(--border)',
    borderRadius: 9,
    padding: '10px 12px',
  },
  fileBadge: {
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: 7,
    border: '1px solid var(--border-strong)',
    color: 'var(--text-tertiary)',
    fontSize: 9,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: { flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  fileRemove: {
    width: 20,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    border: 'none',
    background: 'none',
    color: 'var(--text-tertiary)',
    fontSize: 16,
    padding: 0,
  },
  orNote: { fontSize: 11, color: 'var(--text-tertiary)', margin: '8px 0 6px' },
  signerList: { background: 'var(--bg-inset)', borderRadius: 9, overflow: 'hidden', marginTop: 10 },
  signerRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid var(--border)' },
  signerAvatar: {
    width: 26,
    height: 26,
    flexShrink: 0,
    borderRadius: 7,
    background: 'rgba(34,211,238,0.14)',
    color: 'var(--neon)',
    fontSize: 10,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signerName: { flex: 1, fontSize: 13, color: 'var(--text-primary)' },
  signerMeta: { fontSize: 11, color: 'var(--text-tertiary)' },

  page: { padding: '28px 36px', maxWidth: 680 },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  newButton: { padding: '8px 16px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' },
  tabRow: { display: 'flex', gap: 8, marginBottom: 20 },
  tab: { padding: '7px 14px', borderRadius: 20, border: 'none', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' },
  tabActive: { background: 'var(--neon)', color: 'var(--neon-text)' },
  hint: { color: 'var(--text-secondary)', fontSize: 13 },
  card: { background: 'var(--bg-card)', border: 'none', borderRadius: 10, padding: 16, marginBottom: 12 },
  cardHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: 700 },
  cardMeta: { fontSize: 11, color: 'var(--text-tertiary)' },
  cardDescription: { fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0', lineHeight: 1.5 },
  docLink: { fontSize: 12, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', display: 'block', marginBottom: 8 },
  downloadButton: {
    display: 'inline-block',
    fontSize: 12,
    fontWeight: 700,
    color: '#FFFFFF',
    background: 'var(--success)',
    padding: '8px 14px',
    borderRadius: 'var(--radius-sm)',
    textDecoration: 'none',
  },
  deleteFilesButton: { fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 },
  errorBlock: { background: 'rgba(232,82,75,0.1)', border: '1px solid rgba(232,82,75,0.35)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 10 },
  errorText: { fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5, margin: '0 0 8px' },
  retryButton: { padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600 },
  fileInput: { width: '100%', fontSize: 12, color: 'var(--text-primary)' },
  fileSelectedNote: { fontSize: 11, color: 'var(--success)', margin: '6px 0 0' },
  progressNote: { fontSize: 11, color: 'var(--text-tertiary)', margin: '4px 0 10px' },
  signButton: { padding: '9px 18px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },
  statusBadge: { fontSize: 10, fontWeight: 700, color: '#FFFFFF', borderRadius: 6, padding: '3px 8px' },
  signaturesBlock: { marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' },
  signatureLine: { fontSize: 12, color: 'var(--text-primary)', margin: '3px 0' },
  signatureRow: { marginBottom: 6 },
  signatureImage: { height: 32, marginLeft: 20, opacity: 0.9 },
  signedNote: { color: 'var(--text-tertiary)', fontWeight: 400 },

  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { width: 420, maxHeight: '82vh', overflowY: 'auto', background: 'var(--bg-elevated)', border: 'none', borderRadius: 18, padding: 24, boxShadow: 'var(--shadow-lg)' },
  modalTitle: { fontSize: 19, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.2, color: '#FFFFFF', margin: '0 0 12px' },
  confirmBody: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 12 },
  testNote: { fontSize: 11, color: 'var(--accent)', lineHeight: 1.5, marginBottom: 14, fontStyle: 'italic' },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, marginTop: 12 },
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
  },
  chipWrap: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { padding: '6px 12px', borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg-inset)', color: 'var(--text-secondary)', fontSize: 12 },
  chipActive: { background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, borderColor: 'var(--neon)' },
  modalButtonsRow: { display: 'flex', gap: 10, marginTop: 20 },
  cancelButton: { flex: 1, padding: '10px 0', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 13 },
  saveButton: { flex: 1, padding: '10px 0', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },
  successCard: { width: 320, background: 'var(--bg-card)', border: '1px solid var(--success)', borderRadius: 'var(--radius-lg)', padding: 24, boxShadow: 'var(--shadow-lg)', textAlign: 'center' },
  successIcon: { fontSize: 30, color: 'var(--success)', margin: '0 0 8px' },
  successText: { fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, margin: '0 0 18px' },
  successButton: { width: '100%', padding: '10px 0', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' },
};
