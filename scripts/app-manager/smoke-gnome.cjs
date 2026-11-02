'use strict';
// Drives the packaged manager inside a real GNOME Shell session and asks the Shell
// itself what the user would see: dock favorites, the app grid and window ownership.
// Run through test-ubuntu-install.sh, which provides the stock Ubuntu session.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../..');
const executablePath = process.env.ROBOS_MANAGER_EXE || '/opt/RobOS/robos-app-manager';
const payloads = path.resolve(process.env.ROBOS_SMOKE_PAYLOADS || path.join(repo, 'release/app-manager'));
const output = path.resolve(process.env.ROBOS_SMOKE_OUTPUT || path.join(repo, 'run/app-manager-gnome-smoke'));
// pr-review names itself in main.js; audio-player and robos-tv each do so differently.
const apps = (process.env.ROBOS_SMOKE_APPS || 'pr-review,audio-player,robos-tv,point-of-sale').split(',');
const MANAGER = 'robos-app-manager.desktop', entryOf = id => `robos-managed-${id}.desktop`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const result = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-shell-'));
function shell(code) {
  // Shell.Eval results use GVariant quoting, so values come back through a file.
  const file = path.join(result, 'eval.json');
  fs.rmSync(file, { force: true });
  const script = `imports.gi.GLib.file_set_contents(${JSON.stringify(file)}, JSON.stringify((() => { ${code} })() ?? null))`;
  const reply = execFileSync('gdbus', ['call', '--session', '--dest', 'org.gnome.Shell', '--object-path', '/org/gnome/Shell', '--method', 'org.gnome.Shell.Eval', script], { encoding: 'utf8' });
  if (!reply.startsWith('(true') || !fs.existsSync(file)) throw new Error(`Shell.Eval failed: ${reply}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
const windows = () => shell(`const tracker = imports.gi.Shell.WindowTracker.get_default();
  return global.get_window_actors().map(actor => actor.meta_window).filter(w => !w.is_override_redirect()).map(w => ({ title: w.get_title(), wmClass: w.get_wm_class(), app: tracker.get_window_app(w)?.get_id() ?? null }));`);
const favorites = () => require('../../packages/app-manager/lib/gnome.cjs').parseList(execFileSync('gsettings', ['get', 'org.gnome.shell', 'favorite-apps'], { encoding: 'utf8' }));
const activate = entry => shell(`const app = imports.gi.Shell.AppSystem.get_default().lookup_app(${JSON.stringify(entry)}); if (!app) return false; app.activate(); return true;`);
const known = entry => shell(`return imports.gi.Shell.AppSystem.get_default().get_installed().some(info => info.get_id() === ${JSON.stringify(entry)});`);
const iconOf = entry => shell(`const info = imports.gi.Shell.AppSystem.get_default().lookup_app(${JSON.stringify(entry)})?.get_app_info(); return info?.get_icon()?.to_string() ?? null;`);
function screenshot(name) {
  execFileSync('gdbus', ['call', '--session', '--dest', 'org.gnome.Shell', '--object-path', '/org/gnome/Shell/Screenshot', '--method', 'org.gnome.Shell.Screenshot.Screenshot', 'false', 'false', path.join(output, `${name}.png`)], { stdio: 'ignore' });
}
async function until(check, message, timeout = 30000) {
  const stop = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > stop) throw new Error(message);
    await sleep(500);
  }
}
const steps = [];
const pass = text => { steps.push(text); console.log(`ok  ${text}`); };
async function main() {
  fs.mkdirSync(output, { recursive: true });
  // The test driver starts Electron itself, so it borrows what the Shell gives launched apps.
  const session = shell(`return global.create_app_launch_context(0, -1).get_environment();`);
  for (const line of session) {
    const [name, ...value] = line.split('=');
    if (['DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY'].includes(name)) process.env[name] = value.join('=');
  }
  if (!process.env.DISPLAY) throw new Error('The GNOME session has no X11 display for Electron');

  // First run, the way a user starts it: from the entry the install registered.
  if (executablePath.startsWith('/opt/')) {
    await until(() => known(MANAGER), 'The app grid does not list RobOS App Manager');
    pass('Install registered RobOS App Manager in the app grid');
    const icon = iconOf(MANAGER);
    const iconFile = shell(`const theme = new (imports.gi.St.IconTheme)(); const info = theme.lookup_icon(${JSON.stringify(icon)}, 64, 0); return info ? info.get_filename() : null;`);
    if (!iconFile) throw new Error(`App Manager icon does not resolve in the icon theme: ${icon}`);
    pass(`App Manager icon resolves to ${iconFile}`);
    if (!activate(MANAGER)) throw new Error('Could not launch RobOS App Manager from its entry');
    const opened = await until(() => windows().find(w => w.wmClass === 'robos-app-manager'), 'App Manager opened no window');
    if (opened.app !== MANAGER) throw new Error(`App Manager window belongs to ${opened.app}, not its entry`);
    pass('App Manager window is grouped under its own dock entry');
    await until(() => favorites().includes(MANAGER), 'App Manager was not pinned to the dock');
    pass('First launch pinned App Manager to the dock');
    await sleep(2000); screenshot('manager-pinned-and-running');
    shell(`global.get_window_actors().map(a => a.meta_window).filter(w => w.get_wm_class() === 'robos-app-manager').forEach(w => w.delete(global.get_current_time()));`);
    await until(() => !windows().some(w => w.wmClass === 'robos-app-manager'), 'App Manager did not close');
    await sleep(1000);
    if (!favorites().includes(MANAGER)) throw new Error('The dock pin did not survive closing App Manager');
    pass('Dock pin stays after App Manager closes');
  }

  // Install through the real UI. Only the release transport is redirected.
  const catalog = JSON.parse(fs.readFileSync(path.join(payloads, `robos-catalog-linux-${process.arch}.json`), 'utf8'));
  const server = http.createServer((req, res) => {
    const file = path.join(payloads, path.basename(req.url));
    if (!fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { _electron: electron } = require(path.join(repo, 'packages/app-manager/node_modules/playwright-core'));
  const startManager = async () => {
    const application = await electron.launch({ executablePath, args: [], timeout: 30000 });
    await application.evaluate(({ dialog }, port) => {
      const original = globalThis.fetch;
      globalThis.fetch = (url, options) => original(`http://127.0.0.1:${port}/${String(url).split('/').pop()}`, options);
      dialog.showMessageBox = async () => ({ response: 1 });
    }, server.address().port);
    const window = await application.firstWindow(); await window.waitForSelector('#refresh');
    return { application, window };
  };
  try {
    let { application, window } = await startManager();
    await window.locator('#refresh').click();
    const labels = Object.fromEntries(apps.map(id => [id, catalog.components.find(item => item.id === id).label]));
    await window.getByText(labels[apps[0]], { exact: true }).first().waitFor();
    for (const id of apps) await window.getByRole('checkbox', { name: `Select ${labels[id]}`, exact: true }).check();
    await window.locator('#install').click();
    await window.getByText('Selected apps are ready to open.', { exact: true }).waitFor({ timeout: 240000 });
    await window.screenshot({ path: path.join(output, 'manager-installed.png') });
    pass(`Installed ${apps.join(', ')} through the App Manager UI`);
    const closed = application.waitForEvent('close'); await application.close(); await closed;

    const data = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share');
    const validate = fs.existsSync('/usr/bin/desktop-file-validate');
    for (const id of apps) {
      const entry = entryOf(id);
      if (validate) execFileSync('desktop-file-validate', [path.join(data, 'applications', entry)]);
      await until(() => known(entry), `The app grid does not list ${id}`);
      const found = shell(`return imports.gi.Shell.AppSystem.search(${JSON.stringify(labels[id])}).flat();`);
      if (!found.includes(entry)) throw new Error(`Searching GNOME for "${labels[id]}" does not find it`);
      const icon = iconOf(entry);
      if (!icon?.startsWith('/') || !fs.existsSync(icon)) throw new Error(`${id} has no real icon: ${icon}`);
    }
    pass('Every installed app is valid, listed in the app grid, searchable and has its own icon');
    // The Shell's own folder view decides what the user sees in the grid. Dependent apps such
    // as Dev Central install alongside the selection, so only the selected apps are required.
    shell(`Main.overview.showApps(); return true;`);
    await until(() => {
      const view = shell(`const display = Main.overview._overview.controls.appDisplay;
        const folder = display._folderIcons.find(icon => icon.id === 'RobOS');
        return { name: folder?.name ?? null, apps: folder?.getAppIds() ?? [], top: display._orderedItems.map(item => item.id) };`);
      return apps.every(id => view.apps.includes(entryOf(id)) && !view.top.includes(entryOf(id))) && view.name === 'RobOS Apps';
    }, 'The selected apps are not inside the RobOS Apps folder in the app grid', 15000);
    await sleep(1500); screenshot('app-grid-folder');
    shell(`Main.overview._overview.controls.appDisplay._folderIcons.find(icon => icon.id === 'RobOS').open(); return true;`);
    await sleep(1500); screenshot('app-grid-folder-open');
    shell(`Main.overview.hide(); return true;`);
    pass('Installed apps are grouped in a RobOS Apps folder in the app grid');

    // Launch each app the way the dock and app grid do, then ask the Shell who owns its window.
    const before = new Set(windows().map(w => w.wmClass));
    for (const id of apps) {
      if (!activate(entryOf(id))) throw new Error(`Could not launch ${id} from its entry`);
      const opened = await until(() => windows().find(w => w.wmClass === `robos-${id}`), `${id} opened no window with class robos-${id}. Windows: ${JSON.stringify(windows())}`, 45000);
      if (opened.app !== entryOf(id)) throw new Error(`${id} window belongs to ${opened.app}, so the dock would show the wrong icon`);
      pass(`${id} window is grouped under its own dock entry`);
    }
    if (before.size > 1) console.log(`note: other windows at launch: ${[...before]}`);
    await sleep(3000); screenshot('apps-running-in-dock');
    shell(`global.get_window_actors().map(a => a.meta_window).filter(w => /^robos-/.test(w.get_wm_class() || '')).forEach(w => w.delete(global.get_current_time())); return true;`);
    await until(() => !windows().some(w => /^robos-/.test(w.wmClass || '')), 'Apps did not close', 20000);
    await sleep(1500);

    // Removal cleans the dock and the menus.
    ({ application, window } = await startManager());
    const pinned = favorites().includes(MANAGER);
    const closedForRemoval = application.waitForEvent('close');
    await window.locator('#remove-all').click(); await closedForRemoval;
    // test-ubuntu-install.sh stands in for the password prompt and records the request.
    const elevated = process.env.ROBOS_PKEXEC_LOG && fs.readFileSync(process.env.ROBOS_PKEXEC_LOG, 'utf8').trim();
    if (process.env.ROBOS_PKEXEC_LOG && elevated !== 'apt-get remove -y robos-app-manager') throw new Error(`Unexpected package removal request: ${elevated}`);
    for (const id of apps) await until(() => !known(entryOf(id)), `${id} is still in the app grid after removal`);
    if (favorites().some(entry => entry === MANAGER || entry.startsWith('robos-managed-'))) throw new Error('Removal left RobOS pinned to the dock');
    const remaining = shell(`return new (imports.gi.Gio.Settings)({ schema_id: 'org.gnome.desktop.app-folders' }).get_strv('folder-children');`);
    if (remaining.includes('RobOS')) throw new Error('Removal left the RobOS Apps folder');
    pass(`Uninstall RobOS removed the apps, menus, folder${pinned ? ' and dock pin' : ''}`);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: true, steps }, null, 2));
    console.log('GNOME integration passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => {
  fs.mkdirSync(output, { recursive: true });
  try { screenshot('failure'); } catch {}
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: false, error: error.stack, steps }, null, 2));
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  fs.rmSync(result, { recursive: true, force: true });
  // Leave a failed run's process tree to its session; a clean exit ends the driver.
  setTimeout(() => process.exit(), 500);
});
