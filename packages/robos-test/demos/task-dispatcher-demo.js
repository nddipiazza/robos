'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'Task Planner organizes work into dependency-aware Directed Acyclic Graphs.',
    target: '#dag-node-task-102',
    action: 'click',
    callout: 'Select TASK-102 on Critical Path',
    js: "window.selectTask('TASK-102')",
    minHold: 3500,
  },
  {
    narration: 'Task definitions and feature branch deltas sync directly from .robos/tasks/.',
    target: '#select-gitops-branch',
    action: 'click',
    callout: 'Switch GitOps Branch',
    js: "window.switchGitBranch('feature/TAX-1099-ein-verification')",
    minHold: 3500,
  },
  {
    narration: 'Agents operate in strict Planning Mode, authoring detailed architectural specs first.',
    target: '#btn-dispatch-plan',
    action: 'click',
    callout: 'Dispatch AI in Planning Mode',
    js: 'window.dispatchPlanning()',
    minHold: 3500,
  },
  {
    narration: 'AI Agent initiates a Grill Me interview, probing edge cases and payload size limits.',
    target: '#btn-grill-me',
    action: 'click',
    callout: 'Launch Grill Me Interview',
    js: 'window.openGrillMe()',
    minHold: 4000,
  },
  {
    narration: 'Reviewer answers the interrogation, enforcing a 2MB limit and HTTP 413 status.',
    target: '#btn-send-grill-answer',
    action: 'click',
    callout: 'Submit Reviewer Answer',
    js: 'window.sendGrillAnswer()',
    minHold: 4000,
  },
  {
    narration: 'Approval transitions the grilled plan to execution with automated contract gates.',
    target: '#btn-approve-plan',
    action: 'click',
    callout: 'Approve Plan for Execution',
    js: 'window.approvePlan()',
    minHold: 3500,
  },
];

runDemo({
  slug: 'task-dispatcher',
  appId: 'task-planner',
  windowTitle: 'RobOS Task Planner',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
