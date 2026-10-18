// The CIG Concepts document look for PDFs the server draws (18 Oct 2026):
// Poppins, black body text, burgundy eyebrow and section labels, a
// square-cornered double-line frame inset from the page edge, and a footer
// reading "CIG Concepts" on the left and the document type on the right.
// The same family as the printed sheets in src/lib/printSheet.js.
//
//   const d = await CigDoc.create({ eyebrow, title, category })
//   d.header(intro)            first-page title block
//   d.need(h)                  start a new page if h points will not fit
//   d.text / d.wrap / d.label / d.badge / d.rule ...
//   await d.save()             writes the page footers, returns bytes
//
// Pass { pdf } to add pages to a document that already exists (a signature
// record at the end of an uploaded contract).
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const BURGUNDY = rgb(0x7a / 255, 0x1f / 255, 0x2b / 255);
const TINT = rgb(0xf4 / 255, 0xe7 / 255, 0xe9 / 255);
const INK = rgb(0, 0, 0);
const FRAME = rgb(0x1a / 255, 0x1a / 255, 0x1a / 255);
const HAIR = rgb(0xd8 / 255, 0xd8 / 255, 0xd8 / 255);
const MUTED = rgb(0.33, 0.33, 0.33);

const W = 612, H = 792;
const PAD = 30; // white margin before the frame (~0.42in)
const LEFT = PAD + 26, RIGHT = W - PAD - 26;
const TOP = H - PAD - 24;
const BOTTOM = PAD + 44; // content stops above the footer

const FONT_FILES = { regular: 'Poppins-Regular.ttf', light: 'Poppins-Light.ttf', medium: 'Poppins-Medium.ttf', bold: 'Poppins-Bold.ttf', italic: 'Poppins-Italic.ttf' };
const fontBytes = {};
const readFont = (k) => (fontBytes[k] = fontBytes[k] ?? fs.readFileSync(path.join(__dirname, 'fonts', FONT_FILES[k])));

// Line icons as SVG paths on a 24x24 grid (drawn with a burgundy stroke in a
// tinted circle). Picked by matching words in a section name.
const ICONS = {
  box: 'M4 8h16v12H4z M3 5h18v3H3z M10 12h4',
  thermo: 'M10 4h4v10.5a4 4 0 1 1-4 0z M12 9v7',
  cooler: 'M6 3h12v18H6z M6 10h12 M9 6v2 M9 13v3',
  flame: 'M12 3c3 4 6 6.5 6 10.5a6 6 0 0 1-12 0c0-2.5 1.5-4 3-5.5 0 2 1 3 2 3 0-3-1-5 1-8z',
  board: 'M4 6h13v14H4z M17 11h3v4h-3 M8 10h5 M8 14h5',
  dish: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0z M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0z',
  pizza: 'M12 21L4 6c5-2.5 11-2.5 16 0z',
  trash: 'M5 7h14 M9 7V4h6v3 M7 7l1 13h8l1-13 M10 11v6 M14 11v6',
  floor: 'M14 3l-4 10 M6 13h8l2 7H4z M8 16v4 M12 16v4',
  check: 'M5 4h14v17H5z M9 3h6v3H9z M8.5 13l2.5 2.5 4.5-5',
  glass: 'M7 3h10l-1 8a4 4 0 0 1-8 0z M12 15v5 M8 21h8',
  door: 'M6 3h12v18H6z M14 12h1',
  light: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z',
  person: 'M8 8a4 4 0 1 0 8 0a4 4 0 1 0-8 0z M4 21c0-4 4-6 8-6s8 2 8 6',
  sign: 'M4 17c3-1 4-6 6-6s1 5 3 5 3-3 4-3 1 2 3 2 M4 21h16',
};
const ICON_WORDS = [
  [/stor|label|dating|stock|restock|to-go|supplies/i, 'box'], [/cool(ing)?\b|temp/i, 'thermo'], [/cooler|walk-in|fridge|reach-in/i, 'cooler'],
  [/equipment|line|grill|fryer|oven|stove|hood/i, 'flame'], [/cutting|board|station|prep/i, 'board'], [/dish|sink/i, 'dish'],
  [/pizza/i, 'pizza'], [/trash|garbage/i, 'trash'], [/floor|mop|sweep/i, 'floor'], [/walk-through|final|verify|check/i, 'check'],
  [/bar|glass|wine|beer|liquor|drink|beverage/i, 'glass'], [/door|entrance|host|front/i, 'door'], [/light|power|music|tv/i, 'light'],
  [/server|staff|team|guest|manager/i, 'person'],
];
const iconFor = (name) => (ICON_WORDS.find(([re]) => re.test(name ?? '')) ?? [null, 'check'])[1];

