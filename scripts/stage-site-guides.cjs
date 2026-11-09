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
const normalize = url => {
  const clean = url.replace(/\.html(?=[#?]|$)/, '/').replace(/\/index\/$/, '/');
  return /\.[a-z0-9]+(?=[#?]|$)/i.test(clean) || clean.endsWith('/') ? clean : `${clean}/`;
};
const supersededRootGuides = new Map([
  ['index.md', '/'],
  ['apps.md', '/apps/'],
  ['404.md', '/404.html'],
  ['home-assistant-voice.md', '/home-assistant-voice/'],
  ['p2p.md', '/p2p/'],
  ['physical-keys.md', '/physical-keys/'],
  ['security.md', '/security/'],
  ['tv.md', '/tv/'],
]);
const canonicalElearningMirrors = new Map([
  ['projects/crpg-realm/elearning/index.html', 'https://rowbose.com/elearning/robos-crpg/'],
  ['projects/crpg-realm/create-your-own-game/elearning/index.html', 'https://rowbose.com/elearning/crpg-game-builder/'],
  ['projects/kgraph-parse-portal/elearning/index.html', 'https://rowbose.com/elearning/kgraph-parse-portal/'],
]);
const occupied = new Set(files(site).filter(f => !f.includes('/_guides/') && /\.(md|html)$/.test(f))
  .map(f => field(frontMatter(fs.readFileSync(f, 'utf8'))?.[1] || '', 'permalink')).filter(Boolean).map(normalize));
const sources = files(docs).filter(f => {
  const rel = path.relative(docs, f).replaceAll(path.sep, '/');
  return /\.(md|html)$/.test(rel) && !/^(?:_|assets\/|elearning\/|project-plan\/|issues\/|ideas\/inbox\/)/.test(rel)
    && path.basename(rel) !== 'README.md' && !supersededRootGuides.has(rel)
    && frontMatter(fs.readFileSync(f, 'utf8'));
});
const routes = new Map(supersededRootGuides);
const oldRoutes = new Map([
  ['/apps.html', '/apps/'],
  ['/home-assistant-voice.html', '/home-assistant-voice/'],
  ['/p2p.html', '/p2p/'],
  ['/physical-keys.html', '/physical-keys/'],
  ['/security.html', '/security/'],
  ['/tv.html', '/tv/'],
  ['/projects/crpg-realm/game-creation-process.html', '/projects/crpg-realm/reference/'],
  ['/projects/crpg-realm/game-creation-process/', '/projects/crpg-realm/reference/'],
  ['/projects/crpg-realm/elearning.html', '/elearning/robos-crpg/'],
  ['/projects/crpg-realm/elearning/', '/elearning/robos-crpg/'],
  ['/projects/crpg-realm/create-your-own-game/elearning.html', '/elearning/crpg-game-builder/'],
  ['/projects/crpg-realm/create-your-own-game/elearning/', '/elearning/crpg-game-builder/'],
  ['/projects/kgraph-parse-portal/elearning.html', '/elearning/kgraph-parse-portal/'],
  ['/projects/kgraph-parse-portal/elearning/', '/elearning/kgraph-parse-portal/'],
]);
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
  if (!canonicalElearningMirrors.has(rel)) oldRoutes.set(old, canonical);
}
function cleanRedirects(meta, permalink) {
  const bare = permalink.replace(/\/$/, '');
  return meta.replace(/^redirect_from:[ \t]*\r?\n((?:[ \t]*-[ \t]+\S+[ \t]*(?:\r?\n|$))+)/m, (full, list) => {
    const trailingNewline = full.endsWith('\n') ? '\n' : '';
    const seen = new Set();
    const items = [];
    for (const m of list.matchAll(/^[ \t]*-[ \t]+(\S+)[ \t]*$/gm)) {
      const raw = m[1];
      const candidates = raw.endsWith('.html') ? [raw, normalize(raw)] : [raw];
      for (const c of candidates) {
        if (c === permalink || c === bare || seen.has(c)) continue;
        seen.add(c);
        items.push(`  - ${c}`);
      }
    }
    return items.length ? `redirect_from:\n${items.join('\n')}${trailingNewline}` : '';
  });
}
function rewrite(text, source = '') {
  return text
    .replace(/\{\{\s*site\.baseurl\s*\}\}\s*(?={%\s*link)/g, '')
    .replace(/{%\s*link\s+([^%]+?)\s*%}/g, (_, rel) => {
      const target = routes.get(rel.trim());
      if (!target) throw new Error(`${source}: unknown link ${rel}`);
      return target;
    })
    .replace(/(https?:\/\/(?:www\.)?rowbose\.com|['"(\s])(\/[^'"\s)<>`#?]+)(?=['")\s#?]|$)/g, (_, before, url) => {
      return before + (oldRoutes.get(url) || url);
    });
}
const out = path.join(site, '_guides');
fs.mkdirSync(out, { recursive: true });
const wanted = new Set();
for (const file of sources) {
  const rel = path.relative(docs, file);
  const relPosix = rel.replaceAll(path.sep, '/');
  const text = fs.readFileSync(file, 'utf8');
  const fm = frontMatter(text);
  const standalone = ['null', 'none', 'false'].includes(field(fm[1], 'layout'));
  const permalink = routes.get(relPosix);
  let meta = fm[1].replace(/^layout:.*$/m, standalone ? 'layout: none' : 'layout: guide').replace(/^permalink:.*\n?/m, '');
  if (!/^layout:/m.test(meta)) meta += standalone ? '\nlayout: none' : '\nlayout: guide';
  meta = cleanRedirects(meta, permalink);
  if (relPosix.startsWith('ideas/specs/') && !/^parent:/m.test(meta)) {
    meta += '\nparent: Ideas\ngrand_parent: Roadmap';
  } else if (relPosix === 'windows-startup-audit.md' && !/^parent:/m.test(meta)) {
    meta += '\nparent: Build on RobOS';
  } else if (relPosix === 'system-documentation/index.html') {
    meta = meta.replace(/^parent:\s*System Architecture$/m, 'parent: Architecture')
      .replace(/^grand_parent:\s*RobOS Platform$/m, 'grand_parent: Build on RobOS');
  }
  const canonicalMirror = canonicalElearningMirrors.get(relPosix);
  if (canonicalMirror && !/^sitemap:/m.test(meta)) meta += '\nsitemap: false';
  meta += `\npermalink: ${permalink}`;
  let body = rewrite(text.slice(fm[0].length), rel);
  body = body.replace(/([\"'(])(?:\.\.\/|\.\/)?assets\//g, '$1/assets/');
  if (canonicalMirror) {
    body = body.replace(/<link rel="canonical" href="[^"]+">/, `<link rel="canonical" href="${canonicalMirror}">`);
  }
  if (!standalone) body = body.replace(/^\s*# [^\n]+\n(?:\{:[^\n]+\}\n)?/, '');
  const target = path.join(out, rel);
  wanted.add(target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `---\n${meta.trim()}\n---\n${body}`);
}
// Enumerate stale generated files before removing these exact paths.
for (const file of files(out).filter(f => !wanted.has(f))) {
  console.log(`Removing stale generated guide: ${path.relative(root, file)}`);
  fs.unlinkSync(file);
}
for (const file of files(path.join(site, '_apps')).filter(f => f.endsWith('.md'))) {
  const text = fs.readFileSync(file, 'utf8');
  const fm = frontMatter(text);
  const body = fm ? text.slice(fm[0].length) : text;
  if (body !== rewrite(body, file)) throw new Error(`${path.relative(root, file)}: replace legacy links with root site URLs`);
}
for (const dir of ['images', 'videos', 'evidence', 'js']) {
  fs.cpSync(path.join(docs, 'assets', dir), path.join(site, 'assets', dir), { recursive: true });
}
for (const file of ['site.webmanifest', 'favicon.ico']) fs.copyFileSync(path.join(docs, file), path.join(site, file));
for (const dir of ['mcp']) fs.cpSync(path.join(docs, dir), path.join(site, dir), { recursive: true });
fs.mkdirSync(path.join(site, 'schemas'), { recursive: true });
fs.copyFileSync(path.join(docs, 'schemas/ontology.jsonld'), path.join(site, 'schemas/ontology.jsonld'));
console.log(`Staged ${sources.length} reference guides with the current site layout.`);
