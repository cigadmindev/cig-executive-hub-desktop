import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc, addDoc, query, orderBy, where } from 'firebase/firestore';
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
    });
  };

  const update = async (id, fields) => {
    await updateDoc(doc(db, COLLECTION, id), fields);
  };

  const claim = async (id) =>
    update(id, { ownerUid: auth.currentUser?.uid ?? null, ownerName: user?.name ?? '', status: 'talking' });

  const setStatus = async (id, status) => update(id, { status });

  const markInvoiced = async (id) => update(id, { invoicedAt: Date.now() });
  const markPaid = async (id) => update(id, { paidAt: Date.now() });

  // What each person sees: their own locations, and only if they look after
  // this side of things. Ann Marie should not be reading Starkville's.
  const TITLES = ['General Manager', 'Assistant Manager', 'Executive Chef', 'Sous Chef', 'Catering & Events'];
  const canSee = (e) => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'executive') return true;
    if (!TITLES.includes(user.job)) return false;
    if (!e.brandId || !(user.permissions?.brandIds ?? []).includes(e.brandId)) return false;
    const only = user.permissions?.locationsByBrand?.[e.brandId];
    return !Array.isArray(only) || only.length === 0 || only.includes(e.locationId);
  };

  const visible = enquiries.filter(canSee);

  return (
    <CateringContext.Provider
      value={{ enquiries: visible, addEnquiry, update, claim, setStatus, markInvoiced, markPaid }}
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
