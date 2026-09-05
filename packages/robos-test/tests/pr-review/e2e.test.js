'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('pr-review E2E', () => {
  describe('no-config scenario (empty state)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('pr-review', scenarios['pr-review-no-config']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('Agent Code Review Platform') || allText.includes('PR Review'),
        `Title visible, got: ${allText.substring(0, 300)}`
      );
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
      app = await launchApp('pr-review', scenarios['pr-review-github']);
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

    it('has filter controls', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Open') || allText.includes('All authors'), 'Filter controls present');
    });
  });
});
