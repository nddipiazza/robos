#!/usr/bin/env node
'use strict';
// RobOS Thunderbird Bridge — native messaging host.
// Thunderbird starts this process when the RobOS Bridge add-on calls connectNative() and
// keeps it for as long as Thunderbird runs. It relays between:
//   - Thunderbird: stdin/stdout, 4-byte little-endian length + UTF-8 JSON (native messaging)
//   - RobOS tools: a per-user local socket (Windows named pipe / Unix domain socket),
//     one JSON request per line, answered with one JSON line.
// No TCP port is opened, so only processes of this OS user can reach it.
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

function socketPath() {
  if (process.env.ROBOS_TB_BRIDGE_SOCKET) return process.env.ROBOS_TB_BRIDGE_SOCKET;
  if (process.platform === 'win32') return `\\\\.\\pipe\\robos-thunderbird-bridge-${os.userInfo().username}`;
  return path.join(os.homedir(), '.config', 'robos', 'thunderbird-bridge.sock');
}

const logFile = path.join(os.homedir(), '.config', 'robos', 'logs', 'thunderbird-bridge.log');
function log(line) {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
  } catch {}
}

// ── Thunderbird side ─────────────────────────────────────────────────────────
const pending = new Map();
let nextId = 1;

function toThunderbird(msg) {
  const body = Buffer.from(JSON.stringify(msg), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

let inbox = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  inbox = Buffer.concat([inbox, chunk]);
  while (inbox.length >= 4) {
    const len = inbox.readUInt32LE(0);
    if (inbox.length < 4 + len) break;
    const raw = inbox.subarray(4, 4 + len).toString('utf8');
    inbox = inbox.subarray(4 + len);
    let msg;
    try { msg = JSON.parse(raw); } catch { continue; }
    const waiter = pending.get(msg.id);
    if (waiter) {
      pending.delete(msg.id);
      clearTimeout(waiter.timer);
      waiter.resolve(msg);
    }
  }
});
// Thunderbird closed the port (quit, or add-on reloaded): stop serving.
process.stdin.on('end', () => shutdown('Thunderbird closed the bridge'));

function ask(request, timeoutMs) {
  const id = nextId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, error: `Thunderbird did not answer within ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);
    pending.set(id, { resolve, timer });
    toThunderbird({ ...request, id });
  });
}

// ── RobOS tools side ─────────────────────────────────────────────────────────
const where = socketPath();
const server = net.createServer((socket) => {
  let buf = '';
  socket.setEncoding('utf8');
  socket.on('data', async (data) => {
    buf += data;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let request;
      try { request = JSON.parse(line); } catch { socket.write(`${JSON.stringify({ ok: false, error: 'Invalid JSON request' })}\n`); continue; }
      const { id: clientId, timeoutMs, ...rest } = request;
      log(`request ${rest.action}${rest.action === 'send' ? ` to=${(rest.to || []).length} recipient(s)` : ''}`);
      const reply = await ask(rest, Math.min(Number(timeoutMs) || 120000, 600000));
      log(`reply ${rest.action} ok=${reply.ok}${reply.error ? ` error=${reply.error}` : ''}`);
      socket.write(`${JSON.stringify({ ...reply, id: clientId })}\n`);
    }
  });
  socket.on('error', () => {});
});

let listening = false;
function listen() {
  server.listen(where, () => { listening = true; log(`listening on ${where} (pid ${process.pid})`); });
}
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && process.platform !== 'win32') {
    // A stale socket file from a crashed host: remove it if nothing answers, then retry.
    const probe = net.connect(where);
    probe.once('connect', () => { probe.destroy(); shutdown('another bridge host is already serving'); });
    probe.once('error', () => { try { fs.unlinkSync(where); } catch {} listen(); });
    return;
  }
  shutdown(`cannot listen on ${where}: ${err.message}`);
});
listen();

function shutdown(reason) {
  log(`exit: ${reason}`);
  try { server.close(); } catch {}
  if (listening && process.platform !== 'win32') { try { fs.unlinkSync(where); } catch {} }
  process.exit(0);
}
