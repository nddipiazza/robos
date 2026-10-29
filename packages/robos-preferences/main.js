let app, BrowserWindow, ipcMain;
try {
  ({ app, BrowserWindow, ipcMain } = require('electron'));
} catch (error) {
  if(process.versions.electron)throw error;
  app = {
    requestSingleInstanceLock: () => true,
    commandLine: { appendSwitch: () => {} },
    setName: () => {},
    whenReady: () => new Promise(() => {}),
    on: () => {},
    quit: () => {},
  };
  BrowserWindow = class {};
  ipcMain = { handle: () => {} };
}
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const HOME_DIR      = process.env.HOME || os.homedir();
const CONFIG_DIR    = path.join(HOME_DIR, '.config', 'robos');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');

// Debug server (optional)
let _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { _debugServer = require(p); break; } catch {}
  }
} catch {}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

function saveSettings(data) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Optional API mode (robos-llm). Preferences only shows its status and stores keys in pass.
let llm = null;
for (const p of [process.env.ROBOS_LLM_PATH, path.resolve(__dirname, '..', 'robos-llm'), '/usr/local/share/robos/robos-llm'].filter(Boolean)) {
  try { llm = require(p); break; } catch {}
}

// Older versions saved API keys as plain text in settings.json.
const PLAINTEXT_KEY_FIELDS = { claude_api_key: 'anthropic', openai_api_key: 'openai', gemini_api_key: 'gemini' };

/**
 * Moves plain-text API keys from settings into pass and removes them from
 * settings. Keys stay where they are if pass cannot store them.
 */
function migratePlaintextApiKeys(settings, saveKey) {
  const next = { ...settings };
  const migrated = [], kept = [];
  for (const [field, provider] of Object.entries(PLAINTEXT_KEY_FIELDS)) {
    if (!(field in next)) continue;
    if (!next[field]) { delete next[field]; continue; }
    try { saveKey(provider, next[field]); delete next[field]; migrated.push(provider); }
    catch { kept.push(provider); }
  }
  return { settings: next, migrated, kept };
}

function migrateSettingsFile() {
  if (!llm) return;
  const current = loadSettings();
  if (!Object.keys(PLAINTEXT_KEY_FIELDS).some(k => k in current)) return;
  const result = migratePlaintextApiKeys(current, llm.credentials.saveKey);
  if (result.migrated.length || Object.keys(result.settings).length !== Object.keys(current).length) saveSettings(result.settings);
}

let SDLCKnowledgeGraphStore = null;
try {
  const mod = require('../robos-graph/lib/graph-store');
  SDLCKnowledgeGraphStore = mod.SDLCKnowledgeGraphStore;
} catch {
  try {
    const mod = require('/usr/local/share/robos/robos-graph/lib/graph-store');
    SDLCKnowledgeGraphStore = mod.SDLCKnowledgeGraphStore;
  } catch {}
}

function syncSettingsToKGraph(settings) {
  if (!SDLCKnowledgeGraphStore) return;
  try {
    const store = new SDLCKnowledgeGraphStore();
    if (settings.enable_caveman !== undefined) {
      store.createPromptStrategy({
        slug: 'caveman-compression',
        title: 'Caveman Algorithmic Prompt Compression',
        strategyType: 'compression',
        engine: 'caveman',
        mode: settings.caveman_mode || 'standard',
        enabled: Boolean(settings.enable_caveman),
        targetTiers: settings.caveman_target_tiers === 'tier1' ? ['tier1'] : settings.caveman_target_tiers === 'tier1_and_tier2' ? ['tier1', 'tier2'] : ['tier1', 'tier2', 'tier3'],
        parameters: {
          stripFillers: true,
          terseDirectives: true,
          preserveCodeBlocks: true,
          preservePaths: true,
        },
      });
    }
    if (settings.enable_dspy !== undefined) {
      store.createPromptOptimizer({
        slug: 'dspy-teleprompter',
        title: 'Stanford DSPy Teleprompter Optimizer',
        strategyType: 'teleprompter-optimization',
        engine: 'dspy',
        teleprompter: settings.dspy_optimizer || 'MIPROv2',
        metric: settings.dspy_metric || 'shacl_validation',
        enabled: Boolean(settings.enable_dspy),
        targetTiers: ['tier2', 'tier3'],
        parameters: {
          teleprompter: settings.dspy_optimizer || 'MIPROv2',
          metric: settings.dspy_metric || 'shacl_validation',
          autoCompileOnSave: Boolean(settings.dspy_compile_on_save),
        },
      });
    }
  } catch (err) {
    // Non-blocking KGraph sync
  }
}

