'use strict';
/**
 * End-to-end hero recording: one task, from idea to merged PR, in the real apps.
 *
 *   the app today -> Task Explorer -> Task Implementer -> Code Review Theater (owner:
 *   changes, evidence, walkthrough, draft PR, CI, ready) -> reviewer -> merge -> CI ->
 *   follow-up task -> the deployed app
 *
 * The forge (gh), the coding agents (claude / codex) and CI results are scripted stand-ins
 * (see lib/lifecycle); git, the repository, its tests, the evidence, the running app and
 * every screen are real. Speech-bubble callouts are injected into the real windows.
 *
 *   xvfb-run -a -s "-screen 0 1920x1080x24" node packages/robos-test/demos/review-lifecycle-hero-demo.js [outDir] [--from=review]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { launchApp, killApp } = require('../lib/harness');
const { createContext } = require('../lib/lifecycle/env');
const forge = require('../lib/lifecycle/forge');
const world = require('../lib/lifecycle/world');
const appwin = require('../lib/lifecycle/appwin');
const D = require('../lib/lifecycle/driver');
const { sleep, click, type, typeEditable, waitFor, evalJS, callout, clearCallout } = D;

const args = process.argv.slice(2);
const FROM_REVIEW = args.includes('--from=review');
const OUT = path.resolve(args.find(a => !a.startsWith('--')) || path.join(__dirname, '..', 'run', 'review-lifecycle-hero'));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const ctx = createContext(path.join(OUT, 'world'));
Object.assign(process.env, ctx.env);
const WS = ctx.world.workspace;

const rec = new D.Recorder(path.join(OUT, 'raw.mkv'));
rec.framesDir(path.join(OUT, 'frames'));
const PR_NUMBER = () => String(ctx.readState().prs[0].number);
const PR_URL = () => `https://github.com/${forge.REPO}/pull/${PR_NUMBER()}`;

async function open(appId, scenario) {
  rec.cutStart();
  const app = await launchApp(appId, scenario);
  await D.maximizeWindow(app.port);
  await sleep(1800);
  rec.cutEnd();
  return app;
}
const settled = (P) => waitFor(P, `!document.querySelector('#startup-screen') || document.querySelector('#startup-screen').hidden`);

/** One teaching beat: caption, callout bubbles, an optional slideshow slide, then a hold. */
async function beat(P, { caption, callouts, slide, hold = 2400, dwell }) {
  if (caption) rec.caption(caption);
  if (callouts && callouts.length) await callout(P, callouts); else await clearCallout(P);
  if (slide) rec.slide(slide, { dwell: dwell || (callouts && callouts.length > 1 ? 6200 : 5200) });
  await sleep(hold);
}
const quiet = (P) => clearCallout(P);

// A bubble on the popped-up app window (a separate browser, reached over CDP).
async function appBeat(page, { caption, callouts, slide, hold = 2400, dwell }) {
  if (caption) rec.caption(caption);
  await D.calloutPage(page, callouts || [], { avoidBottom: 0 });
  if (slide) rec.slide(slide, { dwell: dwell || 5600 });
  await sleep(hold);
}

