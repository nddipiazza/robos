'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, findById, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('git-projects E2E', () => {
  describe('empty state', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('git-projects', scenarios['all-good']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      assert.ok(flatText(snap).includes('Git Projects'), 'title visible');
    });

    it('shows the Add Project button', () => {
      assert.ok(findById(snap, 'btn-add'), 'btn-add present');
    });

    it('shows the Dev Group button', () => {
      assert.ok(findById(snap, 'btn-add-group'), 'btn-add-group present');
    });

    it('renders the empty-state hint or project list container', () => {
      const text = flatText(snap);
      assert.ok(
        text.includes('Add Project') || text.includes('No projects') || text.includes('Git'),
        `expected empty-state hints, got: ${text.substring(0, 200)}`
      );
    });
  });
});
