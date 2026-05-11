'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

app.setName('robos-ai-prompt');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'ai-prompt'));
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// ── Shared libraries ──────────────────────────────────────────────────────────
let aiJson = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'ai-json'),
    path.resolve(__dirname, '..', 'robos-lib', 'ai-json'),
    '/usr/local/share/robos/robos-lib/ai-json',
  ].filter(Boolean);
  for (const p of libPaths) { try { aiJson = require(p); break; } catch {} }
} catch {}

let _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) { try { _debugServer = require(p); break; } catch {} }
} catch {}

let log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'logger'),
    path.resolve(__dirname, '..', 'robos-lib', 'logger'),
    '/usr/local/share/robos/robos-lib/logger',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { const m = require(p); log = m.createLogger('ai-prompt'); m.registerLogsIPC && m.registerLogsIPC(ipcMain); break; } catch {}
  }
} catch {}

const JSON_RULES_PROMPT = aiJson ? aiJson.JSON_RULES_PROMPT :
  'CRITICAL JSON RULES: Return ONLY a JSON object. No markdown, no prose, no code fences. Start with { and end with }.';

// ── Skills store ──────────────────────────────────────────────────────────────
const SKILLS_FILE = path.join(os.homedir(), '.config', 'robos', 'skills.json');
const HISTORY_FILE = path.join(os.homedir(), '.config', 'robos', 'ai-prompt-history.json');

function readSkillsFromDisk() {
  try {
    const data = JSON.parse(fs.readFileSync(SKILLS_FILE, 'utf8'));
    return data.custom || [];
  } catch { return []; }
}

function readHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); }
  catch { return []; }
}

function saveHistory(history) {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Keep last 50 entries
  const trimmed = history.slice(-50);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
}

// ── App window ────────────────────────────────────────────────────────────────
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 800,
    minWidth: 720, minHeight: 560,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
    title: 'RobOS AI Prompt',
    autoHideMenuBar: true,
  });
  mainWindow.loadFile('renderer/index.html');
  if (_debugServer) {
    _debugServer.registerSnapshotIPC && _debugServer.registerSnapshotIPC(mainWindow);
    _debugServer.startDebugServer(mainWindow, 19140, 'ai-prompt');
  }
}

app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── IPC ───────────────────────────────────────────────────────────────────────

// Load shared BUILTIN_SKILLS from skills-data.js (co-located in skills-manager)
let _builtinSkills = [];
try {
  const dataPaths = [
    path.resolve(__dirname, '..', 'skills-manager', 'skills-data.js'),
    '/usr/local/share/robos/skills-manager/skills-data.js',
  ];
  for (const p of dataPaths) {
    if (fs.existsSync(p)) { _builtinSkills = require(p).BUILTIN_SKILLS; break; }
  }
} catch {}

