// Row hover pills that always fit (Nov 2026). A row's hover pill normally
// reaches 8px past its sides (see [data-row]::before in index.css). Inside a
// box that clips its edges, that would get cut into a flat square. The first
// time you point at a row, this checks for that and, if so, tucks the pill
// inside the row, keeping about 10px between its edge and the row's
// content. Rows that already say how (data-inset) are left
// alone.
const REACH = 8;

function clipper(el) {
  for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (/(hidden|auto|scroll|clip)/.test(cs.overflowX) || /(hidden|auto|scroll|clip)/.test(cs.overflow)) return a;
  }
  return null;
}

function fit(row) {
  if (row.dataset.pillChecked || row.hasAttribute('data-inset')) return;
  row.dataset.pillChecked = '1';
  const box = clipper(row);
  if (!box) return;
  const r = row.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const cs = getComputedStyle(box);
  const left = b.left + parseFloat(cs.borderLeftWidth || 0);
  const right = b.right - parseFloat(cs.borderRightWidth || 0);
  if (r.left - REACH >= left - 0.5 && r.right + REACH <= right + 0.5) return;
  // Leave about 10px between the pill's edge and the row's content.
  const pad = Math.min(parseFloat(getComputedStyle(row).paddingLeft) || 0, parseFloat(getComputedStyle(row).paddingRight) || 0);
  row.style.setProperty('--pill-x', Math.max(0, Math.min(8, pad - 10)) + 'px');
  row.setAttribute('data-inset', 'auto');
}

document.addEventListener('pointerover', (e) => {
  const row = e.target && e.target.closest && e.target.closest('[data-row]');
  if (row) fit(row);
}, { passive: true, capture: true });