// ── Step 1. Task created ────────────────────────────────────────────────────────
async function taskCreated() {
  // 1a. The app as it is today, and what we want to change.
  rec.cutStart();
  await appwin.ensureApp(WS, { position: '80,60', size: '1760,960' });
  const { browser, page } = await appwin.appPage();
  rec.cutEnd();
  rec.step('task-created');
  await sleep(1200);
  await appBeat(page, {
    caption: 'Start from the app as it is today',
    callouts: [
      { target: '#q', side: 'top', n: 1, dx: 430, text: 'Today adopters can only search by <b>name or breed</b>', width: 440 },
      { target: '#results', side: 'bottom', n: 2, dx: 120, dy: 40, text: '<b>What we want:</b> filter by species, and show the best matches first', width: 540 },
    ],
    slide: 'app-before', hold: 3600, dwell: 6400,
  });
  await D.clearCalloutPage(page);
  await browser.close();
  rec.cutStart(); appwin.stopApp(); rec.cutEnd();

  const app = await open('task-planner', ctx.scenario('planner'));
  const P = app.port;
  try {
    await sleep(900);
    rec.caption('Describe the goal and let an AI agent plan it');
    await click(P, '#prompt-input', { after: 300 });
    await type(P, '#prompt-input', 'Let adopters filter pet search by species, and show the best matches first');
    await beat(P, {
      callouts: [
        { target: '#prompt-input', side: 'top', n: 1, dx: 380, dy: 20, text: 'Describe the <b>goal</b> in plain English', width: 380 },
        { target: '#btn-generate', side: 'right', n: 2, text: 'An AI agent drafts the <b>epic and tasks</b>', width: 340 },
      ],
      slide: 'planner-prompt', hold: 2600,
    });
    await quiet(P);
    await click(P, '#btn-generate');
    await waitFor(P, `document.querySelectorAll('#task-list .task-card').length >= 2`);
    await evalJS(P, `document.querySelector('#task-list').scrollIntoView({block:'start'})`);
    await sleep(1400);
    await beat(P, {
      caption: 'The plan comes with acceptance criteria and test cases',
      callouts: [
        { target: { sel: '#task-list .task-card:nth-child(1) .task-body-preview', ax: 0.55, ay: 0.5 }, side: 'right', n: 1, text: '<b>Epic:</b> the outcome we want', width: 340 },
        { target: { sel: '#task-list .task-card:nth-child(2) .task-body-preview', ax: 0.5, ay: 0.4 }, side: 'right', n: 2, text: '<b>Acceptance criteria</b> plus happy, negative and edge cases', width: 440 },
      ],
      slide: 'planner-generated', hold: 3000,
    });
    await quiet(P);
    await click(P, '#btn-create-all');
    await waitFor(P, `document.querySelectorAll('.task-card.task-synced .ticket-badge').length >= 2`);
    await evalJS(P, `document.querySelector('#task-list').scrollIntoView({block:'start'})`);
    await sleep(900);
    await beat(P, {
      caption: 'Synced to the tracker as real issues',
      callouts: [
        { target: '#task-list .task-card:nth-child(1) .ticket-badge', side: 'left', n: 1, dy: 40, text: 'Epic filed as issue <b>#41</b>', width: 320 },
        { target: '#task-list .task-card:nth-child(2) .ticket-badge', side: 'left', n: 2, dy: 40, text: 'The task to build is issue <b>#42</b>', width: 340 },
      ],
      slide: 'planner-created', hold: 3000,
    });
  } finally { await killApp(app); }
}

// ── Step 2. Task implemented ────────────────────────────────────────────────────
async function taskImplemented() {
  const app = await open('task-implementer', ctx.scenario('implementer'));
  const P = app.port;
  try {
    rec.step('task-implemented');
    await sleep(1400);
    await click(P, '.task-item[data-key="#42"]');
    await sleep(1400);
    await beat(P, {
      caption: 'Pick a task and let an agent implement it',
      callouts: [
        { target: '.task-item[data-key="#42"]', side: 'right', n: 1, text: 'Open issues from the tracker, including the ones we just filed', width: 380 },
        { target: '#ws-agent-persona-select', side: 'bottom', n: 2, dx: -190, dy: 90, text: 'The agent persona comes from the issue’s <b>role:</b> label', width: 380 },
        { target: '#btn-start-agent', side: 'bottom', n: 3, dx: 60, text: '<b>Start Agent:</b> it works on a branch and never opens a PR', width: 360 },
      ],
      slide: 'implementer-ready', hold: 3600,
    });
    await quiet(P);
    await click(P, '#btn-start-agent');
    await waitFor(P, `document.querySelectorAll('#agent-output .line-stdout, #agent-output span').length >= 4`, { timeout: 30000 });
    await beat(P, {
      caption: 'The agent branches, edits, tests and pushes',
      callouts: [{ target: { x: 900, y: 520, w: 1, h: 1 }, side: 'bottom', n: 1, text: '<b>Live output:</b> the branch, the edit, the test run and the push', width: 420 }],
      slide: 'implementer-running', hold: 2400,
    });
    await waitFor(P, `/finished successfully/i.test(document.getElementById('agent-status').textContent)`, { timeout: 60000 });
    await sleep(900);
    await beat(P, {
      caption: 'Branch pushed. No pull request yet',
      callouts: [
        { target: { text: 'Done. Implemented', within: '#agent-output', tag: 'span' }, side: 'right', n: 1, dx: 20, text: 'Branch <b>codex/42</b> is pushed and all <b>8 tests</b> pass', width: 400 },
        { target: '#btn-start-agent + button', side: 'bottom', n: 2, dx: -70, text: '<b>Review branch…</b> hands it to the Code Review Theater', width: 380 },
      ],
      slide: 'implementer-done', hold: 3400,
    });
  } finally { await killApp(app); }
}

