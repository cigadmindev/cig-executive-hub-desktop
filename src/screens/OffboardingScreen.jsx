import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../context/AuthContext';
import { useOffboarding, OFFBOARDING_STEPS } from '../context/OffboardingContext';
import { useDialog } from '../hooks/useDialog';
import { nike } from '../theme/nike';

const when = (t) => (t ? new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '');

// What to revoke when someone leaves, and what to put back if they return.
//
// Deactivating someone keeps their record, which is right - but everything
// else lived in one person's head: Drive, Toast, R365, OpenTable, the email,
// the laptop. This is that list, with the state recorded rather than
// remembered.
export default function OffboardingScreen() {
  const { user } = useAuth();
  const { records, setStep } = useOffboarding();
  const { dialogNode, confirm, notify } = useDialog();
  const [busy, setBusy] = useState(null);

  if (user?.role !== 'admin') {
    return (
      <div style={styles.page}>
        <p style={styles.hint}>Admins only.</p>
      </div>
    );
  }

  const runDrive = (record, restoring) => {
    confirm({
      title: restoring ? `Restore ${record.name}'s Drive access?` : `Remove ${record.name} from Drive?`,
      body: restoring
        ? 'They go back to exactly the folders and roles they had before, from what was recorded when access was removed.'
        : 'They are removed from the shared drive and every folder inside it. What is removed is recorded, so it can be put back if they return.',
      confirmLabel: restoring ? 'Restore' : 'Remove',
      tone: restoring ? undefined : 'danger',
      onConfirm: async () => {
        setBusy(record.uid);
        try {
          const fns = getFunctions(undefined, 'us-central1');
          if (restoring) {
            const res = await httpsCallable(fns, 'restoreDriveAccess')({ uid: record.uid });
            notify('Drive restored', `Put back in ${res.data.restored} of ${res.data.of} places.`);
          } else {
            const res = await httpsCallable(fns, 'removeDriveAccess')({ uid: record.uid, email: record.email });
            notify('Removed from Drive', `Taken out of ${res.data.removed} place${res.data.removed === 1 ? '' : 's'}.`);
          }
        } catch (err) {
          // Walking every folder can outlast what the browser waits for while
          // still finishing, so this does not flatly claim failure.
          notify(
            'Still working, or something went wrong',
            'If this took a while it probably finished — reopen this page to check. Otherwise: ' +
              (err?.message ?? 'something went wrong.')
          );
        } finally {
          setBusy(null);
        }
      },
    });
  };

  return (
    <div style={styles.page}>
      <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>Offboarding</h1>
      <p style={styles.subtitle}>What to revoke outside the Hub when someone leaves.</p>

      {records.length === 0 ? (
        <p style={styles.hint}>Nobody has been deactivated.</p>
      ) : (
        records.map((r) => {
          const returning = !!r.reactivatedAt;
          const which = returning ? 'restoreSteps' : 'steps';
          const driveDone = returning ? !!r.driveRestoredAt : !!r.driveRemoved;
          const stepsLeft = OFFBOARDING_STEPS.filter((s) => !r[which]?.[s.key]?.done).length + (driveDone ? 0 : 1);

          return (
            <div key={r.id} style={{ ...styles.card, ...(stepsLeft > 0 ? styles.cardOpen : {}) }}>
              <div style={styles.cardHead}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={styles.name}>{r.name}</p>
                  <p style={styles.meta}>
                    Deactivated {when(r.deactivatedAt)}
                    {r.deactivatedBy ? ` by ${r.deactivatedBy}` : ''}
                    {returning ? ` · reactivated ${when(r.reactivatedAt)}` : ''}
                    {stepsLeft > 0 ? ` · ${stepsLeft} left` : ' · all done'}
                  </p>
                </div>
                <span style={stepsLeft > 0 ? styles.pillOpen : styles.pillDone}>
                  {stepsLeft > 0 ? (returning ? 'Restoring' : 'In progress') : 'Done'}
                </span>
              </div>

              <div style={styles.steps}>
                <div style={styles.stepRow}>
                  <span style={driveDone ? styles.tickDone : styles.tick}>{driveDone ? '☑' : '☐'}</span>
                  <div style={{ flex: 1 }}>
                    <p style={styles.stepLabel}>Drive access</p>
                    {r.driveRemoved ? (
                      <p style={styles.stepMeta}>
                        Removed from {r.driveRemoved.entries?.length ?? 0} folders on {when(r.driveRemoved.at)}
                        {r.driveRestoredAt ? ` · restored ${when(r.driveRestoredAt)}` : ''}
                      </p>
                    ) : null}
                  </div>
                  <button
                    style={styles.driveButton}
                    disabled={busy === r.uid}
                    onClick={() => runDrive(r, returning && !!r.driveRemoved)}
                  >
                    {busy === r.uid
                      ? 'Working…'
                      : returning && r.driveRemoved
                        ? r.driveRestoredAt
                          ? 'Restore again'
                          : 'Restore'
                        : r.driveRemoved
                          ? 'Remove again'
                          : 'Remove from Drive'}
                  </button>
                </div>

                {OFFBOARDING_STEPS.map((s) => {
                  const done = !!r[which]?.[s.key]?.done;
                  return (
                    <button
                      key={s.key}
                      style={styles.stepRow}
                      onClick={() => setStep(r.uid, s.key, !done, which)}
                    >
                      <span style={done ? styles.tickDone : styles.tick}>{done ? '☑' : '☐'}</span>
                      <p style={{ ...styles.stepLabel, flex: 1, textAlign: 'left' }}>
                        {returning ? 'Restore ' + s.label.toLowerCase() : s.label}
                      </p>
                      {done ? <span style={styles.stepMeta}>{when(r[which][s.key].at)}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {dialogNode}
    </div>
  );
}

const styles = {
  page: { padding: '28px max(22px, min(36px, 4vw))', maxWidth: 680 },
  title: { fontSize: 22, fontWeight: 700, margin: '0 0 4px' },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' },
  hint: { fontSize: 13, color: 'var(--text-tertiary)' },

  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 12, overflow: 'hidden' },
  cardOpen: { borderColor: 'rgba(201,162,39,0.4)' },
  cardHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)' },
  name: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 },
  meta: { fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' },
  pillOpen: { fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: 'rgba(201,162,39,0.16)', color: '#C9A227' },
  pillDone: { fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: 'var(--bg-inset)', color: 'var(--text-tertiary)' },

  steps: { padding: '4px 14px 12px' },
  stepRow: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 0', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' },
  tick: { fontSize: 16, color: 'var(--text-tertiary)' },
  tickDone: { fontSize: 16, color: 'var(--neon)' },
  stepLabel: { fontSize: 13, color: 'var(--text-primary)', margin: 0 },
  stepMeta: { fontSize: 12, color: 'var(--text-secondary)', margin: '1px 0 0' },
  driveButton: { padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
};
