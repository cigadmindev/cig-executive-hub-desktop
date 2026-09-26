import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useAuth } from './AuthContext';

// What to revoke outside the Hub when someone leaves, and what to restore if
// they come back.
//
// Deactivating keeps their record, which is right - but nothing said what else
// to do: Drive, Toast, R365, OpenTable, their email, the laptop. It lived in
// one person's head, which is exactly what we are trying to stop.
//
// A record per departure, kept rather than deleted when someone returns: how a
// past departure was handled is worth being able to look up.
const COLLECTION = 'offboarding';

// Drive is a button rather than a step, because the Hub can actually do it.
// Everything else is outside anything it can reach.
export const OFFBOARDING_STEPS = [
  { key: 'toast', label: 'Toast' },
  { key: 'r365', label: 'Restaurant365' },
  { key: 'openTable', label: 'OpenTable' },
  { key: 'googleGroup', label: 'Google Group membership' },
  { key: 'email', label: 'Email account' },
  { key: 'hardware', label: 'Laptop or tablet returned' },
];

const OffboardingContext = createContext(undefined);

export function OffboardingProvider({ children }) {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);

  useEffect(() => {
    // Admins only, and the rule says the same - nobody else needs to know who
    // is being offboarded.
    if (user?.role !== 'admin') {
      setRecords([]);
      return;
    }
    return onSnapshot(
      query(collection(db, COLLECTION), orderBy('deactivatedAt', 'desc')),
      (snapshot) =>
        setRecords(
          snapshot.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              uid: x.uid,
              name: x.name ?? '',
              email: x.email ?? '',
              deactivatedAt: x.deactivatedAt ?? null,
              deactivatedBy: x.deactivatedBy ?? '',
              reactivatedAt: x.reactivatedAt ?? null,
              steps: x.steps ?? {},
              restoreSteps: x.restoreSteps ?? {},
              // What was taken away, so it can be put back exactly.
              driveRemoved: x.driveRemoved ?? null,
              driveRestoredAt: x.driveRestoredAt ?? null,
            };
          })
        ),
      (err) => console.error('[Offboarding] ' + err.code + ': ' + err.message)
    );
  }, [user]);

  // One record per person, reused if they leave twice.
  const startOffboarding = async (person, byName) => {
    await setDoc(
      doc(db, COLLECTION, person.uid),
      {
        uid: person.uid,
        name: person.name ?? '',
        email: person.email ?? '',
        deactivatedAt: Date.now(),
        deactivatedBy: byName ?? auth.currentUser?.email ?? '',
        reactivatedAt: null,
        steps: {},
        restoreSteps: {},
        driveRestoredAt: null,
      },
      { merge: true }
    );
  };

  const markReactivated = async (uid) => {
    await setDoc(doc(db, COLLECTION, uid), { reactivatedAt: Date.now(), restoreSteps: {} }, { merge: true });
  };

  const setStep = async (uid, key, done, which = 'steps') => {
    await updateDoc(doc(db, COLLECTION, uid), {
      [`${which}.${key}`]: done ? { done: true, at: Date.now() } : { done: false, at: null },
    });
  };

  // The dot stays until everything on the record is resolved - either every
  // offboarding step, or every restore step if they came back.
  const outstanding = () =>
    records.some((r) => {
      if (r.reactivatedAt) {
        const restored = !!r.driveRestoredAt || !r.driveRemoved;
        return !restored || OFFBOARDING_STEPS.some((s) => !r.restoreSteps?.[s.key]?.done);
      }
      const driveDone = !!r.driveRemoved;
      return !driveDone || OFFBOARDING_STEPS.some((s) => !r.steps?.[s.key]?.done);
    });

  return (
    <OffboardingContext.Provider value={{ records, startOffboarding, markReactivated, setStep, outstanding }}>
      {children}
    </OffboardingContext.Provider>
  );
}

export function useOffboarding() {
  const ctx = useContext(OffboardingContext);
  if (!ctx) throw new Error('useOffboarding must be used inside OffboardingProvider');
  return ctx;
}
