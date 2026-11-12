// The Hub Guide's notebook (Nov 2026). Everything it knows that isn't live
// data: how each page works, words that mean the same thing, nicknames, and
// its jokes. The question bank this comes from is the Project doc
// claude/hub-guide-questions.md - keep the two in step when pages change.

// Words people use for the same thing. Each key is rewritten to its value
// before the Guide reads a question.
export const SAME = {
  poc: 'contact', contacts: 'contact', rep: 'contact', vendor: 'contact', vendors: 'contact', 'point of contact': 'contact',
  licence: 'license', licences: 'license',
  pto: 'time off', vacation: 'time off', 'day off': 'time off', 'days off': 'time off', holiday: 'time off', leave: 'time off',
  expense: 'receipt', expenses: 'receipt', receipts: 'receipt',
  overdue: 'late', behind: 'late', 'past due': 'late',
  gm: 'general manager', agm: 'assistant general manager',
  boh: 'kitchen', foh: 'front of house',
  temps: 'temperature', temp: 'temperature', temperatures: 'temperature',
  sop: 'standard operating procedures', sops: 'standard operating procedures',
  pnl: 'p&l', 'p and l': 'p&l', 'profit and loss': 'p&l',
  wifi: 'telephone/wifi', internet: 'telephone/wifi',
};

// Common slips, fixed before matching.
export const SPELLING = {
  liqour: 'liquor', licquor: 'liquor', liscense: 'license', lisence: 'license', licsense: 'license',
  recipies: 'recipes', receit: 'receipt', reciept: 'receipt', reciepts: 'receipt', availibility: 'availability',
  availablity: 'availability', calender: 'calendar', calandar: 'calendar', resturant: 'restaurant', restuarant: 'restaurant',
  insurence: 'insurance', schedual: 'schedule', shedule: 'schedule', cateirng: 'catering', catring: 'catering',
  checklsit: 'checklist', cheklist: 'checklist', renewel: 'renewal', renewl: 'renewal', temprature: 'temperature',
  ridgland: 'ridgeland', starkvile: 'starkville', chelesa: 'chelsea', nashvile: 'nashville',
};

// What people call each restaurant.
export const BRAND_NICKNAMES = {
  taste: ['taste', 'taste italian', 'italian'],
  blutos: ['blutos', 'bluto', "bluto's", 'greek'],
  heritage: ['heritage', 'chophouse', 'steakhouse'],
  pronto: ['pronto', 'gusto'],
  stellas: ['sunnyside', 'stellas', "stella's", 'stella'],
  cajun: ['cajun', 'cajun depot'],
};

