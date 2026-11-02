'use strict';

const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec, execFile } = require('child_process');

const DEFAULT_ESPHOME_PORT = 6053;

/**
 * First-class Catalog of Supported Smart Speaker & Voice Satellite Devices
 * Nabu Casa Home Assistant Voice Preview Edition (NC-VK-9727) is #1 in the catalog.
 */
const SUPPORTED_SPEAKER_CATALOG = [
  {
    id: 'ha-voice-pe-nc-vk-9727',
    rank: 1,
    featured: true,
    vendor: 'Nabu Casa / Home Assistant',
    modelCode: 'NC-VK-9727',
    name: 'Home Assistant Voice Preview Edition (NC-VK-9727)',
    shortName: 'HA Voice PE (NC-VK-9727)',
    protocol: 'esphome-native',
    defaultPort: 6053,
    badge: '★ Featured #1 • Open Hardware Voice Satellite',
    icon: '🎙️',
    specs: {
      soc: 'ESP32-S3 (16MB Flash, 8MB Octal PSRAM)',
      dsp: 'XMOS XU316 Dual-Mic Array (Hardware Echo Cancellation & Noise Reduction)',
      dac: 'TI AIC3204 48kHz Stereo DAC + Internal Speaker + 3.5mm Aux Out',
      controls: 'Rotary Encoder Dial, Multi-Function Center Button, Hardware Mic Mute Switch, 12-LED RGB Halo Ring',
      connectivity: '2.4 GHz Wi-Fi (ESPHome Native API :6053) + Bluetooth 5.0 LE (Improv Provisioning)',
    },
    capabilities: [
      'audio_playback',
      'flac_48khz',
      'tts_announcements',
      'led_ring_rgb',
      'rotary_dial_events',
      'center_button_events',
      'hardware_mute_switch',
      'wake_word_config',
      'improv_ble_wifi',
    ],
    setupSteps: [
      'Plug the NC-VK-9727 into USB-C power. If previously paired, hold the center button for 25 seconds until the red LED circle completes to factory reset.',
      'Use Step 2 in this wizard to scan Bluetooth (Improv BLE) and push your 2.4 GHz Wi-Fi credentials (tap the center button once when prompted to authorize), or scan your LAN for port 6053.',
      'Once discovered on your LAN (e.g. 192.168.1.64:6053), test the 12-LED RGB Halo Ring and 48kHz FLAC chime, then save to RobOS Home Speaker.',
    ],
  },
  {
    id: 'esphome-voice-satellite',
    rank: 2,
    featured: false,
    vendor: 'ESPHome / Open Home Foundation',
    modelCode: 'ESP32-S3-BOX-3 / Atom Echo',
    name: 'ESPHome Media Player & Voice Satellite (:6053)',
    shortName: 'ESPHome Speaker',
    protocol: 'esphome-native',
    defaultPort: 6053,
    badge: 'ESPHome Native API (:6053)',
    icon: '🔊',
    specs: {
      soc: 'ESP32 / ESP32-S3',
      dsp: 'On-device microWakeWord & ESPHome Media Player',
      dac: 'I2S Internal / External DAC',
      controls: 'Action Button & Optional Status LED',
      connectivity: '2.4 GHz Wi-Fi (ESPHome Native API :6053)',
    },
    capabilities: [
      'audio_playback',
      'flac_48khz',
      'tts_announcements',
      'led_ring_rgb',
    ],
    setupSteps: [
      'Ensure your ESPHome device has `api:` (without encryption key or open LAN access) and `media_player:` enabled on TCP port 6053.',
      'Scan your subnet or enter the device IP address and port 6053.',
    ],
  },
  {
    id: 'ha-media-player-rest',
    rank: 3,
    featured: false,
    vendor: 'Home Assistant Core / OS',
    modelCode: 'media_player.*',
    name: 'Home Assistant Media Player Bridge (HTTP :8123)',
    shortName: 'Home Assistant Bridge',
    protocol: 'ha-rest',
    defaultPort: 8123,
    badge: 'Home Assistant REST API (:8123)',
    icon: '🏠',
    specs: {
      soc: 'Home Assistant Server / Green / Yellow',
      dsp: 'Bridges Sonos, Apple HomePod, Music Assistant, DLNA, and Wyoming Satellites',
      dac: 'Network Stream via media_player.play_media',
      controls: 'Volume, Pause/Resume, Stop, Announcements',
      connectivity: 'HTTP REST :8123 (/api/services/media_player/*)',
    },
    capabilities: [
      'audio_playback',
      'tts_announcements',
    ],
    setupSteps: [
      'In Home Assistant → Profile → Long-Lived Access Tokens, create an access token.',
      'Enter your Home Assistant host IP, port 8123, target entity ID (e.g. `media_player.home_assistant_voice_0ad22c_media_player`), and token.',
    ],
  },
  {
    id: 'google-cast-speaker',
    rank: 4,
    featured: false,
    vendor: 'Google / Nest / Lenovo',
    modelCode: 'Nest Audio / Mini / Hub / Cast',
    name: 'Google Home, Nest & Chromecast Audio (:8009)',
    shortName: 'Google Cast Speaker',
    protocol: 'google-cast',
    defaultPort: 8009,
    badge: 'Zero-Cloud Castv2 TLS (:8009)',
    icon: '📡',
    specs: {
      soc: 'Google Cast Receiver',
      dsp: 'Far-field Cast Media Receiver',
      dac: 'Integrated Speaker / Cast Audio Out',
      controls: 'Volume, Mute, Pause/Resume, Stop',
      connectivity: 'LAN TCP :8009 (Castv2 Protocol)',
    },
    capabilities: [
      'audio_playback',
      'tts_announcements',
    ],
    setupSteps: [
      'Ensure your Google Home, Nest Mini, Nest Hub, or Smart Clock is connected to the same local network subnet.',
      'Click Scan LAN to probe TCP port 8009 and automatically fetch device names.',
    ],
  },
];

