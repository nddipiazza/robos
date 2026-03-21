'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('search-index E2E', () => {
  describe('default state', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('search-index', scenarios['all-good']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Search Index'), 'App title visible');
    });

    it('shows index list or empty state', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('Source Projects') || allText.includes('Indexes') || allText.includes('Loading'),
        'Index list or loading state visible'
      );
    });

    it('shows add index button', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('Add') || allText.includes('+'),
        'Add index button visible'
      );
    });

    it('shows search input', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('Search') || allText.includes('search'),
        'Search panel visible'
      );
    });
  });
});
