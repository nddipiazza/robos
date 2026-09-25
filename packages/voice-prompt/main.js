let electronPkg;
try {
  electronPkg = require('electron');
} catch {}

const isElectronRuntime = electronPkg && typeof electronPkg === 'object' && typeof electronPkg.app === 'object';
const app = isElectronRuntime ? electronPkg.app : {
  setName: () => {},
  commandLine: { appendSwitch: () => {} },
  requestSingleInstanceLock: () => true,
  whenReady: () => new Promise(() => {}),
  on: () => {},
  quit: () => {},
};
const BrowserWindow = isElectronRuntime ? electronPkg.BrowserWindow : class {};
const ipcMain = isElectronRuntime ? electronPkg.ipcMain : { handle: () => {}, on: () => {} };
const globalShortcut = isElectronRuntime ? electronPkg.globalShortcut : { register: () => {}, unregisterAll: () => {} };
const dialog = isElectronRuntime ? electronPkg.dialog : { showErrorBox: () => {} };
const path = require('path');
const http = require('http');
const promptStore = require('./lib/prompt-store');
const contextProvider = require('./lib/context-provider');
const { STTEngine } = require('./lib/stt-engine');
const { TTSEngine } = require('./lib/tts-engine');
const { WakeWordDetector } = require('./lib/wake-word');
const { DesktopAssistant } = require('./lib/desktop-assistant');

app.setName('robos-voice');
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
let currentApiPort = parseInt(process.env.ROBOS_VOICE_PORT || '19188', 10);

const sttEngine = new STTEngine(promptStore.loadPrefs());
const ttsEngine = new TTSEngine((promptStore.loadPrefs() && promptStore.loadPrefs().tts) || {});
const wakeDetector = new WakeWordDetector({ enabled: true });
const desktopAssistant = new DesktopAssistant({ ttsEngine, wakeDetector });

sttEngine.on('interim-text', (data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('vp-event-interim-text', data);
  }
});

sttEngine.on('stream-text', (data) => {
  wakeDetector.processText(data.text, data);
  desktopAssistant.handleStreamText(data);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('vp-event-stream-text', data);
  }
});

desktopAssistant.on('state-change', (data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('vp-event-assistant-state', data);
  }
});

desktopAssistant.on('assistant-turn', (data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('vp-event-assistant-turn', data);
  }
});

wakeDetector.on('wake-word', (data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('vp-event-wake-word', data);
  }
});

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
 * Handle streaming dictated text to a RobOS agent
 */
async function handleAgentStream(payload = {}) {
  const text = (payload.text || '').trim();
  const agentId = payload.agentId || 'fast-reactive';
  const isAuto = Boolean(payload.isAuto);

  if (!text) {
    return { ok: false, error: 'text is required' };
  }

  const context = payload.context || (await contextProvider.getAggregatedContext());
  let agentResponseText = '';
  let usedAgent = agentId;

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
        const promptWithContext = `Context: ${context.summary || 'RobOS Workspace'}\nUser voice prompt: "${text}"`;
        const res = await aiAgent.ask(promptWithContext, { providerId: agentId });
        if (res && res.ok) {
          agentResponseText = res.text;
        } else {
          agentResponseText = `Agent received: "${text}" (processed with ${agentId})`;
        }
      } else {
        agentResponseText = `Agent received: "${text}" (processed with ${agentId})`;
      }
    } catch (err) {
      agentResponseText = `Agent received: "${text}" (processed with ${agentId})`;
    }
  } else {
    agentResponseText = `[Fast Reactive Assistant] Processed: "${text}"`;
  }

  const eventPayload = {
    type: 'agent_stream',
    agentId: usedAgent,
    text,
    response: agentResponseText,
    context,
    isAuto,
    timestamp: new Date().toISOString(),
  };

  sttEngine.emit('interim-text', {
    type: 'agent_stream',
    agentId: usedAgent,
    text,
    agentResponse: agentResponseText,
    isFinal: true,
  });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('vp-event-agent-response', eventPayload);
  }

  return { ok: true, agentId: usedAgent, text, response: agentResponseText, context };
}

/**
 * Starts HTTP REST API Server on port 19188
 */
