import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRenewals, isRenewalDueSoon } from '../context/RenewalsContext';
import { brands } from '../data/mockData';
import { useCustomLocations } from '../context/CustomLocationsContext';
import DatePickerField from '../components/DatePickerField';
import { useSchedule } from '../context/ScheduleContext';
import { nike } from '../theme/nike';

function formatDate(ts) {
  if (!ts) return 'Not set';
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RenewalsScreen() {
  const { brandId, locationId } = useParams();
  const { user } = useAuth();
  const { getByLocation, ensureSeeded, updateDates, markRenewed } = useRenewals();
  const { getByBrand } = useCustomLocations();
  const { entries, updateEntry } = useSchedule();

  // If this permit/license has an initial "get this for the first time"
  // calendar task still open, saving real dates here completes it — same
  // document, so it disappears from the Calendar's urgent list right away.
  const completeLinkedCalendarTask = (type) => {
    const linked = entries.find(
      (e) => e.locationId === locationId && e.renewalItem && e.renewalType === type && !e.done
    );
    if (linked) {
      updateEntry(linked.id, { done: true, doneBy: user?.name ?? 'Unknown', doneAt: Date.now() });
    }
  };

  const brand = brands.find((b) => b.id === brandId);
  const allLocations = brand ? [...brand.locations, ...getByBrand(brand.id).map((l) => ({ id: l.id, name: l.name }))] : [];
  const location = allLocations.find((l) => l.id === locationId);

  const [editingItem, setEditingItem] = useState(null);
  const [editApproved, setEditApproved] = useState('');
  const [editExpiration, setEditExpiration] = useState('');

  const [signOffItem, setSignOffItem] = useState(null);
  const [signOffName, setSignOffName] = useState('');
  const [signOffDate, setSignOffDate] = useState('');

  useEffect(() => {
    if (locationId) ensureSeeded(locationId);
  }, [locationId]);

  const items = getByLocation(locationId);

  const openEdit = (item) => {
    setEditingItem(item);
    setEditApproved(item.approvedDate ? new Date(item.approvedDate).toISOString().slice(0, 10) : '');
    setEditExpiration(item.expirationDate ? new Date(item.expirationDate).toISOString().slice(0, 10) : '');
  };
  const saveEdit = async () => {
    const approvedTs = editApproved ? new Date(editApproved).getTime() : null;
    const expirationTs = editExpiration ? new Date(editExpiration).getTime() : null;
    await updateDates(editingItem.id, approvedTs, expirationTs);
    if (approvedTs && expirationTs) completeLinkedCalendarTask(editingItem.type);
    setEditingItem(null);
  };

  const openSignOff = (item) => {
    setSignOffItem(item);
    setSignOffName(user?.name ?? '');
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    setSignOffDate(nextYear.toISOString().slice(0, 10));
  };
  const confirmSignOff = async () => {
    await markRenewed(signOffItem.id, signOffName.trim() || user?.name || 'Unknown', new Date(signOffDate).getTime());
    completeLinkedCalendarTask(signOffItem.type);
    setSignOffItem(null);
  };

  if (!brand || !location) return null;

  return (
    <div style={styles.page}>
      <Link to={`/brand/${brand.id}/location/${location.id}`} style={styles.backLink}>
        ‹ {location.name}
      </Link>
      <h1 style={{ ...styles.title, ...nike.pageTitleSm }}>License & Lease Renewals</h1>

      <div style={styles.body}>
        {items.map((item) => {
          const dueSoon = isRenewalDueSoon(item);
          return (
            <div key={item.id} style={{ ...styles.card, borderColor: dueSoon ? 'var(--danger)' : 'var(--border)' }}>
              <div style={styles.cardHeaderRow}>
                <span style={styles.cardTitle}>{item.type}</span>
                {dueSoon ? (
                  <span style={{ ...styles.badge, background: 'var(--danger)' }}>DUE SOON</span>
                ) : item.expirationDate ? (
                  <span style={{ ...styles.badge, background: '#5C7A52' }}>OK</span>
                ) : null}
              </div>
              <p style={styles.dateLine}>Approved: {formatDate(item.approvedDate)}</p>
              <p style={styles.dateLine}>Expires / Renewal due: {formatDate(item.expirationDate)}</p>
              {item.signedOffBy ? <p style={styles.signOffNote}>Last renewed by {item.signedOffBy}</p> : null}

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button style={styles.cancelButton} onClick={() => openEdit(item)}>
                  Edit Dates
                </button>
                <button style={styles.saveButton} onClick={() => openSignOff(item)}>
                  Mark Renewed
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editingItem ? (
        <div style={styles.modalBackdrop} onClick={() => setEditingItem(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{editingItem.type}</h2>
            <label style={styles.label}>Approved Date</label>
            <DatePickerField value={editApproved} onChange={setEditApproved} placeholder="Not set" />
            <label style={styles.label}>Expiration / Renewal Due Date</label>
            <DatePickerField value={editExpiration} onChange={setEditExpiration} placeholder="Not set" />
            <p style={styles.modalNote}>Use this to correct a mistake. To actually renew, use "Mark Renewed" instead.</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button style={styles.cancelButton} onClick={() => setEditingItem(null)}>
                Cancel
              </button>
              <button style={styles.saveButton} onClick={saveEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {signOffItem ? (
        <div style={styles.modalBackdrop} onClick={() => setSignOffItem(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Mark Renewed</h2>
            <p style={styles.modalBody}>{signOffItem.type} — who's signing off?</p>
            <label style={styles.label}>Name</label>
            <input style={styles.input} value={signOffName} onChange={(e) => setSignOffName(e.target.value)} />
            <label style={styles.label}>New expiration / next renewal due date</label>
            <DatePickerField value={signOffDate} onChange={setSignOffDate} />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button style={styles.cancelButton} onClick={() => setSignOffItem(null)}>
                Cancel
              </button>
              <button style={styles.saveButton} onClick={confirmSignOff}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  page: { padding: '28px 36px', maxWidth: 640 },
  backLink: { fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-block', marginBottom: 14 },
  title: { fontSize: 22, fontWeight: 700, margin: '0 0 20px' },
  body: {},
  card: { background: 'var(--bg-card)', border: '1.5px solid', borderRadius: 12, padding: 16, marginBottom: 10 },
  cardHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: 700 },
  badge: { fontSize: 10, fontWeight: 700, color: '#FFFFFF', borderRadius: 6, padding: '3px 8px' },
  dateLine: { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' },
  signOffNote: { fontSize: 11, color: 'var(--text-secondary)', margin: '6px 0 0' },
  cancelButton: { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12 },
  saveButton: { padding: '8px 16px', borderRadius: 10, background: 'var(--neon)', color: 'var(--neon-text)', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' },

  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalCard: { width: 360, background: 'var(--bg-card)', border: 'none', borderRadius: 18, padding: 22, boxShadow: 'var(--shadow-lg)' },
  modalTitle: { fontSize: 19, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.2, color: '#FFFFFF', margin: '0 0 12px' },
  modalBody: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 },
  modalNote: { fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 },
  label: { display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, marginTop: 10 },
  input: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 7,
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  },
};
