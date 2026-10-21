'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { Client, DefaultMediaReceiver } = require('castv2-client');

const AUDIO_MIME = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.webm': 'audio/webm',
};

function audioMimeType(filePath) {
  return AUDIO_MIME[path.extname(String(filePath || '')).toLowerCase()] || 'audio/mpeg';
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
  if (head.toString('latin1', 4, 8) === 'ftyp') return 'audio/mp4';
  if (head[0] === 0xff && (head[1] & 0xf6) === 0xf0) return 'audio/aac';
  return audioMimeType(filePath);
}

const EXT_FOR_MIME = { 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/flac': 'flac', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm' };

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

    this.streamServer.listen(0, '0.0.0.0', () => {
      this.streamPort = this.streamServer.address().port;
      this.streamServer.unref();
      console.log(`[CastService] Audio stream server ready at http://${this.hostIp}:${this.streamPort}`);
    });
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
    return `http://${host}:${this.streamPort}/cloud-stream/${encodeURIComponent(trackId)}.mp3`;
  }

  /**
   * Scan local subnet for Google Cast / Nest devices
   */
  async scanSubnet(timeoutMs = 1500) {
    const subnetPrefix = this.hostIp.split('.').slice(0, 3).join('.');
    const promises = [];

    for (let i = 1; i <= 254; i++) {
      const ip = `${subnetPrefix}.${i}`;
      promises.push(this._probeCastDevice(ip, timeoutMs));
    }

    const results = await Promise.all(promises);
    for (const dev of results) {
      if (dev) {
        this.speakers.set(dev.ip, dev);
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

  async castMediaUrl(ip, mediaUrl, metadata = {}, onStatusUpdate = null) {
    const media = {
      contentId: mediaUrl,
      contentType: metadata.contentType || 'audio/mpeg',
      streamType: 'BUFFERED',
      metadata: {
        type: 0,
        metadataType: 0,
        title: metadata.title || 'RobOS Audio Stream',
        artist: metadata.artist || 'RobOS Audio Player',
        images: metadata.images || []
      }
    };

    // `currentTime` starts the song part-way (resuming after a DJ preview).
    const loadOpts = { autoplay: true };
    if (metadata.currentTime > 0) loadOpts.currentTime = metadata.currentTime;
    // 'song' or 'dj' (a Virtual DJ line): status updates say which load they are about.
    const role = metadata.role || 'song';
    const loadId = ++this.loadCounter;

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
        if (!settled) { settled = true; reject(err); }
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
