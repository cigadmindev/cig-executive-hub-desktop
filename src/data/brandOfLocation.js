import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { brands } from './mockData';

// Which restaurant a location belongs to.
//
// Built-in locations carry it in their id (taste-ridgeland). Locations added
// later do not - Chelsea's id is a random string - so those are read from the
// record. Records carry the answer so queries and rules can ask for one
// restaurant's entries instead of every location's.
const cache = new Map();

export async function brandOfLocation(locationId) {
  if (!locationId) return null;
  if (cache.has(locationId)) return cache.get(locationId);

  for (const b of brands) {
    if ((b.locations ?? []).some((l) => l.id === locationId)) {
      cache.set(locationId, b.id);
      return b.id;
    }
  }

  try {
    const snap = await getDoc(doc(db, 'customLocations', locationId));
    const brandId = snap.exists() ? snap.data().brandId ?? null : null;
    cache.set(locationId, brandId);
    return brandId;
  } catch {
    return null;
  }
}
