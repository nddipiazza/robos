'use strict';

const EventEmitter = require('events');
const { exec, spawn } = require('child_process');
const { Worker } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const os = require('os');

function cleanTranscript(text) {
  if (!text) return '';
  let cleaned = text
    .replace(/\[(?:BLANK_AUDIO|silence|music|applause|laughter|noise|sigh|groan|cough|sound)\]/gi, '')
    .replace(/\((?:music|applause|laughter|noise|sigh|groan|cough)\)/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Detect and collapse Whisper autoregressive repetition loops
  cleaned = cleaned.replace(/(\b[\w'-]+\b)(?:\s+\1\b){2,}/gi, '$1');
  cleaned = cleaned.replace(/(\b[\w'-]+\s+[\w'-]+\b)(?:\s+\1\b){2,}/gi, '$1');

  return cleaned.trim();
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

/**
 * Adaptive Energy Voice Activity Detector (VAD)
 * Based on proven open-source implementations (Rhasspy energy-vad & Jam3 voice-activity-detection).
 * Dynamically tracks ambient room noise floor and adjusts speech threshold.
 */
class AdaptiveEnergyVad {
  constructor(options = {}) {
    this.noiseFloor = options.initialNoiseFloor || 0.002;
    this.speechThreshold = options.initialThreshold || 0.006;
    this.alpha = options.alpha || 0.95; // Smoothing factor for noise tracking
  }

  reset() {
    this.noiseFloor = 0.002;
    this.speechThreshold = 0.006;
  }

  analyze(chunk) {
    if (!chunk || chunk.length === 0) return { speech: false, energy: 0 };
    let sum = 0;
    const step = 4;
    let count = 0;
    for (let i = 0; i < chunk.length; i += step) {
      const s = chunk[i];
      sum += s * s;
      count++;
    }
    const energy = Math.sqrt(sum / count);
    const speech = energy > this.speechThreshold;
    if (!speech && energy < 0.02) {
      // Adapt noise floor only during quiet intervals
      this.noiseFloor = this.alpha * this.noiseFloor + (1 - this.alpha) * energy;
      this.speechThreshold = Math.max(0.0055, this.noiseFloor * 2.2 + 0.003);
    }
    return { speech, energy, threshold: this.speechThreshold, noiseFloor: this.noiseFloor };
  }
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
    this.processedSampleOffset = 0;
    this.backgroundMode = Boolean(options.backgroundMode);
    this.worker = null;
    this.pendingRequests = new Map();
    this.reqSeq = 0;

    // VAD & Streaming Utterance Tracking
    this.vad = new AdaptiveEnergyVad();
    this.inSpeech = false;
    this.speechStartSample = 0;
    this.silenceStartOffset = 0;
    this.vadSampleOffset = 0;

    // Pre-warm Whisper worker in background
    if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
      setTimeout(() => {
        try {
          const w = this.getWorker();
          if (w) w.postMessage({ type: 'init' });
        } catch {}
      }, 100);
    }
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

  _startRecordingProcess(tmpFile, device = this.configuredDevice) {
    let spawnCmd = 'arecord';
    let spawnArgs = ['-q', '-D', 'default', '-f', 'S16_LE', '-r', '16000', '-c', '1', tmpFile];

    if (/^\d+$/.test(device)) {
      spawnCmd = 'pw-record';
      spawnArgs = ['--target', String(device), '--rate', '16000', '--channels', '1', tmpFile];
    } else if (device && device.startsWith('hw:')) {
      spawnCmd = 'arecord';
      spawnArgs = ['-q', '-D', device, '-f', 'S16_LE', '-r', '16000', '-c', '1', tmpFile];
    }

    try {
      const proc = spawn(spawnCmd, spawnArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      proc.on('error', (err) => {
        console.warn(`[stt-engine] Recording process error (${spawnCmd}):`, err.message);
      });
      return proc;
    } catch (err) {
      console.warn(`[stt-engine] Failed to spawn ${spawnCmd}:`, err.message);
      return null;
    }
  }

  resetRecordingBuffer() {
    this.vad.reset();
    this.inSpeech = false;
    this.speechStartSample = 0;
    this.silenceStartOffset = 0;
    this.vadSampleOffset = 0;
    this.lastInterimText = '';
    this.processedSampleOffset = 0;
    if (!this.active) return;

    const oldFile = this.currentRecordingFile;
    const oldProc = this.recordingProcess;

    const tmpFile = path.join(os.tmpdir(), `robos-voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.wav`);
    this.currentRecordingFile = tmpFile;
    this.recordingStartTime = Date.now();
    this.recordingProcess = this._startRecordingProcess(tmpFile, this.configuredDevice);

    if (oldProc) {
      try { oldProc.kill('SIGINT'); } catch {}
    }
    if (oldFile && fs.existsSync(oldFile)) {
      setTimeout(() => {
        try { if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile); } catch {}
      }, 1000);
    }
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
    this.recordingProcess = this._startRecordingProcess(tmpFile, device);

    this.vad.reset();
    this.inSpeech = false;
    this.speechStartSample = 0;
    this.silenceStartOffset = 0;
    this.vadSampleOffset = 0;
    this.lastInterimText = '';
    this.processedSampleOffset = 0;

    // Start streaming interim transcription interval if not in test mode
    if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
      if (this.streamInterval) clearInterval(this.streamInterval);
      this.streamInterval = setInterval(async () => {
        if (!this.active || this.isTranscribing) return;
        const recFile = this.currentRecordingFile;
        if (!recFile || !fs.existsSync(recFile)) return;

        try {
          const stats = fs.statSync(recFile);
          if (stats.size < 9600) return;

          const fullSamples = readWavToFloat32(recFile);
          if (!fullSamples) return;

          const chunkStep = 3200; // 200ms at 16kHz
          if (!this.vadSampleOffset) this.vadSampleOffset = 0;

          // Run VAD on newly arrived audio
          while (this.vadSampleOffset + chunkStep <= fullSamples.length) {
            const chunk = fullSamples.subarray(this.vadSampleOffset, this.vadSampleOffset + chunkStep);
            const { speech } = this.vad.analyze(chunk);

            if (speech && !this.inSpeech) {
              this.inSpeech = true;
              this.speechStartSample = Math.max(0, this.vadSampleOffset - 4800); // 0.3s pre-roll buffer
              this.silenceStartOffset = 0;
            } else if (this.inSpeech) {
              if (!speech) {
                if (this.silenceStartOffset === 0) this.silenceStartOffset = this.vadSampleOffset;
              } else {
                this.silenceStartOffset = 0;
              }
            }
            this.vadSampleOffset += chunkStep;
          }

          const currentSample = fullSamples.length;

          // Case A: NOT currently in speech
          if (!this.inSpeech) {
            this.processedSampleOffset = Math.max(0, currentSample - 4800);
            return;
          }

          // Case B: IN speech
          const silenceDurationSec = this.silenceStartOffset > 0
            ? (currentSample - this.silenceStartOffset) / 16000
            : 0;
          const speechSegmentDurationSec = (currentSample - this.speechStartSample) / 16000;

          // Utterance completion check:
          // Condition 1: Silence hangover >= 0.85s
          // Condition 2: Max segment length >= 15.0s (buffer trimming per ufal/whisper_streaming)
          const isComplete = (silenceDurationSec >= 0.85) || (speechSegmentDurationSec >= 15.0);

          if (isComplete) {
            this.isTranscribing = true;
            try {
              // Bounded audio: up to silence onset + 0.1s tail (no trailing room noise!)
              const endSample = this.silenceStartOffset > 0
                ? Math.min(currentSample, this.silenceStartOffset + 1600)
                : currentSample;
              const speechChunk = fullSamples.subarray(this.speechStartSample, endSample);

              if (speechChunk.length >= 6400) { // at least 0.4s
                const res = await this.transcribeAsync(speechChunk, {});
                const text = cleanTranscript(res?.text || '');
                if (text && this.active) {
                  const now = Date.now();
                  const payload = {
                    text,
                    isFinal: true,
                    elapsedMs: now - (this.recordingStartTime || now),
                    backgroundMode: this.backgroundMode,
                  };
                  this.emit('stream-text', payload);
                }
              }
            } finally {
              this.isTranscribing = false;
              this.inSpeech = false;
              this.silenceStartOffset = 0;
              this.speechStartSample = currentSample;
              this.processedSampleOffset = currentSample;
              this.lastInterimText = '';
            }
            return;
          }

          // In speech, still vocalizing: emit interim text if speech length >= 0.5s
          if (speechSegmentDurationSec >= 0.5 && !this.isTranscribing) {
            this.isTranscribing = true;
            try {
              const speechChunk = fullSamples.subarray(this.speechStartSample, currentSample);
              const res = await this.transcribeAsync(speechChunk, {});
              const text = cleanTranscript(res?.text || '');
              if (text && this.active && text !== this.lastInterimText) {
                this.lastInterimText = text;
                const now = Date.now();
                const payload = {
                  text,
                  isFinal: false,
                  elapsedMs: now - (this.recordingStartTime || now),
                  backgroundMode: this.backgroundMode,
                };
                this.emit('interim-text', payload);
              }
            } finally {
              this.isTranscribing = false;
            }
          }
        } catch (err) {
          console.warn('[stt-engine] Streaming transcribe error:', err.message);
          this.isTranscribing = false;
        }
      }, 250);
    }

    this.emit('activated', { device, startTime: this.recordingStartTime, recordingFile: tmpFile, backgroundMode: this.backgroundMode });
    return { ok: true, active: true, device, startTime: this.recordingStartTime, backgroundMode: this.backgroundMode };
  }

  /**
   * Deactivate listening and clean up
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

    const wasBackground = this.backgroundMode;
    this.backgroundMode = false;

    if (process.env.ROBOS_TEST === '1' || process.env.ROBOS_TEST_MODE === '1') {
      if (recFile && fs.existsSync(recFile)) {
        try { fs.unlinkSync(recFile); } catch {}
      }
      this.processedSampleOffset = 0;
      this.silenceFinalEmitted = false;
      this.lastSpeechDetectedTime = 0;
      this.lastInterimText = '';
      this.emit('deactivated', { durationMs, text: '', backgroundMode: wasBackground });
      return { ok: true, active: false, durationMs, text: '', backgroundMode: wasBackground };
    }

    let text = '';

    if (wasBackground) {
      // In background/continuous streaming dictation mode:
      // Utterances were already streamed and finalized into individual bubbles!
      // If there was an unfinalized utterance in flight when user clicked stop, emit it as final.
      if (this.lastInterimText && !this.silenceFinalEmitted) {
        text = this.lastInterimText.trim();
        this.lastInterimText = '';
        if (text) {
          this.emit('stream-text', { text, isFinal: true, durationMs, backgroundMode: wasBackground });
        }
      }
      if (recFile && fs.existsSync(recFile)) {
        try { fs.unlinkSync(recFile); } catch {}
      }
    } else {
      // Push-to-talk mode: transcribe recorded file once on release
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
      if (text) {
        this.emit('interim-text', { text, isFinal: true, durationMs, backgroundMode: wasBackground });
        this.emit('stream-text', { text, isFinal: true, durationMs, backgroundMode: wasBackground });
      }
    }

    this.processedSampleOffset = 0;
    this.silenceFinalEmitted = false;
    this.lastSpeechDetectedTime = 0;

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
  AdaptiveEnergyVad,
  readWavToFloat32,
  cleanTranscript,
};
