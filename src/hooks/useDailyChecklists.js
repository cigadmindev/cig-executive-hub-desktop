import { accessLevel } from '../data/accessMatrix';
import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where, runTransaction, arrayUnion, updateDoc, deleteField } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref as storageRef, uploadBytes, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { listsFor, tasksFor, CHEF_JOBS } from '../data/dailyChecklists';

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

// The temperature log's keepers (18 Oct 2026): an executive chef or sous chef
// at this location - their own job, or a second job here.
export const isChefHere = (user, locationId, brandId) => {
  const only = brandId ? user?.permissions?.locationsByBrand?.[brandId] ?? [] : [];
  const hasBrand = !brandId || (user?.permissions?.brandIds ?? []).includes(brandId);
  const own = CHEF_JOBS.includes(user?.job) && hasBrand && (!locationId || only.length === 0 || only.includes(locationId));
  const second = CHEF_JOBS.includes(user?.alsoJob?.job) && (!locationId || user.alsoJob.locationId === locationId);
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
    // In one transaction (14 Oct 2026): two managers opening a new list at
    // the same moment would otherwise each create it, the second wiping the
    // first one's ticks.
    const onDuty = isManagerOnDuty(user, locationId, brandId);
    runTransaction(db, async (tx) => {
      const ref = doc(db, COLLECTION, id);
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        tx.set(ref, {
          locationId, brandId, dateKey, listId, kind: list.kind, title: list.title, subtitle: list.subtitle,
          intro: list.intro, sections: !!list.sections,
          workers: Object.fromEntries(list.workers.map((w) => [w, ''])),
          // The free-text boxes at the foot of the sheet, where a list has them.
          notes: Object.fromEntries((list.notes ?? []).map(([k]) => [k, ''])),
          // Their labels, copied in like the tasks, for the filed PDF.
          noteLabels: (list.notes ?? []).map(([key, label]) => ({ key, label })),
          tasks: tasksFor(list, dateKey).map((t) => ({ ...t, done: false, byName: null, at: null, note: '' })),
          // The temperature log: its items and check times copied in, and a
          // box per item per time - cells.{item}_{time} (18 Oct 2026).
          ...(list.kind === 'log' ? { items: list.items, times: list.times, cells: {} } : {}),
          managers: onDuty ? [user.name] : [],
          status: 'open', createdAt: Date.now(),
        });
      } else if (snap.data().status === 'open' && list.kind === 'log' && (snap.data().items ?? []).some((i) => !list.items.includes(i))) {
        // A log started before an item was taken off for this location
        // (19 Oct 2026): drop those rows and move the filled-in boxes with
        // their items, so it can still be signed off.
        const old = snap.data().items ?? [];
        const keep = old.map((name, i) => [name, i]).filter(([name]) => list.items.includes(name));
        const cells = {};
        Object.entries(snap.data().cells ?? {}).forEach(([k, v]) => {
          const [r, c] = k.split('_').map(Number);
          const n = keep.findIndex(([, i]) => i === r);
          if (n >= 0) cells[n + '_' + c] = v;
        });
        tx.update(ref, { items: keep.map(([name]) => name), cells });
      } else if (snap.data().status === 'open' && onDuty && !(snap.data().managers ?? []).includes(user.name)) {
        tx.update(ref, { managers: arrayUnion(user.name) });
      }
    }).catch((e) => console.error('[DailyChecklist open] ' + e.message));
  }, [id, user?.uid, viewAs]);

  const toggle = (index) =>
    runTransaction(db, async (tx) => {
      const ref = doc(db, COLLECTION, id);
      const snap = await tx.get(ref);
      const tasks = [...snap.data().tasks];
      const t = tasks[index];
      // Ticking keeps any note (15 Oct 2026, Mike): a note on a finished
      // task is information for the team - the pars set, what the truck
      // was short - not only "couldn't be done".
      tasks[index] = t.done ? { ...t, done: false, byName: null, at: null } : { ...t, done: true, byName: user?.name ?? '', at: Date.now() };
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
  // One box of the temperature log: a temperature, or a short note instead
  // ("Not on today"). Saved on its own, so two chefs typing at once never
  // overwrite each other. Empty clears it.
  const setCell = (row, col, value) => {
    const v = String(value ?? '').trim();
    const key = 'cells.' + row + '_' + col;
    if (!v) return updateDoc(doc(db, COLLECTION, id), { [key]: deleteField() });
    const num = v.replace(/°|\s*f$/gi, '').trim();
    const isTemp = /^-?\d{1,3}(\.\d)?$/.test(num);
    return updateDoc(doc(db, COLLECTION, id), {
      [key]: { ...(isTemp ? { temp: num } : { note: v }), byName: user?.name ?? '', at: Date.now() },
    });
  };
  const setWorker = (role, name) => updateDoc(doc(db, COLLECTION, id), { ['workers.' + role]: name });
  const setSheetNote = (key, text) => updateDoc(doc(db, COLLECTION, id), { ['notes.' + key]: text });
  const signOff = async () => {
    const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'fileDailyChecklist', { timeout: 120000 });
    return (await fn({ id })).data;
  };
  // "The Veranda wasn't open today" (16 Oct 2026), and an admin taking it back.
  const markNotOpen = async () => {
    const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'fileDailyChecklist', { timeout: 120000 });
    return (await fn({ id, notOpen: true })).data;
  };
  const undoNotOpen = async () => {
    const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'fileDailyChecklist', { timeout: 120000 });
    return (await fn({ id, undoNotOpen: true })).data;
  };

  // Photos on a task's note (16 Oct 2026). Shrunk to at most 1600px as a
  // JPEG before upload, so a phone photo is ~300KB rather than 4MB. Stored
  // at dailyChecklistPhotos/{list}/..., listed on the task.
  const addPhotos = async (index, files) => {
    const added = [];
    for (const file of Array.from(files).slice(0, 6)) {
      const blob = await shrink(file);
      const path = 'dailyChecklistPhotos/' + id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
      await uploadBytes(storageRef(storage, path), blob, { contentType: 'image/jpeg' });
      added.push({ path, at: Date.now(), byName: user?.name ?? '' });
    }
    await runTransaction(db, async (tx) => {
      const ref = doc(db, COLLECTION, id);
      const snap = await tx.get(ref);
      const tasks = [...snap.data().tasks];
      tasks[index] = { ...tasks[index], photos: [...(tasks[index].photos ?? []), ...added].slice(0, 6) };
      tx.update(ref, { tasks });
    });
  };
  const removePhoto = async (index, path) => {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, COLLECTION, id);
      const snap = await tx.get(ref);
      const tasks = [...snap.data().tasks];
      tasks[index] = { ...tasks[index], photos: (tasks[index].photos ?? []).filter((p) => p.path !== path) };
      tx.update(ref, { tasks });
    });
    await deleteObject(storageRef(storage, path)).catch(() => {});
  };

  return { list, record, toggle, setNote, setCell, setWorker, setSheetNote, signOff, markNotOpen, undoNotOpen, addPhotos, removePhoto };
}

// A photo, scaled so its long side is at most 1600px, as a JPEG.
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That file is not a photo this browser can read.'));
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/jpeg', 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}
