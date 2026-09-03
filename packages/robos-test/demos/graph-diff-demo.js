'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS computes structural semantic graph diffs between production main and proposed feature branches.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Semantic Diff Metrics',
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
    narration: 'We inspect the delta summary: +3 added nodes (Auth Gateway, OpenAPI 3.1 Spec, OAuth Requirement).',
    target: '#stat-diff-summary',
    action: 'hover',
    callout: 'Inspect +3 / ~0 / -0 Node Delta',
    minHold: 3200,
  },
  {
    narration: 'The engine evaluates breaking change risk scoring, certifying LOW RISK with 0 broken contract specs.',
    target: '#stat-risk-level',
    action: 'hover',
    callout: 'Verify Low Risk Rating',
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
  windowTitle: 'RobOS SDLC Knowledge Graph Explorer',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
