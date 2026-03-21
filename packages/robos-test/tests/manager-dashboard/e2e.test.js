'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('manager-dashboard E2E', () => {
  describe('no-task-servers scenario (empty state)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('manager-dashboard', scenarios['no-task-servers']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Manager Dashboard'), 'Title visible');
    });

    it('shows no task server message', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('No task server') || allText.includes('not configured'),
        `Should show no-server message, got: ${allText.substring(0, 300)}`
      );
    });

    it('has KPI cards', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Open Issues'), 'Open Issues KPI');
      assert.ok(allText.includes('PRs Merged'), 'PRs Merged KPI');
      assert.ok(allText.includes('Avg Cycle Time'), 'Cycle Time KPI');
    });
  });

  describe('github-task-server scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('manager-dashboard', scenarios['github-task-server']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows server badge', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('Acme') || allText.includes('GitHub') || allText.includes('github'),
        `Should show server name, got: ${allText.substring(0, 300)}`
      );
    });

    it('has dashboard sections', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Tasks by Stage') || allText.includes('Sprint'), 'Sprint board section');
      assert.ok(allText.includes('Velocity'), 'Velocity section');
    });

    it('has time range selector', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Last 7 days') || allText.includes('Last 30 days'), 'Time range selector');
    });
  });
});
