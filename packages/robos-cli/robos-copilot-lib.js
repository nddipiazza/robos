/**
 * robos-copilot-lib.js — shared Node.js module for all RobOS Electron main processes.
 *
 * Provides a single consistent interface to AI CLI backends so every app:
 *   - Uses the same invocation flags
 *   - Writes swim-lane stream files so the desktop overlay shows active calls
 *   - Emits journal events on completion
 *   - Has hooks for pre/post call (logging, metrics)
 *
 * Usage:
 *   const copilot = require('/usr/local/share/robos/robos-copilot-lib');
 *
 *   // Fire-and-collect (returns full output string)
 *   const { ok, text, error } = await copilot.ask('Explain this code: ...');
 *
 *   // Streaming with live updates (e.g. for IPC sender)
 *   const { ok, text } = await copilot.stream('Suggest a fix for...', {
 *     title: 'AI fix suggestion',     // swim lane label
 *     onChunk: (chunk) => sender.send('copilot-output', { text: chunk }),
 *   });
 *
 *   // Full session (agentic multi-turn)
 *   const { ok, text, sessionId } = await copilot.session(prompt, { cwd, sessionId, onChunk });
 */

'use strict';

const cp   = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const STREAMS_DIR          = path.join(os.homedir(), '.config', 'robos', 'copilot-streams');
const JOURNAL_FILE         = path.join(os.homedir(), '.config', 'robos', 'journal-events.json');
const SETTINGS_FILE        = path.join(os.homedir(), '.config', 'robos', 'settings.json');
const AI_PROVIDER_CONFIG   = path.join(os.homedir(), '.config', 'robos', 'ai-provider.json');

// ── Builtin AI Providers ──────────────────────────────────────────────────────

const BUILTIN_PROVIDERS = {
  'github-copilot': {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    description: 'GitHub Copilot CLI via gh extension',
    bin: 'gh',
    buildArgs(prompt, opts) {
      const args = ['copilot', '--', '-p', prompt, '--allow-all-tools', '--plain-diff', '--output-format', 'json'];
      if (opts.sessionId) args.push('--resume', opts.sessionId);
      if (opts.silent)    args.push('--silent');
      if (opts.extraArgs) args.push(...opts.extraArgs);
      return args;
    },
    interactiveCmd(sessionId) {
      return sessionId ? `gh copilot -- --resume ${sessionId}` : `gh copilot`;
    },
    parseOutput: 'copilot-json',
    versionCheck:   { cmd: 'gh', args: ['--version'] },
    extensionCheck: { cmd: 'sh', args: ['-c', 'gh extension list 2>/dev/null | grep copilot | head -1'] },
    authCheck:      { cmd: 'gh', args: ['api', 'user', '--jq', '.login'] },
  },
  'claude-code': {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Anthropic Claude Code CLI',
    bin: 'claude',
    buildArgs(prompt, opts) {
      const args = ['-p', prompt, '--output-format', 'stream-json'];
      if (opts.sessionId) args.push('--resume', opts.sessionId);
      if (opts.extraArgs) args.push(...opts.extraArgs);
      return args;
    },
    interactiveCmd(sessionId) {
      return sessionId ? `claude --resume ${sessionId}` : `claude`;
    },
    parseOutput: 'claude-stream-json',
    versionCheck: { cmd: 'claude', args: ['--version'] },
    authCheck:    { cmd: 'claude', args: ['--version'] },
  },
};

// ── Provider config helpers ───────────────────────────────────────────────────

function _readProviderConfig() {
  try { return JSON.parse(fs.readFileSync(AI_PROVIDER_CONFIG, 'utf8')); }
  catch { return { activeProvider: 'github-copilot' }; }
}

function _writeProviderConfig(config) {
  _ensureDir(path.dirname(AI_PROVIDER_CONFIG));
  fs.writeFileSync(AI_PROVIDER_CONFIG, JSON.stringify(config, null, 2));
}

function _getActiveProvider() {
  const config = _readProviderConfig();
  const id = config.activeProvider || 'github-copilot';
  return BUILTIN_PROVIDERS[id] || BUILTIN_PROVIDERS['github-copilot'];
}

// ── Output parsing ────────────────────────────────────────────────────────────

