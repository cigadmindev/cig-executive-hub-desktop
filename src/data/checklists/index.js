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
  'taste-starkville': 'ms-starkville',
};

export function getTemplateForLocation(locationId) {
  const id = LOCATION_TEMPLATES[locationId] ?? DEFAULT_TEMPLATE_ID;
  return TEMPLATES[id] ?? TEMPLATES[DEFAULT_TEMPLATE_ID];
}
