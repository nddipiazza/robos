'use strict';
// Electron entry point for "(From Source)" shortcuts:
//   scripts/source-shortcuts/node_modules/electron/... scripts/source-shortcuts/source-host.cjs --app=<id>
// Every shortcut runs this on one shared Electron (the version App Manager runs every app on).
// On an app's first launch it installs that package's dependencies in a small setup window,
// then relaunches; nothing is npm-installed up front. It then runs packages/<id>/main.js from
// this clone as `npm start` would (same userData folder, app path and working directory) and
// gives the process the identity its shortcut declares, so the taskbar / dock / Alt+Tab show
// the app's own icon and group the running window with the pinned shortcut:
//   Windows  AppUserModelID com.rowbose.robos.source.<id> + the app's .ico on every window
//   Linux    WM_CLASS / desktop name robos-source-<id> + icon.png as _NET_WM_ICON
//   macOS    the app's icon on the Dock tile
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const common = require('./common.cjs');

const id = (process.argv.find(arg => arg.startsWith('--app=')) || '').slice('--app='.length);
const dir = path.join(common.repo, 'packages', id);
if (!common.ID.test(id) || !fs.existsSync(path.join(dir, 'package.json'))) {
  console.error(`source-host: no RobOS app "${id}" in ${path.join(common.repo, 'packages')}`);
  process.exit(64);
}
const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
const name = pkg.productName || pkg.name || id;

// `electron <dir>` names the app after package.json and keeps its data in appData/<name>.
app.setPath('userData', path.join(app.getPath('appData'), name));
process.env.ROBOS_SOURCE_APP = id;
// Apps build paths from HOME, which Windows does not set; App Manager sets it the same way.
process.env.HOME ||= require('node:os').homedir();

if (process.platform === 'linux') {
  // Chromium derives WM_CLASS / the Wayland app_id from the app name. Many apps rename
  // themselves in main.js; that would split the window from its launcher entry in the dock.
  app.setName(common.wmClass(id));
  app.setName = () => {};
  if (app.setDesktopName) app.setDesktopName(`${common.wmClass(id)}.desktop`);
} else app.setName(name);

if (process.platform === 'win32') {
  app.setAppUserModelId(common.appUserModelId(id));
  // An app setting its own ID would detach its windows from the shortcut's icon.
  app.setAppUserModelId = () => {};
}

if (typeof app.setAppPath === 'function') app.setAppPath(dir);
process.chdir(dir);

const png = path.join(dir, 'icon.png');
let windowIcon = null;
if (fs.existsSync(png)) {
  if (process.platform === 'win32') {
    // Windows wants an .ico (with small sizes) for the taskbar button and Alt+Tab.
    try { windowIcon = require('./icons.cjs').ensureIco(png, common.locations().icons, common.icoName(id)); } catch {}
  } else if (process.platform === 'linux') windowIcon = png; // Electron needs a raster image here.
  else app.whenReady().then(() => { try { app.dock?.setIcon(png); } catch {} });
}
if (windowIcon) app.on('browser-window-created', (_event, window) => { try { window.setIcon(windowIcon); } catch {} });

const { missingDeps, installDeps } = require('./deps.cjs');
let manifest = {};
try { manifest = JSON.parse(fs.readFileSync(path.join(common.locations().data, 'source-shortcuts.json'), 'utf8')); } catch {}
const libs = (manifest.apps?.[id]?.libs || []).filter(lib => common.ID.test(lib)).map(lib => path.join(common.repo, 'packages', lib));
const pending = [dir, ...libs].filter(packageDir => missingDeps(packageDir).length);
if (pending.length) setUp(pending);
else start();

/**
 * First launch: install the package's dependencies in a small window that already carries the
 * app's icon and identity, then relaunch so main.js starts in a fresh process (apps that wait
 * for app.on('ready') would never see it fire after setup).
 */
function setUp(pending) {
  const title = common.displayName(manifest.apps?.[id]?.label || name);
  const logFile = path.join(common.locations().data, 'source-shortcuts-logs', `${id}-setup.log`);
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 620, height: 380, title, autoHideMenuBar: true, backgroundColor: '#0d1117',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/[<&]/g, '')}</title><style>
      body{margin:0;padding:18px 20px;font:14px system-ui,sans-serif;background:#0d1117;color:#e6edf3;display:flex;flex-direction:column;height:100vh;box-sizing:border-box}
      h1{font-size:16px;margin:0 0 4px} p{margin:0 0 12px;color:#8b949e} p.err{color:#ff7b72}
      pre{flex:1;margin:0;overflow:auto;background:#010409;border:1px solid #30363d;border-radius:6px;padding:10px;font:12px ui-monospace,Consolas,monospace;white-space:pre-wrap;color:#8b949e}
      </style></head><body><h1 id="h"></h1><p id="s">Installing its dependencies. This happens once; the app opens when it is done.</p><pre id="o"></pre>
      <script>document.getElementById('h').textContent=${JSON.stringify(`Setting up ${title}`)};
      const o=document.getElementById('o');window.out=t=>{o.textContent+=t;o.scrollTop=o.scrollHeight};
      window.fail=m=>{const s=document.getElementById('s');s.className='err';s.textContent=m};</script></body></html>`;
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
    const call = (fn, value) => { if (!win.isDestroyed()) win.webContents.executeJavaScript(`window.${fn}(${JSON.stringify(value)})`).catch(() => {}); };
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const log = fs.createWriteStream(logFile);
    const output = text => { log.write(text); call('out', text); };
    let code = 0;
    for (const packageDir of pending) {
      output(`
== packages/${path.basename(packageDir)} ==
`);
      code = await installDeps(packageDir, { nodeDir: manifest.node ? path.dirname(manifest.node) : null, onOutput: output });
      if (code !== 0) break;
    }
    log.end();
    const still = pending.flatMap(packageDir => missingDeps(packageDir).map(dep => `${path.basename(packageDir)}/${dep}`));
    if (code === 0 && !still.length) { app.relaunch(); app.exit(0); return; }
    call('fail', code === 0 ? `npm finished but these are still missing: ${still.join(', ')}. Log: ${logFile}`
      : `npm install failed (exit ${code}). Check that Node.js and npm are installed, then open the app again. Log: ${logFile}`);
  });
}

function start() {
  if (id === 'household') {
    // Household is a web server; App Manager opens it the same way (lib/app-host.cjs).
    app.whenReady().then(async () => {
      const server = await require(path.join(dir, 'server.js')).start(0);
      const win = new BrowserWindow({ width: 1280, height: 850, webPreferences: { contextIsolation: true, nodeIntegration: false } });
      win.loadURL(`http://127.0.0.1:${server.address().port}`);
      app.on('before-quit', () => server.close());
    });
    app.on('window-all-closed', () => app.quit());
  } else require(path.join(dir, pkg.main || 'main.js'));
}
