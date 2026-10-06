// The one look for every email the Hub sends.
//
// Every email has the same parts, in the same order:
//   header      CIG EXECUTIVE HUB, and a "Needs you" tag when it does
//   kicker      what kind of thing this is - "Time off", "Expenses"
//   title       what happened, in a sentence
//   details     a few label / value rows - who, when, where, how much
//   body        anything longer, already safe to show
//   button      one, to the exact thing
//   footer      why you got this, and where to change it
//
// Anything a person typed goes through esc() before it is placed in an email,
// so a message or a reason can never break the layout.
const WEB_URL = 'https://hub.cigconcepts.com';
const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const C = {
  page: '#0A0A0B', card: '#16161A', line: '#26262D', text: '#FFFFFF', soft: '#B4B4BB', faint: '#6C6C76',
  accent: '#22D3EE', amberBg: '#3A2A0E', amber: '#E8B93B',
};

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function button(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.accent}" style="border-radius:8px;">
<a href="${url}" style="display:inline-block;padding:12px 22px;font-family:${F};font-size:14px;font-weight:bold;color:#0A0A0B;text-decoration:none;">${esc(label)}</a>
</td></tr></table>`;
}

function detailRows(details) {
  if (!details || !details.length) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px;">${details
    .map(
      ([k, v]) => `<tr>
<td style="font-family:${F};font-size:13px;color:${C.faint};padding:7px 16px 7px 0;width:110px;vertical-align:top;border-top:1px solid ${C.line};">${esc(k)}</td>
<td style="font-family:${F};font-size:14px;color:${C.text};padding:7px 0;vertical-align:top;border-top:1px solid ${C.line};">${esc(v)}</td></tr>`
    )
    .join('')}</table>`;
}

// One email. bodyHtml is trusted markup built by the caller from esc()'d parts.
function layout({ urgent = false, kicker, title, intro, details, bodyHtml = '', button: btn, footer, settingsLine = true }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;padding:0;background:${C.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
<tr><td style="padding-bottom:16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td style="font-family:${F};font-size:12px;font-weight:bold;letter-spacing:1.6px;color:${C.text};">CIG EXECUTIVE HUB</td>
  ${urgent ? `<td align="right"><span style="font-family:${F};font-size:11px;font-weight:bold;letter-spacing:0.8px;color:${C.amber};background:${C.amberBg};border-radius:5px;padding:5px 9px;">NEEDS YOU</span></td>` : ''}
  </tr></table>
</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-top:3px solid ${urgent ? C.amber : C.accent};border-radius:10px;padding:28px 28px 30px;">
  <div style="font-family:${F};font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${urgent ? C.amber : C.accent};padding-bottom:10px;">${esc(kicker)}</div>
  <div style="font-family:${F};font-size:21px;line-height:28px;font-weight:bold;color:${C.text};padding-bottom:${intro ? 8 : 16}px;">${esc(title)}</div>
  ${intro ? `<div style="font-family:${F};font-size:15px;line-height:23px;color:${C.soft};padding-bottom:18px;">${esc(intro)}</div>` : ''}
  ${detailRows(details)}
  ${bodyHtml}
  ${btn ? `<div style="padding-top:${bodyHtml ? 22 : 4}px;">${button(btn.label, btn.url)}</div>` : ''}
</td></tr>
<tr><td style="font-family:${F};font-size:12px;line-height:18px;color:${C.faint};padding:18px 4px 0;">
${footer ? esc(footer) + '<br>' : ''}${settingsLine ? 'Change which emails you get under Notifications in your profile. ' : ''}Replies to this address are not read.
</td></tr>
</table></td></tr></table></body></html>`;
}

// A list of items, each a title, a line, and a link - used by the morning
// summary and anything else that lists several things.
function itemList(items) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items
    .map(
      (it) => `<tr><td style="border-top:1px solid ${C.line};padding:12px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:top;">
<div style="font-family:${F};font-size:15px;font-weight:bold;color:${C.text};">${esc(it.title)}</div>
${it.line ? `<div style="font-family:${F};font-size:13px;line-height:19px;color:${C.soft};padding-top:3px;">${esc(it.line)}</div>` : ''}
</td>
${it.url ? `<td align="right" style="vertical-align:top;white-space:nowrap;padding-left:12px;"><a href="${it.url}" style="font-family:${F};font-size:13px;font-weight:bold;color:${C.accent};text-decoration:none;">${esc(it.action ?? 'Open')} &rarr;</a>${it.url2 ? `<br><a href="${it.url2}" style="font-family:${F};font-size:12px;line-height:22px;color:${C.soft};text-decoration:none;">${esc(it.action2 ?? 'Open')}</a>` : ''}</td>` : ''}
</tr></table></td></tr>`
    )
    .join('')}</table>`;
}

function section(heading, count, inner) {
  return `<div style="font-family:${F};font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${C.faint};padding:18px 0 6px;">${esc(heading)}${count != null ? ` &middot; ${count}` : ''}</div>${inner}`;
}

// The 8am summary: what is waiting on you, then what happened, grouped.
function morningSummary({ name, dateLabel, waiting, groups }) {
  const parts = [];
  if (waiting.length) parts.push(section('Waiting on you', waiting.length, itemList(waiting)));
  for (const g of groups) parts.push(section(g.heading, g.items.length, itemList(g.items)));
  const total = waiting.length + groups.reduce((s, g) => s + g.items.length, 0);
  return layout({
    urgent: waiting.length > 0,
    kicker: 'Morning summary · ' + dateLabel,
    title: 'Good morning' + (name ? ', ' + name.split(' ')[0] : ''),
    intro: waiting.length
      ? waiting.length + (waiting.length === 1 ? ' thing is' : ' things are') + ' waiting on you, and ' + (total - waiting.length) + ' since yesterday.'
      : 'Nothing is waiting on you. Here is what happened since yesterday.',
    bodyHtml: parts.join(''),
    button: { label: 'Open the Hub', url: WEB_URL },
    footer: 'Sent at 8am when there is something to tell you, never when there is not.',
  });
}

module.exports = { WEB_URL, esc, layout, itemList, section, morningSummary, button };
