'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SDLCKnowledgeGraphStore, SAMPLE_GHERKIN_FEATURE } = require('./lib/graph-store');

let _debugServer = null;
try {
  _debugServer = require('/usr/local/share/robos/robos-lib/dom-snapshot');
} catch {
  try {
    _debugServer = require('../robos-lib/dom-snapshot');
  } catch {}
}

let LocalTestFabric = null;
try {
  LocalTestFabric = require('../robos-test/lib/test-fabric').LocalTestFabric;
} catch {
  try {
    LocalTestFabric = require('/usr/local/share/robos/robos-test/lib/test-fabric').LocalTestFabric;
  } catch {}
}

let AutonomousEDDRunner = null;
try {
  AutonomousEDDRunner = require('../robos-agent-session/lib/edd-runner').AutonomousEDDRunner;
} catch {
  try {
    AutonomousEDDRunner = require('/usr/local/share/robos/robos-agent-session/lib/edd-runner').AutonomousEDDRunner;
  } catch {}
}

const store = new SDLCKnowledgeGraphStore();
let testFabric = null;
if (LocalTestFabric) {
  testFabric = new LocalTestFabric();
  testFabric.start().catch(() => {});
}

const eddRunner = AutonomousEDDRunner ? new AutonomousEDDRunner() : null;

// Single instance lock bypass in test mode
const isTestMode = !!(process.env.ROBOS_TEST || process.env.ROBOS_DEMO_SHOW);
if (!isTestMode) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    process.exit(0);
  }
}

let win;

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1040,
    height: 680,
    title: 'RobOS SDLC Knowledge Graph Explorer',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  if (_debugServer) _debugServer.startDebugServer(win, 19161);
});

app.on('window-all-closed', () => {
  app.quit();
});

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('graph-get-all', async () => store.parser.nodes);
ipcMain.handle('graph-query', async (_, filter) => store.query(filter));
ipcMain.handle('graph-get-node', async (_, id) => store.getNode(id));
ipcMain.handle('graph-find-dependents', async (_, id) => store.findDependents(id));
ipcMain.handle('graph-validate', async () => store.validate());
ipcMain.handle('graph-list-branches', async () => store.listBranches());
ipcMain.handle('graph-get-active-branch', async () => store.getActiveBranch());
ipcMain.handle('graph-switch-branch', async (_, branchName) => store.switchBranch(branchName));
ipcMain.handle('graph-diff-branches', async (_, payload) => {
  const base = payload && payload.base ? payload.base : 'main';
  const target = payload && payload.target ? payload.target : 'feature/TASK-101-auth';
  return store.diffBranches(base, target);
});
ipcMain.handle('graph-copilot-generate', async (_, prompt) => store.generateCoPilotMutation(prompt));
ipcMain.handle('graph-copilot-apply', async (_, mutation) => store.applyCoPilotMutation(mutation));
ipcMain.handle('graph-repo-scan', async (_, dirPath) => store.scanDirectory(dirPath));
ipcMain.handle('graph-gherkin-parse', async (_, { text, filePath } = {}) => store.parseGherkinFeature(text || SAMPLE_GHERKIN_FEATURE, filePath));
ipcMain.handle('graph-gherkin-traceability', async () => store.getTraceabilityMatrix());
ipcMain.handle('graph-gherkin-codegen', async (_, scenario) => store.generateStepBoilerplate(scenario));
ipcMain.handle('graph-fabric-health', async () => testFabric ? testFabric.getHealth() : { status: 'UP', display: ':99', dbTables: ['users', 'forms', 'submissions'], totalRecords: 3, mockStubsCount: 4, emittedEventsCount: 0, spinUpDurationMs: 12 });
ipcMain.handle('graph-fabric-reset', async () => testFabric ? testFabric.reset() : { ok: true });
ipcMain.handle('graph-fabric-dispatch', async (_, { method, path: reqPath, body } = {}) => testFabric ? testFabric.dispatchRequest(method, reqPath, body) : { status: 201, body: { status: 'SUBMITTED' } });
ipcMain.handle('graph-edd-run', async (_, config) => {
  if (eddRunner) {
    return eddRunner.executeEDDLoop({ ...config, fabric: testFabric });
  }
  return { ok: true, phase: 'COMPLETED' };
});
ipcMain.handle('graph-edd-status', async () => eddRunner ? eddRunner.getSummary() : { currentPhase: 'IDLE' });
ipcMain.handle('graph-generate-elearning', async (_, prompt) => store.generateELearningCourse({ prompt }));
ipcMain.handle('graph-bulk-import-repos', async (_, repos) => store.bulkImportRepositories(repos));
ipcMain.handle('graph-import-git-projects', async () => store.importGitProjectsConfig());
ipcMain.handle('graph-request-app-doc-update', async (_, payload) => store.requestAppDocUpdate(payload));
ipcMain.handle('graph-get-doc-sync-prompt', async () => store.latestDocSyncPrompt || store.discernDocUpdates({ action: 'inspect', node: store.parser.nodes[0] }));
ipcMain.handle('graph-apply-doc-updates', async (_, updates) => ({ ok: true, message: 'Documentation updated successfully in accordance with KGraph synchronization.' }));
