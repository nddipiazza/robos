'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, findById, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('pass-manager E2E', () => {
  describe('pass-not-initialized scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('pass-manager', scenarios['pass-not-initialized']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows setup panel', () => {
      const setup = findById(snap, 'panel-setup');
      assert.ok(setup, 'setup panel exists in DOM');
    });

    it('shows initialization form fields', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Set Up Your Password Store'), 'Shows setup title');
      assert.ok(allText.includes('Initialize Password Store'), 'Shows init button');
    });

    it('has name and email inputs', () => {
      const name = findById(snap, 'setup-name');
      assert.ok(name, 'setup-name input exists');
      const email = findById(snap, 'setup-email');
      assert.ok(email, 'setup-email input exists');
    });
  });

  describe('pass-locked scenario (store exists)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('pass-manager', scenarios['pass-locked']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows lock badge', () => {
      const badge = findById(snap, 'lock-badge');
      assert.ok(badge, 'lock-badge exists');
    });

    it('shows tree container', () => {
      const tree = findById(snap, 'tree-container');
      assert.ok(tree, 'tree-container exists');
    });
  });
});
