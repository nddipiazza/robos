'use strict';

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.flac', '.ogg', '.wav', '.aac', '.opus', '.wma']);

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

async function parseSingleFile(filePath, parser) {
  try {
    const metadata = await parser.parseFile(filePath, { duration: true, skipCovers: false });
    const common = metadata.common || {};
    const format = metadata.format || {};

    let artId = null;
    let artBuffer = null;
    let artFormat = null;
    const cover = parser.selectCover(common.picture);
    if (cover && cover.data) {
      artId = `art_${Buffer.from(filePath).toString('base64url').slice(0, 16)}`;
      artBuffer = cover.data;
      artFormat = cover.format || 'image/jpeg';
    }

    return {
      track: {
        id: `trk_${Buffer.from(filePath).toString('base64url').slice(0, 16)}`,
        filePath,
        title: common.title || path.parse(filePath).name,
        artist: common.artist || common.albumartist || 'Unknown Artist',
        album: common.album || 'Unknown Album',
        year: common.year || null,
        genre: (common.genre && common.genre[0]) || null,
        trackNumber: common.track?.no || null,
        duration: format.duration || 0,
        bitrate: format.bitrate || 0,
        sampleRate: format.sampleRate || 0,
        artId,
        src: `file://${filePath}`
      },
      art: artBuffer ? { artId, buffer: artBuffer, format: artFormat } : null
    };
  } catch (err) {
    return {
      track: {
        id: `trk_${Buffer.from(filePath).toString('base64url').slice(0, 16)}`,
        filePath,
        title: path.parse(filePath).name,
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        duration: 0,
        src: `file://${filePath}`,
        error: err.message
      },
      art: null
    };
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
  const allArtworks = [];
  const batch = [];
  const batchArt = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < audioFiles.length; i++) {
    if (isStopped) break;
    const filePath = audioFiles[i];
    const { track, art } = await parseSingleFile(filePath, parser);

    allTracks.push(track);
    batch.push(track);
    if (art) {
      allArtworks.push(art);
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
      artworks: allArtworks,
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
