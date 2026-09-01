const fs = require('fs'), path = require('path');
const parser = require('@babel/parser');

const files = [];
for (const d of ['src/screens', 'src/components', 'src/layout', 'src/context', 'src/hooks']) {
  if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (/\.jsx?$/.test(f)) files.push(path.join(d, f));
}

const out = { wide: [], minw: [], fixedH: [], vh: [], nowrap: [], dupKeys: [], parseFail: [] };

for (const p of files) {
  const src = fs.readFileSync(p, 'utf8');

  src.split('\n').forEach((l, i) => {
    const at = p + ':' + (i + 1);
    const t = l.trim().slice(0, 88);
    if (/\bwidth: (3[5-9]\d|[4-9]\d\d)\b/.test(l) && !/maxWidth|minWidth|canvas/.test(l)) out.wide.push(at + '  ' + t);
    if (/minWidth: (2[6-9]\d|[3-9]\d\d)\b/.test(l)) out.minw.push(at + '  ' + t);
    if (/\bheight: (1[2-9]\d|[2-9]\d\d)\b/.test(l) && !/lineHeight|maxHeight|minHeight|canvas/.test(l)) out.fixedH.push(at + '  ' + t);
    if (/100vh/.test(l)) out.vh.push(at + '  ' + t);
    if (/whiteSpace: 'nowrap'/.test(l) && !/minWidth: 0/.test(l)) out.nowrap.push(at + '  ' + t);
  });

  let ast;
  try { ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx'] }); }
  catch (e) { out.parseFail.push(p + '  ' + e.message); continue; }
  JSON.stringify(ast, (k, v) => {
    if (v && v.type === 'ObjectExpression' && Array.isArray(v.properties)) {
      const seen = {};
      for (const pr of v.properties) {
        if (pr.type !== 'ObjectProperty' || pr.computed) continue;
        const n = pr.key.name || pr.key.value;
        if (n === undefined) continue;
        if (seen[n]) out.dupKeys.push(p + ':' + pr.loc.start.line + '  duplicate "' + n + '" (first at ' + seen[n] + ')');
        else seen[n] = pr.loc.start.line;
      }
    }
    return v;
  });
}

const css = fs.readFileSync('src/index.css', 'utf8').split('\n');
let depth = 0; const hover = [];
css.forEach((l, i) => {
  if (l.includes('@media (hover: hover)')) depth = 1;
  else if (depth && l.trim() === '}' && l.indexOf('  ') !== 0) depth = 0;
  const t = l.trim();
  if (l.includes(':hover') && t.startsWith('/*') === false && t.startsWith('*') === false && depth === 0) hover.push('index.css:' + (i + 1) + '  ' + t);
});

const show = (title, rows, note) => {
  console.log('\n=== ' + title + ' (' + rows.length + ') ===');
  if (note && rows.length) console.log('  ' + note);
  rows.length ? rows.forEach((r) => console.log('  ' + r)) : console.log('  clean');
};

console.log('scanned ' + files.length + ' files');
show('PARSE FAILURES', out.parseFail);
show('Duplicate object keys', out.dupKeys, 'second value silently wins');
show('Unwrapped :hover rules', hover, 'these stick on touchscreens');
show('Fixed widths over 350px', out.wide, 'check each is inside something already clamped');
show('Minimum widths over 260px', out.minw, 'these force overflow regardless of parent');
show('Fixed container heights', out.fixedH, 'these clip when text wraps');
show('100vh usages', out.vh, 'ignores the keyboard on iOS - dvh tracks the visible area');
show('nowrap without minWidth 0', out.nowrap, 'can force a flex row wider than its parent');
