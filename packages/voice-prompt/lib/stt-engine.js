'use strict';

const EventEmitter = require('events');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function cleanTranscript(text) {
  if (!text) return '';
  return text
    .replace(/\[(?:BLANK_AUDIO|silence|music|applause|laughter|noise)\]/gi, '')
    .replace(/\((?:music|applause|laughter|noise)\)/gi, '')
    .trim();
}

function readWavToFloat32(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const buffer = fs.readFileSync(filePath);
    let offset = 12;
    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      if (chunkId === 'data') {
        const dataOffset = offset + 8;
        const sampleCount = Math.floor(chunkSize / 2);
        const float32 = new Float32Array(sampleCount);
        for (let i = 0; i < sampleCount; i++) {
          float32[i] = buffer.readInt16LE(dataOffset + i * 2) / 32768.0;
        }
        return float32;
      }
      offset += 8 + chunkSize;
    }
    // Fallback: standard 44-byte WAV header
    if (buffer.length > 44) {
      const dataOffset = 44;
      const sampleCount = Math.floor((buffer.length - dataOffset) / 2);
      const float32 = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        float32[i] = buffer.readInt16LE(dataOffset + i * 2) / 32768.0;
      }
      return float32;
    }
  } catch (err) {
    console.warn('[stt-engine] readWavToFloat32 error:', err.message);
  }
  return null;
}

class STTEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.configuredDevice = options.configuredDevice || 'default';
    this.language = options.language || 'en-US';
    this.active = false;
    this.recordingProcess = null;
    this.currentRecordingFile = null;
    this.recordingStartTime = null;
    this.transcriberPromise = null;

    if (process.env.ROBOS_TEST !== '1') {
      this.getTranscriber().catch(() => {});
    }
  }

  async getTranscriber() {
    if (!this.transcriberPromise) {
      this.transcriberPromise = (async () => {
        try {
          const { pipeline } = await import('@xenova/transformers');
          return await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
        } catch (err) {
          console.warn('[stt-engine] Offline whisper pipeline notice:', err.message);
          return null;
        }
      })();
    }
    return this.transcriberPromise;
  }

  /**
   * Enumerate available microphone / audio capture devices
   */
  async listDevices() {
    const devices = [
      { id: 'default', name: 'Default System Microphone', isDefault: true },
    ];

    // 1. Try PipeWire wpctl status
    let hasPipewire = false;
    await new Promise((resolve) => {
      exec('wpctl status 2>/dev/null', (err, stdout) => {
        if (!err && stdout) {
          const lines = stdout.split('\n');
          let inSources = false;
          for (const line of lines) {
            if (line.includes('Sources:')) { inSources = true; continue; }
            if (inSources && (line.includes('Filters:') || line.includes('Streams:') || line.includes('Video') || line.includes('Settings:'))) {
              inSources = false;
              break;
            }
            if (inSources) {
              const match = line.match(/([* ]*)\s+(\d+)\.\s+(.*)/);
              if (match) {
                hasPipewire = true;
                const isDef = match[1].includes('*');
                const id = match[2];
                const cleanName = match[3].replace(/\s+\[alsa\]|\s+\[v4l2\]/gi, '').replace(/\[.*\]/g, '').trim();
                devices.push({
                  id,
                  name: `${cleanName}${isDef ? ' (System Default)' : ''}`,
                  isDefault: isDef,
                  type: 'pipewire',
                });
              }
            }
          }
        }
        resolve();
      });
    });

    // 2. If no PipeWire, fallback to arecord -l for ALSA hardware cards
    if (!hasPipewire) {
      await new Promise((resolve) => {
        exec('arecord -l 2>/dev/null', (err, stdout) => {
          if (!err && stdout) {
            const lines = stdout.split('\n');
            for (const line of lines) {
              const cardMatch = line.match(/card\s+(\d+):\s+([^,]+),\s+device\s+(\d+):\s+([^[]+)\[([^\]]+)\]/i);
              if (cardMatch) {
                const cardNum = cardMatch[1];
                const devNum = cardMatch[3];
                const desc = cardMatch[5].trim();
                const hwId = `hw:${cardNum},${devNum}`;
                if (!devices.some(d => d.id === hwId)) {
                  devices.push({
                    id: hwId,
                    name: `ALSA: ${desc} (${hwId})`,
                    card: cardNum,
                    device: devNum,
                    isDefault: false,
                    type: 'alsa',
                  });
                }
              }
            }
          }
          resolve();
        });
      });
    }

    return devices;
  }

  setDevice(deviceId) {
    this.configuredDevice = deviceId || 'default';
  }

  isActive() {
    return this.active;
  }

  /**
   * Activate listening / dictating (starts hardware recording)
   */
  async activate(options = {}) {
    if (this.active) return { ok: true, active: true, alreadyActive: true };
    this.active = true;
    this.recordingStartTime = Date.now();
    const device = options.device || this.configuredDevice;

    const tmpFile = path.join(os.tmpdir(), `robos-voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.wav`);
    this.currentRecordingFile = tmpFile;

    // Pick recording tool based on device
    let spawnCmd = 'arecord';
    let spawnArgs = ['-q', '-D', 'default', '-f', 'S16_LE', '-r', '16000', '-c', '1', tmpFile];

    if (/^\d+$/.test(device)) {
      spawnCmd = 'pw-record';
      spawnArgs = ['--target', String(device), '--rate', '16000', '--channels', '1', tmpFile];
    } else if (device.startsWith('hw:')) {
      spawnCmd = 'arecord';
      spawnArgs = ['-q', '-D', device, '-f', 'S16_LE', '-r', '16000', '-c', '1', tmpFile];
    }

    try {
      this.recordingProcess = spawn(spawnCmd, spawnArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.recordingProcess.on('error', (err) => {
        console.warn(`[stt-engine] Recording process error (${spawnCmd}):`, err.message);
        if (spawnCmd !== 'arecord' || spawnArgs[2] !== 'default') {
          try {
            this.recordingProcess = spawn('arecord', ['-q', '-D', 'default', '-f', 'S16_LE', '-r', '16000', '-c', '1', tmpFile]);
          } catch {}
        }
      });
      this.recordingProcess.once('exit', (code) => {
        if (this.active && code !== 0 && code !== null) {
          console.warn(`[stt-engine] ${spawnCmd} exited with code ${code}, falling back to arecord -D default`);
          try {
            this.recordingProcess = spawn('arecord', ['-q', '-D', 'default', '-f', 'S16_LE', '-r', '16000', '-c', '1', tmpFile]);
          } catch {}
        }
      });
    } catch (err) {
      console.warn(`[stt-engine] Failed to spawn ${spawnCmd}:`, err.message);
      this.recordingProcess = null;
    }

    this.emit('activated', { device, startTime: this.recordingStartTime, recordingFile: tmpFile });
    return { ok: true, active: true, device, startTime: this.recordingStartTime };
  }

  /**
   * Deactivate listening and transcribe recorded audio
   */
  async deactivate() {
    if (!this.active) return { ok: true, active: false };
    const durationMs = this.recordingStartTime ? Date.now() - this.recordingStartTime : 0;
    this.active = false;
    this.recordingStartTime = null;

    const recFile = this.currentRecordingFile;
    this.currentRecordingFile = null;

    if (this.recordingProcess) {
      const proc = this.recordingProcess;
      this.recordingProcess = null;
      await new Promise((resolve) => {
        let resolved = false;
        const done = () => {
          if (!resolved) { resolved = true; resolve(); }
        };
        proc.once('close', done);
        proc.once('exit', done);
        try {
          proc.kill('SIGINT');
        } catch {
          done();
        }
        setTimeout(done, 500);
      });
    }

    let text = '';
    if (process.env.ROBOS_TEST === '1' || process.env.ROBOS_TEST_MODE === '1') {
      if (recFile && fs.existsSync(recFile)) {
        try { fs.unlinkSync(recFile); } catch {}
      }
      this.emit('deactivated', { durationMs, text });
      return { ok: true, active: false, durationMs, text };
    }

    if (recFile && fs.existsSync(recFile)) {
      try {
        const stats = fs.statSync(recFile);
        if (stats.size > 200) {
          const samples = readWavToFloat32(recFile);
          if (samples && samples.length >= 1600) {
            const transcriber = await this.getTranscriber();
            if (transcriber) {
              const res = await transcriber(samples);
              text = cleanTranscript(res?.text || '');
            }
          }
        }
      } catch (err) {
        console.warn('[stt-engine] Transcription error:', err.message);
      } finally {
        try { fs.unlinkSync(recFile); } catch {}
      }
    }

    this.emit('deactivated', { durationMs, text });
    return { ok: true, active: false, durationMs, text };
  }

  /**
   * Transcribe dictated text or audio explicitly
   */
  async processDictation(input, options = {}) {
    const text = typeof input === 'string' ? input.trim() : (input.text || '').trim();
    const durationMs = options.durationMs || (this.recordingStartTime ? Date.now() - this.recordingStartTime : 2000);
    const device = options.device || this.configuredDevice;

    const result = {
      text,
      durationMs,
      device,
      confidence: options.confidence || 0.98,
      timestamp: new Date().toISOString(),
    };

    this.emit('dictation', result);
    return result;
  }
}

module.exports = {
  STTEngine,
  readWavToFloat32,
  cleanTranscript,
};
