'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const APP_ID = 'daw-studio';
const DEBUG_PORT = 19232;

let audioDevices = null;
for (const p of [
  process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'audio-devices'),
  path.resolve(__dirname, '..', 'robos-lib', 'audio-devices'),
  '/usr/local/share/robos/robos-lib/audio-devices',
].filter(Boolean)) {
  try { audioDevices = require(p); break; } catch {}
}

let _debugServer = null;
for (const p of [
  process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
  path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
  '/usr/local/share/robos/robos-lib/dom-snapshot',
].filter(Boolean)) {
  try { _debugServer = require(p); break; } catch {}
}

app.setName(`robos-${APP_ID}`);
app.setPath('userData', path.join(process.env.HOME || os.homedir(), '.config', 'robos', 'electron', APP_ID));

if (process.env.ROBOS_TEST !== '1' && !app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let hotplugTimer = null;
let lastUsbSignature = '';

function computeSignature(snap) {
  if (!snap || !snap.ok) return 'err';
  return JSON.stringify({
    fr: snap.focusrite?.connected ? `${snap.focusrite.usbId}:${snap.focusrite.alsaCardIndex}` : 'none',
    inCount: snap.inputs?.length || 0,
    outCount: snap.outputs?.length || 0,
  });
}

function createWindow() {
  const iconPng = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 860,
    minHeight: 600,
    title: 'RobOS DAW Studio',
    backgroundColor: '#0d1117',
    icon: fs.existsSync(iconPng) ? iconPng : path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'midi' || permission === 'midiSysex');
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) {
    try {
      _debugServer.registerSnapshotIPC(mainWindow);
      _debugServer.startDebugServer(mainWindow, Number(process.env.ROBOS_SNAPSHOT_PORT) || DEBUG_PORT, APP_ID);
    } catch {}
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

ipcMain.handle('daw:audio-snapshot', async () => {
  try {
    const snap = audioDevices.getAudioDevicesSnapshot();
    lastUsbSignature = computeSignature(snap);
    return snap;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:save-audio-engine', async (_e, payload) => {
  try {
    const { sampleRate, quantum, defaultInputId, defaultOutputId, preferredInputNodeName, preferredOutputNodeName } = payload || {};
    if (preferredInputNodeName !== undefined || preferredOutputNodeName !== undefined) {
      audioDevices.saveAudioConfig({
        ...(preferredInputNodeName !== undefined ? { preferredInputNodeName } : {}),
        ...(preferredOutputNodeName !== undefined ? { preferredOutputNodeName } : {}),
      });
    }
    return audioDevices.setPipeWireEngineSettings({ sampleRate, quantum, defaultInputId, defaultOutputId });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:set-focusrite-control', async (_e, payload) => {
  try {
    const mixer = audioDevices.setFocusriteHardwareControl(payload || {});
    return { ok: true, mixer, snapshot: audioDevices.getAudioDevicesSnapshot() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:test-input', async (_e, payload) => {
  try {
    return await audioDevices.testInputCapture(payload || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:play-test-tone', async (_e, payload) => {
  try {
    return await audioDevices.playTestTone(payload || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

app.whenReady().then(() => {
  createWindow();

  // Watch USB / PipeWire hotplug changes every 2.5s
  hotplugTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !audioDevices) return;
    try {
      const snap = audioDevices.getAudioDevicesSnapshot();
      const sig = computeSignature(snap);
      if (lastUsbSignature && sig !== lastUsbSignature) {
        lastUsbSignature = sig;
        mainWindow.webContents.send('daw:hardware-changed', snap);
      } else if (!lastUsbSignature) {
        lastUsbSignature = sig;
      }
    } catch {}
  }, 2500);
});

app.on('window-all-closed', () => {
  if (hotplugTimer) clearInterval(hotplugTimer);
  app.quit();
});
