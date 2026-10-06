// firebase/storage, with uploads and deletes checked against the read-only switch.
export * from '@firebase/storage';
import * as F from '@firebase/storage';
import { assertWritable } from './state';

export const uploadBytes = (...a) => { assertWritable(); return F.uploadBytes(...a); };
export const uploadBytesResumable = (...a) => { assertWritable(); return F.uploadBytesResumable(...a); };
export const uploadString = (...a) => { assertWritable(); return F.uploadString(...a); };
export const deleteObject = (...a) => { assertWritable(); return F.deleteObject(...a); };
