'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, findById, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('robos-onboarding E2E', () => {
  describe('fresh-install scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('robos-onboarding', scenarios['all-good']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title and setup assistant header', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('RobOS'), 'RobOS title visible');
      assert.ok(allText.includes('Setup Assistant'), 'Setup Assistant subtitle visible');
    });

    it('starts on step 1 (Security & Secrets)', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Security Keys & Secret Storage'), 'Step 1 heading visible');
    });

    it('has navigation buttons', () => {
      const btnNext = findById(snap, 'btn-next');
      const btnSkip = findById(snap, 'btn-skip');
      assert.ok(btnNext, 'Next button exists');
      assert.ok(btnSkip, 'Skip button exists');
    });

    it('displays wizard step navigation items', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Security & Secrets'), 'Step 1 label');
      assert.ok(allText.includes('SSH & Git Auth'), 'Step 2 label');
      assert.ok(allText.includes('AI Agents'), 'Step 3 label');
      assert.ok(allText.includes('Dev Apps'), 'Step 4 label');
      assert.ok(allText.includes('Git Projects'), 'Step 5 label');
      assert.ok(allText.includes('Complete & Provision'), 'Step 6 label');
    });
  });
});
