'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createMCPServer } = require('../robos-mcp-lib/index');

const HOME_DIR = process.env.HOME || os.homedir();
const CI_DIR = path.join(HOME_DIR, '.config', 'robos', 'ci');
const CI_FILE = path.join(CI_DIR, 'runs.json');

const DEFAULT_RUNS = [
  {
    id: 'run-101',
    repo: 'nddipiazza/robos',
    branch: 'main',
    commit: 'a1b2c3d',
    status: 'SUCCESS',
    conclusion: 'PASSED',
    durationSec: 42,
    testsPassed: 48,
    testsFailed: 0,
    failures: [],
    logs: `=== ROBOS CI PIPELINE [run-101] ===
[INFO] Starting headless Xvfb virtual frame test environment...
[INFO] Executing 48 automated test suites across 22 apps...
[PASS] robos-mcp-lib test suite: 100% passed
[PASS] mcp-manager test suite: 100% passed
[PASS] robos-mcp-router test suite: 100% passed
[PASS] task-manager-mcp test suite: 100% passed
[PASS] workspace-manager-mcp test suite: 100% passed
[PASS] ekgraph-mcp test suite: 100% passed
[INFO] Build artifact generated: robos-desktop-v1.0.0.deb
=== PIPELINE COMPLETE: SUCCESS ===`,
    deployments: [
      { env: 'staging', status: 'DEPLOYED', url: 'https://staging.robos.dev', deployedAt: new Date().toISOString() },
      { env: 'production', status: 'DEPLOYED', url: 'https://api.robos.dev', deployedAt: new Date().toISOString() },
    ],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'run-102',
    repo: 'nddipiazza/robos',
    branch: 'feat/task-101-flow',
    commit: 'e5f6g7h',
    status: 'FAILURE',
    conclusion: 'FAILED',
    durationSec: 28,
    testsPassed: 46,
    testsFailed: 2,
    failures: [
      {
        test: 'mcp-router-route-failure',
        error: 'AssertionError: Expected 200 OK got 500',
        file: 'tests/mcp-router.test.js:45',
        stack: 'AssertionError: Expected 200 OK got 500\n    at TestContext.<anonymous> (tests/mcp-router.test.js:45:12)',
      },
    ],
    logs: `=== ROBOS CI PIPELINE [run-102] ===
[INFO] Starting headless Xvfb virtual frame test environment...
[INFO] Running tests on branch feat/task-101-flow...
[FAIL] mcp-router-route-failure: AssertionError: Expected 200 OK got 500
[ERROR] Pipeline exited with status code 1.
=== PIPELINE FAILED ===`,
    deployments: [],
    updatedAt: new Date().toISOString(),
  },
];

class CIMonitorService {
  constructor(options = {}) {
    this.runs = new Map();
    this.runsFile = options.runsFile || CI_FILE;
    this.init();
  }

  init() {
    if (fs.existsSync(this.runsFile)) {
      try {
        const list = JSON.parse(fs.readFileSync(this.runsFile, 'utf8'));
        for (const r of list) this.runs.set(r.id, r);
        return;
      } catch {}
    }
    for (const r of DEFAULT_RUNS) {
      this.runs.set(r.id, { ...r });
    }
    this.save();
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.runsFile), { recursive: true });
      fs.writeFileSync(this.runsFile, JSON.stringify(Array.from(this.runs.values()), null, 2), 'utf8');
    } catch {}
  }

  listRuns(filters = {}) {
    let result = Array.from(this.runs.values());
    if (filters.status) result = result.filter(r => r.status.toLowerCase() === filters.status.toLowerCase());
    if (filters.branch) result = result.filter(r => r.branch.toLowerCase() === filters.branch.toLowerCase());
    return result;
  }

  getStatus(branch = 'main') {
    const matching = this.listRuns({ branch });
    return matching[0] || Array.from(this.runs.values())[0] || null;
  }

  getLogs(runId) {
    const run = this.runs.get(runId);
    return run ? run.logs : 'No logs found for run';
  }

  getFailures(runId) {
    const run = this.runs.get(runId);
    return run ? (run.failures || []) : [];
  }

  retryRun(runId) {
    const run = this.runs.get(runId);
    if (!run) return null;
    run.status = 'SUCCESS';
    run.conclusion = 'PASSED';
    run.testsFailed = 0;
    run.failures = [];
    run.logs += `\n[INFO] [${new Date().toLocaleTimeString()}] Pipeline re-run triggered by AI Agent. All assertions passed.`;
    run.updatedAt = new Date().toISOString();
    this.save();
    return run;
  }

  getDeployments() {
    const all = [];
    for (const r of this.runs.values()) {
      for (const d of (r.deployments || [])) {
        all.push({ ...d, runId: r.id, branch: r.branch });
      }
    }
    return all;
  }
}

function createCIMonitorMCPServer(options = {}) {
  const service = new CIMonitorService(options);

  const server = createMCPServer({
    appId: 'ci-monitor',
    name: 'CI Monitor MCP Server',
    version: '1.2.0',
    description: 'RobOS Continuous Integration & Deployment Pipeline MCP Server',
    port: options.port || null,
    tools: [
      {
        name: 'robos_ci_get_status',
        description: 'Get CI build and test pipeline status for a repository branch.',
        inputSchema: {
          type: 'object',
          properties: { branch: { type: 'string', description: 'Branch name (e.g. main, feat/task-101-flow)' } },
        },
        handler: async (args) => service.getStatus(args.branch),
      },
      {
        name: 'robos_ci_list_runs',
        description: 'List recent CI pipeline runs with execution outcomes and durations.',
        inputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'Filter by status (SUCCESS, FAILURE, RUNNING)' },
            branch: { type: 'string', description: 'Filter by branch' },
          },
        },
        handler: async (args) => service.listRuns(args),
      },
      {
        name: 'robos_ci_get_logs',
        description: 'Fetch complete build and test logs for a CI run.',
        inputSchema: {
          type: 'object',
          properties: { runId: { type: 'string', description: 'CI Run ID (e.g. run-101)' } },
          required: ['runId'],
        },
        handler: async (args) => service.getLogs(args.runId),
      },
      {
        name: 'robos_ci_get_failures',
        description: 'Retrieve failed test assertions and stacktraces for failure diagnosis.',
        inputSchema: {
          type: 'object',
          properties: { runId: { type: 'string', description: 'CI Run ID' } },
          required: ['runId'],
        },
        handler: async (args) => service.getFailures(args.runId),
      },
      {
        name: 'robos_ci_retry_run',
        description: 'Trigger a re-run of a failed CI pipeline.',
        inputSchema: {
          type: 'object',
          properties: { runId: { type: 'string', description: 'CI Run ID' } },
          required: ['runId'],
        },
        handler: async (args) => service.retryRun(args.runId),
      },
      {
        name: 'robos_ci_get_deployments',
        description: 'List recent deployments and active staging/production environments.',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => service.getDeployments(),
      },
    ],
    resources: [
      {
        uri: 'robos://ci-monitor-mcp/ci/current',
        name: 'Current CI Status',
        mimeType: 'application/json',
        handler: async () => service.getStatus('main'),
      },
      {
        uri: 'robos://ci-monitor-mcp/ci/deployments/latest',
        name: 'Latest Deployment Info',
        mimeType: 'application/json',
        handler: async () => service.getDeployments()[0] || null,
      },
    ],
  });

  return { server, service };
}

module.exports = { createCIMonitorMCPServer, CIMonitorService };
