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

// Same look as every other Hub email (Nov 2026): built on emailTemplate's
// page, cards and button, so it matches the Hub in light and dark.
const T = require('./emailTemplate');
const { F, C } = T;

function step(num, active, title, detail) {
  const bg = active ? C.ink : C.rows;
  const fg = active ? C.inkText : C.soft;
  return `<tr><td style="padding-bottom:16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="28" valign="top" style="width:28px;">
        <div class="${active ? 'hub-mark' : 'hub-rows hub-soft'}" style="width:28px;height:28px;line-height:28px;border-radius:14px;background:${bg};color:${fg};text-align:center;font-family:${F};font-size:13px;font-weight:bold;">${num}</div>
      </td>
      <td width="14" style="width:14px;">&nbsp;</td>
      <td valign="top">
        <div class="hub-txt" style="font-family:${F};font-size:15px;font-weight:bold;color:${C.text};padding:4px 0 3px;">${title}</div>
        <div class="hub-soft" style="font-family:${F};font-size:13px;line-height:19px;color:${C.soft};">${detail}</div>
      </td>
    </tr></table>
  </td></tr>`;
}

// One tile. Each tile is a cell of the row itself, so the two tiles in a
// row are always the same height.
function feature(title, detail) {
  return `<td width="50%" valign="top" class="hub-rows" style="width:50%;background:${C.rows};border-radius:14px;padding:12px 14px;">
    <div class="hub-txt" style="font-family:${F};font-size:14px;font-weight:bold;color:${C.text};padding-bottom:2px;">${title}</div>
    <div class="hub-soft" style="font-family:${F};font-size:12.5px;line-height:17px;color:${C.soft};">${detail}</div>
  </td>`;
}

const card = T.card;
const eyebrow = (text) => T.kickerHtml(text).replace('padding-bottom:8px', 'padding-bottom:14px');
const linkTo = (url, text) => `<a class="hub-link" href="${url}" style="color:${C.accent};font-weight:bold;text-decoration:none;">${text}</a>`;

// What each job uses, for "What you'll use". Plain-words mirror of the
// Who sees what table's defaults (src/data/accessMatrix.js) - when that table
// changes a lot, update this list so new people are told the truth.
const FEATURES = {
  // What everyone has, whatever their job (Nov 2026: more than two, so the
  // general version of this email says what the Hub actually is).
  _base: [
    ['Home', 'Everything waiting on you, in one list'],
    ['Calendar', 'Everything happening, in one place'],
    ['Messages', 'Chat and react with the team'],
    ['Directory', 'People, contacts and every request in one spot'],
    ['Restaurant folders', "Each location's documents, filed in the right place"],
    ['Daily checklists', 'Opening and closing, on screen or printed'],
  ],
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
  // Their job's things first, then everyone's, up to ten - an even number
  // so the two columns line up.
  const own = keys.flatMap((k) => FEATURES[k] ?? []);
  const all = [...own, ...FEATURES._base.filter(([t]) => !own.some(([o]) => o === t))];
  return all.slice(0, 10);
}

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// job and where are optional: an invite re-sent from Manage Logins passes
// them; without them the email is the general version.
function welcomeHtml({ name, link, job = null, where = null }) {
  const first = name ? esc(String(name).split(' ')[0]) : '';
  const webStep = step(2, false, 'Open it in your browser',
    `${linkTo(WEB_URL, 'hub.cigconcepts.com')} &mdash; nothing to install, works on any computer or phone. On a phone, add it to your home screen.`);
  const iosStep = step(3, false, 'Install on iPhone',
    `${linkTo(IOS_DOWNLOAD_URL, 'Get it from the App Store')} and sign in with the same email and password.`);
  const videoStep = step(3, false, 'Watch the walkthrough',
    `${linkTo(TRAINING_VIDEO_URL, 'See how it works')} &mdash; about ten minutes, and worth it before you start.`);
  const feats = featuresFor(job);
  const rows = [];
  for (let i = 0; i < feats.length; i += 2) {
    rows.push('<tr>' + feature(feats[i][0], feats[i][1]) + (feats[i + 1] ? feature(feats[i + 1][0], feats[i + 1][1]) : '<td></td>') + '</tr>');
  }
  const tip = (title, detail) => `<tr><td style="padding-bottom:14px;font-family:${F};">
      <div class="hub-txt" style="font-size:15px;font-weight:bold;color:${C.text};padding-bottom:2px;">${title}</div>
      <div class="hub-soft" style="font-size:13px;line-height:19px;color:${C.soft};">${detail}</div></td></tr>`;
  const who = job
    ? `You&rsquo;ve been set up as <span class="hub-txt" style="color:${C.text};font-weight:bold;">${esc(job)}</span>${where ? ' at <span class="hub-txt" style="color:' + C.text + ';font-weight:bold;">' + esc(where) + '</span>' : ''}. `
    : '';
  return T.shell({
    inner: `
  ${card(`
    ${eyebrow('Welcome')}
    <div class="hub-txt" style="font-family:${F};font-size:24px;line-height:30px;font-weight:800;letter-spacing:-0.4px;color:${C.text};padding-bottom:10px;">Your account is ready</div>
    <div class="hub-soft" style="font-family:${F};font-size:15px;line-height:23px;color:${C.soft};padding-bottom:22px;">${first ? 'Hi ' + first + ',<br><br>' : ''}${who}The CIG Executive Hub brings our operations into one place across every brand and location.</div>
    ${T.button('Set your password', link)}
    <div style="padding-top:20px;">${T.linkFallback(link)}</div>
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
    <div class="hub-soft" style="font-family:${F};font-size:14px;line-height:21px;color:${C.soft};padding-bottom:14px;">The Hub works the same on a computer and a phone, in light or dark mode.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="8" border="0" style="border-collapse:separate;border-spacing:8px;margin:0 -8px;width:calc(100% + 16px);">
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
  `)}`,
    footerHtml: `Something not working? Open <span class="hub-txt" style="color:${C.text};font-weight:bold;">Systems Help</span> in the Directory, or email ${linkTo('mailto:info@cigconcepts.com', 'info@cigconcepts.com')}.<br>This link works until you use it. If you ever need a new password, use &ldquo;Forgot password&rdquo; on the sign-in page.`,
  });
}

module.exports = { welcomeHtml };
