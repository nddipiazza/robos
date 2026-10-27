/**
 * Zero-Cloud Local Network Cast Service for RobOS Movie Player
 *
 * Discovers Google TV, Chromecast, Nest Hub, and Google Home devices on the local LAN via mDNS
 * (`_googlecast._tcp.local`) and streams local movies, videos, or audio directly over an
 * embedded HTTP byte-range server using CastV2 (`castv2-client`).
 *
 * No cloud accounts, API keys, or external servers are required.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');

let mdnsFactory = null;
let CastClient = null;
let DefaultMediaReceiver = null;

try {
  mdnsFactory = require('multicast-dns');
} catch (_) {}

try {
  const castv2 = require('castv2-client');
  CastClient = castv2.Client;
  DefaultMediaReceiver = castv2.DefaultMediaReceiver;
} catch (_) {}

const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.ogv': 'video/ogg',
  '.ts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.opus': 'audio/ogg'
};

function getLocalLanIp(targetHost = null) {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        candidates.push({ name, address: addr.address, netmask: addr.netmask });
      }
    }
  }

  if (targetHost && candidates.length > 1) {
    const prefix = targetHost.split('.').slice(0, 3).join('.');
    const match = candidates.find(c => c.address.startsWith(prefix + '.'));
    if (match) return match.address;
  }

  return candidates[0]?.address || '127.0.0.1';
}

function parseTxtRecords(txtBuffers) {
  const result = {};
  const list = Array.isArray(txtBuffers) ? txtBuffers : [txtBuffers];
  for (const buf of list) {
    if (!buf) continue;
    const str = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf);
    const idx = str.indexOf('=');
    if (idx > 0) {
      result[str.slice(0, idx)] = str.slice(idx + 1);
    }
  }
  return result;
}

class CastService extends EventEmitter {
  constructor() {
    super();
    this.devices = new Map();
    this.mdns = null;
    this.httpServer = null;
    this.httpPort = 0;
    this.currentFile = null;
    this.servedFiles = new Map();
    this.activeClient = null;
    this.activePlayer = null;
    this.activeDevice = null;
  }

  startDiscovery() {
    if (!mdnsFactory) {
      return Array.from(this.devices.values());
    }
    if (this.mdns) {
      this.queryMdns();
      return Array.from(this.devices.values());
    }

    try {
      this.mdns = mdnsFactory();
      this.mdns.on('response', (packet) => this.handleMdnsPacket(packet));
      this.mdns.on('error', () => {});
      this.queryMdns();
    } catch (_) {}

    return Array.from(this.devices.values());
  }

  queryMdns() {
    if (!this.mdns) return;
    try {
      this.mdns.query({
        questions: [{ name: '_googlecast._tcp.local', type: 'PTR' }]
      });
    } catch (_) {}
  }

  handleMdnsPacket(packet) {
    const records = [...(packet.answers || []), ...(packet.additionals || [])];
    const srvRecords = records.filter(r => r.type === 'SRV');
    const txtRecords = records.filter(r => r.type === 'TXT');
    const aRecords = records.filter(r => r.type === 'A');

    for (const srv of srvRecords) {
      if (!srv.name || !srv.name.includes('_googlecast._tcp.local')) continue;
      const txtRec = txtRecords.find(t => t.name === srv.name);
      const txt = txtRec ? parseTxtRecords(txtRec.data) : {};
      const aRec = aRecords.find(a => a.name === srv.data.target) || aRecords[0];
      if (!aRec || !aRec.data) continue;

      const id = txt.id || srv.name.split('._googlecast')[0];
      const friendlyName = txt.fn || srv.name.split('._googlecast')[0];
      const model = txt.md || 'Google Cast TV / Display';
      const device = {
        id,
        name: friendlyName,
        model,
        host: aRec.data,
        port: srv.data.port || 8009,
        lastSeen: Date.now()
      };
      this.devices.set(id, device);
      this.emit('devices-updated', Array.from(this.devices.values()));
    }
  }

  addManualDevice({ name, host, port = 8009, model = 'Smart TV / Chromecast (Manual)' }) {
    const id = `manual-${host}:${port}`;
    const device = { id, name: name || host, model, host, port: Number(port) || 8009, lastSeen: Date.now() };
    this.devices.set(id, device);
    this.emit('devices-updated', Array.from(this.devices.values()));
    return device;
  }

  getDevices() {
    return Array.from(this.devices.values());
  }

  registerStreamFile(filePath) {
    const token = Buffer.from(filePath).toString('base64url');
    this.servedFiles.set(token, filePath);
    this.currentFile = filePath;
    return token;
  }

  async ensureHttpServer() {
    if (this.httpServer && this.httpPort) {
      return this.httpPort;
    }

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const cleanUrl = (req.url || '/').split('?')[0];
        let filePath = this.currentFile;
        if (cleanUrl.startsWith('/media/')) {
          const token = cleanUrl.slice('/media/'.length);
          if (this.servedFiles.has(token)) filePath = this.servedFiles.get(token);
        }

        if (!filePath || !fs.existsSync(filePath)) {
          res.writeHead(404);
          res.end('No media file queued');
          return;
        }

        const stat = fs.statSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'video/mp4';
        const range = req.headers.range;

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Accept-Ranges', 'bytes');

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
          const chunkSize = (end - start) + 1;

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Content-Length': chunkSize,
            'Content-Type': contentType
          });
          fs.createReadStream(filePath, { start, end }).pipe(res);
        } else {
          res.writeHead(200, {
            'Content-Length': stat.size,
            'Content-Type': contentType
          });
          fs.createReadStream(filePath).pipe(res);
        }
      });

      server.listen(0, '0.0.0.0', () => {
        this.httpServer = server;
        this.httpPort = server.address().port;
        resolve(this.httpPort);
      });
      server.on('error', reject);
    });
  }

  async castTrack(device, track, startTime = 0) {
    return this.castQueue(device, [track], 0, startTime);
  }

  async castQueue(device, tracks, startIndex = 0, startTime = 0) {
    if (!CastClient || !DefaultMediaReceiver) {
      throw new Error('castv2-client not available');
    }
    const list = (Array.isArray(tracks) ? tracks : [tracks]).filter(Boolean);
    if (list.length === 0) {
      throw new Error('No movies to cast');
    }

    this.disconnect();
    const port = await this.ensureHttpServer();
    const lanIp = getLocalLanIp(device.host);

    const queueItems = list.map((t, idx) => {
      let streamUrl = t.path;
      let ext = path.extname(t.path || '').toLowerCase() || '.mp4';
      if (!t.path.startsWith('http://') && !t.path.startsWith('https://')) {
        if (!fs.existsSync(t.path)) {
          throw new Error(`Movie file not found: ${t.path}`);
        }
        const token = this.registerStreamFile(t.path);
        streamUrl = `http://${lanIp}:${port}/media/${token}`;
      }
      const contentType = MIME_TYPES[ext] || 'video/mp4';
      const isVideo = contentType.startsWith('video/');
      return {
        autoplay: true,
        preloadTime: 4,
        startTime: idx === startIndex ? startTime : 0,
        media: {
          contentId: streamUrl,
          contentType,
          streamType: 'BUFFERED',
          metadata: {
            type: isVideo ? 1 : 3,
            metadataType: isVideo ? 1 : 3,
            title: t.title || path.basename(t.path),
            subtitle: t.artist || '',
            studio: t.composer || t.artist || 'RobOS Cinema'
          }
        }
      };
    });

    const firstTrack = list[startIndex] || list[0];

    return new Promise((resolve, reject) => {
      const client = new CastClient();
      this.activeClient = client;
      this.activeDevice = device;

      client.connect(device.host, () => {
        client.launch(DefaultMediaReceiver, (err, player) => {
          if (err) {
            this.disconnect();
            return reject(err);
          }
          this.activePlayer = player;
          player.on('status', status => {
            this.emit('status', { device, status });
          });

          if (queueItems.length === 1) {
            player.load(
              queueItems[0].media,
              { autoplay: true, currentTime: startTime },
              (loadErr, status) => {
                if (loadErr) return reject(loadErr);
                this.emit('connected', { device, track: firstTrack, status });
                resolve({ device, streamUrl: queueItems[0].media.contentId, status, count: 1 });
              }
            );
          } else if (typeof player.queueLoad === 'function') {
            player.queueLoad(
              queueItems,
              { startIndex, repeatMode: 'REPEAT_OFF' },
              (loadErr, status) => {
                if (loadErr) return reject(loadErr);
                this.emit('connected', { device, track: firstTrack, status, queueCount: queueItems.length });
                resolve({ device, streamUrl: queueItems[startIndex].media.contentId, status, count: queueItems.length });
              }
            );
          } else {
            player.load(
              queueItems[startIndex].media,
              { autoplay: true, currentTime: startTime },
              (loadErr, status) => {
                if (loadErr) return reject(loadErr);
                this.emit('connected', { device, track: firstTrack, status });
                resolve({ device, streamUrl: queueItems[startIndex].media.contentId, status, count: 1 });
              }
            );
          }
        });
      });

      client.on('error', (err) => {
        this.emit('error', err);
        this.disconnect();
      });
    });
  }

  generateTestToneWav() {
    const tmpFile = path.join(os.tmpdir(), 'robos-cinema-test-chime.wav');
    if (fs.existsSync(tmpFile)) return tmpFile;
    const sampleRate = 44100;
    const durationSec = 2.0;
    const totalSamples = Math.floor(sampleRate * durationSec);
    const dataSize = totalSamples * 2;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    const notes = [261.63, 329.63, 392.00, 523.25]; // C4 -> E4 -> G4 -> C5 cinema chord arpeggio
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const idx = Math.min(notes.length - 1, Math.floor(t / (durationSec / notes.length)));
      const localT = t - idx * (durationSec / notes.length);
      const env = Math.exp(-localT * 4.5);
      const sample = Math.sin(2 * Math.PI * notes[idx] * t) * env * 0.45;
      buffer.writeInt16LE(Math.max(-32767, Math.min(32767, Math.floor(sample * 32767))), 44 + i * 2);
    }
    fs.writeFileSync(tmpFile, buffer);
    return tmpFile;
  }

  async testSpeaker(device) {
    const wavPath = this.generateTestToneWav();
    return this.castTrack(device, {
      id: 'robos-cinema-test-chime',
      title: 'RobOS Cinema Test Chime',
      artist: 'RobOS Movie Player',
      album: 'LAN Cast Verification',
      path: wavPath
    }, 0);
  }

  control(action, value) {
    if (!this.activePlayer) return false;
    try {
      if (action === 'play') this.activePlayer.play(() => {});
      else if (action === 'pause') this.activePlayer.pause(() => {});
      else if (action === 'stop') this.activePlayer.stop(() => {});
      else if (action === 'seek') this.activePlayer.seek(Number(value) || 0, () => {});
      return true;
    } catch (_) {
      return false;
    }
  }

  disconnect() {
    if (this.activeClient) {
      try {
        this.activeClient.close();
      } catch (_) {}
    }
    this.activeClient = null;
    this.activePlayer = null;
    this.activeDevice = null;
    this.emit('disconnected');
  }

  shutdown() {
    this.disconnect();
    if (this.mdns) {
      try {
        this.mdns.destroy();
      } catch (_) {}
      this.mdns = null;
    }
    if (this.httpServer) {
      try {
        this.httpServer.close();
      } catch (_) {}
      this.httpServer = null;
      this.httpPort = 0;
    }
  }
}

module.exports = { CastService, getLocalLanIp, parseTxtRecords };
