import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useAuth } from './AuthContext';

const SupportRequestsContext = createContext(undefined);
const COLLECTION = 'supportRequests';

export const SUPPORT_AREAS = [
  'Messages',
  'Calendar',
  'Availability',
  'Event Requests',
  'Permits & Licenses',
  'License & Lease Renewals',
  'Announcements',
  'Admin Tools',
  'Login / Account',
  'Something Else',
];

export const SUPPORT_ERROR_TYPES = [
  'App Bug / Crash',
  'Message or Chat Error',
  'Scheduling or Calendar Error',
  'Login / Account Error',
  'Permissions or Access Error',
  'Data Not Showing Correctly',
  'Notification Error',
  'Other',
];

// Support is handled by admins as a role. Kept as a named export so call
// sites read clearly, but it resolves from the user's role, not an address.
export const isSupportAdmin = (user) => user?.role === 'admin';

export function SupportRequestsProvider({ children }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    if (!user) {
      setRequests([]);
      return;
    }
    const unsubscribe = onSnapshot(collection(db, COLLECTION), (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          submitterUid: data.submitterUid,
          submitterName: data.submitterName,
          submitterEmail: data.submitterEmail,
          platform: data.platform,
          area: data.area,
          errorType: data.errorType,
          description: data.description,
          status: data.status ?? 'new',
          timestamp: data.timestamp,
          resolvedAt: data.resolvedAt ?? null,
        };
      });
      setRequests(list);
    });
    return unsubscribe;
  }, [user]);

  const submitRequest = async ({ area, errorType, description }) => {
    await addDoc(collection(db, COLLECTION), {
      submitterUid: auth.currentUser?.uid ?? null,
      submitterName: user?.name ?? 'Unknown',
      submitterEmail: user?.email ?? '',
      platform: 'desktop',
      area,
      errorType,
      description,
      status: 'new',
      timestamp: Date.now(),
      resolvedAt: null,
    });
  };

  const setStatus = async (id, status) => {
    await updateDoc(doc(db, COLLECTION, id), {
      status,
      resolvedAt: status === 'completed' ? Date.now() : null,
    });
  };

  return (
    <SupportRequestsContext.Provider value={{ requests, submitRequest, setStatus }}>
      {children}
    </SupportRequestsContext.Provider>
  );
}

export function useSupportRequests() {
  const ctx = useContext(SupportRequestsContext);
  if (!ctx) throw new Error('useSupportRequests must be used within SupportRequestsProvider');
  return ctx;
}
