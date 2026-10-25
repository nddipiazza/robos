'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const version = fs.readFileSync(path.resolve(__dirname, '../VERSION'), 'utf8').trim();
const output = path.resolve(process.argv[2] || '_site');

for (const file of ['index.html', 'download/index.html', 'v1/getting-started.html']) {
  const html = fs.readFileSync(path.join(output, file), 'utf8');
  assert.ok(!html.includes('0.0.7'), `${file}: stale version`);
  assert.ok(!html.includes('{{ site.data.release'), `${file}: unrendered release data`);
  assert.ok(html.includes(`v${version}`), `${file}: missing current version`);
}
const download = fs.readFileSync(path.join(output, 'download/index.html'), 'utf8');
for (const file of ['Install-RobOS.cmd', 'Install-RobOS.ps1', 'WINDOWS-SHA256SUMS']) {
  assert.ok(download.includes(`https://github.com/nddipiazza/robos/releases/download/v${version}/${file}`), `Missing release asset: ${file}`);
}
assert.ok(download.includes('id="windows"') && download.includes('id="linux-distro"'));

// Merge /v1/sitemap.xml entries into root /sitemap.xml so a single sitemap submission indexes the whole site.
const rootSitemapPath = path.join(output, 'sitemap.xml');
const v1SitemapPath = path.join(output, 'v1/sitemap.xml');
if (fs.existsSync(rootSitemapPath) && fs.existsSync(v1SitemapPath)) {
  const rootSitemap = fs.readFileSync(rootSitemapPath, 'utf8');
  const v1Sitemap = fs.readFileSync(v1SitemapPath, 'utf8');
  const v1Urls = v1Sitemap.match(/<url>[\s\S]*?<\/url>/g) || [];
  const missingUrls = v1Urls.filter((u) => {
    const loc = u.match(/<loc>(.*?)<\/loc>/);
    return loc && !rootSitemap.includes(`<loc>${loc[1]}</loc>`);
  });
  if (missingUrls.length > 0 && rootSitemap.includes('</urlset>')) {
    const merged = rootSitemap.replace('</urlset>', `${missingUrls.join('\n')}\n</urlset>`);
    fs.writeFileSync(rootSitemapPath, merged, 'utf8');
  }
}

// Verify search engine & AI crawler discovery files at the site root.
assert.ok(fs.existsSync(path.join(output, 'robots.txt')), 'Missing robots.txt');
assert.ok(fs.existsSync(path.join(output, 'llms.txt')), 'Missing llms.txt');
assert.ok(fs.existsSync(rootSitemapPath), 'Missing sitemap.xml');

// Verify full-featured search engine meta tags across every major section of rowbose.com.
const seoCheckedPages = [
  'index.html',
  'apps/index.html',
  'build-apps/index.html',
  'build-apps/solo/index.html',
  'build-apps/teams/index.html',
  'docs/index.html',
  'security/index.html',
  'download/index.html',
  'contribute/index.html',
  'blog/index.html',
  'future/index.html',
  'future/whitepaper/index.html',
  'family-finances/index.html',
  'point-of-sale/index.html',
  'point-of-sale/retail/index.html',
  'point-of-sale/coffee/index.html',
  'point-of-sale/bar/index.html',
  'auto-center/index.html',
  'auto-center/1-before-you-start/index.html',
  'auto-center/5-mechanic-bench/index.html',
  'auto-center/tests/index.html',
  'games/index.html',
  'games/crpg/index.html',
  'games/crpg/docs/index.html',
  'games/tabletop-rpg/index.html',
  'games/tabletop-rpg/docs/index.html',
  'games/tabletop-rpg/proof-of-viability.html',
  'games/tabletop-rpg/proof-of-viability-election-2026.html',
  'games/robos-rts/index.html',
  'games/robos-rts/docs/index.html',
  'games/quest-warrior-dragon/index.html',
  'games/quest-warrior-dragon/docs/index.html',
  'games/quest-warrior-dragon/ai-playthrough/index.html',
  'games/quest-warrior-dragon/proof-of-viability.html',
  'v1/index.html',
  'v1/getting-started.html',
  'v1/schemas.html',
  'v1/system-documentation/index.html',
  'v1/projects/crpg-realm/elearning/index.html',
];

for (const rel of seoCheckedPages) {
  const fullPath = path.join(output, rel);
  assert.ok(fs.existsSync(fullPath), `Missing rendered page: ${rel}`);
  const html = fs.readFileSync(fullPath, 'utf8');
  assert.ok(/<title>[^<]+<\/title>/.test(html), `${rel}: missing <title>`);
  assert.ok(/<meta name="description" content="[^"]+"/.test(html), `${rel}: missing meta description`);
  assert.ok(/<meta name="robots" content="index, follow/.test(html), `${rel}: missing index,follow robots meta`);
  assert.ok(/<link rel="canonical" href="https:\/\/rowbose\.com\//.test(html), `${rel}: missing canonical URL`);
  assert.ok(/<meta property="og:title" content="[^"]+"/.test(html), `${rel}: missing og:title`);
  assert.ok(/<meta property="og:description" content="[^"]+"/.test(html), `${rel}: missing og:description`);
  assert.ok(/<meta property="og:url" content="https:\/\/rowbose\.com\//.test(html), `${rel}: missing og:url`);
  assert.ok(/<meta property="og:image" content="https:\/\/rowbose\.com\//.test(html), `${rel}: missing absolute og:image`);
  assert.ok(/<meta (?:name|property)="twitter:card" content="summary_large_image"/.test(html), `${rel}: missing twitter:card`);
  assert.ok(/<meta (?:name|property)="twitter:title" content="[^"]+"/.test(html), `${rel}: missing twitter:title`);
  assert.ok(/<meta (?:name|property)="twitter:description" content="[^"]+"/.test(html), `${rel}: missing twitter:description`);
  assert.ok(/<meta (?:name|property)="twitter:image" content="https:\/\/rowbose\.com\//.test(html), `${rel}: missing absolute twitter:image`);
}

console.log(`Install documentation and SEO meta tags verified across ${seoCheckedPages.length} sections for v${version}.`);
