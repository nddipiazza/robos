'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS Preferences provides unified system-wide configuration for AI models, IDEs, and credentials.',
    target: '#sidebar-item-ai',
    action: 'click',
    callout: 'Inspect AI Provider Settings',
    minHold: 3000,
  },
  {
    narration: 'We navigate to GitHub & Repositories to verify token and authentication configuration.',
    target: '#sidebar-item-github',
    action: 'click',
    callout: 'View GitHub Auth Section',
    minHold: 3000,
  },
  {
    narration: 'In IDE & Workspaces, we configure the default developer environment and workspace auto-launch behavior.',
    target: '#sidebar-item-ide',
    action: 'click',
    callout: 'Set Default IDE & Workspaces',
    js: `(() => {
      window.setFieldValue('default_ide', 'vscode');
    })()`,
    minHold: 3200,
  },
  {
    narration: 'In Work Journal & Knowledge Graph, we set the target branch for feature state modeling.',
    target: '#sidebar-item-journal',
    action: 'click',
    callout: 'Configure Knowledge Graph Branch',
    js: `(() => {
      window.setFieldValue('knowledge_graph_branch', 'feature/pilot-state');
    })()`,
    minHold: 3200,
  },
  {
    narration: 'We click Save All to persist settings to ~/.config/robos/settings.json and broadcast updates.',
    target: '#btn-save',
    action: 'click',
    callout: 'Save System Preferences',
    minHold: 3200,
  },
  {
    narration: 'RobOS Preferences maintains consistent developer environment state across all workspace tools.',
    target: '#sidebar-item-ai',
    action: 'click',
    callout: 'Preferences Overview',
    minHold: 2800,
  },
];

runDemo({
  slug: 'robos-preferences',
  appId: 'robos-preferences',
  windowTitle: 'RobOS Preferences',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