// ── Steps 3-8. Owner review ─────────────────────────────────────────────────────
const CHAT = 'robos-agent-discussion .robos-ai-inner';
const SEND = 'robos-agent-discussion .robos-submit-btn';

async function ownerReview(manifest) {
  const app = await open('pr-review', ctx.reviewScenario('owner', { manifest }));
  const P = app.port;
  try {
    await settled(P);
    await sleep(700);

    // 3. Changes
    rec.step('review-changes');
    await click(P, '#step-btn-3');
    await waitFor(P, `document.querySelector('#stage-3 .changes-diff')?.getClientRects().length`);
    await sleep(1000);
    await click(P, '#stage-3 [data-tree-node=file][data-file-path="src/pets.js"]');
    await sleep(900);
    await beat(P, {
      caption: 'Review every changed file',
      callouts: [
        { target: '#stage-3 [data-tree-node=file]', side: 'right', n: 1, dy: 60, text: 'Every changed file. Tick <b>Viewed</b> as you go', width: 360 },
        { target: { text: 'Split', within: '#stage-3' }, side: 'bottom', n: 2, text: 'Unified or <b>split</b> view', width: 280 },
        { target: '#stage-3 .changes-diff', side: 'top', n: 3, dx: 120, dy: 160, text: 'The full diff of the pushed branch, not a summary', width: 380 },
      ],
      slide: 'changes-diff', hold: 3200,
    });
    await quiet(P);
    await click(P, { text: 'Suggest changes', within: '#stage-3' });
    await waitFor(P, `!!document.querySelector('${CHAT}')`);
    await sleep(700);
    await typeEditable(P, CHAT, 'Remove the comments in src/pets.js that just restate the code. Keep the ones that explain why.');
    await beat(P, {
      caption: 'Ask the agent for a change, in plain English',
      callouts: [
        { target: CHAT, side: 'left', n: 1, dy: -60, text: 'Chat with the agent <b>right here</b>. Say what to change and in which file', width: 400 },
      ],
      slide: 'changes-ask', hold: 2800,
    });
    await quiet(P);
    await click(P, SEND);
    await waitFor(P, `/Found \\d+/.test(document.querySelector('robos-agent-discussion')?.textContent || '')`, { timeout: 40000 });
    await beat(P, {
      caption: 'The agent edits the file, runs the tests and commits',
      callouts: [{ target: 'robos-agent-discussion [role=log]', side: 'left', n: 1, dy: -80, text: 'Live progress: it finds the comments, removes them, runs the tests, commits', width: 420 }],
      slide: 'changes-working', hold: 2200,
    });
    await quiet(P);
    await waitFor(P, `/committed|Done\\./i.test(document.querySelector('robos-agent-discussion')?.textContent || '') && !/Working…/.test(document.querySelector('robos-agent-discussion')?.textContent || '')`, { timeout: 60000 });
    await sleep(1600);
    await click(P, '#stage-3 [data-tree-node=file][data-file-path="src/pets.js"]');
    await sleep(900);
    await beat(P, {
      caption: 'The diff updates on its own',
      callouts: [
        { target: { x: 900, y: 400, w: 1, h: 1 }, side: 'bottom', n: 1, text: 'The <b>6 comments</b> are gone. The diff refreshed itself after the agent’s commit', width: 480 },
      ],
      slide: 'changes-updated', hold: 3000,
    });
    await quiet(P);

    // 4. Evidence
    rec.step('review-evidence');
    await click(P, '#step-btn-5');
    await waitFor(P, `!!document.querySelector('#stage-5 [data-evidence-view]')`);
    await sleep(1800);
    await beat(P, {
      caption: 'Evidence is tied to a commit',
      callouts: [
        { target: { text: 'earlier revision', within: '#stage-5' }, side: 'bottom', n: 1, dx: -120, text: 'Evidence belongs to one <b>commit</b>. The agent’s new commit made this stale', width: 470 },
      ],
      slide: 'evidence-stale', hold: 3200,
    });
    await quiet(P);
    // Give the chat more room: nudge the divider, then ask for fresh evidence.
    await evalJS(P, `(() => { const d = document.querySelector('.review-agent-divider'); d.focus(); for (let i = 0; i < 4; i++) d.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); })()`);
    await sleep(900);
    await typeEditable(P, CHAT, 'Regenerate the evidence for the latest commit, and add a case that combines a text search with a species filter.');
    await beat(P, {
      caption: 'Ask for fresh evidence, plus a new case',
      callouts: [
        { target: '.review-agent-divider', side: 'left', n: 1, dy: -200, text: 'Drag the <b>divider</b> to give the chat more room', width: 320 },
        { target: CHAT, side: 'left', n: 2, dy: -50, text: 'The same chat works on every tab. Here: <b>regenerate</b> and add a case', width: 400 },
      ],
      slide: 'evidence-ask', hold: 3000,
    });
    await quiet(P);
    await click(P, SEND);
    // Mid-run: the second scenario has been captured, the rest are still being made.
    await waitFor(P, `/Captured .Unknown species/.test(document.querySelector('robos-agent-discussion')?.textContent || '')`, { timeout: 60000 });
    await sleep(900);
    await beat(P, {
      caption: 'Evidence appears as the agent makes it',
      callouts: [{ target: 'robos-agent-discussion [role=log]', side: 'left', n: 1, dy: -80, text: 'Each scenario <b>appears here</b> as it is captured, run on main and on the branch', width: 440 }],
      slide: 'evidence-making', hold: 2600,
    });
    await quiet(P);
    await waitFor(P, `[...(document.querySelector('#stage-5 [data-evidence-view]')?.shadowRoot?.querySelectorAll('details') || [])].some(d => /combine/i.test(d.textContent))`, { timeout: 60000 });
    await sleep(2200);
    await evalJS(P, `(() => { const v = document.querySelector('#stage-5 [data-evidence-view]'); const ds = [...v.shadowRoot.querySelectorAll('details')]; ds.forEach(d => d.open = false); const t = ds.find(d => /combine/i.test(d.textContent)); if (t) { t.open = true; t.scrollIntoView({block:'center'}); } })()`);
    await sleep(900);
    await beat(P, {
      caption: 'Fresh evidence for this commit, with the new case',
      callouts: [{ target: { text: 'Text search and species filter combine', within: '#stage-5', tag: 'summary' }, side: 'bottom', n: 1, dx: 220, text: 'The new case, run <b>before and after</b> on the same data', width: 420 }],
      slide: 'evidence-updated', hold: 3000,
    });
    await quiet(P);

    // 5. Walkthrough
    rec.step('review-walkthrough');
    await click(P, '#step-btn-6');
    await waitFor(P, `document.querySelector('#stage-6')?.getClientRects().length`);
    await sleep(1200);
    await click(P, { text: 'Start', within: '#stage-6' });
    await waitFor(P, `/Step 1 of/.test(document.querySelector('#stage-6 .walkthrough-status')?.textContent || '')`, { timeout: 60000 });
    await sleep(1400);
    await beat(P, {
      caption: 'A guided walkthrough, one checkpoint at a time',
      callouts: [{ target: '#stage-6 .walkthrough-checkpoint', side: 'bottom', n: 1, dx: 300, text: 'The agent explains <b>one checkpoint</b> at a time. You decide when to move on', width: 430 }],
      slide: 'walk-start', hold: 2800,
    });
    await quiet(P);
    await click(P, { text: 'Next step', within: '#stage-6' });
    await waitFor(P, `/Walkthrough complete|Step 2 of/.test(document.querySelector('#stage-6 .walkthrough-status')?.textContent || '')`, { timeout: 90000 });
    await sleep(1600);
    {
      const { browser, page } = await appwin.appPage();
      rec.caption('The agent pops up the running app');
      await D.calloutPage(page, [{ target: '#species', side: 'bottom', n: 2, dx: 140, text: 'The agent chose <b>Cats</b> and read the results for you', width: 400 }], { avoidBottom: 120 });
      await callout(P, [{ target: '#stage-6 .walkthrough-checkpoint', side: 'top', n: 1, dx: 330, dy: 6, text: 'Checkpoint 2 launched the <b>real app</b> in its own window', width: 430 }]);
      rec.slide('walk-app', { dwell: 6400 });
      await sleep(3600);
      await D.clearCalloutPage(page);
      await browser.close();
    }
    await quiet(P);
    await evalJS(P, `window.reviewAgent.open('walkthrough')`);
    await sleep(700);
    await typeEditable(P, CHAT, 'Show the species as clickable chips instead of a dropdown.');
    await beat(P, {
      caption: 'Ask for a change while the app is open',
      callouts: [{ target: CHAT, side: 'top', n: 1, dy: -10, text: 'The app stays open. <b>Ask for any change</b> and watch it happen', width: 400 }],
      slide: 'walk-ask', hold: 2600,
    });
    await quiet(P);
    await click(P, SEND);
    {
      const { browser, page } = await appwin.appPage();
      await page.waitForSelector('#chips', { timeout: 60000 });
      await sleep(2600);
      rec.caption('The page updates live, and the change is committed');
      await D.calloutPage(page, [{ target: '#chips', side: 'bottom', n: 2, dx: 160, text: 'The page <b>reloaded itself</b> with the chips', width: 380 }], { avoidBottom: 120 });
      await callout(P, [{ target: '.review-agent-pane header', side: 'bottom', n: 1, text: 'The agent edited the page, tested it and <b>committed</b> it', width: 400 }]);
      rec.slide('walk-updated', { dwell: 6400 });
      await sleep(3400);
      await D.clearCalloutPage(page);
      await browser.close();
    }
    await quiet(P);
    await waitFor(P, `!/Working…/.test(document.querySelector('robos-agent-discussion')?.textContent || '')`, { timeout: 60000 });
    await sleep(1200);
    rec.cutStart(); appwin.stopApp(); await sleep(900); await evalJS(P, `window.reviewAgent.close()`); rec.cutEnd();

    // 6. Draft PR
    rec.step('draft-pr');
    await click(P, '#step-btn-8');
    await sleep(1500);
    await beat(P, {
      caption: 'Create the pull request as a draft',
      callouts: [
        { target: { text: 'Create pull request', within: '#stage-8', tag: 'h3' }, side: 'right', n: 1, dx: 20, text: 'The title and description are <b>saved as you edit</b>', width: 380 },
        { target: { text: 'Create as draft', within: '#stage-8' }, side: 'right', n: 2, text: 'A <b>draft</b> asks nobody to review until CI is green', width: 360 },
      ],
      slide: 'pr-form', hold: 2600,
    });
    await quiet(P);
    await click(P, { text: 'Create as draft', within: '#stage-8' });
    await sleep(600);
    await click(P, { text: 'Create PR', within: '#stage-8' });
    await waitFor(P, `document.querySelector('#step-btn-8')?.dataset.prStatus === 'draft' || /In Draft/.test(document.querySelector('#step-btn-8')?.textContent || '')`, { timeout: 40000 });
    await sleep(1800);
    await beat(P, {
      caption: 'The PR exists, as a draft',
      callouts: [{ target: '#step-btn-8', side: 'bottom', n: 1, dx: 40, text: 'PR <b>#' + PR_NUMBER() + '</b> was created on GitHub as a <b>draft</b>', width: 400 }],
      slide: 'draft-pr', hold: 2600,
    });
    await quiet(P);

    // 7. CI
    rec.step('ci');
    const head = require('../lib/lifecycle/pulls').headOid(ctx.env, ctx.readState().prs[0].headRefName);
    const setChecks = (rows) => { const s = ctx.readState(); s.ci = s.ci || {}; s.ci.byHead = s.ci.byHead || {}; s.ci.byHead[head] = rows; ctx.writeState(s); };
    const refresh = async () => { await click(P, { text: 'Refresh CI' }, { after: 1500 }); };
    setChecks([{ name: 'build', status: 'IN_PROGRESS' }, { name: 'unit-tests', status: 'QUEUED' }, { name: 'lint', status: 'QUEUED' }, { name: 'contract-check', status: 'QUEUED' }]);
    await refresh();
    await sleep(900);
    await beat(P, {
      caption: 'CI runs on the pushed commit',
      callouts: [
        { target: '.review-live-ci', side: 'bottom', n: 1, dx: -300, text: 'Checks are <b>running</b>. The page watches them for you', width: 380 },
        { target: '#theater-checks-label', side: 'bottom', n: 2, dx: 120, text: '0 of 4 checks done', width: 280 },
      ],
      slide: 'ci-pending', hold: 2600,
    });
    await quiet(P);
    setChecks([{ name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'unit-tests', status: 'IN_PROGRESS' }, { name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'contract-check', status: 'QUEUED' }]);
    await refresh();
    await sleep(1800);
    setChecks([{ name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'unit-tests', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'contract-check', status: 'COMPLETED', conclusion: 'SUCCESS' }]);
    await refresh();
    await waitFor(P, `/CI checks passed/.test(document.querySelector('.review-live-ci')?.textContent || '')`, { timeout: 20000 });
    await sleep(1200);
    await beat(P, {
      caption: 'All checks pass, so the PR can leave draft',
      callouts: [{ target: '#pr-ready-button', side: 'left', n: 1, text: 'Only when <b>every check passes</b> does “Move PR to Ready” unlock', width: 380 }],
      slide: 'ci-passed', hold: 2800,
    });
    await quiet(P);

    // 8. Ready for review
    rec.step('ready');
    await click(P, '#pr-ready-button');
    await sleep(1500);
    await beat(P, {
      caption: 'Ask for review',
      callouts: [{ target: '#pr-ready-reviewers', side: 'right', n: 1, text: 'Reviewers come from the project’s <b>review settings</b>', width: 360 }],
      slide: 'ready-dialog', hold: 2400,
    });
    await quiet(P);
    await click(P, '.pr-ready-dialog .pr-ready-button');
    await waitFor(P, `/ready for review/i.test(document.querySelector('#pr-ready-status')?.textContent || '')`, { timeout: 30000 });
    await sleep(1800);
    await beat(P, {
      caption: 'Now in review',
      callouts: [{ target: '#step-btn-8', side: 'bottom', n: 1, dx: 40, text: 'Status is now <b>In Review</b> and the reviewer has been asked', width: 380 }],
      slide: 'in-review', hold: 2600,
    });
    await quiet(P);
  } catch (e) { await D.screenshot(P, path.join(OUT, 'ERROR-owner.png')).catch(() => {}); throw e; }
  finally { await killApp(app); }
}

