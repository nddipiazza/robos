// Quest: Warrior Dragon AI playthrough dashboard: a tray icon that follows the run and a
// window that shows live IPC game state, the milestone list (clickable as checkpoints
// land) and the per-milestone videos recorded by tests/e2e/play_full_game.py --stepped.
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const PROJECT_DIR = path.resolve(__dirname, '..', '..');

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const REPORTS_DIR = path.resolve(argValue('--reports',
  process.env.REPORTS_DIR || path.join(PROJECT_DIR, 'tests', 'e2e', 'reports', 'playthrough')));
let gamePort = parseInt(argValue('--port', process.env.DW_WEB_SERVICE_PORT || '0'), 10) || 0;

let win = null;
let tray = null;
let quitting = false;
let lastTraySig = '';

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readLive() {
  const live = readJson(path.join(REPORTS_DIR, 'live.json'));
  if (live && live.port) gamePort = live.port;
  if (live && live.driver_pid) {
    try { process.kill(live.driver_pid, 0); live.driver_alive = true; } catch { live.driver_alive = false; }
  }
  return live;
}

function readRegistry() {
  const data = readJson(path.join(PROJECT_DIR, 'data', 'v1', 'milestones.json'));
  return data ? data.milestones || [] : [];
}

function httpJson(method, urlPath, body) {
  return new Promise((resolve) => {
    if (!gamePort) return resolve(null);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1', port: gamePort, path: urlPath, method, timeout: 2500,
      headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {},
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    if (payload) req.write(payload);
    req.end();
  });
}

const gameState = () => httpJson('GET', '/api/v1/state');
const gameCommand = (command, args) => httpJson('POST', '/api/v1/command', { command, args: args || {} });

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    title: 'Quest: Warrior Dragon — AI Playthrough',
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // The tray owns the lifetime: closing the window just hides it.
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function showWindow() {
  if (!win) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function summaryLine(live) {
  if (!live) return 'No run yet — waiting for live.json';
  const s = live.stats || {};
  return `${live.status} · ${live.done_count}/${live.total} · L${s.level ?? '?'} · HP ${s.hp ?? '?'}/${s.hp_max ?? '?'} · ` +
    `${s.gold ?? '?'}G · ${live.battles ?? 0} battles · ${live.deaths ?? 0} deaths`;
}

function latestVideo(live) {
  if (!live) return null;
  const done = (live.milestones || []).filter((m) => m.video);
  return done.length ? path.join(REPORTS_DIR, done[done.length - 1].video) : null;
}

function rebuildTrayMenu(live) {
  if (!tray) return;
  const current = live && live.milestones ? live.milestones[live.index] : null;
  const objective = live && live.objective ? live.objective.label : '';
  const video = latestVideo(live);
  const menu = Menu.buildFromTemplate([
    { label: summaryLine(live), enabled: false },
    { label: current ? `▶ #${current.index} ${current.name}` : '—', enabled: false },
    { label: objective ? `   ${objective}` : '   (no objective)', enabled: false },
    { type: 'separator' },
    { label: 'Show dashboard', click: showWindow },
    { label: 'Open latest milestone video', enabled: !!video, click: () => video && shell.openPath(video) },
    { label: 'Open videos folder', click: () => shell.openPath(path.join(REPORTS_DIR, 'videos')) },
    { label: 'Open reports folder', click: () => shell.openPath(REPORTS_DIR) },
    { type: 'separator' },
    {
      label: 'Stop run (stop_play_game)',
      enabled: !!(live && live.status === 'running' && live.driver_alive),
      click: () => gameCommand('stop_play_game'),
    },
    { label: 'Quit dashboard', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`Quest: Warrior Dragon playthrough\n${summaryLine(live)}`);
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'tray.png')));
  tray.setTitle('DW');
  tray.on('click', () => (win && win.isVisible() ? win.hide() : showWindow()));
  tray.on('double-click', showWindow);
  rebuildTrayMenu(readLive());
}

// ── IPC for the renderer ──────────────────────────────────────────────────
ipcMain.handle('dash:config', () => ({
  reportsDir: REPORTS_DIR, projectDir: PROJECT_DIR, port: gamePort,
  select: parseInt(argValue('--select', '0'), 10) || 0,   // debug: open this milestone's card on start
}));
ipcMain.handle('dash:live', () => readLive());
ipcMain.handle('dash:registry', () => readRegistry());
ipcMain.handle('dash:read-json', (_e, rel) => readJson(path.join(REPORTS_DIR, rel)));
ipcMain.handle('dash:report', () => readJson(path.join(REPORTS_DIR, 'playthrough.json')));
ipcMain.handle('dash:file-url', (_e, rel) => {
  const abs = path.join(REPORTS_DIR, rel);
  return fs.existsSync(abs) ? `file://${abs}` : null;
});
ipcMain.handle('dash:state', () => gameState());
ipcMain.handle('dash:command', (_e, command, args) => gameCommand(command, args));
ipcMain.handle('dash:screenshot', async () => {
  const file = path.join(REPORTS_DIR, 'live.png');
  const res = await gameCommand('capture_screenshot', { file_path: file });
  if (!res || !res.success || !fs.existsSync(file)) return null;
  return `file://${file}?t=${Date.now()}`;
});
ipcMain.handle('dash:open', (_e, rel) => shell.openPath(rel ? path.join(REPORTS_DIR, rel) : REPORTS_DIR));
ipcMain.handle('dash:reveal', (_e, rel) => shell.showItemInFolder(path.join(REPORTS_DIR, rel)));
ipcMain.handle('dash:set-tray', (_e, dataUrl, sig) => {
  if (!tray || sig === lastTraySig) return false;
  lastTraySig = sig;
  try {
    tray.setImage(nativeImage.createFromDataURL(dataUrl));
  } catch {
    return false;
  }
  return true;
});

app.whenReady().then(() => {
  createTray();
  createWindow();
  if (process.argv.includes('--hidden')) win.hide();
  // Debug aid for headless agents: --snapshot out.png writes the rendered window after a few seconds.
  const snap = argValue('--snapshot', '');
  if (snap) {
    setTimeout(async () => {
      try {
        fs.writeFileSync(snap, (await win.webContents.capturePage()).toPNG());
      } catch (e) {
        console.error('snapshot failed', e);
      }
    }, 5000);
  }
  setInterval(() => rebuildTrayMenu(readLive()), 3000);
});

app.on('window-all-closed', (e) => { /* keep running in the tray */ });
app.on('before-quit', () => { quitting = true; });
