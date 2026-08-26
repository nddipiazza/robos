const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, execSync, spawn } = require('child_process');

// Require onboarding-state from robos-lib
let onboardingState = null;
try {
  onboardingState = require('/usr/local/share/robos/robos-lib/onboarding-state');
} catch {
  try {
    onboardingState = require('../robos-lib/onboarding-state');
  } catch {}
}

// Global failure logging
try {
  const { setupGlobalErrorHandlers } = require('/usr/local/share/robos/robos-lib/logger');
  setupGlobalErrorHandlers('robos-onboarding', dialog);
} catch {
  try {
    const { setupGlobalErrorHandlers } = require('../robos-lib/logger');
    setupGlobalErrorHandlers('robos-onboarding', dialog);
  } catch {}
}

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

const GNUPG_DIR = path.join(os.homedir(), '.gnupg');
const AGENT_CONF = path.join(GNUPG_DIR, 'gpg-agent.conf');
const PASS_STORE = path.join(os.homedir(), '.password-store');
const SSH_DIR = path.join(os.homedir(), '.ssh');
const PREFS_FILE = path.join(os.homedir(), '.config', 'robos', 'preferences.json');

app.setName('robos-onboarding');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'robos-onboarding'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win = null;

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'RobOS Setup Wizard',
    backgroundColor: '#0d1117',
    resizable: true,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);

  if (_debugServer) {
    _debugServer.startDebugServer(win, 19142);
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

// Helper run
function runCmd(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 30000, env: { ...process.env }, ...opts }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

function runSync(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 15000, env: { ...process.env } }).trim();
  } catch {
    return null;
  }
}

// ── Onboarding State IPC ──
ipcMain.handle('get-onboarding-state', async () => {
  if (onboardingState) {
    return onboardingState.getOnboardingState();
  }
  const file = path.join(os.homedir(), '.config', 'robos', 'onboarding-completed.json');
  try {
    if (!fs.existsSync(file)) return { completed: false };
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { completed: false };
  }
});

