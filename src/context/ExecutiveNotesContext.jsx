import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from './AuthContext';

const ExecutiveNotesContext = createContext(undefined);
const DOC_REF = 'appSettings/executiveNotes';

export function ExecutiveNotesProvider({ children }) {
  const { user } = useAuth();
  const [driveUrl, setDriveUrl] = useState(null);

  useEffect(() => {
    if (!user) {
      setDriveUrl(null);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, DOC_REF), (snap) => {
      setDriveUrl(snap.exists() ? snap.data().driveUrl ?? null : null);
    });
    return unsubscribe;
  }, [user]);

  // Setting where this points is a structural, "fundamental" action —
  // admin-only, same as connecting any other Drive folder. Executives can
  // open it once set, just not redirect it somewhere else.
  const setLink = async (driveUrl, updatedByName) => {
    await setDoc(doc(db, DOC_REF), { driveUrl, updatedAt: Date.now(), updatedBy: updatedByName });
  };

  return (
    <ExecutiveNotesContext.Provider value={{ driveUrl, setLink }}>{children}</ExecutiveNotesContext.Provider>
  );
}

export function useExecutiveNotes() {
  const ctx = useContext(ExecutiveNotesContext);
  if (!ctx) throw new Error('useExecutiveNotes must be used within ExecutiveNotesProvider');
  return ctx;
}
