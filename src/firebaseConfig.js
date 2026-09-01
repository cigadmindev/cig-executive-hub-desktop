import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Same project as the mobile app — this is what makes the desktop app show
// live, real-time changes from the phone (and vice versa) automatically,
// with zero extra syncing code needed.
const firebaseConfig = {
  apiKey: 'AIzaSyAI8hEo1YVcMoyhTswtFc_-pzTEx5xqnZo',
  authDomain: 'cig-executive-hub.firebaseapp.com',
  projectId: 'cig-executive-hub',
  storageBucket: 'cig-executive-hub.firebasestorage.app',
  messagingSenderId: '616205359385',
  appId: '1:616205359385:web:9aee5975a18e5757efcd88',
};

// There used to be a second app instance here so an admin could create a
// login without the client SDK signing them in as the new user. Account
// creation now happens in a Cloud Function with the Admin SDK, so the admin's
// session is never touched. Mobile removed its equivalent at the time; this
// one was left behind and referenced nowhere.
const primaryApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Web persistence is automatic/built-in with getAuth — no AsyncStorage
// adapter needed here, unlike the React Native version.
export const auth = getAuth(primaryApp);
export const db = getFirestore(primaryApp);
export const storage = getStorage(primaryApp);