// Settings schema with defaults and sections
const SETTINGS_SCHEMA = {
  sections: [
    { id: 'config_sync', label: 'Config Sync & Sharing', fields: [] },
    { id: 'cloud_accounts', label: 'Cloud Suite Accounts', fields: [] },
    { id: 'github_accounts', label: 'GitHub accounts', fields: [] },
    { id: 'ovpn_accounts', label: 'OpenVPN & VPN Accounts', fields: [] },
    {id:'code_review',label:'Code Review',fields:[{key:'default_code_reviewer_group',label:'Default code reviewer group',type:'select',options:[],default:''}]},
    {
      id: 'ai',
      label: 'AI Agents & API Mode',
      description: 'RobOS runs the coding-agent CLIs you install and sign in to: Claude Code, Codex, Gemini CLI / Antigravity or GitHub Copilot. Choose the default one in RobOS Agents. API mode is optional and off by default. When it is on, quick one-shot requests (drafts, summaries, Graph Copilot) go straight to a model API, and fall back to your CLI if the call fails. Agent tasks always use the CLI.',
      fields: [
        { key: 'ai_api_enabled', label: 'Use direct model APIs for quick requests (optional)', type: 'checkbox', default: false },
        { key: 'ai_api_provider', label: 'API provider', type: 'select', options: [
          { value: 'anthropic', label: 'Anthropic (Claude)' },
          { value: 'openai', label: 'OpenAI' },
          { value: 'gemini', label: 'Google Gemini' },
          { value: 'ollama', label: 'Ollama (local, no key)' },
        ], default: 'anthropic' },
        { key: 'ai_api_model', label: 'API model (blank for the provider default)', type: 'text', default: '' },
        { key: 'ai_api_base_url', label: 'Server URL for Ollama or an OpenAI-compatible endpoint (blank for the default)', type: 'text', default: '' },
        { key: 'ai_key_anthropic', provider: 'anthropic', label: 'Anthropic API key (saved in pass)', type: 'secret' },
        { key: 'ai_key_openai', provider: 'openai', label: 'OpenAI API key (saved in pass)', type: 'secret' },
        { key: 'ai_key_gemini', provider: 'gemini', label: 'Google Gemini API key (saved in pass)', type: 'secret' },
        { key: 'ai_semantic_search', label: 'Semantic Knowledge Graph search with embeddings (needs API mode)', type: 'checkbox', default: false },
        { key: 'ai_embeddings_provider', label: 'Embeddings provider', type: 'select', options: [
          { value: '', label: 'Same as API provider' },
          { value: 'openai', label: 'OpenAI' },
          { value: 'gemini', label: 'Google Gemini' },
          { value: 'ollama', label: 'Ollama (local, no key)' },
        ], default: '' },
        { key: 'ai_embeddings_model', label: 'Embeddings model (blank for the provider default)', type: 'text', default: '' },
      ],
    },
    {
      id: 'agent_tiers',
      label: 'Agent Tiers & Prompt Optimization',
      fields: [
        { key: 'tier1_model', label: 'Tier 1 Model (Fast Utility & Local)', type: 'text', default: 'claude-haiku-4-5' },
        { key: 'tier2_model', label: 'Tier 2 Model (Workhorse Implementation)', type: 'text', default: 'claude-sonnet-5' },
        { key: 'tier3_model', label: 'Tier 3 Model (Frontier Deep Reasoning)', type: 'text', default: 'o3' },
        { key: 'enable_caveman', label: 'Enable Caveman Prompt Compression', type: 'checkbox', default: true },
        { key: 'caveman_mode', label: 'Caveman Compression Mode', type: 'select', options: ['standard', 'aggressive', 'extreme'], default: 'standard' },
        { key: 'caveman_target_tiers', label: 'Caveman Target Tiers', type: 'select', options: ['tier1', 'tier1_and_tier2', 'all_tiers'], default: 'tier1_and_tier2' },
        { key: 'enable_dspy', label: 'Enable Stanford DSPy Teleprompter Optimization', type: 'checkbox', default: true },
        { key: 'dspy_optimizer', label: 'DSPy Teleprompter Optimizer', type: 'select', options: ['MIPROv2', 'BootstrapFewShot', 'COPRO', 'LabeledFewShot'], default: 'MIPROv2' },
        { key: 'dspy_metric', label: 'DSPy Optimization Metric', type: 'select', options: ['shacl_validation', 'unit_tests_pass', 'ast_syntax_check', 'exact_match'], default: 'shacl_validation' },
        { key: 'dspy_compile_on_save', label: 'Auto-compile DSPy Prompts on Save', type: 'checkbox', default: false },
      ],
    },
    {
      id: 'prompt_security',
      label: 'Prompt Security & Guardrails',
      fields: [
        { key: 'prompt_security_mode', label: 'Security Policy Mode', type: 'select', options: ['redact', 'block', 'warn', 'audit-only', 'off'], default: 'redact' },
        { key: 'prompt_security_scan_secrets', label: 'Scan Secrets & Credentials (Gitleaks / TruffleHog rules)', type: 'checkbox', default: true },
        { key: 'prompt_security_scan_pii', label: 'Scan PII & Financial Data (Presidio / Luhn rules)', type: 'checkbox', default: true },
        { key: 'prompt_security_scan_injection', label: 'Scan Prompt Injection & System Overrides (OWASP LLM01)', type: 'checkbox', default: true },
        { key: 'prompt_security_entropy_check', label: 'High-Entropy Secret Detection (Shannon Entropy)', type: 'checkbox', default: true },
        { key: 'prompt_security_entropy_threshold', label: 'Entropy Threshold (bits/char)', type: 'text', default: '4.5' },
        { key: 'prompt_security_allowlist', label: 'Custom Allowlist (comma-separated tokens)', type: 'text', default: 'example.com,localhost,127.0.0.1' },
        { key: 'prompt_security_blocklist', label: 'Custom Forbidden Terms (comma-separated keywords)', type: 'text', default: '' },
      ],
    },
    {
      id: 'github',
      label: 'GitHub & Repos',
      fields: [
        { key: 'github_token', label: 'GitHub Personal Token', type: 'password', default: '' },
        { key: 'github_api_url', label: 'GitHub API URL', type: 'text', default: 'https://api.github.com' },
        { key: 'use_gh_cli', label: 'Use gh CLI for auth', type: 'checkbox', default: true },
      ],
    },
    {
      id: 'ide',
      label: 'IDE & Workspaces',
      fields: [
        { key: 'default_ide', label: 'Default IDE', type: 'select', options: ['intellij', 'vscode', 'cursor', 'neovim'], default: 'intellij' },
        { key: 'ide_path', label: 'IDE Install Path', type: 'text', default: '' },
        { key: 'auto_launch_workspace', label: 'Auto-launch workspace on task start', type: 'checkbox', default: true },
      ],
    },
    {
      id: 'notifications',
      label: 'Notifications & Sounds',
      fields: [
        { key: 'toast_enabled', label: 'Enable toast notifications', type: 'checkbox', default: true },
        { key: 'notification_sound', label: 'Enable notification sounds', type: 'checkbox', default: true },
        { key: 'dnd_default', label: 'Default Do-Not-Disturb on boot', type: 'checkbox', default: false },
      ],
    },
    {
      id: 'journal',
      label: 'Work Journal & Knowledge Graph',
      fields: [
        { key: 'journal_repo', label: 'Journal Git Repository', type: 'text', default: '' },
        { key: 'knowledge_graph_branch', label: 'Knowledge Graph Default Branch', type: 'text', default: 'main' },
        { key: 'journal_auto_commit', label: 'Auto-commit journal entries', type: 'checkbox', default: true },
      ],
    },
    {
      id: 'system',
      label: 'System & Theme',
      fields: [
        { key: 'theme', label: 'Desktop Theme', type: 'select', options: ['dark', 'light'], default: 'dark' },
        { key: 'auto_update', label: 'Auto-update RobOS apps', type: 'checkbox', default: true },
      ],
    },
  ],
};

