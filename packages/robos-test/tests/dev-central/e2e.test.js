'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('dev-central E2E', () => {
  describe('no-task-servers scenario (empty state)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('dev-central', scenarios['no-task-servers']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Dev Central'), 'Title visible');
    });

    it('shows no task server message', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('No task server') || allText.includes('not configured'),
        `Should show no-server message, got: ${allText.substring(0, 300)}`
      );
    });

    it('has dashboard sections', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('My Tasks'), 'Tasks section');
      assert.ok(allText.includes('My Pull Requests'), 'PRs section');
      assert.ok(allText.includes('Blocker Radar'), 'Blockers section');
    });
  });

  describe('github-task-server scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('dev-central', scenarios['github-task-server']);
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

    it('has standup section', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('AI Standup') || allText.includes('Standup'), 'Standup section');
    });
  });
});
