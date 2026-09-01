// Pulled directly from the physical Opening Checklist PDF plus Michele's
// permit-dependency breakdown. Each timeline bucket is a 30-day window
// relative to the opening date; items within a bucket get spread evenly
// across that window rather than clustered on one day. Initial Set-Up items
// get their own 90-day window (120 to 14 days out).

export const TIMELINE_BUCKETS = [
  {
    key: '3_months',
    label: '3 Months Out',
    // Window: 90 to 60 days before opening.
    windowStartDaysBefore: 90,
    windowEndDaysBefore: 60,
    items: [
      { key: "kitchenPackage", name: "Kitchen Package", description: "Finalise and confirm the full kitchen equipment package against the approved plan." },
      { key: "posSetup", name: "POS Setup", description: "Order and configure the point of sale: menu, pricing, modifiers and payment processing." },
      { key: "furnitureOrdered", name: "Booths/Tables/Chairs Ordered", description: "Place the dining room furniture order. Long lead times, so this can move the opening date if it slips." },
      { key: "locationWebsiteUpdated", name: "Location/Website Updated", description: "Add the new location to the website and to Google, Apple Maps and other listings so it’s findable before opening." },
      { key: "signPackageOrdered", name: "Sign Package Ordered", description: "Order signage once the sign permit is approved." },
      { key: "managementTeamChosen", name: "Management Team Chosen", description: "Confirm the management team. Hiring and training both depend on knowing who’s leading." },
      { key: "movingOnboarding", name: "Moving And/Or Onboarding", description: "Arrange relocation or onboarding for managers transferring in." },
    ],
  },
  {
    key: '2_months',
    label: '2 Months Out',
    // Window: 60 to 30 days before opening.
    windowStartDaysBefore: 60,
    windowEndDaysBefore: 30,
    items: [
      { key: "hiringSetup", name: "Hiring Setup", description: "Set up applications, interview scheduling and onboarding paperwork." },
      { key: "hiringParsSet", name: "Pars for Hiring Set", description: "Decide how many people are needed in each role." },
      { key: "adPlacements", name: "Ad Placements", description: "Post hiring ads across the channels that actually work in that market." },
      { key: "smallwaresOrdered", name: "Smallwares Ordered", description: "Order plates, glassware, pans and utensils — everything that isn’t large equipment." },
      { key: "socialMediaPrStarts", name: "Social Media/PR Starts", description: "Begin local announcements and press outreach." },
      { key: "trainingMaterials", name: "Training Materials", description: "Prepare manuals, recipe cards and service standards for the new team." },
      { key: "uniformsOrdered", name: "Uniforms Ordered", description: "Order uniforms once hiring targets are set." },
      { key: "thirdPartyDeliverySetup", name: "Third Party Delivery Setup", description: "Set up delivery platform accounts, menus and pricing." },
    ],
  },
  {
    key: 'opening_month',
    label: 'Opening Month',
    // Window: 30 to 0 days before opening.
    windowStartDaysBefore: 30,
    windowEndDaysBefore: 0,
    items: [
      { key: "trainingTeamArrangements", name: "Training Team Arrangements", description: "Confirm who’s travelling in to train, and their travel and lodging." },
      { key: "meetHiringPars", name: "Meet Hiring Pars", description: "Confirm every role is filled to the numbers set earlier." },
      { key: "vendorsInformedOfOpening", name: "All Vendors Informed of Opening", description: "Confirm first delivery dates and standing orders with every supplier." },
      { key: "rolePlayInvites", name: "Role Play Invites", description: "Invite guests to practice service runs before opening." },
      { key: "kitchenInstallPatio", name: "Kitchen Install/Patio if Applicable", description: "Complete kitchen installation and any patio work." },
      { key: "inputStaffIntoPos", name: "Input All Staff Into POS", description: "Add every employee to the POS with the right role and permissions." },
      { key: "trainingScheduleFinalized", name: "Training Schedule Finalized", description: "Lock the training calendar for the full team." },
      { key: "allPermitsConfirmed", name: "All Permits Confirmed", description: "Final check that every permit and license is issued and physically on site. The last gate before opening." },
    ],
  },
];

