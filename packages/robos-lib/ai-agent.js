/**
 * robos-lib/ai-agent.js
 *
 * Shared AI agent invocation for all RobOS Electron apps.
 *
 * Reads ~/.config/robos/ai-provider.json to determine the active provider and
 * provides a uniform ask() API regardless of which CLI is underneath.
 *
 * The coding-agent CLIs are the default path. If the user turned on the
 * optional API mode in RobOS Preferences (and installed its packages),
 * ask() calls without a providerId go to the configured model API through
 * robos-llm instead, and fall back to the active CLI if that call fails.
 *
 * Usage (in any Electron main.js):
 *
 *   const aiAgent = require('/usr/local/share/robos/robos-lib/ai-agent');
 *
 *   // List providers for a dropdown
 *   const { activeId, activeName, providers } = aiAgent.listProviders();
 *
 *   // Ask using the default (or a specific) provider
 *   const { ok, text, error, via } = await aiAgent.ask(prompt);
 *   const { ok, text, error } = await aiAgent.ask(prompt, { providerId: 'claude-code' });
 */

'use strict';

const cp   = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const AI_PROVIDER_CONFIG = path.join(os.homedir(), '.config', 'robos', 'ai-provider.json');

// ── Provider registry ─────────────────────────────────────────────────────────

const PROVIDERS = [
  {
    id:   'github-copilot',
    name: 'GitHub Copilot',
    // copilot -p <prompt> --allow-all-tools: non-interactive single-shot mode
    buildArgs: (prompt) => ['-p', prompt, '--allow-all-tools'],
    bin: 'copilot',
  },
  {
    id:   'claude-code',
    name: 'Claude Code',
    // claude --print: non-interactive; prompt is the final positional argument
    buildArgs: (prompt) => ['--print', '--output-format', 'text', prompt],
    bin: 'claude',
  },
  {
    id:   'codex',
    name: 'Codex',
    // codex exec: non-interactive agent run; --skip-git-repo-check avoids cwd restriction
    buildArgs: (prompt) => ['exec', '-c', 'approval_policy=never', '--skip-git-repo-check', prompt],
    bin: 'codex',
  },
  {
    id:   'antigravity',
    name: 'Gemini CLI / Antigravity',
    // gemini -p: non-interactive single prompt (RobOS runs the Gemini CLI for the Antigravity provider)
    buildArgs: (prompt) => ['-p', prompt],
    bin: 'gemini',
  },
];

const PROVIDER_MAP = Object.fromEntries(PROVIDERS.map(p => [p.id, p]));

// ── Optional API mode (robos-llm) ─────────────────────────────────────────────

let llm;
function loadLlm() {
  if (llm !== undefined) return llm;
  llm = null;
  const candidates = [
    process.env.ROBOS_LLM_PATH,
    path.resolve(__dirname, '..', 'robos-llm'),
    '/usr/local/share/robos/robos-llm',
  ].filter(Boolean);
  for (const p of candidates) { try { llm = require(p); break; } catch {} }
  return llm;
}

/** API mode settings, or null when it is off or robos-llm is not deployed. */
function apiMode() {
  const lib = loadLlm();
  if (!lib) return null;
  const config = lib.readConfig();
  return config.enabled ? { ...config, label: lib.PROVIDERS[config.provider].label } : null;
}

// One notification per error code per process, so a broken key does not flood the panel.
const notified = new Set();
function notifyApiFallback(result, cliName) {
  if (notified.has(result.code)) return;
  notified.add(result.code);
  try {
    const store = require('./auth-notifications');
    store.update(path.join(os.homedir(), '.config', 'robos'), file => {
      const entry = {
        id: require('crypto').randomUUID(),
        title: 'API mode unavailable, used ' + cliName,
        body: result.error + ' Turn API mode off or fix it in RobOS Preferences > AI.',
        category: 'agent', tier: 'warning', source: 'robos-llm',
        ts: new Date().toISOString(), read: false,
      };
      store.write(file, [entry, ...store.read(file, [])].slice(0, 500));
    });
  } catch {}
}

// ── Prompt security ───────────────────────────────────────────────────────────

/** Applies the user's prompt security policy (redact by default) to a prompt. */
function guardPrompt(text, securityOptions) {
  let lib = null;
  try { lib = require('./prompt-security'); } catch { return { blocked: false, text }; }
  const result = new lib.PromptSecurityGuard(securityOptions).scan(text);
  if (!result.allowed) return { blocked: true, summary: result.summary, findings: result.findings };
  return { blocked: false, text: result.mode === 'redact' && result.findings.length ? result.redactedText : text };
}

