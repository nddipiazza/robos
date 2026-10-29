'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { Client, DefaultMediaReceiver } = require('castv2-client');
const { inferMovieGenres, inferMovieFranchise, inferQualityMeta } = require('./library-index');

const AUDIO_MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
  '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.ogv': 'video/ogg', '.ts': 'video/mp2t',
  '.m2ts': 'video/mp2t', '.mpg': 'video/mpeg', '.mpeg': 'video/mpeg',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav',
};

function audioMimeType(filePath) {
  return AUDIO_MIME[path.extname(String(filePath || '')).toLowerCase()] || 'video/mp4';
}

// The file's real type from its first bytes (an MP3 saved as .wav, e.g. by a voice
// cache, must still go out as audio/mpeg); falls back to the extension.
function sniffAudioType(filePath) {
  let head = null;
  try {
    const fd = fs.openSync(filePath, 'r');
    head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
  } catch { return audioMimeType(filePath); }
  const tag = head.toString('latin1', 0, 4);
  if (tag === 'RIFF' && head.toString('latin1', 8, 12) === 'WAVE') return 'audio/wav';
  if (tag.startsWith('ID3') || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0 && (head[1] & 0x06) !== 0)) return 'audio/mpeg';
  if (tag === 'fLaC') return 'audio/flac';
  if (tag === 'OggS') return 'audio/ogg';
  if (head.toString('latin1', 4, 8) === 'ftyp') {
    const ext = path.extname(String(filePath || '')).toLowerCase();
    return (ext === '.mp4' || ext === '.m4v' || ext === '.mov') ? 'video/mp4' : 'audio/mp4';
  }
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return path.extname(String(filePath || '')).toLowerCase() === '.webm' ? 'video/webm' : 'video/x-matroska';
  }
  if (head[0] === 0xff && (head[1] & 0xf6) === 0xf0) return 'audio/aac';
  return audioMimeType(filePath);
}

const EXT_FOR_MIME = {
  'video/mp4': 'mp4', 'video/x-matroska': 'mkv', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-msvideo': 'avi',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/flac': 'flac', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm',
};

// What the app needs from a speaker's media status, plus which load it is about.
function normalizeStatus(st, conn) {
  if (!st) return null;
  return {
    playerState: st.playerState,
    idleReason: st.idleReason || null,
    currentTime: typeof st.currentTime === 'number' ? st.currentTime : null,
    duration: (st.media && st.media.duration) || conn.duration || null,
    role: conn.role,
    loadId: conn.loadId,
  };
}

class CastService {
  constructor(getTracksFn = null) {
    this.speakers = new Map(); // ip -> speaker info
    this.loadCounter = 0;
    this.activeConnections = new Map(); // ip -> { client, player, currentMedia, mediaServer }
    this.mediaRegistry = new Map(); // id -> { filePath, buffer, contentType, length }
    this.fileToMediaId = new Map(); // filePath -> id
    this.nextMediaId = 1;
    this.streamServer = null;
    this.streamPort = 0;
    this.hostIp = this._detectHostIp();
    if (typeof getTracksFn === 'function') {
      this.mediaLibrary = {
        get tracks() { return getTracksFn(); },
        stats: {},
      };
    }

    this._initStreamServer();
    this._loadRobosSmartTvs();
  }

  startStreamServer(customPort = 19215) {
    if (this.streamPort > 0) {
      return Promise.resolve({ port: this.streamPort });
    }
    return new Promise((resolve) => {
      const check = () => {
        if (this.streamPort > 0) return resolve({ port: this.streamPort });
        setTimeout(check, 25);
      };
      check();
    });
  }

  _getEffectiveTracks() {
    const libTracks = (this.mediaLibrary && Array.isArray(this.mediaLibrary.tracks)) ? this.mediaLibrary.tracks : [];
    if (libTracks.length > 0) return libTracks;
    if (this._fallbackSampleTracks) return this._fallbackSampleTracks;
    const samples = [];
    const addSample = (fp, title) => {
      try {
        if (fp && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
          samples.push({
            id: `sample_${Buffer.from(fp).toString('base64url').slice(-16)}`,
            title: title || path.basename(fp, path.extname(fp)).replace(/[-_]+/g, ' '),
            artist: os.hostname(),
            album: 'RobOS Private Network Stream',
            mediaType: 'movie',
            filePath: path.resolve(fp),
            year: 2026,
            overview: `Streamed directly from ${os.hostname()} over RobOS Private Network Zero-Trust mTLS 1.3.`,
          });
        }
      } catch {}
    };
    try {
      const vidDir = path.join(os.homedir(), 'Videos');
      if (fs.existsSync(vidDir)) {
        for (const f of fs.readdirSync(vidDir)) {
          if (/\.(mp4|mkv|webm|mov|m4v)$/i.test(f)) addSample(path.join(vidDir, f));
        }
      }
    } catch {}
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    addSample(path.join(repoRoot, 'site', 'assets', 'games', 'rts', 'frontier-hunters-live.mp4'), 'Frontier Hunters Live (P2P Stream)');
    addSample(path.join(repoRoot, 'site', 'assets', 'games', 'rts', 'gameplay-preview.mp4'), 'RobOS RTS Gameplay Preview (P2P Stream)');
    this._fallbackSampleTracks = samples;
    return samples;
  }

  _loadRobosSmartTvs() {
    try {
      const cfgPath = path.join(os.homedir(), '.config', 'robos', 'tv-studio.json');
      if (!fs.existsSync(cfgPath)) return;
      const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const tvs = Array.isArray(raw?.tvs) ? raw.tvs : [];
      for (const tv of tvs) {
        if (!tv || !tv.ip) continue;
        const existing = this.speakers.get(tv.ip) || {};
        this.speakers.set(tv.ip, {
          ...existing,
          id: tv.id || `tv-${tv.ip}`,
          ip: tv.ip,
          name: tv.name || `RobOS Smart TV (${tv.ip})`,
          model: tv.model || tv.platformName || 'RobOS Smart TV',
          platformId: tv.platformId || 'smart-tv',
          platformName: tv.platformName || 'Smart TV',
          sideloadStatus: tv.sideloadStatus || 'READY',
          devModeEnabled: tv.devModeEnabled !== false,
          ports: tv.ports || {},
          volume: existing.volume ?? 0.75,
          muted: existing.muted ?? false,
          online: tv.online !== false,
          lastSeen: Date.now(),
          robosTv: true,
        });
      }
    } catch (err) {
      console.warn('[CastService] Could not load RobOS Smart TVs from tv-studio.json:', err.message);
    }
  }

  getPairedSmartTvs() {
    this._loadRobosSmartTvs();
    return Array.from(this.speakers.values());
  }

