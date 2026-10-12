'use strict';
/**
 * End-to-end hero recording: one task, from idea to merged PR, in the real apps.
 *
 *   Task Explorer -> Task Implementer -> PR Review Theater (owner) -> PR Review (reviewer)
 *
 * The forge (gh), the coding agent (claude / codex) and CI results are scripted
 * stand-ins (see lib/lifecycle); git, the repository, its tests, the evidence
 * and every screen are real. Run it under a virtual display:
 *
 *   xvfb-run -a -s "-screen 0 1920x1080x24" node packages/robos-test/demos/review-lifecycle-hero-demo.js [outDir]
 */
const fs = require('fs');
const path = require('path');
const { launchApp, killApp } = require('../lib/harness');
const { createContext } = require('../lib/lifecycle/env');
const forge = require('../lib/lifecycle/forge');
const D = require('../lib/lifecycle/driver');
const { sleep, click, type, waitFor, evalJS, screenshot } = D;

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'run', 'review-lifecycle-hero'));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
const ctx = createContext(path.join(OUT, 'world'));
Object.assign(process.env, ctx.env);          // the demo itself calls forge helpers

const FRAMES = path.join(OUT, 'frames');
let frameNo = 0;
const rec = new D.Recorder(path.join(OUT, 'raw.mkv'));
const PR_URL = () => `https://github.com/${forge.REPO}/pull/${ctx.readState().prs[0].number}`;

async function open(appId, scenario) {
  rec.cutStart();
  const app = await launchApp(appId, scenario);
  await D.maximizeWindow(app.port);
  await sleep(1800);
  rec.cutEnd();
  return app;
}
async function frame(app, name) { await screenshot(app.port, path.join(FRAMES, `${String(++frameNo).padStart(2, '0')}-${name}.png`)); }

// ── 1. Task created ─────────────────────────────────────────────────────────
async function taskCreated() {
  const app = await open('task-planner', ctx.scenario('planner'));
  try {
    rec.step('task-created');
    await sleep(1200);
    await click(app.port, '#prompt-input', { after: 300 });
    await type(app.port, '#prompt-input', 'Let adopters filter pet search by species, and show the best matches first');
    await sleep(500);
    await click(app.port, '#btn-generate');
    await waitFor(app.port, `document.querySelectorAll('#task-list .task-card').length >= 2`);
    await sleep(2200);
    await frame(app, 'planner-generated');
    await evalJS(app.port, `document.querySelector('#task-list .task-card:nth-child(2)').scrollIntoView({block:'start'})`);
    await sleep(1800);
    await click(app.port, '#btn-create-all');
    await waitFor(app.port, `document.querySelectorAll('.task-card.task-synced .ticket-badge').length >= 2`);
    await evalJS(app.port, `window.scrollTo(0, 0); document.querySelector('#task-list').scrollIntoView({block:'start'})`);
    await sleep(3200);
    await frame(app, 'planner-created');
  } finally { await killApp(app); }
}

// ── 2. Task implemented ─────────────────────────────────────────────────────
async function taskImplemented() {
  const app = await open('task-implementer', ctx.scenario('implementer'));
  try {
    rec.step('task-implemented');
    await sleep(1500);
    await click(app.port, '.task-item[data-key="#42"]');
    await sleep(1800);
    await click(app.port, '#btn-start-agent');
    await waitFor(app.port, `/finished successfully/i.test(document.getElementById('agent-status').textContent)`, { timeout: 60000 });
    await sleep(3500);
    await frame(app, 'implementer-done');
  } finally { await killApp(app); }
}

