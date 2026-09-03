'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The agent-sidebar app is pinned to the right edge of the virtual desktop, displaying active agent context.',
    target: '.sidebar-header',
    action: 'hover',
    callout: 'Inspect Pinned Sidebar Header',
    minHold: 3200,
  },
  {
    narration: 'The execution plan tracks discrete task milestones with real-time completion status.',
    target: '#step-list',
    action: 'hover',
    callout: 'Review Workflow Execution Plan',
    minHold: 3200,
  },
  {
    narration: 'The live tool invocation feed streams sub-agent commands, tool calls, and execution outputs.',
    target: '#tool-stream',
    action: 'hover',
    callout: 'Inspect Live Tool Stream',
    minHold: 3200,
  },
  {
    narration: 'The developer interacts directly with human-in-the-loop verification controls to approve milestones.',
    target: '#action-bar',
    action: 'hover',
    callout: 'Review Human Approval Triggers',
    minHold: 3000,
  },
  {
    narration: 'We click Approve Step to confirm regression test passage and transition to verification artifact generation.',
    target: '#btn-approve-step',
    action: 'click',
    callout: 'Click Approve Step',
    minHold: 3500,
  },
  {
    narration: 'The workflow advances immediately, logging the verification tool action and updating the agent status pill.',
    target: '#agent-status-pill',
    action: 'hover',
    callout: 'Verify Completed Milestone State',
    minHold: 3000,
  },
];

runDemo({
  slug: 'agent-sidebar',
  appId: 'agent-sidebar',
  windowTitle: 'RobOS Agent Workflow Sidebar',
  scenario: scenarios['all-good'],
  audio: false,
  env: {
    ROBOS_DEMO_SHOW: '1',
    ROBOS_TASK_ID: 'TASK-101',
    ROBOS_AGENT_ROLE: 'Senior Code Reviewer',
  },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