// Initial Set-Up POC — merged from the original "Initial Set-Up" column AND
// the full Permits & Licenses checklist. Everything here is calendar-linked
// and sign-off-able, same as the rest of the Opening Checklist.
//
// Four items are PARENT tasks (Food Permit, Beer Permit, Liquor License,
// Privilege/Business License) — per Michele's breakdown, each can't be
// signed off until every item listed in its `dependsOnKeys` is done first.
// `key` is a stable id used only for wiring dependencies together; it's
// never shown in the UI. Items with no dependents just have `dependsOnKeys:
// []` and behave exactly like before.
export const INITIAL_SETUP_WINDOW = { windowStartDaysBefore: 120, windowEndDaysBefore: 14 };


// Opening & Operational Orders/Contracts — the 6 Who/Company/Contact#-style
// groups from the PDF's middle column, now with an Account # (if
// applicable) field. Shown on the Operational POC screen alongside the
// standing vendor relationships below — these are one-time setup orders
// tied to getting the location open, not calendar-linked tasks.
export const PRE_OPENING_ORDERS_SECTIONS = [
  {
    key: 'marketing_social',
    label: 'Marketing / Social Media',
    items: [
      'Pre-Open Marketing Info To',
      'Establish w/ Google Address/Info',
      'All Banners/Sidewalk Signs',
      'Update Website New Locations',
    ],
  },
  {
    key: 'toast_3rd_party',
    label: 'Toast / 3rd Party',
    items: [
      'POS Menu Loading/Install',
      'All Delivery/Third Party Menus',
      'UBER - Set Up',
      'Door Dash - Set Up',
      'Grub Hub - Set Up',
      'Office/Computer Set Up',
      'POS Choice & Liaison',
    ],
  },
  {
    key: 'supplies',
    label: 'Supplies',
    items: [
      'Smallwares Order',
      'Tea/Coffee Brew Install',
      'Uniforms - All',
      'Beer/Wine/Liquor Lists',
      'All Furniture Coordination',
      'Patio Furniture',
      'Specialty/Smallware',
    ],
  },
  {
    key: 'menus_fb',
    label: 'Menus / F&B',
    items: ['Menu Boards/Displays', 'All Printing/Menus', 'Catering Menu', 'Recipes/Menu Direction'],
  },
  {
    key: 'services',
    label: 'Services',
    items: [
      'Sign Package (Allow 2 Months)',
      'Music System Select/Install',
      "TV's Select/Install",
      'Alarm System Select/Install',
      'Soda/Beverage System/Bulk CO2',
      'All Banking/Accounting',
      'Kitchen Package/Delivery & Install',
      'Valet if Applicable',
      'Decor Install',
      'Water/CO2 Machine',
    ],
  },
  {
    key: 'miscellaneous',
    label: 'Miscellaneous',
    items: ['Gift Cards', 'Training Materials', 'All Staff Hiring Pars', 'Pre-Open Role Plays/Party', 'Training Materials/Support'],
  },
];

// Operational POC — standing, non-dated reference lists for the location.
// Operations Ongoing Business = permanent vendor relationships. Other
// Tasks/Numbers = the misc contacts table from the PDF's bottom-right.
export const OPERATIONAL_POC_SECTIONS = [
  {
    key: 'marketing_media',
    label: 'Marketing / Media',
    items: ['Social Media: All', 'Videographer/Photography'],
  },
  {
    key: 'ongoing_business',
    label: 'Operations Ongoing Business',
    items: [
      'Linen Company',
      'Beer/Wine/Liquor',
      'Hood Cleaner/HVAC Maintenance',
      'Grease Trap',
      'Medical Kit',
      'Produce Vendor',
      'Main-line Vendor',
      'Armored Car Service',
      'Dish Machine Set-up',
      'Locksmith',
      'Vendor Files Set-up',
      'Pest Control Co.',
      'Window Cleaner',
      'Grease Bin',
      'Specialty Vendor 1',
      'Specialty Vendor 2',
    ],
  },
  {
    key: 'other_tasks_numbers',
    label: 'Other Tasks / Numbers',
    items: ['Emergency Ice', 'Glass Replacement', 'Landscape Service', 'Flowers/Fresh/Artificial', 'Floor Chart/Stations', 'Coordinate Kitchen Install'],
  },
];

