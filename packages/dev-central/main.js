'use strict';
const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');
const net  = require('net');

const HOME_DIR      = process.env.HOME || os.homedir();
const CONFIG_DIR    = path.join(HOME_DIR, '.config', 'robos');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
const NOTIF_FILE    = path.join(CONFIG_DIR, 'notifications.json');
const PREFS_FILE    = path.join(CONFIG_DIR, 'notification-prefs.json');
const FEATURE_FILE  = path.join(CONFIG_DIR, 'dev-central-feature.json');

app.setPath('userData', path.join(CONFIG_DIR, 'electron', 'dev-central'));

const { fetchList } = require('./live-data');
const { combineFeatures, assignFeature } = require('./feature-workflow');
const workTask = require('../robos-agent-client/work-task/core');
const isDemoMode = process.env.ROBOS_DEMO_DATA === '1';
const isTestMode = !!(process.env.ROBOS_TEST || process.env.ROBOS_DEMO_SHOW);
if (!isTestMode) {
  const lock = app.requestSingleInstanceLock();
  if (!lock) { app.quit(); process.exit(0); }
}

app.setName('dev-central');
app.isQuitting = false;

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

function activeTS(settings) {
  const id = settings.active_task_server;
  return (settings.task_servers || []).find(ts => ts.id === id)
      || (settings.task_servers || [])[0]
      || {};
}

function ghSync(args, timeoutMs = 15000) {
  const r = cp.spawnSync('gh', args, { encoding: 'utf8', timeout: timeoutMs });
  if (r.status === 0) return { ok: true, data: r.stdout.trim() };
  return { ok: false, error: (r.stderr || 'gh failed').trim() };
}

// ── Absorbed Notifications Storage & Preferences ────────────────────────────

function loadNotifications() {
  try {
    if (fs.existsSync(NOTIF_FILE)) return JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8'));
  } catch {}
  return [];
}

function saveNotifications(data) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(NOTIF_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadPrefs() {
  try {
    if (fs.existsSync(PREFS_FILE)) return JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
  } catch {}
  return {
    categoryOverrides: {},
    quietHours: { enabled: false, start: '22:00', end: '07:00' },
    dnd: false,
  };
}

function savePrefs(prefs) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2), 'utf8');
}

function getUnreadCount() {
  const data = loadNotifications();
  return data.filter(n => !n.read).length;
}

function getUnreadByCategory() {
  const data = loadNotifications();
  const counts = { pr_review: 0, ci_cd: 0, task: 0, agent: 0, system: 0 };
  data.forEach(n => {
    if (!n.read) {
      const cat = n.category || 'system';
      counts[cat] = (counts[cat] || 0) + 1;
    }
  });
  return counts;
}

function sendDesktopToast(title, body, category = 'task', tier = 'info') {
  // Check DND / Quiet Hours
  const prefs = loadPrefs();
  if (prefs.dnd && tier !== 'critical') return;

  const sockPath = process.env.ROBOS_DM_SOCKET || (process.env.XDG_RUNTIME_DIR ? path.join(process.env.XDG_RUNTIME_DIR, 'robos-dm.sock') : `/tmp/robos-dm-${process.getuid ? process.getuid() : 1000}.sock`);
  // Use one desktop transport.
  if(!fs.existsSync(sockPath))try {
    const iconName = tier === 'critical' ? 'dialog-error' : tier === 'warning' ? 'dialog-warning' : 'dialog-information';
    cp.spawn('notify-send', ['-a', 'Dev Central', '-t', '6000', '-i', iconName, title, body], { stdio: 'ignore' }).unref();
  } catch {}

  // 2. Desktop Manager socket
  try {
    const sockPath = process.env.ROBOS_DM_SOCKET || (process.env.XDG_RUNTIME_DIR ? path.join(process.env.XDG_RUNTIME_DIR, 'robos-dm.sock') : `/tmp/robos-dm-${process.getuid ? process.getuid() : 1000}.sock`);
    if (fs.existsSync(sockPath)) {
      const client = net.connect(sockPath, () => {
        client.write(JSON.stringify({ notify: { title, body, category, tier } }));
        client.end();
      });
      client.on('error', () => {});
    }
  } catch {}
}

// ── Active RobOS Feature Management & Lifetime Ticket State History ─────────

