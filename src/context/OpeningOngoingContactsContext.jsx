import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc, runTransaction, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from './AuthContext';
import { ALL_CONTACT_SECTIONS } from '../data/openingChecklistData';

const OpeningOngoingContactsContext = createContext(undefined);
const COLLECTION = 'openingOngoingContacts';
const SEED_MARKER_COLLECTION = 'openingOngoingContactsSeedMarker';

export function OpeningOngoingContactsProvider({ children }) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    if (!user) {
      setContacts([]);
      return;
    }
    const unsubscribe = onSnapshot(collection(db, COLLECTION), (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          locationId: data.locationId,
          section: data.section,
          item: data.item,
          who: data.who ?? '',
          vendor: data.vendor ?? '',
          contactNameNumber: data.contactNameNumber ?? '',
          accountNumber: data.accountNumber ?? '',
          order: data.order ?? 0,
        };
      });
      setContacts(list);
    });
    return unsubscribe;
  }, [user]);

  const getByLocation = (locationId) =>
    contacts.filter((c) => c.locationId === locationId).sort((a, b) => a.order - b.order);

  // First visit to a location's Operational POC seeds it with every item
  // from the PDF. Uses a dedicated marker document, checked-and-created
  // inside a single transaction — this is what actually prevents double
  // seeding. The earlier version checked "does anything exist yet" and
  // then wrote in a separate step; if two devices (or two renders) both
  // ran that check before either had finished writing, both would see
  // "empty" and both would seed, doubling every item. A transaction can't
  // have that gap — only one caller can ever win.
  const ensureSeeded = async (locationId) => {
    const markerRef = doc(db, SEED_MARKER_COLLECTION, locationId);
    try {
      await runTransaction(db, async (tx) => {
        const markerSnap = await tx.get(markerRef);
        if (markerSnap.exists()) return; // someone already seeded this location
        tx.set(markerRef, { locationId, seededAt: Date.now() });

        let order = 0;
        ALL_CONTACT_SECTIONS.forEach((section) => {
          section.items.forEach((item) => {
            const ref = doc(collection(db, COLLECTION));
            tx.set(ref, {
              locationId,
              section: section.label,
              item,
              who: '',
              vendor: '',
              contactNameNumber: '',
              accountNumber: '',
              order: order++,
            });
          });
        });
      });
    } catch (err) {
      // Transaction conflicts are expected if two devices race — the loser
      // just does nothing, which is correct.
    }
  };

  const updateContactField = async (id, field, value) => {
    await setDoc(doc(db, COLLECTION, id), { [field]: value }, { merge: true });
  };

  // Admin-triggered force reset — wipes every contact for this location
  // AND the seed marker, then reseeds from scratch. Unlike ensureSeeded,
  // this ignores the marker entirely (that's the point — it's for
  // pulling in new/changed items after a code update, or clearing out
  // test data), so it should only ever be called from an explicit admin
  // action, never automatically on mount.
  // Keeps contacts that have anything filled in. Regenerate exists to pick up
  // new items after a code change, not to throw away the vendor names and
  // phone numbers someone spent an afternoon collecting — the same reason
  // setOpeningDate merges rather than rebuilding.
  const regenerateForLocation = async (locationId) => {
    const existingQuery = query(collection(db, COLLECTION), where('locationId', '==', locationId));
    const existingSnap = await getDocs(existingQuery);
    const deleteBatch = writeBatch(db);
    existingSnap.docs.forEach((d) => {
      const data = d.data();
      const hasContent = Boolean(data.who || data.vendor || data.contactNameNumber);
      if (!hasContent) deleteBatch.delete(d.ref);
    });
    await deleteBatch.commit();

    // Seed only what's missing rather than clearing the marker and starting
    // over — contacts with content survived the delete above, so re-seeding
    // blind would give them a second empty twin.
    const keptItems = new Set(
      existingSnap.docs
        .map((d) => d.data())
        .filter((d) => d.who || d.vendor || d.contactNameNumber)
        .map((d) => `${d.section}::${d.item}`)
    );

    const addBatch = writeBatch(db);
    let order = 0;
    ALL_CONTACT_SECTIONS.forEach((section) => {
      section.items.forEach((item) => {
        order += 1;
        if (keptItems.has(`${section.label}::${item}`)) return;
        addBatch.set(doc(collection(db, COLLECTION)), {
          locationId,
          section: section.label,
          item,
          who: '',
          vendor: '',
          contactNameNumber: '',
          order,
        });
      });
    });
    await addBatch.commit();
  };

  return (
    <OpeningOngoingContactsContext.Provider
      value={{ getByLocation, ensureSeeded, updateContactField, regenerateForLocation }}
    >
      {children}
    </OpeningOngoingContactsContext.Provider>
  );
}

export function useOpeningOngoingContacts() {
  const ctx = useContext(OpeningOngoingContactsContext);
  if (!ctx) throw new Error('useOpeningOngoingContacts must be used within OpeningOngoingContactsProvider');
  return ctx;
}