app.setPath?.('userData', path.join(CONFIG_DIR, 'electron', 'robos-preferences'));

// Single-instance lock (bypassed in test mode)
if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); process.exit(0); }
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let win = null;
app.setName('robos-preferences');

app.whenReady().then(() => {
  try { migrateSettingsFile(); } catch {}
  win = new BrowserWindow({
    title: 'RobOS Preferences',
    width: 1180,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#0d1117',
    show: true,
    icon: fs.existsSync(path.join(__dirname, 'icon.png')) ? path.join(__dirname, 'icon.png') : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  if (_debugServer) _debugServer.startDebugServer(win, 19116);
});

app.on('window-all-closed', () => app.quit());
app.on('second-instance', () => {
  if (win && !win.isDestroyed?.()) {
    if (win.isMinimized?.()) win.restore();
    win.show();
    win.focus();
    // A notification that opened Preferences at a place (open-request) wins over the default.
    if (hasOpenRequest()) win.webContents?.send('open-request');
    else win.webContents?.send('show-github-accounts');
  }
});

// ── Open requests (robos-lib/open-request): "open Config Sync → Backup vault" ──
function openRequestLib() {
  for (const p of [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'open-request'),
    path.resolve(__dirname, '..', 'robos-lib', 'open-request'),
    '/usr/local/share/robos/robos-lib/open-request',
  ].filter(Boolean)) {
    try { return require(p); } catch {}
  }
  return null;
}
function hasOpenRequest() { return fs.existsSync(path.join(CONFIG_DIR, 'open-requests', 'robos-preferences.json')); }
ipcMain.handle('take-open-request', () => openRequestLib()?.takeOpenRequest('robos-preferences') || null);

// ── IPC Handlers ─────────────────────────────────────────────────────────────

// robos-lib/code-reviewer-group is optional: without it the reviewer group list is empty and nothing is validated.
function reviewerGroups() { try { return require('../robos-lib/code-reviewer-group'); } catch { return null; } }

ipcMain.handle('get-schema', () => {const schema=JSON.parse(JSON.stringify(SETTINGS_SCHEMA));const groups=reviewerGroups();schema.sections.find(s=>s.id==='code_review').fields[0].options=[{value:'',label:'Choose a group…'},...(groups?groups.groups():[]).map(g=>({value:g.id,label:g.name+' ('+g.members+' members)'}))];return schema;});

ipcMain.handle('load-settings', () => loadSettings());

ipcMain.handle('save-settings', (_, data) => {
  if(Object.hasOwn(data,'default_code_reviewer_group'))reviewerGroups()?.validate(data.default_code_reviewer_group);
  const current = loadSettings();
  const merged = { ...current, ...data };
  // API keys belong in pass, never in settings.json.
  for (const field of Object.keys(PLAINTEXT_KEY_FIELDS)) if (Object.hasOwn(data, field)) delete merged[field];
  saveSettings(merged);
  syncSettingsToKGraph(merged);
  return { ok: true, settings: merged };
});

ipcMain.handle('get-setting', (_, key) => {
  const s = loadSettings();
  return s[key] !== undefined ? s[key] : null;
});

ipcMain.handle('set-setting', (_, key, value) => {
  const s = loadSettings();
  if(key==='default_code_reviewer_group')reviewerGroups()?.validate(value);
  s[key] = value;
  saveSettings(s);
  return { ok: true };
});

// ── Optional API mode ────────────────────────────────────────────────────────

ipcMain.handle('ai-api-status', () => {
  if (!llm) return { ok: false, error: 'API mode support (robos-llm) is not deployed on this machine.' };
  return { ok: true, ...llm.status(loadSettings()) };
});

ipcMain.handle('ai-api-save-key', (_, provider, value) => {
  try {
    if (!llm) throw new Error('API mode support (robos-llm) is not deployed on this machine.');
    return llm.credentials.saveKey(provider, value);
  } catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle('ai-api-install', async (_, providers) => {
  if (!llm) return { ok: false, error: 'API mode support (robos-llm) is not deployed on this machine.' };
  const wanted = (Array.isArray(providers) ? providers : []).filter(p => llm.PROVIDERS[p]);
  const result = await llm.installPackages(wanted.length ? wanted : Object.keys(llm.PROVIDERS));
  return { ok: result.ok, error: result.error, packages: result.packages, log: (result.log || '').slice(-2000) };
});

module.exports = { loadSettings, saveSettings, SETTINGS_SCHEMA, migratePlaintextApiKeys };

// Account selectors use the existing GitHub CLI credential store, never renderer tokens.
ipcMain.handle('github-accounts-list', async () => {
  try { return { ok: true, ...await require('../robos-lib/github-accounts').list() }; }
  catch (error) { return { ok: false, error: error.message }; }
});
ipcMain.handle('github-accounts-save', async (_, selection) => {
  try {
    const result = await require('../robos-lib/github-accounts').save(selection, async env => {
      const status = await require('../agents-manager/copilot-auth').rpc(['auth.getStatus', 'models.list'], { env });
      if (!status['auth.getStatus'].isAuthenticated || status['auth.getStatus'].login?.toLowerCase() !== selection.copilot.toLowerCase() || !status['models.list'].models?.length)
        throw Error('The selected account could not access Copilot. Choose an account with Copilot access.');
    });
    return { ok: true, ...result };
  } catch (error) { return { ok: false, error: error.message }; }
});
ipcMain.handle('github-accounts-add', async () => {
  try {
    return await new Promise((resolve, reject) => {
      const child = require('node:child_process').spawn('x-terminal-emulator', ['-e', 'bash', '-lc',
        'node "$1"; read -r -p "Press Enter to close..."', 'github-login', path.join(__dirname, '../robos-lib/add-github-account.js')],
        { detached: true, stdio: 'ignore', env: { ...process.env } });
      child.on('error', reject); child.on('spawn', () => { child.unref(); resolve({ ok: true }); });
    });
  } catch (error) { return { ok: false, error: error.message }; }
});

// ── OpenVPN Providers & Accounts (IPVanish + Custom OVPN) ────────────────────
function ovpnProviders() {
  for (const p of [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'ovpn-providers'),
    path.resolve(__dirname, '..', 'robos-lib', 'ovpn-providers'),
    '/usr/local/share/robos/robos-lib/ovpn-providers',
  ].filter(Boolean)) {
    try { return require(p); } catch {}
  }
  throw new Error('ovpn-providers library is not available.');
}

ipcMain.handle('ovpn-accounts-list', async () => {
  try { return { ok: true, ...ovpnProviders().listAccounts() }; }
  catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle('ovpn-accounts-save', async (_, accountInput) => {
  try { return { ok: true, ...ovpnProviders().saveAccount(accountInput) }; }
  catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle('ovpn-accounts-delete', async (_, accountId) => {
  try { return { ok: true, ...ovpnProviders().deleteAccount(accountId) }; }
  catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle('ovpn-accounts-set-default', async (_, accountId) => {
  try { return { ok: true, ...ovpnProviders().setDefaultAccount(accountId) }; }
  catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle('ovpn-providers-add', async (_, providerInput) => {
  try {
    const provider = ovpnProviders().addCustomProvider(providerInput);
    return { ok: true, provider, ...ovpnProviders().listAccounts() };
  } catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle('ovpn-profiles-sync', async (_, providerId) => {
  try { return await ovpnProviders().syncProviderProfiles(providerId || 'ipvanish'); }
  catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle('ovpn-accounts-test', async (_, payload) => {
  try { return await ovpnProviders().testAccountConnection(payload || {}); }
  catch (error) { return { ok: false, error: error.message }; }
});

// ── Unified Cloud Suite Accounts (Google, Microsoft, Nextcloud, Dropbox, S3) ─
function cloudAccountsLib() {
  for (const p of [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'cloud-accounts'),
    path.resolve(__dirname, '..', 'robos-lib', 'cloud-accounts'),
    '/usr/local/share/robos/robos-lib/cloud-accounts',
  ].filter(Boolean)) {
    try { return require(p); } catch {}
  }
  throw new Error('cloud-accounts library is not available.');
}

// ── Config Sync & Sharing (robos-lib/config-sync) ───────────────────────────
function configSyncLib() {
  for (const p of [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'config-sync'),
    path.resolve(__dirname, '..', 'robos-lib', 'config-sync'),
    '/usr/local/share/robos/robos-lib/config-sync',
  ].filter(Boolean)) {
    try { return require(p); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  }
  throw new Error('config-sync library is not available.');
}

function configSyncAutoLib() {
  for (const p of [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'config-sync-auto'),
    path.resolve(__dirname, '..', 'robos-lib', 'config-sync-auto'),
    '/usr/local/share/robos/robos-lib/config-sync-auto',
  ].filter(Boolean)) {
    try { return require(p); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  }
  return null;
}

// Errors keep their code (CONFLICTS, PASSPHRASE_REQUIRED, WRONG_KIND, ...) so the page can react.
const CONFIG_SYNC_CALLS = [
  'getStatus', 'connectVault', 'disconnectVault', 'setVaultCategories', 'setAutoSync', 'planVaultSync', 'applyVaultSync',
  'previewShare', 'publishShare', 'updateShare', 'grantShare', 'forgetShare',
  'previewJoin', 'joinShare', 'checkSubscriptions', 'updateSubscription', 'leaveShare',
  'listRestorePoints', 'restoreRestorePoint',
];
for (const name of CONFIG_SYNC_CALLS) {
  ipcMain.handle(`config-sync:${name}`, async (_, opts) => {
    try {
      const result = await configSyncLib()[name](opts || {});
      // A sync from here settles what background sync was waiting on ("Config Sync needs you").
      if (name === 'applyVaultSync') { try { configSyncAutoLib()?.clearAttention({}); } catch {} }
      return Array.isArray(result) ? { ok: true, items: result } : result;
    } catch (error) {
      return { ok: false, error: error.message, code: error.code || null, conflicts: error.conflicts || null };
    }
  });
}

function thunderbirdGoogleLib() {
  for (const p of [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'thunderbird-google'),
    path.resolve(__dirname, '..', 'robos-lib', 'thunderbird-google'),
    '/usr/local/share/robos/robos-lib/thunderbird-google',
  ].filter(Boolean)) {
    try { return require(p); } catch {}
  }
  throw new Error('thunderbird-google library is not available.');
}

ipcMain.handle('cloud-accounts-list', async () => {
  try { return { ok: true, ...cloudAccountsLib().listAccounts() }; }
  catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle('cloud-accounts-save', async (_, accountInput) => {
  try { return { ok: true, ...cloudAccountsLib().saveAccount(accountInput) }; }
  catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle('cloud-accounts-delete', async (_, accountId) => {
  try { return { ok: true, ...cloudAccountsLib().deleteAccount(accountId) }; }
  catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle('cloud-accounts-sign-out', async (_, accountId) => {
  try { return { ok: true, ...cloudAccountsLib().signOutAccount(accountId) }; }
  catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle('cloud-accounts-set-default', async (_, accountId) => {
  try { return { ok: true, ...cloudAccountsLib().setDefaultAccount(accountId) }; }
  catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle('cloud-accounts-verify', async (_, accountId) => {
  try { return await cloudAccountsLib().verifyCloudAccount(accountId); }
  catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle('cloud-accounts-oauth-google', async (_, params) => {
  try { return await cloudAccountsLib().startGoogleBrowserOAuth(params || {}); }
  catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle('cloud-accounts-configure-thunderbird', async (_, payload) => {
  try {
    const { accountId, enableCalendar, enableContacts, enableMail } = payload || {};
    return thunderbirdGoogleLib().configureThunderbirdForGoogleAccount(accountId, {
      enableCalendar,
      enableContacts,
      enableMail,
    });
  } catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle('launch-robos-app', async (_, appId) => {
  try {
    const { spawn } = require('node:child_process');
    const wrapperCandidates = [
      path.join(HOME_DIR, '.local', 'bin', `robos-${appId}`),
      path.join(HOME_DIR, '.local', 'bin', appId),
    ];
    const wrapper = wrapperCandidates.find(w => fs.existsSync(w));
    if (wrapper) {
      const child = spawn(wrapper, [], { detached: true, stdio: 'ignore', env: { ...process.env } });
      child.unref();
      return { ok: true, appId };
    }
    const candidates = [
      path.resolve(__dirname, '..', appId, 'main.js'),
      `/usr/local/share/robos/${appId}/main.js`,
    ];
    const mainJs = candidates.find(c => fs.existsSync(c));
    if (!mainJs) throw new Error(`App "${appId}" is not installed.`);
    const electronBin = process.execPath || '/usr/bin/electron';
    const child = spawn(electronBin, [mainJs, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();
    return { ok: true, appId };
  } catch (error) { return { ok: false, error: error.message }; }
});