function getSeedFeatures() {
  return [
    {
      id: 'FEAT-201',
      code: 'FEAT-201',
      name: 'Multi-Step Dynamic Form Submission with TypeSpec Validation',
      status: 'IN_PROGRESS',
      targetService: 'forms-api',
      repository: 'acme-corp/buildbarn-forms',
      description: 'Enables declarative schema generation, AST validation, and multi-step form progress saving with 1080p video proof-of-work in ephemeral sandboxes.',
      createdAt: '2026-09-10T09:00:00Z',
      active: true,
      tasks: [
        {
          id: 'TASK-201',
          number: 201,
          title: 'Multi-Step Dynamic Form Submission with TypeSpec Validation',
          status: 'IN_PROGRESS',
          priority: 'P0',
          assignee: 'Dev User',
          description: 'Implement client-side TypeSpec schema validation, multi-page step wizard state machine, and JSON-LD contract emission for forms-api.',
          taskServerUrl: 'https://github.com/acme-corp/buildbarn-forms/issues/201',
          pr: {
            number: 84,
            title: 'feat(forms-api): Multi-step dynamic form validation & AST generation',
            url: 'https://github.com/acme-corp/buildbarn-forms/pull/84',
            branch: 'feature/TASK-201-multi-step',
            ci: 'pass',
            review: 'approved',
          },
          lifetimeHistory: [
            { timestamp: '2026-09-10T09:00:00Z', state: 'CREATED', actor: 'sarah-lead', note: 'Issue created in backlog with TypeSpec requirement specifications' },
            { timestamp: '2026-09-11T10:15:00Z', state: 'TRIAGED', actor: 'alex-architect', note: 'Triaged for Sprint 42, assigned priority P0' },
            { timestamp: '2026-09-12T14:30:00Z', state: 'IN_PROGRESS', actor: 'dev-user', note: 'Branch checked out: feature/TASK-201-multi-step in ephemeral sandbox' },
            { timestamp: '2026-09-13T16:45:00Z', state: 'PR_OPENED', actor: 'antigravity-agent', note: 'PR #84 opened targeting main with automated diffs' },
            { timestamp: '2026-09-14T08:20:00Z', state: 'CI_PASSED', actor: 'github-actions', note: 'Automated test suite, Pact contracts, and SHACL shape validator 100% green' },
            { timestamp: '2026-09-14T11:00:00Z', state: 'REVIEW_APPROVED', actor: 'sarah-lead', note: 'Approved with proof-of-work 1080p video review walkthrough' },
          ],
        },
        {
          id: 'TASK-198',
          number: 198,
          title: 'Kafka Event Stream Deduplication Filter & Idempotent Publisher',
          status: 'REVIEW',
          priority: 'P1',
          assignee: 'Dev User',
          description: 'Add in-memory SHA-256 deduplication cache and idempotent partition publishing to prevent duplicate events during rebalances.',
          taskServerUrl: 'https://github.com/acme-corp/buildbarn-forms/issues/198',
          pr: {
            number: 82,
            title: 'feat(event-stream): Kafka idempotent producer & dedup cache',
            url: 'https://github.com/acme-corp/buildbarn-forms/pull/82',
            branch: 'feature/TASK-198-kafka-dedup',
            ci: 'pass',
            review: 'changes',
          },
          lifetimeHistory: [
            { timestamp: '2026-09-08T11:00:00Z', state: 'CREATED', actor: 'dave-k', note: 'Ticket created for Kafka duplicate message mitigation' },
            { timestamp: '2026-09-09T13:00:00Z', state: 'IN_PROGRESS', actor: 'dev-user', note: 'Implemented dedup filter with LRU cache' },
            { timestamp: '2026-09-11T15:00:00Z', state: 'PR_OPENED', actor: 'dev-user', note: 'PR #82 opened targeting main' },
            { timestamp: '2026-09-14T12:00:00Z', state: 'CHANGES_REQUESTED', actor: 'dave-k', note: 'Requested 3-year rabies booster exemption check' },
          ],
        },
        {
          id: 'TASK-204',
          number: 204,
          title: 'Fix Session Memory Leak in Ephemeral Agent Sandboxes',
          status: 'TODO',
          priority: 'P0',
          assignee: 'Dev User',
          description: 'Tmpfs mounts in virtual framebuffers are leaking memory across agent sessions.',
          taskServerUrl: 'https://github.com/acme-corp/buildbarn-forms/issues/204',
          pr: {
            number: 85,
            title: 'fix(sandbox): Session memory leak in tmpfs mount cleanup',
            url: 'https://github.com/acme-corp/buildbarn-forms/pull/85',
            branch: 'fix/TASK-204-sandbox-cleanup',
            ci: 'fail',
            review: 'pending',
          },
          lifetimeHistory: [
            { timestamp: '2026-09-10T14:00:00Z', state: 'CREATED', actor: 'system-monitor', note: 'Bug reported: OOM kill on worker sandbox 4' },
            { timestamp: '2026-09-12T09:00:00Z', state: 'TODO', actor: 'alex-architect', note: 'Flagged as P0 active blocker on sprint board' },
            { timestamp: '2026-09-14T10:00:00Z', state: 'CI_FAILED', actor: 'github-actions', note: 'PR #85 CI failed on cleanup daemon test' },
          ],
        },
        {
          id: 'TASK-184',
          number: 184,
          title: 'OpenAPI 3.1 Contract Linting with Spectral Rulesets',
          status: 'DONE',
          priority: 'P2',
          assignee: 'Dev User',
          description: 'Automated Spectral ruleset check for all REST contracts.',
          taskServerUrl: 'https://github.com/acme-corp/buildbarn-forms/issues/184',
          pr: {
            number: 80,
            title: 'refactor(schema): Spectral OAS 3.1 ruleset enforcement & verification',
            url: 'https://github.com/acme-corp/buildbarn-forms/pull/80',
            branch: 'refactor/TASK-184-spectral',
            ci: 'pass',
            review: 'approved',
            merged: true,
          },
          lifetimeHistory: [
            { timestamp: '2026-09-05T08:00:00Z', state: 'CREATED', actor: 'sarah-lead', note: 'OAS 3.1 ruleset task logged' },
            { timestamp: '2026-09-06T10:00:00Z', state: 'IN_PROGRESS', actor: 'dev-user', note: 'Spectral rules configured' },
            { timestamp: '2026-09-07T14:00:00Z', state: 'DONE', actor: 'dev-user', note: 'Merged into main (Production Reality)' },
          ],
        },
      ],
    },
    {
      id: 'FEAT-101',
      code: 'FEAT-101',
      name: 'Unified Notification Hub & Dev Central Cockpit',
      status: 'PLANNING',
      targetService: 'dev-central',
      repository: 'ndipiazza/robos',
      description: 'Absorbs notifications into Dev Central, adds BitTorrent-style persistent tray running, and live task lifetime tracking.',
      createdAt: '2026-09-14T08:00:00Z',
      active: false,
      tasks: [
        {
          id: 'TASK-101',
          number: 101,
          title: 'Absorb Notifications in Dev Central & Background Tray',
          status: 'IN_PROGRESS',
          priority: 'P0',
          assignee: 'Antigravity',
          description: 'Implement persistent tray and background sync for assigned tasks.',
          taskServerUrl: 'https://github.com/ndipiazza/robos/issues/101',
          pr: {
            number: 99,
            title: 'feat(dev-central): Absorb notifications and active feature tracker',
            url: 'https://github.com/ndipiazza/robos/pull/99',
            branch: 'feature/absorb-notifications',
            ci: 'pass',
            review: 'pending',
          },
          lifetimeHistory: [
            { timestamp: '2026-09-14T08:00:00Z', state: 'CREATED', actor: 'lead-architect', note: 'Architecture spec approved' },
            { timestamp: '2026-09-14T09:30:00Z', state: 'IN_PROGRESS', actor: 'antigravity-agent', note: 'Branch checked out' },
          ],
        },
      ],
    },
    {
      id: 'PET-FEAT-01',
      code: 'PET-FEAT-01',
      name: 'Rabies Verification System & Veterinary OCR',
      status: 'PLANNING',
      targetService: 'petshop-api',
      repository: 'acme/petshop-api',
      description: 'Veterinary certificate upload, OCR extraction, and 3-year booster exemption logic.',
      createdAt: '2026-09-01T12:00:00Z',
      active: false,
      tasks: [],
    },
  ];
}

