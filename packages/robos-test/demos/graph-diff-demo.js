'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'We inspect the loaded graph name, source location, node count and registered schema count.',
    target: '#graph-status-bar',
    action: 'hover',
    callout: 'Inspect Loaded Graph Context',
    minHold: 3200,
  },
  {
    narration: 'We trigger a semantic graph diff between main and feature/TASK-101-auth in under 100ms.',
    target: '#btn-run-diff',
    action: 'click',
    callout: 'Execute Semantic Graph Diff',
    minHold: 3500,
  },
  {
    narration: 'We inspect the selected base and target branches and the displayed graph change summary.',
    target: '#inspector-content .grid-2col',
    action: 'hover',
    callout: 'Inspect Graph Change Summary',
    minHold: 3200,
  },
  {
    narration: 'We inspect the displayed modeled risk assessment; it is not a live deployment health check.',
    target: '#inspector-content .card-title .status-tag-pass',
    action: 'hover',
    callout: 'Inspect Modeled Risk Assessment',
    minHold: 3200,
  },
  {
    narration: 'Downstream blast radius traversal flags all impacted services, owner teams, and linked requirements.',
    target: '#query-text',
    action: 'hover',
    callout: 'Inspect Blast Radius Impact Analysis',
    minHold: 3500,
  },
  {
    narration: 'Semantic graph diffs and blast radius proofs are attached to pull requests for instant reviewer sign-off.',
    target: '#query-badge',
    action: 'hover',
    callout: 'Attach Diff Proof to Review Gate',
    minHold: 3000,
  },
];

runDemo({
  slug: 'graph-diff',
  appId: 'robos-graph',
  windowTitle: 'RobOS Knowledge Graph Explorer',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
