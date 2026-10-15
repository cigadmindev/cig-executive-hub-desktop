// Who an opening checklist item or a POC contact is assigned to (15 Oct
// 2026). Several people can share one. Records written before then hold one
// person in assignedToUid / assignedToName; newer ones hold the lists, and
// keep the first person in the old fields too so older copies of the app
// still show someone.
export function assigneesOf(rec) {
  const uids = Array.isArray(rec?.assignedToUids) && rec.assignedToUids.length
    ? rec.assignedToUids
    : rec?.assignedToUid ? [rec.assignedToUid] : [];
  const names = Array.isArray(rec?.assignedToNames) && rec.assignedToNames.length
    ? rec.assignedToNames
    : rec?.assignedToName ? [rec.assignedToName] : [];
  return { uids, names: uids.map((_, i) => names[i] ?? 'Someone') };
}

export const isAssignedTo = (rec, uid) => !!uid && assigneesOf(rec).uids.includes(uid);

// The fields to write for a new list of people.
export function assigneeFields(uids, people) {
  const names = uids.map((u) => people.find((p) => p.uid === u)?.name ?? 'Someone');
  return {
    assignedToUids: uids,
    assignedToNames: names,
    assignedToUid: uids[0] ?? null,
    assignedToName: names[0] ?? null,
  };
}

// "Kevin", "Kevin +2" - for a chip that must stay narrow.
export function shortNames(names) {
  if (!names.length) return '';
  return names.length === 1 ? names[0] : names[0] + ' +' + (names.length - 1);
}
