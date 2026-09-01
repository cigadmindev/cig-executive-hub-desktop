import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
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
  const [linksByKey, setLinksByKey] = useState({});

  useEffect(() => {
    if (!user) {
      setLinksByKey({});
      return;
    }
    const unsubscribe = onSnapshot(collection(db, COLLECTION), (snapshot) => {
      const map = {};
      snapshot.docs.forEach((d) => {
        const data = d.data();
        map[keyFor(data.locationId, data.categoryId, data.itemName)] = data.driveUrl;
      });
      setLinksByKey(map);
    },
      (err) => console.error('[CategoryDriveLinks listener] ' + err.code + ': ' + err.message)
    );
    return unsubscribe;
  }, [user]);

  const getLink = (locationId, categoryId, itemName) => linksByKey[keyFor(locationId, categoryId, itemName)] ?? null;

  const setLink = async (locationId, categoryId, itemName, driveUrl) => {
    await setDoc(doc(db, COLLECTION, keyFor(locationId, categoryId, itemName)), {
      locationId,
      categoryId,
      itemName,
      driveUrl,
      updatedAt: Date.now(),
      updatedBy: user?.name ?? 'Unknown',
    });
  };

  return (
    <CategoryDriveLinksContext.Provider value={{ getLink, setLink }}>
      {children}
    </CategoryDriveLinksContext.Provider>
  );
}

export function useCategoryDriveLinks() {
  const ctx = useContext(CategoryDriveLinksContext);
  if (!ctx) throw new Error('useCategoryDriveLinks must be used within CategoryDriveLinksProvider');
  return ctx;
}