class CigDoc {
  static async create({ eyebrow, title, category, pdf = null }) {
    const d = new CigDoc();
    d.pdf = pdf ?? (await PDFDocument.create());
    d.pdf.registerFontkit(fontkit);
    d.f = {};
    for (const k of Object.keys(FONT_FILES)) d.f[k] = await d.pdf.embedFont(readFont(k), { subset: true });
    d.chars = new Set(d.f.regular.getCharacterSet());
    d.eyebrow = String(eyebrow ?? '').toUpperCase();
    d.title = title ?? '';
    d.category = category ?? '';
    d.pages = [];
    d.newPage(false);
    return d;
  }

  // Characters Poppins cannot draw are swapped or dropped rather than
  // failing the whole document.
  clean(s) {
    return String(s ?? '')
      .replace(/[ -​  　 ]/g, ' ')
      .split('')
      .map((c) => (c === '\n' || this.chars.has(c.codePointAt(0)) ? c : ({ '‘': "'", '’': "'", '“': '"', '”': '"' }[c] ?? '')))
      .join('');
  }

  newPage(continued = true) {
    this.page = this.pdf.addPage([W, H]);
    this.pages.push(this.page);
    const p = this.page;
    p.drawRectangle({ x: PAD, y: PAD, width: W - 2 * PAD, height: H - 2 * PAD, borderColor: FRAME, borderWidth: 1.9 });
    p.drawRectangle({ x: PAD + 5.5, y: PAD + 5.5, width: W - 2 * PAD - 11, height: H - 2 * PAD - 11, borderColor: FRAME, borderWidth: 0.75 });
    this.y = TOP;
    if (continued) {
      this.spaced(this.eyebrow, W / 2, this.y - 6, 7.6, 1.9, BURGUNDY, 'center');
      this.y -= 18;
      this.text(this.title + ', continued', { x: W / 2, size: 7.2, font: 'light', align: 'center' });
      this.y -= 16;
    }
  }

  need(h) { if (this.y - h < BOTTOM) this.newPage(true); }

  // Letter-spaced capitals (eyebrows, labels) - pdf-lib has no tracking.
  spaced(s, x, y, size, track, color, align = 'left', font = 'bold') {
    const t = this.clean(s);
    const f = this.f[font];
    const width = [...t].reduce((a, c) => a + f.widthOfTextAtSize(c, size) + track, 0) - track;
    let cx = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    for (const c of t) { this.page.drawText(c, { x: cx, y, size, font: f, color }); cx += f.widthOfTextAtSize(c, size) + track; }
    return width;
  }

  width(s, size, font = 'regular') { return this.f[font].widthOfTextAtSize(this.clean(s), size); }

  text(s, { x = LEFT, y = this.y, size = 9, font = 'regular', color = INK, align = 'left' } = {}) {
    const t = this.clean(s);
    const w = this.f[font].widthOfTextAtSize(t, size);
    const px = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    this.page.drawText(t, { x: px, y, size, font: this.f[font], color });
    return w;
  }