// All Who/Company/Contact#-style sections combined, for the one shared
// Firestore collection (openingOngoingContacts) both screens read from.
export const ALL_CONTACT_SECTIONS = [...PRE_OPENING_ORDERS_SECTIONS, ...OPERATIONAL_POC_SECTIONS];

// Spreads N items evenly across a day window, returning a timestamp for
// each. windowStartDaysBefore/windowEndDaysBefore count backward from the
// opening date (e.g. start=90, end=60 means "90 to 60 days before opening").
export function spreadDatesInWindow(openingDate, windowStartDaysBefore, windowEndDaysBefore, count) {
  const dayMs = 24 * 60 * 60 * 1000;
  const windowStart = openingDate - windowStartDaysBefore * dayMs;
  const windowEnd = openingDate - windowEndDaysBefore * dayMs;
  const span = windowEnd - windowStart;
  if (count <= 1) return [windowStart + span / 2];
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(windowStart + i * step));
}

// Assigns each Initial Set-Up item a "depth" — 0 for anything with no
// dependencies, 1 for a parent whose deps are all depth 0, 2 for a parent
// of parents, etc. Used so parents always land LATER in the window than
// everything they depend on, instead of every item being spread evenly
// with no regard for order.
function computeDepths(items) {
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  const depthCache = {};
  const resolveDepth = (key, guard = new Set()) => {
    if (depthCache[key] != null) return depthCache[key];
    if (guard.has(key)) return 0; // safety net against accidental cycles
    guard.add(key);
    const item = byKey[key];
    if (!item || item.dependsOnKeys.length === 0) {
      depthCache[key] = 0;
      return 0;
    }
    const depth = 1 + Math.max(...item.dependsOnKeys.map((k) => resolveDepth(k, guard)));
    depthCache[key] = depth;
    return depth;
  };
  items.forEach((i) => resolveDepth(i.key));
  return depthCache;
}

