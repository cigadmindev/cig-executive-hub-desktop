// Printable fill-in sheets (16 Oct 2026): a location's Operational POC or
// pre-opening checklist with empty boxes, for filling in with a pen and
// typing into the Hub afterwards. Anything already filled in is printed, so
// only the gaps need writing. Opens in a new tab with the print dialog; the
// browser's "Save as PDF" makes the PDF.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const CSS = `
  @page { size: letter; margin: 12mm 11mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; color: #111; font-size: 10.5px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html { background: #E9E9EC; }
  .bar { position: sticky; top: 0; z-index: 2; display: flex; justify-content: flex-start; align-items: center; gap: 12px; padding: 12px 16px; background: #111; color: #fff; font-size: 13px; }
  .bar span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar button { flex-shrink: 0; }
  .bar button { background: #22D3EE; color: #0A0A0B; border: 0; border-radius: 8px; padding: 9px 16px; font-weight: 800; font-size: 13px; cursor: pointer; }
  /* The printable width of a Letter page, on screen too, so the preview is
     what prints. A phone shrinks the whole page to fit (set by FIT below). */
  .sheet { width: 7.6in; margin: 16px auto 40px; padding: 0.3in; background: #fff; box-shadow: 0 2px 14px rgba(0,0,0,.15); box-sizing: content-box; }
  .top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 8px; }
  .brand { font-size: 9px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: #555; }
  h1 { margin: 3px 0 0; font-size: 19px; letter-spacing: -0.2px; }
  .meta { text-align: right; font-size: 9.5px; color: #444; line-height: 1.6; }
  .meta b { color: #111; }
  .how { margin: 8px 0 4px; font-size: 9.5px; color: #444; }
  .filledby { display: flex; gap: 18px; margin: 8px 0 2px; font-size: 9.5px; color: #444; }
  .filledby span { flex: 1; border-bottom: 1px solid #999; padding-bottom: 12px; }
  h2 { margin: 16px 0 0; padding: 5px 8px; background: #EDEDED; border: 1px solid #BBB; border-bottom: 0; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 8px; letter-spacing: 0.6px; text-transform: uppercase; color: #555; font-weight: 700; padding: 4px 6px; border: 1px solid #BBB; background: #F7F7F7; }
  td { border: 1px solid #BBB; padding: 0 6px; height: 27px; vertical-align: middle; overflow: hidden; }
  td.item { font-weight: 600; }
  td.filled { color: #1A5E73; font-size: 9.5px; }
  td.box { text-align: center; }
  .tick { display: inline-block; width: 12px; height: 12px; border: 1.3px solid #333; border-radius: 2px; vertical-align: middle; }
  .tick.on { background: #333; }
  tr { break-inside: avoid; }
  .foot { margin-top: 14px; font-size: 8.5px; color: #777; display: flex; justify-content: space-between; }
  @media print { html { background: #fff; } .bar { display: none; } .sheet { width: auto; margin: 0; padding: 0; box-shadow: none; } }
`;

// Every daily list fits on one page (17 Oct 2026): a long one goes to two
// columns, and if that is still too tall it is shrunk to fit. On a phone the
// whole preview is scaled to the screen; printing is unaffected.
const FIT = `<script>
  function fitAll() {
    var PAGE = 9.6 * 96;
    document.querySelectorAll('.list').forEach(function (l) {
      l.style.zoom = 1;
      var t = l.querySelector('.tasks');
      if (t) t.classList.remove('two');
      var cs = getComputedStyle(l);
      var h = function () { return l.scrollHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom); };
      if (t && h() > PAGE) t.classList.add('two');
      if (h() > PAGE) l.style.zoom = Math.max(0.5, PAGE / h());
    });
    var paper = document.querySelector('.daily .list') || document.querySelector('.sheet');
    var full = paper.offsetWidth + 32;
    // screen.width as well: a page opened this way on a phone can be laid
    // out wider than the screen.
    var k = Math.min(1, Math.min(window.innerWidth, screen.width || window.innerWidth) / full);
    var st = document.getElementById('screen-fit') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'screen-fit' }));
    st.textContent = k < 1 ? '@media screen { .sheet { zoom: ' + k.toFixed(3) + '; } .bar { font-size: 12px; } }' : '';
  }
  window.onload = function () { fitAll(); setTimeout(function () { window.print(); }, 400); };
<\/script>`;

function open(title, location, brand, bodyHtml) {
  const w = window.open('', '_blank');
  // Blocked by the browser: the caller says so with its own dialog.
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(location)} - ${esc(title)}</title><style>${CSS}</style></head><body>
    <div class="bar"><button onclick="window.print()">Print or save as PDF</button><span>${esc(title)} · ${esc(location)}</span></div>
    <div class="sheet">
      <div class="top">
        <div><div class="brand">CIG · ${esc(brand)}</div><h1>${esc(location)}: ${esc(title)}</h1></div>
        <div class="meta">Printed <b>${esc(today())}</b><br>Fill in by hand, then enter it in the Hub</div>
      </div>
      <div class="filledby"><span>Filled in by</span><span>Date</span></div>
      <p class="how">Blue text is already in the Hub. Write in the empty boxes only.</p>
      ${bodyHtml}
      <div class="foot"><span>CIG Executive Hub · hub.cigconcepts.com</span><span>${esc(location)} · ${esc(title)}</span></div>
    </div>
    ${FIT}
  </body></html>`);
  w.document.close();
  return true;
}

const cell = (v, cls = '') => (String(v ?? '').trim() ? `<td class="filled ${cls}">${esc(v)}</td>` : `<td class="${cls}"></td>`);

// sections: [{ label, items: [{ item, who, vendor, contactNameNumber }] }]
export function printPocSheet({ location, brand, sections }) {
  const html = sections
    .filter((s) => s.items.length)
    .map((s) => `<h2>${esc(s.label)}</h2><table>
      <colgroup><col style="width:30%"><col style="width:18%"><col style="width:26%"><col style="width:26%"></colgroup>
      <thead><tr><th>Item</th><th>Who</th><th>Vendor / Company</th><th>Contact name / #</th></tr></thead>
      <tbody>${s.items.map((c) => `<tr><td class="item">${esc(c.item)}</td>${cell(c.who)}${cell(c.vendor)}${cell(c.contactNameNumber)}</tr>`).join('')}</tbody>
    </table>`)
    .join('');
  return open('Operational POC', location, brand, html);
}

// setup: [{ section, items: [{ title, done, fields: { company, accountNumber, contact, reference, expiry } }] }]
// timeline: [{ section, items: [{ title, done, due }] }]
export function printOpeningSheet({ location, brand, setup, timeline }) {
  const setupHtml = setup
    .filter((s) => s.items.length)
    .map((s) => `<h2>Set-Up · ${esc(s.section)}</h2><table>
      <colgroup><col style="width:6%"><col style="width:26%"><col style="width:18%"><col style="width:14%"><col style="width:18%"><col style="width:18%"></colgroup>
      <thead><tr><th>Done</th><th>Item</th><th>Company</th><th>Account #</th><th>Contact</th><th>Permit # / Expiry</th></tr></thead>
      <tbody>${s.items.map((i) => `<tr><td class="box"><span class="tick${i.done ? ' on' : ''}"></span></td><td class="item">${esc(i.title)}</td>${cell(i.fields?.company)}${cell(i.fields?.accountNumber)}${cell(i.fields?.contact)}${cell([i.fields?.reference, i.fields?.expiry].filter(Boolean).join(' · '))}</tr>`).join('')}</tbody>
    </table>`)
    .join('');
  const timelineHtml = timeline
    .filter((s) => s.items.length)
    .map((s) => `<h2>Timeline · ${esc(s.section)}</h2><table>
      <colgroup><col style="width:6%"><col style="width:46%"><col style="width:16%"><col style="width:16%"><col style="width:16%"></colgroup>
      <thead><tr><th>Done</th><th>Task</th><th>Due</th><th>Date done</th><th>By</th></tr></thead>
      <tbody>${s.items.map((i) => `<tr><td class="box"><span class="tick${i.done ? ' on' : ''}"></span></td><td class="item">${esc(i.title)}</td><td class="filled">${esc(i.due ?? '')}</td><td></td><td></td></tr>`).join('')}</tbody>
    </table>`)
    .join('');
  return open('Pre-opening checklist', location, brand, setupHtml + timelineHtml);
}

// Daily checklists to post for the team (17 Oct 2026): the general list a
// server or bartender reads off the wall - each list on its own page, every
// task with what it involves. No date, names or boxes: it is a reference,
// not a sheet to fill in (sign-off stays in the Hub). Tasks that only happen
// on some days say which.
const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const onlyOn = (t) => {
  const d = t.days ?? (t.day !== undefined ? [t.day] : null);
  return d ? d.map((x) => DAYS[x]).join(' & ') + ' only' : '';
};
const DAILY_CSS = `
  .list { break-before: page; }
  .list:first-of-type { break-before: auto; }
  .tasks.two { column-count: 2; column-gap: 22px; }
  /* On screen, one sheet of paper per list. */
  @media screen {
    .daily .sheet { width: auto; background: none; box-shadow: none; padding: 0; }
    .daily .list { width: 7.6in; box-sizing: content-box; margin: 0 auto 18px; background: #fff; box-shadow: 0 2px 14px rgba(0,0,0,.15); padding: 0.3in; }
  }
  .lhead { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
  .lhead h1 { font-size: 24px; }
  .lsub { font-size: 11px; color: #444; margin-top: 3px; }
  .intro { font-size: 11px; color: #333; margin: 0 0 10px; line-height: 1.45; }
  .grp { margin: 14px 0 4px; padding: 4px 8px; background: #EDEDED; font-weight: 800; font-size: 10.5px; letter-spacing: 1px; text-transform: uppercase; break-after: avoid; }
  .task { display: flex; gap: 10px; padding: 6px 2px; border-bottom: 1px solid #DDD; break-inside: avoid; }
  .num { flex: 0 0 22px; font-weight: 800; font-size: 12px; color: #1A5E73; text-align: right; }
  .body b { font-size: 12.5px; }
  .body .d { color: #333; font-size: 10.5px; line-height: 1.4; margin-top: 2px; white-space: pre-wrap; }
  .only { display: inline-block; margin-left: 8px; font-size: 8.5px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; color: #1A5E73; border: 1px solid #1A5E73; border-radius: 3px; padding: 0 4px; vertical-align: 2px; }
  .sec { font-size: 9.5px; color: #555; margin-left: 6px; font-weight: 600; }
`;

// lists: [{ title, subtitle, intro, tasks: [{ group } | { title, details, section, day, days }] }]
export function printDailySheets({ location, brand, lists }) {
  const w = window.open('', '_blank');
  if (!w) return false;
  const page = (l) => {
    let n = 0;
    const rows = l.tasks.map((t) => (t.group
      ? `<div class="grp">${esc(t.group)}</div>`
      : `<div class="task"><div class="num">${++n}</div><div class="body"><b>${esc(t.title)}</b>${t.section ? `<span class="sec">(${esc(t.section)})</span>` : ''}${onlyOn(t) ? `<span class="only">${esc(onlyOn(t))}</span>` : ''}${t.details ? `<div class="d">${esc(t.details)}</div>` : ''}</div></div>`)).join('');
    return `<section class="list">
      <div class="lhead"><div class="brand">CIG · ${esc(brand)} · ${esc(location)}</div><h1>${esc(l.title)}</h1>${l.subtitle ? `<div class="lsub">${esc(l.subtitle)}</div>` : ''}</div>
      ${l.intro ? `<p class="intro">${esc(l.intro)}</p>` : ''}
      <div class="tasks">${rows}</div>
      <div class="foot"><span>The manager on duty signs this off in the Hub each shift.</span><span>${esc(location)} · ${esc(l.title)}</span></div>
    </section>`;
  };
  const title = lists.length === 1 ? lists[0].title : 'Daily checklists';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(location)} - ${esc(title)}</title><style>${CSS}${DAILY_CSS}</style></head><body class="daily">
    <div class="bar"><button onclick="window.print()">Print or save as PDF</button><span>${esc(title)} · ${esc(location)}${lists.length > 1 ? ' · ' + lists.length + ' lists, one per page' : ''}</span></div>
    <div class="sheet">${lists.map(page).join('')}</div>
    ${FIT}
  </body></html>`);
  w.document.close();
  return true;
}
