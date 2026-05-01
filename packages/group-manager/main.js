/**
 * RobOS Group Manager — main.js
 *
 * Groups stored at: ~/.config/robos/groups/<gid>.json
 * Each group has:
 *   - members: [uid, ...]  (references ~/.config/robos/people/<uid>.json)
 *   - contexts: [contextSourceId, ...]  (linked RobOS context sources)
 *   - settings: { git, software, onboarding, secrets, ci }
 *   - workspaces: [path, ...]
 */
'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'group-manager'));
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

const GROUPS_DIR        = path.join(os.homedir(), '.config', 'robos', 'groups');
const PEOPLE_DIR        = path.join(os.homedir(), '.config', 'robos', 'people');
const GIT_PROJECTS_FILE = path.join(os.homedir(), '.config', 'robos', 'git-projects.json');
const CONTEXT_SOURCES   = path.join(os.homedir(), '.config', 'robos', 'context-sources.json');

function ensureDirs() {
  fs.mkdirSync(GROUPS_DIR, { recursive: true });
}

// ── AI (shared robos-lib/ai-agent) ────────────────────────────────────────────
let aiAgent;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'ai-agent'),
    path.resolve(__dirname, '..', 'robos-lib', 'ai-agent'),
    '/usr/local/share/robos/robos-lib/ai-agent',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { aiAgent = require(p); break; } catch {}
  }
} catch { aiAgent = null; }

// ── AI JSON utilities (shared robos-lib/ai-json) ──────────────────────────────
let aiJson = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'ai-json'),
    path.resolve(__dirname, '..', 'robos-lib', 'ai-json'),
    '/usr/local/share/robos/robos-lib/ai-json',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { aiJson = require(p); break; } catch {}
  }
} catch { aiJson = null; }

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

// ── Window ────────────────────────────────────────────────────────────────────
let win;
app.setName('robos-group-manager');
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  win = new BrowserWindow({
    skipTaskbar: true,
    width: 1200, height: 720,
    title: 'RobOS Group Manager',
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
  if (_debugServer) _debugServer.startDebugServer(win, 19132);
  buildGroupsIndex();
});
app.on('window-all-closed', () => app.quit());

// Allow self-signed certs for localhost Cockpit
app.on('certificate-error', (event, _wc, url, _err, _cert, callback) => {
  if (url.startsWith('https://localhost')) { event.preventDefault(); callback(true); }
  else callback(false);
});

