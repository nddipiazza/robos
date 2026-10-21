'use strict';

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const {
  AUDIO_EXTENSIONS,
  trackFromMetadata,
  fallbackTrack,
} = require('./track-metadata');

let mm = null;
async function getParser() {
  if (!mm) {
    mm = await import('music-metadata');
  }
  return mm;
}

function walkDirectory(dir, audioFiles, shouldStop = () => false) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (shouldStop()) return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walkDirectory(fullPath, audioFiles, shouldStop);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTENSIONS.has(ext)) {
          audioFiles.push(fullPath);
        }
      }
    }
  } catch (err) {
    // Ignore unreadable dirs
  }
}

async function parseSingleFile(filePath, parser, coverCache = null) {
  try {
    const metadata = await parser.parseFile(filePath, { duration: true, skipCovers: false });
    return trackFromMetadata(filePath, metadata, parser, coverCache);
  } catch (err) {
    return fallbackTrack(filePath, err, coverCache);
  }
}

async function runScan(folders) {
  let isStopped = false;
  if (parentPort) {
    parentPort.on('message', (msg) => {
      if (msg === 'stop' || (msg && msg.type === 'stop')) {
        isStopped = true;
      }
    });
  }

  const audioFiles = [];
  const normalizedFolders = Array.isArray(folders) ? folders : [folders];

  for (const folder of normalizedFolders) {
    if (isStopped) break;
    if (fs.existsSync(folder)) {
      const stat = fs.statSync(folder);
      if (stat.isDirectory()) {
        walkDirectory(folder, audioFiles, () => isStopped);
      } else if (stat.isFile()) {
        const ext = path.extname(folder).toLowerCase();
        if (AUDIO_EXTENSIONS.has(ext)) {
          audioFiles.push(folder);
        }
      }
    }
  }

  if (parentPort) {
    parentPort.postMessage({
      type: 'discovered',
      total: audioFiles.length,
      folders: normalizedFolders
    });
  }

  if (audioFiles.length === 0) {
    if (parentPort) {
      parentPort.postMessage({
        type: 'done',
        tracks: [],
        artworks: [],
        totalFound: 0
      });
    }
    return;
  }

  const parser = await getParser();
  const allTracks = [];
  const batch = [];
  const batchArt = [];
  const sentArtIds = new Set();
  const coverCache = new Map();
  const BATCH_SIZE = 5;

  for (let i = 0; i < audioFiles.length; i++) {
    if (isStopped) break;
    const filePath = audioFiles[i];
    const { track, art } = await parseSingleFile(filePath, parser, coverCache);

    allTracks.push(track);
    batch.push(track);
    // Album tracks share one cover; only ship each image across the thread boundary once.
    if (art && !sentArtIds.has(art.artId)) {
      sentArtIds.add(art.artId);
      batchArt.push(art);
    }

    if (parentPort) {
      parentPort.postMessage({
        type: 'progress',
        current: i + 1,
        total: audioFiles.length,
        file: filePath,
        track
      });

      if (batch.length >= BATCH_SIZE || i === audioFiles.length - 1) {
        parentPort.postMessage({
          type: 'batch',
          tracks: [...batch],
          artworks: [...batchArt],
          current: i + 1,
          total: audioFiles.length
        });
        batch.length = 0;
        batchArt.length = 0;
      }
    }
  }

  if (parentPort) {
    parentPort.postMessage({
      type: 'done',
      tracks: allTracks,
      artworks: [], // already delivered with the batches
      totalFound: allTracks.length,
      canceled: isStopped
    });
  }
}

if (parentPort) {
  if (workerData && workerData.folders) {
    runScan(workerData.folders).catch(err => {
      parentPort.postMessage({ type: 'error', error: err.message });
    });
  }

  parentPort.on('message', (msg) => {
    if (msg && msg.type === 'start' && msg.folders) {
      runScan(msg.folders).catch(err => {
        parentPort.postMessage({ type: 'error', error: err.message });
      });
    }
  });
}

module.exports = { runScan, parseSingleFile, walkDirectory };
