// New-account email. Deliberately separate from the password-reset template:
// a first login is the one moment someone actually reads about what the app
// does and where to get it.
//
// Everything here is nested tables with explicit per-cell backgrounds. Outlook
// renders with Word's engine and ignores flexbox and grid entirely, and
// several clients won't inherit a dark background. The numbered squares and
// left accent bars are table cells rather than images because email clients
// block remote images by default — real icons can layer in later once there's
// a public asset host.
const IOS_DOWNLOAD_URL = 'https://apps.apple.com/app/id6790941894';
// Folder rather than a single file, so one link serves both the manager and
// the executive walkthrough. The /u/0/ prefix is deliberately absent - it
// forces whichever Google account signed in first and breaks for anyone with
// more than one.
const TRAINING_VIDEO_URL = 'https://drive.google.com/file/d/1PheYqqLZlmMl5f7y8UIKqU7R9mGkj4LG/view';
const WEB_URL = 'https://hub.cigconcepts.com';

const F = 'Helvetica,Arial,sans-serif';

function step(num, active, title, detail) {
  const bg = active ? '#22D3EE' : '#2A2A33';
  const fg = active ? '#0A0A0B' : '#9A9AA6';
  return `<tr><td style="padding-bottom:16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="26" valign="top" style="width:26px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="26" height="26" align="center" style="width:26px;height:26px;background-color:${bg};border-radius:4px;font-family:${F};font-size:13px;font-weight:bold;color:${fg};line-height:26px;">${num}</td>
        </tr></table>
      </td>
      <td width="14" style="width:14px;">&nbsp;</td>
      <td valign="top">
        <div style="font-family:${F};font-size:14px;font-weight:bold;color:#FFFFFF;padding-bottom:3px;">${title}</div>
        <div style="font-family:${F};font-size:13px;line-height:19px;color:#9A9AA6;">${detail}</div>
      </td>
    </tr></table>
  </td></tr>`;
}

function feature(title, detail) {
  return `<td width="50%" valign="top" style="width:50%;padding:0 10px 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td width="2" style="width:2px;background-color:#22D3EE;font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding-left:10px;">
        <div style="font-family:${F};font-size:13px;font-weight:bold;color:#FFFFFF;">${title}</div>
        <div style="font-family:${F};font-size:12px;line-height:17px;color:#9A9AA6;">${detail}</div>
      </td>
    </tr></table>
  </td>`;
}

