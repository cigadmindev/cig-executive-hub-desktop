import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where, runTransaction, arrayUnion, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { DAILY_CHECKLISTS, tasksFor } from '../data/dailyChecklists';

// One record per location, per day, per list:
//   dailyChecklists/{locationId}_{dateKey}_{listId}
// Created the first time a manager opens it, with that day's tasks copied in,
// so a later edit to the template never changes a day already started.
const COLLECTION = 'dailyChecklists';
export const recordId = (locationId, dateKey, listId) => `${locationId}_${dateKey}_${listId}`;
export const todayKey = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

// Managers on duty: the GMs and assistant managers who work a list.
export const isManagerOnDuty = (user) => ['General Manager', 'Assistant Manager'].includes(user?.job);

export function useDailyRecords(locationId, dateKey) {
  const [records, setRecords] = useState({});
  useEffect(() => {
    if (!locationId || !dateKey) return undefined;
    return onSnapshot(
      query(collection(db, COLLECTION), where('locationId', '==', locationId), where('dateKey', '==', dateKey)),
      (snap) => setRecords(Object.fromEntries(snap.docs.map((d) => [d.data().listId, { id: d.id, ...d.data() }]))),
      (err) => console.error('[DailyChecklists] ' + err.code + ': ' + err.message)
    );
  }, [locationId, dateKey]);
  return records;
}

export function useDailyRecord(locationId, brandId, dateKey, listId) {
  const { user } = useAuth();
  const [record, setRecord] = useState(null);
  const id = recordId(locationId, dateKey, listId);
  const list = DAILY_CHECKLISTS.find((l) => l.id === listId);

  useEffect(() => {
    if (!list) return undefined;
    return onSnapshot(doc(db, COLLECTION, id), (snap) => setRecord(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => console.error('[DailyChecklist] ' + err.code + ': ' + err.message));
  }, [id]);

  // A manager on duty who opens a list before it is filed is signed onto it.
  useEffect(() => {
    if (!list || !user || (!isManagerOnDuty(user) && user.role !== 'admin')) return;
    (async () => {
      const ref = doc(db, COLLECTION, id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          locationId, brandId, dateKey, listId, kind: list.kind, title: list.title, subtitle: list.subtitle,
          intro: list.intro, sections: !!list.sections,
          workers: Object.fromEntries(list.workers.map((w) => [w, ''])),
          tasks: tasksFor(list, dateKey).map((t) => ({ ...t, done: false, byName: null, at: null, note: '' })),
          managers: isManagerOnDuty(user) ? [user.name] : [],
          status: 'open', createdAt: Date.now(),
        });
      } else if (snap.data().status !== 'filed' && isManagerOnDuty(user) && !(snap.data().managers ?? []).includes(user.name)) {
        await updateDoc(ref, { managers: arrayUnion(user.name) });
      }
    })().catch((e) => console.error('[DailyChecklist open] ' + e.message));
  }, [id, user?.uid]);

  const toggle = (index) =>
    runTransaction(db, async (tx) => {
      const ref = doc(db, COLLECTION, id);
      const snap = await tx.get(ref);
      const tasks = [...snap.data().tasks];
      const t = tasks[index];
      tasks[index] = t.done ? { ...t, done: false, byName: null, at: null } : { ...t, done: true, byName: user?.name ?? '', at: Date.now(), note: '' };
      tx.update(ref, { tasks, ...(isManagerOnDuty(user) ? { managers: arrayUnion(user.name) } : {}) });
    });
  const setNote = (index, note) =>
    runTransaction(db, async (tx) => {
      const ref = doc(db, COLLECTION, id);
      const snap = await tx.get(ref);
      const tasks = [...snap.data().tasks];
      tasks[index] = { ...tasks[index], note, noteByName: user?.name ?? '' };
      tx.update(ref, { tasks });
    });
  const setWorker = (role, name) => updateDoc(doc(db, COLLECTION, id), { ['workers.' + role]: name });
  const signOff = async () => {
    const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'fileDailyChecklist', { timeout: 120000 });
    return (await fn({ id })).data;
  };

  return { list, record, toggle, setNote, setWorker, signOff };
}
