'use strict';
let electronPkg;
try {
  electronPkg = require('electron');
} catch {}

const isElectronRuntime = electronPkg && typeof electronPkg === 'object' && typeof electronPkg.app === 'object';
const app = isElectronRuntime ? electronPkg.app : {
  setName: () => {},
  setPath: () => {},
  commandLine: { appendSwitch: () => {} },
  whenReady: () => new Promise(() => {}),
  on: () => {},
  quit: () => {},
};
const BrowserWindow = isElectronRuntime ? electronPkg.BrowserWindow : class {};
const ipcMain = isElectronRuntime ? electronPkg.ipcMain : { handle: () => {}, on: () => {} };

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execSync } = require('child_process');
const http = require('http');
const clipboard = electronPkg && electronPkg.clipboard;

app.setName('robos-elearning');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'robos-elearning'));

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let win = null;
const PORT = 19185;

let _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try {
      _debugServer = require(p);
      if (_debugServer.registerSnapshotIPC) _debugServer.registerSnapshotIPC(ipcMain);
      break;
    } catch {}
  }
} catch {}

let SDLCKnowledgeGraphStore = null;
try {
  const graphLibPaths = [
    path.resolve(__dirname, '..', 'robos-graph', 'index.js'),
    '/usr/local/share/robos/robos-graph/index.js',
  ];
  for (const gp of graphLibPaths) {
    try {
      const g = require(gp);
      if (g.SDLCKnowledgeGraphStore) {
        SDLCKnowledgeGraphStore = g.SDLCKnowledgeGraphStore;
        break;
      }
    } catch {}
  }
} catch {}

let graphStore = null;
function getGraphStore() {
  if (!graphStore && SDLCKnowledgeGraphStore) {
    try {
      graphStore = new SDLCKnowledgeGraphStore();
    } catch (err) {
      console.warn('[robos-elearning] Could not instantiate SDLCKnowledgeGraphStore:', err.message);
    }
  }
  return graphStore;
}

// Parse launch args
let initialAppId = null;
let initialCourseId = null;
for (const arg of process.argv) {
  if (arg.startsWith('--app=')) initialAppId = arg.split('=')[1];
  if (arg.startsWith('--course=')) initialCourseId = arg.split('=')[1];
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'RobOS — Interactive eLearning & Verification Hub',
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) _debugServer.startDebugServer(win, PORT);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('elearning:get-initial-target', () => ({
  appId: initialAppId,
  courseId: initialCourseId,
}));

ipcMain.handle('elearning:list-courses', async () => {
  const store = getGraphStore();
  if (store) {
    const courses = store.getELearningNodes();
    return courses.map(c => ({
      id: c['@id'],
      title: c['dcterms:title'],
      topic: c['robos:topic'],
      difficulty: c['robos:difficulty'] || 'Intermediate',
      estimatedDuration: c['robos:estimatedDuration'] || '45 mins',
      targetApplication: c['robos:targetApplication'] || null,
      modulesCount: (c['robos:modules'] || []).length,
    }));
  }
  return [];
});

ipcMain.handle('elearning:get-course', async (_, courseIdOrAppId) => {
  const store = getGraphStore();
  if (!store) return { error: 'Graph store not available' };

  let course = null;
  let appNode = null;

  if (courseIdOrAppId) {
    course = store.getNode(courseIdOrAppId);
    if (!course && typeof store.findELearning === 'function') {
      course = store.findELearning(courseIdOrAppId);
    }
    if (!course) {
      appNode = store.findApplicationNode(courseIdOrAppId);
      if (appNode && appNode['robos:hasELearning']) {
        const cId = Array.isArray(appNode['robos:hasELearning']) ? appNode['robos:hasELearning'][0] : appNode['robos:hasELearning'];
        course = store.getNode(cId) || (typeof store.findELearning === 'function' ? store.findELearning(cId) : null);
      }
    }
  }

  if (!course) {
    const all = store.getELearningNodes();
    if (all.length > 0) course = all[0];
  }

  if (course && course['robos:targetApplication']) {
    appNode = store.getNode(course['robos:targetApplication']);
  }

  return { course, application: appNode };
});

ipcMain.handle('elearning:issue-certificate', async (_, { courseId, appId, userId, scorePercentage }) => {
  const store = getGraphStore();
  if (store) {
    return store.issueCertificateOfCompletion({ courseId, appId, userId, scorePercentage });
  }
  return { ok: false, error: 'Store not available' };
});

ipcMain.handle('elearning:list-certificates', async (_, opts = {}) => {
  const store = getGraphStore();
  if (store) {
    return store.getCertificatesForAppOrUser(opts);
  }
  return [];
});

