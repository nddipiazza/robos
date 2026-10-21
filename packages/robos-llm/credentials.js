/**
 * API keys for the optional API mode.
 *
 * Keys live in the UNIX password store under robos/ai/<provider>-key (the same
 * entries the Setup Wizard writes). An environment variable is the only other
 * source. Keys are never written to settings.json.
 */
'use strict';

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const KEY_SOURCES = {
  anthropic: { passPath: 'robos/ai/anthropic-key', env: ['ANTHROPIC_API_KEY'] },
  openai: { passPath: 'robos/ai/openai-key', env: ['OPENAI_API_KEY'] },
  gemini: { passPath: 'robos/ai/gemini-key', env: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] },
};

function passStoreDir() {
  return process.env.PASSWORD_STORE_DIR || path.join(os.homedir(), '.password-store');
}

function passReady() {
  return fs.existsSync(path.join(passStoreDir(), '.gpg-id'));
}

/** True when a key exists for the provider, without decrypting it. Ollama needs none. */
function hasKey(provider) {
  const source = KEY_SOURCES[provider];
  if (!source) return provider === 'ollama';
  if (source.env.some(name => process.env[name])) return true;
  return fs.existsSync(path.join(passStoreDir(), source.passPath + '.gpg'));
}

/** Returns the key, or '' when none is configured. Ollama needs none. */
function readKey(provider) {
  const source = KEY_SOURCES[provider];
  if (!source) return '';
  for (const name of source.env) if (process.env[name]) return process.env[name];
  if (!fs.existsSync(path.join(passStoreDir(), source.passPath + '.gpg'))) return '';
  try {
    return execFileSync('pass', ['show', source.passPath], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).split('\n')[0].trim();
  } catch {
    return '';
  }
}

/** Saves the key with `pass insert`, passing it on stdin so it never appears in argv or a shell. */
function saveKey(provider, value) {
  const source = KEY_SOURCES[provider];
  if (!source) throw new Error(`No API key is used for provider "${provider}".`);
  const key = String(value || '').trim();
  if (!key) throw new Error('Enter a key first.');
  if (/\s/.test(key)) throw new Error('The key contains spaces or line breaks.');
  if (!passReady()) throw new Error('The password store is not set up. Run Security Setup first.');
  const result = spawnSync('pass', ['insert', '--multiline', '--force', source.passPath], { input: key + '\n', encoding: 'utf8', timeout: 15000 });
  if (result.error) throw new Error(`Could not run pass: ${result.error.message}`);
  if (result.status !== 0) throw new Error((result.stderr || '').trim() || 'pass insert failed.');
  return { ok: true, passPath: source.passPath };
}

module.exports = { KEY_SOURCES, passReady, hasKey, readKey, saveKey };