// ── Groups CRUD ───────────────────────────────────────────────────────────────
function buildGroupsIndex() {
  try {
    const groups = listGroups();
    const lines = groups.map(g => `group:${g.id || ''}:${g.name || ''}`).filter(l => l !== 'group::');
    const indexDir = path.join(os.homedir(), '.config', 'robos', 'search-index');
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
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
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
      .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  } catch { return []; }
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('gds-list-groups',   ()         => listGroups());
ipcMain.handle('gds-save-group',    (_, group) => saveGroup(group));
ipcMain.handle('gds-delete-group',  (_, gid)   => { deleteGroup(gid); return { ok: true }; });
ipcMain.handle('gds-list-people',   ()         => listPeople());
ipcMain.handle('gds-list-git-projects', ()     => {
  try { return JSON.parse(fs.readFileSync(GIT_PROJECTS_FILE, 'utf8')).projects || []; }
  catch { return []; }
});
ipcMain.handle('gds-list-contexts', () => {
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

// ── AI: Create group from natural-language prompt ────────────────────────────
const GROUP_SCHEMA_PROMPT = `You are a RobOS Group Manager assistant. Generate one or more developer group configurations.

CRITICAL OUTPUT RULES — MUST FOLLOW EXACTLY:
- Output ONLY a raw JSON array — no markdown, no code fences, no backticks, no explanation, no prose
- Even if only one group is described, still return a JSON array with one element
- ALL string values must contain ONLY plain printable ASCII characters (codes 32-126)
- NO emoji, NO Unicode symbols, NO non-ASCII characters of any kind
- NO ANSI escape codes, NO control characters, NO special formatting
- NO bullet points, NO dashes used as decorators, NO ASCII art of any kind
- Descriptions and notes must be plain English sentences — nothing that would break JSON parsing

Each element in the array must match this exact schema (all fields optional except id and name):
{
  "id": "lowercase-hyphen-id",
  "name": "Human Readable Name",
  "description": "One sentence plain text description",
  "members": [],
  "workspaces": [],
  "settings": {
    "git": [
      { "url": "https://github.com/org/repo", "description": "Short description", "branch": "main", "notes": "" }
    ],
    "software": [
      { "name": "Tool Name", "version": "version or empty", "installCmd": "install command", "verifyCmd": "verify command", "notes": "" }
    ],
    "onboarding": [
      { "title": "Step title", "description": "What to do", "owner": "", "notes": "" }
    ],
    "secrets": [
      { "name": "ENV_VAR_NAME", "passPath": "path/in/pass/store", "howToGet": "Instructions", "scope": "dev", "notes": "" }
    ],
    "ci": [
      { "name": "Environment name", "ciUrl": "https://...", "vpnRequired": "no", "connectSteps": "Steps", "notes": "" }
    ]
  }
}

Rules:
- id must be lowercase letters, numbers, hyphens only
- Include only what the user described — do not invent details not mentioned
- Output ONLY the raw JSON array — plain ASCII text in all values, no markdown, no emoji, no special characters
`;

// ── AI provider list ──────────────────────────────────────────────────────────

// ── Task-server typeahead helper ──────────────────────────────────────────────
function gmSanitizeTaskServerName(n) {
  return (n || '').trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
function gmGetTaskServerSuggestions(prefix) {
  try {
    const settingsFile = path.join(os.homedir(), '.config', 'robos', 'settings.json');
    if (!fs.existsSync(settingsFile)) return [];
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    const servers = settings.task_servers || [];
    if (!servers.length) return [];
    const raw = String(prefix || '').replace(/^~\//, '').replace(/^~/, '');
    const slashIdx = raw.indexOf('/');
    const typePart = (slashIdx >= 0 ? raw.slice(0, slashIdx) : raw).toLowerCase();
    const namePart = slashIdx >= 0 ? raw.slice(slashIdx + 1).toLowerCase() : '';
    return servers.filter(s => {
      const sType = (s.type || '').toLowerCase();
      const sName = (s.name || '').toLowerCase();
      const sSan  = gmSanitizeTaskServerName(s.name).toLowerCase();
      if (slashIdx >= 0) {
        if (sType !== typePart) return false;
        if (!namePart) return true;
        return sSan.includes(namePart) || sName.includes(namePart);
      }
      if (!typePart) return true;
      return sType.includes(typePart) || sName.includes(typePart) || sSan.includes(typePart);
    }).map(s => {
      const sanitized = gmSanitizeTaskServerName(s.name);
      const mentionPath = `${s.type}/${sanitized}`;
      return { name: mentionPath, path: mentionPath, displayName: s.name, taskServerType: s.type, isTaskServer: true };
    });
  } catch { return []; }
}

// ── list-path: @ mention typeahead ────────────────────────────────────────────
ipcMain.handle('gm-list-path', (_, prefix) => {
  try {
    const taskServers = gmGetTaskServerSuggestions(prefix);
    const home     = os.homedir();
    const expanded = (prefix || '').replace(/^~/, home);
    const isDir    = expanded.endsWith('/');
    const dir      = isDir ? expanded : path.dirname(expanded);
    const partial  = isDir ? '' : path.basename(expanded);

    const isRecursive = partial && !expanded.slice(home.length + 1).includes('/');
    if (isRecursive) {
      const INDEX_DIR = path.join(home, '.config', 'robos', 'search-index');
      let items = [];
      if (fs.existsSync(INDEX_DIR)) {
        const indexFiles = fs.readdirSync(INDEX_DIR).filter(f => f.endsWith('.txt'));
        const seen = new Set();
        for (const indexFile of indexFiles) {
          const fp = path.join(INDEX_DIR, indexFile);
          const r = cp.spawnSync('grep', ['-i', '-m', '30', partial, fp], { encoding: 'utf8', timeout: 2000 });
          for (const p of (r.stdout || '').split('\n').filter(Boolean)) {
            if (seen.has(p)) continue;
            seen.add(p);
            if (p.startsWith('github.com/')) {
              const parts = p.replace('github.com/', '').split('/');
              if (parts.length === 2) {
                const [org, repo] = parts;
                if (!repo.toLowerCase().includes(partial.toLowerCase()) && !org.toLowerCase().includes(partial.toLowerCase())) continue;
                items.push({ name: `${org}/${repo}`, path: p, isRepo: true });
              }
              continue;
            }
            if (p.startsWith('person:')) {
              const [, username, ...nameParts] = p.split(':');
              const displayName = nameParts.join(':');
              if (!username && !displayName) continue;
              items.push({ name: displayName || username, path: username, isPerson: true });
              continue;
            }
            if (p.startsWith('group:')) {
              const [, groupId, ...nameParts] = p.split(':');
              const groupName = nameParts.join(':');
              if (!groupId && !groupName) continue;
              items.push({ name: groupName || groupId, path: groupId, isGroup: true });
              continue;
            }
            if (!path.basename(p).toLowerCase().includes(partial.toLowerCase())) continue;
            let isDirectory = false;
            try { isDirectory = fs.statSync(p).isDirectory(); } catch {}
            items.push({ name: path.basename(p) + (isDirectory ? '/' : ''), path: p + (isDirectory ? '/' : ''), isDir: isDirectory, isPath: true });
            if (items.length >= 30) break;
          }
          if (items.length >= 30) break;
        }
      }
      // Fallback: filesystem find when search-index has no matches
      if (!items.length) {
        const home2 = os.homedir();
        const result = cp.spawnSync('find', [
          home2, '-maxdepth', '6',
          '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*',
          '-not', '-path', '*/dist/*', '-not', '-path', '*/.cache/*',
          '-not', '-name', '.*', '-iname', `*${partial}*`,
        ], { encoding: 'utf8', timeout: 4000 });
        items = (result.stdout || '').split('\n').filter(Boolean).slice(0, 30).map(p => {
          let isDirectory = false;
          try { isDirectory = fs.statSync(p).isDirectory(); } catch {}
          return { name: path.basename(p) + (isDirectory ? '/' : ''), path: p + (isDirectory ? '/' : ''), isDir: isDirectory, isPath: true };
        });
      }
      return { ok: true, items: [...taskServers, ...items] };
    }

    // Direct directory listing
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return { ok: true, items: taskServers }; }
    const filtered = entries
      .filter(e => !partial || e.name.toLowerCase().startsWith(partial.toLowerCase()))
      .slice(0, 30)
      .map(e => ({
        name: e.name + (e.isDirectory() ? '/' : ''),
        path: path.join(dir, e.name) + (e.isDirectory() ? '/' : ''),
        isDir: e.isDirectory(),
        isPath: true,
      }));
    return { ok: true, items: [...taskServers, ...filtered] };
  } catch (e) {
    return { ok: true, items: [] };
  }
});

ipcMain.handle('gm-list-ai-providers', () => {
  if (aiAgent) return aiAgent.listProviders();
  return { activeId: 'github-copilot', activeName: 'GitHub Copilot', providers: [] };
});

ipcMain.handle('gm-ai-create-group', async (_, { prompt, providerId }) => {
  if (!aiAgent) return { ok: false, error: 'AI agent library not available. Check your RobOS installation.' };
  const rulesPrompt = aiJson ? aiJson.JSON_RULES_PROMPT : '';
  const fullPrompt = `${GROUP_SCHEMA_PROMPT}${rulesPrompt ? '\n\n' + rulesPrompt : ''}\n\nUser description:\n${prompt}`;
  const result = await aiAgent.ask(fullPrompt, providerId ? { providerId } : {});
  if (!result.ok) return { ok: false, error: result.error };

  let parsed = null;
  if (aiJson) {
    const r = aiJson.parseAIJson(result.text);
    if (r.ok) parsed = r.data;
    else return { ok: false, error: `JSON parse error: ${r.error}\n\nRaw:\n${r.raw || ''}` };
  } else {
    parsed = parseGroupsFromAIOutputFallback(result.text);
    if (!parsed) return { ok: false, error: 'AI response did not contain valid group JSON.' };
  }

  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const groups = arr.map(normaliseGroup).filter(g => g.id && g.name);
  if (!groups.length) return { ok: false, error: 'No valid groups found in AI response.' };
  return { ok: true, groups };
});

function parseGroupsFromAIOutputFallback(raw) {
  // eslint-disable-next-line no-control-regex
  const stripped = (raw || '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch {}
  const m = stripped.match(/\[[\s\S]*\]/) || stripped.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

function normaliseGroup(g) {
  return {
    id:          (g.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'new-group',
    name:        g.name || 'New Group',
    description: g.description || '',
    members:     Array.isArray(g.members)    ? g.members    : [],
    workspaces:  Array.isArray(g.workspaces) ? g.workspaces : [],
    settings: {
      git:        Array.isArray(g.settings?.git)        ? g.settings.git        : [],
      software:   Array.isArray(g.settings?.software)   ? g.settings.software   : [],
      onboarding: Array.isArray(g.settings?.onboarding) ? g.settings.onboarding : [],
      secrets:    Array.isArray(g.settings?.secrets)    ? g.settings.secrets    : [],
      ci:         Array.isArray(g.settings?.ci)         ? g.settings.ci         : [],
    },
  };
}

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
      webSecurity: false,
    },
  });
  cockpitWin.loadURL(COCKPIT_URL);
  cockpitWin.setMenuBarVisibility(false);
  cockpitWin.webContents.on('certificate-error', (event, _url, _err, _cert, callback) => {
    event.preventDefault();
    callback(true);
  });
  cockpitWin.on('closed', () => { cockpitWin = null; });
  return { ok: true };
});

