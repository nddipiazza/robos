/**
 * RobOS Auth — OAuth Providers & Identity Manager
 *
 * Manages OAuth provider configurations (GitHub, Google, Jira, etc.)
 * and the current user identity.
 *
 * Current identity is hardcoded to 'robos' (reads myProfileUid from settings.json)
 * until real OAuth flows are implemented per-provider.
 *
 * Data:
 *   ~/.config/robos/auth/providers.json  — list of configured providers
 *   ~/.config/robos/settings.json        — myProfileUid (current identity)
 */
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');

const AUTH_DIR      = path.join(process.env.HOME, '.config', 'robos', 'auth');
const PROVIDERS_FILE = path.join(AUTH_DIR, 'providers.json');
const SETTINGS_FILE  = path.join(process.env.HOME, '.config', 'robos', 'settings.json');
const PEOPLE_DIR     = path.join(process.env.HOME, '.config', 'robos', 'people');

function ensureAuthDir() { fs.mkdirSync(AUTH_DIR, { recursive: true }); }

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return {}; }
}
function saveSettings(data) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

function loadProviders() {
  ensureAuthDir();
  try { return JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf8')); }
  catch { return getDefaultProviders(); }
}
function saveProviders(providers) {
  ensureAuthDir();
  fs.writeFileSync(PROVIDERS_FILE, JSON.stringify(providers, null, 2));
}

function getDefaultProviders() {
  return [
    { id: 'github',  name: 'GitHub',       type: 'oauth2', icon: '🐙', enabled: false, clientId: '', clientSecret: '', scopes: 'read:user,repo', authUrl: 'https://github.com/login/oauth/authorize', tokenUrl: 'https://github.com/login/oauth/access_token', callbackUrl: 'http://localhost:9871/callback/github' },
    { id: 'google',  name: 'Google',        type: 'oauth2', icon: '🔵', enabled: false, clientId: '', clientSecret: '', scopes: 'openid email profile', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', callbackUrl: 'http://localhost:9871/callback/google' },
    { id: 'jira',    name: 'Jira / Atlassian', type: 'oauth2', icon: '🔷', enabled: false, clientId: '', clientSecret: '', scopes: 'read:jira-user read:jira-work', authUrl: 'https://auth.atlassian.com/authorize', tokenUrl: 'https://auth.atlassian.com/oauth/token', callbackUrl: 'http://localhost:9871/callback/jira' },
    { id: 'gitlab',  name: 'GitLab',        type: 'oauth2', icon: '🦊', enabled: false, clientId: '', clientSecret: '', scopes: 'read_user', authUrl: 'https://gitlab.com/oauth/authorize', tokenUrl: 'https://gitlab.com/oauth/token', callbackUrl: 'http://localhost:9871/callback/gitlab' },
    { id: 'slack',   name: 'Slack',         type: 'oauth2', icon: '💬', enabled: false, clientId: '', clientSecret: '', scopes: 'users:read', authUrl: 'https://slack.com/oauth/v2/authorize', tokenUrl: 'https://slack.com/api/oauth.v2.access', callbackUrl: 'http://localhost:9871/callback/slack' },
    { id: 'custom',  name: 'Custom OIDC',   type: 'oidc',   icon: '🔑', enabled: false, clientId: '', clientSecret: '', scopes: 'openid email profile', authUrl: '', tokenUrl: '', callbackUrl: 'http://localhost:9871/callback/custom', issuerUrl: '' },
  ];
}

function loadPerson(uid) {
  try { return JSON.parse(fs.readFileSync(path.join(PEOPLE_DIR, `${uid}.json`), 'utf8')); }
  catch { return null; }
}

// ── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.handle('auth-list-providers',  ()            => loadProviders());
ipcMain.handle('auth-save-provider',   (_, provider) => {
  const list = loadProviders();
  const idx  = list.findIndex(p => p.id === provider.id);
  if (idx >= 0) list[idx] = provider; else list.push(provider);
  saveProviders(list);
  return { ok: true };
});
ipcMain.handle('auth-delete-provider', (_, id) => {
  const list = loadProviders().filter(p => p.id !== id);
  saveProviders(list);
  return { ok: true };
});
ipcMain.handle('auth-reset-providers', () => {
  saveProviders(getDefaultProviders());
  return { ok: true };
});

// Identity — hardcoded to robos until real OAuth flows are wired
ipcMain.handle('auth-get-identity',    () => {
  const s   = loadSettings();
  const uid = s.myProfileUid || 'robos';   // hardcoded fallback
  return { uid, person: loadPerson(uid), source: 'hardcoded' };
});
ipcMain.handle('auth-set-identity-uid', (_, uid) => {
  const s = loadSettings(); s.myProfileUid = uid; saveSettings(s);
  return { ok: true, uid };
});

// ── Window ────────────────────────────────────────────────────────────────────
let win;
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 900, height: 620,
    title: 'RobOS Auth',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
});
app.on('window-all-closed', () => app.quit());
