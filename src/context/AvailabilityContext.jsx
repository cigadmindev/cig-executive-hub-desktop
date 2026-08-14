import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useAuth } from './AuthContext';

const AvailabilityContext = createContext(undefined);
const DENIED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function AvailabilityProvider({ children }) {
  const { user } = useAuth();
  const [timeOffRequests, setTimeOffRequests] = useState([]);
  const [weeklyAvailability, setWeeklyAvailability] = useState([]);

  useEffect(() => {
    if (!user) {
      setTimeOffRequests([]);
      setWeeklyAvailability([]);
      return;
    }

    const unsubTimeOff = onSnapshot(collection(db, 'timeOffRequests'), (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          uid: data.uid,
          name: data.name,
          startDate: data.startDate,
          endDate: data.endDate,
          reason: data.reason ?? '',
          status: data.status,
          denialReason: data.denialReason ?? '',
          timestamp: data.timestamp,
          resolvedAt: data.resolvedAt ?? null,
          resolvedByUid: data.resolvedByUid ?? null,
        };
      });
      setTimeOffRequests(list.sort((a, b) => a.startDate - b.startDate));

      // Same reactive sweep pattern as mobile: denied requests clear a week
      // after resolution, approved ones clear once the time off has passed.
      const now = Date.now();
      list.forEach((r) => {
        if (r.status === 'denied' && r.resolvedAt && now - r.resolvedAt > DENIED_RETENTION_MS) {
          deleteDoc(doc(db, 'timeOffRequests', r.id)).catch(() => {});
        } else if (r.status === 'approved' && now > r.endDate) {
          deleteDoc(doc(db, 'timeOffRequests', r.id)).catch(() => {});
        }
      });
    });

    const unsubAvailability = onSnapshot(collection(db, 'weeklyAvailability'), (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          name: data.name,
          weekStartDate: data.weekStartDate ?? null,
          monday: data.monday ?? '',
          tuesday: data.tuesday ?? '',
          wednesday: data.wednesday ?? '',
          thursday: data.thursday ?? '',
          friday: data.friday ?? '',
          saturday: data.saturday ?? '',
          sunday: data.sunday ?? '',
        };
      });
      setWeeklyAvailability(list);
    });

    return () => {
      unsubTimeOff();
      unsubAvailability();
    };
  }, [user]);

  const submitTimeOff = async (startDate, endDate, reason) => {
    if (!user) return;
    await addDoc(collection(db, 'timeOffRequests'), {
      uid: user.uid,
      name: user.name,
      startDate,
      endDate,
      reason,
      status: 'pending',
      timestamp: Date.now(),
      resolvedAt: null,
      resolvedByUid: null,
    });
  };

  const resolveTimeOff = async (id, status, denialReason) => {
    await updateDoc(doc(db, 'timeOffRequests', id), {
      status,
      resolvedAt: Date.now(),
      resolvedByUid: auth.currentUser?.uid ?? null,
      ...(status === 'denied' ? { denialReason: denialReason ?? '' } : {}),
    });
  };

  const updateTimeOffRequest = async (id, updates) => {
    await updateDoc(doc(db, 'timeOffRequests', id), updates);
  };

  const deleteTimeOffRequest = async (id) => {
    await deleteDoc(doc(db, 'timeOffRequests', id));
  };

  // Sunday, midnight, of the week containing the given date — the anchor
  // used to detect "this is a new week, the old answers don't apply
  // anymore" on the screen.
  const getWeekStart = (date = new Date()) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d.getTime();
  };

  const setMyWeeklyAvailability = async (weekly) => {
    if (!user) return;
    await setDoc(doc(db, 'weeklyAvailability', user.uid), {
      name: user.name,
      weekStartDate: getWeekStart(),
      ...weekly,
    });
  };

  return (
    <AvailabilityContext.Provider
      value={{
        timeOffRequests,
        weeklyAvailability,
        submitTimeOff,
        resolveTimeOff,
        updateTimeOffRequest,
        deleteTimeOffRequest,
        setMyWeeklyAvailability,
        getWeekStart,
      }}
    >
      {children}
    </AvailabilityContext.Provider>
  );
}

export function useAvailability() {
  const ctx = useContext(AvailabilityContext);
  if (!ctx) throw new Error('useAvailability must be used within AvailabilityProvider');
  return ctx;
}
