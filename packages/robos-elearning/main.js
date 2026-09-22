'use strict';
let electronPkg;
try {
  electronPkg = require('electron');
} catch {}

const isElectronRuntime = electronPkg && typeof electronPkg === 'object' && typeof electronPkg.app === 'object';
const app = isElectronRuntime ? electronPkg.app : {
  setName: () => {},
  setPath: () => {},
  commandLine: { appendSwitch: () => {} },
  whenReady: () => new Promise(() => {}),
  on: () => {},
  quit: () => {},
};
const BrowserWindow = isElectronRuntime ? electronPkg.BrowserWindow : class {};
const ipcMain = isElectronRuntime ? electronPkg.ipcMain : { handle: () => {}, on: () => {} };

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const http = require('http');

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
    if (!course && typeof store.findELearning === 'function') {
      course = store.findELearning(courseIdOrAppId);
    }
    if (!course) {
      appNode = store.findApplicationNode(courseIdOrAppId);
      if (appNode && appNode['robos:hasELearning']) {
        const cId = Array.isArray(appNode['robos:hasELearning']) ? appNode['robos:hasELearning'][0] : appNode['robos:hasELearning'];
        course = store.getNode(cId) || (typeof store.findELearning === 'function' ? store.findELearning(cId) : null);
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

ipcMain.handle('elearning:export-website', async (_, opts = {}) => {
  const store = getGraphStore();
  if (store && typeof store.generateELearningWebsite === 'function') {
    return store.generateELearningWebsite(opts);
  }
  return { ok: false, error: 'Store or website generator not available' };
});

// ── Voice Assistant & Real-Time Course Co-Authoring ─────────────────────────

let voiceAssistantState = {
  active: false,
  agentId: 'fast-reactive',
  streamReq: null,
  lastProcessedText: '',
  taskActive: false,
};

/**
 * Fast Reactive / AI Agent suggestion parser for real-time eLearning curriculum mutation
 */
async function parseVoiceSuggestion(text, agentId = 'fast-reactive') {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();

  // 1. Add Lab Step
  const addStepMatch = clean.match(/^(?:please\s+)?(?:add|create|insert|include)\s+(?:a\s+|new\s+)?(?:lab\s+)?step(?:\s+to|\s+for|:)?\s+(.*)$/i);
  if (addStepMatch && addStepMatch[1]) {
    return {
      type: 'ADD_LAB_STEP',
      stepText: addStepMatch[1].replace(/^[,\s.:]+|[.\s]+$/g, '').trim(),
      agentId,
      rawText: clean,
    };
  }

  // 2. Remove Lab Step
  const removeStepMatch = clean.match(/^(?:please\s+)?(?:remove|delete)\s+(?:lab\s+)?step\s+(\d+)/i);
  if (removeStepMatch && removeStepMatch[1]) {
    return {
      type: 'REMOVE_LAB_STEP',
      stepIndex: parseInt(removeStepMatch[1], 10) - 1,
      agentId,
      rawText: clean,
    };
  }

  // 3. Update Module Title
  const titleMatch = clean.match(/^(?:please\s+)?(?:change|set|update|rename)\s+(?:the\s+)?(?:module\s+)?title\s+to\s+(.*)$/i);
  if (titleMatch && titleMatch[1]) {
    return {
      type: 'UPDATE_MODULE_TITLE',
      title: titleMatch[1].replace(/^[,\s.:"']+|[.\s"']+$/g, '').trim(),
      agentId,
      rawText: clean,
    };
  }

  // 4. Update Overview
  const overviewMatch = clean.match(/^(?:please\s+)?(?:change|set|update)\s+(?:the\s+)?overview\s+to\s+(.*)$/i);
  if (overviewMatch && overviewMatch[1]) {
    return {
      type: 'UPDATE_OVERVIEW',
      overview: overviewMatch[1].replace(/^[,\s.:"']+|[.\s"']+$/g, '').trim(),
      agentId,
      rawText: clean,
    };
  }

  // 5. Add Quiz Question
  const quizMatch = clean.match(/^(?:please\s+)?(?:add|create)\s+(?:a\s+)?quiz\s+question:?\s*(.*?)(?:\s*(?:with\s+)?answer:?\s*(.*))?$/i);
  if (quizMatch && quizMatch[1]) {
    const qText = quizMatch[1].replace(/^[,\s.:"']+|[.\s"']+$/g, '').trim();
    const ansText = (quizMatch[2] || 'True').replace(/^[,\s.:"']+|[.\s"']+$/g, '').trim();
    return {
      type: 'ADD_QUIZ_QUESTION',
      quiz: {
        question: qText,
        answer: ansText,
        options: [ansText, 'Alternative Choice A', 'Alternative Choice B'],
        explanation: 'Created dynamically via RobOS Voice Assistant',
      },
      agentId,
      rawText: clean,
    };
  }

  // 6. Update Difficulty
  const diffMatch = clean.match(/^(?:please\s+)?(?:change|set)\s+difficulty\s+to\s+(beginner|intermediate|advanced)/i);
  if (diffMatch && diffMatch[1]) {
    const cap = diffMatch[1].charAt(0).toUpperCase() + diffMatch[1].slice(1).toLowerCase();
    return {
      type: 'UPDATE_DIFFICULTY',
      difficulty: cap,
      agentId,
      rawText: clean,
    };
  }

  // 7. General AI CLI Agent query if configured and not fast-reactive
  if (agentId !== 'fast-reactive') {
    try {
      let aiAgent = null;
      const agentPaths = [
        path.resolve(__dirname, '..', 'robos-lib', 'ai-agent'),
        '/usr/local/share/robos/robos-lib/ai-agent',
      ];
      for (const p of agentPaths) {
        try { aiAgent = require(p); break; } catch {}
      }
      if (aiAgent && typeof aiAgent.ask === 'function') {
        const prompt = `You are an interactive eLearning curriculum authoring agent.
User suggestion: "${clean}"
If this suggestion asks to add a lab step, reply JSON: {"type": "ADD_LAB_STEP", "stepText": "..."}
If this suggestion asks to change title, reply JSON: {"type": "UPDATE_MODULE_TITLE", "title": "..."}
If this suggestion asks to change overview, reply JSON: {"type": "UPDATE_OVERVIEW", "overview": "..."}
If this suggestion asks to add a quiz question, reply JSON: {"type": "ADD_QUIZ_QUESTION", "quiz": {"question": "...", "answer": "...", "options": ["..."]}}
Reply with only valid JSON.`;
        const res = await aiAgent.ask(prompt, { providerId: agentId });
        if (res && res.ok && res.text) {
          const jsonMatch = res.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return { ...parsed, agentId, rawText: clean };
          }
        }
      }
    } catch {}
  }

  return null;
}

function stopVoiceAssistant() {
  if (voiceAssistantState.streamReq) {
    try { voiceAssistantState.streamReq.destroy(); } catch {}
    voiceAssistantState.streamReq = null;
  }
  voiceAssistantState.active = false;
  voiceAssistantState.taskActive = false;

  // Deactivate voice prompt microphone if running
  const deactReq = http.request({
    hostname: '127.0.0.1',
    port: 19188,
    path: '/api/deactivate',
    method: 'POST',
  }, () => {});
  deactReq.on('error', () => {});
  deactReq.end();

  if (win && !win.isDestroyed()) {
    win.webContents.send('elearning:voice-stream-event', { type: 'stream_closed' });
  }

  return { ok: true, active: false };
}

function startVoiceAssistant(options = {}) {
  stopVoiceAssistant();

  const agentId = options.agentId || 'fast-reactive';
  voiceAssistantState.active = true;
  voiceAssistantState.agentId = agentId;
  voiceAssistantState.lastProcessedText = '';
  voiceAssistantState.taskActive = true;

  // 1. Activate voice prompt microphone if daemon is running
  const actReq = http.request({
    hostname: '127.0.0.1',
    port: 19188,
    path: '/api/activate',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, () => {});
  actReq.on('error', () => {});
  actReq.end();

  // 2. Open SSE stream connection to voice prompt daemon
  const sseReq = http.request({
    hostname: '127.0.0.1',
    port: 19188,
    path: '/api/stream',
    method: 'GET',
    headers: { 'Accept': 'text/event-stream' },
  }, (res) => {
    res.setEncoding('utf8');
    let buffer = '';

    res.on('data', async (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep trailing incomplete chunk

      for (const line of lines) {
        if (line.startsWith('data:')) {
          try {
            const data = JSON.parse(line.slice(5).trim());
            if (win && !win.isDestroyed()) {
              win.webContents.send('elearning:voice-stream-event', data);
            }

            if (data && data.text) {
              const text = data.text.trim();
              if (text && text !== voiceAssistantState.lastProcessedText) {
                const mutation = await parseVoiceSuggestion(text, voiceAssistantState.agentId);
                if (mutation && mutation.type) {
                  voiceAssistantState.lastProcessedText = text;
                  if (win && !win.isDestroyed()) {
                    win.webContents.send('elearning:voice-mutation', mutation);
                  }
                }
              }
            }
          } catch {}
        }
      }
    });

    res.on('end', () => {
      stopVoiceAssistant();
    });

    res.on('close', () => {
      stopVoiceAssistant();
    });
  });

  sseReq.on('error', (err) => {
    console.warn('[robos-elearning] SSE voice stream notice:', err.message);
    if (win && !win.isDestroyed()) {
      win.webContents.send('elearning:voice-stream-event', { type: 'stream_error', error: err.message });
    }
  });

  sseReq.end();
  voiceAssistantState.streamReq = sseReq;

  return { ok: true, active: true, agentId };
}

ipcMain.handle('elearning:start-voice-assistant', async (_, opts) => {
  return startVoiceAssistant(opts);
});

ipcMain.handle('elearning:stop-voice-assistant', async () => {
  return stopVoiceAssistant();
});

ipcMain.handle('elearning:get-voice-status', async () => {
  return {
    active: voiceAssistantState.active,
    agentId: voiceAssistantState.agentId,
    taskActive: voiceAssistantState.taskActive,
  };
});

module.exports = {
  parseVoiceSuggestion,
  startVoiceAssistant,
  stopVoiceAssistant,
  getVoiceAssistantState: () => voiceAssistantState,
};