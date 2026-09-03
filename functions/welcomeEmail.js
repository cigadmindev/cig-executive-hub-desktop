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
const MAC_DOWNLOAD_URL = 'https://drive.google.com/drive/folders/1W0DfCJQ1lA-iO6thNKtddynxGgzOlJGI';
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

function welcomeHtml({ name, link }) {
  // The Mac and iPhone steps stay defined below but are not rendered - the
  // apps go out separately once the iPhone version is through review. Add
  // them back to the block at the bottom then.
  const webStep = step(2, false, 'Open it in your browser',
    `<a href="${WEB_URL}" style="color:#22D3EE;text-decoration:none;">hub.cigconcepts.com</a> &mdash; nothing to install, works on any computer or phone.`);
  const macStep = step(4, false, 'Install on Mac',
    `<a href="${MAC_DOWNLOAD_URL}" style="color:#22D3EE;text-decoration:none;">Download the desktop app</a>`);
  const iosStep = IOS_DOWNLOAD_URL
    ? step(5, false, 'Install on iPhone', `<a href="${IOS_DOWNLOAD_URL}" style="color:#22D3EE;text-decoration:none;">Get it from the App Store</a>`)
    : step(5, false, 'Install on iPhone', 'Coming soon &mdash; we&rsquo;ll send the link once it&rsquo;s approved.');
  const videoStep = step(3, false, 'Watch the walkthrough',
    `<a href="${TRAINING_VIDEO_URL}" style="color:#22D3EE;text-decoration:none;">See how it works</a> &mdash; about ten minutes, and worth it before you start.`);

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
    <div style="font-family:${F};font-size:14px;line-height:21px;color:#9A9AA6;padding-bottom:22px;">${name ? name + ',<br><br>' : ''}The CIG Executive Hub brings our operations into one place across every brand and location.</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:#22D3EE;border-radius:8px;">
      <a href="${link}" style="display:inline-block;padding:12px 24px;font-family:${F};font-size:14px;font-weight:bold;color:#0A0A0B;text-decoration:none;">Set your password</a>
    </td></tr></table>
    <div style="font-family:${F};font-size:12px;line-height:18px;color:#9A9AA6;padding-top:20px;">If the button doesn&rsquo;t work, paste this into your browser:</div>
    <div style="font-family:${F};font-size:12px;line-height:17px;color:#22D3EE;word-break:break-all;padding-top:5px;">${link}</div>
  `)}

  ${card(`
    ${eyebrow('Getting started')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${step(1, true, 'Set your password', 'Use the button above. The link expires in an hour.')}
      ${webStep}
      ${videoStep}
    </table>
  `)}

  ${card(`
    ${eyebrow("What's inside")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>${feature('Opening checklists', 'Every task, in order')}${feature('Master calendar', 'Across all locations')}</tr>
      <tr>${feature('Permits &amp; renewals', 'Nothing lapses')}${feature('Work orders', 'Request and track')}</tr>
    </table>
  `)}

  <tr><td style="border-top:1px solid #2A2A33;padding-top:18px;font-family:${F};font-size:13px;line-height:20px;color:#9A9AA6;">Something not working? Open <span style="color:#FFFFFF;font-weight:bold;">Support</span> in the app and submit a request &mdash; the team will pick it up.</td></tr>
  <tr><td style="font-family:${F};font-size:11px;line-height:17px;color:#6A6A76;padding-top:12px;">This password link expires in one hour. If it lapses, request a new one from Support.</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

module.exports = { welcomeHtml };
