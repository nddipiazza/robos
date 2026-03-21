/**
 * AgentSession — manages a single AI agent CLI session.
 *
 * Tracks lifecycle (start, stop, output streaming), persists session state
 * to ~/.config/robos/agent-sessions/{id}.json, and records basic metrics
 * (duration, token usage when parseable, files changed).
 */
'use strict';

const { randomUUID } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

const SESSION_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.config', 'robos', 'agent-sessions',
);

// ── AgentSession ─────────────────────────────────────────────────────────────

class AgentSession extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.agentId   — e.g. 'claude' or 'copilot'
   * @param {object} opts.backend   — backend instance (claude-backend or copilot-backend)
   * @param {string} [opts.id]      — optional session ID (auto-generated if omitted)
   */
  constructor(opts = {}) {
    super();
    this.id = opts.id || randomUUID();
    this.agentId = opts.agentId || 'unknown';
    this.backend = opts.backend || null;
    this.status = 'idle';          // idle | running | stopped | error
    this.startedAt = null;
    this.stoppedAt = null;
    this.tokenUsage = null;        // { input, output } if parseable
    this.filesChanged = [];
    this.exitCode = null;
    this._process = null;
    this._outputBuffer = '';
  }

  /**
   * Start the agent CLI process.
   *
   * @param {string} workspaceDir   — working directory for the agent
   * @param {string[]} contextFiles — files to inject as context
   * @param {string} prompt         — the user/system prompt
   * @returns {AgentSession} this
   */
  start(workspaceDir, contextFiles, prompt) {
    if (this.status === 'running') throw new Error('Session already running');
    if (!this.backend) throw new Error('No backend configured');

    this.status = 'running';
    this.startedAt = Date.now();
    this._outputBuffer = '';

    try {
      this._process = this.backend.spawn(workspaceDir, contextFiles, prompt);
    } catch (err) {
      this.status = 'error';
      this.emit('error', err);
      return this;
    }

    if (this._process && this._process.stdout) {
      this._process.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        this._outputBuffer += text;
        this.emit('output', text);
      });
    }
    if (this._process && this._process.stderr) {
      this._process.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        this._outputBuffer += text;
        this.emit('output', text);
      });
    }
    if (this._process) {
      this._process.on('close', (code) => {
        this.exitCode = code;
        this.status = code === 0 ? 'stopped' : 'error';
        this.stoppedAt = Date.now();
        this._parseMetrics();
        this.emit('complete', { exitCode: code, duration: this.getDuration() });
      });
      this._process.on('error', (err) => {
        this.status = 'error';
        this.stoppedAt = Date.now();
        this.emit('error', err);
      });
    }

    return this;
  }

  /** Kill the running process. */
  stop() {
    if (this._process && this.status === 'running') {
      this._process.kill('SIGTERM');
      this.status = 'stopped';
      this.stoppedAt = Date.now();
    }
    return this;
  }

  /** @returns {'idle'|'running'|'stopped'|'error'} */
  getStatus() {
    return this.status;
  }

  /** @returns {number|null} duration in ms, or null if never started */
  getDuration() {
    if (!this.startedAt) return null;
    const end = this.stoppedAt || Date.now();
    return end - this.startedAt;
  }

  /** Register a callback for stdout/stderr output. */
  onOutput(callback) {
    this.on('output', callback);
    return this;
  }

  /** Register a callback for when the agent process finishes. */
  onComplete(callback) {
    this.on('complete', callback);
    return this;
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  /** Save session state to disk. */
  save() {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    const filePath = path.join(SESSION_DIR, `${this.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(this.toJSON(), null, 2));
    return filePath;
  }

  /** Load session state from disk. */
  static load(sessionId) {
    const filePath = path.join(SESSION_DIR, `${sessionId}.json`);
    if (!fs.existsSync(filePath)) return null;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const session = new AgentSession({
      id: data.id,
      agentId: data.agentId,
    });
    session.status = data.status || 'stopped';
    session.startedAt = data.startedAt || null;
    session.stoppedAt = data.stoppedAt || null;
    session.tokenUsage = data.tokenUsage || null;
    session.filesChanged = data.filesChanged || [];
    session.exitCode = data.exitCode ?? null;
    session._outputBuffer = data.output || '';
    return session;
  }

  /** Serialise to a plain object. */
  toJSON() {
    return {
      id: this.id,
      agentId: this.agentId,
      status: this.status,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      duration: this.getDuration(),
      tokenUsage: this.tokenUsage,
      filesChanged: this.filesChanged,
      exitCode: this.exitCode,
      output: this._outputBuffer,
    };
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  /** Best-effort extraction of token usage and file changes from output. */
  _parseMetrics() {
    if (this.backend && typeof this.backend.parseMetrics === 'function') {
      const metrics = this.backend.parseMetrics(this._outputBuffer);
      if (metrics) {
        if (metrics.tokenUsage) this.tokenUsage = metrics.tokenUsage;
        if (metrics.filesChanged) this.filesChanged = metrics.filesChanged;
      }
    }
  }
}

module.exports = { AgentSession, SESSION_DIR };
