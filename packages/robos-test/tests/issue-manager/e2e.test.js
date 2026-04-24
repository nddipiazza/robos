'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const {
  getSnapshot, findById, flatText, evalJS, waitForText,
} = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

describe('issue-manager E2E', () => {

  // ── No task server configured ──────────────────────────────────────────────
  describe('no-config scenario', () => {
    let app;

    before(async () => {
      app = await launchApp('issue-manager', scenarios['issue-manager-no-config']);
    });
    after(() => killApp(app));

    it('renders the app shell', async () => {
      const snap = await getSnapshot(app.port);
      assert.ok(flatText(snap).length > 0, 'Page has content');
    });

    it('exposes a Config link when no repo is configured', async () => {
      const snap = await getSnapshot(app.port);
      assert.ok(findById(snap, 'btn-to-config'), 'Config button exists');
    });

    it('exposes the AI ask and workspace setup buttons even without an issue', async () => {
      const snap = await getSnapshot(app.port);
      assert.ok(findById(snap, 'btn-ai-ask'),       'AI Ask button exists');
      assert.ok(findById(snap, 'btn-setup'),        'Set Up Workspace button exists');
      assert.ok(findById(snap, 'ai-prompt-input'),  'AI prompt input exists');
    });

    it('shows a helpful error when no repo is configured', async () => {
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      assert.ok(
        /no repository configured|no issue number/i.test(text),
        `Expected a helpful error, got: ${text.substring(0, 300)}`
      );
    });
  });

  // ── Issue 42 loaded from mock sandbox data ─────────────────────────────────
  describe('github-configured scenario, issue #42 loaded', () => {
    let app;

    before(async () => {
      app = await launchApp('issue-manager', scenarios['issue-manager-github']);
      // Navigate to issue 42 so the full issue view renders
      await evalJS(app.port,
        `window.location.href = window.location.pathname + '?view=issue&issue=42'`);
      // initIssue calls IPC + gh stub; wait for the title to update
      await waitForText(app.port, 'Worker pool exhaustion', 10000);
    });
    after(() => killApp(app));

    it('shows the issue number and title from the mock data', async () => {
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      assert.ok(text.includes('#42'), 'Issue number visible');
      assert.ok(text.includes('Worker pool exhaustion under sustained load'),
        'Issue title visible');
    });

    it('renders the repo label from the active task server', async () => {
      const repo = await evalJS(app.port,
        `document.getElementById('issue-repo-label').textContent`);
      assert.equal(repo, 'acme-corp/buildbarn-forms', 'Repo label matches scenario');
    });

    it('classifies the issue as a Bug (type badge)', async () => {
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      assert.ok(text.includes('Bug'), 'Bug type badge visible');
    });

    it('renders the full workflow state pipeline', async () => {
      const stateLabels = await evalJS(app.port, `
        JSON.stringify([...document.querySelectorAll('#state-pipeline .state-step')]
          .map(n => n.textContent.trim()))
      `);
      const labels = JSON.parse(stateLabels || '[]');
      assert.equal(labels.length, 3, `Pipeline has 3 states, got: ${labels}`);
      assert.ok(labels.some(l => /triage/i.test(l)),      `Pipeline has Triage: ${labels}`);
      assert.ok(labels.some(l => /in progress/i.test(l)), `Pipeline has In Progress: ${labels}`);
      assert.ok(labels.some(l => /done/i.test(l)),        `Pipeline has Done: ${labels}`);
    });

    it('marks the current state as active in the pipeline', async () => {
      const active = await evalJS(app.port, `
        (() => {
          const el = document.querySelector('#state-pipeline .state-step.active');
          return el ? el.textContent.trim() : null;
        })()
      `);
      assert.match(active || '', /triage/i, `Active pipeline node is Triage, got: ${active}`);
    });

    it('renders the current state chip (Triage)', async () => {
      const chip = await evalJS(app.port,
        `document.getElementById('issue-state-chip').textContent`);
      assert.match(chip, /triage/i, `State chip shows current state, got: ${chip}`);
    });

    it('renders a transition button to In Progress', async () => {
      const labels = await evalJS(app.port, `
        JSON.stringify([...document.querySelectorAll('#transition-buttons .btn-transition')]
          .map(b => b.textContent.trim()))
      `);
      const parsed = JSON.parse(labels || '[]');
      assert.ok(parsed.length > 0, `Should have at least one transition, got: ${parsed}`);
      assert.ok(parsed.some(l => /in progress/i.test(l)),
        `Should include In Progress transition, got: ${parsed}`);
    });

    it('renders the issue body including Steps to Reproduce', async () => {
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      assert.ok(text.includes('Steps to Reproduce'),
        'Markdown heading from body rendered');
      assert.ok(text.includes('pool_size'),
        'Repro step content rendered');
    });

    it('shows the issue assignee', async () => {
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      assert.ok(text.includes('testuser'),
        'Assignee from mock data rendered');
    });

    it('exposes GitHub / VS Code / Config / Workspace / AI buttons', async () => {
      const snap = await getSnapshot(app.port);
      assert.ok(findById(snap, 'btn-open-github'), 'GitHub button');
      assert.ok(findById(snap, 'btn-open-vscode'), 'VS Code button');
      assert.ok(findById(snap, 'btn-to-config'),   'Config button');
      assert.ok(findById(snap, 'btn-setup'),       'Workspace Setup button');
      assert.ok(findById(snap, 'btn-ai-ask'),      'AI Ask button');
    });

    it('typing into the AI prompt persists its value', async () => {
      const prompt = 'Why is the semaphore release missing in the error path?';
      await evalJS(app.port, `
        (() => {
          const el = document.getElementById('ai-prompt-input');
          el.value = ${JSON.stringify(prompt)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
        })()
      `);
      const value = await evalJS(app.port,
        `document.getElementById('ai-prompt-input').value`);
      assert.equal(value, prompt, 'AI prompt input reflects typed value');
    });

    it('clicking Config switches to the config view', async () => {
      await evalJS(app.port, `document.getElementById('btn-to-config').click()`);
      await sleep(200);
      const state = await evalJS(app.port, `
        (() => ({
          issueHidden: document.getElementById('view-issue').classList.contains('hidden'),
          configShown: !document.getElementById('view-config').classList.contains('hidden'),
        }))()
      `);
      assert.equal(state.issueHidden, true,  'Issue view hidden after switch');
      assert.equal(state.configShown, true,  'Config view shown after switch');
    });
  });
});
