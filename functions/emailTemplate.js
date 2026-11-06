// The one look for every email the Hub sends.
//
// Every email has the same parts, in the same order:
//   header      the CIG mark and "Executive Hub", and a "Needs you" tag when it does
//   kicker      what kind of thing this is - "Time off", "Expenses"
//   title       what happened, in a sentence
//   details     a few label / value rows - who, when, where, how much
//   body        anything longer, already safe to show
//   button      one, to the exact thing
//   footer      why you got this, and where to change it
//
// Look (Nov 2026, Brenner): the same as the Hub itself - a white card with
// round corners on the Hub's cream, the black CIG mark, Figtree where the
// mail app allows it, soft label rows, and the Hub's black pill button.
// Apple Mail and iPhone Mail switch to the Hub's charcoal dark look when the
// device is in dark mode (the @media block below); Gmail and Outlook show the
// light one. Built from tables with the colours on each cell, because Outlook
// draws email with Word and ignores most modern layout.
//
// Anything a person typed goes through esc() before it is placed in an email,
// so a message or a reason can never break the layout.
const WEB_URL = 'https://hub.cigconcepts.com';
const F = "Figtree,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const C = {
  page: '#ECE5D9', card: '#FFFFFF', cardEdge: '#F3EEE6', rows: '#F7F4EF', line: '#ECE7DF',
  text: '#1D1D1F', soft: '#55555B', faint: '#8A8A90', accent: '#0E8A95',
  ink: '#1D1D1F', inkText: '#FFFFFF', amberBg: '#FDF0D2', amber: '#93590D',
};

