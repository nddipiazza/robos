#!/usr/bin/env node
'use strict';
// Validate the rendered migration: package coverage, canonical routes, links, and Search Console indexing invariants.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || '_site');
const SITE_ORIGIN = 'https://rowbose.com';

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
  assert.ok(html.includes(`rel="canonical" href="${SITE_ORIGIN}/${name}/"`), `${name}: incorrect canonical URL`);
  assert.ok(html.includes('/assets/site.css'), `${name}: missing current site formatting`);
}

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

function resolveHtmlPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const direct = path.join(output, decoded);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile() && direct.endsWith('.html')) return direct;
  const idx = path.join(direct, 'index.html');
  if (fs.existsSync(idx)) return idx;
  const htmlFallback = `${direct.replace(/\/$/, '')}.html`;
  if (fs.existsSync(htmlFallback) && fs.statSync(htmlFallback).isFile()) return htmlFallback;
  return null;
}

function fileToCanonicalPath(file) {
  const rel = path.relative(output, file).replaceAll(path.sep, '/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'index.html'.length)}`;
  return `/${rel}`;
}

const htmlFiles = files(output).filter(f => f.endsWith('.html'));
const redirectFiles = new Set();
const noindexFiles = new Set();
const outgoingLinks = new Map();

let count = 0;
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(output, file).replaceAll(path.sep, '/');
  assert.ok(!/<a\b[^>]*>\s*(?:Docs|Classic docs \(v1\))\s*<\/a>/i.test(html), `${rel}: legacy Docs tab`);
  assert.ok(!/(?:href|src)=["'](?:https?:\/\/(?:www\.)?rowbose\.com)?\/(?:v1(?:\/|["'])|docs(?:\/|["']))/.test(html), `${rel}: legacy docs URL`);

  const isRedirect = /<meta\b[^>]*http-equiv=["']refresh["']/i.test(html);
  const isNoindex = /<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html);
  if (isRedirect) redirectFiles.add(file);
  if (isNoindex) noindexFiles.add(file);

  const markup = html.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2');
  const doctypeCount = (markup.match(/<!doctype\s+html/gi) || []).length;
  assert.ok(doctypeCount <= 1, `${rel}: duplicate <!doctype html> (${doctypeCount})`);
  const pageLinks = new Set();
  for (const tag of markup.matchAll(/<(?:a|img|script|link|video)\b[^>]*>/g)) {
    const isAnchor = /^<a\b/i.test(tag[0]);
    for (const match of tag[0].matchAll(/\s(?:href|src|poster)=["']([^"']+)["']/g)) {
      const url = new URL(match[1], `${SITE_ORIGIN}/${rel}`);
      if (url.origin !== SITE_ORIGIN || !url.pathname.startsWith('/')) continue;
      const target = path.join(output, decodeURIComponent(url.pathname));
      assert.ok((fs.existsSync(target) && fs.statSync(target).isFile()) || fs.existsSync(path.join(target, 'index.html')), `${rel}: missing ${url.pathname}`);
      if (isAnchor) {
        const htmlTarget = resolveHtmlPath(url.pathname);
        if (htmlTarget) pageLinks.add(htmlTarget);
      }
    }
  }
  outgoingLinks.set(file, pageLinks);
  count++;
}

// Indexable pages must link directly to canonical targets, never to redirect stubs.
for (const [file, targets] of outgoingLinks) {
  if (redirectFiles.has(file) || noindexFiles.has(file)) continue;
  const rel = path.relative(output, file).replaceAll(path.sep, '/');
  for (const target of targets) {
    assert.ok(!redirectFiles.has(target), `${rel}: links to redirect stub ${fileToCanonicalPath(target)}`);
  }
}

// Validate robots.txt RFC 9309 precedence: every User-agent group must disallow /404.html.
const robotsTxt = fs.readFileSync(path.join(output, 'robots.txt'), 'utf8');
const uaGroups = robotsTxt.split(/\n\s*\n/).filter(block => /^User-agent:/m.test(block));
assert.ok(uaGroups.length > 0, 'robots.txt: missing User-agent groups');
for (const group of uaGroups) {
  assert.match(group, /^Disallow:\s*\/404\.html\s*$/m, `robots.txt User-agent group missing Disallow: /404.html:\n${group}`);
}

// Validate sitemap.xml: every <loc> must be an indexable, non-redirect HTML page with matching canonical, unique title/description, and >=1 inbound crawl path from /.
const sitemapXml = fs.readFileSync(path.join(output, 'sitemap.xml'), 'utf8');
const sitemapLocs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
assert.ok(sitemapLocs.length > 0, 'sitemap.xml: no <loc> entries found');

const reachable = new Set();
const rootFile = path.join(output, 'index.html');
const queue = [rootFile];
reachable.add(rootFile);
while (queue.length > 0) {
  const cur = queue.shift();
  for (const next of outgoingLinks.get(cur) || []) {
    if (!reachable.has(next)) {
      reachable.add(next);
      queue.push(next);
    }
  }
}

const seenTitles = new Map();
const seenDescriptions = new Map();
for (const loc of sitemapLocs) {
  const url = new URL(loc);
  assert.equal(url.origin, SITE_ORIGIN, `sitemap.xml: unexpected origin in ${loc}`);
  assert.ok(!/\.(?:pdf|xml|json|txt)$/i.test(url.pathname), `sitemap.xml: non-HTML resource ${loc}`);
  const file = resolveHtmlPath(url.pathname);
  assert.ok(file, `sitemap.xml: ${loc} does not resolve to a rendered HTML file`);
  const rel = path.relative(output, file).replaceAll(path.sep, '/');
  assert.ok(!redirectFiles.has(file), `sitemap.xml includes redirect stub: ${loc} (${rel})`);
  assert.ok(!noindexFiles.has(file), `sitemap.xml includes noindex page: ${loc} (${rel})`);
  assert.ok(reachable.has(file), `sitemap.xml orphan page (not reachable via links from /): ${loc} (${rel})`);

  const html = fs.readFileSync(file, 'utf8');
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || html;
  const canonicals = [...head.matchAll(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/gi)].map(m => m[1]);
  assert.equal(canonicals.length, 1, `${rel}: expected 1 canonical link, found ${canonicals.length}`);
  assert.equal(canonicals[0], loc, `${rel}: canonical ${canonicals[0]} !== sitemap loc ${loc}`);

  const title = head.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  assert.ok(title, `${rel}: missing <title>`);
  assert.ok(!seenTitles.has(title), `${rel}: duplicate <title> "${title}" (also on ${seenTitles.get(title)})`);
  seenTitles.set(title, rel);

  const desc = head.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1]?.trim();
  assert.ok(desc, `${rel}: missing <meta name="description">`);
  assert.ok(!seenDescriptions.has(desc), `${rel}: duplicate meta description (also on ${seenDescriptions.get(desc)})`);
  seenDescriptions.set(desc, rel);
}

assert.ok(!fs.existsSync(path.join(output, 'v1')), 'The legacy v1 site must not be published');
assert.ok(!fs.existsSync(path.join(output, 'docs/index.html')), 'The retired Docs hub must not be published');
console.log(`Verified ${packages.length} package pages, ${sitemapLocs.length} indexable sitemap URLs (0 orphans, 0 redirects, 0 duplicates), and links across ${count} rendered HTML pages.`);
