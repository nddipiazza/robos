'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const games = require('../../site/_data/games.json');
const ignored = new Set(['.git', '.godot', 'node_modules', '__pycache__', 'tests', 'reports', 'qa_player', 'build', 'run', 'docs', 'tools']);
const platforms = { windows: { preset: 'Windows Desktop', suffix: '.exe', label: 'Windows-x64' }, linux: { preset: 'Linux', suffix: '.x86_64', label: 'Linux-x64' }, macos: { preset: 'macOS', suffix: '.zip', label: 'macOS' } };
function preset(platform, id = "standalone") {
  return `[preset.0]\nname="Standalone"\nplatform="${platforms[platform].preset}"\nrunnable=true\nexport_filter="all_resources"\ninclude_filter="*.json,*.jsonld,*.crpgcart,*.csv,*.txt,*.glsl"\nexclude_filter=""\nscript_export_mode=2\n\n[preset.0.options]\nbinary_format/architecture="${platform === 'macos' ? 'universal' : 'x86_64'}"\nbinary_format/embed_pck=false\napplication/bundle_identifier="com.rowbose.${id}"\napplication/export_console_wrapper=0\ncodesign/enable=false\ncodesign/codesign=0\ntexture_format/s3tc_bptc=true\ntexture_format/etc2_astc=false\n`;
}
function nsisInstaller({ id, game, version, payload, output }) {
  const shortcut = game.title.replace(/[<>:"/\\|?*]/g, '');
  const removeFiles = [], removeDirectories = [];
  function list(dir, relative = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = path.join(relative, entry.name).replaceAll('/', '\\');
      if (entry.isDirectory()) { list(path.join(dir, entry.name), rel); removeDirectories.push(`  RMDir "$INSTDIR\\${rel}"`); }
      else removeFiles.push(`  Delete "$INSTDIR\\${rel}"`);
    }
  }
  list(payload);
  return `Unicode true
!include "MUI2.nsh"
Name "${game.title}"
OutFile "${output}\\${id}-v${version}-Windows-Setup.exe"
InstallDir "$LOCALAPPDATA\\Programs\\RobOS Games\\${game.executable}"
RequestExecutionLevel user
!define MUI_FINISHPAGE_RUN "$INSTDIR\\${game.executable}.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Play ${game.title}"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Section
  SetOutPath "$INSTDIR"
  File /r "${payload}\\*"
  CreateDirectory "$SMPROGRAMS\\${shortcut}"
  CreateShortcut "$SMPROGRAMS\\${shortcut}\\${shortcut}.lnk" "$INSTDIR\\${game.executable}.exe"
  CreateShortcut "$DESKTOP\\${shortcut}.lnk" "$INSTDIR\\${game.executable}.exe"
  WriteUninstaller "$INSTDIR\\Uninstall.exe"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\RobOS-${id}" "DisplayName" "${game.title}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\RobOS-${id}" "DisplayVersion" "${version}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\RobOS-${id}" "UninstallString" '$\\"$INSTDIR\\Uninstall.exe$\\"'
SectionEnd
Section "Uninstall"
  Delete "$DESKTOP\\${shortcut}.lnk"
  Delete "$SMPROGRAMS\\${shortcut}\\${shortcut}.lnk"
  RMDir "$SMPROGRAMS\\${shortcut}"
${removeFiles.join('\n')}
${removeDirectories.join('\n')}
  Delete "$INSTDIR\\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\RobOS-${id}"
SectionEnd
`;
}
async function build({ id, platform = 'windows', godot = process.env.GODOT_BIN, nsis = process.env.NSIS_BIN } = {}) {
  const game = games[id], target = platforms[platform];
  if (!game || !target) throw new Error('Choose a known game and platform');
  if (!godot) throw new Error('Set GODOT_BIN to the official Godot executable (scripts/games/setup.cjs)');
  const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
  const output = path.join(root, 'release/games'); fs.mkdirSync(output, { recursive: true });
  const stage = fs.mkdtempSync(path.join(output, `.build-${id}-`));
  const project = path.join(stage, 'project'), payload = path.join(stage, 'payload');
  fs.mkdirSync(payload);
  fs.cpSync(path.join(root, 'games', game.project), project, { recursive: true, filter: file => !ignored.has(path.basename(file)) && !/\.(?:py|mp4|webm|mkv|log)$/.test(file) });
  fs.writeFileSync(path.join(project, 'export_presets.cfg'), preset(platform, id));
  function run(args, name, bootstrap = false) {
    const result = spawnSync(godot, args, { encoding: 'utf8', timeout: 15 * 60 * 1000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    fs.writeFileSync(path.join(stage, `${name}.log`), (result.stdout || '') + (result.stderr || ''));
    if (result.error || result.status !== 0 || !bootstrap && /SCRIPT ERROR:|Parse Error:|Failed to load script/.test((result.stdout || '') + (result.stderr || ''))) {
      console.error(((result.stdout || '') + (result.stderr || '')).slice(-5000));
      throw new Error(`${name} failed; see ${stage}/${name}.log`);
    }
  }
  console.log(`Importing ${game.title}`);
  // A custom project font can be loaded before its first import finishes.
  // Verify a second clean editor start after the bootstrap has flushed imports.
  run(['--headless', '--path', project, '--editor', '--import'], 'bootstrap-import', true);
  run(['--headless', '--path', project, '--editor', '--import'], 'import');
  const executable = path.join(payload, game.executable + target.suffix);
  console.log(`Exporting ${game.title} for ${platform}`);
  run(['--headless', '--path', project, '--export-release', 'Standalone', executable], 'export');
  const archive = path.join(output, `${id}-v${version}-${target.label}.zip`);
  if (platform === 'macos') {
    if (process.platform === 'darwin') {
      const unpacked = path.join(stage, 'mac-smoke'); fs.mkdirSync(unpacked);
      execFileSync('unzip', ['-q', executable, '-d', unpacked]);
      const app = fs.readdirSync(unpacked).find(name => name.endsWith('.app'));
      if (!app) throw new Error('macOS export contains no app');
      const binDir = path.join(unpacked, app, 'Contents/MacOS');
      const binary = path.join(binDir, fs.readdirSync(binDir)[0]);
      const smoke = spawnSync(binary, ['--headless', '--quit-after', '180'], { encoding: 'utf8', timeout: 90000 });
      fs.writeFileSync(path.join(stage, 'smoke.log'), (smoke.stdout || '') + (smoke.stderr || ''));
      if (smoke.error || smoke.status !== 0 || /SCRIPT ERROR:|Parse Error:|Failed to load script/.test((smoke.stdout || '') + (smoke.stderr || ''))) throw new Error(`macOS smoke failed: ${stage}/smoke.log`);
    }
    fs.renameSync(executable, archive);
  } else {
    // Smoke the exported game itself, never the source project.
    if ((platform === 'windows' && process.platform === 'win32') || (platform === 'linux' && process.platform === 'linux')) {
      if (platform === 'linux') fs.chmodSync(executable, 0o755);
      const smoke = spawnSync(executable, ['--headless', '--quit-after', '180'], { encoding: 'utf8', timeout: 90000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
      fs.writeFileSync(path.join(stage, 'smoke.log'), (smoke.stdout || '') + (smoke.stderr || ''));
      if (smoke.error || smoke.status !== 0 || /SCRIPT ERROR:|Parse Error:|Failed to load script/.test((smoke.stdout || '') + (smoke.stderr || ''))) throw new Error(`Exported game smoke failed: ${stage}/smoke.log`);
    }
    fs.copyFileSync(path.join(root, 'LICENSE'), path.join(payload, 'LICENSE.txt'));
    fs.writeFileSync(path.join(payload, 'README.txt'), `${game.title}\n\n${platform === 'windows' ? `Extract this ZIP, then double-click ${game.executable}.exe.` : `Extract this ZIP, then run ./${game.executable}.x86_64 (mark it executable if needed).`}\nGodot, Git and RobOS are not required.\nhttps://rowbose.com/games/${id}/\n\nEngine: Godot ${require('./setup.cjs').VERSION} (MIT), https://godotengine.org/license/\nThird-party game notices are included in THIRD-PARTY-NOTICES.\n`);
    const notices = path.join(payload, 'THIRD-PARTY-NOTICES'); fs.mkdirSync(notices);
    function copyNotices(dir, relative = '') {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ignored.has(entry.name)) continue;
        const rel = path.join(relative, entry.name), file = path.join(dir, entry.name);
        if (entry.isDirectory()) copyNotices(file, rel);
        else if (/license|copying|attribution|notice/i.test(entry.name)) { const dest = path.join(notices, rel); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(file, dest); }
      }
    }
    copyNotices(path.join(root, 'games', game.project));
    if (platform === 'windows' && nsis) {
      const config = path.join(stage, 'installer.nsi');
      fs.writeFileSync(config, nsisInstaller({ id, game, version, payload, output }));
      execFileSync(nsis, ['/V2', config], { stdio: 'inherit', windowsHide: true });
    }
    if (process.platform === 'win32') {
      const quote = value => "'" + value.replaceAll("'", "''") + "'";
      if (fs.existsSync(archive)) fs.unlinkSync(archive);
      execFileSync('powershell.exe', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory(${quote(payload)}, ${quote(archive)})`], { stdio: 'inherit', windowsHide: true });
    } else execFileSync('zip', ['-q', '-r', archive, '.'], { cwd: payload, stdio: 'inherit' });
  }
  const assets = fs.readdirSync(output).filter(name => name.startsWith(`${id}-v${version}-`) && /\.(zip|exe)$/.test(name));
  const hashes = [];
  for (const name of assets) { const hash = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(path.join(output, name))) hash.update(chunk); hashes.push(`${hash.digest('hex')}  ${name}`); }
  fs.writeFileSync(path.join(output, `${id}-SHA256SUMS.txt`), hashes.join('\n') + '\n');
  fs.writeFileSync(path.join(output, `${id}-${platform}-build.json`), JSON.stringify({ id, platform, version, godot: require('./setup.cjs').VERSION, revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), assets }, null, 2));
  console.log(`Built: ${archive}`);
  return { archive, stage, payload };
}
module.exports = { build, preset, nsisInstaller, platforms };
if (require.main === module) build({ id: process.argv[2], platform: process.argv[3] || 'windows' }).catch(error => { console.error(error); process.exitCode = 1; });
