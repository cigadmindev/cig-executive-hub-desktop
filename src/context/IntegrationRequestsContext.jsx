import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from './AuthContext';

// Requests about Toast, R365 and OpenTable - either something that needs
// changing, or someone who needs help.
//
// Two kinds because they are different work. A change is "the price is wrong
// at Ridgeland" and ends with an edit, ideally applied consistently across
// every location. Help is "I cannot work out how to do this" and ends with an
// answer. Whoever holds IT / Training wants to know which at a glance.
//
// Three states rather than approved/denied: this is not approval, it is work.
// In progress matters because a change across five locations is not instant
// and the person who asked should not think they have been ignored.
const COLLECTION = 'integrationRequests';

// Only the three integrations. Anything about the Hub itself goes through
// Support, and offering a catch-all here would blur which screen is for what.
export const SYSTEMS = ['Toast', 'Restaurant365', 'OpenTable'];
export const KINDS = [
  { key: 'change', label: 'Something needs changing' },
  { key: 'help', label: 'I need help with something' },
];

const IntegrationRequestsContext = createContext(undefined);

export function IntegrationRequestsProvider({ children }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);

  // Whoever holds the job sees everything. Everyone else sees what they sent.
  // Job rather than person, because Cameron is moving into this role and the
  // routing should follow the job rather than her name.
  const handlesRequests = user?.role === 'admin' || user?.job === 'IT / Training';

  useEffect(() => {
    if (!user) {
      setRequests([]);
      return;
    }

    const base = collection(db, COLLECTION);
    const q = handlesRequests
      ? query(base, orderBy('createdAt', 'desc'))
      : query(base, where('createdByUid', '==', user.uid), orderBy('createdAt', 'desc'));

    return onSnapshot(
      q,
      (snapshot) => {
        setRequests(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              kind: data.kind ?? 'change',
              system: data.system ?? '',
              locationId: data.locationId ?? null,
              locationName: data.locationName ?? '',
              detail: data.detail ?? '',
              status: data.status ?? 'open',
              createdByUid: data.createdByUid ?? null,
              createdByName: data.createdByName ?? '',
              createdAt: data.createdAt ?? 0,
              response: data.response ?? '',
              respondedByName: data.respondedByName ?? '',
              respondedAt: data.respondedAt ?? null,
              seenByHandler: data.seenByHandler === true,
            };
          })
        );
      },
      (err) => console.error('[IntegrationRequests listener] ' + err.code + ': ' + err.message)
    );
  }, [user, handlesRequests]);

  const submitRequest = async ({ kind, system, locationId, locationName, detail }) => {
    if (!user) throw new Error('You must be signed in.');
    await addDoc(collection(db, COLLECTION), {
      kind,
      system,
      locationId: locationId || null,
      locationName: locationName || '',
      detail: detail.trim(),
      status: 'open',
      createdByUid: user.uid,
      createdByName: user.name ?? 'Unknown',
      createdAt: Date.now(),
      response: '',
      respondedByName: '',
      respondedAt: null,
      seenByHandler: false,
    });
  };

  // Answering and resolving are the same action for a help request - the
  // answer is the resolution. Kept separate from status so a change can be
  // moved to in progress with a note about when it will land.
  const respond = async (id, { response, status }) => {
    if (!user) throw new Error('You must be signed in.');
    const updates = { seenByHandler: true };
    if (typeof response === 'string') {
      updates.response = response.trim();
      updates.respondedByName = user.name ?? 'Unknown';
      updates.respondedAt = Date.now();
    }
    if (status) updates.status = status;
    await updateDoc(doc(db, COLLECTION, id), updates);
  };

  const markSeen = async (id) => {
    await updateDoc(doc(db, COLLECTION, id), { seenByHandler: true });
  };

  // Drives the dot. For the handler, anything unseen. For everyone else,
  // anything of theirs that has been answered since they last looked - which
  // the screen clears when they open it.
  const hasUnseen = () =>
    handlesRequests
      ? requests.some((r) => !r.seenByHandler)
      : requests.some((r) => r.respondedAt && r.status !== 'open');

  const openCount = () => requests.filter((r) => r.status !== 'done').length;

  return (
    <IntegrationRequestsContext.Provider
      value={{ requests, handlesRequests, submitRequest, respond, markSeen, hasUnseen, openCount }}
    >
      {children}
    </IntegrationRequestsContext.Provider>
  );
}

export function useIntegrationRequests() {
  const ctx = useContext(IntegrationRequestsContext);
  if (!ctx) throw new Error('useIntegrationRequests must be used inside IntegrationRequestsProvider');
  return ctx;
}