// Shared head: the Hub's font, both colour schemes, and the dark-mode swaps.
// Classes are only hooks for dark mode; every colour is also inline.
const HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
@media (prefers-color-scheme: dark) {
  .hub-page { background: #22262A !important; }
  .hub-card { background: #2B2D31 !important; border-color: #3A3D42 !important; }
  .hub-txt { color: #F2F4F8 !important; }
  .hub-soft { color: #C5CAD3 !important; }
  .hub-faint { color: #8E96A4 !important; }
  .hub-rows { background: #33363B !important; }
  .hub-rows td, .hub-line { border-color: #3E4147 !important; }
  .hub-btn { background: #F2F4F8 !important; }
  .hub-btn a { color: #17181B !important; }
  .hub-mark { background: #F2F4F8 !important; color: #17181B !important; }
  .hub-kick, .hub-link { color: #7CCFC8 !important; }
  .hub-needs { background: #4A3A1A !important; color: #FEC84B !important; }
}
</style>`;

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function button(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="hub-btn" bgcolor="${C.ink}" style="border-radius:999px;background:${C.ink};">
<a href="${url}" style="display:inline-block;padding:13px 26px;font-family:${F};font-size:15px;font-weight:bold;color:${C.inkText};text-decoration:none;border-radius:999px;">${esc(label)}</a>
</td></tr></table>`;
}

function detailRows(details) {
  if (!details || !details.length) return '';
  const cell = (i) => (i ? `border-top:1px solid ${C.line};` : '');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="hub-rows" style="margin:6px 0 24px;background:${C.rows};border-radius:16px;">${details
    .map(
      ([k, v], i) => `<tr>
<td class="hub-faint" style="font-family:${F};font-size:13px;color:${C.faint};padding:12px 16px 12px 18px;width:96px;vertical-align:top;${cell(i)}">${esc(k)}</td>
<td class="hub-txt" style="font-family:${F};font-size:15px;font-weight:600;color:${C.text};padding:12px 18px 12px 0;vertical-align:top;${cell(i)}">${esc(v)}</td></tr>`
    )
    .join('')}</table>`;
}

// The page around the content: cream, the CIG mark and name on top, the
// footer below. inner is the card (or cards).
function shell({ urgent = false, inner, footerHtml }) {
  return `<!DOCTYPE html><html><head>${HEAD}</head>
<body class="hub-page" style="margin:0;padding:0;background:${C.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="hub-page" style="background:${C.page};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
<tr><td style="padding:0 6px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td width="34" style="width:34px;"><div class="hub-mark" style="width:34px;height:34px;line-height:34px;border-radius:11px;background:${C.ink};color:${C.inkText};text-align:center;font-family:${F};font-size:11px;font-weight:800;letter-spacing:0.3px;">CIG</div></td>
  <td class="hub-txt" style="font-family:${F};font-size:15px;font-weight:bold;color:${C.text};padding-left:10px;">Executive Hub</td>
  ${urgent ? `<td align="right"><span class="hub-needs" style="font-family:${F};font-size:12px;font-weight:bold;color:${C.amber};background:${C.amberBg};border-radius:999px;padding:6px 12px;">Needs you</span></td>` : ''}
  </tr></table>
</td></tr>
${inner}
<tr><td class="hub-faint" style="font-family:${F};font-size:12px;line-height:18px;color:${C.faint};padding:18px 10px 0;">${footerHtml}</td></tr>
</table></td></tr></table></body></html>`;
}

// One white card, then a small gap.
function card(innerHtml) {
  return `<tr><td class="hub-card" style="background:${C.card};border:1px solid ${C.cardEdge};border-radius:24px;padding:30px 30px 32px;">${innerHtml}</td></tr>
<tr><td style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
}

// The small teal label above a title.
const kickerHtml = (text) => `<div class="hub-kick" style="font-family:${F};font-size:13px;font-weight:bold;color:${C.accent};padding-bottom:8px;">${esc(text)}</div>`;

// One email. bodyHtml is trusted markup built by the caller from esc()'d parts.
function layout({ urgent = false, kicker, title, intro, details, bodyHtml = '', button: btn, footer, settingsLine = true }) {
  const inner = `${kickerHtml(kicker)}
  <div class="hub-txt" style="font-family:${F};font-size:24px;line-height:30px;font-weight:800;letter-spacing:-0.4px;color:${C.text};padding-bottom:${intro ? 8 : 18}px;">${esc(title)}</div>
  ${intro ? `<div class="hub-soft" style="font-family:${F};font-size:15px;line-height:23px;color:${C.soft};padding-bottom:20px;">${esc(intro)}</div>` : ''}
  ${detailRows(details)}
  ${bodyHtml}
  ${btn ? `<div style="padding-top:${bodyHtml ? 22 : 2}px;">${button(btn.label, btn.url)}</div>` : ''}`;
  return shell({
    urgent,
    inner: `<tr><td class="hub-card" style="background:${C.card};border:1px solid ${C.cardEdge};border-radius:24px;padding:30px 30px 32px;">${inner}</td></tr>`,
    footerHtml: `${footer ? esc(footer) + '<br>' : ''}${settingsLine ? 'Change which emails you get under Notifications in your profile. ' : ''}Replies to this address are not read.`,
  });
}

// "If the button does not work, paste this" - small print with the link.
function linkFallback(url) {
  return `<div class="hub-faint" style="font-family:${F};font-size:13px;line-height:20px;color:${C.faint};">If the button does not work, paste this into your browser:<br><span class="hub-link" style="color:${C.accent};word-break:break-all;">${esc(url)}</span></div>`;
}

// A list of items, each a title, a line, and a link - used by the morning
// summary and anything else that lists several things.
function itemList(items) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items
    .map(
      (it) => `<tr><td class="hub-line" style="border-top:1px solid ${C.line};padding:13px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:top;">
<div class="hub-txt" style="font-family:${F};font-size:15px;font-weight:bold;color:${C.text};">${esc(it.title)}</div>
${it.line ? `<div class="hub-soft" style="font-family:${F};font-size:13px;line-height:19px;color:${C.soft};padding-top:3px;">${esc(it.line)}</div>` : ''}
</td>
${it.url ? `<td align="right" style="vertical-align:top;white-space:nowrap;padding-left:12px;"><a class="hub-link" href="${it.url}" style="font-family:${F};font-size:13px;font-weight:bold;color:${C.accent};text-decoration:none;">${esc(it.action ?? 'Open')} &rarr;</a>${it.url2 ? `<br><a class="hub-soft" href="${it.url2}" style="font-family:${F};font-size:12px;line-height:22px;color:${C.soft};text-decoration:none;">${esc(it.action2 ?? 'Open')}</a>` : ''}</td>` : ''}
</tr></table></td></tr>`
    )
    .join('')}</table>`;
}

function section(heading, count, inner) {
  return `<div class="hub-faint" style="font-family:${F};font-size:13px;font-weight:bold;color:${C.faint};padding:18px 0 6px;">${esc(heading)}${count != null ? ` &middot; ${count}` : ''}</div>${inner}`;
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

module.exports = { WEB_URL, F, C, esc, layout, itemList, section, morningSummary, button, shell, card, kickerHtml, linkFallback };
