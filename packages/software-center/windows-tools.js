'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

// Use fixed PowerShell commands rather than .ps1 files: standard Windows script
// execution policy blocks unsigned files even for these ordinary registry APIs.
const READ_INSTALLED_APPS = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*') | ForEach-Object { Get-ItemProperty -Path $_ -ErrorAction SilentlyContinue } | Where-Object DisplayName | Select-Object -ExpandProperty DisplayName -Unique | ConvertTo-Json -Compress`;
const ADD_USER_PATH = `$ErrorActionPreference='Stop'; $current=[Environment]::GetEnvironmentVariable('Path','User'); foreach ($dir in @($env:ROBOS_NPM_PREFIX,$env:ROBOS_NODE_DIR,$env:ROBOS_TOOL_BIN)) { if ($dir -and (($current -split ';') -notcontains $dir)) { $current=(($current,$dir) -join ';').Trim(';') } }; [Environment]::SetEnvironmentVariable('Path',$current,'User'); Write-Output 'CLI directories added to your user PATH. Open a new terminal to use them.'`;

// Non-admin WinGet installs cannot always create their command symlinks. These
// ordinary Windows command wrappers need no symlink privilege or policy change.
const PORTABLE_COMMANDS = {
  godot4: { godot: /^Godot_v[\d.]+-stable_win\w+_console\.exe$/i, godot4: /^Godot_v[\d.]+-stable_win\w+_console\.exe$/i },
  jq: { jq: /^jq(?:-windows-(?:amd64|arm64|i386))?\.exe$/i },
  ripgrep: { rg: /^rg\.exe$/i }, 'fd-find': { fd: /^fd\.exe$/i },
  bat: { bat: /^bat\.exe$/i }, fzf: { fzf: /^fzf\.exe$/i },
  lazygit: { lazygit: /^lazygit\.exe$/i }, sqlite3: { sqlite3: /^sqlite3\.exe$/i },
  ffmpeg: { ffmpeg: /^ffmpeg\.exe$/i, ffprobe: /^ffprobe\.exe$/i, ffplay: /^ffplay\.exe$/i },
};
function findExecutable(dir, pattern, depth = 0) {
  if (depth > 6 || !fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && pattern.test(entry.name)) return full;
    if (entry.isDirectory()) { const found = findExecutable(full, pattern, depth + 1); if (found) return found; }
  }
  return null;
}
function commandWrappers(root, tool, action, packageDirs) {
  const commands = PORTABLE_COMMANDS[tool.id];
  if (!commands) return [];
  const bin = path.join(root, 'tools', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const created = [];
  for (const [command, pattern] of Object.entries(commands)) {
    const wrapper = path.join(bin, `${command}.cmd`);
    const marker = '@rem RobOS Software Center: ' + tool.id;
    const owned = fs.existsSync(wrapper) && fs.readFileSync(wrapper, 'utf8').startsWith(marker);
    if (action === 'uninstall') { if (owned) fs.unlinkSync(wrapper); continue; }
    if (fs.existsSync(wrapper) && !owned) continue;
    const executable = packageDirs.map(dir => findExecutable(dir, pattern)).find(Boolean);
    if (!executable) continue;
    // Percent expansion is the only expansion still active inside CMD quotes.
    fs.writeFileSync(wrapper, `${marker}\r\n@echo off\r\n"${executable.replace(/%/g, '%%')}" %*\r\n`);
    created.push(wrapper);
  }
  return created;
}

// Exact IDs, resolved against the WinGet community source (never the Store).
const PACKAGES = {
  vscode: 'Microsoft.VisualStudioCode',
  'intellij-idea-community': 'JetBrains.IntelliJIDEA.Community',
  'pycharm-community': 'JetBrains.PyCharm.Community',
  webstorm: 'JetBrains.WebStorm', goland: 'JetBrains.GoLand', clion: 'JetBrains.CLion',
  rider: 'JetBrains.Rider', rustrover: 'JetBrains.RustRover',
  firefox: 'Mozilla.Firefox', chromium: 'Hibbiki.Chromium', 'google-chrome': 'Google.Chrome',
  'gh-cli': 'GitHub.cli', docker: 'Docker.DockerDesktop', lazygit: 'JesseDuffield.lazygit',
  flameshot: 'Flameshot.Flameshot', vlc: 'VideoLAN.VLC',
  ripgrep: 'BurntSushi.ripgrep.MSVC', 'fd-find': 'sharkdp.fd', bat: 'sharkdp.bat',
  jq: 'jqlang.jq', fzf: 'junegunn.fzf', sqlite3: 'SQLite.SQLite',
  godot4: 'GodotEngine.GodotEngine', ffmpeg: 'Gyan.FFmpeg',
  'obs-studio': 'OBSProject.OBSStudio', 'process-explorer': 'Microsoft.Sysinternals.ProcessExplorer',
};
const NPM_PACKAGES = {
  'claude-cli': '@anthropic-ai/claude-code', 'openai-codex': '@openai/codex',
  'gemini-cli': '@google/gemini-cli', 'gh-copilot': '@github/copilot',
};
const UNSUPPORTED = {
  kazam: 'Kazam is Linux-only. Use OBS Studio on Windows.',
  htop: 'htop is Linux-only. Use Process Explorer on Windows.',
};
// WinGet cannot correlate every older/vendor-installed copy with its manifest.
// Detect those without claiming ownership of their uninstall operation.
const DISPLAY_NAMES = {
  vscode: /^Microsoft Visual Studio Code(?: \(User\))?$/i,
  'google-chrome': /^Google Chrome$/i, firefox: /^Mozilla Firefox\b/i,
  chromium: /^Chromium$/i, vlc: /^VLC media player$/i,
  docker: /^Docker Desktop$/i, flameshot: /^Flameshot$/i,
  'intellij-idea-community': /^IntelliJ IDEA Community Edition\b/i,
  'pycharm-community': /^PyCharm Community Edition\b/i,
  webstorm: /^WebStorm\b/i, goland: /^GoLand\b/i, clion: /^CLion\b/i,
  rider: /^(?:JetBrains )?Rider\b/i, rustrover: /^RustRover\b/i,
};
const EXTRA_TOOLS = [
  { id: 'godot4', name: 'Godot 4', category: 'Dev', description: 'Godot Engine — 2D and 3D game editor with GDScript support' },
  { id: 'ffmpeg', name: 'FFmpeg', category: 'Media', description: 'Record, convert, and process audio and video' },
  { id: 'obs-studio', name: 'OBS Studio', category: 'Media', description: 'Screen recording and live streaming' },
  { id: 'process-explorer', name: 'Process Explorer', category: 'CLI', description: 'Microsoft Sysinternals process and resource viewer' },
];
function catalog(tools) {
  // The githubnext package is retired; keep one current Copilot entry on Windows.
  return [...new Map([...tools.filter(t => t.id !== 'github-copilot-cli'), ...EXTRA_TOOLS].map(t => [t.id, t])).values()].map(tool => {
    const { checkCmd, installCmd, uninstallCmd, postInstallCmd, postUninstallCmd, updateCmd, ...info } = tool;
    const packageId = PACKAGES[tool.id];
    const npmPackage = NPM_PACKAGES[tool.id];
    const reason = UNSUPPORTED[tool.id] || (!packageId && !npmPackage ? 'No Windows installer is available.' : '');
    return { ...info, supported: !reason, unavailableReason: reason, packageId, npmPackage,
      source: packageId ? `WinGet · ${packageId}` : npmPackage ? `npm · ${npmPackage}` : 'Linux only',
      description: tool.id === 'firefox' ? 'Mozilla Firefox web browser' : tool.id === 'docker'
        ? 'Docker Desktop — requires Windows virtualization support; setup may require a restart' : tool.description };
  });
}

function runProcess(file, args, { env = process.env, onOutput = () => {}, timeout = 0 } = {}) {
  return new Promise((resolve, reject) => {
    let output = '';
    const child = spawn(file, args, { env, windowsHide: true, shell: false });
    const timer = timeout ? setTimeout(() => { child.kill(); reject(new Error(`${path.basename(file)} timed out. Try Refresh or retry the operation.`)); }, timeout) : null;
    const collect = chunk => { const text = chunk.toString(); output += text; onOutput(text); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); resolve({ code, output }); });
  });
}

