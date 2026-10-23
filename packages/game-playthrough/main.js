// RobOS Game Playthrough: runs the Quest: Warrior Dragon end-to-end AI playthrough
// (games/quest-warrior-dragon/tests/e2e/play_full_game.py) and watches it. A tray icon
// follows the run; the window shows live IPC game state, the milestone list (clickable as
// checkpoints land), the per-milestone videos, and the history of earlier runs. Runs can be
// started from scratch, resumed from any milestone checkpoint, or replay a single milestone.
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

for (const flag of ['no-sandbox', 'disable-gpu', 'disable-dev-shm-usage']) app.commandLine.appendSwitch(flag);
app.setName('robos-game-playthrough');

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// ── Where the game lives ──────────────────────────────────────────────────
// From the repo the game is ../../games/quest-warrior-dragon. An installed copy
// (/usr/local/share/robos/game-playthrough) uses ROBOS_REPO, --game-dir, or the folder
// picked in the app (saved in settings.json).
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const settings = readJson(SETTINGS_FILE) || {};
const isGameDir = (d) => !!d && fs.existsSync(path.join(d, 'tests', 'e2e', 'play_full_game.py'));

function resolveGameDir() {
  const candidates = [
    argValue('--game-dir', ''),
    process.env.DW_GAME_DIR,
    process.env.ROBOS_REPO && path.join(process.env.ROBOS_REPO, 'games', 'quest-warrior-dragon'),
    path.resolve(__dirname, '..', '..', 'games', 'quest-warrior-dragon'),
    settings.gameDir,
    path.join(app.getPath('home'), 'source', 'robos', 'games', 'quest-warrior-dragon'),
  ];
  return candidates.find(isGameDir) || '';
}

let GAME_DIR = resolveGameDir();
const liveReportsDir = () => path.resolve(argValue('--reports',
  process.env.REPORTS_DIR || path.join(GAME_DIR, 'tests', 'e2e', 'reports', 'playthrough')));
const archiveDir = () => path.join(path.dirname(liveReportsDir()), 'archive');
let viewDir = '';                       // '' = the live run; otherwise an archived run folder
const reportsDir = () => viewDir || liveReportsDir();
let gamePort = parseInt(argValue('--port', process.env.DW_WEB_SERVICE_PORT || '0'), 10) || 0;

let win = null;
let tray = null;
let quitting = false;
let lastTraySig = '';

function readLive() {
  const live = readJson(path.join(reportsDir(), 'live.json'));
  if (!live) return null;
  if (!viewDir && live.port) gamePort = live.port;
  live.driver_alive = false;
  if (live.driver_pid) {
    try { process.kill(live.driver_pid, 0); live.driver_alive = true; } catch { /* gone */ }
  }
  if (viewDir) live.driver_alive = false;   // an archived run is never live
  // A finished driver leaves "running" when it stopped at --until; the report says if it passed.
  // Otherwise it died (killed, crashed, machine restarted) before writing a final status.
  if (live.status === 'running' && !live.driver_alive) {
    const rep = readJson(path.join(reportsDir(), 'playthrough.json'));
    live.status = rep && rep.ok === true ? 'passed' : 'interrupted';
  }
  return live;
}

