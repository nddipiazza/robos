'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, findById, findByText, flatText, findAllNodes } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('workspace-manager E2E', () => {
  describe('all-good scenario (default state)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('workspace-manager', scenarios['all-good']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Workspace Manager'), 'App title visible');
    });

    it('shows scan button', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('Scan'),
        'Scan button visible'
      );
    });

    it('shows filter controls', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('All types') || allText.includes('VS Code') || allText.includes('JetBrains'),
        'Filter controls visible'
      );
    });

    it('shows workspace count or empty state', () => {
      const allText = flatText(snap);
      // After auto-scan, should show either workspace count or "No workspaces found"
      assert.ok(
        allText.includes('workspaces') || allText.includes('No workspaces') || allText.includes('Scanning'),
        'Workspace status visible'
      );
    });
  });

  describe('fresh-install scenario (empty home)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('workspace-manager', scenarios['fresh-install']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title on fresh install', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Workspace Manager'), 'App title visible');
    });

    it('shows workspace list area', () => {
      const allText = flatText(snap);
      // Should complete scan (finding nothing) or show empty state
      assert.ok(
        allText.includes('workspaces') || allText.includes('No workspaces') || allText.includes('Scan'),
        'Workspace list rendered'
      );
    });
  });
});
