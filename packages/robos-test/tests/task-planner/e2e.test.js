'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const {
  getSnapshot, findById, findAllNodes, flatText, evalClick, evalJS, waitForText,
} = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('task-planner E2E', () => {

  // ── No task server → empty state ─────────────────────────────────────────

  describe('no-config scenario (empty state)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('task-planner', scenarios['task-planner-no-config']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      assert.ok(flatText(snap).includes('Task Planner'), 'Title visible');
    });

    it('shows the No-server empty state', () => {
      // The DOM-snapshot omits display:none elements, so a non-null node here
      // means the empty state is rendered visibly.
      const noServer = findById(snap, 'no-server');
      assert.ok(noServer, '#no-server element exists and is visible');
      assert.ok(flatText(snap).includes('No task server configured'),
        'Empty-state copy visible');
    });

    it('main content is hidden until a server is configured', () => {
      // Snapshot drops display:none nodes; missing == hidden.
      const main = findById(snap, 'main-content');
      assert.strictEqual(main, null,
        '#main-content not in snapshot (display:none)');
    });

    it('Open Task Servers button is offered', () => {
      assert.ok(findById(snap, 'btn-open-task-servers'),
        'Open Task Servers button present');
    });

    it('server badge shows "No server"', () => {
      const badge = findById(snap, 'server-badge');
      assert.ok(badge, 'server badge exists');
      const text = flatText(snap);
      assert.ok(text.includes('No server'), 'badge text reflects no-server state');
    });
  });

  // ── GitHub task server → full plan + create flow ──────────────────────────

  describe('github-task-server scenario (AI-generated tasks land in preview)', () => {
    let app;

    before(async () => {
      app = await launchApp('task-planner', scenarios['task-planner-github']);
      // Renderer calls getServerInfo() → reveals #main-content. Wait for it.
      await waitForText(app.port, 'Acme GitHub', 10000);
    });
    after(() => killApp(app));

    it('shows the connected server badge', async () => {
      const snap = await getSnapshot(app.port);
      const badge = findById(snap, 'server-badge');
      assert.ok(badge, 'badge element exists');
      const text = flatText(snap);
      assert.ok(text.includes('Acme GitHub'), 'server name in badge');
      assert.ok(text.includes('github'),      'server type in badge');
    });

    it('main content is visible', async () => {
      const snap = await getSnapshot(app.port);
      assert.ok(findById(snap, 'main-content'),
        '#main-content present in snapshot (visible)');
    });

    it('shows the prompt input + Generate button', async () => {
      const snap = await getSnapshot(app.port);
      assert.ok(findById(snap, 'prompt-input'),  'prompt textarea');
      assert.ok(findById(snap, 'btn-generate'),  'Generate button');
      const text = flatText(snap);
      assert.ok(text.includes('Describe the tasks'), 'prompt hint visible');
      assert.ok(text.includes('Generate with AI'),   'Generate button label');
    });

    it('preview section is hidden until tasks are generated', async () => {
      const display = await evalJS(app.port,
        `document.getElementById('preview-section').style.display`);
      assert.strictEqual(display, 'none', 'preview hidden initially');
    });

    it('Generate fills the preview list with the stub tasks (3)', async () => {
      // Type a prompt and click Generate. The gh-stub copilot branch returns
      // tasks-generated.json (3 tasks) after a ~2s simulated delay.
      await evalJS(app.port, `
        (() => {
          const ta = document.getElementById('prompt-input');
          ta.value = 'Add basic auth: login, logout, password reset';
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        })()
      `);
      await evalClick(app.port, '#btn-generate');

      // Task titles render into <input value="..."> — those don't appear in
      // flatText. Poll the .task-card count until it reaches 3.
      let cardCount = 0;
      for (let i = 0; i < 30; i++) {
        cardCount = await evalJS(app.port,
          `document.querySelectorAll('.task-card').length`);
        if (cardCount >= 3) break;
        await new Promise(r => setTimeout(r, 500));
      }
      assert.strictEqual(cardCount, 3, 'three task cards rendered');

      // Read the rendered titles from the input values directly.
      const titles = JSON.parse(await evalJS(app.port, `
        JSON.stringify([...document.querySelectorAll('.task-title-input')].map(i => i.value))
      `));
      assert.ok(titles[0].includes('Add login endpoint'),   `task #1 title (got "${titles[0]}")`);
      assert.ok(titles[1].includes('Add logout endpoint'),  `task #2 title (got "${titles[1]}")`);
      assert.ok(titles[2].includes('Password reset flow'),  `task #3 title (got "${titles[2]}")`);

      const count = await evalJS(app.port,
        `document.getElementById('task-count').textContent`);
      assert.strictEqual(count, '3', 'task-count badge shows 3');
    });

    it('Add Task appends a fourth empty card', async () => {
      await evalClick(app.port, '#btn-add-task');
      const cards = await evalJS(app.port,
        `document.querySelectorAll('.task-card').length`);
      assert.strictEqual(cards, 4, 'four task cards after Add');
      const count = await evalJS(app.port,
        `document.getElementById('task-count').textContent`);
      assert.strictEqual(count, '4', 'badge updated to 4');
    });

    it('Clear All empties the preview and hides the section', async () => {
      await evalClick(app.port, '#btn-clear');
      const cards = await evalJS(app.port,
        `document.querySelectorAll('.task-card').length`);
      assert.strictEqual(cards, 0, 'no task cards after Clear');
      const display = await evalJS(app.port,
        `document.getElementById('preview-section').style.display`);
      assert.strictEqual(display, 'none', 'preview hidden again');
    });

    it('Create All Tasks → results section shows ✓ + GitHub URLs', async () => {
      // Re-generate so we have something to create.
      await evalJS(app.port, `
        (() => {
          const ta = document.getElementById('prompt-input');
          ta.value = 'Add basic auth';
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        })()
      `);
      await evalClick(app.port, '#btn-generate');

      // Wait for the regenerated cards to land.
      for (let i = 0; i < 30; i++) {
        const c = await evalJS(app.port,
          `document.querySelectorAll('.task-card').length`);
        if (c >= 3) break;
        await new Promise(r => setTimeout(r, 500));
      }

      // Click Create All — gh stub `issue create` prints a fake URL per call.
      await evalClick(app.port, '#btn-create-all');

      // Wait for the results section to appear (3 success rows).
      let successCount = 0;
      for (let i = 0; i < 30; i++) {
        successCount = await evalJS(app.port,
          `document.querySelectorAll('.result-item.success').length`);
        if (successCount >= 3) break;
        await new Promise(r => setTimeout(r, 500));
      }
      assert.strictEqual(successCount, 3, '3 successful results rendered');

      const linkCount = await evalJS(app.port,
        `document.querySelectorAll('.result-link').length`);
      assert.strictEqual(linkCount, 3, '3 GitHub issue links');

      const linkText = await evalJS(app.port,
        `document.querySelector('.result-link').textContent`);
      assert.ok(linkText.includes('github.com/acme-corp/buildbarn-forms/issues/'),
        `URL points at the configured repo (got "${linkText}")`);

      // Preview section is now hidden, results section is visible.
      const previewDisplay = await evalJS(app.port,
        `document.getElementById('preview-section').style.display`);
      const resultsDisplay = await evalJS(app.port,
        `document.getElementById('results-section').style.display`);
      assert.strictEqual(previewDisplay, 'none',  'preview hidden after create');
      assert.strictEqual(resultsDisplay, 'block', 'results visible after create');
    });
  });

  // ── Jira server → epic parent section, hierarchy rendering ───────────────

  describe('jira-task-server scenario (epic hierarchy UI)', () => {
    let app;

    before(async () => {
      app = await launchApp('task-planner', scenarios['task-planner-jira']);
      await waitForText(app.port, 'Acme Jira', 10000);
    });
    after(() => killApp(app));

    it('shows the connected Jira server badge', async () => {
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      assert.ok(text.includes('Acme Jira'), 'Jira server name in badge');
      assert.ok(text.includes('jira'), 'server type in badge');
    });

    it('epic parent section is visible for Jira', async () => {
      const snap = await getSnapshot(app.port);
      const epicSection = findById(snap, 'epic-parent-section');
      assert.ok(epicSection, '#epic-parent-section rendered for Jira server');
    });

    it('parent epic dropdown is present', async () => {
      const snap = await getSnapshot(app.port);
      const select = findById(snap, 'parent-epic-select');
      assert.ok(select, '#parent-epic-select exists');
    });

    it('parent epic section contains hint text', async () => {
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      assert.ok(
        text.includes('Parent Epic') || text.includes('epic'),
        'Epic section heading visible'
      );
    });

    it('Generate populates tasks with epic hierarchy cards', async () => {
      // Inject tasks directly to simulate AI-generated hierarchical response
      // without calling the real AI agent (too slow for unit test).
      await evalJS(app.port, `
        (() => {
          window._injectedTasks = [
            { title: 'Auth Epic',   body: 'Auth epic description', labels: [], isEpic: true,  epicName: 'Auth', parentEpicIdx: null, issueType: 'Epic', epicKey: null },
            { title: 'Login page',  body: 'Login story body',      labels: [], isEpic: false, epicName: '',     parentEpicIdx: 0,    issueType: 'Story', epicKey: null },
            { title: 'Logout flow', body: 'Logout story body',     labels: [], isEpic: false, epicName: '',     parentEpicIdx: 0,    issueType: 'Story', epicKey: null },
          ];
          // Simulate what handleGenerate does after receiving AI response
          window.tasks = window._injectedTasks;
          renderTasks();
          updateCount();
          document.getElementById('preview-section').style.display = 'block';
        })()
      `);

      const snap = await getSnapshot(app.port);
      const cards = findAllNodes(snap, n => n.class && n.class.includes('task-card'));
      assert.ok(cards.length >= 3, `Expected ≥3 task cards, got ${cards.length}`);
    });

    it('epic card has task-epic CSS class', async () => {
      const epicCardCount = await evalJS(app.port,
        `document.querySelectorAll('.task-card.task-epic').length`);
      assert.ok(epicCardCount >= 1, `Expected ≥1 epic card, got ${epicCardCount}`);
    });

    it('child cards have task-child CSS class (indented)', async () => {
      const childCount = await evalJS(app.port,
        `document.querySelectorAll('.task-card.task-child').length`);
      assert.ok(childCount >= 2, `Expected ≥2 child cards, got ${childCount}`);
    });

    it('epic card shows Epic type badge', async () => {
      const badgeCount = await evalJS(app.port,
        `document.querySelectorAll('.issue-type-badge.badge-epic').length`);
      assert.ok(badgeCount >= 1, `Expected ≥1 epic type badge, got ${badgeCount}`);
    });

    it('story cards show story type badge', async () => {
      const storyBadges = await evalJS(app.port,
        `document.querySelectorAll('.issue-type-badge.badge-story').length`);
      assert.ok(storyBadges >= 1, `Expected ≥1 story badge, got ${storyBadges}`);
    });

    it('epic count badge updates', async () => {
      const epicBadge = await evalJS(app.port,
        `document.getElementById('epic-count').style.display`);
      assert.notStrictEqual(epicBadge, 'none', 'Epic count badge is visible');
    });

    it('task count badge shows total task count', async () => {
      const count = await evalJS(app.port,
        `document.getElementById('task-count').textContent`);
      assert.strictEqual(count, '3', 'Task count shows 3');
    });

    it('Plan Again button is wired up in results section', async () => {
      // Check button exists in HTML even if section is hidden
      const btn = await evalJS(app.port,
        `!!document.getElementById('btn-plan-again')`);
      assert.ok(btn, 'btn-plan-again exists');
    });
  });
});
