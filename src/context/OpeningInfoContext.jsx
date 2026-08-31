import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc, query, where, getDocs, writeBatch, runTransaction } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useAuth } from './AuthContext';
import {
  TIMELINE_BUCKETS,
  computeInitialSetupDates,
  computeRenewalOpeningTaskDates,
  spreadDatesInWindow,
} from '../data/openingChecklistData';
import { getTemplateForLocation } from '../data/checklists';
import { renewalTypes, RENEWAL_TYPES_WITH_OPENING_TASK } from '../data/renewalTypes';
import { renewalDocId } from './RenewalsContext';

const OpeningInfoContext = createContext(undefined);
const COLLECTION = 'openingLocationInfo';
const SCHEDULES_COLLECTION = 'schedules';
const RENEWALS_COLLECTION = 'licenseRenewals';

export function OpeningInfoProvider({ children }) {
  const { user } = useAuth();
  const [infoByLocation, setInfoByLocation] = useState({});

  useEffect(() => {
    if (!user) {
      setInfoByLocation({});
      return;
    }
    const unsubscribe = onSnapshot(collection(db, COLLECTION), (snapshot) => {
      const map = {};
      snapshot.docs.forEach((d) => {
        const data = d.data();
        map[d.id] = {
          locationId: d.id,
          propertyManager: data.propertyManager ?? '',
          propertyManagerContact: data.propertyManagerContact ?? '',
          landlord: data.landlord ?? '',
          landlordContact: data.landlordContact ?? '',
          contractor: data.contractor ?? '',
          contractorContact: data.contractorContact ?? '',
          projectManager: data.projectManager ?? '',
          openingDate: data.openingDate ?? null,
          importantNumbers: data.importantNumbers ?? ['', '', '', ''],
        };
      });
      setInfoByLocation(map);
    });
    return unsubscribe;
  }, [user]);

  const getInfo = (locationId) =>
    infoByLocation[locationId] ?? {
      locationId,
      propertyManager: '',
      propertyManagerContact: '',
      landlord: '',
      landlordContact: '',
      contractor: '',
      contractorContact: '',
      projectManager: '',
      openingDate: null,
      importantNumbers: ['', '', '', ''],
    };

  // Plain field edits — no auto-population involved.
  const updateInfoField = async (locationId, field, value) => {
    const current = getInfo(locationId);
    await setDoc(doc(db, COLLECTION, locationId), { ...current, [field]: value }, { merge: true });
  };

  // The trigger: setting/changing the opening date wipes any previously
  // auto-generated timeline + setup entries for this location and rebuilds
  // them from scratch against the new date — so changing the date later
  // just re-spreads everything instead of leaving stale duplicates behind.
  const setOpeningDate = async (locationId, openingDate) => {
    const current = getInfo(locationId);
    await setDoc(doc(db, COLLECTION, locationId), { ...current, openingDate }, { merge: true });

    const existingQuery = query(
      collection(db, SCHEDULES_COLLECTION),
      where('locationId', '==', locationId),
      where('openingItem', '==', true)
    );
    const existingSnap = await getDocs(existingQuery);
    const existingSetupByKey = {};
    const deleteBatch = writeBatch(db);
    existingSnap.docs.forEach((d) => {
      const data = d.data();
      // Both setup and timeline items are kept and merged by key. Timeline
      // items used to be deleted here, on the reasoning that they were
      // generic labels with no state worth keeping - but they carry sign-offs
      // and adjusted dates like anything else, and a date change was silently
      // throwing that away.
      if (data.setupKey) {
        existingSetupByKey[data.setupKey] = { ref: d.ref, data };
      } else {
        deleteBatch.delete(d.ref);
      }
    });
    await deleteBatch.commit();

    // Also clear out any previously-generated renewal-linked calendar tasks
    // (not the renewal records themselves — those hold real approved
    // dates and must never be wiped, just the calendar entries pointing at
    // them, same as the regular opening-item wipe above).
    const existingRenewalTasksQuery = query(
      collection(db, SCHEDULES_COLLECTION),
      where('locationId', '==', locationId),
      where('renewalItem', '==', true)
    );
    const existingRenewalTasksSnap = await getDocs(existingRenewalTasksQuery);
    const deleteRenewalTasksBatch = writeBatch(db);
    existingRenewalTasksSnap.docs.forEach((d) => deleteRenewalTasksBatch.delete(d.ref));
    await deleteRenewalTasksBatch.commit();

    // Make sure every renewal type has a record for this location —
    // transaction-guarded per type, so this never overwrites a renewal
    // that already has real approved/expiration dates on it.
    await Promise.all(
      renewalTypes.map(async (type) => {
        const ref = doc(db, RENEWALS_COLLECTION, renewalDocId(locationId, type));
        try {
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (snap.exists()) return;
            tx.set(ref, { locationId, type, approvedDate: null, expirationDate: null, signedOffBy: null, signedOffAt: null });
          });
        } catch (err) {
          // Someone else's seed attempt won the race — fine, doc exists either way.
        }
      })
    );

    const createBatch = writeBatch(db);
    const authorUid = auth.currentUser?.uid ?? null;
    const authorName = user?.name ?? 'Unknown';

    // Already-open locations (a past opening date) don't need the
    // pre-opening prep work anymore — skip generating the 3-month/2-month/
    // opening-month timeline and the Initial Set-Up checklist entirely.
    // Operational POC (a separate, always-on seed) and the renewal-linked
    // tasks below are unaffected either way, since those matter regardless
    // of whether the location already opened.
    const isPastOpening = openingDate < Date.now();

    if (!isPastOpening) {
      TIMELINE_BUCKETS.forEach((bucket) => {
        const dates = spreadDatesInWindow(openingDate, bucket.windowStartDaysBefore, bucket.windowEndDaysBefore, bucket.items.length);
        bucket.items.forEach((tlItem, i) => {
          const label = tlItem.name;
          const ref = doc(collection(db, SCHEDULES_COLLECTION));
          createBatch.set(ref, {
            locationId,
            title: label,
            dateTime: dates[i],
            note: '',
            authorName,
            authorUid,
            timestamp: Date.now(),
            openingItem: true,
            openingItemType: 'timeline',
            openingSection: bucket.label,
            openingFields: null,
            setupKey: tlItem.key,
            done: false,
            doneBy: null,
            doneAt: null,
            attentionFlag: false,
          });
        });
      });

      // Requirements differ by city, so the item list comes from this
      // location's template rather than one global list. Everything
      // downstream — depth ordering, date spreading, dependency locking —
      // works the same; it just operates on whichever template applies.
      //
      // Dependency-aware: capstone items (Food Permit, Liquor License,
      // Business License) always land after everything they depend on —
      // see computeInitialSetupDates.
      const template = getTemplateForLocation(locationId);
      const setupDatesByKey = computeInitialSetupDates(openingDate, template);
      const seenKeys = new Set();
      template.items.forEach((item) => {
        seenKeys.add(item.key);
        const existing = existingSetupByKey[item.key];

        if (existing) {
          // Already done: leave it entirely alone. Its date records when the
          // work actually happened, and re-spreading it into a future window
          // would misrepresent history.
          if (existing.data.done) return;
          // Not done yet: move it to its new slot, but keep any fields
          // someone has already filled in.
          createBatch.update(existing.ref, {
            dateTime: setupDatesByKey[item.key],
            openingSection: item.section,
            templateId: template.id,
          });
          return;
        }

        const ref = doc(collection(db, SCHEDULES_COLLECTION));
        createBatch.set(ref, {
          locationId,
          title: item.name,
          dateTime: setupDatesByKey[item.key],
          note: '',
          authorName,
          authorUid,
          timestamp: Date.now(),
          openingItem: true,
          openingItemType: 'setup',
          openingSection: item.section,
          openingFields: { company: '', accountNumber: '', contact: '' },
          setupKey: item.key,
          // Which template produced this, so an old checklist can still be
          // explained after its template changes.
          templateId: template.id,
          done: false,
          doneBy: null,
          doneAt: null,
          attentionFlag: false,
        });
      });

      // Anything on this location that the template no longer lists — a
      // requirement that was removed, or an item from before this location
      // was mapped to the right city. Dropped so the checklist reflects
      // what actually applies rather than accumulating history.
      Object.entries(existingSetupByKey).forEach(([key, entry]) => {
        if (!seenKeys.has(key)) createBatch.delete(entry.ref);
      });
    }

    await createBatch.commit();

    // Renewal-linked tasks (Beer Permit, Liquor License, Food Permit,
    // Building Permit, Business License, Sign Permit) — kept regardless of
    // past/future opening date, since an already-open location still
    // needs these tracked. Separate batch since it references the renewal
    // docs we just ensured exist above. Marking one of these done happens
    // from the Renewals screen when its dates get filled in, not from
    // here — see RenewalsScreen.
    const renewalTaskBatch = writeBatch(db);
    const renewalTaskDates = computeRenewalOpeningTaskDates(openingDate, RENEWAL_TYPES_WITH_OPENING_TASK);
    RENEWAL_TYPES_WITH_OPENING_TASK.forEach((type) => {
      const ref = doc(collection(db, SCHEDULES_COLLECTION));
      renewalTaskBatch.set(ref, {
        locationId,
        title: type,
        dateTime: renewalTaskDates[type],
        note: '',
        authorName,
        authorUid,
        timestamp: Date.now(),
        openingItem: false,
        renewalItem: true,
        renewalType: type,
        done: false,
        doneBy: null,
        doneAt: null,
        attentionFlag: false,
      });
    });
    await renewalTaskBatch.commit();
  };

  return (
    <OpeningInfoContext.Provider value={{ getInfo, updateInfoField, setOpeningDate }}>
      {children}
    </OpeningInfoContext.Provider>
  );
}

export function useOpeningInfo() {
  const ctx = useContext(OpeningInfoContext);
  if (!ctx) throw new Error('useOpeningInfo must be used within OpeningInfoProvider');
  return ctx;
}
