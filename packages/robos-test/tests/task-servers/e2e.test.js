'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, findById, findByText, flatText, findAllNodes } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('task-servers E2E', () => {
  describe('no-task-servers scenario (empty state)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('task-servers', scenarios['no-task-servers']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Task Servers'), 'App title visible');
    });

    it('shows add server button', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('＋') || allText.includes('+') || allText.includes('Add') || allText.includes('New'),
        'Add button visible'
      );
    });

    it('shows no-servers empty state', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('No servers configured'), 'Empty state message visible');
    });
  });

  describe('github-task-server scenario (one server configured)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('task-servers', scenarios['github-task-server']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows the configured server', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('GitHub') || allText.includes('Acme') || allText.includes('github'),
        `Should show GitHub server, got: ${allText.substring(0, 300)}`
      );
    });

    it('shows server type indicator', () => {
      const allText = flatText(snap);
      // Should indicate this is a GitHub type server
      assert.ok(
        allText.toLowerCase().includes('github'),
        'GitHub type visible'
      );
    });
  });

  describe('jira-task-server scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('task-servers', scenarios['jira-task-server']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows the configured Jira server', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('Jira') || allText.includes('Acme') || allText.includes('jira'),
        `Should show Jira server, got: ${allText.substring(0, 300)}`
      );
    });
  });
});
