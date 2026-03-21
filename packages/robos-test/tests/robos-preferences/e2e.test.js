'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('robos-preferences E2E', () => {
  describe('default state', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('robos-preferences', scenarios['all-good']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Preferences'), 'App title visible');
    });

    it('shows settings sections', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('AI Provider') || allText.includes('GitHub') || allText.includes('IDE'),
        'Settings sections visible'
      );
    });

    it('shows save button', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('Save'),
        'Save button visible'
      );
    });
  });
});
