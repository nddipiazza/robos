'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const builds = new Map();
const run = (file, args) => new Promise((resolve, reject) => {
  execFile(file, args, { windowsHide: true, encoding: 'utf8', timeout: 15000 }, (error, stdout, stderr) => {
    if (error) { error.message += ` ${stderr || ''}`; reject(error); } else resolve(stdout.trim());
  });
});
async function nativeHelper(host, home = os.homedir()) {
  const source = fs.readFileSync(path.join(host, 'launcher-native.cs'));
  const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
  const cache = path.join(home, '.config/robos/launcher-native', hash);
  const exe = path.join(cache, 'RobOS-Launcher-Native.exe');
  if (fs.existsSync(exe)) return exe;
  if (builds.has(exe)) return builds.get(exe);
  const building = (async () => {
  const framework = path.join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET');
  const compiler = ['Framework64', 'Framework'].map(x => path.join(framework, x, 'v4.0.30319/csc.exe')).find(x => fs.existsSync(x));
  if (!compiler) throw new Error('Windows .NET Framework is required for Win + Shift support.');
  fs.mkdirSync(cache, { recursive: true });
  const cs = path.join(cache, 'launcher-native.cs'); fs.writeFileSync(cs, source);
  const temporary = path.join(cache, `native-${process.pid}.exe`);
  await run(compiler, ['/nologo', '/optimize+', '/target:exe', '/r:System.Windows.Forms.dll', '/r:System.Management.dll', `/out:${temporary}`, cs]);
  if (fs.existsSync(exe)) fs.rmSync(temporary, { force: true }); else fs.renameSync(temporary, exe);
  return exe;
  })();
  builds.set(exe, building);
  try { return await building; } finally { builds.delete(exe); }
}
class NativeIntegration {
  constructor(host, home = os.homedir()) { this.host = host; this.home = home; this.child = null; this.ready = false; this.starting = null; }
  get active() { return this.ready && !!this.child && this.child.exitCode === null && !this.child.killed; }
  async start(toggle) {
    if (this.active) return;
    if (this.starting) return this.starting;
    this.starting = this.startListener(toggle);
    try { return await this.starting; } finally { this.starting = null; }
  }
  async startListener(toggle) {
    this.ready = false;
    const executable = await nativeHelper(this.host, this.home);
    const child = spawn(executable, ['--hotkey', String(process.pid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;
    await new Promise((resolve, reject) => {
      let buffer = '', errors = '', ready = false;
      const timer = setTimeout(() => { child.kill(); reject(new Error('Win + Shift listener did not become ready.')); }, 10000);
      child.stderr.on('data', d => { errors += d; });
      child.stdout.on('data', data => {
        buffer += data;
        while (buffer.includes('\n')) {
          const end = buffer.indexOf('\n'), line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
          if (line === 'READY') { ready = true; this.ready = true; clearTimeout(timer); resolve(); }
          if (line === 'TOGGLE' && ready) toggle();
        }
      });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { this.ready = false; clearTimeout(timer); if (!ready) reject(new Error(errors || 'Win + Shift listener exited.')); });
    });
  }
  stop() { this.child?.kill(); this.child = null; this.ready = false; }
  async focus(id, executable = process.execPath) {
    const helper = await nativeHelper(this.host, this.home);
    try { const pid = Number(await run(helper, ['--focus-app', executable, id, this.home])); return pid ? { pid, visible: true, existing: true } : null; }
    catch (error) { if (error.code === 2) return null; throw error; }
  }
}
module.exports = { NativeIntegration, nativeHelper, run };
