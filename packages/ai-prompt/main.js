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

ipcMain.handle('ap-list-skills', () => {
  try {
    const custom = readSkillsFromDisk();
    // Load builtin skills from skills-manager's main.js BUILTIN_SKILLS
    // by requiring the skills list directly from that module when available
    let builtin = [];
    try {
      const smPaths = [
        path.resolve(__dirname, '..', 'skills-manager', 'main.js'),
        '/usr/local/share/robos/skills-manager/main.js',
      ];
      // We can't require main.js (it starts Electron), so just use custom for now.
      // The full builtin list is inlined below for standalone operation.
    } catch {}
    return { ok: true, custom };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('ap-history-list', () => {
  try { return { ok: true, history: readHistory() }; }
  catch (e) { return { ok: false, error: e.message }; }
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
      const spawnOpts = { stdio: ['ignore', 'pipe', 'pipe'] };
      if (selectedAgent === 'copilot') {
        child = cp.spawn('gh', ['copilot', '--', '-p', systemPrompt, '--allow-all-tools', '--silent'], spawnOpts);
      } else {
        // Default: claude CLI — pass prompt as positional arg, ignore stdin
        const claudeArgs = ['--print', '--output-format', 'json'];
        if (model) { claudeArgs.push('--model', model); }
        claudeArgs.push('--', systemPrompt);
        child = cp.spawn('claude', claudeArgs, spawnOpts);
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
    // { "type": "result", "result": "<AI text response>", ... }
    // Extract the inner AI text before parsing our structured JSON
    let aiText = text;
    if (selectedAgent !== 'copilot') {
      try {
        const outer = JSON.parse(text.trim());
        if (outer && typeof outer.result === 'string') aiText = outer.result;
      } catch { /* not wrapped, use as-is */ }
    }

    if (aiJson) {
      const r = aiJson.parseAIJson(aiText);
      if (!r.ok) throw new Error(r.error || 'Failed to parse AI response');
      parsed = r.data;
    } else {
      const match = aiText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON object found in AI response');
      parsed = JSON.parse(match[0]);
    }

    if (typeof parsed !== 'object' || !parsed.summary) {
      throw new Error('AI response missing required fields');
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
