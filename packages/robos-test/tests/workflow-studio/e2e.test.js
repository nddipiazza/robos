'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const {
  getSnapshot, flatText, findById, evalJS, evalClick, waitForText,
} = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('workflow-studio E2E', () => {

  describe('no-config scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('workflow-studio', scenarios['no-task-servers']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      assert.ok(flatText(snap).includes('Workflow Studio'), 'Title visible');
    });

    it('shows AI Generate section with prompt + button', () => {
      assert.ok(findById(snap, 'generate-prompt'), 'Generate prompt input');
      assert.ok(findById(snap, 'btn-generate'), 'Generate button');
    });

    it('shows Save and Clear All header buttons', () => {
      assert.ok(findById(snap, 'btn-save'), 'Save button');
      assert.ok(findById(snap, 'btn-clear-all'), 'Clear All button');
    });

    it('shows empty state message when no types configured', () => {
      assert.ok(
        flatText(snap).includes('No issue types configured'),
        'Empty state message'
      );
    });

    it('shows Add Issue Type button', () => {
      assert.ok(flatText(snap).includes('Add Issue Type'), 'Add Issue Type button');
    });

    it('adding a type replaces the empty state with a type card', async () => {
      await evalClick(app.port, '#btn-add-type');
      const snap2 = await waitForText(app.port, 'New Type');
      const text  = flatText(snap2);
      assert.ok(!text.includes('No issue types configured'), 'Empty state gone');
      assert.ok(text.includes('New Type'), 'New Type card rendered');
    });
  });

  describe('github-configured scenario (Bug workflow seeded)', () => {
    let app;

    before(async () => {
      app = await launchApp('workflow-studio', scenarios['issue-manager-github']);
      // Navigate to the config view so the workflow designer is rendered
      await evalJS(app.port, `window.location.href = window.location.pathname + '?view=config'`);
      await waitForText(app.port, 'Workflow Studio', 10000);
    });
    after(() => killApp(app));

    it('renders the seeded Bug issue type card', async () => {
      const snap = await waitForText(app.port, 'Bug', 5000);
      assert.ok(flatText(snap).includes('Bug'), 'Bug type visible');
    });

    it('exposes the AI generation bar', async () => {
      const snap = await getSnapshot(app.port);
      assert.ok(findById(snap, 'generate-prompt'), 'generate-prompt input exists');
      assert.ok(findById(snap, 'btn-generate'),   'btn-generate exists');
    });

    it('expanding the Bug card reveals its three workflow states', async () => {
      await evalJS(app.port, `
        document.querySelector('.issue-type-card .type-card-header').click();
      `);
      // Wait for the body to have .open and three state rows to be rendered
      let rows = -1;
      for (let i = 0; i < 20; i++) {
        rows = await evalJS(app.port,
          `document.querySelectorAll('.type-card-body.open .state-row').length`);
        if (rows === 3) break;
        await new Promise(r => setTimeout(r, 300));
      }
      assert.equal(rows, 3, 'three state rows visible after expand');

      const labels = await evalJS(app.port, `
        JSON.stringify([...document.querySelectorAll(
          '.type-card-body.open .state-row input[data-state-field="label"]'
        )].map(i => i.value))
      `);
      const parsed = JSON.parse(labels);
      assert.ok(parsed.includes('Triage'),      'Triage label');
      assert.ok(parsed.includes('In Progress'), 'In Progress label');
      assert.ok(parsed.includes('Done'),        'Done label');
    });

    it('each state row has both automation hook fields (script + AI prompt)', async () => {
      const count = await evalJS(app.port, `
        (() => {
          const scripts = document.querySelectorAll('[data-state-field="on_enter_script"]');
          const prompts = document.querySelectorAll('[data-state-field="on_enter_prompt"]');
          return { scripts: scripts.length, prompts: prompts.length };
        })()
      `);
      assert.equal(count.scripts, 3, 'three on_enter_script fields (one per state)');
      assert.equal(count.prompts, 3, 'three on_enter_prompt fields (one per state)');
    });

    it('Add State button within the Bug card appends a new state row', async () => {
      await evalJS(app.port, `
        document.querySelector('.issue-type-card .btn-add-state').click();
      `);
      let n = -1;
      for (let i = 0; i < 20; i++) {
        n = await evalJS(app.port,
          `document.querySelectorAll('.issue-type-card .state-row').length`);
        if (n === 4) break;
        await new Promise(r => setTimeout(r, 300));
      }
      assert.equal(n, 4, 'Four state rows after add');
    });

    it('typing into on_enter_prompt persists in the DOM', async () => {
      const prompt = 'Analyze the repro steps and draft a fix.';
      await evalJS(app.port, `
        (() => {
          const el = document.querySelectorAll('[data-state-field="on_enter_prompt"]')[1];
          el.value = ${JSON.stringify(prompt)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
        })();
      `);
      const value = await evalJS(app.port, `
        document.querySelectorAll('[data-state-field="on_enter_prompt"]')[1].value
      `);
      assert.equal(value, prompt, 'Prompt text reflected back');
    });
  });
});
