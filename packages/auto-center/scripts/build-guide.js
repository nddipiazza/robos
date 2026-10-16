'use strict';
// Builds the rowbose.com/auto-center guide from the lifecycle Cucumber run: the feature files supply the
// prose and steps, evidence/manifest.json supplies the screenshots, and the report/video are published
// beside the page. Run after `npm run e2e:lifecycle`.
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const { Parser, AstBuilder, GherkinClassicTokenMatcher } = require('@cucumber/gherkin');
const { IdGenerator } = require('@cucumber/messages');
const root = path.resolve(__dirname, '..'), repo = path.resolve(root, '../..');
const evidence = path.join(root, 'evidence'), site = path.join(repo, 'site');
const out = path.join(site, 'assets/auto-center');
const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'manifest.json'), 'utf8'));
const bySlug = Object.fromEntries(manifest.map(m => [m.slug, m]));
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const para = s => (s || '').trim().split(/\n\s*\n/).map(p => md(p.replace(/\s*\n\s*/g, ' '))).join('</p><p>');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(path.join(out, 'screens'), { recursive: true });
const dir = path.join(root, 'tests/e2e/features');
const features = fs.readdirSync(dir).filter(f => f.endsWith('.feature')).sort().map(f => {
  const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher());
  return { file: f, doc: parser.parse(fs.readFileSync(path.join(dir, f), 'utf8')) };
});
let pass = 0, total = 0, shotCount = 0; const chapters = [];
for (const { file, doc } of features) {
  const f = doc.feature, base = path.basename(file, '.feature'), id = base.replace(/^\d+-/, '');
  const scenarios = f.children.filter(c => c.scenario).map(c => c.scenario);
  const bg = f.children.find(c => c.background)?.background;
  const html = [`<section class="guide-chapter" id="${id}"><p class="eyebrow">Step ${chapters.length + 1}</p><h2>${esc(f.name)}</h2><p class="chapter-intro">${para(f.description)}</p>`];
  for (const s of scenarios) {
    const rec = bySlug[`${base}--${slug(s.name)}`]; total++;
    if (rec?.status === 'PASSED') pass++;
    const rejection = s.steps.some(st => /^I am told/.test(st.text));
    const shots = (rec?.shots || []).map(sh => { const name = path.basename(sh.file); fs.copyFileSync(path.join(evidence, sh.file), path.join(out, 'screens', name)); shotCount++; return { ...sh, name }; });
    const steps = s.steps.map(st => `<li><b>${esc(st.keyword.trim())}</b> ${esc(st.text)}</li>`).join('');
    const figs = shots.map(sh => `<figure class="guide-shot"><a href="{{ '/assets/auto-center/screens/${sh.name}' | relative_url }}"><img src="{{ '/assets/auto-center/screens/${sh.name}' | relative_url }}" alt="${esc(sh.step)}" loading="lazy" width="1280" height="800"></a><figcaption>${esc(sh.step)}</figcaption></figure>`).join('');
    html.push(`<article class="guide-scn${rejection ? ' guard' : ''}" id="${id}-${slug(s.name)}"><h3>${rejection ? '<span class="tag-guard">Guard rail</span> ' : ''}${esc(s.name)}</h3><p>${para(s.description)}</p><details class="guide-steps"><summary>How this is tested (${s.steps.length} steps${rec?.status === 'PASSED' ? ', passing' : ''})</summary><ol>${steps}</ol></details><div class="guide-shots">${figs}</div></article>`);
  }
  html.push('</section>'); chapters.push({ id, title: f.name, html: html.join('\n'), count: scenarios.length });
}
// publish evidence
const files = { 'cucumber-report.html': 'cucumber-report.html' };
fs.copyFileSync(path.join(evidence, 'cucumber-report.html'), path.join(out, 'cucumber-report.html'));
let video = false;
const walk = path.join(evidence, 'videos', '09-walk-in-to-offboard--a-brake-job-from-walk-in-to-offboard.webm');
if (fs.existsSync(path.join(evidence, 'auto-center-suite.mp4'))) {
  try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(evidence, 'auto-center-suite.mp4'), '-vf', 'scale=960:-2', '-c:v', 'libx264', '-crf', '30', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', path.join(out, 'auto-center-suite.mp4')]); video = true; } catch (e) { console.error('suite video:', e.message); }
}
let walkVideo = false;
if (fs.existsSync(walk)) { try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', walk, '-vf', 'scale=1100:-2', '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', path.join(out, 'walk-in-to-offboard.mp4')]); walkVideo = true; } catch (e) { console.error('walk video:', e.message); } }
const toc = chapters.map(c => `<li><a href="#${c.id}">${esc(c.title)}</a> <span>${c.count}</span></li>`).join('');
const page = `---
layout: default
title: Auto Center
permalink: /auto-center/
body_class: guide
extra_css: /assets/auto-guide.css
description: "A guide to running a car repair shop in RobOS Auto Center: customers, teammates, estimates, approvals, parts, hours, invoices, payment and offboarding, with every step tested end to end."
---
<section class="hero" style="padding-bottom:24px"><div class="wrap">
<span class="pill"><b>RobOS Auto</b> · Maintenance center</span>
<h1>Run a repair shop from first call to paid and returned</h1>
<p class="lead">Auto Center follows every customer car through intake, diagnosis, estimate, approval, repair, invoice, payment and offboarding. Each repair is a DevOps work item, committed to your shop's private Git history. This guide is built from the same end-to-end tests that prove it works: ${total} scenarios, ${pass} passing, every screenshot taken from the real app.</p>
<div class="cta"><a class="btn" href="#walk-in-to-offboard">Watch the whole journey</a><a class="btn btn-ghost" href="{{ '/assets/auto-center/cucumber-report.html' | relative_url }}">Open the test report</a></div>
</div></section>
<section style="padding-top:24px"><div class="wrap">
<ol class="flow"><li><b>Intake</b><span>Customer, vehicle, ticket</span></li><li><b>Diagnosis</b><span>Findings and codes</span></li><li><b>Estimate</b><span>Parts and labor</span></li><li><b>Approval</b><span>Who, and how</span></li><li><b>Repair</b><span>Parts and hours by teammate</span></li><li><b>Invoice, pay, return</b><span>Balance must reach zero</span></li></ol>
<div class="guide-layout"><nav class="guide-toc" aria-label="Guide contents"><h4>In this guide</h4><ol>${toc}</ol><p class="note">Numbers are scenarios per chapter.</p></nav><div class="guide-body">
${chapters.map(c => c.html).join('\n')}
<section class="guide-chapter" id="evidence"><p class="eyebrow">Proof</p><h2>Test evidence</h2><p class="chapter-intro">Every scenario above runs in the real Electron app under Cucumber with video capture. The report lists each step with its screenshot, and the recordings show the same runs in motion.</p>
${walkVideo ? `<figure class="guide-video"><video controls preload="none" playsinline src="{{ '/assets/auto-center/walk-in-to-offboard.mp4' | relative_url }}"></video><figcaption>A brake job from walk-in to offboard (one scenario).</figcaption></figure>` : ''}
${video ? `<figure class="guide-video"><video controls preload="none" playsinline src="{{ '/assets/auto-center/auto-center-suite.mp4' | relative_url }}"></video><figcaption>The whole suite, all ${total} scenarios back to back.</figcaption></figure>` : ''}
<p><a class="btn btn-ghost" href="{{ '/assets/auto-center/cucumber-report.html' | relative_url }}">Cucumber report</a></p>
<pre><code>cd packages/auto-center
npm install
npm run e2e:lifecycle        # runs every scenario, records video
node scripts/build-guide.js  # regenerates this page from the run</code></pre>
<p class="note">Scope: this is a local desktop shop tool backed by a KGraph and a private Git repository, not a multi-user hosted service. Payment recording notes a payment already received; it does not charge cards. Tickets are local DevOps work items; syncing them to GitHub, Gitea or Jira is not built yet.</p></section>
</div></div></div></section>
`;
fs.writeFileSync(path.join(site, 'auto-center.md'), page);
console.log(`Guide: ${chapters.length} chapters, ${total} scenarios (${pass} passing), ${shotCount} screenshots`);
