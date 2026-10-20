/**
 * robos-llm — optional API mode for RobOS.
 *
 * RobOS normally drives the coding-agent CLIs the user has signed in to
 * (Claude Code, Codex, Gemini CLI / Antigravity, Copilot). This package adds
 * an opt-in second path: direct calls to Anthropic, OpenAI, Google Gemini or a
 * local Ollama server through LangChain.js, for quick one-shot requests and
 * embeddings. Agent tasks never come through here.
 *
 * Nothing here runs unless the user turns on "Use direct model APIs" in RobOS
 * Preferences. The LangChain packages are not installed with RobOS; Preferences
 * installs them into ~/.local/share/robos/llm-deps on request, and every call
 * reports `not_installed` until then so callers fall back to the CLI.
 *
 * Usage (main process):
 *   const llm = require('/usr/local/share/robos/robos-llm');
 *   if (llm.readConfig().enabled) {
 *     const { ok, text, error } = await llm.complete(prompt, { system });
 *   }
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
const credentials = require('./credentials');
const pkg = require('./package.json');

const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)', package: '@langchain/anthropic', chat: 'ChatAnthropic',
    defaultModel: 'claude-haiku-5-5', embeddings: null,
  },
  openai: {
    label: 'OpenAI', package: '@langchain/openai', chat: 'ChatOpenAI',
    defaultModel: 'gpt-5-mini', embeddings: 'OpenAIEmbeddings', defaultEmbeddingModel: 'text-embedding-3-small',
  },
  gemini: {
    label: 'Google Gemini', package: '@langchain/google-genai', chat: 'ChatGoogleGenerativeAI',
    defaultModel: 'gemini-2.5-flash', embeddings: 'GoogleGenerativeAIEmbeddings', defaultEmbeddingModel: 'gemini-embedding-001',
  },
  ollama: {
    label: 'Ollama (local)', package: '@langchain/ollama', chat: 'ChatOllama',
    defaultModel: 'llama3.2', embeddings: 'OllamaEmbeddings', defaultEmbeddingModel: 'nomic-embed-text',
    defaultBaseUrl: 'http://127.0.0.1:11434',
  },
};

class LlmError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ── Paths & settings ─────────────────────────────────────────────────────────

function homeDir() {
  return process.env.HOME || os.homedir();
}

function settingsFile() {
  return path.join(homeDir(), '.config', 'robos', 'settings.json');
}

function depsDir() {
  return process.env.ROBOS_LLM_DEPS_DIR || path.join(homeDir(), '.local', 'share', 'robos', 'llm-deps');
}

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}

/**
 * API mode settings from ~/.config/robos/settings.json (written by RobOS Preferences).
 * `enabled` is false unless the user turned it on.
 */
function readConfig(settings = loadSettings()) {
  const provider = PROVIDERS[settings.ai_api_provider] ? settings.ai_api_provider : 'anthropic';
  const embeddingsProvider = PROVIDERS[settings.ai_embeddings_provider] ? settings.ai_embeddings_provider : provider;
  return {
    enabled: settings.ai_api_enabled === true,
    provider,
    model: String(settings.ai_api_model || '').trim(),
    baseUrl: String(settings.ai_api_base_url || '').trim(),
    semanticSearch: settings.ai_api_enabled === true && settings.ai_semantic_search === true,
    embeddingsProvider,
    embeddingsModel: String(settings.ai_embeddings_model || '').trim(),
  };
}

// ── Optional packages ────────────────────────────────────────────────────────

function packagesFor(providers) {
  const groups = pkg.robos.optionalProviders;
  const out = { ...groups.core };
  for (const id of providers) Object.assign(out, groups[id] || {});
  return out;
}

function isInstalled(provider) {
  const names = Object.keys(packagesFor([provider]));
  return names.every(name => fs.existsSync(path.join(depsDir(), 'node_modules', name, 'package.json')));
}

// LangSmith tracing would send prompts to a hosted service; RobOS keeps it off.
function disableTracing() {
  process.env.LANGCHAIN_TRACING_V2 = 'false';
  process.env.LANGSMITH_TRACING = 'false';
  process.env.LANGCHAIN_TRACING = 'false';
}

