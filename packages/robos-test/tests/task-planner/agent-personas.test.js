'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
  loadAgentPersonas,
  saveAgentPersona,
  resetAgentPersonas,
  detectPersonaForTask,
  buildExecutionPrompt,
  BUILTIN_AGENT_PERSONAS,
} = require('../../../robos-lib/agent-personas');

const { TemplateManager } = require('../../../task-planner/lib/template-manager');
const { launchApp, killApp } = require('../../lib/harness');
const {
  getSnapshot, findById, findAllNodes, flatText, evalClick, evalJS,
} = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Task Planner - Agent Personas', () => {

  describe('Core Agent Personas Library & Detection Heuristics', () => {
    it('provides all standard RobOS developer agent personas', () => {
      const personas = loadAgentPersonas();
      assert.ok(personas.length >= 8, `Expected at least 8 personas, got ${personas.length}`);

      const roles = personas.map(p => p.role);
      assert.ok(roles.includes('Software Architect'), 'Software Architect present');
      assert.ok(roles.includes('Frontend Web Developer'), 'Frontend Web Developer present');
      assert.ok(roles.includes('Game Developer'), 'Game Developer present');
      assert.ok(roles.includes('Backend Systems Developer'), 'Backend Systems Developer present');
      assert.ok(roles.includes('Data & Storage Engineer'), 'Data & Storage Engineer present');
      assert.ok(roles.includes('DevOps & Cloud Engineer'), 'DevOps & Cloud Engineer present');
      assert.ok(roles.includes('Non-Headless Developer'), 'Non-Headless Developer present');
      assert.ok(roles.includes('Human + Agent Desktop Co-Pilot'), 'Human + Agent Desktop Co-Pilot present');
    });

    it('each persona contains systemPrompt, developmentGuidance, and implementation directives', () => {
      const personas = loadAgentPersonas();
      for (const p of personas) {
        assert.ok(p.id.startsWith('urn:robos:agent:'), `Valid URN id: ${p.id}`);
        assert.ok(p.systemPrompt && p.systemPrompt.length > 20, `${p.role} has systemPrompt`);
        assert.ok(p.developmentGuidance && p.developmentGuidance.length > 20, `${p.role} has developmentGuidance`);
        assert.ok(p.planningPrompt && p.planningPrompt.length > 10, `${p.role} has planningPrompt`);
        assert.ok(p.implementationPrompt && p.implementationPrompt.length > 10, `${p.role} has implementationPrompt`);
      }
    });

    it('detects persona by direct role/id assignment or role:* label', () => {
      const taskWithRole = { title: 'Implement Auth', assignedRole: 'Frontend Web Developer' };
      assert.strictEqual(detectPersonaForTask(taskWithRole).slug, 'frontend-web-dev');

      const taskWithLabel = { title: 'Triage Issue', labels: ['bug', 'role:game-dev'] };
      assert.strictEqual(detectPersonaForTask(taskWithLabel).slug, 'game-dev');

      const taskWithNonHeadlessLabel = { title: 'GUI Automation Task', labels: ['role:non-headless-dev'] };
      assert.strictEqual(detectPersonaForTask(taskWithNonHeadlessLabel).slug, 'non-headless-dev');

      const taskWithCopilotLabel = { title: 'Pair Programming Story', labels: ['role:human-agent-copilot'] };
      assert.strictEqual(detectPersonaForTask(taskWithCopilotLabel).slug, 'human-agent-copilot');

      const taskWithId = { title: 'Do Work', agentPersonaId: 'urn:robos:agent:data-engineer-dev' };
      assert.strictEqual(detectPersonaForTask(taskWithId).slug, 'data-engineer-dev');
    });

    it('heuristically detects specialized personas based on task content', () => {
      // Game dev
      const gameTask = { title: 'Create Godot 4 combat arena for tactical turn-based battle', body: 'Implement SRD 5e initiative and action economy' };
      assert.strictEqual(detectPersonaForTask(gameTask).slug, 'game-dev');

      // Data engineer
      const dataTask = { title: 'Write Flyway SQL migrations for pet adoption schema', body: 'Add PostgreSQL unique constraints and Kafka event stream topic' };
      assert.strictEqual(detectPersonaForTask(dataTask).slug, 'data-engineer-dev');

      // Frontend
      const uiTask = { title: 'Design dark navy React modal component for task planner', body: 'Style with RobOS CSS tokens and verify keyboard accessibility' };
      assert.strictEqual(detectPersonaForTask(uiTask).slug, 'frontend-web-dev');

      // DevOps
      const devopsTask = { title: 'Configure Helm chart and ArgoCD GitOps application', body: 'Deploy Kubernetes pods with readiness probes' };
      assert.strictEqual(detectPersonaForTask(devopsTask).slug, 'devops-engineer');

      // Software Architect
      const archTask = { title: 'Define C4 container model and evaluate KGraph blast radius', body: 'Author living ADR for microservice decomposition' };
      assert.strictEqual(detectPersonaForTask(archTask).slug, 'software-architect');

      // Non-Headless Developer
      const nonHeadlessTask = { title: 'Reproduce bug using step debugger and Chrome DevTools MCP', body: 'Run interactive IDE inside ephemeral Xvfb and execute token-saving IDE refactoring' };
      assert.strictEqual(detectPersonaForTask(nonHeadlessTask).slug, 'non-headless-dev');

      // Human + Agent Desktop Co-Pilot
      const copilotTask = { title: 'Pair programming session with human developer in same session', body: 'Collaborative co-pilot on active desktop session' };
      assert.strictEqual(detectPersonaForTask(copilotTask).slug, 'human-agent-copilot');
    });

    it('builds comprehensive execution prompt with role directive, guidance, and task specifications', () => {
      const personas = loadAgentPersonas();
      const frontendPersona = personas.find(p => p.slug === 'frontend-web-dev');
      const task = {
        key: 'PET-101',
        title: 'Build Pet Search Filter Component',
        body: 'Implement debounce search bar with reactive state.',
        labels: ['ui', 'frontend'],
      };

      const prompt = buildExecutionPrompt(task, frontendPersona, 'Focus on mobile responsive viewports');
      assert.ok(prompt.includes('ROLE DIRECTIVE:'), 'Contains ROLE DIRECTIVE');
      assert.ok(prompt.includes('ROBOS DEVELOPMENT & ARCHITECTURAL GUIDANCE FOR FRONTEND WEB DEVELOPER:'), 'Contains Guidance Header');
      assert.ok(prompt.includes('NEVER enable nodeIntegration'), 'Contains Electron security rule');
      assert.ok(prompt.includes('TASK SUMMARY: Build Pet Search Filter Component'), 'Contains task summary');
      assert.ok(prompt.includes('TASK KEY: PET-101'), 'Contains task key');
      assert.ok(prompt.includes('ADDITIONAL CONTEXT FROM DEVELOPER:\nFocus on mobile responsive viewports'), 'Contains extra context');
    });

    it('Task Templates generator attaches specialized agent roles to generated tasks', () => {
      const manager = new TemplateManager();
      const frontendPlan = manager.generatePlan('frontend-web-app', { appName: 'Analytics Dashboard' });
      assert.ok(frontendPlan.tasks.length > 1);
      assert.strictEqual(frontendPlan.tasks[0].isEpic, true);
      assert.strictEqual(frontendPlan.tasks[0].assignedRole, 'Software Architect');
      assert.strictEqual(frontendPlan.tasks[1].assignedRole, 'Frontend Web Developer');
      assert.strictEqual(frontendPlan.tasks[1].agentPersonaId, 'urn:robos:agent:frontend-web-dev');

      const gamePlan = manager.generatePlan('robos-crpg-game', { gameTitle: 'Realm of Shadows' });
      assert.ok(gamePlan.tasks.length > 1);
      const gameStory = gamePlan.tasks.find(t => !t.isEpic) || gamePlan.tasks[1];
      assert.strictEqual(gameStory.assignedRole, 'Game Developer');
      assert.strictEqual(gameStory.agentPersonaId, 'urn:robos:agent:game-dev');

      const dataPlan = manager.generatePlan('relational-db-migrations', { dbName: 'AccountsDB' });
      assert.ok(dataPlan.tasks.length > 1);
      const dataStory = dataPlan.tasks.find(t => !t.isEpic) || dataPlan.tasks[1];
      assert.strictEqual(dataStory.assignedRole, 'Data & Storage Engineer');
      assert.strictEqual(dataStory.agentPersonaId, 'urn:robos:agent:data-engineer-dev');
    });
  });

  describe('E2E GUI Integration with Task Planner', () => {
    let app;

    before(async () => {
      app = await launchApp('task-planner', scenarios['task-planner-github']);
      await new Promise(r => setTimeout(r, 1500));
    });

    after(() => killApp(app));

    it('displays the Agent Personas button in the app header', async () => {
      const snap = await getSnapshot(app.port);
      const btn = findById(snap, 'btn-agent-personas');
      assert.ok(btn, '#btn-agent-personas exists and is visible');
      assert.ok(flatText(snap).includes('Personas'), 'Personas button label visible');
    });

    it('opens and closes the Agent Personas modal with role sidebar and directives editor', async () => {
      // Click #btn-agent-personas
      await evalClick(app.port, '#btn-agent-personas');
      await new Promise(r => setTimeout(r, 200));

      const modalVisible = await evalJS(app.port, `document.getElementById('agent-personas-overlay').style.display !== 'none'`);
      assert.strictEqual(modalVisible, true, 'Personas overlay opened');

      const countText = await evalJS(app.port, `document.getElementById('personas-count-badge').textContent`);
      assert.ok(countText.includes('Roles'), `Roles count rendered (got "${countText}")`);

      // Verify fields populated for active persona
      const roleVal = await evalJS(app.port, `document.getElementById('persona-edit-role').value`);
      assert.ok(roleVal && roleVal.length > 0, `Role field populated: "${roleVal}"`);

      const guidanceVal = await evalJS(app.port, `document.getElementById('persona-edit-guidance').value`);
      assert.ok(guidanceVal && guidanceVal.length > 0, 'Guidance textarea populated');

      // Close modal
      await evalClick(app.port, '#btn-close-personas');
      await new Promise(r => setTimeout(r, 200));

      const modalHidden = await evalJS(app.port, `document.getElementById('agent-personas-overlay').style.display === 'none'`);
      assert.strictEqual(modalHidden, true, 'Personas overlay closed');
    });

    it('renders task cards with role select and directives toggle when plan is generated', async () => {
      // Inject demo tasks
      await evalJS(app.port, `
        window._demoInjectTasks([
          {
            title: 'Build Isometric Map Rendering in Godot',
            summary: 'Implement Flare RPG tilemap loader and camera panning in Godot 4',
            assignedRole: 'Game Developer',
            agentPersonaId: 'urn:robos:agent:game-dev',
            implementationGuidance: 'Follow Godot 4 TileMap layer best practices and isometric grid projection.'
          },
          {
            title: 'Build Dark Navy Settings View in Electron',
            summary: 'React 18 settings modal with accessible form controls and CSS tokens',
            assignedRole: 'Frontend Web Developer',
            agentPersonaId: 'urn:robos:agent:frontend-web-dev',
            implementationGuidance: 'Use standard RobOS CSS dark tokens and contextBridge IPC.'
          }
        ]);
      `);
      await new Promise(r => setTimeout(r, 300));

      const cardCount = await evalJS(app.port, `document.querySelectorAll('.task-card').length`);
      assert.strictEqual(cardCount, 2, '2 task cards rendered');

      const roleSelects = await evalJS(app.port, `document.querySelectorAll('.task-role-select').length`);
      assert.strictEqual(roleSelects, 2, 'Each task card has a role select');

      const directivesBtns = await evalJS(app.port, `document.querySelectorAll('.task-directives-btn').length`);
      assert.strictEqual(directivesBtns, 2, 'Each task card has a directives toggle button');

      const firstRole = await evalJS(app.port, `document.querySelectorAll('.task-role-select')[0].value`);
      assert.strictEqual(firstRole, 'Game Developer', 'First card assigned to Game Developer');

      const secondRole = await evalJS(app.port, `document.querySelectorAll('.task-role-select')[1].value`);
      assert.strictEqual(secondRole, 'Frontend Web Developer', 'Second card assigned to Frontend Web Developer');

      // Toggle directives on first card
      await evalJS(app.port, `document.querySelectorAll('.task-directives-btn')[0].click()`);
      await new Promise(r => setTimeout(r, 200));

      const boxVisible = await evalJS(app.port, `document.querySelectorAll('.task-directives-box')[0].style.display !== 'none'`);
      assert.strictEqual(boxVisible, true, 'Directives editor box opened');

      const directivesContent = await evalJS(app.port, `document.querySelectorAll('.task-directives-input')[0].value`);
      assert.ok(directivesContent.includes('Godot 4 TileMap'), 'Directives content pre-populated');
    });
  });
});
