'use strict';

// Feit Electric, Smart Life and other Tuya lights for Smart Home.
//
// Cloud, once: a signed request to Tuya's developer API lists the devices in the
// Smart Life account linked to the person's Tuya cloud project, with each device's
// local key. Tuya devices will not work on the local network without that key, and
// only Tuya's cloud hands it out.
//
// Network, for every command: Tuya's local protocol (versions 3.3, 3.4 and 3.5) on
// TCP 6668. Lights announce themselves with UDP broadcasts on 6666, 6667 and 7000.
//
// The developer keys and the local keys live in their own file, tuya.json (mode 0600),
// never in smart-lights.json: Config Sync copies that file and the local API serves it.

const crypto = require('node:crypto');
const dgram = require('node:dgram');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const STORE_FILE = 'tuya.json';
const LAN_PORT = 6668;
const BROADCAST_PORTS = [6666, 6667, 7000];
const REQUEST_TIMEOUT_MS = 15 * 1000;

// The data centers a Tuya cloud project can live in. The project's data center must
// match the region of the Smart Life account, or the account cannot be linked.
const TUYA_REGIONS = [
  { id: 'us', name: 'Western America', host: 'openapi.tuyaus.com' },
  { id: 'us-e', name: 'Eastern America', host: 'openapi-ueaz.tuyaus.com' },
  { id: 'eu', name: 'Central Europe', host: 'openapi.tuyaeu.com' },
  { id: 'eu-w', name: 'Western Europe', host: 'openapi-weaz.tuyaeu.com' },
  { id: 'in', name: 'India', host: 'openapi.tuyain.com' },
  { id: 'cn', name: 'China', host: 'openapi.tuyacn.com' },
];

// Tuya category codes for things that give light. Plugs and switches are listed too,
// since a lamp is often plugged into one.
const LIGHT_CATEGORIES = new Set(['dj', 'dd', 'xdd', 'fwd', 'dc', 'tgq', 'tyndj', 'sxd', 'gyd', 'fsd', 'tgkg', 'dsd', 'mbd', 'qjdcz']);
const SWITCH_CATEGORIES = new Set(['kg', 'cz', 'pc', 'tdq']);

// Commands of Tuya's local protocol.
const CMD = {
  SESS_KEY_NEG_START: 3,
  SESS_KEY_NEG_RESP: 4,
  SESS_KEY_NEG_FINISH: 5,
  CONTROL: 7,
  STATUS: 8,
  HEART_BEAT: 9,
  DP_QUERY: 10,
  CONTROL_NEW: 13,
  DP_QUERY_NEW: 16,
};

// The key every Tuya device uses for its broadcasts. It is public and the same everywhere.
const BROADCAST_KEY = crypto.createHash('md5').update('yGAdlopoPVldABfn').digest();

class TuyaError extends Error {
  constructor(message, code = 'tuya') {
    super(message);
    this.code = code;
  }
}

// ── Cloud ────────────────────────────────────────────────────────────────────

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** Tuya's request signature: HMAC-SHA256 over the ID, token, time and request, in upper-case hex. */
function signTuyaRequest({ accessId, accessSecret, accessToken = '', t, nonce = '', method, urlPath, body = '' }) {
  const stringToSign = [String(method).toUpperCase(), sha256Hex(body), '', urlPath].join('\n');
  return crypto
    .createHmac('sha256', accessSecret)
    .update(accessId + accessToken + t + nonce + stringToSign)
    .digest('hex')
    .toUpperCase();
}

function regionById(id) {
  return TUYA_REGIONS.find((r) => r.id === id) || null;
}

function explainTuyaError(json, region) {
  const code = Number(json?.code);
  const msg = String(json?.msg || 'unknown error');
  const where = regionById(region)?.name || region;
  if (code === 1004) {
    return 'Tuya rejected the Access ID or Access Secret. Copy both again from the Overview page of your cloud project.';
  }
  if (code === 2009 || code === 1005) {
    return `Tuya does not recognize this Access ID in the ${where} data center. Check the Access ID, and choose the data center your cloud project uses.`;
  }
  if (code === 1106 || code === 28841105 || code === 28841101 || code === 28841002) {
    return 'Your cloud project is not allowed to read devices. In the project, open Service API and add IoT Core (it has a free trial), then try again.';
  }
  return `Tuya said: ${msg} (code ${json?.code}).`;
}

