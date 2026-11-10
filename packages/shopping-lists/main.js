'use strict';

let app, BrowserWindow, ipcMain, dialog, shell, clipboard, session;
try {
  ({ app, BrowserWindow, ipcMain, dialog, shell, clipboard, session } = require('electron'));
} catch (error) {
  if (process.versions.electron) throw error;
}

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { createStore } = require('./lib/store');
const { createMobileServer } = require('./lib/mobile-server');
const { renderGoogleDocHtml } = require('./lib/google-docs-format');
const { renderQrSvg } = require('./lib/qr');
const { generateAppsScriptCodeGs, generateAppsScriptIndexHtml } = require('./lib/apps-script-bundle');
const {
  listGoogleAccounts,
  signInGoogleAccount,
  syncWithGoogleDrive,
  shareShoppingFolder,
} = require('./lib/google-drive-sync');
const { processDictationAudio } = require('./lib/dictate-agent');

const APP_ID = 'shopping-lists';
const DEBUG_PORT = Number(process.env.ROBOS_DEBUG_PORT || 19224);
const WEB_PORT = Number(process.env.SHOPPING_LISTS_WEB_PORT ?? 19225);
const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_DIR = process.env.ROBOS_CONFIG_DIR || path.join(HOME_DIR, '.config', 'robos');
const TEST = process.env.ROBOS_TEST === '1';

function requireShared(...relPaths) {
  for (const rel of relPaths) {
    const candidates = [
      process.env.ROBOS_LIB_PATH && rel.startsWith('robos-lib/') && path.join(process.env.ROBOS_LIB_PATH, rel.slice('robos-lib/'.length)),
      path.resolve(__dirname, '..', rel),
      path.join('/usr/local/share/robos', rel),
    ].filter(Boolean);
    for (const p of candidates) {
      try { return require(p); } catch {}
    }
  }
  return null;
}

const logger = requireShared('robos-lib/logger');
try {
  logger?.setupGlobalErrorHandlers?.('robos-shopping-lists', dialog);
} catch {}

const log = (obj) => {
  try { console.log(JSON.stringify({ app: APP_ID, time: new Date().toISOString(), ...obj })); } catch {}
};

const domSnapshot = requireShared('robos-lib/dom-snapshot');
const aiAgent = requireShared('robos-lib/ai-agent');

const store = createStore({ homeDir: HOME_DIR, configDir: CONFIG_DIR });
let mobileInfo = { port: WEB_PORT, localUrl: `http://127.0.0.1:${WEB_PORT}`, lanUrl: `http://127.0.0.1:${WEB_PORT}` };
let mainWindow = null;
let autoSyncTimer = null;

const mobileServer = createMobileServer({
  store,
  onMutate: () => scheduleAutoDriveSync(),
});

function buildFullState() {
  const snap = store.getSnapshot();
  const googleAccounts = listGoogleAccounts({ homeDir: HOME_DIR });
  return {
    ...snap,
    mobileServer: mobileInfo,
    googleAccounts,
  };
}

function broadcastState(reason = 'update') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('shopping-lists:state', { reason, state: buildFullState() });
    } catch {}
  }
}

store.onChange((_snap, reason) => {
  broadcastState(reason);
});

function scheduleAutoDriveSync() {
  const snap = store.getSnapshot();
  if (!snap.sync?.autoSync || (!snap.sync.accountId && !process.env.ROBOS_TEST_GDRIVE_TOKEN)) return;
  clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => {
    runDriveSync({ pullFromDocs: false }).catch((err) => {
      log({ msg: 'auto drive sync failed', err: err.message });
    });
  }, 1500);
}

async function runDriveSync(opts = {}) {
  const testTokens = process.env.ROBOS_TEST_GDRIVE_TOKEN
    ? { get: async () => process.env.ROBOS_TEST_GDRIVE_TOKEN, refresh: async () => process.env.ROBOS_TEST_GDRIVE_TOKEN }
    : undefined;

  return syncWithGoogleDrive({
    store,
    accountId: opts.accountId,
    folderInput: opts.folderInput,
    appsScriptWebAppUrl: opts.appsScriptWebAppUrl,
    mobileLanUrl: mobileInfo.lanUrl,
    pullFromDocs: Boolean(opts.pullFromDocs),
    homeDir: HOME_DIR,
    tokens: testTokens,
  });
}