// ---------------------------------------------------------------------------
// Minimal Zero-Dependency Protobuf Wire Helpers for ESPHome Native API (:6053)
// ---------------------------------------------------------------------------

function encodeVarint(val) {
  let v = val >>> 0;
  const bytes = [];
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return Buffer.from(bytes);
}

function decodeVarint(buf, offset = 0) {
  let val = 0;
  let shift = 0;
  let idx = offset;
  while (idx < buf.length) {
    const b = buf[idx++];
    val |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) {
      return { value: val >>> 0, nextOffset: idx };
    }
    shift += 7;
    if (shift > 35) break;
  }
  return null;
}

function encodeFixed32(val) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(val >>> 0, 0);
  return b;
}

function encodeFloat(val) {
  const b = Buffer.alloc(4);
  b.writeFloatLE(Number(val) || 0, 0);
  return b;
}

function encodeStringField(fieldNum, str) {
  const strBuf = Buffer.from(String(str || ''), 'utf8');
  const tag = (fieldNum << 3) | 2;
  return Buffer.concat([encodeVarint(tag), encodeVarint(strBuf.length), strBuf]);
}

function encodeBoolField(fieldNum, boolVal) {
  const tag = (fieldNum << 3) | 0;
  return Buffer.concat([encodeVarint(tag), Buffer.from([boolVal ? 1 : 0])]);
}

function encodeVarintField(fieldNum, intVal) {
  const tag = (fieldNum << 3) | 0;
  return Buffer.concat([encodeVarint(tag), encodeVarint(intVal)]);
}

function encodeFixed32Field(fieldNum, intVal) {
  const tag = (fieldNum << 3) | 5;
  return Buffer.concat([encodeVarint(tag), encodeFixed32(intVal)]);
}

function encodeFloatField(fieldNum, floatVal) {
  const tag = (fieldNum << 3) | 5;
  return Buffer.concat([encodeVarint(tag), encodeFloat(floatVal)]);
}

