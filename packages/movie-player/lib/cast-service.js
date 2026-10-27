'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { Client, DefaultMediaReceiver } = require('castv2-client');

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
  constructor() {
    this.speakers = new Map(); // ip -> speaker info
    this.loadCounter = 0;
    this.activeConnections = new Map(); // ip -> { client, player, currentMedia, mediaServer }
    this.mediaRegistry = new Map(); // id -> { filePath, buffer, contentType, length }
    this.nextMediaId = 1;
    this.streamServer = null;
    this.streamPort = 0;
    this.hostIp = this._detectHostIp();

    this._initStreamServer();
    this._loadRobosSmartTvs();
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
      const parsedUrl = new URL(req.url, `http://${this.hostIp}:${this.streamPort}`);

      if (parsedUrl.pathname === '/api/tv-library') {
        const tracks = (this.mediaLibrary && Array.isArray(this.mediaLibrary.tracks)) ? this.mediaLibrary.tracks : [];
        const items = tracks.slice(0, 250).map((t, idx) => {
          let streamUrl = '';
          if (t.cloud) {
            streamUrl = `http://${this.hostIp}:${this.streamPort}/cloud-stream/${encodeURIComponent(t.id)}.mp4`;
          } else if (t.filePath && fs.existsSync(t.filePath)) {
            streamUrl = this.registerFile(t.filePath);
          } else {
            streamUrl = t.src || '';
          }
          const artUrl = t.artId ? `http://${this.hostIp}:${this.streamPort}/art/${encodeURIComponent(t.artId)}.jpg` : '';
          return {
            index: idx + 1,
            id: t.id,
            title: String(t.title || 'Untitled Movie').slice(0, 80),
            artist: String(t.artist || 'Feature Film').slice(0, 50),
            album: String(t.album || 'RobOS Cinema').slice(0, 60),
            genre: String(t.genre || 'Movies').slice(0, 32),
            year: t.year || null,
            duration: Number(t.duration) || 0,
            artUrl,
            streamUrl,
          };
        });
        const body = JSON.stringify({
          ok: true,
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
        const tracks = (this.mediaLibrary && Array.isArray(this.mediaLibrary.tracks)) ? this.mediaLibrary.tracks : [];
        const track = tracks.find(t => t.id === trackId) || tracks[0];
        if (!track) {
          res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ ok: false, error: 'Movie not found' }));
          return;
        }
        let streamUrl = '';
        if (track.cloud) {
          streamUrl = `http://${this.hostIp}:${this.streamPort}/cloud-stream/${encodeURIComponent(track.id)}.mp4`;
        } else if (track.filePath && fs.existsSync(track.filePath)) {
          streamUrl = this.registerFile(track.filePath);
        }
        if (typeof this.onTvRemoteSelect === 'function') {
          try { this.onTvRemoteSelect(track, tvIp); } catch {}
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true, id: track.id, title: track.title, streamUrl }));
        return;
      }

      // Handle Album Art requests
      if (parsedUrl.pathname.startsWith('/art/')) {
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

      // Handle Cloud Track on-demand streaming + LRU cache route (/cloud-stream/:trackId)
      if (parsedUrl.pathname.startsWith('/cloud-stream/')) {
        const trackId = decodeURIComponent(parsedUrl.pathname.replace(/^\/cloud-stream\//, '').replace(/\.[^.]+$/, ''));
        const track = this.mediaLibrary && Array.isArray(this.mediaLibrary.tracks)
          ? this.mediaLibrary.tracks.find(t => t.id === trackId)
          : null;

        if (!track || !track.cloud) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Cloud track not found');
          return;
        }

        if (this.cloudStorage && typeof this.cloudStorage.streamCloudTrackToHttp === 'function') {
          this.cloudStorage.streamCloudTrackToHttp(req, res, track.cloud, (cachedFile) => {
            if (cachedFile && fs.existsSync(cachedFile)) {
              track.cloud.cached = true;
              // The full file is here now: let the app re-read its tags from disk.
              if (typeof this.onCloudTrackCached === 'function') this.onCloudTrackCached(track);
            }
          }).catch((err) => {
            console.error('[CastService] Cloud stream error:', err.message);
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'text/plain' });
              res.end(`Cloud stream error: ${err.message}`);
            }
          });
          return;
        }
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
      this.streamServer.unref();
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
        raw.moviePlayerLibrarySnapshot = this.mediaLibrary.tracks.slice(0, 200).map((t, idx) => ({
          index: idx + 1,
          id: t.id,
          title: String(t.title || 'Untitled Movie').slice(0, 80),
          artist: String(t.artist || 'Feature Film').slice(0, 50),
          album: String(t.album || 'RobOS Cinema').slice(0, 60),
          genre: String(t.genre || 'Movies').slice(0, 32),
          year: t.year || null,
          duration: Number(t.duration) || 0,
          artUrl: t.artId ? `http://${this.hostIp}:${this.streamPort}/art/${encodeURIComponent(t.artId)}.jpg` : '',
          streamUrl: t.cloud
            ? `http://${this.hostIp}:${this.streamPort}/cloud-stream/${encodeURIComponent(t.id)}.mp4`
            : (t.filePath && fs.existsSync(t.filePath) ? this.registerFile(t.filePath) : (t.src || '')),
        }));
      }
      fs.writeFileSync(cfgPath, JSON.stringify(raw, null, 2));
    } catch {}
  }

  // The real type matters: speakers may refuse a WAV (e.g. a DJ voice clip) sent as MP3.
  registerFile(filePath, contentType = null) {
    const id = `f_${this.nextMediaId++}_${Date.now()}`;
    const type = contentType || sniffAudioType(filePath);
    this.mediaRegistry.set(id, { filePath, contentType: type });
    return `http://${this.hostIp}:${this.streamPort}/media/${id}.${EXT_FOR_MIME[type] || 'mp3'}`;
  }

  registerBuffer(buffer, contentType = 'audio/mp3') {
    const id = `b_${this.nextMediaId++}_${Date.now()}`;
    this.mediaRegistry.set(id, {
      buffer,
      contentType,
    });
    return `http://${this.hostIp}:${this.streamPort}/media/${id}.mp3`;
  }

  getCloudStreamUrl(trackId, forCast = false) {
    const host = forCast ? this.hostIp : '127.0.0.1';
    return `http://${host}:${this.streamPort}/cloud-stream/${encodeURIComponent(trackId)}.mp4`;
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

  _startSmartTvBridgeSession(ip, mediaUrl, metadata = {}, onStatusUpdate = null, role = 'song', loadId = 1) {
    const tvInfo = this.speakers.get(ip) || { ip, name: `RobOS Smart TV (${ip})`, platformId: 'smart-tv' };
    this._dispatchSmartTvBridge(ip, tvInfo, mediaUrl, metadata);

    const existing = this.activeConnections.get(ip);
    if (existing && existing.progressTimer) {
      clearInterval(existing.progressTimer);
      existing.progressTimer = null;
    }

    const sessionId = `robos-tv-${ip}-${Date.now()}`;
    const state = {
      playerState: 'PLAYING',
      currentTime: Number(metadata.currentTime) > 0 ? Number(metadata.currentTime) : 0,
      duration: Number(metadata.duration) > 0 ? Number(metadata.duration) : 0,
      idleReason: null,
      lastSeekAt: Date.now(),
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
        this._updateCinemaCastState((prev) => ({ ...prev, paused: true }));
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
        }
      }
      if (!updatedFromRoku && state.playerState === 'PLAYING') {
        state.currentTime += 1;
        if (state.duration > 0 && state.currentTime >= state.duration) {
          state.playerState = 'IDLE';
          state.idleReason = 'FINISHED';
        }
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

  async stopPlayback(ip) {
    if (!ip) return { ok: false, error: 'No IP specified' };

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
    const tvInfo = this.speakers.get(ip);
    if (tvInfo && tvInfo.platformId && tvInfo.platformId !== 'android-tv') {
      this._updateCinemaCastState((prev) => ({ ...prev, active: false, stoppedAt: new Date().toISOString() }));
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