// How-to and where-is answers, one per page or task. `k` are the words
// that point to it (the more that match, the better), `a` the answer,
// `to` the button, and `need` the access column it's behind, if any.
export const PAGES = [
  { id: 'help', k: ['what can you do', 'help', 'what is this', 'who are you', 'what are you', 'how do you work'], a: "I know where everything in the Hub is. Ask me who someone is, where a folder lives, what's late, when something renews, or how to do something, like 'how do I add a receipt?'. I only show what you're allowed to see.", chips: ["What needs me?", 'How do I request time off?', "What's late?"] },
  { id: 'start', k: ['where do i start', "i'm new", 'im new', 'how does the hub work', 'how does this work', 'getting started'], a: "Home shows what needs you today. The sidebar has Messages, the Master Calendar, the Directory (company-wide pages) and each restaurant you can open. Inside a restaurant, pick a location to see its checklists, contacts and Drive folders.", to: '/', label: 'Home' },
  { id: 'directory', k: ['directory', 'company pages', 'all the pages', 'where are the pages'], a: "The Directory is in the sidebar (the four-squares icon). It holds the company-wide pages: Catering & Events, Availability, Expenses, Wares, Systems Help, Device Requests, the Signature Directory, HR & Insurance, Emergency Procedures and Pre-Opening Documents.", to: '/directory', label: 'Directory' },
  { id: 'home', k: ['go home', 'home page', 'back home', 'get back'], a: 'Press Home at the top of the sidebar, or the round Home button on your phone.', to: '/', label: 'Home' },
  { id: 'reddot', k: ['red dot', 'red dots', 'what does the dot mean', 'red circle'], a: "A red dot means something there is new to you or needs you. It goes away once you've opened it." },
  { id: 'rednumber', k: ['red number', 'number next to', 'number by the restaurant'], a: "The red number next to a restaurant is how many opening checklist items are late there." },
  { id: 'whatsnew', k: ["what's new", 'whats new', 'what changed', 'updates', 'new features'], a: "The latest Hub updates are on the Support page, under what's new.", to: '/support', label: 'Support' },
  { id: 'app', k: ['app', 'iphone', 'phone app', 'on my phone', 'mobile'], a: "hub.cigconcepts.com works in your phone's browser, and the iPhone app is being updated. It'll be on the App Store soon." },
  { id: 'theme', k: ['dark mode', 'light mode', 'colours', 'colors', 'appearance', 'theme'], a: "Go to Profile › Appearance and pick Light, Dark or Match device. It's saved on this device only.", to: '/profile', label: 'Profile' },
  { id: 'repair', k: ['walk-in', 'walk in', 'cooler', 'freezer', 'ice machine', 'fryer', 'oven', 'hood', 'dish machine', 'dishwasher', 'hvac', 'air conditioning', 'plumbing', 'leak', 'toilet', 'equipment', 'repair', 'fix the'], a: "Log it in the location's Maintenance › Repair Requests & Work Orders folder, and the repair company's details are in Maintenance › Vendor Contacts. If it affects food safety, tell the manager on duty straight away.", folder: ['maintenance', 'Repair Requests & Work Orders'] },
  { id: 'support', k: ['who built', 'brenner', 'report a bug', 'something is broken in the hub', 'hub is broken', 'bug', 'support', 'ask for help', 'hub not working', 'page not working'], a: "Brenner runs the Hub. Use Support to ask him for help or to report a problem. A screenshot helps.", to: '/support', label: 'Support' },
  { id: 'access', k: ['get access', 'request access', "can't see", 'cant see', "can't open", 'no access', 'locked out'], a: "If you need a restaurant or location you can't open, press 'Request access' next to it on Home. An admin decides and you'll get an email.", to: '/', label: 'Home' },

  // Opening checklists
  { id: 'tick', k: ['tick off', 'mark done', 'mark it done', 'check off', 'complete an item', 'finish an item'], a: "Open the item and press 'Mark done'. On a phone, tap ✓ Done.", need: 'openingChecklist' },
  { id: 'assign', k: ['assign someone', 'assign an item', 'how do i assign', 'give someone', 'hand off'], a: "Open the item and pick people under 'Assigned to'. They get one summary email at 5 PM and see it on their Home.", need: 'openingChecklist' },
  { id: 'duedate', k: ['change a due date', 'change the date', 'move the date', 'new due date', 'due date'], a: 'Open the item and press its date to pick a new one.', need: 'openingChecklist' },
  { id: 'replan', k: ['opening date moves', 'opening date changed', 'move the opening', 'replan', 're-plan', 'change opening date'], a: "Change the date with 'Change opening date', then use 'Re-plan dates' to see a preview first. Signed-off items and anything already in the works keep their dates.", to: '/opening-replan', label: 'Re-plan preview', need: 'openingChecklist' },
  { id: 'additem', k: ['add an item', 'add item', 'new item', 'add a task'], a: "On the opening checklist, press '+ Add item' at the top right.", need: 'openingChecklist' },
  { id: 'printopening', k: ['print the checklist', 'fill-in sheet', 'fill in sheet', 'print opening'], a: 'Press the printer icon at the top of the opening checklist for a fill-in sheet.', need: 'openingChecklist' },
  { id: 'markopen', k: ['mark as open', 'mark the location open', 'location is open', 'we opened'], a: "Admins press 'Mark as open' on the opening checklist. The location becomes an operating location, and the opening items are kept as a record.", need: 'openingChecklist' },
  { id: 'phases', k: ['phases', '3 months out', 'three months out', '2 months out', 'opening month', 'timeline'], a: 'Set-up items run from 120 to 14 days before opening, in four phases: Foundation, Applications, Build & inspections, and Final permits. The timeline runs 3 Months Out (90–60 days), 2 Months Out (60–30) and the Opening Month.' },
  { id: 'openingsoon', k: ['openings', 'opening soon', 'new locations', 'what is opening', "what's opening"], a: 'Every location that is opening soon is on the Opening soon page, with dates and how ready each one is.', to: '/opening-soon', label: 'Opening soon' },

  // Daily checklists
  { id: 'daily', k: ['daily checklist', 'daily checklists', 'opening checklist today', 'closing checklist', 'host checklist', 'server checklist', 'bar checklist', 'kitchen checklist'], a: "Open the location, then Daily Checklists. You'll see today's opening and closing lists (Host, Server, Bar, Kitchen and more).", need: 'dailyChecklists', loc: 'daily-checklists', label: 'Daily Checklists' },
  { id: 'temptimes', k: ['temperature', 'temperature log', 'when are temps', 'temp times'], a: 'Temperatures are logged three times a day: 10:00 AM, 2:00 PM and 5:00 PM. A reminder goes out 30 minutes after each one if it isn\'t filled in.', loc: 'daily-checklists', label: 'Daily Checklists' },
  { id: 'signoff', k: ['sign off', 'sign-off', 'signoff'], a: 'When every task is ticked, the manager on duty presses Sign off at the bottom. If it isn\'t signed off by 7 PM, a reminder goes out.', loc: 'daily-checklists', label: 'Daily Checklists' },
  { id: 'dailyfiled', k: ['signed checklists', "last week's checklists", 'old checklists', 'where do checklists go', 'checklist pdf', 'past checklists'], a: "Signed-off checklists are filed automatically as PDFs in the location's Drive, under Operations › Opening & Closing Checklists › month. Temperature logs go in Operations › Temperature Logs.", folder: ['operations', 'Opening & Closing Checklists'] },
  { id: 'printdaily', k: ['print daily', 'print all lists', 'print the daily'], a: "On Daily Checklists, press 'Print all lists'.", loc: 'daily-checklists', label: 'Daily Checklists' },
  { id: 'mod', k: ['manager on duty', "can't tick the daily", 'cant tick the daily'], a: "Only the manager on duty can tick off and sign the daily checklists for their location." },

  // Renewals
  { id: 'addrenewal', k: ['add a renewal', 'add renewal', 'add a permit', 'new permit', 'add a license'], a: "Open the location, then License & Lease Renewals, and press '+ Add permit'.", loc: 'renewals', need: 'renewals', label: 'Renewals' },
  { id: 'renewreminders', k: ['who gets reminded', 'renewal reminder', 'renewal emails'], a: "The location's GM and Ronnie get renewal reminder emails." },
  { id: 'markrenewed', k: ['mark renewed', 'mark as renewed', 'renewed it', 'renew a license'], a: 'Open it on the Renewals page and mark it renewed with the new expiry date.', loc: 'renewals', need: 'renewals', label: 'Renewals' },

  // Calendar
  { id: 'addevent', k: ['add to the calendar', 'add an event', 'add event', 'calendar entry', 'add a reminder', 'add a deadline'], a: "On the Master Calendar, press '+ Add event' (or use '+ New › Add to the calendar' on Home). Pick who needs to know and they'll see it.", to: '/calendar', label: 'Master Calendar', need: 'calendar' },
  { id: 'calfilter', k: ['one restaurant', 'filter the calendar', 'just one restaurant', 'only one location'], a: 'Use the restaurant picker at the top of the Calendar.', to: '/calendar', label: 'Master Calendar' },
  { id: 'carried', k: ['carried forward', 'overdue carried'], a: "Those are items that were due before today and still aren't done. They're carried forward so they don't get lost." },

  // Messages
  { id: 'message', k: ['send a message', 'message someone', 'new message', 'how do i message', 'dm'], a: "Go to Messages and press '+ New message'.", to: '/messages', label: 'Messages', need: 'calendar' },
  { id: 'group', k: ['group chat', 'new group', 'make a group'], a: "In Messages, press '+ New group' and pick people. Admins and executives can start groups.", to: '/messages', label: 'Messages' },
  { id: 'findmsg', k: ['find a message', 'old message', 'search messages', 'find a chat'], a: 'Use the search box at the top of Messages. It searches chat names and message text. Inside a chat, the magnifying glass searches just that chat.', to: '/messages', label: 'Messages' },
  { id: 'sendfile', k: ['send a photo', 'send a file', 'attach', 'send a picture', 'send a pdf'], a: 'In a chat, press + next to the message box.', to: '/messages', label: 'Messages' },
  { id: 'reactions', k: ['reactions', 'react', 'what do the reactions mean'], a: 'You can react with Got it, Done, Love it, Urgent (!!), Question or Ha. One per person; pick it again to take it off.' },
  { id: 'editmsg', k: ['delete a message', 'edit a message', 'unsend'], a: 'Point at your message (or tap and hold on a phone) and pick Edit or Delete.' },
  { id: 'seen', k: ['read my message', 'who has read', 'seen'], a: "'Seen' under your last message shows who has read it." },
  { id: 'private', k: ['admins read my messages', 'can admins read', 'are messages private', 'private messages'], a: 'No. Private chats are only for the people in them. Nobody else can read them, admins included.' },

  // Availability
  { id: 'timeoff', k: ['time off', 'request time off', 'book time off', 'take time off', 'day off'], a: "Go to Availability and press '+ Request time off'. Ronnie or an admin decides, and you get an email either way.", to: '/availability', label: 'Availability', need: 'availability' },
  { id: 'hours', k: ['set my hours', 'my availability', 'usual week', 'my hours', 'my schedule'], a: "On Availability, press 'Edit my usual week'. It carries forward every week. If one week is different, use 'Only this week is different'.", to: '/availability', label: 'Availability', need: 'availability' },
  { id: 'canceloff', k: ['cancel time off', 'cancel my request', 'take back time off'], a: 'Open your request on Availability and cancel it there.', to: '/availability', label: 'Availability', need: 'availability' },

  // Expenses
  { id: 'receipt', k: ['add a receipt', 'receipt', 'i bought', 'submit a receipt', 'reimburse', 'reimbursement'], a: "Go to Expenses and press '+ Add receipt'. Snap a photo, add the amount and pick what it was for. Only you, Finance and admins can see your receipts.", to: '/expenses', label: 'Expenses', need: 'expenses' },
  { id: 'fixreceipt', k: ['fix a receipt', 'void', 'wrong receipt', 'edit a receipt', 'delete a receipt'], a: 'Open it in Expenses. You can edit it, or void it if it was a mistake.', to: '/expenses', label: 'Expenses', need: 'expenses' },
  { id: 'notcoded', k: ['not coded', 'uncoded', 'what account', 'which account', 'code a receipt'], a: "'Not coded' means it hasn't been matched to one of Sam's accounts yet. Open it and pick the account. Ask Sam Kaufman if you're not sure which one.", to: '/expenses', label: 'Expenses', need: 'expenses' },
  { id: 'pastreports', k: ['past reports', 'last period report', 'expense report', 'download the report'], a: "Past reports are under 'Past reports' on Expenses. Each one has a spreadsheet and the photos.", to: '/expenses', label: 'Expenses', need: 'expenses' },

  // Catering and events
  { id: 'logcatering', k: ['log a catering', 'catering call', 'someone called', 'add an enquiry', 'add enquiry', 'party enquiry', 'private dining'], a: "Go to Catering & Events and press '+ Add enquiry', or use '+ New › Log a catering enquiry' on Home.", to: '/catering', label: 'Catering & Events', need: 'catering' },
  { id: 'cateringin', k: ['how do enquiries', 'enquiries get in', 'catering form', 'website form'], a: "Website catering forms are emailed in and land here automatically, matched to the restaurant from the subject line. Phone enquiries are added by hand.", to: '/catering', label: 'Catering & Events' },
  { id: 'stages', k: ['stages', 'what does talking mean', 'what does confirmed mean', "didn't book", 'statuses'], a: "Each enquiry goes New → Talking → Confirmed → Done. 'Didn't book' means it never went ahead." },
  { id: 'outreach', k: ['outreach', 'hospitals', 'wedding venues', 'goals'], a: 'Outreach tracks the places and events the team is reaching out to (hospitals, wedding venues, businesses) with goals for who to contact.', to: '/catering', label: 'Catering › Outreach' },
  { id: 'eventreq', k: ['request an event', 'event request', 'promo request', 'request a promo', 'run a promotion'], a: "Open the location, then Event / Promo Requests, and send the request. Ronnie approves events.", loc: 'event-requests', need: 'eventRequests', label: 'Event / Promo Requests' },

  // Requests
  { id: 'systems', k: ['toast', 'r365', 'restaurant365', 'opentable', 'open table', 'pos problem', 'menu change in toast', 'systems help'], a: "Use Systems Help. Press '+ New request' and say what you need. You'll see it go from Pending to In progress to Done.", to: '/integration-requests', label: 'Systems Help', need: 'systemsHelp' },
  { id: 'device', k: ['laptop', 'ipad', 'new phone', 'new device', 'computer', 'device request'], a: "Use Device Requests and press '+ New request'. It goes Pending → Approved → Ordered → Done.", to: '/device-requests', label: 'Device Requests', need: 'deviceRequests' },
  { id: 'sign', k: ['signature', 'sign something', 'get someone to sign', 'e-sign', 'esign', 'sign a document', 'work order'], a: "Go to the Signature Directory and press '+ New document'. 'My Queue' shows what's waiting for your signature, and 'Sent by Me' shows what you've sent.", to: '/work-orders', label: 'Signature Directory', need: 'signatures' },

  // Reference pages
  { id: 'emergency', serious: true, k: ['emergency', 'fire', 'injury', 'injured', 'hurt', 'power out', 'power outage', 'robbery', 'flood', 'gas leak', 'accident', 'police', 'ambulance'], a: 'Guests and staff come first, every time. If anyone is in danger, call 911. Then call your direct supervisor. The full steps are on Emergency Procedures.', to: '/emergency', label: 'Emergency Procedures' },
  { id: 'hr', k: ['benefits', 'insurance', 'hr', 'human resources', 'hr forms', 'health insurance', '401k', 'payroll question'], a: 'HR & Insurance has the forms, benefits, and who to talk to.', to: '/hr', label: 'HR & Insurance', need: 'hr' },
  { id: 'preopen', k: ['blank forms', 'templates', 'pre-opening documents', 'pre opening documents', 'preopening'], a: 'Pre-Opening Documents has blank forms and templates for a new location. Each one opens in Drive.', to: '/pre-opening-documents', label: 'Pre-Opening Documents' },
  { id: 'wares', k: ['wares', 'smallwares', 'plates', 'glasses', 'glassware', 'silverware'], a: 'Wares Inventory tracks plates, glasses and smallwares for each location.', to: '/wares-inventory', label: 'Wares Inventory' },
  { id: 'execnotes', k: ['executive notes', 'meeting notes', 'exec notes'], a: 'Executive Notes has the notes from executive meetings, linked to their Drive folder.', to: '/executive-notes', label: 'Executive Notes', need: 'executiveNotes' },
  { id: 'announce', k: ['announcement', 'post an announcement', 'post to everyone', 'tell everyone', 'post an update'], a: "Use '+ New › Post an announcement'. Pick a restaurant, a location or everyone. Turn on 'Post to Home' to pin it on everyone's Home.", to: '/announcements/new', label: 'New announcement', need: 'announcements' },
  { id: 'myspace', k: ['my space', 'my notes', 'private notes'], a: 'My space is your own private area. Only you can see it.', to: '/my-space', label: 'My space' },

  // Profile
  { id: 'name', k: ['change my name', 'edit my name', 'my profile'], a: 'Go to Profile and press Edit.', to: '/profile', label: 'Profile' },
  { id: 'photo', k: ['profile photo', 'profile picture', 'my picture', 'avatar'], a: "Profile photos can't be changed in the Hub right now. Your initial is used instead." },
  { id: 'emails', k: ['emails', 'email setting', 'too many emails', 'fewer emails', 'stop the emails', 'morning email', 'morning summary', 'notifications', 'unsubscribe'], a: "Go to Profile › Email from the Hub. You can pick 'What needs me now, plus one summary' (recommended), 'Only what needs me', 'Everything, as it happens', or 'No emails' (red dots in the Hub only).", to: '/profile', label: 'Profile' },
  { id: 'fivepm', k: ['5pm email', '5 pm email', 'five o clock email', 'summary email'], a: "If anything was assigned to you that day, you get one summary email at 5 PM instead of an email for each item." },
  { id: 'password', k: ['password', 'forgot', "can't log in", 'cant log in', 'reset'], a: "Use 'Forgot password' on the sign-in page. If that doesn't work, ask Brenner." },
  { id: 'signout', k: ['sign out', 'log out', 'logout'], a: 'Go to Profile and press Sign out.', to: '/profile', label: 'Profile' },
  { id: 'deleteacct', k: ['delete my account', 'close my account', 'remove my account'], a: "Go to Profile and press Delete account. It can't be undone.", to: '/profile', label: 'Profile' },

  // Admin
  { id: 'newlogin', admin: true, k: ['new login', 'add a person', 'new hire', 'add someone', 'add a user', 'add an employee'], a: "Manage Logins › '+ New login'. Pick their job and places, and they get a welcome email.", to: '/admin/users', label: 'Manage Logins' },
  { id: 'offboard', admin: true, k: ['someone left', 'turn off a login', 'offboard', 'switch off', 'fired', 'quit', 'leaver', 'remove access'], a: "Manage Logins › open them › Switch off. Their Hub access stops at once. Then follow Offboarding for email, Drive and the back-of-house apps.", to: '/admin/offboarding', label: 'Offboarding' },
  { id: 'whosees', admin: true, k: ['who sees what', 'what can a gm see', 'permissions', 'access matrix'], a: 'Manage Logins › Who sees what shows every job\'s access, page by page.', to: '/admin/users', label: 'Manage Logins' },
  { id: 'viewas', admin: true, k: ['see the hub as', 'view as', 'pretend to be', 'see what they see'], a: "Manage Logins › See the Hub as someone. Nothing you do while viewing as them is saved.", to: '/admin/users', label: 'Manage Logins' },
  { id: 'emailpreview', admin: true, k: ['email preview', 'what emails does the hub send', 'which emails'], a: 'Email preview shows every email the Hub sends, exactly as it arrives, and who gets it.', to: '/admin/email-preview', label: 'Email preview' },
  { id: 'addloc', admin: true, k: ['add a location', 'new location', 'add location'], a: "Open the restaurant and press '+ Add location'." },
  { id: 'accessreq', admin: true, k: ['access requests', 'approve access', 'pending requests'], a: 'Access requests waiting for you are on the Access Requests page.', to: '/access-requests', label: 'Access Requests' },
  { id: 'drivesetup', admin: true, k: ['set up drive', 'drive folders', 'create folders'], a: "Open the location and press 'Set up Drive folders'. It creates every missing folder in the location's Drive and links them." },
  { id: 'connectfolder', admin: true, k: ['connect a folder', 'not linked', 'link a folder', 'folder link'], a: "Open the folder's page and press Connect next to it, then paste the Drive folder's link." },
];

