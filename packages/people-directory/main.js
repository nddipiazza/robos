/**
 * RobOS People Directory — main.js
 *
 * Data backend: filesystem JSON store at ~/.config/robos/people/
 *   - people/<uid>.json  — person record
 *   - people/config.json — backend config (type: 'filesystem' | 'ldap')
 *
 * LDAP abstraction layer ready: swap `backend` to 'ldap' in config.json
 * and populate ldap.url, ldap.baseDn, ldap.bindDn, ldap.bindPassPath.
 */
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'people-directory'));
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

const SETTINGS_FILE = path.join(os.homedir(), '.config', 'robos', 'settings.json');

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return {}; }
}
function saveSettings(data) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

const DATA_DIR    = path.join(os.homedir(), '.config', 'robos', 'people');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// ── Window ────────────────────────────────────────────────────────────────────
let win;
app.whenReady().then(() => {
  win = new BrowserWindow({
    skipTaskbar: true,
    width: 1100, height: 680,
    title: 'RobOS People Directory',
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
  buildPeopleIndex();
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());

// ── Filesystem backend ────────────────────────────────────────────────────────
function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ backend: 'filesystem' }, null, 2));
  }
}

function loadAllPeople() {
  ensureDataDir();
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'config.json');
  return files.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); }
    catch { return null; }
  }).filter(Boolean);
}

function buildPeopleIndex() {
  try {
    const people = loadAllPeople();
    const lines = people.map(p => `person:${p.username || ''}:${p.displayName || ''}`).filter(l => l !== 'person::');
    const indexDir = path.join(os.homedir(), '.config', 'robos', 'search-index');
    fs.mkdirSync(indexDir, { recursive: true });
    fs.writeFileSync(path.join(indexDir, 'people.txt'), lines.join('\n') + (lines.length ? '\n' : ''));
  } catch {}
}

function savePerson(person) {
  ensureDataDir();
  if (!person.uid) throw new Error('uid required');
  const file = path.join(DATA_DIR, `${person.uid}.json`);
  fs.writeFileSync(file, JSON.stringify(person, null, 2));
  buildPeopleIndex();
  return person;
}

function deletePerson(uid) {
  const file = path.join(DATA_DIR, `${uid}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  buildPeopleIndex();
}

function getConfig() {
  ensureDataDir();
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return { backend: 'filesystem' }; }
}

function saveConfig(cfg) {
  ensureDataDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('pd-get-config',      ()            => getConfig());
ipcMain.handle('pd-save-config',     (_, cfg)      => { saveConfig(cfg); return { ok: true }; });

ipcMain.handle('pd-list',            ()            => loadAllPeople());
ipcMain.handle('pd-save-person',     (_, person)   => savePerson(person));
ipcMain.handle('pd-delete-person',   (_, uid)      => { deletePerson(uid); return { ok: true }; });

ipcMain.handle('pd-import-ldif',     (_, ldifText) => importLdif(ldifText));

ipcMain.handle('pd-get-my-profile',  ()            => loadSettings().myProfileUid || null);
ipcMain.handle('pd-set-my-profile',  (_, uid)      => {
  const s = loadSettings(); s.myProfileUid = uid; saveSettings(s); return { ok: true };
});

// ── LDIF importer ─────────────────────────────────────────────────────────────
function importLdif(text) {
  const people = [];
  let current = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    if (line === '' || line.startsWith('#')) {
      if (current && current.uid) { people.push(current); current = null; }
      continue;
    }
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const attr = line.slice(0, colon).toLowerCase().trim();
    const val  = line.slice(colon + 1).replace(/^:?\s*/, '').trim();
    if (attr === 'dn') { current = {}; continue; }
    if (!current) current = {};
    switch (attr) {
      case 'uid':           current.uid = val; break;
      case 'cn':            current.displayName = val; break;
      case 'givenname':     current.firstName = val; break;
      case 'sn':            current.lastName = val; break;
      case 'mail':          current.email = val; break;
      case 'title':         current.title = val; break;
      case 'ou':            current.department = val; break;
      case 'telephonenumber': current.phone = val; break;
      case 'manager':       current.managerDn = val; break;
      case 'description':   current.bio = val; break;
      case 'l':             current.location = val; break;
    }
  }
  if (current && current.uid) people.push(current);
  let imported = 0;
  for (const p of people) {
    try { savePerson(p); imported++; } catch {}
  }
  return { ok: true, imported };
}