ipcMain.handle('elearning:export-website', async (_, opts = {}) => {
  const store = getGraphStore();
  if (store && typeof store.generateELearningWebsite === 'function') {
    return store.generateELearningWebsite(opts);
  }
  return { ok: false, error: 'Store or website generator not available' };
});

// ── Slide Actions, GitOps Source Info & Zip Export ────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderOverviewContent(raw) {
  if (!raw) return '';
  let content = String(raw).trim();
  if (!content) return '';

  const tokens = [];
  function saveToken(html) {
    const placeholder = `<!--ROBOS_TOKEN_${tokens.length}-->`;
    tokens.push({ placeholder, html });
    return placeholder;
  }

  // 1. Preserve pre-existing <pre><code>...</code></pre> blocks
  content = content.replace(/<pre[\s\S]*?<\/pre>/gi, (match) => saveToken(match));

  // 2. Fenced code blocks ```lang ... ```
  content = content.replace(/```([a-zA-Z0-9_\-]*)([\s\S]*?)```/g, (_match, lang, code) => {
    const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
    const cls = lang ? ` class="language-${lang}"` : '';
    return saveToken(`<pre><code${cls}>${esc}</code></pre>`);
  });

  // 3. Preserve HTML figures, images, tables, details, dl, div, video, iframe blocks
  content = content.replace(/<figure[\s\S]*?<\/figure>/gi, (match) => saveToken(match));
  content = content.replace(/<table[\s\S]*?<\/table>/gi, (match) => saveToken(match));
  content = content.replace(/<dl[\s\S]*?<\/dl>/gi, (match) => saveToken(match));
  content = content.replace(/<details[\s\S]*?<\/details>/gi, (match) => saveToken(match));
  content = content.replace(/<div[\s\S]*?<\/div>/gi, (match) => saveToken(match));
  content = content.replace(/<(?:video|iframe|audio)[\s\S]*?<\/(?:video|iframe|audio)>/gi, (match) => saveToken(match));

  // 4. Markdown tables (| col | col |)
  content = content.replace(/((?:\|[^\n]+\|\r?\n)+)/g, (match) => {
    const lines = match.trim().split('\n').filter(l => l.trim().startsWith('|'));
    if (lines.length < 2) return match;
    let html = '<table>';
    lines.forEach((line, idx) => {
      if (line.includes('---')) return;
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (idx === 0) {
        html += '<thead><tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
      } else {
        html += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
      }
    });
    html += '</tbody></table>';
    return saveToken(html);
  });

  // 5. Markdown headers (# h1, ## h2, ### h3, #### h4)
  content = content.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  content = content.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  content = content.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  content = content.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // 6. Horizontal rules
  content = content.replace(/^---$/gm, '<hr>');

  // 7. Blockquotes
  content = content.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

  // 8. Markdown unordered lists (- item or * item)
  content = content.replace(/(?:^|\n)((?:[ \t]*[-*] .+(?:\n|$))+)/g, (match) => {
    const items = match.trim().split('\n').map(l => {
      const clean = l.trim().replace(/^[-*]\s+/, '');
      return `<li>${clean}</li>`;
    }).join('');
    return saveToken(`<ul>${items}</ul>`);
  });

  // 9. Markdown ordered lists (1. item)
  content = content.replace(/(?:^|\n)((?:[ \t]*\d+\. .+(?:\n|$))+)/g, (match) => {
    const items = match.trim().split('\n').map(l => {
      const clean = l.trim().replace(/^\d+\.\s+/, '');
      return `<li>${clean}</li>`;
    }).join('');
    return saveToken(`<ol>${items}</ol>`);
  });

  // 10. Inline bold / italic / code / links
  content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  content = content.replace(/(^|[^\*])\*([^*]+)\*([^\*]|$)/g, '$1<em>$2</em>$3');
  content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
  content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // 11. Wrap loose paragraphs
  const chunks = content.split(/\n\s*\n/).map(p => {
    const trimmed = p.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<!--ROBOS_TOKEN_') ||
        trimmed.startsWith('<h') ||
        trimmed.startsWith('<table') ||
        trimmed.startsWith('<pre') ||
        trimmed.startsWith('<div') ||
        trimmed.startsWith('<hr') ||
        trimmed.startsWith('<blockquote') ||
        trimmed.startsWith('<ul') ||
        trimmed.startsWith('<ol') ||
        trimmed.startsWith('<p') ||
        trimmed.startsWith('<dl') ||
        trimmed.startsWith('<figure') ||
        trimmed.startsWith('<details')) {
      return trimmed;
    }
    return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
  });

  let result = chunks.join('\n\n');

  // 12. Restore tokens
  for (const { placeholder, html } of tokens) {
    result = result.replace(placeholder, html);
  }

  return result;
}

