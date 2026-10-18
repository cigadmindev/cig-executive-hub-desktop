// Printed documents from the Hub, in the CIG Concepts look (18 Oct 2026):
// Poppins, black text, burgundy eyebrow and section labels, a square-cornered
// double-line frame inset from the page edge, and "CIG Concepts" bottom left
// with the document type bottom right. Same family as the PDFs the server
// draws (functions/cigPdf.js).
//
//   printPocSheet       Operational POC       one-page chart style
//   printOpeningSheet   Opening checklist     outline style, as many pages as it needs
//   printDailySheets    Daily lists to post   SOP style, one page per list
//
// Each opens in a new tab with the print dialog; "Save as PDF" makes the PDF.
// Pages are real Letter pages, filled in the browser: a section that will
// not fit carries on overleaf under "(continued)".
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// ---- Icons: simple line drawings on a 24x24 grid ----
const ICONS = {
  box: '<rect x="4" y="8" width="16" height="12" rx="1"/><path d="M3 8h18V5H3z"/><path d="M10 12h4"/>',
  thermo: '<path d="M10 4h4v10.5a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>',
  cooler: '<rect x="6" y="3" width="12" height="18" rx="1.5"/><path d="M6 10h12"/><path d="M9 6v2M9 13v3"/>',
  flame: '<path d="M12 3c3 4 6 6.5 6 10.5a6 6 0 0 1-12 0c0-2.5 1.5-4 3-5.5 0 2 1 3 2 3 0-3-1-5 1-8z"/>',
  board: '<rect x="4" y="6" width="13" height="14" rx="1.5"/><path d="M17 11h3v4h-3"/><path d="M8 10h5M8 14h5"/>',
  dish: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  pizza: '<path d="M12 21L4 6c5-2.5 11-2.5 16 0z"/><circle cx="11" cy="10" r="1"/><circle cx="14" cy="13" r="1"/>',
  trash: '<path d="M5 7h14"/><path d="M9 7V4h6v3"/><path d="M7 7l1 13h8l1-13"/><path d="M10 11v6M14 11v6"/>',
  floor: '<path d="M14 3l-4 10"/><path d="M6 13h8l2 7H4z"/><path d="M8 16v4M12 16v4"/>',
  check: '<rect x="5" y="4" width="14" height="17" rx="1.5"/><path d="M9 3h6v3H9z"/><path d="M8.5 13l2.5 2.5 4.5-5"/>',
  glass: '<path d="M7 3h10l-1 8a4 4 0 0 1-8 0z"/><path d="M12 15v5M8 21h8"/>',
  door: '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M14 12h1"/>',
  light: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  sign: '<rect x="3" y="5" width="18" height="10" rx="1"/><path d="M12 15v6M8 21h8"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="1"/><path d="M8 21h8M12 17v4"/>',
  shield: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/>',
  soda: '<path d="M7 7h10l-1.5 14h-7z"/><path d="M12 7l2-4h3"/><path d="M7.5 11h9"/>',
  bank: '<path d="M3 9l9-5 9 5z"/><path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9"/><path d="M3 20h18"/>',
  kitchen: '<rect x="4" y="4" width="16" height="16" rx="1"/><circle cx="9" cy="9" r="2"/><circle cx="15" cy="9" r="2"/><path d="M4 14h16"/>',
  car: '<path d="M4 16v-4l2-5h12l2 5v4z"/><path d="M4 16v3h3v-3M17 16v3h3v-3"/><path d="M4 12h16"/>',
  water: '<path d="M12 3c3 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-6.5 6-11z"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  truck: '<path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
  wrench: '<path d="M14 6a4 4 0 0 0 5 5l-8 8a2 2 0 0 1-3-3l8-8a4 4 0 0 0-2-2z"/>',
  bug: '<rect x="8" y="7" width="8" height="12" rx="4"/><path d="M12 7V4M8 11H4M8 15H4M16 11h4M16 15h4"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M9 7l1.5-3h3L15 7"/>',
  gift: '<rect x="4" y="9" width="16" height="12"/><path d="M3 9h18V6H3zM12 6v15"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/>',
  people: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.5 3-5 6-5s6 1.5 6 5M15 15c3 0 6 1 6 4"/>',
};
const ICON_WORDS = [
  [/sign\b|signage/i, 'sign'], [/music/i, 'music'], [/tv/i, 'tv'], [/alarm|security|background/i, 'shield'],
  [/soda|co2|beverage|beer|wine|liquor|bar|glass|drink/i, 'glass'], [/bank|accounting|payroll|armored|insurance|workers comp|tax/i, 'bank'],
  [/kitchen package|dish machine/i, 'kitchen'], [/valet|car\b/i, 'car'], [/water|plumb|grease trap/i, 'water'],
  [/social|phone|pos|toast|rep\b/i, 'phone'], [/vendor|produce|linen|delivery|staffing/i, 'truck'],
  [/hvac|hood|electric|locksmith|maintenance|repair|equipment|power/i, 'wrench'], [/pest/i, 'bug'],
  [/photo|video/i, 'camera'], [/gift/i, 'gift'], [/property|landlord|key/i, 'key'], [/hiring|training|role|staff|team|guest|manager|server/i, 'people'],
  [/stor|label|dating|stock|to-go|supplies|box/i, 'box'], [/cooling|temp/i, 'thermo'], [/cooler|walk-in|reach-in|fridge/i, 'cooler'],
  [/line|grill|fryer|oven|stove/i, 'flame'], [/cutting|board|station|prep/i, 'board'], [/dish|sink/i, 'dish'], [/pizza/i, 'pizza'],
  [/trash|garbage/i, 'trash'], [/floor|mop|sweep|rug/i, 'floor'], [/window|decor|light/i, 'light'], [/door|entrance|host|front/i, 'door'],
  [/file|form|menu|paper|material/i, 'doc'], [/walk-through|final|verify|check/i, 'check'],
];
const iconFor = (name) => (ICON_WORDS.find(([re]) => re.test(name ?? '')) ?? [null, 'check'])[1];
const svg = (name, size = 17) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="#7A1F2B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ICONS.check}</svg>`;
const badge = (name, size = 34, icon = 17) => `<span class="badge" style="width:${size}px;height:${size}px">${svg(name, icon)}</span>`;

