'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const { CastService } = require('../../audio-player/lib/cast-service');
const { SOUNDS, getSound, generateIntercomChime } = require('./soundboard');
const { MediaLibraryClient } = require('./media-library-client');
const { SpeakerScheduler } = require('./scheduler');
const {
  SUPPORTED_SPEAKER_CATALOG,
  DEFAULT_ESPHOME_PORT,
  EspHomeVoiceService,
} = require('./esphome-voice-service');

let TTSEngine = null;
try {
  const ttsMod = require('../../voice-prompt/lib/tts-engine');
  TTSEngine = ttsMod.TTSEngine;
} catch {
  try {
    const ttsMod = require('/usr/local/share/robos/voice-prompt/lib/tts-engine');
    TTSEngine = ttsMod.TTSEngine;
  } catch {}
}

const CONFIG_DIR = path.join(os.homedir(), '.config', 'robos');
const CACHE_FILE = path.join(CONFIG_DIR, 'home-speakers.json');

class HomeSpeakerService {
  constructor() {
    this.castService = new CastService();
    this.esphomeService = new EspHomeVoiceService();
    this.ttsEngine = TTSEngine ? new TTSEngine() : null;
    this.mediaClient = new MediaLibraryClient();
    this.scheduler = new SpeakerScheduler({
      executor: (job) => this.executeScheduledJob(job)
    });
    this.knownSpeakers = new Map();
    this.activeBroadcasts = new Map(); // ip -> { title, type, startTime }

    this._loadCache();
    this.scheduler.start();
  }