function buildEspHomeFrame(msgType, payload = Buffer.alloc(0)) {
  return Buffer.concat([
    Buffer.from([0x00]),
    encodeVarint(payload.length),
    encodeVarint(msgType),
    payload,
  ]);
}

function parseProtobufFields(buf) {
  let idx = 0;
  const fields = {};
  while (idx < buf.length) {
    const tagRes = decodeVarint(buf, idx);
    if (!tagRes) break;
    idx = tagRes.nextOffset;
    const fieldNum = tagRes.value >>> 3;
    const wireType = tagRes.value & 0x07;

    if (wireType === 0) {
      const valRes = decodeVarint(buf, idx);
      if (!valRes) break;
      idx = valRes.nextOffset;
      if (!fields[fieldNum]) fields[fieldNum] = [];
      fields[fieldNum].push(valRes.value);
    } else if (wireType === 2) {
      const lenRes = decodeVarint(buf, idx);
      if (!lenRes) break;
      idx = lenRes.nextOffset;
      const slice = buf.slice(idx, idx + lenRes.value);
      idx += lenRes.value;
      if (!fields[fieldNum]) fields[fieldNum] = [];
      fields[fieldNum].push(slice);
    } else if (wireType === 5) {
      if (idx + 4 > buf.length) break;
      const raw = buf.slice(idx, idx + 4);
      idx += 4;
      if (!fields[fieldNum]) fields[fieldNum] = [];
      fields[fieldNum].push(raw);
    } else if (wireType === 1) {
      if (idx + 8 > buf.length) break;
      const raw = buf.slice(idx, idx + 8);
      idx += 8;
      if (!fields[fieldNum]) fields[fieldNum] = [];
      fields[fieldNum].push(raw);
    } else {
      break;
    }
  }
  return fields;
}

function getStr(fields, num, fallback = '') {
  const v = fields[num] && fields[num][0];
  return Buffer.isBuffer(v) ? v.toString('utf8') : fallback;
}

function getFixed32(fields, num, fallback = 0) {
  const v = fields[num] && fields[num][0];
  return Buffer.isBuffer(v) && v.length === 4 ? v.readUInt32LE(0) : fallback;
}

function getFloat(fields, num, fallback = 0) {
  const v = fields[num] && fields[num][0];
  return Buffer.isBuffer(v) && v.length === 4 ? v.readFloatLE(0) : fallback;
}

function getVarint(fields, num, fallback = 0) {
  const v = fields[num] && fields[num][0];
  return typeof v === 'number' ? v : fallback;
}

/**
 * ESPHome Native API Client for Home Assistant Voice PE (NC-VK-9727) & ESPHome Satellites
 */
class EspHomeVoiceService {
  constructor(options = {}) {
    this.clientInfo = options.clientInfo || 'robos-home-speaker';
    this.deviceMetadataCache = new Map(); // ip -> parsed device & entities metadata
  }

  /**
   * Probe a single IP on port 6053 to check if it's an ESPHome / HA Voice PE device
   */
  async probeDevice(ip, port = DEFAULT_ESPHOME_PORT, timeoutMs = 1500) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      let rxBuf = Buffer.alloc(0);
      let listEntitiesDone = false;

      const info = {
        ip,
        port,
        protocol: 'esphome-native',
        online: false,
        name: '',
        friendlyName: '',
        mac: '',
        esphomeVersion: '',
        model: '',
        manufacturer: '',
        projectName: '',
        projectVersion: '',
        isVoicePe: false,
        entities: {
          mediaPlayer: null,
          ledRing: null,
          switches: [],
          selects: [],
          events: [],
        },
      };

      const finish = (result) => {
        if (settled) return;
        settled = true;
        try { socket.destroy(); } catch {}
        if (result && result.online) {
          this.deviceMetadataCache.set(ip, result);
        }
        resolve(result);
      };