function normalizeCloudDevice(d = {}) {
  const category = String(d.category || '');
  return {
    id: String(d.id || ''),
    name: String(d.name || d.customName || d.custom_name || d.product_name || d.productName || 'Tuya device'),
    localKey: String(d.local_key || d.localKey || ''),
    category,
    productName: String(d.product_name || d.productName || ''),
    productId: String(d.product_id || d.productId || ''),
    online: Boolean(d.online ?? d.isOnline),
    kind: LIGHT_CATEGORIES.has(category) ? 'light' : SWITCH_CATEGORIES.has(category) ? 'switch' : 'other',
  };
}

function createTuyaCloud({ accessId, accessSecret, region, fetchImpl = globalThis.fetch, now = () => Date.now(), baseUrl = null }) {
  const regionInfo = regionById(region);
  if (!baseUrl && !regionInfo) throw new TuyaError('Choose the data center of your Tuya cloud project.', 'region');
  const host = baseUrl || `https://${regionInfo.host}`;
  let token = '';

  async function call(method, urlPath, { auth = true } = {}) {
    const t = String(now());
    const accessToken = auth ? token : '';
    const sign = signTuyaRequest({ accessId, accessSecret, accessToken, t, method, urlPath });
    const headers = { client_id: accessId, sign, t, sign_method: 'HMAC-SHA256' };
    if (auth) headers.access_token = accessToken;
    let res;
    try {
      res = await fetchImpl(host + urlPath, { method, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      throw new TuyaError(`Could not reach Tuya at ${host} (${err.message}). Check this computer's internet connection.`, 'unreachable');
    }
    const json = await res.json().catch(() => null);
    if (!json) throw new TuyaError(`Tuya answered HTTP ${res.status} without data.`, 'bad-response');
    if (!json.success) throw new TuyaError(explainTuyaError(json, region), String(json.code));
    return json.result;
  }

  async function login() {
    const result = await call('GET', '/v1.0/token?grant_type=1', { auth: false });
    token = String(result?.access_token || '');
    if (!token) throw new TuyaError('Tuya did not return an access token.', 'bad-response');
  }

  // Every device in the Smart Life accounts linked to the project.
  async function listLinkedDevices() {
    const devices = [];
    let lastId = '';
    for (let page = 0; page < 50; page += 1) {
      const query = lastId ? `last_id=${encodeURIComponent(lastId)}&page_size=20` : 'page_size=20';
      const result = await call('GET', `/v2.0/cloud/thing/device?${query}`);
      const list = Array.isArray(result) ? result : Array.isArray(result?.list) ? result.list : [];
      devices.push(...list);
      if (list.length < 20) break;
      lastId = String(list[list.length - 1].id || '');
      if (!lastId) break;
    }
    return devices;
  }

  // The older listing, for projects created before the v2 API.
  async function listAssociatedDevices() {
    const devices = [];
    let lastRowKey = '';
    for (let page = 0; page < 50; page += 1) {
      const query = lastRowKey ? `last_row_key=${encodeURIComponent(lastRowKey)}&size=50` : 'size=50';
      const result = await call('GET', `/v1.0/iot-01/associated-users/devices?${query}`);
      devices.push(...(result?.devices || []));
      if (!result?.has_more || !result?.last_row_key) break;
      lastRowKey = String(result.last_row_key);
    }
    return devices;
  }

  async function listDevices() {
    await login();
    let raw = [];
    let firstError = null;
    try {
      raw = await listLinkedDevices();
    } catch (err) {
      if (err.code === 'unreachable' || err.code === '1004') throw err;
      firstError = err;
    }
    // Some projects only list linked-account devices through the older API.
    if (!raw.length) {
      try {
        raw = await listAssociatedDevices();
      } catch (err) {
        if (firstError) throw firstError;
      }
    }
    return raw.map(normalizeCloudDevice).filter((d) => d.id);
  }

  return { listDevices };
}

// ── Local protocol: frames ───────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function aesEcb(key, data, encrypt, pad = true) {
  const cipher = encrypt ? crypto.createCipheriv('aes-128-ecb', key, null) : crypto.createDecipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(pad);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

/** A 0x55AA frame (versions 3.1 to 3.4). 3.4 ends it with an HMAC instead of a CRC. */
function encode55aa({ seq, cmd, payload, hmacKey = null }) {
  const tailLen = hmacKey ? 32 : 4;
  const header = Buffer.alloc(16);
  header.writeUInt32BE(0x000055aa, 0);
  header.writeUInt32BE(seq >>> 0, 4);
  header.writeUInt32BE(cmd, 8);
  header.writeUInt32BE(payload.length + tailLen + 4, 12);
  const body = Buffer.concat([header, payload]);
  let check;
  if (hmacKey) {
    check = hmacSha256(hmacKey, body);
  } else {
    check = Buffer.alloc(4);
    check.writeUInt32BE(crc32(body), 0);
  }
  return Buffer.concat([body, check, Buffer.from('0000aa55', 'hex')]);
}

/** A 0x6699 frame (version 3.5): AES-GCM, with the header as additional data. */
function encode6699({ seq, cmd, plaintext, key, iv = crypto.randomBytes(12) }) {
  const header = Buffer.alloc(18);
  header.writeUInt32BE(0x00006699, 0);
  header.writeUInt16BE(0, 4);
  header.writeUInt32BE(seq >>> 0, 6);
  header.writeUInt32BE(cmd, 10);
  header.writeUInt32BE(12 + plaintext.length + 16, 14);
  const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
  cipher.setAAD(header.subarray(4));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([header, iv, ct, cipher.getAuthTag(), Buffer.from('00009966', 'hex')]);
}

/**
 * Splits a byte stream into frames. Returns { frames, rest } where each frame is
 * { kind: '55aa'|'6699', seq, cmd, body } and body is everything between header and tail.
 */
function splitFrames(buf, { hmac = false } = {}) {
  const frames = [];
  let offset = 0;
  while (buf.length - offset >= 20) {
    const prefix = buf.readUInt32BE(offset);
    if (prefix === 0x000055aa) {
      const len = buf.readUInt32BE(offset + 12);
      const total = 16 + len;
      if (buf.length - offset < total) break;
      const tailLen = (hmac ? 32 : 4) + 4;
      frames.push({
        kind: '55aa',
        seq: buf.readUInt32BE(offset + 4),
        cmd: buf.readUInt32BE(offset + 8),
        body: buf.subarray(offset + 16, offset + total - tailLen),
        raw: buf.subarray(offset, offset + total),
      });
      offset += total;
    } else if (prefix === 0x00006699) {
      const len = buf.readUInt32BE(offset + 14);
      const total = 18 + len + 4;
      if (buf.length - offset < total) break;
      frames.push({
        kind: '6699',
        seq: buf.readUInt32BE(offset + 6),
        cmd: buf.readUInt32BE(offset + 10),
        body: buf.subarray(offset + 18, offset + 18 + len),
        aad: buf.subarray(offset + 4, offset + 18),
        raw: buf.subarray(offset, offset + total),
      });
      offset += total;
    } else {
      // Not a frame start: skip a byte and look again.
      offset += 1;
    }
  }
  return { frames, rest: buf.subarray(offset) };
}

function decrypt6699(frame, key) {
  const iv = frame.body.subarray(0, 12);
  const tag = frame.body.subarray(frame.body.length - 16);
  const ct = frame.body.subarray(12, frame.body.length - 16);
  const decipher = crypto.createDecipheriv('aes-128-gcm', key, iv);
  decipher.setAAD(frame.aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

// A device puts a 4-byte return code (0 or 1) in front of what it sends.
function stripReturnCode(buf) {
  if (buf.length >= 4 && buf[0] === 0 && buf[1] === 0 && buf[2] === 0 && buf[3] <= 1) return buf.subarray(4);
  return buf;
}

// Control messages from 3.3 on carry "3.x" and 12 zero bytes in front of the data.
function stripVersionHeader(buf) {
  if (buf.length >= 15 && buf[0] === 0x33 && buf[1] === 0x2e) return buf.subarray(15);
  return buf;
}

function versionHeader(version) {
  return Buffer.concat([Buffer.from(version, 'ascii'), Buffer.alloc(12)]);
}

function parseJsonBuf(buf) {
  const text = buf.toString('utf8').replace(/\0+$/, '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ── Local protocol: discovery ────────────────────────────────────────────────

/** Reads one broadcast. Returns { id, ip, version, productKey } or null. */
function parseBroadcast(buf, fromIp) {
  try {
    const { frames } = splitFrames(buf);
    const frame = frames[0];
    if (!frame) return null;
    let json = null;
    if (frame.kind === '6699') {
      json = parseJsonBuf(stripReturnCode(decrypt6699(frame, BROADCAST_KEY)));
    } else {
      const body = stripReturnCode(frame.body);
      json = parseJsonBuf(body);
      if (!json) json = parseJsonBuf(aesEcb(BROADCAST_KEY, body, false));
    }
    if (!json?.gwId) return null;
    return {
      id: String(json.gwId),
      ip: String(json.ip || fromIp),
      version: String(json.version || '3.3'),
      productKey: String(json.productKey || ''),
    };
  } catch {
    return null;
  }
}

/** Listens for Tuya broadcasts. Lights send one every few seconds. */
function discoverTuyaDevices({ windowMs = 7000, ports = BROADCAST_PORTS } = {}) {
  return new Promise((resolve) => {
    const found = new Map();
    const sockets = [];
    const finish = () => {
      for (const s of sockets) {
        try {
          s.close();
        } catch {}
      }
      resolve([...found.values()]);
    };
    for (const port of ports) {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sockets.push(sock);
      sock.on('error', () => {});
      sock.on('message', (msg, rinfo) => {
        const device = parseBroadcast(msg, rinfo.address);
        if (device) found.set(device.id, device);
      });
      try {
        sock.bind(port);
      } catch {}
    }
    setTimeout(finish, windowMs);
  });
}

// ── Local protocol: one connection to one device ─────────────────────────────

class TuyaLanDevice {
  constructor({ id, ip, localKey, version = '3.3', port = LAN_PORT, timeoutMs = 5000 }) {
    if (!localKey || Buffer.from(localKey, 'utf8').length !== 16) {
      throw new TuyaError('This light has no valid local key. Find your lights again to fetch it.', 'no-key');
    }
    this.id = id;
    this.ip = ip;
    this.port = port;
    this.version = String(version);
    this.localKey = Buffer.from(localKey, 'utf8');
    this.sessionKey = null;
    this.timeoutMs = timeoutMs;
    this.seq = 1;
    this.buffer = Buffer.alloc(0);
    this.waiters = [];
    this.inbox = [];
    this.socket = null;
  }

  get v() {
    return Number.parseFloat(this.version) || 3.3;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.ip, port: this.port });
      this.socket = socket;
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new TuyaError(`No answer from the light at ${this.ip}. Check that it is powered on and on this network.`, 'unreachable'));
      }, this.timeoutMs);
      socket.once('connect', async () => {
        clearTimeout(timer);
        try {
          if (this.v >= 3.4) await this.negotiate();
          resolve(this);
        } catch (err) {
          this.close();
          reject(err);
        }
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(new TuyaError(`Could not connect to the light at ${this.ip} (${err.message}).`, 'unreachable'));
      });
      socket.on('data', (chunk) => this.onData(chunk));
      socket.on('close', () => this.failWaiters(new TuyaError('The light closed the connection. Its local key may be wrong; find your lights again.', 'closed')));
    });
  }

  close() {
    try {
      this.socket?.destroy();
    } catch {}
    this.socket = null;
  }

  failWaiters(err) {
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) {
      clearTimeout(w.timer);
      w.reject(err);
    }
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const { frames, rest } = splitFrames(this.buffer, { hmac: this.v >= 3.4 && this.v < 3.5 });
    this.buffer = Buffer.from(rest);
    for (const frame of frames) {
      let message;
      try {
        message = { cmd: frame.cmd, seq: frame.seq, payload: this.decryptFrame(frame) };
      } catch {
        message = { cmd: frame.cmd, seq: frame.seq, payload: null, undecodable: true };
      }
      const idx = this.waiters.findIndex((w) => w.match(message));
      if (idx >= 0) {
        const [w] = this.waiters.splice(idx, 1);
        clearTimeout(w.timer);
        w.resolve(message);
      } else {
        this.inbox.push(message);
      }
    }
  }

  waitFor(match, what) {
    const queued = this.inbox.findIndex(match);
    if (queued >= 0) return Promise.resolve(this.inbox.splice(queued, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.timer !== timer);
        reject(new TuyaError(`The light at ${this.ip} did not answer ${what}. Its local key may be wrong; find your lights again.`, 'timeout'));
      }, this.timeoutMs);
      this.waiters.push({ match, resolve, reject, timer });
    });
  }

  key() {
    return this.sessionKey || this.localKey;
  }

  decryptFrame(frame) {
    if (frame.kind === '6699') return stripReturnCode(decrypt6699(frame, this.key()));
    let body = stripReturnCode(frame.body);
    if (!body.length) return body;
    if (this.v >= 3.4) return aesEcb(this.key(), body, false);
    body = stripVersionHeader(body);
    if (body[0] === 0x7b) return body; // Plain JSON, sent by some 3.1 devices.
    return aesEcb(this.localKey, body, false);
  }

  send(cmd, plaintext) {
    const seq = this.seq;
    this.seq += 1;
    let frame;
    if (this.v >= 3.5) {
      frame = encode6699({ seq, cmd, plaintext, key: this.key() });
    } else if (this.v >= 3.4) {
      frame = encode55aa({ seq, cmd, payload: aesEcb(this.key(), plaintext, true), hmacKey: this.key() });
    } else {
      let payload = aesEcb(this.localKey, plaintext, true);
      if (cmd === CMD.CONTROL) payload = Buffer.concat([versionHeader(this.version), payload]);
      frame = encode55aa({ seq, cmd, payload });
    }
    this.socket.write(frame);
    return seq;
  }

  async negotiate() {
    const localNonce = crypto.randomBytes(16);
    this.send(CMD.SESS_KEY_NEG_START, localNonce);
    const resp = await this.waitFor((m) => m.cmd === CMD.SESS_KEY_NEG_RESP, 'the key exchange');
    if (!resp.payload || resp.payload.length < 48) {
      throw new TuyaError('The light refused the local key. Find your lights again to fetch a fresh key.', 'bad-key');
    }
    const payload = resp.payload.length >= 52 && resp.payload.length !== 48 ? resp.payload.subarray(resp.payload.length - 48) : resp.payload;
    const remoteNonce = payload.subarray(0, 16);
    const proof = payload.subarray(16, 48);
    if (!crypto.timingSafeEqual(proof, hmacSha256(this.localKey, localNonce))) {
      throw new TuyaError('The light refused the local key. Find your lights again to fetch a fresh key.', 'bad-key');
    }
    this.send(CMD.SESS_KEY_NEG_FINISH, hmacSha256(this.localKey, remoteNonce));
    const mixed = Buffer.alloc(16);
    for (let i = 0; i < 16; i += 1) mixed[i] = localNonce[i] ^ remoteNonce[i];
    if (this.v >= 3.5) {
      const cipher = crypto.createCipheriv('aes-128-gcm', this.localKey, localNonce.subarray(0, 12));
      this.sessionKey = Buffer.concat([cipher.update(mixed), cipher.final()]).subarray(0, 16);
    } else {
      this.sessionKey = aesEcb(this.localKey, mixed, true, false);
    }
  }

  async status() {
    const t = String(Math.floor(Date.now() / 1000));
    const query = { gwId: this.id, devId: this.id, uid: this.id, t };
    const cmd = this.v >= 3.4 ? CMD.DP_QUERY_NEW : CMD.DP_QUERY;
    this.send(cmd, Buffer.from(JSON.stringify(query)));
    const reply = await this.waitFor((m) => (m.cmd === cmd || m.cmd === CMD.STATUS) && dpsOf(m.payload), 'a status request');
    return dpsOf(reply.payload);
  }

  async setDps(dps) {
    const t = Math.floor(Date.now() / 1000);
    if (this.v >= 3.4) {
      const json = JSON.stringify({ protocol: 5, t, data: { dps } });
      this.send(CMD.CONTROL_NEW, Buffer.concat([versionHeader(this.version), Buffer.from(json)]));
      await this.waitFor((m) => m.cmd === CMD.CONTROL_NEW || m.cmd === CMD.STATUS, 'a command');
    } else {
      const json = JSON.stringify({ devId: this.id, uid: this.id, t: String(t), dps });
      this.send(CMD.CONTROL, Buffer.from(json));
      await this.waitFor((m) => m.cmd === CMD.CONTROL || m.cmd === CMD.STATUS, 'a command');
    }
  }
}

