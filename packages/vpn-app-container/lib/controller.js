'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns').promises;
const crypto = require('node:crypto');

const IMAGE = 'robos-vpn-app-container:0.1.0';
const APPS = Object.freeze({ qbittorrent: 'qBittorrent', transmission: 'Transmission' });
const containerName = id => {
  if (!Object.hasOwn(APPS, id)) throw new Error('Unsupported application');
  return `robos-vpn-${id}`;
};

function execute(binary, args, { input, timeout = 30000, combineOutput = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', errors = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${binary} timed out`)); }, timeout);
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-1000000); });
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-1000000); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.stdin.on('error', () => {});
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve((output + (combineOutput ? errors : '')).trim());
      else reject(new Error(errors.trim() || `${binary} exited ${code}`));
    });
    child.stdin.end(input);
  });
}

function parseProfile(text, readAdjacent) {
  const inline = tag => text.match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, 'i'))?.[1];
  // Only recognized values are extracted; the supplied profile is NEVER executed.
  const clean = text.replace(/<(ca|tls-auth)>[\s\S]*?<\/\1>/gi, '');
  const entries = clean.split(/\r?\n/).map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith(';'))
    .map(line => line.split(/\s+/));
  const get = key => entries.find(row => row[0] === key)?.slice(1);
  if (get('tls-crypt') || get('tls-crypt-v2') || get('cert') || get('key') || /<(tls-crypt|tls-crypt-v2|cert|key)>/i.test(text)) {
    throw new Error('This version supports username/password OpenVPN profiles with CA and optional tls-auth only');
  }
  if (get('dev') && !/^tun\d*$/.test(get('dev')[0])) throw new Error('A TUN profile is required');
  const remote = get('remote');
  if (!remote || !/^[a-zA-Z0-9.-]+$/.test(remote[0])) throw new Error('Profile needs a valid remote server');
  const protocol = remote[2] || get('proto')?.[0] || 'udp';
  if (!['udp', 'udp4', 'tcp', 'tcp-client', 'tcp4-client'].includes(protocol)) throw new Error('Unsupported protocol');
  const port = Number(remote[1] || get('port')?.[0] || 1194);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid server port');
  const adjacent = name => {
    name = name?.replace(/^"|"$/g, '');
    if (!name || /[\\/]/.test(name) || name === '..') throw new Error('Certificate must be beside the profile');
    return readAdjacent(name);
  };
  const ca = inline('ca') || adjacent(get('ca')?.[0]);
  if (!ca.includes('-----BEGIN CERTIFICATE-----')) throw new Error('Missing CA certificate');
  const tlsAuth = inline('tls-auth') || (get('tls-auth') ? adjacent(get('tls-auth')[0]) : undefined);
  if (tlsAuth && !tlsAuth.includes('-----BEGIN OpenVPN Static key V1-----')) throw new Error('Invalid tls-auth key');
  const direction = get('key-direction')?.[0] || get('tls-auth')?.[1];
  if (tlsAuth && direction && direction !== '1') throw new Error('Only client tls-auth key direction 1 is supported');
  const cipher = get('cipher')?.[0] || 'AES-256-CBC';
  const auth = get('auth')?.[0] || 'SHA256';
  if (!['AES-256-CBC', 'AES-256-GCM', 'AES-128-GCM'].includes(cipher)) throw new Error('Unsupported cipher');
  if (!['SHA1', 'SHA256', 'SHA512'].includes(auth)) throw new Error('Unsupported auth digest');
  return { hostname: remote[0], port, protocol: protocol.startsWith('tcp') ? 'tcp' : 'udp', ca, tlsAuth, cipher, auth };
}

