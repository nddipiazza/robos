'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

const { launchApp, killApp } = require('../../lib/harness');
const {
  getSnapshot, findById, findAllNodes, flatText, evalClick, evalJS, waitForText,
} = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Task Implementer - Agent Personas', () => {
  let app;

  before(async () => {
    app = await launchApp('task-implementer', scenarios['task-implementer-github']);
    await waitForText(app.port, 'Acme GitHub', 10000);
  });

  after(() => killApp(app));

  it('displays the Agent Personas management button in the header', async () => {
    const snap = await getSnapshot(app.port);
    const btn = findById(snap, 'btn-agent-personas');
    assert.ok(btn, '#btn-agent-personas exists in header');
    assert.ok(flatText(snap).includes('Personas'), 'Personas button label rendered');
  });

  it('opens and closes the Agent Personas modal', async () => {
    await evalClick(app.port, '#btn-agent-personas');
    await new Promise(r => setTimeout(r, 200));

    const isVisible = await evalJS(app.port, `document.getElementById('agent-personas-overlay').style.display !== 'none'`);
    assert.strictEqual(isVisible, true, 'Personas overlay opened');

    const countText = await evalJS(app.port, `document.getElementById('personas-count-badge').textContent`);
    assert.ok(countText.includes('Roles'), `Roles count badge populated: ${countText}`);

    // Verify fields populated
    const roleVal = await evalJS(app.port, `document.getElementById('persona-edit-role').value`);
    assert.ok(roleVal && roleVal.length > 0, `Role field populated: "${roleVal}"`);

    await evalClick(app.port, '#btn-close-personas');
    await new Promise(r => setTimeout(r, 200));

    const isHidden = await evalJS(app.port, `document.getElementById('agent-personas-overlay').style.display === 'none'`);
    assert.strictEqual(isHidden, true, 'Personas overlay closed');
  });

  it('populates persona dropdown in workspace header with all standard roles', async () => {
    // Select first task to open workspace
    await evalJS(app.port, `
      const item = document.querySelector('.task-item');
      if (item) item.click();
    `);
    await new Promise(r => setTimeout(r, 300));

    const optionsCount = await evalJS(app.port, `document.querySelectorAll('#ws-agent-persona-select option').length`);
    assert.ok(optionsCount >= 8, `Expected at least 8 persona options, got ${optionsCount}`);

    const optionsText = await evalJS(app.port, `
      [...document.querySelectorAll('#ws-agent-persona-select option')].map(o => o.textContent).join(' ')
    `);
    assert.ok(optionsText.includes('Software Architect'), 'Software Architect in dropdown');
    assert.ok(optionsText.includes('Frontend Web Developer'), 'Frontend Web Developer in dropdown');
    assert.ok(optionsText.includes('Game Developer'), 'Game Developer in dropdown');
    assert.ok(optionsText.includes('Backend Systems Developer'), 'Backend Systems Developer in dropdown');
    assert.ok(optionsText.includes('Data & Storage Engineer'), 'Data & Storage Engineer in dropdown');
    assert.ok(optionsText.includes('DevOps & Cloud Engineer'), 'DevOps & Cloud Engineer in dropdown');
    assert.ok(optionsText.includes('Non-Headless Developer'), 'Non-Headless Developer in dropdown');
    assert.ok(optionsText.includes('Human + Agent Desktop Co-Pilot'), 'Human + Agent Desktop Co-Pilot in dropdown');
  });

  it('automatically detects and assigns specialized agent persona when selecting tasks', async () => {
    // Inject tasks covering different roles
    await evalJS(app.port, `
      window._demoInjectTasks([
        {
          key: '#101',
          title: 'Implement Godot 4 Isometric Tilemap Combat System',
          body: 'Create turn mechanics with D&D 5e SRD initiative calculations and Flare RPG sprites.',
          labels: ['role:game-dev', 'gameplay'],
          status: 'open',
          assignee: 'alex'
        },
        {
          key: '#102',
          title: 'Design Dark Navy React Modal for RobOS Task Planner',
          body: 'Accessible web component with RobOS CSS dark tokens and keyboard focus trap.',
          labels: ['role:frontend-web-dev', 'ui'],
          status: 'open',
          assignee: 'sara'
        },
        {
          key: '#103',
          title: 'PostgreSQL Flyway Migration & Kafka Event Stream Consumer',
          body: 'Implement transactional migration scripts and idempotent Kafka listener.',
          labels: ['role:data-engineer-dev', 'database'],
          status: 'open',
          assignee: 'dan'
        },
        {
          key: '#104',
          title: 'Debug UI crash with step debugger and Chrome DevTools MCP',
          body: 'Operate in ephemeral Xvfb using mapped IDE and execute token-saving IDE refactorings.',
          labels: ['role:non-headless-dev', 'automation'],
          status: 'open',
          assignee: 'claudia'
        },
        {
          key: '#105',
          title: 'Collaborative pair programming session with human developer',
          body: 'Pair on active desktop session in the same session with shared IDE and refactoring tools.',
          labels: ['role:human-agent-copilot', 'copilot'],
          status: 'open',
          assignee: 'ndipiazza'
        }
      ]);
    `);
    await new Promise(r => setTimeout(r, 300));

    // 1. Select game task (#101)
    await evalJS(app.port, `window._demoSelectTask('#101')`);
    await new Promise(r => setTimeout(r, 200));

    let selectedRole = await evalJS(app.port, `(() => {
      const sel = document.getElementById('ws-agent-persona-select');
      return sel.options[sel.selectedIndex]?.text || '';
    })()`);
    assert.ok(selectedRole.includes('Game Developer'), `Game task assigned to Game Developer (got "${selectedRole}")`);

    let directives = await evalJS(app.port, `document.getElementById('persona-prompt-preview').value`);
    assert.ok(directives.includes('Godot 4') || directives.includes('SRD 5e') || directives.includes('tactical'),
      'Directives panel contains Godot / SRD guidance');

    // 2. Select frontend task (#102)
    await evalJS(app.port, `window._demoSelectTask('#102')`);
    await new Promise(r => setTimeout(r, 200));

    selectedRole = await evalJS(app.port, `(() => {
      const sel = document.getElementById('ws-agent-persona-select');
      return sel.options[sel.selectedIndex]?.text || '';
    })()`);
    assert.ok(selectedRole.includes('Frontend Web Developer'), `Frontend task assigned to Frontend Web Developer (got "${selectedRole}")`);

    directives = await evalJS(app.port, `document.getElementById('persona-prompt-preview').value`);
    assert.ok(directives.includes('contextBridge') || directives.includes('RobOS CSS') || directives.includes('accessible'),
      'Directives panel contains Electron / UI guidance');

    // 3. Select data task (#103)
    await evalJS(app.port, `window._demoSelectTask('#103')`);
    await new Promise(r => setTimeout(r, 200));

    selectedRole = await evalJS(app.port, `(() => {
      const sel = document.getElementById('ws-agent-persona-select');
      return sel.options[sel.selectedIndex]?.text || '';
    })()`);
    assert.ok(selectedRole.includes('Data & Storage Engineer'), `Data task assigned to Data & Storage Engineer (got "${selectedRole}")`);

    // 4. Select non-headless dev task (#104)
    await evalJS(app.port, `window._demoSelectTask('#104')`);
    await new Promise(r => setTimeout(r, 200));

    selectedRole = await evalJS(app.port, `(() => {
      const sel = document.getElementById('ws-agent-persona-select');
      return sel.options[sel.selectedIndex]?.text || '';
    })()`);
    assert.ok(selectedRole.includes('Non-Headless Developer'), `Non-headless task assigned to Non-Headless Developer (got "${selectedRole}")`);

    directives = await evalJS(app.port, `document.getElementById('persona-prompt-preview').value`);
    assert.ok(directives.includes('Xvfb') || directives.includes('debugger') || directives.includes('refactoring') || directives.includes('DevTools'),
      'Directives panel contains non-headless GUI & refactoring guidance');

    // 5. Select human+agent copilot task (#105)
    await evalJS(app.port, `window._demoSelectTask('#105')`);
    await new Promise(r => setTimeout(r, 200));

    selectedRole = await evalJS(app.port, `(() => {
      const sel = document.getElementById('ws-agent-persona-select');
      return sel.options[sel.selectedIndex]?.text || '';
    })()`);
    assert.ok(selectedRole.includes('Human + Agent Desktop Co-Pilot'), `Copilot task assigned to Human + Agent Desktop Co-Pilot (got "${selectedRole}")`);

    directives = await evalJS(app.port, `document.getElementById('persona-prompt-preview').value`);
    assert.ok(directives.includes('session') || directives.includes('Pair') || directives.includes('refactor'),
      'Directives panel contains desktop pairing guidance');
  });

  it('supports toggling the Directives drawer, editing custom directives, and resetting to defaults', async () => {
    // Select task #102
    await evalJS(app.port, `window._demoSelectTask('#102')`);
    await new Promise(r => setTimeout(r, 200));

    // Toggle directives open
    await evalClick(app.port, '#btn-toggle-directives');
    await new Promise(r => setTimeout(r, 200));

    let boxDisplay = await evalJS(app.port, `document.getElementById('persona-directives-box').style.display`);
    assert.strictEqual(boxDisplay, 'flex', 'Directives drawer opened');

    // Edit custom prompt directives in textarea
    await evalJS(app.port, `
      document.getElementById('persona-prompt-preview').value = 'CUSTOM DIRECTIVE: Verify WCAG 2.1 AA color contrast and test with screen reader.';
    `);

    let customVal = await evalJS(app.port, `document.getElementById('persona-prompt-preview').value`);
    assert.strictEqual(customVal, 'CUSTOM DIRECTIVE: Verify WCAG 2.1 AA color contrast and test with screen reader.');

    // Click reset to role default
    await evalClick(app.port, '#btn-reset-directives');
    await new Promise(r => setTimeout(r, 200));

    let resetVal = await evalJS(app.port, `document.getElementById('persona-prompt-preview').value`);
    assert.ok(resetVal.includes('Electron Security') || resetVal.includes('RobOS CSS') || resetVal.includes('contextBridge'),
      'Directives restored to Frontend Web Developer role defaults');

    // Toggle directives closed
    await evalClick(app.port, '#btn-toggle-directives');
    await new Promise(r => setTimeout(r, 200));

    boxDisplay = await evalJS(app.port, `document.getElementById('persona-directives-box').style.display`);
    assert.strictEqual(boxDisplay, 'none', 'Directives drawer closed');
  });

  it('manually changing the persona dropdown updates the role and directives panel', async () => {
    // Select task #102
    await evalJS(app.port, `window._demoSelectTask('#102')`);
    await new Promise(r => setTimeout(r, 200));

    // Manually switch persona to DevOps & Cloud Engineer
    await evalJS(app.port, `(() => {
      const sel = document.getElementById('ws-agent-persona-select');
      const devopsOpt = [...sel.options].find(o => o.text.includes('DevOps'));
      if (devopsOpt) {
        sel.value = devopsOpt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await new Promise(r => setTimeout(r, 200));

    const roleBadgeText = await evalJS(app.port, `document.getElementById('directives-role-badge').textContent`);
    assert.ok(roleBadgeText.includes('DevOps & Cloud Engineer'), `Directives role badge updated: "${roleBadgeText}"`);

    const directives = await evalJS(app.port, `document.getElementById('persona-prompt-preview').value`);
    assert.ok(directives.includes('Kubernetes') || directives.includes('Helm') || directives.includes('GitOps'),
      'Directives updated with DevOps & Cloud Engineer guidance');
  });
});
