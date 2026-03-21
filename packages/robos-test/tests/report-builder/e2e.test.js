'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('report-builder E2E', () => {
  describe('no-task-servers scenario (empty state)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('report-builder', scenarios['no-task-servers']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Report Builder'), 'Title visible');
    });

    it('shows no task server badge', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('No task server'),
        `Should show no-server badge, got: ${allText.substring(0, 300)}`
      );
    });

    it('has query input and examples', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Generate Report'), 'Generate button');
      assert.ok(
        allText.includes('PRs per developer') || allText.includes('Stuck reviews'),
        'Example queries'
      );
    });

    it('has saved reports button', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Saved Reports'), 'Saved Reports button');
    });
  });

  describe('github-task-server scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('report-builder', scenarios['github-task-server']);
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

    it('has query input area', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Ask a question') || allText.includes('Generate Report'), 'Query area present');
    });
  });
});
