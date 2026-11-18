'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { root, readJSON, writeJSON } = require('./store.cjs');
const { execute } = require('../cli.cjs');
function run(bin, args, input, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = '', size = 0;
    const timer = setTimeout(() => { child.kill(); reject(new Error('Operation timed out')); }, timeout);
    for (const [stream, isError] of [[child.stdout, false], [child.stderr, true]]) stream.on('data', c => {
      size += c.length; if (size > 4 * 1024 * 1024) { child.kill(); reject(new Error('Host response too large')); }
      else if (isError) error += c; else output += c;
    });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output.trim()) : reject(new Error(error.trim() || output.trim() || `Command exited ${code}`)); });
    child.stdin.on('error', () => {}); child.stdin.end(input || '');
  });
}
function validateHost(value) {
  const host = { id: String(value.id || '').trim(), name: String(value.name || value.address || '').trim(), address: String(value.address || '').trim(), user: String(value.user || '').trim(), port: Number(value.port || 22), identity: String(value.identity || '').trim() };
  if (!/^[a-z0-9-]{1,64}$/.test(host.id) || host.id === 'local') throw new Error('Use a unique host id containing lowercase letters, numbers and hyphens');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.:-]{0,252}$/.test(host.address) || !/^[a-z_][a-z0-9_-]{0,63}$/i.test(host.user)) throw new Error('Enter a valid host address and SSH username');
  if (!Number.isInteger(host.port) || host.port < 1 || host.port > 65535 || /[\r\n\0]/.test(host.identity) || !host.name || host.name.length > 100) throw new Error('Invalid host settings');
  return host;
}
const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
class Hosts {
  constructor(dir = root()) { this.dir = dir; }
  list() { return [{ id: 'local', name: 'This computer', local: true }, ...readJSON(path.join(this.dir, 'hosts.json'), [])]; }
  save(value) {
    const host = validateHost(value), others = this.list().filter(h => h.id !== 'local' && h.id !== host.id);
    writeJSON(path.join(this.dir, 'hosts.json'), [...others, host]); return this.list();
  }
  get(id) { const host = this.list().find(h => h.id === id); if (!host) throw new Error('Unknown host'); return host.local ? host : validateHost(host); }
  sshArgs(host) { return ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'StrictHostKeyChecking=yes', '-p', String(host.port), ...(host.identity ? ['-o', 'IdentitiesOnly=yes', '-i', host.identity] : []), `${host.user}@${host.address}`]; }
  async call(id, request) {
    const host = this.get(id);
    if (host.local) return execute(request);
    const output = await run('ssh', [...this.sshArgs(host), 'export PATH="$HOME/.local/share/robos/node/bin:$PATH"; exec node "$HOME/.local/share/robos/robos-services/cli.cjs" --rpc'], JSON.stringify(request));
    let response; try { response = JSON.parse(output); } catch { throw new Error('Host returned an invalid response; install RobOS Services first'); }
    if (!response.ok) throw new Error(response.error); return response.result;
  }
  async probe(id) {
    const host = this.get(id); if (host.local) return { hostname: os.hostname(), platform: process.platform };
    return { connection: await run('ssh', [...this.sshArgs(host), 'uname -s; hostname']) };
  }
  async install(id) {
    const host = this.get(id);
    if (host.local) {
      if (process.platform === 'linux') {
        await run('bash', [path.resolve(__dirname, '../install-server.sh')], undefined, 300000);
        return this.call(id, { command: 'list' });
      }
      return this.call(id, { command: 'install' });
    }
    const platform = await run('ssh', [...this.sshArgs(host), 'uname -s']);
    if (platform !== 'Linux') throw new Error('Remote installation currently supports Linux systemd hosts');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-services-'));
    try {
      const archive = path.join(temp, 'bundle.tar');
      await run('tar', ['-cf', archive, '--exclude=node_modules', '--exclude=tests', '-C', path.resolve(__dirname, '..'), '.'], undefined, 60000);
      await run('ssh', [...this.sshArgs(host), 'umask 077; mkdir -p "$HOME/.local/share/robos/robos-services"; tar -xf - -C "$HOME/.local/share/robos/robos-services"'], fs.readFileSync(archive), 60000);
      await run('ssh', [...this.sshArgs(host), 'bash "$HOME/.local/share/robos/robos-services/install-server.sh"'], undefined, 300000);
      return this.call(id, { command: 'list' });
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  }
  async key() {
    const file = path.join(os.homedir(), '.ssh', 'robos_services_ed25519');
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(file)) await run('ssh-keygen', ['-t', 'ed25519', '-f', file, '-N', '', '-C', 'RobOS Services management']);
    return { identity: file, publicKey: fs.readFileSync(file + '.pub', 'utf8').trim(), instruction: 'Authorize this public key in ~/.ssh/authorized_keys on the server. Verify the server fingerprint with its administrator before first connection.' };
  }
}
module.exports = { Hosts, validateHost, run, quote };