function loadProviderModule(provider) {
  const spec = PROVIDERS[provider];
  if (!spec) throw new LlmError('unknown_provider', `Unknown API provider "${provider}".`);
  if (!isInstalled(provider)) {
    throw new LlmError('not_installed', `${spec.label} support is not installed. Open RobOS Preferences > AI and click "Install API packages".`);
  }
  disableTracing();
  return createRequire(path.join(depsDir(), 'package.json'))(spec.package);
}

/**
 * Installs the LangChain packages for the given providers into depsDir().
 * Runs npm without a shell; needs network access once.
 */
function installPackages(providers = Object.keys(PROVIDERS), { onLog } = {}) {
  const dir = depsDir();
  fs.mkdirSync(dir, { recursive: true });
  const manifest = path.join(dir, 'package.json');
  if (!fs.existsSync(manifest)) {
    fs.writeFileSync(manifest, JSON.stringify({ name: 'robos-llm-deps', private: true, description: 'Optional packages for RobOS API mode' }, null, 2));
  }
  const specs = Object.entries(packagesFor(providers)).map(([name, range]) => `${name}@${range}`);
  const args = ['install', '--no-audit', '--no-fund', '--omit=dev', '--save', ...specs];
  return new Promise(resolve => {
    let log = '';
    const add = chunk => { const s = chunk.toString(); log += s; if (onLog) onLog(s); };
    let child;
    try {
      child = spawn(process.env.ROBOS_NPM_BIN || 'npm', args, { cwd: dir, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return resolve({ ok: false, error: `Could not run npm: ${e.message}`, log });
    }
    child.stdout.on('data', add);
    child.stderr.on('data', add);
    child.on('error', e => resolve({ ok: false, error: `Could not run npm: ${e.message}`, log }));
    child.on('close', code => resolve(code === 0
      ? { ok: true, packages: specs, depsDir: dir, log }
      : { ok: false, error: `npm install exited with code ${code}`, log }));
  });
}

/** Everything Preferences needs to show the API mode panel. */
function status(settings) {
  const config = readConfig(settings);
  const providers = Object.fromEntries(Object.entries(PROVIDERS).map(([id, spec]) => [id, {
    label: spec.label,
    installed: isInstalled(id),
    keyConfigured: credentials.hasKey(id),
    needsKey: id !== 'ollama',
    defaultModel: spec.defaultModel,
    embeddings: !!spec.embeddings,
  }]));
  return { ...config, providers, depsDir: depsDir(), passReady: credentials.passReady(), node: process.versions.node };
}

// ── Prompt security ──────────────────────────────────────────────────────────

let promptSecurity;
function loadPromptSecurity() {
  if (promptSecurity !== undefined) return promptSecurity;
  promptSecurity = null;
  const candidates = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'prompt-security'),
    path.resolve(__dirname, '..', 'robos-lib', 'prompt-security'),
    '/usr/local/share/robos/robos-lib/prompt-security',
  ].filter(Boolean);
  for (const p of candidates) { try { promptSecurity = require(p); break; } catch {} }
  return promptSecurity;
}

/** Applies the user's prompt security policy before text leaves the machine. */
function guard(text, { forceRedact = false } = {}) {
  const lib = loadPromptSecurity();
  if (!lib) return text;
  const result = new lib.PromptSecurityGuard().scan(text, forceRedact ? { mode: 'redact' } : {});
  if (!result.allowed) throw new LlmError('prompt_security_violation', result.summary);
  if (result.findings.length && (forceRedact || result.mode === 'redact')) return result.redactedText;
  return text;
}

// ── Models ───────────────────────────────────────────────────────────────────

function requireKey(provider) {
  const key = credentials.readKey(provider);
  if (!key) {
    const source = credentials.KEY_SOURCES[provider];
    throw new LlmError('missing_key', `No ${PROVIDERS[provider].label} API key. Save one in RobOS Preferences > AI (stored in pass at ${source.passPath}) or set ${source.env[0]}.`);
  }
  return key;
}

function createChatModel(config = readConfig()) {
  const provider = config.provider;
  const spec = PROVIDERS[provider];
  const mod = loadProviderModule(provider);
  const model = config.model || spec.defaultModel;
  const Chat = mod[spec.chat];
  if (provider === 'ollama') return new Chat({ model, baseUrl: config.baseUrl || spec.defaultBaseUrl });
  const apiKey = requireKey(provider);
  if (provider === 'openai') {
    return new Chat({ model, apiKey, maxRetries: 1, ...(config.baseUrl ? { configuration: { baseURL: config.baseUrl } } : {}) });
  }
  return new Chat({ model, apiKey, maxRetries: 1 });
}

