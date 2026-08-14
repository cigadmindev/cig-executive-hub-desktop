import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useAuth } from './AuthContext';

const CustomLocationsContext = createContext(undefined);

export function CustomLocationsProvider({ children }) {
  const { user } = useAuth();
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    if (!user) {
      setLocations([]);
      return;
    }
    const unsubscribe = onSnapshot(collection(db, 'customLocations'), (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          brandId: data.brandId,
          name: data.name,
          createdBy: data.createdBy ?? null,
          timestamp: data.timestamp,
        };
      });
      setLocations(list);
    });
    return unsubscribe;
  }, [user]);

  const getByBrand = (brandId) =>
    locations.filter((l) => l.brandId === brandId).sort((a, b) => a.timestamp - b.timestamp);

  const addLocation = async (brandId, name) => {
    await addDoc(collection(db, 'customLocations'), {
      brandId,
      name,
      createdBy: auth.currentUser?.uid ?? null,
      timestamp: Date.now(),
    });
  };

  // Deletes the location itself, plus every piece of data tied to it that
  // would otherwise be orphaned — same cascade as mobile.
  const deleteLocation = async (id) => {
    await deleteDoc(doc(db, 'customLocations', id));
    const collectionsToClean = ['categoryPosts', 'schedules', 'permitItems', 'licenseRenewals', 'eventRequests'];
    for (const collName of collectionsToClean) {
      const snap = await getDocs(query(collection(db, collName), where('locationId', '==', id)));
      if (snap.empty) continue;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  };

  return (
    <CustomLocationsContext.Provider value={{ getByBrand, addLocation, deleteLocation }}>
      {children}
    </CustomLocationsContext.Provider>
  );
}

export function useCustomLocations() {
  const ctx = useContext(CustomLocationsContext);
  if (!ctx) throw new Error('useCustomLocations must be used within CustomLocationsProvider');
  return ctx;
}
