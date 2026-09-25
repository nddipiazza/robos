'use strict';

const EventEmitter = require('events');
const { spawn, exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const KOKORO_DIR = path.join(os.homedir(), '.local/share/kokoro');
const KOKORO_MODEL = path.join(KOKORO_DIR, 'kokoro-v1.0.onnx');
const KOKORO_VOICES = path.join(KOKORO_DIR, 'voices-v1.0.bin');

const PIPER_DIR = path.join(os.homedir(), '.local/share/piper/voices');
const PIPER_DEFAULT_MODEL = path.join(PIPER_DIR, 'en_US-lessac-medium/en_US-lessac-medium.onnx');

const DEFAULT_PREFS = {
  engine: 'kokoro', // 'kokoro' | 'edge-tts' | 'piper' | 'speech-dispatcher' | 'web-speech'
  voice: 'af_heart', // Kokoro default; or 'en-US-AndrewMultilingualNeural', 'en_US-lessac-medium'
  speed: 1.0,        // 0.5 - 2.0
  pitch: 0,          // -50 - +50 (or semitones for edge-tts)
  volume: 100,       // 0 - 100%
  autoSpeakResponses: true,
  wakeWordGreeting: "Hi!",
};

/**
 * Pronunciation filter ensuring "RobOS" is pronounced "Row Bose" (like Bose speaker system)
 */
function prepareSpeechText(text) {
  if (!text) return '';
  return text
    .replace(/\bRobOS\b/g, 'Row Bose')
    .replace(/\bRobos\b/g, 'Row Bose')
    .replace(/\brobos\b/gi, 'Row Bose')
    .replace(/\bROBOS\b/g, 'Row Bose')
    .replace(/\bRob-OS\b/gi, 'Row Bose');
}

class TTSEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.prefs = { ...DEFAULT_PREFS, ...options };
    this.currentPlaybackProcess = null;
    this.isSpeaking = false;
  }

  getPrefs() {
    return { ...this.prefs };
  }

  savePrefs(newPrefs = {}) {
    this.prefs = { ...this.prefs, ...newPrefs };
    return { ...this.prefs };
  }

  /**
   * Enumerate available voices grouped by engine
   */
  async listVoices() {
    const voices = {
      kokoro: [
        { id: 'af_heart', name: 'Heart (Warm, Natural Female - Recommended)', gender: 'female', lang: 'en-US', recommended: true },
        { id: 'am_michael', name: 'Michael (Natural, Confident Male)', gender: 'male', lang: 'en-US' },
        { id: 'am_adam', name: 'Adam (Clear, Expressive Male)', gender: 'male', lang: 'en-US' },
        { id: 'af_bella', name: 'Bella (Friendly Female)', gender: 'female', lang: 'en-US' },
        { id: 'af_nicole', name: 'Nicole (Calm, Professional Female)', gender: 'female', lang: 'en-US' },
        { id: 'af_sarah', name: 'Sarah (Energetic Female)', gender: 'female', lang: 'en-US' },
        { id: 'bf_emma', name: 'Emma (British Accent Female)', gender: 'female', lang: 'en-GB' },
        { id: 'bm_george', name: 'George (British Accent Male)', gender: 'male', lang: 'en-GB' },
      ],
      'edge-tts': [
        { id: 'en-US-AndrewMultilingualNeural', name: 'Andrew (Warm, Confident, Copilot Male - Studio)', gender: 'male', lang: 'en-US', recommended: true },
        { id: 'en-US-AvaMultilingualNeural', name: 'Ava (Expressive, Caring, Friendly Female - Studio)', gender: 'female', lang: 'en-US', recommended: true },
        { id: 'en-US-BrianMultilingualNeural', name: 'Brian (Approachable, Casual Male - Studio)', gender: 'male', lang: 'en-US' },
        { id: 'en-US-EmmaMultilingualNeural', name: 'Emma (Cheerful, Clear Female - Studio)', gender: 'female', lang: 'en-US' },
        { id: 'en-US-JennyNeural', name: 'Jenny (Friendly, Natural Female)', gender: 'female', lang: 'en-US' },
        { id: 'en-US-GuyNeural', name: 'Guy (Natural, Confident Male)', gender: 'male', lang: 'en-US' },
        { id: 'en-US-ChristopherNeural', name: 'Christopher (Authoritative, Reliable Male)', gender: 'male', lang: 'en-US' },
      ],
      piper: [
        { id: 'en_US-lessac-medium', name: 'Lessac (Medium Neural Female)', gender: 'female', lang: 'en-US' },
      ],
      'speech-dispatcher': [
        { id: 'male1', name: 'Standard Male', gender: 'male', lang: 'en' },
        { id: 'female1', name: 'Standard Female', gender: 'female', lang: 'en' },
      ],
    };

    return voices;
  }

  /**
   * Synthesize text to an audio file
   * @param {string} text
   * @param {object} options
   * @returns {Promise<{ ok: boolean, filePath: string, durationMs: number, engine: string }>}
   */
  async synthesize(text, options = {}) {
    const rawText = (text || '').trim();
    if (!rawText) {
      throw new Error('Text is required for speech synthesis');
    }
    const cleanText = prepareSpeechText(rawText);

    const engine = options.engine || this.prefs.engine || 'kokoro';
    const voice = options.voice || this.prefs.voice || (engine === 'edge-tts' ? 'en-US-AndrewMultilingualNeural' : 'af_heart');
    const speed = options.speed || this.prefs.speed || 1.0;
    const pitch = options.pitch || this.prefs.pitch || 0;
    const volume = options.volume != null ? options.volume : this.prefs.volume;

    const tmpId = `robos-tts-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // In test environment, emit a lightweight wav without running full model if flag is set
    if (process.env.ROBOS_TEST === '1' && options.mockAudio) {
      const outPath = path.join(os.tmpdir(), `${tmpId}.wav`);
      execSync(`ffmpeg -y -hide_banner -loglevel error -f lavfi -i anullsrc=r=24000:cl=mono -t 0.5 -c:a pcm_s16le "${outPath}"`);
      return { ok: true, filePath: outPath, durationMs: 500, engine };
    }

    // 1. Try Kokoro-82M
    if (engine === 'kokoro') {
      try {
        const outWav = path.join(os.tmpdir(), `${tmpId}.wav`);
        await this._synthesizeKokoro(cleanText, outWav, { voice, speed });
        if (fs.existsSync(outWav) && fs.statSync(outWav).size > 100) {
          const durationMs = this._getAudioDurationMs(outWav);
          return { ok: true, filePath: outWav, durationMs, engine: 'kokoro' };
        }
      } catch (err) {
        console.warn('[tts-engine] Kokoro synthesis error, falling back:', err.message);
      }
    }

    // 2. Try Edge-TTS
    if (engine === 'edge-tts' || engine === 'kokoro') {
      try {
        const outMp3 = path.join(os.tmpdir(), `${tmpId}.mp3`);
        await this._synthesizeEdgeTTS(cleanText, outMp3, { voice, speed, pitch, volume });
        if (fs.existsSync(outMp3) && fs.statSync(outMp3).size > 100) {
          const durationMs = this._getAudioDurationMs(outMp3);
          return { ok: true, filePath: outMp3, durationMs, engine: 'edge-tts' };
        }
      } catch (err) {
        console.warn('[tts-engine] Edge-TTS synthesis error, falling back:', err.message);
      }
    }

    // 3. Try Piper Neural TTS
    if (engine === 'piper' || fs.existsSync(PIPER_DEFAULT_MODEL)) {
      try {
        const outWav = path.join(os.tmpdir(), `${tmpId}.wav`);
        await this._synthesizePiper(cleanText, outWav, { voice, speed });
        if (fs.existsSync(outWav) && fs.statSync(outWav).size > 100) {
          const durationMs = this._getAudioDurationMs(outWav);
          return { ok: true, filePath: outWav, durationMs, engine: 'piper' };
        }
      } catch (err) {
        console.warn('[tts-engine] Piper synthesis error, falling back:', err.message);
      }
    }

    // 4. Fallback: lightweight sine wave/silence with ffmpeg so audio pipeline never breaks
    const fallbackWav = path.join(os.tmpdir(), `${tmpId}-fallback.wav`);
    try {
      execSync(`ffmpeg -y -hide_banner -loglevel error -f lavfi -i anullsrc=r=24000:cl=mono -t 1.0 -c:a pcm_s16le "${fallbackWav}"`);
      return { ok: true, filePath: fallbackWav, durationMs: 1000, engine: 'fallback' };
    } catch {
      throw new Error(`Failed to synthesize text: ${cleanText.slice(0, 30)}...`);
    }
  }

  /**
   * Speak text out loud via system audio playback
   * @param {string} text
   * @param {object} options
   */
  async speak(text, options = {}) {
    const cleanText = (text || '').trim();
    if (!cleanText) return { ok: false, error: 'Empty text' };

    this.stop(); // Stop any ongoing playback

    const synthResult = await this.synthesize(cleanText, options);
    this.isSpeaking = true;
    this.emit('speaking-start', { text: cleanText, engine: synthResult.engine, durationMs: synthResult.durationMs });

    // Play synthesized audio if not muted/silent
    if (options.silent !== true && options.playback !== false) {
      await this._playAudioFile(synthResult.filePath, synthResult.durationMs);
    }

    this.isSpeaking = false;
    this.emit('speaking-end', { text: cleanText, engine: synthResult.engine });

    // Clean up temporary audio file after a short delay
    setTimeout(() => {
      try {
        if (fs.existsSync(synthResult.filePath)) {
          fs.unlinkSync(synthResult.filePath);
        }
      } catch {}
    }, 2000);

    return {
      ok: true,
      text: cleanText,
      engine: synthResult.engine,
      durationMs: synthResult.durationMs,
      audioPath: synthResult.filePath,
    };
  }

  /**
   * Stop current speech playback immediately
   */
  stop() {
    if (this.currentPlaybackProcess) {
      try {
        this.currentPlaybackProcess.kill('SIGKILL');
      } catch {}
      this.currentPlaybackProcess = null;
    }
    // Also stop speech-dispatcher if active
    try {
      exec('spd-say --cancel 2>/dev/null');
    } catch {}

    this.isSpeaking = false;
    this.emit('speaking-stopped');
  }

  // ── Engine Synthesis Implementations ────────────────────────────────────────

  _synthesizeKokoro(text, outWav, { voice = 'af_heart', speed = 1.0 } = {}) {
    return new Promise((resolve, reject) => {
      const pyScript = `
import soundfile as sf
from kokoro_onnx import Kokoro
import sys

try:
    kokoro = Kokoro('${KOKORO_MODEL}', '${KOKORO_VOICES}')
    samples, sample_rate = kokoro.create(sys.argv[1], voice='${voice}', speed=${Number(speed) || 1.0}, lang='en-us')
    sf.write('${outWav}', samples, sample_rate)
    sys.exit(0)
except Exception as e:
    sys.stderr.write(str(e))
    sys.exit(1)
`;
      const proc = spawn('python3', ['-c', pyScript, text], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code === 0 && fs.existsSync(outWav)) resolve();
        else reject(new Error(stderr || `Kokoro exited with code ${code}`));
      });
      proc.on('error', reject);
    });
  }

  _synthesizeEdgeTTS(text, outMp3, { voice = 'en-US-AndrewMultilingualNeural', speed = 1.0, pitch = 0, volume = 100 } = {}) {
    return new Promise((resolve, reject) => {
      const ratePercent = Math.round((Number(speed) - 1.0) * 100);
      const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

      const pitchVal = Number(pitch) || 0;
      const pitchStr = pitchVal >= 0 ? `+${pitchVal}Hz` : `${pitchVal}Hz`;

      const volVal = Math.round(Number(volume) || 100);
      const volStr = volVal >= 100 ? `+0%` : `-${100 - volVal}%`;

      const args = [
        '--voice', voice,
        '--text', text,
        '--write-media', outMp3,
        '--rate', rateStr,
        '--pitch', pitchStr,
        '--volume', volStr,
      ];

      const proc = spawn('edge-tts', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code === 0 && fs.existsSync(outMp3)) resolve();
        else reject(new Error(stderr || `Edge-TTS exited with code ${code}`));
      });
      proc.on('error', reject);
    });
  }

  _synthesizePiper(text, outWav, { voice = 'en_US-lessac-medium', speed = 1.0 } = {}) {
    return new Promise((resolve, reject) => {
      const modelPath = voice.includes('/') || voice.endsWith('.onnx')
        ? voice
        : path.join(PIPER_DIR, `${voice}/${voice}.onnx`);

      const piperBin = fs.existsSync(path.join(os.homedir(), '.local/bin/piper'))
        ? path.join(os.homedir(), '.local/bin/piper')
        : 'piper';

      const lengthScale = (1.0 / (Number(speed) || 1.0)).toFixed(2);
      const args = ['-m', modelPath, '-f', outWav, '--length-scale', String(lengthScale)];

      const proc = spawn(piperBin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code === 0 && fs.existsSync(outWav)) resolve();
        else reject(new Error(stderr || `Piper exited with code ${code}`));
      });
      proc.on('error', reject);

      try {
        proc.stdin.write(text + '\n');
        proc.stdin.end();
      } catch (e) {
        reject(e);
      }
    });
  }

  // ── Audio Playback Helper ───────────────────────────────────────────────────

  _playAudioFile(filePath, durationMs = 1500) {
    return new Promise((resolve) => {
      if (process.env.ROBOS_TEST === '1' || process.env.ROBOS_HEADLESS === '1') {
        return resolve();
      }

      let player = 'aplay';
      let args = ['-q', filePath];

      if (filePath.endsWith('.mp3')) {
        player = 'ffplay';
        args = ['-nodisp', '-autoexit', '-loglevel', 'error', filePath];
      }

      let proc = null;
      let finished = false;
      const done = () => {
        if (!finished) {
          finished = true;
          if (proc) {
            try { proc.kill(); } catch {}
          }
          this.currentPlaybackProcess = null;
          resolve();
        }
      };

      try {
        proc = spawn(player, args, { stdio: 'ignore' });
        this.currentPlaybackProcess = proc;
        proc.on('close', done);
        proc.on('exit', done);
        proc.on('error', done);

        // Cap playback wait at duration + 1000ms (max 15s)
        const timeoutMs = Math.min(Math.max(1500, durationMs + 1000), 15000);
        setTimeout(done, timeoutMs);
      } catch {
        done();
      }
    });
  }

  _getAudioDurationMs(filePath) {
    try {
      const out = execSync(`ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${filePath}"`, {
        encoding: 'utf8',
        timeout: 3000,
      }).trim();
      return Math.round(parseFloat(out) * 1000) || 1500;
    } catch {
      return 1500;
    }
  }
}

module.exports = {
  TTSEngine,
  DEFAULT_PREFS,
};
