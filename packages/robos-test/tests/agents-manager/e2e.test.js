'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('agents-manager E2E', () => {
  describe('fresh-install scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('agents-manager', scenarios['fresh-install']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('renders the app with content', () => {
      const allText = flatText(snap);
      assert.ok(allText.length > 0, 'Page has content');
    });

    it('shows AI provider-related content', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('Agent') || allText.includes('Provider') ||
        allText.includes('Copilot') || allText.includes('Claude') ||
        allText.includes('RobOS Agents'),
        `Should show agent/provider content, got: ${allText.substring(0, 300)}`
      );
    });
  });

  describe('all-good scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('agents-manager', scenarios['all-good']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('renders with configured environment', () => {
      const allText = flatText(snap);
      assert.ok(allText.length > 0, 'Page has content');
    });

    it('shows provider status information', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('Status') || allText.includes('installed') ||
        allText.includes('Connected') || allText.includes('not installed') ||
        allText.includes('GitHub Copilot') || allText.includes('Claude Code'),
        `Should show status info, got: ${allText.substring(0, 300)}`
      );
    });
  });
});
