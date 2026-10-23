'use strict';
/**
 * Screenshots for the Build apps guides on rowbose.com (site/build-apps/).
 *
 * Drives the real RobOS apps through the same sample project as the home-page
 * recording (lib/lifecycle): a real git repository and tests, with the forge (gh),
 * the agents' narration and CI results as scripted stand-ins. Each shot is a clean
 * window capture, no callouts.
 *
 *   Xvfb :99 -screen 0 1920x1080x24 &
 *   DISPLAY=:99 node packages/robos-test/demos/build-apps-guide-shots.js [outDir] [--only=agents,planner,...]
 *   node packages/robos-test/demos/build-apps-guide-shots.js --publish [outDir]
 *
 * --publish converts outDir/*.png to site/assets/build-apps/shots/*.jpg (needs python3 + Pillow).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { launchApp, killApp } = require('../lib/harness');
const { createContext } = require('../lib/lifecycle/env');
const forge = require('../lib/lifecycle/forge');
const world = require('../lib/lifecycle/world');
const D = require('../lib/lifecycle/driver');
const { sleep, click, type, typeEditable, waitFor, evalJS } = D;

const args = process.argv.slice(2);
const OUT = path.resolve(args.find(a => !a.startsWith('--')) || path.join(__dirname, '..', 'run', 'build-apps-guide-shots'));
const SITE_SHOTS = path.resolve(__dirname, '..', '..', '..', 'site', 'assets', 'build-apps', 'shots');

if (args.includes('--publish')) {
  fs.mkdirSync(SITE_SHOTS, { recursive: true });
  execFileSync('python3', ['-I', '-c', `
import sys, os
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
crops = {'servers-1-github': (0, 0, 1280, 720)}   # captured full screen; keep the part with the form
for f in sorted(os.listdir(src)):
    if not f.endswith('.png'): continue
    im = Image.open(os.path.join(src, f)).convert('RGB')
    if f[:-4] in crops: im = im.crop(crops[f[:-4]])
    if im.width > 1600: im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
    im.save(os.path.join(dst, f[:-4] + '.jpg'), quality=82, optimize=True)
    print(f[:-4] + '.jpg', im.size)
`, OUT, SITE_SHOTS], { stdio: 'inherit' });
  process.exit(0);
}

const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (name) => !ONLY.length || ONLY.includes(name);
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png') && (!ONLY.length || ONLY.some(o => f.startsWith(o + '-')))) fs.rmSync(path.join(OUT, f));
// --world=<dir> puts the sample clone somewhere that reads well in screenshots (it is wiped first).
const WORLD = (args.find(a => a.startsWith('--world=')) || '').slice(8);
fs.mkdirSync(path.join(OUT, 'run'), { recursive: true });
const ctx = createContext(path.join(OUT, 'run'), WORLD ? { worldDir: WORLD } : {});
Object.assign(process.env, ctx.env);
const WS = ctx.world.workspace;

// Draw each window at 1.5x its own default size, so the UI stays legible at the guide's column width.
const SCALE = ['--force-device-scale-factor=1.5'];
async function open(appId, scenario, { fullscreen = false } = {}) {
  if (fullscreen) {   // a few windows stop repainting at their default size on Xvfb; resizing keeps them painting
    const app = await launchApp(appId, scenario);
    await D.maximizeWindow(app.port);
    await sleep(1800);
    return app;
  }
  const app = await launchApp(appId, { ...scenario, electronArgs: SCALE });   // each app's own default window size
  await sleep(1800);
  return app;
}
async function shot(P, name) {
  // Hide the harness pointer and ripples; the guides show the app, not the driver.
  await evalJS(P, `(() => { if (window.__rbPointer) window.__rbPointer.style.display = 'none'; document.querySelectorAll('.toastui-editor-tooltip').forEach(t => t.style.display = 'none'); document.activeElement && document.activeElement.blur && document.activeElement.blur(); })()`).catch(() => {});
  await sleep(700);
  await D.screenshot(P, path.join(OUT, name + '.png'));
  await evalJS(P, `(() => { if (window.__rbPointer) window.__rbPointer.style.display = ''; })()`).catch(() => {});
  console.log('  shot', name);
}
const settled = (P) => waitFor(P, `!document.querySelector('#startup-screen') || document.querySelector('#startup-screen').hidden`);

// ── Setup: RobOS Agents ─────────────────────────────────────────────────────────
async function agents() {
  const app = await open('agents-manager', ctx.scenario('agents'));
  const P = app.port;
  try {
    await waitFor(P, `document.querySelectorAll('.provider-nav-item').length >= 3`);
    await click(P, { text: 'Codex', within: '#provider-nav' });
    await sleep(1200);
    await click(P, '#btn-provider-settings');
    await waitFor(P, `!document.getElementById('settings-overlay').classList.contains('hidden')`);
    await sleep(1200);
    await shot(P, 'agents-1-settings');
    await click(P, '#btn-set-active');
    await waitFor(P, `!!document.querySelector('#provider-detail .active-badge')`);
    await sleep(900);
    await shot(P, 'agents-2-active');
  } finally { await killApp(app); }
}

// ── Setup: Task Servers ─────────────────────────────────────────────────────────
async function servers() {
  const app = await open('task-servers', ctx.scenario('servers'), { fullscreen: true });   // cropped on --publish
  const P = app.port;
  try {
    await click(P, '.server-item[data-id="gh-pawfinder"]');
    await sleep(1500);
    await shot(P, 'servers-1-github');
  } finally { await killApp(app); }
}

// ── Setup (teams): Git Projects review defaults ─────────────────────────────────
async function gitprojects() {
  const { createHash } = require('crypto');
  const repoKey = createHash('sha256').update(forge.REPO.toLowerCase()).digest('hex');
  const scenario = {
    ...ctx.scenario('git-projects'),
    files: {
      '.config/robos/git-projects.json': { projects: [{ id: 'pawfinder-api', url: `https://github.com/${forge.REPO}`, host: 'github.com', org: 'acme-corp', repo: 'pawfinder-api', localPath: WS, defaultBranch: 'main' }] },
      [`.robos/project-review-settings/${repoKey}.json`]: { githubReviewers: [forge.REVIEWER], prTemplate: '## What changed\n{{description}}\n\n## How it was verified\n- Tests:\n- Evidence: see the review window\n\nTask: {{url}}' },
    },
  };
  const app = await open('git-projects', scenario);
  const P = app.port;
  try {
    await waitFor(P, `!!document.querySelector('.tree-repo[data-id="pawfinder-api"]')`);
    await click(P, '.tree-repo[data-id="pawfinder-api"]');
    await sleep(1500);
    await click(P, '[data-tab="pr-review-settings"]');
    await sleep(1800);
    await shot(P, 'gitprojects-1-review-defaults');
  } finally { await killApp(app); }
}

// ── Plan: Task Planner ──────────────────────────────────────────────────────────
async function planner() {
  const app = await open('task-planner', ctx.scenario('planner'));
  const P = app.port;
  try {
    await sleep(900);
    await click(P, '#prompt-input', { after: 300 });
    await type(P, '#prompt-input', 'Let adopters filter pet search by species, and show the best matches first', { delay: 4 });
    await sleep(600);
    await shot(P, 'planner-2-prompt');
    await click(P, '#btn-generate');
    await waitFor(P, `document.querySelectorAll('#task-list .task-card').length >= 2`);
    await evalJS(P, `document.querySelector('#task-list').scrollIntoView({block:'start'})`);
    await sleep(1400);
    await shot(P, 'planner-3-generated');
    await click(P, '#btn-create-all');
    await waitFor(P, `document.querySelectorAll('.task-card.task-synced .ticket-badge').length >= 2`);
    await evalJS(P, `document.querySelector('#task-list').scrollIntoView({block:'start'})`);
    await sleep(1200);
    await shot(P, 'planner-4-synced');
    await click(P, '#btn-browse-templates');
    await sleep(1500);
    await shot(P, 'planner-5-templates');
  } finally { await killApp(app); }
}

// ── Pick up work (teams): Dev Central ───────────────────────────────────────────
async function devcentral() {
  const scenario = { ...ctx.scenario('dev-central'), files: { '.config/robos/github-accounts.json': { git: forge.ME } } };
  const app = await open('dev-central', scenario);
  const P = app.port;
  try {
    await sleep(2500);
    await click(P, { text: 'Unassigned' });
    await sleep(1500);
    // A fresh Dev Central also lists its built-in seed features; filter to this project's work.
    await evalJS(P, `(() => { const i = document.querySelector('input[placeholder^="Filter this list"]'); i.focus(); i.value = 'species'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(1500);
    await shot(P, 'devcentral-1-tasks');
  } finally { await killApp(app); }
}

// ── Implement: Task Implementer ─────────────────────────────────────────────────
async function implementer() {
  const app = await open('task-implementer', ctx.scenario('implementer'));
  const P = app.port;
  try {
    await sleep(1400);
    await click(P, '.task-item[data-key="#42"]');
    await sleep(1400);
    await shot(P, 'implementer-1-task');
    await click(P, '#btn-start-agent');
    await waitFor(P, `/finished successfully/i.test(document.getElementById('agent-status').textContent)`, { timeout: 60000 });
    await sleep(1200);
    await shot(P, 'implementer-2-done');
  } finally { await killApp(app); }
}

// ── Review: the author's local review ───────────────────────────────────────────
const CHAT = 'robos-agent-discussion .robos-ai-inner';
const SEND = 'robos-agent-discussion .robos-submit-btn';

async function review(manifest) {
  const app = await open('pr-review', ctx.reviewScenario('owner', { manifest }));
  const P = app.port;
  try {
    await settled(P);
    await sleep(700);
    await click(P, '#step-btn-3');
    await waitFor(P, `document.querySelector('#stage-3 .changes-diff')?.getClientRects().length`);
    await sleep(1000);
    await click(P, '#stage-3 [data-tree-node=file][data-file-path="src/pets.js"]');
    await sleep(1200);
    await shot(P, 'review-1-changes');
    await click(P, { text: 'Suggest changes', within: '#stage-3' });
    await waitFor(P, `!!document.querySelector('${CHAT}')`);
    await sleep(700);
    await typeEditable(P, CHAT, 'Remove the comments in src/pets.js that just restate the code. Keep the ones that explain why.', { delay: 4 });
    await click(P, SEND);
    await waitFor(P, `/committed|Done\\./i.test(document.querySelector('robos-agent-discussion')?.textContent || '') && !/Working…/.test(document.querySelector('robos-agent-discussion')?.textContent || '')`, { timeout: 60000 });
    await sleep(1600);
    await click(P, '#stage-3 [data-tree-node=file][data-file-path="src/pets.js"]');
    await sleep(1200);
    await shot(P, 'review-2-suggest-changes');

    await click(P, '#step-btn-5');
    await waitFor(P, `!!document.querySelector('#stage-5 [data-evidence-view]')`);
    await sleep(900);
    await typeEditable(P, CHAT, 'Regenerate the evidence for the latest commit, and add a case that combines a text search with a species filter.', { delay: 4 });
    await click(P, SEND);
    await waitFor(P, `[...(document.querySelector('#stage-5 [data-evidence-view]')?.shadowRoot?.querySelectorAll('details') || [])].some(d => /combine/i.test(d.textContent))`, { timeout: 60000 });
    await waitFor(P, `!/Working…/.test(document.querySelector('robos-agent-discussion')?.textContent || '')`, { timeout: 60000 });
    await sleep(1500);
    await evalJS(P, `(() => { const v = document.querySelector('#stage-5 [data-evidence-view]'); const ds = [...v.shadowRoot.querySelectorAll('details')]; ds.forEach(d => d.open = false); const t = ds.find(d => /combine/i.test(d.textContent)); if (t) { t.open = true; t.scrollIntoView({block:'center'}); } })()`);
    await evalJS(P, `window.reviewAgent.close()`);   // give the evidence the full width: call, before and after
    await sleep(900);
    await shot(P, 'review-3-evidence');

    await click(P, '#step-btn-6');
    await waitFor(P, `document.querySelector('#stage-6')?.getClientRects().length`);
    await sleep(1000);
    await click(P, { text: 'Start', within: '#stage-6' });
    await waitFor(P, `/Step 1 of/.test(document.querySelector('#stage-6 .walkthrough-status')?.textContent || '')`, { timeout: 60000 });
    await sleep(1500);
    await shot(P, 'review-4-walkthrough');
    await evalJS(P, `window.reviewAgent && window.reviewAgent.close && window.reviewAgent.close()`);

    await click(P, '#step-btn-9');
    await sleep(1500);
    await click(P, { text: 'Description', within: '#stage-9', tag: 'h2,h3' }).catch(() => {});   // park the pointer off the toolbar
    await sleep(500);
    await shot(P, 'review-5-description');

    await click(P, '#step-btn-8');
    await sleep(1500);
    await click(P, { text: 'Create as draft', within: '#stage-8' });
    await sleep(500);
    await shot(P, 'review-6-create-pr');
    await click(P, { text: 'Create PR', within: '#stage-8' });
    await waitFor(P, `document.querySelector('#step-btn-8')?.dataset.prStatus === 'draft' || /In Draft/.test(document.querySelector('#step-btn-8')?.textContent || '')`, { timeout: 40000 });
    await sleep(1200);

    const head = require('../lib/lifecycle/pulls').headOid(ctx.env, ctx.readState().prs[0].headRefName);
    const s = ctx.readState(); s.ci = s.ci || {}; s.ci.byHead = s.ci.byHead || {};
    s.ci.byHead[head] = ['build', 'unit-tests', 'lint', 'contract-check'].map(name => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS' }));
    ctx.writeState(s);
    await click(P, { text: 'Refresh CI' }, { after: 1500 });
    await waitFor(P, `/CI checks passed/.test(document.querySelector('.review-live-ci')?.textContent || '')`, { timeout: 20000 });
    await sleep(1200);
    await shot(P, 'review-7-ci-passed');
    await click(P, '#pr-ready-button');
    await sleep(1500);
    await shot(P, 'review-8-ready-dialog');
    await click(P, '.pr-ready-dialog .pr-ready-button');
    await waitFor(P, `/ready for review/i.test(document.querySelector('#pr-ready-status')?.textContent || '')`, { timeout: 30000 });
    await sleep(1500);
  } catch (e) { await shot(P, 'ERROR-review').catch(() => {}); throw e; }
  finally { await killApp(app); }
}

// ── Review (teams): a teammate in reviewer mode ─────────────────────────────────
async function reviewer() {
  const prUrl = `https://github.com/${forge.REPO}/pull/${ctx.readState().prs[0].number}`;
  const app = await open('pr-review', ctx.reviewScenario('reviewer', { prUrl }));
  const P = app.port;
  try {
    await settled(P);
    await sleep(1600);
    await click(P, { text: 'Review settings' });
    await sleep(1500);
    await shot(P, 'reviewer-1-settings');
    await evalJS(P, `(() => { const b = [...document.querySelectorAll('button')].find(b => /^(Close|Cancel|✕)/.test(b.textContent.trim()) && b.offsetParent); if (b) b.click(); })()`);
    await sleep(800);
    // The reviewer-mode knowledge check is placeholder content; pass it off camera.
    await evalJS(P, `(async () => { window.setTheaterStage(1); await new Promise(r => setTimeout(r, 600));
      for (const [n, v] of [['q-q1-mtls', 1], ['q-q2-transaction', 2], ['q-q3-kgraph-merge', 1]]) { const r = document.querySelector('input[name="' + n + '"][value="' + v + '"]'); if (r) r.checked = true; }
      document.getElementById('btn-submit-quiz')?.click(); await new Promise(r => setTimeout(r, 900)); })()`);
    await sleep(900);
    await click(P, '#step-btn-3');
    await waitFor(P, `document.querySelector('#stage-3 .changes-diff')?.getClientRects().length`);
    await sleep(1800);
    await shot(P, 'reviewer-2-changes');
    await evalJS(P, `window.setTheaterStage(7)`);
    await sleep(1200);
    await type(P, '#theater-review-notes', 'Clear change, and the before/after evidence matches the acceptance criteria. Approving.', { delay: 4 });
    await click(P, '#btn-theater-submit-review');
    await waitFor(P, `/approved/i.test(document.getElementById('theater-review-feedback')?.textContent || '')`, { timeout: 20000 });
    await sleep(1200);
    await shot(P, 'reviewer-3-approved');
  } catch (e) { await shot(P, 'ERROR-reviewer').catch(() => {}); throw e; }
  finally { await killApp(app); }
}

(async () => {
  console.log('Writing screenshots to', OUT);
  if (want('agents')) await agents();
  if (want('servers')) await servers();
  if (want('gitprojects')) await gitprojects();
  const flow = ['planner', 'devcentral', 'implementer', 'review', 'reviewer'].some(want);
  if (flow) {
    await planner();             // files the issues the later steps use
    if (want('devcentral')) await devcentral();
    await implementer();
    if (want('review') || want('reviewer')) {
      const manifest = ctx.prepareReview();
      await review(manifest);
      if (want('reviewer')) await reviewer();
    }
  }
  console.log('Done.');
})().catch(e => { console.error(e); process.exit(1); });
