'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('ci-monitor E2E', () => {
  describe('no-config scenario (empty state)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('ci-monitor', scenarios['ci-monitor-no-config']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('CI Monitor'), 'Title visible');
    });

    it('shows error about no task server', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('No task server') || allText.includes('not configured'),
        `Should show no-server error, got: ${allText.substring(0, 300)}`
      );
    });
  });

  describe('github-task-server scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('ci-monitor', scenarios['ci-monitor-github']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows server name badge', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('Acme') || allText.includes('GitHub') || allText.includes('github'),
        `Should show server name, got: ${allText.substring(0, 300)}`
      );
    });

    it('has stats bar', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Total') || allText.includes('Passed') || allText.includes('Failed'),
        'Stats bar should be present');
    });

    it('has filter controls', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('All Runs') || allText.includes('All branches'), 'Filter controls present');
    });
  });
});
