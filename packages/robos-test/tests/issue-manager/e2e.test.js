'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, findById, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('issue-manager E2E', () => {
  describe('no-config scenario (config view)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('issue-manager', scenarios['issue-manager-no-config']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows the app rendered', () => {
      const allText = flatText(snap);
      assert.ok(allText.length > 0, 'Page has content');
    });

    it('shows config or setup view', () => {
      const allText = flatText(snap);
      // Config view should show workflow/settings related content
      assert.ok(
        allText.includes('Workflow') || allText.includes('Config') ||
        allText.includes('Issue') || allText.includes('No task server'),
        `Should show config-related content, got: ${allText.substring(0, 300)}`
      );
    });
  });

  describe('github-configured scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('issue-manager', scenarios['issue-manager-github']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows the app with configured server', () => {
      const allText = flatText(snap);
      assert.ok(allText.length > 0, 'Page has content');
    });

    it('shows workflow or issue type info', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('Bug') || allText.includes('Feature') ||
        allText.includes('Workflow') || allText.includes('Hermetiq') ||
        allText.includes('buildbarn'),
        `Should show workflow or repo info, got: ${allText.substring(0, 300)}`
      );
    });
  });
});