// ── 9. Reviewer approves ────────────────────────────────────────────────────────
async function reviewerApproves() {
  const app = await open('pr-review', ctx.reviewScenario('reviewer', { prUrl: PR_URL() }));
  const P = app.port;
  try {
    await settled(P);
    rec.step('reviewer-approves');
    await sleep(1600);
    await click(P, '#step-btn-3');
    await waitFor(P, `document.querySelector('#stage-3 .changes-diff')?.getClientRects().length`);
    await sleep(1800);
    await beat(P, {
      caption: 'The reviewer opens the same pull request',
      callouts: [
        { target: { text: 'Reviewer mode', tag: 'span,div' }, side: 'bottom', n: 1, text: 'A different person, a different window: <b>reviewer mode</b>', width: 400 },
        { target: '#stage-3 .changes-diff', side: 'top', n: 2, dx: 100, dy: 170, text: 'They read the same diff the author reviewed', width: 380 },
      ],
      slide: 'reviewer-changes', hold: 3000,
    });
    await quiet(P);
    // The reviewer-mode knowledge check is placeholder content (not about this change).
    // Pass it with the recorder cut so it never appears in the video, then land on Approve.
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
    await sleep(700);
    await click(P, '#btn-theater-submit-review');
    await waitFor(P, `/approved/i.test(document.getElementById('theater-review-feedback')?.textContent || '')`, { timeout: 20000 });
    await sleep(1200);
    await beat(P, {
      caption: 'The reviewer approves',
      callouts: [{ target: '#theater-review-feedback', side: 'top', n: 1, dx: 120, text: 'The approval is recorded on the PR. The <b>author merges</b> next', width: 420 }],
      slide: 'reviewer-approved', hold: 2800,
    });
  } catch (e) { await D.screenshot(P, path.join(OUT, 'ERROR-reviewer.png')).catch(() => {}); throw e; }
  finally { await killApp(app); }
}

