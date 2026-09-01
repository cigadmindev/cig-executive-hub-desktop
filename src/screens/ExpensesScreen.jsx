import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  useExpenses,
  EXPENSE_CATEGORIES,
  formatAmount,
  parseAmount,
  centralDateKey,
  prettyDate,
  timeLeft,
} from '../context/ExpensesContext';
import { nike } from '../theme/nike';
import { useDialog } from '../hooks/useDialog';

export default function ExpensesScreen() {
  const { dialogNode, confirm, notify } = useDialog();
  const { user } = useAuth();
  const { receipts, seesAll, loading, submitReceipt, getImageUrls, voidReceipt, isEditable } =
    useExpenses();

  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [amount, setAmount] = useState('');
  const [categoryKey, setCategoryKey] = useState(null);
  const [where, setWhere] = useState('');
  const [reason, setReason] = useState('');
  const [dateSpent, setDateSpent] = useState(() => centralDateKey(new Date()));

  const [urls, setUrls] = useState({});
  const [viewing, setViewing] = useState(null);

  // Drives the countdown. One second would be needlessly busy for something
  // measured in hours.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Signed URLs expire, so they are fetched for what is on screen rather than
  // stored. Batched into one call.
  const idKey = receipts.map((r) => r.id).join(',');
  useEffect(() => {
    const ids = receipts.filter((r) => !r.imageDeletedAt).map((r) => r.id);
    if (ids.length === 0) return undefined;
    let cancelled = false;
    getImageUrls(ids)
      .then((map) => {
        if (!cancelled) setUrls(map);
      })
      .catch(() => {
        // A failed URL fetch should not blank the list — the details are the
        // useful part and they are already here.
      });
    return () => {
      cancelled = true;
    };
  }, [idKey]);

  // Revoke the object URL when the chosen file changes, or the browser holds
  // the old one in memory for the life of the page.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const resetForm = () => {
    setFile(null);
    setAmount('');
    setCategoryKey(null);
    setWhere('');
    setReason('');
    setDateSpent(centralDateKey(new Date()));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const cents = parseAmount(amount);
  const canSubmit =
    file !== null &&
    cents !== null &&
    categoryKey !== null &&
    where.trim().length >= 2 &&
    reason.trim().length >= 2;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await submitReceipt({
        file,
        amountCents: cents,
        categoryKey,
        where: where.trim(),
        reason: reason.trim(),
        dateSpent,
      });
      setFormOpen(false);
      resetForm();
      notify('Receipt submitted', 'Finance will see it in the morning report.');
    } catch (err) {
      notify('Could not submit', err?.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const handleVoid = (r) => {
    confirm({
      title: `Void this $${formatAmount(r.amountCents)} receipt?`,
      body:
        'It stops counting toward totals and greys out in the list, but the record stays — a report that already included it still matches what is here.',
      confirmLabel: 'Void',
      onConfirm: async () => {
        try {
          await voidReceipt(r.id, 'Voided by admin');
        } catch (err) {
          notify('Could not void', err?.message ?? 'Something went wrong.');
        }
      },
    });
  };

  // Grouped by the day the money was spent, not the day it was uploaded — a
  // receipt entered on Wednesday for Monday belongs under Monday.
  const grouped = useMemo(() => {
    const byDate = {};
    for (const r of receipts) {
      (byDate[r.dateSpent] = byDate[r.dateSpent] || []).push(r);
    }
    return Object.keys(byDate)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => ({
        key,
        items: byDate[key],
        // Voided receipts are shown but never counted.
        total: byDate[key].reduce((sum, r) => sum + (r.voided ? 0 : r.amountCents), 0),
      }));
  }, [receipts]);

  const isAdmin = user?.role === 'admin';
  const today = centralDateKey(new Date());

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Expenses</h1>
        <button style={styles.addButton} onClick={() => setFormOpen(true)}>
          + Add Receipt
        </button>
      </div>
      <p style={styles.subtitle}>
        {seesAll
          ? 'Every submitted receipt, grouped by the day it was spent.'
          : 'Your receipts, grouped by the day you spent the money.'}
      </p>

      {loading ? (
        <p style={styles.hint}>Loading…</p>
      ) : grouped.length === 0 ? (
        <p style={styles.hint}>No receipts yet.</p>
      ) : (
        grouped.map((group) => (
          <div key={group.key} style={styles.group}>
            <div style={styles.groupHeader}>
              <span style={styles.groupDate}>{prettyDate(group.key)}</span>
              <span style={styles.groupTotal}>${formatAmount(group.total)}</span>
            </div>

            {group.items.map((r) => {
              const left = isEditable(r) ? timeLeft(r.editableUntil, now) : null;
              return (
                <div key={r.id} style={{ ...styles.card, ...(r.voided ? styles.cardVoided : {}) }}>
                  <div
                    style={styles.cardMain}
                    data-row=""
                    onClick={() => setViewing(r)}
                    role="button"
                  >
                    {urls[r.id] ? (
                      <img src={urls[r.id]} alt="" style={styles.thumb} />
                    ) : (
                      <div style={{ ...styles.thumb, ...styles.thumbEmpty }}>
                        {r.imageDeletedAt ? 'Aged out' : '—'}
                      </div>
                    )}
                    <div style={styles.cardText}>
                      <div style={styles.cardAmount}>
                        ${formatAmount(r.amountCents)}
                        {r.voided ? '  · VOID' : ''}
                      </div>
                      <div style={styles.cardMeta}>
                        {r.categoryLabel} · {r.where}
                      </div>
                      <div style={styles.cardReason}>{r.reason}</div>
                      {seesAll ? <div style={styles.cardWho}>{r.submittedByName}</div> : null}
                      {left ? <div style={styles.cardCountdown}>{left}</div> : null}
                    </div>
                    {isAdmin && !r.voided ? (
                      <button
                        style={styles.voidButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleVoid(r);
                        }}
                      >
                        Void
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}

      {/* Add a receipt */}
      {formOpen ? (
        <div style={styles.modalBackdrop}>
          <div style={styles.modalCard}>
            <h2 style={styles.modalTitle}>Add Receipt</h2>
            <div style={styles.modalScroll}>
              {previewUrl ? (
                <div style={styles.previewWrap}>
                  <img src={previewUrl} alt="" style={styles.preview} />
                  <button style={styles.clearPhoto} onClick={() => setFile(null)}>
                    Remove photo
                  </button>
                </div>
              ) : (
                <button style={styles.photoButton} onClick={() => fileInputRef.current?.click()}>
                  Choose a receipt photo
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />

              <p style={styles.label}>Amount</p>
              <input
                style={styles.input}
                value={amount}
                onChange={(e) => {
                  // Digits and a single decimal point, at most two places — so
                  // nobody types a third and quietly gets it rounded.
                  const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                  const parts = cleaned.split('.');
                  setAmount(
                    parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}` : cleaned
                  );
                }}
                placeholder="0.00"
                inputMode="decimal"
              />

              <p style={styles.label}>Category</p>
              <div style={styles.chipWrap}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    style={{
                      ...styles.chip,
                      ...(categoryKey === c.key ? styles.chipActive : {}),
                    }}
                    onClick={() => setCategoryKey(c.key)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <p style={styles.label}>Where</p>
              <input
                style={styles.input}
                value={where}
                onChange={(e) => setWhere(e.target.value)}
                placeholder="City, State"
              />

              <p style={styles.label}>Date spent</p>
              <input
                style={styles.input}
                type="date"
                value={dateSpent}
                max={today}
                onChange={(e) => setDateSpent(e.target.value)}
              />

              <p style={styles.label}>Reason</p>
              <textarea
                style={{ ...styles.input, ...styles.textarea }}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What was this for?"
              />
            </div>

            <div style={styles.modalButtonsRow}>
              <button
                style={styles.cancelButton}
                onClick={() => {
                  setFormOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </button>
              <button
                style={{ ...styles.confirmButton, ...(!canSubmit || saving ? styles.confirmDisabled : {}) }}
                disabled={!canSubmit || saving}
                onClick={handleSubmit}
              >
                {saving ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Full-size receipt */}
      {viewing ? (
        <div style={styles.modalBackdrop}>
          <div style={styles.viewerCard}>
            {urls[viewing.id] ? (
              <img src={urls[viewing.id]} alt="" style={styles.viewerImage} />
            ) : (
              <p style={styles.hint}>
                {viewing.imageDeletedAt
                  ? 'The photo aged out after 90 days. The record is still here.'
                  : 'Photo unavailable.'}
              </p>
            )}
            <div style={styles.viewerMeta}>
              <div style={styles.viewerAmount}>${formatAmount(viewing.amountCents)}</div>
              <div style={styles.cardMeta}>
                {viewing.categoryLabel} · {viewing.where} · {prettyDate(viewing.dateSpent)}
              </div>
              <div style={styles.cardReason}>{viewing.reason}</div>
              <div style={styles.cardWho}>Submitted by {viewing.submittedByName}</div>
              {viewing.voided ? (
                <div style={styles.voidNote}>Voided — {viewing.voidedReason}</div>
              ) : null}
            </div>
            <button style={styles.cancelButton} onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '36px max(22px, min(44px, 4vw))', maxWidth: 1040 },
  headerRow: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 },
  title: { margin: 0, flex: 1 },
  addButton: {
    background: 'var(--neon)',
    color: 'var(--neon-text)',
    border: 'none',
    borderRadius: 9,
    padding: '10px 16px',
    fontWeight: 900,
    fontSize: 12,
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 22px' },
  hint: { fontSize: 13, color: 'var(--text-tertiary)', padding: '12px 0' },

  group: { marginBottom: 26 },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  groupDate: { fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' },
  groupTotal: { fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' },

  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  cardVoided: { opacity: 0.5 },
  cardMain: { display: 'flex', alignItems: 'center', gap: 14, padding: 13, cursor: 'pointer' },
  cardText: { flex: 1, minWidth: 0 },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    objectFit: 'cover',
    background: 'var(--bg-inset)',
    flexShrink: 0,
  },
  thumbEmpty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 9,
    color: 'var(--text-tertiary)',
  },
  cardAmount: { fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' },
  cardMeta: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 },
  cardReason: { fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3, lineHeight: 1.4 },
  cardWho: { fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, fontWeight: 600 },
  cardCountdown: { fontSize: 11, color: 'var(--neon)', marginTop: 4, fontWeight: 700 },
  voidButton: {
    background: 'none',
    border: '1px solid var(--border-strong)',
    borderRadius: 7,
    color: 'var(--danger)',
    fontSize: 11,
    fontWeight: 800,
    textTransform: 'uppercase',
    padding: '6px 12px',
    cursor: 'pointer',
    flexShrink: 0,
  },

  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    zIndex: 100,
  },
  modalCard: {
    width: 'min(460px, calc(100vw - 32px))',
    maxHeight: '88vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 24,
  },
  modalTitle: { fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 14px' },
  modalScroll: { overflowY: 'auto', flex: 1 },

  photoButton: {
    width: '100%',
    border: '1px dashed var(--border-strong)',
    background: 'var(--bg-inset)',
    borderRadius: 9,
    padding: '22px 12px',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  previewWrap: { textAlign: 'center' },
  preview: {
    width: '100%',
    maxHeight: 220,
    objectFit: 'contain',
    borderRadius: 9,
    background: 'var(--bg-inset)',
  },
  clearPhoto: {
    background: 'none',
    border: 'none',
    color: 'var(--text-tertiary)',
    fontSize: 12,
    padding: '8px 0',
    cursor: 'pointer',
  },

  label: { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', margin: '16px 0 6px' },
  input: {
    width: '100%',
    border: '1px solid var(--border)',
    borderRadius: 9,
    background: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    fontSize: 14,
    padding: '11px 12px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  textarea: { minHeight: 76, resize: 'vertical' },

  chipWrap: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: {
    border: '1px solid var(--border-strong)',
    background: 'none',
    borderRadius: 20,
    padding: '7px 12px',
    fontSize: 12,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  chipActive: { background: 'var(--neon)', borderColor: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 800 },

  modalButtonsRow: { display: 'flex', gap: 10, marginTop: 18 },
  cancelButton: {
    flex: 1,
    padding: '12px 0',
    borderRadius: 9,
    border: '1px solid var(--border-strong)',
    background: 'none',
    color: 'var(--text-secondary)',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  confirmButton: {
    flex: 1,
    padding: '12px 0',
    borderRadius: 9,
    border: 'none',
    background: 'var(--neon)',
    color: 'var(--neon-text)',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 0.4,
    cursor: 'pointer',
  },
  confirmDisabled: { opacity: 0.4, cursor: 'default' },

  viewerCard: {
    width: 'min(560px, calc(100vw - 32px))',
    maxHeight: '88vh',
    overflowY: 'auto',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 20,
  },
  viewerImage: {
    width: '100%',
    maxHeight: 420,
    objectFit: 'contain',
    borderRadius: 9,
    background: 'var(--bg-inset)',
  },
  viewerMeta: { padding: '16px 0' },
  viewerAmount: { fontSize: 21, fontWeight: 900, color: 'var(--text-primary)' },
  voidNote: { fontSize: 12, color: 'var(--danger)', marginTop: 8, fontWeight: 700 },
};