function _parseOutputLine(format, line) {
  if (format === 'copilot-json') {
    try {
      const ev = JSON.parse(line);
      if (ev.type === 'assistant.message' && ev.data && ev.data.content) return { text: ev.data.content, _structured: true };
      if (ev.type === 'result' && ev.sessionId) return { sessionId: ev.sessionId, _structured: true };
    } catch {}
    return { _structured: true };
  }
  if (format === 'claude-stream-json') {
    try {
      const ev = JSON.parse(line);
      if (ev.type === 'assistant' && ev.message && ev.message.content) {
        const text = ev.message.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('');
        if (text) return { text, _structured: true };
      }
      if (ev.type === 'content_block_delta' && ev.delta && ev.delta.text) {
        return { text: ev.delta.text, _structured: true };
      }
      if (ev.type === 'result' && (ev.session_id || ev.sessionId)) {
        return { sessionId: ev.session_id || ev.sessionId, _structured: true };
      }
    } catch {}
    return { _structured: true };
  }
  return { text: line };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function _writeStream(id, data) {
  _ensureDir(STREAMS_DIR);
  fs.writeFileSync(path.join(STREAMS_DIR, `${id}.json`), JSON.stringify(data, null, 2));
}

function _updateStream(id, patch) {
  const f = path.join(STREAMS_DIR, `${id}.json`);
  let data = {};
  try { data = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  Object.assign(data, patch);
  try { fs.writeFileSync(f, JSON.stringify(data, null, 2)); } catch {}
}

function _removeStream(id) {
  try { fs.unlinkSync(path.join(STREAMS_DIR, `${id}.json`)); } catch {}
}

function _journalEvent(evt) {
  try {
    _ensureDir(path.dirname(JOURNAL_FILE));
    let events = [];
    try { events = JSON.parse(fs.readFileSync(JOURNAL_FILE, 'utf8')); } catch {}
    events.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...evt,
    });
    if (events.length > 2000) events = events.slice(0, 2000);
    fs.writeFileSync(JOURNAL_FILE, JSON.stringify(events, null, 2));
  } catch {}
}

function _settings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return {}; }
}

function _makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function _swimUpdate(swim, id, lines) {
  if (!swim || !lines.length) return;
  _updateStream(id, { last_line: lines[lines.length - 1], output_lines: lines.slice(-4) });
}

// ── Hooks registry ────────────────────────────────────────────────────────────

const _hooks = { before: [], after: [] };

/**
 * Register a hook that fires before every AI call.
 * Hook receives: { id, title, prompt, mode }
 */
function onBefore(fn) { _hooks.before.push(fn); }

/**
 * Register a hook that fires after every AI call.
 * Hook receives: { id, title, prompt, mode, ok, text, error, durationMs }
 */
function onAfter(fn) { _hooks.after.push(fn); }

