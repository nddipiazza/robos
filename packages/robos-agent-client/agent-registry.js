/**
 * Agent Registry — catalogue of supported AI agent CLI backends.
 *
 * MVP backends: Claude Code (`claude`) and GitHub Copilot CLI (`gh copilot`).
 */
'use strict';

const { execSync } = require('node:child_process');
const { ClaudeBackend } = require('./claude-backend');
const { CopilotBackend } = require('./copilot-backend');
const { AgentSession } = require('./agent-session');

// ── Backend catalogue ────────────────────────────────────────────────────────

const BACKENDS = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    command: 'claude',
    description: 'Anthropic Claude Code CLI — agentic coding assistant',
    BackendClass: ClaudeBackend,
  },
  copilot: {
    id: 'copilot',
    name: 'GitHub Copilot CLI',
    command: 'gh',
    description: 'GitHub Copilot CLI via the gh extension',
    BackendClass: CopilotBackend,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Check whether a CLI command is available on PATH.
 * @param {string} cmd
 * @returns {boolean}
 */
function isInstalled(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the list of known agent backends with install status.
 * @returns {Array<{id:string, name:string, command:string, description:string, installed:boolean}>}
 */
function listAgents() {
  return Object.values(BACKENDS).map((b) => ({
    id: b.id,
    name: b.name,
    command: b.command,
    description: b.description,
    installed: isInstalled(b.command),
  }));
}

/**
 * Detect which agent CLIs are installed.
 * @returns {Record<string, boolean>}
 */
function detectInstalled() {
  const result = {};
  for (const b of Object.values(BACKENDS)) {
    result[b.id] = isInstalled(b.command);
  }
  return result;
}

/**
 * Create an AgentSession for the given backend.
 *
 * @param {string} agentId — 'claude' or 'copilot'
 * @param {object} [opts]  — forwarded to AgentSession constructor
 * @returns {AgentSession}
 */
function createSession(agentId, opts = {}) {
  const entry = BACKENDS[agentId];
  if (!entry) throw new Error(`Unknown agent: ${agentId}`);
  const backend = new entry.BackendClass(opts);
  return new AgentSession({ agentId, backend, ...opts });
}

module.exports = { listAgents, detectInstalled, createSession, BACKENDS, isInstalled };
