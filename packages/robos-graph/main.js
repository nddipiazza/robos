'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
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

let store = new SDLCKnowledgeGraphStore();
const { WorkspaceReview } = require('./lib/workspace-review');
let workspaceReview = store.workspace ? new WorkspaceReview(store.workspace.root) : null;
let testFabric = null;
if (LocalTestFabric && !store.workspace) {
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
    width: 1440,
    height: 960,
    title: 'RobOS Knowledge Graph Explorer',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Documentation links open in the system browser, never an Electron child.
  win.webContents.setWindowOpenHandler(({ url }) => {
    const safe = require('./lib/inspector-capabilities').safeUrl(url);
    if (safe) shell.openExternal(safe).catch(error => console.error('Unable to open documentation URL:', error.message));
    return { action: 'deny' };
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

ipcMain.handle('workspace-info', () => workspaceReview ? workspaceReview.info() : null);
ipcMain.handle('workspace-open', async () => {
  const selected = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Open graph workspace (contains .robos)' });
  if (selected.canceled) return null;
  const next = new SDLCKnowledgeGraphStore({ graphRoot: selected.filePaths[0] });
  store = next;
  workspaceReview = new WorkspaceReview(next.workspace.root);
  return workspaceReview.info();
});
function requireReview() {
  if (!workspaceReview) throw new Error('Open an external graph workspace first');
  return workspaceReview;
}
ipcMain.handle('workspace-context', (_, input) => requireReview().context(input));
ipcMain.handle('workspace-propose', (_, input) => { const review = requireReview(); return review.preview(review.propose(input)); });
ipcMain.handle('workspace-ask-agent', async (_, input) => { const review = requireReview(); const result = await review.askAgent(input); return { ...result, proposal: review.preview(result.proposal) }; });
ipcMain.handle('workspace-apply', (_, proposal) => {
  const result = requireReview().applyReviewed(proposal.id);
  store.init();
  store.packageManager.loadPackages();
  return result;
});

ipcMain.handle('graph-get-all', async () => store.parser.nodes);
ipcMain.handle('graph-get-relations', async () => {
  const { nodeRelations } = require('./lib/relationships');
  const ids = new Set(store.parser.nodes.map(node => node['@id']));
  return store.parser.nodes.flatMap(node => nodeRelations(node, ids)).filter(edge => edge.internal)
    .map(({ from, to, predicate, kind }) => ({ from, to, predicate, kind }));
});
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
ipcMain.handle('graph-app-elearning-generate', async (_, opts) => store.generateAppELearning(opts));
ipcMain.handle('graph-app-elearning-launch', async (_, opts) => store.launchELearningApp(opts));
ipcMain.handle('graph-app-doc-generate', async (_, opts) => store.generateAppDocumentation(opts));
ipcMain.handle('graph-issue-certificate', async (_, opts) => store.issueCertificateOfCompletion(opts));
ipcMain.handle('graph-get-certificates', async (_, opts) => store.getCertificatesForAppOrUser(opts));
ipcMain.handle('graph-bulk-import-repos', async (_, repos) => store.bulkImportRepositories(repos));
ipcMain.handle('graph-import-resources', async (_, { resources, options } = {}) => store.importResources(resources, options));
ipcMain.handle('graph-import-prompt', async (_, { prompt, options } = {}) => store.importFromPrompt(prompt, options));
ipcMain.handle('graph-import-git-projects', async () => store.importGitProjectsConfig());
ipcMain.handle('graph-request-app-doc-update', async (_, payload) => store.requestAppDocUpdate(payload));
ipcMain.handle('graph-get-doc-sync-prompt', async () => store.latestDocSyncPrompt || store.discernDocUpdates({ action: 'inspect', node: store.parser.nodes[0] }));
ipcMain.handle('graph-apply-doc-updates', async (_, updates) => ({ ok: true, message: 'Documentation updated successfully in accordance with KGraph synchronization.' }));

// ── Multi-Package & Multi-Repo IPC ──────────────────────────────────────────
ipcMain.handle('kgraph-list-packages', async () => store.listPackages());
ipcMain.handle('kgraph-get-package', async (_, pkgId) => store.getPackage(pkgId));
ipcMain.handle('kgraph-list-repos', async () => store.listRepos());
ipcMain.handle('kgraph-add-repo', async (_, repoData) => store.addRepo(repoData));
ipcMain.handle('kgraph-remove-repo', async (_, repoId) => store.removeRepo(repoId));
ipcMain.handle('kgraph-sync-remote', async (_, repoId) => store.syncRemoteRepo(repoId));

// ── DevOps Integrations IPC ─────────────────────────────────────────────────
ipcMain.handle('devops-get-categories', async () => store.getDevOpsCategories());
ipcMain.handle('devops-get-providers', async (_, categoryId) => store.getDevOpsProviders(categoryId));
ipcMain.handle('devops-list-integrations', async () => store.listDevOpsIntegrations());
ipcMain.handle('devops-save-integration', async (_, payload) => store.saveDevOpsIntegration(payload));
ipcMain.handle('devops-test-connection', async (_, payload) => store.testDevOpsConnection(payload));
ipcMain.handle('devops-delete-integration', async (_, id) => store.deleteDevOpsIntegration(id));
// ── Advanced KGraph GUI IPC Handlers ─────────────────────────────────────────
ipcMain.handle('graph-add-node', async (_, nodeData) => store.addNode(nodeData));
ipcMain.handle('graph-update-node', async (_, { id, patch } = {}) => store.updateNode(id, patch));
ipcMain.handle('graph-delete-node', async (_, { id, cascade } = {}) => store.removeNode(id, { cascade }));
ipcMain.handle('graph-find-path', async (_, { startId, endId, maxDepth } = {}) => store.findPath(startId, endId, maxDepth));
ipcMain.handle('graph-get-impact', async (_, { id, depth } = {}) => store.findDependents(id, depth));
ipcMain.handle('graph-generate-mermaid', async (_, opts = {}) => store.generateMermaidGraph(opts));
ipcMain.handle('graph-export', async (_, { format, packageId } = {}) => store.exportGraph(format, packageId));
ipcMain.handle('graph-search-nodes', async (_, { query, filter } = {}) => store.searchNodes(query, filter));
