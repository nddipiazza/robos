const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

const SETTINGS_FILE = path.join(os.homedir(), '.config', 'robos', 'settings.json');

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
  catch { return {}; }
}
function writeSettings(data) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

function getJournalDir(settings) {
  const repo = settings.journal_repo;
  if (!repo) return null;
  const parts = repo.replace('https://github.com/', '').replace('git@github.com:', '').replace('.git', '').split('/');
  return path.join(os.homedir(), 'source', 'github.com', parts[0], parts[1]);
}

function ensureJournalCloned(settings) {
  const dir = getJournalDir(settings);
  if (!dir) return { ok: false, error: 'Journal repo not configured' };
  if (!fs.existsSync(path.join(dir, '.git'))) {
    const r = cp.spawnSync('gh', ['repo', 'clone', settings.journal_repo, dir], { encoding: 'utf8' });
    if (r.status !== 0) return { ok: false, error: r.stderr || 'Clone failed' };
  }
  return { ok: true, dir };
}

function gitPush(dir) {
  cp.spawnSync('git', ['-C', dir, 'add', '-A'], { encoding: 'utf8' });
  const status = cp.spawnSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' });
  if (!status.stdout.trim()) return; // nothing to commit
  cp.spawnSync('git', ['-C', dir, 'commit', '-m', `journal: auto-update ${new Date().toISOString().slice(0,10)}`], { encoding: 'utf8' });
  cp.spawnSync('git', ['-C', dir, 'push'], { encoding: 'utf8' });
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function ensureIndex(dir) {
  const idx = path.join(dir, 'index.md');
  if (!fs.existsSync(idx)) {
    fs.writeFileSync(idx, `# RobOS Work Journal\n\nAuto-generated developer journal. Updated by RobOS apps.\n\n## Daily Entries\n\n## Categories\n- [Tasks](categories/tasks.md)\n- [Projects](categories/projects.md)\n- [Notes](categories/notes.md)\n- [Tech Docs](categories/tech-docs.md)\n`);
  }
  for (const cat of ['tasks', 'projects', 'notes', 'tech-docs']) {
    const catFile = path.join(dir, 'categories', `${cat}.md`);
    fs.mkdirSync(path.dirname(catFile), { recursive: true });
    if (!fs.existsSync(catFile)) fs.writeFileSync(catFile, `# ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n\n`);
  }
  fs.mkdirSync(path.join(dir, 'daily'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'workflow-studio'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'task-planner'), { recursive: true });
}

function getTodayFile(dir) {
  const today = todayStr();
  const file = path.join(dir, 'daily', `${today}.md`);
  if (!fs.existsSync(file)) {
    const dow = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    fs.writeFileSync(file, `# Journal — ${today} (${dow})\n\n## 🎯 Today's Focus\n\n\n## ✏️ Notes\n\n\n## 🔗 References\n\n`);
    // Add link to index
    const idx = path.join(dir, 'index.md');
    let content = fs.readFileSync(idx, 'utf8');
    const link = `- [${today}](daily/${today}.md)`;
    if (!content.includes(link)) {
      content = content.replace('## Daily Entries\n', `## Daily Entries\n${link}\n`);
      fs.writeFileSync(idx, content);
    }
  }
  return file;
}

// ── Journal event log ─────────────────────────────────────────────────────────
const JOURNAL_EVENTS_FILE = path.join(os.homedir(), '.config', 'robos', 'journal-events.json');

function writeJournalEvent(evt) {
  try {
    fs.mkdirSync(path.dirname(JOURNAL_EVENTS_FILE), { recursive: true });
    let events = [];
    try { events = JSON.parse(fs.readFileSync(JOURNAL_EVENTS_FILE, 'utf8')); } catch {}
    events.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, timestamp: new Date().toISOString(), ...evt });
    if (events.length > 2000) events = events.slice(0, 2000);
    fs.writeFileSync(JOURNAL_EVENTS_FILE, JSON.stringify(events, null, 2));
  } catch {}
}

function readJournalEvents(date) {
  try {
    const events = JSON.parse(fs.readFileSync(JOURNAL_EVENTS_FILE, 'utf8'));
    if (!date) return events;
    return events.filter(e => e.timestamp && e.timestamp.slice(0, 10) === date);
  } catch { return []; }
}

function createWindow() {
  const win = new BrowserWindow({
    skipTaskbar: true,
    width: 1100, height: 800, minWidth: 800, minHeight: 600,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
    title: 'RobOS Work Journal',
    autoHideMenuBar: true,
  });
  win.loadFile('renderer/index.html');
}

