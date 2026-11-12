'use strict';

/**
 * Generates and caches a local self-signed X.509 TLS certificate for the
 * RobOS AI Multiplayer Game Theater HTTPS Web Client server (:19229).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

function detectLanIp() {
  const nets = os.networkInterfaces();
  let fallback = '127.0.0.1';
  for (const [name, addrs] of Object.entries(nets)) {
    for (const addr of addrs || []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      if (/^(docker|br-|veth|virbr|tun|tap)/i.test(name)) continue;
      if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(addr.address)) {
        return addr.address;
      }
      fallback = addr.address;
    }
  }
  return fallback;
}

function ensureTheaterTlsCert(tlsDir, lanIp = detectLanIp()) {
  fs.mkdirSync(tlsDir, { recursive: true });
  const keyPath = path.join(tlsDir, 'key.pem');
  const certPath = path.join(tlsDir, 'cert.pem');
  const metaPath = path.join(tlsDir, 'meta.json');

  try {
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
      if (!lanIp || meta.lanIp === lanIp) {
        return {
          key: fs.readFileSync(keyPath, 'utf8'),
          cert: fs.readFileSync(certPath, 'utf8'),
          keyPath,
          certPath,
        };
      }
    }
  } catch {}

  const sanParts = ['DNS:localhost', 'IP:127.0.0.1'];
  if (lanIp && lanIp !== '127.0.0.1' && /^\d+\.\d+\.\d+\.\d+$/.test(lanIp)) {
    sanParts.push(`IP:${lanIp}`);
  }

  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-days',
      '825',
      '-subj',
      '/CN=RobOS AI Multiplayer Game Theater/O=RobOS',
      '-addext',
      `subjectAltName=${sanParts.join(',')}`,
      '-keyout',
      keyPath,
      '-out',
      certPath,
    ],
    { stdio: 'ignore', timeout: 15000 },
  );

  try {
    fs.chmodSync(keyPath, 0o600);
    fs.writeFileSync(metaPath, JSON.stringify({ lanIp, createdAt: new Date().toISOString() }, null, 2));
  } catch {}

  return {
    key: fs.readFileSync(keyPath, 'utf8'),
    cert: fs.readFileSync(certPath, 'utf8'),
    keyPath,
    certPath,
  };
}

module.exports = {
  detectLanIp,
  ensureTheaterTlsCert,
};