// Folder words: a few extra ways people name the Drive folders. The folder
// names themselves (data/mockData.js categories) are always matched too.
export const FOLDER_WORDS = {
  'Health & Safety Inspection Reports': ['inspection', 'inspections', 'health inspection'],
  'P&L Reports (by month/year)': ['p&l', 'profit'],
  'Recipe Cards & Standards': ['recipe', 'recipes', 'recipe cards'],
  'Current Menus (by location/concept)': ['menu', 'menus', 'current menu'],
  'Employee Schedules': ['schedule', 'schedules', 'employee schedule'],
  'Onboarding Forms': ['onboarding', 'new hire paperwork', 'employee paperwork'],
  'Employee Files': ['employee files', 'personnel'],
  'Repair Requests & Work Orders': ['repair', 'broken', 'maintenance request'],
  'Food & Menu Photography': ['food photos', 'menu photos', 'food pictures'],
  'Interior & Exterior Photos': ['photos', 'pictures', 'building photos'],
  'Toast POS Setup & Notes': ['toast setup', 'pos setup'],
  'Sales Reports & Summaries': ['sales', 'sales report'],
  'Temperature Logs': ['temperature log', 'temp log'],
  'Opening & Closing Checklists': ['checklist pdf'],
  'Permits, Licenses & Certifications': ['license copies', 'permit copies'],
  'Invoices & Vendor Payments': ['invoice', 'invoices'],
  'Training Materials & Guidelines': ['training'],
  'Social Media Content': ['social media', 'instagram', 'facebook'],
  'Equipment Maintenance Logs': ['walk-in', 'walk in', 'cooler', 'freezer', 'ice machine', 'fryer', 'oven', 'dish machine', 'equipment log'],
  'Vendor Contacts (Maintenance)': ['plumber', 'electrician', 'hvac', 'repair guy'],
  'Cleaning Schedules & Checklists': ['cleaning', 'deep clean'],
  'Stock Counts & Audits': ['inventory count', 'stock count'],
  'Purchase Orders': ['purchase order', 'po'],
  'Job Descriptions': ['job description'],
  'Performance Reviews & Feedback': ['review', 'reviews', 'write up', 'write-up'],
};

