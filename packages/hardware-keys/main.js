'use strict';

const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync, spawn } = require('child_process');

const hk = require('./lib/hardware-keys-core');

let kdbx = null;
try {
  const kdbxPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'kdbx-vault'),
    path.resolve(__dirname, '..', 'robos-lib', 'kdbx-vault'),
    '/usr/local/share/robos/robos-lib/kdbx-vault',
  ].filter(Boolean);
  for (const p of kdbxPaths) {
    try { kdbx = require(p); break; } catch {}
  }
} catch {}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

const APP_ID = 'hardware-keys';
const DEBUG_PORT = 19218;

let _debugServer = null;
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

app.setName(`robos-${APP_ID}`);
app.setPath('userData', path.join(process.env.HOME || os.homedir(), '.config', 'robos', 'electron', APP_ID));

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let lastConnectedCount = 0;

function sendStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hk:touch-status', payload);
  }
}

function getFullState() {
  const detection = hk.detectHardwareKeys();
  const sshKeys = hk.listSshKeys();
  const systemStatus = hk.getSystemIntegrationStatus();
  const config = hk.loadConfig();

  // Auto-register newly seen hardware keys in config
  if (detection.keys.length > 0) {
    let changed = false;
    for (const k of detection.keys) {
      const fingerprint = `${k.usbId}:${k.fido.aaguid || k.name}:${k.firmwareVersion}`;
      if (!config.registeredDevices.some(d => d.fingerprint === fingerprint)) {
        config.registeredDevices.push({
          fingerprint,
          name: k.name,
          vendor: k.vendor,
          usbId: k.usbId,
          firmwareVersion: k.firmwareVersion,
          formFactor: k.formFactor,
          aaguid: k.fido.aaguid,
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        });
        changed = true;
      } else {
        const existing = config.registeredDevices.find(d => d.fingerprint === fingerprint);
        if (existing) existing.lastSeenAt = new Date().toISOString();
      }
    }
    if (changed) hk.saveConfig(config);
  }

  lastConnectedCount = detection.keys.length;

  return {
    ok: true,
    detection,
    sshKeys,
    systemStatus,
    config,
    kdbxStatus: kdbx ? kdbx.getVaultStatus() : null,
  };
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  const iconPng = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 920,
    minHeight: 620,
    title: 'RobOS Hardware Keys',
    backgroundColor: '#0d1117',
    icon: fs.existsSync(iconPng) ? iconPng : path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) {
    try {
      if (typeof _debugServer.registerSnapshotIPC === 'function') {
        _debugServer.registerSnapshotIPC(mainWindow);
      }
      _debugServer.startDebugServer(mainWindow, DEBUG_PORT, APP_ID);
    } catch {}
  }

  // Hotplug monitor for USB / HID security keys
  const hotplugTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      clearInterval(hotplugTimer);
      return;
    }
    try {
      const hidNow = hk.scanHidrawDevices();
      if (hidNow.length !== lastConnectedCount) {
        const wasConnected = lastConnectedCount > 0;
        const nowConnected = hidNow.length > 0;
        lastConnectedCount = hidNow.length;

        if (wasConnected && !nowConnected) {
          const cfg = hk.loadConfig();
          if (cfg.policies && cfg.policies.lockSessionOnUnplug) {
            try { execFileSync('gpgconf', ['--kill', 'gpg-agent'], { timeout: 3000 }); } catch {}
            try { if (kdbx) kdbx.lockDatabase(); } catch {}
          }
        }
        mainWindow.webContents.send('hk:hotplug-changed', getFullState());
      }
    } catch {}
  }, 3500);
});

app.on('window-all-closed', () => app.quit());

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('hk:get-state', async () => {
  return getFullState();
});

ipcMain.handle('hk:scan-keys', async () => {
  return getFullState();
});

ipcMain.handle('hk:touch-challenge', async (_, opts = {}) => {
  sendStatus({
    state: 'waiting-touch',
    message: opts.simulate
      ? 'Running simulated FIDO2 touch assertion...'
      : 'Touch the flashing gold contact on your YubiKey now...',
  });
  const res = await hk.runPhysicalTouchChallenge({
    ...opts,
    onStatus: (st) => sendStatus(st),
  });
  if (res.ok) {
    const cfg = hk.loadConfig();
    cfg.touchHistory.unshift({
      verifiedAt: res.verifiedAt,
      rpId: res.rpId,
      protocol: res.protocol,
      algorithm: res.algorithm,
      latencyMs: res.latencyMs,
      simulated: Boolean(res.simulated),
      userPresent: res.userPresent,
      userVerified: res.userVerified,
      signaturePreview: (res.signatureHex || '').slice(0, 32) + '...',
    });
    cfg.touchHistory = cfg.touchHistory.slice(0, 25);
    hk.saveConfig(cfg);
    sendStatus({ state: 'verified', message: `Physical touch verified in ${res.latencyMs} ms!` });
  } else {
    sendStatus({ state: 'error', message: res.error || 'Touch challenge failed' });
  }
  return { ...res, config: hk.loadConfig() };
});

