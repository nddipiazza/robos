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

// ── Export a run to one MP4 ───────────────────────────────────────────────
// Joins the per-milestone videos (videos/NN-<id>.mp4, all recorded with the same encoder
// settings) into one movie with a chapter per milestone. Everything runs off the main
// thread: clips are probed in parallel, ffmpeg runs as a child process and reports its
// progress, and the plan step estimates how long each kind of export will take from a
// short disk read and a short encoder benchmark scaled by this machine's CPU.
const os = require('os');
const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_BIN || (process.env.FFMPEG_BIN ? path.join(path.dirname(process.env.FFMPEG_BIN), 'ffprobe') : 'ffprobe');
const RECORD_FPS = 15;          // play_full_game.py records at 15 fps
const TIMELAPSE_FPS = 30;
let exportJob = null;           // the running / last export
let benchCache = null;          // { encodeFps, readMBs } measured once per app session

function runProc(bin, args, opts = {}) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    child.stdout.on('data', (b) => { out += b; });
    child.stderr.on('data', (b) => { err += b; });
    child.on('error', (e) => resolve({ code: -1, out, err: e.message }));
    // 'close' (not 'exit'): only then is all of the child's output read.
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function probeClips(dir) {
  const vdir = path.join(dir, 'videos');
  let files = [];
  try {
    files = fs.readdirSync(vdir).filter((f) => /^\d+-.*\.mp4$/.test(f)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  } catch { /* no videos */ }
  const clips = await mapLimit(files, Math.max(2, os.cpus().length), async (f) => {
    const abs = path.join(vdir, f);
    const r = await runProc(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', abs]);
    const m = f.match(/^(\d+)-(.*)\.mp4$/);
    return { file: abs, index: parseInt(m[1], 10), id: m[2], seconds: parseFloat(r.out.trim()) || 0, bytes: fs.statSync(abs).size };
  });
  return clips.filter((c) => c.seconds > 0);
}

// Disk: time reading up to 256 MB of the biggest clip. Encoder: encode 2 s of one clip
// with the same settings a time-lapse uses and count frames per second.
async function benchmark(clips) {
  if (benchCache) return benchCache;
  const biggest = clips.reduce((a, c) => (c.bytes > a.bytes ? c : a), clips[0]);
  const t0 = process.hrtime.bigint();
  let read = 0;
  await new Promise((resolve) => {
    const st = fs.createReadStream(biggest.file, { start: 0, end: Math.min(biggest.bytes, 256 * 1048576) - 1, highWaterMark: 4 * 1048576 });
    st.on('data', (b) => { read += b.length; });
    st.on('end', resolve);
    st.on('error', resolve);
  });
  const readSec = Number(process.hrtime.bigint() - t0) / 1e9;
  const readMBs = read / 1048576 / Math.max(readSec, 0.05);
  const sample = clips.find((c) => c.seconds >= 3) || biggest;
  const t1 = process.hrtime.bigint();
  const r = await runProc(FFMPEG, ['-v', 'error', '-ss', '0', '-t', '2', '-i', sample.file, '-an', '-c:v', 'libx264',
    '-preset', 'veryfast', '-crf', '23', '-f', 'null', '-']);
  const encSec = Number(process.hrtime.bigint() - t1) / 1e9;
  const encodeFps = r.code === 0 ? (2 * RECORD_FPS) / Math.max(encSec, 0.05) : 0;
  benchCache = { readMBs, encodeFps };
  return benchCache;
}

function exportName(dir, live) {
  if (viewDir) return path.basename(viewDir);
  const started = typeof live.started_at === 'number' ? new Date(live.started_at * 1000) : new Date(String(live.started_at || Date.now()));
  const p2 = (n) => String(n).padStart(2, '0');
  return `playthrough-${started.getFullYear()}-${p2(started.getMonth() + 1)}-${p2(started.getDate())}-${p2(started.getHours())}${p2(started.getMinutes())}`;
}

async function planExport() {
  const dir = reportsDir();
  const clips = await probeClips(dir);
  if (!clips.length) return { ok: false, error: 'This run has no milestone videos (it was not run with --stepped).' };
  const seconds = clips.reduce((a, c) => a + c.seconds, 0);
  const bytes = clips.reduce((a, c) => a + c.bytes, 0);
  const bench = await benchmark(clips);
  const cpu = os.cpus();
  const mb = bytes / 1048576;
  // Lossless join: read every clip once and write the same amount back (plus a faststart pass).
  const copySec = (mb * 3) / Math.max(bench.readMBs, 20) + 2;
  const options = [{ mode: 'full', label: 'Full length — lossless join', outSeconds: seconds, estSec: copySec, estMB: mb }];
  for (const speed of [4, 8, 16]) {
    // Time-lapse: ffmpeg still decodes every source frame (~4x cheaper than encoding one)
    // and encodes TIMELAPSE_FPS frames per output second.
    const outSeconds = seconds / speed;
    const encFrames = outSeconds * TIMELAPSE_FPS;
    const decFrames = seconds * RECORD_FPS;
    const fps = bench.encodeFps || 30;
    options.push({ mode: 'timelapse', speed, label: `Time-lapse ×${speed}`, outSeconds,
      estSec: encFrames / fps + decFrames / (fps * 4) + 3, estMB: (outSeconds * 1.2 * 1e6) / 8 / 1048576 });
  }
  return { ok: true, dir, name: exportName(dir, readJson(path.join(dir, 'live.json')) || {}), clips: clips.length, seconds, mb,
    system: { cores: cpu.length, model: (cpu[0] && cpu[0].model) || '', freeGB: os.freemem() / 1073741824, readMBs: bench.readMBs, encodeFps: bench.encodeFps },
    options };
}

async function startExport(opts = {}) {
  if (exportJob && !exportJob.done) return { ok: false, error: 'An export is already running.' };
  const dir = reportsDir();
  const live = readJson(path.join(dir, 'live.json')) || {};
  const rows = live.milestones || readRegistry().map((m, i) => ({ index: i + 1, id: m.id, name: m.name }));
  const speed = opts.mode === 'timelapse' ? Math.max(2, parseInt(opts.speed, 10) || 8) : 1;
  const job = { dir, mode: speed > 1 ? 'timelapse' : 'full', speed, phase: 'Reading milestone videos', progress: 0,
    startedAt: Date.now(), done: false, error: '', out: '', estSec: Number(opts.estSec) || 0, child: null, cancelled: false };
  exportJob = job;
  (async () => {
    const clips = await probeClips(dir);
    if (job.cancelled) return;
    if (!clips.length) { job.done = true; job.error = 'This run has no milestone videos.'; return; }
    const total = clips.reduce((a, c) => a + c.seconds, 0);
    const outTotal = total / speed;
    const exportDir = path.join(dir, 'export');
    fs.mkdirSync(exportDir, { recursive: true });
    const listFile = path.join(exportDir, 'clips.txt');
    const metaFile = path.join(exportDir, 'chapters.txt');
    let t = 0;
    const meta = [';FFMETADATA1', `title=Quest: Warrior Dragon AI playthrough ${exportName(dir, live)}`];
    for (const c of clips) {
      const row = rows.find((m) => m.index === c.index || m.id === c.id);
      const title = `#${c.index} ${row && row.name ? row.name : c.id}`.replace(/[=;#\\\n]/g, (ch) => (ch === '\n' ? ' ' : `\\${ch}`));
      meta.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round((t / speed) * 1000)}`, `END=${Math.round(((t + c.seconds) / speed) * 1000)}`, `title=${title}`);
      t += c.seconds;
    }
    fs.writeFileSync(listFile, clips.map((c) => `file '${c.file.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
    fs.writeFileSync(metaFile, meta.join('\n') + '\n');
    job.out = path.join(dir, `${exportName(dir, live)}-${speed > 1 ? `timelapse-x${speed}` : 'full'}.mp4`);
    job.outSeconds = outTotal;
    const video = speed > 1
      ? ['-vf', `setpts=PTS/${speed}`, '-r', String(TIMELAPSE_FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-an']
      : ['-c', 'copy'];
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-i', metaFile, '-map', '0:v', '-map_metadata', '1', '-map_chapters', '1', ...video, '-movflags', '+faststart', job.out];
    job.phase = speed > 1 ? `Encoding time-lapse ×${speed}` : 'Joining videos';
    job.encodeStartedAt = Date.now();
    job.child = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let errText = '';
    job.child.stdout.on('data', (buf) => {
      const text = buf.toString();
      const tm = text.match(/out_time_us=(\d+)/g);
      if (tm) job.progress = Math.min(0.99, parseInt(tm[tm.length - 1].split('=')[1], 10) / 1e6 / (outTotal || 1));
      if (/progress=end/.test(text)) { job.progress = 0.99; job.phase = 'Finishing (moving index to the front)'; }
    });
    job.child.stderr.on('data', (b) => { errText += b; });
    job.child.on('error', (e) => { job.done = true; job.error = `ffmpeg could not start: ${e.message}`; });
    job.child.on('close', (code) => {
      job.done = true;
      job.finishedAt = Date.now();
      if (job.cancelled) { job.error = 'Cancelled'; try { fs.unlinkSync(job.out); } catch { /* none */ } return; }
      if (code === 0 && fs.existsSync(job.out)) {
        job.progress = 1;
        job.phase = 'Done';
        job.size = fs.statSync(job.out).size;
      } else if (!job.error) {
        job.error = errText.trim().split('\n').pop() || `ffmpeg exited with code ${code}`;
      }
    });
  })().catch((e) => { job.done = true; job.error = String(e && e.message ? e.message : e); });
  return { ok: true };
}

function exportStatus() {
  const j = exportJob;
  if (!j) return null;
  const now = j.finishedAt || Date.now();
  const elapsed = (now - j.startedAt) / 1000;
  // Remaining time: measured rate once ffmpeg has made headway, the plan's estimate before that.
  let remaining = null;
  if (!j.done && j.encodeStartedAt && j.progress > 0.02) {
    const spent = (Date.now() - j.encodeStartedAt) / 1000;
    remaining = (spent / j.progress) * (1 - j.progress);
  } else if (!j.done && j.estSec) {
    remaining = Math.max(0, j.estSec - elapsed);
  }
  return { phase: j.phase, mode: j.mode, speed: j.speed, progress: j.progress, elapsed, remaining, done: j.done,
    error: j.error, out: j.out, size: j.size || 0, outSeconds: j.outSeconds || 0 };
}

function cancelExport() {
  if (!exportJob || exportJob.done) return false;
  exportJob.cancelled = true;
  if (exportJob.child) exportJob.child.kill('SIGTERM');
  else { exportJob.done = true; exportJob.error = 'Cancelled'; }
  return true;
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
  const ex = exportStatus();
  const exLine = ex && !ex.done ? `\nExporting MP4: ${Math.round(ex.progress * 100)}%` : '';
  tray.setToolTip(`Quest: Warrior Dragon playthrough\n${summaryLine(live)}${exLine}`);
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
ipcMain.handle('export:plan', () => planExport());
ipcMain.handle('export:start', (_e, opts) => startExport(opts));
ipcMain.handle('export:status', () => exportStatus());
ipcMain.handle('export:cancel', () => cancelExport());
ipcMain.handle('export:show', (_e, file) => file && shell.showItemInFolder(file));
ipcMain.handle('export:play', (_e, file) => file && shell.openPath(file));
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
