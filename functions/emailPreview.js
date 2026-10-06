// The admin email preview: every email the Hub sends, drawn by the same
// template code with sample content, plus who gets it and what triggers it.
// "Send me this one" emails the sample to the admin asking.
//
// When a new email is added anywhere in the functions, add it here too, or it
// is the one email nobody can check before it goes out.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { Resend } = require('resend');
const T = require('./emailTemplate');
const { welcomeHtml } = require('./welcomeEmail');
const W = T.WEB_URL;

const n = (o) => T.layout({ ...o, button: { label: o.button, url: W }, urgent: o.urgent ?? true });

const CATALOG = [
  // Requests
  { id: 'timeOff', group: 'Requests', name: 'Time off request', to: 'COO and admins', when: 'Someone asks for time off', speed: 'urgent',
    html: () => n({ kicker: 'Time off', title: 'Steven asked for time off', intro: 'Assistant Manager · Fri Oct 16 – Sun Oct 18', details: [['Dates', 'Fri Oct 16 – Sun Oct 18'], ['Reason', 'Family wedding in Jackson']], button: 'Approve or deny', footer: 'You got this because you approve time off.' }) },
  { id: 'timeOffDecided', group: 'Requests', name: 'Time off decided', to: 'The person who asked', when: 'It is approved or denied', speed: 'urgent',
    html: () => n({ kicker: 'Time off', title: 'Your time off was approved', intro: 'It is on the team calendar.', button: 'See your time off', footer: 'You got this because you asked for time off.' }) },
  { id: 'eventRequest', group: 'Requests', name: 'Event request', to: 'COO and admins', when: 'Someone asks for an event or promo', speed: 'urgent',
    html: () => n({ kicker: 'Event request', title: 'Sarah asked for an event: Wine dinner', intro: 'Taste Ridgeland · Thu, Nov 5, 6:30 PM', details: [['When', 'Thu, Nov 5, 6:30 PM'], ['Where', 'Taste Ridgeland'], ['Guests', '40']], button: 'Approve or deny', footer: 'You got this because you approve event and promo requests.' }) },
  { id: 'accessRequest', group: 'Requests', name: 'Access request', to: 'Admins', when: 'Someone asks for access', speed: 'urgent',
    html: () => n({ kicker: 'Access request', title: 'Conner asked for access', intro: 'To Taste Starkville', button: 'Review the request', footer: 'You got this because you are an admin.' }) },
  { id: 'deviceRequest', group: 'Requests', name: 'Device request', to: 'COO and admins', when: 'Someone asks for a device', speed: 'urgent',
    html: () => n({ kicker: 'Device request', title: 'Kevin asked for a MacBook', intro: 'Taste Starkville — for the new AGM', button: 'Approve or decline', footer: 'You got this because you approve device requests.' }) },
  { id: 'systemsHelp', group: 'Requests', name: 'Systems Help', to: 'IT & Training and admins', when: 'Someone raises a request', speed: 'urgent',
    html: () => n({ kicker: 'Systems Help', title: 'Help needed: Toast', intro: 'From Cassy · The printer on the line is not printing tickets', button: 'Open the request', footer: 'You got this because you handle Systems Help.' }) },
  { id: 'catering', group: 'Requests', name: 'Catering enquiry', to: "That location's GM, Catering & Events and chefs", when: 'An enquiry is forwarded to catering@cigconcepts.com', speed: 'urgent',
    html: () => n({ kicker: 'Catering', title: 'New catering enquiry · Taste Ridgeland', intro: 'Jordan Ellis · Catering for 40', details: [['Name', 'Jordan Ellis'], ['When', 'Sat Oct 24'], ['Guests', '40']], button: 'Claim it', footer: 'You got this because you look after catering at Taste Ridgeland.' }) },
  // Things to do
  { id: 'signature', group: 'To do', name: 'Signature needed', to: 'Each person who must sign', when: 'A document is sent for signature', speed: 'urgent',
    html: () => n({ kicker: 'Signature', title: 'Signature needed: Heritage lease addendum', intro: 'Brenner sent this for your signature.', button: 'Review and sign', footer: 'You got this because you were asked to sign.' }) },
  { id: 'assignment', group: 'To do', name: 'Checklist item assigned', to: 'The person assigned', when: 'An opening checklist item is assigned', speed: 'urgent',
    html: () => n({ kicker: 'Opening checklist', title: 'Assigned to you: POS Setup', intro: 'Due Monday, October 12 · Technology', button: 'Open the checklist', footer: 'You got this because this item was assigned to you.' }) },
  { id: 'renewal', group: 'To do', name: 'Renewal warning', to: "Admins, the COO and that location's GM", when: '60, 30 and 7 days before, and on expiry', speed: 'urgent',
    html: () => n({ kicker: 'Renewal', title: 'Beer Permit expires in 55 days · Blutos Starkville', intro: 'Expires Mon, Nov 30.', details: [['Location', 'Blutos Starkville'], ['Expires', 'Mon, Nov 30']], button: 'Open renewals', footer: 'You got this because you look after renewals for this location.' }) },
  { id: 'tagged', group: 'To do', name: 'Tagged on the calendar', to: 'The people tagged', when: 'Someone tags you on a calendar entry', speed: 'urgent',
    html: () => n({ kicker: 'Calendar', title: 'Health inspection', intro: 'Kevin added this for Tuesday, October 13 — be on site by 9', button: 'See it on the calendar', footer: 'You got this because you were tagged on it.' }) },
  { id: 'message', group: 'To do', name: 'New message', to: 'The conversation', when: 'A message is sent (at most one email per 10 minutes per conversation)', speed: 'urgent',
    html: () => n({ kicker: 'Message', title: 'Message from Ronnie', intro: 'Can you check the Ridgeland schedule before Friday?', button: 'Reply in the Hub', footer: 'You got this because you are in this conversation.' }) },
  // Expenses
  { id: 'cooDaily', group: 'Expenses', name: 'COO daily', to: 'The COO', when: '7am, when receipts came in the day before', speed: 'scheduled',
    html: () => T.layout({ kicker: 'Expenses · daily', title: 'Receipts submitted Monday, Oct 5', intro: '2 receipts totalling $371.28. Any questions, reach out to whoever submitted it.', bodyHtml: T.itemList([{ title: '$319.93 · Ronnie', line: 'Supplies · Starkville, MS · Corporate · "Smallwares for Heritage test kitchen"', url: W, action: 'View receipt', url2: 'mailto:x', action2: 'Email Ronnie' }, { title: '$51.35 · Kevin', line: 'Ground Transport · Jackson, MS · Corporate · "Parking for permit office"', url: W, action: 'View receipt', url2: 'mailto:x', action2: 'Email Kevin' }]), footer: 'You got this because you are COO. For review only - finance works from the period report. Receipt links work for seven days.' }) },
  { id: 'periodReport', group: 'Expenses', name: 'Period report', to: 'Finance and admins', when: 'Saturday after the catch-up week', speed: 'scheduled',
    html: () => T.layout({ kicker: 'Expenses', title: 'Period 10 · FY2026 report is ready', intro: 'Sep 28 – Oct 25. The catch-up week closed Friday, so this is final.', details: [['Receipts', '41'], ['Total', '$4,218.66'], ['Meals', '$1,904.20'], ['Airfare / Travel', '$1,288.40']], button: { label: 'Download the report and photos', url: W }, footer: 'You got this because you are finance. Save a copy - the Hub keeps reports ninety days.' }) },
  { id: 'reminder', group: 'Expenses', name: 'Catch-up reminders', to: 'Everyone who can submit receipts', when: 'Monday and Thursday of the catch-up week', speed: 'urgent',
    html: () => n({ kicker: 'Expenses', title: 'Last day tomorrow for Period 10 · FY2026', intro: 'Receipts from Sep 28 – Oct 25 are due by end of day Friday, Oct 30.', button: 'Add a receipt', footer: 'You got this because you can submit expenses.' }) },
  // Summaries and accounts
  { id: 'summary', group: 'Summaries', name: 'Morning summary', to: 'Everyone on the default email setting', when: '8am, only when there is something', speed: 'scheduled',
    html: () => T.morningSummary({ name: 'Sam', dateLabel: 'Tue, Oct 27', waiting: [{ title: 'Kevin asked for a MacBook', line: 'Taste Starkville', url: W, action: 'Decide' }], groups: [{ heading: 'Posts', items: [{ title: 'New in Financials · Taste Ridgeland', line: 'Mike: Updated the September P&L.', url: W }] }] }) },
  { id: 'welcome', group: 'Accounts', name: 'Welcome', to: 'A new person', when: 'An account is created', speed: 'immediate',
    html: () => welcomeHtml({ name: 'Jordan Ellis', link: W }) },
  { id: 'reset', group: 'Accounts', name: 'Password reset', to: 'The person who asked', when: 'Forgot password, or an admin sends one', speed: 'immediate',
    html: () => T.layout({ kicker: 'Password reset', title: 'Reset your password', intro: 'Jordan, use the button below to choose a new password for your CIG Executive Hub account.', button: { label: 'Set a new password', url: W }, footer: 'This link expires in one hour. If you were not expecting it, you can ignore this email.', settingsLine: false }) },
];

exports.emailPreview = onCall({ secrets: ['RESEND_API_KEY'] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const me = await admin.firestore().collection('users').doc(request.auth.uid).get();
  if (!me.exists || me.data().role !== 'admin') throw new HttpsError('permission-denied', 'Admins only.');

  const { id, send } = request.data ?? {};
  const list = CATALOG.map(({ html, ...rest }) => rest);
  if (!id) return { list };
  const item = CATALOG.find((c) => c.id === id);
  if (!item) throw new HttpsError('not-found', 'No such email.');
  const html = item.html();

  if (send) {
    const to = me.data().email;
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: 'CIG Executive Hub <no-reply@cigconcepts.com>',
      to: [to],
      subject: '[Preview] ' + item.name,
      html,
    });
    if (error) throw new HttpsError('internal', 'Could not send: ' + error.message);
    return { sent: to };
  }
  return { html, item: { ...item, html: undefined } };
});

