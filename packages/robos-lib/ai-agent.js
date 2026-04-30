/**
 * robos-lib/ai-agent.js
 *
 * Shared AI agent invocation for all RobOS Electron apps.
 *
 * Reads ~/.config/robos/ai-provider.json to determine the active provider and
 * provides a uniform ask() API regardless of which CLI is underneath.
 *
 * Usage (in any Electron main.js):
 *
 *   const aiAgent = require('/usr/local/share/robos/robos-lib/ai-agent');
 *
 *   // List providers for a dropdown
 *   const { activeId, activeName, providers } = aiAgent.listProviders();
 *
 *   // Ask using the default (or a specific) provider
 *   const { ok, text, error } = await aiAgent.ask(prompt);
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
];

const PROVIDER_MAP = Object.fromEntries(PROVIDERS.map(p => [p.id, p]));

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
 * @returns {{ activeId: string, activeName: string, providers: {id,name}[] }}
 */
function listProviders() {
  const activeId   = getActiveProviderId();
  const activeP    = PROVIDER_MAP[activeId] || PROVIDERS[0];
  const activeName = activeP.name;
  const providers  = PROVIDERS.filter(p => p.id !== activeId);
  return { activeId, activeName, providers };
}

// ── Invocation ────────────────────────────────────────────────────────────────

/**
 * ask(prompt, opts) — invoke an AI provider and collect the full text response.
 *
 * @param {string} prompt
 * @param {{ providerId?: string }} [opts]
 *   providerId — override the active provider; null/undefined = use default
 * @returns {Promise<{ ok: boolean, text: string, error: string|null }>}
 */
function ask(prompt, opts = {}) {
  const resolvedId = opts.providerId || getActiveProviderId();
  const provider   = PROVIDER_MAP[resolvedId] || PROVIDER_MAP['github-copilot'];

  return new Promise((resolve) => {
    let proc;
    try {
      proc = cp.spawn(provider.bin, provider.buildArgs(prompt), {
        env:   { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      return resolve({ ok: false, text: '', error: `Could not launch '${provider.bin}': ${e.message}` });
    }

    let out = '', err = '';
    proc.stdout.on('data', d => { out += d; });
    proc.stderr.on('data', d => { err += d; });

    proc.on('close', code => {
      if (code !== 0) {
        // Some CLIs (e.g. claude) write their error message to stdout, not stderr
        const detail = err.trim() || out.trim().slice(0, 400) || `exit code ${code}`;
        return resolve({ ok: false, text: '', error: `${provider.bin} failed: ${detail}` });
      }
      resolve({ ok: true, text: out.trim(), error: null });
    });

    proc.on('error', e => {
      resolve({ ok: false, text: '', error: `Could not launch '${provider.bin}': ${e.message}` });
    });
  });
}

module.exports = { listProviders, getActiveProviderId, ask, PROVIDERS, PROVIDER_MAP };
