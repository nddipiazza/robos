'use strict';
/**
 * skills-manager smoke tests
 *
 * Run:
 *   node --test packages/robos-test/tests/skills-manager/smoke.test.js
 *
 * Or with SSH port-forward from the VM:
 *   ssh -L 19139:localhost:19139 -p 2224 robos@localhost -N &
 *   node --test packages/robos-test/tests/skills-manager/smoke.test.js
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const {
  getSnapshot, findById, findAllNodes, flatText, evalClick, evalJS, waitForText,
} = require('../../lib/snapshot');

describe('skills-manager smoke', () => {

  // ── Initial load ──────────────────────────────────────────────────────────

  describe('initial state', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('skills-manager', {});
      // Wait for skill data to load over IPC
      await new Promise(r => setTimeout(r, 2000));
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      assert.ok(flatText(snap).includes('Skills Manager'), 'Title visible');
    });

    it('My Skills tab is active by default', async () => {
      const active = await evalJS(app.port,
        `document.getElementById('tab-my-skills').classList.contains('active')`);
      assert.ok(active, 'My Skills tab has .active class');
    });

    it('Skill Packs tab is present', () => {
      assert.ok(findById(snap, 'tab-skill-packs'), '#tab-skill-packs in DOM');
    });

    it('search input is rendered', () => {
      assert.ok(findById(snap, 'search-input'), '#search-input present');
    });

    it('skills grid is rendered', () => {
      assert.ok(findById(snap, 'skills-grid'), '#skills-grid present');
    });

    it('built-in skills are loaded', async () => {
      const count = await evalJS(app.port,
        `document.querySelectorAll('.skill-card').length`);
      assert.ok(count > 0, `Expected skill cards, got ${count}`);
    });

    it('shows ≥ 10 built-in skills', async () => {
      const count = await evalJS(app.port,
        `document.querySelectorAll('.skill-card').length`);
      assert.ok(count >= 10, `Expected ≥10 skill cards, got ${count}`);
    });

    it('skill count badge reflects loaded skills', async () => {
      const badge = await evalJS(app.port,
        `document.getElementById('skill-count').textContent`);
      assert.ok(badge && badge.includes('skill'), `skill-count badge: "${badge}"`);
    });

    it('category tabs are rendered', async () => {
      const tabs = await evalJS(app.port,
        `document.querySelectorAll('#category-tabs .cat-tab').length`);
      assert.ok(tabs >= 5, `Expected ≥5 category tabs, got ${tabs}`);
    });

    it('New Skill button is present', () => {
      assert.ok(findById(snap, 'btn-add-skill'), '#btn-add-skill present');
    });

    it('Open AI Prompt button is present', () => {
      assert.ok(findById(snap, 'btn-open-ai-prompt'), '#btn-open-ai-prompt present');
    });
  });

  // ── Search filter ─────────────────────────────────────────────────────────

  describe('search filter', () => {
    let app;

    before(async () => {
      app = await launchApp('skills-manager', {});
      await new Promise(r => setTimeout(r, 2000));
    });
    after(() => killApp(app));

    it('filtering by "docker" narrows the skills grid', async () => {
      const totalBefore = await evalJS(app.port,
        `document.querySelectorAll('.skill-card').length`);

      await evalJS(app.port, `
        const input = document.getElementById('search-input');
        input.value = 'docker';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      `);
      await new Promise(r => setTimeout(r, 200));

      const totalAfter = await evalJS(app.port,
        `document.querySelectorAll('.skill-card').length`);

      assert.ok(totalAfter < totalBefore,
        `Filter reduced cards from ${totalBefore} to ${totalAfter}`);
      assert.ok(totalAfter > 0, 'At least one docker skill remains');
    });

    it('clearing the filter restores all skills', async () => {
      const filteredCount = await evalJS(app.port,
        `document.querySelectorAll('.skill-card').length`);

      await evalJS(app.port, `
        const input = document.getElementById('search-input');
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      `);
      await new Promise(r => setTimeout(r, 200));

      const restored = await evalJS(app.port,
        `document.querySelectorAll('.skill-card').length`);

      assert.ok(restored > filteredCount,
        `Restored from ${filteredCount} to ${restored}`);
    });
  });

  // ── Category tab filter ───────────────────────────────────────────────────

  describe('category tab filter', () => {
    let app;

    before(async () => {
      app = await launchApp('skills-manager', {});
      await new Promise(r => setTimeout(r, 2000));
    });
    after(() => killApp(app));

    it('clicking a non-All category tab filters skills', async () => {
      const totalAll = await evalJS(app.port,
        `document.querySelectorAll('.skill-card').length`);

      // Click the second tab (first after "All")
      await evalJS(app.port, `
        const tabs = document.querySelectorAll('#category-tabs .cat-tab');
        if (tabs.length > 1) tabs[1].click();
      `);
      await new Promise(r => setTimeout(r, 200));

      const filtered = await evalJS(app.port,
        `document.querySelectorAll('.skill-card').length`);

      assert.ok(filtered <= totalAll,
        `Category filter narrowed from ${totalAll} to ${filtered}`);
      assert.ok(filtered > 0, 'Category has at least one skill');
    });

    it('clicking All tab restores full list', async () => {
      const beforeAll = await evalJS(app.port,
        `document.querySelectorAll('.skill-card').length`);

      await evalJS(app.port, `
        const allTab = document.querySelector('#category-tabs .cat-tab');
        if (allTab) allTab.click();
      `);
      await new Promise(r => setTimeout(r, 200));

      const afterAll = await evalJS(app.port,
        `document.querySelectorAll('.skill-card').length`);

      assert.ok(afterAll >= beforeAll,
        `All tab restored skills from ${beforeAll} to ${afterAll}`);
    });
  });

  // ── Add skill modal ───────────────────────────────────────────────────────

  describe('new skill modal', () => {
    let app;

    before(async () => {
      app = await launchApp('skills-manager', {});
      await new Promise(r => setTimeout(r, 1500));
    });
    after(() => killApp(app));

    it('New Skill button opens the modal', async () => {
      await evalClick(app.port, '#btn-add-skill');
      await new Promise(r => setTimeout(r, 300));

      const display = await evalJS(app.port,
        `document.getElementById('skill-modal').style.display`);
      assert.notStrictEqual(display, 'none', 'Modal visible after New Skill click');
    });

    it('modal shows correct title', async () => {
      const title = await evalJS(app.port,
        `document.getElementById('modal-title').textContent`);
      assert.ok(title.includes('New Skill') || title.includes('Skill'),
        `Modal title: "${title}"`);
    });

    it('modal has Name, Category, Description, Command fields', async () => {
      const fields = await evalJS(app.port, `
        JSON.stringify({
          name: !!document.getElementById('field-name'),
          category: !!document.getElementById('field-category'),
          description: !!document.getElementById('field-description'),
          command: !!document.getElementById('field-command'),
        })
      `);
      const f = JSON.parse(fields);
      assert.ok(f.name, 'Name field present');
      assert.ok(f.category, 'Category field present');
      assert.ok(f.description, 'Description field present');
      assert.ok(f.command, 'Command field present');
    });

    it('Cancel button closes the modal', async () => {
      await evalClick(app.port, '#btn-modal-cancel');
      await new Promise(r => setTimeout(r, 300));

      const display = await evalJS(app.port,
        `document.getElementById('skill-modal').style.display`);
      assert.strictEqual(display, 'none', 'Modal hidden after Cancel');
    });
  });

  // ── Create a custom skill ─────────────────────────────────────────────────

  describe('create and verify custom skill', () => {
    let app;

    before(async () => {
      app = await launchApp('skills-manager', {});
      await new Promise(r => setTimeout(r, 1500));
    });
    after(() => killApp(app));

    it('saving a new skill adds it to the grid', async () => {
      const countBefore = await evalJS(app.port,
        `document.querySelectorAll('.skill-card').length`);

      // Open modal and fill in fields
      await evalClick(app.port, '#btn-add-skill');
      await new Promise(r => setTimeout(r, 200));

      await evalJS(app.port, `
        document.getElementById('field-name').value = 'Test E2E Skill';
        document.getElementById('field-name').dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('field-category').value = 'Test';
        document.getElementById('field-category').dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('field-description').value = 'Created by smoke test';
        document.getElementById('field-command').value = 'echo "test e2e"';
        document.getElementById('field-command').dispatchEvent(new Event('input', { bubbles: true }));
      `);

      await evalClick(app.port, '#btn-modal-save');
      await new Promise(r => setTimeout(r, 500));

      const countAfter = await evalJS(app.port,
        `document.querySelectorAll('.skill-card').length`);

      assert.ok(countAfter > countBefore,
        `Skill count increased from ${countBefore} to ${countAfter}`);
    });

    it('new skill appears in the grid with correct name', async () => {
      const found = await evalJS(app.port, `
        [...document.querySelectorAll('.skill-card')].some(
          c => c.textContent.includes('Test E2E Skill')
        )
      `);
      assert.ok(found, '"Test E2E Skill" card found in grid');
    });
  });

  // ── Skill Packs tab ───────────────────────────────────────────────────────

  describe('skill packs tab', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('skills-manager', {});
      await new Promise(r => setTimeout(r, 1500));
      await evalClick(app.port, '#tab-skill-packs');
      await new Promise(r => setTimeout(r, 500));
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('Skill Packs tab becomes active', async () => {
      const active = await evalJS(app.port,
        `document.getElementById('tab-skill-packs').classList.contains('active')`);
      assert.ok(active, 'Skill Packs tab is active');
    });

    it('Skill Pack Marketplace heading visible', () => {
      assert.ok(
        flatText(snap).includes('Skill Pack') ||
        flatText(snap).includes('Marketplace') ||
        flatText(snap).includes('Pack'),
        'Marketplace heading visible'
      );
    });

    it('packs grid is rendered', () => {
      assert.ok(findById(snap, 'packs-grid'), '#packs-grid in DOM');
    });

    it('community packs are listed', async () => {
      const packs = await evalJS(app.port,
        `document.querySelectorAll('#packs-grid .pack-card').length`);
      assert.ok(packs > 0, `Expected community pack cards, got ${packs}`);
    });

    it('switching back to My Skills restores the grid', async () => {
      await evalClick(app.port, '#tab-my-skills');
      await new Promise(r => setTimeout(r, 300));

      const active = await evalJS(app.port,
        `document.getElementById('tab-my-skills').classList.contains('active')`);
      assert.ok(active, 'My Skills tab restored');

      const cards = await evalJS(app.port,
        `document.querySelectorAll('.skill-card').length`);
      assert.ok(cards > 0, 'Skills grid repopulated on tab switch');
    });
  });
});