// ── 3-8. Owner review: changes, evidence, walkthrough, draft PR, CI, ready ──
async function ownerReview(manifest) {
  const app = await open('pr-review', ctx.reviewScenario('owner', { manifest }));
  const P = app.port;
  const settle = () => waitFor(P, `!document.querySelector('#startup-screen') || document.querySelector('#startup-screen').hidden`);
  try {
    await settle();
    await sleep(800);

    rec.step('review-changes');
    await click(P, '#step-btn-3');
    await waitFor(P, `document.querySelector('#stage-3 .changes-diff')?.getClientRects().length`);
    await sleep(2200);
    await evalJS(P, `document.querySelector('#stage-3 .changes-diff').scrollBy({top: 380, behavior: 'smooth'})`);
    await sleep(2000);
    await frame(app, 'changes');
    await click(P, { text: 'Viewed', within: '#stage-3' });
    await sleep(1200);

    rec.step('review-evidence');
    await click(P, '#step-btn-5');
    await waitFor(P, `document.querySelector('#stage-5')?.getClientRects().length`);
    await sleep(2800);
    await frame(app, 'evidence');
    await evalJS(P, `(() => { const d = [...document.querySelectorAll('*')].flatMap(e => e.shadowRoot ? [...e.shadowRoot.querySelectorAll('details')] : []); const t = d.find(x => /Unknown species/.test(x.textContent)); if (t) t.open = true; })()`);
    await sleep(3000);

    rec.step('review-walkthrough');
    await click(P, '#step-btn-6');
    await waitFor(P, `document.querySelector('#stage-6')?.getClientRects().length`);
    await sleep(1500);
    await click(P, { text: 'Start', within: '#stage-6' });
    await waitFor(P, `/Step 1 of/.test(document.querySelector('#stage-6 .walkthrough-status')?.textContent || '')`, { timeout: 60000 });
    await sleep(2800);
    await frame(app, 'walkthrough-1');
    await click(P, { text: 'Next step', within: '#stage-6' });
    await waitFor(P, `/Walkthrough complete|Step 2 of/.test(document.querySelector('#stage-6 .walkthrough-status')?.textContent || '')`, { timeout: 60000 });
    await sleep(3500);
    await frame(app, 'walkthrough-2');

    rec.step('draft-pr');
    await click(P, '#step-btn-8');
    await sleep(1500);
    await click(P, { text: 'Create as draft', within: '#stage-8' });
    await sleep(900);
    await frame(app, 'create-pr-form');
    await click(P, { text: 'Create PR', within: '#stage-8' });
    await waitFor(P, `document.querySelector('#step-btn-8')?.dataset.prStatus === 'draft' || /In Draft/.test(document.querySelector('#step-btn-8')?.textContent || '')`, { timeout: 40000 });
    await sleep(2500);
    await frame(app, 'draft-pr');

    rec.step('ci');
    const head = ctx.readState().prs[0] && require('../lib/lifecycle/pulls').headOid(ctx.env, ctx.readState().prs[0].headRefName);
    const setChecks = (rows) => { const s = ctx.readState(); s.ci = s.ci || {}; s.ci.byHead = s.ci.byHead || {}; s.ci.byHead[head] = rows; ctx.writeState(s); };
    const refresh = async () => { await click(P, { text: 'Refresh CI' }, { after: 1500 }); };
    setChecks([{ name: 'build', status: 'IN_PROGRESS' }, { name: 'unit-tests', status: 'QUEUED' }, { name: 'lint', status: 'QUEUED' }, { name: 'contract-check', status: 'QUEUED' }]);
    await refresh();
    await sleep(2800);
    await frame(app, 'ci-pending');
    setChecks([{ name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'unit-tests', status: 'IN_PROGRESS' }, { name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'contract-check', status: 'QUEUED' }]);
    await refresh();
    await sleep(2500);
    setChecks([{ name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'unit-tests', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'contract-check', status: 'COMPLETED', conclusion: 'SUCCESS' }]);
    await refresh();
    await waitFor(P, `/CI checks passed/.test(document.querySelector('.review-live-ci')?.textContent || '')`, { timeout: 20000 });
    await sleep(3000);
    await frame(app, 'ci-passed');

    rec.step('ready');
    await click(P, '#pr-ready-button');
    await sleep(1800);
    await frame(app, 'ready-dialog');
    await click(P, '.pr-ready-dialog .pr-ready-button');
    await waitFor(P, `/ready for review/i.test(document.querySelector('#pr-ready-status')?.textContent || '')`, { timeout: 30000 });
    await sleep(3000);
    await frame(app, 'in-review');
  } catch (e) { await frame(app, 'ERROR').catch(() => {}); throw e; }
  finally { await killApp(app); }
}