function wingetArgs(action, packageId) {
  if (!Object.values(PACKAGES).includes(packageId)) throw new Error('Unknown Windows package.');
  return [action, '--id', packageId, '--exact', '--source', 'winget',
    '--accept-source-agreements', '--disable-interactivity',
    ...(action === 'install' ? ['--accept-package-agreements', '--silent'] : ['--silent'])];
}
function explainExit(code) {
  const unsigned = code >>> 0;
  if ([0x8A15010C, 0x8A150077, 0x800704C7].includes(unsigned)) return 'Windows cancelled the operation or administrator approval was declined. Retry and accept the Windows installer prompt.';
  if (unsigned === 0x8A15002B) return 'The installed version is already current. Refresh the software list.';
  if (unsigned === 0x8A15010A) return 'Restart Windows before installing this package, then retry.';
  if (unsigned === 0x8A150014) return 'The package was not found in WinGet. Update App Installer and retry.';
  return `Windows Package Manager failed (0x${unsigned.toString(16).toUpperCase()}). See the installer output above; retry after resolving the reported problem.`;
}

class WindowsTools {
  constructor({ root = path.join(os.homedir(), 'RobOS'), run = runProcess } = {}) {
    this.root = root;
    this.prefix = path.join(root, 'tools', 'npm');
    this.run = run;
    this.snapshot = null;
    this.pending = null;
    this.busy = false;
  }
  async inventory(force = false) {
    if (this.pending) return this.pending;
    if (!force && this.snapshot && Date.now() - this.snapshot.time < 30000) return this.snapshot;
    this.pending = this.readInventory();
    try { this.snapshot = await this.pending; return this.snapshot; }
    finally { this.pending = null; }
  }
  async readInventory() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-software-'));
    const output = path.join(dir, 'installed.json');
    try {
      const result = await this.run('winget.exe', ['export', '--output', output, '--source', 'winget',
        '--accept-source-agreements', '--disable-interactivity'], { timeout: 60000 });
      if (result.code !== 0) throw new Error(result.output.trim() || explainExit(result.code));
      const doc = JSON.parse(fs.readFileSync(output, 'utf8').replace(/^\uFEFF/, ''));
      const ids = new Set((doc.Sources || []).flatMap(s => (s.Packages || []).map(p => p.PackageIdentifier)));
      let names = [];
      try {
        const registry = await this.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          READ_INSTALLED_APPS], { timeout: 15000 });
        if (registry.code === 0) {
          const parsed = JSON.parse(registry.output.replace(/^\uFEFF/, ''));
          names = Array.isArray(parsed) ? parsed : typeof parsed === 'string' ? [parsed] : [];
        }
      } catch { /* The WinGet inventory remains usable when registry reads are restricted. */ }
      return { time: Date.now(), ids, names, error: '' };
    } catch (error) {
      return { time: Date.now(), ids: new Set(), names: [], error: `WinGet is unavailable: ${error.message}. Install or update Microsoft's App Installer, then Refresh.` };
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  async status(tools, force = false) {
    const inventory = await this.inventory(force);
    const node = path.join(this.root, 'runtime', 'node.exe');
    const npm = path.join(this.root, 'runtime', 'node_modules', 'npm', 'bin', 'npm-cli.js');
    return catalog(tools).map(tool => {
      const npmReady = fs.existsSync(node) && fs.existsSync(npm);
      const error = tool.packageId ? inventory.error : tool.npmPackage && !npmReady
        ? 'RobOS Node.js runtime is missing. Repair the RobOS Windows installation and retry.' : '';
      const external = tool.packageId && !inventory.ids.has(tool.packageId)
        && (inventory.names || []).some(name => DISPLAY_NAMES[tool.id]?.test(name));
      return { ...tool, externallyManaged: !!external,
        installed: tool.packageId ? inventory.ids.has(tool.packageId) || !!external
          : !!tool.npmPackage && fs.existsSync(path.join(this.prefix, 'node_modules', tool.npmPackage, 'package.json')),
        supported: tool.supported && !error, unavailableReason: tool.unavailableReason || error };
    });
  }
  async perform(tool, action, onOutput) {
    if (!['install', 'uninstall'].includes(action)) throw new Error('Unknown installer action.');
    if (!tool.supported) throw new Error(tool.unavailableReason || 'Unsupported Windows package.');
    if (tool.externallyManaged) throw new Error('This copy was installed outside WinGet. Manage it in Windows Settings.');
    if (this.busy) throw new Error('Another installer is running. Wait for it to finish, then retry.');
    this.busy = true;
    try {
      let result;
      if (tool.packageId) {
        onOutput(`Windows Package Manager · ${tool.packageId}\nWindows may ask for administrator approval.\n`);
        result = await this.run('winget.exe', wingetArgs(action, tool.packageId), { onOutput });
        // WinGet reports reboot-required success separately from ordinary success.
        if ([1641, 3010, 0x8A150109, 0x8A15010B].includes(result.code >>> 0)) onOutput('\nInstallation succeeded. Restart Windows to finish setup.\n');
        else if (action === 'install' && (result.code >>> 0) === 0x8A15002B) onOutput('\nThe installed version is current. Refreshing RobOS command shortcuts.\n');
        else if (result.code !== 0) throw new Error(explainExit(result.code));
        const bases = [path.join(os.homedir(), 'AppData/Local/Microsoft/WinGet/Packages'),
          path.join(process.env.ProgramFiles || 'C:\\Program Files', 'WinGet/Packages')];
        const dirs = bases.flatMap(base => fs.existsSync(base) ? fs.readdirSync(base)
          .filter(name => name.toLowerCase().startsWith(`${tool.packageId}_`.toLowerCase())).map(name => path.join(base, name)) : []);
        const wrappers = commandWrappers(this.root, tool, action, dirs);
        if (wrappers.length) onOutput(`\nWindows commands: ${wrappers.join(', ')}\n`);
      } else {
        if (NPM_PACKAGES[tool.id] !== tool.npmPackage) throw new Error('Unknown npm package.');
        const node = path.join(this.root, 'runtime', 'node.exe');
        const npm = path.join(this.root, 'runtime', 'node_modules', 'npm', 'bin', 'npm-cli.js');
        onOutput(`Installing into ${this.prefix}\n`);
        result = await this.run(node, [npm, action === 'install' ? 'install' : 'uninstall', '--global',
          '--prefix', this.prefix, tool.npmPackage, '--no-fund', '--no-audit', '--ignore-scripts=false'],
        { onOutput, env: { ...process.env, PATH: `${path.dirname(node)};${this.prefix};${process.env.PATH || ''}` } });
        if (result.code !== 0) throw new Error(`npm failed (exit ${result.code}). See the output above.`);
        if (action === 'install') {
          const packageDir = path.join(this.prefix, 'node_modules', tool.npmPackage);
          const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
          const bin = typeof manifest.bin === 'string' ? manifest.bin : Object.values(manifest.bin || {})[0];
          const executable = bin && path.resolve(packageDir, bin);
          if (!executable || !executable.startsWith(packageDir + path.sep) || !fs.existsSync(executable)) {
            throw new Error('npm did not install the CLI executable. Retry the install and check npm output for missing optional dependencies.');
          }
          const native = executable.toLowerCase().endsWith('.exe');
          onOutput('\nChecking the installed CLI…\n');
          const check = await this.run(native ? executable : node, native ? ['--version'] : [executable, '--version'],
            { onOutput, timeout: 60000, env: { ...process.env, PATH: `${path.dirname(node)};${this.prefix};${process.env.PATH || ''}` } });
          if (check.code !== 0) throw new Error('The CLI installed but its startup check failed. See the output above, then retry.');
        }
      }
      if (action === 'install' && (tool.npmPackage || PORTABLE_COMMANDS[tool.id])) {
        try {
          const update = await this.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ADD_USER_PATH],
            { onOutput, timeout: 15000, env: { ...process.env, ROBOS_NPM_PREFIX: this.prefix,
              ROBOS_NODE_DIR: path.join(this.root, 'runtime'), ROBOS_TOOL_BIN: path.join(this.root, 'tools/bin') } });
          if (update.code !== 0) throw new Error('Could not update user PATH.');
        } catch { onOutput(`\nThe tool is available in RobOS. To use it in other terminals, add ${path.join(this.root, 'tools/bin')}, ${this.prefix} and ${path.join(this.root, 'runtime')} to your user PATH.\n`); }
      }
      this.snapshot = null;
      const refreshed = (await this.status([tool], true)).find(t => t.id === tool.id);
      if (!refreshed?.supported || refreshed.installed !== (action === 'install')) {
        throw new Error('The installer exited, but the new installation state could not be verified. Refresh and check the Windows installation before retrying.');
      }
      return result;
    } finally { this.snapshot = null; this.busy = false; }
  }
}

module.exports = { PACKAGES, NPM_PACKAGES, UNSUPPORTED, EXTRA_TOOLS, catalog, wingetArgs, explainExit, runProcess, commandWrappers, WindowsTools };
