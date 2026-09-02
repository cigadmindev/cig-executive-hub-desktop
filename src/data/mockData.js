// Mirrors the Notion hub: Brand > Location > Category > Item
export const brands = [
  {
    id: 'taste',
    name: 'Taste Italian Kitchen',
    locations: [
      { id: 'taste-starkville', name: 'Starkville', status: 'active' },
      { id: 'taste-ridgeland', name: 'Ridgeland', status: 'active' },
    ],
  },
  {
    id: 'blutos',
    name: 'Blutos Greek Tavern',
    locations: [{ id: 'blutos-starkville', name: 'Starkville', status: 'active' }],
  },
  {
    id: 'heritage',
    name: 'Heritage Chophouse',
    locations: [{ id: 'heritage-starkville', name: 'Starkville', status: 'active' }],
  },
  {
    id: 'pronto',
    name: 'Pronto Gusto',
    locations: [],
  },
  {
    id: 'stellas',
    name: 'Sunnyside Social',
    locations: [],
  },
];

/**
 * The brand a location belongs to, or null if it is not a known location.
 *
 * Written onto brand posts and renewal records so the push-notification
 * functions can tell who should hear about them - the server has no access to
 * this list, and resolving a brand from an id like 'heritage-starkville' by
 * splitting on the hyphen would break the first time a location is named
 * differently.
 *
 * customLocations are admin-added and live in Firestore rather than here, so
 * they carry their own brandId and are passed in.
 */
export function brandIdForLocation(locationId, customLocations = []) {
  if (!locationId) return null;
  const known = brands.find((b) => (b.locations ?? []).some((l) => l.id === locationId));
  if (known) return known.id;
  const custom = customLocations.find((l) => l.id === locationId);
  return custom?.brandId ?? null;
}

/** A target id that is either a brand or one of its locations. */
export function brandIdForTarget(targetId, customLocations = []) {
  if (!targetId || targetId === 'all') return null;
  if (brands.some((b) => b.id === targetId)) return targetId;
  return brandIdForLocation(targetId, customLocations);
}

export const categories = [
  {
    id: 'operations',
    label: 'Operations',
    icon: 'settings-outline',
    items: [
      'Daily Shift Reports',
      'Opening & Closing Checklists',
      'Standard Operating Procedures (SOPs)',
      'Incident & Issue Logs',
      'General Notes & Communications',
    ],
  },
  {
    id: 'financials',
    label: 'Financials',
    icon: 'cash-outline',
    items: [
      'P&L Reports (by month/year)',
      'Sales Reports & Summaries',
      'Cost Analysis & COGS',
      'Expense Tracking & Receipts',
      'Budgets & Forecasts',
      'Invoices & Vendor Payments',
      'Tax & Year-End Documents',
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: 'cube-outline',
    items: [
      'Stock Counts & Audits',
      'Supplier Information & Contacts',
      'Purchase Orders',
      'Inventory Reports (Restaurant365 exports)',
      'Waste, Spoilage & Variance Logs',
      'Cost Tracking & Analysis',
    ],
  },
  {
    id: 'menu',
    label: 'Menu',
    icon: 'restaurant-outline',
    items: [
      'Current Menus (by location/concept)',
      'Recipe Cards & Standards',
      'Seasonal & Special Menus',
      'Menu Change History',
    ],
  },
  {
    id: 'staffing',
    label: 'Staffing',
    icon: 'people-outline',
    items: [
      'Employee Schedules',
      'Job Descriptions',
      'Training Materials & Guidelines',
      'Onboarding Checklists',
      'Performance Reviews & Feedback',
      'Time & Attendance Records',
      'HR Policies & Forms',
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing & Media',
    icon: 'megaphone-outline',
    items: [
      'Social Media Content',
      'Event & Promotion Materials',
      'Loyalty Program Documents',
      'Advertising & Partnership Agreements',
      'Interior & Exterior Photos',
      'Food & Menu Photography',
      'Videos (Training, Marketing, Events)',
      '3D Renders & Design References',
      'Marketing Visual Assets',
      'Event & Team Photos',
    ],
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    icon: 'build-outline',
    items: [
      'Equipment Maintenance Logs',
      'Repair Requests & Work Orders',
      'Cleaning Schedules & Checklists',
      'Vendor Contacts (Maintenance)',
      'Facility Issues Log',
      'Preventive Maintenance Plans',
    ],
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: 'hammer-outline',
    items: [
      'Renovation & Construction Plans',
      'Expansion & Site Selection Documents',
      'Project Timelines & Updates',
      'Project Budgets & Bids',
      '3D Renders, Sketches & Design Files',
      'Vendor Contracts & Proposals',
      'Completed Project Archives',
      'Permits, Licenses & Certifications',
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    icon: 'clipboard-outline',
    items: [
      'Health & Safety Inspection Reports',
      'Food Safety & HACCP Documents',
      'Incident & Accident Reports',
      'Compliance Training Records',
      'Legal & Regulatory Documents',
    ],
  },
  {
    id: 'techai',
    label: 'Tech & AI',
    icon: 'hardware-chip-outline',
    items: [
      'Toast POS Setup & Notes',
      'AI Pilot Projects (Timers, Upsells, Order Accuracy, etc.)',
      'Automation Ideas & Workflows',
      'Integration Notes (Restaurant365, other tools)',
      'Tech Infrastructure & Network Docs',
      'Data Exports & Reports',
      'AI Tool Testing & Results',
    ],
  },
  {
    id: 'archives',
    label: 'Archives',
    icon: 'archive-outline',
    items: [
      'Old Financials',
      'Completed Projects',
      'Old Menus & Recipes',
      'Historical Staffing & Training',
      'Old Compliance Documents',
      'General Historical Files',
    ],
  },
];

// Overall Analysis is a hub-level feature (like a brand), not nested inside
// a category — used consistently across Home, permissions, and Admin.
