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
  { key: 'electricService', name: 'Electric Service', description: "Open a commercial account with the local electric utility in the business’s name. Needs the signed lease and the business entity details. Some meters need a technician visit, so start early.", section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'gasService', name: 'Gas Service', description: "Open a commercial gas account. Kitchen equipment can’t be tested until gas is live, so this gates a lot of later work.", section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'waterService', name: 'Water Service', description: "Open a commercial water and sewer account with the city. Often tied to the same application as trash service.", section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'telephoneWifi', name: 'Telephone/WiFi Service', description: "Order business internet and phone. Lead times run long and the POS depends on it, so order well before install week.", section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'trash', name: 'Trash', description: "Arrange commercial waste pickup, including grease disposal. Health inspections may check that a contract is in place.", section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'personalPropertyInsurance', name: 'Personal Property Insurance', description: "Coverage for equipment, furniture and fixtures inside the space, as distinct from the building itself.", section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'generalSpecialTaxes', name: 'General and Special Taxes', description: "Register with the city and county for any local business taxes that apply to restaurants beyond state-level sales tax.", section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'securitySolutions', name: 'Security Solutions', description: "Alarm system, cameras and safe. Install before equipment and inventory start arriving.", section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'generalLiabilityInsurance', name: 'General Liability Insurance', description: "Required by most landlords and by the state for a liquor license. Get the certificate naming the landlord as needed.", section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'hazardInsurance', name: 'Hazard Insurance', description: "Property coverage against fire and similar loss. Usually a lease requirement.", section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'orderEquipment', name: 'Order Equipment', description: "Place the main kitchen equipment order. The longest lead time in the whole opening — late equipment moves the opening date.", section: 'Utilities & Building', dependsOnKeys: [] },
  { key: 'signPermit', name: 'Sign Permit', description: "City approval for exterior signage. Separate from the building permit, and often has its own design rules.", section: 'Utilities & Building', dependsOnKeys: [], renewable: true },
  { key: 'buildingPermit', name: 'Building Permit', description: "City approval for the build-out. Nothing structural starts legally without it, and inspections reference it.", section: 'Utilities & Building', dependsOnKeys: [], renewable: true },

  // Bank
  { key: 'businessDebitCreditCard', name: 'Business Debit/Credit Card', description: "Set up the cards managers will use for purchases, with whatever limits and controls the finance team wants.", section: 'Bank', dependsOnKeys: [] },
  { key: 'depositFunds', name: 'Deposit $', description: "Fund the account so vendor payments and payroll can run.", section: 'Bank', dependsOnKeys: [] },
  { key: 'orderChecks', name: 'Order Checks', description: "Order business checks for vendors who don’t take cards.", section: 'Bank', dependsOnKeys: [] },
  { key: 'openAccount', name: 'Open Account', description: "Open the business checking account. Needs the EIN and the formation documents, so it follows those.", section: 'Bank', dependsOnKeys: [] },
  { key: 'orderDebitCard', name: 'Order Debit Card', description: "Order the account’s debit card.", section: 'Bank', dependsOnKeys: [] },

  // CPA
  { key: 'mdesSignup', name: 'MDES Signup', description: "Register with Mississippi Department of Employment Security for unemployment insurance. Required before payroll runs.", section: 'CPA', dependsOnKeys: [] },
  { key: 'eftpsSignup', name: 'EFTPS Signup', description: "Enrol in the federal Electronic Federal Tax Payment System so payroll taxes can be paid electronically. Enrolment isn’t instant.", section: 'CPA', dependsOnKeys: [] },
  { key: 'createTap', name: 'Create TAP', description: "Set up the Mississippi Taxpayer Access Point account, which is how state sales and withholding tax get filed.", section: 'CPA', dependsOnKeys: [] },

  // Health Dept — these five used to be Food Permit's sub-requirements;
  // Food Permit itself now lives in License & Lease Renewals.
  { key: 'foodManagerCert', name: 'Food Manager SERVSAFE Cert', description: "At least one certified food manager is required. Book the course early — the certificate is needed for the permit application.", section: 'Health Dept', dependsOnKeys: [] },
  { key: 'foodPermitApplicationStep', name: 'Application', description: "Submit the health department’s food service application.", section: 'Health Dept', dependsOnKeys: [] },
  { key: 'planReview', name: 'Plan Review', description: "Health department reviews the kitchen layout and equipment before build-out. Changes found here are much cheaper than changes found later.", section: 'Health Dept', dependsOnKeys: [] },
  { key: 'menuHealthDept', name: 'Menu', description: "Submit the menu. What’s on it affects which equipment and procedures the health department requires.", section: 'Health Dept', dependsOnKeys: [] },
  { key: 'floorPlanHealthDept', name: 'Floor Plan', description: "Submit the kitchen and dining layout showing equipment placement, sinks and food flow.", section: 'Health Dept', dependsOnKeys: [] },
  {
    key: 'foodPermit',
    name: 'Food Permit',
    description: "The permit itself. Issued after the application, plan review and a passing inspection.",
    section: 'Health Dept',
    capstoneOf: 'Health Dept',
    renewable: true
  },

  // Liquor License sub-requirements — Liquor License itself now lives in
  // License & Lease Renewals.
  { key: 'paymentFoodPermitInspection', name: 'Payment for Food Permit Inspection', description: "Pay the inspection fee tied to the food permit, which the liquor application depends on.", section: 'Liquor License', dependsOnKeys: [] },
  { key: 'publicNotice', name: 'Public Notice (2 Days in Paper)', description: "Publish the required legal notice in a local newspaper. Keep the publisher’s affidavit as proof.", section: 'Liquor License', dependsOnKeys: [] },
  { key: 'copyOfLease', name: 'Copy of Lease', description: "Submit the executed lease showing the business controls the premises.", section: 'Liquor License', dependsOnKeys: [] },
  { key: 'fingerprintCards', name: 'Fingerprint Cards', description: "Background check cards for owners and officers. Scheduling and processing take time, so start early.", section: 'Liquor License', dependsOnKeys: [] },
  { key: 'financialsForm', name: 'Financials Form', description: "The state’s financial disclosure form for the applicant entity.", section: 'Liquor License', dependsOnKeys: [] },
  { key: 'waiverForm', name: 'Waiver Form', description: "The state’s required waiver, typically authorising background and financial checks.", section: 'Liquor License', dependsOnKeys: [] },
  { key: 'residencyForm', name: 'Residency Form', description: "Documentation of residency where the state requires it of applicants.", section: 'Liquor License', dependsOnKeys: [] },
  { key: 'taxExtension', name: 'Tax Extension', description: "Confirmation the applicant is current with state tax obligations, or has an approved extension.", section: 'Liquor License', dependsOnKeys: [] },
  { key: 'menuLiquorLicense', name: 'Menu', description: "The menu as submitted to ABC. Food-to-alcohol ratio rules may depend on it.", section: 'Liquor License', dependsOnKeys: [] },
  { key: 'floorPlanLiquorLicense', name: 'Floor Plan', description: "Layout showing where alcohol is stored, served and consumed.", section: 'Liquor License', dependsOnKeys: [] },
  { key: 'ttbForm', name: 'TTB Form 5630.5d', description: "Federal alcohol dealer registration with the Alcohol and Tobacco Tax and Trade Bureau. Separate from the state process.", section: 'Liquor License', dependsOnKeys: [] },
  { key: 'investorInfo', name: 'Investor Info', description: "Ownership and investor disclosure for everyone with a stake in the entity.", section: 'Liquor License', dependsOnKeys: [] },
  {
    key: 'liquorLicense',
    name: 'Liquor License',
    description: "The license itself. Issued once every supporting document and form above is complete.",
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
  { key: 'fireSafetyInspection', name: 'Fire/Safety Inspection', description: "Fire marshal inspection covering exits, suppression, extinguishers and occupancy.", section: 'Business License', dependsOnKeys: [] },
  { key: 'buildingInspectionCert', name: 'Building Inspection Cert', description: "City confirmation the build-out meets code.", section: 'Business License', dependsOnKeys: [] },
  { key: 'businessLicenseApplication', name: 'Business License Application', description: "Submit the city’s business license application.", section: 'Business License', dependsOnKeys: [] },
  { key: 'taxId', name: 'Tax ID', description: "State tax identification number, registered through TAP.", section: 'Business License', dependsOnKeys: [] },
  { key: 'ein', name: 'EIN', description: "Federal Employer Identification Number from the IRS. Free, usually same-day online, and nearly everything else depends on it. Do this first.", section: 'Business License', dependsOnKeys: [] },
  { key: 'salesTax', name: 'Sales Tax', description: "Register to collect and remit Mississippi sales tax. Required before the first sale.", section: 'Business License', dependsOnKeys: [] },
  {
    key: 'beerPermit',
    name: 'Beer Permit',
    description: "State permit for beer sales, separate from the liquor license and usually faster.",
    section: 'Business License',
    dependsOnKeys: ['salesTax'],
    renewable: true
  },
  {
    // Depth 3: this needs Food Permit and Beer Permit, which have their own
    // prerequisites. The deepest chain in the template, and the reason the
    // date generator groups by depth instead of spreading items evenly.
    key: 'privilegeLicense',
    name: 'Business License',
    description: "The license itself. Issued once the inspections, application, Tax ID, Beer Permit and Food Permit are all complete.",
    section: 'Business License',
    capstoneOf: 'Business License',
    alsoDependsOn: ['foodPermit', 'businessId'],
    renewable: true
  },

  // Purveyors
  { key: 'taxExemption', name: 'Tax Exemption', description: "Resale exemption certificate so goods bought for resale aren’t taxed twice. Give a copy to each supplier.", section: 'Purveyors', dependsOnKeys: [] },

  // Final Steps
  { key: 'plumbingInspection', name: 'Plumbing Inspection', description: "Final plumbing sign-off, including grease trap and backflow.", section: 'Final Steps', dependsOnKeys: [] },
  { key: 'electricalInspection', name: 'Electrical Inspection', description: "Final electrical sign-off for the completed build-out.", section: 'Final Steps', dependsOnKeys: [] },
  { key: 'finalCertOccupancy', name: 'Final Certificate of Occupancy', description: "The city’s confirmation the space can legally be occupied. Nothing opens without it.", section: 'Final Steps', dependsOnKeys: [] },
  { key: 'createInfoBinder', name: 'Create Info Binder', description: "Assemble permits, licenses, inspection certificates, vendor contacts and account numbers in one place. This is what an inspector asks for and what a new manager needs.", section: 'Final Steps', dependsOnKeys: [] },
  { key: 'businessId', name: 'Business ID', description: "Confirm the state business identification is issued and on file.", section: 'Final Steps', dependsOnKeys: [] },
  { key: 'llc', name: 'LLC', description: "Confirm the entity is properly formed and registered with the state.", section: 'Final Steps', dependsOnKeys: [] },
  { key: 'withholdingTax', name: 'Withholding Tax', description: "Register for state employee withholding. Required before the first payroll.", section: 'Final Steps', dependsOnKeys: [] },
];

export default {
  id: 'ms-starkville',
  label: 'Starkville, MS',
  // Mississippi fits comfortably in a four-month runway. Cities with council
  // agenda slots or sequential city-then-state approval need longer.
  window: { windowStartDaysBefore: 120, windowEndDaysBefore: 14 },
  items: normalizeItems(items)
};
