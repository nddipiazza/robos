'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { DEFAULT_TEMPLATES } = require('../../../task-planner/lib/default-templates');
const { TemplateManager } = require('../../../task-planner/lib/template-manager');

const { launchApp, killApp } = require('../../lib/harness');
const {
  getSnapshot, findById, findAllNodes, flatText, evalClick, evalJS,
} = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Task Planner - Task Templates', () => {

  describe('Default Templates Registry & Generator', () => {
    let tmpDir;
    let manager;

    before(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-templates-test-'));
      manager = new TemplateManager(tmpDir);
    });

    after(() => {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('provides at least 50 built-in templates (currently 66)', () => {
      const templates = manager.listTemplates();
      assert.ok(templates.length >= 50, `Expected at least 50 templates, got ${templates.length}`);
      assert.strictEqual(templates.length, 66, 'Found exactly 66 default templates');
    });

    it('organizes templates across distinct SDLC categories', () => {
      const categories = manager.getCategories();
      assert.ok(categories.length >= 8, `Expected at least 8 categories, got ${categories.length}`);
      assert.ok(categories.includes('Services & APIs'));
      assert.ok(categories.includes('Front-End Applications'));
      assert.ok(categories.includes('Game Development'));
      assert.ok(categories.includes('Mobile Applications'));
      assert.ok(categories.includes('Libraries & SDKs'));
      assert.ok(categories.includes('Knowledge Graph & Schemas'));
      assert.ok(categories.includes('Data & Storage'));
      assert.ok(categories.includes('Cloud & Infrastructure'));
      assert.ok(categories.includes('DevOps & Observability'));
      assert.ok(categories.includes('RobOS Platform & Agent Extensions'));
    });

    it('contains all user-requested core templates', () => {
      const requiredIds = [
        'backend-web-service',   // plan to create a back-end web service
        'frontend-web-app',      // plan to create a front-end web application
        'godot-game',            // plan to create a godot game
        'java-library',          // plan to create a java library
        'mobile-app',            // plan to create a mobile app
        'react-frontend-app',    // plan to create a react front-end app
        'create-resource',       // plan to create a resource
        'add-kgraph-schema',     // plan to add to the knowledge graph schema
      ];

      for (const id of requiredIds) {
        const tpl = manager.getTemplate(id);
        assert.ok(tpl, `Template with id "${id}" should exist`);
        assert.ok(tpl.title, `Template ${id} has a title`);
        assert.ok(Array.isArray(tpl.fields), `Template ${id} has fields array`);
        assert.ok(typeof tpl.generatePlan === 'function', `Template ${id} has generatePlan function`);
      }
    });

    it('resolves templates via flexible aliases or prefixes', () => {
      assert.ok(manager.getTemplate('create-backend-service'));
      assert.ok(manager.getTemplate('plan-to-create-backend-service'));
      assert.ok(manager.getTemplate('godot-game'));
      assert.ok(manager.getTemplate('create-godot-game'));
    });

    it('generates a valid plan for "backend-web-service"', () => {
      const tpl = manager.getTemplate('backend-web-service');
      const plan = tpl.generatePlan({
        serviceName: 'order-service',
        runtime: 'node-fastify',
        database: 'postgres',
        auth: 'jwt',
        features: 'CRUD endpoints for orders and invoices'
      });

      assert.ok(plan.prompt.includes('order-service'));
      assert.ok(plan.tasks.length >= 4, `Expected >=4 tasks, got ${plan.tasks.length}`);
      const epic = plan.tasks.find(t => t.isEpic);
      assert.ok(epic, 'Contains an Epic');
      assert.ok(epic.title.includes('order-service'));
      const stories = plan.tasks.filter(t => !t.isEpic);
      assert.ok(stories.length >= 3, 'Contains child stories');
      for (const story of stories) {
        assert.ok(story.title, 'Story has title');
        assert.ok(story.body, 'Story has body');
      }
    });

    it('generates a valid plan for "frontend-web-app"', () => {
      const tpl = manager.getTemplate('frontend-web-app');
      const plan = tpl.generatePlan({
        appName: 'customer-portal',
        framework: 'react-vite',
        cssFramework: 'tailwind',
        stateStore: 'tanstack-query',
        features: 'Dashboard and profile management'
      });

      assert.ok(plan.prompt.includes('customer-portal'));
      assert.ok(plan.tasks.length >= 4);
      const epic = plan.tasks.find(t => t.isEpic);
      assert.ok(epic, 'Contains an Epic');
    });

    it('generates a valid plan for "godot-game"', () => {
      const tpl = manager.getTemplate('godot-game');
      const plan = tpl.generatePlan({
        gameTitle: 'Cosmic Drifter',
        dimension: '2d-pixel',
        scriptingLang: 'gdscript',
        mechanics: 'Top-down player movement and space combat'
      });

      assert.ok(plan.prompt.includes('Cosmic Drifter'));
      assert.ok(plan.tasks.length >= 4);
      const physicsTask = plan.tasks.find(t => t.title.includes('Mechanics') || t.title.includes('Controller') || t.title.includes('Physics'));
      assert.ok(physicsTask, 'Found game mechanics task');
    });

    it('generates a valid plan for "java-library"', () => {
      const tpl = manager.getTemplate('java-library');
      const plan = tpl.generatePlan({
        libraryName: 'robos-security-filter',
        groupId: 'com.robos.security',
        buildTool: 'gradle',
        purpose: 'Security token filtering utilities'
      });

      assert.ok(plan.prompt.includes('robos-security-filter'));
      assert.ok(plan.tasks.length >= 3);
      const epic = plan.tasks.find(t => t.isEpic);
      assert.ok(epic, 'Contains Epic');
    });

    it('generates a valid plan for "mobile-app"', () => {
      const tpl = manager.getTemplate('mobile-app');
      const plan = tpl.generatePlan({
        appName: 'CourierTrack',
        platform: 'react-native',
        navigation: 'expo-router',
        features: 'Real-time GPS delivery tracking'
      });

      assert.ok(plan.prompt.includes('CourierTrack'));
      assert.ok(plan.tasks.length >= 4);
    });

    it('generates a valid plan for "react-frontend-app"', () => {
      const tpl = manager.getTemplate('react-frontend-app');
      const plan = tpl.generatePlan({
        appName: 'analytics-dashboard',
        router: 'tanstack-router',
        components: 'shadcn',
        views: 'Metrics charts, user table, filtering controls'
      });

      assert.ok(plan.prompt.includes('analytics-dashboard'));
      assert.ok(plan.tasks.length >= 4);
    });

    it('generates a valid plan for "create-resource"', () => {
      const tpl = manager.getTemplate('create-resource');
      const plan = tpl.generatePlan({
        resourceUri: 'urn:robos:resource:orders-db-cluster',
        resourceTitle: 'Orders PostgreSQL Cluster',
        resourceType: 'c4-infrastructure',
        metadata: 'environment: production\nclusterSize: 3'
      });

      assert.ok(plan.prompt.includes('Orders PostgreSQL Cluster'));
      assert.ok(plan.tasks.length >= 3);
    });

    it('generates a valid plan for "add-kgraph-schema"', () => {
      const tpl = manager.getTemplate('add-kgraph-schema');
      const plan = tpl.generatePlan({
        className: 'robos:AIModelCheckpoint',
        category: 'Artifacts & Assets',
        namespace: 'robos:',
        properties: 'checkpointHash, baseModel, weightsFormat, quantLevel, trainingDataset'
      });

      assert.ok(plan.prompt.includes('AIModelCheckpoint'));
      assert.ok(plan.tasks.length >= 3);
      const shaclTask = plan.tasks.find(t => t.title.includes('SHACL'));
      assert.ok(shaclTask, 'Has SHACL validation task');
    });

    it('supports custom template creation, listing, plan generation, and deletion', () => {
      const res = manager.saveCustomTemplate({
        title: 'Custom Microfrontend Scaffold',
        category: 'Custom Architecture',
        description: 'Scaffold a Webpack Module Federation microfrontend.',
        fields: [
          { id: 'mfeName', label: 'MFE Name', type: 'text', default: 'mfe-nav', required: true },
          { id: 'port', label: 'Dev Port', type: 'number', default: 3001 }
        ]
      });

      assert.ok(res.ok, 'Save custom template ok');
      const customId = res.template.id;
      assert.ok(customId, 'Custom template ID returned');
      const retrieved = manager.getTemplate(customId);
      assert.ok(retrieved, 'Found saved custom template');
      assert.strictEqual(retrieved.title, 'Custom Microfrontend Scaffold');
      assert.strictEqual(retrieved.isCustom, true);

      // Verify listing includes the custom template
      const all = manager.listTemplates();
      assert.strictEqual(all.length, 67, 'Total templates incremented to 67');

      // Test generating plan from custom template
      const plan = manager.generatePlan(customId, { mfeName: 'mfe-cart', port: 3002 });
      assert.ok(plan.ok, 'Generate plan ok');
      assert.ok(plan.tasks.length >= 2, 'Generated tasks for custom template');
      assert.ok(plan.prompt.includes('mfe-cart'));

      // Delete custom template
      const delRes = manager.deleteCustomTemplate(customId);
      assert.strictEqual(delRes.ok, true, 'Successfully deleted custom template');
      assert.strictEqual(manager.getTemplate(customId), null, 'Custom template no longer exists');
      assert.strictEqual(manager.listTemplates().length, 66, 'Count back to 66');
    });
  });

  describe('E2E GUI Integration with Task Planner', () => {
    let app;

    before(async () => {
      app = await launchApp('task-planner', scenarios['task-planner-github']);
    });

    after(() => killApp(app));

    it('renders the templates banner with count badge and quick pills', async () => {
      const snap = await getSnapshot(app.port);
      assert.ok(findById(snap, 'templates-banner'), 'Templates banner is rendered');
      assert.ok(findById(snap, 'btn-browse-templates'), 'Browse All Templates button is present');

      const text = flatText(snap);
      assert.ok(text.includes('Task Templates'), 'Templates banner title visible');
      assert.ok(text.includes('Available'), 'Templates count badge visible');

      // Verify quick pills exist
      const pills = await evalJS(app.port, `document.querySelectorAll('.template-pill').length`);
      assert.ok(pills >= 4, `Expected at least 4 quick pills, got ${pills}`);
    });

    it('clicking Browse All Templates opens the modal with 60+ templates', async () => {
      await evalClick(app.port, '#btn-browse-templates');

      const isVisible = await evalJS(app.port, `document.getElementById('template-browser-overlay').style.display`);
      assert.strictEqual(isVisible, 'flex', 'Template browser overlay is open');

      const cardCount = await evalJS(app.port, `document.querySelectorAll('.template-card').length`);
      assert.ok(cardCount >= 50, `Expected at least 50 template cards in modal, got ${cardCount}`);

      // Filter by category
      await evalJS(app.port, `
        const btn = [...document.querySelectorAll('.category-filter-btn')].find(b => b.textContent.includes('Game'));
        if (btn) btn.click();
      `);

      const gameCardCount = await evalJS(app.port, `document.querySelectorAll('.template-card').length`);
      assert.ok(gameCardCount >= 3, `Expected at least 3 game templates, got ${gameCardCount}`);

      // Close modal
      await evalClick(app.port, '#btn-close-browser');
      const closedDisplay = await evalJS(app.port, `document.getElementById('template-browser-overlay').style.display`);
      assert.strictEqual(closedDisplay, 'none', 'Template browser overlay closed');
    });

    it('selecting a template opens the web form and populates the task plan upon submission', async () => {
      // Open form for "backend-web-service"
      await evalJS(app.port, `openTemplateForm('backend-web-service')`);

      const formDisplay = await evalJS(app.port, `document.getElementById('template-form-overlay').style.display`);
      assert.strictEqual(formDisplay, 'flex', 'Template form overlay opened');

      const fieldsCount = await evalJS(app.port, `document.querySelectorAll('#template-form-fields .form-field').length`);
      assert.ok(fieldsCount >= 3, `Expected multiple form fields, got ${fieldsCount}`);

      // Fill form values
      await evalJS(app.port, `
        const input = document.querySelector('input[name="serviceName"]');
        if (input) input.value = 'inventory-service';
      `);

      // Submit form
      await evalClick(app.port, '#btn-submit-template-form');

      // Wait for tasks to land in preview
      let count = 0;
      for (let i = 0; i < 20; i++) {
        count = await evalJS(app.port, `document.querySelectorAll('.task-card').length`);
        if (count >= 3) break;
        await new Promise(r => setTimeout(r, 200));
      }

      assert.ok(count >= 3, `Expected at least 3 generated tasks from template, got ${count}`);

      // Verify prompt textarea was updated
      const promptVal = await evalJS(app.port, `document.getElementById('prompt-input').value`);
      assert.ok(promptVal.includes('inventory-service'), `Prompt contains service name: ${promptVal}`);

      // Verify preview section is visible
      const previewDisplay = await evalJS(app.port, `document.getElementById('preview-section').style.display`);
      assert.strictEqual(previewDisplay, 'block', 'Preview section is visible');
    });

    it('custom template builder overlay can be opened and closed', async () => {
      await evalJS(app.port, `openCustomTemplateBuilder()`);
      const isVisible = await evalJS(app.port, `document.getElementById('custom-template-builder-overlay').style.display`);
      assert.strictEqual(isVisible, 'flex', 'Custom template builder overlay opened');

      await evalClick(app.port, '#btn-close-custom-builder');
      const isClosed = await evalJS(app.port, `document.getElementById('custom-template-builder-overlay').style.display`);
      assert.strictEqual(isClosed, 'none', 'Custom template builder overlay closed');
    });
  });
});
