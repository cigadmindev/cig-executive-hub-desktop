// Copies the Who sees what table (src/data/accessMatrix.js) into the
// functions folder, so emails follow the same table as the screens.
//
// The functions are deployed on their own and cannot reach src/, and the
// table is written as a browser module. This turns it into a CommonJS file,
// functions/accessMatrix.gen.js. It runs before every functions deploy
// (firebase.json predeploy), so the two can never drift apart.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'src/data/accessMatrix.js');
const out = path.join(__dirname, 'functions/accessMatrix.gen.js');

let s = fs.readFileSync(src, 'utf8');
if (/^\s*import\s/m.test(s)) throw new Error('accessMatrix.js now imports something - sync-access-matrix.cjs needs updating.');
const names = [...s.matchAll(/^export (?:const|function|let) (\w+)/gm)].map((m) => m[1]);
s = s.replace(/^export (const|function|let) /gm, '$1 ');
s = '// GENERATED from src/data/accessMatrix.js by sync-access-matrix.cjs - do not edit.\n' + s + '\nmodule.exports = { ' + names.join(', ') + ' };\n';
fs.writeFileSync(out, s);
console.log('accessMatrix.gen.js written (' + names.length + ' exports)');
