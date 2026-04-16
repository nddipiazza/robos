'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

const SETTINGS_FILE = path.join(os.homedir(), '.config', 'robos', 'settings.json');
const HISTORY_FILE  = path.join(os.homedir(), '.config', 'robos', 'desktop-customizer', 'history.json');
const SNAPSHOT_DIR  = path.join(os.homedir(), '.config', 'robos', 'desktop-snapshots');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'desktop-customizer'));

const lock = app.requestSingleInstanceLock();
if (!lock) { app.quit(); }

app.setName('desktop-customizer');

// Debug server (optional)
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

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 750,
    minWidth: 800, minHeight: 550,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Desktop Customizer',
    autoHideMenuBar: true,
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
  if (_debugServer) _debugServer.startDebugServer(win, 19136);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function shell_exec(cmd, timeoutMs = 15000) {
  try {
    const r = cp.execSync(cmd, { encoding: 'utf8', timeout: timeoutMs, env: { ...process.env, DISPLAY: ':0' } });
    return { ok: true, output: r.trim() };
  } catch (e) {
    return { ok: false, error: (e.stderr || e.message || '').trim(), output: (e.stdout || '').trim() };
  }
}

function gsettingsGet(schema, key) {
  return shell_exec(`gsettings get ${schema} ${key}`);
}

function gsettingsSet(schema, key, value) {
  return shell_exec(`gsettings set ${schema} ${key} ${value}`);
}

function dconfDump(path_prefix) {
  return shell_exec(`dconf dump ${path_prefix}`);
}

// ── Snapshot system ──────────────────────────────────────────────────────────

function initSnapshotRepo() {
  ensureDir(SNAPSHOT_DIR);
  if (!fs.existsSync(path.join(SNAPSHOT_DIR, '.git'))) {
    shell_exec(`cd "${SNAPSHOT_DIR}" && git init && git config user.email "customizer@robos" && git config user.name "Desktop Customizer"`);
  }
}

function captureSnapshot(message) {
  initSnapshotRepo();
  // Capture dconf dump
  const dconf = dconfDump('/');
  if (dconf.ok) fs.writeFileSync(path.join(SNAPSHOT_DIR, 'dconf-dump.ini'), dconf.output);

  // Capture RobOS settings
  try {
    const s = fs.readFileSync(SETTINGS_FILE, 'utf8');
    fs.writeFileSync(path.join(SNAPSHOT_DIR, 'settings.json'), s);
  } catch {}

  // Capture GTK CSS
  for (const ver of ['3.0', '4.0']) {
    const src = path.join(os.homedir(), '.config', `gtk-${ver}`, 'gtk.css');
    try {
      const css = fs.readFileSync(src, 'utf8');
      ensureDir(path.join(SNAPSHOT_DIR, 'css'));
      fs.writeFileSync(path.join(SNAPSHOT_DIR, 'css', `gtk-${ver}.css`), css);
    } catch {}
  }

  // Capture autostart entries
  const autostartDir = path.join(os.homedir(), '.config', 'autostart');
  if (fs.existsSync(autostartDir)) {
    ensureDir(path.join(SNAPSHOT_DIR, 'autostart'));
    for (const f of fs.readdirSync(autostartDir)) {
      if (f.endsWith('.desktop')) {
        fs.copyFileSync(path.join(autostartDir, f), path.join(SNAPSHOT_DIR, 'autostart', f));
      }
    }
  }

  // Git commit
  shell_exec(`cd "${SNAPSHOT_DIR}" && git add -A && git commit -m "${message.replace(/"/g, '\\"')}" --allow-empty`);
  return { ok: true };
}

function listSnapshots() {
  initSnapshotRepo();
  const r = shell_exec(`cd "${SNAPSHOT_DIR}" && git log --oneline --format="%h|%s|%ci" -20`);
  if (!r.ok) return [];
  return r.output.split('\n').filter(Boolean).map(line => {
    const [hash, msg, date] = line.split('|');
    return { hash, message: msg, date };
  });
}

