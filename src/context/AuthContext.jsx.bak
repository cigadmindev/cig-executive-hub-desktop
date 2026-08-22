import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, secondaryAuth, db, storage } from '../firebaseConfig';

const AuthContext = createContext(undefined);

// Same shape as the mobile app's UserAccount — this file reads the exact
// same `users` Firestore collection, so any account, permission, or
// deactivation set from the phone applies identically here.
async function fetchProfile(uid, email) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    uid,
    email,
    role: data.role,
    name: data.name,
    permissions: data.permissions ?? { brandIds: [], categoryIds: [] },
    active: data.active ?? true,
    pushToken: data.pushToken ?? null,
    job: data.job ?? null,
    photoUrl: data.photoUrl ?? null,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshUsers = async () => {
    const snap = await getDocs(collection(db, 'users'));
    setUsers(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          email: data.email,
          role: data.role,
          name: data.name,
          permissions: data.permissions ?? { brandIds: [], categoryIds: [] },
          active: data.active ?? true,
          pushToken: data.pushToken ?? null,
          job: data.job ?? null,
          photoUrl: data.photoUrl ?? null,
        };
      })
    );
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const profile = await fetchProfile(firebaseUser.uid, firebaseUser.email ?? '');
        if (profile && !profile.active) {
          await signOut(auth);
          setUser(null);
        } else {
          setUser(profile);
        }
        await refreshUsers();
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email, password) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const profile = await fetchProfile(cred.user.uid, cred.user.email ?? '');
      if (!profile) return 'no-profile';
      if (!profile.active) {
        await signOut(auth);
        return 'deactivated';
      }
      return 'success';
    } catch (err) {
      return 'invalid-credentials';
    }
  };

  const logout = () => signOut(auth);

  // Uses a SECOND, independent Firebase Auth instance to create the new
  // account so the admin doesn't get signed out of their own session.
  const addUser = async ({ name, email, password, role, permissions, job }) => {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
    await setDoc(doc(db, 'users', cred.user.uid), {
      name,
      email: email.trim(),
      role,
      permissions,
      active: true,
      job: job ?? null,
    });
    await signOut(secondaryAuth);
    await sendPasswordResetEmail(auth, email.trim());
    await refreshUsers();
  };

  const sendPasswordReset = async (email) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  // Apple requires apps that support login to also let people delete their
  // own account from within the app. Firebase requires a fresh login before
  // allowing self-deletion, so this re-authenticates with the password first.
  const deleteMyAccount = async (password) => {
    const current = auth.currentUser;
    if (!current || !current.email) return { success: false, error: 'Not logged in.' };
    try {
      const credential = EmailAuthProvider.credential(current.email, password);
      await reauthenticateWithCredential(current, credential);
    } catch (err) {
      return { success: false, error: 'Incorrect password.' };
    }
    try {
      await deleteDoc(doc(db, 'users', current.uid));
      await deleteUser(current);
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message ?? 'Something went wrong deleting your account.' };
    }
  };

  const updatePermissions = async (uid, permissions) => {
    await updateDoc(doc(db, 'users', uid), { permissions });
    await refreshUsers();
    setUser((prev) => (prev && prev.uid === uid ? { ...prev, permissions } : prev));
  };

  // Changing an existing login's role from Manage Logins. Managers'
  // brand/category permissions stay on the record even if they're moved
  // to admin/executive — switching back to manager later restores
  // exactly what they had before.
  const updateUserRole = async (uid, role) => {
    await updateDoc(doc(db, 'users', uid), { role });
    await refreshUsers();
    setUser((prev) => (prev && prev.uid === uid ? { ...prev, role } : prev));
  };

  // Self-service profile editing — name and/or a profile photo, from the
  // sidebar. photoFile is an actual File from a picker; passing null for
  // it leaves the existing photo untouched (so name-only edits don't wipe
  // the picture).
  const updateMyProfile = async ({ name, photoFile }) => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const updates = {};
    if (name && name.trim()) updates.name = name.trim();

    if (photoFile) {
      const fileRef = ref(storage, `profilePhotos/${uid}`);
      await uploadBytes(fileRef, photoFile);
      updates.photoUrl = await getDownloadURL(fileRef);
    }

    if (Object.keys(updates).length === 0) return;
    await updateDoc(doc(db, 'users', uid), updates);
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
    await refreshUsers();
  };

  // Deactivating doesn't delete the Firebase Auth account (needs a
  // server-side Admin SDK this client-only setup doesn't have) — it flips a
  // Firestore flag that blocks login on the app's side instead.
  // Deactivating now fully removes the Firestore profile — they disappear
  // from Manage Logins, every assignee/needs picker, everywhere, and can no
  // longer get into the app at all (no profile = the app treats them as
  // signed out). This is permanent — there's no more reactivate toggle,
  // since there's nothing left to reactivate. One real limit: this can't
  // delete the underlying Firebase Auth credential itself (needs a backend
  // with admin access, which this client-only app doesn't have) — but
  // without a profile, that credential is functionally useless anyway.
  const setUserActive = async (uid, active) => {
    if (!active) {
      await deleteDoc(doc(db, 'users', uid));
    } else {
      await updateDoc(doc(db, 'users', uid), { active });
    }
    await refreshUsers();
  };

  // Same permission logic as mobile: admins see everything, managers only
  // what's explicitly granted.
  const hasBrandAccess = (u, brandId) =>
    !!u && (u.role === 'admin' || u.role === 'executive' || u.permissions.brandIds.includes(brandId));
  const hasCategoryAccess = (u, categoryId) =>
    !!u && (u.role === 'admin' || u.role === 'executive' || u.permissions.categoryIds.includes(categoryId));

  return (
    <AuthContext.Provider
      value={{
        user,
        users,
        loading,
        login,
        logout,
        addUser,
        updatePermissions,
        updateUserRole,
        updateMyProfile,
        setUserActive,
        sendPasswordReset,
        deleteMyAccount,
        hasBrandAccess,
        hasCategoryAccess,
        refreshUsers,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
