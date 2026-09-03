const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const HOME_DIR      = process.env.HOME || os.homedir();
const CONFIG_DIR    = path.join(HOME_DIR, '.config', 'robos');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');

// Debug server (optional)
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

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

function saveSettings(data) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Settings schema with defaults and sections
const SETTINGS_SCHEMA = {
  sections: [
    {
      id: 'ai',
      label: 'AI Provider & Models',
      fields: [
        { key: 'ai_provider', label: 'Primary AI Provider', type: 'select', options: ['claude', 'openai', 'gemini', 'local'], default: 'claude' },
        { key: 'claude_api_key', label: 'Claude API Key', type: 'password', default: '' },
        { key: 'openai_api_key', label: 'OpenAI API Key', type: 'password', default: '' },
        { key: 'gemini_api_key', label: 'Google Gemini API Key', type: 'password', default: '' },
        { key: 'ai_model', label: 'Default AI Model', type: 'text', default: 'claude-sonnet-4-20250514' },
      ],
    },
    {
      id: 'github',
      label: 'GitHub & Repos',
      fields: [
        { key: 'github_token', label: 'GitHub Personal Token', type: 'password', default: '' },
        { key: 'github_api_url', label: 'GitHub API URL', type: 'text', default: 'https://api.github.com' },
        { key: 'use_gh_cli', label: 'Use gh CLI for auth', type: 'checkbox', default: true },
      ],
    },
    {
      id: 'ide',
      label: 'IDE & Workspaces',
      fields: [
        { key: 'default_ide', label: 'Default IDE', type: 'select', options: ['intellij', 'vscode', 'cursor', 'neovim'], default: 'intellij' },
        { key: 'ide_path', label: 'IDE Install Path', type: 'text', default: '' },
        { key: 'auto_launch_workspace', label: 'Auto-launch workspace on task start', type: 'checkbox', default: true },
      ],
    },
    {
      id: 'notifications',
      label: 'Notifications & Sounds',
      fields: [
        { key: 'toast_enabled', label: 'Enable toast notifications', type: 'checkbox', default: true },
        { key: 'notification_sound', label: 'Enable notification sounds', type: 'checkbox', default: true },
        { key: 'dnd_default', label: 'Default Do-Not-Disturb on boot', type: 'checkbox', default: false },
      ],
    },
    {
      id: 'journal',
      label: 'Work Journal & Knowledge Graph',
      fields: [
        { key: 'journal_repo', label: 'Journal Git Repository', type: 'text', default: '' },
        { key: 'knowledge_graph_branch', label: 'Knowledge Graph Default Branch', type: 'text', default: 'main' },
        { key: 'journal_auto_commit', label: 'Auto-commit journal entries', type: 'checkbox', default: true },
      ],
    },
    {
      id: 'system',
      label: 'System & Theme',
      fields: [
        { key: 'theme', label: 'Desktop Theme', type: 'select', options: ['dark', 'light'], default: 'dark' },
        { key: 'auto_update', label: 'Auto-update RobOS apps', type: 'checkbox', default: true },
      ],
    },
  ],
};

// Single-instance lock (bypassed in test mode)
if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); process.exit(0); }
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let win = null;
app.setName('robos-preferences');

app.whenReady().then(() => {
  win = new BrowserWindow({
    title: 'RobOS Preferences',
    width: 900,
    height: 620,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#0d1117',
    show: true,
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

  if (_debugServer) _debugServer.startDebugServer(win, 19116);
});

app.on('window-all-closed', () => app.quit());

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-schema', () => SETTINGS_SCHEMA);

ipcMain.handle('load-settings', () => loadSettings());

ipcMain.handle('save-settings', (_, data) => {
  const current = loadSettings();
  const merged = { ...current, ...data };
  saveSettings(merged);
  return { ok: true, settings: merged };
});

ipcMain.handle('get-setting', (_, key) => {
  const s = loadSettings();
  return s[key] !== undefined ? s[key] : null;
});

ipcMain.handle('set-setting', (_, key, value) => {
  const s = loadSettings();
  s[key] = value;
  saveSettings(s);
  return { ok: true };
});

module.exports = { loadSettings, saveSettings, SETTINGS_SCHEMA };
