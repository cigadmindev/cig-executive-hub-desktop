// The read-only switch for "See the Hub as someone". While it is on, every
// save, upload, delete and server action in the app refuses before it reaches
// the network - so an admin looking through someone else's eyes can never
// change anything on their behalf, whatever they click.
//
// Enforced here, below every screen, rather than screen by screen: the
// firebase imports are pointed at these wrappers in vite.config.js, so a
// screen built next year is covered without anyone remembering to.
let readOnly = false;
export function setReadOnly(v) {
  readOnly = v;
}
export function isReadOnly() {
  return readOnly;
}
export function assertWritable() {
  if (readOnly) throw new Error("You're viewing the Hub as someone else, so nothing can be changed. Use “Back to my view” first.");
}
