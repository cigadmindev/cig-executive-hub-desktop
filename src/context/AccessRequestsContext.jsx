import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from './AuthContext';

const AccessRequestsContext = createContext(undefined);
const COLLECTION = 'accessRequests';
const RESOLVED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function AccessRequestsProvider({ children }) {
  const [requests, setRequests] = useState([]);
  const { user } = useAuth();

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
          userEmail: data.userEmail,
          userName: data.userName,
          type: data.type,
          targetId: data.targetId,
          targetLabel: data.targetLabel,
          reason: data.reason ?? '',
          timestamp: data.timestamp,
          status: data.status,
          resolvedAt: data.resolvedAt ?? null,
        };
      });
      setRequests(list);

      const now = Date.now();
      list.forEach((r) => {
        if (r.status !== 'pending' && r.resolvedAt && now - r.resolvedAt > RESOLVED_RETENTION_MS) {
          deleteDoc(doc(db, COLLECTION, r.id)).catch(() => {});
        }
      });
    });
    return unsubscribe;
  }, [user]);

  const addRequest = async (req) => {
    await addDoc(collection(db, COLLECTION), {
      ...req,
      timestamp: Date.now(),
      status: 'pending',
      resolvedAt: null,
    });
  };

  const resolveRequest = async (id, status) => {
    await updateDoc(doc(db, COLLECTION, id), { status, resolvedAt: Date.now() });
  };

  const hasPendingRequest = (userEmail, type, targetId) =>
    requests.some((r) => r.userEmail === userEmail && r.type === type && r.targetId === targetId && r.status === 'pending');

  return (
    <AccessRequestsContext.Provider value={{ requests, addRequest, resolveRequest, hasPendingRequest }}>
      {children}
    </AccessRequestsContext.Provider>
  );
}

export function useAccessRequests() {
  const ctx = useContext(AccessRequestsContext);
  if (!ctx) throw new Error('useAccessRequests must be used within AccessRequestsProvider');
  return ctx;
}
