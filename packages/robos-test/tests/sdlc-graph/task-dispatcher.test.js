'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('RobOS Task Planner & Epic Decomposition Engine Tests with In-Depth Assertions', () => {
  it('launches Task Planner GUI, creates project, decomposes requirements with AI, and syncs to Gitea task server', async () => {
    const app = await launchApp('task-planner', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'task-planner debug port should be allocated');

      // 1. Initial State & Projects Sidebar
      const text = await evalJS(app.port, 'document.body.textContent');
      assert.ok(text.includes('Task Planner'), 'Should render title');
      assert.ok(text.includes('Projects'), 'Should render projects sidebar');

      // 2. Create Project in Sidebar
      await evalClick(app.port, '#btn-new-project');
      await evalJS(app.port, `
        const input = document.getElementById('project-name-input');
        if (input) {
          input.value = 'Acme Petshop Platform';
          input.dispatchEvent(new Event('input'));
        }
      `);
      await evalClick(app.port, '#btn-project-confirm');
      await new Promise(r => setTimeout(r, 400));

      // Assert project appears in left sidebar
      const sidebarProjects = await evalJS(app.port, `document.getElementById('project-list').textContent`);
      assert.ok(sidebarProjects.includes('Acme Petshop Platform'), 'Should render newly created project in left sidebar');

      // Assert clean initial project metadata and manual add buttons
      const btnAddEpic = await evalJS(app.port, `document.getElementById('btn-add-epic') ? 'found' : ''`);
      assert.strictEqual(btnAddEpic, 'found', 'Should have + Add Epic manual button');
      const btnAddTask = await evalJS(app.port, `document.getElementById('btn-add-task') ? 'found' : ''`);
      assert.strictEqual(btnAddTask, 'found', 'Should have + Add Task manual button');

      // 3. Enter Prompt and Generate with AI
      await evalJS(app.port, `
        const prompt = document.getElementById('prompt-input');
        if (prompt) {
          prompt.value = 'Create Acme Petshop polyglot platform with Java 21 Spring Boot REST API, React 18 frontend, and reusable TypeSpec library.';
          const ta = prompt.querySelector('textarea, input');
          if (ta) ta.value = prompt.value;
          prompt.dispatchEvent(new Event('input', { bubbles: true }));
        }
      `);
      await evalClick(app.port, '#btn-generate');
      await new Promise(r => setTimeout(r, 600));

      // 4. Verify Project Metadata Card & KGraph Badge
      const projectMetaText = await evalJS(app.port, `document.getElementById('project-metadata-card').textContent`);
      assert.ok(projectMetaText.includes('Acme Petshop Platform'), 'Should display project name in metadata card');
      assert.ok(projectMetaText.includes('urn:robos:project:'), 'Should display KGraph URI badge');

      // 5. Answer Form-Based Architecture Questions 1-by-1
      const qCardVisible = await evalJS(app.port, `document.getElementById('ai-questions-card').style.display !== 'none'`);
      assert.ok(qCardVisible, 'Form-based AI questions card should be visible');

      const step1Text = await evalJS(app.port, `document.getElementById('question-step-indicator').textContent`);
      assert.ok(step1Text.includes('Question 1 of 2'), 'Should display Question 1');

      // Select Kafka and advance to Question 2
      await evalClick(app.port, '#btn-question-next');
      await new Promise(r => setTimeout(r, 400));

      const step2Text = await evalJS(app.port, `document.getElementById('question-step-indicator').textContent`);
      assert.ok(step2Text.includes('Question 2 of 2'), 'Should display Question 2');

      // Submit form answers to synthesize tasks
      await evalClick(app.port, '#btn-question-submit');
      await new Promise(r => setTimeout(r, 800));

      const genStatus = await evalJS(app.port, `document.getElementById('generate-status').textContent`);
      console.log('Generate status:', genStatus);

      const updatedMetaText = await evalJS(app.port, `document.getElementById('project-metadata-card').textContent`);
      assert.ok(updatedMetaText.includes('Feature 1'), 'Should display synthesized feature tab');

      // 6. Verify Generated Epic and Stories
      const inputValues = await evalJS(app.port, `Array.from(document.querySelectorAll('.task-title-input')).map(i => i.value).join(' ')`);
      assert.ok(inputValues.includes('Acme Petshop Platform') || inputValues.includes('Distributed Platform'), 'Should generate epic');
      assert.ok(inputValues.includes('PET-101') || inputValues.includes('PostgreSQL'), 'Should generate PET-101 story');
      assert.ok(inputValues.includes('PET-102') || inputValues.includes('REST API Service'), 'Should generate PET-102 story');

      const taskCount = await evalJS(app.port, `document.getElementById('task-count').textContent`);
      assert.ok(parseInt(taskCount, 10) >= 5, 'Should have at least 5 generated tasks');

      // 7. Sync All to Server
      await evalClick(app.port, '#btn-create-all');
      await new Promise(r => setTimeout(r, 600));

      const statusText = await evalJS(app.port, `document.getElementById('create-status').textContent`);
      assert.ok(statusText.includes('synced') || statusText.includes('✓'), 'Should report successful sync to server');
    } finally {
      await killApp(app);
    }
  });
});
