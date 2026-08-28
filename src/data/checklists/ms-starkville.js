// Starkville, Mississippi.
//
// This is the original checklist the app shipped with — Mississippi state
// requirements (MDES, TAP, state ABC forms) plus Starkville's city-issued
// privilege license. It was a single hardcoded list until per-city templates
// landed; nothing here changed in the move except the six permit items below,
// which existed on mobile but had been dropped from desktop.
//
// The four dependency edges here are the reason computeDepths exists. Food
// Permit and Beer Permit each gate Business License, and each has
// its own prerequisites, so the graph runs three levels deep.
import { normalizeItems } from './types';

const items = [
  // Utilities & core building
  { key: 'electricService', name: 'Electric Service', section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'gasService', name: 'Gas Service', section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'waterService', name: 'Water Service', section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'telephoneWifi', name: 'Telephone/WiFi Service', section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'trash', name: 'Trash', section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'personalPropertyInsurance', name: 'Personal Property Insurance', section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'generalSpecialTaxes', name: 'General and Special Taxes', section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'securitySolutions', name: 'Security Solutions', section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'generalLiabilityInsurance', name: 'General Liability Insurance', section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'hazardInsurance', name: 'Hazard Insurance', section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'orderEquipment', name: 'Order Equipment', section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'signPermit', name: 'Sign Permit', section: 'Utilities & Building', dependsOnKeys: [], renewable: true },
  { key: 'buildingPermit', name: 'Building Permit', section: 'Utilities & Building', dependsOnKeys: [], renewable: true },

  // Bank
  { key: 'businessDebitCreditCard', name: 'Business Debit/Credit Card', section: 'Bank', dependsOnKeys: [] },
  { key: 'depositFunds', name: 'Deposit $', section: 'Bank', dependsOnKeys: [] },
  { key: 'orderChecks', name: 'Order Checks', section: 'Bank', dependsOnKeys: [] },
  { key: 'openAccount', name: 'Open Account', section: 'Bank', dependsOnKeys: [] },
  { key: 'orderDebitCard', name: 'Order Debit Card', section: 'Bank', dependsOnKeys: [] },

  // CPA
  { key: 'mdesSignup', name: 'MDES Signup', section: 'CPA', dependsOnKeys: [] },
  { key: 'eftpsSignup', name: 'EFTPS Signup', section: 'CPA', dependsOnKeys: [] },
  { key: 'createTap', name: 'Create TAP', section: 'CPA', dependsOnKeys: [] },

  // Health Dept — these five used to be Food Permit's sub-requirements;
  // Food Permit itself now lives in License & Lease Renewals.
  { key: 'foodManagerCert', name: 'Food Manager SERVSAFE Cert', section: 'Health Dept', dependsOnKeys: [] },
  { key: 'foodPermitApplicationStep', name: 'Application', section: 'Health Dept', dependsOnKeys: [] },
  { key: 'planReview', name: 'Plan Review', section: 'Health Dept', dependsOnKeys: [] },
  { key: 'menuHealthDept', name: 'Menu', section: 'Health Dept', dependsOnKeys: [] },
  { key: 'floorPlanHealthDept', name: 'Floor Plan', section: 'Health Dept', dependsOnKeys: [] },
  {
    key: 'foodPermit',
    name: 'Food Permit',
    section: 'Health Dept',
    capstoneOf: 'Health Dept',
    renewable: true
  },

  // Liquor License sub-requirements — Liquor License itself now lives in
  // License & Lease Renewals.
  { key: 'paymentFoodPermitInspection', name: 'Payment for Food Permit Inspection', section: 'Liquor License', dependsOnKeys: [] },
  { key: 'publicNotice', name: 'Public Notice (2 Days in Paper)', section: 'Liquor License', dependsOnKeys: [] },
  { key: 'copyOfLease', name: 'Copy of Lease', section: 'Liquor License', dependsOnKeys: [] },
  { key: 'fingerprintCards', name: 'Fingerprint Cards', section: 'Liquor License', dependsOnKeys: [] },
  { key: 'financialsForm', name: 'Financials Form', section: 'Liquor License', dependsOnKeys: [] },
  { key: 'waiverForm', name: 'Waiver Form', section: 'Liquor License', dependsOnKeys: [] },
  { key: 'residencyForm', name: 'Residency Form', section: 'Liquor License', dependsOnKeys: [] },
  { key: 'taxExtension', name: 'Tax Extension', section: 'Liquor License', dependsOnKeys: [] },
  { key: 'menuLiquorLicense', name: 'Menu', section: 'Liquor License', dependsOnKeys: [] },
  { key: 'floorPlanLiquorLicense', name: 'Floor Plan', section: 'Liquor License', dependsOnKeys: [] },
  { key: 'ttbForm', name: 'TTB Form 5630.5d', section: 'Liquor License', dependsOnKeys: [] },
  { key: 'investorInfo', name: 'Investor Info', section: 'Liquor License', dependsOnKeys: [] },
  {
    key: 'liquorLicense',
    name: 'Liquor License',
    section: 'Liquor License',
    capstoneOf: 'Liquor License',
    renewable: true
  },

  // Business License and its prerequisites. Beer Permit sits here too since
  // Sales Tax gates it and Business License needs it in turn.
  //
  // These permits appear in License & Lease Renewals as well — deliberately.
  // A permit has two lives: acquiring it, which is dependency-gated and
  // happens once before opening, and renewing it, which recurs forever after.
  // The checklist owns the first, renewals own the second, and signing off
  // here is what seeds the renewal record.
  { key: 'fireSafetyInspection', name: 'Fire/Safety Inspection', section: 'Privelege License', dependsOnKeys: [] },
  { key: 'buildingInspectionCert', name: 'Building Inspection Cert', section: 'Privelege License', dependsOnKeys: [] },
  { key: 'businessLicenseApplication', name: 'Business License Application', section: 'Privelege License', dependsOnKeys: [] },
  { key: 'taxId', name: 'Tax ID', section: 'Privelege License', dependsOnKeys: [] },
  { key: 'ein', name: 'EIN', section: 'Privelege License', dependsOnKeys: [] },
  { key: 'salesTax', name: 'Sales Tax', section: 'Privelege License', dependsOnKeys: [] },
  {
    key: 'beerPermit',
    name: 'Beer Permit',
    section: 'Privelege License',
    dependsOnKeys: ['salesTax'],
    renewable: true
  },
  {
    // Depth 3: this needs Food Permit and Beer Permit, which have their own
    // prerequisites. The deepest chain in the template, and the reason the
    // date generator groups by depth instead of spreading items evenly.
    key: 'privilegeLicense',
    name: 'Business License',
    section: 'Privelege License',
    capstoneOf: 'Privelege License',
    alsoDependsOn: ['foodPermit', 'businessId'],
    renewable: true
  },

  // Proveyors
  { key: 'taxExemption', name: 'Tax Exemption', section: 'Proveyors', dependsOnKeys: [] },

  // Final Steps
  { key: 'plumbingInspection', name: 'Plumbing Inspection', section: 'Final Steps', dependsOnKeys: [] },
  { key: 'electricalInspection', name: 'Electrical Inspection', section: 'Final Steps', dependsOnKeys: [] },
  { key: 'finalCertOccupancy', name: 'Final Certificate of Occupancy', section: 'Final Steps', dependsOnKeys: [] },
  { key: 'createInfoBinder', name: 'Create Info Binder', section: 'Final Steps', dependsOnKeys: [] },
  { key: 'businessId', name: 'Business ID', section: 'Final Steps', dependsOnKeys: [] },
  { key: 'llc', name: 'LLC', section: 'Final Steps', dependsOnKeys: [] },
  { key: 'withholdingTax', name: 'Withholding Tax', section: 'Final Steps', dependsOnKeys: [] },
];

export default {
  id: 'ms-starkville',
  label: 'Starkville, MS',
  // Mississippi fits comfortably in a four-month runway. Cities with council
  // agenda slots or sequential city-then-state approval need longer.
  window: { windowStartDaysBefore: 120, windowEndDaysBefore: 14 },
  items: normalizeItems(items)
};
