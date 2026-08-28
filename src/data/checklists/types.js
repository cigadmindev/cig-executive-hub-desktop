// Shape of a per-city opening checklist template.
//
// Every city has its own template. Requirements differ by state, county, and
// city — Birmingham runs city approval before state, Nashville needs a TABC
// meeting before anything starts and treats beer and liquor as parallel
// tracks. Rather than one list with conditionals, each jurisdiction gets its
// own complete list. Duplication across cities in the same state is the price
// of each one being explicit and independently editable, which matters more
// when the person maintaining them isn't a developer.
//
// A template is:
//
//   {
//     id: 'ms-starkville',
//     label: 'Starkville, MS',
//     window: { windowStartDaysBefore, windowEndDaysBefore },
//     items: [ ...ChecklistItem ]
//   }
//
// The window is per-template because runways differ. Mississippi fits in 120
// days; Birmingham's city-then-state sequence with a council agenda slot
// needs longer.
//
// A ChecklistItem:
//
//   key                    stable id, referenced by dependsOnKeys and stored
//                          on generated schedule docs as setupKey
//   name                   what people see
//   section                groups items in the UI
//   dependsOnKeys          must be DONE before this unlocks
//   coRequisiteKeys        must land before OR WITH this — Nashville's Metro
//                          Beer Permit relative to the liquor license. Neither
//                          blocks the other; they're bound together, which a
//                          parent/child edge can't express
//   gatedBy                an external precondition outside the checklist —
//                          'leaseSigned' for Birmingham, where nothing
//                          executes until the lease is signed
//   renewable              enters the renewal cycle once signed off
//                          Expiry dates come from the actual document at
//                          sign-off, not a fixed interval — permits don't all
//                          run twelve months and the printed date is the only
//                          one that matters
//   perPerson              'managers' | 'servers' | null — a roster-scoped
//                          obligation that regenerates on every hire, not a
//                          one-time checkbox. Nashville requires certs for
//                          every manager and server, including future ones
//
// Note there's no per-item field configuration. Every generated schedule doc
// can carry documents, a reference number, notes, and an expiry date — all
// optional, all hidden until someone adds one. Defining which fields each of
// 56 items needs, per city, would be a maintenance burden with no payoff.
//
// Those values live on the schedule document, not the template, so they're
// inherently per-location: Starkville's Beer Permit and Nashville's are the
// same item definition but separate records with their own permit numbers,
// expiry dates, and PDFs.
//   verification           'verified' — confirmed against the issuing
//                          authority — or 'unverified' for research-sourced
//                          requirements awaiting review. Unverified items
//                          render distinctly and shouldn't gate an opening
//
// Everything past `dependsOnKeys` is optional and defaults below, so a plain
// item behaves exactly as it did before templates existed.

// Resolves capstones into the flat dependsOnKeys the graph logic expects.
//
// Most permit dependencies are section-shaped: every piece of Health Dept
// paperwork has to be done before they'll issue the Food Permit. Rather than
// listing those five keys — and remembering to update the list every time a
// requirement is added — an item marks itself the capstone of its section and
// picks up everything else in it automatically.
//
// Cross-section edges are declared explicitly with alsoDependsOn, because
// those are real judgments about a specific city's process rather than a
// pattern that can be inferred. Business License needing Food Permit is
// Mississippi's rule, not a general truth.
function resolveCapstones(items) {
  return items.map((item) => {
    if (!item.capstoneOf) return item;
    const sectionKeys = items
      .filter((other) => other.section === item.capstoneOf && other.key !== item.key)
      .map((other) => other.key);
    return {
      ...item,
      dependsOnKeys: [...new Set([...sectionKeys, ...(item.alsoDependsOn ?? [])])],
    };
  });
}

export const ITEM_DEFAULTS = {
  dependsOnKeys: [],
  capstoneOf: null,      // section name — depends on everything else in it
  alsoDependsOn: [],     // cross-section edges, declared explicitly
  coRequisiteKeys: [],
  gatedBy: null,
  renewable: false,
  perPerson: null,
  verification: 'verified',
};

// Applies defaults so downstream code can read any field without guarding.
export function normalizeItems(items) {
  return resolveCapstones(items.map((item) => ({ ...ITEM_DEFAULTS, ...item })));
}