      const timer = setTimeout(() => {
        finish(info.online ? info : null);
      }, timeoutMs);

      socket.on('error', () => {
        clearTimeout(timer);
        finish(null);
      });

      socket.connect(port, ip, () => {
        const helloPayload = Buffer.concat([
          encodeStringField(1, this.clientInfo),
          encodeVarintField(2, 1),
          encodeVarintField(3, 9),
        ]);
        socket.write(Buffer.concat([
          buildEspHomeFrame(1, helloPayload), // HelloRequest
          buildEspHomeFrame(3),               // ConnectRequest
          buildEspHomeFrame(9),               // DeviceInfoRequest
          buildEspHomeFrame(11),              // ListEntitiesRequest
        ]));
      });

      socket.on('data', (chunk) => {
        rxBuf = Buffer.concat([rxBuf, chunk]);
        while (rxBuf.length >= 3) {
          if (rxBuf[0] !== 0x00) {
            clearTimeout(timer);
            finish(info.online ? info : null);
            return;
          }
          const lenRes = decodeVarint(rxBuf, 1);
          if (!lenRes) return;
          const typeRes = decodeVarint(rxBuf, lenRes.nextOffset);
          if (!typeRes) return;
          const frameEnd = typeRes.nextOffset + lenRes.value;
          if (rxBuf.length < frameEnd) return;

          const msgType = typeRes.value;
          const payload = rxBuf.slice(typeRes.nextOffset, frameEnd);
          rxBuf = rxBuf.slice(frameEnd);

          this._handleDiscoveryFrame(info, msgType, payload);
          if (msgType === 19) { // ListEntitiesDoneResponse
            listEntitiesDone = true;
          }
        }

        if (info.online && listEntitiesDone) {
          clearTimeout(timer);
          finish(info);
        }
      });

