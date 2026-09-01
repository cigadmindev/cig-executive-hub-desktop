import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from './AuthContext';
import { renewalTypes, RENEWAL_WARNING_WINDOW_DAYS } from '../data/renewalTypes';

const RenewalsContext = createContext(undefined);
const COLLECTION = 'licenseRenewals';

export function isRenewalDueSoon(item) {
  if (!item.expirationDate) return false;
  const warningMs = RENEWAL_WARNING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return item.expirationDate - Date.now() <= warningMs;
}

// Deterministic so other parts of the app (the Opening Checklist's
// calendar-linked "get this for the first time" tasks) can reliably
// reference a specific renewal record without needing to query for it.
export function renewalDocId(locationId, type) {
  return `${locationId}_${type}`;
}

export function RenewalsProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    const unsubscribe = onSnapshot(collection(db, COLLECTION), (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          locationId: data.locationId,
          type: data.type,
          approvedDate: data.approvedDate ?? null,
          expirationDate: data.expirationDate ?? null,
          document: data.document ?? null,
          signedOffBy: data.signedOffBy ?? null,
          signedOffAt: data.signedOffAt ?? null,
        };
      });
      setItems(list);
    },
      (err) => console.error('[Renewals listener] ' + err.code + ': ' + err.message)
    );
    return unsubscribe;
  }, [user]);

  const getByLocation = (locationId) => items.filter((i) => i.locationId === locationId);

  // Transaction-guarded so calling this twice in a row (or from two
  // devices at once) can never double-create or clobber real approved
  // dates — each type's doc is only ever created once, with a deterministic
  // id, and existing docs are left completely untouched.
  const ensureSeeded = async (locationId) => {
    await Promise.all(
      renewalTypes.map(async (type) => {
        const ref = doc(db, COLLECTION, renewalDocId(locationId, type));
        try {
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (snap.exists()) return;
            tx.set(ref, {
              locationId,
              type,
              approvedDate: null,
              expirationDate: null,
              signedOffBy: null,
              signedOffAt: null,
            });
          });
        } catch (err) {
          // Conflict just means someone else's seed attempt won first — fine.
        }
      })
    );
  };

  const updateDates = async (itemId, approvedDate, expirationDate, document) => {
    const patch = { approvedDate, expirationDate };
    // Only written when a document is passed, so editing dates by hand from
    // the Renewals screen doesn't clear an attachment that's already there.
    if (document !== undefined) patch.document = document;
    await updateDoc(doc(db, COLLECTION, itemId), patch);
  };

  // Writes only the document, leaving dates alone — attaching a permit from
  // the checklist shouldn't disturb renewal dates someone has already set.
  const setRenewalDocument = async (itemId, document) => {
    await setDoc(doc(db, COLLECTION, itemId), { document }, { merge: true });
  };

  const markRenewed = async (itemId, signedOffBy, newExpirationDate) => {
    await updateDoc(doc(db, COLLECTION, itemId), {
      approvedDate: Date.now(),
      expirationDate: newExpirationDate,
      signedOffBy,
      signedOffAt: Date.now(),
    });
  };

  const hasUpcomingRenewal = (locationId) => getByLocation(locationId).some(isRenewalDueSoon);

  return (
    <RenewalsContext.Provider value={{ renewals: items, getByLocation, ensureSeeded, updateDates, setRenewalDocument, markRenewed, hasUpcomingRenewal }}>
      {children}
    </RenewalsContext.Provider>
  );
}

export function useRenewals() {
  const ctx = useContext(RenewalsContext);
  if (!ctx) throw new Error('useRenewals must be used within RenewalsProvider');
  return ctx;
}
