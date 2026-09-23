'use strict';
// App Wizard greenfield generator: web apps come from templates/nextjs-vercel-web (getemgigs.com launch kit).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { generateNewApp, initialsFor } = require('../../../app-wizard/lib/generate-app');

function fakeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-wizard-'));
  fs.mkdirSync(path.join(root, '.robos', 'kgraphs', 'applications'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'projects'), { recursive: true });
  fs.writeFileSync(path.join(root, '.robos', 'packages.yaml'), 'packages:\n');
  fs.writeFileSync(
    path.join(root, '.robos', 'kgraphs', 'applications', 'package.jsonld'),
    JSON.stringify({ '@id': 'urn:robos:package:applications', 'robos:nodes': [] }),
  );
  return root;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

const SPEC = {
  name: "Joe's Rehearsal Room",
  slug: 'rehearsal-room',
  archetype: 'robos:FrontEndApp',
  technology: 'Next.js 15 / React (Vercel + GitHub)',
  deploy: 'vercel',
  domain: 'https://www.rehearsalroom.app/',
  tagline: 'Book a room. Play "loud".',
  description: 'Book rehearsal studios by the hour — no phone tag.',
  keywords: 'rehearsal studio, band practice',
};

test('web apps are generated from the nextjs-vercel-web launch kit with all placeholders filled', () => {
  const root = fakeRoot();
  const res = generateNewApp(SPEC, { robosRoot: root });
  assert.equal(res.success, true);
  assert.equal(res.isVercel, true);
  assert.equal(res.domain, 'rehearsalroom.app');
  assert.equal(res.template.name, 'nextjs-vercel-web');
  const dir = res.targetDir;
  for (const f of [
    'package.json', 'next.config.mjs', 'vercel.json', '.env.example', '.github/workflows/ci.yml', 'README.md', 'DEPLOYMENT.md',
    'src/lib/db.js', 'src/lib/auth.js', 'src/lib/security.js', 'src/lib/captcha.js', 'src/lib/site.js',
    'src/app/robots.js', 'src/app/sitemap.js', 'src/app/manifest.js', 'src/app/opengraph-image.jsx', 'src/app/icon.jsx',
    'public/llms.txt', 'tests/e2e/support/world.mjs', 'tests/e2e/features/02_search_and_crawlers.feature',
    'scripts/build-evidence.mjs', 'scripts/encode-frames.mjs', 'scripts/make-hero-gif.sh', 'catalog-info.yaml', 'dev-setup.sh',
  ]) {
    assert.ok(fs.existsSync(path.join(dir, f)), `missing ${f}`);
  }
  assert.ok(!fs.existsSync(path.join(dir, 'TEMPLATE.md')));
  assert.ok(!fs.existsSync(path.join(dir, 'package.json.tmpl')));
  for (const file of walk(dir)) {
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /__(APP_NAME|APP_SLUG|DOMAIN|TAGLINE|DESCRIPTION|INITIALS|KEYWORDS)(_JS)?__/, `placeholder left in ${file}`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'rehearsal-room');
  assert.equal(pkg.robos.template, 'nextjs-vercel-web');
  const site = fs.readFileSync(path.join(dir, 'src/lib/site.js'), 'utf8');
  assert.match(site, /SITE_URL = 'https:\/\/www\.rehearsalroom\.app'/);
  assert.match(site, /SITE_NAME = "Joe's Rehearsal Room"/);
  assert.match(site, /TAGLINE = "Book a room\. Play \\"loud\\"\."/);
  assert.match(site, /KEYWORDS = \["rehearsal studio","band practice"\]/);
  assert.match(fs.readFileSync(path.join(dir, 'public/icon.svg'), 'utf8'), />JR</);
  assert.match(fs.readFileSync(path.join(dir, 'src/app/robots.js'), 'utf8'), /Claude-SearchBot/);
  assert.ok(fs.statSync(path.join(dir, 'scripts/make-hero-gif.sh')).mode & 0o111, 'hero gif script stays executable');
});

test('the app is registered in packages.yaml, the SDLC KGraph and gets a project doc page', () => {
  const root = fakeRoot();
  const res = generateNewApp(SPEC, { robosRoot: root });
  assert.match(fs.readFileSync(path.join(root, '.robos', 'packages.yaml'), 'utf8'), /urn:robos:frontend-app:rehearsal-room/);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, '.robos', 'kgraphs', 'applications', 'package.jsonld'), 'utf8'));
  const node = pkg['robos:nodes'].find((n) => n['@id'] === 'urn:robos:frontend-app:rehearsal-room');
  assert.deepEqual(node['@type'], ['oslc_am:Resource', 'robos:FrontEndApp', 'schema:WebApplication']);
  assert.equal(node['robos:appTemplate'], 'robos:template:nextjs-vercel-web@1');
  assert.equal(node['robos:sitemapUrl'], 'https://www.rehearsalroom.app/sitemap.xml');
  assert.equal(node['robos:llmsTxtUrl'], 'https://www.rehearsalroom.app/llms.txt');
  assert.ok(node['robos:structuredData'].includes('schema:WebApplication'));
  assert.ok(node['robos:abuseControls'].includes('rate-limits'));
  assert.ok(fs.existsSync(res.docPage));
});

test('re-running never overwrites files the developer changed', () => {
  const root = fakeRoot();
  const first = generateNewApp(SPEC, { robosRoot: root });
  fs.writeFileSync(path.join(first.targetDir, 'src/lib/site.js'), '// mine\n');
  const second = generateNewApp(SPEC, { robosRoot: root });
  assert.equal(fs.readFileSync(path.join(first.targetDir, 'src/lib/site.js'), 'utf8'), '// mine\n');
  assert.ok(second.template.skipped.includes(path.join('src', 'lib', 'site.js')));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, '.robos', 'kgraphs', 'applications', 'package.jsonld'), 'utf8'));
  assert.equal(pkg['robos:nodes'].length, 1, 'KGraph node is not duplicated');
});

test('non-web archetypes keep the Dockerfile scaffold', () => {
  const root = fakeRoot();
  const res = generateNewApp({ name: 'Ledger', slug: 'ledger-svc', archetype: 'robos:Microservice', technology: 'Go / Gin', deploy: 'kubernetes' }, { robosRoot: root });
  assert.equal(res.isVercel, false);
  assert.ok(fs.existsSync(path.join(res.targetDir, 'Dockerfile')));
  assert.ok(fs.existsSync(path.join(res.targetDir, 'openapi.yaml')));
  assert.ok(!fs.existsSync(path.join(res.targetDir, 'src')));
});

test('initials and slug validation', () => {
  assert.equal(initialsFor('Get Em Gigs'), 'GE');
  assert.equal(initialsFor('rowbose'), 'RO');
  assert.throws(() => generateNewApp({ name: 'Bad', slug: 'Bad Slug!' }, { robosRoot: fakeRoot() }), /slug/);
});
