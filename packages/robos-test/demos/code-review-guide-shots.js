'use strict';
/**
 * Screenshots for the Code Review guide on rowbose.com (site/code-review/).
 *
 * Drives the real review window (packages/pr-review) through the sample project used by
 * the home-page recording (lib/lifecycle): a real git repository, real tests, real
 * before/after evidence captured in a browser, and the running app. The forge (gh), the
 * agents' narration and CI results are scripted stand-ins.
 *
 * Two kinds of capture:
 *   - window shots: the review window alone, drawn at 4/3 scale;
 *   - side-by-side shots: the whole virtual display, with the app the agent opened on the
 *     left and the review window with its agent chat on the right.
 *
 *   xvfb-run -a -s "-screen 0 2560x1440x24" node packages/robos-test/demos/code-review-guide-shots.js [outDir] [--world=/root/src]
 *   node packages/robos-test/demos/code-review-guide-shots.js --publish [outDir]
 *
 * --publish converts outDir/*.png to site/assets/code-review/*.jpg (needs python3 + Pillow).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const { createHash } = require('crypto');
const { launchApp, killApp } = require('../lib/harness');
const { createContext } = require('../lib/lifecycle/env');
const forge = require('../lib/lifecycle/forge');
const appwin = require('../lib/lifecycle/appwin');
const D = require('../lib/lifecycle/driver');
const { sleep, click, type, typeEditable, waitFor, evalJS } = D;

const args = process.argv.slice(2);
const OUT = path.resolve(args.find(a => !a.startsWith('--')) || path.join(__dirname, '..', 'run', 'code-review-guide-shots'));
const SITE = path.resolve(__dirname, '..', '..', '..', 'site', 'assets', 'code-review');

if (args.includes('--publish')) {
  fs.mkdirSync(SITE, { recursive: true });
  execFileSync('python3', ['-I', '-c', `
import sys, os
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
for f in sorted(os.listdir(src)):
    if not f.endswith('.png') or f.startswith('ERROR'): continue
    im = Image.open(os.path.join(src, f)).convert('RGB')
    width = 2200 if f.startswith('side-') else 1600   # side-by-side shots keep more pixels
    if im.width > width: im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(os.path.join(dst, f[:-4] + '.jpg'), quality=80, optimize=True, progressive=True)
    print(f[:-4] + '.jpg', im.size)
`, OUT, SITE], { stdio: 'inherit' });
  process.exit(0);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'run'), { recursive: true });
// --world=<dir> puts the sample checkout at a path that reads well in screenshots (it is wiped first).
const WORLD = (args.find(a => a.startsWith('--world=')) || '').slice(8);
const ctx = createContext(path.join(OUT, 'run'), WORLD ? { worldDir: WORLD } : {});
Object.assign(process.env, ctx.env);
const WS = ctx.world.workspace;

// The virtual display is 2560x1440 pixels; at 4/3 scale that is 1920x1080 of window space.
const SCALE = 4 / 3;
const SCREEN = { width: 1920, height: 1080 };
const APP_WIDTH = 820;   // the popped-up app on the left of side-by-side shots
Object.assign(process.env, { FAKE_APP_POSITION: '0,0', FAKE_APP_SIZE: `${APP_WIDTH},${SCREEN.height}`, FAKE_APP_SCALE: String(SCALE) });
const electronArgs = [`--force-device-scale-factor=${SCALE}`];

const post = (port, route, body) => new Promise((resolve, reject) => {
  const req = http.request({ host: 'localhost', port, path: route, method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => { res.resume(); res.on('end', resolve); });
  req.on('error', reject); req.end(JSON.stringify(body));
});
const place = async (P, b) => { await post(P, '/window/bounds', b); await sleep(900); };
const WINDOW = { x: 0, y: 0, width: 1400, height: 900 };            // window shots
const FULL = { x: 0, y: 0, ...SCREEN };                             // the review window with a wide chat
const RIGHT = { x: APP_WIDTH, y: 0, width: SCREEN.width - APP_WIDTH, height: SCREEN.height };   // beside the app

async function tidy(P) {
  await evalJS(P, `(() => { if (window.__rbPointer) window.__rbPointer.style.display = 'none'; document.querySelectorAll('.toastui-editor-tooltip').forEach(t => t.style.display = 'none'); document.activeElement && document.activeElement.blur && document.activeElement.blur(); })()`).catch(() => {});
  await sleep(700);
}
/** The review window alone. */
async function shot(P, name) {
  await tidy(P);
  await D.screenshot(P, path.join(OUT, name + '.png'));
  console.log('  shot', name);
}
/** The whole display: the app on the left, the review window on the right. */
async function screen(P, name) {
  await tidy(P);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '2560x1440', '-i', process.env.DISPLAY + '.0', '-frames:v', '1', path.join(OUT, name + '.png')]);
  console.log('  shot', name);
}
const settled = (P) => waitFor(P, `!document.querySelector('#startup-screen') || document.querySelector('#startup-screen').hidden`);
const CHAT = 'robos-agent-discussion .robos-ai-inner';
const SEND = 'robos-agent-discussion .robos-submit-btn';
const DISCUSSION = `(document.querySelector('robos-agent-discussion')?.textContent || '')`;
const idle = (P) => waitFor(P, `!/Working…/.test(${DISCUSSION})`, { timeout: 90000 });
const chatWidth = (P, w) => evalJS(P, `(() => { const p = document.querySelector('.review-agent-pane'); if (p) p.style.width = '${w}'; })()`);
const evidenceView = `document.querySelector('#stage-5 [data-evidence-view]')`;
/** Open one evidence scenario (and close the others), scrolled into view. */
const openScenario = (P, pattern, block = 'start') => evalJS(P, `(() => { const v = ${evidenceView}; const ds = [...v.shadowRoot.querySelectorAll(':host > details, details')].filter(d => d.parentNode === v.shadowRoot); ds.forEach(d => d.open = false); const t = ds.find(d => ${pattern}.test(d.querySelector('summary').textContent)); if (t) { t.open = true; setTimeout(() => t.scrollIntoView({ block: '${block}' }), 300); } return !!t; })()`);
/** Tick Viewed on the given files in the Changes tab. */
async function markViewed(P, files) {
  for (const f of files) {
    await click(P, `#stage-3 [data-tree-node=file][data-file-path="${f}"]`, { ripple: false, settle: 200, after: 500 });
    await evalJS(P, `(() => { const box = [...document.querySelectorAll('#stage-3 .changes-filebar input[type=checkbox]')][0]; if (box && !box.checked) box.click(); })()`);
    await sleep(400);
  }
}
const changedFiles = () => execFileSync('git', ['diff', '--name-only', 'origin/main', 'HEAD'], { cwd: WS, encoding: 'utf8' }).split('\n').filter(Boolean);