function restoreSnapshot(ref) {
  const r = shell_exec(`cd "${SNAPSHOT_DIR}" && git checkout ${ref} -- .`);
  if (!r.ok) return { ok: false, error: r.error };
  // Restore dconf
  const dconfFile = path.join(SNAPSHOT_DIR, 'dconf-dump.ini');
  if (fs.existsSync(dconfFile)) {
    shell_exec(`dconf load / < "${dconfFile}"`);
  }
  // Restore GTK CSS
  for (const ver of ['3.0', '4.0']) {
    const src = path.join(SNAPSHOT_DIR, 'css', `gtk-${ver}.css`);
    const dst = path.join(os.homedir(), '.config', `gtk-${ver}`, 'gtk.css');
    if (fs.existsSync(src)) {
      ensureDir(path.dirname(dst));
      fs.copyFileSync(src, dst);
    }
  }
  captureSnapshot(`Restored to ${ref}`);
  return { ok: true };
}

// ── Slash command engine ─────────────────────────────────────────────────────

const COMMANDS = {};

function registerCommand(name, description, usage, handler) {
  COMMANDS[name] = { name, description, usage, handler };
}

// /move-clock
registerCommand('move-clock', 'Reposition the GNOME clock', '/move-clock left|center|right|hide|show|format 24h|show-seconds|show-date', async (args) => {
  const sub = args[0];
  if (!sub) return { ok: false, error: 'Usage: /move-clock left|center|right|hide|show|format|show-seconds|show-date' };

  switch (sub) {
    case 'left':
    case 'center':
    case 'right': {
      // Requires the clock-override extension or dash-to-panel
      const pos = sub === 'left' ? "'left'" : sub === 'right' ? "'right'" : "'center'";
      // Try org.gnome.desktop.interface clock-position (not standard, use extension)
      const r = gsettingsSet('org.gnome.shell.extensions.dash-to-panel', 'clock-position', pos);
      if (!r.ok) {
        // Fallback: try the clock dconf key directly
        const r2 = shell_exec(`dconf write /org/gnome/shell/extensions/dash-to-panel/clock-position "'${sub}'"`);
        if (!r2.ok) return { ok: true, output: `Clock position '${sub}' set. Note: requires Dash to Panel extension for full control. The position will apply at next shell restart.` };
      }
      return { ok: true, output: `Clock moved to ${sub}` };
    }
    case 'hide':
      gsettingsSet('org.gnome.desktop.interface', 'clock-show-date', 'false');
      gsettingsSet('org.gnome.desktop.interface', 'clock-show-seconds', 'false');
      shell_exec(`dconf write /org/gnome/desktop/interface/clock-format "''"`)
      return { ok: true, output: 'Clock hidden (date and seconds disabled)' };
    case 'show':
      gsettingsSet('org.gnome.desktop.interface', 'clock-show-date', 'true');
      return { ok: true, output: 'Clock date shown' };
    case 'format':
      if (args[1] === '24h') gsettingsSet('org.gnome.desktop.interface', 'clock-format', "'24h'");
      else if (args[1] === '12h') gsettingsSet('org.gnome.desktop.interface', 'clock-format', "'12h'");
      else return { ok: false, error: 'Usage: /move-clock format 24h|12h' };
      return { ok: true, output: `Clock format set to ${args[1]}` };
    case 'show-seconds':
      gsettingsSet('org.gnome.desktop.interface', 'clock-show-seconds', 'true');
      return { ok: true, output: 'Clock seconds shown' };
    case 'show-date':
      gsettingsSet('org.gnome.desktop.interface', 'clock-show-date', 'true');
      return { ok: true, output: 'Clock date shown' };
    default:
      return { ok: false, error: `Unknown sub-command: ${sub}` };
  }
});

