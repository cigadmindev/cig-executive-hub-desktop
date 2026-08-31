const fs = require('fs'), path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const GLOBALS = new Set(['window','document','console','Math','JSON','Object','Array','String','Number','Boolean','Date','Promise','Set','Map','WeakMap','RegExp','Error','TypeError','parseInt','parseFloat','isNaN','isFinite','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame','fetch','URL','URLSearchParams','Blob','File','FileReader','FormData','Intl','localStorage','sessionStorage','navigator','location','alert','confirm','prompt','process','require','module','exports','__dirname','__filename','globalThis','undefined','NaN','Infinity','Symbol','Proxy','Reflect','BigInt','ArrayBuffer','Uint8Array','TextEncoder','TextDecoder','structuredClone','crypto','atob','btoa','queueMicrotask','AbortController','Image','Audio','Event','CustomEvent','MutationObserver','IntersectionObserver','ResizeObserver','HTMLElement','Node','getComputedStyle','matchMedia','performance','history','screen','top','self','frames','React','encodeURIComponent','decodeURIComponent','encodeURI','decodeURI']);
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.jsx?$/.test(e.name)) files.push(p);
  }
})('src');
let n = 0;
for (const f of files) {
  let ast;
  try { ast = parser.parse(fs.readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }); }
  catch (e) { console.log('PARSE FAIL ' + f + ' ' + e.message); n++; continue; }
  traverse(ast, {
    Program(p) {
      for (const [name, b] of Object.entries(p.scope.globals || {})) {
        if (!GLOBALS.has(name)) { console.log(f + ':' + b.loc.start.line + '  unresolved identifier "' + name + '"'); n++; }
      }
    }
  });
}
console.log('scanned ' + files.length + ' files; ' + n + ' finding(s)');