function startApiServer(overridePort) {
  if (overridePort) {
    currentApiPort = overridePort;
  } else if (process.env.ROBOS_VOICE_PORT) {
    currentApiPort = parseInt(process.env.ROBOS_VOICE_PORT, 10);
  }
  if (apiServer) return apiServer;

  apiServer = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url, `http://localhost:${currentApiPort}`);
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
          backgroundMode: sttEngine.isBackgroundMode(),
          configuredDevice: prefs.configuredDevice,
          activeApp: activeWin.appId || 'desktop',
          activeWindowTitle: activeWin.title,
          totalPrompts: prompts.length,
          interimText: sttEngine.lastInterimText || '',
          port: currentApiPort,
          ttsEngine: ttsEngine.getPrefs().engine,
          assistantState: desktopAssistant.getState(),
          wakeWordEnabled: wakeDetector.isEnabled(),
        }));
      }

      // 1.1 GET /api/stream — Server-Sent Events (SSE) for live streaming dictation
      if (pathname === '/api/stream' && method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        const onStream = (data) => {
          try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
        };
        sttEngine.on('stream-text', onStream);
        sttEngine.on('interim-text', onStream);
        req.on('close', () => {
          sttEngine.off('stream-text', onStream);
          sttEngine.off('interim-text', onStream);
        });
        return;
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
        let promptEntry = null;
        if (!result.backgroundMode && result.text && result.text.trim()) {
          promptEntry = await handleDictation(result.text, {
            durationMs: result.durationMs,
            confidence: 0.95,
            device: sttEngine.configuredDevice,
          });
        }
        const fullResult = { ...result, prompt: promptEntry };
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('vp-event-deactivated', fullResult);
        }
        res.writeHead(200);
        return res.end(JSON.stringify(fullResult));
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

      // 5.1 POST /api/agent-stream — stream text to a RobOS agent
      if (pathname === '/api/agent-stream' && method === 'POST') {
        const body = await parseBody(req);
        const result = await handleAgentStream(body);
        res.writeHead(result.ok ? 200 : 400);
        return res.end(JSON.stringify(result));
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

      // 10.1 POST /api/speak or POST /api/tts/speak — outgoing speech synthesis
      if ((pathname === '/api/speak' || pathname === '/api/tts/speak') && method === 'POST') {
        const body = await parseBody(req);
        const text = typeof body === 'string' ? body : (body.text || '');
        const result = await ttsEngine.speak(text, typeof body === 'object' ? body : {});
        res.writeHead(result.ok ? 200 : 400);
        return res.end(JSON.stringify(result));
      }

      // 10.2 POST /api/stop-speaking — stop active audio playback
      if (pathname === '/api/stop-speaking' && method === 'POST') {
        ttsEngine.stop();
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, stopped: true }));
      }

      // 10.3 GET /api/voices — enumerate available TTS voices
      if (pathname === '/api/voices' && method === 'GET') {
        const voices = await ttsEngine.listVoices();
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, voices }));
      }

      // 10.4 GET /api/tts/config & POST /api/tts/config — TTS preferences
      if (pathname === '/api/tts/config') {
        if (method === 'GET') {
          res.writeHead(200);
          return res.end(JSON.stringify({ ok: true, config: ttsEngine.getPrefs() }));
        }
        if (method === 'POST') {
          const body = await parseBody(req);
          const updated = ttsEngine.savePrefs(body);
          res.writeHead(200);
          return res.end(JSON.stringify({ ok: true, config: updated }));
        }
      }

      // 10.5 POST /api/background/start & POST /api/background/stop — ephemeral stream mode
      if (pathname === '/api/background/start' && method === 'POST') {
        const body = await parseBody(req);
        const result = await sttEngine.activate({ ...body, backgroundMode: true });
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('vp-event-activated', result);
        }
        res.writeHead(200);
        return res.end(JSON.stringify(result));
      }

      if (pathname === '/api/background/stop' && method === 'POST') {
        const result = await sttEngine.deactivate();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('vp-event-deactivated', result);
        }
        res.writeHead(200);
        return res.end(JSON.stringify(result));
      }

      // 10.6 POST /api/assistant/chat — interact directly with Desktop Assistant
      if (pathname === '/api/assistant/chat' && method === 'POST') {
        const body = await parseBody(req);
        const query = typeof body === 'string' ? body : (body.message || body.text || body.query || '');
        const result = await desktopAssistant.processQuery(query, typeof body === 'object' ? body : {});
        res.writeHead(result.ok ? 200 : 400);
        return res.end(JSON.stringify(result));
      }

      // 10.7 GET /api/assistant/history & DELETE /api/assistant/history
      if (pathname === '/api/assistant/history') {
        if (method === 'GET') {
          res.writeHead(200);
          return res.end(JSON.stringify({ ok: true, history: desktopAssistant.getHistory() }));
        }
        if (method === 'DELETE') {
          const result = desktopAssistant.clearHistory();
          res.writeHead(200);
          return res.end(JSON.stringify(result));
        }
      }

      // 10.8 POST /api/wake-word/toggle — enable or disable wake-word detection
      if (pathname === '/api/wake-word/toggle' && method === 'POST') {
        const body = await parseBody(req);
        const enabled = body.enabled !== false;
        wakeDetector.setEnabled(enabled);
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, enabled: wakeDetector.isEnabled() }));
      }

      // 10.9 POST /api/stream/simulate — push simulated speech chunk into the stream
      if (pathname === '/api/stream/simulate' && method === 'POST') {
        const body = await parseBody(req);
        const text = typeof body === 'string' ? body : (body.text || '');
        const isFinal = Boolean(body.isFinal);
        const chunk = sttEngine.simulateStreamChunk(text, isFinal);
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, chunk }));
      }

      // 10.10 GET /api/skills & POST /api/skills/execute — execute RobOS skills via voice/API
      if (pathname === '/api/skills' && method === 'GET') {
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, skills: desktopAssistant.skillsExecutor.getSupportedSkills() }));
      }

      if (pathname === '/api/skills/execute' && method === 'POST') {
        const body = await parseBody(req);
        const command = typeof body === 'string' ? body : (body.command || body.query || body.message || '');
        const context = await contextProvider.getAggregatedContext();
        const result = await desktopAssistant.skillsExecutor.executeCommand(command, context, typeof body === 'object' ? body : {});
        res.writeHead(result.ok ? 200 : 400);
        return res.end(JSON.stringify(result));
      }

      // 11. Debug / Testing endpoints for harness & snapshot-cli: /eval, /health
      if (pathname === '/eval' && method === 'POST') {
        const body = await parseBody(req);
        const js = (typeof body === 'string' ? body : body.__raw || body.text || body.js || '');
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
          try {
            const result = await mainWindow.webContents.executeJavaScript(js || 'null');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ result }));
          } catch (err) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: err.message, result: null }));
          }
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ result: null }));
        }
      }

      if (pathname === '/health' && method === 'GET') {
        if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents || mainWindow.webContents.isLoading()) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, loading: true }));
        }
        const title = (typeof mainWindow.getTitle === 'function') ? mainWindow.getTitle() : 'RobOS Voice Prompt';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, appId: 'voice-prompt', title }));
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

  apiServer.listen(currentApiPort, () => {
    console.log(`[voice-prompt] API server listening on http://localhost:${currentApiPort}`);
  });

  apiServer.on('close', () => {
    apiServer = null;
  });

  return apiServer;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'RobOS Voice',
    icon: path.join(__dirname, 'icon.svg'),
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
        const res = await sttEngine.deactivate();
        let promptEntry = null;
        if (res.text && res.text.trim()) {
          promptEntry = await handleDictation(res.text, {
            durationMs: res.durationMs,
            confidence: 0.95,
            device: sttEngine.configuredDevice,
          });
        }
        const fullResult = { ...res, prompt: promptEntry };
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('vp-event-deactivated', fullResult);
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
    backgroundMode: sttEngine.isBackgroundMode(),
    configuredDevice: prefs.configuredDevice,
    activeApp: activeWin.appId || 'desktop',
    activeWindowTitle: activeWin.title,
    totalPrompts: promptStore.loadPrompts().length,
    ttsEngine: ttsEngine.getPrefs().engine,
    assistantState: desktopAssistant.getState(),
    wakeWordEnabled: wakeDetector.isEnabled(),
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
  let promptEntry = null;
  if (!res.backgroundMode && res.text && res.text.trim()) {
    promptEntry = await handleDictation(res.text, {
      durationMs: res.durationMs,
      confidence: 0.95,
      device: sttEngine.configuredDevice,
    });
  }
  const fullResult = { ...res, prompt: promptEntry };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('vp-event-deactivated', fullResult);
  }
  return fullResult;
});