function reviewScenario(manifest, reviewSteps) {
  const s = ctx.reviewScenario('owner', { manifest });
  if (reviewSteps) {
    const key = createHash('sha256').update(forge.REPO.toLowerCase()).digest('hex');
    s.files[`.robos/project-review-settings/${key}.json`] = { githubReviewers: [forge.REVIEWER], reviewSteps };
  }
  return { ...s, electronArgs };
}

// ── The sample task: planned and implemented (no screenshots; see build-apps-guide-shots) ──
async function prepare() {
  let app = await launchApp('task-planner', ctx.scenario('planner'));
  try {
    await sleep(2500);
    await type(app.port, '#prompt-input', 'Let adopters filter pet search by species, and show the best matches first', { delay: 1 });
    await click(app.port, '#btn-generate');
    await waitFor(app.port, `document.querySelectorAll('#task-list .task-card').length >= 2`);
    await click(app.port, '#btn-create-all');
    await waitFor(app.port, `document.querySelectorAll('.task-card.task-synced .ticket-badge').length >= 2`);
  } finally { await killApp(app); }
  app = await launchApp('task-implementer', ctx.scenario('implementer'));
  try {
    await sleep(2500);
    await click(app.port, '.task-item[data-key="#42"]');
    await sleep(1200);
    await click(app.port, '#btn-start-agent');
    await waitFor(app.port, `/finished successfully/i.test(document.getElementById('agent-status').textContent)`, { timeout: 90000 });
  } finally { await killApp(app); }
  console.log('  task #42 implemented on codex/42');
  return ctx.prepareReview();
}