function loadFeatures() {
  try {
    if (fs.existsSync(FEATURE_FILE)) {
      const data = JSON.parse(fs.readFileSync(FEATURE_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch {}
  return isDemoMode ? getSeedFeatures() : [];
}

function saveFeatures(features) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(FEATURE_FILE, JSON.stringify(features, null, 2), 'utf8');
}

function getActiveFeature() {
  const feats = loadFeatures();
  return feats.find(f => f.active) || feats.find(f => f.status === 'IN_PROGRESS') || feats[0];
}

function setActiveFeatureId(featureId) {
  const feats = loadFeatures();
  feats.forEach(f => {
    f.active = (f.id === featureId);
    if (f.active) f.status = 'IN_PROGRESS';
  });
  saveFeatures(feats);
  return feats;
}

function updateFeatureStatus(featureId, status) {
  const feats = loadFeatures();
  const f = feats.find(x => x.id === featureId);
  if (f) {
    f.status = status;
    saveFeatures(feats);
  }
  return feats;
}

function getTaskLifetimeHistory(taskId) {
  const feats = loadFeatures();
  for (const f of feats) {
    const task = (f.tasks || []).find(t => t.id === taskId || String(t.number) === String(taskId));
    if (task) {
      return { ok: true, task, history: task.lifetimeHistory || [] };
    }
  }
  return { ok: false, error: 'Task not found', history: [] };
}

// ── Sample Data Generators ───────────────────────────────────────────────────

function getSampleIssues() {
  const now = Date.now();
  return [
    {
      number: 201,
      title: 'Multi-Step Dynamic Form Submission with TypeSpec Validation',
      state: 'OPEN',
      labels: [{ name: 'state:in_progress' }, { name: 'priority:P0' }, { name: 'sprint:42' }, { name: 'service:forms-api' }],
      updatedAt: new Date(now - 15 * 60000).toISOString(),
      url: 'https://github.com/acme-corp/buildbarn-forms/issues/201',
    },
    {
      number: 198,
      title: 'Kafka Event Stream Deduplication Filter & Idempotent Publisher',
      state: 'OPEN',
      labels: [{ name: 'state:review' }, { name: 'priority:P1' }, { name: 'sprint:42' }, { name: 'service:event-stream' }],
      updatedAt: new Date(now - 2 * 3600000).toISOString(),
      url: 'https://github.com/acme-corp/buildbarn-forms/issues/198',
    },
    {
      number: 204,
      title: 'Fix Session Memory Leak in Ephemeral Agent Sandboxes',
      state: 'OPEN',
      labels: [{ name: 'state:open' }, { name: 'priority:P0' }, { name: 'bug' }, { name: 'sprint:42' }],
      updatedAt: new Date(now - 4 * 86400000).toISOString(),
      url: 'https://github.com/acme-corp/buildbarn-forms/issues/204',
    },
    {
      number: 184,
      title: 'OpenAPI 3.1 Contract Linting with Spectral Rulesets',
      state: 'DONE',
      labels: [{ name: 'state:done' }, { name: 'priority:P2' }, { name: 'sprint:42' }, { name: 'service:schema-studio' }],
      updatedAt: new Date(now - 24 * 3600000).toISOString(),
      url: 'https://github.com/acme-corp/buildbarn-forms/issues/184',
    },
    {
      number: 210,
      title: 'PostgreSQL Partition Pruning Optimization for Audit Logs',
      state: 'OPEN',
      labels: [{ name: 'state:open' }, { name: 'priority:P2' }, { name: 'sprint:42' }, { name: 'service:db-manager' }],
      updatedAt: new Date(now - 4 * 3600000).toISOString(),
      url: 'https://github.com/acme-corp/buildbarn-forms/issues/210',
    },
    {
      number: 177,
      title: 'W3C SHACL Shape Conformance Validator Gate for Microservices',
      state: 'DONE',
      labels: [{ name: 'state:done' }, { name: 'priority:P1' }, { name: 'sprint:41' }],
      updatedAt: new Date(now - 2 * 86400000).toISOString(),
      url: 'https://github.com/acme-corp/buildbarn-forms/issues/177',
    },
  ];
}

function getSamplePRs() {
  const now = Date.now();
  return [
    {
      number: 84,
      title: 'feat(forms-api): Multi-step dynamic form validation & AST generation',
      state: 'OPEN',
      headRefName: 'feature/TASK-201-multi-step',
      statusCheckRollup: [{ conclusion: 'SUCCESS' }],
      reviewDecision: 'APPROVED',
      updatedAt: new Date(now - 25 * 60000).toISOString(),
      additions: 240,
      deletions: 18,
      url: 'https://github.com/acme-corp/buildbarn-forms/pull/84',
    },
    {
      number: 82,
      title: 'feat(event-stream): Kafka idempotent producer & dedup cache',
      state: 'OPEN',
      headRefName: 'feature/TASK-198-kafka-dedup',
      statusCheckRollup: [{ conclusion: 'SUCCESS' }],
      reviewDecision: 'CHANGES_REQUESTED',
      updatedAt: new Date(now - 3 * 3600000).toISOString(),
      additions: 184,
      deletions: 42,
      url: 'https://github.com/acme-corp/buildbarn-forms/pull/82',
    },
    {
      number: 85,
      title: 'fix(sandbox): Session memory leak in tmpfs mount cleanup',
      state: 'OPEN',
      headRefName: 'fix/TASK-204-sandbox-cleanup',
      statusCheckRollup: [{ conclusion: 'FAILURE' }],
      reviewDecision: null,
      updatedAt: new Date(now - 4 * 3600000).toISOString(),
      additions: 56,
      deletions: 12,
      url: 'https://github.com/acme-corp/buildbarn-forms/pull/85',
    },
    {
      number: 80,
      title: 'refactor(schema): Spectral OAS 3.1 ruleset enforcement & verification',
      state: 'MERGED',
      headRefName: 'refactor/TASK-184-spectral',
      statusCheckRollup: [{ conclusion: 'SUCCESS' }],
      reviewDecision: 'APPROVED',
      updatedAt: new Date(now - 24 * 3600000).toISOString(),
      additions: 110,
      deletions: 94,
      url: 'https://github.com/acme-corp/buildbarn-forms/pull/80',
    },
  ];
}

function getSampleReviewRequests() {
  const now = Date.now();
  return [
    {
      number: 89,
      title: 'feat(kube-studio): ArgoCD GitOps sync status indicator & logs streaming',
      state: 'OPEN',
      author: { login: 'sarah-lead' },
      updatedAt: new Date(now - 14 * 3600000).toISOString(),
      url: 'https://github.com/acme-corp/buildbarn-forms/pull/89',
    },
    {
      number: 87,
      title: 'feat(pr-review): IntelliJ IDEA IPC review bridge on port 63343',
      state: 'OPEN',
      author: { login: 'alex-architect' },
      updatedAt: new Date(now - 26 * 3600000).toISOString(),
      url: 'https://github.com/acme-corp/buildbarn-forms/pull/87',
    },
  ];
}

function getSampleActivity() {
  const now = Date.now();
  return [
    { timestamp: now - 10 * 60000, title: 'W3C SHACL shape validation gate passed (0 violations)', type: 'shacl-conformance' },
    { timestamp: now - 35 * 60000, title: 'Agent Antigravity created PR #84 (feature/TASK-201-multi-step)', type: 'agent-pr' },
    { timestamp: now - 75 * 60000, title: 'Pact consumer contract tests verified against forms-api v1', type: 'pact-verified' },
    { timestamp: now - 180 * 60000, title: 'IntelliJ IDEA IPC bridge connected on port 63343', type: 'ide-bridge' },
    { timestamp: now - 360 * 60000, title: 'Autonomous Red-Green-Refactor test cycle completed (100% green)', type: 'test-pass' },
    { timestamp: now - 720 * 60000, title: 'Branch promoted to main (Production Reality)', type: 'git-merge' },
  ];
}

// ── Tray & Window Management ────────────────────────────────────────────────

let win  = null;
let tray = null;

function showWindow(targetTab = null) {
  if (!win) {
    createWindow();
  } else {
    if (!win.isVisible()) win.show();
    if (win.isMinimized()) win.restore();
    win.focus();
  }
  if (targetTab && win && win.webContents) {
    win.webContents.send('dc-switch-tab', targetTab);
  }
}

function updateTrayAndIcon() {
  const unread = getUnreadCount();
  const hasUnread = unread > 0;
  const normalTray = path.join(__dirname, 'tray-icon.png');
  const notifTray  = path.join(__dirname, 'tray-icon-notification.png');
  const normalApp  = path.join(__dirname, 'icon.png');
  const notifApp   = path.join(__dirname, 'icon-notification.png');

  if (tray) {
    try {
      const trayPath = (hasUnread && fs.existsSync(notifTray)) ? notifTray : normalTray;
      if (fs.existsSync(trayPath)) {
        tray.setImage(nativeImage.createFromPath(trayPath));
      }
      tray.setToolTip(hasUnread
        ? `RobOS Dev Central — ${unread} unread notification${unread === 1 ? '' : 's'}`
        : 'RobOS Dev Central');

      const activeFeature = getActiveFeature();
      const featureTitle = activeFeature ? `${activeFeature.code}: ${activeFeature.name}` : 'None';

      const menu = Menu.buildFromTemplate([
        { label: 'Open Dev Central', click: () => showWindow() },
        { label: `Notifications (${unread} unread)`, click: () => showWindow('notifications') },
        { label: `Active Feature: ${featureTitle}`, click: () => showWindow('feature') },
        { type: 'separator' },
        { label: 'Sync Dashboard Now', click: () => triggerSync() },
        { type: 'separator' },
        { label: 'Quit Dev Central', click: () => { app.isQuitting = true; app.quit(); } },
      ]);
      tray.setContextMenu(menu);
    } catch (e) {
      console.error('[dev-central] tray update failed:', e.message);
    }
  }

  if (win) {
    try {
      const appIcon = (hasUnread && fs.existsSync(notifApp)) ? notifApp : normalApp;
      if (fs.existsSync(appIcon)) {
        win.setIcon(nativeImage.createFromPath(appIcon));
      }
    } catch {}
  }
}

function createTray() {
  if (tray) return;
  const normalTray = path.join(__dirname, 'tray-icon.png');
  if (fs.existsSync(normalTray)) {
    try {
      tray = new Tray(nativeImage.createFromPath(normalTray));
      tray.on('click', () => {
        if (win && win.isVisible()) win.hide();
        else showWindow();
      });
      tray.on('double-click', () => showWindow());
      updateTrayAndIcon();
    } catch (e) {
      console.error('[dev-central] tray create error:', e.message);
    }
  }
}

function createWindow() {
  const initialIcon = path.join(__dirname, getUnreadCount() > 0 ? 'icon-notification.png' : 'icon.png');

  win = new BrowserWindow({
    width: 1200, height: 820,
    minWidth: 900, minHeight: 600,
    backgroundColor: '#0d1117',
    icon: fs.existsSync(initialIcon) ? initialIcon : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Dev Central',
    autoHideMenuBar: true,
  });

  // BitTorrent behavior: close button hides window into tray and stays running
  win.on('close', (event) => {
    if (!app.isQuitting && process.env.ROBOS_TEST_QUIT !== '1') {
      event.preventDefault();
      win.hide();
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });

  win.webContents.once('did-finish-load', () => {
    // Check CLI switches for initial tab
    const argv = process.argv;
    if (argv.includes('--notifications') || argv.includes('--tab=notifications')) {
      win.webContents.send('dc-switch-tab', 'notifications');
    } else if (argv.includes('--feature') || argv.includes('--tab=feature')) {
      win.webContents.send('dc-switch-tab', 'feature');
    }
    updateTrayAndIcon();
  });

  if (_debugServer) _debugServer.startDebugServer(win, 19133);
}

app.on('second-instance', (_, commandLine) => {
  showWindow();
  if (commandLine.includes('--notifications') || commandLine.includes('--tab=notifications')) {
    if (win && win.webContents) win.webContents.send('dc-switch-tab', 'notifications');
  } else if (commandLine.includes('--feature') || commandLine.includes('--tab=feature')) {
    if (win && win.webContents) win.webContents.send('dc-switch-tab', 'feature');
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.whenReady().then(() => {
  createTray();
  createWindow();
  startBackgroundMonitor();
});

app.on('window-all-closed', () => {
  // If quitting or in test quit mode, quit
  if (app.isQuitting || process.env.ROBOS_TEST_QUIT === '1') {
    app.quit();
  }
});

// ── Background Polling & Traffic Detection Engine ───────────────────────────

let previousPRSnapshot   = new Map();
let previousTaskSnapshot = new Map();
let backgroundSyncTimer  = null;

let issueScope = 'all';
async function readList(kind) {
  if (isDemoMode) return { ok: true, data: ({ issues: getSampleIssues, prs: getSamplePRs, reviews: getSampleReviewRequests })[kind]() };
  return fetchList(activeTS(readSettings()), kind, undefined, issueScope);
}

function readActivity() {
  const eventsFile = path.join(CONFIG_DIR, 'journal-events.json');
  try {
    const events = JSON.parse(fs.readFileSync(eventsFile, 'utf8'));
    if (Array.isArray(events)) return { ok: true, data: events.slice(0, 20) };
    return { ok: false, data: [], error: 'Invalid activity log' };
  } catch (e) {
    if (e.code !== 'ENOENT') return { ok: false, data: [], error: 'Could not read activity log' };
  }
  return { ok: true, data: isDemoMode ? getSampleActivity() : [] };
}

async function featureChoices() {
  const saved = loadFeatures();
  if (isDemoMode) return { ok: true, data: saved, activeFeature: getActiveFeature() };
  try {
    const data = await require('./task-board').fetchBoard(activeTS(readSettings()));
    return { ok:true, data, activeFeature:data.find(f=>f.assigned) || null };
  } catch(error) { return {ok:false, error:error.message, data:[], activeFeature:null}; }
}

async function fetchLatestData() {
  const [issues, prs, reviews] = await Promise.all(['issues', 'prs', 'reviews'].map(readList));
  const activity = readActivity();
  return { issues: issues.data, prs: prs.data, reviews: reviews.data, activity: activity.data,
    errors: Object.fromEntries(Object.entries({ issues, prs, reviews, activity }).filter(([, r]) => !r.ok).map(([key, r]) => [key, r.error])),
    features: (await featureChoices()).data };
}

function checkTrafficAndNotify(prs, issues) {
  let trafficDetected = false;

  // 1. Check PR changes
  for (const pr of prs) {
    const prev = previousPRSnapshot.get(pr.url || pr.number);
    if (prev) {
      // Check CI Failure transition
      const curCI = (pr.statusCheckRollup || [])[0]?.conclusion;
      const prevCI = (prev.statusCheckRollup || [])[0]?.conclusion;
      if (curCI === 'FAILURE' && prevCI !== 'FAILURE') {
        dispatchTrafficNotification({
          title: `PR #${pr.number} CI Failed`,
          body: `Continuous integration checks failed on "${pr.title}". Check workflow logs.`,
          category: 'ci_cd',
          tier: 'critical',
          action: { type: 'open-url', url: pr.url },
          revision: pr.updatedAt || JSON.stringify([pr.reviewDecision,pr.statusCheckRollup]),
        });
        trafficDetected = true;
      }

      // Check PR Approved transition
      if (pr.reviewDecision === 'APPROVED' && prev.reviewDecision !== 'APPROVED') {
        dispatchTrafficNotification({
          title: `PR #${pr.number} Approved!`,
          body: `Your pull request "${pr.title}" was approved and is ready to merge into main.`,
          category: 'pr_review',
          tier: 'info',
          action: { type: 'open-url', url: pr.url },
          revision: pr.updatedAt || JSON.stringify([pr.reviewDecision,pr.statusCheckRollup]),
        });
        trafficDetected = true;
      }

      // Check PR Changes Requested transition
      if (pr.reviewDecision === 'CHANGES_REQUESTED' && prev.reviewDecision !== 'CHANGES_REQUESTED') {
        dispatchTrafficNotification({
          title: `Changes Requested on PR #${pr.number}`,
          body: `Reviewer requested code changes on "${pr.title}". Review inline comments.`,
          category: 'pr_review',
          tier: 'warning',
          action: { type: 'open-url', url: pr.url },
          revision: pr.updatedAt || JSON.stringify([pr.reviewDecision,pr.statusCheckRollup]),
        });
        trafficDetected = true;
      }

      // Check Comment traffic (updatedAt changed while state open)
      if (pr.updatedAt && prev.updatedAt && Date.parse(pr.updatedAt) > Date.parse(prev.updatedAt) && pr.state === 'OPEN') {
        dispatchTrafficNotification({
          title: `PR Updated #${pr.number}`,
          body: `Changes recorded on "${pr.title}".`,
          category: 'pr_review',
          tier: 'info',
          action: { type: 'open-url', url: pr.url },
          revision: pr.updatedAt || JSON.stringify([pr.reviewDecision,pr.statusCheckRollup]),
        });
        trafficDetected = true;
      }
    }
    previousPRSnapshot.set(pr.url || pr.number, pr);
  }

  // 2. Check Issue / Task changes
  for (const issue of issues) {
    const prev = previousTaskSnapshot.get(issue.url || issue.number);
    if (prev) {
      if (issue.updatedAt && prev.updatedAt && Date.parse(issue.updatedAt) > Date.parse(prev.updatedAt)) {
        dispatchTrafficNotification({
          title: `Task #${issue.number} Updated`,
          body: `Updates recorded on task "${issue.title}".`,
          category: 'task',
          tier: 'info',
          action: { type: 'open-url', url: issue.url },
          revision: issue.updatedAt,
        });
        trafficDetected = true;
      }
    }
    previousTaskSnapshot.set(issue.url || issue.number, issue);
  }

  return trafficDetected;
}

function dispatchTrafficNotification({ title, body, category = 'system', tier = 'info', action = null, revision = null }) {
  const event={title,body,category,tier,action,revision,source:'dev-central-monitor'};
  if(!require('../robos-lib/notification-gate').claimNotification(path.join(CONFIG_DIR,'notification-monitor-ledger.json'),event))return false;
  const notifs = loadNotifications();
  const entry = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    body,
    icon: category === 'ci_cd' ? 'alert-triangle' : category === 'pr_review' ? 'git-pull-request' : 'bell',
    source: 'dev-central-monitor',
    category,
    tier,
    ts: new Date().toISOString(),
    read: false,
    action,
  };

  notifs.unshift(entry);
  saveNotifications(notifs.slice(0, 500));

  // Push desktop toast
  sendDesktopToast(title, body, category, tier);

  // Switch Dev Central tray and window icon to notification icon!
  updateTrayAndIcon();

  // Notify renderer
  if (win && win.webContents) {
    win.webContents.send('dc-traffic-notification', entry);
  }
}

let syncInFlight=null;
function triggerSync(){
  if(!syncInFlight)syncInFlight=performSync().finally(()=>{syncInFlight=null;});
  return syncInFlight;
}
async function performSync() {
  const data = await fetchLatestData();
  checkTrafficAndNotify(data.prs, data.issues);

  if (win && win.webContents) {
    win.webContents.send('dc-data-updated', {
      ...data,
      unreadCount: getUnreadCount(),
      activeFeature: getActiveFeature(),
    });
  }
  updateTrayAndIcon();
  return { ok: true, unreadCount: getUnreadCount() };
}

function startBackgroundMonitor() {
  // First sync establishes a baseline; all later callers share the same request.
  triggerSync().catch(error=>console.error('Background sync:',error.message));

  // Watch notifications file for changes made externally (e.g. by robos-notify CLI)
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(NOTIF_FILE)) fs.writeFileSync(NOTIF_FILE, '[]');
  try {
    fs.watch(NOTIF_FILE, () => {
      updateTrayAndIcon();
      if (win && win.webContents) {
        win.webContents.send('dc-data-updated', { unreadCount: getUnreadCount() });
      }
    });
  } catch {}

  // Periodic polling every 30s
  backgroundSyncTimer = setInterval(()=>triggerSync().catch(error=>console.error('Background sync:',error.message)), 30000);
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('dc-read-settings', () => readSettings());

ipcMain.handle('dc-get-my-issues', (_, scope) => {
  if (scope === 'all' || scope === 'assigned') issueScope = scope;
  return readList('issues');
});
ipcMain.handle('dc-get-my-prs', () => readList('prs'));
ipcMain.handle('dc-get-review-requests', () => readList('reviews'));
ipcMain.handle('dc-get-recent-activity', () => readActivity());

ipcMain.handle('dc-open-url', (_, url) => shell.openExternal(url));

ipcMain.handle('dc-review-get-task-proof', async (_, taskId = 'TASK-201') => {
  if (!isDemoMode) return { ok: false, error: 'This demonstration action is unavailable. Open the real pull request to review or merge.' };
  return {
    taskId,
    title: 'TASK-201: Multi-Step Dynamic Form Submission',
    featureTitle: 'Multi-Step Form Wizard Requirement',
    scenarioTitle: 'Scenario: Successfully submitting all form steps',
    targetService: 'forms-api',
    branch: 'feature/TASK-201-multi-step',
    videoUrl: 'walkthroughs/video-generator/video-generator-final.webm',
    resolution: '1080p (1920x1080 @ 30fps)',
    durationFormatted: '00:00:24.600',
    verificationBadges: [
      { name: 'Pact Consumer Contracts', status: 'PASS', details: '14/14 Endpoints Conforming', cls: 'badge-pass' },
      { name: 'W3C SHACL Conformance', status: '100% PASS', details: '0 Shape Violations', cls: 'badge-pass' },
      { name: 'Spectral OpenAPI 3.1', status: 'CLEAN', details: '0 Linter Warnings', cls: 'badge-pass' },
      { name: 'E2E Regression Suites', status: '8/8 PASS', details: '0 Regressions Detected', cls: 'badge-pass' },
    ],
    chapters: [
      { id: '1', timecode: '00:00:00.000', title: 'Ingest BDD Feature AST & Requirements', status: '✅ SYNCED' },
      { id: '2', timecode: '00:00:03.500', title: 'Verify Strict RED Failure Guard (404 Error)', status: '✅ SYNCED' },
      { id: '3', timecode: '00:00:07.000', title: 'Apply Minimal Implementation & Contract Mocks', status: '✅ ACTIVE' },
      { id: '4', timecode: '00:00:11.000', title: 'Confirm 100% GREEN Step Pass Rate', status: '✅ SYNCED' },
      { id: '5', timecode: '00:00:15.500', title: 'Full Regression & SHACL Shape Verification', status: '✅ SYNCED' },
      { id: '6', timecode: '00:00:20.000', title: 'Proof-of-Work Artifact Ready for Merge', status: '✅ READY' },
    ],
    diffs: [
      { type: 'added', file: 'specs/contracts/forms-api-v1.yaml', summary: 'Added OpenAPI 3.1 contract for POST /api/v1/forms/submit' },
      { type: 'added', file: 'packages/forms-api/lib/models/form-step.js', summary: 'Multi-step validation schema with TypeSpec' },
      { type: 'modified', file: 'packages/forms-api/lib/router.js', summary: 'Mounted POST /submit endpoint with local test fabric mocks' },
    ],
  };
});

ipcMain.handle('dc-review-signoff-merge', async (_, taskId = 'TASK-201') => {
  if (!isDemoMode) return { ok: false, error: 'This demonstration action is unavailable. Open the real pull request to review or merge.' };
  return {
    ok: true,
    taskId,
    mergedBranch: 'feature/TASK-201-multi-step',
    targetBranch: 'main',
    commitSha: 'a78df91c2b04f8e',
    promotedState: 'PRODUCTION_REALITY',
    worktreesCleaned: 1,
    devcontainersTornDown: 1,
    message: 'Successfully merged into main! Branch state promoted to Production Reality.',
  };
});

// ── Feature In-Progress & Lifetime History Handlers ──────────────────────────

ipcMain.handle('dc-get-features', () => featureChoices());
ipcMain.handle('dc-work-progress', (_,urls) => {
  if(!Array.isArray(urls)||urls.length>1000)throw Error('Invalid tickets');
  return Object.fromEntries(urls.map(url=>[url,require('./work-progress').progress(workTask.read(url))]));
});
ipcMain.handle('dc-work-task-state', () => { const f = getActiveFeature(); return f?.issueUrl ? workTask.read(f.issueUrl) : null; });

ipcMain.handle('dc-open-work-item', async (_, {url, action}) => {
  try {
    const board = await require('./task-board').fetchBoard(activeTS(readSettings()));
    const item = board.flatMap(f=>[f,...f.tasks]).find(t=>t.id===url);
    if(!item) throw Error('Ticket is not in the configured task server.');
    if(action==='runner'){await workTask.launchApp('robos-agent-task-runner',url,process.execPath);return {ok:true};}
    if(action==='work' && !item.workable) throw Error('Resolve dependencies before working this ticket.');
    const live=await workTask.inspect(url);
    const plannerProjectId=workTask.plannerProject(url,live.issue);
    const parent=board.find(f=>f.tasks.some(t=>t.id===url));
    const previous=workTask.read(url);
    workTask.save(url,{...live,...(action==='work'?{workOpenedAt:previous.workOpenedAt || new Date().toISOString()}:{}),plannerProjectId,workspace:previous.workspace || (parent && workTask.read(parent.id).workspace),autoStart:action==='work' && !previous.workerPid && !live.prs.length && (!previous.plan || !!previous.approvedPlanHash)});
    await workTask.launchApp(action==='work'?(live.prs.length?'pr-review':'robos-agent-task-runner'):'task-planner',url,process.execPath);
    return {ok:true};
  } catch(error) { return {ok:false,error:error.message}; }
});

let assigningFeature = false;
ipcMain.handle('dc-set-active-feature', async (_, featureId) => {
  if (assigningFeature) return { ok: false, error: 'An assignment is already in progress.' };
  assigningFeature = true;
  try {
    let result;
    if (isDemoMode) {
      result = { features: setActiveFeatureId(featureId), activeFeature: getActiveFeature() };
    } else {
      result = await assignFeature(featureId, activeTS(readSettings()), loadFeatures());
      try { saveFeatures(result.features); }
      catch (error) { return { ok: false, error: `GitHub assignment succeeded, but saving the current feature failed: ${error.message}` }; }
    }
    updateTrayAndIcon();
    const choices = await featureChoices();
    const dispatch = { message: 'Assignment saved. Select a workable task below.' };
    const data = { ...result, features: choices.data, activeFeature:choices.activeFeature, dispatch };
    if (win && win.webContents) win.webContents.send('dc-data-updated', data);
    return { ok: true, ...data };
  } catch (error) { return { ok: false, error: error.message }; }
  finally { assigningFeature = false; }
});

ipcMain.handle('dc-unassign-feature',async(_,url)=>{
  if(assigningFeature)return {ok:false,error:'An assignment is already in progress.'};
  assigningFeature=true;
  try{const result=await require('./feature-workflow').unassignFeature(url,activeTS(readSettings()),loadFeatures());saveFeatures(result.features);const choices=await featureChoices();return {ok:true,features:choices.data,activeFeature:choices.activeFeature};}
  catch(e){return {ok:false,error:e.message};}finally{assigningFeature=false;}
});
ipcMain.handle('dc-open-tool',async(_,name)=>{
  if(!['task-servers','ci-monitor','ci-pipeline-servers','workflow-studio'].includes(name))return {ok:false,error:'Unknown tool'};
  try{const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const child=cp.spawn(process.execPath,[path.join(__dirname,'..',name),'--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],{detached:true,stdio:'ignore',env});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();return {ok:true};}catch(e){return {ok:false,error:e.message};}
});

ipcMain.handle('dc-update-feature-status', (_, { featureId, status }) => {
  const features = updateFeatureStatus(featureId, status);
  const active = getActiveFeature();
  if (win && win.webContents) {
    win.webContents.send('dc-data-updated', { features, activeFeature: active });
  }
  return { ok: true, features, activeFeature: active };
});

ipcMain.handle('dc-get-task-lifetime-history', (_, taskId) => {
  return getTaskLifetimeHistory(taskId);
});

// ── Absorbed Notifications IPC Handlers ──────────────────────────────────────

ipcMain.handle('get-notifications', () => loadNotifications());

ipcMain.handle('mark-read', (_, id) => {
  const data = loadNotifications();
  data.forEach(n => { if (!id || n.id === id) n.read = true; });
  saveNotifications(data);
  updateTrayAndIcon();
  return true;
});

ipcMain.handle('mark-read-by-category', (_, category) => {
  const data = loadNotifications();
  data.forEach(n => { if (n.category === category) n.read = true; });
  saveNotifications(data);
  updateTrayAndIcon();
  return true;
});

ipcMain.handle('delete-notification', (_, id) => {
  const data = loadNotifications().filter(n => n.id !== id);
  saveNotifications(data);
  updateTrayAndIcon();
  return true;
});

ipcMain.handle('clear-read', () => {
  const data = loadNotifications().filter(n => !n.read);
  saveNotifications(data);
  updateTrayAndIcon();
  return true;
});

ipcMain.handle('clear-all', () => {
  saveNotifications([]);
  updateTrayAndIcon();
  return true;
});

ipcMain.handle('get-unread-count', () => getUnreadCount());
ipcMain.handle('get-unread-by-category', () => getUnreadByCategory());
ipcMain.handle('get-prefs', () => loadPrefs());
ipcMain.handle('save-prefs', (_, prefs) => {
  savePrefs(prefs);
  return { ok: true };
});

ipcMain.handle('open-app-context', (_, action) => {
  if(action?.app==='team-chat-servers'){require('../team-chat-servers/lib/open-app').open(action.serverId||'');return {ok:true};}
  if (action && action.url) {
    shell.openExternal(action.url);
  } else if (action && action.app) {
    const sockPath = process.env.ROBOS_DM_SOCKET || `/tmp/robos-dm-${process.getuid ? process.getuid() : 1000}.sock`;
    try {
      const client = net.connect(sockPath, () => {
        client.write(JSON.stringify({ launch: action.app }));
        client.end();
      });
    } catch {}
  }
  return { ok: true };
});

// ── Background Sync & Traffic Simulator IPC Handlers ────────────────────────

ipcMain.handle('dc-sync-now', async () => triggerSync());

ipcMain.handle('dc-simulate-traffic', async (_, payload = {}) => {
  if (!isDemoMode) return { ok: false, error: 'This demonstration action is unavailable. Open the real pull request to review or merge.' };
  const { type = 'pr_comment', prNumber = 84, commentText = 'Review feedback submitted on AST verification.', status = 'fail' } = payload;

  if (type === 'ci_failed') {
    dispatchTrafficNotification({
      title: `PR #${prNumber} CI Failed`,
      body: `Workflow run failed on step: typecheck and Pact contracts for forms-api.`,
      category: 'ci_cd',
      tier: 'critical',
      action: { type: 'open-url', url: `https://github.com/acme-corp/buildbarn-forms/pull/${prNumber}` },
    });
  } else if (type === 'pr_approved') {
    dispatchTrafficNotification({
      title: `PR #${prNumber} Approved`,
      body: `Sarah Chen approved your pull request with automated 1080p video sign-off.`,
      category: 'pr_review',
      tier: 'info',
      action: { type: 'open-url', url: `https://github.com/acme-corp/buildbarn-forms/pull/${prNumber}` },
    });
  } else if (type === 'pr_changes_requested') {
    dispatchTrafficNotification({
      title: `Changes Requested on PR #${prNumber}`,
      body: `Dave K. requested changes: "Ensure 3-year rabies booster exemption rule is covered."`,
      category: 'pr_review',
      tier: 'warning',
      action: { type: 'open-url', url: `https://github.com/acme-corp/buildbarn-forms/pull/${prNumber}` },
    });
  } else if (type === 'task_updated') {
    dispatchTrafficNotification({
      title: `Task #201 Status Moved to In Review`,
      body: `Alex Rivera promoted task #201 lifecycle state to In Review.`,
      category: 'task',
      tier: 'info',
      action: { type: 'open-url', url: `https://github.com/acme-corp/buildbarn-forms/issues/201` },
    });
  } else {
    dispatchTrafficNotification({
      title: `New Comment on PR #${prNumber}`,
      body: commentText,
      category: 'pr_review',
      tier: 'info',
      action: { type: 'open-url', url: `https://github.com/acme-corp/buildbarn-forms/pull/${prNumber}` },
    });
  }

  return { ok: true, unreadCount: getUnreadCount() };
});

module.exports = {
  loadNotifications,
  saveNotifications,
  loadPrefs,
  savePrefs,
  getUnreadCount,
  loadFeatures,
  saveFeatures,
  getActiveFeature,
  setActiveFeatureId,
  triggerSync,
};