ipcMain.handle('vp-dictate', async (_e, payload) => {
  const text = typeof payload === 'string' ? payload : (payload?.text || '');
  return handleDictation(text, payload || {});
});

ipcMain.handle('vp-stream-to-agent', async (_e, payload) => {
  return handleAgentStream(payload || {});
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

// Outgoing TTS IPC handlers
ipcMain.handle('vp-tts-speak', async (_e, text, options) => {
  return ttsEngine.speak(text, options || {});
});

ipcMain.handle('vp-tts-stop', () => {
  ttsEngine.stop();
  return { ok: true, stopped: true };
});

ipcMain.handle('vp-tts-get-voices', async () => {
  return ttsEngine.listVoices();
});

ipcMain.handle('vp-tts-get-prefs', () => {
  return ttsEngine.getPrefs();
});

ipcMain.handle('vp-tts-save-prefs', (_e, prefs) => {
  return ttsEngine.savePrefs(prefs);
});

// Background stream & Desktop Assistant IPC handlers
ipcMain.handle('vp-background-toggle', async (_e, enable) => {
  if (enable) {
    const res = await sttEngine.activate({ backgroundMode: true });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('vp-event-activated', res);
    }
    return res;
  } else {
    const res = await sttEngine.deactivate();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('vp-event-deactivated', res);
    }
    return res;
  }
});

ipcMain.handle('vp-assistant-chat', async (_e, query, options) => {
  return desktopAssistant.processQuery(query, options || {});
});

ipcMain.handle('vp-assistant-get-history', () => {
  return desktopAssistant.getHistory();
});

ipcMain.handle('vp-assistant-clear-history', () => {
  return desktopAssistant.clearHistory();
});

ipcMain.handle('vp-wake-word-toggle', (_e, enabled) => {
  wakeDetector.setEnabled(enabled !== false);
  return { ok: true, enabled: wakeDetector.isEnabled() };
});

ipcMain.handle('vp-skills-list', () => {
  return desktopAssistant.skillsExecutor.getSupportedSkills();
});

ipcMain.handle('vp-skills-execute', async (_e, command, options) => {
  const context = await contextProvider.getAggregatedContext();
  return desktopAssistant.skillsExecutor.executeCommand(command, context, options || {});
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
  handleAgentStream,
  sttEngine,
  ttsEngine,
  wakeDetector,
  desktopAssistant,
  promptStore,
  contextProvider,
};