// ── The author's review: every tab, the agent chat beside it ───────────────────
async function authorReview(manifest) {
  const app = await launchApp('pr-review', reviewScenario(manifest));
  const P = app.port;
  try {
    await place(P, WINDOW);
    await settled(P);
    await sleep(1500);
    await shot(P, 'tab-description');

    // Changes
    await click(P, '#step-btn-3');
    await waitFor(P, `document.querySelector('#stage-3 .changes-diff')?.getClientRects().length`);
    await sleep(800);
    await click(P, '#stage-3 [data-tree-node=file][data-file-path="src/pets.js"]', { ripple: false });
    await sleep(1000);
    await shot(P, 'changes-unified');
    await click(P, { text: 'Split', within: '#stage-3' }, { ripple: false });
    await sleep(1200);
    await shot(P, 'changes-split');
    await click(P, { text: 'Unified', within: '#stage-3' }, { ripple: false });
    await markViewed(P, ['public/index.html', 'src/server.js']);
    await click(P, '#stage-3 [data-tree-node=file][data-file-path="src/pets.js"]', { ripple: false });
    await sleep(900);
    await shot(P, 'changes-viewed');

    // Ask for a change from the Changes tab: the diff on the left, the agent on the right.
    await place(P, FULL);
    await click(P, { text: 'Suggest changes', within: '#stage-3' });
    await waitFor(P, `!!document.querySelector('${CHAT}')`);
    await chatWidth(P, '44%');
    await sleep(600);
    await typeEditable(P, CHAT, 'Remove the comments in src/pets.js that just restate the code. Keep the ones that explain why.', { delay: 2 });
    await shot(P, 'side-changes-ask');
    await click(P, SEND);
    await waitFor(P, `/Found \\d+/.test(${DISCUSSION})`, { timeout: 60000 });
    await sleep(600);
    await shot(P, 'side-changes-working');
    await waitFor(P, `/committed|Done\\./i.test(${DISCUSSION})`, { timeout: 60000 });
    await idle(P);
    await sleep(1800);
    await click(P, '#stage-3 [data-tree-node=file][data-file-path="src/pets.js"]', { ripple: false });
    await sleep(1200);
    await shot(P, 'side-changes-done');

    // Evidence: stale after the agent's commit, then regenerated with a new case.
    await click(P, '#step-btn-5');
    await waitFor(P, `!!${evidenceView}`);
    await sleep(1500);
    await shot(P, 'side-evidence-stale');
    await typeEditable(P, CHAT, 'Regenerate the evidence for the latest commit, and add a case that combines a text search with a species filter.', { delay: 2 });
    await click(P, SEND);
    await waitFor(P, `/Captured .Unknown species/.test(${DISCUSSION})`, { timeout: 90000 });
    await sleep(1200);
    await shot(P, 'side-evidence-making');
    await waitFor(P, `[...(${evidenceView}?.shadowRoot?.querySelectorAll('details') || [])].some(d => /combine/i.test(d.textContent))`, { timeout: 90000 });
    await idle(P);
    await sleep(1800);
    await openScenario(P, '/combine/i');
    await sleep(1600);
    await shot(P, 'side-evidence-done');

    // The evidence itself, full width: before and after screenshots of the same action.
    await evalJS(P, `window.reviewAgent.close()`);
    await place(P, WINDOW);
    for (const [name, pattern] of [['evidence-species', '/requested species/'], ['evidence-ranking', '/rank first/'], ['evidence-api', '/Unknown species/'], ['evidence-combine', '/combine/']]) {
      await openScenario(P, pattern);
      await sleep(1800);
      await shot(P, name);
    }
    await evalJS(P, `(() => { const v = ${evidenceView}; const d = [...v.shadowRoot.querySelectorAll('details')].find(d => /requested species/.test(d.textContent)); d.querySelector('.kind-text')?.scrollIntoView({ block: 'center' }); })()`);
    await sleep(900);
    await shot(P, 'evidence-checks');

    // Walkthrough: step 1 in the window, then the app pops up on the left.
    await click(P, '#step-btn-6');
    await waitFor(P, `document.querySelector('#stage-6')?.getClientRects().length`);
    await sleep(1000);
    await shot(P, 'walk-ready');
    await click(P, { text: 'Start', within: '#stage-6' });
    await waitFor(P, `/Step 1 of/.test(document.querySelector('#stage-6 .walkthrough-status')?.textContent || '')`, { timeout: 60000 });
    await evalJS(P, `window.reviewAgent.open('walkthrough')`);
    await sleep(1500);
    await shot(P, 'walk-step-1');
    await place(P, RIGHT);
    await chatWidth(P, '52%');
    await click(P, { text: 'Next step', within: '#stage-6' });
    await waitFor(P, `/Walkthrough complete|Step 2 of/.test(document.querySelector('#stage-6 .walkthrough-status')?.textContent || '')`, { timeout: 90000 });
    await idle(P);
    await sleep(2000);
    await screen(P, 'side-walk-app');
    await typeEditable(P, CHAT, 'Show the species as clickable chips instead of a dropdown.', { delay: 2 });
    await screen(P, 'side-walk-ask');
    await click(P, SEND);
    {
      const { browser, page } = await appwin.appPage();
      await page.waitForSelector('#chips', { timeout: 60000 });
      await browser.close();
    }
    await sleep(2500);
    await screen(P, 'side-walk-working');
    await idle(P);
    await sleep(2000);
    await screen(P, 'side-walk-done');
    await click(P, { text: 'More', within: '#stage-6', tag: 'summary' }, { ripple: false });
    await sleep(700);
    await screen(P, 'side-walk-more');
    await click(P, { text: 'Process…', within: '#stage-6' }, { ripple: false });
    await sleep(1200);
    await screen(P, 'side-walk-process');
    await evalJS(P, `document.querySelector('dialog[open]')?.close()`);
    appwin.stopApp();
    await sleep(800);
  } catch (e) { await D.screenshot(P, path.join(OUT, 'ERROR-author.png')).catch(() => {}); throw e; }
  finally { appwin.stopApp(); await killApp(app); }
}

