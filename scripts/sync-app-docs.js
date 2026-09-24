#!/usr/bin/env node
/**
 * Creates a docs page in docs/_apps/ for every RobOS app package that doesn't have one yet.
 *
 * An app is any package under packages/ with a renderer/ directory or a *.desktop file.
 * New pages get their title and summary from the .desktop entry (falling back to
 * package.json) and land in the "More apps" section of the App Directory until you
 * give them a `category:` from docs/_data/app_categories.yml. Existing pages are never
 * touched.
 *
 * Usage:
 *   node scripts/sync-app-docs.js           # create missing pages
 *   node scripts/sync-app-docs.js --check   # list missing pages, exit 1 if any
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packagesDir = path.join(root, 'packages');
const appsDir = path.join(root, 'docs', '_apps');
const iconsDir = path.join(root, 'docs', 'assets', 'images', 'icons');
const checkOnly = process.argv.includes('--check');

function readDesktopEntry(dir) {
  const file = fs.readdirSync(dir).find((f) => f.endsWith('.desktop'));
  if (!file) return null;
  const entry = {};
  for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
    const m = line.match(/^(Name|Comment)=(.*)$/);
    if (m && !(m[1] in entry)) entry[m[1]] = m[2].trim();
  }
  return entry;
}

const ACRONYMS = new Set(['mcp', 'ci', 'cli', 'ide', 'api', 'ai', 'db', 'pr', 'ui']);
function titleCase(name) {
  return name
    .replace(/^robos-/, '')
    .split('-')
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

const missing = [];
for (const name of fs.readdirSync(packagesDir).sort()) {
  const dir = path.join(packagesDir, name);
  if (!fs.statSync(dir).isDirectory()) continue;
  const desktop = readDesktopEntry(dir);
  const isApp = desktop || fs.existsSync(path.join(dir, 'renderer'));
  if (!isApp || fs.existsSync(path.join(appsDir, `${name}.md`))) continue;
  missing.push(name);
  if (checkOnly) continue;

  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch {}
  const title = (desktop && desktop.Name) || pkg.productName || titleCase(name);
  const summary = (desktop && desktop.Comment) || pkg.description || '';

  let icon = `${name}.svg`;
  if (!fs.existsSync(path.join(iconsDir, icon))) {
    const src = path.join(dir, 'icon.svg');
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(iconsDir, icon));
    else icon = null;
  }

  const lines = ['---', `title: ${JSON.stringify(title)}`, `package: ${name}`, 'category: ""'];
  if (icon) lines.push(`icon: ${icon}`);
  lines.push(`summary: ${JSON.stringify(summary)}`, '---', '');
  fs.writeFileSync(path.join(appsDir, `${name}.md`), lines.join('\n'));
  console.log(`created docs/_apps/${name}.md`);
}

if (checkOnly && missing.length) {
  console.error(`Apps without a docs page: ${missing.join(', ')}\nRun: node scripts/sync-app-docs.js`);
  process.exit(1);
}
if (!missing.length) console.log('Every app has a docs page.');
