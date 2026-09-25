'use strict';

const EventEmitter = require('events');
const { exec, spawn } = require('child_process');
const { Worker } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const os = require('os');

function cleanTranscript(text) {
  if (!text) return '';
  return text
    .replace(/\[(?:BLANK_AUDIO|silence|music|applause|laughter|noise)\]/gi, '')
    .replace(/\((?:music|applause|laughter|noise)\)/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function readWavToFloat32(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length <= 44) return null;
    let offset = 12;
    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      if (chunkId === 'data') {
        const dataOffset = offset + 8;
        const availableBytes = (chunkSize > 0 && chunkSize <= buffer.length - dataOffset)
          ? chunkSize
          : Math.max(0, buffer.length - dataOffset);
        const sampleCount = Math.floor(availableBytes / 2);
        if (sampleCount <= 0) return null;
        const float32 = new Float32Array(sampleCount);
        for (let i = 0; i < sampleCount; i++) {
          float32[i] = buffer.readInt16LE(dataOffset + i * 2) / 32768.0;
        }
        return float32;
      }
      if (chunkSize <= 0) {
        offset += 8;
      } else {
        offset += 8 + chunkSize;
      }
    }
    // Fallback: standard 44-byte WAV header
    if (buffer.length > 44) {
      const dataOffset = 44;
      const sampleCount = Math.floor((buffer.length - dataOffset) / 2);
      if (sampleCount <= 0) return null;
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
    this.streamInterval = null;
    this.isTranscribing = false;
    this.lastInterimText = '';
    this.backgroundMode = Boolean(options.backgroundMode);
    this.worker = null;
    this.pendingRequests = new Map();
    this.reqSeq = 0;
  }

  isBackgroundMode() {
    return this.backgroundMode;
  }

  setBackgroundMode(enabled) {
    this.backgroundMode = Boolean(enabled);
  }

  getWorker() {
    if (!this.worker && process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
      try {
        const workerPath = path.join(__dirname, 'whisper-worker.js');
        if (fs.existsSync(workerPath)) {
          this.worker = new Worker(workerPath);
          this.worker.unref();
          this.worker.on('message', (msg) => {
            if (!msg || !msg.id) return;
            const handler = this.pendingRequests.get(msg.id);
            if (handler) {
              this.pendingRequests.delete(msg.id);
              if (msg.error) handler.reject(new Error(msg.error));
              else handler.resolve(msg);
            }
          });
          this.worker.on('error', (err) => {
            console.warn('[stt-engine] Worker error:', err.message);
            this.worker = null;
          });
          this.worker.on('exit', () => {
            this.worker = null;
          });
        }
      } catch (err) {
        console.warn('[stt-engine] Could not spawn worker:', err.message);
        this.worker = null;
      }
    }
    return this.worker;
  }

  destroy() {
    if (this.streamInterval) {
      clearInterval(this.streamInterval);
      this.streamInterval = null;
    }
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'shutdown' });
        this.worker.terminate();
      } catch {}
      this.worker = null;
    }
    this.pendingRequests.clear();
  }

  async transcribeAsync(samples, opts = {}) {
    const worker = this.getWorker();
    if (worker) {
      return new Promise((resolve) => {
        const id = `req-${++this.reqSeq}-${Date.now()}`;
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(id);
          resolve({ text: '' });
        }, 8000);
        this.pendingRequests.set(id, {
          resolve: (res) => { clearTimeout(timeout); resolve(res); },
          reject: () => { clearTimeout(timeout); resolve({ text: '' }); },
        });
        try {
          worker.postMessage({ type: 'transcribe', id, samples, opts });
        } catch {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          resolve({ text: '' });
        }
      });
    }

    const transcriber = await this.getTranscriber();
    if (!transcriber) return { text: '' };
    return await transcriber(samples, opts);
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
    if (options.backgroundMode !== undefined || options.background !== undefined) {
      this.backgroundMode = Boolean(options.backgroundMode || options.background);
    }
    if (this.active) return { ok: true, active: true, alreadyActive: true, backgroundMode: this.backgroundMode };
    this.active = true;
    this.backgroundMode = Boolean(options.backgroundMode || options.background);
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

    this.lastInterimText = '';
    this.lastSpeechDetectedTime = 0;
    this.silenceFinalEmitted = false;

    // Start streaming interim transcription interval if not in test mode
    if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
      if (this.streamInterval) clearInterval(this.streamInterval);
      this.streamInterval = setInterval(async () => {
        if (!this.active || this.isTranscribing) return;
        const recFile = this.currentRecordingFile;
        if (!recFile || !fs.existsSync(recFile)) return;

        try {
          const stats = fs.statSync(recFile);
          // Need at least ~0.5s of 16kHz 16-bit mono audio (16000 * 2 * 0.5 = 16000 bytes)
          if (stats.size < 16000) return;

          this.isTranscribing = true;
          const fullSamples = readWavToFloat32(recFile);
          if (fullSamples && fullSamples.length >= 8000) {
            // Sliding window: in background streaming mode, only process the last 4s of audio (64,000 samples)
            // so inference runs in parallel in worker thread in ~150ms and never balloons
            const samples = (this.backgroundMode && fullSamples.length > 64000)
              ? fullSamples.slice(-64000)
              : fullSamples;

            const res = await this.transcribeAsync(samples, {});
            const text = cleanTranscript(res?.text || '');
            const now = Date.now();
            if (text && this.active) {
              if (text !== this.lastInterimText) {
                this.lastInterimText = text;
                this.lastSpeechDetectedTime = now;
                this.silenceFinalEmitted = false;
                const payload = {
                  text,
                  isFinal: false,
                  elapsedMs: now - (this.recordingStartTime || now),
                  backgroundMode: this.backgroundMode,
                };
                this.emit('interim-text', payload);
                this.emit('stream-text', payload);
              } else if (this.lastSpeechDetectedTime > 0 && !this.silenceFinalEmitted && (now - this.lastSpeechDetectedTime >= 850)) {
                // User paused for >850ms: emit final utterance flag to finalize the bubble
                this.silenceFinalEmitted = true;
                const payload = {
                  text: this.lastInterimText,
                  isFinal: true,
                  elapsedMs: now - (this.recordingStartTime || now),
                  backgroundMode: this.backgroundMode,
                };
                this.emit('stream-text', payload);
              }
            }
          }
        } catch (err) {
          console.warn('[stt-engine] Streaming transcribe error:', err.message);
        } finally {
          this.isTranscribing = false;
        }
      }, 400);
    }

    this.emit('activated', { device, startTime: this.recordingStartTime, recordingFile: tmpFile, backgroundMode: this.backgroundMode });
    return { ok: true, active: true, device, startTime: this.recordingStartTime, backgroundMode: this.backgroundMode };
  }

  /**
   * Deactivate listening and transcribe recorded audio
   */
  async deactivate() {
    if (!this.active) return { ok: true, active: false, backgroundMode: this.backgroundMode };
    const durationMs = this.recordingStartTime ? Date.now() - this.recordingStartTime : 0;
    this.active = false;
    this.recordingStartTime = null;

    if (this.streamInterval) {
      clearInterval(this.streamInterval);
      this.streamInterval = null;
    }

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

    // Wait briefly if an interim transcription pass is currently in flight
    for (let i = 0; i < 25; i++) {
      if (!this.isTranscribing) break;
      await new Promise(r => setTimeout(r, 100));
    }

    let text = '';
    if (process.env.ROBOS_TEST === '1' || process.env.ROBOS_TEST_MODE === '1') {
      if (recFile && fs.existsSync(recFile)) {
        try { fs.unlinkSync(recFile); } catch {}
      }
      this.emit('deactivated', { durationMs, text, backgroundMode: this.backgroundMode });
      return { ok: true, active: false, durationMs, text, backgroundMode: this.backgroundMode };
    }

    if (recFile && fs.existsSync(recFile)) {
      try {
        const stats = fs.statSync(recFile);
        if (stats.size > 200) {
          const samples = readWavToFloat32(recFile);
          if (samples && samples.length >= 1600) {
            const opts = samples.length > 16000 * 30
              ? { chunk_length_s: 30, stride_length_s: 5 }
              : {};
            const res = await this.transcribeAsync(samples, opts);
            text = cleanTranscript(res?.text || '');
          }
        }
      } catch (err) {
        console.warn('[stt-engine] Transcription error:', err.message);
      } finally {
        try { fs.unlinkSync(recFile); } catch {}
      }
    }

    if (!text && this.lastInterimText) {
      text = this.lastInterimText;
    }
    const wasBackground = this.backgroundMode;
    this.backgroundMode = false;

    this.emit('interim-text', { text, isFinal: true, durationMs, backgroundMode: wasBackground });
    this.emit('stream-text', { text, isFinal: true, durationMs, backgroundMode: wasBackground });
    this.emit('deactivated', { durationMs, text, backgroundMode: wasBackground });
    return { ok: true, active: false, durationMs, text, backgroundMode: wasBackground };
  }

  simulateStreamChunk(text, isFinal = false) {
    const data = {
      text,
      isFinal,
      elapsedMs: 1000,
      backgroundMode: this.backgroundMode,
      timestamp: new Date().toISOString(),
    };
    this.emit('interim-text', data);
    this.emit('stream-text', data);
    return data;
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
