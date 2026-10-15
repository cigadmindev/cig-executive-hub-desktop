import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc, runTransaction, query, where, getDocs, writeBatch , addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from './AuthContext';
import { useCustomLocations } from './CustomLocationsContext';
import { brands, hasFeature } from '../data/mockData';
import { ALL_CONTACT_SECTIONS } from '../data/openingChecklistData';

const OpeningOngoingContactsContext = createContext(undefined);
const COLLECTION = 'openingOngoingContacts';
const SEED_MARKER_COLLECTION = 'openingOngoingContactsSeedMarker';

function mapContact(d) {
  const data = d.data();
  return {
    id: d.id,
    brandId: data.brandId ?? null,
    locationId: data.locationId,
    section: data.section,
    item: data.item,
    who: data.who ?? '',
    vendor: data.vendor ?? '',
    contactNameNumber: data.contactNameNumber ?? '',
    accountNumber: data.accountNumber ?? '',
    // Who has been asked to fill it in (15 Oct 2026) - set by the server.
    assignedToUid: data.assignedToUid ?? null,
    assignedToName: data.assignedToName ?? '',
    assignedByName: data.assignedByName ?? '',
    assignedToUids: Array.isArray(data.assignedToUids) ? data.assignedToUids : null,
    assignedToNames: Array.isArray(data.assignedToNames) ? data.assignedToNames : null,
    order: data.order ?? 0,
  };
}

