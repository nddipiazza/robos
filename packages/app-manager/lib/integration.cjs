'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ID } = require('./catalog.cjs');
const quoteShell = value => "'" + value.replace(/'/g, "'\\''") + "'";
const xml = value => value.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
function quoteDesktop(value) {
  // Desktop string escaping happens before Exec argument parsing.
  return '"' + value.replace(/%/g, '%%').replace(/\\/g, '\\\\\\\\').replace(/["`$]/g, '\\\\$&') + '"';
}
function integration({ locations, executable, host, packaged, shell, platform = process.platform }) {
  const baseArgs = packaged ? [] : [host];
  const command = args => [...baseArgs, ...args];
  function shortcut(item, remove = false) {
    if (!ID.test(item.id)) throw new Error('Invalid shortcut ID');
    if (platform === 'win32') {
      const dir = path.join(locations.shortcuts, item.id);
      if (remove) { fs.rmSync(dir, { recursive: true, force: true }); return; }
      fs.mkdirSync(dir, { recursive: true });
      const name = item.label.replace(/[<>:"/\\|?*]/g, '_');
      for (const [label, arg] of [[name, `--app=${item.id}`], [`Uninstall ${name}`, `--remove=${item.id}`]]) {
        // All generated arguments are fixed switches/validated IDs, plus a quoted dev host.
        const args = command([arg]).map(a => '"' + a.replace(/"/g, '\\"') + '"').join(' ');
        if (!shell.writeShortcutLink(path.join(dir, `${label}.lnk`), 'create', { target: executable, args,
          description: label, appUserModelId: `com.rowbose.robos.${item.id}`, icon: executable, iconIndex: 0 })) throw new Error('Could not create Start menu shortcut');
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
      fs.mkdirSync(locations.shortcuts, { recursive: true });
      const file = path.join(locations.shortcuts, `robos-managed-${item.id}.desktop`);
      if (remove) { fs.rmSync(file, { force: true }); return; }
      const exec = command([`--app=${item.id}`]).map(quoteDesktop);
      const icon = path.join(locations.root, 'packages', item.id, 'icon.svg');
      fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=${item.label}\nComment=RobOS application\nExec=${quoteDesktop(executable)} ${exec.join(' ')}\nIcon=${fs.existsSync(icon) ? icon : 'applications-other'}\nTerminal=false\nCategories=Utility;\nX-RobOS-App=true\nStartupWMClass=robos-${item.id}\nActions=Uninstall;\n\n[Desktop Action Uninstall]\nName=Uninstall ${item.label}\nExec=${[executable, ...command([`--remove=${item.id}`])].map(quoteDesktop).join(' ')}\n`, { mode: 0o755 });
    }
  }
  function removeAll() {
    if (platform === 'win32' || platform === 'darwin') fs.rmSync(locations.shortcuts, { recursive: true, force: true });
    else if (fs.existsSync(locations.shortcuts)) for (const file of fs.readdirSync(locations.shortcuts)) {
      if (/^robos-managed-[a-z0-9-]+\.desktop$/.test(file)) fs.rmSync(path.join(locations.shortcuts, file));
    }
  }
  function installManager(image) {
    if (platform === 'darwin') {
      if (image && path.resolve(image) !== locations.macManager) {
        fs.mkdirSync(path.dirname(locations.macManager), { recursive: true });
        fs.cpSync(image, locations.macManager, { recursive: true, verbatimSymlinks: true });
      }
      return;
    }
    if (platform !== 'linux' || !image) return;
    fs.mkdirSync(locations.data, { recursive: true });
    if (path.resolve(image) !== locations.image) { fs.copyFileSync(image, `${locations.image}.new`); fs.renameSync(`${locations.image}.new`, locations.image); }
    fs.chmodSync(locations.image, 0o755);
    fs.mkdirSync(locations.shortcuts, { recursive: true });
    fs.writeFileSync(path.join(locations.shortcuts, 'robos-app-manager.desktop'), `[Desktop Entry]\nType=Application\nName=RobOS App Manager\nExec=${quoteDesktop(locations.image)}\nIcon=system-software-install\nTerminal=false\nCategories=Utility;\n`, { mode: 0o755 });
  }
  return { shortcut, removeAll, installManager };
}
module.exports = { integration, quoteDesktop };
