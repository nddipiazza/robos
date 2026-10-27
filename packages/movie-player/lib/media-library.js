/**
 * Media Library & Playlist Manager for RobOS Movie Player
 *
 * Scales to 100,000+ movies, series episodes, and videos by:
 *   1. Offloading filesystem traversal + tag/container parsing to `lib/scan-worker.js`
 *   2. Caching poster art as content-addressed files in ~/.cache/robos/movie-player/art
 *   3. Storing only lightweight metadata in ~/.config/robos/movie-library.json
 *   4. Indexing everything in `LibraryIndex` for sub-15ms filtered/sorted queries
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');
const { AUDIO_EXTENSIONS, readTrackMetadata } = require('./track-metadata');
const { LibraryIndex } = require('./library-index');

const CONFIG_DIR = path.join(os.homedir(), '.config', 'robos');
const LIBRARY_FILE = path.join(CONFIG_DIR, 'movie-library.json');
const PLAYLISTS_FILE = path.join(CONFIG_DIR, 'movie-playlists.json');
const STATS_FILE = path.join(CONFIG_DIR, 'movie-track-stats.json');
const ART_CACHE_DIR = path.join(os.homedir(), '.cache', 'robos', 'movie-player', 'art');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(ART_CACHE_DIR)) {
    fs.mkdirSync(ART_CACHE_DIR, { recursive: true });
  }
}

function getArtPath(artId) {
  if (!artId) return null;
  const safe = path.basename(artId);
  const full = path.join(ART_CACHE_DIR, safe);
  return fs.existsSync(full) ? full : null;
}

/**
 * Scan a directory synchronously on the calling thread (used for small tests / fallback).
 */
async function scanDirectory(dirPath, existingTracks = [], maxFiles = 50000) {
  const existingByPath = new Map(existingTracks.map(t => [t.path, t]));
  const discovered = [];

  function walk(currentDir) {
    if (discovered.length >= maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      if (discovered.length >= maxFiles) break;
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', '.cache'].includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTENSIONS.has(ext)) {
          discovered.push(fullPath);
        }
      }
    }
  }

  if (fs.existsSync(dirPath)) {
    walk(dirPath);
  }

  ensureConfigDir();
  const folderArtCache = new Map();
  const results = [];
  for (const filePath of discovered) {
    let st = null;
    try {
      st = fs.statSync(filePath);
    } catch (_) {
      continue;
    }
    const prev = existingByPath.get(filePath);
    if (prev && prev.size === st.size && prev.mtimeMs === Math.floor(st.mtimeMs || 0)) {
      results.push(prev);
    } else {
      const meta = await readTrackMetadata(filePath, {
        artDir: ART_CACHE_DIR,
        stat: st,
        folderArtCache
      });
      results.push(meta);
    }
  }
  return results;
}

/**
 * Non-blocking worker-thread scan of directories/files with incremental batch callbacks.
 */
function scanInWorker({ directories = [], files = [], existingTracks = [], onBatch = null, onDiscovered = null } = {}) {
  ensureConfigDir();
  const existingByPath = {};
  for (let i = 0; i < existingTracks.length; i++) {
    const t = existingTracks[i];
    if (t && t.path && t.source !== 'cloud') {
      existingByPath[t.path] = t;
    }
  }

  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, 'scan-worker.js');
    const worker = new Worker(workerPath, {
      workerData: {
        directories,
        files,
        artDir: ART_CACHE_DIR,
        existingByPath,
        batchSize: 200
      }
    });

    const collected = [];
    worker.on('message', msg => {
      if (!msg) return;
      if (msg.type === 'discovered' && onDiscovered) {
        onDiscovered(msg.total);
      } else if (msg.type === 'batch') {
        if (Array.isArray(msg.tracks)) {
          for (let i = 0; i < msg.tracks.length; i++) collected.push(msg.tracks[i]);
        }
        if (onBatch) onBatch(msg);
      } else if (msg.type === 'done') {
        resolve({ tracks: collected, total: msg.total, reused: msg.reused, parsed: msg.parsed });
      } else if (msg.type === 'error') {
        reject(new Error(msg.error || 'Worker scan failed'));
      }
    });
    worker.on('error', reject);
  });
}

function loadLibraryDisk() {
  ensureConfigDir();
  try {
    if (fs.existsSync(LIBRARY_FILE)) {
      const data = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
      return Array.isArray(data.tracks) ? data.tracks : [];
    }
  } catch (_) {}
  return [];
}

let saveTimer = null;
function saveLibraryDisk(tracks, immediate = false) {
  ensureConfigDir();
  const writeNow = () => {
    saveTimer = null;
    const clean = tracks.map(t => {
      const { _q, picture, ...rest } = t;
      return rest;
    });
    fs.writeFileSync(LIBRARY_FILE, JSON.stringify({
      updatedAt: new Date().toISOString(),
      version: 2,
      tracks: clean
    }));
  };
  if (immediate) {
    if (saveTimer) clearTimeout(saveTimer);
    writeNow();
  } else {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 400);
  }
}