async function handleSmartAdd(text, defaultListId, useAi = false) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Enter items or paste a recipe first.');

  if (useAi && aiAgent && typeof aiAgent.ask === 'function') {
    try {
      const snap = store.getSnapshot();
      const storeGuide = snap.lists.map((l) => `${l.id} (${l.name}: aisles ${l.aisles.join(', ')})`).join('; ');
      const prompt = [
        'Convert the following household shopping request into a JSON array of items.',
        `Available shopping lists: ${storeGuide}. Default list: ${defaultListId || snap.activeListId}.`,
        'Return ONLY a valid JSON array where each element has: {"listId":"grocery|target|costco","name":"string","qty":1,"unit":"ea|pack|lb|oz|gal|case|bag|box","aisle":"string","note":"string","badge":"|urgent|deal|organic|kirkland"}.',
        `User input: ${raw}`,
      ].join('\n');
      const reply = await aiAgent.ask(prompt, { timeoutMs: 25000 });
      const textReply = typeof reply === 'string' ? reply : (reply?.text || reply?.output || '');
      const jsonMatch = textReply.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const arr = JSON.parse(jsonMatch[0]);
        if (Array.isArray(arr) && arr.length > 0) {
          const added = [];
          for (const entry of arr) {
            const targetId = snap.lists.some((l) => l.id === entry.listId) ? entry.listId : (defaultListId || snap.activeListId);
            const res = store.addItem(targetId, entry);
            added.push({ listId: targetId, item: res.item, merged: res.merged });
          }
          scheduleAutoDriveSync();
          return { added, usedAi: true, state: buildFullState() };
        }
      }
    } catch (err) {
      log({ msg: 'AI smart-add fell back to local parser', err: err.message });
    }
  }

  const out = store.smartBatchAdd(raw, defaultListId);
  scheduleAutoDriveSync();
  return { ...out, usedAi: false, state: buildFullState() };
}

