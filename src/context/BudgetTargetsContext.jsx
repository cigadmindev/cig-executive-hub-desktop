import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

// What a receipt can be charged to.
//
// Deliberately not the location list. Most travel spend happens before a
// location exists - flying to Birmingham to look at sites is exactly the kind
// of cost that needs charging to Birmingham, months before there is a
// Birmingham location record to point at.
//
// So this is a separate list admins maintain: existing restaurants, plus any
// market being scouted. Archived rather than deleted, because a target that
// has receipts against it still needs to resolve when an old report is read.
const COLLECTION = 'budgetTargets';

const BudgetTargetsContext = createContext(undefined);

export function BudgetTargetsProvider({ children }) {
  const [targets, setTargets] = useState([]);

  useEffect(() => {
    const q = query(collection(db, COLLECTION), orderBy('name'));
    return onSnapshot(
      q,
      (snapshot) => {
        setTargets(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name ?? '',
              archived: data.archived === true,
            };
          })
        );
      },
      (err) => console.error('[BudgetTargets listener] ' + err.code + ': ' + err.message)
    );
  }, []);

  const addTarget = async (name) => {
    await addDoc(collection(db, COLLECTION), {
      name: name.trim(),
      archived: false,
      createdBy: auth.currentUser?.uid ?? null,
      createdAt: Date.now(),
    });
  };

  // Archived, never deleted. Receipts already charged to it keep resolving,
  // and an old report stays readable.
  const archiveTarget = async (id) => {
    await updateDoc(doc(db, COLLECTION, id), { archived: true });
  };

  const restoreTarget = async (id) => {
    await updateDoc(doc(db, COLLECTION, id), { archived: false });
  };

  // What the receipt form offers. Archived targets stay out of the picker but
  // still resolve by name on records that already carry them.
  const activeTargets = targets.filter((t) => !t.archived);

  return (
    <BudgetTargetsContext.Provider
      value={{ targets, activeTargets, addTarget, archiveTarget, restoreTarget }}
    >
      {children}
    </BudgetTargetsContext.Provider>
  );
}

export function useBudgetTargets() {
  const ctx = useContext(BudgetTargetsContext);
  if (!ctx) throw new Error('useBudgetTargets must be used inside BudgetTargetsProvider');
  return ctx;
}
