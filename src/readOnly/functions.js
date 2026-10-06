// firebase/functions, with every server action checked against the read-only
// switch - except the few that only fetch something to look at.
export * from '@firebase/functions';
import * as F from '@firebase/functions';
import { assertWritable } from './state';

const READS = new Set(['getReceiptUrls', 'getExpenseReportUrl', 'getExecutiveNotesFile', 'getPermitDocUrl', 'getWorkOrderFileUrl', 'describeAccountSetup']);

export const httpsCallable = (functions, name, options) => {
  const call = F.httpsCallable(functions, name, options);
  if (READS.has(name)) return call;
  return (...a) => { assertWritable(); return call(...a); };
};
