#!/usr/bin/env node
// Writes what the desktop's Config Sync code produces, so the phone's Kotlin port can be
// checked against it. Rerun after changing config-sync.js or config-sync-catalog.js:
//   node tools/export-golden.js
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const configSync = require('../../robos-lib/config-sync');
const catalog = require('../../robos-lib/config-sync-catalog');
const accounts = require('../../robos-lib/cloud-accounts');

const { encrypt, deriveKey, newKdf } = configSync._internal;
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// An encrypted vault as the desktop writes it, holding one smart-lights.json.
const passphrase = 'correct horse battery staple';
const kdf = newKdf();
const key = deriveKey(passphrase, kdf);
const lights = Buffer.from(JSON.stringify({ rooms: [{ id: 'kitchen', name: 'Kitchen' }], lights: [] }));
const sha = sha256(lights);
const blobId = crypto.createHmac('sha256', key).update(sha).digest('hex');
const inner = {
  format: configSync.FORMAT, kind: 'vault', id: 'v1', name: 'Home backup', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-06T12:00:00.000Z', generation: 3,
  files: { 'config/smart-lights.json': { sha, blob: blobId, size: lights.length, category: 'smart-home', mtime: 1, by: 'desk' } },
  history: [],
};
const outerEncrypted = { format: configSync.FORMAT, kind: 'vault', id: 'v1', encrypted: kdf, payload: encrypt(key, Buffer.from(JSON.stringify(inner))).toString('base64') };
const plainBlob = zlib.gzipSync(lights);

const golden = {
  scrypt: [
    { password: 'password', salt: 'NaCl', N: 1024, r: 8, p: 16, dkLen: 64 },
    { password: passphrase, salt: kdf.salt, N: 32768, r: 8, p: 1, dkLen: 32, saltBase64: true },
  ].map((c) => ({
    ...c,
    keyHex: crypto.scryptSync(c.password, c.saltBase64 ? Buffer.from(c.salt, 'base64') : Buffer.from(c.salt), c.dkLen, { N: c.N, r: c.r, p: c.p, maxmem: 256 * 1024 * 1024 }).toString('hex'),
  })),
  vault: {
    passphrase,
    keyHex: key.toString('hex'),
    outerEncrypted,
    outerPlain: { ...inner, files: { 'config/smart-lights.json': { ...inner.files['config/smart-lights.json'], blob: sha } } },
    blobEncryptedHex: encrypt(key, zlib.gzipSync(lights)).toString('hex'),
    blobPlainHex: plainBlob.toString('hex'),
    content: lights.toString('utf8'),
  },
  categories: catalog.CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  clientSecretSha256: sha256(accounts.getDefaultGDriveClientSecret()),
};

const out = path.join(__dirname, '..', 'app', 'src', 'test', 'resources', 'golden.json');
fs.writeFileSync(out, `${JSON.stringify(golden, null, 1)}\n`);
console.log(`Wrote ${out}`);