// ── Customize: required, optional and hidden steps ─────────────────────────────
async function projectSettings(reviewSteps) {
  const key = createHash('sha256').update(forge.REPO.toLowerCase()).digest('hex');
  const scenario = {
    ...ctx.scenario('git-projects'), electronArgs,
    files: {
      '.config/robos/git-projects.json': { projects: [{ id: 'pawfinder-api', url: `https://github.com/${forge.REPO}`, host: 'github.com', org: 'acme-corp', repo: 'pawfinder-api', localPath: WS, defaultBranch: 'main' }] },
      [`.robos/project-review-settings/${key}.json`]: { githubReviewers: [forge.REVIEWER], reviewSteps, prTemplate: '## What changed\n{{description}}\n\n## How it was verified\n- Tests:\n- Evidence: see the review window\n\nTask: {{url}}' },
    },
  };
  const app = await launchApp('git-projects', scenario);
  const P = app.port;
  try {
    await place(P, { x: 0, y: 0, width: 1400, height: 1000 });
    await waitFor(P, `!!document.querySelector('.tree-repo[data-id="pawfinder-api"]')`);
    await click(P, '.tree-repo[data-id="pawfinder-api"]', { ripple: false });
    await sleep(1500);
    await click(P, '[data-tab="pr-review-settings"]', { ripple: false });
    await waitFor(P, `!!document.querySelector('.review-steps-settings select')`);
    await sleep(1200);
    await evalJS(P, `document.querySelector('.review-steps-settings').scrollIntoView({ block: 'center' })`);
    await sleep(600);
    await shot(P, 'steps-settings');
  } finally { await killApp(app); }
}