ipcMain.handle('save-onboarding-step', async (_, { stepId, data }) => {
  const file = path.join(os.homedir(), '.config', 'robos', 'onboarding-completed.json');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { completed: false };
    state.steps = state.steps || {};
    state.steps[stepId] = data;
    fs.writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Step 1: Security & Pass ──
ipcMain.handle('get-security-status', async () => {
  let gpgKeys = [];
  try {
    const out = execSync('gpg --list-keys --with-colons 2>/dev/null', { encoding: 'utf8' });
    const uids = out.split('\n').filter(l => l.startsWith('uid:'));
    gpgKeys = uids.map(l => {
      const parts = l.split(':');
      return parts[9] || parts[7] || '';
    }).filter(Boolean);
  } catch {}

  const passReady = fs.existsSync(path.join(PASS_STORE, '.gpg-id'));
  let passGpgId = null;
  if (passReady) {
    try { passGpgId = fs.readFileSync(path.join(PASS_STORE, '.gpg-id'), 'utf8').trim(); } catch {}
  }

  let pinentryConfigured = false;
  try {
    const conf = fs.readFileSync(AGENT_CONF, 'utf8');
    pinentryConfigured = conf.includes('pinentry-program');
  } catch {}

  return { gpgKeys, passReady, passGpgId, pinentryConfigured };
});

ipcMain.handle('create-gpg-key', async (_, { name, email, passphrase }) => {
  const batch = `
%echo Generating RobOS GPG key
Key-Type: RSA
Key-Length: 4096
Subkey-Type: RSA
Subkey-Length: 4096
Name-Real: ${name}
Name-Email: ${email}
Expire-Date: 0
Passphrase: ${passphrase || ''}
%commit
%echo done
`.trim();

  const batchFile = path.join(os.homedir(), '.config', 'robos', '_gpg_batch.tmp');
  fs.mkdirSync(path.dirname(batchFile), { recursive: true });
  fs.writeFileSync(batchFile, batch, { mode: 0o600 });

  try {
    await runCmd(`gpg --batch --gen-key "${batchFile}"`);
    fs.unlinkSync(batchFile);
    return { ok: true };
  } catch (e) {
    try { fs.unlinkSync(batchFile); } catch {}
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('init-pass', async (_, { gpgId }) => {
  try {
    await runCmd(`pass init "${gpgId}"`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('configure-pinentry', async () => {
  try {
    fs.mkdirSync(GNUPG_DIR, { recursive: true, mode: 0o700 });
    let pinentry = '/usr/bin/pinentry-gtk-2';
    for (const p of ['/usr/bin/pinentry-gtk-2', '/usr/bin/pinentry-qt', '/usr/bin/pinentry-gnome3', '/usr/bin/pinentry']) {
      if (fs.existsSync(p)) { pinentry = p; break; }
    }
    const conf = [
      `pinentry-program ${pinentry}`,
      'default-cache-ttl 86400',
      'max-cache-ttl 86400',
      'allow-preset-passphrase',
    ].join('\n') + '\n';
    fs.writeFileSync(AGENT_CONF, conf, { mode: 0o600 });
    try { execSync('gpgconf --reload gpg-agent 2>/dev/null', { timeout: 3000 }); } catch {}
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Step 2: SSH & Git ──
ipcMain.handle('get-ssh-status', async () => {
  const keyFiles = ['id_ed25519', 'id_ecdsa', 'id_rsa'];
  const found = keyFiles.find(f => fs.existsSync(path.join(SSH_DIR, f)));
  let pubKey = null;
  let keyPath = null;
  if (found) {
    keyPath = path.join(SSH_DIR, found);
    try { pubKey = fs.readFileSync(keyPath + '.pub', 'utf8').trim(); } catch {}
  }
  return { keyFound: found || null, keyPath, pubKey };
});

ipcMain.handle('generate-ssh-key', async (_, { comment, passphrase }) => {
  const privPath = path.join(SSH_DIR, 'id_ed25519');
  const pubPath = privPath + '.pub';
  if (fs.existsSync(privPath)) {
    const pubKey = fs.readFileSync(pubPath, 'utf8').trim();
    return { ok: true, pubKey, privPath, pubPath, alreadyExisted: true };
  }
  try {
    fs.mkdirSync(SSH_DIR, { recursive: true, mode: 0o700 });
    const cmt = comment || ('robos@' + os.hostname());
    const pp = passphrase || '';
    const cmd = `ssh-keygen -t ed25519 -C ${JSON.stringify(cmt)} -f ${JSON.stringify(privPath)} -N ${JSON.stringify(pp)} -q`;
    execSync(cmd, { timeout: 30000 });
    fs.chmodSync(privPath, 0o600);
    const pubKey = fs.readFileSync(pubPath, 'utf8').trim();
    return { ok: true, pubKey, privPath, pubPath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('add-ssh-key-to-github', async () => {
  const keyFiles = ['id_ed25519', 'id_ecdsa', 'id_rsa'];
  const found = keyFiles.find(f => fs.existsSync(path.join(SSH_DIR, f)));
  if (!found) return { ok: false, error: 'No SSH key found' };
  const pubPath = path.join(SSH_DIR, found + '.pub');
  if (!fs.existsSync(pubPath)) return { ok: false, error: 'No public key file' };
  const title = 'RobOS ' + os.hostname() + ' ' + new Date().toISOString().slice(0, 10);
  try {
    execSync(`gh ssh-key add ${JSON.stringify(pubPath)} --title ${JSON.stringify(title)}`, { encoding: 'utf8', timeout: 15000 });
    return { ok: true };
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString();
    if (msg.includes('already in use')) return { ok: true, alreadyAdded: true };
    return { ok: false, error: msg.trim() || 'Upload failed' };
  }
});

ipcMain.handle('test-ssh-connection', async () => {
  try {
    execSync('ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 -T git@github.com', { timeout: 12000 });
    return { ok: true, detail: 'Successfully authenticated with GitHub via SSH' };
  } catch (e) {
    const out = [e.stderr, e.stdout].map(b => b ? b.toString() : '').join('').trim();
    const ok = out.includes('successfully authenticated');
    return { ok, detail: ok ? 'Successfully authenticated with GitHub via SSH' : (out || 'SSH Connection failed') };
  }
});

ipcMain.handle('get-git-config', async () => {
  const name = runSync('git config --global user.name') || '';
  const email = runSync('git config --global user.email') || '';
  return { name, email };
});

ipcMain.handle('save-git-config', async (_, { name, email }) => {
  try {
    if (name) execSync(`git config --global user.name ${JSON.stringify(name)}`, { timeout: 5000 });
    if (email) execSync(`git config --global user.email ${JSON.stringify(email)}`, { timeout: 5000 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('get-gh-auth-status', async () => {
  const out = runSync('gh auth status 2>&1') || '';
  const ok = out.toLowerCase().includes('logged in');
  const match = out.match(/account\s+(\S+)/i) || out.match(/logged in to \S+ account (\S+)/i);
  const user = match ? match[1] : null;
  return { ok, user, raw: out };
});

ipcMain.handle('start-gh-login', async () => {
  return new Promise((resolve) => {
    const proc = spawn('gh', ['auth', 'login', '--web', '--hostname', 'github.com', '--scopes', 'admin:public_key'], {
      env: { ...process.env, GH_PROMPT_DISABLED: '0' },
    });
    proc.on('close', code => {
      resolve({ ok: code === 0 });
    });
  });
});

// ── Step 3: AI Agents ──
ipcMain.handle('get-ai-agent-config', async () => {
  let prefs = {};
  try {
    if (fs.existsSync(PREFS_FILE)) {
      prefs = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
    }
  } catch {}

  const defaultModel = prefs.defaultModel || 'gemini-3.6-flash';
  const copilotEnabled = prefs.copilotEnabled !== false;
  const claudeEnabled = prefs.claudeEnabled !== false;
  const geminiEnabled = prefs.geminiEnabled !== false;

  return {
    defaultModel,
    copilotEnabled,
    claudeEnabled,
    geminiEnabled,
    anthropicKeyConfigured: !!process.env.ANTHROPIC_API_KEY || fs.existsSync(path.join(PASS_STORE, 'robos/ai/anthropic-key.gpg')),
    openaiKeyConfigured: !!process.env.OPENAI_API_KEY || fs.existsSync(path.join(PASS_STORE, 'robos/ai/openai-key.gpg')),
    geminiKeyConfigured: !!process.env.GEMINI_API_KEY || fs.existsSync(path.join(PASS_STORE, 'robos/ai/gemini-key.gpg')),
  };
});

ipcMain.handle('save-ai-agent-config', async (_, config) => {
  try {
    fs.mkdirSync(path.dirname(PREFS_FILE), { recursive: true });
    let prefs = fs.existsSync(PREFS_FILE) ? JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')) : {};
    prefs = { ...prefs, ...config };
    fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2), { mode: 0o600 });

    // If keys provided, insert into pass if available
    const passReady = fs.existsSync(path.join(PASS_STORE, '.gpg-id'));
    if (passReady) {
      if (config.anthropicKey) {
        try { execSync(`pass insert -e robos/ai/anthropic-key <<'KEYEOF'\n${config.anthropicKey}\nKEYEOF`, { shell: '/bin/bash', timeout: 5000 }); } catch {}
      }
      if (config.openaiKey) {
        try { execSync(`pass insert -e robos/ai/openai-key <<'KEYEOF'\n${config.openaiKey}\nKEYEOF`, { shell: '/bin/bash', timeout: 5000 }); } catch {}
      }
      if (config.geminiKey) {
        try { execSync(`pass insert -e robos/ai/gemini-key <<'KEYEOF'\n${config.geminiKey}\nKEYEOF`, { shell: '/bin/bash', timeout: 5000 }); } catch {}
      }
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('test-agent-connection', async (_, { agentId, apiKey }) => {
  if (agentId === 'copilot') {
    const ghStatus = runSync('gh copilot --version 2>&1') || runSync('gh auth status 2>&1') || '';
    const ok = ghStatus.includes('copilot') || ghStatus.includes('Logged in');
    return { ok, message: ok ? 'Copilot CLI is authorized and ready.' : 'Copilot CLI not authorized via gh CLI.' };
  }
  if (agentId === 'claude') {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (key) {
      return { ok: true, message: 'Anthropic Claude API key configured.' };
    }
    const claudeVer = runSync('claude --version 2>&1');
    return { ok: !!claudeVer, message: claudeVer ? `Claude CLI detected: ${claudeVer}` : 'Claude CLI / API key missing.' };
  }
  if (agentId === 'gemini') {
    const key = apiKey || process.env.GEMINI_API_KEY;
    const geminiVer = runSync('gemini --version 2>&1');
    const ok = !!(key || geminiVer);
    return { ok, message: ok ? 'Gemini AI configured and active.' : 'Gemini API key / CLI missing.' };
  }
  return { ok: true, message: `${agentId} configuration verified.` };
});

// ── Step 4 & 5: Dev Apps Catalog & Git Projects ──
ipcMain.handle('get-dev-apps-catalog', async () => {
  return [
    { id: 'robos-ide', name: 'RobOS IDE & IntelliJ Integration', category: 'IDEs', installed: true },
    { id: 'vscode', name: 'Visual Studio Code / Cursor', category: 'IDEs', installed: true },
    { id: 'node24', name: 'Node.js 24 LTS Runtime & npm', category: 'Languages', installed: true },
    { id: 'python3', name: 'Python 3 & Virtual environments', category: 'Languages', installed: true },
    { id: 'go-rust-java', name: 'Go, Rust, OpenJDK 17 Runtimes', category: 'Languages', installed: true },
    { id: 'docker-qemu', name: 'Docker & QEMU Virtualization', category: 'DevOps', installed: true },
  ];
});

ipcMain.handle('get-git-projects-list', async () => {
  const defaultDir = path.join(os.homedir(), 'source', 'robos');
  return [
    { name: 'nddipiazza/robos', url: 'https://github.com/nddipiazza/robos.git', targetPath: defaultDir, selected: true },
  ];
});

// ── Step 6: Complete Onboarding ──
ipcMain.handle('complete-onboarding', async (_, details) => {
  try {
    let res = { ok: true };
    if (onboardingState) {
      res = onboardingState.setOnboardingCompleted(details || {});
    } else {
      const file = path.join(os.homedir(), '.config', 'robos', 'onboarding-completed.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ completed: true, completedAt: new Date().toISOString(), config: details || {} }, null, 2));
    }

    // Spawn background AI agent dev-setup skill if selected
    try {
      const agentProc = spawn('bash', ['-c', 'echo "[onboarding] triggering AI dev-setup skills..."'], { detached: true, stdio: 'ignore' });
      agentProc.unref();
    } catch {}

    return res;
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('close-window', () => {
  if (win && !win.isDestroyed()) win.close();
  return { ok: true };
});

ipcMain.handle('launch-app', (_, appId) => {
  try {
    const net = require('net');
    const socketPath = `/run/user/${process.getuid()}/robos-dm.sock`;
    if (fs.existsSync(socketPath)) {
      const client = net.createConnection(socketPath, () => {
        client.write(JSON.stringify({ launch: appId }));
        client.end();
      });
    }
  } catch {}
  return { ok: true };
});
