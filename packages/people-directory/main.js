'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

app.setName('robos-people-directory');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'people-directory'));
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// ── Shared AI library ─────────────────────────────────────────────────────────
let aiAgent = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'ai-agent'),
    path.resolve(__dirname, '..', 'robos-lib', 'ai-agent'),
    '/usr/local/share/robos/robos-lib/ai-agent',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { aiAgent = require(p); break; } catch {}
  }
} catch {}

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
} catch {}

// ── Debug snapshot server ─────────────────────────────────────────────────────
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
  if (_debugServer) _debugServer.startDebugServer(win, 19133);
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
  const s = loadSettings(); s.myProfileUid = uid || null; saveSettings(s); return { ok: true };
});

ipcMain.handle('pd-list-ai-providers', async () => {
  if (!aiAgent) return { activeName: 'GitHub Copilot', providers: [] };
  return aiAgent.listProviders();
});

ipcMain.handle('pd-ai-add-person', async (_, { prompt, providerId }) => {
  if (!aiAgent) return { ok: false, error: 'AI library not available' };
  const rulesPrompt = aiJson ? aiJson.JSON_RULES_PROMPT : '';
  const systemPrompt = `You are a people-directory assistant. Given a description of one or more people, return ONLY a JSON array where each element is an object with these fields:
uid (kebab-case unique id), displayName, firstName, lastName, email, title, department, phone, location, username, bio.
If only one person is described, still return a JSON array with one element. Fill in reasonable values for any missing fields.

IMPORTANT OUTPUT RULES:
- Output ONLY the raw JSON array — no markdown fences, no explanation, no comments
- Use plain ASCII text only — no emoji, no Unicode symbols, no special characters
- Do not include any ANSI escape codes or control characters${rulesPrompt ? '\n\n' + rulesPrompt : ''}`;
  const fullPrompt = `${systemPrompt}\n\nDescription: ${prompt}`;
  try {
    const result = await aiAgent.ask(fullPrompt, { providerId: providerId || undefined });
    if (!result.ok) return { ok: false, error: result.error || 'AI generation failed' };

    let parsed;
    if (aiJson) {
      const r = aiJson.parseAIJson(result.text);
      if (!r.ok) return { ok: false, error: `JSON parse error: ${r.error}` };
      parsed = r.data;
    } else {
      // eslint-disable-next-line no-control-regex
      let json = (result.text || '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b[()][0-9A-Z]/g, '').trim();
      json = json.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const arrMatch = json.match(/\[[\s\S]*\]/);
      if (arrMatch) json = arrMatch[0];
      parsed = JSON.parse(json);
    }

    if (!Array.isArray(parsed)) parsed = [parsed];
    const people = [];
    for (const person of parsed) {
      if (!person.uid) person.uid = `person-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      if (!person.displayName) person.displayName = `${person.firstName || person.givenName || ''} ${person.lastName || person.sn || ''}`.trim() || person.uid;
      if (!person.firstName && person.givenName) { person.firstName = person.givenName; delete person.givenName; }
      if (!person.lastName && person.sn) { person.lastName = person.sn; delete person.sn; }
      if (!person.email && person.mail) { person.email = person.mail; delete person.mail; }
      if (!person.phone && person.telephoneNumber) { person.phone = person.telephoneNumber; delete person.telephoneNumber; }
      savePerson(person);
      people.push(person);
    }
    return { ok: true, people, person: people[0] };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
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

// ── Task-server typeahead helper ──────────────────────────────────────────────
function pdSanitizeTaskServerName(n) {
  return (n || '').trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
function pdGetTaskServerSuggestions(prefix) {
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
      const sSan  = pdSanitizeTaskServerName(s.name).toLowerCase();
      if (slashIdx >= 0) {
        if (sType !== typePart) return false;
        if (!namePart) return true;
        return sSan.includes(namePart) || sName.includes(namePart);
      }
      if (!typePart) return true;
      return sType.includes(typePart) || sName.includes(typePart) || sSan.includes(typePart);
    }).map(s => {
      const sanitized = pdSanitizeTaskServerName(s.name);
      const mentionPath = `${s.type}/${sanitized}`;
      return { name: mentionPath, path: mentionPath, displayName: s.name, taskServerType: s.type, isTaskServer: true };
    });
  } catch { return []; }
}

// ── list-path: @-mention file typeahead for robos-ai-textarea ─────────────────
ipcMain.handle('pd-list-path', (_, prefix) => {
  try {
    const taskServers = pdGetTaskServerSuggestions(prefix);
    const home     = os.homedir();
    const expanded = prefix.replace(/^~/, home);
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
            if (!path.basename(p).toLowerCase().includes(partial.toLowerCase())) continue;
            let isDirectory = false;
            try { isDirectory = fs.statSync(p).isDirectory(); } catch {}
            items.push({ name: path.basename(p) + (isDirectory ? '/' : ''), path: p + (isDirectory ? '/' : ''), isDir: isDirectory, isPath: true });
            if (items.length >= 30) break;
          }
          if (items.length >= 30) break;
        }
      }
      if (!items.length) {
        const result = cp.spawnSync('find', [
          home, '-maxdepth', '6',
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

    if (!fs.existsSync(dir)) return { ok: true, items: taskServers };
    if (!fs.statSync(dir).isDirectory()) return { ok: true, items: taskServers };
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const items = entries
      .filter(e => !partial || e.name.toLowerCase().includes(partial.toLowerCase()))
      .filter(e => partial.startsWith('.') || !e.name.startsWith('.'))
      .slice(0, 30)
      .map(e => ({
        name:  e.name + (e.isDirectory() ? '/' : ''),
        path:  path.join(dir, e.name) + (e.isDirectory() ? '/' : ''),
        isDir: e.isDirectory(),
        isPath: true,
      }));
    return { ok: true, items: [...taskServers, ...items] };
  } catch { return { ok: true, items: [] }; }
});