function getGitInfo() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  let remoteUrl = 'https://github.com/nddipiazza/robos';
  let branch = 'main';
  try {
    const out = execSync('git remote get-url origin', { cwd: repoRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (out) {
      if (out.startsWith('git@github.com:')) {
        remoteUrl = 'https://github.com/' + out.slice('git@github.com:'.length).replace(/\.git$/, '');
      } else {
        remoteUrl = out.replace(/\.git$/, '');
      }
    }
  } catch {}
  try {
    const b = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (b) branch = b;
  } catch {}

  const gitopsPath = path.join(repoRoot, '.robos', 'elearning.yaml');
  const kgraphPath = path.join(repoRoot, '.robos', 'kgraphs', 'learning', 'package.jsonld');

  return {
    repoRoot,
    gitopsPath,
    gitopsRelative: '.robos/elearning.yaml',
    kgraphPath,
    gitRemoteUrl: remoteUrl,
    gitBranch: branch,
  };
}

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
  }
  crcTable[i] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createZipBuffer(files) {
  const fileEntries = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const dataBuf = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
    const crc = crc32(dataBuf);
    const uncompressedSize = dataBuf.length;

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8); // STORE
    localHeader.writeUInt16LE(0x4a00, 10);
    localHeader.writeUInt16LE(0x5939, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(uncompressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    fileEntries.push({
      nameBuf,
      dataBuf,
      localHeader,
      crc,
      uncompressedSize,
      offset,
    });

    offset += localHeader.length + dataBuf.length;
  }

  const cdChunks = [];
  let cdSize = 0;
  for (const entry of fileEntries) {
    const cdHeader = Buffer.alloc(46 + entry.nameBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0);
    cdHeader.writeUInt16LE(20, 4);
    cdHeader.writeUInt16LE(20, 6);
    cdHeader.writeUInt16LE(0, 8);
    cdHeader.writeUInt16LE(0, 10);
    cdHeader.writeUInt16LE(0x4a00, 12);
    cdHeader.writeUInt16LE(0x5939, 14);
    cdHeader.writeUInt32LE(entry.crc, 16);
    cdHeader.writeUInt32LE(entry.uncompressedSize, 20);
    cdHeader.writeUInt32LE(entry.uncompressedSize, 24);
    cdHeader.writeUInt16LE(entry.nameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30);
    cdHeader.writeUInt16LE(0, 32);
    cdHeader.writeUInt16LE(0, 34);
    cdHeader.writeUInt16LE(0, 36);
    cdHeader.writeUInt32LE(0, 38);
    cdHeader.writeUInt32LE(entry.offset, 42);
    entry.nameBuf.copy(cdHeader, 46);

    cdChunks.push(cdHeader);
    cdSize += cdHeader.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(fileEntries.length, 8);
  eocd.writeUInt16LE(fileEntries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  const parts = [];
  for (const entry of fileEntries) {
    parts.push(entry.localHeader);
    parts.push(entry.dataBuf);
  }
  for (const cd of cdChunks) {
    parts.push(cd);
  }
  parts.push(eocd);

  return Buffer.concat(parts);
}

const SLIDE_OFFLINE_CSS = `:root {
  --bg-primary: #0d1117;
  --bg-surface: #161b22;
  --bg-surface-hover: #21262d;
  --accent: #00bcd4;
  --accent-cyan: #38bdf8;
  --border: #30363d;
  --text: #c9d1d9;
  --text-muted: #8b949e;
  --text-bright: #f0f6fc;
  --success: #2ea043;
  --danger: #f85149;
  --purple: #a371f7;
  --gold: #f1e05a;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: var(--bg-primary);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  line-height: 1.6;
  padding: 32px 20px;
}
.slide-container {
  max-width: 900px;
  margin: 0 auto;
}
.slide-header {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
}
.header-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.badge {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}
.badge-brand { background: rgba(0, 188, 212, 0.15); color: var(--accent); border: 1px solid rgba(0, 188, 212, 0.3); }
.badge-tech { background: rgba(56, 189, 248, 0.15); color: var(--accent-cyan); border: 1px solid rgba(56, 189, 248, 0.3); }
.badge-difficulty { background: rgba(163, 113, 247, 0.15); color: var(--purple); border: 1px solid rgba(163, 113, 247, 0.3); }
.badge-duration { background: rgba(240, 246, 252, 0.1); color: var(--text); border: 1px solid var(--border); }
.badge-counter { background: rgba(241, 224, 90, 0.15); color: var(--gold); border: 1px solid rgba(241, 224, 90, 0.3); }
.slide-title { font-size: 24px; color: var(--text-bright); margin-bottom: 6px; }
.course-subtitle { font-size: 13px; color: var(--text-muted); }
.section-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 20px;
}
.section-heading {
  font-size: 16px;
  color: var(--accent);
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.overview-body {
  font-size: 15px;
  line-height: 1.75;
  color: var(--text);
}
.overview-body p {
  margin: 12px 0 16px;
  line-height: 1.75;
}
.overview-body h1, .overview-body h2, .overview-body h3, .overview-body h4 {
  color: var(--text-bright);
  font-weight: 600;
  margin-top: 24px;
  margin-bottom: 12px;
}
.overview-body h3 {
  font-size: 16px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 6px;
  color: var(--accent);
}
.overview-body strong, .overview-body b {
  color: var(--text-bright);
  font-weight: 700;
}
.overview-body a {
  color: var(--accent);
  text-decoration: none;
}
.overview-body a:hover {
  text-decoration: underline;
}
.overview-body ul, .overview-body ol {
  padding-left: 26px;
  margin: 14px 0 18px;
}
.overview-body li {
  margin: 8px 0;
  line-height: 1.65;
}
.overview-body dl {
  margin: 20px 0;
  background: #0d1117;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 18px 22px;
}
.overview-body dt {
  font-weight: 700;
  color: var(--accent);
  font-size: 15px;
  margin-top: 14px;
}
.overview-body dt:first-child {
  margin-top: 0;
}
.overview-body dd {
  margin: 6px 0 14px 0;
  color: var(--text);
  line-height: 1.65;
  padding-left: 14px;
  border-left: 2px solid rgba(0, 188, 212, 0.3);
}
.overview-body pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 16px 20px;
  background: #0d1117;
  border: 1px solid var(--border);
  border-radius: 8px;
  line-height: 1.65;
  margin: 18px 0;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 13px;
}
.overview-body code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 0.92em;
  background: rgba(110, 118, 129, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
  color: #38bdf8;
}
.overview-body pre code {
  background: transparent;
  padding: 0;
  color: var(--text-bright);
}
.overview-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 20px 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.overview-body th, .overview-body td {
  text-align: left;
  vertical-align: top;
  padding: 12px 16px;
  border: 1px solid var(--border);
}
.overview-body th {
  color: var(--text-bright);
  background: #161b22;
  font-weight: 600;
  font-size: 13px;
}
.overview-body td {
  font-size: 13px;
}
.overview-body tr:nth-child(even) {
  background: rgba(22, 27, 34, 0.4);
}
.overview-body blockquote {
  border-left: 4px solid var(--accent);
  background: rgba(0, 188, 212, 0.08);
  padding: 12px 18px;
  border-radius: 0 6px 6px 0;
  margin: 18px 0;
  color: var(--text-bright);
}
.overview-body .flow {
  padding: 16px 20px;
  border-left: 3px solid #67d9ec;
  background: #0d1117;
  border-radius: 0 8px 8px 0;
  margin: 20px 0;
  line-height: 1.8;
  font-weight: 500;
  color: #e6edf3;
}
.overview-body .flow-diagram {
  margin: 28px 0;
  text-align: center;
}
.overview-body .flow-diagram img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  border: 1px solid var(--border);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6);
  display: block;
  margin: 0 auto;
}
.overview-body .flow-diagram figcaption {
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-muted);
  font-style: italic;
}
.overview-body details {
  background: #0d1117;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 14px 18px;
  margin: 18px 0;
}
.overview-body summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--accent);
  outline: none;
  margin-bottom: 8px;
}
.overview-body hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 24px 0;
}
.lab-steps-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lab-step-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.lab-step-item input { margin-top: 4px; cursor: pointer; }
.lab-progress-note {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-muted);
}
.quiz-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.quiz-item {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}
.quiz-question {
  font-size: 14px;
  color: var(--text-bright);
  margin-bottom: 12px;
}
.quiz-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.quiz-option-label {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: border-color 0.2s;
}
.quiz-option-label:hover { border-color: var(--accent); }
.quiz-feedback {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  display: none;
}
.quiz-feedback.pass { display: block; background: rgba(46, 160, 67, 0.15); color: #3fb950; border: 1px solid rgba(46, 160, 67, 0.3); }
.quiz-feedback.fail { display: block; background: rgba(248, 81, 73, 0.15); color: #f85149; border: 1px solid rgba(248, 81, 73, 0.3); }
.slide-footer {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.meta-row { display: flex; flex-direction: column; gap: 4px; font-family: ui-monospace, monospace; }
.footer-brand { font-size: 11px; color: var(--text-muted); text-align: center; margin-top: 12px; }
`;

function buildStandaloneSlideHtml({ slide, course, application, slideIndex, totalSlides, gitInfo }) {
  const courseTitle = (course && course['dcterms:title']) || 'RobOS Masterclass';
  const slideTitle = (slide && slide.title) || `Slide ${(slideIndex || 0) + 1}`;
  const duration = (slide && slide.durationMinutes) || 15;
  const overview = (slide && slide.overview) || '';
  const labSteps = (slide && slide.labSteps) || [];
  const quizzes = (slide && slide.quiz) || [];
  const courseTopic = (course && course['robos:topic']) || 'Systems Architecture';
  const difficulty = (course && course['robos:difficulty']) || 'Intermediate';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(slideTitle)} — ${escapeHtml(courseTitle)}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="slide-container">
    <header class="slide-header">
      <div class="header-badge-row">
        <span class="badge badge-brand">🎓 RobOS eLearning</span>
        <span class="badge badge-tech">${escapeHtml(courseTopic)}</span>
        <span class="badge badge-difficulty">${escapeHtml(difficulty)}</span>
        <span class="badge badge-duration">⏱️ ${duration} mins</span>
        <span class="badge badge-counter">Slide ${(slideIndex || 0) + 1} of ${totalSlides || 1}</span>
      </div>
      <h1 class="slide-title">${escapeHtml(slideTitle)}</h1>
      <div class="course-subtitle">Course: <strong>${escapeHtml(courseTitle)}</strong></div>
    </header>

    <main class="slide-content">
      <section class="section-card">
        <h2 class="section-heading">📖 Slide Overview</h2>
        <div class="overview-body">${renderOverviewContent(overview)}</div>
      </section>

      ${labSteps.length ? `
      <section class="section-card">
        <h2 class="section-heading">🧪 Hands-On Lab Exercises (${labSteps.length})</h2>
        <div class="lab-steps-list">
          ${labSteps.map((step, sIdx) => `
            <div class="lab-step-item">
              <input type="checkbox" id="lab-step-${sIdx}" onchange="updateLabCount()">
              <label for="lab-step-${sIdx}"><strong>Step ${sIdx + 1}:</strong> ${escapeHtml(step).replace(/`([^`]+)`/g, '<code>$1</code>')}</label>
            </div>
          `).join('')}
        </div>
        <div class="lab-progress-note" id="lab-status">0 of ${labSteps.length} steps completed</div>
      </section>` : ''}

      ${quizzes.length ? `
      <section class="section-card">
        <h2 class="section-heading">📝 Knowledge Check (${quizzes.length} Questions)</h2>
        <div class="quiz-list">
          ${quizzes.map((q, qIdx) => `
            <div class="quiz-item" id="quiz-block-${qIdx}">
              <div class="quiz-question"><strong>Question ${qIdx + 1}:</strong> ${escapeHtml(q.question)}</div>
              <div class="quiz-options">
                ${(q.options || [q.answer, 'Alternative A', 'Alternative B']).map((opt) => `
                  <label class="quiz-option-label">
                    <input type="radio" name="quiz-${qIdx}" value="${escapeHtml(opt)}" onchange="evaluateQuiz(${qIdx}, this.value, '${escapeHtml(q.answer)}')">
                    <span>${escapeHtml(opt)}</span>
                  </label>
                `).join('')}
              </div>
              <div class="quiz-feedback" id="feedback-${qIdx}"></div>
            </div>
          `).join('')}
        </div>
      </section>` : ''}
    </main>

    <footer class="slide-footer">
      <div class="meta-row">
        <div><strong>KGraph URI:</strong> <code>${escapeHtml((course && course['@id']) || 'urn:robos:elearning')}${slide && slide.id ? '#' + escapeHtml(slide.id) : ''}</code></div>
        ${gitInfo ? `<div><strong>Source:</strong> <code>${escapeHtml(gitInfo.gitopsRelative || '.robos/elearning.yaml')}</code></div>` : ''}
      </div>
      <div class="footer-brand">Exported from RobOS Interactive eLearning Platform &middot; Fully Offline-Ready</div>
    </footer>
  </div>

  <script>
    function updateLabCount() {
      const all = document.querySelectorAll('.lab-step-item input[type="checkbox"]');
      const checked = document.querySelectorAll('.lab-step-item input[type="checkbox"]:checked');
      const el = document.getElementById('lab-status');
      if (el) el.textContent = checked.length + ' of ' + all.length + ' steps completed';
    }
    function evaluateQuiz(idx, selected, correct) {
      const fb = document.getElementById('feedback-' + idx);
      if (!fb) return;
      if (selected === correct) {
        fb.className = 'quiz-feedback pass';
        fb.textContent = '✅ Correct!';
      } else {
        fb.className = 'quiz-feedback fail';
        fb.textContent = '❌ Incorrect. Try again!';
      }
    }
  </script>
</body>
</html>`;
}

