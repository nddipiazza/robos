'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_DIR = path.resolve(__dirname, '../../../gnome-desktop-installer');
const {
  ShortcutManager,
  parseDesktopContent,
  normalizeRobOSCategory,
} = require('../../../gnome-desktop-installer/lib/shortcut-manager');
const { getIcon } = require('../../../robos-icons');
const { PORT_REGISTRY } = require('../../../robos-lib/snapshot-cli');

describe('RobOS GNOME Desktop App Installer', () => {
  describe('Package Structure & System Registration', () => {
    it('has valid package.json with required metadata', () => {
      const pkgPath = path.join(APP_DIR, 'package.json');
      assert.ok(fs.existsSync(pkgPath), 'package.json should exist');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      assert.strictEqual(pkg.name, 'robos-gnome-desktop-installer');
      assert.strictEqual(pkg.main, 'main.js');
    });

    it('has valid gnome-desktop-installer.desktop with X-RobOS-App=true', () => {
      const desktopPath = path.join(APP_DIR, 'gnome-desktop-installer.desktop');
      assert.ok(fs.existsSync(desktopPath), 'gnome-desktop-installer.desktop should exist');
      const content = fs.readFileSync(desktopPath, 'utf8');
      assert.ok(content.includes('X-RobOS-App=true'), 'Should have X-RobOS-App=true');
      assert.ok(content.includes('Name=RobOS GNOME Desktop Installer'), 'Should have Name');
      assert.ok(content.includes('X-RobOS-Category=System'), 'Should have X-RobOS-Category=System');
      assert.ok(content.includes('StartupWMClass=robos-gnome-desktop-installer'), 'Should have StartupWMClass');
    });

    it('has valid 48x48 SVG icon registered in robos-icons', () => {
      const iconPath = path.join(APP_DIR, 'icon.svg');
      assert.ok(fs.existsSync(iconPath), 'icon.svg should exist');
      const svg = fs.readFileSync(iconPath, 'utf8');
      assert.ok(svg.includes('<svg'), 'Should contain <svg');
      assert.ok(svg.includes('width="48"'), 'Should be 48px wide');
      assert.ok(svg.includes('height="48"'), 'Should be 48px high');

      const registeredIcon = getIcon('gnome-desktop-installer');
      assert.ok(registeredIcon, 'gnome-desktop-installer should be registered in robos-icons');
    });

    it('is registered in snapshot-cli PORT_REGISTRY on port 19201', () => {
      assert.strictEqual(PORT_REGISTRY['gnome-desktop-installer'], 19201);
    });

    it('is registered in Knowledge Graph applications/package.jsonld and packages.yaml', () => {
      const kgraphPath = path.resolve(__dirname, '../../../../.robos/kgraphs/applications/package.jsonld');
      const kgraphContent = fs.readFileSync(kgraphPath, 'utf8');
      assert.ok(
        kgraphContent.includes('urn:robos:desktop-app:gnome-desktop-installer'),
        'applications/package.jsonld should include gnome-desktop-installer'
      );

      const pkgsYamlPath = path.resolve(__dirname, '../../../../.robos/packages.yaml');
      const pkgsYaml = fs.readFileSync(pkgsYamlPath, 'utf8');
      assert.ok(
        pkgsYaml.includes('urn:robos:desktop-app:gnome-desktop-installer'),
        'packages.yaml should include gnome-desktop-installer'
      );
    });
  });

  describe('Main & Preload Modules', () => {
    it('main.js registers all required IPC handlers and QEMU flags', () => {
      const mainPath = path.join(APP_DIR, 'main.js');
      assert.ok(fs.existsSync(mainPath), 'main.js should exist');
      const content = fs.readFileSync(mainPath, 'utf8');
      assert.ok(content.includes('no-sandbox'), 'Should append no-sandbox');
      assert.ok(content.includes('disable-gpu'), 'Should append disable-gpu');
      assert.ok(content.includes('disable-dev-shm-usage'), 'Should append disable-dev-shm-usage');
      assert.ok(content.includes('gdi:list-apps'), 'Should handle gdi:list-apps');
      assert.ok(content.includes('gdi:install-app'), 'Should handle gdi:install-app');
      assert.ok(content.includes('gdi:uninstall-app'), 'Should handle gdi:uninstall-app');
      assert.ok(content.includes('gdi:set-desktop-shortcut'), 'Should handle gdi:set-desktop-shortcut');
      assert.ok(content.includes('gdi:set-dock-pinned'), 'Should handle gdi:set-dock-pinned');
      assert.ok(content.includes('gdi:bulk-install'), 'Should handle gdi:bulk-install');
      assert.ok(content.includes('gdi:bulk-remove-desktop'), 'Should handle gdi:bulk-remove-desktop');
      assert.ok(content.includes('gdi:refresh-caches'), 'Should handle gdi:refresh-caches');
    });

    it('preload.js exposes robosDesktopInstaller contextBridge APIs', () => {
      const preloadPath = path.join(APP_DIR, 'preload.js');
      assert.ok(fs.existsSync(preloadPath), 'preload.js should exist');
      const content = fs.readFileSync(preloadPath, 'utf8');
      assert.ok(content.includes('robosDesktopInstaller'), 'Should expose robosDesktopInstaller');
      assert.ok(content.includes('listApps:'), 'Should expose listApps');
      assert.ok(content.includes('installApp:'), 'Should expose installApp');
      assert.ok(content.includes('setDesktopShortcut:'), 'Should expose setDesktopShortcut');
      assert.ok(content.includes('setDockPinned:'), 'Should expose setDockPinned');
      assert.ok(content.includes('bulkInstall:'), 'Should expose bulkInstall');
      assert.ok(content.includes('bulkRemoveDesktop:'), 'Should expose bulkRemoveDesktop');
    });
  });

  describe('ShortcutManager Engine', () => {
    let tmpDir;
    let manager;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-gdi-test-'));
      manager = new ShortcutManager({
        homeDir: tmpDir,
        appsDir: path.join(tmpDir, '.local', 'share', 'applications'),
        systemAppsDir: path.join(tmpDir, 'system-applications'),
        desktopDir: path.join(tmpDir, 'Desktop'),
        binDir: path.join(tmpDir, '.local', 'bin'),
        iconsBaseDir: path.join(tmpDir, '.local', 'share', 'icons', 'hicolor'),
        pixmapsDir: path.join(tmpDir, '.local', 'share', 'pixmaps'),
        mockFavorites: ['org.gnome.Nautilus.desktop'],
        skipSystemCommands: true,
      });
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });

    it('discovers dozens of RobOS applications across packages/', () => {
      const apps = manager.discoverApps();
      assert.ok(Array.isArray(apps), 'discoverApps should return an array');
      assert.ok(apps.length >= 40, `Expected at least 40 RobOS apps, discovered ${apps.length}`);

      const ids = new Set(apps.map(a => a.appId));
      assert.ok(ids.has('gnome-desktop-installer'), 'Should discover gnome-desktop-installer');
      assert.ok(ids.has('dev-central'), 'Should discover dev-central');
      assert.ok(ids.has('audio-player'), 'Should discover audio-player');
      assert.ok(ids.has('home-speaker'), 'Should discover home-speaker');
      assert.ok(ids.has('tabletop-quest-editor'), 'Should discover tabletop-quest-editor');
    });

    it('installApp creates wrapper script, .desktop entry, and icons', () => {
      const res = manager.installApp('gnome-desktop-installer', {
        appMenu: true,
        desktopShortcut: false,
      });
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.app.appMenuInstalled, true);
      assert.strictEqual(res.app.wrapperInstalled, true);
      assert.strictEqual(res.app.iconInstalled, true);
      assert.strictEqual(res.app.desktopShortcutInstalled, false);

      const desktopContent = fs.readFileSync(res.app.userDesktopPath, 'utf8');
      const parsed = parseDesktopContent(desktopContent);
      assert.strictEqual(parsed.isRobOS, true);
      assert.strictEqual(parsed.icon, 'gnome-desktop-installer');
      assert.ok(parsed.exec.includes(res.app.wrapperPath));
    });

    it('setDesktopShortcut creates and removes executable ~/Desktop shortcut', () => {
      const enableRes = manager.setDesktopShortcut('dev-central', true);
      assert.strictEqual(enableRes.ok, true);
      assert.strictEqual(enableRes.app.desktopShortcutInstalled, true);
      assert.strictEqual(enableRes.app.desktopShortcutTrusted, true);
      assert.ok(fs.existsSync(enableRes.app.desktopShortcutPath));

      const stat = fs.statSync(enableRes.app.desktopShortcutPath);
      assert.ok(Boolean(stat.mode & 0o100), 'Desktop shortcut should have executable permission');

      const disableRes = manager.setDesktopShortcut('dev-central', false);
      assert.strictEqual(disableRes.ok, true);
      assert.strictEqual(disableRes.app.desktopShortcutInstalled, false);
      assert.ok(!fs.existsSync(disableRes.app.desktopShortcutPath));
    });

    it('setDockPinned pins and unpins app in GNOME Shell favorite-apps', () => {
      const pinRes = manager.setDockPinned('audio-player', true);
      assert.strictEqual(pinRes.ok, true);
      assert.strictEqual(pinRes.app.dockPinned, true);
      assert.ok(manager.getDockFavorites().includes('audio-player.desktop'));

      const unpinRes = manager.setDockPinned('audio-player', false);
      assert.strictEqual(unpinRes.ok, true);
      assert.strictEqual(unpinRes.app.dockPinned, false);
      assert.ok(!manager.getDockFavorites().includes('audio-player.desktop'));
    });

    it('bulkInstall installs multiple apps with progress callbacks and bulkRemoveDesktopShortcuts cleans up ~/Desktop', async () => {
      const progressSteps = [];
      const targetIds = ['dev-central', 'home-speaker', 'gnome-desktop-installer'];

      const bulkRes = await manager.bulkInstall(
        targetIds,
        { appMenu: true, desktopShortcut: true },
        (step) => progressSteps.push(step)
      );

      assert.strictEqual(bulkRes.ok, true);
      assert.strictEqual(bulkRes.succeeded, 3);
      assert.strictEqual(progressSteps.length, 3);

      for (const id of targetIds) {
        const app = bulkRes.apps.find(a => a.appId === id);
        assert.strictEqual(app.appMenuInstalled, true, `${id} should be in App Grid`);
        assert.strictEqual(app.desktopShortcutInstalled, true, `${id} should be on ~/Desktop`);
      }

      const rmRes = manager.bulkRemoveDesktopShortcuts(targetIds);
      assert.strictEqual(rmRes.ok, true);
      assert.strictEqual(rmRes.removed, 3);

      for (const id of targetIds) {
        const app = rmRes.apps.find(a => a.appId === id);
        assert.strictEqual(app.appMenuInstalled, true, `${id} should remain in App Grid`);
        assert.strictEqual(app.desktopShortcutInstalled, false, `${id} should be removed from ~/Desktop`);
      }
    });

    it('uninstallApp cleanly removes App Grid entry, Desktop shortcut, wrapper, and Dock pin', () => {
      manager.installApp('home-speaker', {
        appMenu: true,
        desktopShortcut: true,
        dockPin: true,
      });

      const uninst = manager.uninstallApp('home-speaker');
      assert.strictEqual(uninst.ok, true);
      assert.strictEqual(uninst.app.appMenuInstalled, false);
      assert.strictEqual(uninst.app.desktopShortcutInstalled, false);
      assert.strictEqual(uninst.app.wrapperInstalled, false);
      assert.strictEqual(uninst.app.dockPinned, false);
    });
  });

  describe('Renderer UI Assets', () => {
    it('index.html, style.css, and app.js exist and include core controls', () => {
      const html = fs.readFileSync(path.join(APP_DIR, 'renderer', 'index.html'), 'utf8');
      assert.ok(html.includes('id="btn-install-all-menu"'));
      assert.ok(html.includes('id="btn-add-all-desktop"'));
      assert.ok(html.includes('id="btn-remove-all-desktop"'));
      assert.ok(html.includes('id="apps-grid"'));

      const css = fs.readFileSync(path.join(APP_DIR, 'renderer', 'style.css'), 'utf8');
      assert.ok(css.includes('--bg-primary: #0d1117'));
      assert.ok(css.includes('--accent: #00bcd4'));

      const js = fs.readFileSync(path.join(APP_DIR, 'renderer', 'app.js'), 'utf8');
      assert.ok(js.includes('robosDesktopInstaller'));
      assert.ok(js.includes('bulkInstall'));
      assert.ok(js.includes('setDesktopShortcut'));
    });
  });
});