function _runHooks(list, ctx) {
  list.forEach(fn => { try { fn(ctx); } catch {} });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * ask(prompt, opts) — run the active AI provider, collect full output.
 */
async function ask(prompt, opts = {}) {
  const id      = _makeId('ask');
  const title   = opts.title || prompt.slice(0, 55);
  const source  = opts.source || 'robos';
  const swim    = opts.swimLane !== false;
  const t0      = Date.now();
  const provider = _getActiveProvider();

  const ctx = { id, title, prompt, mode: 'ask' };
  _runHooks(_hooks.before, ctx);

  if (swim) {
    _writeStream(id, { id, title, status: 'streaming', last_line: '', output_lines: [], started: t0, ended: null });
  }

  return new Promise(resolve => {
    const { bin, args } = spawnArgs(prompt, opts);
    const proc = cp.spawn(bin, args,
      { env: { ...process.env, HOME: os.homedir(), DISPLAY: ':0' } });

    if (swim) _updateStream(id, { pid: proc.pid });

    let out = '';
    const addLines = chunk => {
      chunk.split('\n').filter(Boolean).forEach(line => {
        const parsed = _parseOutputLine(provider.parseOutput, line);
        if (parsed.text) {
          out += parsed.text + '\n';
          _swimUpdate(swim, id, parsed.text.split('\n').filter(Boolean));
        } else if (!parsed.sessionId && !parsed._structured) {
          out += line + '\n';
          _swimUpdate(swim, id, line.split('\n').filter(Boolean));
        }
      });
    };

    proc.stdout.on('data', d => addLines(d.toString()));
    proc.stderr.on('data', d => {
      const s = d.toString();
      out += s;
      _swimUpdate(swim, id, s.split('\n').filter(Boolean));
    });

    proc.on('close', code => {
      const durationMs = Date.now() - t0;
      const ok = code === 0;
      const text = out.trim();
      if (swim) _updateStream(id, { status: 'done', ended: Date.now() });
      _journalEvent({ source, type: 'ai-ask', title, detail: prompt.slice(0, 200), status: ok ? 'completed' : 'error' });
      _runHooks(_hooks.after, { ...ctx, ok, text, error: ok ? null : text, durationMs });
      resolve({ ok, text, error: ok ? null : text });
    });

    proc.on('error', e => {
      if (swim) _updateStream(id, { status: 'error', ended: Date.now() });
      _runHooks(_hooks.after, { ...ctx, ok: false, text: '', error: e.message, durationMs: Date.now() - t0 });
      resolve({ ok: false, text: '', error: e.message });
    });
  });
}

/**
 * stream(prompt, opts) — same as ask() but calls opts.onChunk(chunk) live.
 */
async function stream(prompt, opts = {}) {
  const id      = _makeId('stream');
  const title   = opts.title || prompt.slice(0, 55);
  const source  = opts.source || 'robos';
  const swim    = opts.swimLane !== false;
  const onChunk = opts.onChunk || null;
  const t0      = Date.now();
  const provider = _getActiveProvider();

  const ctx = { id, title, prompt, mode: 'stream' };
  _runHooks(_hooks.before, ctx);

  if (swim) {
    _writeStream(id, { id, title, status: 'streaming', last_line: '', output_lines: [], started: t0, ended: null });
  }

  const { bin, args } = spawnArgs(prompt, opts);

  return new Promise(resolve => {
    const proc = cp.spawn(bin, args, { env: { ...process.env, HOME: os.homedir(), DISPLAY: ':0' } });

    let out = '';
    const handle = chunk => {
      chunk.split('\n').filter(Boolean).forEach(line => {
        const parsed = _parseOutputLine(provider.parseOutput, line);
        if (parsed.text) {
          out += parsed.text + '\n';
          if (onChunk) try { onChunk(parsed.text); } catch {}
          _swimUpdate(swim, id, parsed.text.split('\n').filter(Boolean));
        } else if (!parsed.sessionId && !parsed._structured) {
          out += line + '\n';
          if (onChunk) try { onChunk(line); } catch {}
          _swimUpdate(swim, id, line.split('\n').filter(Boolean));
        }
      });
    };

    proc.stdout.on('data', d => handle(d.toString()));
    proc.stderr.on('data', d => {
      const s = d.toString();
      if (onChunk) try { onChunk(s); } catch {}
    });

    proc.on('close', code => {
      const durationMs = Date.now() - t0;
      const ok = code === 0;
      const text = out.trim();
      if (swim) _updateStream(id, { status: 'done', ended: Date.now() });
      _journalEvent({ source, type: 'ai-stream', title, detail: prompt.slice(0, 200), status: ok ? 'completed' : 'error' });
      _runHooks(_hooks.after, { ...ctx, ok, text, error: ok ? null : text, durationMs });
      resolve({ ok, text, error: ok ? null : text });
    });

    proc.on('error', e => {
      if (swim) _updateStream(id, { status: 'error', ended: Date.now() });
      _runHooks(_hooks.after, { ...ctx, ok: false, text: '', error: e.message, durationMs: Date.now() - t0 });
      resolve({ ok: false, text: '', error: e.message });
    });
  });
}

/**
 * session(prompt, opts) — full AI session with tool use.
 * Used for agentic tasks (create-session / run-in-session in agents-manager).
 */
async function session(prompt, opts = {}) {
  const id       = _makeId('session');
  const title    = opts.title || prompt.slice(0, 55);
  const source   = opts.source || 'robos';
  const swim     = opts.swimLane !== false;
  const onChunk  = opts.onChunk || null;
  const cwd      = opts.cwd || os.homedir();
  const t0       = Date.now();
  const provider = _getActiveProvider();

  const { bin, args } = spawnArgs(prompt, opts);

  const ctx = { id, title, prompt, mode: 'session' };
  _runHooks(_hooks.before, ctx);

  if (swim) {
    _writeStream(id, { id, title, status: 'streaming', last_line: prompt.slice(0, 80), output_lines: [], started: t0, ended: null, session_id: opts.sessionId || null });
  }

  return new Promise(resolve => {
    const proc = cp.spawn(bin, args, { cwd, env: { ...process.env, HOME: os.homedir(), DISPLAY: ':0' } });

    let out = '';
    let resultSessionId = opts.sessionId || null;

    proc.stdout.on('data', d => {
      const raw = d.toString();
      raw.split('\n').filter(Boolean).forEach(line => {
        if (onChunk) try { onChunk(line + '\n', 'json'); } catch {}
        const parsed = _parseOutputLine(provider.parseOutput, line);
        if (parsed.sessionId) resultSessionId = parsed.sessionId;
        if (parsed.text) {
          out += parsed.text + '\n';
          const lines = parsed.text.split('\n').filter(Boolean);
          if (onChunk) try { onChunk(parsed.text + '\n', 'text'); } catch {}
          _swimUpdate(swim, id, lines);
        }
      });
    });

    proc.stderr.on('data', d => {
      const t = d.toString();
      if (onChunk) try { onChunk(t, 'err'); } catch {}
    });

    proc.on('close', code => {
      const durationMs = Date.now() - t0;
      const ok = code === 0;
      if (swim) _updateStream(id, { status: 'done', ended: Date.now() });
      _journalEvent({ source, type: 'ai-session', title, detail: prompt.slice(0, 200), status: ok ? 'completed' : 'error' });
      _runHooks(_hooks.after, { ...ctx, ok, text: out.trim(), sessionId: resultSessionId, durationMs });
      resolve({ ok, text: out.trim(), sessionId: resultSessionId, error: ok ? null : 'exit ' + code });
    });

    proc.on('error', e => {
      if (swim) _updateStream(id, { status: 'error', ended: Date.now() });
      _runHooks(_hooks.after, { ...ctx, ok: false, text: '', error: e.message, durationMs: Date.now() - t0 });
      resolve({ ok: false, text: '', sessionId: null, error: e.message });
    });
  });
}

// ── spawnArgs ─────────────────────────────────────────────────────────────────

/**
 * spawnArgs(prompt, opts) — returns { bin, args, provider } for the AI CLI invocation.
 * Dispatches to the active provider's buildArgs().
 */
function spawnArgs(prompt, opts = {}) {
  const provider = _getActiveProvider();
  const args = provider.buildArgs(prompt, opts);
  return { bin: provider.bin, args, provider: provider.id };
}

// ── Provider management API ───────────────────────────────────────────────────

function getActiveProviderId() {
  return _getActiveProvider().id;
}

function listProviders() {
  const config = _readProviderConfig();
  return Object.values(BUILTIN_PROVIDERS).map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    builtin: true,
    active: (config.activeProvider || 'github-copilot') === p.id,
  }));
}

