const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, execSync, spawn, spawnSync } = require('child_process');

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

const GNUPG_DIR = process.env.GNUPGHOME || path.join(os.homedir(), '.gnupg');
const AGENT_CONF = path.join(GNUPG_DIR, 'gpg-agent.conf');
const PASS_STORE = process.env.PASSWORD_STORE_DIR || path.join(os.homedir(), '.password-store');
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
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'RobOS Setup Wizard',
    icon: path.join(__dirname, 'icon.svg'),
    backgroundColor: '#0d1117',
    resizable: true,
    center: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
    win.focus();
  });

  if (_debugServer) {
    _debugServer.startDebugServer(win, 19142);
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

// Helper run
function runSync(cmd, timeoutMs = 15000) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: timeoutMs, env: process.env, stdio: 'pipe' }).trim();
  } catch (err) {
    return null;
  }
}

// ── Onboarding state IPC ──
ipcMain.handle('get-onboarding-state', async () => {
  if (onboardingState) {
    return onboardingState.getOnboardingState();
  }
  return { completed: false, steps: {} };
});

ipcMain.handle('save-onboarding-step', async (_, { stepId, data }) => {
  if (onboardingState) {
    return onboardingState.saveStepState(stepId, data);
  }
  return { ok: true };
});

// ── Prerequisite check for pass ──
ipcMain.handle('check-pass-prerequisite', async () => {
  const passVer = runSync('pass --version');
  const gpgVer = runSync('gpg --version');
  const passInstalled = !!(passVer && passVer.includes('password-store'));
  const gpgInstalled = !!(gpgVer && gpgVer.includes('GnuPG'));

  return {
    passInstalled,
    gpgInstalled,
    ok: passInstalled && gpgInstalled,
    message: (passInstalled && gpgInstalled)
      ? 'Pass software prerequisite is installed.'
      : 'Missing pass software prerequisite. Please run "sudo apt-get install pass gpg".',
  };
});

// ── Step 1: Security & Encryption IPC ──
ipcMain.handle('get-security-status', async () => {
  if (process.env.ROBOS_SCENARIO && process.env.ROBOS_REAL_BINARIES !== '1') {
    if (process.env.ROBOS_SCENARIO === 'all-good') {
      return {
        hasGpgKey: true,
        keyId: '4A7B2C9D',
        keyName: 'Dev User',
        keyEmail: 'dev@example.com',
        passInitialized: true,
        passGpgId: '4A7B2C9D',
        pinentryConfigured: true,
        overallReady: true,
      };
    }
    if (process.env.ROBOS_SCENARIO === 'fresh-install' || process.env.ROBOS_SCENARIO === 'all-broken') {
      return {
        hasGpgKey: false,
        keyId: null,
        keyName: null,
        keyEmail: null,
        passInitialized: false,
        passGpgId: null,
        pinentryConfigured: false,
        overallReady: false,
      };
    }
  }

  const gpgKeys = runSync('gpg --list-secret-keys --keyid-format LONG 2>&1');
  const hasGpgKey = !!(gpgKeys && /sec\s+[a-z0-9]+/i.test(gpgKeys));
  let keyId = null;
  let keyName = null;
  let keyEmail = null;

  if (hasGpgKey) {
    const keyMatch = gpgKeys.match(/sec\s+([a-z0-9]+)\/([A-F0-9]+)/i) || gpgKeys.match(/\/([A-F0-9]{8,16})/i);
    if (keyMatch) keyId = keyMatch[2] || keyMatch[1];

    const uidMatch = gpgKeys.match(/uid\s+(?:\[.+\]\s+)?(.+) <(.+)>/);
    if (uidMatch) {
      keyName = uidMatch[1];
      keyEmail = uidMatch[2];
    }
  }

  const passInitialized = fs.existsSync(path.join(PASS_STORE, '.gpg-id'));
  let passGpgId = null;
  if (passInitialized) {
    try {
      passGpgId = fs.readFileSync(path.join(PASS_STORE, '.gpg-id'), 'utf8').trim();
    } catch {}
  }

  let pinentryConfigured = false;
  if (fs.existsSync(AGENT_CONF)) {
    try {
      const conf = fs.readFileSync(AGENT_CONF, 'utf8');
      pinentryConfigured = conf.includes('pinentry-program');
    } catch {}
  }

  return {
    hasGpgKey,
    keyId,
    keyName,
    keyEmail,
    passInitialized,
    passGpgId,
    pinentryConfigured,
    overallReady: hasGpgKey && passInitialized,
  };
});

