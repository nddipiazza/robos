'use strict';

let app, BrowserWindow, ipcMain, shell, dialog;
try {
  ({ app, BrowserWindow, ipcMain, shell, dialog } = require('electron'));
} catch (error) {
  if (process.versions.electron) throw error;
  app = {
    requestSingleInstanceLock: () => true,
    commandLine: { appendSwitch: () => {} },
    setName: () => {},
    setPath: () => {},
    whenReady: () => new Promise(() => {}),
    on: () => {},
    quit: () => {},
  };
  BrowserWindow = class {};
  ipcMain = { handle: () => {} };
  shell = { openExternal: () => {} };
  dialog = {};
}

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_DIR = path.join(HOME_DIR, '.config', 'robos');

try {
  const { setupGlobalErrorHandlers } = require('../robos-lib/logger');
  setupGlobalErrorHandlers('google-calendar', dialog);
} catch {
  try {
    const { setupGlobalErrorHandlers } = require('/usr/local/share/robos/robos-lib/logger');
    setupGlobalErrorHandlers('google-calendar', dialog);
  } catch {}
}

function requireShared(modName) {
  for (const p of [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, modName),
    path.resolve(__dirname, '..', 'robos-lib', modName),
    `/usr/local/share/robos/robos-lib/${modName}`,
  ].filter(Boolean)) {
    try {
      const resolved = require.resolve(p);
      if (modName === 'thunderbird-google' || modName === 'cloud-accounts') {
        delete require.cache[resolved];
      }
      return require(resolved);
    } catch {}
  }
  throw new Error(`RobOS shared module "${modName}" not found.`);
}

let _debugServer = null;
try { _debugServer = requireShared('dom-snapshot'); } catch {}

const userDataDir = path.join(CONFIG_DIR, 'electron', 'google-calendar');
app.setName('robos-google-calendar');
app.setPath?.('userData', userDataDir);

try {
  const lockFile = path.join(userDataDir, 'SingletonLock');
  if (fs.existsSync(lockFile)) {
    const target = fs.readlinkSync(lockFile);
    const m = target.match(/-(\d+)$/);
    if (m) {
      const pid = parseInt(m[1], 10);
      try {
        process.kill(pid, 0);
      } catch {
        try { fs.unlinkSync(lockFile); } catch {}
        try { fs.unlinkSync(path.join(userDataDir, 'SingletonCookie')); } catch {}
        try { fs.unlinkSync(path.join(userDataDir, 'SingletonSocket')); } catch {}
      }
    }
  }
} catch {}

if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    process.exit(0);
  }
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;

function createWindow() {
  const iconPng = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    title: 'RobOS Google Calendar & Thunderbird Integration',
    width: 1180,
    height: 800,
    minWidth: 860,
    minHeight: 580,
    backgroundColor: '#0d1117',
    icon: fs.existsSync(iconPng) ? iconPng : path.join(__dirname, 'icon.svg'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) {
    try {
      _debugServer.registerSnapshotIPC?.(mainWindow);
      _debugServer.startDebugServer?.(mainWindow, 19208, 'google-calendar');
    } catch {}
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
});

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => app.quit());

