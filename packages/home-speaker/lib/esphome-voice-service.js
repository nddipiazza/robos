'use strict';

const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const EventEmitter = require('events');
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
    vendor: 'Nabu Casa • Home Assistant',
    modelCode: 'NC-VK-9727',
    name: 'Home Assistant Voice PE',
    shortName: 'HA Voice PE',
    protocol: 'esphome-native',
    defaultPort: 6053,
    badge: 'Recommended',
    icon: '🎙️',
    summary: 'Smart desk speaker with a glowing light ring, physical volume dial, and dual microphones.',
    specs: {
      soc: 'ESP32-S3 (16MB Flash, 8MB Octal PSRAM)',
      dsp: 'XMOS XU316 Dual-Mic Array (Echo Cancellation & Noise Reduction)',
      dac: 'TI AIC3204 48kHz Stereo DAC + Built-in Speaker + 3.5mm Aux Jack',
      controls: 'Rotary Dial, Center Action Button, Physical Mic Mute Switch, 12-LED RGB Ring',
      connectivity: '2.4 GHz Wi-Fi (Port 6053) + Bluetooth LE Wi-Fi Setup',
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
      'Plug the speaker into USB-C power. To reset a used unit, hold the center button for 25 seconds until the red ring completes.',
      'In Step 2, connect it to your Wi-Fi via Bluetooth or find it automatically on your network.',
      'In Step 3, test the chime and light ring, then save.',
    ],
  },
  {
    id: 'esphome-voice-satellite',
    rank: 2,
    featured: false,
    vendor: 'ESPHome',
    modelCode: 'ESP32-S3-BOX-3 / Atom Echo',
    name: 'ESPHome Wi-Fi Speaker',
    shortName: 'ESPHome Speaker',
    protocol: 'esphome-native',
    defaultPort: 6053,
    badge: 'Local Network',
    icon: '🔊',
    summary: 'DIY or open-source Wi-Fi speakers running ESPHome firmware on your local network.',
    specs: {
      soc: 'ESP32 / ESP32-S3',
      dsp: 'On-device microWakeWord & ESPHome Media Player',
      dac: 'I2S Internal / External DAC',
      controls: 'Action Button & Status LED',
      connectivity: '2.4 GHz Wi-Fi (ESPHome Native API :6053)',
    },
    capabilities: [
      'audio_playback',
      'flac_48khz',
      'tts_announcements',
      'led_ring_rgb',
    ],
    setupSteps: [
      'Make sure your ESPHome speaker is powered on and connected to your Wi-Fi.',
      'Scan your network or enter its IP address in Step 2.',
    ],
  },
  {
    id: 'ha-media-player-rest',
    rank: 3,
    featured: false,
    vendor: 'Home Assistant',
    modelCode: 'media_player.*',
    name: 'Home Assistant Server Speaker',
    shortName: 'Home Assistant Bridge',
    protocol: 'ha-rest',
    defaultPort: 8123,
    badge: 'Home Assistant',
    icon: '🏠',
    summary: 'Play audio through any speaker already connected to your Home Assistant server (Sonos, HomePod, etc.).',
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
      'Create a Long-Lived Access Token in your Home Assistant profile.',
      'Enter your Home Assistant server IP and speaker entity name.',
    ],
  },
  {
    id: 'google-cast-speaker',
    rank: 4,
    featured: false,
    vendor: 'Google / Nest',
    modelCode: 'Nest Audio / Mini / Hub / Cast',
    name: 'Google Home & Nest Speakers',
    shortName: 'Google Cast Speaker',
    protocol: 'google-cast',
    defaultPort: 8009,
    badge: 'Google Cast',
    icon: '📡',
    summary: 'Standard Google Home, Nest Mini, Nest Audio, Nest Hub, and Chromecast speakers.',
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
      'Make sure your Google Home or Nest speaker is on the same Wi-Fi network.',
      'Click Scan LAN to find it automatically.',
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
class EspHomeVoiceService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.clientInfo = options.clientInfo || 'robos-home-speaker';
    this.deviceMetadataCache = new Map(); // ip -> parsed device & entities metadata
    this.listenerSocket = null;
    this.listenerState = {
      active: false,
      ip: null,
      port: DEFAULT_ESPHOME_PORT,
      status: 'idle', // 'idle' | 'listening_for_wake_word' | 'capturing_speech' | 'transcribing' | 'replying'
      lastWakeWord: null,
      lastTranscript: '',
      lastReply: '',
      lastSpeakerUser: null,
      inbox: [], // { id, timestamp, speakerIp, wakeWord, transcript, reply, audioWavPath, robosUser }
    };
    this._currentPcmChunks = [];
    this._silenceTimer = null;
    this._whisperTranscriberPromise = null;
    this._pendingOnboardingCapture = null;
    if (options.voiceIdentityService) {
      this.voiceIdentityService = options.voiceIdentityService;
    } else {
      const { VoiceIdentityService } = require('./voice-identity-service');
      this.voiceIdentityService = new VoiceIdentityService({ configDir: options.configDir });
    }
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

  // -------------------------------------------------------------------------
  // Incoming Voice Satellite Listener (NC-VK-9727 Dual-Mic + Wake Word / Button)
  // -------------------------------------------------------------------------

  getListenerStatus() {
    return {
      active: this.listenerState.active,
      ip: this.listenerState.ip,
      port: this.listenerState.port,
      status: this.listenerState.status,
      lastWakeWord: this.listenerState.lastWakeWord,
      lastTranscript: this.listenerState.lastTranscript,
      lastReply: this.listenerState.lastReply,
      inbox: this.listenerState.inbox.slice(0, 25),
    };
  }

  clearIncomingInbox() {
    this.listenerState.inbox = [];
    this.emit('listener-update', this.getListenerStatus());
    return { ok: true };
  }

  stopVoiceListener() {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
    if (this.listenerSocket) {
      try {
        // Unsubscribe VoiceAssistant (msgType 89, subscribe=false)
        const unsub = encodeBoolField(1, false);
        this.listenerSocket.write(buildEspHomeFrame(89, unsub));
        this.listenerSocket.destroy();
      } catch {}
      this.listenerSocket = null;
    }
    this.listenerState.active = false;
    this.listenerState.status = 'idle';
    this.emit('listener-update', this.getListenerStatus());
    return this.getListenerStatus();
  }

  /**
   * Start persistent ESPHome Voice Assistant subscription on the NC-VK-9727 (:6053)
   * Listens for on-device wake word ("Okay Nabu" / "Hey Jarvis") or center button press,
   * streams 16kHz 16-bit PCM audio from the XMOS dual-mic array, transcribes it locally,
   * and optionally replies with RobOS Voice / Desktop Assistant.
   */
  async startVoiceListener(ip = '192.168.1.64', options = {}) {
    const port = Number(options.port || DEFAULT_ESPHOME_PORT);
    this.stopVoiceListener();

    this.listenerState.ip = ip;
    this.listenerState.port = port;
    this.listenerState.active = true;
    this.listenerState.status = 'connecting';
    this.AutoReply = options.autoReply !== false;
    this.onAckAudio = options.onAckAudio || null;
    this.onReplyAudio = options.onReplyAudio || null;
    this.emit('listener-update', this.getListenerStatus());

    // Pre-warm Whisper STT and WavLM-SV Speaker Identity models in RAM so utterances have 0ms cold-start
    if (process.env.ROBOS_TEST !== '1') {
      setTimeout(() => {
        this._ensureWhisperTranscriber().catch(() => {});
        if (this.voiceIdentityService && typeof this.voiceIdentityService._getNeuralExtractor === 'function') {
          this.voiceIdentityService._getNeuralExtractor().catch(() => {});
        }
      }, 200);
    }

    return new Promise((resolve) => {
      const socket = new net.Socket();
      this.listenerSocket = socket;
      let rxBuf = Buffer.alloc(0);
      let resolved = false;

      const finishConnect = (ok, errText) => {
        if (resolved) return;
        resolved = true;
        if (!ok) {
          this.listenerState.active = false;
          this.listenerState.status = 'error';
          this.emit('listener-update', this.getListenerStatus());
          resolve({ ok: false, error: errText || 'Could not connect to speaker microphone' });
        } else {
          this.listenerState.status = 'listening_for_wake_word';
          this.emit('listener-update', this.getListenerStatus());
          resolve({ ok: true, status: this.getListenerStatus() });
        }
      };

      socket.on('error', (err) => {
        finishConnect(false, err.message);
      });

      socket.on('close', () => {
        if (this.listenerSocket === socket) {
          this.listenerSocket = null;
          this.listenerState.active = false;
          this.listenerState.status = 'idle';
          this.emit('listener-update', this.getListenerStatus());
        }
      });

      socket.connect(port, ip, () => {
        const helloPayload = Buffer.concat([
          encodeStringField(1, `${this.clientInfo}-listener`),
          encodeVarintField(2, 1),
          encodeVarintField(3, 10),
        ]);
        // SubscribeVoiceAssistantRequest (msgType 89): subscribe=true (1), flags=1 (API_AUDIO)
        const subVoicePayload = Buffer.concat([
          encodeBoolField(1, true),
          encodeVarintField(2, 1),
        ]);
        socket.write(Buffer.concat([
          buildEspHomeFrame(1, helloPayload),
          buildEspHomeFrame(3),
          buildEspHomeFrame(20), // SubscribeStatesRequest (for button & switch events)
          buildEspHomeFrame(89, subVoicePayload),
        ]));
        setTimeout(() => {
          // Send VOICE_ASSISTANT_RUN_END (2) on connect to clear any stuck red/error ring on the speaker
          this._sendVoiceEvent(socket, 2);
          this.setLedRing(ip, { state: false, port }).catch(() => {});
          finishConnect(true);
        }, 350);
      });

      socket.on('data', (chunk) => {
        rxBuf = Buffer.concat([rxBuf, chunk]);
        while (rxBuf.length >= 3) {
          if (rxBuf[0] !== 0x00) {
            rxBuf = Buffer.alloc(0);
            break;
          }
          const lenRes = decodeVarint(rxBuf, 1);
          if (!lenRes) break;
          const typeRes = decodeVarint(rxBuf, lenRes.nextOffset);
          if (!typeRes) break;
          const frameEnd = typeRes.nextOffset + lenRes.value;
          if (rxBuf.length < frameEnd) break;

          const msgType = typeRes.value;
          const payload = rxBuf.slice(typeRes.nextOffset, frameEnd);
          rxBuf = rxBuf.slice(frameEnd);

          this._handleListenerFrame(socket, ip, port, msgType, payload);
        }
      });
    });
  }

  _sendVoiceEvent(socket, eventType, dataPairs = []) {
    if (!socket || socket.destroyed) return;
    const parts = [encodeVarintField(1, eventType)];
    for (const pair of dataPairs) {
      const sub = Buffer.concat([
        encodeStringField(1, pair.name),
        encodeStringField(2, pair.value),
      ]);
      const tag = (2 << 3) | 2;
      parts.push(Buffer.concat([encodeVarint(tag), encodeVarint(sub.length), sub]));
    }
    try {
      socket.write(buildEspHomeFrame(92, Buffer.concat(parts)));
    } catch {}
  }

  _handleListenerFrame(socket, ip, port, msgType, payload) {
    // PingRequest (msgType 7) -> PingResponse (msgType 8)
    if (msgType === 7) {
      try { socket.write(buildEspHomeFrame(8)); } catch {}
      return;
    }

    const f = parseProtobufFields(payload);

    // VoiceAssistantRequest (msgType 90) — Wake word, Center button, or Auto-Start (start_conversation=true) triggered voice stream!
    if (msgType === 90) {
      const start = getVarint(f, 1, 0) === 1;
      const wakePhrase = getStr(f, 5, '') || (this._autoTriggeredMic ? 'Auto-Listen (No Wake Word)' : 'Center Button / Wake Word');
      this._autoTriggeredMic = false;
      if (start) {
        this._currentPcmChunks = [];
        this._captureStartTime = Date.now();
        this.listenerState.lastWakeWord = wakePhrase;
        this.listenerState.status = 'capturing_speech';
        this.emit('listener-update', this.getListenerStatus());

        // Reply with VoiceAssistantResponse (msgType 91): port=0 (use API audio), error=false
        const respPayload = Buffer.concat([
          encodeVarintField(1, 0),
          encodeBoolField(2, false),
        ]);
        try { socket.write(buildEspHomeFrame(91, respPayload)); } catch {}

        // Send VOICE_ASSISTANT_RUN_START (1) and VOICE_ASSISTANT_STT_START (3)
        this._sendVoiceEvent(socket, 1);
        this._sendVoiceEvent(socket, 3);

        // Glow LED ring purple/cyan while listening
        this.setLedRing(ip, { state: true, brightness: 0.9, hexColor: '#00bcd4', port }).catch(() => {});

        if (this._silenceTimer) clearTimeout(this._silenceTimer);
        this._silenceTimer = setTimeout(() => {
          this._finalizeCapturedUtterance(socket, ip, port);
        }, 10000);
      } else {
        this._finalizeCapturedUtterance(socket, ip, port);
      }
      return;
    }

    // VoiceAssistantAudio (msgType 106) — 16kHz 16-bit mono PCM audio chunk from XMOS mics
    if (msgType === 106) {
      const pcmData = f[1] && f[1][0];
      const endFlag = getVarint(f, 2, 0) === 1;
      if (Buffer.isBuffer(pcmData) && pcmData.length > 0) {
        const elapsedSinceStart = Date.now() - (this._captureStartTime || 0);
        // Ignore first 550ms of speaker room reverberation after TTS ends
        if (elapsedSinceStart > 550) {
          this._currentPcmChunks.push(pcmData);
          let sumSq = 0;
          const samples = Math.floor(pcmData.length / 2);
          for (let i = 0; i < samples; i += 4) {
            const s = pcmData.readInt16LE(i * 2) / 32768.0;
            sumSq += s * s;
          }
          const rms = samples > 0 ? Math.sqrt(sumSq / Math.ceil(samples / 4)) : 0;
          const totalBytes = this._currentPcmChunks.reduce((acc, b) => acc + b.length, 0);

          if (rms > 0.038) {
            if (this._silenceTimer) clearTimeout(this._silenceTimer);
            this._silenceTimer = setTimeout(() => {
              this._finalizeCapturedUtterance(socket, ip, port);
            }, 1150);
          } else if (totalBytes > 256000) {
            // Cap at ~8 seconds max per utterance
            this._finalizeCapturedUtterance(socket, ip, port);
          }
        }
      }
      if (endFlag) {
        this._finalizeCapturedUtterance(socket, ip, port);
      }
    }
  }

  /**
   * Play an announcement or prompt (or brief chime) and automatically start recording from the speaker's
   * microphone (`VoiceAssistantAnnounceRequest` msgType 119, `start_conversation = true` field 4)
   * without needing "Okay Nabu" or pressing the center button.
   */
  async announceAndStartListening(ip = '192.168.1.64', flacUrl, text = 'Listening...', options = {}) {
    if (!this.listenerSocket || this.listenerSocket.destroyed || !this.listenerState.active) {
      await this.startVoiceListener(ip, options);
    }
    if (!this.listenerSocket || this.listenerSocket.destroyed) {
      throw new Error('Could not connect to speaker voice assistant socket');
    }
    this._autoTriggeredMic = true;
    const announcePayload = Buffer.concat([
      encodeStringField(1, flacUrl),
      encodeStringField(2, String(text || 'Listening...')),
      encodeBoolField(4, true), // field 4 = start_conversation (automatically opens mic after audio finishes!)
    ]);
    this.listenerSocket.write(buildEspHomeFrame(119, announcePayload));
    return { ok: true, ip, autoListening: true };
  }

  _writePcm16kToWav(pcmBuffer) {
    const sampleRate = 16000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmBuffer.length;
    const header = Buffer.alloc(44);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    const outPath = path.join(os.tmpdir(), `robos-voice-pe-in-${Date.now()}.wav`);
    fs.writeFileSync(outPath, Buffer.concat([header, pcmBuffer]));
    return outPath;
  }

  async _finalizeCapturedUtterance(socket, ip, port) {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
    if (!this._currentPcmChunks || this._currentPcmChunks.length === 0) {
      this.listenerState.status = 'listening_for_wake_word';
      this.emit('listener-update', this.getListenerStatus());
      return;
    }

    const pcmBuffer = Buffer.concat(this._currentPcmChunks);
    this._currentPcmChunks = [];

    // Notify device that VAD & STT capture ended immediately so mic closes cleanly
    this._sendVoiceEvent(socket, 12); // VOICE_ASSISTANT_STT_VAD_END
    this._sendVoiceEvent(socket, 2);  // VOICE_ASSISTANT_RUN_END (releases speaker player for instant ack!)
    this.listenerState.status = 'transcribing';
    this.emit('listener-update', this.getListenerStatus());

    // Switch LED ring to purple "thinking/processing" glow and play immediate spoken acknowledgement ("Got it, please wait.")
    this.setLedRing(ip, { state: true, brightness: 0.78, hexColor: '#a371f7', port }).catch(() => {});
    const ackStartMs = Date.now();
    if (this.AutoReply && typeof this.onAckAudio === 'function') {
      Promise.resolve(this.onAckAudio(ip)).catch(() => {});
    }

    const wavPath = this._writePcm16kToWav(pcmBuffer);
    let transcript = '';
    let speakerMatch = null;
    try {
      const [sttText, idResult] = await Promise.all([
        this.transcribePcm16kBuffer(pcmBuffer).catch((err) => {
          console.warn('[EspHomeVoiceService] Transcription error:', err.message);
          return '';
        }),
        this.voiceIdentityService
          ? this.voiceIdentityService.identifySpeaker({
              pcmBuffer,
              wavPath,
              speakerIp: ip,
              source: 'home-assistant-voice-pe',
            }).catch((err) => {
              console.warn('[EspHomeVoiceService] Speaker ID notice:', err.message);
              return null;
            })
          : Promise.resolve(null),
      ]);
      transcript = sttText;
      speakerMatch = idResult;
    } catch (err) {
      console.warn('[EspHomeVoiceService] Utterance processing error:', err.message);
    }

    transcript = String(transcript || '').trim() || '(Voice note recorded from speaker)';
    this._sendVoiceEvent(socket, 4, [{ name: 'text', value: transcript }]); // VOICE_ASSISTANT_STT_END

    // If a guided speaker voice onboarding capture is waiting for this utterance, enroll it now!
    if (this._pendingOnboardingCapture) {
      const pending = this._pendingOnboardingCapture;
      this._pendingOnboardingCapture = null;
      let enrollRes = { ok: false, error: 'Voice identity service unavailable' };
      try {
        enrollRes = await this.voiceIdentityService.enrollVoiceSample({
          userId: pending.userId,
          name: pending.name,
          role: pending.role || 'Owner',
          email: pending.email || '',
          step: pending.step || 1,
          phrase: pending.phrase || transcript,
          transcript,
          source: `speaker:${ip}`,
          pcmBuffer,
          wavPath,
        });
      } catch (err) {
        enrollRes = { ok: false, error: err.message };
      }

      const enrolledUser = enrollRes.ok && enrollRes.profile
        ? {
            userId: enrollRes.profile.userId,
            name: enrollRes.profile.name,
            displayName: enrollRes.profile.displayName || enrollRes.profile.name,
            role: enrollRes.profile.role,
            avatarColor: enrollRes.profile.avatarColor,
            identified: true,
            enrolled: true,
            confidence: 1.0,
            source: 'voice-onboarding',
            speakerIp: ip,
          }
        : (speakerMatch?.robosUser || null);

      const onboardingReply = enrollRes.ok
        ? `Voice sample ${pending.step || 1} saved for ${enrollRes.profile.name}.`
        : `Could not save voice sample: ${enrollRes.error}`;

      const entry = {
        id: `in_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        speakerIp: ip,
        wakeWord: 'Voice Onboarding',
        transcript,
        skill: 'voice-onboarding',
        reply: onboardingReply,
        audioWavPath: wavPath,
        robosUser: enrolledUser,
      };
      this.listenerState.lastTranscript = transcript;
      this.listenerState.lastReply = onboardingReply;
      this.listenerState.lastSpeakerUser = enrolledUser;
      this.listenerState.inbox.unshift(entry);
      if (this.listenerState.inbox.length > 30) this.listenerState.inbox.length = 30;

      this._sendVoiceEvent(socket, 2); // VOICE_ASSISTANT_RUN_END
      this.setLedRing(ip, { state: false, port }).catch(() => {});
      this.listenerState.status = 'listening_for_wake_word';
      this.emit('listener-update', this.getListenerStatus());
      this.emit('incoming-utterance', entry);

      if (typeof pending.resolve === 'function') {
        pending.resolve({ ...enrollRes, transcript, wavPath, entry });
      }
      if (onboardingReply && typeof this.onReplyAudio === 'function') {
        const waitAck = Math.max(0, 1650 - (Date.now() - ackStartMs));
        if (waitAck > 0) await new Promise((r) => setTimeout(r, waitAck));
        try { await this.onReplyAudio(ip, onboardingReply); } catch {}
      }
      return;
    }

    let robosUser = speakerMatch?.robosUser || null;
    let replyText = '';
    let commandResult = null;
    if (this.AutoReply && transcript && !transcript.startsWith('(Voice note')) {
      this.listenerState.status = 'replying';
      this.emit('listener-update', this.getListenerStatus());
      commandResult = await this._executeNabuVoiceCommand(transcript, {
        robosUser,
        pcmBuffer,
        wavPath,
        speakerIp: ip,
      });
      replyText = commandResult?.response || '';
      if (commandResult?.robosUser) {
        robosUser = commandResult.robosUser;
      }
    }

    const entry = {
      id: `in_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      speakerIp: ip,
      wakeWord: this.listenerState.lastWakeWord || 'Wake Word',
      transcript,
      skill: commandResult?.skill || null,
      reply: replyText,
      audioWavPath: wavPath,
      robosUser,
    };

    this.listenerState.lastTranscript = transcript;
    this.listenerState.lastReply = replyText;
    this.listenerState.lastSpeakerUser = robosUser;
    this.listenerState.inbox.unshift(entry);
    if (this.listenerState.inbox.length > 30) {
      this.listenerState.inbox.length = 30;
    }

    this._sendVoiceEvent(socket, 2); // VOICE_ASSISTANT_RUN_END
    this.setLedRing(ip, { state: false, port }).catch(() => {});

    this.listenerState.status = 'listening_for_wake_word';
    this.emit('listener-update', this.getListenerStatus());
    this.emit('incoming-utterance', entry);

    if (replyText && typeof this.onReplyAudio === 'function') {
      const waitAck = Math.max(0, 1650 - (Date.now() - ackStartMs));
      if (waitAck > 0) await new Promise((r) => setTimeout(r, waitAck));
      try {
        await this.onReplyAudio(ip, replyText);
      } catch {}
    }
  }

  /**
   * Trigger the speaker's microphone to record one Voice Onboarding calibration sample
   * and automatically enroll it into the user's voice profile.
   */
  async captureOnboardingSampleFromSpeaker(ip = '192.168.1.64', {
    userId,
    name,
    role = 'Owner',
    email = '',
    step = 1,
    phrase = '',
    timeoutMs = 15000,
  } = {}) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this._pendingOnboardingCapture && this._pendingOnboardingCapture.resolve === done) {
          this._pendingOnboardingCapture = null;
        }
        resolve({
          ok: false,
          error: 'Timed out waiting for voice sample on speaker microphone.',
        });
      }, timeoutMs);

      const done = (result) => {
        clearTimeout(timer);
        resolve(result);
      };

      this._pendingOnboardingCapture = {
        userId,
        name,
        role,
        email,
        step,
        phrase,
        resolve: done,
      };

      this.triggerListenerCapture(ip, { wakeWordLabel: `Voice Onboarding Step ${step}` }).catch((err) => {
        this._pendingOnboardingCapture = null;
        clearTimeout(timer);
        resolve({ ok: false, error: err.message });
      });
    });
  }

  async _ensureWhisperTranscriber() {
    if (!this._whisperTranscriberPromise) {
      this._whisperTranscriberPromise = (async () => {
        try {
          // Use @xenova/transformers from voice-prompt or local node_modules
          const voicePromptTransformers = path.resolve(
            __dirname,
            '../../voice-prompt/node_modules/@xenova/transformers/src/transformers.js'
          );
          const mod = fs.existsSync(voicePromptTransformers)
            ? await import(voicePromptTransformers)
            : await import('@xenova/transformers');
          return await mod.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
        } catch (err) {
          console.warn('[EspHomeVoiceService] Whisper load notice:', err.message);
          return null;
        }
      })();
    }
    return this._whisperTranscriberPromise;
  }

  async transcribePcm16kBuffer(pcmBuffer) {
    const sampleCount = Math.floor(pcmBuffer.length / 2);
    if (sampleCount < 1600) return '';
    const float32 = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      float32[i] = pcmBuffer.readInt16LE(i * 2) / 32768.0;
    }

    const transcriber = await this._ensureWhisperTranscriber();
    if (!transcriber) return '';
    const result = await transcriber(float32, { chunk_length_s: 15, stride_length_s: 3 });
    return String(result?.text || '')
      .replace(/\[.*?\]/g, '')
      .trim();
  }

  async _executeNabuVoiceCommand(query, context = {}) {
    try {
      const { executeNabuCommand } = require('./nabu-command-router');
      const res = await executeNabuCommand(query, {
        robosUser: context.robosUser || null,
        pcmBuffer: context.pcmBuffer || null,
        wavPath: context.wavPath || null,
        speakerIp: context.speakerIp || null,
        voiceIdentityService: this.voiceIdentityService,
      });
      if (res && res.response) return res;
    } catch (err) {
      console.warn('[EspHomeVoiceService] Nabu command router notice:', err.message);
    }
    const text = await this._queryRobosAssistant(query, context.robosUser);
    return { ok: true, skill: 'assistant', response: text, robosUser: context.robosUser || null };
  }

  async _queryRobosAssistant(query, robosUser = null) {
    // 1. Try running RobOS Voice Desktop Assistant on port 19188 if active
    const fromVoiceDaemon = await new Promise((resolve) => {
      const body = JSON.stringify({ query, speak: false, robosUser });
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: Number(process.env.ROBOS_VOICE_PORT || 19188),
          path: '/api/assistant',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 4500,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed?.turn?.response || parsed?.response || '');
            } catch {
              resolve('');
            }
          });
        }
      );
      req.on('error', () => resolve(''));
      req.on('timeout', () => {
        req.destroy();
        resolve('');
      });
      req.write(body);
      req.end();
    });

    if (fromVoiceDaemon) return fromVoiceDaemon;

    // 2. Built-in fast local smart-home & workstation answers
    const q = query.toLowerCase();
    if (q.includes('time') || q.includes('clock')) {
      return `It is currently ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
    }
    if (q.includes('status') || q.includes('online')) {
      return 'RobOS Home Speaker and your Home Assistant Voice satellite are online and connected.';
    }
    return `Heard from speaker: "${query}"`;
  }
}

module.exports = {
  SUPPORTED_SPEAKER_CATALOG,
  DEFAULT_ESPHOME_PORT,
  EspHomeVoiceService,
  encodeVarint,
  decodeVarint,
  encodeStringField,
  encodeVarintField,
  encodeBoolField,
  encodeFixed32Field,
  encodeFloatField,
  buildEspHomeFrame,
  parseProtobufFields,
};
