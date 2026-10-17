'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

// Load builtin icons registry if available
let BUILTIN_APPS = [];
try {
  const iconsMod = require('../../robos-icons');
  BUILTIN_APPS = iconsMod.BUILTIN_APPS || [];
} catch {
  try {
    const iconsMod = require('/usr/local/share/robos/robos-icons');
    BUILTIN_APPS = iconsMod.BUILTIN_APPS || [];
  } catch {}
}

// Non-GUI / library / daemon packages to exclude when scanning packages/ without X-RobOS-App=true
const NON_GUI_PACKAGES = new Set([
  'robos-lib',
  'robos-icons',
  'robos-test',
  'robos-cli',
  'robos-agentd',
  'robos-profiled',
  'robos-mcp-lib',
  'robos-mcp-router',
  'robos-agent-session',
  'robos-agent-client',
  'robos-action-registry',
  'robos-adapters',
  'robos-event-bus',
  'robos-rule-engine',
  'robos-scheduler',
  'robos-store',
  'robos-task-client',
  'robos-ui',
  'robos-reviewer',
  'claude-autoconfig',
  'agent-autoconfig',
  'barista-order-api',
  'payment-gateway-api',
  'pulse-metrics-cli',
]);

const DEFAULT_FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 9h6v6H9z"/></svg>`;

const CATEGORY_TO_FREEDESKTOP = {
  'Dev': 'Development;Utility;',
  'Development': 'Development;Utility;',
  'RobOS Dev': 'Development;Utility;',
  'AI': 'Development;Science;ArtificialIntelligence;',
  'RobOS AI': 'Development;Science;ArtificialIntelligence;',
  'Security': 'Security;System;Utility;',
  'RobOS Security': 'Security;System;Utility;',
  'People': 'Office;ContactManagement;Utility;',
  'Journal': 'Office;Utility;',
  'System': 'System;Settings;Utility;',
  'RobOS System': 'System;Settings;Utility;',
  'Internet': 'Network;WebBrowser;',
  'Tools': 'Utility;Development;',
  'Game Development': 'Development;Game;RolePlaying;',
  'Games': 'Game;RolePlaying;',
  'Education': 'Education;Development;',
  'Auto': 'Utility;Office;',
};

function normalizeRobOSCategory(cat) {
  if (!cat) return 'System';
  const c = cat.replace(/^RobOS\s+/i, '').trim();
  if (c === 'Development') return 'Dev';
  if (c === 'Games') return 'Game Development';
  return c;
}

function parseDesktopContent(content, filePath = '') {
  const lines = String(content || '').split('\n');
  let inEntry = false;
  const entry = { path: filePath };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '[Desktop Entry]') {
      inEntry = true;
      continue;
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      inEntry = false;
      continue;
    }
    if (!inEntry || !trimmed.includes('=')) continue;

    const eqIdx = trimmed.indexOf('=');
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();

    switch (key) {
      case 'Name': entry.name = entry.name || val; break;
      case 'GenericName': entry.genericName = val; break;
      case 'Comment': entry.comment = entry.comment || val; break;
      case 'Exec': entry.exec = val; break;
      case 'Icon': entry.icon = val; break;
      case 'Path': entry.workDir = val; break;
      case 'Terminal': entry.terminal = val === 'true'; break;
      case 'Categories': entry.categories = val; break;
      case 'Keywords': entry.keywords = val; break;
      case 'StartupWMClass': entry.wmClass = val; break;
      case 'X-RobOS-App': entry.isRobOS = val === 'true'; break;
      case 'X-RobOS-Category': entry.robosCategory = val; break;
      case 'NoDisplay': entry.noDisplay = val === 'true'; break;
    }
  }
  return entry;
}

