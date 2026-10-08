import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, runTransaction, query, where } from 'firebase/firestore';
import { atLeast } from '../data/accessMatrix';
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
export const JOB_OPTIONS = [
  'Owner',
  'CEO',
  'COO',
  'Culinary Director',
  'Culinary Manager',
  'Executive Chef',
  'Sous Chef',
  'General Manager',
  'Assistant Manager',
  'Kitchen Manager',
  'Catering & Events',
  'Beverage Manager',
  'Financials',
  'IT & Training',
  'Marketing',
  'Communications',
  'Videographer',
  'HR',
  'Real Estate',
];

// The same list, under the name the event request form uses: ticking a title
// there loops in whoever holds it.
export const EVENT_NEEDS_OPTIONS = JOB_OPTIONS;


export function EventRequestsProvider({ children }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    if (!user) {
      setRequests([]);
      return;
    }
    // Private (S6, 8 Oct): the people who decide them see every request;
    // everyone else sees their own. The rule matches, so the query must too.
    const decides = user.role === 'admin' || atLeast(user, 'eventRequests', 'approve');
    const source = decides
      ? collection(db, COLLECTION)
      : query(collection(db, COLLECTION), where('requestedByUid', '==', user.uid));
    const unsubscribe = onSnapshot(source, (snapshot) => {
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
          // Specific people to notify, alongside whole roles in `needs`.
          notifyUids: data.notifyUids ?? [],
          requestedBy: data.requestedBy,
          requestedByUid: data.requestedByUid ?? null,
          status: data.status ?? 'pending',
          statusChangedByName: data.statusChangedByName ?? '',
          statusChangedAt: data.statusChangedAt ?? null,
          statusChangeReason: data.statusChangeReason ?? '',
          createdAt: data.createdAt ?? null,
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
    },
      (err) => console.error('[EventRequests listener] ' + err.code + ': ' + err.message)
    );
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

  // Admins only: move a request to any status after the fact, with a reason
  // the person who asked is emailed (onEventRequestResolved).
  const adminSetStatus = async (id, status, reason) => {
    if (!reason?.trim()) throw new Error('Give a reason - the person who asked will see it.');
    await updateDoc(doc(db, COLLECTION, id), {
      status,
      statusChangedByName: user?.name ?? '',
      statusChangedAt: Date.now(),
      statusChangeReason: reason.trim(),
      ...(status === 'denied' ? { denialReason: reason.trim() } : {}),
    });
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
          brandId: scheduleEntry.brandId ?? snap.data().brandId ?? null,
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
  // True when someone should know about a pending request here — either their
  // role was picked, or they were named individually. Same signal either way:
  // being named directly shouldn't notify you any less than being in a role.
  //
  // uid is optional so existing callers that only pass a job keep working.
  const hasNeedMatchingJob = (locationIds, job, uid) => {
    if (!job && !uid) return false;
    return requests.some(
      (r) =>
        locationIds.includes(r.locationId) &&
        r.status === 'pending' &&
        ((job && (r.needs ?? []).includes(job)) || (uid && (r.notifyUids ?? []).includes(uid)))
    );
  };

  return (
    <EventRequestsContext.Provider
      value={{ requests, getByLocation, submitRequest, resolveRequest, approveAndSchedule, updateEventRequest, deleteEventRequest, hasNeedMatchingJob, adminSetStatus }}
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