  _loadCache() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const data = JSON.parse(fs.existsSync(CACHE_FILE) ? fs.readFileSync(CACHE_FILE, 'utf8') : '{}');
        if (Array.isArray(data.speakers)) {
          for (const s of data.speakers) {
            if (s && s.ip) {
              this.knownSpeakers.set(s.ip, s);
            }
          }
        }
      }
    } catch {}

    // Seed defaults if empty, and always ensure the Featured #1 Home Assistant Voice PE (NC-VK-9727) is registered
    if (this.knownSpeakers.size === 0) {
      const defaults = [
        {
          ip: '192.168.1.64',
          port: 6053,
          name: 'Home Assistant Voice 0ad22c',
          model: 'Nabu Casa HA Voice PE (NC-VK-9727)',
          modelCode: 'NC-VK-9727',
          protocol: 'esphome-native',
          catalogId: 'ha-voice-pe-nc-vk-9727',
          mac: '20:F8:3B:0A:D2:2C',
          firmware: '25.5.2',
          online: true,
          volume: 0.7,
          muted: false,
          capabilities: ['audio_playback', 'flac_48khz', 'led_ring_rgb', 'rotary_dial', 'center_button', 'hardware_mute'],
        },
        { ip: '192.168.1.10', name: 'Kitchen speaker', model: 'Google Cast Speaker', protocol: 'google-cast', online: true },
        { ip: '192.168.1.2', name: 'Master Bedroom clock', model: 'Google Cast Speaker', protocol: 'google-cast', online: true },
        { ip: '192.168.1.6', name: "Leo's Rooom speaker", model: 'Google Cast Speaker', protocol: 'google-cast', online: true },
        { ip: '192.168.1.52', name: 'Basement TV', model: 'Google Cast Speaker', protocol: 'google-cast', online: true }
      ];
      for (const d of defaults) {
        this.knownSpeakers.set(d.ip, d);
      }
      this._saveCache();
    } else if (!this.knownSpeakers.has('192.168.1.64')) {
      this.knownSpeakers.set('192.168.1.64', {
        ip: '192.168.1.64',
        port: 6053,
        name: 'Home Assistant Voice 0ad22c',
        model: 'Nabu Casa HA Voice PE (NC-VK-9727)',
        modelCode: 'NC-VK-9727',
        protocol: 'esphome-native',
        catalogId: 'ha-voice-pe-nc-vk-9727',
        mac: '20:F8:3B:0A:D2:2C',
        firmware: '25.5.2',
        online: true,
        volume: 0.7,
        muted: false,
        capabilities: ['audio_playback', 'flac_48khz', 'led_ring_rgb', 'rotary_dial', 'center_button', 'hardware_mute'],
      });
      this._saveCache();
    }
  }

  _saveCache() {
    try {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify({
        updatedAt: new Date().toISOString(),
        speakers: Array.from(this.knownSpeakers.values())
      }, null, 2));
    } catch {}
  }

  /**
   * Return the supported smart speaker hardware catalog (with NC-VK-9727 first)
   */
  getSupportedCatalog() {
    return SUPPORTED_SPEAKER_CATALOG;
  }

  _isEspHomeDevice(dev) {
    if (!dev) return false;
    return (
      dev.protocol === 'esphome-native' ||
      dev.modelCode === 'NC-VK-9727' ||
      dev.catalogId === 'ha-voice-pe-nc-vk-9727' ||
      String(dev.model || '').toLowerCase().includes('voice pe') ||
      String(dev.model || '').toLowerCase().includes('esphome')
    );
  }

  _isHaRestDevice(dev) {
    return Boolean(dev && dev.protocol === 'ha-rest');
  }

  async probeKnownSpeakers(timeoutMs = 1500) {
    const promises = [];
    for (const [ip, existing] of this.knownSpeakers.entries()) {
      if (this._isEspHomeDevice(existing)) {
        promises.push(
          this.esphomeService.probeDevice(ip, existing.port || DEFAULT_ESPHOME_PORT, timeoutMs)
            .then((res) => {
              if (res && res.online) {
                const record = this.esphomeService.toSpeakerRecord(res);
                this.knownSpeakers.set(ip, {
                  ...existing,
                  ...record,
                  name: existing.customName || record.name || existing.name,
                  online: true,
                });
              } else {
                this.knownSpeakers.set(ip, { ...existing, online: false });
              }
            })
            .catch(() => {
              this.knownSpeakers.set(ip, { ...existing, online: false });
            })
        );
      } else if (this._isHaRestDevice(existing)) {
        promises.push(Promise.resolve());
      } else {
        promises.push(
          this.castService._probeCastDevice(ip, timeoutMs)
            .then((res) => {
              if (res) {
                this.knownSpeakers.set(ip, { ...existing, ...res, protocol: existing.protocol || 'google-cast', online: true });
              } else {
                this.knownSpeakers.set(ip, { ...existing, online: false });
              }
            })
            .catch(() => {
              this.knownSpeakers.set(ip, { ...existing, online: false });
            })
        );
      }
    }
    await Promise.all(promises);
    this._saveCache();
    return this.getSpeakers();
  }

  async scan(timeoutMs = 2500) {
    await this.probeKnownSpeakers(1200);
    const [castDevs, esphomeDevs] = await Promise.all([
      this.castService.scanSubnet(timeoutMs).catch(() => []),
      this.esphomeService.scanSubnet(this.castService.hostIp, Math.min(1500, timeoutMs)).catch(() => []),
    ]);
    for (const dev of castDevs) {
      const existing = this.knownSpeakers.get(dev.ip) || {};
      this.knownSpeakers.set(dev.ip, { ...existing, ...dev, protocol: 'google-cast' });
    }
    for (const dev of esphomeDevs) {
      const existing = this.knownSpeakers.get(dev.ip) || {};
      this.knownSpeakers.set(dev.ip, {
        ...existing,
        ...dev,
        name: existing.customName || dev.name || existing.name,
      });
    }
    this._saveCache();
    return this.getSpeakers();
  }

  /**
   * Scan specifically for Home Assistant / ESPHome Voice Satellites (LAN :6053 + optional BLE Improv)
   */
  async discoverHomeAssistantDevices({ includeBle = false, timeoutMs = 1500 } = {}) {
    const lanDevices = [];
    // Probe known ESPHome speakers first for instant responsiveness
    for (const [ip, dev] of this.knownSpeakers.entries()) {
      if (this._isEspHomeDevice(dev)) {
        const probed = await this.esphomeService.probeDevice(ip, dev.port || DEFAULT_ESPHOME_PORT, timeoutMs);
        if (probed && probed.online) {
          lanDevices.push(this.esphomeService.toSpeakerRecord(probed));
        }
      }
    }
    const scanned = await this.esphomeService.scanSubnet(this.castService.hostIp, timeoutMs).catch(() => []);
    for (const s of scanned) {
      if (!lanDevices.some((d) => d.ip === s.ip)) {
        lanDevices.push(s);
      }
    }
    const bleDevices = includeBle
      ? await this.esphomeService.scanBleImprovDevices(4).catch(() => [])
      : [];

    return { lanDevices, bleDevices };
  }

  /**
   * Probe a single IP/Port from the Add Device Wizard
   */
  async probeSingleDevice({ ip, port = DEFAULT_ESPHOME_PORT, protocol = 'esphome-native' }) {
    if (!ip) throw new Error('IP address is required.');
    if (protocol === 'esphome-native') {
      const info = await this.esphomeService.probeDevice(ip, Number(port) || DEFAULT_ESPHOME_PORT, 2200);
      if (!info || !info.online) {
        return { ok: false, ip, error: `No ESPHome / Home Assistant Voice device responded at ${ip}:${port}` };
      }
      return { ok: true, device: this.esphomeService.toSpeakerRecord(info) };
    }
    if (protocol === 'google-cast') {
      const res = await this.castService._probeCastDevice(ip, 2000);
      if (!res) {
        return { ok: false, ip, error: `No Google Cast device responded at ${ip}:8009` };
      }
      return { ok: true, device: { ...res, protocol: 'google-cast', online: true } };
    }
    return {
      ok: true,
      device: {
        ip,
        port: Number(port) || 8123,
        protocol,
        online: true,
      },
    };
  }

  /**
   * Add or update a speaker from the Add Device Wizard
   */
  async addDevice(deviceData = {}) {
    const ip = String(deviceData.ip || '').trim();
    if (!ip) {
      throw new Error('Device IP address is required.');
    }

    const catalogItem = SUPPORTED_SPEAKER_CATALOG.find((c) => c.id === deviceData.catalogId) || SUPPORTED_SPEAKER_CATALOG[0];
    const protocol = deviceData.protocol || catalogItem.protocol || 'esphome-native';
    const port = Number(deviceData.port || catalogItem.defaultPort || DEFAULT_ESPHOME_PORT);

    let enriched = {};
    if (protocol === 'esphome-native') {
      const probed = await this.esphomeService.probeDevice(ip, port, 1800).catch(() => null);
      if (probed && probed.online) {
        enriched = this.esphomeService.toSpeakerRecord(probed);
      }
    }

    const existing = this.knownSpeakers.get(ip) || {};
    const customName = String(deviceData.name || '').trim();
    const record = {
      ...existing,
      ...enriched,
      ip,
      port,
      protocol,
      catalogId: deviceData.catalogId || enriched.catalogId || catalogItem.id,
      model: deviceData.model || enriched.model || catalogItem.name,
      modelCode: deviceData.modelCode || enriched.modelCode || catalogItem.modelCode,
      name: customName || enriched.name || existing.name || `${catalogItem.shortName} (${ip})`,
      customName: customName || existing.customName || undefined,
      room: deviceData.room || existing.room || 'Studio & Office',
      entityId: deviceData.entityId || existing.entityId || '',
      haToken: deviceData.haToken || existing.haToken || '',
      online: enriched.online !== undefined ? enriched.online : true,
      volume: typeof existing.volume === 'number' ? existing.volume : 0.7,
      muted: Boolean(existing.muted),
      updatedAt: new Date().toISOString(),
    };

    this.knownSpeakers.set(ip, record);
    this._saveCache();
    return record;
  }

  /**
   * Remove a speaker device by IP
   */
  removeDevice(ip) {
    if (!ip || !this.knownSpeakers.has(ip)) return { ok: false };
    this.knownSpeakers.delete(ip);
    this._saveCache();
    return { ok: true, ip };
  }

  /**
   * Control LED Ring on an ESPHome / HA Voice PE speaker (NC-VK-9727)
   */
  async setDeviceLedRing(ip, options = {}) {
    const dev = this.knownSpeakers.get(ip);
    const port = (dev && dev.port) || options.port || DEFAULT_ESPHOME_PORT;
    return this.esphomeService.setLedRing(ip, { ...options, port });
  }

  /**
   * Test a Home Assistant Voice PE / ESPHome speaker (flash LED ring + play 48kHz FLAC chime)
   */
  async testDevice(ip, options = {}) {
    if (!ip) throw new Error('Target device IP is required');
    const dev = this.knownSpeakers.get(ip) || { ip, protocol: options.protocol || 'esphome-native' };
    if (this._isEspHomeDevice(dev) || options.protocol === 'esphome-native') {
      await this.esphomeService.setLedRing(ip, {
        state: true,
        brightness: 0.9,
        hexColor: options.hexColor || '#00bcd4',
        port: dev.port || DEFAULT_ESPHOME_PORT,
      });
    }
    return this.playSound(ip, options.soundId || 'chime');
  }

  /**
   * Scan & provision BLE Improv Wi-Fi from the Add Device Wizard
   */
  async scanBleDevices(timeoutSec = 4) {
    return this.esphomeService.scanBleImprovDevices(timeoutSec);
  }

  async provisionBleWifi({ mac, ssid, password }) {
    return this.esphomeService.provisionBleWifi({ mac, ssid, password });
  }

  getSpeakers() {
    const list = Array.from(this.knownSpeakers.values());
    // Sort so Home Assistant Voice PE (NC-VK-9727) & online speakers appear prominently
    return list.sort((a, b) => {
      const aPe = a.modelCode === 'NC-VK-9727' ? 1 : 0;
      const bPe = b.modelCode === 'NC-VK-9727' ? 1 : 0;
      if (aPe !== bPe) return bPe - aPe;
      return 0;
    });
  }

  getSpeaker(ip) {
    return this.knownSpeakers.get(ip);
  }

  async getStatus(ip) {
    if (!ip || ip === 'all') {
      const allStatus = [];
      for (const [sIp, dev] of this.knownSpeakers.entries()) {
        if (this._isEspHomeDevice(dev)) {
          const probed = await this.esphomeService.probeDevice(sIp, dev.port || DEFAULT_ESPHOME_PORT, 1200).catch(() => null);
          allStatus.push({ ...dev, online: Boolean(probed && probed.online), unreachable: !(probed && probed.online) });
        } else {
          try {
            const status = await this.castService.getSpeakerStatus(sIp);
            allStatus.push({ ...dev, ...status });
          } catch {
            allStatus.push({ ...dev, unreachable: true });
          }
        }
      }
      return allStatus;
    }
    const dev = this.knownSpeakers.get(ip);
    if (this._isEspHomeDevice(dev)) {
      const probed = await this.esphomeService.probeDevice(ip, dev.port || DEFAULT_ESPHOME_PORT, 1500).catch(() => null);
      return {
        ...dev,
        online: Boolean(probed && probed.online),
        volume: dev.volume ?? 0.7,
        muted: Boolean(dev.muted),
      };
    }
    return this.castService.getSpeakerStatus(ip);
  }

  async setVolume(ip, level, muted = false) {
    if (ip === 'all') {
      const results = [];
      for (const [sIp, dev] of this.knownSpeakers.entries()) {
        try {
          const res = await this._setSingleVolume(sIp, dev, level, muted);
          results.push({ ip: sIp, ok: true, res });
        } catch (err) {
          results.push({ ip: sIp, ok: false, error: err.message });
        }
      }
      return results;
    }
    const dev = this.knownSpeakers.get(ip);
    return this._setSingleVolume(ip, dev, level, muted);
  }

  async _setSingleVolume(ip, dev, level, muted = false) {
    if (this._isEspHomeDevice(dev)) {
      const res = await this.esphomeService.setVolume(ip, level, muted, dev.port || DEFAULT_ESPHOME_PORT);
      dev.volume = level;
      dev.muted = muted;
      this._saveCache();
      return res;
    }
    if (this._isHaRestDevice(dev)) {
      return this._callHaMediaService(dev, 'volume_set', { volume_level: level });
    }
    return this.castService.setSpeakerVolume(ip, level, muted);
  }

  async stop(ip) {
    if (!ip || ip === 'all') {
      for (const [sIp, dev] of this.knownSpeakers.entries()) {
        if (this._isEspHomeDevice(dev)) {
          await this.esphomeService.sendMediaCommand(sIp, 2, dev.port || DEFAULT_ESPHOME_PORT).catch(() => {});
        }
      }
      return this.castService.stopAllPlayback();
    }
    const dev = this.knownSpeakers.get(ip);
    if (this._isEspHomeDevice(dev)) {
      return this.esphomeService.sendMediaCommand(ip, 2, dev.port || DEFAULT_ESPHOME_PORT);
    }
    if (this._isHaRestDevice(dev)) {
      return this._callHaMediaService(dev, 'media_stop', {});
    }
    return this.castService.stopPlayback(ip);
  }

  async pause(ip) {
    const dev = this.knownSpeakers.get(ip);
    if (this._isEspHomeDevice(dev)) {
      return this.esphomeService.sendMediaCommand(ip, 1, dev.port || DEFAULT_ESPHOME_PORT);
    }
    if (this._isHaRestDevice(dev)) {
      return this._callHaMediaService(dev, 'media_pause', {});
    }
    return this.castService.pausePlayback(ip);
  }

  async resume(ip) {
    const dev = this.knownSpeakers.get(ip);
    if (this._isEspHomeDevice(dev)) {
      return this.esphomeService.sendMediaCommand(ip, 0, dev.port || DEFAULT_ESPHOME_PORT);
    }
    if (this._isHaRestDevice(dev)) {
      return this._callHaMediaService(dev, 'media_play', {});
    }
    return this.castService.resumePlayback(ip);
  }

  _resolveTargetIps(target) {
    if (!target || target === 'all') {
      return Array.from(this.knownSpeakers.keys());
    }
    if (Array.isArray(target)) {
      return target;
    }
    // Match by exact name, model code (e.g. NC-VK-9727), or substring
    const needle = String(target).toLowerCase();
    for (const [ip, dev] of this.knownSpeakers.entries()) {
      if (
        (dev.name && dev.name.toLowerCase() === needle) ||
        (dev.modelCode && dev.modelCode.toLowerCase() === needle)
      ) {
        return [ip];
      }
    }
    for (const [ip, dev] of this.knownSpeakers.entries()) {
      if (dev.name && dev.name.toLowerCase().includes(needle)) {
        return [ip];
      }
    }
    return [target];
  }

  async _callHaMediaService(dev, serviceName, extraPayload = {}) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        entity_id: dev.entityId || 'media_player.home_assistant_voice_0ad22c_media_player',
        ...extraPayload,
      });
      const req = http.request(
        {
          hostname: dev.ip,
          port: dev.port || 8123,
          path: `/api/services/media_player/${serviceName}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            ...(dev.haToken ? { Authorization: `Bearer ${dev.haToken}` } : {}),
          },
          timeout: 4000,
        },
        (res) => {
          res.resume();
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, statusCode: res.statusCode });
          } else {
            reject(new Error(`Home Assistant HTTP ${res.statusCode}`));
          }
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Cast an audio file to one or more speakers (transparently transcoding to 48kHz FLAC for HA Voice PE / ESPHome)
   */
  async castFile(target, filePath, metadata = {}) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    const streamUrl = this.castService.registerFile(filePath, metadata.contentType || 'audio/mpeg');
    const ips = this._resolveTargetIps(target);
    const results = [];
    let flacStreamUrl = null;

    for (const ip of ips) {
      const dev = this.knownSpeakers.get(ip);
      try {
        if (this._isEspHomeDevice(dev)) {
          if (!flacStreamUrl) {
            const flacPath = filePath.toLowerCase().endsWith('.flac')
              ? filePath
              : await this.esphomeService.convertToFlac48k(filePath, 1);
            flacStreamUrl = this.castService.registerFile(flacPath, 'audio/flac');
          }
          const res = await this.esphomeService.playMediaUrl(ip, flacStreamUrl, {
            port: dev.port || DEFAULT_ESPHOME_PORT,
            announcement: metadata.announcement !== false,
            flashLed: metadata.flashLed !== false,
          });
          results.push({ ip, ok: true, protocol: 'esphome-native', res });
        } else if (this._isHaRestDevice(dev)) {
          const res = await this._callHaMediaService(dev, 'play_media', {
            media_content_id: streamUrl,
            media_content_type: 'music',
            announce: true,
          });
          results.push({ ip, ok: true, protocol: 'ha-rest', res });
        } else {
          const res = await this.castService.castMediaUrl(ip, streamUrl, {
            title: metadata.title || path.basename(filePath),
            artist: metadata.artist || 'RobOS Home Speaker',
            contentType: metadata.contentType || 'audio/mpeg'
          });
          results.push({ ip, ok: true, protocol: 'google-cast', res });
        }
      } catch (err) {
        results.push({ ip, ok: false, error: err.message });
      }
    }

    return { streamUrl: flacStreamUrl || streamUrl, results };
  }

  /**
   * Cast raw audio buffer (e.g. from soundboard or Web Audio)
   */
  async castBuffer(target, buffer, metadata = {}) {
    const streamUrl = this.castService.registerBuffer(buffer, metadata.contentType || 'audio/wav');
    const ips = this._resolveTargetIps(target);
    const results = [];
    let flacStreamUrl = null;

    for (const ip of ips) {
      const dev = this.knownSpeakers.get(ip);
      try {
        if (this._isEspHomeDevice(dev)) {
          if (!flacStreamUrl) {
            const tmpWav = path.join(os.tmpdir(), `robos-buf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.wav`);
            fs.writeFileSync(tmpWav, buffer);
            const flacPath = await this.esphomeService.convertToFlac48k(tmpWav, 1);
            try { fs.unlinkSync(tmpWav); } catch {}
            flacStreamUrl = this.castService.registerFile(flacPath, 'audio/flac');
          }
          const res = await this.esphomeService.playMediaUrl(ip, flacStreamUrl, {
            port: dev.port || DEFAULT_ESPHOME_PORT,
            announcement: true,
            flashLed: true,
          });
          results.push({ ip, ok: true, protocol: 'esphome-native', res });
        } else if (this._isHaRestDevice(dev)) {
          const res = await this._callHaMediaService(dev, 'play_media', {
            media_content_id: streamUrl,
            media_content_type: 'music',
            announce: true,
          });
          results.push({ ip, ok: true, protocol: 'ha-rest', res });
        } else {
          const res = await this.castService.castMediaUrl(ip, streamUrl, {
            title: metadata.title || 'RobOS Sound Effect',
            artist: metadata.artist || 'RobOS Home Speaker',
            contentType: metadata.contentType || 'audio/wav'
          });
          results.push({ ip, ok: true, protocol: 'google-cast', res });
        }
      } catch (err) {
        results.push({ ip, ok: false, error: err.message });
      }
    }

    return { streamUrl: flacStreamUrl || streamUrl, results };
  }

  /**
   * Play a Soundboard sound effect
   */
  async playSound(target, soundId) {
    const sound = getSound(soundId);
    if (!sound) {
      throw new Error(`Unknown sound: ${soundId}`);
    }

    if (sound.filePath && fs.existsSync(sound.filePath)) {
      return this.castFile(target, sound.filePath, {
        title: sound.name,
        artist: 'RobOS Soundboard'
      });
    }

    if (typeof sound.getBuffer === 'function') {
      const buffer = sound.getBuffer();
      return this.castBuffer(target, buffer, {
        title: sound.name,
        artist: 'RobOS Soundboard',
        contentType: 'audio/wav'
      });
    }

    throw new Error(`Sound has neither file nor buffer: ${soundId}`);
  }

  /**
   * Synthesize text and cast it
   */
  async castTTS(target, text, options = {}) {
    if (!this.ttsEngine) {
      throw new Error('TTS Engine is not available');
    }

    const engine = options.engine || 'kokoro';
    const voice = options.voice || (engine === 'piper' ? 'en_US-lessac-medium' : 'af_heart');
    const speed = options.speed || 1.0;
    const prependChime = !!options.prependChime;

    console.log(`[HomeSpeaker] Synthesizing TTS: "${text.slice(0, 40)}..." (engine: ${engine}, voice: ${voice})`);
    const synthResult = await this.ttsEngine.synthesize(text, { engine, voice, speed });

    let finalAudioPath = synthResult.filePath;

    // Prepend attention chime if requested
    if (prependChime) {
      try {
        finalAudioPath = await this._prependChimeToFile(synthResult.filePath);
      } catch (err) {
        console.warn('[HomeSpeaker] Could not prepend chime, streaming raw speech:', err.message);
      }
    }

    return this.castFile(target, finalAudioPath, {
      title: options.title || `Announcement: "${text.slice(0, 30)}..."`,
      artist: `RobOS Voice (${voice})`,
      contentType: finalAudioPath.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav'
    });
  }

  /**
   * Process recorded voice message and cast it
   */
  async castVoiceRecording(target, audioBuffer, options = {}) {
    const tmpId = `voice-rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const inputExt = options.format || 'webm';
    const rawPath = path.join(os.tmpdir(), `${tmpId}-raw.${inputExt}`);
    const outMp3Path = path.join(os.tmpdir(), `${tmpId}.mp3`);

    fs.writeFileSync(rawPath, audioBuffer);

    // Convert to standard MP3
    await new Promise((resolve, reject) => {
      exec(`ffmpeg -y -hide_banner -loglevel error -i "${rawPath}" -c:a libmp3lame -b:a 192k "${outMp3Path}"`, (err) => {
        if (!err && fs.existsSync(outMp3Path)) resolve();
        else reject(err || new Error('FFmpeg conversion failed'));
      });
    });

    let finalPath = outMp3Path;
    if (options.prependChime) {
      try {
        finalPath = await this._prependChimeToFile(outMp3Path);
      } catch (err) {
        console.warn('[HomeSpeaker] Chime prepend failed, continuing with raw voice note:', err.message);
      }
    }

    return this.castFile(target, finalPath, {
      title: 'Voice Note Intercom',
      artist: 'RobOS Walkie-Talkie',
      contentType: 'audio/mpeg'
    });
  }

  /**
   * Concatenate chime to an existing audio file using ffmpeg
   */
  async _prependChimeToFile(sourceAudioPath) {
    const chimeBuffer = generateIntercomChime();
    const tmpId = `combined-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const chimePath = path.join(os.tmpdir(), `${tmpId}-chime.wav`);
    const outPath = path.join(os.tmpdir(), `${tmpId}-combined.mp3`);

    fs.writeFileSync(chimePath, chimeBuffer);

    return new Promise((resolve, reject) => {
      const cmd = `ffmpeg -y -hide_banner -loglevel error -i "${chimePath}" -i "${sourceAudioPath}" -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1[out]" -map "[out]" -c:a libmp3lame -b:a 192k "${outPath}"`;
      exec(cmd, (err) => {
        try { fs.unlinkSync(chimePath); } catch {}
        if (!err && fs.existsSync(outPath)) {
          resolve(outPath);
        } else {
          reject(err || new Error('FFmpeg concat failed'));
        }
      });
    });
  }

  /**
   * Generate and play an ambient focus soundscape
   */
  async playAmbient(target, soundType = 'rain', durationMinutes = 30) {
    const tmpId = `ambient-${soundType}-${Date.now()}`;
    const outPath = path.join(os.tmpdir(), `${tmpId}.mp3`);
    const durationSeconds = Math.min(7200, Math.max(60, durationMinutes * 60));

    let filter = '';
    if (soundType === 'rain') {
      // Pink noise filtered into gentle rain soundscape with slight low rumble
      filter = 'anoisesrc=c=pink:r=44100:a=0.18,lowpass=f=1200,highpass=f=200';
    } else if (soundType === 'brown_noise') {
      // Brown noise for deep focus
      filter = 'anoisesrc=c=brown:r=44100:a=0.22,lowpass=f=800';
    } else if (soundType === 'pink_noise') {
      filter = 'anoisesrc=c=pink:r=44100:a=0.20';
    } else if (soundType === 'cyber_drone') {
      // 55Hz (A1) fundamental + 110Hz + 165Hz layered drone
      filter = 'sine=f=55:r=44100:d=' + durationSeconds + ' [s1]; sine=f=110:r=44100:d=' + durationSeconds + ' [s2]; [s1][s2]amix=inputs=2:weights=0.7 0.3,volume=0.35';
    } else {
      filter = 'anoisesrc=c=pink:r=44100:a=0.18,lowpass=f=1000';
    }

    await new Promise((resolve, reject) => {
      const cmd = soundType === 'cyber_drone'
        ? `ffmpeg -y -hide_banner -loglevel error -filter_complex "${filter}" -t ${durationSeconds} -c:a libmp3lame -b:a 192k "${outPath}"`
        : `ffmpeg -y -hide_banner -loglevel error -f lavfi -i "${filter}" -t ${durationSeconds} -c:a libmp3lame -b:a 192k "${outPath}"`;
      exec(cmd, (err) => {
        if (!err && fs.existsSync(outPath)) resolve();
        else reject(err || new Error('FFmpeg ambient generation failed'));
      });
    });

    const titles = {
      rain: 'Soft Rain & Thunder',
      brown_noise: 'Deep Brown Noise',
      pink_noise: 'Calm Pink Noise',
      cyber_drone: 'Cyber Synth Focus Drone'
    };

    return this.castFile(target, outPath, {
      title: titles[soundType] || 'Ambient Soundscape',
      artist: `RobOS Focus (${durationMinutes}m)`,
      contentType: 'audio/mpeg'
    });
  }

  // -------------------------------------------------------------
  // RobOS Media Player Music Library Integration
  // -------------------------------------------------------------
  getLibraryTracks(limit = 100) {
    return this.mediaClient.getTracks(limit);
  }

  searchLibrary(query, limit = 50) {
    return this.mediaClient.search(query, limit);
  }

  getLibraryAlbums() {
    return this.mediaClient.listAlbums();
  }

  async castLibraryTrack(target, queryOrId) {
    const track = this.mediaClient.findTrack(queryOrId);
    if (!track) {
      throw new Error(`Track not found in RobOS Media Library: "${queryOrId}"`);
    }

    if (!fs.existsSync(track.filePath)) {
      throw new Error(`Track audio file is missing on disk: ${track.filePath}`);
    }

    return this.castFile(target, track.filePath, {
      title: track.title || path.basename(track.filePath),
      artist: track.artist || 'RobOS Media Player',
      contentType: 'audio/mpeg'
    });
  }

  // -------------------------------------------------------------
  // Scheduled Broadcasts & Timers
  // -------------------------------------------------------------
  listSchedules() {
    return this.scheduler.list();
  }

  getSchedule(id) {
    return this.scheduler.get(id);
  }

  addSchedule(jobData) {
    return this.scheduler.add(jobData);
  }

  updateSchedule(id, partial) {
    return this.scheduler.update(id, partial);
  }

  removeSchedule(id) {
    return this.scheduler.remove(id);
  }

  async triggerSchedule(id) {
    return this.scheduler.trigger(id);
  }

  async executeScheduledJob(job) {
    console.log(`[HomeSpeaker] Executing scheduled job "${job.name}" on "${job.target}"`);

    if (typeof job.volume === 'number' && job.volume >= 0 && job.volume <= 100) {
      try {
        await this.setVolume(job.target, job.volume / 100);
      } catch (err) {
        console.warn('[HomeSpeaker] Failed to set scheduled volume:', err.message);
      }
    }

    switch (job.actionType) {
      case 'sound': {
        const soundId = job.payload?.soundId || 'chime';
        return this.playSound(job.target, soundId);
      }
      case 'tts': {
        const text = job.payload?.text || 'Scheduled announcement';
        return this.castTTS(job.target, text, {
          voice: job.payload?.voice,
          prependChime: job.payload?.prependChime !== false
        });
      }
      case 'music': {
        const queryOrId = job.payload?.trackId || job.payload?.query || job.payload?.track;
        return this.castLibraryTrack(job.target, queryOrId);
      }
      case 'file': {
        return this.castFile(job.target, job.payload?.filePath, {
          title: job.payload?.title || job.name
        });
      }
      case 'ambient': {
        const ambientType = job.payload?.ambientType || 'rain';
        const mins = job.payload?.durationMinutes || 30;
        return this.playAmbient(job.target, ambientType, mins);
      }
      default:
        throw new Error(`Unknown scheduled action type: ${job.actionType}`);
    }
  }
}

module.exports = { HomeSpeakerService };
