'use strict';
const fs = require('node:fs');
const path = require('node:path');
const repo = path.resolve(__dirname, '../..'), manager = path.join(repo, 'packages/app-manager');
// One logo across platforms: Linux uses every size inside the Windows icon, named
// so the build places each in its hicolor size directory.
function linuxIcons(output) {
  const ico = fs.readFileSync(path.join(repo, 'scripts/windows/robos.ico'));
  const directory = path.join(output, 'linux-icons');
  fs.rmSync(directory, { recursive: true, force: true }); fs.mkdirSync(directory, { recursive: true });
  for (let index = 0; index < ico.readUInt16LE(4); index++) {
    const entry = 6 + index * 16, size = ico[entry] || 256, length = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
    fs.writeFileSync(path.join(directory, `${size}x${size}.png`), ico.subarray(offset, offset + length));
  }
  return directory;
}
function prepareApp(output) {
  const { createRequire } = require('node:module');
  const destination = path.join(output, 'app-source');
  fs.mkdirSync(destination, { recursive: true });
  for (const name of ['main.js', 'preload.js', 'lib', 'renderer', 'icon.svg', 'package.json']) {
    fs.cpSync(path.join(manager, name), path.join(destination, name), { recursive: true });
  }
  // Materialize dependencies rather than shipping pnpm links out of the app tree.
  // A nested layout also preserves different versions of transitive packages.
  function copyDependencies(source, target, ancestry = new Set()) {
    const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json')));
    const resolve = createRequire(path.join(source, 'package.json'));
    for (const name of Object.keys(pkg.dependencies || {})) {
      let dependency = path.dirname(resolve.resolve(name));
      while (!fs.existsSync(path.join(dependency, 'package.json')) || JSON.parse(fs.readFileSync(path.join(dependency, 'package.json'))).name !== name) {
        const parent = path.dirname(dependency); if (parent === dependency) throw new Error(`Cannot locate dependency ${name}`); dependency = parent;
      }
      dependency = fs.realpathSync(dependency);
      if (ancestry.has(dependency)) continue;
      const next = path.join(target, 'node_modules', name);
      fs.cpSync(dependency, next, { recursive: true, dereference: true, filter: file => path.basename(file) !== 'node_modules' });
      copyDependencies(dependency, next, new Set([...ancestry, dependency]));
    }
  }
  copyDependencies(manager, destination);
  fs.copyFileSync(path.join(linuxIcons(output), '256x256.png'), path.join(destination, 'icon.png'));
  return destination;
}
function configuration(output = path.join(repo, 'release/app-manager')) {
  fs.mkdirSync(output, { recursive: true });
  const png = fs.readFileSync(path.join(repo, 'packages/app-launcher/icon.png'));
  const header = Buffer.alloc(16); header.write('icns', 0); header.writeUInt32BE(png.length + 16, 4); header.write('ic08', 8); header.writeUInt32BE(png.length + 8, 12);
  const macIcon = path.join(output, 'app-manager.icns'); fs.writeFileSync(macIcon, Buffer.concat([header, png]));
  return { appId: 'com.rowbose.robos', productName: 'RobOS', electronVersion: '33.4.11',
    directories: { app: prepareApp(output), output }, npmRebuild: false, asar: true,
    files: ['main.js', 'preload.js', 'lib/**/*', 'renderer/**/*', 'icon.svg', 'icon.png', 'package.json', '!**/test/**'],
    win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: path.join(repo, 'scripts/windows/robos.ico'), executableName: 'RobOS' },
    nsis: { artifactName: 'RobOS-v${version}-Windows-Setup.${ext}', oneClick: false, perMachine: false, allowElevation: false,
      allowToChangeInstallationDirectory: true, createStartMenuShortcut: true, createDesktopShortcut: true, shortcutName: 'RobOS App Manager',
      deleteAppDataOnUninstall: false, include: path.join(__dirname, 'uninstall.nsh') },
    linux: { target: [{ target: 'deb', arch: ['x64'] }, { target: 'AppImage', arch: ['x64'] }], category: 'Utility', executableName: 'robos-app-manager',
      icon: linuxIcons(output), artifactName: 'RobOS-v${version}-Linux-x86_64.${ext}', maintainer: 'RobOS <noreply@rowbose.com>',
      synopsis: 'RobOS App Manager', description: 'Choose, download, launch and remove RobOS apps',
      desktop: { Name: 'RobOS App Manager', StartupWMClass: 'robos-app-manager', StartupNotify: 'true', Keywords: 'RobOS;' } },
    deb: { artifactName: 'RobOS-v${version}-Linux-amd64.${ext}', packageCategory: 'utils', recommends: ['libglib2.0-bin', 'pkexec'],
      afterInstall: path.join(__dirname, 'deb-after-install.sh'), afterRemove: path.join(__dirname, 'deb-after-remove.sh') },
    mac: { target: [{ target: 'dmg', arch: [process.arch] }], category: 'public.app-category.utilities',
      icon: macIcon, artifactName: 'RobOS-v${version}-macOS-${arch}.${ext}' },
  };
}
async function main() {
  const version = fs.readFileSync(path.join(repo, 'VERSION'), 'utf8').trim();
  if (require(path.join(manager, 'package.json')).version !== version) throw new Error('Manager version must match VERSION');
  const { build, Platform, Arch } = require(path.join(manager, 'node_modules/electron-builder'));
  await build({ config: configuration(), publish: 'never', ...(process.argv.includes('--linux') ? { targets: Platform.LINUX.createTarget(['deb', 'AppImage'], Arch.x64) } : {}) });
  // Enforce a small, stable base; suite payloads must never return to the installer.
  for (const file of fs.readdirSync(path.join(repo, 'release/app-manager')).filter(file => /\.(exe|AppImage|deb|dmg)$/.test(file))) {
    if (fs.statSync(path.join(repo, 'release/app-manager', file)).size > 150 * 1024 ** 2) throw new Error(`Base installer exceeded 150 MiB budget: ${file}`);
  }
}
module.exports = { configuration, prepareApp };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
