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

let SDLCKnowledgeGraphStore = null;
try {
  const mod = require('../robos-graph');
  SDLCKnowledgeGraphStore = mod.SDLCKnowledgeGraphStore;
} catch {
  try {
    const mod = require('/usr/local/share/robos/robos-graph');
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
    { id: 'github_accounts', label: 'GitHub accounts', fields: [] },
    {id:'code_review',label:'Code Review',fields:[{key:'default_code_reviewer_group',label:'Default code reviewer group',type:'select',options:[],default:''}]},
    {
      id: 'ai',
      label: 'AI Provider & Models',
      fields: [
        { key: 'ai_provider', label: 'Primary AI Provider', type: 'select', options: ['claude', 'openai', 'gemini', 'local'], default: 'claude' },
        { key: 'claude_api_key', label: 'Claude API Key', type: 'password', default: '' },
        { key: 'openai_api_key', label: 'OpenAI API Key', type: 'password', default: '' },
        { key: 'gemini_api_key', label: 'Google Gemini API Key', type: 'password', default: '' },
        { key: 'ai_model', label: 'Default AI Model', type: 'text', default: 'claude-sonnet-5' },
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
  win = new BrowserWindow({
    title: 'RobOS Preferences',
    width: 900,
    height: 620,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#0d1117',
    show: true,
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
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); win.webContents.send('show-github-accounts'); } });

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-schema', () => {const schema=JSON.parse(JSON.stringify(SETTINGS_SCHEMA));schema.sections.find(s=>s.id==='code_review').fields[0].options=[{value:'',label:'Choose a group…'},...require('../robos-lib/code-reviewer-group').groups().map(g=>({value:g.id,label:g.name+' ('+g.members+' members)'}))];return schema;});

ipcMain.handle('load-settings', () => loadSettings());

ipcMain.handle('save-settings', (_, data) => {
  if(Object.hasOwn(data,'default_code_reviewer_group'))require('../robos-lib/code-reviewer-group').validate(data.default_code_reviewer_group);
  const current = loadSettings();
  const merged = { ...current, ...data };
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
  if(key==='default_code_reviewer_group')require('../robos-lib/code-reviewer-group').validate(value);
  s[key] = value;
  saveSettings(s);
  return { ok: true };
});

module.exports = { loadSettings, saveSettings, SETTINGS_SCHEMA };

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
