import React, { useEffect, useMemo, useRef, useState } from 'react';
import DatePickerField from '../components/DatePickerField';
import RequestPage, { Pill, detailStyles as d } from '../components/RequestPage';
import { useAuth } from '../context/AuthContext';
import { useCustomLocations } from '../context/CustomLocationsContext';
import { brands } from '../data/mockData';
import {
  useExpenses,
  ATTENDEES_ACCOUNT,
  formatAmount,
  parseAmount,
  centralDateKey,
  previewPeriod,
  periodRange,
} from '../context/ExpensesContext';
import { useDialog } from '../hooks/useDialog';
import { modalBackdrop, modalSurface } from '../theme/modal';
import { plainError } from '../lib/errors';
import { fmtDayKey, fmtDayTime } from '../lib/dates';

// Expenses (redesign approved 9 Oct 2026). Receipts for things executives
// have already paid for, filed under Sam's accounts, sorted by location
// (Corporate unless one is picked), and sent to Finance in each period's
// report. Built on the shared request-page layout: a list on the left, the
// selected receipt on the right, the same as every other request page.

const NOT_CODED = 'Not coded yet';
const money = (cents) => '$' + Number((cents ?? 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ExpensesScreen() {
  const { dialogNode, confirm, notify } = useDialog();
  const { user } = useAuth();
  const { getByBrand } = useCustomLocations();
  const {
    receipts, reports, seesAll, loading, periods, accounts,
    submitReceipt, editReceipt, recodeReceipt, voidReceipt, isEditable, getImageUrls,
    downloadReport, rebuildPeriod, movePeriod, addAccount, setAccountRetired,
  } = useExpenses();

  const isAdmin = user?.role === 'admin';
  const isFinance = user?.job === 'Financials';
  const today = centralDateKey(new Date());
  const currentPeriod = previewPeriod(periods, today, today);
  const lastPeriod = currentPeriod ? [...periods].reverse().find((p) => p.endKey < currentPeriod.startKey) ?? null : null;
  const catchUp = periods.find((p) => p.endKey < today && today <= p.windowEndKey) ?? null;

  // Every location in the Hub, open or opening, after Corporate.
  const locations = useMemo(
    () =>
      brands.flatMap((b) =>
        [...(b.locations ?? []), ...getByBrand(b.id)].map((l) => ({ id: l.id, label: b.name + ' · ' + l.name }))
      ),
    [getByBrand]
  );

  // ---------------------------------------------------------------- list
  const [filter, setFilter] = useState('current');
  const [person, setPerson] = useState('all');
  const [place, setPlace] = useState('all');
  const [selectedId, setSelectedId] = useState(null);

  const mine = seesAll ? receipts : receipts.filter((r) => r.submittedByUid === user?.uid);
  const inPeriod = (p) => (r) => p && r.periodId === p.id;
  const filters = seesAll
    ? [
        ['current', currentPeriod ? currentPeriod.label : 'This period', (r) => inPeriod(currentPeriod)(r) && !r.voided],
        ['uncoded', NOT_CODED, (r) => !r.accountCode && !r.voided],
        ['last', lastPeriod ? lastPeriod.label : 'Last period', (r) => inPeriod(lastPeriod)(r) && !r.voided],
        ['voided', 'Voided', (r) => r.voided],
        ['all', 'All', () => true],
      ]
    : [
        ['current', 'This period', inPeriod(currentPeriod)],
        ['last', 'Last period', inPeriod(lastPeriod)],
        ['all', 'All mine', () => true],
      ];
  const byPerson = (r) => person === 'all' || r.submittedByUid === person;
  const byPlace = (r) => place === 'all' || (place === 'corporate' ? !r.locationId && (r.chargeToName ?? 'Corporate') === 'Corporate' : r.locationId === place);
  const active = filters.find((f) => f[0] === filter) ?? filters[0];
  const rows = mine
    .filter(active[2])
    .filter(byPerson)
    .filter(byPlace)
    .sort((a, b) => (b.dateSpent ?? '').localeCompare(a.dateSpent ?? '') || (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null;
  const people = [...new Map(receipts.map((r) => [r.submittedByUid, r.submittedByName])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));

  // Signed photo links for what is on screen; they expire, so not stored.
  const [urls, setUrls] = useState({});
  const idKey = rows.slice(0, 100).map((r) => r.id).join(',');
  useEffect(() => {
    const ids = rows.slice(0, 100).filter((r) => !r.imageDeletedAt).map((r) => r.id);
    if (ids.length === 0) return undefined;
    let cancelled = false;
    getImageUrls(ids)
      .then((map) => !cancelled && setUrls((prev) => ({ ...prev, ...map })))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [idKey]);

  const accountLabel = (r) => (r.accountCode ? r.accountCode + ' · ' + r.accountName : null);
  const statusCell = (r) =>
    r.voided ? <Pill tone="red">Voided</Pill> : !r.accountCode ? (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <Pill tone="amber">{NOT_CODED}</Pill>
        {r.categoryLabel ? <span style={styles.muted}>was "{r.categoryLabel}"</span> : null}
      </span>
    ) : (
      <span style={{ fontWeight: 700 }}>{accountLabel(r)}</span>
    );
  const columns = [
    { key: 'date', label: 'Spent', render: (r) => <span style={styles.nowrap}>{fmtDayKey(r.dateSpent)}</span> },
    ...(seesAll ? [{ key: 'who', label: 'Who', render: (r) => r.submittedByName }] : []),
    { key: 'account', label: 'Account', render: statusCell },
    ...(seesAll ? [] : [{ key: 'where', label: 'Where', render: (r) => <span style={styles.muted}>{r.where}</span> }]),
    { key: 'loc', label: 'Location', render: (r) => <span style={styles.muted}>{r.chargeToName ?? 'Corporate'}</span> },
    {
      key: 'amount',
      label: 'Amount',
      render: (r) => <span style={{ fontWeight: 700, ...(r.voided ? { textDecoration: 'line-through', color: 'var(--text-tertiary)' } : {}) }}>{money(r.amountCents)}</span>,
    },
  ];

  // ---------------------------------------------------------------- forms
  const [form, setForm] = useState(null); // { mode: 'add' | 'edit', receipt? }
  const [voiding, setVoiding] = useState(null);
  const [moving, setMoving] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [managing, setManaging] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn, ok, failTitle) => {
    setBusy(true);
    try {
      const res = await fn();
      if (ok) ok(res);
    } catch (err) {
      notify(failTitle ?? 'Nothing was changed', plainError(err, 'Try again.'));
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- top of page
  const myCurrent = receipts.filter((r) => r.submittedByUid === user?.uid && currentPeriod && r.periodId === currentPeriod.id && !r.voided);
  const allCurrent = receipts.filter((r) => currentPeriod && r.periodId === currentPeriod.id && !r.voided);
  const uncodedCount = receipts.filter((r) => !r.accountCode && !r.voided).length;
  const sum = (list) => list.reduce((n, r) => n + (r.amountCents ?? 0), 0);

  const periodReports = reports.filter((r) => r.kind === 'period').sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  const latest = periodReports[0] ?? null;
  const older = reports
    .filter((r) => (r.kind === 'period' && r !== latest) || r.kind === 'monthly')
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  const [pastOpen, setPastOpen] = useState(false);
  const [rebuilding, setRebuilding] = useState(null);

  const download = (key, which) =>
    run(() => downloadReport(key, which), null, 'Could not download');
  const rebuild = (r) =>
    confirm({
      title: `Rebuild ${r.label}?`,
      body: 'The spreadsheet and photos are made again from every receipt in that period as it is now, including accounts Finance has given and receipts moved in or out.',
      confirmLabel: 'Rebuild',
      onConfirm: async () => {
        setRebuilding(r.dateKey);
        try {
          const res = await rebuildPeriod(r.periodId ?? r.dateKey);
          notify('Rebuilt', `${r.label}: ${res.receipts} receipts, $${formatAmount(res.totalCents)}.`);
        } catch (err) {
          notify('Could not rebuild', plainError(err, 'Try again.'));
        } finally {
          setRebuilding(null);
        }
      },
    });

  const top = (
    <>
      {!currentPeriod && periods.length > 0 ? (
        <div style={styles.warn}>Today is outside the fiscal calendar loaded in the Hub, so receipts can't be filed yet. Finance needs to load the next year.</div>
      ) : null}
      {catchUp ? (
        <div style={styles.warn}>
          {catchUp.label} has ended. Receipts from {periodRange(catchUp)} are due by <strong>{fmtDayKey(catchUp.windowEndKey)}</strong> and go into {catchUp.label} on their own.
        </div>
      ) : null}
      {seesAll ? (
        <div style={styles.cards}>
          <div style={styles.card}>
            <p style={styles.kicker}>{currentPeriod ? currentPeriod.label + ' so far' : 'This period'}</p>
            <p style={styles.big}>{money(sum(allCurrent))} · {allCurrent.length} receipt{allCurrent.length === 1 ? '' : 's'}</p>
            {currentPeriod ? <p style={styles.small}>{periodRange(currentPeriod)} · report {fmtDayKey(addDay(currentPeriod.windowEndKey))}</p> : null}
          </div>
          <button style={{ ...styles.card, ...styles.cardButton, ...(uncodedCount ? styles.cardAmber : {}) }} onClick={() => setFilter('uncoded')}>
            <p style={{ ...styles.kicker, ...(uncodedCount ? { color: '#E8B93B' } : {}) }}>{NOT_CODED}</p>
            <p style={styles.big}>{uncodedCount} receipt{uncodedCount === 1 ? '' : 's'}</p>
            <p style={styles.small}>{uncodedCount ? 'Give each one an account before the report.' : 'Every receipt has an account.'}</p>
          </button>
          <div style={styles.card}>
            <p style={styles.kicker}>{latest ? latest.label.split(' (')[0] + ' report' : 'Period reports'}</p>
            {latest ? (
              <>
                <p style={styles.big}>
                  {(latest.downloadedByUids ?? []).includes(user?.uid) ? 'Downloaded' : 'Ready'}
                  {(latest.changedReceiptIds ?? []).length ? <span style={styles.stale}> · needs a rebuild</span> : null}
                </p>
                <div style={styles.cardActions}>
                  <button data-primary="" style={d.primary} onClick={() => download(latest.dateKey)}>Spreadsheet</button>
                  {latest.archivePath ? <button style={d.ghost} onClick={() => download(latest.dateKey, 'photos')}>Photos</button> : null}
                  {isAdmin || isFinance ? (
                    <button style={d.ghost} disabled={rebuilding === latest.dateKey} onClick={() => rebuild(latest)}>
                      {rebuilding === latest.dateKey ? 'Rebuilding…' : 'Rebuild'}
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <p style={styles.small}>The first report is made the Saturday after a period's catch-up week.</p>
            )}
          </div>
        </div>
      ) : (
        <div style={styles.bar}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <p style={styles.kicker}>This period</p>
            <p style={{ ...styles.big, fontSize: 16 }}>{currentPeriod ? currentPeriod.label + ' · ' + periodRange(currentPeriod) : '—'}</p>
          </div>
          <div style={styles.barStats}>
            <div><p style={styles.small}>Your receipts</p><p style={styles.big}>{myCurrent.length}</p></div>
            <div><p style={styles.small}>Your total</p><p style={styles.big}>{money(sum(myCurrent))}</p></div>
            {currentPeriod ? <div><p style={styles.small}>Report goes to Finance</p><p style={styles.big}>{fmtDayKey(addDay(currentPeriod.windowEndKey))}</p></div> : null}
          </div>
        </div>
      )}
      {seesAll ? (
        <div style={styles.toolsRow}>
          <label style={styles.selectLabel}>
            Person
            <select style={styles.smallSelect} value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="all">Everyone</option>
              {people.map(([uid, name]) => <option key={uid} value={uid}>{name}</option>)}
            </select>
          </label>
          <label style={styles.selectLabel}>
            Location
            <select style={styles.smallSelect} value={place} onChange={(e) => setPlace(e.target.value)}>
              <option value="all">All</option>
              <option value="corporate">Corporate</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
          <span style={{ flex: 1 }} />
          {isAdmin || isFinance ? <button style={d.ghost} onClick={() => setManaging(true)}>Manage accounts</button> : null}
          {older.length ? <button style={d.ghost} onClick={() => setPastOpen((v) => !v)}>{pastOpen ? 'Hide past reports' : `Past reports · ${older.length}`}</button> : null}
        </div>
      ) : null}
      {seesAll && pastOpen ? (
        <div style={{ ...styles.card, marginBottom: 14 }}>
          {older.map((r) => (
            <div key={r.dateKey} style={styles.pastRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{r.label}{r.kind === 'monthly' ? <span style={styles.muted}> · before fiscal periods</span> : null}</div>
                <div style={styles.small}>{r.receiptCount} receipt{r.receiptCount === 1 ? '' : 's'} · {money(r.totalCents)}</div>
              </div>
              {r.archivePath ? <button style={d.ghost} onClick={() => download(r.dateKey, 'photos')}>Photos</button> : null}
              <button style={d.ghost} onClick={() => download(r.dateKey)}>Download</button>
              {r.kind === 'period' && (isAdmin || isFinance) ? <button style={d.ghost} disabled={rebuilding === r.dateKey} onClick={() => rebuild(r)}>{rebuilding === r.dateKey ? 'Rebuilding…' : 'Rebuild'}</button> : null}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );

  // ---------------------------------------------------------------- detail
  const [recodeTo, setRecodeTo] = useState('');
  useEffect(() => setRecodeTo(selected?.accountCode ?? ''), [selected?.id, selected?.accountCode]);
  const isPdf = (r) => (r?.storagePath ?? '').toLowerCase().endsWith('.pdf');
  const canFinance = isAdmin || isFinance;

  const detail = selected ? (
    <div style={d.card}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <button style={styles.thumb} onClick={() => setViewing(selected)} aria-label="View the receipt">
          {urls[selected.id] && !isPdf(selected) ? <img src={urls[selected.id]} alt="" style={styles.thumbImg} /> : <span style={styles.small}>{isPdf(selected) ? 'PDF' : selected.imageDeletedAt ? 'Photo removed' : 'Photo'}</span>}
        </button>
        <div style={{ minWidth: 0 }}>
          <p style={{ ...d.kicker, color: selected.voided ? '#F87171' : selected.accountCode ? 'var(--text-tertiary)' : '#E8B93B' }}>
            {selected.voided ? 'Voided' : selected.accountCode ? selected.accountHeading || 'Account' : NOT_CODED}
          </p>
          <p style={styles.amount}>{money(selected.amountCents)}</p>
          <p style={styles.small}>{accountLabel(selected) ?? (selected.categoryLabel ? 'was "' + selected.categoryLabel + '"' : NOT_CODED)}</p>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        {[
          ['Spent', fmtDayKey(selected.dateSpent)],
          ...(seesAll ? [['Who', selected.submittedByName]] : []),
          ['Where', selected.where],
          ['Why', selected.reason],
          ...(selected.attendees ? [['Who was there', selected.attendees]] : []),
          ['Location', selected.chargeToName ?? 'Corporate'],
          ['Period', selected.periodLabel ?? '—'],
          ['Filed', fmtDayTime(selected.submittedAt)],
        ].map(([k, v]) => (
          <div key={k} style={d.row}><span style={d.k}>{k}</span><span style={d.v}>{v}</span></div>
        ))}
      </div>
      {selected.voided ? <p style={{ ...styles.small, color: '#F87171', marginTop: 10 }}>Voided by {selected.voidedBy}: {selected.voidedReason}</p> : null}
      <div style={d.actions}>
        <button style={d.ghost} onClick={() => setViewing(selected)}>View receipt</button>
        {isEditable(selected) ? (
          <>
            <button style={d.ghost} onClick={() => setForm({ mode: 'edit', receipt: selected })}>Edit</button>
            <button style={styles.danger} onClick={() => setVoiding(selected)}>Void…</button>
          </>
        ) : null}
      </div>
      {!selected.voided && selected.submittedByUid === user?.uid && !isEditable(selected) ? (
        <p style={{ ...styles.small, marginTop: 10 }}>This period's report has been made. Ask Finance if something needs changing.</p>
      ) : selected.submittedByUid === user?.uid && !selected.voided ? (
        <p style={{ ...styles.small, marginTop: 10 }}>You can edit or void it until the period's report is made.</p>
      ) : null}

      {canFinance ? (
        <div style={d.section}>
          <p style={d.sectionLabel}>FINANCE</p>
          <label style={styles.fieldLabel}>
            Account
            <AccountSelect accounts={accounts} value={recodeTo} onChange={setRecodeTo} includeRetired={selected.accountCode} />
          </label>
          <div style={d.actions}>
            <button
              data-primary=""
              style={d.primary}
              disabled={busy || !recodeTo || recodeTo === selected.accountCode}
              onClick={() => run(() => recodeReceipt(selected.id, recodeTo), () => notify('Account saved', 'Any report already made for this period is marked as needing a rebuild.'))}
            >
              Save account
            </button>
            <button style={d.ghost} onClick={() => setMoving(selected)}>Move to another period…</button>
            {!selected.voided && !isEditable(selected) ? <button style={styles.danger} onClick={() => setVoiding(selected)}>Void…</button> : null}
          </div>
          <p style={{ ...styles.small, marginTop: 8 }}>Finance can change the account, never the amount. Every change is kept with who made it and when.</p>
          {[...(selected.recodes ?? []), ...(selected.editHistory ?? []).map((e) => ({ ...e, edit: true }))]
            .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
            .map((h, i) => (
              <p key={i} style={d.history}>
                {fmtDayTime(h.at)} · {h.byName}: {h.edit ? 'edited ' + (h.fields ?? []).join(', ') : h.from + ' → ' + h.to}
              </p>
            ))}
          {selected.movedByName ? <p style={d.history}>Moved from {selected.previousPeriodLabel ?? 'another period'} by {selected.movedByName}</p> : null}
        </div>
      ) : null}
    </div>
  ) : (
    <div style={d.placeholder}>{loading ? 'Loading…' : 'Pick a receipt to see it here.'}</div>
  );

  return (
    <>
      <RequestPage
        title="Expenses"
        subtitle={seesAll ? "Every executive's receipts, coded to Sam's accounts, and each period's report." : "Receipts for things you've already paid for. They go to Finance in each period's report."}
        actionLabel="+ Add receipt"
        onAction={() => setForm({ mode: 'add' })}
        filters={filters.map(([key, label, test]) => ({ key, label, count: mine.filter(test).filter(byPerson).filter(byPlace).length }))}
        filter={active[0]}
        onFilter={(k) => {
          setFilter(k);
          setSelectedId(null);
        }}
        columns={columns}
        rows={rows}
        selectedId={selected?.id}
        onSelect={setSelectedId}
        detail={detail}
        phoneRow={(r) => (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>
                {r.voided ? 'Voided' : r.accountName ?? NOT_CODED}
              </span>
              <span style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                {fmtDayKey(r.dateSpent)} · {seesAll ? r.submittedByName : r.where}
              </span>
            </span>
            <span style={{ fontSize: 15, fontWeight: 800, ...(r.voided ? { textDecoration: 'line-through', color: 'var(--text-tertiary)' } : {}) }}>{money(r.amountCents)}</span>
          </span>
        )}
        empty={loading ? 'Loading…' : filter === 'uncoded' ? 'Every receipt has an account.' : 'No receipts here yet. Add one with + Add receipt.'}
      >
        {top}
      </RequestPage>

      {form ? (
        <ReceiptForm
          mode={form.mode}
          receipt={form.receipt}
          accounts={accounts}
          locations={locations}
          periods={periods}
          myReceipts={receipts.filter((r) => r.submittedByUid === user?.uid)}
          notify={notify}
          onClose={() => setForm(null)}
          onSave={async (fields, file) => {
            if (form.mode === 'add') {
              const res = await submitReceipt({ file, ...fields });
              notify('Receipt added', res?.periodLabel ? `It goes into ${res.periodLabel}.` : 'Saved.');
              setSelectedId(res?.id ?? null);
            } else {
              await editReceipt(form.receipt.id, fields);
              notify('Receipt updated', 'Your changes are saved.');
            }
            setForm(null);
          }}
        />
      ) : null}

      {voiding ? (
        <ReasonModal
          title={`Void this ${money(voiding.amountCents)} receipt?`}
          body="It stays on the list, greyed out, but no longer counts toward any total. Say why, so Finance knows."
          confirmLabel="Void"
          onClose={() => setVoiding(null)}
          onConfirm={(reason) => run(() => voidReceipt(voiding.id, reason), () => setVoiding(null), 'Could not void it')}
          busy={busy}
        />
      ) : null}

      {moving ? (
        <MoveModal
          receipt={moving}
          periods={periods}
          busy={busy}
          onClose={() => setMoving(null)}
          onMove={(periodId) =>
            run(() => movePeriod(moving.id, periodId), (res) => {
              setMoving(null);
              notify('Moved', `Now in ${periods.find((p) => p.id === periodId)?.label ?? 'that period'}.` + ((res?.flagged ?? []).length ? ' A report already made is marked as needing a rebuild.' : ''));
            }, 'Could not move it')
          }
        />
      ) : null}

      {viewing ? (
        <div data-modal="" style={styles.backdrop} onClick={() => setViewing(null)}>
          <div style={{ ...styles.modal, width: 'min(560px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            {urls[viewing.id] ? (
              isPdf(viewing) ? (
                <a href={urls[viewing.id]} target="_blank" rel="noreferrer" style={styles.pdfOpen}>Open the PDF</a>
              ) : (
                <img src={urls[viewing.id]} alt="The receipt" style={styles.viewerImg} />
              )
            ) : (
              <p style={styles.small}>{viewing.imageDeletedAt ? 'The photo was removed after ninety days. The record is still here.' : 'The photo is loading or unavailable.'}</p>
            )}
            <p style={{ ...styles.amount, marginTop: 12 }}>{money(viewing.amountCents)}</p>
            <p style={styles.small}>{accountLabel(viewing) ?? NOT_CODED} · {viewing.where} · {fmtDayKey(viewing.dateSpent)}</p>
            <div style={{ ...d.actions, justifyContent: 'flex-end' }}>
              <button style={d.ghost} onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}

      {managing ? (
        <ManageAccounts
          accounts={accounts}
          notify={notify}
          confirm={confirm}
          onClose={() => setManaging(false)}
          addAccount={addAccount}
          setAccountRetired={setAccountRetired}
        />
      ) : null}
      {dialogNode}
    </>
  );
}

// The day after a 'YYYY-MM-DD' key - the report is made the Saturday after
// the catch-up week's last day.
function addDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ pieces

// A plain grouped list of Sam's accounts, for Finance's quick recode.
function AccountSelect({ accounts, value, onChange, includeRetired }) {
  const headings = [...new Set(accounts.map((a) => a.heading))];
  return (
    <select style={styles.input} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose an account…</option>
      {headings.map((h) => (
        <optgroup key={h} label={h}>
          {accounts
            .filter((a) => a.heading === h && (!a.retired || a.code === includeRetired))
            .map((a) => (
              <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

// "What was it for?" - search, your most-used first, then Sam's headings.
function AccountPicker({ accounts, value, onChange, recent }) {
  const [open, setOpen] = useState(!value);
  const [q, setQ] = useState('');
  const chosen = accounts.find((a) => a.code === value);
  const live = accounts.filter((a) => !a.retired);
  const query = q.trim().toLowerCase();
  const matches = query
    ? live.filter((a) => (a.code + ' ' + a.name + ' ' + a.heading).toLowerCase().includes(query))
    : live;
  const recentList = query ? [] : recent.map((c) => live.find((a) => a.code === c)).filter(Boolean);
  const headings = [...new Set(matches.map((a) => a.heading))];
  const pick = (code) => {
    onChange(code);
    setOpen(false);
    setQ('');
  };
  const row = (a) => (
    <button key={a.code} type="button" style={{ ...styles.pickRow, ...(a.code === value ? styles.pickRowOn : {}) }} onClick={() => pick(a.code)}>
      <span style={styles.pickCode}>{a.code}</span> {a.name}
    </button>
  );
  return (
    <div>
      <button type="button" style={{ ...styles.input, ...styles.pickField, ...(open ? { border: '1px solid var(--neon)' } : {}) }} onClick={() => setOpen((v) => !v)}>
        <span>{chosen ? chosen.code + ' · ' + chosen.name : 'Choose an account…'}</span>
        <span style={{ color: 'var(--text-tertiary)' }}>{open ? '▴' : '▾'}</span>
      </button>
      {open ? (
        <div style={styles.pickPanel}>
          <input autoFocus style={{ ...styles.input, marginBottom: 6 }} placeholder="Search: gas, meals, 7255…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search accounts" />
          <div style={styles.pickScroll}>
            {recentList.length ? (
              <>
                <p style={{ ...styles.pickHead, color: 'var(--neon)' }}>You use these most</p>
                {recentList.map(row)}
              </>
            ) : null}
            {headings.map((h) => (
              <div key={h}>
                <p style={styles.pickHead}>{h}</p>
                {matches.filter((a) => a.heading === h).map(row)}
              </div>
            ))}
            {matches.length === 0 ? <p style={styles.small}>No account matches "{q}".</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReceiptForm({ mode, receipt, accounts, locations, periods, myReceipts, notify, onClose, onSave }) {
  const editing = mode === 'edit';
  const today = centralDateKey(new Date());
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [amount, setAmount] = useState(editing ? formatAmount(receipt.amountCents) : '');
  const [dateSpent, setDateSpent] = useState(editing ? receipt.dateSpent : today);
  const [accountCode, setAccountCode] = useState(editing ? receipt.accountCode ?? '' : '');
  const [attendees, setAttendees] = useState(editing ? receipt.attendees ?? '' : '');
  const [where, setWhere] = useState(editing ? receipt.where : '');
  const [reason, setReason] = useState(editing ? receipt.reason : '');
  // A receipt filed under the old charge-to list ("General", "Events"…)
  // keeps it unless a location is picked.
  const legacyPlace = editing && !receipt.locationId && (receipt.chargeToName ?? 'Corporate') !== 'Corporate' ? receipt.chargeToName : null;
  const [locationId, setLocationId] = useState(editing ? receipt.locationId ?? (legacyPlace ? 'keep' : 'corporate') : 'corporate');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The three accounts this person files under most.
  const recent = useMemo(() => {
    const n = {};
    myReceipts.forEach((r) => r.accountCode && (n[r.accountCode] = (n[r.accountCode] ?? 0) + 1));
    return Object.keys(n).sort((a, b) => n[b] - n[a]).slice(0, 3);
  }, [myReceipts]);

  const cents = parseAmount(amount);
  const period = previewPeriod(periods, dateSpent, today);
  const ready = (editing || file) && cents !== null && accountCode && where.trim().length >= 2 && reason.trim().length >= 2 && dateSpent;

  const save = async () => {
    if (!ready) return;
    setSaving(true);
    try {
      await onSave(
        {
          amountCents: cents,
          dateSpent,
          accountCode,
          attendees: accountCode === ATTENDEES_ACCOUNT ? attendees.trim() : null,
          where: where.trim(),
          reason: reason.trim(),
          locationId: locationId === 'corporate' ? null : locationId,
        },
        file
      );
    } catch (err) {
      notify(editing ? 'Could not save it' : 'Could not add it', plainError(err, 'Nothing was saved. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-modal="" data-modal-keep="" style={styles.backdrop} onClick={() => !saving && onClose()}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>{editing ? 'Edit receipt' : 'Add receipt'}</h2>
          <button style={styles.close} aria-label="Close" onClick={onClose}>✕</button>
        </div>

        {editing ? (
          <p style={styles.small}>The photo stays the same. To change the photo, void this one and add it again.</p>
        ) : preview ? (
          <div style={styles.previewWrap}>
            {file?.type === 'application/pdf' ? <span style={styles.pdfBadge}>PDF · {file.name}</span> : <img src={preview} alt="" style={styles.preview} />}
            <button style={d.ghost} onClick={() => setFile(null)}>Remove</button>
          </div>
        ) : (
          <button style={styles.photoButton} onClick={() => fileRef.current?.click()}>+ Take or choose a photo of the receipt (or a PDF)</button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            if (picked && picked.size >= 12 * 1024 * 1024) {
              notify('That file is too large', 'Receipts can be up to 12 MB. Try a smaller photo or a PDF.');
              e.target.value = '';
              return;
            }
            setFile(picked);
          }}
        />

        <div style={styles.twoCol}>
          <label style={styles.fieldLabel}>
            Amount
            <input
              style={styles.input}
              value={amount}
              inputMode="decimal"
              placeholder="0.00"
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                const parts = cleaned.split('.');
                setAmount(parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}` : cleaned);
              }}
            />
          </label>
          <div style={styles.fieldLabel}>
            Date spent
            <DatePickerField value={dateSpent} onChange={setDateSpent} max={today} placeholder="Date spent" />
          </div>
        </div>

        <div style={styles.fieldLabel}>
          What was it for?
          <AccountPicker accounts={accounts} value={accountCode} onChange={setAccountCode} recent={recent} />
        </div>
        {accountCode === ATTENDEES_ACCOUNT ? (
          <label style={styles.fieldLabel}>
            Who was there
            <input style={styles.input} value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="Names, e.g. a vendor rep and the GM" />
          </label>
        ) : null}
        <label style={styles.fieldLabel}>
          Where
          <input style={styles.input} value={where} onChange={(e) => setWhere(e.target.value)} placeholder="The business on the receipt" />
        </label>
        <label style={styles.fieldLabel}>
          Why it was for the business
          <input style={styles.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="One line" />
        </label>
        <label style={styles.fieldLabel}>
          Location
          <select style={styles.input} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {legacyPlace ? <option value="keep">{legacyPlace} (as filed)</option> : null}
            <option value="corporate">Corporate</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
        {period ? <p style={styles.small}>Goes into {period.label} ({periodRange(period)}). Finance gets it in that period's report.</p> : null}

        <div style={styles.modalButtons}>
          <button style={d.ghost} onClick={onClose} disabled={saving}>Cancel</button>
          <button data-primary="" style={d.primary} disabled={!ready || saving} onClick={save}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReasonModal({ title, body, confirmLabel, onClose, onConfirm, busy }) {
  const [reason, setReason] = useState('');
  return (
    <div data-modal="" data-modal-keep="" style={styles.backdrop} onClick={onClose}>
      <div style={{ ...styles.modal, width: 'min(400px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>{title}</h2>
        <p style={styles.small}>{body}</p>
        <textarea autoFocus style={{ ...styles.input, minHeight: 70, resize: 'vertical' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why" />
        <div style={styles.modalButtons}>
          <button style={d.ghost} onClick={onClose}>Keep it</button>
          <button style={styles.dangerFill} disabled={busy || reason.trim().length < 2} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function MoveModal({ receipt, periods, busy, onClose, onMove }) {
  const [to, setTo] = useState(receipt.periodId ?? '');
  return (
    <div data-modal="" data-modal-keep="" style={styles.backdrop} onClick={onClose}>
      <div style={{ ...styles.modal, width: 'min(420px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>Move to another period</h2>
        <p style={styles.small}>
          {money(receipt.amountCents)} · {receipt.submittedByName} · spent {fmtDayKey(receipt.dateSpent)}. Now in {receipt.periodLabel ?? 'no period'}. A report already made on either side is marked as needing a rebuild.
        </p>
        <select style={styles.input} value={to} onChange={(e) => setTo(e.target.value)}>
          {periods.slice().reverse().map((p) => <option key={p.id} value={p.id}>{p.label} ({periodRange(p)})</option>)}
        </select>
        <div style={styles.modalButtons}>
          <button style={d.ghost} onClick={onClose}>Cancel</button>
          <button data-primary="" style={d.primary} disabled={busy || !to || to === receipt.periodId} onClick={() => onMove(to)}>Move</button>
        </div>
      </div>
    </div>
  );
}

function ManageAccounts({ accounts, notify, confirm, onClose, addAccount, setAccountRetired }) {
  const headings = [...new Set(accounts.map((a) => a.heading))];
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [heading, setHeading] = useState(headings[0] ?? '');
  const [saving, setSaving] = useState(false);
  const add = async () => {
    setSaving(true);
    try {
      await addAccount({ code, name, heading });
      setCode('');
      setName('');
      notify('Account added', 'Everyone can file under it now.');
    } catch (err) {
      notify('Could not add it', plainError(err, 'Nothing was saved. Try again.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div data-modal="" data-modal-keep="" style={styles.backdrop} onClick={onClose}>
      <div style={{ ...styles.modal, width: 'min(560px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>Accounts</h2>
          <button style={styles.close} aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <p style={styles.small}>Sam's accounts, in his order. A retired account can't be picked for new receipts but stays on old receipts and reports.</p>
        <div style={styles.addAccountRow}>
          <input style={{ ...styles.input, flex: '0 0 90px' }} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" aria-label="Account code" />
          <input style={{ ...styles.input, flex: '1 1 160px' }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Account name" aria-label="Account name" />
          <select style={{ ...styles.input, flex: '1 1 140px' }} value={heading} onChange={(e) => setHeading(e.target.value)} aria-label="Heading">
            {headings.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <button data-primary="" style={d.primary} disabled={saving || !code.trim() || !name.trim()} onClick={add}>Add</button>
        </div>
        <div style={styles.accountsScroll}>
          {headings.map((h) => (
            <div key={h}>
              <p style={styles.pickHead}>{h}</p>
              {accounts.filter((a) => a.heading === h).map((a) => (
                <div key={a.code} style={{ ...styles.pastRow, opacity: a.retired ? 0.5 : 1 }}>
                  <span style={{ flex: 1, fontSize: 13 }}><span style={styles.pickCode}>{a.code}</span> {a.name}{a.retired ? ' · retired' : ''}</span>
                  <button
                    style={d.ghost}
                    onClick={() =>
                      a.retired
                        ? setAccountRetired(a.code, false).catch((err) => notify('Nothing was changed', plainError(err)))
                        : confirm({
                            title: `Retire ${a.code} · ${a.name}?`,
                            body: 'Nobody can pick it for a new receipt. Receipts and reports that already use it keep it.',
                            confirmLabel: 'Retire',
                            onConfirm: () => setAccountRetired(a.code, true).catch((err) => notify('Nothing was changed', plainError(err))),
                          })
                    }
                  >
                    {a.retired ? 'Reopen' : 'Retire'}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  nowrap: { whiteSpace: 'nowrap', color: 'var(--text-secondary)' },
  muted: { color: 'var(--text-tertiary)', fontSize: 12 },
  warn: { background: 'rgba(232,185,59,0.1)', border: '1px solid rgba(232,185,59,0.35)', color: 'var(--text-primary)', borderRadius: 12, padding: '12px 16px', fontSize: 13, marginBottom: 14 },
  bar: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: '#1A1A20', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 14 },
  barStats: { display: 'flex', gap: 28, flexWrap: 'wrap' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 14 },
  card: { background: '#1A1A20', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', textAlign: 'left', color: 'var(--text-primary)', fontFamily: 'inherit' },
  cardButton: { cursor: 'pointer' },
  cardAmber: { borderColor: 'rgba(232,185,59,0.4)' },
  cardActions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  kicker: { margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  big: { margin: '4px 0 0', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' },
  small: { margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 },
  stale: { fontSize: 12, fontWeight: 700, color: '#E8B93B' },
  toolsRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
  selectLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)' },
  smallSelect: { background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, height: 32, color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 12, padding: '0 8px' },
  pastRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid var(--border)' },
  thumb: { width: 84, height: 112, borderRadius: 8, background: 'var(--bg-inset)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', padding: 0, cursor: 'pointer' },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover' },
  amount: { margin: '6px 0 2px', fontSize: 24, fontWeight: 900, color: 'var(--text-primary)' },
  danger: { background: 'none', border: '1px solid rgba(232,82,75,0.5)', color: '#F87171', borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  dangerFill: { background: '#B42F28', border: 'none', color: '#FFFFFF', borderRadius: 8, padding: '8px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  backdrop: { ...modalBackdrop },
  modal: { ...modalSurface, width: 'min(460px, 100%)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 },
  modalHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' },
  close: { background: 'none', border: 'none', color: 'var(--accent)', width: 32, height: 32, borderRadius: 8, fontSize: 16, cursor: 'pointer' },
  modalButtons: { display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
  fieldLabel: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' },
  input: { width: '100%', boxSizing: 'border-box', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 11px', minHeight: 40, fontSize: 14, color: 'var(--text-primary)', fontFamily: 'inherit' },
  photoButton: { minHeight: 90, border: '1px dashed var(--border-strong)', borderRadius: 12, background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  previewWrap: { display: 'flex', alignItems: 'center', gap: 12 },
  preview: { width: 90, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' },
  pdfBadge: { fontSize: 13, color: 'var(--text-secondary)' },
  pickField: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left', cursor: 'pointer' },
  pickPanel: { marginTop: 6, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 10, padding: 8 },
  pickScroll: { maxHeight: 260, overflowY: 'auto' },
  pickHead: { margin: '8px 4px 2px', fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  pickRow: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderRadius: 8, padding: '8px 8px', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  pickRowOn: { background: 'rgba(34,211,238,0.1)' },
  pickCode: { color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums', marginRight: 4 },
  viewerImg: { width: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 10, background: '#000' },
  pdfOpen: { display: 'inline-block', padding: '12px 16px', border: '1px solid var(--border-strong)', borderRadius: 10, color: 'var(--neon)', fontWeight: 700, textDecoration: 'none' },
  addAccountRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  accountsScroll: { maxHeight: '50vh', overflowY: 'auto' },
};