function loadStatsDisk() {
  ensureConfigDir();
  try {
    if (fs.existsSync(STATS_FILE)) {
      return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')) || {};
    }
  } catch (_) {}
  return {};
}

function saveStatsDisk(statsObj) {
  ensureConfigDir();
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(statsObj || {}, null, 2));
  } catch (_) {}
}

function loadPlaylists() {
  ensureConfigDir();
  try {
    if (fs.existsSync(PLAYLISTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PLAYLISTS_FILE, 'utf8'));
      if (Array.isArray(data.playlists) && data.playlists.length > 0) {
        return data.playlists;
      }
    }
  } catch (_) {}

  const defaults = [
    {
      id: 'favorites',
      name: 'Watchlist & Favorites',
      description: 'Movies, series episodes, and films saved for theater night',
      tracks: []
    },
    {
      id: 'scifi-cinema',
      name: 'Sci-Fi & Open Cinema',
      description: 'Curated open-source Blender films, sci-fi shorts, and demo reels',
      tracks: [
        {
          id: 'sample-blender-sintel',
          title: 'Sintel (Open Movie Project)',
          artist: 'Colin Levy',
          album: 'Blender Open Movies',
          composer: 'Blender Foundation',
          genre: 'Fantasy / Animation',
          year: 2010,
          duration: 888,
          resolution: '1080p',
          videoCodec: 'H.264',
          path: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
          format: 'mp4',
          source: 'stream'
        },
        {
          id: 'sample-blender-tears-of-steel',
          title: 'Tears of Steel',
          artist: 'Ian Hubert',
          album: 'Blender Open Movies',
          composer: 'Blender Institute Amsterdam',
          genre: 'Sci-Fi',
          year: 2012,
          duration: 734,
          resolution: '1080p',
          videoCodec: 'H.264',
          path: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
          format: 'mp4',
          source: 'stream'
        },
        {
          id: 'sample-big-buck-bunny',
          title: 'Big Buck Bunny',
          artist: 'Sacha Goedegebure',
          album: 'Blender Open Movies',
          composer: 'Blender Foundation',
          genre: 'Animation / Comedy',
          year: 2008,
          duration: 596,
          resolution: '1080p',
          videoCodec: 'H.264',
          path: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          format: 'mp4',
          source: 'stream'
        },
        {
          id: 'sample-elephants-dream',
          title: 'Elephants Dream',
          artist: 'Bassam Kurdali',
          album: 'Blender Open Movies',
          composer: 'Orange Open Movie Project',
          genre: 'Sci-Fi / Surreal',
          year: 2006,
          duration: 653,
          resolution: '1080p',
          videoCodec: 'H.264',
          path: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
          format: 'mp4',
          source: 'stream'
        }
      ]
    }
  ];
  savePlaylists(defaults);
  return defaults;
}

function savePlaylists(playlists) {
  ensureConfigDir();
  fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify({
    updatedAt: new Date().toISOString(),
    playlists
  }, null, 2));
}

function parseM3U(content, baseDir = '') {
  const lines = content.split(/\r?\n/);
  const entries = [];
  let currentMeta = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const info = line.slice(8);
      const commaIdx = info.indexOf(',');
      const duration = commaIdx !== -1 ? parseInt(info.slice(0, commaIdx), 10) : 0;
      const label = commaIdx !== -1 ? info.slice(commaIdx + 1).trim() : info;
      const parts = label.split(' - ');
      currentMeta = {
        duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
        artist: parts.length > 1 ? parts[0].trim() : 'Unknown Director',
        title: parts.length > 1 ? parts.slice(1).join(' - ').trim() : label
      };
    } else if (!line.startsWith('#')) {
      const resolvedPath = (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('cloud://') || path.isAbsolute(line))
        ? line
        : path.resolve(baseDir, line);
      entries.push({
        path: resolvedPath,
        title: currentMeta?.title || path.basename(resolvedPath, path.extname(resolvedPath)),
        artist: currentMeta?.artist || 'Unknown Director',
        duration: currentMeta?.duration || 0
      });
      currentMeta = null;
    }
  }
  return entries;
}

function exportM3U(playlist) {
  const lines = ['#EXTM3U', `#PLAYLIST:${playlist.name}`];
  for (const track of (playlist.tracks || [])) {
    const dur = Math.round(track.duration || -1);
    const label = track.artist && track.artist !== 'Unknown Director'
      ? `${track.artist} - ${track.title}`
      : track.title;
    lines.push(`#EXTINF:${dur},${label}`);
    lines.push(track.path);
  }
  return lines.join('\n') + '\n';
}

module.exports = {
  AUDIO_EXTENSIONS,
  ART_CACHE_DIR,
  getArtPath,
  readTrackMetadata,
  scanDirectory,
  scanInWorker,
  loadLibrary: loadLibraryDisk,
  saveLibrary: saveLibraryDisk,
  loadStatsDisk,
  saveStatsDisk,
  loadPlaylists,
  savePlaylists,
  parseM3U,
  exportM3U,
  LibraryIndex
};
