'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const runFile = promisify(execFile);
const { managed, standalone } = require('./catalog.cjs');
const { root, token, readJSON, writeJSON } = require('./store.cjs');
const unitPattern = /^robos-[a-z0-9@_.:-]+\.service$/;
const unitFor = id => `robos-services-${id}.service`;
function ps(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }
function systemdArg(value) {
  if (/[\r\n\0]/.test(value)) throw new Error('Invalid service path');
  return '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%').replaceAll('$', () => '$$') + '"';
}
function listenerRecords(output, readCommand, known = new Set()) {
  const records = [];
  for (const line of output.split('\n')) {
    const fields = line.trim().split(/\s+/), endpoint = fields[0] === 'LISTEN' ? fields[3] : fields[4];
    if (!endpoint) continue;
    for (const match of line.matchAll(/pid=(\d+)/g)) {
      const pid = Number(match[1]);
      if (known.has(`${pid}:${endpoint}`) || known.has(`managed:${pid}`)) continue;
      try {
        const command = readCommand(pid).split('\0').slice(1).join('\0');
        const appId = command.match(/(?:\/packages\/|\/share\/robos\/|\/games\/)([a-z][a-z0-9-]*)(?:\/|\0|$)/)?.[1];
        if (!appId) continue;
        known.add(`${pid}:${endpoint}`);
        records.push({ id: `listener:${pid}:${endpoint}`, appId, name: `${appId}: listening socket`, endpoint, pid, kind: 'embedded', status: 'running', startup: 'with app', control: false, description: 'Observed by the OS in an existing RobOS process. Manage its lifecycle through its owning app or registered OS service.' });
      } catch { /* Process may exit while its sockets are inspected. */ }
    }
  }
  return records;
}
class Manager {
  constructor({ dir = root(), platform = process.platform, run = runFile } = {}) { this.dir = dir; this.platform = platform; this.run = run; }
  async exec(bin, args) { return (await this.run(bin, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024, windowsHide: true })).stdout.trim(); }
  async powershell(script) { return this.exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(`$ErrorActionPreference='Stop'; ${script}`, 'utf16le').toString('base64')]); }
  async units(scope) {
    const prefix = scope === 'user' ? ['--user'] : [];
    const output = await this.exec('systemctl', [...prefix, 'list-unit-files', 'robos-*.service', '--no-pager', '--no-legend']);
    const names = output.split('\n').map(l => l.trim().split(/\s+/)[0]).filter(n => unitPattern.test(n));
    return Promise.all(names.map(async unit => {
      const data = await this.exec('systemctl', [...prefix, 'show', unit, '--property=Id,Description,ActiveState,SubState,UnitFileState,MainPID']);
      const info = Object.fromEntries(data.split('\n').map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
      return { id: unit, unit, scope, name: info.Description || unit, status: info.ActiveState, detail: info.SubState, startup: info.UnitFileState, pid: Number(info.MainPID) || null, control: true, kind: 'installed' };
    }));
  }
  async list() {
    let installed = [], errors = [];
    if (this.platform === 'linux') {
      const results = await Promise.allSettled(['user', 'system'].map(s => this.units(s)));
      results.forEach((r, i) => { if (r.status === 'fulfilled') installed.push(...r.value); else errors.push(`${i ? 'System' : 'User'} service discovery: ${r.reason.message}`); });
    } else if (this.platform === 'win32') {
      try {
        const raw = await this.powershell("$rows=@(Get-ScheduledTask -TaskName 'RobOS-Services-*' -ErrorAction SilentlyContinue | ForEach-Object { @{ unit=$_.TaskName; name=$_.Description; status=[string]$_.State; startup=if($_.Settings.Enabled){'enabled'}else{'disabled'} } }); ConvertTo-Json -InputObject $rows -Compress");
        installed = JSON.parse(raw || '[]').map(s => ({ ...s, id: s.unit, scope: 'user', kind: 'installed', control: true }));
      } catch (e) { errors.push(e.message); }
    } else errors.push('Service installation supports Linux systemd and Windows Task Scheduler. SSH hosts must run Linux.');
    const services = managed.map(s => {
      const unit = this.platform === 'win32' ? `RobOS-Services-${s.id}` : unitFor(s.id);
      const found = installed.find(x => x.unit === unit && x.scope === 'user');
      return { ...s, status: 'not installed', startup: 'manual', control: false, installable: ['linux', 'win32'].includes(this.platform), ...found, name: s.name, kind: 'managed', id: s.id, unit };
    });
    services.push(...installed.filter(s => !services.some(x => x.unit === s.unit && x.scope === s.scope)));
    let inventory = []; try { inventory = require('../inventory.json'); } catch {}
    services.push(...standalone.map(s => ({ ...s, id: `catalog:${s.id}`, kind: 'catalog', status: 'cataloged', control: false, description: s.description || 'Existing backend. Install its owning package before registering an OS service.' })));
    for (const source of inventory) services.push({ ...source, id: `source:${source.appId}:${source.source}`, kind: 'embedded', status: 'cataloged', control: false });
    const runtimeDir = path.join(os.homedir(), '.config', 'robos', 'services', 'runtime');
    if (fs.existsSync(runtimeDir)) for (const file of fs.readdirSync(runtimeDir).filter(f => f.endsWith('.json'))) {
      try {
        const r = readJSON(path.join(runtimeDir, file));
        if (!Number.isSafeInteger(r.pid) || r.pid < 1) continue;
        try { process.kill(r.pid, 0); } catch { continue; }
        if (r.processStart && this.platform === 'linux') {
          const start = fs.readFileSync(`/proc/${r.pid}/stat`, 'utf8').split(') ').slice(1).join(') ').split(' ')[19];
          if (start !== r.processStart) continue;
        }
        services.push({ ...r, id: `runtime:${file}`, name: r.name || r.appId, status: 'running', startup: 'with app', kind: 'embedded', control: false });
      } catch (e) { errors.push(`Runtime record ${file}: ${e.message}`); }
    }
    if (this.platform === 'linux') {
      const known = new Set(services.filter(s => s.control && s.pid).map(s => `managed:${s.pid}`));
      for (const s of services.filter(s => s.endpoint?.port && s.pid)) known.add(`${s.pid}:${s.endpoint.address}:${s.endpoint.port}`);
      try {
        const output = await this.exec('ss', ['-lntpH']);
        const unix = await this.exec('ss', ['-lxnpH']);
        services.push(...listenerRecords(output + '\n' + unix, pid => fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'), known));
      } catch { /* Source inventory and runtime records remain available without ss. */ }
    }
    let bootStartup = null;
    if (this.platform === 'linux') { try { bootStartup = (await this.exec('loginctl', ['show-user', os.userInfo().username, '-p', 'Linger', '--value'])) === 'yes'; } catch {} }
    return { hostname: os.hostname(), platform: this.platform, services, errors, bootStartup, dataDirectory: this.dir, startupNote: this.platform === 'win32' ? 'Windows uses per-user scheduled tasks at sign-in.' : `User service startup before login: ${bootStartup === null ? 'not verified' : bootStartup ? 'enabled' : 'not enabled'}.` };
  }
  async install(ids = managed.map(s => s.id)) {
    if (!Array.isArray(ids) || !ids.length || ids.some(id => !managed.some(s => s.id === id))) throw new Error('Select valid managed services');
    token(this.dir);
    const managedNode = path.join(os.homedir(), '.local', 'share', 'robos', 'node', 'bin', 'node');
    const node = process.versions.electron ? (fs.existsSync(managedNode) ? managedNode : await this.exec('node', ['-p', 'process.execPath'])) : process.execPath;
    const server = path.resolve(__dirname, '../server.cjs');
    if (this.platform === 'linux') {
      const unitDir = path.join(os.homedir(), '.config', 'systemd', 'user');
      fs.mkdirSync(unitDir, { recursive: true });
      for (const id of ids) {
        const service = managed.find(s => s.id === id);
        const contents = `[Unit]\nDescription=${service.name}\nAfter=network.target\n\n[Service]\nType=simple\nExecStart=${systemdArg(node)} ${systemdArg(server)} ${id}\nEnvironment=${systemdArg('ROBOS_SERVICES_CONFIG=' + this.dir)}\nRestart=on-failure\nRestartSec=3\nUMask=0077\nNoNewPrivileges=true\nPrivateTmp=true\n\n[Install]\nWantedBy=default.target\n`;
        fs.writeFileSync(path.join(unitDir, unitFor(id)), contents);
      }
      await this.exec('systemctl', ['--user', 'daemon-reload']);
      for (const id of ids) {
        await this.exec('systemctl', ['--user', 'enable', unitFor(id)]);
        await this.exec('systemctl', ['--user', 'restart', unitFor(id)]);
      }
    } else if (this.platform === 'win32') {
      for (const id of ids) {
        // PowerShell runner redirects output and lets Task Scheduler track the real process lifetime.
        const runner = path.join(this.dir, `${id}.ps1`), log = path.join(this.dir, `${id}.log`);
        fs.writeFileSync(runner, `$env:ROBOS_SERVICES_CONFIG=${ps(this.dir)}\n& ${ps(node)} ${ps(server)} ${ps(id)} *>> ${ps(log)}\nexit $LASTEXITCODE\n`);
        const script = `$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ${ps(`-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${runner}"`)}; $trigger=New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name); $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries; Register-ScheduledTask -TaskName ${ps(`RobOS-Services-${id}`)} -Action $action -Trigger $trigger -Settings $settings -Description ${ps(managed.find(s => s.id === id).name)} -Force | Out-Null; Start-ScheduledTask -TaskName ${ps(`RobOS-Services-${id}`)}`;
        await this.powershell(script);
      }
    } else throw new Error('Install on Linux or Windows, or add a Linux SSH host');
    writeJSON(path.join(this.dir, 'installed.json'), { packageDirectory: path.resolve(__dirname, '..'), updatedAt: new Date().toISOString() });
    return this.list();
  }
  async action({ unit, scope = 'user', action }) {
    if (!['start', 'stop', 'restart', 'enable', 'disable', 'logs'].includes(action)) throw new Error('Unknown service action');
    const snapshot = await this.list();
    if (!snapshot.services.some(s => s.unit === unit && s.scope === scope && s.control)) throw new Error('Service is not registered on this host');
    if (this.platform === 'win32') {
      if (!/^RobOS-Services-[a-z-]+$/.test(unit)) throw new Error('Invalid task');
      if (action === 'logs') { const id = unit.slice('RobOS-Services-'.length); const file = path.join(this.dir, `${id}.log`); return { logs: fs.existsSync(file) ? fs.readFileSync(file, 'utf8').slice(-64000) : 'No log entries yet.' }; }
      const cmd = { start: 'Start', stop: 'Stop', enable: 'Enable', disable: 'Disable' }[action];
      await this.powershell(action === 'restart' ? `Stop-ScheduledTask -TaskName ${ps(unit)}; Start-ScheduledTask -TaskName ${ps(unit)}` : `${cmd}-ScheduledTask -TaskName ${ps(unit)} | Out-Null`);
    } else {
      if (!unitPattern.test(unit) || !['user', 'system'].includes(scope)) throw new Error('Invalid unit');
      if (action === 'logs') return { logs: await this.exec('journalctl', [...(scope === 'user' ? ['--user'] : []), '-u', unit, '-n', '100', '--no-pager', '-o', 'short-iso']) };
      if (scope === 'system') await this.exec('sudo', ['-n', 'systemctl', action, unit]);
      else await this.exec('systemctl', ['--user', action, unit]);
    }
    return this.list();
  }
  async linger() {
    if (this.platform !== 'linux') throw new Error('Linger is a Linux startup setting');
    await this.exec('sudo', ['-n', 'loginctl', 'enable-linger', os.userInfo().username]);
    return { linger: await this.exec('loginctl', ['show-user', os.userInfo().username, '-p', 'Linger', '--value']) };
  }
}
module.exports = { Manager, systemdArg, ps, unitFor, listenerRecords };