// ---- The shared page ----
const FONT = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>';
const CSS = `
  @page { size: letter; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Poppins', 'Liberation Sans', Arial, sans-serif; color: #000; background: #E9E9EC; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .bar { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #111; color: #fff; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; }
  .bar span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar button { flex-shrink: 0; background: #22D3EE; color: #0A0A0B; border: 0; border-radius: 8px; padding: 9px 16px; font-weight: 800; font-size: 13px; cursor: pointer; }
  .pages { padding: 16px 0 40px; }
  .page { width: 8.5in; height: 11in; padding: 0.42in; background: #fff; margin: 0 auto 18px; box-shadow: 0 6px 30px rgba(0,0,0,.18); overflow: hidden; break-after: page; }
  .page:last-child { break-after: auto; }
  .frame { position: relative; height: 100%; border: 2.5px solid #1a1a1a; padding: 30px 36px 24px; display: flex; flex-direction: column; }
  .frame::before { content: ''; position: absolute; inset: 7px; border: 1px solid #1a1a1a; pointer-events: none; }
  .content { flex: 1; min-height: 0; overflow: hidden; }
  .fit { transform-origin: top left; }
  .eyebrow { text-align: center; font-weight: 700; font-size: 10.5px; letter-spacing: 2.6px; text-transform: uppercase; color: #7A1F2B; margin: 4px 0 6px; }
  h1 { text-align: center; font-weight: 700; font-size: 28px; line-height: 1.15; margin: 0; }
  .subtitle { text-align: center; font-weight: 400; font-size: 12px; margin: 5px 0 0; }
  .divider { width: 110px; height: 3px; background: #7A1F2B; margin: 12px auto; }
  .lede { text-align: center; font-weight: 300; font-size: 11px; line-height: 1.55; margin: 0 auto 14px; max-width: 6.2in; }
  .cont { text-align: center; font-weight: 300; font-size: 9.5px; margin: -2px 0 12px; }
  .badge { border-radius: 50%; background: #F4E7E9; border: 1px solid #7A1F2B; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .footer { margin-top: 10px; border-top: 1px solid #d8d8d8; padding-top: 7px; display: flex; justify-content: space-between; font-size: 9px; }
  .footer b { font-weight: 700; letter-spacing: .6px; }
  .stitle { font-weight: 700; font-size: 11px; letter-spacing: 1.8px; text-transform: uppercase; color: #7A1F2B; border-bottom: 1.5px solid #1a1a1a; padding-bottom: 4px; margin: 0; display: flex; justify-content: space-between; align-items: baseline; break-after: avoid; }
  .stitle span { color: #000; font-weight: 400; letter-spacing: .3px; text-transform: none; font-size: 9.5px; }
  .gap { height: 16px; }
  @media print { body { background: #fff; } .bar { display: none; } .pages { padding: 0; } .page { margin: 0; box-shadow: none; } }
`;

