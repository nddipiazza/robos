'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('deploy-tracker E2E', () => {
  describe('no-task-servers scenario (empty state)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('deploy-tracker', scenarios['no-task-servers']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Deploy Tracker'), 'Title visible');
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
      assert.ok(allText.includes('Total Deploys'), 'Total Deploys KPI');
      assert.ok(allText.includes('Deploy Frequency'), 'Deploy Frequency KPI');
      assert.ok(allText.includes('MTTR'), 'MTTR KPI');
    });
  });

  describe('github-task-server scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('deploy-tracker', scenarios['github-task-server']);
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

    it('has deployment sections', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Deployment Timeline') || allText.includes('Deploy'), 'Timeline section');
      assert.ok(allText.includes('Releases') || allText.includes('release'), 'Releases section');
    });

    it('has time range selector', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Last 7 days') || allText.includes('Last 30 days'), 'Time range selector');
    });
  });
});