function registerIpc() {
  if (!ipcMain) return;

  ipcMain.handle('shopping-lists:getState', () => buildFullState());

  ipcMain.handle('shopping-lists:selectList', (_e, listId) => {
    store.setActiveList(listId);
    return buildFullState();
  });

  ipcMain.handle('shopping-lists:createList', (_e, payload) => {
    const res = store.createList(payload);
    scheduleAutoDriveSync();
    return { listId: res.listId, state: buildFullState() };
  });

  ipcMain.handle('shopping-lists:addItem', (_e, listId, payload) => {
    const res = store.addItem(listId, payload);
    scheduleAutoDriveSync();
    return { item: res.item, merged: res.merged, state: buildFullState() };
  });

  ipcMain.handle('shopping-lists:toggleItem', (_e, listId, itemId, checked) => {
    const res = store.toggleItem(listId, itemId, checked);
    scheduleAutoDriveSync();
    return { item: res.item, state: buildFullState() };
  });

  ipcMain.handle('shopping-lists:adjustItemQty', (_e, listId, itemId, delta) => {
    const res = store.adjustItemQty(listId, itemId, delta);
    scheduleAutoDriveSync();
    return { item: res.item, state: buildFullState() };
  });

  ipcMain.handle('shopping-lists:updateItem', (_e, listId, itemId, patch) => {
    const res = store.updateItem(listId, itemId, patch);
    scheduleAutoDriveSync();
    return { item: res.item, state: buildFullState() };
  });

  ipcMain.handle('shopping-lists:removeItem', (_e, listId, itemId) => {
    const res = store.removeItem(listId, itemId);
    scheduleAutoDriveSync();
    return { removed: res.removed, state: buildFullState() };
  });

  ipcMain.handle('shopping-lists:clearChecked', (_e, listId) => {
    const res = store.clearChecked(listId);
    scheduleAutoDriveSync();
    return { removedCount: res.removedCount, state: buildFullState() };
  });

  ipcMain.handle('shopping-lists:checkAll', (_e, listId, checked) => {
    store.checkAll(listId, checked);
    scheduleAutoDriveSync();
    return { state: buildFullState() };
  });

  ipcMain.handle('shopping-lists:undo', () => {
    const res = store.undo();
    scheduleAutoDriveSync();
    return { restored: res.restored, label: res.label, state: buildFullState() };
  });

  ipcMain.handle('shopping-lists:smartAdd', (_e, text, listId, useAi) => handleSmartAdd(text, listId, useAi));

  ipcMain.handle('shopping-lists:resetStarterLists', () => {
    store.resetStarterLists();
    scheduleAutoDriveSync();
    return buildFullState();
  });

  ipcMain.handle('shopping-lists:exportHouseholdCsv', async (_e, listId, opts = {}) => {
    const { filename, csv } = store.exportHouseholdCsv(listId);
    if (opts.saveDialog && dialog && mainWindow && !TEST) {
      const res = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Shopping List to RobOS Household CSV',
        defaultPath: path.join(HOME_DIR, filename),
        filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      });
      if (!res.canceled && res.filePath) {
        fs.writeFileSync(res.filePath, csv, 'utf8');
        return { saved: true, filePath: res.filePath, filename, csv };
      }
      return { saved: false, filename, csv };
    }
    return { saved: false, filename, csv };
  });

  ipcMain.handle('shopping-lists:previewGoogleDoc', (_e, listId) => {
    const snap = store.getSnapshot();
    const list = snap.lists.find((l) => l.id === listId) || snap.lists[0];
    const html = renderGoogleDocHtml(list, {
      syncedAt: snap.sync.lastSyncedAt || snap.updatedAt,
      appsScriptWebAppUrl: snap.sync.appsScriptWebAppUrl,
      mobileLanUrl: mobileInfo.lanUrl,
      folderUrl: snap.sync.folderUrl,
      docUrls: snap.sync.docUrls,
    });
    return {
      listId: list.id,
      html,
      docUrl: snap.sync.docUrls?.[list.id] || '',
      previewUrl: `${mobileInfo.localUrl}/doc-preview/${encodeURIComponent(list.id)}`,
    };
  });

  ipcMain.handle('shopping-lists:getQrSvg', (_e, text, sizePx = 210) => {
    const target = String(text || mobileInfo.lanUrl);
    return { text: target, svg: renderQrSvg(target, { sizePx }) };
  });

  ipcMain.handle('shopping-lists:listGoogleAccounts', () => listGoogleAccounts({ homeDir: HOME_DIR }));

  ipcMain.handle('shopping-lists:signInGoogle', async () => {
    const res = await signInGoogleAccount({ homeDir: HOME_DIR });
    if (res?.account?.id) {
      store.updateSyncConfig({ accountId: res.account.id });
    }
    return { account: res?.account || null, state: buildFullState() };
  });

  ipcMain.handle('shopping-lists:updateSyncConfig', (_e, patch) => {
    store.updateSyncConfig(patch);
    return buildFullState();
  });

  ipcMain.handle('shopping-lists:syncGoogleDrive', async (_e, opts = {}) => {
    const res = await runDriveSync(opts);
    return { ...res, state: buildFullState() };
  });

  ipcMain.handle('shopping-lists:shareGoogleFolder', async (_e, opts = {}) => {
    const snap = store.getSnapshot();
    const testTokens = process.env.ROBOS_TEST_GDRIVE_TOKEN
      ? { get: async () => process.env.ROBOS_TEST_GDRIVE_TOKEN, refresh: async () => process.env.ROBOS_TEST_GDRIVE_TOKEN }
      : undefined;
    const results = await shareShoppingFolder({
      accountId: opts.accountId || snap.sync.accountId,
      folderId: opts.folderId || snap.sync.folderId,
      emails: opts.emails || [],
      role: opts.role || 'writer',
      homeDir: HOME_DIR,
      tokens: testTokens,
    });
    return { results, state: buildFullState() };
  });

  ipcMain.handle('shopping-lists:getAppsScriptBundle', () => {
    const snap = store.getSnapshot();
    return {
      codeGs: generateAppsScriptCodeGs({
        folderId: snap.sync.folderId,
        docIds: snap.sync.docIds,
      }),
      indexHtml: generateAppsScriptIndexHtml(),
    };
  });

  ipcMain.handle('shopping-lists:copyText', (_e, text) => {
    if (clipboard) clipboard.writeText(String(text || ''));
    return { ok: true };
  });

  ipcMain.handle('shopping-lists:openExternal', async (_e, url) => {
    const target = String(url || '').trim();
    if (!/^https?:\/\//i.test(target)) throw new Error('Only http/https links can be opened.');
    if (TEST) return { opened: true, url: target, simulated: true };
    if (shell) await shell.openExternal(target);
    return { opened: true, url: target };
  });

  ipcMain.handle('shopping-lists:dictate', async (_e, payload = {}) => {
    const res = await processDictationAudio({
      store,
      audioBase64: payload.audioBase64,
      mimeType: payload.mimeType || 'audio/webm',
      transcriptHint: payload.transcriptHint || payload.transcript || '',
      listId: payload.listId,
      autoSync: false,
    });
    scheduleAutoDriveSync();
    return { ...res, state: buildFullState() };
  });
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 940,
    minHeight: 640,
    title: 'RobOS Shopping Lists',
    backgroundColor: '#0b101b',
    icon: path.join(__dirname, fs.existsSync(path.join(__dirname, 'icon.png')) ? 'icon.png' : 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (domSnapshot) {
    try {
      domSnapshot.registerSnapshotIPC?.(mainWindow);
      domSnapshot.startDebugServer(mainWindow, DEBUG_PORT, APP_ID);
    } catch {}
  }
}

if (app) {
  const userDataDir = path.join(CONFIG_DIR, 'electron', APP_ID);
  app.setName?.('robos-shopping-lists');
  app.setPath?.('userData', userDataDir);
  app.commandLine?.appendSwitch('no-sandbox');
  app.commandLine?.appendSwitch('disable-gpu');
  app.commandLine?.appendSwitch('disable-dev-shm-usage');

  try {
    const lockFile = path.join(userDataDir, 'SingletonLock');
    if (fs.existsSync(lockFile)) {
      const target = fs.readlinkSync(lockFile);
      const m = target.match(/-(\d+)$/);
      if (m) {
        try {
          process.kill(parseInt(m[1], 10), 0);
        } catch {
          try { fs.unlinkSync(lockFile); } catch {}
          try { fs.unlinkSync(path.join(userDataDir, 'SingletonCookie')); } catch {}
          try { fs.unlinkSync(path.join(userDataDir, 'SingletonSocket')); } catch {}
        }
      }
    }
  } catch {}

  if (!TEST && app.requestSingleInstanceLock?.() === false) {
    app.quit();
  } else {
    app.on?.('second-instance', createWindow);
    app.whenReady?.().then(async () => {
      try {
        session?.defaultSession?.setPermissionCheckHandler?.(() => true);
        session?.defaultSession?.setPermissionRequestHandler?.((_wc, _perm, callback) => callback(true));
      } catch {}
      registerIpc();
      try {
        mobileInfo = await mobileServer.listen(WEB_PORT, TEST ? '127.0.0.1' : '0.0.0.0');
        log({ msg: 'mobile shopping server ready', ...mobileInfo });
      } catch (err) {
        log({ msg: 'mobile shopping server failed', err: err.message });
      }
      createWindow();
    });
    app.on?.('window-all-closed', async () => {
      clearTimeout(autoSyncTimer);
      await mobileServer.close();
      app.quit();
    });
  }
}

module.exports = { store, mobileServer };