  wrap(s, size, maxWidth, font = 'regular') {
    const f = this.f[font];
    const out = [];
    for (const para of this.clean(s).split('\n')) {
      let cur = '';
      for (const word of para.split(' ')) {
        const next = cur ? cur + ' ' + word : word;
        if (f.widthOfTextAtSize(next, size) > maxWidth && cur) { out.push(cur); cur = word; } else cur = next;
      }
      out.push(cur);
    }
    return out;
  }

  // Centered paragraph; returns the height used.
  para(s, { size = 8.2, font = 'light', lead = 1.55, maxWidth = 440 } = {}) {
    const lines = this.wrap(s, size, maxWidth, font);
    for (const l of lines) { this.text(l, { x: W / 2, size, font, align: 'center' }); this.y -= size * lead; }
  }

  header(intro) {
    this.spaced(this.eyebrow, W / 2, this.y - 6, 7.8, 2, BURGUNDY, 'center');
    this.y -= 30;
    const tl = this.wrap(this.title, 21, RIGHT - LEFT, 'bold');
    for (const l of tl) { this.text(l, { x: W / 2, size: 21, font: 'bold', align: 'center' }); this.y -= 24; }
    this.y += 4;
    this.page.drawRectangle({ x: W / 2 - 41, y: this.y - 6, width: 82, height: 2.2, color: BURGUNDY });
    this.y -= 22;
    if (intro) { this.para(intro, { size: 8.2 }); this.y -= 4; }
  }

  // A burgundy section label on a dark rule, with optional text on the right.
  label(s, right = '') {
    this.need(40);
    this.spaced(String(s).toUpperCase(), LEFT, this.y - 7, 7.8, 1.4, BURGUNDY);
    if (right) this.text(right, { x: RIGHT, y: this.y - 7, size: 7.2, font: 'regular', align: 'right' });
    this.y -= 12;
    this.rule(FRAME, 1.1);
  }

  rule(color = HAIR, thickness = 0.75, x0 = LEFT, x1 = RIGHT) {
    this.page.drawLine({ start: { x: x0, y: this.y }, end: { x: x1, y: this.y }, thickness, color });
  }

  // A tinted circle with a line icon; (x, yTop) is its top-left corner.
  badge(x, yTop, name, size = 22) {
    const r = size / 2;
    this.page.drawCircle({ x: x + r, y: yTop - r, size: r, color: TINT, borderColor: BURGUNDY, borderWidth: 0.75 });
    const s = (size * 0.52) / 24;
    this.page.drawSvgPath(ICONS[name] ?? ICONS.check, { x: x + r - 12 * s, y: yTop - r + 12 * s, scale: s, borderColor: BURGUNDY, borderWidth: 1.8, borderLineCap: 1 });
  }

  // "Label ______" field line, as on the paper forms; the value sits on it.
  field(x0, x1, labelText, value) {
    const lw = this.text(labelText, { x: x0, size: 7.2, font: 'regular' });
    const sx = x0 + lw + 6;
    this.page.drawLine({ start: { x: sx, y: this.y - 2.5 }, end: { x: x1, y: this.y - 2.5 }, thickness: 0.75, color: FRAME });
    if (value) this.text(value, { x: sx + 3, size: 7.2, font: 'medium' });
  }

  async save() {
    const n = this.pages.length;
    this.pages.forEach((p, i) => {
      const y = PAD + 26;
      p.drawLine({ start: { x: LEFT, y: y + 10 }, end: { x: RIGHT, y: y + 10 }, thickness: 0.75, color: HAIR });
      const left = 'CIG Concepts';
      p.drawText(left, { x: LEFT, y, size: 6.8, font: this.f.bold, color: INK });
      const right = this.clean(this.category + (n > 1 ? ' · Page ' + (i + 1) + ' of ' + n : ''));
      p.drawText(right, { x: RIGHT - this.f.regular.widthOfTextAtSize(right, 6.8), y, size: 6.8, font: this.f.regular, color: INK });
    });
    return this.pdf.save();
  }
}

module.exports = { CigDoc, iconFor, LEFT, RIGHT, W, H, BURGUNDY, INK, MUTED, HAIR, FRAME };