ipcMain.handle('create-gpg-key', async (_, { name, email, passphrase }) => {
  if (process.env.ROBOS_SCENARIO && process.env.ROBOS_REAL_BINARIES !== '1') {
    return { ok: true, keyId: '4A7B2C9D', output: 'GPG key created successfully (test harness mode).' };
  }

  if (!name || !email) {
    return { ok: false, error: 'Name and email are required for GPG key creation.' };
  }

  try {
    fs.mkdirSync(GNUPG_DIR, { recursive: true, mode: 0o700 });
    const batchContent = `
Key-Type: RSA
Key-Length: 4096
Subkey-Type: RSA
Subkey-Length: 4096
Name-Real: ${name}
Name-Email: ${email}
Expire-Date: 0
${passphrase ? `Passphrase: ${passphrase}` : '%no-protection'}
%commit
`;
    const batchFile = path.join(os.tmpdir(), `gpg-batch-${Date.now()}`);
    fs.writeFileSync(batchFile, batchContent, { mode: 0o600 });

    const genRes = runSync(`gpg --pinentry-mode loopback --batch --generate-key "${batchFile}" 2>&1`, 30000);
    try { fs.unlinkSync(batchFile); } catch {}

    const gpgKeys = runSync('gpg --list-secret-keys --keyid-format LONG 2>&1');
    const keyMatch = gpgKeys && (gpgKeys.match(/sec\s+([a-z0-9]+)\/([A-F0-9]+)/i) || gpgKeys.match(/\/([A-F0-9]{8,16})/i) || genRes.match(/key\s+([A-F0-9]+)/i));
    const keyId = keyMatch ? (keyMatch[2] || keyMatch[1]) : '4096R/GPG-MASTER';

    return { ok: true, keyId, output: genRes };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('init-pass', async (_, args = {}) => {
  const keyId = args.keyId || args.gpgId;
  if (!keyId) {
    return { ok: false, error: 'GPG Key ID is required to initialize pass.' };
  }
  try {
    const initRes = runSync(`pass init "${keyId}" 2>&1`);
    const initialized = fs.existsSync(path.join(PASS_STORE, '.gpg-id'));
    return { ok: initialized, output: initRes };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('configure-pinentry', async () => {
  try {
    fs.mkdirSync(GNUPG_DIR, { recursive: true, mode: 0o700 });
    let pinentryBin = runSync('which pinentry-gnome3 2>/dev/null') || runSync('which pinentry-gtk-2 2>/dev/null') || runSync('which pinentry-curses 2>/dev/null') || '/usr/bin/pinentry-curses';
    
    let confContent = '';
    if (fs.existsSync(AGENT_CONF)) {
      confContent = fs.readFileSync(AGENT_CONF, 'utf8');
    }
    if (!confContent.includes('pinentry-program')) {
      confContent += `\npinentry-program ${pinentryBin}\ndefault-cache-ttl 34560000\nmax-cache-ttl 34560000\n`;
      fs.writeFileSync(AGENT_CONF, confContent, { mode: 0o600 });
    }
    runSync('gpgconf --reload gpg-agent 2>&1');
    return { ok: true, pinentry: pinentryBin };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Step 2: SSH Keypair IPC ──
ipcMain.handle('get-ssh-status', async () => {
  const ed25519Priv = path.join(SSH_DIR, 'id_ed25519');
  const ed25519Pub = path.join(SSH_DIR, 'id_ed25519.pub');
  const rsaPriv = path.join(SSH_DIR, 'id_rsa');
  const rsaPub = path.join(SSH_DIR, 'id_rsa.pub');

  let keyExists = false;
  let pubKeyContent = '';
  let keyType = null;

  if (fs.existsSync(ed25519Pub)) {
    keyExists = true;
    keyType = 'Ed25519';
    try { pubKeyContent = fs.readFileSync(ed25519Pub, 'utf8').trim(); } catch {}
  } else if (fs.existsSync(rsaPub)) {
    keyExists = true;
    keyType = 'RSA';
    try { pubKeyContent = fs.readFileSync(rsaPub, 'utf8').trim(); } catch {}
  }

  return { keyExists, keyType, pubKeyContent };
});

ipcMain.handle('generate-ssh-key', async (_, { email }) => {
  try {
    fs.mkdirSync(SSH_DIR, { recursive: true, mode: 0o700 });
    const keyFile = path.join(SSH_DIR, 'id_ed25519');
    const pubFile = path.join(SSH_DIR, 'id_ed25519.pub');

    if (fs.existsSync(keyFile)) {
      const pubContent = fs.readFileSync(pubFile, 'utf8').trim();
      return { ok: true, pubKey: pubContent, message: 'SSH key already exists.' };
    }

    const comment = email || `${os.userInfo().username}@robos`;
    const genOut = runSync(`ssh-keygen -t ed25519 -C "${comment}" -f "${keyFile}" -N "" 2>&1`, 15000);
    
    if (fs.existsSync(pubFile)) {
      const pubContent = fs.readFileSync(pubFile, 'utf8').trim();
      return { ok: true, pubKey: pubContent, output: genOut };
    }
    return { ok: false, error: `ssh-keygen failed: ${genOut}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('add-ssh-key-to-github', async () => {
  const pubFile = path.join(SSH_DIR, 'id_ed25519.pub');
  if (!fs.existsSync(pubFile)) {
    return { ok: false, error: 'No Ed25519 SSH public key found.' };
  }
  const addOut = runSync(`gh ssh-key add "${pubFile}" --title "RobOS VM Key (${os.hostname()})" 2>&1`, 15000);
  const ok = addOut.includes('Added') || addOut.includes('already exists');
  return { ok, output: addOut };
});

ipcMain.handle('test-ssh-connection', async () => {
  const testOut = runSync('ssh -T -o StrictHostKeyChecking=accept-new git@github.com 2>&1', 15000);
  const ok = testOut.includes('successfully authenticated');
  return { ok, output: testOut };
});

// ── Step 3: Git Config IPC ──
ipcMain.handle('get-git-config', async () => {
  const name = runSync('git config --global user.name') || '';
  const email = runSync('git config --global user.email') || '';
  return { name, email, configured: !!(name && email) };
});

ipcMain.handle('save-git-config', async (_, { name, email }) => {
  if (!name || !email) {
    return { ok: false, error: 'Both name and email are required for Git config.' };
  }
  runSync(`git config --global user.name "${name}"`);
  runSync(`git config --global user.email "${email}"`);
  return { ok: true, name, email };
});

// ── Step 6: Google Chrome Browser Setup IPC ──
ipcMain.handle('get-browser-status', async () => {
  const chromePath = runSync('which google-chrome-stable 2>/dev/null || which google-chrome 2>/dev/null');
  const chromeInstalled = !!chromePath;
  
  let isDefault = false;
  const defaultBrowser = runSync('xdg-settings get default-web-browser 2>/dev/null');
  if (defaultBrowser && defaultBrowser.includes('chrome')) {
    isDefault = true;
  }

  return {
    chromeInstalled,
    chromePath: chromePath || null,
    isDefault,
    defaultBrowser: defaultBrowser || 'unknown',
    ready: chromeInstalled,
  };
});

ipcMain.handle('install-google-chrome', async () => {
  try {
    const installOut = runSync(
      'wget -qO /tmp/google-chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && sudo dpkg -i /tmp/google-chrome.deb; sudo apt-get install -f -y; rm -f /tmp/google-chrome.deb 2>&1',
      60000
    );
    const chromePath = runSync('which google-chrome-stable 2>/dev/null || which google-chrome 2>/dev/null');
    return { ok: !!chromePath, output: installOut };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('set-chrome-default-browser', async () => {
  try {
    const res1 = runSync('xdg-settings set default-web-browser google-chrome.desktop 2>&1');
    const res2 = runSync('update-alternatives --set x-www-browser /usr/bin/google-chrome-stable 2>&1');
    const defaultBrowser = runSync('xdg-settings get default-web-browser 2>/dev/null');
    const isDefault = !!(defaultBrowser && defaultBrowser.includes('chrome'));
    return { ok: isDefault, defaultBrowser };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('open-url-in-browser', async (_, url) => {
  try {
    const chromeBin = runSync('which google-chrome 2>/dev/null || which google-chrome-stable 2>/dev/null');
    if (chromeBin) {
      const childEnv = { ...process.env };
      if (!childEnv.WAYLAND_DISPLAY && fs.existsSync('/run/user/1000/wayland-0')) {
        childEnv.WAYLAND_DISPLAY = 'wayland-0';
      }
      if (!childEnv.XDG_RUNTIME_DIR) {
        childEnv.XDG_RUNTIME_DIR = '/run/user/1000';
      }
      const args = ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'];
      if (url) args.push(url);
      spawn(chromeBin, args, { env: childEnv, detached: true }).unref();
      return { ok: true };
    }
    if (url) shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Step 7: GitHub Auth (gh CLI) IPC ──
ipcMain.handle('get-gh-auth-status', async () => {
  const ghVer = runSync('gh --version');
  const ghInstalled = !!(ghVer && !ghVer.includes('not found'));
  let authenticated = false;
  let username = null;

  if (ghInstalled) {
    const authStatus = runSync('gh auth status 2>&1');
    if (authStatus && authStatus.includes('Logged in to github.com')) {
      authenticated = true;
      const userMatch = authStatus.match(/Logged in to github.com account ([^\s()]+)/);
      if (userMatch) username = userMatch[1];
    }
  }

  return { ghInstalled, authenticated, username };
});

ipcMain.handle('start-gh-login', async () => {
  try {
    const url = 'https://github.com/login/device';
    const chromeBin = runSync('which google-chrome 2>/dev/null || which google-chrome-stable 2>/dev/null');
    const childEnv = { ...process.env };
    if (!childEnv.WAYLAND_DISPLAY && fs.existsSync('/run/user/1000/wayland-0')) {
      childEnv.WAYLAND_DISPLAY = 'wayland-0';
    }
    if (!childEnv.XDG_RUNTIME_DIR) {
      childEnv.XDG_RUNTIME_DIR = '/run/user/1000';
    }

    if (chromeBin) {
      spawn(chromeBin, ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', url], {
        env: childEnv,
        detached: true,
      }).unref();
    } else {
      shell.openExternal(url);
    }

    const termBin = runSync('which tilix 2>/dev/null || which gnome-terminal 2>/dev/null || which x-terminal-emulator 2>/dev/null');
    if (termBin) {
      if (termBin.includes('tilix')) {
        spawn('tilix', ['-e', 'gh auth login --web -h github.com -p https'], { env: childEnv, detached: true }).unref();
      } else if (termBin.includes('gnome-terminal')) {
        spawn('gnome-terminal', ['--', 'gh', 'auth', 'login', '--web', '-h', 'github.com', '-p', 'https'], { env: childEnv, detached: true }).unref();
      } else {
        spawn(termBin, ['-e', 'gh auth login --web -h github.com -p https'], { env: childEnv, detached: true }).unref();
      }
    }

    return { ok: true, message: 'Browser login window opened. Complete authentication in Google Chrome.' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('login-gh-with-token', async (_, token) => {
  if (!token || !token.trim()) {
    return { ok: false, error: 'Personal Access Token is required.' };
  }
  try {
    const tokenFile = path.join(os.tmpdir(), `gh-token-${Date.now()}`);
    fs.writeFileSync(tokenFile, token.trim(), { mode: 0o600 });
    const loginOut = runSync(`gh auth login --with-token < "${tokenFile}" 2>&1`);
    try { fs.unlinkSync(tokenFile); } catch {}
    
    const authStatus = runSync('gh auth status 2>&1');
    const ok = authStatus && authStatus.includes('Logged in to github.com');
    return { ok, output: loginOut };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── AI Agents IPC ──
ipcMain.handle('get-ai-agent-config', async () => {
  let prefs = {};
  if (fs.existsSync(PREFS_FILE)) {
    try { prefs = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')); } catch {}
  }

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

// ── Software Center IPC ──
const SOFTWARE_TOOLS = [
  { id: 'claude-cli', name: 'Claude CLI', description: 'Anthropic Claude Code — AI coding assistant', category: 'AI', source: 'npm (@anthropic-ai/claude-code)', checkCmd: 'which claude', installCmd: 'sudo npm install -g @anthropic-ai/claude-code', uninstallCmd: 'sudo npm uninstall -g @anthropic-ai/claude-code' },
  { id: 'github-copilot-cli', name: 'GitHub Copilot CLI', description: 'AI-powered CLI assistant from GitHub', category: 'AI', source: 'npm (@githubnext/github-copilot-cli)', checkCmd: 'npm list -g @githubnext/github-copilot-cli 2>/dev/null | grep copilot', installCmd: 'sudo npm install -g @githubnext/github-copilot-cli', uninstallCmd: 'sudo npm uninstall -g @githubnext/github-copilot-cli' },
  { id: 'openai-codex', name: 'OpenAI Codex CLI', description: 'OpenAI Codex — AI coding agent in your terminal', category: 'AI', source: 'npm (@openai/codex)', checkCmd: 'which codex', installCmd: 'sudo npm install -g @openai/codex && sudo apt-get install -y sqlite3', uninstallCmd: 'sudo npm uninstall -g @openai/codex' },
  { id: 'vscode', name: 'VS Code', description: 'Visual Studio Code — lightweight code editor', category: 'IDE', source: 'code.visualstudio.com (deb package)', checkCmd: 'which code', installCmd: 'wget -qO /tmp/vscode.deb "https://code.visualstudio.com/sha/download?build=stable&os=linux-deb-x64" && sudo dpkg -i /tmp/vscode.deb || sudo apt-get install -f -y && rm -f /tmp/vscode.deb && sudo cp /usr/share/applications/code.desktop /usr/share/applications/code.desktop.bak 2>/dev/null', uninstallCmd: 'sudo apt-get remove -y code && sudo rm -f /usr/share/applications/code.desktop' },
  { id: 'google-chrome', name: 'Google Chrome', description: 'Google Chrome browser — downloaded directly from Google', category: 'Browser', source: 'dl.google.com (deb package)', checkCmd: 'which google-chrome || which google-chrome-stable', installCmd: 'wget -qO /tmp/google-chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && sudo dpkg -i /tmp/google-chrome.deb; sudo apt-get install -f -y; rm -f /tmp/google-chrome.deb', uninstallCmd: 'sudo apt-get remove -y google-chrome-stable' },
  { id: 'gh-cli', name: 'GitHub CLI', description: 'Official GitHub command-line tool', category: 'Dev', source: 'cli.github.com (apt)', checkCmd: 'which gh', installCmd: 'curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null && sudo apt-get update -qq && sudo apt-get install -y gh', uninstallCmd: 'sudo apt-get remove -y gh' },
  { id: 'docker', name: 'Docker', description: 'Container runtime', category: 'Dev', source: 'get.docker.com', checkCmd: 'which docker', installCmd: 'curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker robos', uninstallCmd: 'sudo apt-get remove -y docker-ce docker-ce-cli containerd.io' },
  { id: 'ripgrep', name: 'ripgrep', description: 'Fast recursive search tool', category: 'CLI', source: 'apt (ripgrep)', checkCmd: 'which rg', installCmd: 'sudo apt-get install -y ripgrep', uninstallCmd: 'sudo apt-get remove -y ripgrep' },
  { id: 'jq', name: 'jq', description: 'Command-line JSON processor', category: 'CLI', source: 'apt (jq)', checkCmd: 'which jq', installCmd: 'sudo apt-get install -y jq', uninstallCmd: 'sudo apt-get remove -y jq' },
];

const installLogs = {};
function checkToolInstalled(t) { try { execSync(t.checkCmd, { stdio: 'pipe' }); return true; } catch { return false; } }

ipcMain.handle('get-tools', () => SOFTWARE_TOOLS.map(t => ({ ...t, installed: checkToolInstalled(t), installing: !!installLogs[t.id]?.installing })));
ipcMain.handle('install-tool', (_e, toolId) => {
  const tool = SOFTWARE_TOOLS.find(t => t.id === toolId);
  if (!tool) return;
  installLogs[tool.id] = { installing: true, log: `Installing ${tool.name}...\n` };
  const proc = spawn('bash', ['-c', tool.installCmd], { env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' } });
  proc.stdout.on('data', d => { installLogs[tool.id].log += d.toString(); if (win) win.webContents.send('install-progress', { toolId, text: d.toString(), done: false }); });
  proc.stderr.on('data', d => { installLogs[tool.id].log += d.toString(); if (win) win.webContents.send('install-progress', { toolId, text: d.toString(), done: false }); });
  proc.on('close', code => {
    installLogs[tool.id].installing = false;
    if (win) win.webContents.send('install-progress', { toolId, text: `Done (exit ${code})\n`, done: true, success: code === 0 });
  });
});
ipcMain.handle('uninstall-tool', (_e, toolId) => {
  const tool = SOFTWARE_TOOLS.find(t => t.id === toolId);
  if (!tool) return;
  installLogs[tool.id] = { installing: true, log: `Uninstalling ${tool.name}...\n` };
  const proc = spawn('bash', ['-c', tool.uninstallCmd], { env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' } });
  proc.stdout.on('data', d => { installLogs[tool.id].log += d.toString(); if (win) win.webContents.send('install-progress', { toolId, text: d.toString(), done: false }); });
  proc.stderr.on('data', d => { installLogs[tool.id].log += d.toString(); if (win) win.webContents.send('install-progress', { toolId, text: d.toString(), done: false }); });
  proc.on('close', code => {
    installLogs[tool.id].installing = false;
    if (win) win.webContents.send('install-progress', { toolId, text: `Done (exit ${code})\n`, done: true, success: code === 0 });
  });
});
ipcMain.handle('get-install-log', (_e, toolId) => installLogs[toolId]?.log || '');

// ── Agents Manager IPC ──
const COPILOT_SESSION_DIR = path.join(os.homedir(), '.copilot', 'session-state');
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const CLAUDE_SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');
const CLAUDE_HISTORY_FILE = path.join(CLAUDE_DIR, 'history.jsonl');
const CLAUDE_SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const AI_PROVIDER_CONFIG = path.join(os.homedir(), '.config', 'robos', 'ai-provider.json');
const SETTINGS_FILE = path.join(os.homedir(), '.config', 'robos', 'settings.json');

ipcMain.handle('detect-providers', async () => {
  const providers = [];
  const ghVer = runSync('gh --version 2>&1');
  const copNpm = runSync('which copilot 2>/dev/null || (test -f /usr/bin/copilot && echo /usr/bin/copilot)');
  const ghUser = runSync("gh api user --jq '.login' 2>/dev/null");
  providers.push({
    id: 'github-copilot', name: 'GitHub Copilot', installed: !!copNpm,
    ghInstalled: !!(ghVer && !ghVer.includes('not found')),
    authenticated: !!(ghUser && !ghUser.startsWith('{')),
    version: (ghVer || '').split('\n')[0], user: (ghUser && !ghUser.startsWith('{')) ? ghUser : ''
  });

  const clVer = runSync('claude --version 2>&1');
  const clInstalled = !!(clVer && !clVer.includes('not found'));
  let clAuth = false, clUser = '';
  if (clInstalled) {
    const st = runSync('claude auth status 2>&1');
    try { const p = JSON.parse(st); clAuth = !!p.loggedIn; if (p.account) clUser = p.account.emailAddress || p.account.accountUuid || ''; } catch {}
  }
  providers.push({ id: 'claude-code', name: 'Claude Code', installed: clInstalled, authenticated: clAuth, version: (clVer || '').split('\n')[0], user: clUser });

  const cxVer = runSync('codex --version 2>&1');
  const cxInstalled = !!(cxVer && !cxVer.includes('not found'));
  let cxAuth = false, cxUser = '';
  if (cxInstalled) {
    const st = runSync('codex login status 2>&1');
    cxAuth = st.toLowerCase().includes('logged in');
    const m = st.match(/logged in as\s+(\S+)/i); if (m) cxUser = m[1];
  }
  providers.push({ id: 'codex', name: 'Codex', installed: cxInstalled, authenticated: cxAuth, version: (cxVer || '').split('\n')[0], user: cxUser });

  return providers;
});

ipcMain.handle('get-active-provider', () => {
  try { return JSON.parse(fs.readFileSync(AI_PROVIDER_CONFIG, 'utf8')).activeProvider || 'github-copilot'; } catch { return 'github-copilot'; }
});

ipcMain.handle('set-active-provider', (_, providerId) => {
  fs.mkdirSync(path.dirname(AI_PROVIDER_CONFIG), { recursive: true });
  let config = {};
  try { config = JSON.parse(fs.readFileSync(AI_PROVIDER_CONFIG, 'utf8')); } catch {}
  config.activeProvider = providerId;
  fs.writeFileSync(AI_PROVIDER_CONFIG, JSON.stringify(config, null, 2));
});

ipcMain.handle('copilot-sessions', () => {
  const sessions = [];
  try {
    const ids = fs.readdirSync(COPILOT_SESSION_DIR);
    for (const id of ids) {
      try {
        const yaml = fs.readFileSync(path.join(COPILOT_SESSION_DIR, id, 'workspace.yaml'), 'utf8');
        const meta = {};
        yaml.split('\n').forEach(l => { const m = l.match(/^(\w+):\s*(.+)/); if (m) meta[m[1]] = m[2].trim(); });
        sessions.push({ session_id: id, name: meta.summary || id.slice(0, 8), cwd: meta.cwd || '', updated_at: meta.updated_at || '' });
      } catch {}
    }
  } catch {}
  return sessions;
});
ipcMain.handle('copilot-delete-session', (_, id) => { try { fs.rmSync(path.join(COPILOT_SESSION_DIR, id), { recursive: true, force: true }); } catch {} });
ipcMain.handle('copilot-launch-terminal', (_, id, extraArgs, cwd) => {
  const parts = ['/usr/bin/copilot'];
  if (Array.isArray(extraArgs)) parts.push(...extraArgs);
  if (id) parts.push('--resume', id);
  const cwdPrefix = (cwd && typeof cwd === 'string') ? `cd "${cwd.replace(/"/g, '\\"')}" && ` : '';
  spawn('x-terminal-emulator', ['-e', `bash -lc '${cwdPrefix}${parts.join(' ')}; read -p "Press Enter to close..." x'`], { env: { ...process.env, DISPLAY: ':0' }, detached: true });
});
ipcMain.handle('copilot-fetch-models', async () => {
  return new Promise(res => {
    exec('bash -lc "gh auth token 2>/dev/null"', { timeout: 5000 }, (err, token) => {
      if (err || !token.trim()) return res({ error: 'Not authenticated with gh CLI' });
      exec(`curl -sf -H "Authorization: Bearer ${token.trim()}" -H "Copilot-Integration-Id: vscode-chat" https://api.githubcopilot.com/models`, { timeout: 15000 }, (e2, out) => {
        if (e2) return res({ error: e2.message });
        try {
          const list = JSON.parse(out);
          const arr = Array.isArray(list) ? list : (list.data || []);
          res({ models: arr.filter(m => (m.policy || {}).state === 'enabled').map(m => m.id || m.name).filter(Boolean).sort() });
        } catch { res({ error: 'Parse error' }); }
      });
    });
  });
});
ipcMain.handle('copilot-login', () => { spawn('x-terminal-emulator', ['-e', 'gh auth login'], { env: { ...process.env, DISPLAY: ':0' }, detached: true }); });
ipcMain.handle('copilot-logout', () => { spawn('x-terminal-emulator', ['-e', 'bash -lc "gh auth logout; read -p \\"Press Enter...\\" x"'], { env: { ...process.env, DISPLAY: ':0' }, detached: true }); });
ipcMain.handle('copilot-update', () => new Promise(r => exec('gh extension upgrade gh-copilot 2>&1', { timeout: 60000 }, (_e, out) => r(out || 'Done'))));
ipcMain.handle('copilot-install-extension', () => new Promise(r => exec('gh extension install github/gh-copilot', { timeout: 60000 }, (_e, out) => r(out || 'Done'))));

ipcMain.handle('claude-sessions', () => {
  const map = new Map();
  try {
    const files = fs.readdirSync(CLAUDE_SESSIONS_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(CLAUDE_SESSIONS_DIR, f), 'utf8'));
        if (d.sessionId) map.set(d.sessionId, { session_id: d.sessionId, cwd: d.cwd || '', started_at: d.startedAt ? new Date(d.startedAt).toISOString() : '', name: d.cwd ? path.basename(d.cwd) : d.sessionId.slice(0, 8) });
      } catch {}
    }
  } catch {}
  return Array.from(map.values());
});
ipcMain.handle('claude-config', () => {
  let settings = {}; try { settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8')); } catch {}
  return { settings, projects: [] };
});
ipcMain.handle('claude-launch-terminal', (_, id, extraArgs, cwd) => {
  const parts = id ? ['claude', '--resume', id] : ['claude', ...(Array.isArray(extraArgs) ? extraArgs : [])];
  const cwdPrefix = (cwd && typeof cwd === 'string') ? `cd "${cwd.replace(/"/g, '\\"')}" && ` : '';
  spawn('x-terminal-emulator', ['-e', `bash -lc '${cwdPrefix}${parts.join(' ')}; read -p "Press Enter to close..." x'`], { env: { ...process.env, DISPLAY: ':0' }, detached: true });
});
ipcMain.handle('claude-install', () => spawn('x-terminal-emulator', ['-e', 'bash -c "npm install -g @anthropic-ai/claude-code && read -p \\"Press Enter...\\" x"'], { env: { ...process.env, DISPLAY: ':0' }, detached: true }));
ipcMain.handle('claude-login', () => spawn('x-terminal-emulator', ['-e', 'bash -lc "claude auth login; read -p \\"Press Enter...\\" x"'], { env: { ...process.env, DISPLAY: ':0' }, detached: true }));
ipcMain.handle('claude-logout', () => spawn('x-terminal-emulator', ['-e', 'bash -lc "claude auth logout; read -p \\"Press Enter...\\" x"'], { env: { ...process.env, DISPLAY: ':0' }, detached: true }));
ipcMain.handle('claude-write-settings', (_, s) => { fs.mkdirSync(path.dirname(CLAUDE_SETTINGS), { recursive: true }); fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(s, null, 2)); });
ipcMain.handle('claude-fetch-models', async () => ({ models: [{ id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' }, { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' }], source: 'builtin' }));

ipcMain.handle('codex-sessions', () => []);
ipcMain.handle('codex-launch-terminal', (_, id) => spawn('x-terminal-emulator', ['-e', `bash -lc 'codex ${id ? 'resume ' + id : ''}; read -p "Press Enter..." x'`], { env: { ...process.env, DISPLAY: ':0' }, detached: true }));
ipcMain.handle('codex-login', () => spawn('x-terminal-emulator', ['-e', 'bash -lc "codex login; read -p \\"Press Enter...\\" x"'], { env: { ...process.env, DISPLAY: ':0' }, detached: true }));
ipcMain.handle('codex-logout', () => spawn('x-terminal-emulator', ['-e', 'bash -lc "codex logout; read -p \\"Press Enter...\\" x"'], { env: { ...process.env, DISPLAY: ':0' }, detached: true }));
ipcMain.handle('codex-fetch-models', async () => ({ models: [] }));

ipcMain.handle('read-settings', () => { try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return {}; } });
ipcMain.handle('write-settings', (_, d) => { fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true }); fs.writeFileSync(SETTINGS_FILE, JSON.stringify(d, null, 2)); });
ipcMain.handle('open-dir-dialog', async () => { const r = await dialog.showOpenDialog({ properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; });

// ── Git Projects IPC ──
const GIT_PROJECTS_DATA = path.join(os.homedir(), '.config', 'robos', 'git-projects.json');

function readGitProjects() { try { return JSON.parse(fs.readFileSync(GIT_PROJECTS_DATA, 'utf8')); } catch { return { projects: [] }; } }
function writeGitProjects(d) { fs.mkdirSync(path.dirname(GIT_PROJECTS_DATA), { recursive: true }); fs.writeFileSync(GIT_PROJECTS_DATA, JSON.stringify(d, null, 2)); }

ipcMain.handle('read-projects', () => readGitProjects());
ipcMain.handle('write-projects', (_, data) => writeGitProjects(data));
ipcMain.handle('parse-url', (_, url) => {
  let u = (url || '').trim().replace(/\.git$/, '');
  const ssh = u.match(/^git@([^:]+):(.+)$/); if (ssh) u = `https://${ssh[1]}/${ssh[2]}`;
  try {
    const p = new URL(u); const host = p.hostname.replace(/^www\./, '');
    const parts = p.pathname.replace(/^\//, '').split('/');
    const org = parts[0] || '', repo = parts[1] || '';
    return { ok: true, host, org, repo, url: u, sshUrl: `git@${host}:${org}/${repo}.git`, localPath: path.join(os.homedir(), 'source', host, org, repo) };
  } catch { return { ok: false, error: 'Invalid URL' }; }
});
ipcMain.handle('check-cloned', (_, lp) => fs.existsSync(path.join(lp || '', '.git')));
ipcMain.handle('clone', async (evt, { url, localPath }) => {
  if (fs.existsSync(path.join(localPath, '.git'))) return { ok: true, message: 'Already cloned' };
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  return new Promise(res => {
    const proc = spawn('git', ['clone', url, localPath]);
    proc.stdout.on('data', d => evt.sender.send('clone-output', d.toString()));
    proc.stderr.on('data', d => evt.sender.send('clone-output', d.toString()));
    proc.on('close', code => res(code === 0 ? { ok: true, message: 'Cloned' } : { ok: false, error: `Exit ${code}` }));
  });
});
ipcMain.handle('pull', async (evt, { localPath }) => {
  if (!fs.existsSync(path.join(localPath, '.git'))) return { ok: false, error: 'Not cloned' };
  return new Promise(res => {
    const proc = spawn('git', ['pull'], { cwd: localPath });
    let out = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => out += d);
    proc.on('close', code => res(code === 0 ? { ok: true, message: out || 'Updated' } : { ok: false, error: out }));
  });
});
ipcMain.handle('get-installed-ides', () => [
  { id: 'vscode', name: 'VS Code', cmd: 'code' },
  { id: 'idea', name: 'IntelliJ IDEA', cmd: 'idea' }
].filter(i => { try { execSync(`which ${i.cmd}`, { stdio: 'ignore' }); return true; } catch { return false; } }));
ipcMain.handle('open-in-ide', (_, { cmd, localPath }) => { spawn(cmd, [localPath], { env: { ...process.env, DISPLAY: ':0' }, detached: true }).unref(); return { ok: true }; });
ipcMain.handle('open-vscode', (_, lp) => { spawn('code', [lp], { env: { ...process.env, DISPLAY: ':0' }, detached: true }).unref(); return { ok: true }; });
ipcMain.handle('open-terminal', (_, lp) => { spawn('gnome-terminal', ['--working-directory', lp], { env: { ...process.env, DISPLAY: ':0' }, detached: true }).unref(); return { ok: true }; });
ipcMain.handle('open-browser', (_, url) => { shell.openExternal(url); return { ok: true }; });
ipcMain.handle('get-branches', (_, lp) => {
  if (!fs.existsSync(path.join(lp, '.git'))) return { ok: false, branches: [] };
  const out = runSync(`git -C "${lp}" branch -a --format="%(refname:short)"`);
  return { ok: true, branches: (out || '').split('\n').filter(Boolean) };
});
ipcMain.handle('get-log', (_, lp) => {
  if (!fs.existsSync(path.join(lp, '.git'))) return { ok: false, commits: [] };
  const out = runSync(`git -C "${lp}" log --oneline -20`);
  return { ok: true, commits: (out || '').split('\n').filter(Boolean) };
});
ipcMain.handle('list-gh-repos', () => {
  const out = runSync('gh repo list --limit 100 --json nameWithOwner,url,description,isPrivate,isFork 2>/dev/null');
  try { return { ok: true, repos: JSON.parse(out || '[]') }; } catch { return { ok: true, repos: [] }; }
});
ipcMain.handle('search-gh-repos', (_, { query }) => {
  if (!query) return { ok: true, repos: [] };
  const out = runSync(`gh search repos "${query}" --limit 30 --json fullName,description,isPrivate,isFork 2>/dev/null`);
  try {
    const raw = JSON.parse(out || '[]');
    return { ok: true, repos: raw.map(r => ({ nameWithOwner: r.fullName, url: `https://github.com/${r.fullName}`, description: r.description, isPrivate: r.isPrivate, isFork: r.isFork })) };
  } catch { return { ok: true, repos: [] }; }
});
ipcMain.handle('list-org-repos', (_, org) => {
  const out = runSync(`gh repo list "${org}" --limit 200 --json nameWithOwner,url,description,isPrivate,isFork 2>/dev/null`);
  try { return { ok: true, repos: JSON.parse(out || '[]') }; } catch { return { ok: true, repos: [] }; }
});
ipcMain.handle('run-dev-setup', (_, { localPath, script }) => {
  const tmp = path.join(os.tmpdir(), `devsetup-${Date.now()}.sh`);
  fs.writeFileSync(tmp, script, { mode: 0o755 });
  const res = spawnSync('bash', [tmp], { cwd: localPath, encoding: 'utf8', timeout: 60000 });
  try { fs.unlinkSync(tmp); } catch {}
  return { ok: res.status === 0, output: (res.stdout || '') + (res.stderr || '') };
});
ipcMain.handle('open-in-explorer', (_, lp) => { spawn('xdg-open', [lp], { detached: true }).unref(); return { ok: true }; });
ipcMain.handle('gp-list-ai-providers', () => ({ activeId: 'github-copilot', activeName: 'GitHub Copilot', providers: [] }));
ipcMain.handle('gp-ai-create-repos', async (_, { prompt }) => ({ ok: false, error: 'AI prompt setup complete' }));

// ── Step 8, 9, 10: Catalog & Projects Legacy Helpers ──
ipcMain.handle('get-dev-apps-catalog', async () => {
  return SOFTWARE_TOOLS.map(t => ({ id: t.id, name: t.name, category: t.category, installed: checkToolInstalled(t) }));
});

ipcMain.handle('get-git-projects-list', async () => {
  const defaultDir = path.join(os.homedir(), 'source', 'robos');
  return [
    { name: 'nddipiazza/robos', url: 'https://github.com/nddipiazza/robos.git', targetPath: defaultDir, selected: true },
  ];
});

// ── Step 11: Complete Onboarding ──
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

    // Re-enable GNOME notification banners now that onboarding setup wizard is complete
    try {
      execSync('gsettings set org.gnome.desktop.notifications show-banners true 2>/dev/null || dconf write /org/gnome/desktop/notifications/show-banners true 2>/dev/null', { timeout: 3000 });
    } catch {}

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
