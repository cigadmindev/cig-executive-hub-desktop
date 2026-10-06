import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from './AuthContext';
import { ROWS } from '../data/accessMatrix';

// The live "who sees what" table: the approved defaults in data/accessMatrix,
// with any cell an admin has changed (stored in accessMatrix/{rowId}) on top.
const AccessMatrixContext = createContext(undefined);

export function AccessMatrixProvider({ children }) {
  const { user } = useAuth();
  const [overrides, setOverrides] = useState({});

  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(
      collection(db, 'accessMatrix'),
      (snap) => setOverrides(Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))),
      (err) => console.error('[AccessMatrix] ' + err.code + ': ' + err.message)
    );
  }, [user?.uid]);

  const matrix = useMemo(
    () => Object.fromEntries(ROWS.map((row) => [row.id, { ...row.d, ...(overrides[row.id] ?? {}) }])),
    [overrides]
  );

  // Admins only - the rule refuses anyone else.
  const setCell = (rowId, column, value) =>
    setDoc(doc(db, 'accessMatrix', rowId), { [column]: value, updatedAt: Date.now(), updatedBy: user?.name ?? null }, { merge: true });

  const changed = (rowId, column) => overrides[rowId]?.[column] !== undefined;

  return <AccessMatrixContext.Provider value={{ matrix, setCell, changed }}>{children}</AccessMatrixContext.Provider>;
}

export function useAccessMatrix() {
  const ctx = useContext(AccessMatrixContext);
  if (!ctx) throw new Error('useAccessMatrix must be used within AccessMatrixProvider');
  return ctx;
}