      socket.on('close', () => {
        clearTimeout(timer);
        finish(info.online ? info : null);
      });
    });
  }

  _handleDiscoveryFrame(info, msgType, payload) {
    const f = parseProtobufFields(payload);
    if (msgType === 2) {
      // HelloResponse
      info.online = true;
      info.name = getStr(f, 4, info.name);
    } else if (msgType === 10) {
      // DeviceInfoResponse
      info.online = true;
      info.name = getStr(f, 2, info.name);
      info.mac = getStr(f, 3, info.mac);
      info.esphomeVersion = getStr(f, 4, info.esphomeVersion);
      info.model = getStr(f, 6, info.model);
      info.projectName = getStr(f, 8, info.projectName);
      info.projectVersion = getStr(f, 9, info.projectVersion);
      info.manufacturer = getStr(f, 12, info.manufacturer);
      info.friendlyName = getStr(f, 13, info.friendlyName);
      if (
        info.projectName.toLowerCase().includes('voice pe') ||
        info.name.toLowerCase().includes('voice') ||
        info.friendlyName.toLowerCase().includes('voice')
      ) {
        info.isVoicePe = true;
      }
    } else if (msgType === 15) {
      // ListEntitiesLightResponse
      const objectId = getStr(f, 1);
      const key = getFixed32(f, 2);
      const name = getStr(f, 3);
      info.entities.ledRing = { objectId, key, name };
    } else if (msgType === 17) {
      // ListEntitiesSwitchResponse
      info.entities.switches.push({
        objectId: getStr(f, 1),
        key: getFixed32(f, 2),
        name: getStr(f, 3),
      });
    } else if (msgType === 52) {
      // ListEntitiesSelectResponse
      const options = (f[6] || []).map((b) => (Buffer.isBuffer(b) ? b.toString('utf8') : String(b)));
      info.entities.selects.push({
        objectId: getStr(f, 1),
        key: getFixed32(f, 2),
        name: getStr(f, 3),
        options,
      });
    } else if (msgType === 63) {
      // ListEntitiesMediaPlayerResponse
      const objectId = getStr(f, 1);
      const key = getFixed32(f, 2);
      const name = getStr(f, 3);
      const formats = (f[9] || []).map((fmtBuf) => {
        const ff = parseProtobufFields(fmtBuf);
        return {
          format: getStr(ff, 1, 'flac'),
          sampleRate: getVarint(ff, 2, 48000),
          numChannels: getVarint(ff, 3, 1),
          purpose: getVarint(ff, 4, 0),
        };
      });
      info.entities.mediaPlayer = { objectId, key, name, formats };
    } else if (msgType === 107) {
      // ListEntitiesEventResponse
      const eventTypes = (f[9] || []).map((b) => (Buffer.isBuffer(b) ? b.toString('utf8') : String(b)));
      info.entities.events.push({
        objectId: getStr(f, 1),
        key: getFixed32(f, 2),
        name: getStr(f, 3),
        eventTypes,
      });
    }
  }

  /**
   * Scan the local 24-bit subnet for ESPHome / HA Voice PE devices on TCP port 6053
   */
  async scanSubnet(hostIp, timeoutMs = 1200) {
    const prefix = String(hostIp || '192.168.1.1').split('.').slice(0, 3).join('.');
    const batchSize = 64;
    const found = [];

    for (let start = 1; start <= 254; start += batchSize) {
      const promises = [];
      for (let i = start; i < Math.min(255, start + batchSize); i++) {
        const ip = `${prefix}.${i}`;
        promises.push(this.probeDevice(ip, DEFAULT_ESPHOME_PORT, timeoutMs).catch(() => null));
      }
      const results = await Promise.all(promises);
      for (const r of results) {
        if (r && r.online && (r.entities.mediaPlayer || r.isVoicePe)) {
          found.push(this.toSpeakerRecord(r));
        }
      }
    }
    return found;
  }

  toSpeakerRecord(probeInfo) {
    const isPe = probeInfo.isVoicePe || (probeInfo.projectName || '').includes('Voice PE');
    return {
      ip: probeInfo.ip,
      port: probeInfo.port || DEFAULT_ESPHOME_PORT,
      name: probeInfo.friendlyName || probeInfo.name || `HA Voice PE (${probeInfo.ip})`,
      model: isPe
        ? 'Nabu Casa HA Voice PE (NC-VK-9727)'
        : (probeInfo.projectName || probeInfo.model || 'ESPHome Media Player'),
      modelCode: isPe ? 'NC-VK-9727' : (probeInfo.model || 'ESPHome'),
      protocol: 'esphome-native',
      catalogId: isPe ? 'ha-voice-pe-nc-vk-9727' : 'esphome-voice-satellite',
      mac: probeInfo.mac || '',
      firmware: probeInfo.projectVersion || probeInfo.esphomeVersion || '',
      online: Boolean(probeInfo.online),
      volume: 0.7,
      muted: false,
      mediaPlayerKey: probeInfo.entities?.mediaPlayer?.key || 2232357057,
      ledRingKey: probeInfo.entities?.ledRing?.key || 1459351809,
      capabilities: isPe
        ? ['audio_playback', 'flac_48khz', 'led_ring_rgb', 'rotary_dial', 'center_button', 'hardware_mute']
        : ['audio_playback', 'flac_48khz'],
      entities: probeInfo.entities,
      lastSeen: Date.now(),
    };
  }

  async _ensureKeys(ip, port = DEFAULT_ESPHOME_PORT) {
    let cached = this.deviceMetadataCache.get(ip);
    if (!cached || !cached.entities || !cached.entities.mediaPlayer) {
      cached = await this.probeDevice(ip, port, 1800);
    }
    return {
      mediaPlayerKey: cached?.entities?.mediaPlayer?.key || 2232357057,
      ledRingKey: cached?.entities?.ledRing?.key || 1459351809,
      switches: cached?.entities?.switches || [],
      selects: cached?.entities?.selects || [],
    };
  }

  /**
   * Send one or more raw protobuf command frames to an ESPHome device
   */
  async _sendCommands(ip, port = DEFAULT_ESPHOME_PORT, frames = [], waitMs = 350) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let done = false;
      const finish = (err, val) => {
        if (done) return;
        done = true;
        try { socket.destroy(); } catch {}
        if (err) reject(err);
        else resolve(val);
      };

      const timer = setTimeout(() => finish(null, { ok: true }), waitMs + 1500);

      socket.on('error', (err) => {
        clearTimeout(timer);
        finish(err);
      });

      socket.connect(port, ip, () => {
        const helloPayload = Buffer.concat([
          encodeStringField(1, this.clientInfo),
          encodeVarintField(2, 1),
          encodeVarintField(3, 9),
        ]);
        socket.write(Buffer.concat([
          buildEspHomeFrame(1, helloPayload),
          buildEspHomeFrame(3),
          ...frames,
        ]));
        setTimeout(() => {
          clearTimeout(timer);
          finish(null, { ok: true });
        }, waitMs);
      });
    });
  }

  /**
   * Play a media URL on the ESPHome MediaPlayer entity (Packet ID 65)
   */
  async playMediaUrl(ip, mediaUrl, options = {}) {
    const port = options.port || DEFAULT_ESPHOME_PORT;
    const { mediaPlayerKey, ledRingKey } = await this._ensureKeys(ip, port);
    const announcement = options.announcement !== false;

    const frames = [];

    // Optional cyan glow on LED Ring while announcing
    if (options.flashLed !== false && ledRingKey) {
      const rgb = options.ledRgb || { r: 0.0, g: 0.74, b: 0.83 };
      const lightOnPayload = Buffer.concat([
        encodeFixed32Field(1, ledRingKey),
        encodeBoolField(2, true),
        encodeBoolField(3, true),
        encodeBoolField(4, true),
        encodeFloatField(5, 0.8),
        encodeBoolField(6, true),
        encodeFloatField(7, rgb.r),
        encodeFloatField(8, rgb.g),
        encodeFloatField(9, rgb.b),
      ]);
      frames.push(buildEspHomeFrame(32, lightOnPayload));
    }

    if (typeof options.volume === 'number') {
      const volPayload = Buffer.concat([
        encodeFixed32Field(1, mediaPlayerKey),
        encodeBoolField(4, true),
        encodeFloatField(5, Math.max(0, Math.min(1, options.volume))),
      ]);
      frames.push(buildEspHomeFrame(65, volPayload));
    }

    const playPayload = Buffer.concat([
      encodeFixed32Field(1, mediaPlayerKey),
      encodeBoolField(6, true),
      encodeStringField(7, mediaUrl),
      encodeBoolField(8, true),
      encodeBoolField(9, announcement),
    ]);
    frames.push(buildEspHomeFrame(65, playPayload));

    await this._sendCommands(ip, port, frames, 450);

    // Automatically turn off the temporary announcement LED glow after a short delay
    if (options.flashLed !== false && ledRingKey && !options.keepLedOn) {
      setTimeout(() => {
        this.setLedRing(ip, { state: false, port }).catch(() => {});
      }, options.ledDurationMs || 4500);
    }

    return { ok: true, ip, mediaUrl, protocol: 'esphome-native' };
  }

  /**
   * Set speaker volume (0.0 to 1.0) and optional mute state
   */
  async setVolume(ip, level, muted = false, port = DEFAULT_ESPHOME_PORT) {
    const { mediaPlayerKey } = await this._ensureKeys(ip, port);
    const frames = [];
    if (typeof level === 'number') {
      const volPayload = Buffer.concat([
        encodeFixed32Field(1, mediaPlayerKey),
        encodeBoolField(4, true),
        encodeFloatField(5, Math.max(0, Math.min(1, level))),
      ]);
      frames.push(buildEspHomeFrame(65, volPayload));
    }
    if (typeof muted === 'boolean') {
      // MEDIA_PLAYER_COMMAND_MUTE = 3, UNMUTE = 4
      const muteCmd = muted ? 3 : 4;
      const mutePayload = Buffer.concat([
        encodeFixed32Field(1, mediaPlayerKey),
        encodeBoolField(2, true),
        encodeVarintField(3, muteCmd),
      ]);
      frames.push(buildEspHomeFrame(65, mutePayload));
    }
    return this._sendCommands(ip, port, frames, 300);
  }

  /**
   * Send MediaPlayerCommand (PLAY=0, PAUSE=1, STOP=2)
   */
  async sendMediaCommand(ip, commandEnum, port = DEFAULT_ESPHOME_PORT) {
    const { mediaPlayerKey } = await this._ensureKeys(ip, port);
    const cmdPayload = Buffer.concat([
      encodeFixed32Field(1, mediaPlayerKey),
      encodeBoolField(2, true),
      encodeVarintField(3, commandEnum),
    ]);
    return this._sendCommands(ip, port, [buildEspHomeFrame(65, cmdPayload)], 300);
  }

  /**
   * Control the 12-LED RGB Halo Ring on the NC-VK-9727 (Packet ID 32)
   */
  async setLedRing(ip, { state = true, brightness = 0.85, hexColor = '#00bcd4', port = DEFAULT_ESPHOME_PORT } = {}) {
    const { ledRingKey } = await this._ensureKeys(ip, port);
    const cleanHex = String(hexColor || '#00bcd4').replace(/^#/, '');
    const r = parseInt(cleanHex.slice(0, 2) || '00', 16) / 255;
    const g = parseInt(cleanHex.slice(2, 4) || 'bc', 16) / 255;
    const b = parseInt(cleanHex.slice(4, 6) || 'd4', 16) / 255;

    const parts = [
      encodeFixed32Field(1, ledRingKey),
      encodeBoolField(2, true),
      encodeBoolField(3, Boolean(state)),
    ];

    if (state) {
      parts.push(
        encodeBoolField(4, true),
        encodeFloatField(5, Math.max(0.05, Math.min(1, Number(brightness) || 0.85))),
        encodeBoolField(6, true),
        encodeFloatField(7, r),
        encodeFloatField(8, g),
        encodeFloatField(9, b)
      );
    }

    const payload = Buffer.concat(parts);
    return this._sendCommands(ip, port, [buildEspHomeFrame(32, payload)], 300);
  }

  /**
   * Convert any audio file to 48kHz 16-bit FLAC (required by HA Voice PE's hardware pipeline)
   */
  async convertToFlac48k(sourceAudioPath, channels = 1) {
    const outPath = path.join(
      os.tmpdir(),
      `robos-pe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.flac`
    );
    await new Promise((resolve, reject) => {
      execFile(
        'ffmpeg',
        [
          '-y',
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          sourceAudioPath,
          '-ar',
          '48000',
          '-ac',
          String(channels),
          '-sample_fmt',
          's16',
          outPath,
        ],
        (err) => {
          if (!err && fs.existsSync(outPath)) resolve(outPath);
          else reject(err || new Error('FFmpeg FLAC 48kHz transcode failed'));
        }
      );
    });
    return outPath;
  }

  /**
   * Scan nearby Bluetooth Low Energy (BLE) for unprovisioned Improv BLE / HA Voice PE devices
   */
  async scanBleImprovDevices(timeoutSec = 4) {
    return new Promise((resolve) => {
      exec(
        `bluetoothctl --timeout ${Math.max(2, timeoutSec)} scan on 2>&1; bluetoothctl devices 2>&1`,
        { timeout: (timeoutSec + 4) * 1000 },
        (_err, stdout) => {
          const devices = [];
          const seen = new Set();
          const lines = String(stdout || '').split('\n');
          for (const line of lines) {
            const m = line.match(/Device\s+([0-9A-F:]{17})\s+(.+)$/i);
            if (m) {
              const mac = m[1].toUpperCase();
              const name = m[2].trim();
              if (
                !seen.has(mac) &&
                (name.toLowerCase().includes('ha-voice-pe') ||
                  name.toLowerCase().includes('voice') ||
                  name.toLowerCase().includes('esphome') ||
                  name.toLowerCase().includes('improv'))
              ) {
                seen.add(mac);
                devices.push({
                  mac,
                  name,
                  modelCode: name.toLowerCase().includes('ha-voice-pe') ? 'NC-VK-9727' : 'Improv BLE',
                  protocol: 'improv-ble',
                });
              }
            }
          }
          resolve(devices);
        }
      );
    });
  }

  /**
   * Build an Improv BLE RPC Command (0x01) packet for Wi-Fi provisioning
   */
  buildImprovWifiPacket(ssid, password) {
    const ssidBuf = Buffer.from(String(ssid || ''), 'utf8');
    const passBuf = Buffer.from(String(password || ''), 'utf8');
    const data = Buffer.concat([
      Buffer.from([ssidBuf.length]),
      ssidBuf,
      Buffer.from([passBuf.length]),
      passBuf,
    ]);
    const headerAndData = Buffer.concat([Buffer.from([0x01, data.length]), data]);
    let sum = 0;
    for (const b of headerAndData) {
      sum = (sum + b) & 0xff;
    }
    return Buffer.concat([headerAndData, Buffer.from([sum])]);
  }

  /**
   * Provision an Improv BLE device (like NC-VK-9727) with 2.4 GHz Wi-Fi credentials via bluetoothctl
   */
  async provisionBleWifi({ mac, ssid, password }) {
    if (!mac || !ssid) {
      throw new Error('Bluetooth MAC address and 2.4 GHz Wi-Fi SSID are required.');
    }
    const packet = this.buildImprovWifiPacket(ssid, password || '');
    const hexArgs = Array.from(packet)
      .map((b) => `0x${b.toString(16).padStart(2, '0')}`)
      .join(' ');

    const script = [
      `connect ${mac}`,
      'sleep 2',
      'gatt.select-attribute 00467768-6228-2272-4663-277478268001',
      'sleep 1',
      'gatt.read',
      'sleep 1',
      'gatt.select-attribute 00467768-6228-2272-4663-277478268003',
      'sleep 1',
      `gatt.write "${hexArgs}"`,
      'sleep 4',
      'quit',
    ].join('\n');

    return new Promise((resolve) => {
      const child = exec('bluetoothctl 2>&1', { timeout: 18000 }, (_err, stdout) => {
        const out = String(stdout || '');
        const needsButton = out.includes('  01 ') && !out.includes('  02 ');
        resolve({
          ok: !needsButton,
          needsAuthorizationButton: needsButton,
          mac,
          ssid,
          rawOutput: out.slice(-600),
        });
      });
      if (child.stdin) {
        for (const line of script.split('\n')) {
          if (line.startsWith('sleep ')) {
            // handled via sequential writes below
          }
        }
        // Feed commands with intervals
        const cmds = [
          { cmd: `connect ${mac}\n`, delay: 0 },
          { cmd: `gatt.select-attribute 00467768-6228-2272-4663-277478268001\n`, delay: 2200 },
          { cmd: `gatt.read\n`, delay: 3000 },
          { cmd: `gatt.select-attribute 00467768-6228-2272-4663-277478268003\n`, delay: 4000 },
          { cmd: `gatt.write "${hexArgs}"\n`, delay: 4800 },
          { cmd: `quit\n`, delay: 9000 },
        ];
        for (const item of cmds) {
          setTimeout(() => {
            try {
              child.stdin.write(item.cmd);
            } catch {}
          }, item.delay);
        }
      }
    });
  }
}

module.exports = {
  SUPPORTED_SPEAKER_CATALOG,
  DEFAULT_ESPHOME_PORT,
  EspHomeVoiceService,
  encodeVarint,
  decodeVarint,
  buildEspHomeFrame,
  parseProtobufFields,
};
