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
  .bar { position: sticky; top: 0; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 18px; background: #111; color: #fff; font-size: 13px; }
  .bar button { background: #22D3EE; color: #0A0A0B; border: 0; border-radius: 8px; padding: 9px 16px; font-weight: 800; font-size: 13px; cursor: pointer; }
  .sheet { max-width: 8in; margin: 0 auto; padding: 22px 18px 30px; }
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
  @media print { .bar { display: none; } .sheet { padding: 0; max-width: none; } }
`;

function open(title, location, brand, bodyHtml) {
  const w = window.open('', '_blank');
  // Blocked by the browser: the caller says so with its own dialog.
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(location)} - ${esc(title)}</title><style>${CSS}</style></head><body>
    <div class="bar"><span>${esc(title)} · ${esc(location)}</span><button onclick="window.print()">Print or save as PDF</button></div>
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
    <script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };<\/script>
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
