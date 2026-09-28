import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useAuth } from './AuthContext';

// Asking for a new company device.
//
// Different from Systems Help, which is a till behaving oddly, and from
// hardware repairs, which is a laptop that has stopped working. This is "we
// have a new assistant manager starting and she needs an iPad".
//
// It moves through four states, and each one tells somebody: the COO and
// admins when it is raised, the person who asked when it is decided, ordered
// or on its way.
const COLLECTION = 'deviceRequests';

// Ordered, because a request only ever moves forward.
export const DEVICE_STATES = ['requested', 'approved', 'ordered', 'arrived', 'declined'];

const DeviceRequestsContext = createContext(undefined);

export function DeviceRequestsProvider({ children }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    if (!user) {
      setRequests([]);
      return;
    }
    return onSnapshot(
      query(collection(db, COLLECTION), orderBy('createdAt', 'desc')),
      (snapshot) =>
        setRequests(
          snapshot.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              // What is wanted, and who for.
              deviceType: x.deviceType ?? '',
              forWhom: x.forWhom ?? '',
              setupNotes: x.setupNotes ?? '',
              locationId: x.locationId ?? null,
              locationName: x.locationName ?? '',
              brandId: x.brandId ?? null,
              brandName: x.brandName ?? '',
              neededBy: x.neededBy ?? null,

              status: x.status ?? 'requested',
              requestedByUid: x.requestedByUid ?? null,
              requestedByName: x.requestedByName ?? '',
              createdAt: x.createdAt ?? 0,

              decidedByName: x.decidedByName ?? '',
              decidedAt: x.decidedAt ?? null,
              declineReason: x.declineReason ?? '',

              // Filled in after it is actually bought.
              orderedByName: x.orderedByName ?? '',
              orderedAt: x.orderedAt ?? null,
              orderNotes: x.orderNotes ?? '',
              expectedArrival: x.expectedArrival ?? null,

              arrivedAt: x.arrivedAt ?? null,
              arrivedByName: x.arrivedByName ?? '',
            };
          })
        ),
      (err) => console.error('[DeviceRequests] ' + err.code + ': ' + err.message)
    );
  }, [user]);

  const addRequest = async ({ deviceType, forWhom, setupNotes, locationId, locationName, brandId, brandName, neededBy }) => {
    if (!deviceType.trim()) throw new Error('What kind of device?');
    if (!locationId) throw new Error('Which location is it for?');
    await addDoc(collection(db, COLLECTION), {
      deviceType: deviceType.trim(),
      forWhom: (forWhom ?? '').trim(),
      setupNotes: (setupNotes ?? '').trim(),
      locationId,
      locationName: locationName ?? '',
      brandId: brandId ?? null,
      brandName: brandName ?? '',
      neededBy: neededBy ?? null,
      status: 'requested',
      requestedByUid: auth.currentUser?.uid ?? null,
      requestedByName: user?.name ?? '',
      createdAt: Date.now(),
    });
  };

  const decide = async (id, approved, declineReason = '') => {
    await updateDoc(doc(db, COLLECTION, id), {
      status: approved ? 'approved' : 'declined',
      decidedByName: user?.name ?? '',
      decidedAt: Date.now(),
      declineReason: approved ? '' : declineReason,
    });
  };

  // Once it has actually been bought, with whatever the person waiting needs
  // to know: when it lands, what was ordered.
  const markOrdered = async (id, { orderNotes, expectedArrival }) => {
    await updateDoc(doc(db, COLLECTION, id), {
      status: 'ordered',
      orderedByName: user?.name ?? '',
      orderedAt: Date.now(),
      orderNotes: (orderNotes ?? '').trim(),
      expectedArrival: expectedArrival ?? null,
    });
  };

  // Confirmed by whoever it went to - they are the only one who knows.
  const markArrived = async (id) => {
    await updateDoc(doc(db, COLLECTION, id), {
      status: 'arrived',
      arrivedAt: Date.now(),
      arrivedByName: user?.name ?? '',
    });
  };

  const open = requests.filter((r) => r.status !== 'arrived' && r.status !== 'declined');
  const closed = requests.filter((r) => r.status === 'arrived' || r.status === 'declined');

  return (
    <DeviceRequestsContext.Provider value={{ requests, open, closed, addRequest, decide, markOrdered, markArrived }}>
      {children}
    </DeviceRequestsContext.Provider>
  );
}

export function useDeviceRequests() {
  const ctx = useContext(DeviceRequestsContext);
  if (!ctx) throw new Error('useDeviceRequests must be used inside DeviceRequestsProvider');
  return ctx;
}
