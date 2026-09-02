// Finds identifiers referenced before their own `const` or `let` declaration,
// where the reference actually executes during the same synchronous pass.
//
// This is the one class of bug that gets past every other check: it parses, it
// type-checks, it builds, and it throws the moment the screen renders. It has
// blanked two screens - the calendar, where isChecklist sat above real, and
// expenses, where the grouped filter used today before it was declared.
//
// The distinction that matters, and the reason a text scan cannot do this:
//
//   const grouped = useMemo(() => { ...today... });   <- runs now. Throws.
//   const handler = () => { ...doRemove... };         <- runs later. Fine.
//   type T = { addRequest: (r: R) => void };          <- not code at all.
//
// All three look identical to a line-based scan. In a syntax tree they are
// different kinds of node.
//
// Usage:  node _check_tdz.js
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOTS = ['src'];
const EXT = /\.(jsx?|tsx?)$/;

// Callbacks that run immediately as part of the statement containing them. A
// reference inside one of these runs now; inside anything else - an event
// handler, a promise callback, a function that is returned or stored - it runs
// later, by which time the declaration exists.
const IMMEDIATE_CALLS = new Set([
  'useMemo',
  'map',
  'filter',
  'forEach',
  'find',
  'findIndex',
  'some',
  'every',
  'reduce',
  'sort',
  'flatMap',
]);

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ObjectMethod',
  'ClassMethod',
]);

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walkFiles(p, out);
    else if (EXT.test(f.name)) out.push(p);
  }
  return out;
}

function walkNode(node, visit, parents = []) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parents);
  const next = parents.concat(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
    const child = node[key];
    if (Array.isArray(child)) child.forEach((c) => walkNode(c, visit, next));
    else if (child && typeof child.type === 'string') walkNode(child, visit, next);
  }
}

let findings = 0;
let scanned = 0;
let unparsed = 0;

for (const root of ROOTS) {
  for (const file of walkFiles(root)) {
    scanned++;
    let ast;
    try {
      ast = parser.parse(fs.readFileSync(file, 'utf8'), {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true,
      });
    } catch (err) {
      console.log('  ' + file + '  could not parse: ' + err.message.split('\n')[0]);
      unparsed++;
      continue;
    }

    walkNode(ast, (fn) => {
      if (!FUNCTION_TYPES.has(fn.type)) return;
      const body = fn.body;
      if (!body || body.type !== 'BlockStatement') return;

      // This function body's own const/let declarations. `var` is hoisted and
      // has no dead zone.
      const declared = new Map();
      for (const stmt of body.body) {
        if (stmt.type !== 'VariableDeclaration' || stmt.kind === 'var') continue;
        for (const d of stmt.declarations) {
          if (d.id.type === 'Identifier' && !declared.has(d.id.name)) {
            declared.set(d.id.name, stmt.loc.start.line);
          }
        }
      }
      if (declared.size === 0) return;

      for (const stmt of body.body) {
        if (stmt.type !== 'VariableDeclaration' || stmt.kind === 'var') continue;

        walkNode(stmt, (node, parents) => {
          if (node.type !== 'Identifier') return;

          const declLine = declared.get(node.name);
          if (declLine === undefined) return;
          if (node.loc.start.line >= declLine) return;

          const parent = parents[parents.length - 1];

          // Its own declaration.
          if (parent && parent.type === 'VariableDeclarator' && parent.id === node) return;
          // obj.name is not a reference to a variable called name.
          if (parent && parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return;
          // { name: ... } - the key is not a reference.
          if (parent && (parent.type === 'ObjectProperty' || parent.type === 'ObjectMethod') && parent.key === node && !parent.computed) return;
          // Function parameters shadow anything outside.
          if (parent && FUNCTION_TYPES.has(parent.type) && (parent.params ?? []).includes(node)) return;
          // Type positions are not runtime code.
          if (parents.some((p) => p.type.startsWith('TS'))) return;

          // Walk out to the statement. If every function on the way is one
          // that runs immediately, this reference runs now.
          let runsNow = true;
          for (let i = parents.length - 1; i >= 0; i--) {
            const p = parents[i];
            if (p === stmt) break;
            if (!FUNCTION_TYPES.has(p.type)) continue;

            const outer = parents[i - 1];
            if (!outer || outer.type !== 'CallExpression' || !(outer.arguments ?? []).includes(p)) {
              runsNow = false;
              break;
            }
            const callee = outer.callee;
            const name =
              callee.type === 'Identifier'
                ? callee.name
                : callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
                ? callee.property.name
                : null;
            if (!name || !IMMEDIATE_CALLS.has(name)) {
              runsNow = false;
              break;
            }
          }
          if (!runsNow) return;

          console.log(
            '  ' + file + ':' + node.loc.start.line +
            '  uses "' + node.name + '", declared at line ' + declLine
          );
          findings++;
        });
      }
    });
  }
}

console.log('');
console.log('scanned ' + scanned + ' files; ' + findings + ' finding(s)' + (unparsed ? '; ' + unparsed + ' unparsed' : ''));
if (findings) {
  console.log('');
  console.log('Each of these runs before its own declaration and will throw when the');
  console.log('screen renders. The build and the type check cannot see it.');
}