// ── 9. Reviewer approves ────────────────────────────────────────────────────
async function reviewerApproves() {
  const app = await open('pr-review', ctx.reviewScenario('reviewer', { prUrl: PR_URL() }));
  const P = app.port;
  try {
    await waitFor(P, `!document.querySelector('#startup-screen') || document.querySelector('#startup-screen').hidden`);
    rec.step('reviewer-approves');
    await sleep(2200);
    await frame(app, 'reviewer-description');
    await click(P, '#step-btn-3');
    await waitFor(P, `document.querySelector('#stage-3 .changes-diff')?.getClientRects().length`);
    await sleep(2800);
    await evalJS(P, `document.querySelector('#stage-3 .changes-diff').scrollBy({top: 380, behavior: 'smooth'})`);
    await sleep(2200);
    await frame(app, 'reviewer-changes');
    // The reviewer-mode knowledge check is placeholder content (not about this change).
    // Pass it with the recorder paused-and-cut so it never appears in the video, then land on Approve.
    rec.cutStart();
    await evalJS(P, `(async () => { window.setTheaterStage(1); await new Promise(r => setTimeout(r, 600));
      for (const [n, v] of [['q-q1-mtls', 1], ['q-q2-transaction', 2], ['q-q3-kgraph-merge', 1]]) { const r = document.querySelector('input[name="' + n + '"][value="' + v + '"]'); if (r) r.checked = true; }
      document.getElementById('btn-submit-quiz')?.click();
      await new Promise(r => setTimeout(r, 900));
      window.setTheaterStage(7); })()`);
    await sleep(900);
    rec.cutEnd();
    await sleep(1200);
    await type(P, '#theater-review-notes', 'Clear change, and the before/after evidence matches the acceptance criteria. Approving.', { delay: 22 });
    await sleep(800);
    await frame(app, 'reviewer-approve-form');
    await click(P, '#btn-theater-submit-review');
    await waitFor(P, `/approved/i.test(document.getElementById('theater-review-feedback')?.textContent || '')`, { timeout: 20000 });
    await sleep(3000);
    await frame(app, 'reviewer-approved');
  } catch (e) { await frame(app, 'ERROR').catch(() => {}); throw e; }
  finally { await killApp(app); }
}

// ── 10-11. Owner merges, watches CI, acts on the failure ────────────────────
async function ownerMerges(manifest) {
  const app = await open('pr-review', ctx.reviewScenario('owner', { manifest }));
  const P = app.port;
  try {
    await waitFor(P, `!document.querySelector('#startup-screen') || document.querySelector('#startup-screen').hidden`);
    rec.step('owner-merges');
    await click(P, '#step-btn-8');
    await sleep(2200);
    await frame(app, 'before-merge');
    const prNumber = String(ctx.readState().prs[0].number);
    rec.note(`$ gh pr merge ${prNumber} --squash`);
    require('child_process').execFileSync(path.join(__dirname, '..', 'lib', 'lifecycle', 'bin', 'gh'), ['pr', 'merge', prNumber, '--squash', '--repo', forge.REPO], { env: { ...process.env, GH_TOKEN: 'token-' + forge.ME } });
    await sleep(1800);
    await click(P, { text: 'Reload PR', within: '#stage-8' });
    await waitFor(P, `/Merged/.test(document.querySelector('#step-btn-8')?.textContent || '')`, { timeout: 20000 });
    await sleep(3000);
    await frame(app, 'merged');

    rec.step('post-merge-ci');
    const s = ctx.readState(); s.ci.postMerge = [
      { name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'unit-tests', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'contract-check', status: 'COMPLETED', conclusion: 'FAILURE' }];
    ctx.writeState(s);
    await click(P, { text: 'Refresh CI' }, { after: 1500 });
    await waitFor(P, `/CI checks failed/.test(document.querySelector('.review-live-ci')?.textContent || '')`, { timeout: 20000 });
    await sleep(3200);
    await frame(app, 'post-merge-ci-failed');
  } catch (e) { await frame(app, 'ERROR').catch(() => {}); throw e; }
  finally { await killApp(app); }
}

async function followUp() {
  const app = await open('task-planner', ctx.scenario('planner-followup'));
  try {
    await sleep(1200);
    await click(app.port, '#prompt-input', { after: 300 });
    await type(app.port, '#prompt-input', 'contract-check fails on main after the merge: document the species query parameter in the OpenAPI spec');
    await sleep(500);
    await click(app.port, '#btn-generate');
    await waitFor(app.port, `document.querySelectorAll('#task-list .task-card').length >= 1`);
    await sleep(2200);
    await click(app.port, '#btn-create-all');
    await waitFor(app.port, `document.querySelectorAll('.task-card.task-synced .ticket-badge').length >= 1`);
    await sleep(3500);
    await frame(app, 'followup-created');
  } finally { await killApp(app); }
}

(async () => {
  await rec.start();
  await taskCreated();
  await taskImplemented();
  const manifest = ctx.prepareReview();
  await ownerReview(manifest);
  await reviewerApproves();
  await ownerMerges(manifest);
  await followUp();
  await rec.stop();
  fs.writeFileSync(path.join(OUT, 'forge-calls.json'), JSON.stringify(ctx.calls(), null, 2));
  console.log('Recorded to', OUT);
})().catch(async (e) => { console.error(e); try { await rec.stop(); } catch {} process.exit(1); });
