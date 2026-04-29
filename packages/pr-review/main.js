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
app.setName('pr-review');
app.setPath('userData', path.join(process.env.HOME || '/home/robos', '.config', 'robos', 'electron', 'pr-review'));
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  const w = require('electron').BrowserWindow.getAllWindows()[0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1400, height: 900,
    minWidth: 900, minHeight: 600,
    title: 'RobOS PR Review Board',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
  if (_debugServer) _debugServer.startDebugServer(win, 19129);
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

// ── IPC: fetch PRs ────────────────────────────────────────────────────────

ipcMain.handle('fetch-prs', async (_, { state } = {}) => {
  const server = getActiveServer();
  if (!server) return { ok: false, error: 'No task server configured' };

  if (server.type !== 'github') {
    return { ok: false, error: `PR review requires a GitHub task server (got ${server.type})` };
  }

  try {
    const repos = getRepos(server);
    const allPRs = [];

    for (const r of repos) {
      const repo = `${r.org}/${r.repo}`;
      const stateFlag = state || 'open';
      const cmd = `gh pr list --repo ${repo} --state ${stateFlag} --limit 50 --json number,title,state,author,reviewRequests,statusCheckRollup,createdAt,updatedAt,headRefName,baseRefName,additions,deletions,url,isDraft,mergeable,body,labels,comments,reviewDecision`;
      const out = execSync(cmd, { encoding: 'utf8', timeout: 20000 });
      const prs = JSON.parse(out);
      allPRs.push(...prs.map(pr => mapGitHubPR(pr, repo)));
    }

    return { ok: true, prs: allPRs };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: fetch PR details (diff, checks, comments) ───────────────────────

ipcMain.handle('fetch-pr-detail', async (_, { repo, number }) => {
  try {
    // Fetch diff stats
    const diffCmd = `gh pr diff --repo ${repo} ${number} --name-only`;
    let changedFiles = [];
    try {
      changedFiles = execSync(diffCmd, { encoding: 'utf8', timeout: 15000 }).trim().split('\n').filter(Boolean);
    } catch {}

    // Fetch checks
    const checksCmd = `gh pr checks --repo ${repo} ${number} --json name,state,description,startedAt,completedAt,detailsUrl 2>/dev/null || echo "[]"`;
    let checks = [];
    try {
      const checksOut = execSync(checksCmd, { encoding: 'utf8', timeout: 15000 });
      checks = JSON.parse(checksOut);
    } catch {}

    // Fetch review comments
    const commentsCmd = `gh pr view --repo ${repo} ${number} --json reviews,comments`;
    let reviews = [], comments = [];
    try {
      const commentsOut = execSync(commentsCmd, { encoding: 'utf8', timeout: 15000 });
      const parsed = JSON.parse(commentsOut);
      reviews = parsed.reviews || [];
      comments = parsed.comments || [];
    } catch {}

    return { ok: true, changedFiles, checks, reviews, comments };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: PR review actions ────────────────────────────────────────────────

ipcMain.handle('submit-review', async (_, { repo, number, action, body }) => {
  try {
    const flag = action === 'approve' ? '--approve' :
                 action === 'request-changes' ? '--request-changes' : '--comment';
    let cmd = `gh pr review --repo ${repo} ${number} ${flag}`;
    if (body) cmd += ` --body "${body.replace(/"/g, '\\"')}"`;
    execSync(cmd, { encoding: 'utf8', timeout: 15000 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: AI review summary (generates mock AI analysis) ──────────────────

ipcMain.handle('ai-review-summary', async (_, { repo, number, title, body, additions, deletions, changedFiles }) => {
  // In a full implementation, this would call an LLM. For now, generate structured analysis.
  const totalChanges = (additions || 0) + (deletions || 0);
  const risk = totalChanges > 500 ? 'high' : totalChanges > 100 ? 'medium' : 'low';

  const fileTypes = {};
  for (const f of (changedFiles || [])) {
    const ext = f.split('.').pop() || 'other';
    fileTypes[ext] = (fileTypes[ext] || 0) + 1;
  }

  const findings = [];
  if (totalChanges > 500) findings.push({ type: 'warning', text: `Large PR with ${totalChanges} lines changed. Consider breaking into smaller PRs.` });
  if ((deletions || 0) > (additions || 0) * 2) findings.push({ type: 'info', text: 'This PR removes significantly more code than it adds — good cleanup.' });
  if (fileTypes['test'] || fileTypes['spec']) findings.push({ type: 'success', text: 'Test files included in changes.' });
  else if (totalChanges > 50) findings.push({ type: 'warning', text: 'No test files detected in changes. Consider adding tests.' });
  if (fileTypes['lock'] || fileTypes['json']) findings.push({ type: 'info', text: 'Dependency/config files modified.' });

  return {
    ok: true,
    summary: {
      title: title || 'Untitled PR',
      description: body ? body.substring(0, 300) : 'No description provided.',
      risk,
      totalChanges,
      fileCount: (changedFiles || []).length,
      fileTypes,
      findings,
    },
  };
});

// ── IPC: interactive review (breakpoint debugging) ───────────────────────

ipcMain.handle('interactive-review', async (_, { repo, number }) => {
  // This is a placeholder for IDE integration — would open workspace in debug mode
  return {
    ok: true,
    message: `Interactive review initiated for ${repo}#${number}. IDE workspace will open with breakpoints at change sites.`,
    steps: [
      'Checking out PR branch...',
      'Generating end-to-end test for changed code...',
      'Setting breakpoints at change sites...',
      'Launching debug session...',
    ],
  };
});

ipcMain.handle('open-url', (_, url) => {
  if (url) shell.openExternal(url);
  return { ok: true };
});

function mapGitHubPR(raw, repo) {
  const ciStatus = getCIStatus(raw.statusCheckRollup);
  const labels = (raw.labels || []).map(l => typeof l === 'string' ? l : l.name);
  return {
    repo,
    number: raw.number,
    title: raw.title,
    state: raw.state,
    author: raw.author?.login || 'unknown',
    reviewers: (raw.reviewRequests || []).map(r => r.login || r.name || 'team').filter(Boolean),
    reviewDecision: raw.reviewDecision || null,
    ciStatus,
    isDraft: raw.isDraft || false,
    mergeable: raw.mergeable || 'UNKNOWN',
    headBranch: raw.headRefName,
    baseBranch: raw.baseRefName,
    additions: raw.additions || 0,
    deletions: raw.deletions || 0,
    body: raw.body || '',
    labels,
    commentCount: (raw.comments || []).length,
    created: raw.createdAt,
    updated: raw.updatedAt,
    url: raw.url || `https://github.com/${repo}/pull/${raw.number}`,
  };
}

function getCIStatus(rollup) {
  if (!rollup || !rollup.length) return 'pending';
  const states = rollup.map(c => (c.state || c.conclusion || '').toUpperCase());
  if (states.some(s => s === 'FAILURE' || s === 'ERROR')) return 'failure';
  if (states.every(s => s === 'SUCCESS' || s === 'NEUTRAL' || s === 'SKIPPED')) return 'success';
  return 'pending';
}
