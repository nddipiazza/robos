'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, findById, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('pass-unlock E2E', () => {
  describe('pass-not-initialized scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('pass-unlock', scenarios['pass-not-initialized']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows greeting', () => {
      const greeting = findById(snap, 'greeting-text');
      assert.ok(greeting, 'greeting-text exists');
      assert.ok(greeting.text.includes('Good'), `Should show greeting, got: ${greeting.text}`);
    });

    it('shows date', () => {
      const date = findById(snap, 'date-text');
      assert.ok(date, 'date-text exists');
      assert.ok(date.text.length > 0, 'date should have text');
    });

    it('shows not-initialized message', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('not initialized'), `Should show not-initialized message, got: ${allText.substring(0, 200)}`);
    });

    it('has passphrase input', () => {
      const input = findById(snap, 'passphrase');
      assert.ok(input, 'passphrase input exists');
    });
  });

  describe('pass-locked scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('pass-unlock', scenarios['pass-locked']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows locked state', () => {
      const locked = findById(snap, 'state-locked');
      assert.ok(locked, 'state-locked div exists');
    });

    it('shows unlock button', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Unlock for Today'), 'Unlock button visible');
    });

    it('shows skip button', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Skip'), 'Skip button visible');
    });
  });
});
