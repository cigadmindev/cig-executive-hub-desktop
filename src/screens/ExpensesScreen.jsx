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
import { useBudgetTargets } from '../context/BudgetTargetsContext';
import { nike } from '../theme/nike';
import { useDialog } from '../hooks/useDialog';

export default function ExpensesScreen() {
  const { dialogNode, confirm, notify } = useDialog();
  const { user } = useAuth();
  const {
    receipts,
    reports,
    seesAll,
    loading,
    submitReceipt,
    getImageUrls,
    voidReceipt,
    isEditable,
    downloadReport,
  } =
    useExpenses();
  const { activeTargets, addTarget, archiveTarget, restoreTarget, targets } = useBudgetTargets();

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
  // Optional. Blank means the spend is not against any one market - a
  // subscription, office supplies. Not required, because forcing a choice
  // would put wrong answers in the reports.
  const [chargeToId, setChargeToId] = useState('');

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
    setChargeToId('');
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
        // Both stored: the id so it stays correct if a market is renamed, the
        // name so the nightly report needs no extra lookup per receipt.
        chargeToId: chargeToId || null,
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

  // A receipt can be voided only while it is still editable. After the
  // cutoff it is in a report finance already holds, and voiding it then would
  // leave the app and that report disagreeing about the day's total.
  const canVoid = (r) => Date.now() < r.editableUntil;

  const handleDownloadReport = async (dateKey, which = 'csv') => {
    try {
      await downloadReport(dateKey, which);
    } catch (err) {
      notify('Could not download', err?.message ?? 'The report was not downloaded. Try again.');
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
  const [pastReportsOpen, setPastReportsOpen] = useState(false);
  const [budgetsOpen, setBudgetsOpen] = useState(false);
  const [newTargetName, setNewTargetName] = useState('');
  const uncollectedReports = reports.filter((r) => !(r.downloadedByUids ?? []).includes(user?.uid));
  const collectedReports = reports.filter((r) => (r.downloadedByUids ?? []).includes(user?.uid));

  const today = centralDateKey(new Date());
  const grouped = useMemo(() => {
    const visible = seesAll ? receipts.filter((r) => r.dateSpent === today) : receipts;
    const byDate = {};
    for (const r of visible) {
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
  }, [receipts, seesAll, today]);

  const isAdmin = user?.role === 'admin';

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
          ? "Today's receipts, and any daily report waiting to be collected."
          : 'Your receipts, grouped by the day you spent the money.'}
      </p>

      {/* Reports are generated at 11:59pm Central and stay until downloaded -
          not until the next one arrives, which would give one day to collect
          them. Finance and admins only; the rules reject anyone else, so this
          never renders for them. */}
      {isAdmin ? (
        <div style={styles.reportsSection}>
          <button style={styles.folderRow} onClick={() => setBudgetsOpen((v) => !v)}>
            <span style={styles.folderChevron}>{budgetsOpen ? '▾' : '▸'}</span>
            <span style={styles.folderLabel}>Budgets to charge against</span>
            <span style={styles.folderCount}>{activeTargets.length}</span>
          </button>

          {budgetsOpen ? (
            <>
              <div style={styles.budgetAddRow}>
                <input
                  style={{ ...styles.input, marginBottom: 0 }}
                  value={newTargetName}
                  onChange={(e) => setNewTargetName(e.target.value)}
                  placeholder="Birmingham"
                />
                <button
                  style={styles.reportButton}
                  disabled={!newTargetName.trim()}
                  onClick={async () => {
                    try {
                      await addTarget(newTargetName);
                      setNewTargetName('');
                    } catch (err) {
                      notify('Could not add', err?.message ?? 'Try again.');
                    }
                  }}
                >
                  Add
                </button>
              </div>

              {/* Archived rather than deleted - receipts already charged to a
                  market keep resolving, and an old report stays readable. */}
              {targets.map((t) => (
                <div key={t.id} style={{ ...styles.reportRow, ...styles.reportRowNested }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...styles.reportLabel, opacity: t.archived ? 0.5 : 1 }}>
                      {t.name}
                      {t.archived ? <span style={styles.reportMeta}> · archived</span> : null}
                    </div>
                  </div>
                  <button
                    style={styles.reportButtonQuiet}
                    onClick={() => (t.archived ? restoreTarget(t.id) : archiveTarget(t.id))}
                  >
                    {t.archived ? 'Restore' : 'Archive'}
                  </button>
                </div>
              ))}
            </>
          ) : null}
        </div>
      ) : null}

      {seesAll && reports.length > 0 ? (
        <div style={styles.reportsSection}>
          {/* Uncollected at the top, because those need something doing.
              Everything already collected goes in a folder - ninety days of
              daily reports on one page would bury today's under three months
              of history. */}
          {uncollectedReports.length > 0 ? (
            <>
              <p style={styles.zoneLabel}>Waiting for you</p>
              {uncollectedReports.map((r) => (
                <div key={r.dateKey} style={styles.reportRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.reportLabel}>
                      {r.label}
                      <span style={styles.reportDot} />
                    </div>
                    <div style={styles.reportMeta}>
                      {r.receiptCount} receipt{r.receiptCount === 1 ? '' : 's'} · ${formatAmount(r.totalCents)}
                    </div>
                  </div>
                  <div style={styles.reportActions}>
                    <button style={styles.reportButton} onClick={() => handleDownloadReport(r.dateKey)}>
                      Download CSV
                    </button>
                    {r.archivePath ? (
                      <button
                        style={styles.reportButtonQuiet}
                        onClick={() => handleDownloadReport(r.dateKey, 'photos')}
                      >
                        Photos
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </>
          ) : null}

          {collectedReports.length > 0 ? (
            <>
              <button style={styles.folderRow} onClick={() => setPastReportsOpen((v) => !v)}>
                <span style={styles.folderChevron}>{pastReportsOpen ? '▾' : '▸'}</span>
                <span style={styles.folderLabel}>Past reports</span>
                <span style={styles.folderCount}>{collectedReports.length}</span>
              </button>

              {pastReportsOpen
                ? collectedReports.map((r) => (
                    <div key={r.dateKey} style={{ ...styles.reportRow, ...styles.reportRowNested }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={styles.reportLabel}>{r.label}</div>
                        <div style={styles.reportMeta}>
                          {r.receiptCount} receipt{r.receiptCount === 1 ? '' : 's'} · ${formatAmount(r.totalCents)}
                        </div>
                      </div>
                      {r.archivePath ? (
                        <button
                          style={styles.reportButtonQuiet}
                          onClick={() => handleDownloadReport(r.dateKey, 'photos')}
                        >
                          Photos
                        </button>
                      ) : null}
                      <button style={styles.reportButtonQuiet} onClick={() => handleDownloadReport(r.dateKey)}>
                        Download again
                      </button>
                    </div>
                  ))
                : null}
            </>
          ) : null}
        </div>
      ) : null}

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
                        {r.imageDeletedAt ? 'No photo' : '—'}
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
                    {isAdmin && !r.voided && canVoid(r) ? (
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

              {/* Optional, and last before the date because most receipts do not
                  need it. Blank means the spend is not against one market. */}
              <p style={styles.label}>Charge to (optional)</p>
              <select style={styles.input} value={chargeToId} onChange={(e) => setChargeToId(e.target.value)}>
                <option value="">Not specific to one place</option>
                {activeTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

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
                  ? 'The photo was removed once this day was reported. The record is still here.'
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

  budgetAddRow: { display: 'flex', gap: 8, marginLeft: 20, marginBottom: 10, alignItems: 'center' },
  folderRow: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', padding: '10px 2px', marginTop: 6, cursor: 'pointer', textAlign: 'left' },
  folderChevron: { color: 'var(--text-tertiary)', fontSize: 11 },
  folderLabel: { flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' },
  folderCount: { fontSize: 12, color: 'var(--text-tertiary)' },
  reportRowNested: { marginLeft: 20 },
  reportActions: { display: 'flex', gap: 8, alignItems: 'center' },
  reportButtonQuiet: { background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  reportsSection: { marginBottom: 30 },
  zoneLabel: { fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '0 0 10px' },
  reportRow: { display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 8 },
  reportLabel: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' },
  reportDot: { width: 8, height: 8, borderRadius: 4, background: 'var(--danger)' },
  reportMeta: { fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 },
  reportButton: { background: 'var(--neon)', color: 'var(--neon-text)', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0 },
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
  // Right padding so the scrollbar sits beside the fields rather than over
  // them. On a phone it is an overlay and invisible; in a desktop browser it
  // takes real width.
  modalScroll: { overflowY: 'auto', flex: 1, paddingRight: 14, marginRight: -8 },

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