// ------------------------------------------------------------- personality
// Light and a little funny around the edges; never instead of a real answer,
// never about a person, never near an emergency.
export const JOKES = {
  outside: [
    "Sorry, my wife doesn't let me leave the house. Anything inside the Hub though, I got you.",
    "I'd love to help, but I've never been outside the Hub. I hear it's nice.",
    "That's above my pay grade, and I don't get paid.",
    "Way outside my lane. My lane is the Hub, and I'm very good in my lane.",
    "I don't get out much. Literally. I live in a browser tab.",
    "If it's not in the Hub, it's not in my brain. Small brain, very organised.",
    'I tried googling once. Brenner took my keys away.',
    "My contract says Hub questions only. I didn't read the rest of it.",
    "I'm more of an indoor assistant.",
    "You've confused me with someone who goes outside.",
  ],
  lost: [
    "I've looked under every rug in the Hub and can't find that.",
    "I'm a lot of things, but a mind reader isn't one of them.",
    "Either I don't know that, or you've found a secret room.",
    'I checked the walk-in, the dry storage and behind the ice machine. Nothing.',
    "That's not on any of my checklists, and I have a LOT of checklists.",
    'I searched harder than a server looking for a pen.',
    "I've got nothing. Like a Monday lunch rush.",
    "That one's 86'd, as far as I can tell.",
    'Hmm. Let me pretend I\'m thinking… still nothing.',
  ],
  joke: [
    'Why did the line cook get promoted? He knew how to handle the heat.',
    "I'd tell you a joke about the walk-in, but it's a little cold.",
    "What's a GM's favourite exercise? Running late items.",
    "Why don't eggs tell jokes? They'd crack each other up. Brunch crew knows.",
    "What did the pasta say to the sauce? 'Let's stick together.'",
    'Why did the tomato blush? It saw the salad dressing.',
    "I asked the dishwasher how he was doing. He said 'can't complain, everything just keeps piling up.'",
    'The bartender told me a joke about gin. It was a little dry.',
    'Why do servers make great detectives? They always follow up on the check.',
    'What do you call a fake noodle? An impasta. Not at Taste, though.',
    "I'd make a joke about Greek food, but it might be too cheesy. Feta luck next time.",
    'Why did the steak break up with the grill? Too much heat in the relationship.',
    'How does the temperature log stay so calm? It always keeps its cool. Three times a day.',
    'Why was the POC list so popular? It had all the right contacts.',
    'My favourite food? Bytes. Mostly cookies.',
  ],
  thanks: [
    "Anytime. That's literally all I do.",
    "Happy to help. Go get 'em.",
    "You're welcome. Tell your coworkers.",
    "That's what I'm here for. Also, I can't leave.",
    'Glad I could help. Put it on my tab.',
    'No tip necessary.',
  ],
  rude: [
    "Ouch. Fair, though. Try a couple of key words and I'll redeem myself.",
    "I'll pretend I didn't hear that. What are you trying to find?",
    'Tough crowd. Give me another shot.',
    "Rude. Accurate, maybe, but rude. Try 'Chelsea late' or 'time off'.",
    "I've had worse reviews. Mostly from Brenner. What do you need?",
    "Hey, I'm doing my best with no coffee.",
  ],
  laugh: ['Glad I amuse you.', "I'm here all week. Literally, I can't leave.", 'Ha! Anything else?'],
  ack: ['Got it. Anything else?', "Cool. I'll be here.", 'Sounds good. Holler if you need anything.'],
  sigh: ['Long day? What can I find for you?', "I feel that. What's the problem? Maybe I can help."],
  time: ["It's {time}. Time flies when you're ticking boxes.", "It's {time}. Not that I'm watching the clock."],
  gibberish: ['Bless you.', 'Was that a cat on the keyboard?', "I don't speak keyboard smash yet. Try words?", 'Sounds like a busy Friday night. What do you need?'],
  hello: ['{part}, {first}! What are we finding today?', 'Hey {first}. Ask away.', '{first}! Good to see you. What do you need?'],
  howareyou: ['Living the dream. The dream is mostly checklists.', "Great, thanks. Nothing's late on my end, at least."],
  late: ['Burning the midnight oil? The checklists will still be here in the morning.', "It's late. Ask me your thing, then go to bed."],
  love: ["I'm flattered, but I'm married to the Hub. Also, my wife doesn't let me leave the house."],
  meaning: ['42. Also, there are things on your Home that need you.'],
  who: ["I'm the Hub Guide. I've memorised every page, folder and checklist in the Hub so you don't have to. I'm not a full AI, more like a very organised friend who never leaves the building."],
};

export const OUTSIDE_WORDS = ['weather', 'forecast', 'rain', 'game', 'score', 'football', 'baseball', 'basketball', 'stock', 'stocks', 'news', 'movie', 'traffic', 'president', 'election', 'crypto', 'bitcoin', 'lottery', 'horoscope', 'recipe for', 'how do i make', 'how do you make', 'how to cook', 'translate', 'capital of', 'spell ', 'math', 'calculate', 'song', 'lyrics'];
export const RUDE_WORDS = ['useless', 'dumb', 'stupid', 'idiot', 'trash', 'sucks', 'worst', 'garbage', 'hate you'];
