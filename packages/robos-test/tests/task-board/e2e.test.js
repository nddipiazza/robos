'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const {
  getSnapshot, findById, findByText, findAllNodes, flatText,
  evalClick, evalSelect, evalWaitFor, waitForText,
} = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('task-board E2E', () => {

  // ── Error state: no task server configured ──────────────────────────────

  describe('no-task-servers scenario (empty state)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('task-board', scenarios['no-task-servers']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      assert.ok(flatText(snap).includes('Task Board'), 'Title visible');
    });

    it('shows error about no task server', () => {
      const errorBar = findById(snap, 'error-bar');
      assert.ok(errorBar, 'Error bar element exists');
      const text = flatText(snap);
      assert.ok(
        text.includes('No task server') || text.includes('not configured'),
        `Should show no-server error, got: ${text.substring(0, 300)}`
      );
    });

    it('has view toggle buttons', () => {
      const text = flatText(snap);
      assert.ok(text.includes('Board'), 'Board button');
      assert.ok(text.includes('List'), 'List button');
    });

    it('shows no issue cards', () => {
      const cards = findAllNodes(snap, n => n.class && n.class.includes('kanban-card'));
      assert.strictEqual(cards.length, 0, 'No kanban cards when no server');
    });
  });

  // ── GitHub task server: issues render from stub data ────────────────────

  describe('github-task-server scenario (issues load)', () => {
    let app;

    before(async () => {
      app = await launchApp('task-board', scenarios['github-task-server']);
      // Wait for issues to load from the gh stub
      await waitForText(app.port, 'Worker pool exhaustion', 15000);
    });
    after(() => killApp(app));

    it('shows server name badge', async () => {
      const snap = await getSnapshot(app.port);
      const serverName = findById(snap, 'server-name');
      assert.ok(serverName, 'Server name element exists');
      const text = flatText(snap);
      assert.ok(
        text.includes('Acme') || text.includes('GitHub'),
        'Server badge shows name'
      );
    });

    it('renders all 5 stub issues', async () => {
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      assert.ok(text.includes('Worker pool exhaustion'), 'Issue #42 visible');
      assert.ok(text.includes('CAS deduplication'), 'Issue #38 visible');
      assert.ok(text.includes('Scheduler queue priority'), 'Issue #35 visible');
      assert.ok(text.includes('gRPC health check'), 'Issue #30 visible');
      assert.ok(text.includes('Document configuration'), 'Issue #25 visible');
    });

    it('shows issue keys', async () => {
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      assert.ok(text.includes('#42'), 'Key #42');
      assert.ok(text.includes('#38'), 'Key #38');
    });

    it('shows kanban columns by status', async () => {
      const snap = await getSnapshot(app.port);
      const columns = findAllNodes(snap, n => n.class && n.class.includes('kanban-col'));
      assert.ok(columns.length >= 2, `Expected >=2 kanban columns, got ${columns.length}`);
    });

    it('has filter controls', async () => {
      const snap = await getSnapshot(app.port);
      const stateFilter = findById(snap, 'filter-state');
      const assigneeFilter = findById(snap, 'filter-assignee');
      assert.ok(stateFilter, 'State filter exists');
      assert.ok(assigneeFilter, 'Assignee filter exists');
    });

    it('switches to list view', async () => {
      await evalClick(app.port, '#btn-list');
      const snap = await getSnapshot(app.port);
      const listView = findById(snap, 'list-view');
      assert.ok(listView, 'List view element exists');
      // List view should not be hidden
      assert.ok(!listView.hidden, 'List view is visible');
      // Verify table rows contain issue data
      const text = flatText(snap);
      assert.ok(text.includes('Worker pool exhaustion'), 'Issues in list view');
    });

    it('switches back to kanban view', async () => {
      await evalClick(app.port, '#btn-kanban');
      const snap = await getSnapshot(app.port);
      const kanbanView = findById(snap, 'kanban-view');
      assert.ok(kanbanView, 'Kanban view element exists');
      assert.ok(!kanbanView.hidden, 'Kanban view is visible');
    });

    it('shows assignee on cards', async () => {
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      // testuser is assigned to issues 42 and 30
      assert.ok(text.includes('testuser'), 'Assignee testuser visible');
    });

    it('shows labels on cards', async () => {
      const snap = await getSnapshot(app.port);
      const labels = findAllNodes(snap, n => n.class && n.class.includes('label-tag'));
      assert.ok(labels.length > 0, `Expected label tags, got ${labels.length}`);
    });
  });
});