// ── 10-11. Owner merges, watches CI, acts on the failure, sees it deployed ──────
async function ownerMerges(manifest) {
  const app = await open('pr-review', ctx.reviewScenario('owner', { manifest }));
  const P = app.port;
  try {
    await settled(P);
    rec.step('owner-merges');
    await click(P, '#step-btn-8');
    await sleep(1800);
    rec.note(`$ gh pr merge ${PR_NUMBER()} --squash`);
    execFileSync(path.join(__dirname, '..', 'lib', 'lifecycle', 'bin', 'gh'), ['pr', 'merge', PR_NUMBER(), '--squash', '--repo', forge.REPO], { env: { ...process.env, GH_TOKEN: 'token-' + forge.ME } });
    await sleep(1600);
    await click(P, { text: 'Reload PR', within: '#stage-8' });
    await waitFor(P, `/Merged/.test(document.querySelector('#step-btn-8')?.textContent || '')`, { timeout: 20000 });
    await sleep(1200);
    await beat(P, {
      caption: 'The author merges the approved PR',
      callouts: [{ target: '#step-btn-8', side: 'bottom', n: 1, dx: 40, text: 'Merged. RobOS shows the new state after <b>Reload PR</b>', width: 380 }],
      slide: 'merged', hold: 3000,
    });
    await quiet(P);

    rec.step('post-merge-ci');
    const s = ctx.readState(); s.ci.postMerge = [
      { name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'unit-tests', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'contract-check', status: 'COMPLETED', conclusion: 'FAILURE' }];
    ctx.writeState(s);
    await click(P, { text: 'Refresh CI' }, { after: 1500 });
    await waitFor(P, `/CI checks failed/.test(document.querySelector('.review-live-ci')?.textContent || '')`, { timeout: 20000 });
    await sleep(1200);
    await beat(P, {
      caption: 'CI keeps watching after the merge',
      callouts: [{ target: '.review-live-ci', side: 'bottom', n: 1, dx: -250, text: 'On <b>main</b>, the <b>contract-check</b> job fails after the merge', width: 420 }],
      slide: 'post-merge-ci-failed', hold: 3000,
    });
    await quiet(P);
  } catch (e) { await D.screenshot(P, path.join(OUT, 'ERROR-merge.png')).catch(() => {}); throw e; }
  finally { await killApp(app); }
}

