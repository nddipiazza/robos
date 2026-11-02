#!/usr/bin/env node
/**
 * Copies every docs/_apps/*.md into site/_apps/ so the front site can publish each
 * app's page at /apps/<slug>/ (layout site/_layouts/app.html).
 *
 * The bodies are written for the v1 docs site, so their links are rewritten:
 *   {{ site.baseurl }}{% link page.md %}   -> /v1/<that page's permalink>
 *   {{ '/apps/<slug>/' | relative_url }}   -> /apps/<slug>/  (stays on the front site)
 *   {{ '/anything/else' | relative_url }}  -> /v1/anything/else
 *   {{ site.baseurl }}                     -> /v1
 * Plain markdown links such as ](/build-apps/solo/) already point at the front site
 * from v1 too, so they are left alone. `related:` URLs are mapped in the layout.
 *
 * Usage: node scripts/stage-site-apps.cjs   (run by scripts/stage-site-data.sh)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const docsDir = path.join(root, 'docs');
const srcDir = path.join(docsDir, '_apps');
const outDir = path.join(root, 'site', '_apps');

const slugs = new Set(fs.readdirSync(srcDir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)));

// v1 URL of a docs page referenced with {% link %}: its permalink, else <name>.html.
function v1PageUrl(rel) {
  const file = path.join(docsDir, rel.trim());
  if (!fs.existsSync(file)) throw new Error(`{% link ${rel} %}: ${file} does not exist`);
  const fm = fs.readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  const permalink = fm && fm[1].match(/^permalink:\s*["']?([^"'\n]+)["']?\s*$/m);
  if (permalink) return `/v1${permalink[1].trim()}`;
  return `/v1/${rel.trim().replace(/\.md$/, '.html')}`;
}

function frontUrl(url) {
  const m = url.match(/^\/apps\/([^/#?]+)\/?(.*)$/);
  if (m && slugs.has(m[1])) return url;
  return `/v1${url}`;
}

function rewriteBody(body) {
  return body
    .replace(/\{\{\s*site\.baseurl\s*\}\}\{%\s*link\s+([^%]+?)\s*%\}/g, (_, rel) => v1PageUrl(rel))
    .replace(/\{%\s*link\s+([^%]+?)\s*%\}/g, (_, rel) => v1PageUrl(rel))
    .replace(/\{\{\s*(['"])(\/[^'"]*)\1\s*\|\s*relative_url\s*\}\}/g, (_, _q, url) => frontUrl(url))
    .replace(/\{\{\s*site\.baseurl\s*\}\}/g, '/v1');
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
for (const slug of [...slugs].sort()) {
  const text = fs.readFileSync(path.join(srcDir, `${slug}.md`), 'utf8');
  const m = text.match(/^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/);
  if (!m) throw new Error(`docs/_apps/${slug}.md has no front matter`);
  fs.writeFileSync(path.join(outDir, `${slug}.md`), m[1] + rewriteBody(m[2]));
}
console.log(`Staged ${slugs.size} app pages into site/_apps/`);
