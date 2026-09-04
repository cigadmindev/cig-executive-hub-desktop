const fs = require('fs');
const path = require('path');

// confirm, alert and prompt are browser globals. Calling one without pulling
// it from useDialog runs successfully and behaves wrongly - window.confirm
// with an object prints [object Object] - so no check catches it. The
// identifier resolves, just not to ours.
const GLOBALS = ['confirm', 'alert', 'prompt'];

function walk(d, ext, out = []) {
  if (!fs.existsSync(d)) return out;
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p, ext, out);
    else if (ext.test(f.name)) out.push(p);
  }
  return out;
}

let findings = 0;
for (const [root, ext] of [
  ['src', /\.jsx?$/],
  
]) {
  for (const p of walk(root, ext)) {
    const s = fs.readFileSync(p, 'utf8');
    for (const g of GLOBALS) {
      // A call like `confirm({` or `confirm(`
      const calls = (s.match(new RegExp('(?<![\\w.])' + g + '\\s*\\(', 'g')) || []).length;
      if (!calls) continue;
      // Destructured from useDialog anywhere in the file?
      const destructured = new RegExp('const \\{[^}]*\\b' + g + '\\b[^}]*\\} = useDialog\\(\\)').test(s);
      // Or defined locally.
      const defined = new RegExp('(const|function)\\s+' + g + '\\b').test(s);
      if (!destructured && !defined) {
        console.log('  ' + p.replace(/^ExecutiveHub/, '') + '  calls ' + g + '() ' + calls + 'x but never gets it from useDialog');
        findings++;
      }
    }
  }
}
console.log('');
console.log(findings ? findings + ' file(s) using a browser global by accident' : 'clean - every confirm/alert/prompt comes from useDialog');
