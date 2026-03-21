'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('notifications E2E', () => {
  describe('empty state', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('notifications', scenarios['all-good']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Notifications'), 'App title visible');
    });

    it('shows category filters', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('PR Review') || allText.includes('CI/CD') || allText.includes('System'),
        'Category filters visible'
      );
    });

    it('shows tier filters', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('Critical') || allText.includes('Warning') || allText.includes('Info'),
        'Tier filters visible'
      );
    });

    it('shows empty state or notification list', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('No notifications') || allText.includes('unread'),
        'Empty state or notification count visible'
      );
    });
  });
});
