'use strict';
const fs = require('node:fs');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const crypto = require('node:crypto');
async function download(item, destination, progress, signal) {
  const response = await fetch(item.url, { signal, redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}): ${item.label}`);
  const hash = crypto.createHash('sha256'); let received = 0;
  const meter = new Transform({ transform(chunk, _encoding, callback) {
    received += chunk.length;
    if (received > item.bytes) return callback(new Error('Download exceeds its published size'));
    hash.update(chunk); progress({ id: item.id, phase: 'Downloading', received, total: item.bytes }); callback(null, chunk);
  } });
  await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(destination, { flags: 'wx' }), { signal });
  if (received !== item.bytes || hash.digest('hex') !== item.sha256) throw new Error(`Checksum verification failed: ${item.label}`);
}
async function extract(archive, destination, unpackedBytes) {
  const tar = require('tar'); let size = 0, invalid;
  // Validate the complete archive before writing any payload. Throwing in tar's
  // asynchronous filter would escape the extraction promise.
  await tar.t({ file: archive, strict: true,
    filter(name, entry) {
      const normalized = name.replace(/\\/g, '/');
      if (/^(?:\/|[a-z]:)/i.test(normalized) || normalized.split('/').some(part => part === '..') ||
          /[\x00-\x1f:]/.test(normalized) || !['File', 'Directory'].includes(entry.type))
        invalid = new Error(`Unsafe archive entry: ${name}`);
      size += entry.size;
      if (size > unpackedBytes) invalid = new Error('Archive exceeds its published unpacked size');
      return false;
    },
  });
  if (invalid) throw invalid;
  await tar.x({ file: archive, cwd: destination, strict: true, preservePaths: false });
}
module.exports = { download, extract };