function humanizeAppId(appId) {
  return appId
    .replace(/^robos-/, '')
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

class ShortcutManager {
  constructor(options = {}) {
    const home = options.homeDir || os.homedir();
    const xdgDataHome = options.xdgDataHome || process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');

    this.homeDir = home;
    this.robosRoot = options.robosRoot || path.resolve(__dirname, '..', '..', '..');
    this.packagesDir = options.packagesDir || path.join(this.robosRoot, 'packages');
    this.systemRobosDir = options.systemRobosDir || '/usr/local/share/robos';
    this.appsDir = options.appsDir || path.join(xdgDataHome, 'applications');
    this.systemAppsDir = options.systemAppsDir || '/usr/share/applications';
    this.desktopDir = options.desktopDir || process.env.XDG_DESKTOP_DIR || path.join(home, 'Desktop');
    this.binDir = options.binDir || path.join(home, '.local', 'bin');
    this.iconsBaseDir = options.iconsBaseDir || path.join(xdgDataHome, 'icons', 'hicolor');
    this.pixmapsDir = options.pixmapsDir || path.join(xdgDataHome, 'pixmaps');
    this.installScriptPath = options.installScriptPath || path.join(
      this.robosRoot, 'plugins', 'robos', 'skills', 'install-desktop-app', 'scripts', 'install-desktop-app.sh'
    );
    // Optional mock/override for gsettings favorites in tests
    this._mockFavorites = options.mockFavorites || null;
    this.skipSystemCommands = Boolean(options.skipSystemCommands);
  }

  /**
   * Read current GNOME Shell dock favorite apps list.
   */
  getDockFavorites() {
    if (Array.isArray(this._mockFavorites)) {
      return [...this._mockFavorites];
    }
    if (this.skipSystemCommands) return [];
    try {
      const raw = cp.execSync('gsettings get org.gnome.shell favorite-apps', {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (!raw || raw === '[]' || raw.startsWith('@as []')) return [];
      const matches = [...raw.matchAll(/['"]([^'"]+\.desktop)['"]/g)];
      return matches.map(m => m[1]);
    } catch {
      return [];
    }
  }

  /**
   * Write GNOME Shell dock favorite apps list.
   */
  setDockFavoritesList(favorites) {
    const unique = [...new Set(favorites)];
    if (Array.isArray(this._mockFavorites)) {
      this._mockFavorites = unique;
      return { ok: true, favorites: unique };
    }
    if (this.skipSystemCommands) {
      return { ok: true, favorites: unique };
    }
    try {
      const formatted = unique.length === 0
        ? '[]'
        : `[${unique.map(f => `'${f}'`).join(', ')}]`;
      cp.execSync(`gsettings set org.gnome.shell favorite-apps "${formatted}"`, {
        encoding: 'utf8',
        timeout: 4000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return { ok: true, favorites: unique };
    } catch (err) {
      return { ok: false, error: err.message, favorites: unique };
    }
  }

  /**
   * Check whether a Desktop shortcut has GIO metadata::trusted set.
   */
  isDesktopShortcutTrusted(shortcutPath) {
    if (!fs.existsSync(shortcutPath)) return false;
    try {
      const st = fs.statSync(shortcutPath);
      const isExec = Boolean(st.mode & 0o100);
      if (this.skipSystemCommands) return isExec;
      try {
        const info = cp.execSync(`gio info "${shortcutPath}"`, {
          encoding: 'utf8',
          timeout: 2500,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        if (info.includes('metadata::trusted: true') || info.includes('metadata::trusted: yes')) {
          return true;
        }
      } catch {
        // Fallback to executable bit check if gio is unavailable or in headless environment
      }
      return isExec;
    } catch {
      return false;
    }
  }

  /**
   * Detect StartupWMClass for an app package directory.
   */
  detectWMClass(packageDir, appId, desktopEntry) {
    if (desktopEntry && desktopEntry.wmClass) return desktopEntry.wmClass;
    if (packageDir && fs.existsSync(path.join(packageDir, 'main.js'))) {
      try {
        const mainCode = fs.readFileSync(path.join(packageDir, 'main.js'), 'utf8');
        const m = mainCode.match(/app\.setName\(['"]([^'"]+)['"]\)/);
        if (m && m[1]) return m[1];
      } catch {}
    }
    if (packageDir && fs.existsSync(path.join(packageDir, 'package.json'))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
        if (pkg.name) return pkg.name;
      } catch {}
    }
    return appId.startsWith('robos-') ? appId : `robos-${appId}`;
  }

  /**
   * Resolve SVG icon content for an app.
   */
  resolveIconSvg(appId, packageName, packageDir) {
    if (packageDir) {
      const pkgSvg = path.join(packageDir, 'icon.svg');
      if (fs.existsSync(pkgSvg)) {
        try { return fs.readFileSync(pkgSvg, 'utf8'); } catch {}
      }
    }
    const builtin = BUILTIN_APPS.find(
      a => a.appId === appId || a.appId === packageName || `robos-${a.appId}` === appId
    );
    if (builtin && builtin.iconSvg) return builtin.iconSvg;

    const installedSvg = path.join(this.iconsBaseDir, 'scalable', 'apps', `${appId}.svg`);
    if (fs.existsSync(installedSvg)) {
      try { return fs.readFileSync(installedSvg, 'utf8'); } catch {}
    }

    return DEFAULT_FALLBACK_SVG;
  }

  /**
   * Discover all RobOS applications across workspace packages, system directories, and built-in registry.
   */
  discoverApps() {
    const appsMap = new Map();
    const dockFavorites = new Set(this.getDockFavorites());

    const builtinById = new Map();
    for (const b of BUILTIN_APPS) {
      builtinById.set(b.appId, b);
    }

    // 1. Scan packagesDir (e.g. /home/ndipiazza/source/robos/packages)
    if (fs.existsSync(this.packagesDir)) {
      const pkgDirs = fs.readdirSync(this.packagesDir).sort();
      for (const pkgName of pkgDirs) {
        if (NON_GUI_PACKAGES.has(pkgName) || pkgName.endsWith('-mcp')) continue;
        const pkgPath = path.join(this.packagesDir, pkgName);
        let stat;
        try { stat = fs.statSync(pkgPath); } catch { continue; }
        if (!stat.isDirectory()) continue;

        const files = fs.readdirSync(pkgPath);
        const desktopFiles = files.filter(f => f.endsWith('.desktop')).sort();

        if (desktopFiles.length > 0) {
          for (const df of desktopFiles) {
            const dfPath = path.join(pkgPath, df);
            let parsed = {};
            try {
              parsed = parseDesktopContent(fs.readFileSync(dfPath, 'utf8'), dfPath);
            } catch { continue; }

            const appId = df.replace(/\.desktop$/, '');
            const builtin = builtinById.get(appId) || builtinById.get(pkgName);
            const rawName = parsed.name || (builtin ? `RobOS ${builtin.label}` : `RobOS ${humanizeAppId(appId)}`);
            const label = rawName.replace(/^RobOS\s+/i, '');
            const category = normalizeRobOSCategory(parsed.robosCategory || (builtin && builtin.category) || 'System');
            const freedesktopCategories = parsed.categories || CATEGORY_TO_FREEDESKTOP[category] || 'Utility;Development;';
            const wmClass = this.detectWMClass(pkgPath, appId, parsed);
            const iconSvg = this.resolveIconSvg(appId, pkgName, pkgPath);

            appsMap.set(appId, this._buildAppRecord({
              appId,
              packageName: pkgName,
              packageDir: pkgPath,
              name: rawName,
              label,
              comment: parsed.comment || `${rawName} desktop application`,
              category,
              freedesktopCategories,
              wmClass,
              iconSvg,
              sourceDesktopFile: dfPath,
              dockFavorites,
            }));
          }
        } else if (files.includes('main.js') && files.includes('package.json')) {
          // Check if it's an Electron GUI app without a .desktop file yet
          let pkgJson = {};
          try {
            pkgJson = JSON.parse(fs.readFileSync(path.join(pkgPath, 'package.json'), 'utf8'));
          } catch {}
          const deps = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) };
          if (!deps.electron) continue;

          const appId = pkgName;
          const builtin = builtinById.get(appId);
          const label = builtin ? builtin.label : humanizeAppId(appId);
          const rawName = label.startsWith('RobOS') ? label : `RobOS ${label}`;
          const category = normalizeRobOSCategory((builtin && builtin.category) || 'Dev');
          const freedesktopCategories = CATEGORY_TO_FREEDESKTOP[category] || 'Utility;Development;';
          const wmClass = this.detectWMClass(pkgPath, appId, null);
          const iconSvg = this.resolveIconSvg(appId, pkgName, pkgPath);

          appsMap.set(appId, this._buildAppRecord({
            appId,
            packageName: pkgName,
            packageDir: pkgPath,
            name: rawName,
            label: label.replace(/^RobOS\s+/i, ''),
            comment: pkgJson.description || `${rawName} desktop application`,
            category,
            freedesktopCategories,
            wmClass,
            iconSvg,
            sourceDesktopFile: null,
            dockFavorites,
          }));
        }
      }
    }

    // 2. Also check installed ~/.local/share/applications and /usr/share/applications for any extra X-RobOS-App=true entries (e.g. robos-crpg)
    for (const dir of [this.appsDir, this.systemAppsDir]) {
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir).sort()) {
        if (!file.endsWith('.desktop')) continue;
        const appId = file.replace(/\.desktop$/, '');
        if (appsMap.has(appId)) continue;

        const fullPath = path.join(dir, file);
        let parsed;
        try {
          parsed = parseDesktopContent(fs.readFileSync(fullPath, 'utf8'), fullPath);
        } catch { continue; }
        if (!parsed.isRobOS || !parsed.name) continue;

        const pkgDir = parsed.workDir && fs.existsSync(parsed.workDir)
          ? parsed.workDir
          : (fs.existsSync(path.join(this.packagesDir, appId)) ? path.join(this.packagesDir, appId) : null);
        const category = normalizeRobOSCategory(parsed.robosCategory || 'System');
        const iconSvg = this.resolveIconSvg(appId, appId, pkgDir);

        appsMap.set(appId, this._buildAppRecord({
          appId,
          packageName: appId,
          packageDir: pkgDir,
          name: parsed.name,
          label: parsed.name.replace(/^RobOS\s+/i, ''),
          comment: parsed.comment || '',
          category,
          freedesktopCategories: parsed.categories || CATEGORY_TO_FREEDESKTOP[category] || 'Utility;',
          wmClass: parsed.wmClass || appId,
          iconSvg,
          sourceDesktopFile: fullPath,
          customExec: parsed.exec,
          dockFavorites,
        }));
      }
    }

    return Array.from(appsMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  _buildAppRecord(info) {
    const {
      appId,
      packageName,
      packageDir,
      name,
      label,
      comment,
      category,
      freedesktopCategories,
      wmClass,
      iconSvg,
      sourceDesktopFile,
      customExec,
      dockFavorites,
    } = info;

    const userDesktopPath = path.join(this.appsDir, `${appId}.desktop`);
    const systemDesktopPath = path.join(this.systemAppsDir, `${appId}.desktop`);
    const desktopShortcutPath = path.join(this.desktopDir, `${appId}.desktop`);
    const wrapperPath = path.join(this.binDir, appId);
    const scalableIconPath = path.join(this.iconsBaseDir, 'scalable', 'apps', `${appId}.svg`);
    const png256IconPath = path.join(this.iconsBaseDir, '256x256', 'apps', `${appId}.png`);

    const appMenuInstalled = fs.existsSync(userDesktopPath);
    const systemMenuInstalled = fs.existsSync(systemDesktopPath);
    const desktopShortcutInstalled = fs.existsSync(desktopShortcutPath);
    const desktopShortcutTrusted = desktopShortcutInstalled
      ? this.isDesktopShortcutTrusted(desktopShortcutPath)
      : false;
    const wrapperInstalled = fs.existsSync(wrapperPath);
    const iconInstalled = fs.existsSync(scalableIconPath) || fs.existsSync(png256IconPath);
    const dockPinned = dockFavorites.has(`${appId}.desktop`);

    return {
      appId,
      packageName,
      packageDir,
      name,
      label,
      comment,
      category,
      freedesktopCategories,
      wmClass,
      iconSvg,
      sourceDesktopFile,
      customExec: customExec || null,
      userDesktopPath,
      systemDesktopPath,
      desktopShortcutPath,
      wrapperPath,
      appMenuInstalled,
      systemMenuInstalled,
      desktopShortcutInstalled,
      desktopShortcutTrusted,
      wrapperInstalled,
      iconInstalled,
      dockPinned,
    };
  }

  /**
   * Build the executable wrapper script content for `~/.local/bin/<appId>`.
   */
  generateWrapperScript(app) {
    const pkgDir = app.packageDir || path.join(this.packagesDir, app.packageName || app.appId);
    const sysDir = path.join(this.systemRobosDir, app.packageName || app.appId);

    if (app.customExec && !app.packageDir) {
      const cleanExec = app.customExec.replace(/\s+%[uUfF]\s*$/, '');
      return [
        '#!/usr/bin/env bash',
        'set -e',
        `exec ${cleanExec} "$@"`,
        '',
      ].join('\n');
    }

    return [
      '#!/usr/bin/env bash',
      'set -e',
      '',
      `ROBOS_ROOT="${this.robosRoot}"`,
      `if [ -d "${pkgDir}" ]; then`,
      `  APP_DIR="${pkgDir}"`,
      `elif [ -d "${sysDir}" ]; then`,
      `  APP_DIR="${sysDir}"`,
      'else',
      `  echo "Error: RobOS app directory not found for ${app.appId}" >&2`,
      '  exit 1',
      'fi',
      '',
      '# Locate Electron binary across local package, shared workspace packages, or system',
      'if [ -x "$APP_DIR/node_modules/.bin/electron" ]; then',
      '  ELECTRON_BIN="$APP_DIR/node_modules/.bin/electron"',
      'elif [ -x "$ROBOS_ROOT/packages/app-launcher/node_modules/.bin/electron" ]; then',
      '  ELECTRON_BIN="$ROBOS_ROOT/packages/app-launcher/node_modules/.bin/electron"',
      'elif [ -x "$ROBOS_ROOT/packages/robos-test/node_modules/.bin/electron" ]; then',
      '  ELECTRON_BIN="$ROBOS_ROOT/packages/robos-test/node_modules/.bin/electron"',
      'elif [ -x "$ROBOS_ROOT/packages/crpg-editor/node_modules/.bin/electron" ]; then',
      '  ELECTRON_BIN="$ROBOS_ROOT/packages/crpg-editor/node_modules/.bin/electron"',
      'elif [ -x "$ROBOS_ROOT/packages/robos-tabletop/node_modules/.bin/electron" ]; then',
      '  ELECTRON_BIN="$ROBOS_ROOT/packages/robos-tabletop/node_modules/.bin/electron"',
      'elif command -v electron >/dev/null 2>&1; then',
      '  ELECTRON_BIN="$(command -v electron)"',
      'elif [ -x "/usr/bin/electron" ]; then',
      '  ELECTRON_BIN="/usr/bin/electron"',
      'else',
      '  echo "Error: Electron binary not found." >&2',
      '  exit 1',
      'fi',
      '',
      'cd "$APP_DIR"',
      'exec "$ELECTRON_BIN" "$APP_DIR" --no-sandbox --disable-gpu --disable-dev-shm-usage "$@"',
      '',
    ].join('\n');
  }

  /**
   * Build the FreeDesktop 1.5 `.desktop` file content for an app.
   */
  generateDesktopEntry(app) {
    const wrapperPath = path.join(this.binDir, app.appId);
    const workDir = app.packageDir || path.join(this.packagesDir, app.packageName || app.appId);
    let categories = app.freedesktopCategories || 'Utility;Development;';
    if (!categories.endsWith(';')) categories += ';';

    const keywords = [
      'robos',
      app.appId,
      ...(app.label || '').toLowerCase().split(/\s+/),
      (app.category || '').toLowerCase(),
    ].filter(Boolean);
    const uniqueKeywords = [...new Set(keywords)].join(';') + ';';

    const lines = [
      '[Desktop Entry]',
      'Version=1.5',
      'Type=Application',
      `Name=${app.name}`,
      `GenericName=${app.label}`,
      `Comment=${app.comment || app.name}`,
      `Exec=${wrapperPath} %U`,
      `Icon=${app.appId}`,
    ];
    if (workDir && fs.existsSync(workDir)) {
      lines.push(`Path=${workDir}`);
    }
    lines.push(
      'Terminal=false',
      `Categories=${categories}`,
      `Keywords=${uniqueKeywords}`,
      `StartupWMClass=${app.wmClass || `robos-${app.appId}`}`,
      'StartupNotify=true',
      'X-RobOS-App=true',
      `X-RobOS-Category=${app.category || 'System'}`,
      ''
    );
    return lines.join('\n');
  }

  /**
   * Install SVG and multi-scale PNG icons for an app and its StartupWMClass alias.
   */
  installAppIcons(app) {
    const aliases = [app.appId];
    if (app.wmClass && app.wmClass !== app.appId && !app.wmClass.includes(' ')) {
      aliases.push(app.wmClass);
    }

    const svgContent = app.iconSvg || DEFAULT_FALLBACK_SVG;
    const scalableDir = path.join(this.iconsBaseDir, 'scalable', 'apps');
    fs.mkdirSync(scalableDir, { recursive: true });
    fs.mkdirSync(this.pixmapsDir, { recursive: true });

    // Ensure packageDir has icon.svg if writable
    let sourceSvgPath = null;
    if (app.packageDir && fs.existsSync(app.packageDir)) {
      const pkgIconSvg = path.join(app.packageDir, 'icon.svg');
      if (!fs.existsSync(pkgIconSvg)) {
        try { fs.writeFileSync(pkgIconSvg, svgContent, 'utf8'); } catch {}
      }
      if (fs.existsSync(pkgIconSvg)) {
        sourceSvgPath = pkgIconSvg;
      }
    }

    for (const alias of aliases) {
      const targetSvg = path.join(scalableDir, `${alias}.svg`);
      fs.writeFileSync(targetSvg, svgContent, 'utf8');
      fs.chmodSync(targetSvg, 0o644);

      const pixmapSvg = path.join(this.pixmapsDir, `${alias}.svg`);
      fs.writeFileSync(pixmapSvg, svgContent, 'utf8');
      fs.chmodSync(pixmapSvg, 0o644);
      if (!sourceSvgPath) sourceSvgPath = targetSvg;
    }

    // Rasterize multi-scale PNGs if not in skipSystemCommands mode
    if (!this.skipSystemCommands && sourceSvgPath) {
      const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
      for (const s of sizes) {
        fs.mkdirSync(path.join(this.iconsBaseDir, `${s}x${s}`, 'apps'), { recursive: true });
      }
      const pyScript = [
        'import gi, sys, shutil',
        "gi.require_version('GdkPixbuf', '2.0')",
        'from gi.repository import GdkPixbuf',
        'svg_path = sys.argv[1]',
        'icons_base = sys.argv[2]',
        'pixmaps_dir = sys.argv[3]',
        'pkg_dir = sys.argv[4]',
        'aliases = sys.argv[5:]',
        'for s in [16, 24, 32, 48, 64, 128, 256, 512]:',
        '    pix = GdkPixbuf.Pixbuf.new_from_file_at_scale(svg_path, s, s, True)',
        '    for idx, alias in enumerate(aliases):',
        '        out = f"{icons_base}/{s}x{s}/apps/{alias}.png"',
        '        pix.savev(out, "png", [], [])',
        '        if s == 256:',
        '            pix.savev(f"{pixmaps_dir}/{alias}.png", "png", [], [])',
        '            if idx == 0 and pkg_dir:',
        '                try: pix.savev(f"{pkg_dir}/icon.png", "png", [], [])',
        '                except Exception: pass',
      ].join('\n');

      try {
        cp.execFileSync(
          'python3',
          ['-c', pyScript, sourceSvgPath, this.iconsBaseDir, this.pixmapsDir, app.packageDir || '', ...aliases],
          { timeout: 6000, stdio: 'ignore' }
        );
      } catch {
        // Fallback: non-fatal if GdkPixbuf is unavailable
      }
    }

    return { ok: true, aliases };
  }

  /**
   * Install or update a single app's GNOME desktop integration.
   */
  installApp(appId, options = {}) {
    const app = options._preloadedApp || this.discoverApps().find(a => a.appId === appId);
    if (!app) {
      return { ok: false, appId, error: `Unknown RobOS application: ${appId}` };
    }

    const installAppMenu = options.appMenu !== undefined ? Boolean(options.appMenu) : true;
    const createDesktopShortcut = options.desktopShortcut !== undefined
      ? Boolean(options.desktopShortcut)
      : app.desktopShortcutInstalled;
    const pinDock = options.dockPin !== undefined ? Boolean(options.dockPin) : undefined;
    const refreshCaches = options.refreshCaches !== undefined ? Boolean(options.refreshCaches) : true;

    try {
      // 1. Write executable wrapper in ~/.local/bin/<appId>
      fs.mkdirSync(this.binDir, { recursive: true });
      const wrapperContent = this.generateWrapperScript(app);
      const wrapperPath = path.join(this.binDir, app.appId);
      fs.writeFileSync(wrapperPath, wrapperContent, 'utf8');
      fs.chmodSync(wrapperPath, 0o755);

      // 2. Install SVG + multi-scale PNG icons
      this.installAppIcons(app);

      // 3. Write .desktop file to ~/.local/share/applications/<appId>.desktop
      const desktopContent = this.generateDesktopEntry(app);
      const userDesktopPath = path.join(this.appsDir, `${app.appId}.desktop`);
      if (installAppMenu) {
        fs.mkdirSync(this.appsDir, { recursive: true });
        fs.writeFileSync(userDesktopPath, desktopContent, 'utf8');
        fs.chmodSync(userDesktopPath, 0o644);
      }

      // 4. Handle ~/Desktop/<appId>.desktop shortcut + GIO trust
      const desktopShortcutPath = path.join(this.desktopDir, `${app.appId}.desktop`);
      if (createDesktopShortcut) {
        fs.mkdirSync(this.desktopDir, { recursive: true });
        fs.writeFileSync(desktopShortcutPath, desktopContent, 'utf8');
        fs.chmodSync(desktopShortcutPath, 0o755);
        this._trustDesktopShortcut(desktopShortcutPath);
      } else if (options.desktopShortcut === false && fs.existsSync(desktopShortcutPath)) {
        try { fs.unlinkSync(desktopShortcutPath); } catch {}
      }

      // 5. Handle GNOME Shell Dock favorite pinning if requested
      if (pinDock !== undefined) {
        this.setDockPinned(app.appId, pinDock);
      }

      // 6. Refresh GTK icon cache & desktop database if requested
      if (refreshCaches) {
        this.refreshCaches();
      }

      const updated = options._skipRediscover
        ? {
            ...app,
            appMenuInstalled: installAppMenu ? true : app.appMenuInstalled,
            desktopShortcutInstalled: Boolean(createDesktopShortcut),
            desktopShortcutTrusted: Boolean(createDesktopShortcut),
            wrapperInstalled: true,
            iconInstalled: true,
          }
        : this.discoverApps().find(a => a.appId === appId);
      return { ok: true, appId, app: updated };
    } catch (err) {
      return { ok: false, appId, error: err.message };
    }
  }

  _trustDesktopShortcut(shortcutPath) {
    if (this.skipSystemCommands) return;
    try {
      cp.execSync(`gio set "${shortcutPath}" metadata::trusted true`, {
        timeout: 2500,
        stdio: 'ignore',
      });
    } catch {}
    try {
      cp.execSync(`gio set "${shortcutPath}" metadata::trusted yes`, {
        timeout: 2500,
        stdio: 'ignore',
      });
    } catch {}
  }

  /**
   * Toggle or set whether an app has a trusted shortcut on `~/Desktop/`.
   */
  setDesktopShortcut(appId, enabled) {
    const apps = this.discoverApps();
    const app = apps.find(a => a.appId === appId);
    if (!app) return { ok: false, appId, error: `Unknown app: ${appId}` };

    if (enabled) {
      return this.installApp(appId, {
        _preloadedApp: app,
        appMenu: true,
        desktopShortcut: true,
        refreshCaches: true,
      });
    } else {
      const shortcutPath = path.join(this.desktopDir, `${appId}.desktop`);
      try {
        if (fs.existsSync(shortcutPath)) {
          fs.unlinkSync(shortcutPath);
        }
        const updated = this.discoverApps().find(a => a.appId === appId);
        return { ok: true, appId, app: updated };
      } catch (err) {
        return { ok: false, appId, error: err.message };
      }
    }
  }

  /**
   * Pin or unpin an app on the GNOME Shell Favorites dock.
   */
  setDockPinned(appId, pinned) {
    const apps = this.discoverApps();
    const app = apps.find(a => a.appId === appId);
    if (!app) return { ok: false, appId, error: `Unknown app: ${appId}` };

    if (pinned && !app.appMenuInstalled && !app.systemMenuInstalled) {
      this.installApp(appId, { _preloadedApp: app, appMenu: true, refreshCaches: true });
    }

    const desktopName = `${appId}.desktop`;
    const favs = this.getDockFavorites();
    let nextFavs;
    if (pinned) {
      nextFavs = favs.includes(desktopName) ? favs : [...favs, desktopName];
    } else {
      nextFavs = favs.filter(f => f !== desktopName);
    }
    const res = this.setDockFavoritesList(nextFavs);
    const updated = this.discoverApps().find(a => a.appId === appId);
    return { ok: res.ok, error: res.error, appId, app: updated };
  }

  /**
   * Uninstall an app's GNOME shortcuts (App Grid, Desktop shortcut, Dock pin, and wrapper).
   */
  uninstallApp(appId, options = {}) {
    const apps = this.discoverApps();
    const app = apps.find(a => a.appId === appId);
    if (!app) return { ok: false, appId, error: `Unknown app: ${appId}` };

    try {
      const toRemove = [
        path.join(this.appsDir, `${appId}.desktop`),
        path.join(this.desktopDir, `${appId}.desktop`),
        path.join(this.binDir, appId),
        path.join(this.iconsBaseDir, 'scalable', 'apps', `${appId}.svg`),
        path.join(this.pixmapsDir, `${appId}.svg`),
        path.join(this.pixmapsDir, `${appId}.png`),
      ];
      for (const s of [16, 24, 32, 48, 64, 128, 256, 512]) {
        toRemove.push(path.join(this.iconsBaseDir, `${s}x${s}`, 'apps', `${appId}.png`));
      }
      for (const p of toRemove) {
        if (fs.existsSync(p)) {
          try { fs.unlinkSync(p); } catch {}
        }
      }

      if (app.dockPinned) {
        this.setDockPinned(appId, false);
      }

      if (options.refreshCaches !== false) {
        this.refreshCaches();
      }

      const updated = this.discoverApps().find(a => a.appId === appId);
      return { ok: true, appId, app: updated };
    } catch (err) {
      return { ok: false, appId, error: err.message };
    }
  }

  /**
   * Bulk install / update a list of apps (or all discovered apps).
   */
  async bulkInstall(appIds, options = {}, onProgress = null) {
    const allApps = this.discoverApps();
    const appById = new Map(allApps.map(a => [a.appId, a]));
    const targetIds = Array.isArray(appIds) && appIds.length > 0
      ? appIds
      : allApps.map(a => a.appId);

    const results = [];
    const total = targetIds.length;

    for (let i = 0; i < total; i++) {
      const appId = targetIds[i];
      const preloadedApp = appById.get(appId);
      const res = this.installApp(appId, {
        ...options,
        _preloadedApp: preloadedApp,
        _skipRediscover: true,
        refreshCaches: false,
      });
      const stepResult = {
        appId,
        label: res.app ? res.app.label : (preloadedApp ? preloadedApp.label : appId),
        step: i + 1,
        total,
        ok: res.ok,
        error: res.error || null,
      };
      results.push(stepResult);
      if (typeof onProgress === 'function') {
        onProgress(stepResult);
      }
      // Yield to event loop so worker message port flushes progress events immediately
      await new Promise(resolve => setImmediate(resolve));
    }

    this.refreshCaches();

    const succeeded = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    return {
      ok: failed === 0,
      total,
      succeeded,
      failed,
      results,
      apps: this.discoverApps(),
    };
  }

  /**
   * Bulk remove desktop shortcuts (`~/Desktop/<appId>.desktop`) while optionally keeping App Grid entries.
   */
  bulkRemoveDesktopShortcuts(appIds = null) {
    const allApps = this.discoverApps();
    const targetIds = Array.isArray(appIds) && appIds.length > 0
      ? appIds
      : allApps.map(a => a.appId);

    let removed = 0;
    for (const appId of targetIds) {
      const shortcutPath = path.join(this.desktopDir, `${appId}.desktop`);
      if (fs.existsSync(shortcutPath)) {
        try {
          fs.unlinkSync(shortcutPath);
          removed++;
        } catch {}
      }
    }

    return {
      ok: true,
      removed,
      apps: this.discoverApps(),
    };
  }

  /**
   * Rebuild GTK icon cache, desktop entry database, and trust all existing RobOS shortcuts on ~/Desktop.
   */
  refreshCaches() {
    if (this.skipSystemCommands) {
      return { ok: true, skipped: true };
    }
    const actions = [];
    try {
      if (fs.existsSync(this.iconsBaseDir)) {
        cp.execSync(`gtk-update-icon-cache -f -t -q "${this.iconsBaseDir}"`, {
          timeout: 5000,
          stdio: 'ignore',
        });
        actions.push('gtk-update-icon-cache');
      }
    } catch {}

    try {
      if (fs.existsSync(this.appsDir)) {
        cp.execSync(`update-desktop-database -q "${this.appsDir}"`, {
          timeout: 5000,
          stdio: 'ignore',
        });
        actions.push('update-desktop-database');
      }
    } catch {}

    // Re-trust all RobOS desktop shortcuts in ~/Desktop
    try {
      if (fs.existsSync(this.desktopDir)) {
        for (const f of fs.readdirSync(this.desktopDir)) {
          if (!f.endsWith('.desktop')) continue;
          const full = path.join(this.desktopDir, f);
          try {
            const content = fs.readFileSync(full, 'utf8');
            if (content.includes('X-RobOS-App=true')) {
              fs.chmodSync(full, 0o755);
              this._trustDesktopShortcut(full);
            }
          } catch {}
        }
        actions.push('gio-trust-desktop');
      }
    } catch {}

    return { ok: true, actions };
  }

  /**
   * Return generated `.desktop` and wrapper script preview for an app.
   */
  getAppDetails(appId) {
    const app = this.discoverApps().find(a => a.appId === appId);
    if (!app) return { ok: false, error: `Unknown app: ${appId}` };

    let activeDesktopContent = null;
    if (fs.existsSync(app.userDesktopPath)) {
      try { activeDesktopContent = fs.readFileSync(app.userDesktopPath, 'utf8'); } catch {}
    }

    return {
      ok: true,
      app,
      generatedDesktop: this.generateDesktopEntry(app),
      activeDesktopContent,
      generatedWrapper: this.generateWrapperScript(app),
    };
  }

  /**
   * Launch an app detached so the user can test it from the installer.
   */
  launchApp(appId) {
    const app = this.discoverApps().find(a => a.appId === appId);
    if (!app) return { ok: false, error: `Unknown app: ${appId}` };

    // Ensure wrapper exists before launching
    if (!fs.existsSync(app.wrapperPath)) {
      this.installApp(appId, { appMenu: true, refreshCaches: false });
    }

    if (this.skipSystemCommands) {
      return { ok: true, appId, simulated: true };
    }

    try {
      const child = cp.spawn(app.wrapperPath, [], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
      });
      child.unref();
      return { ok: true, appId, pid: child.pid };
    } catch (err) {
      return { ok: false, appId, error: err.message };
    }
  }
}

module.exports = {
  ShortcutManager,
  parseDesktopContent,
  normalizeRobOSCategory,
  humanizeAppId,
  NON_GUI_PACKAGES,
};