function createEmbeddings(config = readConfig()) {
  const provider = config.embeddingsProvider;
  const spec = PROVIDERS[provider];
  if (!spec) throw new LlmError('unknown_provider', `Unknown embeddings provider "${provider}".`);
  if (!spec.embeddings) {
    throw new LlmError('no_embeddings', `${spec.label} has no embeddings API. Choose OpenAI, Gemini or Ollama for semantic search in RobOS Preferences > AI.`);
  }
  const mod = loadProviderModule(provider);
  const model = config.embeddingsModel || spec.defaultEmbeddingModel;
  const Embeddings = mod[spec.embeddings];
  if (provider === 'ollama') return new Embeddings({ model, baseUrl: config.baseUrl || spec.defaultBaseUrl });
  const apiKey = requireKey(provider);
  if (provider === 'openai') {
    return new Embeddings({ model, apiKey, ...(config.baseUrl ? { configuration: { baseURL: config.baseUrl } } : {}) });
  }
  return new Embeddings({ model, apiKey });
}

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => (typeof part === 'string' ? part : part?.text || '')).join('');
  return '';
}

function describeError(e, config, provider) {
  if (provider === 'ollama' && /fetch failed|ECONNREFUSED/i.test(e.message)) {
    return `Could not reach Ollama at ${config.baseUrl || PROVIDERS.ollama.defaultBaseUrl}. Start it with "ollama serve".`;
  }
  return e.message;
}

function failure(e, config, extra) {
  return { ok: false, text: '', error: describeError(e, config, extra.provider), code: e.code || 'api_error', via: 'api', ...extra };
}

/**
 * One-shot text completion through the configured API provider.
 *
 * @param {string} prompt
 * @param {{ system?: string, config?: object, chatModel?: object, timeoutMs?: number }} [opts]
 *   config    — overrides readConfig() fields (provider, model, baseUrl)
 *   chatModel — a ready LangChain chat model (tests use FakeListChatModel)
 * @returns {Promise<{ ok, text, error, code?, provider, model, via: 'api' }>}
 */
async function complete(prompt, opts = {}) {
  const config = { ...readConfig(), ...(opts.config || {}) };
  const modelName = config.model || PROVIDERS[config.provider]?.defaultModel || '';
  const meta = { provider: config.provider, model: modelName };
  try {
    const human = guard(String(prompt || ''));
    const chatModel = opts.chatModel || createChatModel(config);
    const messages = opts.system ? [['system', guard(opts.system)], ['human', human]] : [['human', human]];
    const response = await chatModel.invoke(messages, { timeout: opts.timeoutMs || 120000 });
    const text = (typeof response?.text === 'string' && response.text) || contentToText(response?.content);
    return { ok: true, text: text.trim(), error: null, via: 'api', ...meta };
  } catch (e) {
    return failure(e, config, meta);
  }
}

/**
 * Embeds texts with the configured embeddings provider. Text is always
 * redacted by the prompt security guard first.
 *
 * @returns {Promise<{ ok, vectors, provider, model, error? }>}
 */
async function embed(texts, opts = {}) {
  const config = { ...readConfig(), ...(opts.config || {}) };
  const spec = PROVIDERS[config.embeddingsProvider];
  const meta = { provider: config.embeddingsProvider, model: config.embeddingsModel || spec?.defaultEmbeddingModel || '' };
  try {
    const embeddings = opts.embeddings || createEmbeddings(config);
    const vectors = await embeddings.embedDocuments(texts.map(t => guard(String(t || ''), { forceRedact: true })));
    return { ok: true, vectors, ...meta };
  } catch (e) {
    return { ok: false, vectors: [], error: describeError(e, config, meta.provider), code: e.code || 'api_error', ...meta };
  }
}

/** Opt-in semantic search over graph nodes; see semantic-search.js. */
function semanticSearch(opts) {
  return require('./semantic-search').semanticSearch({ llm: module.exports, ...opts });
}

module.exports = {
  PROVIDERS,
  LlmError,
  readConfig,
  status,
  depsDir,
  isInstalled,
  installPackages,
  createChatModel,
  createEmbeddings,
  complete,
  embed,
  semanticSearch,
  credentials,
};
