'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

app.setName('robos-agent-chat');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'agent-chat'));
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// ── Shared libraries ──────────────────────────────────────────────────────────
let _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) { try { _debugServer = require(p); break; } catch {} }
} catch {}

let log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'logger'),
    path.resolve(__dirname, '..', 'robos-lib', 'logger'),
    '/usr/local/share/robos/robos-lib/logger',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { const m = require(p); log = m.createLogger('agent-chat'); m.registerLogsIPC && m.registerLogsIPC(ipcMain); break; } catch {}
  }
} catch {}

// ── Sessions & Storage ────────────────────────────────────────────────────────
const SESSIONS_FILE = path.join(os.homedir(), '.config', 'robos', 'agent-chat-sessions.json');

const DEFAULT_SESSIONS = [
  {
    id: 'session-rabies-101',
    title: 'Vaccination Tracking Feature',
    updatedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    model: 'claude-3-7-sonnet',
    mode: 'agent',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        text: 'Implement rabies vaccination record tracking for Acme Petshop: add the endpoint in the REST client, migrate the PostgreSQL database, deploy to the local Kube cluster, and file the PR for review.',
        timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
        context: ['@workspace:acme-petshop', '@file:src/main/java/PetController.java', '#symbol:PetRecord']
      },
      {
        id: 'msg-2',
        role: 'assistant',
        timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
        model: 'Claude 3.7 Sonnet',
        thinking: `1. Inspect System Topology C4 graph for acme-petshop dependencies.\n2. Identified database node 'petshop-db' (PostgreSQL) and REST service.\n3. Execute DDL migration on PostgreSQL container via Relational DB Manager.\n4. Synthesize Bruno .bru request and execute automated HTTP assertions.\n5. Roll out updated petshop-api-v2 Kubernetes deployment.\n6. Publish PR branch and trigger PR Review Theater with knowledge checks.`,
        tools: [
          { name: 'robos_ekgraph_update_node', app: 'System Topology Studio', status: 'completed', result: 'Added vaccination contract & computed blast radius (3 downstream clients)' },
          { name: 'robos_db_execute_sql', app: 'Relational DB Manager', status: 'completed', result: 'ALTER TABLE pets ADD COLUMN rabies_vaccinated BOOLEAN NOT NULL DEFAULT FALSE;' },
          { name: 'robos_rest_send_request', app: 'REST API Client', status: 'completed', result: 'POST /api/v1/pets/101/vaccinations -> 201 Created (14ms)' },
          { name: 'robos_kube_rollout_restart', app: 'Kube Studio', status: 'completed', result: 'Deployment/petshop-api rolled out (1/1 Running)' },
          { name: 'robos_pr_review_theater_open', app: 'PR Review Theater', status: 'completed', result: 'Launched Stage 1 eLearning & Knowledge Check Quiz' }
        ],
        text: `I have completed the full orchestration cascade for rabies vaccination tracking across Acme Petshop:\n\n### 1. Database Migration Applied\nThe PostgreSQL schema has been updated via **Relational DB Manager**:\n\`\`\`sql\nALTER TABLE pets \nADD COLUMN rabies_vaccinated BOOLEAN NOT NULL DEFAULT FALSE,\nADD COLUMN rabies_vaccination_date TIMESTAMP WITH TIME ZONE;\nCREATE INDEX idx_pets_rabies_status ON pets(rabies_vaccinated);\n\`\`\`\n\n### 2. REST API Contract & Bruno Test Verified\nSynthesized \`.bru\` plain-text collection in **REST API Client** and executed against local server:\n\`\`\`bash\nPOST http://localhost:8080/api/v1/pets/101/vaccinations\nStatus: 201 Created | Time: 14ms | Assertion: res.body.rabies_vaccinated == true [PASS]\n\`\`\`\n\n### 3. Kubernetes Deployment & Pod Log Streaming\nUpdated manifests applied to **Kube Studio**. The container \`petshop-api-v2\` is now \`1/1 Running\` with verified database health checks.\n\n### 4. PR Review Theater Ready\nThe pull request has been opened and the **PR Review Theater** is now active with an anti-rubber-stamp knowledge check quiz and living architecture guide for lead architect sign-off.`
      }
    ]
  },
  {
    id: 'session-blast-radius-102',
    title: 'Audit Auth Microservice Blast Radius',
    updatedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    model: 'openai-o3-mini',
    mode: 'chat',
    messages: [
      {
        id: 'msg-br-1',
        role: 'user',
        text: 'What happens if we deprecate the OAuth 2.0 refresh_token grant type in identity-service?',
        timestamp: new Date(Date.now() - 1000 * 60 * 179).toISOString(),
        context: ['@kgraph:identity-service']
      },
      {
        id: 'msg-br-2',
        role: 'assistant',
        timestamp: new Date(Date.now() - 1000 * 60 * 178).toISOString(),
        model: 'OpenAI o3-mini',
        thinking: `Querying Dual-State Knowledge Graph for consumer dependencies of identity-service... Found 4 dependent microservices and 2 mobile apps.`,
        tools: [
          { name: 'robos_ekgraph_impact_analysis', app: 'System Topology Studio', status: 'completed', result: 'Found 6 dependent consumer nodes: checkout-api, mobile-app-ios, mobile-app-android, partner-gateway' }
        ],
        text: `According to the **Dual-State Knowledge Graph**, deprecating \`refresh_token\` carries a **High Blast Radius**:\n\n- **Directly Impacted Clients**: \`mobile-app-ios\`, \`mobile-app-android\`, and \`checkout-api\`.\n- **Contract Break**: Consumer-driven contract test in \`checkout-api/pact/auth-consumer.json\` expects \`refresh_token\` grant.\n\n**Recommendation**: Retain fallback grant for 2 minor releases and trigger automated migration notices via **Workflow Studio**.`
      }
    ]
  }
];

function readSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    }
  } catch (err) {
    log.error('Failed to read sessions', err);
  }
  return DEFAULT_SESSIONS;
}

function saveSessions(sessions) {
  try {
    const dir = path.dirname(SESSIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
  } catch (err) {
    log.error('Failed to save sessions', err);
  }
}

// ── Window Management ─────────────────────────────────────────────────────────
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 840,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
    title: 'RobOS Agent Chat',
    autoHideMenuBar: true,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) {
    _debugServer.registerSnapshotIPC && _debugServer.registerSnapshotIPC(mainWindow);
    _debugServer.startDebugServer(mainWindow, 19186, 'agent-chat');
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC Handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('chat:get-sessions', () => {
  return readSessions();
});

ipcMain.handle('chat:create-session', (_event, title) => {
  const sessions = readSessions();
  const newSession = {
    id: 'session-' + Date.now(),
    title: title || 'New Agent Chat',
    updatedAt: new Date().toISOString(),
    model: 'claude-3-7-sonnet',
    mode: 'agent',
    messages: []
  };
  sessions.unshift(newSession);
  saveSessions(sessions);
  return newSession;
});

ipcMain.handle('chat:delete-session', (_event, id) => {
  let sessions = readSessions();
  sessions = sessions.filter(s => s.id !== id);
  saveSessions(sessions);
  return { success: true };
});

ipcMain.handle('chat:get-messages', (_event, id) => {
  const sessions = readSessions();
  const session = sessions.find(s => s.id === id);
  return session ? session.messages : [];
});

ipcMain.handle('chat:popout-prompt', (_event, text) => {
  log.info('Popping out floating prompt with text:', text);
  try {
    const aiPromptPath = path.resolve(__dirname, '..', 'ai-prompt');
    cp.spawn('electron', [aiPromptPath, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], {
      detached: true,
      stdio: 'ignore'
    }).unref();
    return { success: true };
  } catch (err) {
    log.error('Failed to spawn ai-prompt', err);
    return { error: err.message };
  }
});

ipcMain.handle('chat:get-tools', () => {
  return [
    { name: 'robos_ekgraph_update_node', app: 'System Topology Studio', description: 'Update entity node in Knowledge Graph and calculate blast radius' },
    { name: 'robos_ekgraph_impact_analysis', app: 'System Topology Studio', description: 'Trace upstream/downstream blast radius across C4 topology' },
    { name: 'robos_db_execute_sql', app: 'Relational DB Manager', description: 'Execute DDL migrations and queries in PostgreSQL/MySQL/Oracle' },
    { name: 'robos_db_inspect_schema', app: 'Relational DB Manager', description: 'Inspect tables, columns, indexes, and constraints' },
    { name: 'robos_rest_send_request', app: 'REST API Client', description: 'Execute Git-backed Bruno (.bru) HTTP request and test assertions' },
    { name: 'robos_kube_rollout_restart', app: 'Kube Studio', description: 'Trigger rolling restart and verify pod readiness' },
    { name: 'robos_kube_get_logs', app: 'Kube Studio', description: 'Stream container stdout/stderr logs in real time' },
    { name: 'robos_pr_review_theater_open', app: 'PR Review Theater', description: 'Open interactive 6-stage review cockpit and knowledge check' },
    { name: 'robos_ide_breakpoint_debug', app: 'IntelliJ / VS Code Bridge', description: 'Trigger IDE breakpoint and inspect paused thread stack' },
    { name: 'robos_nosql_query', app: 'NoSQL DB Manager', description: 'Query MongoDB collections and Redis key-value stores' },
    { name: 'robos_grpc_invoke', app: 'gRPC Client', description: 'Invoke Protobuf RPC method with reflection support' },
    { name: 'robos_graphql_query', app: 'GraphQL Client', description: 'Execute GraphQL query or mutation with variables' }
  ];
});

ipcMain.handle('chat:get-workspaces', () => {
  return [
    { name: 'acme-petshop', path: '/home/developer/source/acme-petshop', branch: 'feature/rabies-tracking' },
    { name: 'robos', path: '/home/developer/source/robos', branch: 'main' }
  ];
});

ipcMain.handle('chat:send-message', async (event, payload) => {
  const { sessionId, message, model, mode, context } = payload;
  const sessions = readSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return { error: 'Session not found' };

  const userMsg = {
    id: 'msg-' + Date.now(),
    role: 'user',
    text: message,
    timestamp: new Date().toISOString(),
    context: context || []
  };
  session.messages.push(userMsg);
  session.updatedAt = new Date().toISOString();

  // Create assistant message
  const assistantMsgId = 'msg-' + (Date.now() + 1);
  const assistantMsg = {
    id: assistantMsgId,
    role: 'assistant',
    timestamp: new Date().toISOString(),
    model: model || 'Claude 3.7 Sonnet',
    thinking: '',
    tools: [],
    text: ''
  };

  session.messages.push(assistantMsg);
  saveSessions(sessions);

  // Stream thought process
  const thoughts = [
    'Analyzing natural language intent and relevant SDLC context...',
    'Inspecting active Knowledge Graph packages and System Topology Studio...',
    'Checking database schema migrations required in Relational DB Manager...',
    'Synthesizing Bruno API collection and test assertions in REST API Client...',
    'Deploying container manifests and checking health status in Kube Studio...'
  ];

  for (const thought of thoughts) {
    assistantMsg.thinking += (assistantMsg.thinking ? '\n' : '') + '• ' + thought;
    event.sender.send('chat:chunk', { sessionId, messageId: assistantMsgId, thinking: assistantMsg.thinking });
    await new Promise(r => setTimeout(r, 200));
  }

  // Dispatch simulated tools based on keywords
  const tools = [];
  if (message.toLowerCase().includes('database') || message.toLowerCase().includes('sql') || message.toLowerCase().includes('migrate') || message.toLowerCase().includes('petshop')) {
    tools.push({ name: 'robos_db_execute_sql', app: 'Relational DB Manager', status: 'completed', result: '✓ Migration executed: schema updated' });
  }
  if (message.toLowerCase().includes('rest') || message.toLowerCase().includes('api') || message.toLowerCase().includes('endpoint') || message.toLowerCase().includes('petshop')) {
    tools.push({ name: 'robos_rest_send_request', app: 'REST API Client', status: 'completed', result: '✓ POST /api/v1/pets/vaccinations -> 201 Created' });
  }
  if (message.toLowerCase().includes('kube') || message.toLowerCase().includes('pod') || message.toLowerCase().includes('deploy') || message.toLowerCase().includes('petshop')) {
    tools.push({ name: 'robos_kube_rollout_restart', app: 'Kube Studio', status: 'completed', result: '✓ Deployment rolled out (1/1 Running)' });
  }
  if (message.toLowerCase().includes('pr') || message.toLowerCase().includes('review') || message.toLowerCase().includes('petshop')) {
    tools.push({ name: 'robos_pr_review_theater_open', app: 'PR Review Theater', status: 'completed', result: '✓ Review Theater cockpit opened' });
  }

  assistantMsg.tools = tools;
  event.sender.send('chat:tool-event', { sessionId, messageId: assistantMsgId, tools });

  // Stream text response
  let responseText = '';
  if (message.toLowerCase().includes('petshop') || message.toLowerCase().includes('rabies')) {
    responseText = `I have executed the requested modifications across the active RobOS apps:\n\n1. **System Topology Studio**: Updated the architecture graph with the new vaccination relation.\n2. **Relational DB Manager**: Applied the PostgreSQL schema migration.\n3. **REST API Client**: Generated and verified the Bruno \`.bru\` test request (Status: 201 Created).\n4. **Kube Studio**: Rolled out the service update to the local cluster.\n5. **PR Review Theater**: Opened the 6-stage review cockpit for Lead Architect verification.`;
  } else {
    responseText = `I processed your request using **${model || 'Claude 3.7 Sonnet'}** in **${mode || 'agent'}** mode.\n\n### Execution Summary\n- Analyzed workspace context and active SDLC Knowledge Graph entities.\n- Checked contract compatibility across connected microservices.\n- All verifications passed with zero regression alerts.`;
  }

  const words = responseText.split(' ');
  let partial = '';
  for (const word of words) {
    partial += (partial ? ' ' : '') + word;
    assistantMsg.text = partial;
    event.sender.send('chat:chunk', { sessionId, messageId: assistantMsgId, text: partial });
    await new Promise(r => setTimeout(r, 40));
  }

  saveSessions(sessions);
  return { success: true, message: assistantMsg };
});
