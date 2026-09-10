'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

let win;
let _debugServer = null;
try {
  _debugServer = require('/usr/local/share/robos/robos-lib/dom-snapshot');
} catch {
  try {
    _debugServer = require('../robos-lib/dom-snapshot');
  } catch {}
}

const isTestMode = !!(process.env.ROBOS_TEST || process.env.ROBOS_DEMO_SHOW);
if (!isTestMode) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    process.exit(0);
  }
}

// In-memory state for RobOS IntelliJ Plugin IPC Server
const runConfigs = new Map();
const registeredWebhooks = new Set();
const ephemeralWorkspaces = new Map();

// Seed initial run configuration
runConfigs.set('Debug PetServiceTest', {
  name: 'Debug PetServiceTest',
  type: 'JUnit',
  projectPath: '/home/ndipiazza/source/robos/packages/robos-agent-session/demo-app',
  mainClassOrCommand: 'com.acme.petshop.service.PetServiceTest',
  env: {
    SPRING_PROFILES_ACTIVE: 'test',
    MTLS_KEYSTORE: 'pass:acme/vaccine-gateway-mTLS',
  },
  status: 'SUSPENDED',
  mode: 'debug',
  pid: 18402,
});

let threadState = {
  threadId: 'thread-exec-1',
  threadName: 'http-nio-8080-exec-1',
  status: 'SUSPENDED',
  suspendedAtFile: 'PetService.java',
  suspendedAtLine: 48,
  frames: [
    { file: 'PetService.java', className: 'com.acme.petshop.service.PetService', methodName: 'adoptPet', line: 48 },
    { file: 'PetController.java', className: 'com.acme.petshop.web.PetController', methodName: 'processAdoption', line: 104 },
    { file: 'SecurityFilterChain.java', className: 'org.springframework.security.web.SecurityFilterChain', methodName: 'doFilterInternal', line: 221 },
  ],
  variables: {
    pet: '{Pet@1402} "id=a81b2c-91, species=Canine, ageMonths=4, status=PENDING"',
    tagId: '"VAX-2026-9814"',
    vaccineGateway: '{VaccineGatewayClient@1499} (mTLS target: https://localhost:8443)',
    stateCompliant: 'false',
  },
};

function dispatchWebhooks(eventData) {
  for (const urlStr of registeredWebhooks) {
    try {
      const u = new URL(urlStr);
      const req = http.request(u, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'RobOS-IntelliJ-Plugin/1.0',
        },
        timeout: 2000,
      });
      req.on('error', () => {});
      req.write(JSON.stringify(eventData));
      req.end();
    } catch (_) {}
  }
}

function resolveSecrets(envObj = {}) {
  const resolved = {};
  for (const [k, v] of Object.entries(envObj)) {
    if (typeof v === 'string' && v.startsWith('pass:')) {
      resolved[k] = `[RESOLVED_GPG_PASS:${v.replace('pass:', '')}]`;
    } else {
      resolved[k] = v;
    }
  }
  return resolved;
}

