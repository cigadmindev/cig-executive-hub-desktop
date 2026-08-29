// Registry of per-city checklist templates.
//
// Locations map to a template by id. Adding a city means writing its template
// file, importing it here, and pointing the location at it — no changes to the
// generator, the screens, or the dependency logic.
//
// Cities not yet researched fall back to Starkville with everything marked
// unverified, so a new location gets a working checklist immediately rather
// than an empty one, and it's visibly provisional until someone confirms it.
import msStarkville from './ms-starkville';

export const TEMPLATES = {
  'ms-starkville': msStarkville,
};

export const DEFAULT_TEMPLATE_ID = 'ms-starkville';

// Location id -> template id. Locations absent from this map get the default.
export const LOCATION_TEMPLATES = {
  // Keyed by where a restaurant is, not whose it is — two brands in the same
  // city face the same permitting.
  'taste-starkville': 'ms-starkville',
  'blutos-starkville': 'ms-starkville',
  'heritage-starkville': 'ms-starkville',
  // Ridgeland is Mississippi too, but its privilege license is city-issued
  // and hasn't been researched. Left unmapped deliberately — an empty
  // checklist makes the gap obvious, where a borrowed one would look
  // authoritative and be wrong about the city-level pieces.
};

export function getTemplateForLocation(locationId) {
  const id = LOCATION_TEMPLATES[locationId] ?? DEFAULT_TEMPLATE_ID;
  return TEMPLATES[id] ?? TEMPLATES[DEFAULT_TEMPLATE_ID];
}

// Checklist item key -> renewal type name.
//
// A permit has two lives: getting it, which is dependency-gated and happens
// once before opening, and renewing it, which recurs forever after. The
// checklist owns the first and License & Lease Renewals owns the second, and
// this map is what connects them — signing an item off here fills in the
// renewal record rather than making someone type the same dates twice.
//
// The names differ because the two systems were built separately: the
// checklist calls it privilegeLicense, renewals calls it Business License.
// Same permit. New cities add their entries here.
export const RENEWAL_TYPE_BY_KEY = {
  foodPermit: 'Food Permit',
  liquorLicense: 'Liquor License',
  beerPermit: 'Beer Permit',
  privilegeLicense: 'Business License',
  buildingPermit: 'Building Permit',
  signPermit: 'Sign Permit',
};
