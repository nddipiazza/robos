'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const tls = require('node:tls');
const { createHash } = require('node:crypto');
const { isIP } = require('node:net');
const { DEFAULT_PORT, INVITE, DEVICE_TOKEN, validateProfile, readJSON, writeJSON } = require('./profile-schema.cjs');

function parseAddress(value) {
  const [host, rawPort, extra] = String(value).trim().split(':');
  const port = rawPort === undefined ? DEFAULT_PORT : Number(rawPort);
  if (isIP(host) !== 4 || host === '0.0.0.0' || extra !== undefined ||
      !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Enter the server IPv4 address, optionally followed by its port');
  }
  return { host, port };
}

function requestSetup({ host, port, fingerprint }, route, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const agent = new https.Agent();
    // Release the connection to HTTP only after the certificate from the invite matches.
    agent.createConnection = (_options, callback) => {
      const socket = tls.connect({ host, port, rejectUnauthorized: false, minVersion: 'TLSv1.2' });
      const timer = setTimeout(() => socket.destroy(new Error('RobOS server connection timed out')), 5000);
      const fail = error => { clearTimeout(timer); callback(error); };
      socket.once('error', fail);
      socket.once('secureConnect', () => {
        clearTimeout(timer);
        socket.removeListener('error', fail);
        const cert = socket.getPeerCertificate();
        const actual = cert.raw && createHash('sha256').update(cert.raw).digest('hex');
        if (actual !== fingerprint) {
          socket.destroy();
          callback(new Error('The server identity does not match the pairing code'));
        } else callback(null, socket);
      });
    };
    const data = body && JSON.stringify(body);
    const req = https.request({ hostname: host, port, path: route, method: body ? 'POST' : 'GET', agent,
      signal: AbortSignal.timeout(10000),
      headers: {
        ...(data && { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }),
        ...(token && { Authorization: 'Bearer ' + token }),
      },
    }, async response => {
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of response) {
          size += chunk.length;
          if (size > 32 * 1024) throw new Error('RobOS server response is too large');
          chunks.push(chunk);
        }
        const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (response.statusCode !== 200) throw new Error(result.error || 'The setup request failed');
        resolve(result);
      } catch (error) { reject(error); }
      finally { agent.destroy(); }
    });
    req.once('error', error => { agent.destroy(); reject(error); });
    req.end(data);
  });
}

class ServerProfile {
  constructor({ dataDir, configDir, storage, deviceName }) {
    this.file = path.join(dataDir, 'server-profile.json');
    this.settingsFile = path.join(configDir, 'settings.json');
    this.storage = storage;
    this.deviceName = deviceName;
    this.pending = false;
  }

  requireSecureStorage() {
    if (!this.storage.isEncryptionAvailable() || this.storage.getSelectedStorageBackend?.() === 'basic_text') {
      throw new Error('Unlock the system credential store before pairing with a RobOS server');
    }
  }

  state() {
    const cache = readJSON(this.file, null);
    if (!cache) return null;
    return { address: cache.address, profile: validateProfile(cache.profile), fetchedAt: cache.fetchedAt };
  }

  async fetchProfile(operation) {
    if (this.pending) throw new Error('A server request is already in progress');
    this.pending = true;
    try { return await operation(); }
    finally { this.pending = false; }
  }

  pair(address, pairingCode) {
    return this.fetchProfile(async () => {
      const { host, port } = parseAddress(address);
      const invite = typeof pairingCode === 'string' && INVITE.exec(pairingCode.trim().toLowerCase());
      if (!invite) throw new Error('Enter a valid RobOS pairing code');
      if (readJSON(this.file, null)) throw new Error('Disconnect the current RobOS server before pairing again');
      this.requireSecureStorage();
      const [, fingerprint, code] = invite;
      const result = await requestSetup({ host, port, fingerprint }, '/v1/pair', { body: { code, name: this.deviceName } });
      if (typeof result.token !== 'string' || !DEVICE_TOKEN.test(result.token)) throw new Error('Invalid device credential from the server');
      const credential = this.storage.encryptString(result.token).toString('base64');
      return this.save({ address: port === DEFAULT_PORT ? host : host + ':' + port, fingerprint, credential }, result.profile);
    });
  }

  refresh() {
    return this.fetchProfile(async () => {
      const cache = readJSON(this.file, null);
      if (!cache) throw new Error('Pair with a RobOS server first');
      this.requireSecureStorage();
      const token = this.storage.decryptString(Buffer.from(cache.credential, 'base64'));
      const result = await requestSetup({ ...parseAddress(cache.address), fingerprint: cache.fingerprint }, '/v1/profile', { token });
      return this.save(cache, result.profile);
    });
  }

  save(cache, value) {
    const profile = validateProfile(value);
    writeJSON(this.file, { ...cache, profile, fetchedAt: new Date().toISOString() });
    return this.state();
  }

  disconnect() {
    if (this.pending) throw new Error('Wait for the server request to finish');
    fs.rmSync(this.file, { force: true });
  }

  applySettings(profile) {
    const { settings } = validateProfile(profile);
    if (!Object.keys(settings).length) return;
    const current = readJSON(this.settingsFile, {});
    if (!current || typeof current !== 'object' || Array.isArray(current)) throw new Error('RobOS Preferences contains invalid settings');
    writeJSON(this.settingsFile, { ...current, ...settings });
  }
}

module.exports = { ServerProfile, requestSetup };