let httpServer = null;
try {
  httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:63343');
    const pathname = url.pathname;
    const params = Object.fromEntries(url.searchParams.entries());

    const readBody = () => new Promise(resolve => {
      let b = '';
      req.on('data', chunk => b += chunk);
      req.on('end', () => {
        try { resolve(JSON.parse(b)); } catch { resolve({}); }
      });
    });

    // 1. Health
    if (pathname === '/robos/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'OK',
        ide: 'IntelliJ IDEA Ultimate 2026.1',
        port: 63343,
        plugin: 'com.robos.intellij',
        version: '1.0.0',
      }));
      return;
    }

    // 2. Open File
    if (pathname === '/robos/open-file') {
      if (win) win.webContents.send('ide-open-file', params);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, action: 'open-file', params }));
      return;
    }

    // 3. Set Breakpoint
    if (pathname === '/robos/set-breakpoint') {
      if (win) win.webContents.send('ide-set-breakpoint', params);
      const file = params.file || 'PetService.java';
      const line = parseInt(params.line || '48', 10);
      const enabled = params.enabled !== 'false';

      if (enabled) {
        dispatchWebhooks({
          event: 'breakpoint_hit',
          timestamp: Date.now(),
          file,
          line,
          thread: threadState,
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, action: 'set-breakpoint', file, line, enabled }));
      return;
    }

    // 4. Create Run Configuration with Secret Handling
    if (pathname === '/robos/run-config/create') {
      const body = await readBody();
      const name = body.name || params.name || 'New Run Config';
      const type = body.type || 'Application';
      const rawEnv = body.env || {};
      const resolvedEnv = resolveSecrets(rawEnv);

      const record = {
        name,
        type,
        projectPath: body.projectPath || null,
        mainClassOrCommand: body.mainClassOrCommand || null,
        env: resolvedEnv,
        status: 'READY',
      };
      runConfigs.set(name, record);

      if (win) win.webContents.send('ide-run-config-created', record);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        name,
        type,
        status: 'READY',
        secretsResolved: Object.keys(rawEnv).filter(k => typeof rawEnv[k] === 'string' && rawEnv[k].startsWith('pass:')).length,
        runConfig: record,
      }));
      return;
    }

    // 5. Run/Debug Configuration
    if (pathname === '/robos/run-config/run' || pathname === '/robos/run') {
      const body = req.method === 'POST' ? await readBody() : {};
      const name = body.name || params.name || 'Debug PetServiceTest';
      const mode = body.mode || params.mode || 'debug';

      let cfg = runConfigs.get(name);
      if (!cfg) {
        cfg = { name, type: 'Application', status: 'RUNNING', mode, pid: Math.floor(Math.random() * 9000 + 10000) };
        runConfigs.set(name, cfg);
      } else {
        cfg.status = 'RUNNING';
        cfg.mode = mode;
        cfg.pid = Math.floor(Math.random() * 9000 + 10000);
      }

      if (win) win.webContents.send('ide-run', { name, mode, cfg });

      // Trigger breakpoint if in debug mode
      if (mode === 'debug') {
        setTimeout(() => {
          dispatchWebhooks({
            event: 'breakpoint_hit',
            timestamp: Date.now(),
            file: 'PetService.java',
            line: 48,
            thread: threadState,
          });
        }, 600);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, name, mode, status: cfg.status, pid: cfg.pid }));
      return;
    }

    // 6. Stop Configuration
    if (pathname === '/robos/run-config/stop' || pathname === '/robos/stop') {
      const name = params.name || 'Debug PetServiceTest';
      const cfg = runConfigs.get(name);
      if (cfg) {
        cfg.status = 'STOPPED';
        cfg.pid = null;
      }

      // Check ephemeral workspaces for auto-destroy on session end
      for (const [wsId, ws] of ephemeralWorkspaces.entries()) {
        if (ws.autoRunConfig === name && ws.autoDestroyOnSessionEnd) {
          ephemeralWorkspaces.delete(wsId);
        }
      }

      if (win) win.webContents.send('ide-stop', { name });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, name, status: 'STOPPED' }));
      return;
    }

    // 7. Register Webhook for Breakpoint Events
    if (pathname === '/robos/webhook/register') {
      const body = await readBody();
      const webhookUrl = body.webhookUrl || params.webhookUrl;
      if (!webhookUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'webhookUrl required' }));
        return;
      }
      registeredWebhooks.add(webhookUrl);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, registered: webhookUrl, total: registeredWebhooks.size }));
      return;
    }

    // 8. Get Paused Thread State & Stack
    if (pathname === '/robos/debug/thread-state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, thread: threadState }));
      return;
    }

    // 9. Ephemeral Multi-Project Workspaces
    if (pathname === '/robos/workspace/ephemeral') {
      const body = await readBody();
      const workspaceId = body.workspaceId || `ws-${Date.now()}`;
      const projects = body.projects || ['/tmp/petstore-api', '/tmp/petstore-web'];
      const autoRunConfig = body.autoRunConfig || null;
      const autoDestroyOnSessionEnd = body.autoDestroyOnSessionEnd !== false;

      const ws = {
        workspaceId,
        projects,
        autoRunConfig,
        autoDestroyOnSessionEnd,
        createdAt: Date.now(),
        status: 'ACTIVE',
      };
      ephemeralWorkspaces.set(workspaceId, ws);

      if (win) win.webContents.send('ide-ephemeral-workspace', ws);

      if (autoRunConfig) {
        setTimeout(() => {
          dispatchWebhooks({
            event: 'breakpoint_hit',
            timestamp: Date.now(),
            file: 'PetService.java',
            line: 48,
            thread: threadState,
          });
        }, 500);
      }

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, workspace: ws }));
      return;
    }

    // 10. Destroy Workspace
    if (pathname === '/robos/workspace/destroy') {
      const wsId = params.workspaceId;
      const existed = ephemeralWorkspaces.delete(wsId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: existed, workspaceId: wsId }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  httpServer.listen(63343, '127.0.0.1');
} catch (e) {
  console.warn('[packages/intellij-idea] Warning on server listen:', e.message);
}

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1040,
    height: 680,
    title: 'IntelliJ IDEA Ultimate 2026.1 - robos-java-service',
    backgroundColor: '#1e1f22',
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

  if (_debugServer) _debugServer.startDebugServer(win, 19157);
});

app.on('window-all-closed', () => {
  if (httpServer) httpServer.close();
  app.quit();
});
