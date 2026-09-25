// Writes dist/version.json at build time. Run by the build scripts.
const fs = require('fs');
const path = require('path');
const dist = path.join(__dirname, 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'version.json'), JSON.stringify({ built: Date.now() }));
console.log('version.json written');