// ── Config helpers ────────────────────────────────────────────────────────────

function getActiveProviderId() {
  try {
    const cfg = JSON.parse(fs.readFileSync(AI_PROVIDER_CONFIG, 'utf8'));
    return cfg.activeProvider || 'github-copilot';
  } catch {
    return 'github-copilot';
  }
}

/**
 * Returns the list of providers suitable for a UI dropdown.
 *
 * The first entry represents the user's configured default (value='').
 * The remaining entries are the explicit per-provider overrides, with the
 * active default filtered out to avoid duplication.
 *
 * @returns {{ activeId: string, activeName: string, providers: {id,name}[], api: object|null }}
 */
function listProviders() {
  const activeId   = getActiveProviderId();
  const activeP    = PROVIDER_MAP[activeId] || PROVIDERS[0];
  const api        = apiMode();
  const activeName = api ? `${api.label} API, then ${activeP.name}` : activeP.name;
  const providers  = PROVIDERS.filter(p => p.id !== activeId).map(({ id, name }) => ({ id, name }));
  return { activeId, activeName, providers, api: api && { provider: api.provider, model: api.model, label: api.label } };
}

// ── Invocation ────────────────────────────────────────────────────────────────

function askCli(prompt, provider) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = cp.spawn(provider.bin, provider.buildArgs(prompt), {
        env:   { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      return resolve({ ok: false, text: '', error: `Could not launch '${provider.bin}': ${e.message}`, via: 'cli', provider: provider.id });
    }

    let out = '', err = '';
    proc.stdout.on('data', d => { out += d; });
    proc.stderr.on('data', d => { err += d; });

    proc.on('close', code => {
      if (code !== 0) {
        // Some CLIs (e.g. claude) write their error message to stdout, not stderr
        const detail = err.trim() || out.trim().slice(0, 400) || `exit code ${code}`;
        return resolve({ ok: false, text: '', error: `${provider.bin} failed: ${detail}`, via: 'cli', provider: provider.id });
      }
      resolve({ ok: true, text: out.trim(), error: null, via: 'cli', provider: provider.id });
    });

    proc.on('error', e => {
      resolve({ ok: false, text: '', error: `Could not launch '${provider.bin}': ${e.message}`, via: 'cli', provider: provider.id });
    });
  });
}

/**
 * ask(prompt, opts) — invoke an AI provider and collect the full text response.
 *
 * @param {string} prompt
 * @param {{ providerId?: string, allowApi?: boolean, timeoutMs?: number, securityOptions?: object }} [opts]
 *   providerId      — use this CLI; null/undefined = use the default
 *   allowApi        — false keeps the call on the CLI even when API mode is on
 *   securityOptions — PromptSecurityGuard options (e.g. { mode: 'block' }); default is the user's policy
 * @returns {Promise<{ ok: boolean, text: string, error: string|null, via: 'cli'|'api', provider: string, apiFallback?: string }>}
 */
async function ask(prompt, opts = {}) {
  const resolvedId = opts.providerId || getActiveProviderId();
  const provider   = PROVIDER_MAP[resolvedId] || PROVIDER_MAP['github-copilot'];

  // Every prompt passes the prompt security guard before it reaches a CLI or an API.
  const scan = guardPrompt(String(prompt || ''), opts.securityOptions);
  if (scan.blocked) {
    return { ok: false, text: '', error: scan.summary, code: 'prompt_security_violation', findings: scan.findings, via: 'cli', provider: provider.id };
  }
  prompt = require('./engineering-writing').instructions + '\n\n' + scan.text;

  // API mode only applies when the caller did not pick a specific CLI.
  let apiFallback = null;
  if (!opts.providerId && opts.allowApi !== false && apiMode()) {
    const res = await loadLlm().complete(prompt, { timeoutMs: opts.timeoutMs });
    if (res.ok) return res;
    // A prompt blocked by the security policy must not be retried through a CLI.
    if (res.code === 'prompt_security_violation') return res;
    apiFallback = res.error;
    notifyApiFallback(res, provider.name);
  }

  const res = await askCli(prompt, provider);
  return apiFallback ? { ...res, apiFallback } : res;
}

module.exports = { listProviders, getActiveProviderId, ask, PROVIDERS, PROVIDER_MAP };
