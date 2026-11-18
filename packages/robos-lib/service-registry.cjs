'use strict';
// Runtime evidence for listeners owned by a desktop app. No credentials or stop hooks.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const records = new Set();
process.once('exit', () => { for (const file of records) { try { fs.unlinkSync(file); } catch {} } });
function processStart(pid) { try { return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ').slice(1).join(') ').split(' ')[19]; } catch { return null; } }
function trackServer(server, { appId = path.basename(path.dirname(process.argv[1] || 'robos')), name = appId, kind = 'embedded' } = {}) {
  const dir = path.join(os.homedir(), '.config', 'robos', 'services', 'runtime');
  const key = crypto.randomUUID(); const file = path.join(dir, `${process.pid}-${key}.json`);
  const record = () => {
    try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.writeFileSync(file, JSON.stringify({ appId, name, kind, pid: process.pid, processStart: processStart(process.pid), endpoint: server.address(), startedAt: new Date().toISOString() }), { mode: 0o600 }); records.add(file); } catch {}
  };
  const cleanup = () => { try { fs.unlinkSync(file); } catch {} records.delete(file); };
  server.once('listening', record); if (server.listening) record();
  server.once('close', cleanup);
  return server;
}
// Called by dom-snapshot early in each desktop app's lifecycle; also covers dynamic Cast ports.
function instrumentListeners() {
  const net = require('node:net'); const marker = Symbol.for('robos.services.tracked');
  if (net.Server.prototype[marker]) return;
  Object.defineProperty(net.Server.prototype, marker, { value: true });
  const listen = net.Server.prototype.listen;
  net.Server.prototype.listen = function (...args) { trackServer(this, {}); return listen.apply(this, args); };
}
module.exports = { trackServer, instrumentListeners, processStart };
