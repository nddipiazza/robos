'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

app.setName('robos-elearning');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'robos-elearning'));

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let win = null;
const PORT = 19185;

let _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try {
      _debugServer = require(p);
      if (_debugServer.registerSnapshotIPC) _debugServer.registerSnapshotIPC(ipcMain);
      break;
    } catch {}
  }
} catch {}

let SDLCKnowledgeGraphStore = null;
try {
  const graphLibPaths = [
    path.resolve(__dirname, '..', 'robos-graph', 'index.js'),
    '/usr/local/share/robos/robos-graph/index.js',
  ];
  for (const gp of graphLibPaths) {
    try {
      const g = require(gp);
      if (g.SDLCKnowledgeGraphStore) {
        SDLCKnowledgeGraphStore = g.SDLCKnowledgeGraphStore;
        break;
      }
    } catch {}
  }
} catch {}

let graphStore = null;
function getGraphStore() {
  if (!graphStore && SDLCKnowledgeGraphStore) {
    try {
      graphStore = new SDLCKnowledgeGraphStore();
    } catch (err) {
      console.warn('[robos-elearning] Could not instantiate SDLCKnowledgeGraphStore:', err.message);
    }
  }
  return graphStore;
}

// Parse launch args
let initialAppId = null;
let initialCourseId = null;
for (const arg of process.argv) {
  if (arg.startsWith('--app=')) initialAppId = arg.split('=')[1];
  if (arg.startsWith('--course=')) initialCourseId = arg.split('=')[1];
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'RobOS — Interactive eLearning & Verification Hub',
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) _debugServer.startDebugServer(win, PORT);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('elearning:get-initial-target', () => ({
  appId: initialAppId,
  courseId: initialCourseId,
}));

ipcMain.handle('elearning:list-courses', async () => {
  const store = getGraphStore();
  if (store) {
    const courses = store.getELearningNodes();
    return courses.map(c => ({
      id: c['@id'],
      title: c['dcterms:title'],
      topic: c['robos:topic'],
      difficulty: c['robos:difficulty'] || 'Intermediate',
      estimatedDuration: c['robos:estimatedDuration'] || '45 mins',
      targetApplication: c['robos:targetApplication'] || null,
      modulesCount: (c['robos:modules'] || []).length,
    }));
  }
  return [];
});

ipcMain.handle('elearning:get-course', async (_, courseIdOrAppId) => {
  const store = getGraphStore();
  if (!store) return { error: 'Graph store not available' };

  let course = null;
  let appNode = null;

  if (courseIdOrAppId) {
    course = store.getNode(courseIdOrAppId);
    if (!course) {
      appNode = store.findApplicationNode(courseIdOrAppId);
      if (appNode && appNode['robos:hasELearning']) {
        const cId = Array.isArray(appNode['robos:hasELearning']) ? appNode['robos:hasELearning'][0] : appNode['robos:hasELearning'];
        course = store.getNode(cId);
      }
    }
  }

  if (!course) {
    const all = store.getELearningNodes();
    if (all.length > 0) course = all[0];
  }

  if (course && course['robos:targetApplication']) {
    appNode = store.getNode(course['robos:targetApplication']);
  }

  return { course, application: appNode };
});

ipcMain.handle('elearning:issue-certificate', async (_, { courseId, appId, userId, scorePercentage }) => {
  const store = getGraphStore();
  if (store) {
    return store.issueCertificateOfCompletion({ courseId, appId, userId, scorePercentage });
  }
  return { ok: false, error: 'Store not available' };
});

ipcMain.handle('elearning:list-certificates', async (_, opts = {}) => {
  const store = getGraphStore();
  if (store) {
    return store.getCertificatesForAppOrUser(opts);
  }
  return [];
});