'use strict';
// Builds the rowbose.com/auto-center tutorial (several pages) from guide/*.md. Screenshots come from the
// lifecycle Cucumber run (evidence/manifest.json), so the pictures always match the tested app.
// Run after `npm run e2e:lifecycle`.
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const { marked } = require('marked');
const { createGuideRenderer } = require('./guide-markdown');
const { Parser, AstBuilder, GherkinClassicTokenMatcher } = require('@cucumber/gherkin');
const { IdGenerator } = require('@cucumber/messages');
const root = path.resolve(__dirname, '..'), repo = path.resolve(root, '../..');
const evidence = process.env.E2E_EVIDENCE_DIR ? path.resolve(process.env.E2E_EVIDENCE_DIR) : path.join(root, 'evidence');
const site = path.join(repo, 'site'), out = path.join(site, 'assets/auto-center'), pagesDir = path.join(site, 'auto-center');
const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'manifest.json'), 'utf8'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
for (const d of [out, pagesDir]) fs.rmSync(d, { recursive: true, force: true });
fs.rmSync(path.join(site, 'auto-center.html'), { force: true });
fs.mkdirSync(path.join(out, 'shots'), { recursive: true }); fs.mkdirSync(pagesDir, { recursive: true });
const used = new Map();
function shotFile(fragment, index) {
  const [feat, scn0] = fragment.includes('/') ? fragment.split('/') : [null, fragment], scn = slug(scn0);
  const hits = manifest.filter(m => (m.slug.split('--')[1] === scn || m.slug.endsWith('--' + scn)) && (!feat || m.slug.split('--')[0].endsWith(feat)));
  if (hits.length !== 1) throw new Error(`Screenshot reference "${fragment}": ${hits.length} scenarios match`);
  const rec = hits[0], shot = rec.shots[index - 1]; if (!shot) throw new Error(`Scenario "${fragment}" has no screenshot ${index} (it has ${rec.shots.length})`);
  const name = `${rec.slug}-${index}.jpg`;
  if (!used.has(name)) { execFileSync('python3', [path.join(__dirname, 'scale-image.py'), path.join(evidence, shot.file), path.join(out, 'shots', name), '1000']); used.set(name, true); }
  return name;
}
const fig = (src, alt, caption) => `<figure class="guide-shot"><a href="{{ '${src}' | relative_url }}"><img src="{{ '${src}' | relative_url }}" alt="${esc(alt)}" loading="lazy" width="1000" height="625"></a><figcaption>${esc(caption || alt)}</figcaption></figure>`;
const videoFigure = c => `<figure class="guide-video"><iframe class="guide-youtube" width="1000" height="563" src="https://www.youtube-nocookie.com/embed/VbGGa-et_B4" title="RobOS Auto Center: one repair from phone call to keys, with OBD-II codes read over Bluetooth" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe><figcaption>${esc(c)} <a href="https://youtu.be/VbGGa-et_B4">Watch on YouTube</a></figcaption></figure>`;
function directives(md) {
  return md.replace(/^::video\[([^\]]*)\]$/gm, (_, c) => `\n\n<!--fig-->${videoFigure(c)}<!--/fig-->\n\n`)
    .replace(/^::shot\[([^|\]]+)\|(\d+)\|([^\]]*)\]$/gm, (_, f, i, c) => `\n\n<!--fig-->${fig('/assets/auto-center/shots/' + shotFile(f, Number(i)), c, c)}<!--/fig-->\n\n`)
    .replace(/^::doc\[([^|\]]+)\|([^\]]*)\]$/gm, (_, file, c) => { fs.copyFileSync(path.join(repo, 'docs/assets/images/screenshots', file), path.join(out, 'shots', file)); return `\n\n<!--fig-->${fig('/assets/auto-center/shots/' + file, c, c)}<!--/fig-->\n\n`; });
}
function render(md) {
  const html = marked.parse(directives(md), { renderer: createGuideRenderer(), mangle: false, headerIds: true });
  return html.replace(/<p><!--fig-->([\s\S]*?)<!--\/fig--><\/p>/g, '$1').replace(/<!--fig-->([\s\S]*?)<!--\/fig-->/g, '$1')
    .replace(/\{\{/g, '{% raw %}{{').replace(/\}\}/g, '}}{% endraw %}').replace(/\{% raw %\}\{\{ '(\/assets[^']*)' \| relative_url \}\}\{% endraw %\}/g, "{{ '$1' | relative_url }}");
}
function front(file) {
  const raw = fs.readFileSync(file, 'utf8'), m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/); const meta = {};
  for (const l of m[1].split('\n')) { const k = l.indexOf(':'); meta[l.slice(0, k).trim()] = l.slice(k + 1).trim(); }
  return { meta, body: m[2] };
}
// ---- pages
const files = fs.readdirSync(path.join(root, 'guide')).filter(f => f.endsWith('.md')).sort();
const pages = files.map(f => { const n = f.replace(/\.md$/, ''), { meta, body } = front(path.join(root, 'guide', f)); const isIndex = n === '00-index'; return { file: f, slug: isIndex ? '' : n.replace(/^0/, ''), step: isIndex ? 0 : Number(n.slice(0, 2)), title: meta.title, summary: meta.summary, minutes: Number(meta.minutes || 0), body, url: isIndex ? '/auto-center/' : `/auto-center/${n.replace(/^0/, '')}/` }; });
const chapters = pages.filter(p => p.step > 0).length;
const testsPage = { slug: 'tests', step: chapters + 1, title: 'How we know it works', summary: 'The test report, recordings and the list of scenarios behind this tutorial.', minutes: 0, url: '/auto-center/tests/' };
const all = [...pages, testsPage];
function nav(current) {
  const steps = all.filter(p => p.step > 0), idx = all.indexOf(current), prev = all[idx - 1], next = all[idx + 1];
  const list = `<nav class="guide-toc" aria-label="Tutorial steps"><h4><a href="{{ '/auto-center/' | relative_url }}">Auto Center tutorial</a></h4><ol>${steps.map(p => `<li${p === current ? ' class="here"' : ''}><a href="{{ '${p.url}' | relative_url }}">${esc(p.title)}</a></li>`).join('')}</ol></nav>`;
  const pager = `<div class="guide-pager">${prev ? `<a class="prev" href="{{ '${prev.url}' | relative_url }}"><small>Previous</small><b>${esc(prev.title)}</b></a>` : '<span></span>'}${next ? `<a class="next" href="{{ '${next.url}' | relative_url }}"><small>Next</small><b>${esc(next.title)}</b></a>` : '<span></span>'}</div>`;
  return { list, pager };
}
const wrap = (p, body, hero) => {
  const { list, pager } = nav(p);
  const isIndex = p.step === 0;
  const introduction = isIndex ? fs.readFileSync(path.join(root, 'guide/introduction.html'), 'utf8').replace('<!--walkthrough-->', videoFigure('A complete repair, from the phone call to handing back the keys, with the check-engine codes read over a Bluetooth OBD-II adapter.')) : '';
  const guideHeading = isIndex ? '<header class="auto-guide-heading"><p class="eyebrow">Documentation</p><h2 id="robos-auto-guide">RobOS Auto Guide</h2><p>A step-by-step guide for the shop owner, with real app walkthroughs.</p></header>' : '';
  return `---
layout: default
title: ${p.step ? `${p.title} · Auto Center tutorial` : 'RobOS Auto Center'}
permalink: ${p.url}
body_class: guide
extra_css: /assets/auto-guide.css${isIndex ? '?v=auto-intro-20261019' : ''}
description: "${esc(isIndex ? 'Vehicle care for owners and repair operations for independent shops, with the RobOS Auto Guide.' : p.summary)}"
---
${hero || introduction}<section class="guide-page"><div class="wrap">${guideHeading}<div class="guide-layout">${isIndex ? list.replace('>Auto Center tutorial<', '>RobOS Auto Guide<') : list}<article class="guide-body"><p class="eyebrow">${p.step && p.step <= chapters ? `Step ${p.step} of ${chapters}${p.minutes ? ` · about ${p.minutes} minutes` : ''}` : isIndex ? 'For the shop owner' : 'Tutorial'}</p><${isIndex ? 'h3' : 'h1'} class="guide-title">${esc(p.title)}</${isIndex ? 'h3' : 'h1'}><p class="chapter-intro">${esc(p.summary)}</p>
${body}
${pager}</article></div></div></section>
`;
};
for (const p of pages) {
  const html = render(p.body);
  fs.writeFileSync(path.join(pagesDir, p.slug ? `${p.slug}.html` : 'index.html'), wrap(p, html));
}
// ---- test evidence page
let total = 0, pass = 0; const byRole = [];
for (const f of fs.readdirSync(path.join(root, 'tests/e2e/features')).filter(f => f.endsWith('.feature')).sort()) {
  const doc = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher()).parse(fs.readFileSync(path.join(root, 'tests/e2e/features', f), 'utf8')), base = f.replace(/\.feature$/, '');
  const names = doc.feature.children.filter(c => c.scenario).map(c => { total++; const ok = manifest.find(m => m.slug === `${base}--${slug(c.scenario.name)}`)?.status === 'PASSED'; if (ok) pass++; return { name: c.scenario.name, ok }; });
  byRole.push({ title: doc.feature.name, names });
}
execFileSync(process.execPath, [path.join(__dirname, 'slim-report.js'), path.join(evidence, 'cucumber-messages.ndjson'), path.join(out, 'cucumber-report.html')], { stdio: 'inherit' });
// Videos are re-encoded to a smaller WebM with the ffmpeg that ships with Playwright (VP8 only).
const ffmpeg = process.env.FFMPEG || (fs.readdirSync(path.join(require('node:os').homedir(), '.cache/ms-playwright')).filter(d => d.startsWith('ffmpeg-')).map(d => path.join(require('node:os').homedir(), '.cache/ms-playwright', d, 'ffmpeg-linux'))[0]);
const enc = (src, dst, w) => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', src, '-vf', `scale=${w}:-2`, '-c:v', 'libvpx', '-b:v', '350k', '-crf', '34', '-an', path.join(out, dst)]);
let journey = false;
const jv = fs.readdirSync(path.join(evidence, 'videos')).find(f => f.includes('a-complete-repair-using-the-four-menus'));
if (jv) { enc(path.join(evidence, 'videos', jv), 'whole-journey.webm', 1000); journey = true; }
const testsBody = `<p>Every page of this tutorial is checked by end-to-end tests. They run the real Auto Center app, click through every screen as a person would, and fail if anything is missing or wrong. The screenshots you have seen come from those runs, not from mock-ups.</p>
<p><strong>${total} scenarios, ${pass} passing.</strong> <a class="btn btn-ghost" href="{{ '/assets/auto-center/cucumber-report.html' | relative_url }}">Open the full test report</a></p>
${journey ? videoFigure('One whole repair, from the first call to the keys going back.') : ''}
<h2>What is tested</h2>${byRole.map(r => `<details class="guide-guards"><summary>${esc(r.title)} (${r.names.length})</summary><ul>${r.names.map(n => `<li>${n.ok ? '✓' : '✗'} ${esc(n.name)}</li>`).join('')}</ul></details>`).join('')}
<h2>Run the tests yourself</h2><pre><code>cd packages/auto-center
npm install
npm run e2e:lifecycle        # runs every scenario, with video
node scripts/build-guide.js  # rebuilds these pages from the run</code></pre>`;
fs.writeFileSync(path.join(pagesDir, 'tests.html'), wrap(testsPage, testsBody));
console.log(`Guide: ${all.length} pages, ${used.size} screenshots, ${total} scenarios (${pass} passing)`);
