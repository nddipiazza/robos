'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('stage-demo E2E', () => {
  describe('no-config scenario (empty state)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('stage-demo', scenarios['stage-demo-no-config']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Stage Demo Viewer'), 'Title visible');
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
      app = await launchApp('stage-demo', scenarios['stage-demo-github']);
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

    it('has New Demo button', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('New Demo'), 'New Demo button present');
    });

    it('shows empty state or demo list', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('No stage demos') || allText.includes('demo'),
        `Should show empty state or demo list, got: ${allText.substring(0, 300)}`
      );
    });
  });
});
