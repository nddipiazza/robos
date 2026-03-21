'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('workflow-studio E2E', () => {
  describe('no-config scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('workflow-studio', scenarios['no-task-servers']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Workflow Studio'), 'Title visible');
    });

    it('shows AI Generate section', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Generate'), 'Generate button visible');
    });

    it('shows empty state message', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('No issue types configured'), 'Empty state message');
    });

    it('shows Add Issue Type button', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Add Issue Type'), 'Add Issue Type button');
    });
  });

  describe('github-configured scenario (has workflows)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('workflow-studio', scenarios['issue-manager-github']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows configured issue types', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('Bug') || allText.includes('Feature'),
        `Should show issue types, got: ${allText.substring(0, 300)}`
      );
    });
  });
});