async function followUp() {
  const app = await open('task-planner', ctx.scenario('planner-followup'));
  const P = app.port;
  try {
    await sleep(900);
    rec.caption('So the owner files a follow-up task');
    await click(P, '#prompt-input', { after: 300 });
    await type(P, '#prompt-input', 'contract-check fails on main after the merge: document the species query parameter in the OpenAPI spec');
    await sleep(400);
    await click(P, '#btn-generate');
    await waitFor(P, `document.querySelectorAll('#task-list .task-card').length >= 1`);
    await sleep(1500);
    await click(P, '#btn-create-all');
    await waitFor(P, `document.querySelectorAll('.task-card.task-synced .ticket-badge').length >= 1`);
    await evalJS(P, `document.querySelector('#task-list').scrollIntoView({block:'start'})`);
    await sleep(900);
    await beat(P, {
      caption: 'Back to step 1: the loop starts again',
      callouts: [{ target: '#task-list .task-card:nth-child(1) .ticket-badge', side: 'left', n: 1, dy: 40, text: 'Follow-up <b>#44</b> filed. Task created, and the loop starts again', width: 400 }],
      slide: 'followup-created', hold: 3000,
    });
  } finally { await killApp(app); }
}

// ── Last slide: the feature, deployed ───────────────────────────────────────────
async function deployed() {
  rec.cutStart();
  await appwin.ensureApp(WS, { position: '80,60', size: '1760,960' });
  const { browser, page } = await appwin.appPage();
  await page.click('#chips button[data-s="cat"]');
  await sleep(900);
  rec.cutEnd();
  await appBeat(page, {
    caption: 'The feature is live',
    callouts: [
      { target: '#chips', side: 'bottom', n: 1, dx: 140, text: '<b>Deployed:</b> adopters can now filter by species', width: 420 },
      { target: '#results', side: 'bottom', n: 2, dx: 120, dy: 30, text: 'Results come back <b>best match first</b>', width: 380 },
    ],
    slide: 'deployed', hold: 4200, dwell: 6800,
  });
  await D.clearCalloutPage(page);
  await browser.close();
  appwin.stopApp();
}

(async () => {
  await rec.start();
  if (FROM_REVIEW) {   // development shortcut: skip steps 1-2
    const s = ctx.readState();
    for (const [n, t] of [[41, 'Search quality: filter by species and rank results'], [42, world.TASK.title]]) {
      s.issues.push({ number: n, title: t, body: '', state: 'OPEN', labels: [], assignees: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    s.nextNumber = 42; ctx.writeState(s);
    execFileSync(path.join(__dirname, '..', 'lib', 'lifecycle', 'bin', 'claude'), ['-p', 'TASK: x\nTASK KEY: #42', '--output-format', 'stream-json'], { stdio: 'ignore' });
  } else {
    await taskCreated();
    await taskImplemented();
  }
  const manifest = ctx.prepareReview();
  await ownerReview(manifest);
  await reviewerApproves();
  await ownerMerges(manifest);
  await followUp();
  await deployed();
  await rec.stop();
  fs.writeFileSync(path.join(OUT, 'forge-calls.json'), JSON.stringify(ctx.calls(), null, 2));
  console.log('Recorded to', OUT);
})().catch(async (e) => { console.error(e); try { appwin.stopApp(); await rec.stop(); } catch {} process.exit(1); });