function runArguments(id) {
  const name = containerName(id);
  const port = id === 'qbittorrent' ? 18080 : 18081;
  return ['run', '--detach', '--name', name,
    '--label', 'dev.robos.vpn-app-container=true', '--restart=no',
    '--network=bridge', '--read-only', '--cap-drop=ALL',
    ...['NET_ADMIN', 'SETUID', 'SETGID', 'SETPCAP', 'KILL', 'CHOWN', 'DAC_OVERRIDE'].map(cap => `--cap-add=${cap}`),
    '--security-opt=no-new-privileges:true', '--device=/dev/net/tun',
    '--sysctl=net.ipv6.conf.all.disable_ipv6=1', '--dns=1.1.1.1',
    '--tmpfs=/run:rw,nosuid,nodev,noexec,mode=755',
    '--tmpfs=/tmp:rw,nosuid,nodev,noexec,mode=1777',
    '--mount', `type=volume,source=${name}-data,target=/data`,
    '--publish', `127.0.0.1:${port}:8080/tcp`, '--pids-limit=256',
    '--memory=1g', IMAGE];
}

class Controller {
  constructor({ run = execute, resolve = hostname => dns.lookup(hostname, { family: 4 }), root = path.join(__dirname, '..') } = {}) {
    this.run = run;
    this.resolve = resolve;
    this.root = root;
    this.busy = new Set();
  }
  async prerequisites() {
    try {
      const value = await this.run('docker', ['info', '--format', '{{.OSType}}']);
      if (value !== 'linux') throw new Error('Docker must run Linux containers');
      return { ready: true, message: 'Linux Docker engine available' };
    } catch (error) { return { ready: false, message: `Linux Docker engine required: ${error.message}` }; }
  }
  async build() { return this.run('docker', ['build', '--tag', IMAGE, path.join(this.root, 'container')], { timeout: 600000 }); }
  async inspect(id) {
    const value = await this.run('docker', ['inspect', containerName(id)]);
    const info = JSON.parse(value)[0];
    if (info.Config.Labels?.['dev.robos.vpn-app-container'] !== 'true') throw new Error('Container is not managed by this app');
    return info;
  }
  async start(id, profile, credentials) {
    containerName(id);
    if (this.busy.has(id)) throw new Error('Launch already in progress');
    for (const key of ['username', 'password']) {
      if (typeof credentials[key] !== 'string' || !credentials[key] || /[\r\n\0]/.test(credentials[key])) throw new Error('Enter single-line VPN credentials');
    }
    this.busy.add(id);
    try {
      const { address } = await this.resolve(profile.hostname);
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(address)) throw new Error('IPv4 endpoint required');
      // Existing containers require an explicit Stop; never replace a running app.
      await this.run('docker', runArguments(id));
      const webPassword = crypto.randomBytes(24).toString('base64url');
      const payload = { ...profile, endpoint: address, app: id, ...credentials, webPassword };
      try {
        await this.run('docker', ['exec', '--interactive', containerName(id), 'python3', '-c',
          'import os,sys; from pathlib import Path; os.umask(0o077); p=Path("/run/vpn"); p.mkdir(mode=0o700,exist_ok=True); t=p/"bootstrap.tmp"; t.write_bytes(sys.stdin.buffer.read()); t.rename(p/"bootstrap.json")'],
        { input: JSON.stringify(payload) });
      } catch (error) {
        await this.stop(id);
        throw error;
      }
      return { message: 'Firewall and VPN checks must pass before the app starts', webPassword };
    } finally { this.busy.delete(id); }
  }
  async stop(id) {
    await this.inspect(id);
    // docker rm --force kills PID 1 and every remaining container process.
    return this.run('docker', ['rm', '--force', containerName(id)]);
  }
  async status(id) {
    try {
      const info = await this.inspect(id);
      const logs = await this.run('docker', ['logs', '--tail', '15', containerName(id)], { combineOutput: true });
      let state = info.State.Running ? 'starting' : 'stopped';
      for (const line of logs.split('\n')) {
        try { const item = JSON.parse(line); if (item.state) state = item.state; } catch {}
      }
      if (!info.State.Running) state = 'stopped';
      return { state, logs };
    } catch (error) { return { state: 'unavailable', logs: error.message }; }
  }
}
module.exports = { Controller, parseProfile, execute, runArguments, APPS };
