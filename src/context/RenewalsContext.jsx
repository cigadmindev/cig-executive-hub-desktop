import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc, runTransaction , query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { brandOfLocation } from '../data/brandOfLocation';
import { brandIdForLocation } from '../data/mockData';
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
    const seesAll = user.role === 'admin' || user.role === 'executive';
    const mine = user.permissions?.brandIds ?? [];
    if (!seesAll && mine.length === 0) {
      setItems([]);
      return;
    }
    const source = seesAll
      ? collection(db, COLLECTION)
      : query(collection(db, COLLECTION), where('brandId', 'in', mine.slice(0, 30)));

    const unsubscribe = onSnapshot(source, (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          locationId: data.locationId,
          brandId: data.brandId ?? null,
          type: data.type,
          approvedDate: data.approvedDate ?? null,
          expirationDate: data.expirationDate ?? null,
          document: data.document ?? null,
          signedOffBy: data.signedOffBy ?? null,
          signedOffAt: data.signedOffAt ?? null,
          // Hidden rather than deleted: ensureSeeded runs on every visit and
          // would recreate anything removed. The record survives and stays
          // out of the list, so a location can drop a permit it does not
          // need without the template fighting it.
          hidden: data.hidden === true,
          custom: data.custom === true,
        };
      });
      setItems(list);
    },
      (err) => console.error('[Renewals listener] ' + err.code + ': ' + err.message)
    );
    return unsubscribe;
  }, [user]);

  // Hidden ones are excluded by default; the screen asks for them when
  // someone wants to put one back.
  const getByLocation = (locationId, includeHidden = false) =>
    items.filter((i) => i.locationId === locationId && (includeHidden || !i.hidden));

  // Scoped to one location. Adding a permit at Chelsea puts it on Chelsea's
  // list and nowhere else.
  const addRenewal = async (locationId, type) => {
    await setDoc(doc(db, COLLECTION, renewalDocId(locationId, type)), {
      locationId,
      brandId: await brandOfLocation(locationId),
      type,
      approvedDate: null,
      expirationDate: null,
      document: null,
      signedOffBy: null,
      signedOffAt: null,
      hidden: false,
      custom: true,
    });
  };

  const setRenewalHidden = async (id, hidden) => {
    await updateDoc(doc(db, COLLECTION, id), { hidden });
  };

  // Transaction-guarded so calling this twice in a row (or from two
  // devices at once) can never double-create or clobber real approved
  // dates — each type's doc is only ever created once, with a deterministic
  // id, and existing docs are left completely untouched.
  const ensureSeeded = async (locationId) => {
    const seedBrandId = await brandOfLocation(locationId);
    await Promise.all(
      renewalTypes.map(async (type) => {
        const ref = doc(db, COLLECTION, renewalDocId(locationId, type));
        try {
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (snap.exists()) return;
            tx.set(ref, {
              locationId,
              brandId: seedBrandId,
              // So the renewal-due notification knows who can see this location.
              type,
              approvedDate: null,
              expirationDate: null,
              signedOffBy: null,
              signedOffAt: null,
              // Written explicitly: the rule lets anyone create a seeded
              // record and only the three create a custom one, and an absent
              // field would read as neither.
              hidden: false,
              custom: false,
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
    <RenewalsContext.Provider value={{ renewals: items, getByLocation, ensureSeeded, updateDates, setRenewalDocument, markRenewed, hasUpcomingRenewal, addRenewal, setRenewalHidden }}>
      {children}
    </RenewalsContext.Provider>
  );
}

export function useRenewals() {
  const ctx = useContext(RenewalsContext);
  if (!ctx) throw new Error('useRenewals must be used within RenewalsProvider');
  return ctx;
}
