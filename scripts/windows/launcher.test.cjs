'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchCommand, launchApp } = require('./launch-app.cjs');
const { startLauncher, loginCommand, ACCELERATOR } = require('./launcher-host.cjs');

test('packaged launches use their EXE entry point and clear Node-only mode', () => {
  const cmd = launchCommand('RobOS.exe', 'C:/app/resources/app.asar/windows', true, 'point-of-sale', { ELECTRON_RUN_AS_NODE: '1', PATH: 'tools' });
  assert.deepEqual(cmd.args, ['--app=point-of-sale']);
  assert.equal(cmd.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(cmd.env.PATH, 'tools');
  assert.deepEqual(launchCommand('electron.exe', 'C:/RobOS/windows', false, 'household').args, ['C:/RobOS/windows', '--app=household']);
  assert.deepEqual(loginCommand('electron.exe', 'C:/RobOS/windows', false).args, ['C:/RobOS/windows', '--background']);
  assert.deepEqual(loginCommand('temp/RobOS.exe', 'temp/host', true, 'Downloads/RobOS-Portable.exe'), { path: 'Downloads/RobOS-Portable.exe', args: ['--background'] });
});

test('a failed process launch rejects with its diagnostic log instead of reporting success', async t => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-launch-failure-'));
  t.after(() => fs.rmSync(logDir, { recursive: true, force: true }));
  await assert.rejects(launchApp({ executable: path.join(logDir, 'missing.exe'), host: '', packaged: true, id: 'test-app', logDir }), /ENOENT.*test-app-windows\.log/);
});

test('close hides the cached launcher; shortcut toggles it; conflicts do not save an enabled binding', async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-launcher-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const lib = path.join(home, 'packages/robos-lib'); fs.mkdirSync(lib, { recursive: true });
  fs.writeFileSync(path.join(lib, 'windows-path.js'), 'exports.refreshWindowsPathAsync=async()=>{};');
  const app = new EventEmitter(); app.whenReady = () => Promise.resolve(); app.quit = () => app.emit('before-quit');
  const windows = []; let callback, occupied = false, registered = false, login;
  class Window extends EventEmitter {
    constructor() { super(); this.visible = false; this.webContents = { send() {} }; windows.push(this); }
    static getAllWindows() { return windows; }
    loadFile() {} isDestroyed() { return false; } isMinimized() { return false; }
    isVisible() { return this.visible; } isFocused() { return this.visible; }
    show() { this.visible = true; } hide() { this.visible = false; } focus() {}
  }
  const handlers = {};
  const shortcuts = { isRegistered: () => registered, register: (_key, fn) => { if (occupied) return false; registered = true; callback = fn; return true; }, unregister: () => { registered = false; }, unregisterAll() {} };
  app.setLoginItemSettings = value => { login = value; }; app.getLoginItemSettings = () => ({ openAtLogin: login.openAtLogin });
  class Tray { setToolTip() {} setContextMenu() {} on() {} destroy() {} }
  startLauncher({ app, BrowserWindow: Window, ipcMain: { handle: (name, fn) => { handlers[name] = fn; } }, Tray,
    Menu: { buildFromTemplate: x => x }, nativeImage: { createFromPath: () => ({ resize: () => ({}) }) }, globalShortcut: shortcuts }, { root: home, home, apps: [], host: home });
  await new Promise(setImmediate);
  t.after(() => app.emit('will-quit'));
  const win = windows[0]; win.show(); let prevented = false;
  win.emit('close', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(win.visible, false);
  occupied = true;
  assert.throws(() => handlers['launcher:shortcut'](null, true), /in use/);
  assert.equal(handlers['launcher:state']().shortcutEnabled, false);
  occupied = false;
  assert.equal(handlers['launcher:shortcut'](null, true).shortcutActive, true);
  assert.equal(ACCELERATOR, 'Super+Shift+Space');
  callback(); assert.equal(win.visible, true);
  callback(); assert.equal(win.visible, false);
  assert.equal(windows.length, 1, 'Showing the launcher must reuse its warm window');
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, '.config/robos/windows-launcher.json'))).shortcutEnabled, true);
  handlers['launcher:login'](null, true); assert.equal(login.openAtLogin, true); assert.ok(login.args.includes('--background'));
});
