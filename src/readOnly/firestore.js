// firebase/firestore, with every write checked against the read-only switch.
export * from '@firebase/firestore';
import * as F from '@firebase/firestore';
import { assertWritable } from './state';

export const setDoc = (...a) => { assertWritable(); return F.setDoc(...a); };
export const updateDoc = (...a) => { assertWritable(); return F.updateDoc(...a); };
export const addDoc = (...a) => { assertWritable(); return F.addDoc(...a); };
export const deleteDoc = (...a) => { assertWritable(); return F.deleteDoc(...a); };
export const runTransaction = (...a) => { assertWritable(); return F.runTransaction(...a); };
export const writeBatch = (...a) => {
  const batch = F.writeBatch(...a);
  const commit = batch.commit.bind(batch);
  batch.commit = () => { assertWritable(); return commit(); };
  return batch;
};
