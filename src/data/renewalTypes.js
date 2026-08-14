export const renewalTypes = [
  'Beer Permit',
  'Liquor License',
  'Food Permit',
  'Building Permit',
  'Business License',
  'Sign Permit',
  'Lease Expiration',
];

// Which of the above also gets an initial "get this for the first time"
// calendar task when a location's opening date is set — the ones that used
// to live in the Opening Checklist before being consolidated here.
// Business License is what the checklist used to call "Privilege/Business
// License" — same real-world permit, clearer name. Lease is renewal-only,
// no opening-linked task, same as before.
export const RENEWAL_TYPES_WITH_OPENING_TASK = [
  'Beer Permit',
  'Liquor License',
  'Food Permit',
  'Building Permit',
  'Business License',
  'Sign Permit',
];

export const RENEWAL_WARNING_WINDOW_DAYS = 60;
