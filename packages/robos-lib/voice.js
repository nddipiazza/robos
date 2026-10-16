'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');

class RobOSVoiceClient {
  constructor(options = {}) {
    this.port = parseInt(options.port || process.env.ROBOS_VOICE_PORT || '19188', 10);
    this.baseUrl = options.baseUrl || `http://127.0.0.1:${this.port}`;
  }

  _request(method, pathname, body = null, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const url = new URL(pathname, this.baseUrl);
      const req = http.request(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: timeoutMs,
      }, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request to RobOS Voice API timed out after ${timeoutMs}ms`));
      });

      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  }

  _getLocalTTSEngine() {
    try {
      const candidates = [
        path.resolve(__dirname, '..', 'voice-prompt', 'lib', 'tts-engine'),
        '/usr/local/share/robos/voice-prompt/lib/tts-engine',
      ];
      for (const p of candidates) {
        try {
          const { TTSEngine } = require(p);
          if (TTSEngine) return new TTSEngine();
        } catch {}
      }
    } catch {}
    return null;
  }

  /**
   * Check status of RobOS Voice daemon
   */
  async getStatus() {
    try {
      const res = await this._request('GET', '/api/status');
      return res.data;
    } catch (err) {
      return {
        ok: false,
        running: false,
        active: false,
        error: err.message,
        port: this.port,
      };
    }
  }

  /**
   * Ensure RobOS Voice overlay app is running; launches it if not already on
   */
  async ensureRunning(timeoutMs = 8000) {
    const status = await this.getStatus();
    if (status && status.ok) {
      return { ok: true, alreadyRunning: true, status };
    }

    const { spawn } = require('child_process');
    const candidates = [
      path.resolve(__dirname, '..', 'voice-prompt', 'bin', 'robos-voice-hud'),
      '/usr/local/bin/robos-voice-hud',
      path.resolve(__dirname, '..', 'voice-prompt', 'bin', 'robos-voice-prompt'),
      '/usr/local/bin/robos-voice-prompt',
    ];

    let launchBin = candidates.find(c => fs.existsSync(c));
    let launchArgs = [];

    if (!launchBin) {
      const voiceDir = path.resolve(__dirname, '..', 'voice-prompt');
      const electronCandidates = [
        path.join(voiceDir, 'node_modules', '.bin', 'electron'),
        path.resolve(__dirname, '..', 'robos-test', 'node_modules', '.bin', 'electron'),
        'electron',
      ];
      const electronBin = electronCandidates.find(c => fs.existsSync(c)) || 'electron';
      launchBin = electronBin;
      launchArgs = [voiceDir, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hud'];
    }

    try {
      const childEnv = { ...process.env, DISPLAY: process.env.DISPLAY || ':0' };
      const child = spawn(launchBin, launchArgs, {
        detached: true,
        stdio: 'ignore',
        env: childEnv,
      });
      child.unref();

      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 250));
        const check = await this.getStatus();
        if (check && check.ok) {
          return { ok: true, launched: true, pid: child.pid, status: check };
        }
      }
      return { ok: false, error: `RobOS Voice app launched (PID ${child.pid}) but did not respond within ${timeoutMs}ms` };
    } catch (err) {
      return { ok: false, error: `Failed to launch RobOS Voice app: ${err.message}` };
    }
  }

  /**
   * Speak text out loud using RobOS Outgoing Voice (Kokoro / Edge-TTS / Piper)
   * @param {string} text
   * @param {object} options
   */
  async speak(text, options = {}) {
    const cleanText = (text || '').trim();
    if (!cleanText) return { ok: false, error: 'Text required' };

    try {
      const res = await this._request('POST', '/api/speak', { text: cleanText, ...options }, 20000);
      if (res.status === 200) return res.data;
      throw new Error(res.data?.error || `HTTP ${res.status}`);
    } catch (err) {
      // Local library fallback when background daemon is offline
      const engine = this._getLocalTTSEngine();
      if (engine) {
        return engine.speak(cleanText, options);
      }
      return { ok: false, error: `Could not connect to Voice daemon: ${err.message}` };
    }
  }

  /**
   * Stop active speech playback immediately
   */
  async stopSpeaking() {
    try {
      const res = await this._request('POST', '/api/stop-speaking');
      return res.data;
    } catch {
      const engine = this._getLocalTTSEngine();
      if (engine) {
        engine.stop();
        return { ok: true, stopped: true, fallback: true };
      }
      return { ok: false, error: 'Could not stop speech' };
    }
  }

  /**
   * List available natural voices
   */
  async getVoices() {
    try {
      const res = await this._request('GET', '/api/voices');
      return res.data?.voices || {};
    } catch {
      const engine = this._getLocalTTSEngine();
      if (engine) return engine.listVoices();
      return {};
    }
  }

  /**
   * Activate listening for dictation
   */
  async activate(options = {}) {
    await this.ensureRunning();
    const opts = { backgroundMode: false, ...options };
    const res = await this._request('POST', '/api/activate', opts);
    return res.data;
  }

  /**
   * Deactivate listening
   */
  async deactivate() {
    const res = await this._request('POST', '/api/deactivate');
    return res.data;
  }

  /**
   * Start continuous background streaming mode (ephemeral pub/sub topic)
   */
  async startBackgroundStream(options = {}) {
    const res = await this._request('POST', '/api/background/start', options);
    return res.data;
  }

  /**
   * Stop background streaming mode
   */
  async stopBackgroundStream() {
    const res = await this._request('POST', '/api/background/stop');
    return res.data;
  }

  /**
   * Dictate prompt text to the store with desktop context
   */
  async dictate(text, options = {}) {
    const res = await this._request('POST', '/api/dictate', { text, ...options });
    return res.data;
  }

  /**
   * Send a query directly to the RobOS Desktop Assistant
   */
  async askAssistant(message, options = {}) {
    try {
      const res = await this._request('POST', '/api/assistant/chat', { message, ...options }, 25000);
      if (res.status === 200) return res.data;
      throw new Error(res.data?.error || `HTTP ${res.status}`);
    } catch (err) {
      try {
        const assistantPath = path.resolve(__dirname, '..', 'voice-prompt', 'lib', 'desktop-assistant');
        const { DesktopAssistant } = require(assistantPath);
        const engine = this._getLocalTTSEngine();
        const assistant = new DesktopAssistant({ ttsEngine: engine });
        return await assistant.processQuery(message, options);
      } catch {}
      throw err;
    }
  }

  /**
   * Get assistant conversation history
   */
  async getAssistantHistory() {
    const res = await this._request('GET', '/api/assistant/history');
    return res.data?.history || [];
  }

  /**
   * Clear assistant conversation history
   */
  async clearAssistantHistory() {
    const res = await this._request('DELETE', '/api/assistant/history');
    return res.data;
  }

  /**
   * Toggle wake-word detection for "hello robos"
   */
  async toggleWakeWord(enabled = true) {
    const res = await this._request('POST', '/api/wake-word/toggle', { enabled });
    return res.data;
  }

  /**
   * Subscribe to live SSE voice stream
   * @param {function} onChunk - callback for incoming chunks
   * @param {function} onError - callback for errors
   * @returns {function} unsubscribe function
   */
  listenStream(onChunk, onError) {
    const url = new URL('/api/stream', this.baseUrl);
    const req = http.get(url, (res) => {
      let buffer = '';
      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n\n');
        buffer = lines.pop(); // keep remainder
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (typeof onChunk === 'function') onChunk(data);
            } catch {}
          }
        }
      });
    });

    req.on('error', (err) => {
      if (typeof onError === 'function') onError(err);
    });

    return () => {
      try { req.destroy(); } catch {}
    };
  }

  /**
   * Execute a RobOS skill via voice/assistant
   */
  async executeSkill(command, options = {}) {
    try {
      const res = await this._request('POST', '/api/skills/execute', { command, ...options }, 25000);
      if (res.status === 200) return res.data;
      throw new Error(res.data?.error || `HTTP ${res.status}`);
    } catch (err) {
      try {
        const executorPath = path.resolve(__dirname, '..', 'voice-prompt', 'lib', 'skills-executor');
        const { SkillsExecutor } = require(executorPath);
        const executor = new SkillsExecutor();
        return await executor.executeCommand(command, {}, options);
      } catch {}
      throw err;
    }
  }

  /**
   * Add a task to RobOS Task Explorer project
   */
  async addTask(title, options = {}) {
    return this.executeSkill(`add a task: ${title}`, options);
  }

  /**
   * Start a voice session with a guidance prompt and live streaming
   */
  async startVoiceSession(options = {}) {
    const { guidancePrompt = '', agentId = 'fast-reactive', onInterim, onError } = options;
    const session = {
      startTime: Date.now(),
      guidancePrompt,
      capturedText: '',
      interimText: '',
      unsubscribe: null,
    };

    const activateRes = await this.activate({
      backgroundMode: true,
      guidancePrompt,
      agentId,
    });

    session.unsubscribe = this.listenStream((chunk) => {
      if (chunk.text) {
        if (chunk.isFinal) {
          session.capturedText = (session.capturedText + ' ' + chunk.text).trim();
          session.interimText = '';
        } else {
          session.interimText = chunk.text;
        }
        const total = (session.capturedText + ' ' + session.interimText).trim();
        if (typeof onInterim === 'function') {
          onInterim({ text: total, chunk, session });
        }
      }
    }, onError);

    this._currentSession = session;
    return { ok: true, session, activateRes };
  }

  /**
   * Stop active voice session and return captured text with guidance prompt
   */
  async stopVoiceSession() {
    const session = this._currentSession || { guidancePrompt: '', capturedText: '', startTime: Date.now() };
    if (session.unsubscribe) {
      try { session.unsubscribe(); } catch {}
      session.unsubscribe = null;
    }

    const deactivateRes = await this.deactivate();
    let text = (session.capturedText || '').trim();
    if (deactivateRes?.text && deactivateRes.text.trim()) {
      text = deactivateRes.text.trim();
    } else if (session.interimText) {
      text = (text + ' ' + session.interimText).trim();
    }

    const durationMs = Math.max(0, Date.now() - (session.startTime || Date.now()));
    const result = {
      ok: true,
      text,
      guidancePrompt: session.guidancePrompt || '',
      fullPrompt: `[Guidance Context]\n${session.guidancePrompt || ''}\n\n[Captured Voice Audio Transcript]\n"${text}"`,
      durationMs,
      timestamp: new Date().toISOString(),
    };

    this._currentSession = null;
    return result;
  }
}

const voice = new RobOSVoiceClient();

module.exports = {
  RobOSVoiceClient,
  voice,
  voiceClient: voice,
};
