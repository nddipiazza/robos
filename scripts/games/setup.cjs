'use strict';
// Download the official engine/templates and verify them against the vendor checksums.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { execFileSync } = require('node:child_process');
const VERSION = '4.7.2';
const base = `https://github.com/godotengine/godot-builds/releases/download/${VERSION}-stable`;
const cache = path.resolve(process.env.ROBOS_GAME_TOOLS || path.join(os.homedir(), '.cache/robos-tools', `godot-${VERSION}`));
function extract(archive, destination) {
  fs.mkdirSync(destination, { recursive: true });
  if (process.platform === 'win32') {
    const quote = value => "'" + value.replaceAll("'", "''") + "'";
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory(${quote(archive)}, ${quote(destination)})`], { stdio: 'inherit', windowsHide: true });
  } else execFileSync('unzip', ['-q', '-o', archive, '-d', destination], { stdio: 'inherit' });
}
async function setup() {
  fs.mkdirSync(cache, { recursive: true });
  const response = await fetch(`${base}/SHA512-SUMS.txt`);
  if (!response.ok) throw new Error(`Could not fetch Godot checksums: ${response.status}`);
  const checksums = await response.text();
  async function download(name) {
    const checksum = checksums.split(/\r?\n/).map(line => line.trim().split(/\s+/)).find(parts => parts[1]?.replace(/^\*/, '') === name)?.[0];
    if (!checksum || !/^[a-f0-9]{128}$/i.test(checksum)) throw new Error(`Missing checksum: ${name}`);
    const file = path.join(cache, name.replace(/\.tpz$/, '.zip'));
    const hash = async () => { const h = crypto.createHash('sha512'); for await (const chunk of fs.createReadStream(file)) h.update(chunk); return h.digest('hex'); };
    if (!fs.existsSync(file) || await hash() !== checksum) {
      console.log(`Downloading ${name}`);
      const result = await fetch(`${base}/${name}`);
      if (!result.ok) throw new Error(`Godot download failed: ${result.status}`);
      await pipeline(Readable.fromWeb(result.body), fs.createWriteStream(file));
      if (await hash() !== checksum) throw new Error(`Godot checksum mismatch: ${name}`);
    }
    return file;
  }
  const engineName = process.platform === 'win32' ? `Godot_v${VERSION}-stable_win64.exe` : process.platform === 'darwin' ? 'Godot.app/Contents/MacOS/Godot' : `Godot_v${VERSION}-stable_linux.x86_64`;
  const engine = path.join(cache, engineName);
  if (!fs.existsSync(engine)) {
    const platform = process.platform === 'win32' ? 'win64.exe' : process.platform === 'darwin' ? 'macos.universal' : 'linux.x86_64';
    extract(await download(`Godot_v${VERSION}-stable_${platform}.zip`), cache);
    if (process.platform !== 'win32') fs.chmodSync(engine, 0o755);
  }
  const dataHome = process.platform === 'win32' ? process.env.APPDATA : process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Application Support') : process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share');
  const templates = path.join(dataHome, process.platform === 'linux' ? 'godot/export_templates' : 'Godot/export_templates', `${VERSION}.stable`);
  if (!fs.existsSync(path.join(templates, 'windows_release_x86_64.exe'))) {
    const temp = fs.mkdtempSync(path.join(cache, 'templates-'));
    extract(await download(`Godot_v${VERSION}-stable_export_templates.tpz`), temp);
    fs.mkdirSync(templates, { recursive: true });
    fs.cpSync(path.join(temp, 'templates'), templates, { recursive: true });
    fs.rmSync(temp, { recursive: true, force: true });
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `godot=${engine}\n`);
  console.log(`Godot ready: ${engine}`);
  return engine;
}
module.exports = { setup, extract, VERSION };
if (require.main === module) setup().catch(error => { console.error(error); process.exitCode = 1; });
