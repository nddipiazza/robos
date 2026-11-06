'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ID } = require('./catalog.cjs');
const { gnome, MANAGER_ENTRY } = require('./gnome.cjs');
const { ensureAppIco } = require('./win-icon.cjs');
const quoteShell = value => "'" + value.replace(/'/g, "'\\''") + "'";
const xml = value => value.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
function quoteDesktop(value) {
  // Desktop string escaping happens before Exec argument parsing.
  return '"' + value.replace(/%/g, '%%').replace(/\\/g, '\\\\\\\\').replace(/["`$]/g, '\\\\$&') + '"';
}
// Desktop entry string values escape backslashes and line breaks.
const desktopValue = value => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n');
const MENU_CATEGORIES = { 'Everyday & business': 'Office', 'Games & game tools': 'Game', 'AI & agents': 'Development', 'Developer tools': 'Development', 'System & security': 'System' };
const managedEntry = id => `robos-managed-${id}.desktop`;
function integration({ locations, executable, host, packaged, shell, platform = process.platform, desktop = gnome() }) {
  const baseArgs = packaged ? [] : [host];
  const command = args => [...baseArgs, ...args];
  function shortcut(item, remove = false) {
    if (!ID.test(item.id)) throw new Error('Invalid shortcut ID');
    if (platform === 'win32') {
      const dir = path.join(locations.shortcuts, item.id);
      if (remove) { fs.rmSync(dir, { recursive: true, force: true }); return; }
      fs.mkdirSync(dir, { recursive: true });
      // Start menu search matches shortcut names, so every app is found by typing "RobOS".
      const name = (/^robos\b/i.test(item.label) ? item.label : `RobOS ${item.label}`).replace(/[<>:"/\\|?*]/g, '_');
      // A shortcut written under an older name would show up twice.
      for (const old of fs.readdirSync(dir)) if (old.endsWith('.lnk') && old !== `${name}.lnk` && old !== `Uninstall ${name}.lnk`) fs.rmSync(path.join(dir, old), { force: true });
      // The app's own icon, not the shared executable's (which would make every app look alike).
      const icon = ensureAppIco(path.join(locations.root, 'packages', item.id)) || executable;
      for (const [label, arg] of [[name, `--app=${item.id}`], [`Uninstall ${name}`, `--remove=${item.id}`]]) {
        // All generated arguments are fixed switches/validated IDs, plus a quoted dev host.
        const args = command([arg]).map(a => '"' + a.replace(/"/g, '\\"') + '"').join(' ');
        if (!shell.writeShortcutLink(path.join(dir, `${label}.lnk`), 'create', { target: executable, args,
          description: label, appUserModelId: `com.rowbose.robos.${item.id}`, icon, iconIndex: 0 })) throw new Error('Could not create Start menu shortcut');
      }
    } else if (platform === 'darwin') {
      const bundle = path.join(locations.shortcuts, `${item.id}.app`);
      if (remove) { fs.rmSync(bundle, { recursive: true, force: true }); return; }
      fs.mkdirSync(path.join(bundle, 'Contents/MacOS'), { recursive: true });
      fs.mkdirSync(path.join(bundle, 'Contents/Resources'), { recursive: true });
      fs.writeFileSync(path.join(bundle, 'Contents/Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleName</key><string>${xml(item.label)}</string><key>CFBundleDisplayName</key><string>${xml(item.label)}</string><key>CFBundleIdentifier</key><string>com.rowbose.robos.${item.id}</string><key>CFBundleExecutable</key><string>launch</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleIconFile</key><string>icon.icns</string></dict></plist>\n`);
      fs.writeFileSync(path.join(bundle, 'Contents/MacOS/launch'), `#!/bin/sh\nexec ${[executable, ...command([`--app=${item.id}`])].map(quoteShell).join(' ')} "$@"\n`, { mode: 0o755 });
      const icon = path.resolve(path.dirname(executable), '../Resources/icon.icns');
      if (fs.existsSync(icon)) fs.copyFileSync(icon, path.join(bundle, 'Contents/Resources/icon.icns'));
    } else {
      const entry = managedEntry(item.id);
      if (remove) {
        fs.rmSync(path.join(locations.shortcuts, entry), { force: true });
        desktop.unpin(pinned => pinned === entry); desktop.removeFromFolder(entry);
        return;
      }
      writeEntry(item);
      desktop.addToFolder(entry);
    }
  }
  // Rewrites an app's menu entry only, so startup keeps any app the user moved out of the folder.
  function writeEntry(item) {
    fs.mkdirSync(locations.shortcuts, { recursive: true });
    const exec = command([`--app=${item.id}`]).map(quoteDesktop);
    const installed = path.join(locations.root, 'packages', item.id);
    const icon = ['icon.svg', 'icon.png'].map(name => path.join(installed, name)).find(fs.existsSync) || 'application-x-executable';
    // StartupWMClass is what ties a running window to this entry's dock icon; app-host
    // guarantees the window carries it. TryExec hides the entry if RobOS itself is removed.
    fs.writeFileSync(path.join(locations.shortcuts, managedEntry(item.id)), `[Desktop Entry]\nVersion=1.5\nType=Application\nName=${desktopValue(item.label)}\nComment=${desktopValue(item.description || 'RobOS application')}\nTryExec=${desktopValue(executable)}\nExec=${quoteDesktop(executable)} ${exec.join(' ')}\nIcon=${desktopValue(icon)}\nTerminal=false\nStartupNotify=true\nStartupWMClass=robos-${item.id}\nCategories=${MENU_CATEGORIES[item.group] || 'Utility'};\nKeywords=RobOS;\nX-RobOS-App=true\nActions=Uninstall;\n\n[Desktop Action Uninstall]\nName=Uninstall ${desktopValue(item.label)}\nExec=${[executable, ...command([`--remove=${item.id}`])].map(quoteDesktop).join(' ')}\n`, { mode: 0o755 });
  }
  function removeAll() {
    if (platform === 'win32' || platform === 'darwin') fs.rmSync(locations.shortcuts, { recursive: true, force: true });
    else if (fs.existsSync(locations.shortcuts)) for (const file of fs.readdirSync(locations.shortcuts)) {
      if (/^robos-managed-[a-z0-9-]+\.desktop$/.test(file)) fs.rmSync(path.join(locations.shortcuts, file));
    }
    if (platform !== 'win32' && platform !== 'darwin') { desktop.unpin(entry => entry.startsWith('robos-managed-')); desktop.removeFolder(); }
  }
  // The dock pin happens once, so a user who later unpins RobOS is not overruled.
  function pinManager() {
    if (platform !== 'linux') return;
    const marker = path.join(locations.data, 'dock-pinned');
    if (fs.existsSync(marker) || !desktop.pin(MANAGER_ENTRY)) return;
    fs.mkdirSync(locations.data, { recursive: true }); fs.writeFileSync(marker, '');
  }
  // An AppImage copy from an earlier install must not shadow the system package.
  function adoptSystemManager() {
    fs.rmSync(path.join(locations.shortcuts, MANAGER_ENTRY), { force: true });
    fs.rmSync(locations.image, { force: true });
    fs.rmSync(path.join(locations.data, 'robos-app-manager.png'), { force: true });
  }
  function removeManager() {
    adoptSystemManager();
    desktop.unpin(entry => entry === MANAGER_ENTRY);
    fs.rmSync(path.join(locations.data, 'dock-pinned'), { force: true });
  }
  function installManager(image) {
    if (platform === 'darwin') {
      if (image && path.resolve(image) !== locations.macManager) {
        fs.mkdirSync(path.dirname(locations.macManager), { recursive: true });
        // Electron's fs treats app.asar as a folder, which fails the copy with ENOTDIR.
        const staging = `${locations.macManager}.installing`, asar = process.noAsar;
        process.noAsar = true;
        try {
          fs.rmSync(staging, { recursive: true, force: true });
          fs.cpSync(image, staging, { recursive: true, verbatimSymlinks: true });
          fs.rmSync(locations.macManager, { recursive: true, force: true });
          fs.renameSync(staging, locations.macManager);
        } finally { process.noAsar = asar; }
      }
      return;
    }
    if (platform !== 'linux' || !image) return;
    fs.mkdirSync(locations.data, { recursive: true });
    if (path.resolve(image) !== locations.image) { fs.copyFileSync(image, `${locations.image}.new`); fs.renameSync(`${locations.image}.new`, locations.image); }
    fs.chmodSync(locations.image, 0o755);
    fs.mkdirSync(locations.shortcuts, { recursive: true });
    // Desktop shells cannot read icons from inside the AppImage's archive.
    const icon = path.join(locations.data, 'robos-app-manager.png');
    fs.copyFileSync(path.join(__dirname, '../icon.png'), icon);
    fs.writeFileSync(path.join(locations.shortcuts, MANAGER_ENTRY), `[Desktop Entry]\nVersion=1.5\nType=Application\nName=RobOS App Manager\nComment=Choose, download, launch and remove RobOS apps\nTryExec=${desktopValue(locations.image)}\nExec=${quoteDesktop(locations.image)}\nIcon=${desktopValue(icon)}\nTerminal=false\nStartupNotify=true\nStartupWMClass=robos-app-manager\nCategories=Utility;\nKeywords=RobOS;\n`, { mode: 0o755 });
  }
  return { shortcut, writeEntry, removeAll, installManager, pinManager, adoptSystemManager, removeManager };
}
module.exports = { integration, quoteDesktop };
