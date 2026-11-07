'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

app.setName('robos-people-directory');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'people-directory'));
if (process.env.ROBOS_TEST !== '1') {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); process.exit(0); }
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

function requireShared(relPath) {
  const candidates = [
    process.env.ROBOS_LIB_PATH && relPath.startsWith('robos-lib/') && path.join(process.env.ROBOS_LIB_PATH, relPath.slice('robos-lib/'.length)),
    path.resolve(__dirname, '..', relPath),
    path.join('/usr/local/share/robos', relPath),
  ].filter(Boolean);
  for (const p of candidates) {
    try { return require(p); } catch {}
  }
  return null;
}

const aiAgent      = requireShared('robos-lib/ai-agent');
const aiJson       = requireShared('robos-lib/ai-json');
const _debugServer = requireShared('robos-lib/dom-snapshot');
const peopleStore  = requireShared('robos-lib/people-store');
const partySurvey  = requireShared('party-game/lib/survey');
const partyRoles   = requireShared('party-game/lib/roles');

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
  ensureDataDir();
  win = new BrowserWindow({
    skipTaskbar: false,
    width: 1240, height: 820,
    title: 'RobOS People & User Profiles',
    backgroundColor: '#0d1117',
    icon: fs.existsSync(path.join(__dirname, 'icon.png')) ? path.join(__dirname, 'icon.png') : path.join(__dirname, 'icon.svg'),
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
  if (peopleStore) {
    peopleStore.ensureDefaultProfiles();
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ backend: 'filesystem' }, null, 2));
  }
}

function loadAllPeople() {
  if (peopleStore) return peopleStore.loadAllPeople({ includePhotoDataUrl: true });
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
    const lines = people.map(p => `person:${p.username || p.uid || ''}:${p.displayName || ''}`).filter(l => l !== 'person::');
    const indexDir = path.join(os.homedir(), '.config', 'robos', 'search-index');
    fs.mkdirSync(indexDir, { recursive: true });
    fs.writeFileSync(path.join(indexDir, 'people.txt'), lines.join('\n') + (lines.length ? '\n' : ''));
  } catch {}
}

function savePerson(person) {
  ensureDataDir();
  if (!person.uid) throw new Error('uid required');
  let saved = person;
  if (peopleStore) {
    saved = peopleStore.savePerson(person);
  } else {
    const file = path.join(DATA_DIR, `${person.uid}.json`);
    fs.writeFileSync(file, JSON.stringify(person, null, 2));
  }
  buildPeopleIndex();
  return saved;
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

ipcMain.handle('pd-pick-photo', async (_, { uid, caption, setPrimary = true } = {}) => {
  if (!win) return { ok: false, error: 'Window not ready' };
  const res = await dialog.showOpenDialog(win, {
    title: 'Select Profile Photo',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'svg'] }],
  });
  if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
  try {
    if (uid && peopleStore) {
      const updated = peopleStore.savePersonPhoto(uid, {
        sourcePath: res.filePaths[0],
        caption: caption || '',
        setPrimary: setPrimary !== false,
      });
      return { ok: true, person: updated };
    }
    const ext = path.extname(res.filePaths[0]).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const dataUrl = `data:${mime};base64,${fs.readFileSync(res.filePaths[0]).toString('base64')}`;
    return { ok: true, dataUrl, sourcePath: res.filePaths[0] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('pd-upload-photo', async (_, { uid, dataUrl, caption, setPrimary = true } = {}) => {
  try {
    if (!peopleStore) return { ok: false, error: 'people-store not available' };
    const updated = peopleStore.savePersonPhoto(uid, { dataUrl, caption, setPrimary });
    return { ok: true, person: updated };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('pd-get-party-schema', () => {
  return {
    questions: partySurvey ? partySurvey.getSurvey() : [],
    roles: partyRoles ? partyRoles.ROLE_CATALOG : [],
  };
});

ipcMain.handle('pd-launch-party-game', () => {
  try {
    const electronBin = path.resolve(__dirname, '..', '..', 'scripts', 'source-shortcuts', 'node_modules', 'electron', 'dist', 'electron');
    const sourceHost  = path.resolve(__dirname, '..', '..', 'scripts', 'source-shortcuts', 'source-host.cjs');
    const partyDir    = path.resolve(__dirname, '..', 'party-game');
    if (fs.existsSync(electronBin) && fs.existsSync(sourceHost)) {
      const child = cp.spawn(electronBin, ['--no-sandbox', '--class=robos-source-party-game', sourceHost, '--app=party-game'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return { ok: true };
    }
    const child = cp.spawn(process.execPath, [partyDir, '--no-sandbox'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('pd-list-ai-providers', async () => {
  if (!aiAgent) return { activeName: 'GitHub Copilot', providers: [] };
  return aiAgent.listProviders();
});

ipcMain.handle('pd-ai-add-person', async (_, { prompt, providerId }) => {
  if (!aiAgent) return { ok: false, error: 'AI library not available' };
  const rulesPrompt = aiJson ? aiJson.JSON_RULES_PROMPT : '';
  const systemPrompt = `You are a RobOS People & Game Profile assistant. Given a description of one or more people, return ONLY a JSON array where each element is an object with these fields:
uid (kebab-case unique id), displayName, firstName, lastName, nickname, email, title, department, phone, location, username, avatar (single emoji), color (hex color), bio,
personality: { archetype, tagline, traits (string[]), quirks (string[]), petPeeves (string[]), boundaries (string[]), adaptability, communicationStyle },
interests: { expertTopics (string[]), hobbies (string[]), musicLikes (string[]), musicDislikes (string[]), favoriteBands (string[]), booksAndGenres (string[]), gamesAndPlatforms (string[]), foodAndTextureNotes, environmentPreferences },
family: { partnerName, children (string[]), householdRoutines, relationshipDynamic, sharedActivities (string[]) },
gameProfile: {
  gamerTag, avatar, color,
  rpgCharacter: { game, characterClass, subclass, platform, playstyle, blurb },
  favoriteGames (string[]),
  partyGame: {
    enabled: true,
    preferredRole (one of: detective, wildcard, trickster, diplomat, champion, storyteller, underdog),
    surveyAnswers: {
      "party-arrival": "snacks"|"host"|"corner"|"dj",
      "competitive": 1..5,
      "secret-talent": string,
      "superpower": "invisibility"|"mind-reading"|"flight"|"time"|"healing",
      "group-chat": "memes"|"planner"|"lurker"|"essay",
      "hobby": string,
      "fav-show": string,
      "music": string,
      "expert-topic": string,
      "travel": string,
      "worst-job": string,
      "embarrassing": string,
      "rule-breaker": 1..5,
      "guilty-pleasure": string,
      "zombie": "leader"|"medic"|"engineer"|"first"|"traitor",
      "spontaneous": 1..5,
      "dinner-guest": string,
      "storytelling": 1..5
    },
    customFacts: [ { id, prompt, answer, text, interest (boolean) } ]
  }
}.
If only one person is described, still return a JSON array with one element. Fill in reasonable values for any missing fields.

IMPORTANT OUTPUT RULES:
- Output ONLY the raw JSON array — no markdown fences, no explanation, no comments
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
      const saved = savePerson(person);
      people.push(saved);
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
        if (sType !== sType) return false;
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