ipcMain.handle('elearning:get-source-info', async () => {
  return getGitInfo();
});

ipcMain.handle('elearning:export-slide-zip', async (_, payload = {}) => {
  try {
    const { slide, course, application, slideIndex, totalSlides } = payload;
    if (!slide || !course) {
      return { ok: false, error: 'Slide and course data are required' };
    }
    const gitInfo = getGitInfo();
    const courseSlug = (course['@id'] || 'course').replace(/.*:/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const slideSlug = (slide.id || ('slide-' + ((slideIndex || 0) + 1))).toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const slideHtml = buildStandaloneSlideHtml({
      slide,
      course,
      application,
      slideIndex: slideIndex || 0,
      totalSlides: totalSlides || 1,
      gitInfo,
    });

    const metadataJson = JSON.stringify({
      courseId: course['@id'],
      courseTitle: course['dcterms:title'],
      slideId: slide.id || `mod-${(slideIndex || 0) + 1}`,
      slideTitle: slide.title,
      slideNumber: (slideIndex || 0) + 1,
      totalSlides: totalSlides || 1,
      durationMinutes: slide.durationMinutes || 15,
      labStepsCount: (slide.labSteps || []).length,
      quizQuestionsCount: (slide.quiz || []).length,
      gitopsFile: course['robos:gitopsFile'] || '.robos/elearning.yaml',
      exportedAt: new Date().toISOString(),
    }, null, 2);

    const readmeMd = `# ${slide.title || 'Slide'} — RobOS Offline eLearning Slide
**Course**: ${course['dcterms:title'] || 'RobOS Masterclass'}  
**Duration**: ${slide.durationMinutes || 15} minutes  
**Source**: \`${gitInfo.gitopsRelative || '.robos/elearning.yaml'}\`  
**Exported**: ${new Date().toISOString()}

## Offline Usage
1. Open \`index.html\` in any modern web browser (Google Chrome, Firefox, Safari, Edge).
2. All interactive lab checklists and module quizzes are 100% offline-ready.
`;

    const files = [
      { name: 'index.html', data: slideHtml },
      { name: 'style.css', data: SLIDE_OFFLINE_CSS },
      { name: 'metadata.json', data: metadataJson },
      { name: 'README.md', data: readmeMd },
    ];

    const zipBuf = createZipBuffer(files);
    const exportDir = path.join(os.homedir(), '.config', 'robos', 'exports', 'elearning');
    fs.mkdirSync(exportDir, { recursive: true });
    const filename = `${courseSlug}-${slideSlug}.zip`;
    const filePath = path.join(exportDir, filename);
    fs.writeFileSync(filePath, zipBuf);

    return {
      ok: true,
      filePath,
      filename,
      sizeBytes: zipBuf.length,
      base64Zip: zipBuf.toString('base64'),
      message: `Exported slide archive to ${filePath}`,
    };
  } catch (err) {
    console.error('[robos-elearning] export-slide-zip error:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('elearning:save-course', async (_, courseData) => {
  try {
    if (!courseData || !courseData['@id']) {
      return { ok: false, error: 'Invalid course payload' };
    }
    const store = getGraphStore();
    if (!store) {
      return { ok: false, error: 'Knowledge graph store not available' };
    }

    // Update in knowledge graph store
    store.updateNode(courseData);

    // Synchronize with declarative GitOps .robos/elearning.yaml
    if (typeof store.syncToGitOpsELearning === 'function') {
      store.syncToGitOpsELearning(courseData);
    }

    return {
      ok: true,
      message: `Successfully saved course "${courseData['dcterms:title']}" to Knowledge Graph and .robos/elearning.yaml.`,
    };
  } catch (err) {
    console.error('[robos-elearning] save-course error:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('elearning:copy-to-clipboard', async (_, text) => {
  try {
    if (clipboard && typeof clipboard.writeText === 'function') {
      clipboard.writeText(String(text || ''));
      return { ok: true };
    }
    return { ok: false, error: 'Clipboard API not available' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Voice Assistant & Real-Time Course Co-Authoring ─────────────────────────

let voiceAssistantState = {
  active: false,
  agentId: 'fast-reactive',
  streamReq: null,
  lastProcessedText: '',
  taskActive: false,
};

/**
 * Fast Reactive / AI Agent suggestion parser for real-time eLearning curriculum mutation
 */
async function parseVoiceSuggestion(text, agentId = 'fast-reactive') {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();

  // 1. Add Lab Step
  const addStepMatch = clean.match(/^(?:please\s+)?(?:add|create|insert|include)\s+(?:a\s+|new\s+)?(?:lab\s+)?step(?:\s+to|\s+for|:)?\s+(.*)$/i);
  if (addStepMatch && addStepMatch[1]) {
    return {
      type: 'ADD_LAB_STEP',
      stepText: addStepMatch[1].replace(/^[,\s.:]+|[.\s]+$/g, '').trim(),
      agentId,
      rawText: clean,
    };
  }

  // 2. Remove Lab Step
  const removeStepMatch = clean.match(/^(?:please\s+)?(?:remove|delete)\s+(?:lab\s+)?step\s+(\d+)/i);
  if (removeStepMatch && removeStepMatch[1]) {
    return {
      type: 'REMOVE_LAB_STEP',
      stepIndex: parseInt(removeStepMatch[1], 10) - 1,
      agentId,
      rawText: clean,
    };
  }

  // 3. Update Module Title
  const titleMatch = clean.match(/^(?:please\s+)?(?:change|set|update|rename)\s+(?:the\s+)?(?:module\s+)?title\s+to\s+(.*)$/i);
  if (titleMatch && titleMatch[1]) {
    return {
      type: 'UPDATE_MODULE_TITLE',
      title: titleMatch[1].replace(/^[,\s.:"']+|[.\s"']+$/g, '').trim(),
      agentId,
      rawText: clean,
    };
  }

  // 4. Update Overview
  const overviewMatch = clean.match(/^(?:please\s+)?(?:change|set|update)\s+(?:the\s+)?overview\s+to\s+(.*)$/i);
  if (overviewMatch && overviewMatch[1]) {
    return {
      type: 'UPDATE_OVERVIEW',
      overview: overviewMatch[1].replace(/^[,\s.:"']+|[.\s"']+$/g, '').trim(),
      agentId,
      rawText: clean,
    };
  }

  // 5. Add Quiz Question
  const quizMatch = clean.match(/^(?:please\s+)?(?:add|create)\s+(?:a\s+)?quiz\s+question:?\s*(.*?)(?:\s*(?:with\s+)?answer:?\s*(.*))?$/i);
  if (quizMatch && quizMatch[1]) {
    const qText = quizMatch[1].replace(/^[,\s.:"']+|[.\s"']+$/g, '').trim();
    const ansText = (quizMatch[2] || 'True').replace(/^[,\s.:"']+|[.\s"']+$/g, '').trim();
    return {
      type: 'ADD_QUIZ_QUESTION',
      quiz: {
        question: qText,
        answer: ansText,
        options: [ansText, 'Alternative Choice A', 'Alternative Choice B'],
        explanation: 'Created dynamically via RobOS Voice Assistant',
      },
      agentId,
      rawText: clean,
    };
  }

  // 6. Update Difficulty
  const diffMatch = clean.match(/^(?:please\s+)?(?:change|set)\s+difficulty\s+to\s+(beginner|intermediate|advanced)/i);
  if (diffMatch && diffMatch[1]) {
    const cap = diffMatch[1].charAt(0).toUpperCase() + diffMatch[1].slice(1).toLowerCase();
    return {
      type: 'UPDATE_DIFFICULTY',
      difficulty: cap,
      agentId,
      rawText: clean,
    };
  }

  // 7. General AI CLI Agent query if configured and not fast-reactive
  if (agentId !== 'fast-reactive') {
    try {
      let aiAgent = null;
      const agentPaths = [
        path.resolve(__dirname, '..', 'robos-lib', 'ai-agent'),
        '/usr/local/share/robos/robos-lib/ai-agent',
      ];
      for (const p of agentPaths) {
        try { aiAgent = require(p); break; } catch {}
      }
      if (aiAgent && typeof aiAgent.ask === 'function') {
        const prompt = `You are an interactive eLearning curriculum authoring agent.
User suggestion: "${clean}"
If this suggestion asks to add a lab step, reply JSON: {"type": "ADD_LAB_STEP", "stepText": "..."}
If this suggestion asks to change title, reply JSON: {"type": "UPDATE_MODULE_TITLE", "title": "..."}
If this suggestion asks to change overview, reply JSON: {"type": "UPDATE_OVERVIEW", "overview": "..."}
If this suggestion asks to add a quiz question, reply JSON: {"type": "ADD_QUIZ_QUESTION", "quiz": {"question": "...", "answer": "...", "options": ["..."]}}
Reply with only valid JSON.`;
        const res = await aiAgent.ask(prompt, { providerId: agentId });
        if (res && res.ok && res.text) {
          const jsonMatch = res.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return { ...parsed, agentId, rawText: clean };
          }
        }
      }
    } catch {}
  }

  return null;
}

function stopVoiceAssistant() {
  if (voiceAssistantState.streamReq) {
    try { voiceAssistantState.streamReq.destroy(); } catch {}
    voiceAssistantState.streamReq = null;
  }
  voiceAssistantState.active = false;
  voiceAssistantState.taskActive = false;

  // Deactivate voice prompt microphone if running
  const deactReq = http.request({
    hostname: '127.0.0.1',
    port: 19188,
    path: '/api/deactivate',
    method: 'POST',
  }, () => {});
  deactReq.on('error', () => {});
  deactReq.end();

  if (win && !win.isDestroyed()) {
    win.webContents.send('elearning:voice-stream-event', { type: 'stream_closed' });
  }

  return { ok: true, active: false };
}

function startVoiceAssistant(options = {}) {
  stopVoiceAssistant();

  const agentId = options.agentId || 'fast-reactive';
  voiceAssistantState.active = true;
  voiceAssistantState.agentId = agentId;
  voiceAssistantState.lastProcessedText = '';
  voiceAssistantState.taskActive = true;

  // 1. Activate voice prompt microphone if daemon is running
  const actReq = http.request({
    hostname: '127.0.0.1',
    port: 19188,
    path: '/api/activate',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, () => {});
  actReq.on('error', () => {});
  actReq.end();

  // 2. Open SSE stream connection to voice prompt daemon
  const sseReq = http.request({
    hostname: '127.0.0.1',
    port: 19188,
    path: '/api/stream',
    method: 'GET',
    headers: { 'Accept': 'text/event-stream' },
  }, (res) => {
    res.setEncoding('utf8');
    let buffer = '';

    res.on('data', async (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep trailing incomplete chunk

      for (const line of lines) {
        if (line.startsWith('data:')) {
          try {
            const data = JSON.parse(line.slice(5).trim());
            if (win && !win.isDestroyed()) {
              win.webContents.send('elearning:voice-stream-event', data);
            }

            if (data && data.text) {
              const text = data.text.trim();
              if (text && text !== voiceAssistantState.lastProcessedText) {
                const mutation = await parseVoiceSuggestion(text, voiceAssistantState.agentId);
                if (mutation && mutation.type) {
                  voiceAssistantState.lastProcessedText = text;
                  if (win && !win.isDestroyed()) {
                    win.webContents.send('elearning:voice-mutation', mutation);
                  }
                }
              }
            }
          } catch {}
        }
      }
    });

    res.on('end', () => {
      stopVoiceAssistant();
    });

    res.on('close', () => {
      stopVoiceAssistant();
    });
  });

  sseReq.on('error', (err) => {
    console.warn('[robos-elearning] SSE voice stream notice:', err.message);
    if (win && !win.isDestroyed()) {
      win.webContents.send('elearning:voice-stream-event', { type: 'stream_error', error: err.message });
    }
  });

  sseReq.end();
  voiceAssistantState.streamReq = sseReq;

  return { ok: true, active: true, agentId };
}

ipcMain.handle('elearning:start-voice-assistant', async (_, opts) => {
  return startVoiceAssistant(opts);
});

ipcMain.handle('elearning:stop-voice-assistant', async () => {
  return stopVoiceAssistant();
});

ipcMain.handle('elearning:get-voice-status', async () => {
  return {
    active: voiceAssistantState.active,
    agentId: voiceAssistantState.agentId,
    taskActive: voiceAssistantState.taskActive,
  };
});

module.exports = {
  parseVoiceSuggestion,
  startVoiceAssistant,
  stopVoiceAssistant,
  getVoiceAssistantState: () => voiceAssistantState,
  getGitInfo,
  createZipBuffer,
  buildStandaloneSlideHtml,
  renderOverviewContent,
  SLIDE_OFFLINE_CSS,
};