import { accessLevel } from '../data/accessMatrix';
import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where, runTransaction, arrayUnion, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { listsFor, tasksFor } from '../data/dailyChecklists';

// One record per location, per day, per list:
//   dailyChecklists/{locationId}_{dateKey}_{listId}
// Created the first time a manager opens it, with that day's tasks copied in,
// so a later edit to the template never changes a day already started.
const COLLECTION = 'dailyChecklists';
export const recordId = (locationId, dateKey, listId) => `${locationId}_${dateKey}_${listId}`;
// The business day, in Chicago time, running 4am to 4am: a closing list
// finished at 12:30am still belongs to the night before. It used to be the
// device's calendar date, so a late close filed the next day's record and
// the real one showed as missing (S10, 8 Oct). Same rule on the server.
export const todayKey = () =>
  new Date(Date.now() - 4 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

// Who works the daily lists: the Daily checklists column of Who sees what
// (14 Oct 2026) - GMs, assistant managers and the chefs by default - at
// their own location. Their own job, or a second job at this location
// (Cameron: IT & Training, and also Starkville's GM). A login narrowed to
// some of a restaurant's locations works only those; the rules cannot check
// the location, so the app does.
const works = (job) => !!job && accessLevel({ job, role: 'manager' }, 'dailyChecklists') === 'work';
export const isManagerOnDuty = (user, locationId, brandId) => {
  // Their own job, at a restaurant and location on their login...
  const only = brandId ? user?.permissions?.locationsByBrand?.[brandId] ?? [] : [];
  const hasBrand = !brandId || (user?.permissions?.brandIds ?? []).includes(brandId);
  const own = works(user?.job) && hasBrand && (!locationId || only.length === 0 || only.includes(locationId));
  // ...or their second job, at exactly that location.
  const second = works(user?.alsoJob?.job) && (!locationId || user.alsoJob.locationId === locationId);
  return own || second;
};

// Filtered on the restaurant as well: the rule only lets managers read their
// own restaurant's records, and Firestore refuses a whole query the rule
// cannot prove - which is why GMs and AGMs saw nothing (S10, 8 Oct).
export function useDailyRecords(locationId, brandId, dateKey) {
  const [records, setRecords] = useState({});
  useEffect(() => {
    if (!locationId || !brandId || !dateKey) return undefined;
    return onSnapshot(
      query(collection(db, COLLECTION), where('brandId', '==', brandId), where('locationId', '==', locationId), where('dateKey', '==', dateKey)),
      (snap) => setRecords(Object.fromEntries(snap.docs.map((d) => [d.data().listId, { id: d.id, ...d.data() }]))),
      (err) => console.error('[DailyChecklists] ' + err.code + ': ' + err.message)
    );
  }, [locationId, brandId, dateKey]);
  return records;
}

export function useDailyRecord(locationId, brandId, dateKey, listId) {
  const { user, viewAs } = useAuth();
  const [record, setRecord] = useState(null);
  const id = recordId(locationId, dateKey, listId);
  // Only a list this location runs.
  const list = listsFor(locationId).find((l) => l.id === listId);

  useEffect(() => {
    if (!list) return undefined;
    return onSnapshot(doc(db, COLLECTION, id), (snap) => setRecord(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => console.error('[DailyChecklist] ' + err.code + ': ' + err.message));
  }, [id]);

  // A manager on duty who opens a list before it is filed is signed onto it.
  // Not while an admin is using View as - that is meant to be read-only.
  useEffect(() => {
    if (!list || !user || viewAs || (!isManagerOnDuty(user, locationId, brandId) && user.role !== 'admin')) return;
    (async () => {
      const ref = doc(db, COLLECTION, id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          locationId, brandId, dateKey, listId, kind: list.kind, title: list.title, subtitle: list.subtitle,
          intro: list.intro, sections: !!list.sections,
          workers: Object.fromEntries(list.workers.map((w) => [w, ''])),
          // The free-text boxes at the foot of the sheet, where a list has them.
          notes: Object.fromEntries((list.notes ?? []).map(([k]) => [k, ''])),
          // Their labels, copied in like the tasks, for the filed PDF.
          noteLabels: (list.notes ?? []).map(([key, label]) => ({ key, label })),
          tasks: tasksFor(list, dateKey).map((t) => ({ ...t, done: false, byName: null, at: null, note: '' })),
          managers: isManagerOnDuty(user, locationId, brandId) ? [user.name] : [],
          status: 'open', createdAt: Date.now(),
        });
      } else if (snap.data().status !== 'filed' && isManagerOnDuty(user, locationId, brandId) && !(snap.data().managers ?? []).includes(user.name)) {
        await updateDoc(ref, { managers: arrayUnion(user.name) });
      }
    })().catch((e) => console.error('[DailyChecklist open] ' + e.message));
  }, [id, user?.uid, viewAs]);

  const toggle = (index) =>
    runTransaction(db, async (tx) => {
      const ref = doc(db, COLLECTION, id);
      const snap = await tx.get(ref);
      const tasks = [...snap.data().tasks];
      const t = tasks[index];
      tasks[index] = t.done ? { ...t, done: false, byName: null, at: null } : { ...t, done: true, byName: user?.name ?? '', at: Date.now(), note: '' };
      tx.update(ref, { tasks, ...(isManagerOnDuty(user, locationId, brandId) ? { managers: arrayUnion(user.name) } : {}) });
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
  const setSheetNote = (key, text) => updateDoc(doc(db, COLLECTION, id), { ['notes.' + key]: text });
  const signOff = async () => {
    const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'fileDailyChecklist', { timeout: 120000 });
    return (await fn({ id })).data;
  };

  return { list, record, toggle, setNote, setWorker, setSheetNote, signOff };
}
