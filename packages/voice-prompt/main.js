let app, BrowserWindow, ipcMain, globalShortcut, dialog;
try {
  ({ app, BrowserWindow, ipcMain, globalShortcut, dialog } = require('electron'));
} catch {
  app = {
    setName: () => {},
    commandLine: { appendSwitch: () => {} },
    requestSingleInstanceLock: () => true,
    whenReady: () => new Promise(() => {}),
    on: () => {},
    quit: () => {},
  };
  BrowserWindow = class {};
  ipcMain = { handle: () => {}, on: () => {} };
  globalShortcut = { register: () => {}, unregisterAll: () => {} };
  dialog = { showErrorBox: () => {} };
}
const path = require('path');
const http = require('http');
const promptStore = require('./lib/prompt-store');
const contextProvider = require('./lib/context-provider');
const { STTEngine } = require('./lib/stt-engine');

app.setName('robos-voice-prompt');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// Single-instance lock (bypassed in test mode)
if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); process.exit(0); }
}

let mainWindow = null;
let apiServer = null;
const API_PORT = parseInt(process.env.ROBOS_VOICE_PORT || '19188', 10);

const sttEngine = new STTEngine(promptStore.loadPrefs());

// Optional dom-snapshot integration
let _debugServer = null;
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

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({ text: body });
      }
    });
    req.on('error', () => resolve({}));
  });
}

/**
 * Handle speech-to-text dictation and automatically capture RobOS app context
 */
async function handleDictation(input, options = {}) {
  const prefs = promptStore.loadPrefs();
  const sttResult = await sttEngine.processDictation(input, options);

  // Automatically gather active RobOS app context
  const context = await contextProvider.getAggregatedContext();

  const promptEntry = {
    text: sttResult.text,
    durationMs: sttResult.durationMs,
    device: sttResult.device || prefs.configuredDevice || 'default',
    status: 'recorded',
    metadata: {
      ...context,
      confidence: sttResult.confidence,
      sttEngine: 'robos-voice-stt',
    },
  };

  const savedPrompt = promptStore.savePrompt(promptEntry);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('vp-event-dictation', savedPrompt);
  }

  return savedPrompt;
}

/**
 * Starts HTTP REST API Server on port 19188
 */
