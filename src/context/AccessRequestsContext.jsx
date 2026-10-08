import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from './AuthContext';

// Someone asked to see a page, folder, restaurant or location their login
// can't reach. Admins decide (decided 5 October 2026).
//
// Decided requests are kept - they are the record of who was given what, and
// the Approved / Declined lists on the page read them. They used to be
// deleted a week after they were decided.
const AccessRequestsContext = createContext(undefined);
const COLLECTION = 'accessRequests';

export function AccessRequestsProvider({ children }) {
  const [requests, setRequests] = useState([]);
  const { user, users, updatePermissions } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!user) {
      setRequests([]);
      return;
    }
    // Admins see everything; everyone else sees their own, which is all the
    // rule allows them to read anyway.
    const source = isAdmin
      ? collection(db, COLLECTION)
      : query(collection(db, COLLECTION), where('userEmail', '==', user.email));

    return onSnapshot(
      source,
      (snapshot) => {
        setRequests(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              userEmail: data.userEmail,
              userName: data.userName,
              type: data.type,
              brandId: data.brandId ?? null,
              targetId: data.targetId,
              targetLabel: data.targetLabel,
              locationName: data.locationName ?? '',
              reason: data.reason ?? '',
              timestamp: data.timestamp ?? 0,
              status: data.status ?? 'pending',
              resolvedAt: data.resolvedAt ?? null,
              resolvedByName: data.resolvedByName ?? '',
              declineReason: data.declineReason ?? '',
              granted: data.granted ?? null,
              statusChangedByName: data.statusChangedByName ?? '',
              statusChangedAt: data.statusChangedAt ?? null,
              statusChangeReason: data.statusChangeReason ?? '',
            };
          })
        );
      },
      (err) => console.error('[AccessRequests listener] ' + err.code + ': ' + err.message)
    );
  }, [user, isAdmin]);

  const addRequest = async (req) => {
    await addDoc(collection(db, COLLECTION), {
      ...req,
      timestamp: Date.now(),
      status: 'pending',
      resolvedAt: null,
    });
  };

  const personFor = (req) => {
    const wanted = (req.userEmail ?? '').trim().toLowerCase();
    return users.find((u) => (u.email ?? '').trim().toLowerCase() === wanted) ?? null;
  };

  // Exactly what was asked for, added to what they already have - never the
  // whole job row. Returns what was given, kept on the request so it can be
  // taken back if an admin later changes the answer.
  const grant = async (req) => {
    const person = personFor(req);
    if (!person) throw new Error(`${req.userName ?? 'That person'} could not be matched to a login for ${req.userEmail}. Check the address in Manage Logins.`);
    const p = person.permissions ?? {};
    const next = { ...p };
    const add = (list, id) => [...new Set([...(list ?? []), id])];
    if (req.type === 'category') next.extraFolders = add(p.extraFolders, req.targetId);
    else if (req.type === 'feature') next.extraFeatures = add(p.extraFeatures, req.targetId);
    else if (req.type === 'brand') {
      next.brandIds = add(p.brandIds, req.targetId);
      // A whole restaurant: every location in it.
      const { [req.targetId]: _drop, ...rest } = p.locationsByBrand ?? {};
      next.locationsByBrand = rest;
    } else if (req.type === 'location' && req.brandId) {
      // They already had this restaurant narrowed to some locations, or they
      // would not have needed to ask - so this adds one to that list.
      next.brandIds = add(p.brandIds, req.brandId);
      const current = p.locationsByBrand?.[req.brandId] ?? [];
      next.locationsByBrand = { ...(p.locationsByBrand ?? {}), [req.brandId]: add(current, req.targetId) };
    } else {
      throw new Error('This request does not say what it is for, so nothing can be granted.');
    }
    await updatePermissions(person.uid, next);
    return { type: req.type, targetId: req.targetId, brandId: req.brandId ?? null };
  };

  // Takes back exactly what an approval gave.
  const revoke = async (req) => {
    const g = req.granted;
    if (!g) return;
    const person = personFor(req);
    if (!person) return;
    const p = person.permissions ?? {};
    const next = { ...p };
    const drop = (list, id) => (list ?? []).filter((x) => x !== id);
    if (g.type === 'category') next.extraFolders = drop(p.extraFolders, g.targetId);
    else if (g.type === 'feature') next.extraFeatures = drop(p.extraFeatures, g.targetId);
    else if (g.type === 'brand') next.brandIds = drop(p.brandIds, g.targetId);
    else if (g.type === 'location' && g.brandId) {
      const left = drop(p.locationsByBrand?.[g.brandId], g.targetId);
      // An empty list means every location, which would widen them - so if
      // this was the last one, the restaurant goes too.
      if (left.length === 0) {
        const { [g.brandId]: _drop, ...rest } = p.locationsByBrand ?? {};
        next.locationsByBrand = rest;
        next.brandIds = drop(p.brandIds, g.brandId);
      } else {
        next.locationsByBrand = { ...(p.locationsByBrand ?? {}), [g.brandId]: left };
      }
    }
    await updatePermissions(person.uid, next);
  };

  const approve = async (req) => {
    const granted = await grant(req);
    await updateDoc(doc(db, COLLECTION, req.id), {
      status: 'approved', resolvedAt: Date.now(), resolvedByName: user?.name ?? null, granted,
    });
  };

  const decline = async (req, reason) => {
    if (!reason?.trim()) throw new Error('Give a reason - they will see it.');
    await updateDoc(doc(db, COLLECTION, req.id), {
      status: 'denied', resolvedAt: Date.now(), resolvedByName: user?.name ?? null, declineReason: reason.trim(),
    });
  };

  // Admins can move a request to any step. Access follows the answer: moving
  // to Approved gives it, moving away from Approved takes it back.
  const adminSetStatus = async (req, status, reason) => {
    if (!reason?.trim()) throw new Error('Give a reason - the person who asked will see it.');
    let granted = req.granted ?? null;
    if (req.status === 'approved' && status !== 'approved') {
      await revoke(req);
      granted = null;
    }
    if (status === 'approved' && req.status !== 'approved') granted = await grant(req);
    await updateDoc(doc(db, COLLECTION, req.id), {
      status,
      granted,
      statusChangedByName: user?.name ?? '',
      statusChangedAt: Date.now(),
      statusChangeReason: reason.trim(),
      ...(status === 'pending' ? {} : { resolvedAt: Date.now(), resolvedByName: user?.name ?? null }),
      ...(status === 'denied' ? { declineReason: reason.trim() } : {}),
    });
  };

  const hasPendingRequest = (userEmail, type, targetId) =>
    requests.some((r) => r.userEmail === userEmail && r.type === type && r.targetId === targetId && r.status === 'pending');

  return (
    <AccessRequestsContext.Provider value={{ requests, addRequest, approve, decline, adminSetStatus, hasPendingRequest, personFor }}>
      {children}
    </AccessRequestsContext.Provider>
  );
}

export function useAccessRequests() {
  const ctx = useContext(AccessRequestsContext);
  if (!ctx) throw new Error('useAccessRequests must be used within AccessRequestsProvider');
  return ctx;
}
