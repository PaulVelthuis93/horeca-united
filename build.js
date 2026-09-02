#!/usr/bin/env node
// Inlines src/style.css, src/template.html (body), and src/app.js into index.html.
// No dependencies — plain Node.js.
// Usage: node build.js

const fs = require('fs');
const path = require('path');

const root = __dirname;
const style  = fs.readFileSync(path.join(root, 'src/style.css'),    'utf8');
const body   = fs.readFileSync(path.join(root, 'src/body.html'),    'utf8');
const script = fs.readFileSync(path.join(root, 'src/app.js'),       'utf8');
const tmpl   = fs.readFileSync(path.join(root, 'src/template.html'),'utf8');

const out = tmpl
  .replace('<!-- STYLE -->', style)
  .replace('<!-- BODY -->',  body)
  .replace('<!-- SCRIPT -->', script);

fs.writeFileSync(path.join(root, 'index.html'), out, 'utf8');
console.log(`Built index.html (${Math.round(out.length / 1024)} KB)`);
