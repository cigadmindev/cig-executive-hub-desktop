import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useAuth } from './AuthContext';

// Saved starting points for a new login.
//
// Setting someone up is around twenty decisions - role, job, restaurants,
// locations, eleven folders, nine features - made from memory every time. A
// preset carries the ones that belong to the role, so the only thing left to
// decide is which restaurant and location this particular person works at.
//
// Deliberately not restaurants or locations: Steven is an assistant manager
// at Starkville and Conner is one at Ridgeland. Same role, different places.
// A preset that carried a location would need one per person, which is not a
// preset.
//
// A preset is a starting point, not a live link. Changing one does not change
// anyone already set up from it.
const COLLECTION = 'accessPresets';

const AccessPresetsContext = createContext(undefined);

export function AccessPresetsProvider({ children }) {
  const { user } = useAuth();
  const [presets, setPresets] = useState([]);

  useEffect(() => {
    // Only admins create logins, and the rule allows nobody else to read
    // these - so nobody else should be asking.
    if (user?.role !== 'admin') {
      setPresets([]);
      return;
    }
    return onSnapshot(
      query(collection(db, COLLECTION), orderBy('name')),
      (snapshot) =>
        setPresets(
          snapshot.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              name: x.name ?? '',
              role: x.role ?? 'manager',
              job: x.job ?? null,
              categoryIds: x.categoryIds ?? [],
              features: x.features ?? [],
            };
          })
        ),
      (err) => console.error('[AccessPresets] ' + err.code + ': ' + err.message)
    );
  }, [user]);

  const savePreset = async ({ id, name, role, job, categoryIds, features }) => {
    const body = {
      name: name.trim(),
      role,
      job: job ?? null,
      categoryIds,
      features,
      updatedAt: Date.now(),
      updatedBy: auth.currentUser?.uid ?? null,
    };
    if (id) await setDoc(doc(db, COLLECTION, id), body, { merge: true });
    else await addDoc(collection(db, COLLECTION), body);
  };

  const deletePreset = async (id) => {
    await deleteDoc(doc(db, COLLECTION, id));
  };

  return (
    <AccessPresetsContext.Provider value={{ presets, savePreset, deletePreset }}>
      {children}
    </AccessPresetsContext.Provider>
  );
}

export function useAccessPresets() {
  const ctx = useContext(AccessPresetsContext);
  if (!ctx) throw new Error('useAccessPresets must be used inside AccessPresetsProvider');
  return ctx;
}
