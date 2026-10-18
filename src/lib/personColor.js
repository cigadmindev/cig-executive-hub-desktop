// Everyone's own colour in Messages (18 Oct 2026): the same colour for the
// same person in every chat, and no two people sharing one. Each login is
// given a number (chatColor) when it is made - the lowest one nobody has -
// and existing logins were numbered once by a script. Thirty-two colours,
// all readable on the dark background; past 32 people they start again.
export const PERSON_COLORS = [
  '#E8524B', '#F59E0B', '#DFFF4F', '#5FA377', '#22D3EE', '#4A90D9', '#B48EEA', '#F472B6',
  '#D9822B', '#2DD4BF', '#818CF8', '#FB7185', '#A3E635', '#FCD34D', '#38BDF8', '#C084FC',
  '#F97316', '#4ADE80', '#E879F9', '#94A3B8', '#FDBA74', '#67E8F9', '#BEF264', '#FCA5A5',
  '#93C5FD', '#FDE68A', '#86EFAC', '#D8B4FE', '#F9A8D4', '#5EEAD4', '#FCD9BD', '#A5B4FC',
];

// users: the full list from useAuth (everyone, deactivated included).
export function personColor(uid, users) {
  if (!uid) return PERSON_COLORS[0];
  const n = (users ?? []).find((u) => u.uid === uid)?.chatColor;
  if (Number.isInteger(n) && n >= 0) return PERSON_COLORS[n % PERSON_COLORS.length];
  // Not numbered yet (the moment between a login being made and the list
  // refreshing): a steady colour from the uid.
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  return PERSON_COLORS[hash % PERSON_COLORS.length];
}
