'use strict';
// Finding and talking to a Bluetooth OBD adapter. Classic Bluetooth serial (RFCOMM) goes through
// obd_bridge.py because Node has no RFCOMM sockets; ROBOS_AUTO_OBD_REPLAY swaps in a recorded adapter for tests.
const fs = require('node:fs'), path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { Elm327 } = require('./obd');
const run = promisify(execFile);
// Names OBD adapters advertise. Dual-mode vLinkers also show a "-IOS" Bluetooth LE twin, which has no serial port.
const ADAPTER_NAME = /obd|elm ?327|v-?link|vgate|icar|veepeak|konnwei|obdlink|bafx|carista|kiwi|scan ?tool/i;
const ADDRESS = /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/i;

async function bluetoothScan(seconds = 20) {
  try { await run('bluetoothctl', ['--timeout', String(seconds), 'scan', 'on'], { timeout: (seconds + 10) * 1000 }); }
  catch (e) { if (e.code === 'ENOENT') throw new Error('Bluetooth tools (bluetoothctl) are not installed on this computer'); }
  const { stdout } = await run('bluetoothctl', ['devices'], { timeout: 10000 });
  return stdout.split('\n').map(l => l.match(/^Device ([0-9A-F:]{17}) (.+)$/i)).filter(Boolean).map(([, address, name]) => ({ address: address.toUpperCase(), name: name.trim() }))
    .filter(d => ADAPTER_NAME.test(d.name) && !/-IOS$/i.test(d.name));
}

class BluetoothTransport {
  constructor(address, channel = 1) { this.address = address; this.channel = channel; this.waiting = []; }
  open() {
    if (!ADDRESS.test(this.address)) return Promise.reject(new Error('Invalid Bluetooth address'));
    return new Promise((resolve, reject) => {
      const child = spawn('python3', ['-I', path.join(__dirname, '../obd_bridge.py'), this.address, String(this.channel)], { stdio: ['pipe', 'pipe', 'pipe'] });
      this.child = child; let buffer = '', ready = false, stderr = '';
      child.stderr.on('data', d => { stderr += d; });
      child.stdout.on('data', chunk => {
        buffer += chunk; let i;
        while ((i = buffer.indexOf('\n')) >= 0) {
          const msg = JSON.parse(buffer.slice(0, i)); buffer = buffer.slice(i + 1);
          if (!ready) { if (msg.ready) { ready = true; resolve(); } else reject(new Error(friendly(msg.error))); continue; }
          const w = this.waiting.shift(); if (w) msg.ok ? w.resolve(msg.text) : w.reject(new Error(msg.error || 'Adapter error'));
        }
      });
      child.on('exit', () => { this.child = null; if (!ready) reject(new Error(friendly(stderr.trim() || 'Could not reach the adapter'))); for (const w of this.waiting.splice(0)) w.reject(new Error('The adapter disconnected')); });
    });
  }
  send(cmd, timeoutMs) {
    if (!this.child) return Promise.reject(new Error('The adapter is not connected'));
    return new Promise((resolve, reject) => { this.waiting.push({ resolve, reject }); this.child.stdin.write(JSON.stringify({ cmd, timeout: timeoutMs / 1000 }) + '\n'); });
  }
  close() { if (this.child) { this.child.stdin.end(); this.child.kill(); this.child = null; } }
}
function friendly(error) {
  const e = String(error || '');
  if (/Host is down|No route|timed out|Connection refused/i.test(e)) return 'Could not reach the adapter. Make sure it is plugged in, its light is on, and no phone app is connected to it.';
  if (/Device or resource busy/i.test(e)) return 'The adapter is busy. Close any phone app using it and try again.';
  return e || 'Could not reach the adapter';
}

// A recorded adapter: { adapters: [...], responses: { cmd: text }, after: { cmd: { cmd: text } } }.
// "after" replaces responses once that command has been sent, e.g. codes are gone after "04".
class ReplayTransport {
  constructor(file) { this.recording = JSON.parse(fs.readFileSync(file, 'utf8')); this.sent = []; }
  async open() {}
  async send(cmd) {
    this.sent.push(cmd); let text = this.recording.responses[cmd];
    for (const [trigger, overlay] of Object.entries(this.recording.after || {})) if (this.sent.slice(0, -1).includes(trigger) && overlay[cmd] != null) text = overlay[cmd];
    return text ?? (cmd.startsWith('AT') ? 'OK' : 'NO DATA');
  }
  close() {}
}

// ROBOS_AUTO_OBD_RECORD=<file> saves every reply in the replay format above, to capture a car for tests.
function recorder(transport, file, adapter) {
  const recording = { _note: 'Recorded ' + new Date().toISOString(), adapters: [adapter], responses: {} };
  return { send: async (cmd, timeoutMs) => { const text = await transport.send(cmd, timeoutMs); if (!(cmd in recording.responses)) { recording.responses[cmd] = text; fs.writeFileSync(file, JSON.stringify(recording, null, 1)); } return text; } };
}

class ObdLink {
  constructor({ replay = process.env.ROBOS_AUTO_OBD_REPLAY } = {}) { this.replay = replay || null; this.transport = null; this.elm = null; this.state = null; }
  async scan() { return this.replay ? JSON.parse(fs.readFileSync(this.replay, 'utf8')).adapters : bluetoothScan(); }
  async connect({ address, name, protocol } = {}) {
    if (!this.replay && !ADDRESS.test(String(address || ''))) throw new Error('Choose an adapter');
    this.disconnect();
    const transport = this.replay ? new ReplayTransport(this.replay) : new BluetoothTransport(address.toUpperCase());
    await transport.open(); this.transport = transport; this.elm = new Elm327(process.env.ROBOS_AUTO_OBD_RECORD ? recorder(transport, process.env.ROBOS_AUTO_OBD_RECORD, { name, address }) : transport);
    try { const r = await this.elm.init(protocol); this.state = { name: String(name || 'OBD adapter').slice(0, 100), address, ...r }; }
    catch (e) { this.disconnect(); throw e; }
    return this.status();
  }
  status() { return this.state ? { connected: true, ...this.state } : { connected: false }; }
  // Re-probe the car without reconnecting Bluetooth, e.g. after the key is turned to ON.
  async retry() { this.need(); const r = await this.elm.init(this.state.vehicle.protocol); this.state = { ...this.state, ...r }; return this.status(); }
  need(car = false) {
    if (!this.elm) throw new Error('Connect to an OBD adapter first');
    if (car && !this.state.vehicle.connected) throw new Error('The adapter is connected, but the car is not answering. Turn the key to ON and press Try the car again.');
  }
  async readCodes() { this.need(true); return { ...(await this.elm.readCodes()), voltage: await this.elm.voltage() }; }
  async live() { this.need(true); return { readings: await this.elm.live(), at: new Date().toISOString() }; }
  async clearCodes() { this.need(true); await this.elm.clearCodes(); return this.readCodes(); }
  disconnect() { if (this.transport) this.transport.close(); this.transport = null; this.elm = null; this.state = null; return { connected: false }; }
}
module.exports = { ObdLink, ReplayTransport, BluetoothTransport, bluetoothScan, ADAPTER_NAME };
