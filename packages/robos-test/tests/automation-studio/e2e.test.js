'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('automation-studio E2E', () => {
  describe('default state', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('automation-studio', scenarios['all-good']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Automation Studio'), 'App title visible');
    });

    it('shows Rules tab', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Rules'), 'Rules tab visible');
    });

    it('shows Scheduled Jobs tab', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Scheduled Jobs'), 'Scheduled Jobs tab visible');
    });

    it('shows Event Log tab', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Event Log'), 'Event Log tab visible');
    });

    it('shows rules empty state', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('No event rules') || allText.includes('New Rule') || allText.includes('Event Rules'),
        'Rules content visible'
      );
    });

    it('shows new rule button', () => {
      const allText = flatText(snap);
      assert.ok(
        allText.includes('New Rule') || allText.includes('+'),
        'New Rule button visible'
      );
    });
  });
});
