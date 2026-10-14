'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { CastService } = require('../../audio-player/lib/cast-service');
const { SOUNDS, getSound, generateIntercomChime } = require('./soundboard');

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
    this.ttsEngine = TTSEngine ? new TTSEngine() : null;
    this.knownSpeakers = new Map();
    this.activeBroadcasts = new Map(); // ip -> { title, type, startTime }

    this._loadCache();
  }

  _loadCache() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        if (Array.isArray(data.speakers)) {
          for (const s of data.speakers) {
            this.knownSpeakers.set(s.ip, s);
          }
        }
      }
    } catch {}

    // Seed defaults if empty
    if (this.knownSpeakers.size === 0) {
      const defaults = [
        { ip: '192.168.1.10', name: 'Kitchen speaker', model: 'Google Cast Speaker', online: true },
        { ip: '192.168.1.2', name: 'Master Bedroom clock', model: 'Google Cast Speaker', online: true },
        { ip: '192.168.1.6', name: "Leo's Rooom speaker", model: 'Google Cast Speaker', online: true },
        { ip: '192.168.1.52', name: 'Basement TV', model: 'Google Cast Speaker', online: true }
      ];
      for (const d of defaults) {
        this.knownSpeakers.set(d.ip, d);
      }
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

  async probeKnownSpeakers(timeoutMs = 1500) {
    const promises = [];
    for (const [ip, existing] of this.knownSpeakers.entries()) {
      promises.push(this.castService._probeCastDevice(ip, timeoutMs).then(res => {
        if (res) {
          this.knownSpeakers.set(ip, { ...existing, ...res, online: true });
        } else {
          this.knownSpeakers.set(ip, { ...existing, online: false });
        }
      }).catch(() => {
        this.knownSpeakers.set(ip, { ...existing, online: false });
      }));
    }
    await Promise.all(promises);
    this._saveCache();
    return Array.from(this.knownSpeakers.values());
  }

  async scan(timeoutMs = 2500) {
    // First probe known speakers fast
    await this.probeKnownSpeakers(1000);
    // Then scan full subnet
    const devs = await this.castService.scanSubnet(timeoutMs);
    for (const dev of devs) {
      this.knownSpeakers.set(dev.ip, dev);
    }
    this._saveCache();
    return Array.from(this.knownSpeakers.values());
  }

  getSpeakers() {
    return Array.from(this.knownSpeakers.values());
  }

  getSpeaker(ip) {
    return this.knownSpeakers.get(ip);
  }

  async getStatus(ip) {
    if (!ip || ip === 'all') {
      const allStatus = [];
      for (const [sIp, dev] of this.knownSpeakers.entries()) {
        try {
          const status = await this.castService.getSpeakerStatus(sIp);
          allStatus.push({ ...dev, ...status });
        } catch {
          allStatus.push({ ...dev, unreachable: true });
        }
      }
      return allStatus;
    }
    return this.castService.getSpeakerStatus(ip);
  }

  async setVolume(ip, level, muted = false) {
    if (ip === 'all') {
      const results = [];
      for (const sIp of this.knownSpeakers.keys()) {
        try {
          const res = await this.castService.setSpeakerVolume(sIp, level, muted);
          results.push({ ip: sIp, ok: true, res });
        } catch (err) {
          results.push({ ip: sIp, ok: false, error: err.message });
        }
      }
      return results;
    }
    return this.castService.setSpeakerVolume(ip, level, muted);
  }

  async stop(ip) {
    if (!ip || ip === 'all') {
      return this.castService.stopAllPlayback();
    }
    return this.castService.stopPlayback(ip);
  }

  async pause(ip) {
    return this.castService.pausePlayback(ip);
  }

  async resume(ip) {
    return this.castService.resumePlayback(ip);
  }

  _resolveTargetIps(target) {
    if (!target || target === 'all') {
      return Array.from(this.knownSpeakers.keys());
    }
    if (Array.isArray(target)) {
      return target;
    }
    // If it's a name, find corresponding IP
    for (const [ip, dev] of this.knownSpeakers.entries()) {
      if (dev.name.toLowerCase() === target.toLowerCase()) {
        return [ip];
      }
    }
    return [target];
  }

  /**
   * Cast an audio file to one or more speakers
   */
  async castFile(target, filePath, metadata = {}) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    const streamUrl = this.castService.registerFile(filePath, metadata.contentType || 'audio/mpeg');
    const ips = this._resolveTargetIps(target);
    const results = [];

    for (const ip of ips) {
      try {
        const res = await this.castService.castMediaUrl(ip, streamUrl, {
          title: metadata.title || path.basename(filePath),
          artist: metadata.artist || 'RobOS Home Speaker',
          contentType: metadata.contentType || 'audio/mpeg'
        });
        results.push({ ip, ok: true, res });
      } catch (err) {
        results.push({ ip, ok: false, error: err.message });
      }
    }

    return { streamUrl, results };
  }

  /**
   * Cast raw audio buffer (e.g. from soundboard or Web Audio)
   */
  async castBuffer(target, buffer, metadata = {}) {
    const streamUrl = this.castService.registerBuffer(buffer, metadata.contentType || 'audio/wav');
    const ips = this._resolveTargetIps(target);
    const results = [];

    for (const ip of ips) {
      try {
        const res = await this.castService.castMediaUrl(ip, streamUrl, {
          title: metadata.title || 'RobOS Sound Effect',
          artist: metadata.artist || 'RobOS Home Speaker',
          contentType: metadata.contentType || 'audio/wav'
        });
        results.push({ ip, ok: true, res });
      } catch (err) {
        results.push({ ip, ok: false, error: err.message });
      }
    }

    return { streamUrl, results };
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
}

module.exports = { HomeSpeakerService };