function dpsOf(payload) {
  if (!payload || !payload.length) return null;
  const json = parseJsonBuf(stripVersionHeader(payload));
  return json?.dps || json?.data?.dps || null;
}

// ── Light state ↔ data points ────────────────────────────────────────────────

const KELVIN_MIN = 2700;
const KELVIN_MAX = 6500;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, Number(v)));
}

/** Which data points a device uses: "v2" (20-24), "v1" (1-5) or "switch" (on/off only). */
function detectSchema(dps = {}) {
  if ('20' in dps) return 'v2';
  if ('1' in dps && ('3' in dps || '2' in dps)) return 'v1';
  if ('1' in dps) return 'switch';
  return 'v2';
}

function hexToRgb(hex) {
  const h = String(hex || '#ffffff').replace('#', '').padEnd(6, 'f');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsv({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: max ? d / max : 0, v: max };
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function hex4(n) {
  return Math.round(n).toString(16).padStart(4, '0');
}

/** The data points that make a device match a Smart Home light. */
function dpsFromLight(light, schema = 'v2') {
  const on = Boolean(light.on);
  const pct = clamp(light.brightness ?? 100, 1, 100);
  const kelvin = clamp(light.kelvin ?? 4000, KELVIN_MIN, KELVIN_MAX);
  const warmth = (kelvin - KELVIN_MIN) / (KELVIN_MAX - KELVIN_MIN);
  const colour = light.colorMode === 'rgb';
  if (schema === 'switch') return { 1: on };
  if (schema === 'v1') {
    if (!on) return { 1: false };
    if (colour) {
      const rgb = hexToRgb(light.colorHex);
      const hsv = rgbToHsv(rgb);
      const scaled = hsvToRgb(hsv.h, hsv.s, pct / 100);
      const legacy = `${rgbToHex(scaled).slice(1)}${hex4(hsv.h)}${Math.round(hsv.s * 255).toString(16).padStart(2, '0')}${Math.round((pct / 100) * 255).toString(16).padStart(2, '0')}`;
      return { 1: true, 2: 'colour', 5: legacy };
    }
    return { 1: true, 2: 'white', 3: Math.round(25 + ((pct - 1) / 99) * 230), 4: Math.round(warmth * 255) };
  }
  if (!on) return { 20: false };
  if (colour) {
    const hsv = rgbToHsv(hexToRgb(light.colorHex));
    return { 20: true, 21: 'colour', 24: `${hex4(hsv.h)}${hex4(hsv.s * 1000)}${hex4(pct * 10)}` };
  }
  return { 20: true, 21: 'white', 22: Math.round(10 + ((pct - 1) / 99) * 990), 23: Math.round(warmth * 1000) };
}

/** Reads a device's data points into Smart Home light fields. */
function lightFromDps(dps = {}, schema = detectSchema(dps)) {
  const out = {};
  if (schema === 'switch') {
    out.on = Boolean(dps['1']);
    return out;
  }
  const [sw, mode, bright, temp, colour] = schema === 'v1' ? ['1', '2', '3', '4', '5'] : ['20', '21', '22', '23', '24'];
  if (sw in dps) out.on = Boolean(dps[sw]);
  if (bright in dps) {
    const raw = Number(dps[bright]);
    out.brightness = Math.round(schema === 'v1' ? 1 + ((raw - 25) / 230) * 99 : 1 + ((raw - 10) / 990) * 99);
    out.brightness = clamp(out.brightness, 1, 100);
  }
  if (temp in dps) {
    const raw = Number(dps[temp]) / (schema === 'v1' ? 255 : 1000);
    out.kelvin = Math.round((KELVIN_MIN + raw * (KELVIN_MAX - KELVIN_MIN)) / 100) * 100;
  }
  out.colorMode = dps[mode] === 'colour' ? 'rgb' : 'kelvin';
  const c = dps[colour];
  if (out.colorMode === 'rgb' && typeof c === 'string') {
    if (schema === 'v2' && c.length >= 12) {
      const h = parseInt(c.slice(0, 4), 16);
      const s = parseInt(c.slice(4, 8), 16) / 1000;
      const v = parseInt(c.slice(8, 12), 16) / 1000;
      out.colorHex = rgbToHex(hsvToRgb(h, s, 1));
      out.brightness = clamp(Math.round(v * 100), 1, 100);
    } else if (c.length >= 6) {
      out.colorHex = `#${c.slice(0, 6)}`;
    }
  }
  return out;
}

// ── Saved keys and the service the app talks to ──────────────────────────────

function createTuyaService({ configDir, fetchImpl = globalThis.fetch, discover = discoverTuyaDevices, connectDevice = null, now } = {}) {
  const storePath = path.join(configDir, STORE_FILE);

  function readStore() {
    try {
      const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      return store && typeof store === 'object' ? store : null;
    } catch {
      return null;
    }
  }

  function writeStore(store) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    const tmp = `${storePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, storePath);
  }

  function getSetup() {
    const store = readStore();
    const connected = Boolean(store?.accessId && store?.accessSecret);
    return {
      connected,
      region: store?.region || 'us',
      accessIdEnding: connected ? String(store.accessId).slice(-4) : '',
      regions: TUYA_REGIONS.map(({ id, name }) => ({ id, name })),
    };
  }

  async function open(device) {
    const conn = connectDevice ? connectDevice(device) : new TuyaLanDevice(device);
    await conn.connect();
    return conn;
  }

  /**
   * Fetches the devices of the linked Smart Life account, saves their keys, and looks
   * for each one on this network. Credentials are saved only after Tuya accepts them.
   */
  async function findLights({ accessId, accessSecret, region } = {}) {
    const saved = readStore() || {};
    const creds = {
      accessId: String(accessId || saved.accessId || '').trim(),
      accessSecret: String(accessSecret || saved.accessSecret || '').trim(),
      region: String(region || saved.region || 'us'),
    };
    if (!creds.accessId || !creds.accessSecret) {
      return { ok: false, error: 'Enter the Access ID and Access Secret of your Tuya cloud project.' };
    }
    let devices;
    const scan = discover();
    try {
      devices = await createTuyaCloud({ ...creds, fetchImpl, now }).listDevices();
    } catch (err) {
      await scan;
      return { ok: false, error: err.message };
    }
    const keys = {};
    for (const d of devices) {
      if (d.localKey) keys[d.id] = { localKey: d.localKey, name: d.name };
    }
    writeStore({ ...creds, devices: keys, updatedAt: new Date().toISOString() });

    const onLan = new Map((await scan).map((d) => [d.id, d]));
    const order = { light: 0, switch: 1, other: 2 };
    const found = devices
      .map((d) => {
        const lan = onLan.get(d.id);
        return {
          id: d.id,
          name: d.name,
          kind: d.kind,
          productName: d.productName,
          cloudOnline: d.online,
          hasKey: Boolean(d.localKey),
          ip: lan?.ip || null,
          version: lan?.version || null,
        };
      })
      .sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
    if (!found.length) {
      return {
        ok: false,
        error: 'Tuya accepted your keys, but the linked Smart Life account has no devices. Check that you linked the account that paired the light (Devices, then Link App Account).',
      };
    }
    return { ok: true, devices: found };
  }

  function keyFor(id) {
    return readStore()?.devices?.[id]?.localKey || '';
  }

  /** Connects to a device to learn its data points and current state. */
  async function readDevice({ id, ip, version }) {
    const conn = await open({ id, ip, version, localKey: keyFor(id) });
    try {
      const dps = await conn.status();
      const schema = detectSchema(dps);
      return { schema, state: lightFromDps(dps, schema) };
    } finally {
      conn.close();
    }
  }

  /** Sends a Smart Home light's state to its Tuya device. Never throws. */
  async function sendLight(light) {
    try {
      const conn = await open({ id: light.deviceKey, ip: light.ip, version: light.tuyaVersion || '3.3', localKey: keyFor(light.deviceKey) });
      try {
        await conn.setDps(dpsFromLight(light, light.tuyaSchema || 'v2'));
      } finally {
        conn.close();
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  function forget() {
    try {
      fs.rmSync(storePath, { force: true });
    } catch {}
    return getSetup();
  }

  return { getSetup, findLights, readDevice, sendLight, forget, keyFor };
}

module.exports = {
  TUYA_REGIONS,
  LAN_PORT,
  CMD,
  BROADCAST_KEY,
  TuyaError,
  TuyaLanDevice,
  signTuyaRequest,
  createTuyaCloud,
  normalizeCloudDevice,
  encode55aa,
  encode6699,
  splitFrames,
  decrypt6699,
  crc32,
  aesEcb,
  hmacSha256,
  parseBroadcast,
  discoverTuyaDevices,
  detectSchema,
  dpsFromLight,
  lightFromDps,
  createTuyaService,
};