function readRegistry() {
  const data = GAME_DIR ? readJson(path.join(GAME_DIR, 'data', 'v1', 'milestones.json')) : null;
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

// ── Running the e2e playthrough ───────────────────────────────────────────
let runChild = null;      // driver started by this app
let runLog = [];          // last lines of its output
const RUN_LOG_MAX = 400;

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function pickPort() {
  for (let p = 19260; p < 19300; p += 1) if (await portFree(p)) return p;
  return 19260;
}

function externalDriverAlive() {
  const live = readJson(path.join(liveReportsDir(), 'live.json'));
  if (!live || !live.driver_pid || live.status !== 'running') return 0;
  try { process.kill(live.driver_pid, 0); return live.driver_pid; } catch { return 0; }
}

function runStatus() {
  return {
    gameDir: GAME_DIR,
    running: !!runChild || !!externalDriverAlive(),
    ownedByApp: !!runChild,
    pid: runChild ? runChild.pid : externalDriverAlive(),
    args: runChild ? runChild.spawnargs.slice(2) : [],
    log: runLog.slice(-200),
  };
}

async function startRun(opts = {}) {
  if (!isGameDir(GAME_DIR)) return { ok: false, error: 'Game folder not found. Choose the games/quest-warrior-dragon folder.' };
  if (runChild || externalDriverAlive()) return { ok: false, error: 'A playthrough is already running.' };
  const port = await pickPort();
  const args = ['-u', 'tests/e2e/play_full_game.py', '--stepped', '--dashboard', 'off', '--port', String(port),
    '--time-scale', String(Number(opts.timeScale) || 8), '--timeout', String(Number(opts.timeoutSec) || 14400)];
  const n = parseInt(opts.milestone, 10);
  if (opts.mode === 'resume' && n > 1) args.push('--from', String(n));
  if (opts.mode === 'only' && n >= 1) args.push('--only', String(n));
  if (parseInt(opts.until, 10) > 0) args.push('--until', String(parseInt(opts.until, 10)));
  if (opts.archive === false) args.push('--no-archive');
  const env = { ...process.env, PYTHONUNBUFFERED: '1', DW_HEADED: opts.headed ? '1' : '0', DW_E2E_SOUND: opts.sound ? '1' : '0' };
  viewDir = '';
  gamePort = port;
  runLog = [`$ python3 ${args.slice(1).join(' ')}`];
  runChild = spawn(process.platform === 'win32' ? 'python' : 'python3', args, { cwd: GAME_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const onData = (buf) => {
    for (const line of buf.toString().split('\n')) if (line.trim()) runLog.push(line);
    if (runLog.length > RUN_LOG_MAX) runLog = runLog.slice(-RUN_LOG_MAX);
  };
  runChild.stdout.on('data', onData);
  runChild.stderr.on('data', onData);
  runChild.on('exit', (code, signal) => {
    runLog.push(`— driver exited (${signal || `code ${code}`})`);
    runChild = null;
    rebuildTrayMenu(readLive());
  });
  return { ok: true, pid: runChild.pid, port };
}

async function stopRun() {
  // Ask the brain to stop first so the driver writes its report, then make sure it exits.
  await gameCommand('stop_play_game');
  const pid = runChild ? runChild.pid : externalDriverAlive();
  if (!pid) return { ok: false, error: 'No playthrough is running.' };
  setTimeout(() => {
    try { process.kill(pid, 0); process.kill(pid, 'SIGTERM'); } catch { /* already exited */ }
  }, 20000);
  return { ok: true };
}

// ── Run history ───────────────────────────────────────────────────────────
function runSummary(dir, isLive) {
  const rep = readJson(path.join(dir, 'playthrough.json'));
  const live = readJson(path.join(dir, 'live.json'));
  if (!rep && !live) return null;
  const r = rep || {};
  const l = live || {};
  return {
    dir: isLive ? '' : dir,
    name: isLive ? 'Current run' : path.basename(dir),
    live: isLive,
    started_at: r.started_at || '',
    status: interruptedIfDead(l.status || r.status || '?', l.driver_pid, r.ok === true),
    done: l.done_count ?? (r.milestones || []).length,
    total: l.total || 0,
    battles: l.battles ?? r.battles ?? 0,
    deaths: l.deaths ?? r.deaths ?? 0,
    elapsed_sec: l.elapsed_sec ?? r.elapsed_sec ?? 0,
    error: l.error || r.error || '',
    resumed_from: r.resumed_from || '',
    videos: fs.existsSync(path.join(dir, 'videos')) ? fs.readdirSync(path.join(dir, 'videos')).filter((f) => f.endsWith('.mp4')).length : 0,
  };
}

function interruptedIfDead(status, pid, passed) {
  if (status !== 'running') return status;
  try { if (pid) { process.kill(pid, 0); return status; } } catch { /* gone */ }
  return passed ? 'passed' : 'interrupted';
}

function listRuns() {
  const runs = [];
  const cur = runSummary(liveReportsDir(), true);
  if (cur) runs.push(cur);
  try {
    const dirs = fs.readdirSync(archiveDir(), { withFileTypes: true }).filter((d) => d.isDirectory())
      .map((d) => path.join(archiveDir(), d.name)).sort().reverse();
    for (const d of dirs) {
      const s = runSummary(d, false);
      if (s) runs.push(s);
    }
  } catch { /* no archive yet */ }
  return runs;
}

function listCheckpoints() {
  try {
    return fs.readdirSync(path.join(liveReportsDir(), 'checkpoints')).filter((f) => /^\d+-.*\.json$/.test(f))
      .map((f) => ({ index: parseInt(f, 10), file: f })).sort((a, b) => a.index - b.index);
  } catch {
    return [];
  }
}

// ── Window & tray ─────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    title: 'RobOS Game Playthrough',
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
  try {
    const { registerSnapshotIPC, startDebugServer } = require('/usr/local/share/robos/robos-lib/dom-snapshot');
    registerSnapshotIPC(win);
    startDebugServer(win, 19203, 'game-playthrough');
  } catch {
    try {
      const { registerSnapshotIPC, startDebugServer } = require('../robos-lib/dom-snapshot');
      registerSnapshotIPC(win);
      startDebugServer(win, 19203, 'game-playthrough');
    } catch { /* robos-lib not installed */ }
  }
}

function showWindow() {
  if (!win) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function summaryLine(live) {
  if (!live) return 'No run yet';
  const s = live.stats || {};
  return `${live.status} · ${live.done_count}/${live.total} · L${s.level ?? '?'} · HP ${s.hp ?? '?'}/${s.hp_max ?? '?'} · ` +
    `${s.gold ?? '?'}G · ${live.battles ?? 0} battles · ${live.deaths ?? 0} deaths`;
}

function latestVideo(live) {
  if (!live) return null;
  const done = (live.milestones || []).filter((m) => m.video);
  return done.length ? path.join(reportsDir(), done[done.length - 1].video) : null;
}

function rebuildTrayMenu(live) {
  if (!tray) return;
  const current = live && live.milestones ? live.milestones[live.index] : null;
  const objective = live && live.objective ? live.objective.label : '';
  const video = latestVideo(live);
  const running = runStatus().running;
  const menu = Menu.buildFromTemplate([
    { label: summaryLine(live), enabled: false },
    { label: current ? `▶ #${current.index} ${current.name}` : '—', enabled: false },
    { label: objective ? `   ${objective}` : '   (no objective)', enabled: false },
    { type: 'separator' },
    { label: 'Show Game Playthrough', click: showWindow },
    { label: 'Start a full run', enabled: !running, click: () => startRun({ mode: 'full' }) },
    { label: 'Stop run', enabled: running, click: () => stopRun() },
    { type: 'separator' },
    { label: 'Open latest milestone video', enabled: !!video, click: () => video && shell.openPath(video) },
    { label: 'Open videos folder', click: () => shell.openPath(path.join(reportsDir(), 'videos')) },
    { label: 'Open reports folder', click: () => shell.openPath(reportsDir()) },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
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
  reportsDir: reportsDir(), projectDir: GAME_DIR, port: gamePort, viewing: viewDir ? path.basename(viewDir) : '',
  select: parseInt(argValue('--select', '0'), 10) || 0,   // debug: open this milestone's card on start
}));
ipcMain.handle('dash:live', () => readLive());
ipcMain.handle('dash:registry', () => readRegistry());
ipcMain.handle('dash:read-json', (_e, rel) => readJson(path.join(reportsDir(), rel)));
ipcMain.handle('dash:report', () => readJson(path.join(reportsDir(), 'playthrough.json')));
ipcMain.handle('dash:file-url', (_e, rel) => {
  const abs = path.join(reportsDir(), rel);
  return fs.existsSync(abs) ? `file://${abs}` : null;
});
ipcMain.handle('dash:state', () => (viewDir ? null : gameState()));
ipcMain.handle('dash:command', (_e, command, args) => gameCommand(command, args));
ipcMain.handle('dash:screenshot', async () => {
  if (viewDir) {
    // An archived run shows the last screenshot it took.
    const old = path.join(viewDir, 'live.png');
    return fs.existsSync(old) ? `file://${old}` : null;
  }
  const file = path.join(liveReportsDir(), 'live.png');
  const res = await gameCommand('capture_screenshot', { file_path: file });
  if (res && res.success && fs.existsSync(file)) return `file://${file}?t=${Date.now()}`;
  // Game closed: the last screenshot of the run is still on disk.
  return fs.existsSync(file) ? `file://${file}` : null;
});
ipcMain.handle('dash:open', (_e, rel) => shell.openPath(rel ? path.join(reportsDir(), rel) : reportsDir()));
ipcMain.handle('dash:reveal', (_e, rel) => shell.showItemInFolder(path.join(reportsDir(), rel)));
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
ipcMain.handle('run:status', () => runStatus());
ipcMain.handle('run:start', (_e, opts) => startRun(opts));
ipcMain.handle('run:stop', () => stopRun());
ipcMain.handle('run:list', () => listRuns());
ipcMain.handle('run:checkpoints', () => listCheckpoints());
ipcMain.handle('run:view', (_e, dir) => {
  viewDir = dir && fs.existsSync(path.join(dir, 'playthrough.json')) ? dir : '';
  return { viewing: viewDir ? path.basename(viewDir) : '' };
});
ipcMain.handle('run:choose-game-dir', async () => {
  const res = await dialog.showOpenDialog(win, { title: 'Choose games/quest-warrior-dragon', properties: ['openDirectory'] });
  if (res.canceled || !res.filePaths.length) return { ok: false };
  if (!isGameDir(res.filePaths[0])) return { ok: false, error: 'That folder has no tests/e2e/play_full_game.py.' };
  GAME_DIR = res.filePaths[0];
  settings.gameDir = GAME_DIR;
  try { fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true }); fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch { /* read-only */ }
  return { ok: true, gameDir: GAME_DIR };
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
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
        if (process.argv.includes('--quit-after-snapshot')) { quitting = true; app.quit(); }
      }, 5000);
    }
    setInterval(() => rebuildTrayMenu(readLive()), 3000);
  });
}

app.on('window-all-closed', () => { /* keep running in the tray */ });
app.on('before-quit', () => { quitting = true; });
