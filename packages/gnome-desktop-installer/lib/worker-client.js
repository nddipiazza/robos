'use strict';

const { Worker } = require('worker_threads');
const path = require('path');

/**
 * Non-blocking Worker Thread client for ShortcutManager.
 * Runs all filesystem scanning, SVG/PNG icon rasterization, GIO trust updates,
 * and GSettings dock modifications on a dedicated background worker thread so
 * the Electron UI and main process event loop never freeze.
 */
class ShortcutWorkerClient {
  constructor(options = {}) {
    this.options = options;
    this.workerPath = path.join(__dirname, 'shortcut-worker.js');
    this.worker = null;
    this._seq = 0;
    this._pending = new Map();
  }

  _ensureWorker() {
    if (this.worker) return this.worker;

    const worker = new Worker(this.workerPath, {
      workerData: this.options,
    });

    worker.on('message', (msg) => {
      if (!msg || msg.id === undefined) return;
      const entry = this._pending.get(msg.id);
      if (!entry) return;

      if (msg.type === 'progress') {
        if (typeof entry.onProgress === 'function') {
          try {
            entry.onProgress(msg.data);
          } catch {}
        }
        return;
      }

      this._pending.delete(msg.id);
      if (msg.type === 'error') {
        entry.resolve({ ok: false, error: msg.error });
      } else {
        entry.resolve(msg.result);
      }
    });

    worker.on('error', (err) => {
      for (const [, entry] of this._pending) {
        entry.resolve({ ok: false, error: err.message });
      }
      this._pending.clear();
      this.worker = null;
    });

    worker.on('exit', () => {
      for (const [, entry] of this._pending) {
        entry.resolve({ ok: false, error: 'Background worker exited' });
      }
      this._pending.clear();
      this.worker = null;
    });

    this.worker = worker;
    return worker;
  }

  call(action, args = [], onProgress = null) {
    const worker = this._ensureWorker();
    const id = ++this._seq;
    return new Promise((resolve) => {
      this._pending.set(id, { resolve, onProgress });
      worker.postMessage({ id, action, args });
    });
  }

  listApps() {
    return this.call('list-apps');
  }

  installApp(appId, options = {}) {
    return this.call('install-app', [appId, options]);
  }

  uninstallApp(appId, options = {}) {
    return this.call('uninstall-app', [appId, options]);
  }

  setDesktopShortcut(appId, enabled) {
    return this.call('set-desktop-shortcut', [appId, enabled]);
  }

  setDockPinned(appId, pinned) {
    return this.call('set-dock-pinned', [appId, pinned]);
  }

  bulkInstall(appIds, options = {}, onProgress = null) {
    return this.call('bulk-install', [appIds, options], onProgress);
  }

  bulkRemoveDesktopShortcuts(appIds = null) {
    return this.call('bulk-remove-desktop', [appIds]);
  }

  refreshCaches() {
    return this.call('refresh-caches');
  }

  getAppDetails(appId) {
    return this.call('get-details', [appId]);
  }

  launchApp(appId) {
    return this.call('launch-app', [appId]);
  }

  async terminate() {
    if (this.worker) {
      const w = this.worker;
      this.worker = null;
      this._pending.clear();
      await w.terminate();
    }
  }
}

module.exports = { ShortcutWorkerClient };
