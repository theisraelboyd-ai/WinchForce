// Bundles src/view3d.js (plus the parts of three.js it uses) and inlines it
// into index.html between the WF3D markers. Run: npm install && npm run build:3d
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const out = await build({
  entryPoints: ['src/view3d.js'], bundle: true, minify: true, format: 'iife',
  target: ['es2020'], write: false, legalComments: 'none',
});
let js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const banner = '/* WinchForce 3D view — generated from src/view3d.js by tools/build-3d.mjs. Includes three.js (MIT, © three.js authors). Do not edit here. */\n';
const html = readFileSync('index.html', 'utf8');
const start = '<!--WF3D:START-->', end = '<!--WF3D:END-->';
const i = html.indexOf(start), j = html.indexOf(end);
if (i < 0 || j < 0) throw new Error('WF3D markers not found in index.html');
writeFileSync('index.html', html.slice(0, i + start.length) + '\n<script>' + banner + js + '</script>\n' + html.slice(j));
console.log(`3D bundle: ${(js.length / 1024).toFixed(0)} KB inlined`);