// Fills the pages in the new tab. Each document is a list of blocks: a
// section heading (data-sec) or a row. When a row will not fit, a new page
// starts - repeating the section heading with "(continued)" - and a heading
// is never left alone at the foot of a page. data-fit documents stay on one
// page and are scaled down to fit instead.
const PAGINATE = `<script>
function build() {
  var docs = JSON.parse(document.getElementById('docs').textContent);
  var root = document.querySelector('.pages');
  root.innerHTML = '';
  docs.forEach(function (doc) {
    var pages = [];
    function page(first) {
      var p = document.createElement('div');
      p.className = 'page';
      p.innerHTML = '<div class="frame"><div class="head">' + (first ? doc.head : doc.cont) + '</div><div class="content"><div class="fit"></div></div><div class="footer"><b>CIG Concepts</b><span class="cat"></span></div></div>';
      root.appendChild(p);
      pages.push(p);
      return p.querySelector('.fit');
    }
    var box = page(true);
    var content = function () { return box.parentNode; };
    var over = function () { return box.scrollHeight > content().clientHeight + 1; };
    var tmp = document.createElement('div');
    var sec = null, secRowCount = 0;
    doc.blocks.forEach(function (html) {
      tmp.innerHTML = html;
      var el = tmp.firstElementChild;
      var isSec = el.hasAttribute('data-sec');
      if (isSec) { sec = el; secRowCount = 0; }
      box.appendChild(el);
      if (doc.fit || !over()) { if (!isSec) secRowCount++; return; }
      box.removeChild(el);
      // A heading with nothing under it yet moves with the row.
      var last = box.lastElementChild;
      var moveHead = !isSec && last && last.hasAttribute('data-sec');
      if (moveHead) box.removeChild(last);
      box = page(false);
      if (isSec) { box.appendChild(el); return; }
      if (sec && !moveHead && secRowCount > 0) {
        var c = sec.cloneNode(true);
        var t = c.querySelector('[data-name]');
        if (t) t.textContent = t.textContent + ' (continued)';
        var r = c.querySelector('[data-right]');
        if (r) r.textContent = '';
        box.appendChild(c);
      } else if (moveHead) box.appendChild(last);
      box.appendChild(el);
      secRowCount++;
    });
    if (doc.fit) {
      var b = pages[0].querySelector('.fit'), avail = b.parentNode.clientHeight;
      var k = Math.min(1, avail / b.scrollHeight);
      if (k < 1) { b.style.transform = 'scale(' + k + ')'; b.style.width = (100 / k) + '%'; }
    }
    pages.forEach(function (p, i) {
      p.querySelector('.cat').textContent = doc.category + (pages.length > 1 ? ' \\u00b7 Page ' + (i + 1) + ' of ' + pages.length : '');
    });
  });
  // On a phone the preview is scaled to the screen; printing is unaffected.
  var pg = document.querySelector('.page'); var full = (pg ? pg.offsetWidth : 8.5 * 96) + 32;
  var k = Math.min(1, Math.min(window.innerWidth, screen.width || window.innerWidth) / full);
  var st = document.getElementById('screen-fit') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'screen-fit' }));
  st.textContent = k < 1 ? '@media screen { .pages { zoom: ' + k.toFixed(3) + '; } .bar { font-size: 12px; } }' : '';
}
// Built once the fonts are in (so pages fill with the right sizes), or after
// a few seconds if the font server cannot be reached - then printed.
var started = false;
function go() {
  if (started) return;
  started = true;
  build();
  setTimeout(function () { window.print(); }, 400);
}
// The font sheet is added from here rather than in the head: a stylesheet
// in the head that never answers would stop this script from running at all.
var fl = document.createElement('link');
fl.rel = 'stylesheet';
fl.href = 'https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap';
fl.onload = function () { (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { setTimeout(go, 50); }, go); };
fl.onerror = go;
document.head.appendChild(fl);
setTimeout(go, 3000);
<\/script>`;