export function OpeningOngoingContactsProvider({ children }) {
  const { user } = useAuth();
  const { getByBrand } = useCustomLocations();
  const [contacts, setContacts] = useState([]);
  // True once the first answer has arrived, so an empty list can say "none
  // yet" instead of "Loading…" forever (V4).
  const [loaded, setLoaded] = useState(false);
  // What to load (15 Oct 2026). Every contact used to load for everyone each
  // time the Hub opened - 396 records, unused by most people. Now: a manager
  // whose Home lists "Contacts to fill in" gets their restaurants' contacts;
  // everyone else only the location whose POC page is open.
  const homeNeedsThem = !!user && !hasFeature(user, 'openingChecklist') && hasFeature(user, 'operationalPoc');
  const [watched, setWatched] = useState(null); // { brandId, locationId }
  const watch = useCallback((brandId, locationId) => {
    setWatched({ brandId, locationId });
    return () => setWatched((w) => (w && w.locationId === locationId ? null : w));
  }, []);

  // The rules cannot work out a contact's restaurant on their own - Chelsea's
  // id is a random string - so every contact carries brandId.
  const brandOfLocation = (locationId) => {
    for (const b of brands) {
      if ((b.locations ?? []).some((l) => l.id === locationId)) return b.id;
    }
    for (const b of brands) {
      if (getByBrand(b.id).some((l) => l.id === locationId)) return b.id;
    }
    return null;
  };

  useEffect(() => {
    if (!user) {
      setContacts([]);
      setLoaded(false);
      return;
    }
    // Only the restaurants this person has. Admins and executives take the
    // lot; a manager with none takes nothing rather than everything.
    const seesAll = user.role === 'admin' || user.role === 'executive';
    const mine = user.permissions?.brandIds ?? [];
    let source = null;
    if (watched && !homeNeedsThem) {
      // One location's page. The restaurant is in the query so the rule can
      // see it is one of theirs.
      source = query(collection(db, COLLECTION), where('brandId', '==', watched.brandId), where('locationId', '==', watched.locationId));
    } else if (homeNeedsThem && (seesAll || mine.length > 0)) {
      source = seesAll
        ? collection(db, COLLECTION)
        : query(collection(db, COLLECTION), where('brandId', 'in', mine.slice(0, 30)));
    }
    if (!source) {
      setContacts([]);
      setLoaded(!watched);
      return;
    }
    setLoaded(false);

    const unsubscribe = onSnapshot(source, (snapshot) => {
      const list = snapshot.docs.map(mapContact);
      setContacts(list);
      setLoaded(true);
    },
      (err) => {
        console.error('[OpeningOngoingContacts listener] ' + err.code + ': ' + err.message);
        setLoaded(true);
      }
    );
    return unsubscribe;
  }, [user, homeNeedsThem, watched?.brandId, watched?.locationId]);

  // Contacts assigned to this person, wherever they are (15 Oct 2026), so
  // they reach Needs you on Home even for people whose Home never loads the
  // full list - executives, admins, anyone with the opening checklist. Two
  // small queries: the list of people, and the single-person field that
  // contacts assigned before the list existed still use.
  const [assignedToMe, setAssignedToMe] = useState([]);
  useEffect(() => {
    if (!user?.uid) {
      setAssignedToMe([]);
      return undefined;
    }
    const seesAll = user.role === 'admin' || user.role === 'executive';
    const mine = (user.permissions?.brandIds ?? []).slice(0, 30);
    if (!seesAll && !mine.length) {
      setAssignedToMe([]);
      return undefined;
    }
    // A manager's query names their restaurants so the rule can prove it.
    const scoped = (clause) => (seesAll
      ? query(collection(db, COLLECTION), clause)
      : query(collection(db, COLLECTION), where('brandId', 'in', mine), clause));
    const parts = { list: [], single: [] };
    const merge = () => {
      const byId = new Map();
      for (const c of [...parts.list, ...parts.single]) byId.set(c.id, c);
      setAssignedToMe([...byId.values()]);
    };
    const listen = (key, q) => onSnapshot(
      q,
      (snap) => { parts[key] = snap.docs.map(mapContact); merge(); },
      (err) => console.error('[OpeningOngoingContacts mine] ' + err.code + ': ' + err.message)
    );
    const a = listen('list', scoped(where('assignedToUids', 'array-contains', user.uid)));
    const b = listen('single', scoped(where('assignedToUid', '==', user.uid)));
    return () => { a(); b(); };
  }, [user?.uid, user?.role, (user?.permissions?.brandIds ?? []).join(',')]);

  // Hand contacts to one or more people (an empty list takes everyone off).
  // Named ids, or every unfilled, unassigned one in a section ('all' for
  // every section). The server checks who may assign and who may hold them,
  // and sends each new person one email (15 Oct 2026).
  const assignContacts = async ({ brandId, locationId, contactIds = null, section = null, uids }) => {
    const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'assignPocContacts');
    const res = await fn({ brandId, locationId, contactIds, section, uids: uids ?? [] });
    return res.data?.assigned ?? 0;
  };

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
            const seedBrandId = brandOfLocation(locationId);
            tx.set(ref, {
              locationId,
              brandId: seedBrandId,
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
          // Without it, only admins could see these (S13).
          brandId: brandOfLocation(locationId),
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

  const addContact = async (locationId, section, item) => {
    // Ordered after everything that exists, so it lands at the bottom of its
    // section rather than renumbering anything.
    const existing = await getDocs(query(collection(db, COLLECTION), where('locationId', '==', locationId)));
    let maxOrder = 0;
    existing.forEach((d) => {
      const o = d.data().order;
      if (typeof o === 'number' && o > maxOrder) maxOrder = o;
    });

    await addDoc(collection(db, COLLECTION), {
      locationId,
      brandId: brandOfLocation(locationId),
      section,
      item,
      who: '',
      vendor: '',
      contactNameNumber: '',
      accountNumber: '',
      order: maxOrder + 1,
    });
  };

  const deleteContact = async (id) => {
    await deleteDoc(doc(db, COLLECTION, id));
  };

  return (
    <OpeningOngoingContactsContext.Provider
      value={{ loaded, watch, assignContacts, assignedToMe, getByLocation, ensureSeeded, updateContactField, regenerateForLocation, addContact, deleteContact }}
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