ipcMain.handle('ap-list-skills', () => {
  try {
    const custom = readSkillsFromDisk();
    return { ok: true, builtin: _builtinSkills, custom };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('ap-history-list', () => {
  try { return { ok: true, history: readHistory() }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// ── Agent auth check ──────────────────────────────────────────────────────────
ipcMain.handle('robos-check-agent-auth', async (_, agentId) => {
  try {
    if (agentId === 'copilot') {
      // Check Copilot auth: try copilot-specific config first, then gh auth status
      const copilotCfg = path.join(os.homedir(), '.config', 'github-copilot', 'config.json');
      if (fs.existsSync(copilotCfg)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(copilotCfg, 'utf8'));
          if (cfg && Object.keys(cfg).length > 0) return { ok: true };
        } catch {}
      }
      // Fall back to gh auth status
      const { code } = await new Promise((res) => {
        const child = cp.spawn('gh', ['auth', 'status'], { stdio: ['ignore', 'pipe', 'pipe'] });
        child.on('close', code => res({ code }));
      });
      return { ok: code === 0 };
    } else {
      // Claude: spawn with an empty prompt and check is_error
      const text = await new Promise((resolve, reject) => {
        const child = cp.spawn('claude', ['--print', '--output-format', 'json'], {
          stdio: ['pipe', 'pipe', 'pipe']
        });
        child.stdin.write('ping');
        child.stdin.end();
        let out = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { out += d; });
        child.on('close', () => resolve(out));
      });
      try {
        const parsed = JSON.parse(text.trim());
        return { ok: !parsed.is_error };
      } catch {
        return { ok: false };
      }
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('ap-open-login-terminal', (_, cmd) => {
  // Open a terminal window with the login command pre-filled
  const safeCmd = (cmd || 'claude /login').replace(/[;&|`$()]/g, '');
  cp.spawn('x-terminal-emulator', ['-e', `bash -c "${safeCmd}; read -p 'Press Enter to close…'"`], {
    stdio: 'ignore', detached: true
  }).unref();
});

ipcMain.handle('ap-run-prompt', async (_, { prompt, skillHints, model, agent }) => {
  if (!prompt || !prompt.trim()) return { ok: false, error: 'Empty prompt' };

  const selectedAgent = agent || 'claude';

  const skillContext = skillHints && skillHints.length
    ? `\n\nAvailable skills/tools to use:\n${skillHints.map(s => `- ${s.name}: \`${s.command}\``).join('\n')}`
    : '';

  const systemPrompt = `You are RobOS AI Prompt — an AI assistant that helps developers perform operating system and development tasks on a Linux desktop.

The user has asked you to perform the following task:
"${prompt.trim()}"
${skillContext}

Please perform this task and return a structured JSON result describing exactly what you did. Use this exact JSON schema:
{
  "summary": "One sentence summary of what was accomplished",
  "success": true,
  "steps": [
    {
      "action": "Description of this step",
      "command": "the shell command that was run (if any)",
      "output": "the command output or result",
      "note": "optional clarifying note"
    }
  ],
  "result": "Final outcome in 1-2 sentences"
}

Guidelines:
- Actually run commands using your shell tool if needed
- Include all commands you run in the steps array
- Be specific and accurate — include real output
- If a command fails, set success to false and explain in the result field
- Keep step notes brief and useful

${JSON_RULES_PROMPT}

Return ONLY the JSON object. No markdown code fences, no extra text.`;

  try {
    const text = await new Promise((resolve, reject) => {
      let child;
      if (selectedAgent === 'copilot') {
        const spawnOpts = { stdio: ['ignore', 'pipe', 'pipe'] };
        child = cp.spawn('gh', ['copilot', '--', '-p', systemPrompt, '--allow-all-tools', '--silent'], spawnOpts);
      } else {
        // Claude CLI: pass prompt via stdin (write + end = immediate EOF, no wait)
        child = cp.spawn('claude', ['--print', '--output-format', 'json'].concat(model ? ['--model', model] : []), {
          stdio: ['pipe', 'pipe', 'pipe']
        });
        child.stdin.write(systemPrompt);
        child.stdin.end();
      }
      let stdout = '', stderr = '';
      child.stdout.on('data', d => { stdout += d; });
      child.stderr.on('data', d => { stderr += d; });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Timed out after 5 minutes')); }, 300000);
      child.on('close', code => {
        clearTimeout(timer);
        if (code !== 0 && !stdout) reject(new Error(stderr || 'AI agent failed'));
        else resolve(stdout);
      });
    });

    let parsed;
    // For claude CLI with --output-format json, response is wrapped:
    // { "type": "result", "result": "<AI text>", "is_error": bool, ... }
    let aiText = text;
    if (selectedAgent !== 'copilot') {
      let outer = null;
      try { outer = JSON.parse(text.trim()); } catch { /* raw text fallback */ }
      if (outer) {
        if (outer.is_error) throw new Error(outer.result || 'Claude CLI error');
        if (typeof outer.result === 'string') aiText = outer.result;
      }
    }

    // Try to parse as structured JSON
    let parseError = null;
    if (aiJson) {
      const r = aiJson.parseAIJson(aiText);
      if (r.ok) parsed = r.data;
      else parseError = r.error;
    } else {
      const match = aiText.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch (e) { parseError = e.message; }
      } else {
        parseError = 'No JSON in response';
      }
    }

    // If AI returned plain text instead of JSON, wrap it in our schema
    if (!parsed || typeof parsed !== 'object' || !parsed.summary) {
      if (aiText && aiText.trim()) {
        parsed = {
          summary: aiText.slice(0, 120),
          success: true,
          steps: [],
          result: aiText,
        };
      } else {
        throw new Error(parseError || 'Empty AI response');
      }
    }

    // Persist to history
    const history = readHistory();
    const entry = {
      id: `h-${Date.now()}`,
      ts: new Date().toISOString(),
      prompt: prompt.trim(),
      result: parsed,
    };
    history.push(entry);
    saveHistory(history);

    log.info('prompt-executed', `AI prompt executed: ${parsed.summary}`, {
      success: parsed.success,
      steps: (parsed.steps || []).length,
    });

    return { ok: true, result: parsed, historyId: entry.id };
  } catch (e) {
    log.error('prompt-error', `AI prompt failed: ${e.message}`);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('ap-history-clear', () => {
  try { saveHistory([]); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('ap-open-skills-manager', () => {
  try {
    const appBase = '/usr/local/share/robos/skills-manager';
    const electronBin = path.join(appBase, 'node_modules/electron/dist/electron');
    cp.spawn(electronBin, [appBase, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── ap-list-path: @-mention file typeahead for robos-ai-textarea ──────────────
ipcMain.handle('ap-list-path', (_, prefix) => {
  try {
    const home     = os.homedir();
    const expanded = prefix.replace(/^~/, home);
    const isDir    = expanded.endsWith('/');
    const dir      = isDir ? expanded : path.dirname(expanded);
    const partial  = isDir ? '' : path.basename(expanded);
    const isRecursive = partial && !expanded.slice(home.length + 1).includes('/');
    if (isRecursive) {
      const INDEX_DIR = path.join(home, '.config', 'robos', 'search-index');
      let items = [];
      if (fs.existsSync(INDEX_DIR)) {
        const indexFiles = fs.readdirSync(INDEX_DIR).filter(f => f.endsWith('.txt'));
        const seen = new Set();
        for (const indexFile of indexFiles) {
          const fp = path.join(INDEX_DIR, indexFile);
          const lines = fs.readFileSync(fp, 'utf8').split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || seen.has(trimmed)) continue;
            const bn = path.basename(trimmed).toLowerCase();
            if (!bn.includes(partial.toLowerCase())) continue;
            seen.add(trimmed);
            items.push({ name: path.basename(trimmed), path: trimmed });
            if (items.length >= 12) break;
          }
          if (items.length >= 12) break;
        }
      }
      return { ok: true, items };
    }
    if (!fs.existsSync(dir)) return { ok: true, items: [] };
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const items = entries
      .filter(e => !partial || e.name.toLowerCase().startsWith(partial.toLowerCase()))
      .slice(0, 12)
      .map(e => ({
        name: e.name + (e.isDirectory() ? '/' : ''),
        path: path.join(dir, e.name) + (e.isDirectory() ? '/' : ''),
      }));
    return { ok: true, items };
  } catch { return { ok: true, items: [] }; }
});
