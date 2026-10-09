// Sam's chart of accounts for expense reporting (9 Oct 2026), from
// CIG_Expense_Account_List.xlsx - 85 accounts under 11 headings, in his order.
//
// This is only the starting list. The live list is the expenseAccounts
// collection (one document per account, id = the code), which Finance can add
// to or retire from in the Hub; the server checks every receipt against that
// collection, never against this file. The seed script loads this list once.
//
// 5136 is spelled "Purchases" here; Sam's sheet had "Purcases" (Brenner's
// call, 9 Oct). The code is what matches his books.
const HEADINGS = [
  ['COGS', [
    ['5105', 'Produce Costs'], ['5109', 'Dessert Costs'], ['5110', 'Dairy Costs'], ['5111', 'Grocery Costs'],
    ['5112', 'Bread Costs'], ['5115', 'Meat Cost'], ['5118', 'Poultry Costs'], ['5119', 'Seafood Costs'],
    ['5121', 'Beef Costs'], ['5122', 'Pork Costs'], ['5123', 'Other Meat Costs'], ['5130', 'Local Food Purchases'],
    ['5135', 'N/A Bev Costs'], ['5136', 'Local N/A Bev Purchases'], ['5145', 'Liquor Costs'], ['5146', 'Bar Con Costs'],
    ['5150', 'Beer Costs'], ['5155', 'Wine Costs'], ['5156', 'Local LBW Purchases'], ['5200', 'Merchandise Cost'],
  ]],
  ['Labor', [['6141', 'Contracted/Other Labor']]],
  ['Employee Benefits', [
    ['6332', 'Employee Insurances'], ['6351', 'Family Meal'], ['6354', 'Employee Gifts & Parties'],
    ['6358', 'Medical Expenses'], ['6360', 'Awards & Prizes Cost'], ['6362', 'Employee Transportation'],
  ]],
  ['Auto Expense', [
    ['7105', 'Auto or Truck Expense'], ['7106', 'Auto Parking & Tolls'], ['7107', 'Auto Gas & Fuel'],
    ['7108', 'Auto Insurance'], ['7112', 'Auto Repairs & Expenses'], ['7115-1', 'Auto Fines & Penalties'],
  ]],
  ['Operating Expenses', [
    ['7125', 'Contract Cleaning'], ['7130', 'Equipment Rentals'], ['7165', 'Linen & Linen Rental'],
    ['7170', 'Menus & Drink Lists'], ['7171', 'Decorations & Furniture'], ['7175', 'Miscellaneous Expense'],
    ['7190', 'Pest Control'], ['7240', 'Uniforms'],
  ]],
  ['Supplies', [
    ['5160', 'Paper Supplies'], ['7114', 'Banquet Supplies'], ['7115', 'Bar Supplies'], ['7120', 'Cleaning Supplies'],
    ['7155', 'Smallwares Supplies'], ['7192', 'Dishes & Silverware'],
  ]],
  ['R&M', [['7601', 'R&M - Building'], ['7602', 'R&M - Equipment'], ['7603', 'Contract Maintenance']]],
  ['Utilities', [
    ['7205', 'Electricity'], ['7210', 'Gas & Propane'], ['7215', 'Trash Removal'], ['7220', 'Water & Sewage'],
    ['7505', 'Phone/Internet'], ['7506', 'DirecTV & Youtube (Cable)'],
  ]],
  ['Marketing', [
    ['7312', 'Advertising / Marketing'], ['7313', 'Trivia and Contests'], ['7316', 'Print Media'],
    ['7318', 'Online Advertising'], ['7319', 'Local Restaurant Marketing'], ['7340', 'Loyalty Program'],
  ]],
  ['Admin Expenses', [
    ['7114-1', 'Penalties & Settlements'], ['7255', 'Meals & Entertainment'], ['7352', 'Community Projects'],
    ['7354', 'Contributions & Donations'], ['7360', 'Research & Development'], ['7362', 'Customer Surveys'],
    ['7364', 'Outside Research Agency'], ['7405', 'Accounting & Payroll'], ['7406', 'Legal Fees & Services'],
    ['7407', 'Professional Fees'], ['7425', 'Bank Charges'], ['7430', 'Third Party Delivery Fees'],
    ['7435', 'Dues & Subscriptions'], ['7440', 'Postage & Office Supplies'], ['7445', 'Freight Charge & Taxes'],
    ['7450', 'Computer & Tech Expense'], ['7465', 'Consulting Expense'], ['7480', 'Licenses & Permits'],
    ['7500', 'Security & Deposit Services'], ['7510', 'Training Programs'], ['7511', 'Recruiting'],
    ['7515', 'Travel & Accommodations'],
  ]],
  ['Occupancy', [['8104', 'Rent: Storage']]],
];

// Flat, in Sam's order: { code, name, heading, headingOrder, order }.
const STARTING_ACCOUNTS = [];
HEADINGS.forEach(([heading, list], h) =>
  list.forEach(([code, name]) =>
    STARTING_ACCOUNTS.push({ code, name, heading, headingOrder: h, order: STARTING_ACCOUNTS.length })
  )
);

// The one account that asks who was there - the question an accountant
// always asks about a meal.
const ATTENDEES_ACCOUNT = '7255';

// Old categories that map to one account without guessing (Brenner, 9 Oct).
// Mileage, Conference & Events, Supplies and Other could be several accounts,
// so they stay "not coded yet" for Finance to choose.
const OLD_CATEGORY_TO_ACCOUNT = {
  meals: '7255',
  entertainment: '7255',
  airfareTravel: '7515',
  lodging: '7515',
  groundTransport: '7515',
};

module.exports = { STARTING_ACCOUNTS, ATTENDEES_ACCOUNT, OLD_CATEGORY_TO_ACCOUNT };
