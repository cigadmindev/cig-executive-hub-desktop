import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc , query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { brandOfLocation } from '../data/brandOfLocation';
import { normaliseDriveUrl } from '../data/mockData';
import { useAuth } from './AuthContext';

const CategoryDriveLinksContext = createContext(undefined);
const COLLECTION = 'categoryDriveLinks';

// Each individual item inside a category (e.g. "P&L Reports" inside
// Financials) gets its own Drive folder — not one link for the whole
// category. Keyed by location + category + the exact item name.
//
// Item names can contain characters Firestore document IDs don't allow —
// most importantly '/', which Firestore treats as a path separator, not a
// literal character (e.g. "P&L Reports (by month/year)" or "Current Menus
// (by location/concept)"). Every attempt to connect those specific items
// was hitting an invalid-document-ID error. encodeURIComponent makes the
// key safe for ANY item name, not just today's known offenders.
function keyFor(locationId, categoryId, itemName) {
  return `${locationId}_${categoryId}_${encodeURIComponent(itemName)}`;
}

export function CategoryDriveLinksProvider({ children }) {
  const { user } = useAuth();

  const setLink = async (locationId, categoryId, itemName, rawUrl) => {
    const driveUrl = normaliseDriveUrl(rawUrl);
    await setDoc(doc(db, COLLECTION, keyFor(locationId, categoryId, itemName)), {
      brandId: await brandOfLocation(locationId),
      locationId,
      categoryId,
      itemName,
      driveUrl,
      updatedAt: Date.now(),
      updatedBy: user?.name ?? 'Unknown',
    });
  };

  return (
    <CategoryDriveLinksContext.Provider value={{ setLink }}>
      {children}
    </CategoryDriveLinksContext.Provider>
  );
}

// Only the links for the one folder page that is open (15 Oct 2026). Every
// page used to load all 553 links, for everyone, every time the Hub opened -
// the biggest single share of the day's database reads. The restaurant is in
// the query so the rule can see it is one of theirs.
export function useCategoryDriveLinks(brandId, locationId, categoryId) {
  const ctx = useContext(CategoryDriveLinksContext);
  if (!ctx) throw new Error('useCategoryDriveLinks must be used within CategoryDriveLinksProvider');
  const { user } = useAuth();
  const [linksByKey, setLinksByKey] = useState({});

  useEffect(() => {
    setLinksByKey({});
    if (!user || !brandId || !locationId || !categoryId) return undefined;
    const source = query(
      collection(db, COLLECTION),
      where('brandId', '==', brandId),
      where('locationId', '==', locationId),
      where('categoryId', '==', categoryId)
    );
    return onSnapshot(
      source,
      (snapshot) => {
        const map = {};
        snapshot.docs.forEach((d) => {
          const data = d.data();
          map[keyFor(data.locationId, data.categoryId, data.itemName)] = data.driveUrl;
        });
        setLinksByKey(map);
      },
      (err) => console.error('[CategoryDriveLinks listener] ' + err.code + ': ' + err.message)
    );
  }, [user?.uid, brandId, locationId, categoryId]);

  const getLink = (loc, cat, itemName) => linksByKey[keyFor(loc, cat, itemName)] ?? null;
  return { getLink, setLink: ctx.setLink };
}