ipcMain.handle('hk:generate-ssh-key', async (_, opts = {}) => {
  const res = await hk.generateHardwareSshKey({
    ...opts,
    onStatus: (st) => sendStatus(st),
  });
  if (res.ok) {
    sendStatus({ state: 'verified', message: `Generated hardware SSH key: ${res.pubPath}` });
  } else {
    sendStatus({ state: 'error', message: res.error });
  }
  return {
    ...res,
    sshKeys: hk.listSshKeys(),
  };
});

ipcMain.handle('hk:test-ssh-sign', async (_, opts = {}) => {
  const res = await hk.testSshKeySignature({
    ...opts,
    onStatus: (st) => sendStatus(st),
  });
  if (res.ok) {
    sendStatus({ state: 'verified', message: `SSH hardware signature verified in ${res.latencyMs} ms!` });
  } else {
    sendStatus({ state: 'error', message: res.error });
  }
  return res;
});

ipcMain.handle('hk:upload-github-ssh', async (_, { pubPath }) => {
  if (!pubPath || !fs.existsSync(pubPath)) {
    return { ok: false, error: 'Public key file not found' };
  }
  const title = `RobOS Hardware Key (${os.hostname()} ${new Date().toISOString().slice(0, 10)})`;
  try {
    execFileSync('gh', ['ssh-key', 'add', pubPath, '--title', title], {
      encoding: 'utf8',
      timeout: 15000,
    });
    return { ok: true, title };
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString().trim();
    if (msg.includes('already in use')) {
      return { ok: true, alreadyAdded: true, title };
    }
    return { ok: false, error: msg || 'Failed to upload SSH key via gh CLI' };
  }
});

ipcMain.handle('hk:set-fido-pin', async (_, opts = {}) => {
  const res = hk.setOrChangeFidoPin(opts);
  return {
    ...res,
    detection: hk.detectHardwareKeys(),
  };
});

ipcMain.handle('hk:list-resident-creds', async (_, opts = {}) => {
  return hk.listResidentCredentials(opts);
});

ipcMain.handle('hk:delete-resident-cred', async (_, opts = {}) => {
  return hk.deleteResidentCredential(opts);
});

ipcMain.handle('hk:enroll-pam-u2f', async () => {
  const res = await hk.enrollPamU2fKey({
    onStatus: (st) => sendStatus(st),
  });
  if (res.ok) {
    sendStatus({ state: 'verified', message: 'Enrolled YubiKey in ~/.config/Yubico/u2f_keys!' });
  } else {
    sendStatus({ state: 'error', message: res.error });
  }
  return {
    ...res,
    systemStatus: hk.getSystemIntegrationStatus(),
  };
});

ipcMain.handle('hk:configure-git-signing', async (_, { pubKeyPath }) => {
  const res = hk.configureGitHardwareSigning({ pubKeyPath });
  return {
    ...res,
    systemStatus: hk.getSystemIntegrationStatus(),
  };
});

ipcMain.handle('hk:save-policies', async (_, policies = {}) => {
  const cfg = hk.loadConfig();
  cfg.policies = { ...cfg.policies, ...policies };
  hk.saveConfig(cfg);
  return { ok: true, config: cfg };
});

ipcMain.handle('hk:copy-text', async (_, text) => {
  clipboard.writeText(String(text || ''));
  return { ok: true };
});

ipcMain.handle('hk:unlock-keystore', async (_, opts = {}) => {
  if (!kdbx) return { ok: false, error: 'kdbx-vault library not available' };
  const res = await kdbx.unlockWithHardwareKey({
    ...opts,
    onStatus: (st) => sendStatus(st),
  });
  if (res.ok) {
    sendStatus({ state: 'verified', message: `KeePassXC .kdbx Keystore unlocked via Physical Key (${res.latencyMs} ms)!` });
  } else {
    sendStatus({ state: 'error', message: res.error || 'Failed to unlock keystore' });
  }
  return { ...res, kdbxStatus: kdbx.getVaultStatus() };
});

ipcMain.handle('hk:lock-keystore', async () => {
  if (!kdbx) return { ok: false, error: 'kdbx-vault library not available' };
  const res = kdbx.lockDatabase();
  return { ...res, kdbxStatus: kdbx.getVaultStatus() };
});

ipcMain.handle('hk:open-pass-manager', async () => {
  try {
    const passMgrDir = path.resolve(__dirname, '..', 'pass-manager');
    const localBin = path.join(os.homedir(), '.local', 'bin', 'robos-pass-manager');
    if (fs.existsSync(localBin)) {
      spawn(localBin, [], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn(process.execPath, [passMgrDir, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
