'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execSync } = require('child_process');

const SETTINGS_FILE = path.join(os.homedir(), '.config', 'robos', 'settings.json');
const DEMOS_DIR = path.join(os.homedir(), '.config', 'robos', 'stage-demos');

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

function ensureDemosDir() {
  try { fs.mkdirSync(DEMOS_DIR, { recursive: true }); } catch {}
}

function loadDemos() {
  ensureDemosDir();
  try {
    const files = fs.readdirSync(DEMOS_DIR).filter(f => f.endsWith('.json'));
    return files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(DEMOS_DIR, f), 'utf8'));
      } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function saveDemo(demo) {
  ensureDemosDir();
  const file = path.join(DEMOS_DIR, `demo-${demo.id}.json`);
  fs.writeFileSync(file, JSON.stringify(demo, null, 2));
}

let win;
app.setName('stage-demo');
app.setPath('userData', path.join(process.env.HOME || '/home/robos', '.config', 'robos', 'electron', 'stage-demo'));
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  const w = require('electron').BrowserWindow.getAllWindows()[0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1200, height: 800,
    minWidth: 800, minHeight: 500,
    title: 'RobOS Stage Demo Viewer',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
  if (_debugServer) _debugServer.startDebugServer(win, 19131);
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

// ── IPC: list demos ──────────────────────────────────────────────────────

ipcMain.handle('list-demos', () => {
  return { ok: true, demos: loadDemos() };
});

// ── IPC: generate demo from a merged PR ──────────────────────────────────

ipcMain.handle('generate-demo', async (_, { repo, prNumber }) => {
  const server = getActiveServer();
  if (!server || server.type !== 'github') {
    return { ok: false, error: 'GitHub task server required' };
  }

  try {
    // Fetch the PR details
    const prCmd = `gh pr view --repo ${repo} ${prNumber} --json number,title,body,headRefName,baseRefName,additions,deletions,labels,author,mergedAt,url`;
    const prOut = execSync(prCmd, { encoding: 'utf8', timeout: 15000 });
    const pr = JSON.parse(prOut);

    // Fetch changed files
    let changedFiles = [];
    try {
      const diffCmd = `gh pr diff --repo ${repo} ${prNumber} --name-only`;
      changedFiles = execSync(diffCmd, { encoding: 'utf8', timeout: 15000 }).trim().split('\n').filter(Boolean);
    } catch {}

    // Generate demo walkthrough (would be AI-generated in production)
    const demo = {
      id: `${repo.replace('/', '-')}-${prNumber}-${Date.now()}`,
      repo,
      prNumber: pr.number,
      prTitle: pr.title,
      prBody: pr.body || '',
      author: pr.author?.login || 'unknown',
      branch: pr.headRefName,
      baseBranch: pr.baseRefName,
      additions: pr.additions || 0,
      deletions: pr.deletions || 0,
      labels: (pr.labels || []).map(l => typeof l === 'string' ? l : l.name),
      mergedAt: pr.mergedAt,
      url: pr.url,
      changedFiles,
      status: 'pending-review',
      generatedAt: new Date().toISOString(),
      walkthrough: generateWalkthrough(pr, changedFiles),
    };

    saveDemo(demo);
    return { ok: true, demo };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: fetch recent merged PRs to pick from ───────────────────────────

ipcMain.handle('fetch-merged-prs', async () => {
  const server = getActiveServer();
  if (!server || server.type !== 'github') {
    return { ok: false, error: 'GitHub task server required' };
  }

  try {
    const repos = getRepos(server);
    const allPRs = [];
    for (const r of repos) {
      const repo = `${r.org}/${r.repo}`;
      const cmd = `gh pr list --repo ${repo} --state merged --limit 20 --json number,title,author,mergedAt,headRefName,url`;
      const out = execSync(cmd, { encoding: 'utf8', timeout: 15000 });
      const prs = JSON.parse(out);
      allPRs.push(...prs.map(pr => ({
        repo,
        number: pr.number,
        title: pr.title,
        author: pr.author?.login || 'unknown',
        mergedAt: pr.mergedAt,
        branch: pr.headRefName,
        url: pr.url,
      })));
    }
    return { ok: true, prs: allPRs };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: update demo status (approve / reject) ──────────────────────────

ipcMain.handle('update-demo-status', (_, { demoId, status }) => {
  try {
    const demos = loadDemos();
    const demo = demos.find(d => d.id === demoId);
    if (!demo) return { ok: false, error: 'Demo not found' };
    demo.status = status;
    demo.reviewedAt = new Date().toISOString();
    saveDemo(demo);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('open-url', (_, url) => {
  if (url) shell.openExternal(url);
  return { ok: true };
});

function generateWalkthrough(pr, changedFiles) {
  const steps = [];
  const title = pr.title || 'Untitled change';
  const totalChanges = (pr.additions || 0) + (pr.deletions || 0);

  steps.push({
    title: 'What Changed',
    description: `PR "${title}" by ${pr.author?.login || 'unknown'}: ${totalChanges} lines across ${changedFiles.length} files.`,
  });

  if (pr.body) {
    steps.push({
      title: 'PR Description',
      description: pr.body.substring(0, 500),
    });
  }

  // Group changed files by type
  const groups = {};
  for (const f of changedFiles) {
    const parts = f.split('/');
    const category = parts.length > 1 ? parts[0] : 'root';
    if (!groups[category]) groups[category] = [];
    groups[category].push(f);
  }

  for (const [cat, files] of Object.entries(groups)) {
    steps.push({
      title: `Changes in ${cat}/`,
      description: files.slice(0, 10).join(', ') + (files.length > 10 ? ` and ${files.length - 10} more` : ''),
    });
  }

  steps.push({
    title: 'Verification',
    description: 'Review the changes above and verify they match the expected behavior. Approve or file bugs as needed.',
  });

  return steps;
}
