import { accessLevel } from '../data/accessMatrix';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, query, orderBy, where } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useAuth } from './AuthContext';

// Catering orders and private event bookings, and where each one stands.
//
// They arrived as email and were worked out of an inbox - two people, two
// forms, and no way to tell what was waiting on whom. A function files them
// here; this is the tracking on top.
//
// Deliberately not a mailbox: the conversation stays in email, which is the
// right tool for it. What lives here is the state, the details agreed on the
// phone, and who is handling it.
const COLLECTION = 'cateringEnquiries';

// A private event finishes when it happens. Catering has to be paid for -
// private events are not charged.
export const STATES = ['new', 'talking', 'confirmed', 'done', 'lost'];

const CateringContext = createContext(undefined);

export function CateringProvider({ children }) {
  const { user } = useAuth();
  const [enquiries, setEnquiries] = useState([]);

  useEffect(() => {
    if (!user) {
      setEnquiries([]);
      return;
    }
    const seesAll = user.role === 'admin' || user.role === 'executive';
    const mine = user.permissions?.brandIds ?? [];
    if (!seesAll && mine.length === 0) {
      setEnquiries([]);
      return;
    }
    const source = seesAll
      ? query(collection(db, COLLECTION), orderBy('createdAt', 'desc'))
      : query(collection(db, COLLECTION), where('brandId', 'in', mine.slice(0, 30)), orderBy('createdAt', 'desc'));

    return onSnapshot(
      source,
      (snapshot) =>
        setEnquiries(
          snapshot.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              kind: x.kind ?? 'catering',
              name: x.name ?? '',
              email: x.email ?? '',
              phone: x.phone ?? '',
              organisation: x.organisation ?? '',
              occasion: x.occasion ?? '',
              guests: x.guests ?? '',
              preferredDate: x.preferredDate ?? null,
              preferredDateText: x.preferredDateText ?? '',
              preferredTime: x.preferredTime ?? '',
              // Private events only.
              space: x.space ?? '',
              style: x.style ?? '',
              about: x.about ?? '',
              // Catering only.
              fulfilment: x.fulfilment ?? '',
              address: x.address ?? '',

              locationId: x.locationId ?? null,
              locationName: x.locationName ?? '',
              brandId: x.brandId ?? null,
              brandName: x.brandName ?? '',

              status: x.status ?? 'new',
              ownerUid: x.ownerUid ?? null,
              ownerName: x.ownerName ?? '',
              // What was agreed on the phone - the part that used to live on
              // a notepad.
              minimum: x.minimum ?? '',
              finalGuests: x.finalGuests ?? '',
              details: x.details ?? '',
              invoicedAt: x.invoicedAt ?? null,
              paidAt: x.paidAt ?? null,
              createdAt: x.createdAt ?? 0,
              calendarEntryId: x.calendarEntryId ?? null,
              asReceived: x.asReceived ?? null,
              correctedByName: x.correctedByName ?? '',
              correctedAt: x.correctedAt ?? null,
              addedByHand: x.addedByHand === true,
              addedByName: x.addedByName ?? '',
              // When each step happened and who did it - the History list.
              claimedAt: x.claimedAt ?? null,
              confirmedAt: x.confirmedAt ?? null,
              confirmedByName: x.confirmedByName ?? '',
              doneAt: x.doneAt ?? null,
              doneByName: x.doneByName ?? '',
              lostAt: x.lostAt ?? null,
              lostByName: x.lostByName ?? '',
              lostReason: x.lostReason ?? '',
              statusChangedByName: x.statusChangedByName ?? '',
              statusChangedAt: x.statusChangedAt ?? null,
              statusChangeReason: x.statusChangeReason ?? '',
            };
          })
        ),
      (err) => console.error('[Catering] ' + err.code + ': ' + err.message)
    );
  }, [user]);

  // Anyone can add one by hand - a phone call, a walk-in, something that came
  // through a different route.
  const addEnquiry = async (fields) => {
    await addDoc(collection(db, COLLECTION), {
      ...fields,
      status: 'new',
      ownerUid: null,
      ownerName: '',
      minimum: '',
      finalGuests: '',
      details: '',
      invoicedAt: null,
      paidAt: null,
      createdAt: Date.now(),
      addedByHand: true,
      addedByName: user?.name ?? '',
    });
  };

  // The form carries whatever the customer typed - "2040" for twenty to
  // forty people, a date in the wrong year, a misspelt address. What is shown
  // is the corrected version; the original is kept quietly on the record, so
  // a misunderstanding can still be traced without cluttering the card.
  const correct = async (id, fields) => {
    const existing = enquiries.find((e) => e.id === id);
    const original = existing?.asReceived ?? {
      name: existing?.name ?? '',
      email: existing?.email ?? '',
      phone: existing?.phone ?? '',
      organisation: existing?.organisation ?? '',
      occasion: existing?.occasion ?? '',
      guests: existing?.guests ?? '',
      preferredDateText: existing?.preferredDateText ?? '',
      preferredTime: existing?.preferredTime ?? '',
      space: existing?.space ?? '',
      style: existing?.style ?? '',
      about: existing?.about ?? '',
      fulfilment: existing?.fulfilment ?? '',
      address: existing?.address ?? '',
    };
    await updateDoc(doc(db, COLLECTION, id), {
      ...fields,
      asReceived: original,
      correctedByName: user?.name ?? '',
      correctedAt: Date.now(),
    });
  };

  const update = async (id, fields) => {
    await updateDoc(doc(db, COLLECTION, id), fields);
  };

  const claim = async (id) =>
    update(id, { ownerUid: auth.currentUser?.uid ?? null, ownerName: user?.name ?? '', status: 'talking', claimedAt: Date.now() });

  // Moves it to a step, and writes down when and by whom. Confirmed puts it
  // on the calendar, which tells the location's GM, AGMs and chefs; leaving
  // Confirmed takes it back off. Returns a note if the calendar entry could
  // not be removed, so the screen can say so.
  const setStatus = async (id, status, extra = {}) => {
    const e = enquiries.find((x) => x.id === id);
    const stamp = {
      confirmed: { confirmedAt: Date.now(), confirmedByName: user?.name ?? '' },
      done: { doneAt: Date.now(), doneByName: user?.name ?? '' },
      lost: { lostAt: Date.now(), lostByName: user?.name ?? '' },
    }[status] ?? {};
    await update(id, { status, ...stamp, ...extra });
    if (!e) return null;

    if (status !== 'confirmed' && status !== 'done' && e.calendarEntryId) {
      try {
        await deleteDoc(doc(db, 'schedules', e.calendarEntryId));
        await update(id, { calendarEntryId: null });
      } catch {
        return 'It is still on the calendar - remove that entry by hand.';
      }
      return null;
    }
    if (status !== 'confirmed' || e.calendarEntryId) return null;

    // Everything someone working the event would otherwise have to ask for.
    const lines = [
      e.kind === 'catering'
        ? [e.fulfilment, e.address].filter(Boolean).join(' to ')
        : [e.space, e.style].filter(Boolean).join(' · '),
      (e.finalGuests || e.guests) ? (e.finalGuests || e.guests) + ' guests' : '',
      e.minimum ? (e.kind === 'catering' ? 'Order ' : 'Minimum ') + e.minimum : '',
      e.details,
      [e.name, e.phone].filter(Boolean).join(' · '),
    ].filter(Boolean);

    const when = e.preferredDate ?? Date.now();
    const entry = await addDoc(collection(db, 'schedules'), {
      locationId: e.locationId,
      brandId: e.brandId,
      title: (e.kind === 'catering' ? 'Catering — ' : '') + (e.occasion || e.name || 'Event'),
      note: lines.join('\n'),
      dateTime: when,
      authorName: user?.name ?? '',
      authorUid: auth.currentUser?.uid ?? null,
      timestamp: Date.now(),
      // The people who need to know it is happening.
      needs: ['General Manager', 'Assistant Manager', 'Executive Chef', 'Sous Chef', 'Catering & Events'],
      notifyUids: [],
      done: false,
      doneBy: null,
      doneAt: null,
      attentionFlag: false,
    });
    await update(id, { calendarEntryId: entry.id });
    return null;
  };

  const lose = async (id, reason) => {
    if (!reason?.trim()) throw new Error('Say why they are not going ahead.');
    return setStatus(id, 'lost', { lostReason: reason.trim() });
  };

  // Admins can move one to any step. The person on it - or, if nobody has
  // claimed it, the location's catering team - is emailed what changed.
  const adminSetStatus = async (id, status, reason) => {
    if (!reason?.trim()) throw new Error('Give a reason - whoever is on it will see it.');
    return setStatus(id, status, {
      statusChangedByName: user?.name ?? '',
      statusChangedAt: Date.now(),
      statusChangeReason: reason.trim(),
      ...(status === 'lost' ? { lostReason: reason.trim() } : {}),
    });
  };

  const markInvoiced = async (id) => update(id, { invoicedAt: Date.now() });
  const markPaid = async (id) => update(id, { paidAt: Date.now() });

  // What each person sees: their own locations, and only if they look after
  // this side of things. Ann Marie should not be reading Starkville's.
  // From the who-sees-what table: anyone with Catering at View or Claim,
  // narrowed to their own locations when their row says "Own location".
  const canSee = (e) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (accessLevel(user, 'catering') === 'none') return false;
    if (['all', 'brands'].includes(accessLevel(user, 'where'))) return true;
    if (!e.brandId || !(user.permissions?.brandIds ?? []).includes(e.brandId)) return false;
    const only = user.permissions?.locationsByBrand?.[e.brandId];
    return !Array.isArray(only) || only.length === 0 || only.includes(e.locationId);
  };

  const visible = enquiries.filter(canSee);

  return (
    <CateringContext.Provider
      value={{ enquiries: visible, addEnquiry, update, correct, claim, setStatus, lose, adminSetStatus, markInvoiced, markPaid }}
    >
      {children}
    </CateringContext.Provider>
  );
}

export function useCatering() {
  const ctx = useContext(CateringContext);
  if (!ctx) throw new Error('useCatering must be used inside CateringProvider');
  return ctx;
}
