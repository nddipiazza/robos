'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The CI Monitor MCP Server exposes real-time CI/CD build telemetry, test failures, and deployments to AI agents.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect CI Pipeline Metrics',
    minHold: 3200,
  },
  {
    narration: 'AI agents query robos_ci_list_runs to inspect recent builds, pass rates, and durations across active branches.',
    target: '#runs-list',
    action: 'hover',
    callout: 'Query Pipeline Run History',
    minHold: 3200,
  },
  {
    narration: 'We inspect failed assertions and diagnostic stack traces via robos_ci_get_failures.',
    target: '#btn-inspect-failures',
    action: 'click',
    callout: 'Call robos_ci_get_failures',
    minHold: 3500,
  },
  {
    narration: 'We stream complete test suite logs via robos_ci_get_logs for autonomous bug localization.',
    target: '#run-logs-text',
    action: 'hover',
    callout: 'Call robos_ci_get_logs',
    js: `(() => {
      window.selectRun('run-102');
    })()`,
    minHold: 3200,
  },
  {
    narration: 'After applying bugfixes, AI agents dispatch robos_ci_retry_run to re-trigger automated test verification.',
    target: '#btn-retry-failed',
    action: 'click',
    callout: 'Call robos_ci_retry_run',
    minHold: 3200,
  },
  {
    narration: 'AI agents query robos://ci-monitor-mcp/ci/current to verify healthy staging and production deployment states.',
    target: '#trace-log',
    action: 'hover',
    callout: 'Read robos://ci/current Resource',
    minHold: 3000,
  },
];

runDemo({
  slug: 'ci-monitor-mcp',
  appId: 'ci-monitor-mcp',
  windowTitle: 'RobOS CI Monitor MCP Server Console',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
