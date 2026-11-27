#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { isIP } = require('node:net');
const { X509Certificate, createHash, randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const { DEFAULT_PORT, DEVICE_ID, DEVICE_TOKEN, boundedText, validateProfile, readJSON, writeJSON } = require('../lib/profile-schema.cjs');

const digest = value => createHash('sha256').update(value).digest('hex');
const secret = bytes => randomBytes(bytes).toString('hex');
const profileAt = dir => validateProfile(readJSON(path.join(dir, 'profile.json')));
const certAt = dir => fs.readFileSync(path.join(dir, 'cert.pem'));
const inviteAt = (dir, code) => path.join(dir, 'invites', digest(code) + '.json');
const deviceAt = (dir, id) => path.join(dir, 'devices', id + '.json');

function issueInvite(dir, stateDir = dir) {
  profileAt(dir);
  const fingerprint = digest(new X509Certificate(certAt(stateDir)).raw);
  const code = secret(16);
  writeJSON(inviteAt(stateDir, code), { expires: Date.now() + 15 * 60_000 });
  return 'robos1.' + fingerprint + '.' + code;
}

function enroll(dir, stateDir, body) {
  const { code, name } = body || {};
  if (typeof code !== 'string' || !/^[a-f0-9]{32}$/.test(code) || !boundedText(name, 100)) return null;
  const file = inviteAt(stateDir, code);
  const invite = readJSON(file, null);
  if (!invite) return null;
  try { fs.unlinkSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (invite.expires <= Date.now()) return null;
  const profile = profileAt(dir);
  const id = randomUUID();
  const token = id + '.' + secret(32);
  writeJSON(deviceAt(stateDir, id), { id, name, hash: digest(token), pairedAt: new Date().toISOString() });
  return { token, profile };
}

function canReadProfile(dir, auth) {
  if (!auth?.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  const match = DEVICE_TOKEN.exec(token);
  if (!match) return false;
  const device = readJSON(deviceAt(dir, match[1]), null);
  return device && timingSafeEqual(Buffer.from(device.hash, 'hex'), Buffer.from(digest(token), 'hex'));
}

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2048) throw new Error('Invalid enrollment request');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function createServer(dir, stateDir = dir) {
  profileAt(dir);
  return https.createServer({
    cert: certAt(stateDir), key: fs.readFileSync(path.join(stateDir, 'key.pem')),
    minVersion: 'TLSv1.2', headersTimeout: 5000, requestTimeout: 10000, connectionsCheckingInterval: 1000,
  }, async (request, response) => {
    try {
      if (request.method === 'POST' && request.url === '/v1/pair') {
        let body;
        try { body = await readBody(request); }
        catch { return send(response, 400, { error: 'Invalid enrollment request' }); }
        const pair = enroll(dir, stateDir, body);
        return pair ? send(response, 200, pair) : send(response, 401, { error: 'Pairing code is invalid, expired, or already used' });
      }
      if (request.method === 'GET' && request.url === '/v1/profile') {
        return canReadProfile(stateDir, request.headers.authorization) ?
          send(response, 200, { profile: profileAt(dir) }) :
          send(response, 401, { error: 'Device authorization is invalid or was revoked' });
      }
      return send(response, 404, { error: 'Unknown setup endpoint' });
    } catch {
      return send(response, 500, { error: 'Could not read RobOS setup data' });
    }
  });
}

function main() {
  const dir = process.env.ROBOS_SETUP_HOME || path.join(os.homedir(), '.config/robos/client-setup');
  const stateDir = process.env.ROBOS_SETUP_STATE || path.join(os.homedir(), '.local/share/robos/client-setup/state');
  const [command, arg] = process.argv.slice(2);
  if (command === 'invite') return console.log(issueInvite(dir, stateDir));
  if (command === 'devices') {
    const devices = path.join(stateDir, 'devices');
    const ids = fs.existsSync(devices) ? fs.readdirSync(devices) : [];
    return console.log(JSON.stringify(ids.filter(file => DEVICE_ID.test(path.basename(file, '.json')) && file.endsWith('.json')).map(file => {
      const { id, name, pairedAt } = readJSON(path.join(devices, file));
      return { id, name, pairedAt };
    }), null, 2));
  }
  if (command === 'revoke') {
    if (typeof arg !== 'string' || !DEVICE_ID.test(arg)) throw new Error('Enter a valid device ID');
    fs.unlinkSync(deviceAt(stateDir, arg));
    return;
  }
  if (command !== 'serve') throw new Error('Use serve, invite, devices, or revoke DEVICE_ID');
  const { host, port = DEFAULT_PORT } = readJSON(path.join(dir, 'server.json'));
  if (typeof host !== 'string' || isIP(host) !== 4 || host === '0.0.0.0' ||
      !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Set a specific IPv4 address and unprivileged port in server.json');
  const server = createServer(dir, stateDir);
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, host, () => console.log('RobOS client setup listening on ' + host + ':' + port));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { createServer, issueInvite };