function startApiServer() {
  if (apiServer) return apiServer;

  apiServer = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url, `http://localhost:${API_PORT}`);
    const pathname = urlObj.pathname;
    const method = req.method.toUpperCase();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    try {
      // 1. GET /api/status
      if (pathname === '/api/status' && method === 'GET') {
        const activeWin = await contextProvider.getActiveWindow();
        const prefs = promptStore.loadPrefs();
        const prompts = promptStore.loadPrompts();
        res.writeHead(200);
        return res.end(JSON.stringify({
          ok: true,
          active: sttEngine.isActive(),
          configuredDevice: prefs.configuredDevice,
          activeApp: activeWin.appId || 'desktop',
          activeWindowTitle: activeWin.title,
          totalPrompts: prompts.length,
          port: API_PORT,
        }));
      }

      // 2. POST /api/activate
      if (pathname === '/api/activate' && method === 'POST') {
        const body = await parseBody(req);
        const result = await sttEngine.activate(body);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('vp-event-activated', result);
        }
        res.writeHead(200);
        return res.end(JSON.stringify(result));
      }

      // 3. POST /api/deactivate
      if (pathname === '/api/deactivate' && method === 'POST') {
        const result = await sttEngine.deactivate();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('vp-event-deactivated', result);
        }
        res.writeHead(200);
        return res.end(JSON.stringify(result));
      }

      // 4. GET /api/context — query active RobOS app context in real-time
      if (pathname === '/api/context' && method === 'GET') {
        const context = await contextProvider.getAggregatedContext();
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, context }));
      }

      // 5. POST /api/dictate — dictate speech to text + attach active app context + save
      if (pathname === '/api/dictate' && method === 'POST') {
        const body = await parseBody(req);
        if (!body || (!body.text && typeof body !== 'string')) {
          res.writeHead(400);
          return res.end(JSON.stringify({ ok: false, error: 'text or payload required' }));
        }
        const prompt = await handleDictation(body.text ? body.text : body, body);
        res.writeHead(201);
        return res.end(JSON.stringify({ ok: true, prompt }));
      }

      // 6. GET /api/prompts — list saved prompts
      if (pathname === '/api/prompts' && method === 'GET') {
        let prompts = promptStore.loadPrompts();
        const appFilter = urlObj.searchParams.get('app');
        if (appFilter) {
          prompts = prompts.filter(p => p.metadata?.activeApp?.appId === appFilter);
        }
        const limit = parseInt(urlObj.searchParams.get('limit') || '100', 10);
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, count: prompts.length, prompts: prompts.slice(0, limit) }));
      }

      // 7. GET /api/prompts/:id or DELETE /api/prompts/:id
      const promptMatch = pathname.match(/^\/api\/prompts\/([^/]+)$/);
      if (promptMatch) {
        const promptId = promptMatch[1];
        if (method === 'GET') {
          const p = promptStore.getPrompt(promptId);
          if (!p) { res.writeHead(404); return res.end(JSON.stringify({ ok: false, error: 'Prompt not found' })); }
          res.writeHead(200);
          return res.end(JSON.stringify({ ok: true, prompt: p }));
        }
        if (method === 'DELETE') {
          promptStore.deletePrompt(promptId);
          res.writeHead(200);
          return res.end(JSON.stringify({ ok: true, deletedId: promptId }));
        }
      }

      // 8. DELETE /api/prompts — clear all prompts
      if (pathname === '/api/prompts' && method === 'DELETE') {
        promptStore.clearPrompts();
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, cleared: true }));
      }

      // 9. GET /api/devices — enumerate capture devices
      if (pathname === '/api/devices' && method === 'GET') {
        const devices = await sttEngine.listDevices();
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, devices }));
      }

      // 10. GET /api/config & POST /api/config
      if (pathname === '/api/config') {
        if (method === 'GET') {
          res.writeHead(200);
          return res.end(JSON.stringify({ ok: true, config: promptStore.loadPrefs() }));
        }
        if (method === 'POST') {
          const body = await parseBody(req);
          const updated = promptStore.savePrefs(body);
          if (body.configuredDevice) {
            sttEngine.setDevice(body.configuredDevice);
          }
          res.writeHead(200);
          return res.end(JSON.stringify({ ok: true, config: updated }));
        }
      }

      // 11. Debug / Testing endpoints for harness & snapshot-cli: /eval, /health
      if (pathname === '/eval' && method === 'POST') {
        const body = await parseBody(req);
        const js = body.__raw || (typeof body === 'string' ? body : body.js || '');
        if (mainWindow && !mainWindow.isDestroyed()) {
          const result = await mainWindow.webContents.executeJavaScript(js || 'null');
          res.writeHead(200);
          return res.end(JSON.stringify({ result }));
        } else {
          res.writeHead(200);
          return res.end(JSON.stringify({ result: null }));
        }
      }

      if (pathname === '/health' && method === 'GET') {
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, appId: 'voice-prompt', title: 'RobOS Voice Prompt' }));
      }

      // Fallback 404
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'Endpoint not found', path: pathname }));
    } catch (err) {
      console.error('[voice-prompt] API handler error:', err);
      res.writeHead(500);
      return res.end(JSON.stringify({ error: err.message }));
    }
  });

  apiServer.listen(API_PORT, () => {
    console.log(`[voice-prompt] API server listening on http://localhost:${API_PORT}`);
  });

  return apiServer;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'RobOS Voice Prompt',
    width: 1060,
    height: 720,
    minWidth: 780,
    minHeight: 520,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Connect dom-snapshot debug IPC if available
  if (_debugServer && _debugServer.registerSnapshotIPC) {
    try {
      _debugServer.registerSnapshotIPC(mainWindow);
    } catch {}
  }

  // Register push-to-talk hotkey Super+V
  try {
    const prefs = promptStore.loadPrefs();
    const key = prefs.pushToTalkKey || 'Super+V';
    globalShortcut.register(key, async () => {
      if (sttEngine.isActive()) {
        await sttEngine.deactivate();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('vp-event-deactivated', { durationMs: 0 });
        }
      } else {
        const res = await sttEngine.activate();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('vp-event-activated', res);
        }
      }
    });
  } catch (err) {
    console.warn('[voice-prompt] hotkey registration notice:', err.message);
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('vp-get-status', async () => {
  const activeWin = await contextProvider.getActiveWindow();
  const prefs = promptStore.loadPrefs();
  return {
    active: sttEngine.isActive(),
    configuredDevice: prefs.configuredDevice,
    activeApp: activeWin.appId || 'desktop',
    activeWindowTitle: activeWin.title,
    totalPrompts: promptStore.loadPrompts().length,
  };
});

ipcMain.handle('vp-get-app-context', async () => {
  return contextProvider.getAggregatedContext();
});

ipcMain.handle('vp-list-devices', async () => {
  return sttEngine.listDevices();
});

ipcMain.handle('vp-activate', async (_e, options) => {
  const res = await sttEngine.activate(options);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('vp-event-activated', res);
  }
  return res;
});

ipcMain.handle('vp-deactivate', async () => {
  const res = await sttEngine.deactivate();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('vp-event-deactivated', res);
  }
  return res;
});

ipcMain.handle('vp-dictate', async (_e, payload) => {
  const text = typeof payload === 'string' ? payload : (payload?.text || '');
  return handleDictation(text, payload || {});
});

ipcMain.handle('vp-get-prompts', (_e, query) => {
  let prompts = promptStore.loadPrompts();
  if (query && query.app) {
    prompts = prompts.filter(p => p.metadata?.activeApp?.appId === query.app);
  }
  return prompts;
});

ipcMain.handle('vp-get-prompt', (_e, id) => {
  return promptStore.getPrompt(id);
});

ipcMain.handle('vp-delete-prompt', (_e, id) => {
  return promptStore.deletePrompt(id);
});

ipcMain.handle('vp-clear-prompts', () => {
  return promptStore.clearPrompts();
});

ipcMain.handle('vp-get-prefs', () => {
  return promptStore.loadPrefs();
});

ipcMain.handle('vp-save-prefs', (_e, prefs) => {
  const saved = promptStore.savePrefs(prefs);
  if (prefs?.configuredDevice) {
    sttEngine.setDevice(prefs.configuredDevice);
  }
  return saved;
});

// App lifecycle
app.whenReady().then(() => {
  startApiServer();
  createWindow();
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (apiServer) {
    try { apiServer.close(); } catch {}
  }
  app.quit();
});

module.exports = {
  startApiServer,
  handleDictation,
  sttEngine,
  promptStore,
  contextProvider,
};
