const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');

const SETTINGS_FILE = path.join(process.env.HOME, '.config', 'robos', 'settings.json');

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

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
  catch { return {}; }
}

function saveSettings(data) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

// Settings schema with defaults and sections
const SETTINGS_SCHEMA = {
  sections: [
    {
      id: 'ai',
      label: 'AI Provider',
      fields: [
        { key: 'ai_provider', label: 'AI Provider', type: 'select', options: ['claude', 'openai', 'local'], default: 'claude' },
        { key: 'claude_api_key', label: 'Claude API Key', type: 'password', default: '' },
        { key: 'openai_api_key', label: 'OpenAI API Key', type: 'password', default: '' },
        { key: 'ai_model', label: 'Default AI Model', type: 'text', default: 'claude-sonnet-4-20250514' },
      ],
    },
    {
      id: 'github',
      label: 'GitHub',
      fields: [
        { key: 'github_token', label: 'GitHub Token', type: 'password', default: '' },
        { key: 'github_api_url', label: 'GitHub API URL', type: 'text', default: 'https://api.github.com' },
        { key: 'use_gh_cli', label: 'Use gh CLI for auth', type: 'checkbox', default: true },
      ],
    },
    {
      id: 'ide',
      label: 'IDE & Editor',
      fields: [
        { key: 'default_ide', label: 'Default IDE', type: 'select', options: ['intellij', 'vscode', 'cursor', 'neovim'], default: 'intellij' },
        { key: 'ide_path', label: 'IDE Install Path', type: 'text', default: '' },
      ],
    },
    {
      id: 'notifications',
      label: 'Notifications',
      fields: [
        { key: 'toast_enabled', label: 'Enable toast notifications', type: 'checkbox', default: true },
        { key: 'notification_sound', label: 'Enable notification sounds', type: 'checkbox', default: true },
      ],
    },
    {
      id: 'journal',
      label: 'Work Journal',
      fields: [
        { key: 'journal_repo', label: 'Journal Git Repository', type: 'text', default: '' },
        { key: 'journal_auto_commit', label: 'Auto-commit journal entries', type: 'checkbox', default: true },
      ],
    },
    {
      id: 'system',
      label: 'System',
      fields: [
        { key: 'theme', label: 'Theme', type: 'select', options: ['dark', 'light'], default: 'dark' },
        { key: 'auto_update', label: 'Auto-update apps', type: 'checkbox', default: true },
      ],
    },
  ],
};

// Single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let win;
app.setName('robos-preferences');
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 800, height: 620,
    title: 'RobOS Preferences',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
  if (_debugServer) _debugServer.startDebugServer(win, 19116);
});

app.on('window-all-closed', () => app.quit());

// ── IPC ─────────────────────────────────────────────────────────────────────

ipcMain.handle('get-schema', () => SETTINGS_SCHEMA);

ipcMain.handle('load-settings', () => loadSettings());

ipcMain.handle('save-settings', (_, data) => {
  const current = loadSettings();
  const merged = { ...current, ...data };
  saveSettings(merged);
  return { ok: true };
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

// Export for testing
module.exports = { loadSettings, saveSettings, SETTINGS_SCHEMA };
