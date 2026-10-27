/**
 * Worker thread that walks one or more root directories, reuses cached track
 * entries whose (size, mtimeMs) have not changed, and parses only new/modified
 * movie/video files in batches — posting progress messages back to the main thread.
 */

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { AUDIO_EXTENSIONS, readTrackMetadata } = require('./track-metadata');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.cache', '.local', '.npm', '.cargo',
  '.rustup', '__pycache__', 'Trash', '.Trash', 'snap'
]);

function walkMediaFiles(rootDir, maxFiles = 200000, out = []) {
  const stack = [rootDir];
  while (stack.length > 0 && out.length < maxFiles) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTENSIONS.has(ext)) {
          out.push(full);
          if (out.length >= maxFiles) break;
        }
      }
    }
  }
  return out;
}

async function run() {
  const {
    directories = [],
    files = [],
    artDir = null,
    existingByPath = {},
    batchSize = 200
  } = workerData || {};

  const discovered = [...files];
  for (const dir of directories) {
    if (dir && fs.existsSync(dir)) {
      walkMediaFiles(dir, 200000, discovered);
    }
  }

  const total = discovered.length;
  if (parentPort) {
    parentPort.postMessage({ type: 'discovered', total });
  }

  const folderArtCache = new Map();
  let batch = [];
  let reused = 0;
  let parsed = 0;

  for (let i = 0; i < discovered.length; i++) {
    const filePath = discovered[i];
    let st = null;
    try {
      st = fs.statSync(filePath);
    } catch (_) {
      continue;
    }
    const mtimeMs = Math.floor(st.mtimeMs || 0);
    const cached = existingByPath[filePath];
    if (cached && cached.size === st.size && cached.mtimeMs === mtimeMs) {
      batch.push(cached);
      reused++;
    } else {
      const track = await readTrackMetadata(filePath, { artDir, stat: st, folderArtCache });
      batch.push(track);
      parsed++;
    }

    if (batch.length >= batchSize) {
      if (parentPort) {
        parentPort.postMessage({
          type: 'batch',
          tracks: batch,
          processed: i + 1,
          total,
          reused,
          parsed
        });
      }
      batch = [];
    }
  }

  if (batch.length > 0 && parentPort) {
    parentPort.postMessage({
      type: 'batch',
      tracks: batch,
      processed: total,
      total,
      reused,
      parsed
    });
  }

  if (parentPort) {
    parentPort.postMessage({ type: 'done', total, reused, parsed });
  }
}

run().catch(err => {
  if (parentPort) {
    parentPort.postMessage({ type: 'error', error: err.message || String(err) });
  }
});
