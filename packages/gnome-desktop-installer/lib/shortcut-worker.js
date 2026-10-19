'use strict';

const { parentPort, workerData } = require('worker_threads');
const { ShortcutManager } = require('./shortcut-manager');

const manager = new ShortcutManager(workerData || {});

if (parentPort) {
  parentPort.on('message', async (msg) => {
    const { id, action, args = [] } = msg || {};
    try {
      let result;
      switch (action) {
        case 'list-apps': {
          const apps = manager.discoverApps();
          result = {
            ok: true,
            apps,
            paths: {
              appsDir: manager.appsDir,
              desktopDir: manager.desktopDir,
              binDir: manager.binDir,
              iconsBaseDir: manager.iconsBaseDir,
              robosRoot: manager.robosRoot,
            },
          };
          break;
        }
        case 'install-app': {
          result = manager.installApp(args[0], args[1] || {});
          break;
        }
        case 'uninstall-app': {
          result = manager.uninstallApp(args[0], args[1] || {});
          break;
        }
        case 'set-desktop-shortcut': {
          result = manager.setDesktopShortcut(args[0], args[1]);
          break;
        }
        case 'set-dock-pinned': {
          result = manager.setDockPinned(args[0], args[1]);
          break;
        }
        case 'bulk-install': {
          result = await manager.bulkInstall(
            args[0],
            args[1] || {},
            (stepData) => {
              parentPort.postMessage({ id, type: 'progress', data: stepData });
            }
          );
          break;
        }
        case 'bulk-remove-desktop': {
          result = manager.bulkRemoveDesktopShortcuts(args[0]);
          break;
        }
        case 'refresh-caches': {
          const res = manager.refreshCaches();
          result = {
            ...res,
            apps: manager.discoverApps(),
          };
          break;
        }
        case 'get-details': {
          result = manager.getAppDetails(args[0]);
          break;
        }
        case 'launch-app': {
          result = manager.launchApp(args[0]);
          break;
        }
        default:
          throw new Error(`Unknown worker action: ${action}`);
      }
      parentPort.postMessage({ id, type: 'result', result });
    } catch (err) {
      parentPort.postMessage({
        id,
        type: 'error',
        error: err && err.message ? err.message : String(err),
      });
    }
  });
}
