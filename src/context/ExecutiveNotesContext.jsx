import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { normaliseDriveUrl } from '../data/mockData';
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
    },
      (err) => console.error('[ExecutiveNotes listener] ' + err.code + ': ' + err.message)
    );
    return unsubscribe;
  }, [user]);

  // Setting where this points is a structural, "fundamental" action —
  // admin-only, same as connecting any other Drive folder. Executives can
  // open it once set, just not redirect it somewhere else.
  const setLink = async (rawUrl, updatedByName) => {
    // Same reason as the category links: a URL copied out of Drive while signed
    // into more than one account carries /u/N/, which sends everyone else to an
    // access error rather than the folder.
    const driveUrl = normaliseDriveUrl(rawUrl);
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