// Builds { key -> dateTime } for every Initial Set-Up item, honoring
// dependency order: items are grouped by depth, and each depth group is
// spread across a slightly later slice of the window than the group
// before it, so a parent's date is always after every item it depends on.
// The template is required, on purpose. These three functions used to fall
// back to a second, older copy of the checklist that lived in this file and
// had drifted from the registry - so the same function could answer
// differently on Mac than on iPhone. That copy is gone.
//
// This matters more as cities are added: a location with no template mapping
// silently inheriting Starkville's permits and dependencies would be wrong in
// a way nobody would notice until someone worked a checklist that never
// applied to their county. Failing at the point the location is added is the
// cheaper mistake.
export function computeInitialSetupDates(openingDate, template) {
  if (!template) throw new Error('computeInitialSetupDates requires a template');
  const items = template.items;
  const depths = computeDepths(items);
  const maxDepth = Math.max(0, ...Object.values(depths));
  // Runways differ by city — Birmingham's city-then-state sequence with a
  // council agenda slot needs longer than Mississippi's four months.
  let { windowStartDaysBefore, windowEndDaysBefore } = template?.window ?? INITIAL_SETUP_WINDOW;

  // A 120-day runway set 72 days out would start in July — every task born
  // overdue, and a checklist that's red before anyone touches it. Compress the
  // window to what's actually left instead. The sequencing still holds; it
  // just happens faster, which is the real situation.
  const daysUntilOpening = Math.floor((openingDate - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysUntilOpening < windowStartDaysBefore) {
    windowStartDaysBefore = Math.max(daysUntilOpening, windowEndDaysBefore + 1);
  }
  const totalSpan = windowStartDaysBefore - windowEndDaysBefore;
  const sliceSize = totalSpan / (maxDepth + 1);

  const dateByKey = {};
  for (let depth = 0; depth <= maxDepth; depth++) {
    const keysAtDepth = items.filter((i) => depths[i.key] === depth).map((i) => i.key);
    // This depth's slice: further from "start" as depth increases, so
    // depth 0 items land earliest and higher-depth parents land latest.
    const sliceWindowStart = windowStartDaysBefore - depth * sliceSize;
    const sliceWindowEnd = windowStartDaysBefore - (depth + 1) * sliceSize;
    const dates = spreadDatesInWindow(openingDate, sliceWindowStart, sliceWindowEnd, keysAtDepth.length);
    keysAtDepth.forEach((key, i) => {
      dateByKey[key] = dates[i];
    });
  }
  return dateByKey;
}

// Dates for the migrated license/permit items' initial "get this for the
// first time" calendar task — takes the renewal type names as a parameter
// (from renewalTypes.js) to avoid a circular import between the two data
// files. These land in the final slice of the setup window, since in
// practice they're gate items that come after their remaining prep steps.
export function computeRenewalOpeningTaskDates(openingDate, renewalTypeNames) {
  const { windowEndDaysBefore } = INITIAL_SETUP_WINDOW;
  const sliceStart = windowEndDaysBefore + 14; // final 14-day slice of the window
  const dates = spreadDatesInWindow(openingDate, sliceStart, windowEndDaysBefore, renewalTypeNames.length);
  const dateByType = {};
  renewalTypeNames.forEach((name, i) => {
    dateByType[name] = dates[i];
  });
  return dateByType;
}

// Urgency for a single opening-checklist item, based on its own due date —
// used identically by the Checklist screen, the Operational POC mirror,
// and the Calendar screen so the coloring always matches wherever it's
// shown. `attentionFlag` items always render as the urgent red state
// regardless of how close/far the (rolled-forward) date currently is —
// see the rollover logic in ScheduleContext.
export function getOpeningItemUrgency(item, now) {
  if (item.done) return { label: 'Done', color: '#5FA377' };
  if (item.attentionFlag) return { label: 'Needs Attention', color: '#E8524B' };
  const daysUntilDue = (item.dateTime - now) / (24 * 60 * 60 * 1000);
  if (daysUntilDue < 0) return { label: 'Overdue', color: '#E8524B' };
  if (daysUntilDue <= 3) return { label: 'Due now', color: '#D9822B' };
  if (daysUntilDue <= 14) return { label: 'Coming up', color: '#C9A227' };
  return { label: 'Not due yet', color: '#6C6C76' };
}

// Given one Initial Set-Up schedule item and the full list of Initial
// Set-Up items for its location, returns which of its dependencies (by
// title) aren't done yet — empty array means it's unlocked. Matching is by
// setupKey within the same location, since that's what's actually stored
// on each generated schedule doc (dependsOnKeys refer to the static data
// definition, not doc ids).
export function getBlockingDependencies(item, allSetupItemsForLocation, template) {
  if (!template) throw new Error('getBlockingDependencies requires a template');
  const defs = template.items;
  const dataDef = defs.find((i) => i.key === item.setupKey);
  if (!dataDef || dataDef.dependsOnKeys.length === 0) return [];
  const byKey = Object.fromEntries(defs.map((i) => [i.key, i]));
  return dataDef.dependsOnKeys
    .map((depKey) => {
      const depDef = byKey[depKey];
      if (!depDef) return null;
      const depDoc = allSetupItemsForLocation.find((i) => i.setupKey === depKey);
      return depDoc && !depDoc.done ? depDef.name : null;
    })
    .filter(Boolean);
}

// The reverse lookup — given one Initial Set-Up schedule item, returns the
// names of every PARENT item that lists it as a dependency (empty array
// means it isn't a requirement for anything else). This is what lets a
// sub-item like "Sales Tax" show "Needed for: Beer Permit,
// Privilege/Business License" so it's clear why a seemingly small task
// matters, not just which tasks are blocking a given parent.
export function getDependentParents(item, template) {
  if (!item.setupKey) return [];
  if (!template) throw new Error('getDependentParents requires a template');
  const defs = template.items;
  return defs.filter((i) => i.dependsOnKeys.includes(item.setupKey)).map((i) => i.name);
}
