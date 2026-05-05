'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const {
  getSnapshot, findById, findAllNodes, flatText, evalClick, evalJS, waitForText,
} = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('task-implementer E2E', () => {

  // ── No task server → empty state ─────────────────────────────────────────

  describe('no-config scenario (empty state)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('task-implementer', scenarios['task-implementer-no-config']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      assert.ok(flatText(snap).includes('Task Implementer'), 'Title visible');
    });

    it('shows the No-server empty state', () => {
      // Snapshot omits display:none nodes — visible == present in tree.
      const noServer = findById(snap, 'no-server');
      assert.ok(noServer, '#no-server element exists and is visible');
      assert.ok(flatText(snap).includes('No task server configured'),
        'Empty-state copy visible');
    });

    it('main layout (split panel) is hidden until a server is configured', () => {
      // Snapshot drops display:none nodes; missing == hidden.
      const main = findById(snap, 'main-layout');
      assert.strictEqual(main, null,
        '#main-layout not in snapshot (display:none)');
    });

    it('Open Task Servers button is offered', () => {
      assert.ok(findById(snap, 'btn-open-task-servers'),
        'Open Task Servers button present');
    });
  });

  // ── GitHub task server → list, select, agent stream ──────────────────────

  describe('github-task-server scenario (issues load + agent runs)', () => {
    let app;

    before(async () => {
      app = await launchApp('task-implementer', scenarios['task-implementer-github']);
      // Server badge updates from "Loading…" to the server name once
      // getServerInfo() resolves; the task list then loads from gh stub.
      await waitForText(app.port, 'Worker pool exhaustion', 15000);
    });
    after(() => killApp(app));

    it('shows the connected server badge', async () => {
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      assert.ok(text.includes('Acme GitHub'), 'server name in badge');
      assert.ok(text.includes('github'),      'server type in badge');
    });

    it('renders the task list from the gh stub (5 stub issues)', async () => {
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      // Same fixture set as task-board. All five issue titles must appear.
      assert.ok(text.includes('Worker pool exhaustion'),  'Issue #42 visible');
      assert.ok(text.includes('CAS deduplication'),       'Issue #38 visible');
      assert.ok(text.includes('Scheduler queue priority'),'Issue #35 visible');
      assert.ok(text.includes('gRPC health check'),       'Issue #30 visible');
      assert.ok(text.includes('Document configuration'),  'Issue #25 visible');

      // Stricter match: split classes and require an exact 'task-item' token.
      // (A loose `.includes('task-item')` would also match task-item-key, etc.)
      const itemCount = await evalJS(app.port,
        `document.querySelectorAll('#task-list > .task-item').length`);
      assert.strictEqual(itemCount, 5, '5 task items in the list');
    });

    it('shows issue keys', async () => {
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      assert.ok(text.includes('#42'), 'Key #42');
      assert.ok(text.includes('#38'), 'Key #38');
    });

    it('workspace pane shows the empty placeholder until a task is selected', async () => {
      const snap = await getSnapshot(app.port);
      assert.ok(findById(snap, 'workspace-empty'),
        '#workspace-empty visible (placeholder shown)');
      assert.strictEqual(findById(snap, 'workspace-active'), null,
        '#workspace-active hidden (no task selected)');
    });

    it('selecting a task populates the workspace pane', async () => {
      // Click the first task item.
      await evalJS(app.port, `
        (() => {
          const items = document.querySelectorAll('.task-item');
          if (items[0]) items[0].click();
        })()
      `);
      // Poll for workspace-active to appear in the snapshot (i.e. become visible).
      let active = null;
      for (let i = 0; i < 20; i++) {
        const snap = await getSnapshot(app.port);
        active = findById(snap, 'workspace-active');
        if (active) break;
        await new Promise(r => setTimeout(r, 200));
      }
      assert.ok(active, 'workspace-active visible after selecting a task');

      const key   = await evalJS(app.port,
        `document.getElementById('ws-task-key').textContent`);
      const title = await evalJS(app.port,
        `document.getElementById('ws-task-title').textContent`);

      assert.ok(key && key.startsWith('#'),  `key looks like an issue (got ${JSON.stringify(key)})`);
      assert.ok(title && title.length > 0,   `title rendered (got ${JSON.stringify(title)})`);
    });

    it('Start Agent button + extras are wired on the active workspace', async () => {
      const snap = await getSnapshot(app.port);
      assert.ok(findById(snap, 'btn-start-agent'), 'Start Agent button visible');
      assert.ok(findById(snap, 'extra-context'),   'Extra context textarea');
      assert.ok(findById(snap, 'agent-output'),    'Agent output box');
      // Stop Agent is intentionally display:none until Start is clicked,
      // so it should NOT be in the snapshot yet — but the element must exist.
      const stopExists = await evalJS(app.port,
        `!!document.getElementById('btn-stop-agent')`);
      assert.strictEqual(stopExists, true, 'Stop Agent button exists in DOM (hidden)');
    });

    it('changing the state filter to closed reloads the list', async () => {
      await evalJS(app.port, `
        (() => {
          const sel = document.getElementById('filter-state');
          sel.value = 'closed';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        })()
      `);
      // Closed-issues fixture has different titles than open. Wait for one.
      await waitForText(app.port, 'Fix blob store GC race', 10000);
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      assert.ok(text.includes('Fix blob store GC race'),
        'closed-issue fixture loaded');

      // Switch back so subsequent tests start from a known state.
      await evalJS(app.port, `
        (() => {
          const sel = document.getElementById('filter-state');
          sel.value = 'open';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        })()
      `);
      await waitForText(app.port, 'Worker pool exhaustion', 10000);
    });

    it('search filter narrows the visible list', async () => {
      await evalJS(app.port, `
        (() => {
          const inp = document.getElementById('filter-search');
          inp.value = 'CAS';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        })()
      `);
      const visible = await evalJS(app.port,
        `document.querySelectorAll('.task-item').length`);
      assert.strictEqual(visible, 1, 'only the CAS issue matches');
      // Reset.
      await evalJS(app.port, `
        (() => {
          const inp = document.getElementById('filter-search');
          inp.value = '';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        })()
      `);
    });

    it('clicking Start Agent streams output and finishes', async () => {
      // Re-select the first task (search-reset above re-rendered the list).
      await evalJS(app.port, `
        (() => {
          const items = document.querySelectorAll('.task-item');
          if (items[0]) items[0].click();
        })()
      `);
      // Wait briefly for the workspace pane to re-render.
      await new Promise(r => setTimeout(r, 300));

      await evalClick(app.port, '#btn-start-agent');

      // gh stub copilot prints 4 progress lines after a 2s sleep, then exits.
      await waitForText(app.port, 'implemented the login endpoint', 20000);

      const snap   = await getSnapshot(app.port);
      const status = findById(snap, 'agent-status');
      assert.ok(status, 'agent-status element exists');
      const text = flatText(snap);
      assert.ok(text.includes('Drafting the patch'),     'progress line streamed');
      assert.ok(text.includes('Agent finished'),         'completion status shown');
    });
  });
});