function setActiveProvider(providerId) {
  if (!BUILTIN_PROVIDERS[providerId]) return;
  const config = _readProviderConfig();
  config.activeProvider = providerId;
  _writeProviderConfig(config);
}

async function checkProviderStatus(providerId) {
  const provider = BUILTIN_PROVIDERS[providerId];
  if (!provider) return { installed: false, authenticated: false, version: '', details: {} };

  const run = (cmd, args) => new Promise(res => {
    cp.exec([cmd, ...args].join(' '), { timeout: 8000, env: { ...process.env } }, (err, stdout, stderr) => {
      res({ output: (stdout || '').trim(), error: (stderr || '').trim(), code: err ? err.code : 0 });
    });
  });

  const result = { installed: false, authenticated: false, version: '', details: {} };

  if (provider.versionCheck) {
    const ver = await run(provider.versionCheck.cmd, provider.versionCheck.args);
    result.version = ver.output.split('\n')[0] || ver.error.split('\n')[0];
    result.installed = !!result.version && !result.version.includes('not found') && !result.version.includes('No such file');
  }

  if (provider.extensionCheck) {
    const ext = await run(provider.extensionCheck.cmd, provider.extensionCheck.args);
    result.details.extension = ext.output || 'not installed';
  }

  if (provider.authCheck && result.installed) {
    const auth = await run(provider.authCheck.cmd, provider.authCheck.args);
    const authOut = auth.output || auth.error;
    result.authenticated = !!authOut && !authOut.startsWith('{') && auth.code === 0;
    result.details.user = authOut;
  }

  return result;
}

function getInteractiveCmd(providerId, sessionId) {
  const provider = BUILTIN_PROVIDERS[providerId] || _getActiveProvider();
  return provider.interactiveCmd(sessionId);
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  ask, stream, session, spawnArgs, onBefore, onAfter,
  getActiveProviderId, listProviders, setActiveProvider, checkProviderStatus, getInteractiveCmd,
};
