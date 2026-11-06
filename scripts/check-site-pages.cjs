#!/usr/bin/env node
'use strict';
// Validate the rendered migration: package coverage, canonical routes and links.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || '_site');
const packages = fs.readdirSync(path.join(root, 'packages'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
const pages = path.join(root, 'site/_apps');
const directory = fs.readFileSync(path.join(output, 'apps/index.html'), 'utf8');
for (const name of packages) {
  const source = path.join(pages, `${name}.md`);
  assert.ok(fs.existsSync(source), `Missing source page for ${name}`);
  const text = fs.readFileSync(source, 'utf8');
  assert.match(text, new RegExp(`^package: ${name}$`, 'm'), `${name}: wrong package`);
  assert.ok(text.split(/^---$/m).slice(2).join('---').trim(), `${name}: empty guide`);
  assert.ok(directory.includes(`href="/${name}/"`), `${name}: directory must link to its root page`);
  const file = path.join(output, name, 'index.html');
  assert.ok(fs.existsSync(file), `Missing root page /${name}/`);
  const html = fs.readFileSync(file, 'utf8');
  assert.ok(html.includes(`rel="canonical" href="https://rowbose.com/${name}/"`), `${name}: incorrect canonical URL`);
  assert.ok(html.includes('/assets/site.css'), `${name}: missing current site formatting`);
}
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
let count = 0;
for (const file of files(output).filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync(file, 'utf8');
  assert.ok(!/<a\b[^>]*>\s*(?:Docs|Classic docs \(v1\))\s*<\/a>/i.test(html), `${file}: legacy Docs tab`);
  assert.ok(!/(?:href|src)=["'](?:https?:\/\/(?:www\.)?rowbose\.com)?\/(?:v1(?:\/|["'])|docs(?:\/|["']))/.test(html), `${file}: legacy docs URL`);
  const markup = html.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2');
  for (const tag of markup.matchAll(/<(?:a|img|script|link|video)\b[^>]*>/g)) {
    for (const match of tag[0].matchAll(/\s(?:href|src|poster)=["']([^"']+)["']/g)) {
      const url = new URL(match[1], `https://rowbose.com/${path.relative(output, file).replaceAll(path.sep, '/')}`);
      if (url.origin !== 'https://rowbose.com' || !url.pathname.startsWith('/')) continue;
      const target = path.join(output, decodeURIComponent(url.pathname));
      assert.ok((fs.existsSync(target) && fs.statSync(target).isFile()) || fs.existsSync(path.join(target, 'index.html')), `${path.relative(output, file)}: missing ${url.pathname}`);
    }
  }
  count++;
}
assert.ok(!fs.existsSync(path.join(output, 'v1')), 'The legacy v1 site must not be published');
assert.ok(!fs.existsSync(path.join(output, 'docs/index.html')), 'The retired Docs hub must not be published');
console.log(`Verified ${packages.length} package pages and links across ${count} rendered HTML pages.`);
