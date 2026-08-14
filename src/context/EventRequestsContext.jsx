import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useAuth } from './AuthContext';

const EventRequestsContext = createContext(undefined);
const COLLECTION = 'eventRequests';
const DENIED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// Who else should be looped in on this event — shown as a multi-select on
// the request form and displayed on the card so admins see at a glance who
// needs to be aware.
// Shared by Event Requests' "who needs to be looped in" picker and Manage
// Logins' job/department picker — same exact list both places.
export const EVENT_NEEDS_OPTIONS = [
  '🎨 Branding / Marketing Team',
  '👔 Management',
  '🍸 Drink / Beverage Manager',
  '🍳 Kitchen / Chef',
  '🧑‍🍳 Serving Staff',
  '📸 Photography / Videography',
  '👑 CEO',
  '🧭 COO',
  '💰 Financials',
  '📣 Communications',
  '💻 IT',
  'Other',
];

export const JOB_OPTIONS = EVENT_NEEDS_OPTIONS;

export function EventRequestsProvider({ children }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    if (!user) {
      setRequests([]);
      return;
    }
    const unsubscribe = onSnapshot(collection(db, COLLECTION), (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          locationId: data.locationId,
          locationName: data.locationName,
          title: data.title,
          dateTime: data.dateTime,
          expectedAttendees: data.expectedAttendees ?? '',
          details: data.details ?? '',
          needs: data.needs ?? [],
          requestedBy: data.requestedBy,
          requestedByUid: data.requestedByUid ?? null,
          status: data.status ?? 'pending',
          denialReason: data.denialReason ?? '',
          timestamp: data.timestamp,
          resolvedAt: data.resolvedAt ?? null,
          resolvedByUid: data.resolvedByUid ?? null,
        };
      });
      setRequests(list);

      // Same reactive cleanup as mobile — sweeps denied requests older
      // than 7 days whenever any signed-in device has this data loaded.
      const now = Date.now();
      list.forEach((r) => {
        if (r.status === 'denied' && r.resolvedAt && now - r.resolvedAt > DENIED_RETENTION_MS) {
          deleteDoc(doc(db, COLLECTION, r.id)).catch(() => {});
        }
      });
    });
    return unsubscribe;
  }, [user]);

  const getByLocation = (locationId) =>
    requests.filter((r) => r.locationId === locationId).sort((a, b) => b.timestamp - a.timestamp);

  const submitRequest = async (params) => {
    await addDoc(collection(db, COLLECTION), {
      ...params,
      requestedByUid: auth.currentUser?.uid ?? null,
      status: 'pending',
      denialReason: '',
      timestamp: Date.now(),
      resolvedAt: null,
      resolvedByUid: null,
    });
    // Note: mobile also sends a push notification to admins here — not
    // wired up for desktop yet, same as Chat.
  };

  const resolveRequest = async (id, status, denialReason = '') => {
    await updateDoc(doc(db, COLLECTION, id), {
      status,
      denialReason: status === 'denied' ? denialReason : '',
      resolvedAt: Date.now(),
      resolvedByUid: auth.currentUser?.uid ?? null,
    });
  };

  // Atomic: only approves + schedules if the request is still pending at
  // the moment the transaction runs. If someone else already resolved it
  // (or this got triggered twice), this safely does nothing instead of
  // creating a duplicate calendar entry — same fix as mobile.
  const approveAndSchedule = async (id, scheduleEntry) => {
    const reqRef = doc(db, COLLECTION, id);
    const scheduleRef = doc(collection(db, 'schedules'));
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(reqRef);
        if (!snap.exists() || snap.data().status !== 'pending') {
          throw new Error('ALREADY_RESOLVED');
        }
        tx.update(reqRef, {
          status: 'approved',
          denialReason: '',
          resolvedAt: Date.now(),
          resolvedByUid: auth.currentUser?.uid ?? null,
        });
        tx.set(scheduleRef, {
          ...scheduleEntry,
          authorUid: auth.currentUser?.uid ?? null,
          timestamp: Date.now(),
        });
      });
      return true;
    } catch (err) {
      return false;
    }
  };

  const updateEventRequest = async (id, updates) => {
    await updateDoc(doc(db, COLLECTION, id), updates);
  };

  const deleteEventRequest = async (id) => {
    await deleteDoc(doc(db, COLLECTION, id));
  };

  // Is there a still-pending event request, at any of these locations,
  // whose "who needs to be looped in" list includes this job? Live and
  // automatic — no separate "seen" tracking needed, since it naturally
  // clears the moment the request gets approved or denied, same as how
  // the admin Pending Requests dot already works.
  const hasNeedMatchingJob = (locationIds, job) => {
    if (!job) return false;
    return requests.some((r) => locationIds.includes(r.locationId) && r.status === 'pending' && (r.needs ?? []).includes(job));
  };

  return (
    <EventRequestsContext.Provider
      value={{ requests, getByLocation, submitRequest, resolveRequest, approveAndSchedule, updateEventRequest, deleteEventRequest, hasNeedMatchingJob }}
    >
      {children}
    </EventRequestsContext.Provider>
  );
}

export function useEventRequests() {
  const ctx = useContext(EventRequestsContext);
  if (!ctx) throw new Error('useEventRequests must be used within EventRequestsProvider');
  return ctx;
}