app.setName('work-journal');
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.handle('read-settings', () => readSettings());
ipcMain.handle('write-settings', (_, data) => { writeSettings(data); });

ipcMain.handle('journal-init', async (_, { repo }) => {
  const settings = readSettings();
  settings.journal_repo = repo;
  writeSettings(settings);
  const r = ensureJournalCloned(settings);
  if (!r.ok) return r;
  ensureIndex(r.dir);
  gitPush(r.dir);
  return { ok: true, dir: r.dir };
});

ipcMain.handle('journal-status', () => {
  const settings = readSettings();
  const dir = getJournalDir(settings);
  if (!dir) return { configured: false };
  const cloned = fs.existsSync(path.join(dir, '.git'));
  return { configured: true, repo: settings.journal_repo, dir, cloned };
});

ipcMain.handle('journal-read-today', () => {
  const settings = readSettings();
  const r = ensureJournalCloned(settings);
  if (!r.ok) return r;
  ensureIndex(r.dir);
  const file = getTodayFile(r.dir);
  return { ok: true, content: fs.readFileSync(file, 'utf8'), date: todayStr(), file };
});

ipcMain.handle('journal-write-today', async (_, { content }) => {
  const settings = readSettings();
  const r = ensureJournalCloned(settings);
  if (!r.ok) return r;
  ensureIndex(r.dir);
  const file = getTodayFile(r.dir);
  fs.writeFileSync(file, content);
  gitPush(r.dir);
  return { ok: true };
});

ipcMain.handle('journal-append', async (_, { section, text, folder }) => {
  const settings = readSettings();
  const r = ensureJournalCloned(settings);
  if (!r.ok) return r;
  ensureIndex(r.dir);
  if (folder) {
    // Write to a named folder (e.g. workflow-studio/, task-planner/)
    const subDir = path.join(r.dir, folder);
    fs.mkdirSync(subDir, { recursive: true });
    const file = path.join(subDir, `${todayStr()}.md`);
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : `# ${folder} — ${todayStr()}\n\n`;
    fs.writeFileSync(file, existing + `\n## ${section} — ${new Date().toLocaleTimeString()}\n\n${text}\n`);
  } else {
    const file = getTodayFile(r.dir);
    let content = fs.readFileSync(file, 'utf8');
    const marker = `## ${section}`;
    if (content.includes(marker)) {
      content = content.replace(marker, `${marker}\n${text}\n`);
    } else {
      content += `\n## ${section}\n${text}\n`;
    }
    fs.writeFileSync(file, content);
  }
  gitPush(r.dir);
  return { ok: true };
});

ipcMain.handle('journal-list-entries', () => {
  const settings = readSettings();
  const dir = getJournalDir(settings);
  if (!dir || !fs.existsSync(path.join(dir, 'daily'))) return { ok: true, entries: [] };
  const entries = fs.readdirSync(path.join(dir, 'daily'))
    .filter(f => f.endsWith('.md'))
    .sort().reverse()
    .map(f => ({ date: f.replace('.md', ''), file: path.join(dir, 'daily', f) }));
  return { ok: true, entries };
});

ipcMain.handle('journal-read-entry', (_, { file }) => {
  try { return { ok: true, content: fs.readFileSync(file, 'utf8') }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('journal-read-events', (_, { date } = {}) => {
  return { ok: true, events: readJournalEvents(date) };
});

ipcMain.handle('journal-log-event', (_, evt) => {
  writeJournalEvent(evt);
  return { ok: true };
});

ipcMain.handle('open-app', (_, appName) => {
  const scripts = {
    'context-manager':  '/usr/local/share/robos/context-manager/context-manager.sh',
    'task-planner':     '/usr/local/share/robos/task-planner/task-planner.sh',
    'workflow-studio':  '/usr/local/share/robos/workflow-studio/workflow-studio.sh',
    'agents-manager':   '/usr/local/share/robos/agents-manager/agents-manager.sh',
    'git-projects':     '/usr/local/share/robos/git-projects/git-projects.sh',
    'work-journal':     '/usr/local/share/robos/work-journal/work-journal.sh',
  };
  const script = scripts[appName];
  if (!script) return { ok: false, error: 'Unknown app: ' + appName };
  cp.spawn('bash', [script], { detached: true, stdio: 'ignore', env: { ...process.env, DISPLAY: ':0' } }).unref();
  return { ok: true };
});

ipcMain.handle('open-url', (_, url) => { shell.openExternal(url); });

ipcMain.handle('open-file-path', (_, filePath) => {
  // Open the containing folder and highlight the file
  shell.showItemInFolder(filePath);
});
