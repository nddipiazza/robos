'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

const DATA_FILE = path.join(os.homedir(), '.config', 'robos', 'context-sources.json');

// Debug server (optional)
var _debugServer = null;
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

// ── Context files that are valuable for AI context ────────────────────────────
const CONTEXT_FILE_PATTERNS = [
  'README.md', 'readme.md', 'README.rst',
  'AGENTS.md', 'agents.md',
  'CLAUDE.md', 'claude.md',
  '.cursorrules',
  'ARCHITECTURE.md', 'architecture.md',
  'CONTRIBUTING.md', 'contributing.md',
  'CODEOWNERS', '.github/CODEOWNERS',
  'docs/README.md', 'docs/architecture.md', 'docs/overview.md',
  'package.json', 'pom.xml', 'build.gradle', 'Cargo.toml', 'go.mod',
  '.github/copilot-instructions.md',
];

function readSources() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { sources: [] }; }
}

function writeSources(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── Journal event logging ─────────────────────────────────────────────────────
const JOURNAL_EVENTS_FILE = path.join(os.homedir(), '.config', 'robos', 'journal-events.json');
function writeJournalEvent(evt) {
  try {
    fs.mkdirSync(path.dirname(JOURNAL_EVENTS_FILE), { recursive: true });
    let events = [];
    try { events = JSON.parse(fs.readFileSync(JOURNAL_EVENTS_FILE, 'utf8')); } catch {}
    events.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, timestamp: new Date().toISOString(), ...evt });
    if (events.length > 2000) events = events.slice(0, 2000);
    fs.writeFileSync(JOURNAL_EVENTS_FILE, JSON.stringify(events, null, 2));
  } catch {}
}

function localPathForSource(src) {
  if (src.type === 'local') return src.path;
  // GitHub repo: clone to ~/source/github.com/<org>/<repo>
  if (src.type === 'github' && src.ghRepo) {
    const parts = src.ghRepo.split('/');
    return path.join(os.homedir(), 'source', 'github.com', parts[0], parts[1]);
  }
  return null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1050, height: 720,
    minWidth: 700, minHeight: 500,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
    title: 'RobOS Context Manager',
    autoHideMenuBar: true,
  });
  win.loadFile('renderer/index.html');

  if (_debugServer) _debugServer.startDebugServer(win, 19106);

  return win;
}

app.setName('context-manager');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── Shared copilot helper via robos-copilot-lib (optional) ──────────────────
let copilot = null;
try { copilot = require('/usr/local/share/robos/robos-copilot-lib'); } catch {}

function runCopilotPrompt(prompt) {
  if (!copilot) return Promise.resolve({ ok: false, error: 'AI copilot library not available' });
  return copilot.ask(prompt, { source: 'context-manager' });
}

// Streaming variant — sends ai-progress IPC events so the renderer can update the spinner tooltip.
function streamCopilotPrompt(sender, prompt) {
  if (!copilot) return Promise.resolve({ ok: false, error: 'AI copilot library not available' });
  return copilot.stream(prompt, {
    source: 'context-manager',
    onChunk: chunk => { try { sender.send('ai-progress', chunk); } catch {} },
  });
}

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.handle('read-sources',  () => readSources());
ipcMain.handle('write-sources', (_, data) => writeSources(data));

ipcMain.handle('list-git-projects', () => {
  const p = path.join(os.homedir(), '.config', 'robos', 'git-projects.json');
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return raw.projects || [];
  } catch { return []; }
});