// /taskbar
registerCommand('taskbar', 'Customize the taskbar/panel', '/taskbar height|autohide|add-favorite|remove-favorite ...', async (args) => {
  const sub = args[0];
  if (!sub) return { ok: false, error: 'Usage: /taskbar height <px>|autohide on|off|add-favorite <app>|remove-favorite <app>' };

  switch (sub) {
    case 'height': {
      const px = parseInt(args[1]);
      if (!px) return { ok: false, error: 'Usage: /taskbar height <pixels>' };
      shell_exec(`dconf write /org/gnome/shell/extensions/dash-to-panel/panel-sizes "'{\\"0\\":${px}}'"`);
      return { ok: true, output: `Panel height set to ${px}px` };
    }
    case 'autohide': {
      const on = args[1] === 'on';
      gsettingsSet('org.gnome.shell.extensions.dash-to-dock', 'autohide', on ? 'true' : 'false');
      return { ok: true, output: `Autohide ${on ? 'enabled' : 'disabled'}` };
    }
    case 'add-favorite': {
      const appId = args[1];
      if (!appId) return { ok: false, error: 'Usage: /taskbar add-favorite <app-id>' };
      const cur = gsettingsGet('org.gnome.shell', 'favorite-apps');
      if (cur.ok) {
        const favs = cur.output.replace(/[\[\]']/g, '').split(',').map(s => s.trim()).filter(Boolean);
        const desktop = `${appId}.desktop`;
        if (!favs.includes(desktop)) favs.push(desktop);
        gsettingsSet('org.gnome.shell', 'favorite-apps', `"[${favs.map(f => `'${f}'`).join(', ')}]"`);
      }
      return { ok: true, output: `Added ${appId} to favorites` };
    }
    case 'remove-favorite': {
      const appId = args[1];
      if (!appId) return { ok: false, error: 'Usage: /taskbar remove-favorite <app-id>' };
      const cur = gsettingsGet('org.gnome.shell', 'favorite-apps');
      if (cur.ok) {
        const favs = cur.output.replace(/[\[\]']/g, '').split(',').map(s => s.trim()).filter(Boolean);
        const desktop = `${appId}.desktop`;
        const filtered = favs.filter(f => f !== desktop);
        gsettingsSet('org.gnome.shell', 'favorite-apps', `"[${filtered.map(f => `'${f}'`).join(', ')}]"`);
      }
      return { ok: true, output: `Removed ${appId} from favorites` };
    }
    default:
      return { ok: false, error: `Unknown sub-command: ${sub}` };
  }
});

// /theme
registerCommand('theme', 'Modify theme colors, fonts, spacing', '/theme dark|light|accent <color>|font-size <px>|window-buttons left|right|css "<css>"', async (args) => {
  const sub = args[0];
  if (!sub) return { ok: false, error: 'Usage: /theme dark|light|accent|font-size|window-buttons|css ...' };

  switch (sub) {
    case 'dark':
      gsettingsSet('org.gnome.desktop.interface', 'color-scheme', "'prefer-dark'");
      return { ok: true, output: 'Dark mode enabled' };
    case 'light':
      gsettingsSet('org.gnome.desktop.interface', 'color-scheme', "'prefer-light'");
      return { ok: true, output: 'Light mode enabled' };
    case 'accent': {
      const color = args[1];
      if (!color) return { ok: false, error: 'Usage: /theme accent <hex-color>' };
      // Write custom GTK CSS
      const cssDir = path.join(os.homedir(), '.config', 'gtk-3.0');
      ensureDir(cssDir);
      const cssFile = path.join(cssDir, 'gtk.css');
      let existing = '';
      try { existing = fs.readFileSync(cssFile, 'utf8'); } catch {}
      // Remove old accent override
      existing = existing.replace(/@define-color accent_color[^;]*;/g, '');
      existing += `\n@define-color accent_color ${color};\n`;
      fs.writeFileSync(cssFile, existing.trim() + '\n');
      return { ok: true, output: `Accent color set to ${color}. May require re-opening apps to take effect.` };
    }
    case 'font-size': {
      const size = args[1];
      if (!size) return { ok: false, error: 'Usage: /theme font-size <size>' };
      gsettingsSet('org.gnome.desktop.interface', 'text-scaling-factor', (parseInt(size) / 14).toFixed(2));
      return { ok: true, output: `Font scaling set for ~${size}px base` };
    }
    case 'window-buttons': {
      const side = args[1];
      if (side === 'left') gsettingsSet('org.gnome.desktop.wm.preferences', 'button-layout', "'close,minimize,maximize:'");
      else if (side === 'right') gsettingsSet('org.gnome.desktop.wm.preferences', 'button-layout', "':minimize,maximize,close'");
      else return { ok: false, error: 'Usage: /theme window-buttons left|right' };
      return { ok: true, output: `Window buttons moved to ${side}` };
    }
    case 'css': {
      const css = args.slice(1).join(' ');
      if (!css) return { ok: false, error: 'Usage: /theme css "<css rules>"' };
      const cssDir = path.join(os.homedir(), '.config', 'gtk-3.0');
      ensureDir(cssDir);
      const cssFile = path.join(cssDir, 'gtk.css');
      let existing = '';
      try { existing = fs.readFileSync(cssFile, 'utf8'); } catch {}
      existing += '\n/* Desktop Customizer */\n' + css + '\n';
      fs.writeFileSync(cssFile, existing);
      return { ok: true, output: `Custom CSS applied. Re-open apps to see changes.` };
    }
    default:
      return { ok: false, error: `Unknown theme sub-command: ${sub}` };
  }
});

// /shortcut
registerCommand('shortcut', 'Create keyboard shortcuts', '/shortcut <keys> open <app>|list|remove <keys>', async (args) => {
  const sub = args[0];
  if (!sub) return { ok: false, error: 'Usage: /shortcut <keys> open <app>|list|remove <keys>' };

  if (sub === 'list') {
    const r = gsettingsGet('org.gnome.settings-daemon.plugins.media-keys', 'custom-keybindings');
    return { ok: true, output: r.ok ? `Custom keybindings: ${r.output}` : 'No custom keybindings found' };
  }
  if (sub === 'remove') {
    return { ok: true, output: 'Shortcut removal: use GNOME Settings → Keyboard → Shortcuts to manage. (Programmatic removal coming soon.)' };
  }
  // /shortcut ctrl+shift+t open terminal
  const keys = sub;
  if (args[1] !== 'open' || !args[2]) return { ok: false, error: 'Usage: /shortcut <keys> open <app-name>' };
  const appName = args.slice(2).join(' ');

  // Find an available custom keybinding slot
  const basePath = '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings';
  const r = gsettingsGet('org.gnome.settings-daemon.plugins.media-keys', 'custom-keybindings');
  const existing = r.ok ? r.output.replace(/[\[\]'@]/g, '').split(',').map(s => s.trim()).filter(Boolean) : [];
  const slot = `${basePath}/custom${existing.length}/`;

  shell_exec(`dconf write ${slot}name "'${appName}'"`);
  shell_exec(`dconf write ${slot}command "'${appName}'"`);
  shell_exec(`dconf write ${slot}binding "'${keys}'"`);
  existing.push(slot);
  gsettingsSet('org.gnome.settings-daemon.plugins.media-keys', 'custom-keybindings', `"[${existing.map(s => `'${s}'`).join(', ')}]"`);

  return { ok: true, output: `Shortcut ${keys} → ${appName} created` };
});

// /startup
registerCommand('startup', 'Manage startup applications', '/startup list|add <app>|remove <app>', async (args) => {
  const sub = args[0];
  const autostartDir = path.join(os.homedir(), '.config', 'autostart');
  ensureDir(autostartDir);

  if (!sub || sub === 'list') {
    try {
      const files = fs.readdirSync(autostartDir).filter(f => f.endsWith('.desktop'));
      if (files.length === 0) return { ok: true, output: 'No startup applications configured.' };
      return { ok: true, output: 'Startup apps:\n' + files.map(f => '  • ' + f.replace('.desktop', '')).join('\n') };
    } catch { return { ok: true, output: 'No startup applications configured.' }; }
  }
  if (sub === 'add') {
    const appId = args[1];
    if (!appId) return { ok: false, error: 'Usage: /startup add <app-id>' };
    const delay = args.includes('--delay') ? args[args.indexOf('--delay') + 1] : null;
    const desktop = `[Desktop Entry]\nType=Application\nName=${appId}\nExec=/usr/bin/electron /usr/local/share/robos/${appId}/main.js --no-sandbox --disable-gpu --disable-dev-shm-usage\nX-GNOME-Autostart-enabled=true\n${delay ? `X-GNOME-Autostart-Delay=${parseInt(delay)}\n` : ''}`;
    fs.writeFileSync(path.join(autostartDir, `${appId}.desktop`), desktop);
    return { ok: true, output: `${appId} added to startup${delay ? ` (delay: ${delay})` : ''}` };
  }
  if (sub === 'remove') {
    const appId = args[1];
    if (!appId) return { ok: false, error: 'Usage: /startup remove <app-id>' };
    const f = path.join(autostartDir, `${appId}.desktop`);
    try { fs.unlinkSync(f); } catch {}
    return { ok: true, output: `${appId} removed from startup` };
  }
  return { ok: false, error: 'Usage: /startup list|add|remove' };
});

// /snapshot
registerCommand('snapshot', 'Manage desktop snapshots', '/snapshot save <name>|list|diff', async (args) => {
  const sub = args[0];
  if (!sub || sub === 'list') {
    const snaps = listSnapshots();
    if (snaps.length === 0) return { ok: true, output: 'No snapshots yet.' };
    return { ok: true, output: 'Snapshots:\n' + snaps.map(s => `  ${s.hash} — ${s.message} (${s.date})`).join('\n') };
  }
  if (sub === 'save') {
    const name = args.slice(1).join(' ') || 'Manual checkpoint';
    captureSnapshot(name);
    return { ok: true, output: `Snapshot saved: "${name}"` };
  }
  if (sub === 'diff') {
    const r = shell_exec(`cd "${SNAPSHOT_DIR}" && git diff HEAD~1 --stat 2>/dev/null`);
    return { ok: true, output: r.ok && r.output ? r.output : 'No changes since last snapshot.' };
  }
  return { ok: false, error: 'Usage: /snapshot save <name>|list|diff' };
});

// /restore
registerCommand('restore', 'Restore a previous snapshot', '/restore last|<hash>', async (args) => {
  const ref = args[0];
  if (!ref) return { ok: false, error: 'Usage: /restore last|<hash>' };
  const gitRef = ref === 'last' ? 'HEAD~1' : ref;
  const r = restoreSnapshot(gitRef);
  return r.ok ? { ok: true, output: `Desktop restored to ${ref}. Some changes may require logout to take effect.` }
    : { ok: false, error: `Restore failed: ${r.error}` };
});

// /exec (power user)
registerCommand('exec', 'Run a shell command', '/exec <command>', async (args) => {
  const cmd = args.join(' ');
  if (!cmd) return { ok: false, error: 'Usage: /exec <command>' };
  const r = shell_exec(cmd);
  return { ok: r.ok, output: r.output || r.error || '(no output)' };
});

// /gsettings (power user)
registerCommand('gsettings', 'Read/write gsettings directly', '/gsettings get|set <schema> <key> [value]', async (args) => {
  const action = args[0];
  if (action === 'get') {
    if (args.length < 3) return { ok: false, error: 'Usage: /gsettings get <schema> <key>' };
    return gsettingsGet(args[1], args[2]);
  }
  if (action === 'set') {
    if (args.length < 4) return { ok: false, error: 'Usage: /gsettings set <schema> <key> <value>' };
    return gsettingsSet(args[1], args[2], args.slice(3).join(' '));
  }
  return { ok: false, error: 'Usage: /gsettings get|set <schema> <key> [value]' };
});

// /help
registerCommand('help', 'Show available commands', '/help', async () => {
  const lines = Object.values(COMMANDS).map(c => `  ${c.usage}\n    ${c.description}`);
  return { ok: true, output: 'Available commands:\n\n' + lines.join('\n\n') };
});

// ── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-commands', () => {
  return Object.values(COMMANDS).map(c => ({ name: c.name, description: c.description, usage: c.usage }));
});

ipcMain.handle('execute-command', async (_ev, input) => {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    // Natural language — for now, show help. LLM integration coming in Story 10.
    return { ok: true, output: `Natural language input received: "${trimmed}"\n\nLLM integration coming soon. For now, use slash commands. Type /help to see available commands.`, isAI: true };
  }
  const parts = trimmed.slice(1).split(/\s+/);
  const cmdName = parts[0];
  const args = parts.slice(1);
  const cmd = COMMANDS[cmdName];
  if (!cmd) return { ok: false, error: `Unknown command: /${cmdName}. Type /help for available commands.` };

  // Auto-snapshot before destructive commands
  const destructive = ['move-clock', 'taskbar', 'theme', 'shortcut', 'startup', 'exec', 'gsettings'];
  if (destructive.includes(cmdName)) {
    captureSnapshot(`Before: /${cmdName} ${args.join(' ')}`);
  }

  return cmd.handler(args);
});

ipcMain.handle('load-history', () => {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); }
  catch { return []; }
});

ipcMain.handle('save-history', (_ev, history) => {
  ensureDir(path.dirname(HISTORY_FILE));
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  return { ok: true };
});

ipcMain.handle('open-url', (_ev, url) => { shell.openExternal(url); });
