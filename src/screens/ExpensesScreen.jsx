import React, { useEffect, useMemo, useRef, useState } from 'react';
import DatePickerField from '../components/DatePickerField';
import { useAuth } from '../context/AuthContext';
import {
  useExpenses,
  EXPENSE_CATEGORIES,
  formatAmount,
  parseAmount,
  centralDateKey,
  prettyDate,
  timeLeft,
  previewPeriod,
  periodRange,
  prettyDay,
} from '../context/ExpensesContext';
import { useBudgetTargets } from '../context/BudgetTargetsContext';
import { useDialog } from '../hooks/useDialog';
import PageHeader from '../components/PageHeader';

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
    rebuildPeriod,
    movePeriod,
    periods,
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
  // Blank means "the default" - Corporate - until someone picks another.
  const [chargeToId, setChargeToId] = useState('');
  const defaultTarget = activeTargets.find((t) => t.isDefault) ?? null;
  const effectiveChargeTo = chargeToId || defaultTarget?.id || '';

  const [urls, setUrls] = useState({});
  const [viewing, setViewing] = useState(null);

  // A receipt can be a photo or a PDF emailed by the vendor. An <img> draws
  // nothing for the second, so it gets something to open instead.
  const isPdf = (r) => (r?.storagePath ?? '').toLowerCase().endsWith('.pdf');

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
      const res = await submitReceipt({
        file,
        amountCents: cents,
        categoryKey,
        where: where.trim(),
        reason: reason.trim(),
        dateSpent,
        // Both stored: the id so it stays correct if a market is renamed, the
        // name so the nightly report needs no extra lookup per receipt.
        chargeToId: effectiveChargeTo || null,
      });
      setFormOpen(false);
      resetForm();
      notify('Receipt submitted', res?.periodLabel ? `Filed to ${res.periodLabel}.` : 'Saved.');
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

  const [rebuilding, setRebuilding] = useState(null);
  const handleRebuild = (r) => {
    confirm({
      title: `Rebuild ${r.label}?`,
      body:
        'The spreadsheet and photo zip are rebuilt from every receipt in that period as it stands now, including any finance has moved. Anyone who already downloaded it will see it as not collected again.',
      confirmLabel: 'Rebuild',
      onConfirm: async () => {
        setRebuilding(r.dateKey);
        try {
          const res = await rebuildPeriod(r.periodId ?? r.dateKey);
          notify(
            'Rebuilt',
            `${r.label}: ${res.previousReceipts} → ${res.receipts} receipts, $${formatAmount(res.totalCents)}.`
          );
        } catch (err) {
          notify('Could not rebuild', err?.message ?? 'Try again.');
        } finally {
          setRebuilding(null);
        }
      },
    });
  };

  const handleDownloadReport = async (dateKey, which = 'csv') => {
    try {
      await downloadReport(dateKey, which);
    } catch (err) {
      notify('Could not download', err?.message ?? 'The report was not downloaded. Try again.');
    }
  };

  // Finance moves a receipt to another period - open or shut.
  const [moving, setMoving] = useState(null);
  const [moveTo, setMoveTo] = useState('');
  const handleMove = async () => {
    if (!moving || !moveTo) return;
    try {
      const res = await movePeriod(moving.id, moveTo);
      const to = periods.find((p) => p.id === moveTo);
      notify(
        'Moved',
        `Now in ${to?.label ?? moveTo}.` +
          ((res?.flagged ?? []).length ? ' A report that was already built is marked as needing a rebuild.' : '')
      );
      setMoving(null);
    } catch (err) {
      notify('Could not move', err?.message ?? 'Try again.');
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

  // One report per fiscal period. The latest, and any you have not collected,
  // sit at the top; the rest - and the old monthly reports from before the
  // switch to periods - are in Past reports. The old dailies are not shown.
  const periodReports = reports
    .filter((r) => r.kind === 'period')
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  const topReports = periodReports.filter(
    (r, i) => i === 0 || !(r.downloadedByUids ?? []).includes(user?.uid)
  );
  const pastReports = reports
    .filter((r) => (r.kind === 'period' && !topReports.includes(r)) || r.kind === 'monthly')
    .sort((a, b) => (b.generatedAt ?? 0) - (a.generatedAt ?? 0));

  const today = centralDateKey(new Date());
  const grouped = useMemo(() => {
    // Finance saw only receipts dated today, so one submitted this morning for
    // something bought a fortnight ago appeared nowhere - which looks exactly
    // like a receipt that failed to save.
    // By when it was submitted, not when it was spent: a receipt handed in
    // this morning for work done in September is new and should be seen, while
    // a September receipt submitted in September is not.
    // Central, the same day boundary the server and the daily report use.
    const todayKey = centralDateKey(new Date());
    const visible = seesAll
      ? receipts.filter((r) => (r.submittedDateKey || centralDateKey(new Date(r.submittedAt ?? 0))) === todayKey)
      : receipts;
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
  }, [receipts, seesAll]);

  const isAdmin = user?.role === 'admin';
  const isFinance = user?.job === 'Financials';

  // Where today sits in the fiscal calendar, said at the top of the page so
  // nobody has to know the calendar to use it.
  const currentPeriod = previewPeriod(periods, today, today);
  const catchUp = periods.find((p) => p.endKey < today && today <= p.windowEndKey) ?? null;
  const formPeriod = previewPeriod(periods, dateSpent, today);

  return (
    <div style={styles.page}>
      <PageHeader
        title="Expenses"
        subtitle={seesAll ? "This period's report, and the receipts submitted today." : 'Your receipts, grouped by the day you spent the money.'}
        actionLabel="+ Add receipt"
        onAction={() => setFormOpen(true)}
      />

      {currentPeriod ? (
        <div style={styles.periodBar}>
          <span style={styles.periodNow}>{currentPeriod.label}</span>
          <span style={styles.periodRange}>{periodRange(currentPeriod)}</span>
        </div>
      ) : periods.length > 0 ? (
        <div style={styles.catchUp}>
          Today is outside the fiscal calendar loaded in the Hub, so receipts cannot be filed. Finance needs to load
          the next year.
        </div>
      ) : null}
      {catchUp ? (
        <div style={styles.catchUp}>
          {catchUp.label} ended {prettyDay(catchUp.endKey)}. Receipts from {periodRange(catchUp)} are due by{' '}
          <strong>{prettyDay(catchUp.windowEndKey)}</strong> and go into {catchUp.label} automatically. After that
          they go into the current period.
        </div>
      ) : null}

      {/* Reports are generated at 11:59pm Central and stay until downloaded -
          not until the next one arrives, which would give one day to collect
          them. Finance and admins only; the rules reject anyone else, so this
          never renders for them. */}
      {isAdmin || isFinance ? (
        <div style={styles.reportsSection}>
          <button style={styles.folderRow} onClick={() => setBudgetsOpen((v) => !v)}>
            <span style={styles.folderChevron}>{budgetsOpen ? '▾' : '▸'}</span>
            <span style={styles.folderLabel}>Charge-to options</span>
            <span style={styles.folderCount}>{activeTargets.length}</span>
          </button>

          {budgetsOpen ? (
            <>
              <div style={styles.budgetAddRow}>
                <input
                  style={{ ...styles.input, marginBottom: 0 }}
                  value={newTargetName}
                  onChange={(e) => setNewTargetName(e.target.value)}
                  placeholder="Name of the account"
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
                      {t.isDefault ? <span style={styles.reportMeta}> · default</span> : null}
                      {t.archived ? <span style={styles.reportMeta}> · closed</span> : null}
                    </div>
                  </div>
                  <button
                    style={styles.reportButtonQuiet}
                    disabled={t.isDefault && !t.archived}
                    title={t.isDefault ? 'The default cannot be closed - every receipt needs somewhere to go.' : ''}
                    onClick={() => (t.archived ? restoreTarget(t.id) : archiveTarget(t.id))}
                  >
                    {t.archived ? 'Reopen' : 'Close'}
                  </button>
                </div>
              ))}
            </>
          ) : null}
        </div>
      ) : null}

      {seesAll && (topReports.length > 0 || pastReports.length > 0) ? (
        <div style={styles.reportsSection}>
          {topReports.length > 0 ? <p style={styles.zoneLabel}>Period reports</p> : null}
          {topReports.map((r) => {
            const collected = (r.downloadedByUids ?? []).includes(user?.uid);
            const changed = (r.changedReceiptIds ?? []).length;
            return (
              <div key={r.dateKey} style={{ ...styles.monthlyCard, ...(collected ? styles.monthlyCardDone : {}) }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.monthlyLabel}>{r.label}</div>
                    <div style={styles.reportMeta}>
                      {r.receiptCount} receipt{r.receiptCount === 1 ? '' : 's'} · ${formatAmount(r.totalCents)} · every
                      location
                    </div>
                    <div style={styles.monthlyKept}>
                      Built when its catch-up week closed. Kept for ninety days - save a copy.
                    </div>
                    {changed > 0 ? (
                      <div style={styles.monthlyStale}>
                        {changed} receipt{changed === 1 ? ' was' : 's were'} moved into or out of this period after it
                        was built. Rebuild it to bring the spreadsheet up to date.
                      </div>
                    ) : null}
                  </div>
                  <span style={{ ...styles.monthlyPill, ...(collected ? styles.monthlyPillDone : {}) }}>
                    {collected ? 'Collected' : 'Not collected'}
                  </span>
                </div>
                <div style={styles.monthlyActions}>
                  <button style={styles.reportButton} onClick={() => handleDownloadReport(r.dateKey)}>
                    Download the spreadsheet
                  </button>
                  {r.archivePath ? (
                    <button style={styles.reportButton} onClick={() => handleDownloadReport(r.dateKey, 'photos')}>
                      Download the photos
                    </button>
                  ) : (
                    <span style={styles.noPhotos}>No receipt photos in this period</span>
                  )}
                  {isAdmin || isFinance ? (
                    <button
                      style={styles.reportButtonQuiet}
                      disabled={rebuilding === r.dateKey}
                      onClick={() => handleRebuild(r)}
                    >
                      {rebuilding === r.dateKey ? 'Rebuilding…' : 'Rebuild'}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}

          {pastReports.length > 0 ? (
            <>
              <button style={styles.folderRow} onClick={() => setPastReportsOpen((v) => !v)}>
                <span style={styles.folderChevron}>{pastReportsOpen ? '▾' : '▸'}</span>
                <span style={styles.folderLabel}>Past reports</span>
                <span style={styles.folderCount}>{pastReports.length}</span>
              </button>

              {pastReportsOpen
                ? pastReports.map((r) => (
                    <div key={r.dateKey} style={{ ...styles.reportRow, ...styles.reportRowNested }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={styles.reportLabel}>
                          {r.label}
                          {r.kind === 'monthly' ? <span style={styles.reportMeta}> · before fiscal periods</span> : null}
                        </div>
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
                        Download
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
                      isPdf(r) ? (
                        <span style={styles.pdfThumb}>PDF</span>
                      ) : (
                        <img src={urls[r.id]} alt="" style={styles.thumb} />
                      )
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
                      <div style={styles.cardPeriod}>
                        {r.periodLabel ?? 'No period'} · {r.chargeToName}
                        {r.movedByName ? ` · moved by ${r.movedByName}` : ''}
                      </div>
                      {left ? <div style={styles.cardCountdown}>{left}</div> : null}
                    </div>
                    {isFinance ? (
                      <button
                        style={styles.voidButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMoveTo(r.periodId ?? '');
                          setMoving(r);
                        }}
                      >
                        Period
                      </button>
                    ) : null}
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
                  {file?.type === 'application/pdf' ? (
                    <div style={styles.preview}>
                      <span style={styles.pdfThumb}>PDF</span>
                      <span style={styles.pdfName}>{file.name}</span>
                    </div>
                  ) : (
                    <img src={previewUrl} alt="" style={styles.preview} />
                  )}
                  <button style={styles.clearPhoto} onClick={() => setFile(null)}>
                    Remove
                  </button>
                </div>
              ) : (
                <button style={styles.photoButton} onClick={() => fileInputRef.current?.click()}>
                  Choose a receipt photo or PDF
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  // Checked here because Storage refuses anything over 12 MB
                  // with a permission error, which reads as an access problem.
                  const picked = e.target.files?.[0] ?? null;
                  if (picked && picked.size >= 12 * 1024 * 1024) {
                    notify('That file is too large', 'Receipts can be up to 12 MB. Try a smaller photo or a PDF.');
                    e.target.value = '';
                    return;
                  }
                  setFile(picked);
                }}
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

              {/* Every receipt is charged to something. Corporate unless another
                  account is chosen. */}
              <p style={styles.label}>Charge to</p>
              <select style={styles.input} value={effectiveChargeTo} onChange={(e) => setChargeToId(e.target.value)}>
                {defaultTarget ? null : <option value="">Corporate</option>}
                {activeTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <p style={styles.label}>Date spent</p>
              <DatePickerField value={dateSpent} onChange={setDateSpent} max={today} placeholder="Date spent" />
              {formPeriod ? (
                <p style={styles.formPeriod}>
                  Goes into <strong>{formPeriod.label}</strong> ({periodRange(formPeriod)})
                  {currentPeriod && formPeriod.id !== currentPeriod.id
                    ? ` - still open until ${prettyDay(formPeriod.windowEndKey)}.`
                    : '.'}
                </p>
              ) : null}

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
              isPdf(viewing) ? (
                <a
                  href={urls[viewing.id]}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.pdfOpen}
                >
                  Open the PDF
                </a>
              ) : (
                <img src={urls[viewing.id]} alt="" style={styles.viewerImage} />
              )
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
              <div style={styles.cardPeriod}>
                {viewing.periodLabel ?? 'No period'} · charged to {viewing.chargeToName}
                {viewing.movedByName
                  ? ` · moved from ${viewing.previousPeriodLabel ?? 'another period'} by ${viewing.movedByName}`
                  : ''}
              </div>
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

      {/* Finance only: move a receipt to another period, open or shut. */}
      {moving ? (
        <div style={styles.modalBackdrop}>
          <div style={styles.modalCard}>
            <h2 style={styles.modalTitle}>Move to another period</h2>
            <p style={styles.hint}>
              ${formatAmount(moving.amountCents)} · {moving.submittedByName} · spent {prettyDate(moving.dateSpent)}. Now in{' '}
              {moving.periodLabel ?? 'no period'}. If the period you move it into or out of already has a report, that
              report is marked as needing a rebuild.
            </p>
            <select style={styles.input} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              {periods
                .slice()
                .reverse()
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({periodRange(p)})
                  </option>
                ))}
            </select>
            <div style={styles.modalButtonsRow}>
              <button style={styles.cancelButton} onClick={() => setMoving(null)}>
                Cancel
              </button>
              <button
                style={{ ...styles.confirmButton, ...(moveTo === moving.periodId ? styles.confirmDisabled : {}) }}
                disabled={moveTo === moving.periodId}
                onClick={handleMove}
              >
                Move
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '28px max(22px, min(36px, 4vw))', maxWidth: 820 },
  hint: { fontSize: 13, color: 'var(--text-tertiary)', padding: '12px 0' },

  budgetAddRow: { display: 'flex', gap: 8, marginLeft: 20, marginBottom: 10, alignItems: 'center' },
  folderRow: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'var(--bg-card)', border: 'none', borderRadius: 12, padding: '15px 16px', marginBottom: 10, cursor: 'pointer', textAlign: 'left' },
  folderChevron: { color: 'var(--text-tertiary)', fontSize: 11 },
  folderLabel: { flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' },
  folderCount: { fontSize: 12, color: 'var(--text-tertiary)' },
  reportRowNested: { marginLeft: 20, marginTop: 10, marginBottom: 10 },
  reportButtonQuiet: { background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  reportsSection: { marginBottom: 8 },
  monthlyCard: { background: 'var(--bg-card)', border: '1px solid rgba(34,211,238,0.35)', borderRadius: 12, padding: '16px 18px', marginBottom: 24 },
  monthlyCardDone: { border: '1px solid var(--border)' },
  monthlyPillDone: { color: 'var(--text-tertiary)', border: '1px solid var(--border)' },
  monthlyLabel: { fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' },
  monthlyKept: { fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 },
  monthlyPill: { fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--neon)', border: '1px solid rgba(34,211,238,0.35)', borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap' },
  monthlyActions: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  periodBar: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 },
  periodNow: { fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: 0.2 },
  periodRange: { fontSize: 13, color: 'var(--text-secondary)' },
  catchUp: { fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)', background: 'var(--accent-soft)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 },
  cardPeriod: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 },
  formPeriod: { fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0 0' },
  monthlyStale: { fontSize: 12, fontWeight: 700, color: 'var(--danger)', marginTop: 8, lineHeight: 1.45 },
  noPhotos: { fontSize: 12, color: 'var(--text-tertiary)', alignSelf: 'center' },
  zoneLabel: { fontSize: 10, fontWeight: 800, letterSpacing: 0.7, color: 'var(--text-tertiary)', textTransform: 'uppercase', margin: '26px 0 10px' },
  reportRow: { display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 8 },
  reportLabel: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' },
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
  pdfThumb: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 8, background: 'var(--bg-inset)', color: 'var(--text-tertiary)', fontSize: 10, fontWeight: 800, letterSpacing: 0.5 },
  pdfOpen: { display: 'inline-block', padding: '12px 20px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontSize: 14, fontWeight: 700, textDecoration: 'none' },
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
  pdfName: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, wordBreak: 'break-all', textAlign: 'center' },
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