function sendInstallLog(line) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('gcal:install-log', line);
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('gcal:get-state', async () => {
  try {
    const ca = requireShared('cloud-accounts');
    const tb = requireShared('thunderbird-google');
    const state = ca.listAccounts();
    const googleAccounts = state.accounts.filter(a => a.provider === 'google');
    const thunderbird = tb.detectThunderbird();
    const activeAccount = googleAccounts.find(a => a.id === state.defaultAccountId) || googleAccounts[0] || null;
    let preview = null;
    if (activeAccount && activeAccount.email) {
      try {
        preview = tb.generateThunderbirdUserJsBlock(activeAccount, {
          enableCalendar: activeAccount.suites?.calendar?.enabled !== false,
          enableContacts: activeAccount.suites?.contacts?.enabled !== false,
          enableMail: Boolean(activeAccount.suites?.mail?.enabled),
        });
      } catch {}
    }
    return {
      ok: true,
      accounts: googleAccounts,
      allAccountsCount: state.accounts.length,
      defaultAccountId: activeAccount?.id || null,
      thunderbird,
      preview,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('gcal:preview-config', async (_, payload) => {
  try {
    const ca = requireShared('cloud-accounts');
    const tb = requireShared('thunderbird-google');
    const { accountId, enableCalendar, enableContacts, enableMail, calendarColor, refreshMinutes } = payload || {};
    const acc = ca.getAccountById(accountId);
    if (!acc) throw new Error('Select a Google account first.');
    const generated = tb.generateThunderbirdUserJsBlock(acc, {
      enableCalendar,
      enableContacts,
      enableMail,
      calendarColor,
      refreshMinutes,
    });
    return { ok: true, ...generated };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('gcal:configure-only', async (_, payload) => {
  try {
    const tb = requireShared('thunderbird-google');
    const { accountId, enableCalendar, enableContacts, enableMail, calendarColor, refreshMinutes } = payload || {};
    const res = tb.configureThunderbirdForGoogleAccount(accountId, {
      enableCalendar,
      enableContacts,
      enableMail,
      calendarColor,
      refreshMinutes,
    });
    const allRes = tb.configureAllGoogleAccountsInThunderbird();
    return {
      ...res,
      allAccountsConfigured: allRes.accountsConfigured,
      thunderbird: tb.detectThunderbird(),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('gcal:install-and-configure', async (_, payload) => {
  try {
    const tb = requireShared('thunderbird-google');
    const { accountId, enableCalendar, enableContacts, enableMail, calendarColor, refreshMinutes, dryRun } = payload || {};

    let status = tb.detectThunderbird();
    let installResult = { ok: true, alreadyInstalled: status.installed };

    if (!status.installed) {
      sendInstallLog('Mozilla Thunderbird is not installed yet. Starting automatic installation…\n');
      installResult = await tb.installThunderbird({
        dryRun: Boolean(dryRun),
        onLog: (chunk) => sendInstallLog(chunk),
      });
      if (!installResult.ok && !dryRun) {
        throw new Error(installResult.error || 'Mozilla Thunderbird installation failed. Check the provisioning log.');
      }
    } else {
      sendInstallLog(`Mozilla Thunderbird is already installed at ${status.binaryPath} (${status.version || 'ready'}).\n`);
    }

    sendInstallLog('Writing Google Calendar (CalDAV), Google Contacts (CardDAV), and OAuth2 configuration for all Google accounts to Thunderbird profile…\n');
    const configResult = tb.configureThunderbirdForGoogleAccount(accountId, {
      enableCalendar,
      enableContacts,
      enableMail,
      calendarColor,
      refreshMinutes,
    });
    const allRes = tb.configureAllGoogleAccountsInThunderbird();
    sendInstallLog(`✓ Configured ${allRes.count} Google calendar(s): ${(allRes.accountsConfigured || []).map((a) => a.email).join(', ')}\n`);

    return {
      ok: true,
      installResult,
      ...configResult,
      allAccountsConfigured: allRes.accountsConfigured,
      thunderbird: tb.detectThunderbird(),
    };
  } catch (err) {
    sendInstallLog(`Error: ${err.message}\n`);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('gcal:fetch-overview', async (_, accountId) => {
  try {
    const tb = requireShared('thunderbird-google');
    return await tb.fetchGoogleCalendarOverview(accountId);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('gcal:launch-thunderbird', async (_, mode = 'calendar') => {
  try {
    const tb = requireShared('thunderbird-google');
    return tb.launchThunderbird({ mode });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('gcal:oauth-google', async (_, params) => {
  try {
    const ca = requireShared('cloud-accounts');
    return await ca.startGoogleBrowserOAuth({
      ...(params || {}),
      onOpenExternal: (url) => shell?.openExternal?.(url),
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('gcal:launch-app', async (_, appId) => {
  try {
    const wrapperCandidates = [
      path.join(HOME_DIR, '.local', 'bin', `robos-${appId}`),
      path.join(HOME_DIR, '.local', 'bin', appId),
    ];
    const wrapper = wrapperCandidates.find(w => fs.existsSync(w));
    if (wrapper) {
      const child = spawn(wrapper, [], { detached: true, stdio: 'ignore', env: { ...process.env } });
      child.unref();
      return { ok: true, appId };
    }
    const candidates = [
      path.resolve(__dirname, '..', appId, 'main.js'),
      `/usr/local/share/robos/${appId}/main.js`,
    ];
    const mainJs = candidates.find(c => fs.existsSync(c));
    if (!mainJs) throw new Error(`RobOS app "${appId}" is not installed.`);
    const electronBin = process.execPath || '/usr/bin/electron';
    const child = spawn(electronBin, [mainJs, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();
    return { ok: true, appId };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
