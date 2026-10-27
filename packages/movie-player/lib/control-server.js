/**
 * RobOS Movie Player — Local Loopback Control Server
 *
 * Exposes a lightweight HTTP JSON control endpoint on `127.0.0.1` so companion
 * RobOS apps (Home Speaker, Smart TV Studio, Voice Assistant) can query live playback
 * state or control the Movie Player over local IPC.
 *
 * Writes its bound port to `~/.config/robos/movie-player-control.json`.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONTROL_FILE = path.join(os.homedir(), '.config', 'robos', 'movie-player-control.json');

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 65536) req.destroy();
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (_) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function createControlServer({ getState, onCommand, getLibraryTracks, getPlaylists } = {}) {
  let lastState = {
    isPlaying: false,
    currentTrack: null,
    currentTime: 0,
    duration: 0,
    volume: 0.85,
    activeCastDevice: null,
    updatedAt: Date.now()
  };

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      return sendJson(res, 200, { ok: true });
    }
    const url = (req.url || '/').split('?')[0];

    if (req.method === 'GET' && url === '/status') {
      const live = typeof getState === 'function' ? getState() : null;
      return sendJson(res, 200, { ok: true, state: live || lastState });
    }

    if (req.method === 'GET' && url === '/library') {
      const tracks = typeof getLibraryTracks === 'function' ? getLibraryTracks() : [];
      const playlists = typeof getPlaylists === 'function' ? getPlaylists() : [];
      return sendJson(res, 200, {
        ok: true,
        trackCount: tracks.length,
        tracks: tracks.slice(0, 200),
        playlists: playlists.map(p => ({ id: p.id, name: p.name, trackCount: (p.tracks || []).length }))
      });
    }

    if (req.method === 'POST' && url === '/command') {
      const body = await readBody(req);
      if (typeof onCommand === 'function') {
        try {
          const result = await onCommand(body);
          return sendJson(res, 200, { ok: true, result: result || null, state: lastState });
        } catch (err) {
          return sendJson(res, 500, { ok: false, error: err.message });
        }
      }
      return sendJson(res, 200, { ok: true, state: lastState });
    }

    return sendJson(res, 404, { ok: false, error: 'Not found' });
  });

  function start(preferredPort = 0) {
    return new Promise((resolve, reject) => {
      server.listen(preferredPort, '127.0.0.1', () => {
        const port = server.address().port;
        try {
          fs.mkdirSync(path.dirname(CONTROL_FILE), { recursive: true });
          fs.writeFileSync(CONTROL_FILE, JSON.stringify({
            port,
            host: '127.0.0.1',
            pid: process.pid,
            updatedAt: new Date().toISOString()
          }, null, 2));
        } catch (_) {}
        resolve(port);
      });
      server.on('error', reject);
    });
  }

  function updateState(partial) {
    lastState = { ...lastState, ...(partial || {}), updatedAt: Date.now() };
    return lastState;
  }

  function getCachedState() {
    return lastState;
  }

  function stop() {
    return new Promise((resolve) => {
      try {
        if (fs.existsSync(CONTROL_FILE)) fs.unlinkSync(CONTROL_FILE);
      } catch (_) {}
      server.close(() => resolve());
    });
  }

  return { server, start, stop, updateState, getCachedState, CONTROL_FILE };
}

function createMoviePlayerClient({ controlFile = CONTROL_FILE } = {}) {
  function readEndpoint() {
    try {
      if (!fs.existsSync(controlFile)) return null;
      return JSON.parse(fs.readFileSync(controlFile, 'utf8'));
    } catch (_) {
      return null;
    }
  }

  function request(method, urlPath, body = null) {
    const ep = readEndpoint();
    if (!ep || !ep.port) {
      return Promise.resolve({ ok: false, offline: true, error: 'RobOS Movie Player is not running' });
    }
    return new Promise((resolve) => {
      const payload = body ? JSON.stringify(body) : null;
      const req = http.request({
        host: ep.host || '127.0.0.1',
        port: ep.port,
        path: urlPath,
        method,
        timeout: 1500,
        headers: payload ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        } : {}
      }, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (_) {
            resolve({ ok: false, error: 'Invalid response from Movie Player' });
          }
        });
      });
      req.on('error', (err) => resolve({ ok: false, offline: true, error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, offline: true, error: 'Timeout' });
      });
      if (payload) req.write(payload);
      req.end();
    });
  }

  return {
    getStatus: () => request('GET', '/status'),
    getLibrary: () => request('GET', '/library'),
    sendCommand: (action, payload = {}) => request('POST', '/command', { action, ...payload })
  };
}

module.exports = {
  createControlServer,
  createMoviePlayerClient,
  createAudioPlayerClient: createMoviePlayerClient,
  CONTROL_FILE
};
