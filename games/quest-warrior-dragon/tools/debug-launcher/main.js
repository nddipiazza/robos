const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const PROJECT_DIR = path.resolve(__dirname, '..', '..');
const DEBUG_SH = path.join(PROJECT_DIR, 'debug.sh');
const SAVE_STATES_DIR = path.join(PROJECT_DIR, 'data', 'v1', 'save-states');
const CURRENT_SAVE_STATE_PATH = path.join(PROJECT_DIR, 'tools', 'debug-launcher', '.current-save-state.json');

let mainWindow;
let activeProc = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    title: 'Quest: Warrior Dragon — Debug Launcher',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

function readJson(filename) {
  const filePath = path.join(PROJECT_DIR, 'data', filename);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function sanitizeSaveStateName(name) {
  const raw = path.basename(String(name || '').trim());
  if (!raw) return '';
  return raw.endsWith('.json') ? raw : `${raw}.json`;
}

function stopActiveProcess() {
  if (!activeProc) return;
  try {
    activeProc.kill();
  } catch {}
  activeProc = null;
}

function findGodotBinary() {
  if (process.env.DW_GODOT_BIN && fs.existsSync(process.env.DW_GODOT_BIN)) {
    return process.env.DW_GODOT_BIN;
  }
  const isWin = process.platform === 'win32';
  const candidates = isWin
    ? [
        'godot4.exe',
        'godot.exe',
        'godot4',
        'godot',
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Godot', 'godot.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Godot', 'godot4.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'godot.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'godot4.exe'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Godot', 'godot.exe'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Godot', 'godot4.exe')
      ]
    : [
        'godot4',
        'godot',
        path.join(require('os').homedir(), '.local', 'bin', 'godot4'),
        path.join(require('os').homedir(), '.local', 'bin', 'godot'),
        '/usr/bin/godot4',
        '/usr/bin/godot',
        '/usr/local/bin/godot4',
        '/usr/local/bin/godot',
        '/snap/bin/godot4',
        '/snap/bin/godot'
      ];

  for (const candidate of candidates) {
    if (candidate && path.isAbsolute(candidate) && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

function spawnLauncher(args) {
  stopActiveProcess();

  const isWin = process.platform === 'win32';
  let cmd, spawnArgs, envVars;

  if (isWin) {
    const godotBin = findGodotBinary();
    cmd = godotBin;
    spawnArgs = ['--path', PROJECT_DIR, 'res://scenes/DebugLaunch.tscn', '--', ...args];
    envVars = { ...process.env };
  } else {
    cmd = 'bash';
    spawnArgs = [DEBUG_SH, ...args];
    envVars = { ...process.env, DISPLAY: ':0' };
  }

  const log = `[launcher] Running: ${cmd} ${spawnArgs.join(' ')}\n`;
  mainWindow.webContents.send('log', log);

  activeProc = spawn(cmd, spawnArgs, {
    cwd: PROJECT_DIR,
    env: envVars,
  });

  activeProc.stdout.on('data', data => mainWindow.webContents.send('log', data.toString()));
  activeProc.stderr.on('data', data => mainWindow.webContents.send('log', '[stderr] ' + data.toString()));
  activeProc.on('close', code => {
    mainWindow.webContents.send('log', `[launcher] process exited (${code})\n`);
    activeProc = null;
  });

  return { ok: true };
}

ipcMain.handle('launch-preset', (_event, preset) => spawnLauncher(buildArgs(preset)));

ipcMain.handle('launch-save-state', (_event, stateData) => {
  fs.mkdirSync(path.dirname(CURRENT_SAVE_STATE_PATH), { recursive: true });
  fs.writeFileSync(CURRENT_SAVE_STATE_PATH, JSON.stringify(stateData, null, 2));
  const args = buildArgsFromSaveState(stateData);
  args.push('--save-state-file', CURRENT_SAVE_STATE_PATH);
  mainWindow.webContents.send('log', `[launcher] Save state file: ${CURRENT_SAVE_STATE_PATH}
`);
  return spawnLauncher(args);
});

ipcMain.handle('kill-game', () => {
  if (activeProc) {
    stopActiveProcess();
    return { killed: true };
  }
  return { killed: false };
});

ipcMain.handle('load-monsters', () => readJson('monsters.json') || []);
ipcMain.handle('load-spells', () => readJson('spells.json') || []);
ipcMain.handle('load-weapons', () => readJson('weapons.json') || []);
ipcMain.handle('load-armor', () => readJson('armor.json') || []);
ipcMain.handle('load-items', () => readJson('items.json') || []);
ipcMain.handle('load-chest-registry', () => readJson('chest_registry.json') || {});
ipcMain.handle('load-door-registry', () => readJson('door_registry.json') || {});
ipcMain.handle('load-map-grids-keys', () => {
  const data = readJson('map_grids.json');
  return data && data.maps ? Object.keys(data.maps) : [];
});
ipcMain.handle('load-map-spawns', () => readJson('map_start_positions_from_world.json') || { map_entry_points: [] });

ipcMain.handle('list-save-states', () => {
  if (!fs.existsSync(SAVE_STATES_DIR)) return [];
  return fs.readdirSync(SAVE_STATES_DIR)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));
});

ipcMain.handle('load-save-state', (_event, name) => {
  const fileName = sanitizeSaveStateName(name);
  if (!fileName) return null;
  const filePath = path.join(SAVE_STATES_DIR, fileName);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
});

ipcMain.handle('save-save-state', (_event, name, data) => {
  const fileName = sanitizeSaveStateName(name);
  if (!fileName) {
    return { ok: false, error: 'Missing save state name.' };
  }
  fs.mkdirSync(SAVE_STATES_DIR, { recursive: true });
  fs.writeFileSync(path.join(SAVE_STATES_DIR, fileName), JSON.stringify(data, null, 2));
  return { ok: true, file: fileName };
});

ipcMain.handle('delete-save-state', (_event, name) => {
  const fileName = sanitizeSaveStateName(name);
  if (!fileName) return { ok: false, error: 'Missing save state name.' };
  const filePath = path.join(SAVE_STATES_DIR, fileName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return { ok: true };
});

function buildArgs(preset) {
  const args = ['--scene', preset.scene];
  if (preset.tile) args.push('--tile', preset.tile);
  if (preset.facing) args.push('--facing', preset.facing);
  if (preset.gold != null) args.push('--gold', String(preset.gold));
  if (preset.items) args.push('--items', preset.items);
  if (preset.from) args.push('--from', preset.from);
  if (preset.allChests) args.push('--all-chests', preset.allChests);
  if (preset.unlockedDoors) args.push('--unlocked-doors', preset.unlockedDoors);
  if (preset.monster) args.push('--monster', preset.monster);
  if (preset.heroHp != null) args.push('--hero-hp', String(preset.heroHp));
  if (preset.heroMp != null) args.push('--hero-mp', String(preset.heroMp));
  if (preset.heroAtk != null) args.push('--hero-atk', String(preset.heroAtk));
  if (preset.heroDef != null) args.push('--hero-def', String(preset.heroDef));
  if (preset.heroAgl != null) args.push('--hero-agl', String(preset.heroAgl));
  if (preset.heroSpells) args.push('--hero-spells', preset.heroSpells);
  if (preset.heroWeapon) args.push('--hero-weapon', preset.heroWeapon);
  if (preset.heroArmor) args.push('--hero-armor', preset.heroArmor);
  return args;
}

function buildArgsFromSaveState(state) {
  const args = ['--scene', state.scene || 'WorldMap'];
  if (state.tile) args.push('--tile', state.tile);
  if (state.facing) args.push('--facing', state.facing);
  if (state.gold != null) args.push('--gold', String(state.gold));
  const comeFrom = state.come_from || state.from;
  if (comeFrom) args.push('--from', comeFrom);
  if (state.bridgeBuilt) args.push('--bridge-built', '1');
  if (state.heroName) args.push('--hero-name', state.heroName);
  if (state.heroLevel != null) args.push('--hero-level', String(state.heroLevel));
  if (state.heroHp != null) args.push('--hero-hp', String(state.heroHp));
  if (state.heroHpMax != null) args.push('--hero-hp-max', String(state.heroHpMax));
  if (state.heroMp != null) args.push('--hero-mp', String(state.heroMp));
  if (state.heroMpMax != null) args.push('--hero-mp-max', String(state.heroMpMax));
  if (state.heroStr != null) args.push('--hero-str', String(state.heroStr));
  if (state.heroAgl != null) args.push('--hero-agl', String(state.heroAgl));
  if (state.heroAtk != null) args.push('--hero-atk', String(state.heroAtk));
  if (state.heroDef != null) args.push('--hero-def', String(state.heroDef));
  if (state.heroExp != null) args.push('--hero-exp', String(state.heroExp));
  if (state.heroWeapon) args.push('--hero-weapon', state.heroWeapon);
  if (state.heroArmor) args.push('--hero-armor', state.heroArmor);
  if (state.heroSpells && state.heroSpells.length) args.push('--hero-spells', state.heroSpells.join(';'));
  if (state.items && state.items.length) {
    const itemNames = state.items
      .map(item => item && (item.name || item.id || '').trim())
      .filter(Boolean);
    if (itemNames.length) args.push('--items', itemNames.join(';'));
  }
  if (state.openedChests && Object.keys(state.openedChests).length) {
    args.push('--all-chests', Object.keys(state.openedChests).join(';'));
  }
  if (state.unlockedDoors && Object.keys(state.unlockedDoors).length) {
    args.push('--unlocked-doors', Object.keys(state.unlockedDoors).join(';'));
  }
  return args;
}
