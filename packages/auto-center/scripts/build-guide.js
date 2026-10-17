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
let pass = 0, total = 0, shotCount = 0;
const MAIN = { 'shop-admin': ['owner', 'Owner'], 'front-desk-intake': ['front-desk', 'Front desk'], 'mechanic-bench': ['mechanic', 'Mechanic'], checkout: ['checkout', 'Checkout'] };
const chapters = [], advanced = [];
const isGuard = s => s.steps.some(st => /^I am (told|asked)/.test(st.text) || /is unavailable$/.test(st.text));
function scenarioHtml(s, base, id, rec, main) {
  const guard = isGuard(s);
  const all = rec?.shots || [], chosen = main ? all : all.slice(-2);
  const shots = chosen.map(sh => { const name = path.basename(sh.file); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(evidence, sh.file), '-vf', 'scale=1000:-2', '-q:v', '6', path.join(out, 'screens', name)]); shotCount++; return { ...sh, name }; });
  const steps = s.steps.map(st => `<li><b>${esc(st.keyword.trim())}</b> ${esc(st.text)}</li>`).join('');
  const figs = shots.map(sh => `<figure class="guide-shot"><a href="{{ '/assets/auto-center/screens/${sh.name}' | relative_url }}"><img src="{{ '/assets/auto-center/screens/${sh.name}' | relative_url }}" alt="${esc(sh.step)}" loading="lazy" width="1000" height="625"></a><figcaption>${esc(sh.step)}</figcaption></figure>`).join('');
  return `<article class="guide-scn${guard ? ' guard' : ''}" id="${id}-${slug(s.name)}"><h3>${guard ? '<span class="tag-guard">Safety net</span> ' : ''}${esc(s.name)}</h3><p>${para(s.description)}</p><div class="guide-shots">${figs}</div><details class="guide-steps"><summary>Test steps (${s.steps.length}${rec?.status === 'PASSED' ? ', passing' : ''})</summary><ol>${steps}</ol></details></article>`;
}
for (const { file, doc } of features) {
  const f = doc.feature, base = path.basename(file, '.feature'), key = base.replace(/^\d+-/, ''), main = MAIN[key];
  const scenarios = f.children.filter(c => c.scenario).map(c => c.scenario);
  const items = scenarios.map(s => { const rec = bySlug[`${base}--${slug(s.name)}`]; total++; if (rec?.status === 'PASSED') pass++; return { s, html: scenarioHtml(s, base, key, rec, !!main), guard: isGuard(s) }; });
  const normal = items.filter(i => !i.guard), guards = items.filter(i => i.guard);
  const html = `<section class="guide-chapter${main ? '' : ' adv'}" id="${main ? main[0] : key}"><h2>${main ? main[1] + ': ' : ''}${esc(f.name)}</h2><p class="chapter-intro">${para(f.description)}</p>${normal.map(i => i.html).join('\n')}${guards.length ? `<details class="guide-guards"><summary>What the app stops you doing (${guards.length})</summary>${guards.map(i => i.html).join('\n')}</details>` : ''}</section>`;
  (main ? chapters : advanced).push({ id: main ? main[0] : key, title: f.name, role: main?.[1], html, count: scenarios.length });
}
execFileSync(process.execPath, [path.join(__dirname, 'slim-report.js'), path.join(evidence, 'cucumber-messages.ndjson'), path.join(out, 'cucumber-report.html')], { stdio: 'inherit' });
let video = false, walkVideo = false;
const enc = (src, dst, w, crf) => { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', `scale=${w}:-2`, '-c:v', 'libx264', '-crf', String(crf), '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', path.join(out, dst)]); };
if (fs.existsSync(path.join(evidence, 'auto-center-suite.mp4'))) { try { enc(path.join(evidence, 'auto-center-suite.mp4'), 'auto-center-suite.mp4', 800, 36); video = true; } catch (e) { console.error('suite video:', e.message); } }
const walk = path.join(evidence, 'videos', '30-walk-in-to-offboard--a-brake-job-from-walk-in-to-offboard.webm');
if (fs.existsSync(walk)) { try { enc(walk, 'walk-in-to-offboard.mp4', 1100, 28); walkVideo = true; } catch (e) { console.error('walk video:', e.message); } }
const roleCards = [['owner', 'Owner', 'Set up the team, parts catalog, shop details and backups.'], ['front-desk', 'Front desk', 'Take the customer’s call, text or visit and open a ticket.'], ['mechanic', 'Mechanic', 'See your tickets, request parts and log your work.'], ['checkout', 'Checkout', 'Invoice, take payment and hand back the keys.']];
const toc = [...chapters.map(c => `<li><a href="#${c.id}">${esc(c.role)}</a> <span>${c.count}</span></li>`), '<li><a href="#advanced">Advanced</a> <span>' + advanced.reduce((n, c) => n + c.count, 0) + '</span></li>', '<li><a href="#evidence">Test evidence</a></li>'].join('');
const page = `---
layout: default
title: Auto Center
permalink: /auto-center/
body_class: guide
extra_css: /assets/auto-guide.css
description: "Run a car repair shop with RobOS Auto Center: a front desk intake wizard, a mechanic bench, a checkout wizard and an owner admin menu, with every step tested end to end."
---
<section class="hero" style="padding-bottom:24px"><div class="wrap">
<span class="pill"><b>RobOS Auto</b> · Maintenance center</span>
<h1>A repair shop, one step at a time</h1>
<p class="lead">Auto Center gives each person in your shop their own menu: the <strong>front desk</strong> takes the call, the <strong>mechanic</strong> does the work, <strong>checkout</strong> collects the money, and the <strong>owner</strong> sets it all up. Every change is backed up, so you never lose a customer’s history.</p>
<div class="cta"><a class="btn" href="#quick-start">Quick start</a><a class="btn btn-ghost" href="#evidence">Watch it work</a></div>
</div></section>
<section style="padding-top:24px"><div class="wrap">
<div class="role-cards">${roleCards.map(([id, t, d]) => `<a class="role-card" href="#${id}"><b>${t}</b><span>${d}</span></a>`).join('')}</div>
<ol class="flow"><li><b>1. Intake</b><span>Front desk</span></li><li><b>2. Estimate</b><span>Front desk</span></li><li><b>3. Repair</b><span>Mechanic</span></li><li><b>4. Invoice and payment</b><span>Checkout</span></li><li><b>5. Keys back</b><span>Checkout</span></li></ol>
<div class="guide-layout"><nav class="guide-toc" aria-label="Guide contents"><h4>In this guide</h4><ol><li><a href="#quick-start">Quick start</a></li>${toc}</ol></nav><div class="guide-body">
<section class="guide-chapter" id="quick-start"><h2>Quick start: your first repair in 10 minutes</h2>
<p class="chapter-intro">Open <strong>Auto Center</strong> and switch <strong>Workspace</strong> to <strong>Maintenance center</strong>. You will see four menus under <strong>Shop desk</strong>.</p>
<ol class="quick"><li><b>Admin</b>: add yourself and your mechanics under <strong>Team</strong>. Optionally import your supplier’s parts list under <strong>Parts catalog</strong>.</li><li><b>Front desk</b>: press <strong>Start an intake</strong> and follow the five steps. You finish with a numbered ticket, such as RO-0001.</li><li><b>Front desk</b>: open the ticket from <strong>Estimates to prepare</strong>, itemize parts and labor, then record the customer’s approval.</li><li><b>Mechanic bench</b>: pick your name, open the ticket and press <strong>Take this ticket</strong>. Request parts, log your time and press <strong>Finish the job</strong>.</li><li><b>Checkout</b>: pick the car, issue the invoice, record payment and hand back the keys.</li></ol>
<p class="note">Tip: everything you type has suggestions, such as makes, models, trouble codes, parts and jobs. You can always type something that isn’t in the list.</p></section>
${chapters.map(c => c.html).join('\n')}
<section class="guide-chapter" id="advanced"><h2>Advanced: working ticket by ticket</h2><p class="chapter-intro">The <strong>All tickets</strong> page shows every ticket at once with all of its forms. You do not need it day to day, because the four menus above do the same jobs step by step. These chapters show the same journey from that page, along with the type-ahead search and parts catalog.</p>
${advanced.map(c => `<details class="adv-chapter"><summary>${esc(c.title)} (${c.count})</summary>${c.html}</details>`).join('\n')}</section>
<section class="guide-chapter" id="evidence"><h2>Test evidence</h2><p class="chapter-intro">Every scenario in this guide runs in the real Electron app under Cucumber with video capture. The report lists each step with its screenshot, and the recordings show the same runs in motion.</p>
${walkVideo ? `<figure class="guide-video"><video controls preload="none" playsinline src="{{ '/assets/auto-center/walk-in-to-offboard.mp4' | relative_url }}"></video><figcaption>A brake job from walk-in to offboard (one scenario).</figcaption></figure>` : ''}
${video ? `<figure class="guide-video"><video controls preload="none" playsinline src="{{ '/assets/auto-center/auto-center-suite.mp4' | relative_url }}"></video><figcaption>The whole suite, all ${total} scenarios back to back.</figcaption></figure>` : ''}
<p><strong>${total} scenarios, ${pass} passing.</strong> <a class="btn btn-ghost" href="{{ '/assets/auto-center/cucumber-report.html' | relative_url }}">Open the Cucumber report</a></p>
<pre><code>cd packages/auto-center
npm install
npm start                    # run the app
npm run e2e:lifecycle        # run every scenario, with video
node scripts/build-guide.js  # regenerate this page from the run</code></pre>
<p class="note">Scope: Auto Center is a local desktop tool, not a hosted multi-user service. Your shop’s records are saved on this computer and backed up to a private GitHub repository when you connect one under Admin, then Backup. Payments are recorded as received; Auto Center does not charge cards. Parts fitment hints from a supplier file are not verified fitment.</p></section>
</div></div></div></section>
`;
fs.writeFileSync(path.join(site, 'auto-center.html'), page);
console.log(`Guide: ${chapters.length} role chapters + ${advanced.length} advanced, ${total} scenarios (${pass} passing), ${shotCount} screenshots`);
