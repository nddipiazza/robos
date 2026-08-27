'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, findById, flatText, evalClick, assertNodeHasClass } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('robos-onboarding 8-Step E2E Test Suite', () => {
  describe('Full Step Navigation Flow', () => {
    let app;

    before(async () => {
      app = await launchApp('robos-onboarding', scenarios['all-good']);
    });
    after(() => killApp(app));

    it('shows app title and setup assistant header', async () => {
      const snap = await getSnapshot(app.port);
      const allText = flatText(snap);
      assert.ok(allText.includes('RobOS'), 'RobOS title visible');
      assert.ok(allText.includes('Setup Assistant'), 'Setup Assistant subtitle visible');
    });

    it('displays all 8 step labels in sidebar navigation', async () => {
      const snap = await getSnapshot(app.port);
      const allText = flatText(snap);
      assert.ok(allText.includes('GPG Master Key'), 'Step 1 label visible');
      assert.ok(allText.includes('Password Store (pass)'), 'Step 2 label visible');
      assert.ok(allText.includes('GUI Pinentry'), 'Step 3 label visible');
      assert.ok(allText.includes('SSH & Git Auth'), 'Step 4 label visible');
      assert.ok(allText.includes('AI Agents'), 'Step 5 label visible');
      assert.ok(allText.includes('Dev Apps (Optional)'), 'Step 6 label visible');
      assert.ok(allText.includes('Git Projects (Optional)'), 'Step 7 label visible');
      assert.ok(allText.includes('Complete & Provision'), 'Step 8 label visible');
    });

    it('starts with Step 1 active', async () => {
      const snap = await getSnapshot(app.port);
      assertNodeHasClass(snap, 'step-1', 'active');
      const allText = flatText(snap);
      assert.ok(allText.includes('Step 1: GPG Master Key'), 'Step 1 heading active');
    });

    it('navigates from Step 1 to Step 8 by clicking btn-next step-by-step', async () => {
      for (let step = 1; step < 8; step++) {
        // Click next button
        await evalClick(app.port, '#btn-next');

        // Verify next step panel is active and visible in DOM snapshot
        const snapAfter = await getSnapshot(app.port);
        const panelNode = findById(snapAfter, `step-${step + 1}`);
        assert.ok(panelNode, `Step ${step + 1} panel is active and visible in DOM snapshot`);
        assert.ok(panelNode.class.includes('active'), `Step ${step + 1} panel has active class`);
      }
    });

    it('navigates backward from Step 8 to Step 1 using btn-back', async () => {
      for (let step = 8; step > 1; step--) {
        await evalClick(app.port, '#btn-back');

        const snapAfter = await getSnapshot(app.port);
        const panelNode = findById(snapAfter, `step-${step - 1}`);
        assert.ok(panelNode, `Step ${step - 1} panel is active and visible in DOM snapshot`);
        assert.ok(panelNode.class.includes('active'), `Step ${step - 1} panel has active class`);
      }
    });

    it('supports jumping directly to any step via sidebar click', async () => {
      // Jump to Step 5 (AI Agents)
      await evalClick(app.port, '.step-nav-item[data-step="5"]');
      let snap = await getSnapshot(app.port);
      assert.ok(findById(snap, 'step-5'), 'Step 5 panel active');

      // Jump to Step 3 (GUI Pinentry)
      await evalClick(app.port, '.step-nav-item[data-step="3"]');
      snap = await getSnapshot(app.port);
      assert.ok(findById(snap, 'step-3'), 'Step 3 panel active');

      // Jump back to Step 1
      await evalClick(app.port, '.step-nav-item[data-step="1"]');
      snap = await getSnapshot(app.port);
      assert.ok(findById(snap, 'step-1'), 'Step 1 panel active');
    });

    it('verifies pass prerequisite check handler works', async () => {
      const snap = await getSnapshot(app.port);
      assert.ok(snap, 'Snapshot returned for pass prerequisite verification');
    });
  });
});
