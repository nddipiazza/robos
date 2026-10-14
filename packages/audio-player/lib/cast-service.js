'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { Client, DefaultMediaReceiver } = require('castv2-client');

class CastService {
  constructor() {
    this.speakers = new Map(); // ip -> speaker info
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
      console.log(`[CastService] Audio stream server ready at http://${this.hostIp}:${this.streamPort}`);
    });
  }

  registerFile(filePath, contentType = 'audio/mpeg') {
    const id = `f_${this.nextMediaId++}_${Date.now()}`;
    this.mediaRegistry.set(id, {
      filePath,
      contentType,
    });
    return `http://${this.hostIp}:${this.streamPort}/media/${id}.mp3`;
  }

  registerBuffer(buffer, contentType = 'audio/mp3') {
    const id = `b_${this.nextMediaId++}_${Date.now()}`;
    this.mediaRegistry.set(id, {
      buffer,
      contentType,
    });
    return `http://${this.hostIp}:${this.streamPort}/media/${id}.mp3`;
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
    this.stopPlayback(ip);

    return new Promise((resolve, reject) => {
      const client = new Client();
      client.connect(ip, () => {
        client.launch(DefaultMediaReceiver, (err, player) => {
          if (err) {
            client.close();
            return reject(err);
          }

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

          player.load(media, { autoplay: true }, (err, status) => {
            if (err) {
              client.close();
              return reject(err);
            }

            this.activeConnections.set(ip, { client, player, mediaUrl });

            player.on('status', (s) => {
              if (typeof onStatusUpdate === 'function') {
                onStatusUpdate(s);
              }
              if (s.playerState === 'IDLE' && s.idleReason === 'FINISHED') {
                this.stopPlayback(ip);
              }
            });

            resolve({ ok: true, playerState: status?.playerState, ip });
          });
        });
      });

      client.on('error', (err) => {
        this.activeConnections.delete(ip);
        reject(err);
      });
    });
  }

  stopPlayback(ip) {
    const conn = this.activeConnections.get(ip);
    if (conn) {
      try {
        if (conn.player) conn.player.stop();
      } catch {}
      try {
        if (conn.client) conn.client.close();
      } catch {}
      this.activeConnections.delete(ip);
      return { ok: true, stopped: true };
    }
    return { ok: false, stopped: false };
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

  async broadcastTTS(ip, text, metadata = {}) {
    const cleanText = (text || '').trim();
    if (!cleanText) throw new Error('Text is required for TTS announcement');

    const audioBuffer = await this._fetchTTSAudio(cleanText);
    const mediaUrl = this.registerBuffer(audioBuffer, 'audio/mp3');

    return this.castMediaUrl(ip, mediaUrl, {
      title: 'RobOS Voice Announcement',
      artist: 'RobOS Smart Home',
      contentType: 'audio/mp3',
      ...metadata
    });
  }

  _fetchTTSAudio(text) {
    return new Promise((resolve, reject) => {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`;
      https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`TTS service returned HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    });
  }
}

module.exports = { CastService };
