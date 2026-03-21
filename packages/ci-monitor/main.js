'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execSync } = require('child_process');

const SETTINGS_FILE = path.join(os.homedir(), '.config', 'robos', 'settings.json');

// Debug server (optional)
var _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { _debugServer = require(p); break; } catch {}
  }
} catch {}

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
  catch { return {}; }
}

function getActiveServer() {
  const s = readSettings();
  const servers = s.task_servers || [];
  if (!servers.length) return null;
  const activeId = s.active_task_server;
  return (activeId && servers.find(sv => sv.id === activeId)) || servers[0];
}

function getRepos(server) {
  if (!server) return [];
  if (server.repos && server.repos.length) return server.repos;
  if (server.gh_org && server.gh_repo) return [{ org: server.gh_org, repo: server.gh_repo }];
  return [];
}

let win;
app.setName('ci-monitor');
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1300, height: 850,
    minWidth: 800, minHeight: 500,
    title: 'RobOS CI Monitor',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
  if (_debugServer) _debugServer.startDebugServer(win, 19130);
});
app.on('window-all-closed', () => app.quit());

// ── IPC: config ───────────────────────────────────────────────────────────

ipcMain.handle('get-config', () => {
  const server = getActiveServer();
  if (!server) return { ok: false, error: 'No task server configured' };
  return {
    ok: true,
    server: {
      id: server.id,
      type: server.type,
      name: server.name,
      repos: getRepos(server),
    },
  };
});

// ── IPC: fetch workflow runs (GitHub Actions) ─────────────────────────────

ipcMain.handle('fetch-runs', async (_, { status } = {}) => {
  const server = getActiveServer();
  if (!server) return { ok: false, error: 'No task server configured' };

  if (server.type !== 'github') {
    return { ok: false, error: `CI Monitor requires a GitHub task server (got ${server.type})` };
  }

  try {
    const repos = getRepos(server);
    const allRuns = [];

    for (const r of repos) {
      const repo = `${r.org}/${r.repo}`;
      let cmd = `gh run list --repo ${repo} --limit 30 --json databaseId,name,displayTitle,headBranch,status,conclusion,event,createdAt,updatedAt,url,workflowName`;
      if (status && status !== 'all') cmd += ` --status ${status}`;
      const out = execSync(cmd, { encoding: 'utf8', timeout: 20000 });
      const runs = JSON.parse(out);
      allRuns.push(...runs.map(run => mapWorkflowRun(run, repo)));
    }

    return { ok: true, runs: allRuns };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: fetch run detail (jobs + logs) ──────────────────────────────────

ipcMain.handle('fetch-run-detail', async (_, { repo, runId }) => {
  try {
    // Fetch jobs
    const jobsCmd = `gh run view --repo ${repo} ${runId} --json jobs`;
    let jobs = [];
    try {
      const out = execSync(jobsCmd, { encoding: 'utf8', timeout: 15000 });
      const parsed = JSON.parse(out);
      jobs = (parsed.jobs || []).map(j => ({
        name: j.name,
        status: j.status,
        conclusion: j.conclusion,
        startedAt: j.startedAt,
        completedAt: j.completedAt,
        steps: (j.steps || []).map(s => ({
          name: s.name,
          status: s.status,
          conclusion: s.conclusion,
          number: s.number,
        })),
      }));
    } catch {}

    // Fetch failed log excerpt
    let failedLog = '';
    try {
      const logCmd = `gh run view --repo ${repo} ${runId} --log-failed 2>/dev/null | tail -80`;
      failedLog = execSync(logCmd, { encoding: 'utf8', timeout: 15000 });
    } catch {}

    return { ok: true, jobs, failedLog };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: AI auto-fix diagnosis ───────────────────────────────────────────

ipcMain.handle('ai-diagnose-failure', async (_, { repo, runId, failedLog, jobName }) => {
  // In production, this would call an LLM. Here we do structured heuristic analysis.
  const diagnosis = analyzeFailure(failedLog || '', jobName || '');
  return { ok: true, diagnosis };
});

// ── IPC: re-run workflow ─────────────────────────────────────────────────

ipcMain.handle('rerun-workflow', async (_, { repo, runId }) => {
  try {
    execSync(`gh run rerun --repo ${repo} ${runId}`, { encoding: 'utf8', timeout: 15000 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('open-url', (_, url) => {
  if (url) shell.openExternal(url);
  return { ok: true };
});

function mapWorkflowRun(raw, repo) {
  return {
    repo,
    id: raw.databaseId,
    name: raw.name || raw.displayTitle || 'Unnamed',
    displayTitle: raw.displayTitle || raw.name,
    workflowName: raw.workflowName || '',
    branch: raw.headBranch,
    status: raw.status,
    conclusion: raw.conclusion,
    event: raw.event,
    created: raw.createdAt,
    updated: raw.updatedAt,
    url: raw.url || '',
  };
}

function analyzeFailure(log, jobName) {
  const lines = log.split('\n');
  const findings = [];
  let category = 'unknown';

  // Detect test failures
  if (log.includes('FAIL') && (log.includes('test') || log.includes('Test') || log.includes('spec'))) {
    category = 'test-failure';
    findings.push({ type: 'error', text: 'Test failure detected. One or more test cases failed.' });
    const failLines = lines.filter(l => /FAIL|AssertionError|Expected|assert/i.test(l)).slice(0, 5);
    for (const fl of failLines) {
      findings.push({ type: 'detail', text: fl.trim() });
    }
  }
  // Detect lint errors
  else if (log.includes('lint') || log.includes('ESLint') || log.includes('warning') && log.includes('error')) {
    category = 'lint-error';
    findings.push({ type: 'error', text: 'Linting error detected.' });
  }
  // Detect type errors
  else if (log.includes('TypeError') || log.includes('type error') || log.includes('TS')) {
    category = 'type-error';
    findings.push({ type: 'error', text: 'Type error detected in compilation.' });
  }
  // Detect build failures
  else if (log.includes('build') && (log.includes('error') || log.includes('Error'))) {
    category = 'build-failure';
    findings.push({ type: 'error', text: 'Build failure detected.' });
  }
  // Generic failure
  else if (log.length > 0) {
    category = 'generic';
    findings.push({ type: 'error', text: 'CI failure detected. Review the log for details.' });
  } else {
    findings.push({ type: 'info', text: 'No failure log available. The run may still be in progress.' });
  }

  return {
    category,
    jobName,
    findings,
    canAutoFix: category === 'test-failure' || category === 'lint-error' || category === 'type-error',
    suggestedAction: category === 'test-failure' ? 'Review failing tests and update assertions or fix code.' :
                     category === 'lint-error' ? 'Run linter with --fix flag and commit changes.' :
                     category === 'type-error' ? 'Fix type errors in source code.' :
                     category === 'build-failure' ? 'Check build configuration and dependencies.' :
                     'Review the full log output for error details.',
  };
}