async function requiredSteps(manifest) {
  const app = await launchApp('pr-review', reviewScenario(manifest, { changes: 'required', evidence: 'required', walkthrough: 'required' }));
  const P = app.port;
  try {
    await place(P, WINDOW);
    await settled(P);
    await sleep(1500);
    await click(P, '#step-btn-8');
    await waitFor(P, `!!document.querySelector('.review-steps-checklist:not([hidden]) li')`);
    await sleep(1200);
    await shot(P, 'steps-blocked');

    await click(P, '#step-btn-3');
    await waitFor(P, `document.querySelector('#stage-3 .changes-diff')?.getClientRects().length`);
    await sleep(800);
    await markViewed(P, changedFiles());
    await sleep(800);
    await shot(P, 'steps-changes-viewed');

    await click(P, '#step-btn-6');
    await sleep(800);
    await click(P, { text: 'Start', within: '#stage-6' });
    await waitFor(P, `/Step 1 of/.test(document.querySelector('#stage-6 .walkthrough-status')?.textContent || '')`, { timeout: 60000 });
    await click(P, { text: 'Next step', within: '#stage-6' });
    await waitFor(P, `/Walkthrough complete/.test(document.querySelector('#stage-6 .walkthrough-status')?.textContent || '')`, { timeout: 90000 });
    appwin.stopApp();
    await evalJS(P, `window.reviewAgent.close()`);
    await sleep(1200);

    await click(P, '#step-btn-8');
    await waitFor(P, `!document.querySelector('.review-steps-checklist li.missing')`, { timeout: 20000 });
    await click(P, { text: 'Create as draft', within: '#stage-8' }, { ripple: false });
    await sleep(900);
    await shot(P, 'steps-ready');
    await click(P, { text: 'Create PR', within: '#stage-8' }, { ripple: false });
    await waitFor(P, `document.querySelector('#step-btn-8')?.dataset.prStatus === 'draft'`, { timeout: 40000 });
    await sleep(1500);
    await shot(P, 'pr-draft');
  } catch (e) { await D.screenshot(P, path.join(OUT, 'ERROR-required.png')).catch(() => {}); throw e; }
  finally { appwin.stopApp(); await killApp(app); }
}

async function hiddenSteps(manifest) {
  const app = await launchApp('pr-review', reviewScenario(manifest, { changes: 'optional', evidence: 'required', walkthrough: 'hidden' }));
  const P = app.port;
  try {
    await place(P, WINDOW);
    await settled(P);
    await sleep(1500);
    await click(P, '#step-btn-5');
    await waitFor(P, `!!${evidenceView}`);
    await sleep(1500);
    await shot(P, 'steps-hidden');
  } finally { await killApp(app); }
}

// ── Reviewer mode: the team policy ──────────────────────────────────────────────
async function reviewerPolicy() {
  const prUrl = `https://github.com/${forge.REPO}/pull/${ctx.readState().prs[0].number}`;
  const app = await launchApp('pr-review', { ...ctx.reviewScenario('reviewer', { prUrl }), electronArgs });
  const P = app.port;
  try {
    await place(P, WINDOW);
    await settled(P);
    await sleep(2000);
    await shot(P, 'reviewer-default');
    await click(P, { text: 'Review settings' }, { ripple: false });
    await sleep(1500);
    await shot(P, 'policy-editor');
    // A lighter policy: no quiz, no docs tab, no IDE tab; Changes and Evidence required, Walkthrough optional.
    await evalJS(P, `(() => { const set = (id, v) => { const el = document.getElementById(id); if (el && el.checked !== v) el.click(); };
      set('cfg-s1-enabled', false); set('cfg-s2-enabled', false); set('cfg-s4-enabled', false);
      set('cfg-s3-required', true); set('cfg-s5-required', true); set('cfg-s6-required', false);
      document.getElementById('card-cfg-stage-3').scrollIntoView({ block: 'start' }); })()`);
    await sleep(900);
    await shot(P, 'policy-custom');
    await click(P, '.btn-save-policy', { ripple: false });
    await sleep(1500);
    await evalJS(P, `(() => { const b = [...document.querySelectorAll('button')].find(b => /^(Close|Cancel|✕)/.test(b.textContent.trim()) && b.offsetParent); if (b) b.click(); })()`);
    await sleep(900);
    await click(P, '#step-btn-3');
    await waitFor(P, `document.querySelector('#stage-3 .changes-diff')?.getClientRects().length`);
    await sleep(1500);
    await shot(P, 'policy-applied');
  } catch (e) { await D.screenshot(P, path.join(OUT, 'ERROR-reviewer.png')).catch(() => {}); throw e; }
  finally { await killApp(app); }
}

(async () => {
  console.log('Writing screenshots to', OUT);
  const manifest = await prepare();
  await authorReview(manifest);
  await projectSettings({ changes: 'required', evidence: 'required', walkthrough: 'optional' });
  await requiredSteps(manifest);
  await hiddenSteps(manifest);
  await reviewerPolicy();
  console.log('Done.');
})().catch(e => { console.error(e); appwin.stopApp(); process.exit(1); });
