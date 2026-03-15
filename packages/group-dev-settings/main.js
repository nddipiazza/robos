/**
 * RobOS Group Developer Settings — main.js
 *
 * Groups stored at: ~/.config/robos/groups/<gid>.json
 * Each group has:
 *   - members: [uid, ...]  (references ~/.config/robos/people/<uid>.json)
 *   - contexts: [contextSourceId, ...]  (linked RobOS context sources)
 *   - settings: { gitProjects, software, onboarding, secrets, ciEnvironments }
 */
'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');


const GROUPS_DIR       = path.join(process.env.HOME, '.config', 'robos', 'groups');
const PEOPLE_DIR       = path.join(process.env.HOME, '.config', 'robos', 'people');
const GIT_PROJECTS_FILE = path.join(process.env.HOME, '.config', 'robos', 'git-projects.json');
const CONTEXT_SOURCES  = path.join(process.env.HOME, '.config', 'robos', 'context-sources.json');

function ensureDirs() {
  fs.mkdirSync(GROUPS_DIR, { recursive: true });
}

// ── Window ────────────────────────────────────────────────────────────────────
let win;
app.setName('group-dev-settings');
app.whenReady().then(() => {
  win = new BrowserWindow({
    skipTaskbar: true,
    width: 1200, height: 720,
    title: 'RobOS Group Developer Settings',
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
  buildGroupsIndex();
});
app.on('window-all-closed', () => app.quit());

// Allow self-signed certs for localhost Cockpit
app.on('certificate-error', (event, _wc, url, _err, _cert, callback) => {
  if (url.startsWith('https://localhost')) { event.preventDefault(); callback(true); }
  else callback(false);
});

// ── Groups CRUD ───────────────────────────────────────────────────────────────
function loadGroup(gid) {
  const file = path.join(GROUPS_DIR, `${gid}.json`);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function buildGroupsIndex() {
  try {
    const groups = listGroups();
    const lines = groups.map(g => `group:${g.id || ''}:${g.name || ''}`).filter(l => l !== 'group::');
    const indexDir = path.join(process.env.HOME, '.config', 'robos', 'search-index');
    fs.mkdirSync(indexDir, { recursive: true });
    fs.writeFileSync(path.join(indexDir, 'groups.txt'), lines.join('\n') + (lines.length ? '\n' : ''));
  } catch {}
}

function saveGroup(group) {
  ensureDirs();
  fs.writeFileSync(path.join(GROUPS_DIR, `${group.id}.json`), JSON.stringify(group, null, 2));
  buildGroupsIndex();
  return group;
}

function listGroups() {
  ensureDirs();
  return fs.readdirSync(GROUPS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(GROUPS_DIR, f), 'utf8')); } catch { return null; } })
    .filter(Boolean)
    .sort((a,b) => (a.name||'').localeCompare(b.name||''));
}

function deleteGroup(gid) {
  const file = path.join(GROUPS_DIR, `${gid}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  buildGroupsIndex();
}

function listPeople() {
  try {
    return fs.readdirSync(PEOPLE_DIR)
      .filter(f => f.endsWith('.json') && f !== 'config.json')
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(PEOPLE_DIR, f), 'utf8')); } catch { return null; } })
      .filter(Boolean)
      .sort((a,b) => (a.displayName||'').localeCompare(b.displayName||''));
  } catch { return []; }
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('gds-list-groups',   ()          => listGroups());
ipcMain.handle('gds-save-group',    (_, group)  => saveGroup(group));
ipcMain.handle('gds-delete-group',  (_, gid)    => { deleteGroup(gid); return { ok: true }; });
ipcMain.handle('gds-list-people',   ()          => listPeople());
ipcMain.handle('gds-list-git-projects', ()      => {
  try { return JSON.parse(fs.readFileSync(GIT_PROJECTS_FILE, 'utf8')).projects || []; }
  catch { return []; }
});
ipcMain.handle('gds-list-contexts', ()          => {
  try { return JSON.parse(fs.readFileSync(CONTEXT_SOURCES, 'utf8')).sources || []; }
  catch { return []; }
});

ipcMain.handle('gds-list-gh-repos', () => {
  try {
    const projects = JSON.parse(fs.readFileSync(GIT_PROJECTS_FILE, 'utf8')).projects || [];
    const repos = projects.map(p => ({
      nameWithOwner: `${p.org}/${p.repo}`,
      url: p.url,
      description: p.notes || '',
      isPrivate: false,
      isFork: false,
    }));
    return { ok: true, repos };
  } catch { return { ok: true, repos: [] }; }
});

ipcMain.handle('gds-list-workspaces', () => {
  const results = [];
  const visited = new Set();
  const roots = [
    os.homedir(),
    path.join(os.homedir(), 'source'),
    '/usr/local/share/robos',
  ];

  function walk(dir, depth) {
    if (depth > 6) return;
    if (visited.has(dir)) return;
    visited.add(dir);
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.vscode' && e.name !== '.idea') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === '.vscode' || e.name === '.idea') {
          const wsType = e.name === '.vscode' ? 'vscode' : 'idea';
          try {
            const stat = fs.statSync(dir);
            results.push({
              path: dir,
              name: path.basename(dir),
              type: wsType,
              ide: wsType === 'vscode' ? 'VS Code / Cursor' : 'JetBrains',
              mtime: stat.mtimeMs,
            });
          } catch {}
        } else {
          walk(full, depth + 1);
        }
      }
    }
  }

  for (const root of roots) walk(root, 0);
  return results.sort((a, b) => a.name.localeCompare(b.name));
});

ipcMain.handle('gds-get-config-dir', () => GROUPS_DIR);
ipcMain.handle('gds-open-folder', (_, dir) => {
  const target = dir || GROUPS_DIR;
  const fms = [`nautilus "${target}"`, `thunar "${target}"`, `xdg-open "${target}"`];
  for (const cmd of fms) {
    try { cp.exec(cmd); return { ok: true }; } catch {}
  }
  return { ok: false };
});

// ── Dev Console (Cockpit) ────────────────────────────────────────────────────
const COCKPIT_URL = 'https://localhost:9090';
let cockpitWin = null;
ipcMain.handle('gds-open-dev-console', () => {
  if (cockpitWin && !cockpitWin.isDestroyed()) {
    cockpitWin.focus();
    return { ok: true };
  }
  cockpitWin = new BrowserWindow({
    skipTaskbar: true,
    width: 1400, height: 900,
    title: 'RobOS Dev Console — Cockpit',
    backgroundColor: '#161b22',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,  // needed for self-signed cert on localhost
    },
  });
  cockpitWin.loadURL(COCKPIT_URL);
  cockpitWin.setMenuBarVisibility(false);
  cockpitWin.webContents.on('certificate-error', (event, _url, _err, _cert, callback) => {
    event.preventDefault();
    callback(true);  // accept self-signed localhost cert
  });
  cockpitWin.on('closed', () => { cockpitWin = null; });
  return { ok: true };
});
