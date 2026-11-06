#!/usr/bin/env node
'use strict';
// docs/ keeps generated references, screenshots and internal project notes.
// Only public references are staged; all use the current site's guide layout.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const docs = path.join(root, 'docs');
const site = path.join(root, 'site');
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
function field(text, name) {
  return text.match(new RegExp(`^${name}:\\s*["']?([^\\n"']+?)["']?\\s*$`, 'm'))?.[1];
}
const frontMatter = text => text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
const normalize = url => url.replace(/\.html(?=[#?]|$)/, '/').replace(/\/index\/$/, '/');
const occupied = new Set(files(site).filter(f => !f.includes('/_guides/') && /\.(md|html)$/.test(f))
  .map(f => field(frontMatter(fs.readFileSync(f, 'utf8'))?.[1] || '', 'permalink')).filter(Boolean));
const sources = files(docs).filter(f => {
  const rel = path.relative(docs, f).replaceAll(path.sep, '/');
  return /\.(md|html)$/.test(rel) && !/^(?:_|assets\/|project-plan\/|issues\/|ideas\/inbox\/)/.test(rel)
    && path.basename(rel) !== 'README.md' && !['index.md', 'apps.md', '404.md'].includes(rel)
    && frontMatter(fs.readFileSync(f, 'utf8'));
});
const routes = new Map([['index.md', '/'], ['apps.md', '/apps/'], ['404.md', '/404.html']]);
const oldRoutes = new Map([['/apps.html', '/apps/']]);
for (const file of fs.readdirSync(path.join(site, '_apps'))) {
  if (!file.endsWith('.md')) continue;
  const slug = file.slice(0, -3);
  routes.set(`_apps/${file}`, `/${slug}/`);
  oldRoutes.set(`/apps/${slug}/`, `/${slug}/`);
}
for (const file of sources) {
  const rel = path.relative(docs, file).replaceAll(path.sep, '/');
  const fm = frontMatter(fs.readFileSync(file, 'utf8'))[1];
  const old = field(fm, 'permalink') || `/${rel.replace(/\.(md|html)$/, '.html')}`;
  const canonical = normalize(old);
  const output = occupied.has(canonical) ? canonical.replace(/\/$/, '') + '/reference/' : canonical;
  if (occupied.has(output)) throw new Error(`Duplicate guide route: ${output} (${rel})`);
  occupied.add(output);
  routes.set(rel, output);
  oldRoutes.set(old, canonical);
}
function rewrite(text, source = '') {
  for (const [old, target] of oldRoutes) {
    if (old !== target) text = text.split(old).join(target);
  }
  return text
    .replace(/\{\{\s*site\.baseurl\s*\}\}\s*(?={%\s*link)/g, '')
    .replace(/{%\s*link\s+([^%]+?)\s*%}/g, (_, rel) => {
      const target = routes.get(rel.trim());
      if (!target) throw new Error(`${source}: unknown link ${rel}`);
      return target;
    })
    .replace(/(['"(])(\/[^'"\s)<>]+)(?=['")])/g, (_, before, url) => {
      const [base, suffix = ''] = url.split(/(?=[#?])/s);
      return before + (oldRoutes.get(base) || base) + suffix;
    });
}
const out = path.join(site, '_guides');
fs.mkdirSync(out, { recursive: true });
const wanted = new Set();
for (const file of sources) {
  const rel = path.relative(docs, file);
  const text = fs.readFileSync(file, 'utf8');
  const fm = frontMatter(text);
  let meta = fm[1].replace(/^layout:.*$/m, 'layout: guide').replace(/^permalink:.*\n?/m, '');
  if (!/^layout:/m.test(meta)) meta += '\nlayout: guide';
  meta = meta.replace(/^(\s+- )(\/\S+\.html)$/gm, (_, prefix, alias) => `${prefix}${alias}\n${prefix}${normalize(alias)}`);
  meta += `\npermalink: ${routes.get(rel.replaceAll(path.sep, '/'))}`;
  const standalone = field(fm[1], 'layout') === 'null';
  if (standalone) meta = meta.replace('layout: guide', 'layout: null');
  let body = rewrite(text.slice(fm[0].length), rel);
  body = body.replace(/([\"'(])(?:\.\.\/|\.\/)?assets\//g, '$1/assets/');
  if (!standalone) body = body.replace(/^\s*# [^\n]+\n(?:\{:[^\n]+\}\n)?/, '');
  const target = path.join(out, rel);
  wanted.add(target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `---\n${meta}\n---\n${body}`);
}
// Enumerate stale generated files before removing these exact paths.
for (const file of files(out).filter(f => !wanted.has(f))) {
  console.log(`Removing stale generated guide: ${path.relative(root, file)}`);
  fs.unlinkSync(file);
}
for (const file of files(path.join(site, '_apps')).filter(f => f.endsWith('.md'))) {
  const text = fs.readFileSync(file, 'utf8');
  const updated = rewrite(text, file);
  if (text !== updated) throw new Error(`${path.relative(root, file)}: replace legacy links with root site URLs`);
}
for (const dir of ['images', 'videos', 'evidence', 'js']) {
  fs.cpSync(path.join(docs, 'assets', dir), path.join(site, 'assets', dir), { recursive: true });
}
for (const file of ['site.webmanifest', 'favicon.ico']) fs.copyFileSync(path.join(docs, file), path.join(site, file));
for (const dir of ['mcp']) fs.cpSync(path.join(docs, dir), path.join(site, dir), { recursive: true });
fs.mkdirSync(path.join(site, 'schemas'), { recursive: true });
fs.copyFileSync(path.join(docs, 'schemas/ontology.jsonld'), path.join(site, 'schemas/ontology.jsonld'));
console.log(`Staged ${sources.length} reference guides with the current site layout.`);
