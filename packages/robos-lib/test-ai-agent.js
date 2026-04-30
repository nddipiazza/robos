#!/usr/bin/env node
/**
 * Test harness for robos-lib/ai-agent.js
 *
 * Sends a real "test" prompt to every configured AI provider and asserts
 * that each one returns a non-empty text response.
 *
 * Run locally:  node packages/robos-lib/test-ai-agent.js
 * Run on VM:    node /usr/local/share/robos/robos-lib/test-ai-agent.js
 */
'use strict';

const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const cp      = require('child_process');
const aiAgent = require(path.join(__dirname, 'ai-agent'));

const CFG_FILE = path.join(os.homedir(), '.config', 'robos', 'ai-provider.json');
const PROMPT   = 'Respond with exactly one word: HELLO';

let passed = 0, failed = 0, skipped = 0;

function pass(label)         { console.log(`  ✅ PASS  ${label}`); passed++; }
function fail(label, detail) { console.error(`  ❌ FAIL  ${label}${detail ? ' — ' + detail : ''}`); failed++; }
function skip(label, reason) { console.warn(`  ⏭  SKIP  ${label} (${reason})`); skipped++; }
function assert(label, ok, detail = '') { ok ? pass(label) : fail(label, detail); }

// ── helpers ───────────────────────────────────────────────────────────────────

function setActiveProvider(id) {
  const dir = path.dirname(CFG_FILE);
  fs.mkdirSync(dir, { recursive: true });
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); } catch {}
  cfg.activeProvider = id;
  fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2));
}

/** Returns { installed, authenticated, reason } for a provider. */
function checkProviderAuth(id) {
  if (id === 'github-copilot') {
    try {
      // Use `which` to verify copilot is on PATH — don't use --version since the
      // native binary probe logs "Failed to start" even when the JS fallback works.
      cp.execSync('which copilot', { timeout: 5000 });
      return { installed: true, authenticated: true, reason: '' };
    } catch { return { installed: false, authenticated: false, reason: 'copilot not found on PATH' }; }
  }
  if (id === 'claude-code') {
    try {
      const r = cp.execSync('claude auth status 2>&1', { timeout: 8000 }).toString();
      const json = JSON.parse(r);
      if (!json.loggedIn) return { installed: true, authenticated: false, reason: 'not logged in — run: claude auth login' };
      // Check if OAuth token is expired
      const credFile = path.join(os.homedir(), '.claude', '.credentials.json');
      try {
        const creds = JSON.parse(fs.readFileSync(credFile, 'utf8'));
        const exp = creds?.claudeAiOauth?.expiresAt;
        if (exp && exp < Date.now()) return { installed: true, authenticated: false, reason: 'OAuth token expired — run: claude auth login' };
      } catch {}
      return { installed: true, authenticated: true, reason: '' };
    } catch { return { installed: false, authenticated: false, reason: 'claude not found' }; }
  }
  if (id === 'codex') {
    try {
      const r = cp.execSync('codex login status 2>&1', { timeout: 8000 }).toString();
      const authed = r.toLowerCase().includes('logged in');
      return { installed: true, authenticated: authed, reason: authed ? '' : 'not logged in — run: codex login' };
    } catch { return { installed: false, authenticated: false, reason: 'codex not found' }; }
  }
  return { installed: false, authenticated: false, reason: 'unknown provider' };
}

// ── Test 1: listProviders reflects ai-provider.json ──────────────────────────

console.log('\n[1] listProviders()');
setActiveProvider('github-copilot');
{
  const { activeId, activeName, providers } = aiAgent.listProviders();
  assert('activeId matches config',         activeId === 'github-copilot', activeId);
  assert('activeName is "GitHub Copilot"',  activeName === 'GitHub Copilot', activeName);
  assert('providers list excludes active',  providers.every(p => p.id !== 'github-copilot'));
  assert('providers list has claude-code',  providers.some(p => p.id === 'claude-code'));
  assert('providers list has codex',        providers.some(p => p.id === 'codex'));
}

setActiveProvider('claude-code');
{
  const { activeId, activeName } = aiAgent.listProviders();
  assert('activeId switches to claude-code', activeId === 'claude-code', activeId);
  assert('activeName is "Claude Code"',      activeName === 'Claude Code', activeName);
}

setActiveProvider('github-copilot');

// ── Tests 2–4: ask() sends prompt and receives a real response ────────────────

async function testProvider(id, name) {
  console.log(`\n[${name}] ask("${PROMPT}")`);
  const auth = checkProviderAuth(id);
  if (!auth.installed) { skip(`${name}: ask()`, `not installed`); skip(`${name}: response`, `not installed`); return; }
  if (!auth.authenticated) { skip(`${name}: ask()`, auth.reason); skip(`${name}: response`, auth.reason); return; }

  const result = await aiAgent.ask(PROMPT, { providerId: id });
  if (result.ok) {
    pass(`${name}: ok = true`);
    assert(`${name}: text is non-empty`, result.text && result.text.length > 0, JSON.stringify(result.text));
    console.log(`     response: ${result.text.slice(0, 120)}`);
  } else {
    fail(`${name}: ask()`, result.error);
  }
}

(async () => {
  await testProvider('github-copilot', 'GitHub Copilot');
  await testProvider('claude-code',    'Claude Code');
  await testProvider('codex',          'Codex');

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (skipped) console.log(`  ℹ  Skipped providers need authentication — re-run after logging in.`);
  if (failed > 0) process.exit(1);
})();