ipcMain.handle('browse-folder', async () => {
  const wins = BrowserWindow.getAllWindows();
  const win  = wins[0] || null;
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Select context folder',
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('scan-source', (_, src) => {
  const localPath = localPathForSource(src);
  if (!localPath || !fs.existsSync(localPath)) {
    return { ok: false, error: 'Path not found: ' + (localPath || '(none)'), files: [] };
  }

  const found = [];

  // Check well-known context files
  for (const rel of CONTEXT_FILE_PATTERNS) {
    const full = path.join(localPath, rel);
    if (fs.existsSync(full)) {
      try {
        const stat = fs.statSync(full);
        found.push({ rel, size: stat.size });
      } catch { /* ignore */ }
    }
  }

  // Also scan root *.md files (up to 20)
  try {
    const entries = fs.readdirSync(localPath);
    for (const f of entries) {
      if (f.endsWith('.md') && !found.find(x => x.rel === f)) {
        try {
          const stat = fs.statSync(path.join(localPath, f));
          if (stat.isFile()) found.push({ rel: f, size: stat.size });
        } catch { /* ignore */ }
      }
      if (found.length >= 30) break;
    }
  } catch { /* ignore */ }

  // docs/ subfolder *.md (up to 20 more)
  const docsDir = path.join(localPath, 'docs');
  if (fs.existsSync(docsDir)) {
    try {
      const entries = fs.readdirSync(docsDir);
      for (const f of entries) {
        if (f.endsWith('.md')) {
          const rel = 'docs/' + f;
          if (!found.find(x => x.rel === rel)) {
            try {
              const stat = fs.statSync(path.join(docsDir, f));
              if (stat.isFile()) found.push({ rel, size: stat.size });
            } catch { /* ignore */ }
          }
        }
        if (found.length >= 50) break;
      }
    } catch { /* ignore */ }
  }

  return { ok: true, files: found, localPath };
});

ipcMain.handle('write-repo-file', (_, { src, rel, content }) => {
  const localPath = localPathForSource(src);
  if (!localPath) return { ok: false, error: 'No local path' };
  try {
    const full = path.join(localPath, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('read-file', (_, { src, rel }) => {
  const localPath = localPathForSource(src);
  if (!localPath) return { ok: false, error: 'No local path' };
  try {
    const full = path.join(localPath, rel);
    const content = fs.readFileSync(full, 'utf8');
    return { ok: true, content: content.slice(0, 50000) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('clone-source', async (event, src) => {
  const localPath = localPathForSource(src);
  if (!localPath) return { ok: false, error: 'Cannot determine local path' };
  if (fs.existsSync(path.join(localPath, '.git'))) return { ok: true, message: 'Already cloned' };

  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  const url = src.url || `https://github.com/${src.ghRepo}.git`;
  return new Promise(resolve => {
    const proc = cp.spawn('git', ['clone', url, localPath], { env: { ...process.env } });
    proc.stdout.on('data', d => event.sender.send('clone-output', d.toString()));
    proc.stderr.on('data', d => event.sender.send('clone-output', d.toString()));
    proc.on('close', code => resolve(
      code === 0 ? { ok: true, message: 'Cloned to ' + localPath } : { ok: false, error: 'git clone failed (exit ' + code + ')' }
    ));
  });
});

ipcMain.handle('pull-source', async (event, src) => {
  const localPath = localPathForSource(src);
  if (!localPath || !fs.existsSync(path.join(localPath, '.git')))
    return { ok: false, error: 'Not cloned' };
  return new Promise(resolve => {
    const proc = cp.spawn('git', ['pull'], { cwd: localPath, env: { ...process.env } });
    proc.stdout.on('data', d => event.sender.send('clone-output', d.toString()));
    proc.stderr.on('data', d => event.sender.send('clone-output', d.toString()));
    proc.on('close', code => resolve(
      code === 0 ? { ok: true, message: 'Pulled' } : { ok: false, error: 'git pull failed' }
    ));
  });
});

ipcMain.handle('check-cloned', (_, src) => {
  const localPath = localPathForSource(src);
  return localPath ? fs.existsSync(path.join(localPath, '.git')) : (src.type === 'local');
});

ipcMain.handle('open-vscode', (_, src) => {
  const localPath = localPathForSource(src);
  if (localPath && fs.existsSync(localPath)) {
    cp.spawn('code', [localPath], { env: { ...process.env, DISPLAY: ':0' }, detached: true }).unref();
  }
});

ipcMain.handle('open-url', (_, url) => shell.openExternal(url));

// Build a combined context blob from all active sources — used by other agents
ipcMain.handle('build-context-blob', (_, { maxCharsPerFile = 4000 } = {}) => {
  const { sources } = readSources();
  const active = (sources || []).filter(s => s.active !== false);
  const parts = [];

  for (const src of active) {
    const localPath = localPathForSource(src);
    if (!localPath) continue;

    const srcHeader = `\n\n=== Context: ${src.name} (${src.type === 'github' ? src.ghRepo : src.path}) ===\n`;
    const fileParts = [];

    for (const rel of (src.pinnedFiles || CONTEXT_FILE_PATTERNS.slice(0, 8))) {
      const full = path.join(localPath, rel);
      if (!fs.existsSync(full)) continue;
      try {
        const content = fs.readFileSync(full, 'utf8').slice(0, maxCharsPerFile);
        fileParts.push(`--- ${rel} ---\n${content}`);
      } catch { /* ignore */ }
    }

    if (fileParts.length) parts.push(srcHeader + fileParts.join('\n\n'));
  }

  return { ok: true, blob: parts.join('\n') };
});

ipcMain.handle('read-special-files', (_, src) => {
  const localPath = localPathForSource(src);
  if (!localPath || !fs.existsSync(localPath)) return { ok: false };

  function tryRead(rel) {
    const full = path.join(localPath, rel);
    if (!fs.existsSync(full)) return null;
    try { return fs.readFileSync(full, 'utf8').slice(0, 80000); } catch { return null; }
  }

  const agents = tryRead('AGENTS.md') || tryRead('agents.md');
  const copilotInstructions = tryRead('.github/copilot-instructions.md') || tryRead('copilot-instructions.md');
  return { ok: true, agents, copilot: copilotInstructions };
});

ipcMain.handle('generate-knowledge-graph', async (event, src) => {
  const localPath = localPathForSource(src);
  if (!localPath || !fs.existsSync(localPath)) return { ok: false, error: 'Not cloned' };

  const snippets = [];
  for (const rel of ['README.md', 'AGENTS.md', '.github/copilot-instructions.md', 'ARCHITECTURE.md', 'package.json', 'pom.xml']) {
    const full = path.join(localPath, rel);
    if (!fs.existsSync(full)) continue;
    try { snippets.push(`## ${rel}\n` + fs.readFileSync(full, 'utf8').slice(0, 3000)); } catch { /* ignore */ }
  }
  const context = snippets.join('\n\n---\n\n').slice(0, 12000);
  const srcName = src.name || src.ghRepo || src.path;

  const prompt = `You are analyzing a software project named "${srcName}".
Here is the project context:

${context}

Generate a Mermaid knowledge graph (use "graph LR" or "graph TD" syntax) that visually maps:
- The main technologies, frameworks, languages used
- Key components, modules, or services
- Important relationships and dependencies between them
- Any notable conventions, agents, or AI tools mentioned

Output ONLY the raw Mermaid diagram code block, starting with \`\`\`mermaid and ending with \`\`\`. No other text.`;

  return streamCopilotPrompt(event.sender, prompt).then(({ ok, text, error }) => {
    if (!ok) return { ok: false, error };
    const match = text.match(/```mermaid([\s\S]*?)```/);
    if (match) { writeJournalEvent({ source: 'context-manager', type: 'knowledge-graph', title: `Knowledge Graph: ${srcName}`, detail: 'Mermaid diagram generated', status: 'completed' }); return { ok: true, mermaid: match[1].trim() }; }
    const graphMatch = text.match(/(graph\s+[A-Z]{2}[\s\S]+)/);
    if (graphMatch) { writeJournalEvent({ source: 'context-manager', type: 'knowledge-graph', title: `Knowledge Graph: ${srcName}`, detail: 'Mermaid diagram generated', status: 'completed' }); return { ok: true, mermaid: graphMatch[1].trim() }; }
    return { ok: false, error: 'No Mermaid diagram found in output', raw: text.slice(0, 500) };
  });
});

ipcMain.handle('generate-agents-md', async (event, src) => {
  const localPath = localPathForSource(src);
  if (!localPath || !fs.existsSync(localPath)) return { ok: false, error: 'Not cloned' };

  const snippets = [];
  for (const rel of ['README.md', 'ARCHITECTURE.md', 'package.json', 'pom.xml', 'go.mod', 'Cargo.toml']) {
    const full = path.join(localPath, rel);
    if (!fs.existsSync(full)) continue;
    try { snippets.push(`## ${rel}\n` + fs.readFileSync(full, 'utf8').slice(0, 4000)); } catch { /* ignore */ }
  }
  const context = snippets.join('\n\n---\n\n').slice(0, 14000);
  const srcName = src.name || src.ghRepo || src.path;

  const prompt = `You are an expert at writing AGENTS.md files for software projects.
AGENTS.md is a special file that gives AI coding agents (like GitHub Copilot, Claude, etc.)
instructions about how to work effectively in a codebase.

Analyze this project named "${srcName}" and generate a comprehensive AGENTS.md file.

Project context:
${context}

The AGENTS.md should include:
- Project overview for agents (what this project does, main purpose)
- Tech stack and key dependencies
- Directory structure overview and what's in each major directory
- Coding conventions and style guides to follow
- How to run/build/test the project
- Key files agents should be aware of
- Common tasks and how to approach them
- Any gotchas, anti-patterns, or things agents should avoid
- How to make changes safely (what to check, what tests to run)

Output ONLY the markdown content for AGENTS.md, no preamble or explanation.`;

  return streamCopilotPrompt(event.sender, prompt).then(({ ok, text, error }) => {
    if (ok) writeJournalEvent({ source: 'context-manager', type: 'ai-generate', title: `Generated AGENTS.md: ${srcName}`, detail: `${text.split('\n').length} lines generated`, status: 'completed' });
    return ok ? { ok: true, content: text } : { ok: false, error };
  });
});

ipcMain.handle('generate-copilot-instructions', async (event, src) => {
  const localPath = localPathForSource(src);
  if (!localPath || !fs.existsSync(localPath)) return { ok: false, error: 'Not cloned' };

  const snippets = [];
  for (const rel of ['README.md', 'AGENTS.md', 'ARCHITECTURE.md', 'package.json', 'pom.xml', 'go.mod']) {
    const full = path.join(localPath, rel);
    if (!fs.existsSync(full)) continue;
    try { snippets.push(`## ${rel}\n` + fs.readFileSync(full, 'utf8').slice(0, 4000)); } catch { /* ignore */ }
  }
  const context = snippets.join('\n\n---\n\n').slice(0, 14000);
  const srcName = src.name || src.ghRepo || src.path;

  const prompt = `You are an expert at writing GitHub Copilot custom instructions files (.github/copilot-instructions.md).
These instructions are injected into every GitHub Copilot chat to shape how Copilot responds for this specific project.

Analyze this project named "${srcName}" and write a concise, effective copilot-instructions.md.

Project context:
${context}

The copilot-instructions.md should:
- Be concise and focused (Copilot reads this every time, so avoid fluff)
- Describe the project's purpose in 1-2 sentences
- Specify the tech stack and key frameworks
- List coding conventions, naming patterns, and style preferences
- Note any special architecture patterns (e.g. CQRS, hexagonal, etc.)
- Mention preferred testing approach
- Highlight any security or compliance considerations
- Give Copilot tips on what good contributions look like for this project

Output ONLY the markdown content for .github/copilot-instructions.md, no preamble or explanation.`;

  return streamCopilotPrompt(event.sender, prompt).then(({ ok, text, error }) => {
    if (ok) writeJournalEvent({ source: 'context-manager', type: 'ai-generate', title: `Generated Copilot Instructions: ${srcName}`, detail: `${text.split('\n').length} lines generated`, status: 'completed' });
    return ok ? { ok: true, content: text } : { ok: false, error };
  });
});


ipcMain.handle('search-gh-repos', (_, { query }) => {
  if (!query || !query.trim()) return { ok: true, repos: [] };
  const r = cp.spawnSync('gh', [
    'search', 'repos', query.trim(),
    '--limit', '20',
    '--json', 'nameWithOwner,url,description,isPrivate',
  ], { encoding: 'utf8', timeout: 20000, env: { ...process.env } });
  if (r.status !== 0) return { ok: false, error: r.stderr || 'gh search failed' };
  try { return { ok: true, repos: JSON.parse(r.stdout || '[]') }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('list-my-repos', () => {
  const JSON_FIELDS = 'nameWithOwner,url,description,isPrivate';
  const seen = new Set(); const repos = [];
  function collect(args) {
    const r = cp.spawnSync('gh', [...args, '--json', JSON_FIELDS],
      { encoding: 'utf8', timeout: 30000, env: { ...process.env } });
    if (r.status !== 0) return;
    try { JSON.parse(r.stdout || '[]').forEach(repo => {
      if (!seen.has(repo.nameWithOwner)) { seen.add(repo.nameWithOwner); repos.push(repo); }
    }); } catch { /* ignore */ }
  }
  collect(['repo', 'list', '--limit', '200']);
  const orgR = cp.spawnSync('gh', ['org', 'list', '--limit', '100'],
    { encoding: 'utf8', timeout: 15000, env: { ...process.env } });
  (orgR.stdout || '').split('\n').map(l => l.trim()).filter(Boolean)
    .forEach(org => collect(['repo', 'list', org, '--limit', '200']));
  return { ok: true, repos };
});
