#!/usr/bin/env node
'use strict';
// Every package (desktop app, service, CLI or library) has a tracked site page.
// Existing hand-written content is never replaced.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const packages = path.join(root, 'packages');
const pages = path.join(root, 'site/_apps');
const icons = path.join(root, 'docs/assets/images/icons');
const check = process.argv.includes('--check');
const missing = [];
const acronyms = new Set(['mcp', 'ci', 'cli', 'ide', 'api', 'ai', 'db', 'pr', 'ui', 'llm', 'jrpg']);
const titleCase = name => name.split('-').map(w => w === 'robos' ? 'RobOS' : acronyms.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)).join(' ');
for (const name of fs.readdirSync(packages).sort()) {
  const dir = path.join(packages, name);
  if (!fs.statSync(dir).isDirectory()) continue;
  const page = path.join(pages, `${name}.md`);
  if (fs.existsSync(page)) continue;
  missing.push(name);
  if (check) continue;
  let pkg = {};
  try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch {}
  const desktopFile = fs.readdirSync(dir).find(f => f.endsWith('.desktop'));
  const desktop = desktopFile ? fs.readFileSync(path.join(dir, desktopFile), 'utf8') : '';
  const title = desktop.match(/^Name=(.*)$/m)?.[1] || pkg.productName || titleCase(name);
  const summary = desktop.match(/^Comment=(.*)$/m)?.[1] || pkg.description || `Source component for ${title}.`;
  const isApp = Boolean(desktopFile || fs.existsSync(path.join(dir, 'renderer')));
  const category = isApp ? '' : 'libraries';
  const source = `https://github.com/nddipiazza/robos/tree/main/packages/${name}`;
  const entry = pkg.main && fs.existsSync(path.join(dir, pkg.main)) ? pkg.main : null;
  const meta = ['---', `title: ${JSON.stringify(title)}`, `package: ${name}`, `category: ${JSON.stringify(category)}`,
    `component_type: ${isApp ? 'app' : 'component'}`, `permalink: /${name}/`, `summary: ${JSON.stringify(summary)}`, `description: ${JSON.stringify(summary)}`];
  if (fs.existsSync(path.join(dir, 'icon.svg'))) {
    fs.copyFileSync(path.join(dir, 'icon.svg'), path.join(icons, `${name}.svg`));
    meta.push(`icon: ${name}.svg`);
  }
  meta.push('---', '', summary, '', '## Source and integration', '', `The component lives in [\`packages/${name}\`](${source}).`);
  if (entry) meta.push('', `Its entry point is [\`${entry}\`](${source}/${entry}).`);
  if (fs.existsSync(path.join(dir, 'README.md'))) meta.push('', `See the [package README](${source}/README.md) for setup and usage.`);
  if (pkg.scripts?.start && (!pkg.main || entry)) meta.push('', '## Run from source', '', `From \`packages/${name}\`, install the dependencies and run:`, '', '```bash', 'npm install', 'npm start', '```');
  if (pkg.scripts?.test) meta.push('', '## Validation', '', `Run \`npm test\` from \`packages/${name}\`. The command is defined in the [package manifest](${source}/package.json).`);
  if (!entry && pkg.main) meta.push('', `The manifest declares \`${pkg.main}\`, but that file is not present in the checkout. This package is incomplete.`);
  fs.writeFileSync(page, meta.join('\n') + '\n');
  console.log(`Created site/_apps/${name}.md`);
}
if (missing.length && check) {
  console.error(`Packages without a page: ${missing.join(', ')}\nRun node scripts/sync-app-docs.js`);
  process.exitCode = 1;
} else console.log('Every app and component has a site page.');
