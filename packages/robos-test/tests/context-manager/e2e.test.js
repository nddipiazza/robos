'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('context-manager E2E', () => {
  describe('fresh-install scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('context-manager', scenarios['fresh-install']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('renders the app with content', () => {
      const allText = flatText(snap);
      assert.ok(allText.length > 0, 'Page has content');
    });

    it('shows context manager UI', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('Context') || allText.includes('Source') ||
        allText.includes('Add') || allText.includes('Global') ||
        allText.includes('RobOS Context Manager'),
        `Should show context manager content, got: ${allText.substring(0, 300)}`
      );
    });
  });

  describe('all-good scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('context-manager', scenarios['all-good']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('renders with configured environment', () => {
      const allText = flatText(snap);
      assert.ok(allText.length > 0, 'Page has content');
    });

    it('shows scope or source-related UI', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('Global') || allText.includes('Context') ||
        allText.includes('source') || allText.includes('Add Source') ||
        allText.includes('No source'),
        `Should show scope/source UI, got: ${allText.substring(0, 300)}`
      );
    });
  });
});