function card(inner) {
  return `<tr><td style="background-color:#1C1C22;border:1px solid #2A2A33;border-radius:10px;padding:26px;">${inner}</td></tr>
  <tr><td style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
}

function eyebrow(text) {
  return `<div style="font-family:${F};font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#22D3EE;padding-bottom:14px;">${text}</div>`;
}

// What each job uses, for "What you'll use". Plain-words mirror of the
// Who sees what table's defaults (src/data/accessMatrix.js) - when that table
// changes a lot, update this list so new people are told the truth.
const FEATURES = {
  _base: [['Calendar', 'Everything happening, in one place'], ['Messages', 'Chat with the team']],
  approve: [['Approvals', 'Time off, events and devices waiting on you']],
  team: [['Availability', 'Your hours, time off, and your team']],
  own: [['Availability', 'Your usual hours and time off']],
  expenses: [['Expenses', 'Photograph a receipt, done']],
  financeAll: [['Expense reports', 'Each period, with every receipt photo']],
  catering: [['Catering', 'Enquiries for your location — claim and run them']],
  checklist: [['Opening checklists', 'Every task to open a new restaurant']],
  renewals: [['Permits & renewals', 'Warned before anything lapses']],
  signatures: [['Signature Directory', 'Documents to sign, signed in the Hub']],
  systems: [['Systems Help', 'IT requests — you answer them']],
  marketing: [['Marketing folders', 'Photos, menus and brand material']],
  dates: [['Opening dates', 'When each new restaurant opens']],
};
const JOB_FEATURES = {
  'Owner': ['team', 'checklist', 'renewals', 'signatures', 'expenses'], 'CEO': ['team', 'checklist', 'renewals', 'signatures', 'expenses'],
  'COO': ['approve', 'checklist', 'renewals', 'signatures', 'expenses'], 'Financials': ['financeAll', 'team', 'dates', 'signatures'],
  'Culinary Director': ['checklist', 'team', 'expenses', 'signatures'], 'Culinary Manager': ['checklist', 'team', 'expenses', 'signatures'],
  'Beverage Manager': ['checklist', 'team', 'expenses', 'signatures'], 'General Manager': ['team', 'catering', 'renewals', 'expenses', 'signatures'],
  'Assistant Manager': ['own', 'catering', 'expenses', 'signatures', 'dates'], 'Kitchen Manager': ['own', 'checklist', 'expenses', 'signatures'],
  'Executive Chef': ['own', 'catering', 'expenses', 'signatures', 'dates'], 'Sous Chef': ['own', 'expenses', 'signatures', 'dates'],
  'Catering & Events': ['own', 'catering', 'expenses', 'signatures', 'dates'], 'IT & Training': ['systems', 'team', 'renewals', 'signatures', 'catering'],
  'Marketing': ['marketing', 'dates'], 'Communications': ['marketing', 'dates'], 'Videographer': ['marketing', 'dates', 'signatures'],
  'HR': ['team', 'expenses', 'signatures'], 'Real Estate': ['dates', 'renewals', 'expenses'],
};
function featuresFor(job) {
  const keys = JOB_FEATURES[job] ?? [];
  return [...FEATURES._base, ...keys.flatMap((k) => FEATURES[k] ?? [])].slice(0, 8);
}

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// job and where are optional: an invite re-sent from Manage Logins passes
// them; without them the email is the general version.
function welcomeHtml({ name, link, job = null, where = null }) {
  const first = name ? esc(String(name).split(' ')[0]) : '';
  const webStep = step(2, false, 'Open it in your browser',
    `<a href="${WEB_URL}" style="color:#22D3EE;text-decoration:none;">hub.cigconcepts.com</a> &mdash; nothing to install, works on any computer or phone. On a phone, add it to your home screen.`);
  const iosStep = step(3, false, 'Install on iPhone',
    `<a href="${IOS_DOWNLOAD_URL}" style="color:#22D3EE;text-decoration:none;">Get it from the App Store</a> and sign in with the same email and password.`);
  const videoStep = step(3, false, 'Watch the walkthrough',
    `<a href="${TRAINING_VIDEO_URL}" style="color:#22D3EE;text-decoration:none;">See how it works</a> &mdash; about ten minutes, and worth it before you start.`);
  const feats = featuresFor(job);
  const rows = [];
  for (let i = 0; i < feats.length; i += 2) {
    rows.push('<tr>' + feature(feats[i][0], feats[i][1]) + (feats[i + 1] ? feature(feats[i + 1][0], feats[i + 1][1]) : '<td></td>') + '</tr>');
  }
  const tip = (title, detail) => `<tr><td style="padding-bottom:12px;font-family:${F};">
      <div style="font-size:14px;font-weight:bold;color:#FFFFFF;padding-bottom:2px;">${title}</div>
      <div style="font-size:13px;line-height:19px;color:#9A9AA6;">${detail}</div></td></tr>`;
  const who = job
    ? `You&rsquo;ve been set up as <span style="color:#FFFFFF;font-weight:bold;">${esc(job)}</span>${where ? ' at <span style="color:#FFFFFF;font-weight:bold;">' + esc(where) + '</span>' : ''}. `
    : '';
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
</head>
<body style="margin:0;padding:0;background-color:#0A0A0B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0A0A0B;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">

  <tr><td style="font-family:${F};font-size:19px;font-weight:bold;letter-spacing:-0.4px;text-transform:uppercase;color:#FFFFFF;padding-bottom:11px;">CIG Executive Hub</td></tr>
  <tr><td style="padding-bottom:26px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="48" height="3" style="width:48px;height:3px;background-color:#22D3EE;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>

  ${card(`
    ${eyebrow('Welcome')}
    <div style="font-family:${F};font-size:22px;font-weight:bold;letter-spacing:-0.4px;text-transform:uppercase;color:#FFFFFF;padding-bottom:12px;">Your account is ready</div>
    <div style="font-family:${F};font-size:14px;line-height:21px;color:#9A9AA6;padding-bottom:22px;">${first ? 'Hi ' + first + ',<br><br>' : ''}${who}The CIG Executive Hub brings our operations into one place across every brand and location.</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:#22D3EE;border-radius:8px;">
      <a href="${link}" style="display:inline-block;padding:12px 24px;font-family:${F};font-size:14px;font-weight:bold;color:#0A0A0B;text-decoration:none;">Set your password</a>
    </td></tr></table>
    <div style="font-family:${F};font-size:12px;line-height:18px;color:#9A9AA6;padding-top:20px;">If the button doesn&rsquo;t work, paste this into your browser:</div>
    <div style="font-family:${F};font-size:12px;line-height:17px;color:#22D3EE;word-break:break-all;padding-top:5px;">${link}</div>
  `)}

  ${card(`
    ${eyebrow('Getting started')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${step(1, true, 'Set your password', 'Use the button above. The link works until you use it.')}
      ${webStep}
      ${videoStep}
    </table>
  `)}

  ${card(`
    ${eyebrow(job ? "What you'll use" : "What's inside")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${rows.join('')}
    </table>
  `)}

  ${card(`
    ${eyebrow('Your first week')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${tip('Set your usual hours', 'In Availability. Do it once &mdash; it carries forward every week.')}
      ${tip('Check &ldquo;Needs you&rdquo; on Home', 'Anything waiting on you shows up there, and clears when it&rsquo;s done.')}
      ${tip('Choose your emails', 'Profile &rarr; Notifications: everything, urgent only, or a morning summary.')}
    </table>
  `)}

  <tr><td style="border-top:1px solid #2A2A33;padding-top:18px;font-family:${F};font-size:13px;line-height:20px;color:#9A9AA6;">Something not working? Open <span style="color:#FFFFFF;font-weight:bold;">Systems Help</span> in the Directory, or email <a href="mailto:info@cigconcepts.com" style="color:#22D3EE;text-decoration:none;">info@cigconcepts.com</a>.</td></tr>
  <tr><td style="font-family:${F};font-size:11px;line-height:17px;color:#6A6A76;padding-top:12px;">This link works until you use it. If you ever need a new password, use &ldquo;Forgot password&rdquo; on the sign-in page.</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

module.exports = { welcomeHtml };
