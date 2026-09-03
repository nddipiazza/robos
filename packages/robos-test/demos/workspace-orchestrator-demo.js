'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'Workspace Orchestrator synchronizes Git Worktrees across distributed microservices.',
    target: '#proj-item-buildbarn-platform',
    action: 'click',
    callout: 'Select BuildBarn Platform',
    js: "window.selectProject('buildbarn-platform')",
    minHold: 3500,
  },
  {
    narration: 'Selecting projects dynamically transitions between multi-repo dependency graphs.',
    target: '#proj-item-analytics-pipeline',
    action: 'click',
    callout: 'Switch to Analytics Pipeline',
    js: "window.selectProject('analytics-pipeline')",
    minHold: 3500,
  },
  {
    narration: 'Developers switch branches globally across all repositories simultaneously.',
    target: '#select-gitops-branch',
    action: 'click',
    callout: 'Switch GitOps Branch',
    js: "window.switchGitBranch('feature/TAX-1099-ein-verification')",
    minHold: 3500,
  },
  {
    narration: 'Atomic worktree provisioning creates isolated working trees in under 200ms.',
    target: '#btn-sync-worktrees',
    action: 'click',
    callout: 'Synchronize Git Worktrees',
    js: 'window.syncWorktrees()',
    minHold: 3500,
  },
  {
    narration: 'IDE bridges configure multi-root project views for IntelliJ and VS Code.',
    target: '#btn-open-ide',
    action: 'click',
    callout: 'Open Multi-Root Project in IDE',
    js: 'window.openInIDE()',
    minHold: 3500,
  },
  {
    narration: 'Automated teardown removes worktrees and releases dev server ports cleanly.',
    target: '#btn-teardown-ws',
    action: 'click',
    callout: 'Teardown Workspace & Free Ports',
    js: 'window.teardownWorkspace()',
    minHold: 3500,
  },
];

runDemo({
  slug: 'workspace-orchestrator',
  appId: 'workspace-manager',
  windowTitle: 'RobOS Workspace Manager',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