  _detectHostIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Skip internal/loopback and non-IPv4
        if (!iface.internal && iface.family === 'IPv4') {
          // Prefer 192.168.x.x or 10.x.x.x
          if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.')) {
            return iface.address;
          }
        }
      }
    }
    // Fallback to first non-internal IPv4
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (!iface.internal && iface.family === 'IPv4') {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  _initStreamServer() {
    this.streamServer = http.createServer((req, res) => {
      const reqHost = (req.headers && req.headers.host) || `${this.hostIp}:${this.streamPort}`;
      const parsedUrl = new URL(req.url, `http://${reqHost}`);

      if (parsedUrl.pathname === '/api/tv-library') {
        const tracks = this._getEffectiveTracks();
        const items = this._buildTvLibraryItems(500, reqHost);
        const body = JSON.stringify({
          ok: true,
          nodeName: os.hostname(),
          hostIp: this.hostIp,
          streamPort: this.streamPort,
          totalCount: tracks.length,
          items,
        });
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        });
        res.end(body);
        return;
      }

      if (parsedUrl.pathname === '/api/tv-play' && (req.method === 'POST' || req.method === 'GET')) {
        const trackId = parsedUrl.searchParams.get('id') || '';
        const tvIp = parsedUrl.searchParams.get('tvIp') || '';
        const explicitStart = parsedUrl.searchParams.get('startAt');
        const tracks = this._getEffectiveTracks();
        const track = tracks.find(t => t.id === trackId) || tracks[0];
        if (!track) {
          res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ ok: false, error: 'Movie not found' }));
          return;
        }
        const ext = path.extname(String(track.filePath || track.cloud?.remotePath || '')).toLowerCase();
        const streamFormat = ext === '.mkv' ? 'mkv' : 'mp4';
        let streamUrl = '';
        if (track.cloud) {
          streamUrl = `http://${reqHost}/cloud-stream/${encodeURIComponent(track.id)}.${streamFormat}`;
        } else if (track.filePath && fs.existsSync(track.filePath)) {
          streamUrl = this.registerFile(track.filePath, null, reqHost);
        }
        const st = (this.mediaLibrary && this.mediaLibrary.stats && this.mediaLibrary.stats[track.id]) || {};
        const startAt = explicitStart != null
          ? Math.max(0, Math.floor(Number(explicitStart) || 0))
          : (st.inProgress && st.positionSec >= 5 ? Math.floor(st.positionSec) : 0);
        if (typeof this.onTvRemoteSelect === 'function') {
          try { this.onTvRemoteSelect({ ...track, currentTime: startAt }, tvIp); } catch {}
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true, id: track.id, title: track.title, streamUrl, streamFormat, startAt }));
        return;
      }

      if (parsedUrl.pathname === '/api/tv-progress' && (req.method === 'POST' || req.method === 'GET')) {
        const trackId = parsedUrl.searchParams.get('id') || '';
        const positionSec = Number(parsedUrl.searchParams.get('positionSec') || 0);
        const durationSec = Number(parsedUrl.searchParams.get('durationSec') || 0);
        const completed = parsedUrl.searchParams.get('completed') === '1' || parsedUrl.searchParams.get('completed') === 'true';
        const watchedParam = parsedUrl.searchParams.get('watched');
        let entry = null;
        if (this.mediaLibrary && trackId) {
          if (watchedParam === '1' || watchedParam === '0') {
            const changed = this.mediaLibrary.setWatched([trackId], watchedParam === '1');
            entry = changed[trackId] || null;
          } else {
            entry = this.mediaLibrary.saveProgress(trackId, { positionSec, durationSec, completed });
          }
          this._saveStreamServerEndpoint();
          if (typeof this.onTvProgressUpdate === 'function') {
            try { this.onTvProgressUpdate(trackId, entry); } catch {}
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: Boolean(entry), id: trackId, stats: entry }));
        return;
      }

      // Handle Album Art requests (auto-rasterizes SVG to JPEG for Roku SceneGraph <Poster> compatibility)
      if (parsedUrl.pathname.startsWith('/art/')) {
        const wantJpg = parsedUrl.pathname.endsWith('.jpg') || parsedUrl.pathname.endsWith('.jpeg');
        const artId = parsedUrl.pathname.replace(/^\/art\//, '').replace(/\.[^.]+$/, '');
        const lookup = this.mediaLibrary && typeof this.mediaLibrary.getArtAsync === 'function'
          ? this.mediaLibrary.getArtAsync(artId)
          : Promise.resolve(this.mediaLibrary ? this.mediaLibrary.getArt(artId) : null);
        lookup.catch(() => null).then((found) => {
          let art = found;
          if (!art && this.mediaRegistry.has(artId)) {
            art = this.mediaRegistry.get(artId);
          }
          if (art && art.buffer) {
            if (wantJpg && art.format === 'image/svg+xml' && this.mediaLibrary && this.mediaLibrary.artDir) {
              const jpgPath = path.join(this.mediaLibrary.artDir, `${artId}.jpg`);
              const svgPath = path.join(this.mediaLibrary.artDir, `${artId}.svg`);
              if (fs.existsSync(jpgPath)) {
                try {
                  const jpgBuf = fs.readFileSync(jpgPath);
                  this.mediaLibrary._rememberArt(artId, { buffer: jpgBuf, format: 'image/jpeg' });
                  res.writeHead(200, {
                    'Content-Type': 'image/jpeg',
                    'Content-Length': jpgBuf.length,
                    'Cache-Control': 'public, max-age=86400',
                    'Access-Control-Allow-Origin': '*'
                  });
                  res.end(jpgBuf);
                  return;
                } catch {}
              } else if (fs.existsSync(svgPath)) {
                const { execFile } = require('child_process');
                execFile('ffmpeg', ['-y', '-loglevel', 'error', '-i', svgPath, '-frames:v', '1', '-update', '1', '-q:v', '2', jpgPath], (err) => {
                  if (!err && fs.existsSync(jpgPath)) {
                    try {
                      const jpgBuf = fs.readFileSync(jpgPath);
                      this.mediaLibrary._rememberArt(artId, { buffer: jpgBuf, format: 'image/jpeg' });
                      res.writeHead(200, {
                        'Content-Type': 'image/jpeg',
                        'Content-Length': jpgBuf.length,
                        'Cache-Control': 'public, max-age=86400',
                        'Access-Control-Allow-Origin': '*'
                      });
                      res.end(jpgBuf);
                      return;
                    } catch {}
                  }
                  res.writeHead(200, {
                    'Content-Type': art.format || 'image/jpeg',
                    'Content-Length': art.buffer.length,
                    'Cache-Control': 'public, max-age=86400',
                    'Access-Control-Allow-Origin': '*'
                  });
                  res.end(art.buffer);
                });
                return;
              }
            }
            res.writeHead(200, {
              'Content-Type': art.format || 'image/jpeg',
              'Content-Length': art.buffer.length,
              'Cache-Control': 'public, max-age=86400',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(art.buffer);
            return;
          }
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Art not found');
        });
        return;
      }

      // Handle Cloud Track or P2P Track on-demand streaming (/cloud-stream/:trackId or /stream/:trackId)
      if (parsedUrl.pathname.startsWith('/cloud-stream/') || parsedUrl.pathname.startsWith('/stream/')) {
        const trackId = decodeURIComponent(
          parsedUrl.pathname.replace(/^\/(cloud-stream|stream)\//, '').replace(/\.[^.]+$/, '')
        );
        const tracks = this._getEffectiveTracks();
        const track = tracks.find(t => t.id === trackId) || null;

        if (track && track.cloud && this.cloudStorage && typeof this.cloudStorage.streamCloudTrackToHttp === 'function') {
          this.cloudStorage.streamCloudTrackToHttp(req, res, track.cloud, (cachedFile) => {
            if (cachedFile && fs.existsSync(cachedFile)) {
              track.cloud.cached = true;
              if (typeof this.onCloudTrackCached === 'function') this.onCloudTrackCached(track);
            }
          }).catch((err) => {
            console.error('[CastService] Cloud stream error:', err.message);
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'text/plain' });
              res.end(`Cloud stream error: ${err.message}`);
            } else {
              try { res.destroy(); } catch {}
            }
          });
          return;
        }

        if (track && track.filePath && fs.existsSync(track.filePath)) {
          const stat = fs.statSync(track.filePath);
          const total = stat.size;
          const contentType = sniffAudioType(track.filePath);
          const range = req.headers.range;
          if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10) || 0;
            const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
            const chunksize = (end - start) + 1;
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${total}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunksize,
              'Content-Type': contentType,
              'Access-Control-Allow-Origin': '*',
            });
            fs.createReadStream(track.filePath, { start, end }).pipe(res);
          } else {
            res.writeHead(200, {
              'Content-Length': total,
              'Accept-Ranges': 'bytes',
              'Content-Type': contentType,
              'Access-Control-Allow-Origin': '*',
            });
            fs.createReadStream(track.filePath).pipe(res);
          }
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Cloud track not found');
        return;
      }

      const mediaId = parsedUrl.pathname.replace(/^\/media\//, '').replace(/\.[^.]+$/, '');
      const item = this.mediaRegistry.get(mediaId);

      if (!item) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Media not found');
        return;
      }

      if (item.buffer) {
        res.writeHead(200, {
          'Content-Type': item.contentType || 'audio/mp3',
          'Content-Length': item.buffer.length,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache'
        });
        res.end(item.buffer);
        return;
      }

      if (item.filePath && fs.existsSync(item.filePath)) {
        const stat = fs.statSync(item.filePath);
        const total = stat.size;
        const range = req.headers.range;

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const partialstart = parts[0];
          const partialend = parts[1];
          const start = parseInt(partialstart, 10);
          const end = partialend ? parseInt(partialend, 10) : total - 1;
          const chunksize = (end - start) + 1;

          const file = fs.createReadStream(item.filePath, { start, end });
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': item.contentType || 'audio/mpeg'
          });
          file.pipe(res);
        } else {
          res.writeHead(200, {
            'Content-Length': total,
            'Accept-Ranges': 'bytes',
            'Content-Type': item.contentType || 'audio/mpeg'
          });
          fs.createReadStream(item.filePath).pipe(res);
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
      }
    });

    const preferredPort = (process.env.ROBOS_TEST === '1' || process.env.NODE_TEST_CONTEXT) ? 0 : 19215;
    const onStreamListen = () => {
      this.streamPort = this.streamServer.address().port;
      if (process.env.ROBOS_TEST === '1' || process.env.NODE_TEST_CONTEXT) {
        this.streamServer.unref();
      }
      console.log(`[CastService] Audio stream server ready at http://${this.hostIp}:${this.streamPort}`);
      this._saveStreamServerEndpoint();
    };
    this.streamServer.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE' && preferredPort !== 0) {
        this.streamServer.listen(0, '0.0.0.0', onStreamListen);
      }
    });
    this.streamServer.listen(preferredPort, '0.0.0.0', onStreamListen);
  }

  _formatTvTrackItem(t, stats = {}, idx = 0, hostOverride = null) {
    const baseHost = hostOverride || `${this.hostIp}:${this.streamPort}`;
    const ext = path.extname(String(t.filePath || t.cloud?.remotePath || '')).toLowerCase();
    const streamFormat = ext === '.mkv' ? 'mkv' : 'mp4';
    const inferredGenres = inferMovieGenres(t);
    const franchise = inferMovieFranchise(t) || '';
    const quality = inferQualityMeta(t);
    const st = stats[t.id] || {};
    const positionSec = st.inProgress ? Math.max(0, Math.round(Number(st.positionSec) || 0)) : 0;
    const durationSec = Math.max(0, Math.round(Number(st.durationSec || t.duration) || 0));
    const completed = !!st.completed;
    const inProgress = !completed && (!!st.inProgress || positionSec >= 5);
    const progressPct = completed ? 100 : (Number(st.progressPct) || (inProgress && durationSec > 0 ? Math.min(99, Math.round((positionSec / durationSec) * 100)) : 0));
    return {
      index: idx + 1,
      id: t.id,
      repTrackId: t.id,
      title: String(t.title || 'Untitled Movie').slice(0, 80),
      artist: String(t.artist || 'Feature Film').slice(0, 50),
      album: String(t.album || 'RobOS Cinema').slice(0, 60),
      mediaType: t.mediaType || 'movie',
      isShowGroup: false,
      showName: t.showName || '',
      seasonNumber: t.seasonNumber != null ? t.seasonNumber : null,
      episodeNumber: t.episodeNumber != null ? t.episodeNumber : null,
      episodeCode: t.episodeCode || '',
      episodeTitle: t.episodeTitle || '',
      airdate: t.airdate || '',
      genre: String(inferredGenres[0] || t.genre || 'Movies').slice(0, 32),
      genres: inferredGenres,
      franchise: String(franchise).slice(0, 48),
      qualityBadge: String(quality.badge || '1080p HD').slice(0, 28),
      year: t.year || null,
      rating: t.rating || null,
      network: t.network || '',
      overview: String(t.overview || t.showOverview || '').slice(0, 320),
      cast: String(t.cast || '').slice(0, 120),
      director: String(t.director || '').slice(0, 80),
      duration: durationSec,
      positionSec,
      progressPct,
      inProgress,
      completed,
      artUrl: t.artId ? `http://${baseHost}/art/${encodeURIComponent(t.artId)}.jpg` : '',
      streamFormat,
      streamUrl: t.cloud
        ? `http://${baseHost}/cloud-stream/${encodeURIComponent(t.id)}.${streamFormat}`
        : (t.filePath && fs.existsSync(t.filePath) ? this.registerFile(t.filePath, null, baseHost) : (t.src || '')),
    };
  }

  _buildTvLibraryItems(maxItems = 500, hostOverride = null) {
    const baseHost = hostOverride || `${this.hostIp}:${this.streamPort}`;
    const allTracks = this._getEffectiveTracks();
    if (!allTracks || allTracks.length === 0) return [];
    const stats = (this.mediaLibrary && this.mediaLibrary.stats) || {};

    const movieBuckets = new Map();
    const showBuckets = new Map();
    const qualityScore = (t) => {
      const hay = `${t.artist || ''} ${t.filePath || ''}`;
      let s = 0;
      if (/\b(2160p|4k)\b/i.test(hay)) s += 40;
      else if (/\b1080p\b/i.test(hay)) s += 30;
      else if (/\b720p\b/i.test(hay)) s += 20;
      if (/\b(blu-?ray|brrip|bdrip)\b/i.test(hay)) s += 8;
      else if (/\b(web-?dl|webrip|web)\b/i.test(hay)) s += 6;
      if (/\b(cam|hdcam|ts|hdts|telesync)\b/i.test(hay)) s -= 25;
      return s;
    };
    for (const t of allTracks) {
      if (!t) continue;
      if (t.mediaType === 'tv') {
        const key = String(t.showName || t.album || 'TV Series').trim().toLowerCase();
        if (!showBuckets.has(key)) showBuckets.set(key, []);
        showBuckets.get(key).push(t);
      } else {
        const cleanKey = `${String(t.title || t.album || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}:${t.year || ''}`;
        const prev = movieBuckets.get(cleanKey);
        if (!prev || qualityScore(t) > qualityScore(prev)) {
          movieBuckets.set(cleanKey, t);
        }
      }
    }

    const movieItems = [...movieBuckets.values()].map((t, idx) => this._formatTvTrackItem(t, stats, idx, baseHost));
    const showItems = [];

    const seasonSortOrder = (s) => {
      const n = Number(s ?? 1);
      return n <= 0 ? 9999 : n;
    };

    for (const eps of showBuckets.values()) {
      eps.sort((a, b) => seasonSortOrder(a.seasonNumber) - seasonSortOrder(b.seasonNumber) || (a.episodeNumber ?? 1) - (b.episodeNumber ?? 1));
      const seasonsSet = new Set(eps.map(e => e.seasonNumber ?? 1));
      const seasonCount = seasonsSet.size || 1;
      const episodeCount = eps.length;

      let watchedCount = 0;
      let inProgressCount = 0;
      let inProgressEp = null;
      let firstUnwatchedEp = null;

      for (const e of eps) {
        const st = stats[e.id] || {};
        if (st.completed) {
          watchedCount++;
        } else if (st.inProgress || (Number(st.positionSec) >= 5)) {
          inProgressCount++;
          if (!inProgressEp || (st.lastPlayed && (!stats[inProgressEp.id]?.lastPlayed || st.lastPlayed > stats[inProgressEp.id].lastPlayed))) {
            inProgressEp = e;
          }
        } else if (!firstUnwatchedEp) {
          firstUnwatchedEp = e;
        }
      }

      const resumeEp = inProgressEp || firstUnwatchedEp || eps[0];
      const repFormatted = this._formatTvTrackItem(resumeEp, stats, 0, baseHost);
      const showTitle = String(resumeEp.showName || resumeEp.album || resumeEp.title || 'TV Series').slice(0, 80);
      const bestEpWithGenre = eps.find(e => e.genre && e.genre !== 'TV Series' && e.genre !== 'Movies & TV' && e.genre !== 'Movies') || resumeEp;
      const bestEpWithOverview = eps.find(e => e.showOverview) || eps.find(e => e.overview) || resumeEp;
      const bestEpWithRating = eps.find(e => e.rating && Number(e.rating) > 0) || resumeEp;
      const bestEpWithNetwork = eps.find(e => e.network) || resumeEp;
      const bestEpWithArt = eps.find(e => e.artId) || resumeEp;
      const showGenre = String(bestEpWithGenre.genre || repFormatted.genre || 'TV Series').slice(0, 48);
      const showOverview = String(bestEpWithOverview.showOverview || bestEpWithOverview.overview || repFormatted.overview || '').slice(0, 320);
      const showRating = bestEpWithRating.rating || repFormatted.rating || null;
      const showNetwork = String(bestEpWithNetwork.network || repFormatted.network || '').slice(0, 36);
      const showArtUrl = bestEpWithArt.artId
        ? `http://${baseHost}/art/${encodeURIComponent(bestEpWithArt.artId)}.jpg`
        : repFormatted.artUrl;

      // Select up to 120 episodes for the interactive Roku season/episode browser
      const maxEpsPerShow = 120;
      const chosenEps = [];
      const seenEpIds = new Set();
      const pushEp = (e) => {
        if (e && !seenEpIds.has(e.id) && chosenEps.length < maxEpsPerShow) {
          seenEpIds.add(e.id);
          chosenEps.push(e);
        }
      };
      // Always include in-progress or watched episodes first, plus first episode of each season, then sequential episodes
      for (const e of eps) {
        const st = stats[e.id];
        if (st && (st.inProgress || st.completed)) pushEp(e);
      }
      const seenS = new Set();
      for (const e of eps) {
        const sNum = e.seasonNumber ?? 1;
        if (!seenS.has(sNum)) {
          seenS.add(sNum);
          pushEp(e);
        }
      }
      for (const e of eps) pushEp(e);
      chosenEps.sort((a, b) => seasonSortOrder(a.seasonNumber) - seasonSortOrder(b.seasonNumber) || (a.episodeNumber ?? 1) - (b.episodeNumber ?? 1));

      const formattedEpisodes = chosenEps.map((e, eIdx) => {
        const epItem = this._formatTvTrackItem(e, stats, eIdx, baseHost);
        const code = epItem.episodeCode || `S${String(epItem.seasonNumber || 1).padStart(2, '0')}E${String(epItem.episodeNumber || 1).padStart(2, '0')}`;
        const epCleanTitle = epItem.episodeTitle || epItem.title;
        return {
          ...epItem,
          artUrl: epItem.artUrl || showArtUrl,
          genre: (epItem.genre && epItem.genre !== 'TV Series') ? epItem.genre : showGenre,
          network: epItem.network || showNetwork,
          rating: epItem.rating || showRating,
          episodeCode: code,
          title: `${code} - ${epCleanTitle}`.slice(0, 80),
          showOverview: String(e.showOverview || showOverview || '').slice(0, 280),
        };
      });

      const showCompleted = watchedCount >= episodeCount && episodeCount > 0;
      const showInProgress = !showCompleted && (inProgressCount > 0 || watchedCount > 0);
      const showProgressPct = showCompleted
        ? 100
        : (repFormatted.inProgress
          ? repFormatted.progressPct
          : (episodeCount > 0 ? Math.min(99, Math.round((watchedCount / episodeCount) * 100)) : 0));

      showItems.push({
        ...repFormatted,
        id: `show:${showTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        repTrackId: repFormatted.id,
        title: showTitle,
        showName: showTitle,
        artUrl: showArtUrl,
        genre: showGenre,
        rating: showRating,
        network: showNetwork,
        mediaType: 'tv',
        isShowGroup: true,
        seasonCount,
        episodeCount,
        watchedCount,
        inProgressCount,
        overview: showOverview,
        inProgress: showInProgress,
        completed: showCompleted,
        progressPct: showProgressPct,
        episodes: formattedEpisodes,
      });
    }

    // Sort movies and shows alphabetically, or put in-progress items easily accessible
    movieItems.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    showItems.sort((a, b) => String(a.title).localeCompare(String(b.title)));

    const combined = [...movieItems, ...showItems].slice(0, maxItems);
    return combined.map((item, idx) => ({ ...item, index: idx + 1 }));
  }

  _saveStreamServerEndpoint() {
    try {
      const cfgPath = path.join(os.homedir(), '.config', 'robos', 'tv-studio.json');
      const dir = path.dirname(cfgPath);
      fs.mkdirSync(dir, { recursive: true });
      const raw = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
      raw.moviePlayerServer = {
        hostIp: this.hostIp,
        streamPort: this.streamPort,
        libraryUrl: `http://${this.hostIp}:${this.streamPort}/api/tv-library`,
        playUrl: `http://${this.hostIp}:${this.streamPort}/api/tv-play`,
        updatedAt: new Date().toISOString(),
      };
      if (raw.activeCinemaCast && raw.activeCinemaCast.mediaUrl && this.streamPort) {
        raw.activeCinemaCast.mediaUrl = String(raw.activeCinemaCast.mediaUrl).replace(
          new RegExp(`^http://${this.hostIp.replace(/\./g, '\\.')}:\\d+/`),
          `http://${this.hostIp}:${this.streamPort}/`
        );
      }
      if (this.mediaLibrary && Array.isArray(this.mediaLibrary.tracks)) {
        raw.moviePlayerLibrarySnapshot = this._buildTvLibraryItems(500);
      }
      fs.writeFileSync(cfgPath, JSON.stringify(raw, null, 2));
    } catch {}
  }

  // The real type matters: speakers may refuse a WAV (e.g. a DJ voice clip) sent as MP3.
  registerFile(filePath, contentType = null, hostOverride = null) {
    const baseHost = hostOverride || `${this.hostIp}:${this.streamPort}`;
    const type = contentType || sniffAudioType(filePath);
    let id = this.fileToMediaId.get(filePath);
    if (!id || !this.mediaRegistry.has(id)) {
      id = `f_${this.nextMediaId++}_${Date.now()}`;
      this.mediaRegistry.set(id, { filePath, contentType: type });
      this.fileToMediaId.set(filePath, id);
    }
    return `http://${baseHost}/media/${id}.${EXT_FOR_MIME[type] || 'mp3'}`;
  }

  registerBuffer(buffer, contentType = 'audio/mp3') {
    const id = `b_${this.nextMediaId++}_${Date.now()}`;
    this.mediaRegistry.set(id, {
      buffer,
      contentType,
    });
    return `http://${this.hostIp}:${this.streamPort}/media/${id}.mp3`;
  }

  getCloudStreamUrl(trackId, forCast = false, trackObj = null) {
    const host = forCast ? this.hostIp : '127.0.0.1';
    const track = trackObj || ((this.mediaLibrary && Array.isArray(this.mediaLibrary.tracks))
      ? this.mediaLibrary.tracks.find(t => t.id === trackId)
      : null);
    const ext = path.extname(String(track?.filePath || track?.cloud?.remotePath || '')).toLowerCase();
    const streamFormat = ext === '.mkv' ? 'mkv' : 'mp4';
    return `http://${host}:${this.streamPort}/cloud-stream/${encodeURIComponent(trackId)}.${streamFormat}`;
  }

  /**
   * Scan local subnet for RobOS Smart TVs & Google Cast devices
   */
  async scanSubnet(timeoutMs = 1200) {
    this._loadRobosSmartTvs();
    const subnetPrefix = this.hostIp.split('.').slice(0, 3).join('.');
    const promises = [];

    for (let i = 1; i <= 254; i++) {
      const ip = `${subnetPrefix}.${i}`;
      promises.push(this._probeCastDevice(ip, timeoutMs));
    }

    const results = await Promise.all(promises);
    for (const dev of results) {
      if (dev) {
        const existing = this.speakers.get(dev.ip) || {};
        this.speakers.set(dev.ip, {
          ...existing,
          ...dev,
          name: existing.name || dev.name,
          model: existing.model || dev.model,
          platformId: existing.platformId || 'android-tv',
          platformName: existing.platformName || 'Google TV / Cast',
        });
      }
    }

    return Array.from(this.speakers.values());
  }

  _probeCastDevice(ip, timeoutMs = 1200) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        socket.destroy();
        // If port 8009 is open, query eureka_info over HTTP 8008
        this._queryEurekaInfo(ip).then((info) => {
          resolve({
            ip,
            name: info.name || `Google Cast (${ip})`,
            model: info.model || 'Google Nest / Cast Device',
            volume: info.volume || 0.65,
            muted: info.muted || false,
            build: info.build || '',
            online: true,
            lastSeen: Date.now()
          });
        }).catch(() => {
          resolve({
            ip,
            name: `Google Cast (${ip})`,
            model: 'Google Cast Device',
            volume: 0.65,
            muted: false,
            online: true,
            lastSeen: Date.now()
          });
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(null);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(null);
      });

      socket.connect(8009, ip);
    });
  }

  _queryEurekaInfo(ip) {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://${ip}:8008/setup/eureka_info?params=name,device_info`, { timeout: 1200 }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            resolve({
              name: data.name || data.device_info?.legal_name,
              model: data.device_info?.model_name || 'Google Cast Speaker',
              build: data.cast_build_revision || data.build_version
            });
          } catch {
            reject(new Error('Invalid eureka JSON'));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
  }

  async getSpeakerStatus(ip) {
    return new Promise((resolve, reject) => {
      const client = new Client();
      client.connect(ip, () => {
        client.getStatus((err, status) => {
          client.close();
          if (err) return reject(err);
          resolve({
            ip,
            volume: status.volume?.level ?? 0.5,
            muted: status.volume?.muted ?? false,
            equalizer: status.userEq
          });
        });
      });
      client.on('error', (err) => reject(err));
    });
  }

  async setSpeakerVolume(ip, level, muted = false) {
    return new Promise((resolve, reject) => {
      const client = new Client();
      client.connect(ip, () => {
        const volumeOpts = { level: Math.max(0, Math.min(1, level)) };
        if (typeof muted === 'boolean') volumeOpts.muted = muted;
        client.setVolume(volumeOpts, (err, vol) => {
          client.close();
          if (err) return reject(err);
          resolve(vol);
        });
      });
      client.on('error', (err) => reject(err));
    });
  }

  _updateCinemaCastState(mutator) {
    try {
      const cfgPath = path.join(os.homedir(), '.config', 'robos', 'tv-studio.json');
      if (!fs.existsSync(cfgPath)) return;
      const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const next = mutator(raw.activeCinemaCast || {});
      raw.activeCinemaCast = next;
      // Keep the 10-foot Movie Library active behind the video player so pressing Back
      // or finishing a movie returns to the Movie Library instead of the RobOS Dashboard.
      if (next && next.tvIp) {
        raw.activeCinemaLibrary = {
          ...(raw.activeCinemaLibrary || {}),
          active: true,
          tvIp: next.tvIp,
          tvId: next.tvId || raw.activeCinemaLibrary?.tvId || `tv-${next.tvIp}`,
          tvName: next.tvName || raw.activeCinemaLibrary?.tvName || next.tvIp,
          platformId: next.platformId || raw.activeCinemaLibrary?.platformId || 'roku-os',
        };
      }
      fs.writeFileSync(cfgPath, JSON.stringify(raw, null, 2));
    } catch {}
  }

  _ensureRokuDevChannelLaunched(ip, ecpPort = 8060) {
    if (process.env.ROBOS_TEST === '1' || process.env.NODE_TEST_CONTEXT) return;
    try {
      const req = http.get({
        hostname: ip,
        port: ecpPort,
        path: '/query/active-app',
        timeout: 1200,
      }, (res) => {
        let xml = '';
        res.on('data', (c) => { xml += c; });
        res.on('end', () => {
          if (!xml.includes('id="dev"')) {
            const launchReq = http.request({
              hostname: ip,
              port: ecpPort,
              path: '/launch/dev',
              method: 'POST',
              headers: { 'Content-Length': '0' },
              timeout: 1500,
            }, (lRes) => { lRes.resume(); });
            launchReq.on('error', () => {});
            launchReq.on('timeout', () => { launchReq.destroy(); });
            launchReq.end();
          }
        });
      });
      req.on('error', () => {});
      req.on('timeout', () => { req.destroy(); });
    } catch {}
  }

  _queryRokuMediaPlayer(ip, ecpPort = 8060) {
    return new Promise((resolve) => {
      if (process.env.ROBOS_TEST === '1' || process.env.NODE_TEST_CONTEXT) return resolve(null);
      const req = http.get({
        hostname: ip,
        port: ecpPort,
        path: '/query/media-player',
        timeout: 900,
      }, (res) => {
        let xml = '';
        res.on('data', (c) => { xml += c; });
        res.on('end', () => {
          const stateMatch = xml.match(/<player[^>]*state="([^"]+)"/);
          const posMatch = xml.match(/<position>\s*(\d+)/);
          const durMatch = xml.match(/<duration>\s*(\d+)/);
          const resMatch = xml.match(/video_res="([^"]+)"/);
          if (!stateMatch) return resolve(null);
          const rState = stateMatch[1];
          const posMs = posMatch ? Number(posMatch[1]) : null;
          const durMs = durMatch ? Number(durMatch[1]) : null;
          const videoRes = resMatch ? resMatch[1] : '';
          resolve({
            state: rState,
            positionSec: posMs != null ? posMs / 1000 : null,
            durationSec: durMs != null ? durMs / 1000 : null,
            videoRes,
            isKeepAlive: durMs === 60000 || videoRes === '160x90',
          });
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  }

  _dispatchSmartTvBridge(ip, tvInfo, mediaUrl, metadata = {}) {
    const platformId = tvInfo?.platformId || 'smart-tv';
    const title = metadata.title || 'RobOS Cinema Stream';
    const startAt = Math.max(0, Math.floor(Number(metadata.currentTime) || 0));
    const loadKey = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const isMkv = String(mediaUrl || '').toLowerCase().endsWith('.mkv') || metadata.contentType === 'video/x-matroska';
    const streamFormat = isMkv ? 'mkv' : 'mp4';

    // 1. Record active cinema cast session in ~/.config/robos/tv-studio.json so RobOS Smart TV Portal (:19210)
    //    and the Roku SceneGraph channel (<Video id="cinemaVideo">) immediately play it full-screen.
    this._updateCinemaCastState(() => ({
      active: true,
      loadKey,
      tvIp: ip,
      tvId: tvInfo?.id || `tv-${ip}`,
      tvName: tvInfo?.name || ip,
      platformId,
      mediaUrl,
      streamFormat,
      title,
      artist: metadata.artist || '',
      startAt,
      paused: false,
      seekKey: '',
      seekSeconds: startAt,
      startedAt: new Date().toISOString(),
    }));

    // 2. If Roku OS, ensure the RobOS TV channel (`dev`) is active on the screen
    if (platformId === 'roku-os') {
      this._ensureRokuDevChannelLaunched(ip, tvInfo?.ports?.ecp || 8060);
    }
    return loadKey;
  }

  _startSmartTvBridgeSession(ip, mediaUrl, metadata = {}, onStatusUpdate = null, role = 'song', loadId = 1, { reattachOnly = false } = {}) {
    const tvInfo = this.speakers.get(ip) || { ip, name: `RobOS Smart TV (${ip})`, platformId: 'smart-tv' };
    if (!reattachOnly) {
      this._dispatchSmartTvBridge(ip, tvInfo, mediaUrl, metadata);
    }

    const existing = this.activeConnections.get(ip);
    if (existing && existing.progressTimer) {
      clearInterval(existing.progressTimer);
      existing.progressTimer = null;
    }

    const sessionId = `robos-tv-${ip}-${Date.now()}`;
    const state = {
      playerState: metadata.paused ? 'PAUSED' : 'PLAYING',
      currentTime: Number(metadata.currentTime) > 0 ? Number(metadata.currentTime) : 0,
      duration: Number(metadata.duration) > 0 ? Number(metadata.duration) : 0,
      idleReason: null,
      lastSeekAt: reattachOnly ? 0 : Date.now(),
      lastSavedProgressAt: 0,
      trackId: metadata.trackId || null,
    };
    if (!state.trackId && mediaUrl && this.mediaLibrary && Array.isArray(this.mediaLibrary.tracks)) {
      const m = String(mediaUrl).match(/\/cloud-stream\/([^./?]+)/);
      if (m) {
        try { state.trackId = decodeURIComponent(m[1]); } catch {}
      }
      if (!state.trackId && metadata.title) {
        const found = this.mediaLibrary.tracks.find((t) => t && t.title === metadata.title);
        if (found) state.trackId = found.id;
      }
    }

    const persistCastProgress = (completed = false, force = false) => {
      if (!state.trackId || !this.mediaLibrary || typeof this.mediaLibrary.saveProgress !== 'function') return;
      const now = Date.now();
      if (!force && !completed && now - state.lastSavedProgressAt < 4000) return;
      if (state.currentTime < 3 && !completed) return;
      state.lastSavedProgressAt = now;
      try {
        this.mediaLibrary.saveProgress(state.trackId, {
          positionSec: state.currentTime,
          durationSec: state.duration,
          completed,
        });
      } catch {}
    };

    const virtualPlayer = {
      session: { sessionId },
      getStatus: (cb) => {
        cb(null, {
          playerState: state.playerState,
          idleReason: state.idleReason,
          currentTime: state.currentTime,
          media: { duration: state.duration },
        });
      },
      pause: () => {
        state.playerState = 'PAUSED';
        persistCastProgress(false, true);
        this._updateCinemaCastState((prev) => ({ ...prev, paused: true, startAt: Math.floor(state.currentTime) }));
        if (typeof entry.onStatusUpdate === 'function') {
          entry.onStatusUpdate(normalizeStatus({ playerState: 'PAUSED', currentTime: state.currentTime, media: { duration: state.duration } }, entry));
        }
      },
      play: () => {
        state.playerState = 'PLAYING';
        this._updateCinemaCastState((prev) => ({ ...prev, paused: false }));
        if (typeof entry.onStatusUpdate === 'function') {
          entry.onStatusUpdate(normalizeStatus({ playerState: 'PLAYING', currentTime: state.currentTime, media: { duration: state.duration } }, entry));
        }
      },
      seek: (seconds, cb) => {
        const targetSec = Math.max(0, Math.floor(Number(seconds) || 0));
        state.currentTime = targetSec;
        state.lastSeekAt = Date.now();
        persistCastProgress(false, true);
        this._updateCinemaCastState((prev) => ({
          ...prev,
          startAt: targetSec,
          seekKey: `seek-${Date.now()}`,
          seekSeconds: targetSec,
        }));
        if (typeof entry.onStatusUpdate === 'function') {
          entry.onStatusUpdate(normalizeStatus({ playerState: state.playerState, currentTime: state.currentTime, media: { duration: state.duration } }, entry));
        }
        if (cb) cb(null);
      },
      load: (newMedia, newOpts, cb) => {
        state.currentTime = Number(newOpts?.currentTime) > 0 ? Number(newOpts.currentTime) : 0;
        if (Number(newMedia?.metadata?.duration) > 0) state.duration = Number(newMedia.metadata.duration);
        state.playerState = 'PLAYING';
        state.lastSeekAt = Date.now();
        this._dispatchSmartTvBridge(ip, tvInfo, newMedia?.contentId || mediaUrl, {
          ...(newMedia?.metadata || metadata),
          currentTime: state.currentTime,
        });
        const st = { playerState: 'PLAYING', currentTime: state.currentTime, media: { duration: state.duration } };
        if (cb) cb(null, st);
      },
    };

    const entry = {
      client: {
        close: () => {},
        receiver: {
          stop: (_sid, cb) => {
            persistCastProgress(false, true);
            state.playerState = 'IDLE';
            this._updateCinemaCastState((prev) => ({ ...prev, active: false, stoppedAt: new Date().toISOString() }));
            if (cb) cb();
          },
        },
      },
      player: virtualPlayer,
      mediaUrl,
      sessionId,
      onStatusUpdate,
      role,
      loadId,
      duration: state.duration,
      isSmartTvBridge: true,
      _tvState: state,
    };

    this.activeConnections.set(ip, entry);

    entry.progressTimer = setInterval(async () => {
      if (this.activeConnections.get(ip) !== entry) {
        clearInterval(entry.progressTimer);
        entry.progressTimer = null;
        return;
      }
      let updatedFromRoku = false;
      if (tvInfo.platformId === 'roku-os') {
        const rokuSt = await this._queryRokuMediaPlayer(ip, tvInfo?.ports?.ecp || 8060);
        if (rokuSt && !rokuSt.isKeepAlive) {
          state.sawMovieOnRoku = true;
          if (rokuSt.durationSec && rokuSt.durationSec > 65) {
            state.duration = rokuSt.durationSec;
            entry.duration = rokuSt.durationSec;
          }
          // Only overwrite currentTime from Roku if we didn't just seek within the last 2.5s
          if (rokuSt.positionSec != null && Date.now() - state.lastSeekAt > 2500) {
            state.currentTime = rokuSt.positionSec;
            updatedFromRoku = true;
          } else if (rokuSt.state === 'startup' || rokuSt.state === 'buffer') {
            // Hold clock while Roku is buffering so it doesn't run ahead of the TV
            updatedFromRoku = true;
          }
          if (rokuSt.state === 'pause') state.playerState = 'PAUSED';
          else if (rokuSt.state === 'play') state.playerState = 'PLAYING';
        } else if (rokuSt && state.sawMovieOnRoku && (rokuSt.isKeepAlive || rokuSt.state === 'none' || rokuSt.state === 'close')) {
          // User stopped the movie on the TV via their physical remote
          persistCastProgress(false, true);
          state.playerState = 'IDLE';
          this._updateCinemaCastState((prev) => ({ ...prev, active: false, stoppedAt: new Date().toISOString() }));
          this.activeConnections.delete(ip);
          clearInterval(entry.progressTimer);
          entry.progressTimer = null;
          updatedFromRoku = true;
        }
      }
      if (!updatedFromRoku && state.playerState === 'PLAYING') {
        state.currentTime += 1;
        if (state.duration > 0 && state.currentTime >= state.duration) {
          state.playerState = 'IDLE';
          state.idleReason = 'FINISHED';
        }
      }
      if (state.playerState === 'PLAYING' || state.playerState === 'PAUSED') {
        persistCastProgress(false, false);
      } else if (state.playerState === 'IDLE' && state.idleReason === 'FINISHED') {
        persistCastProgress(true, true);
      }
      const out = normalizeStatus({
        playerState: state.playerState,
        idleReason: state.idleReason,
        currentTime: state.currentTime,
        media: { duration: state.duration },
      }, entry);
      if (out && typeof entry.onStatusUpdate === 'function') entry.onStatusUpdate(out);
    }, 1000);
    if (entry.progressTimer.unref) entry.progressTimer.unref();

    // Emit initial PLAYING status immediately
    setTimeout(() => {
      const out = normalizeStatus({
        playerState: state.playerState,
        currentTime: state.currentTime,
        media: { duration: state.duration },
      }, entry);
      if (out && typeof entry.onStatusUpdate === 'function') entry.onStatusUpdate(out);
    }, 50);

    return {
      ok: true,
      playerState: 'PLAYING',
      ip,
      sessionId,
      loadId,
      duration: state.duration,
      platformId: tvInfo.platformId,
    };
  }

  async castMediaUrl(ip, mediaUrl, metadata = {}, onStatusUpdate = null) {
    this._loadRobosSmartTvs();
    const tvInfo = this.speakers.get(ip);
    const media = {
      contentId: mediaUrl,
      contentType: metadata.contentType || 'video/mp4',
      streamType: 'BUFFERED',
      metadata: {
        type: 0,
        metadataType: 1,
        title: metadata.title || 'RobOS Cinema Stream',
        subtitle: metadata.artist || 'RobOS Movie Player',
        artist: metadata.artist || 'RobOS Movie Player',
        images: metadata.images || []
      }
    };

    // `currentTime` starts the movie part-way (resuming after a DJ preview or local seek).
    const loadOpts = { autoplay: true };
    if (metadata.currentTime > 0) loadOpts.currentTime = metadata.currentTime;
    const role = metadata.role || 'song';
    const loadId = ++this.loadCounter;

    // For Roku OS, LG webOS, or Samsung Tizen Smart TVs, use the Smart TV Bridge directly
    if (tvInfo && tvInfo.platformId && tvInfo.platformId !== 'android-tv') {
      return this._startSmartTvBridgeSession(ip, mediaUrl, metadata, onStatusUpdate, role, loadId);
    }

    // Next song on a speaker we're already casting to: load it into the same
    // receiver session. Stopping and relaunching the receiver for every song made
    // speakers go silent (and chime) between tracks.
    const conn = this.activeConnections.get(ip);
    if (conn && conn.player) {
      try {
        const status = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Cast load timed out')), 15000);
          conn.player.load(media, loadOpts, (err, st) => {
            clearTimeout(timer);
            if (err) reject(err); else resolve(st);
          });
        });
        Object.assign(conn, { mediaUrl, onStatusUpdate, role, loadId, duration: status?.media?.duration || null });
        this._startProgress(ip, conn);
        return { ok: true, playerState: status?.playerState, ip, sessionId: conn.sessionId, reused: true, loadId, duration: conn.duration };
      } catch (err) {
        // The session went away (speaker restarted, another app took over): start fresh.
        console.warn(`[CastService] Reusing the session on ${ip} failed (${err.message}); relaunching.`);
        this._dropConnection(ip, conn);
      }
    } else {
      // First cast to this speaker: end whatever else it is playing.
      await this.stopPlayback(ip);
    }

    return new Promise((resolve, reject) => {
      const client = new Client();
      let settled = false;
      client.connect(ip, () => {
        client.launch(DefaultMediaReceiver, (err, player) => {
          if (err) {
            client.close();
            settled = true;
            return reject(err);
          }

          player.load(media, loadOpts, (err, status) => {
            if (err) {
              client.close();
              settled = true;
              return reject(err);
            }

            const sessionId = player.session?.sessionId;
            const entry = { client, player, mediaUrl, sessionId, onStatusUpdate, role, loadId, duration: status?.media?.duration || null };
            this.activeConnections.set(ip, entry);

            // One listener for the session's lifetime; each load swaps the callback.
            player.on('status', (st) => {
              if (st && st.media && st.media.duration) entry.duration = st.media.duration;
              const out = normalizeStatus(st, entry);
              if (out && typeof entry.onStatusUpdate === 'function') entry.onStatusUpdate(out);
            });
            player.on('close', () => this._dropConnection(ip, entry));
            this._startProgress(ip, entry);

            settled = true;
            resolve({ ok: true, playerState: status?.playerState, ip, sessionId, loadId, duration: entry.duration });
          });
        });
      });

      client.on('error', (err) => {
        const entry = this.activeConnections.get(ip);
        if (entry && entry.client === client) this._dropConnection(ip, entry);
        if (!settled) {
          settled = true;
          if (tvInfo && tvInfo.robosTv) {
            resolve(this._startSmartTvBridgeSession(ip, mediaUrl, metadata, onStatusUpdate, role, loadId));
            return;
          }
          reject(err);
        }
      });
    });
  }

  // Speakers only report their position on state changes; ask every second so
  // the app's progress bar follows the speaker.
  _startProgress(ip, conn) {
    if (conn.progressTimer) return;
    conn.progressTimer = setInterval(() => {
      if (this.activeConnections.get(ip) !== conn) { clearInterval(conn.progressTimer); conn.progressTimer = null; return; }
      try {
        conn.player.getStatus((err, st) => {
          if (err || !st) return;
          if (st.media && st.media.duration) conn.duration = st.media.duration;
          const out = normalizeStatus(st, conn);
          if (out && typeof conn.onStatusUpdate === 'function') conn.onStatusUpdate(out);
        });
      } catch {}
    }, 1000);
    if (conn.progressTimer.unref) conn.progressTimer.unref();
  }

  seekPlayback(ip, seconds) {
    const conn = this.activeConnections.get(ip);
    if (!conn || !conn.player) return Promise.resolve({ ok: false });
    return new Promise((resolve) => {
      conn.player.seek(Math.max(0, Number(seconds) || 0), (err) => resolve(err ? { ok: false, error: err.message } : { ok: true }));
    });
  }

  _dropConnection(ip, conn) {
    if (this.activeConnections.get(ip) === conn) this.activeConnections.delete(ip);
    if (conn.progressTimer) { clearInterval(conn.progressTimer); conn.progressTimer = null; }
    try { conn.client.close(); } catch {}
  }

  _sendRokuKeypress(ip, key = 'Back', ecpPort = 8060) {
    return new Promise((resolve) => {
      if (process.env.ROBOS_TEST === '1' || process.env.NODE_TEST_CONTEXT) return resolve(true);
      const req = http.request({
        hostname: ip,
        port: ecpPort,
        path: `/keypress/${encodeURIComponent(key)}`,
        method: 'POST',
        headers: { 'Content-Length': '0' },
        timeout: 1200,
      }, (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
  }

  async getOrReattachActiveCast(onStatusUpdate = null) {
    this._loadRobosSmartTvs();
    try {
      const cfgPath = path.join(os.homedir(), '.config', 'robos', 'tv-studio.json');
      const raw = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
      const castCfg = raw.activeCinemaCast || {};
      const tvsToCheck = [];
      if (castCfg.tvIp) tvsToCheck.push(castCfg.tvIp);
      for (const [ip, tv] of this.speakers.entries()) {
        if (tv.platformId === 'roku-os' && !tvsToCheck.includes(ip)) tvsToCheck.push(ip);
      }

      for (const ip of tvsToCheck) {
        const tvInfo = this.speakers.get(ip) || { ip, name: castCfg.tvName || `Smart TV (${ip})`, platformId: 'roku-os' };
        if (tvInfo.platformId === 'roku-os') {
          const rokuSt = await this._queryRokuMediaPlayer(ip, tvInfo?.ports?.ecp || 8060);
          if (rokuSt && !rokuSt.isKeepAlive && ['play', 'pause', 'buffer', 'startup'].includes(rokuSt.state)) {
            const title = castCfg.title || 'Movie Stream on TV';
            const artist = castCfg.artist || 'RobOS Cinema';
            const mediaUrl = castCfg.mediaUrl || '';
            const tracks = (this.mediaLibrary && Array.isArray(this.mediaLibrary.tracks)) ? this.mediaLibrary.tracks : [];
            const matchedTrack = tracks.find(t =>
              (mediaUrl && mediaUrl.includes(encodeURIComponent(t.id))) ||
              (castCfg.title && t.title === castCfg.title)
            ) || null;
            const durationSec = (rokuSt.durationSec && rokuSt.durationSec > 65)
              ? rokuSt.durationSec
              : (Number(matchedTrack?.duration) || 0);
            const positionSec = Number(rokuSt.positionSec) || Number(castCfg.startAt) || 0;
            const isPaused = rokuSt.state === 'pause';
            const loadId = ++this.loadCounter;

            this._startSmartTvBridgeSession(ip, mediaUrl, {
              title: matchedTrack?.title || title,
              artist: matchedTrack?.artist || artist,
              currentTime: positionSec,
              duration: durationSec,
              paused: isPaused,
            }, (st) => {
              if (typeof onStatusUpdate === 'function') onStatusUpdate(ip, st);
            }, 'song', loadId, { reattachOnly: true });

            return {
              ok: true,
              active: true,
              ip,
              tvName: tvInfo.name || ip,
              title: matchedTrack?.title || title,
              artist: matchedTrack?.artist || artist,
              trackId: matchedTrack?.id || null,
              filePath: matchedTrack?.filePath || null,
              positionSec,
              durationSec,
              isPaused,
              loadId,
            };
          }
        }
      }
    } catch {}
    return { ok: true, active: false };
  }

  async stopPlayback(ip) {
    if (!ip) return { ok: false, error: 'No IP specified' };
    this._loadRobosSmartTvs();
    const tvInfo = this.speakers.get(ip);

    // Always clear activeCinemaCast in ~/.config/robos/tv-studio.json
    this._updateCinemaCastState((prev) => ({ ...prev, active: false, stoppedAt: new Date().toISOString() }));

    // If this is a Roku TV and a full-screen movie is currently playing on it, send Back so it stops immediately
    if (!tvInfo || tvInfo.platformId === 'roku-os') {
      try {
        const rokuSt = await this._queryRokuMediaPlayer(ip, tvInfo?.ports?.ecp || 8060);
        if (rokuSt && !rokuSt.isKeepAlive && ['play', 'pause', 'buffer', 'startup'].includes(rokuSt.state)) {
          await this._sendRokuKeypress(ip, 'Back', tvInfo?.ports?.ecp || 8060);
        }
      } catch {}
    }

    const conn = this.activeConnections.get(ip);
    if (conn) {
      this.activeConnections.delete(ip);
      if (conn.progressTimer) { clearInterval(conn.progressTimer); conn.progressTimer = null; }
      try {
        const sessionId = conn.player?.session?.sessionId || conn.sessionId;
        if (conn.client && conn.client.receiver && sessionId) {
          await new Promise((resolve) => {
            conn.client.receiver.stop(sessionId, () => resolve());
            setTimeout(resolve, 800);
          });
        }
      } catch (err) {
        console.warn(`[CastService] Receiver stop error on ${ip}:`, err.message);
      }

      try {
        if (conn.client) {
          conn.client.close();
        }
      } catch {}
      return { ok: true, stopped: true, ip };
    }

    // Fallback: connect directly and terminate any running session
    if (tvInfo && tvInfo.platformId && tvInfo.platformId !== 'android-tv') {
      return { ok: true, stopped: true, ip };
    }
    return new Promise((resolve) => {
      const client = new Client();
      const timer = setTimeout(() => {
        try { client.close(); } catch {}
        resolve({ ok: false, stopped: false, ip });
      }, 2500);

      client.connect(ip, () => {
        client.getSessions((err, sessions) => {
          if (!err && sessions && sessions.length > 0) {
            let pending = sessions.length;
            for (const s of sessions) {
              client.receiver.stop(s.sessionId, () => {
                pending--;
                if (pending <= 0) {
                  clearTimeout(timer);
                  try { client.close(); } catch {}
                  resolve({ ok: true, stopped: true, ip });
                }
              });
            }
          } else {
            clearTimeout(timer);
            try { client.close(); } catch {}
            resolve({ ok: true, stopped: false, ip });
          }
        });
      });

      client.on('error', () => {
        clearTimeout(timer);
        try { client.close(); } catch {}
        resolve({ ok: false, error: 'Connection failed', ip });
      });
    });
  }

  async stopAllPlayback() {
    const ips = new Set([
      ...this.activeConnections.keys(),
      ...this.speakers.keys()
    ]);
    const results = [];
    for (const ip of ips) {
      results.push(await this.stopPlayback(ip));
    }
    return results;
  }

  pausePlayback(ip) {
    const conn = this.activeConnections.get(ip);
    if (conn && conn.player) {
      conn.player.pause();
      return { ok: true };
    }
    return { ok: false };
  }

  resumePlayback(ip) {
    const conn = this.activeConnections.get(ip);
    if (conn && conn.player) {
      conn.player.play();
      return { ok: true };
    }
    return { ok: false };
  }

  generateChimeBuffer() {
    const sampleRate = 44100;
    const duration = 0.8;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = Buffer.alloc(44 + numSamples * 2);

    // Write standard 16-bit PCM mono WAV header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + numSamples * 2, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // Mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(numSamples * 2, 40);

    // Two-tone harmonic chime (C5 523Hz -> E5 659Hz)
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const freq = t < 0.35 ? 523.25 : 659.25;
      const decay = Math.exp(-t * 3.0);
      const val = Math.floor(Math.sin(2 * Math.PI * freq * t) * decay * 18000);
      buffer.writeInt16LE(Math.max(-32767, Math.min(32767, val)), 44 + i * 2);
    }

    return buffer;
  }

  async playTestChime(ip) {
    const buffer = this.generateChimeBuffer();
    const streamUrl = this.registerBuffer(buffer, 'audio/wav');
    return this.castMediaUrl(ip, streamUrl, {
      title: 'Speaker Test Chime',
      artist: 'RobOS Audio Player',
      album: 'Diagnostics',
      contentType: 'audio/wav'
    });
  }
}

module.exports = { CastService, audioMimeType, sniffAudioType };