const header = ({ eyebrow, title, subtitle, lede, dividerWidth }) =>
  `<div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1>${subtitle ? `<p class="subtitle">${esc(subtitle)}</p>` : ''}<div class="divider"${dividerWidth ? ` style="width:${dividerWidth}px"` : ''}></div>${lede ? `<p class="lede">${esc(lede)}</p>` : ''}`;
const contHeader = ({ eyebrow, title }) => `<div class="eyebrow">${esc(eyebrow)}</div><p class="cont">${esc(title)}, continued</p>`;

function open(tabTitle, barText, extraCss, docs) {
  const w = window.open('', '_blank');
  // Blocked by the browser: the caller says so with its own dialog.
  if (!w) return false;
  // Kept as JSON so "</script>" in someone's note cannot end the script.
  const json = JSON.stringify(docs).replace(/</g, '\\u003c');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(tabTitle)}</title>${FONT}<style>${CSS}${extraCss}</style></head><body>
    <div class="bar"><button onclick="window.print()">Print or save as PDF</button><span>${esc(barText)}</span></div>
    <div class="pages"></div>
    <script type="application/json" id="docs">${json}<\/script>
    ${PAGINATE}
  </body></html>`);
  w.document.close();
  return true;
}

const eyebrowFor = (brand, location) => [brand || 'CIG Concepts', location].filter(Boolean).join(' · ');

// ---- Operational POC: the one-page chart style ----
const POC_CSS = `
  .cols, .r { display: grid; grid-template-columns: 40px 1.25fr 0.9fr 1.6fr; gap: 12px; }
  .cols { padding: 8px 0 5px; font-weight: 700; font-size: 9px; letter-spacing: 1.3px; text-transform: uppercase; color: #7A1F2B; }
  .r { align-items: center; padding: 7px 0; border-bottom: 1px solid #d8d8d8; break-inside: avoid; }
  .lab { font-weight: 600; font-size: 11px; line-height: 1.3; }
  .own { font-weight: 400; font-size: 10.5px; }
  .det { font-weight: 300; font-size: 10px; line-height: 1.35; }
  .ln { display: block; border-bottom: 1px solid #9a9a9a; height: 16px; }
`;

// sections: [{ label, items: [{ item, who, vendor, contactNameNumber }] }]
export function printPocSheet({ location, brand, sections, openingDate = null }) {
  const blocks = [];
  const used = sections.filter((s) => s.items.length);
  used.forEach((s, si) => {
    const filled = s.items.filter((c) => [c.who, c.vendor, c.contactNameNumber].some((v) => String(v ?? '').trim())).length;
    blocks.push(`<div data-sec>${si ? '<div class="gap"></div>' : ''}<div class="stitle"><b data-name style="font-weight:700">${esc(s.label)}</b><span data-right>${filled} of ${s.items.length} filled in</span></div><div class="cols"><span></span><span>Responsibility</span><span>Who</span><span>Vendor / Company · Contact #</span></div></div>`);
    for (const c of s.items) {
      const det = [c.vendor, c.contactNameNumber].map((v) => String(v ?? '').trim()).filter(Boolean).join(' · ');
      blocks.push(`<div class="r">${badge(iconFor(c.item), 32, 16)}<div class="lab">${esc(c.item)}</div><div class="own">${String(c.who ?? '').trim() ? esc(c.who) : '<span class="ln"></span>'}</div><div class="det">${det ? esc(det) : '<span class="ln"></span>'}</div></div>`);
    }
  });
  const meta = { eyebrow: eyebrowFor(brand, location), title: 'Operational POC' };
  const subtitle = openingDate ? 'Opens ' + new Date(openingDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + ' · Printed ' + today() : 'Printed ' + today();
  return open(location + ' - Operational POC', 'Operational POC · ' + location, POC_CSS, [{
    head: header({ ...meta, subtitle, lede: 'Who owns each service and contact for this location, and the vendor and number to call. Filled-in rows come from the Hub; blank rows are written in by hand and entered in the Hub afterwards.' }),
    cont: contHeader(meta), category: 'Operational POC', blocks,
  }]);
}

// ---- Opening checklist: the outline style ----
const OPEN_CSS = `
  .it { padding: 11px 0 4px; break-inside: avoid; }
  .top { display: grid; grid-template-columns: 18px minmax(0,1fr) auto; column-gap: 10px; align-items: center; }
  .cb { width: 11px; height: 11px; border: 1.2px solid #1a1a1a; display: flex; align-items: center; justify-content: center; }
  .cb.on { background: #1a1a1a; }
  .cb.on::after { content: ''; width: 5px; height: 2.5px; border-left: 1.5px solid #fff; border-bottom: 1.5px solid #fff; transform: rotate(-45deg) translate(0.5px,-0.5px); }
  .nm { font-weight: 600; font-size: 10.5px; line-height: 16px; }
  .meta { font-weight: 400; font-size: 9px; white-space: nowrap; }
  .meta b { font-weight: 700; font-size: 7.5px; letter-spacing: 1px; text-transform: uppercase; color: #7A1F2B; margin: 0 4px 0 12px; }
  .meta .bl { display: inline-block; width: 90px; border-bottom: 1px solid #9a9a9a; height: 10px; vertical-align: -1px; }
  .waits { margin: 1px 0 0 28px; font-size: 8.6px; font-weight: 300; }
  .waits b { font-weight: 600; }
  .fields { display: grid; grid-template-columns: 1.2fr 0.8fr 1.1fr 1fr 1.3fr; column-gap: 10px; margin: 6px 0 0 28px; }
  .f label { display: block; font-weight: 700; font-size: 7px; letter-spacing: 1px; text-transform: uppercase; color: #7A1F2B; margin-bottom: 1px; }
  .f span { display: block; font-size: 9px; font-weight: 400; border-bottom: 1px solid #9a9a9a; min-height: 15px; line-height: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .f span.set { border-bottom-color: transparent; }
  .f.notes { grid-column: 1 / -1; margin-top: 5px; }
  .f.notes span { white-space: normal; }
`;

// setup / timeline: [{ section, items: [{ title, done, due, assigned, waitsFor,
//   fields: { reference, expiry, company, accountNumber, contact, notes } }] }]
export function printOpeningSheet({ location, brand, setup, timeline, openingDate = null }) {
  const blocks = [];
  const field = (label, val, cls = '') => `<div class="f ${cls}"><label>${label}</label><span class="${String(val ?? '').trim() ? 'set' : ''}">${esc(val ?? '')}</span></div>`;
  const add = (prefix, groups) => groups.filter((g) => g.items.length).forEach((g) => {
    const done = g.items.filter((i) => i.done).length;
    blocks.push(`<div data-sec>${blocks.length ? '<div class="gap"></div>' : ''}<div class="stitle"><b data-name style="font-weight:700">${esc(prefix + g.section)}</b><span data-right>${done} of ${g.items.length} done</span></div></div>`);
    for (const i of g.items) {
      const f = i.fields ?? {};
      blocks.push(`<div class="it"><div class="top"><span class="cb${i.done ? ' on' : ''}"></span><span class="nm">${esc(i.title)}</span><span class="meta"><b>Due</b>${esc(i.due ?? '')}<b>Assigned to</b>${i.assigned ? esc(i.assigned) : '<span class="bl"></span>'}</span></div>`
        + (i.waitsFor ? `<div class="waits">Waits for <b>${esc(i.waitsFor)}</b></div>` : '')
        + `<div class="fields">${field('Permit / Ref #', f.reference)}${field('Expiry', f.expiry)}${field('Company', f.company)}${field('Account #', f.accountNumber)}${field('Contact', f.contact)}${field('Notes', f.notes, 'notes')}</div></div>`);
    }
  });
  add('', setup);
  add('Timeline · ', timeline);
  const all = [...setup, ...timeline].flatMap((g) => g.items);
  const daysOut = openingDate ? Math.ceil((openingDate - Date.now()) / 86400000) : null;
  const subtitle = openingDate
    ? 'Opens ' + new Date(openingDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + (daysOut >= 0 ? ' · ' + daysOut + ' days to go' : '') + ' · ' + all.filter((i) => i.done).length + ' of ' + all.length + ' done'
    : 'Printed ' + today();
  const meta = { eyebrow: eyebrowFor(brand, location), title: 'Opening Checklist' };
  return open(location + ' - Opening Checklist', 'Opening checklist · ' + location, OPEN_CSS, [{
    head: header({ ...meta, subtitle, lede: 'Everything that has to happen before this location opens, and who is doing it. Tick each item as it is done and fill in its details, then enter them in the Hub.' }),
    cont: contHeader(meta), category: 'Pre-Opening', blocks,
  }]);
}

// ---- Daily lists to post: the SOP style, one page each ----
// The general list a server or bartender reads off the wall (17 Oct 2026):
// no date or names - sign-off stays in the Hub. Tasks that only happen on
// some days say which.
const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const onlyOn = (t) => {
  const d = t.days ?? (t.day !== undefined ? [t.day] : null);
  return d ? d.map((x) => DAYS[x]).join(' & ') + ' only' : '';
};
const SOP_CSS = `
  .info { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); border: 1.5px solid #1a1a1a; margin: 0 0 12px; }
  .info div { padding: 7px 10px; border-left: 1px solid #d8d8d8; }
  .info div:first-child { border-left: none; }
  .info b { display: block; font-size: 8.5px; font-weight: 700; letter-spacing: 1.3px; text-transform: uppercase; color: #7A1F2B; }
  .info span { font-size: 10.5px; font-weight: 500; }
  .sl { font-weight: 700; font-size: 10.5px; letter-spacing: 1.8px; text-transform: uppercase; color: #7A1F2B; margin: 0 0 5px; }
  .ph, .st { display: grid; grid-template-columns: 30px 54px minmax(0,1fr); gap: 10px; }
  .ph { font-weight: 700; font-size: 8.5px; letter-spacing: 1.3px; text-transform: uppercase; color: #7A1F2B; padding: 0 8px 4px; }
  .tbl { border-top: 1.5px solid #1a1a1a; border-bottom: 1.5px solid #1a1a1a; margin-bottom: 11px; }
  .st { align-items: center; padding: 3px 8px; border-bottom: 1px solid #d8d8d8; }
  .st:last-child { border-bottom: none; }
  .sn { font-weight: 600; font-size: 10px; }
  .sa { font-weight: 400; font-size: 8.8px; line-height: 1.35; }
  .sa b { font-weight: 600; }
  .sa .d { font-weight: 300; }
  .only { display: inline-block; margin-left: 5px; font-size: 7px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: #7A1F2B; border: 1px solid #7A1F2B; border-radius: 3px; padding: 0 4px; vertical-align: 1px; }
  .bx { border: 1.5px solid #1a1a1a; margin-bottom: 11px; }
  .tp { display: flex; gap: 9px; align-items: flex-start; padding: 4px 10px; border-bottom: 1px solid #d8d8d8; font-weight: 300; font-size: 9.6px; line-height: 1.45; }
  .tp:last-child { border-bottom: none; }
  .tp i { width: 6px; height: 6px; border-radius: 50%; background: #7A1F2B; margin-top: 5px; flex-shrink: 0; }
  .empty { font-style: italic; font-size: 9.5px; color: #555; padding: 7px 10px; }
  .certs { border-top: 1.5px solid #1a1a1a; border-bottom: 1.5px solid #1a1a1a; }
  .cert { display: grid; grid-template-columns: 1fr auto; padding: 5px 10px; border-bottom: 1px solid #d8d8d8; font-size: 10px; }
  .cert:last-child { border-bottom: none; }
  .cert b { font-weight: 600; } .cert span { font-weight: 300; }
`;

// Department, position and document type from the list itself.
function roleOf(l) {
  const id = String(l.id ?? '') + ' ' + String(l.title ?? '');
  const when = /closing/i.test(id) ? 'Closing ' : /opening/i.test(id) ? 'Opening ' : '';
  if (/chef|kitchen|boh/i.test(id)) return { department: 'Kitchen', position: when + 'Kitchen Lead', category: 'Back of House SOP' };
  if (/manager/i.test(id)) return { department: 'Management', position: 'Manager on Duty', category: 'Management SOP' };
  if (/bar/i.test(id)) return { department: 'Bar', position: when + 'Bartender', category: 'Front of House SOP' };
  if (/host/i.test(id)) return { department: 'Front of House', position: when + 'Host', category: 'Front of House SOP' };
  if (/veranda/i.test(id)) return { department: 'Front of House', position: 'Veranda Server', category: 'Front of House SOP' };
  if (/terrazza/i.test(id)) return { department: 'Front of House', position: 'Terrazza Server', category: 'Front of House SOP' };
  if (/server/i.test(id)) return { department: 'Front of House', position: when + 'Server / Food Runner', category: 'Front of House SOP' };
  return { department: 'Operations', position: 'Team', category: 'Standard Operating Procedure' };
}

// lists: [{ id, title, subtitle, intro, notes, tasks: [{ group } | { title, details, section, day, days }] }]
export function printDailySheets({ location, brand, lists }) {
  const docs = lists.map((l) => {
    const role = roleOf(l);
    // Steps: one per section of the list, or one per task when it has none.
    const groups = [];
    let cur = null;
    for (const t of l.tasks ?? []) {
      if (t.group) { cur = { name: t.group.replace(/^\d+\.\s*/, ''), tasks: [] }; groups.push(cur); continue; }
      if (!cur || !l.tasks.some((x) => x.group)) { groups.push({ name: null, tasks: [t] }); continue; }
      cur.tasks.push(t);
    }
    const taskHtml = (t) => `${esc(t.title)}${t.section ? ` (${esc(t.section)})` : ''}${onlyOn(t) ? `<span class="only">${esc(onlyOn(t))}</span>` : ''}${t.details ? ` <span class="d">${esc(t.details)}</span>` : ''}`;
    const steps = groups.filter((g) => g.tasks.length).map((g, n) => {
      const stepBody = g.name
        ? `<b>${esc(g.name)}.</b> ${g.tasks.map(taskHtml).join(' ')}`
        : `<b>${esc(g.tasks[0].title)}${g.tasks[0].section ? ` (${esc(g.tasks[0].section)})` : ''}.</b>${onlyOn(g.tasks[0]) ? `<span class="only">${esc(onlyOn(g.tasks[0]))}</span>` : ''}${g.tasks[0].details ? ` <span class="d">${esc(g.tasks[0].details)}</span>` : ''}`;
      return `<div class="st">${badge(iconFor(g.name ?? g.tasks[0].title), 24, 14)}<div class="sn">Step ${n + 1}</div><div class="sa">${stepBody}</div></div>`;
    }).join('');
    const points = [
      ...(l.intro ? [l.intro] : []),
      'Tick each task in the Hub once it is done, and write anything that could not be done in its note.',
      ...((l.notes ?? []).length ? ['Use the notes at the bottom of the list for ' + l.notes.map((x) => x[1]).join(' and ') + '.'] : []),
      (l.tasks ?? []).some((t) => onlyOn(t)) ? 'Some tasks are only done on certain days; those are marked.' : null,
      /chef-closing|boh-closing/.test(l.id ?? '') ? 'The GM checks the kitchen and signs this list off the next morning.' : 'The manager on duty signs this list off in the Hub each shift.',
    ].filter(Boolean);
    const body = `<div><div class="info"><div><b>Date</b><span>Printed ${esc(today())}</span></div><div><b>Department</b><span>${esc(role.department)}</span></div><div><b>Position</b><span>${esc(role.position)}</span></div></div>
      <p class="sl">Procedure</p><div class="ph"><span></span><span>Step</span><span>Action</span></div><div class="tbl">${steps}</div>
      <p class="sl">Training Points</p><div class="bx">${points.map((p) => `<div class="tp"><i></i><span>${esc(p)}</span></div>`).join('')}</div>
      <p class="sl">Guest Expectations</p><div class="bx"><div class="empty">No guest expectations documented for this task.</div></div></div>`;
    const listTitle = String(l.title ?? '').replace(/ Checklist$/, '');
    return {
      head: header({ eyebrow: brand || 'CIG Concepts', title: listTitle, subtitle: 'Standard Operating Procedure · Department: ' + role.department + ' · Position: ' + role.position, lede: l.subtitle || '', dividerWidth: 70 }),
      cont: contHeader({ eyebrow: brand || 'CIG Concepts', title: listTitle }), category: role.category, fit: true, blocks: [body],
    };
  });
  const title = lists.length === 1 ? lists[0].title : 'Daily checklists';
  return open(location + ' - ' + title, title + ' · ' + location + (lists.length > 1 ? ' · ' + lists.length + ' lists, one per page' : ''), SOP_CSS, docs);
}

// ---- The Daily Time & Temperature Log, blank (18 Oct 2026) ----
// Landscape, laid out like the kitchen's paper sheet: every item down the
// side, a temperature and initials box for each check time.
const LOG_CSS = `
  @page { size: 11in 8.5in; margin: 0; }
  .page { width: 11in; height: 8.5in; padding: 0.34in; }
  .frame { padding: 20px 30px 16px; }
  h1 { font-size: 24px; }
  .subtitle { font-size: 10.5px; }
  .divider { margin: 8px auto; }
  .lede { font-size: 9.5px; margin-bottom: 6px; max-width: 8in; }
  .lmeta { display: flex; justify-content: center; gap: 40px; font-size: 9.5px; margin: 2px 0 8px; }
  .lmeta span { display: inline-flex; align-items: flex-end; gap: 6px; }
  .lmeta i { display: inline-block; width: 170px; border-bottom: 1px solid #1a1a1a; height: 13px; }
  table.log { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.log th { font-weight: 700; color: #7A1F2B; text-transform: uppercase; letter-spacing: 1px; }
  table.log thead tr:first-child th { font-size: 9px; padding: 4px 0; border-top: 1.5px solid #1a1a1a; border-bottom: 1px solid #d8d8d8; }
  table.log thead tr:nth-child(2) th { font-size: 6.5px; padding: 2px 0 3px; border-bottom: 1.5px solid #1a1a1a; }
  table.log .t { border-left: 1px solid #1a1a1a; }
  table.log td { height: 23.5px; border-bottom: 1px solid #d8d8d8; }
  table.log td.i { border-left: 1px solid #d8d8d8; }
  table.log td.name { font-weight: 600; font-size: 9px; white-space: nowrap; }
  table.log td.name .badge { display: inline-flex; vertical-align: middle; margin-right: 6px; }
  table.log tbody tr:last-child td { border-bottom: 1.5px solid #1a1a1a; }
  .lsign { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 24px; margin-top: 10px; font-size: 8.5px; }
  .lsign div { display: flex; align-items: flex-end; gap: 6px; }
  .lsign i { flex: 1; border-bottom: 1px solid #1a1a1a; height: 12px; }
  @media screen { .page { width: 11in; height: 8.5in; } }
`;

export function printTempLogSheet({ location, brand, items, times }) {
  const head1 = '<tr><th style="width:190px;text-align:left;padding-left:4px">Item</th>' + times.map((t) => `<th class="t" colspan="2">${esc(t)}</th>`).join('') + '</tr>';
  const head2 = '<tr><th></th>' + times.map(() => '<th class="t">Temp (°F)</th><th>Initials</th>').join('') + '</tr>';
  const rows = items.map((it) => `<tr><td class="name">${badge('thermo', 17, 10)}${esc(it)}</td>${times.map(() => '<td class="t"></td><td class="i"></td>').join('')}</tr>`).join('');
  const body = `<div><div class="lmeta"><span>Date <i></i></span><span>Recorded by <i></i></span></div>
    <table class="log"><thead>${head1}${head2}</thead><tbody>${rows}</tbody></table>
    <div class="lsign"><div>Signed off by <i></i></div><div>Date / time <i></i></div><div>Notes <i></i></div></div></div>`;
  const meta = { eyebrow: eyebrowFor(brand, location), title: 'Daily Time & Temperature Log' };
  return open(location + ' - Temperature Log', 'Temperature log (blank) · ' + location, LOG_CSS, [{
    head: header({ ...meta, subtitle: 'Hot-Holding & Cold-Holding Temperature Record — Store-Level Food Safety Check', lede: 'Record the temperature and initial each item and line station every two hours during service. Consistent recording protects food safety and keeps HACCP records audit-ready.' }),
    cont: contHeader(meta), category: 'Food Safety Log', fit: true, blocks: [body],
  }]);
}
