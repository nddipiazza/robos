/* global ctx */
'use strict';

const APP_SCOPES = [
  { id: 'global',           label: 'Global' },
  { id: 'task-planner',     label: 'Task Planner' },
  { id: 'workflow-studio',  label: 'Workflow Studio' },
  { id: 'agents-manager',   label: 'Agents Manager' },
  { id: 'work-journal',     label: 'Work Journal' },
];

let data         = { sources: [], app_sources: {} };
let activeScope  = 'global';
let selectedId   = null;
let scanCache    = {};   // id -> { files }

// ── AI spinner (appears next to button while copilot is running) ──────────────
let _spinner = null;
let _spinnerLines = [];

function _attachSpinner(refEl) {
  _detachSpinner();
  const el = document.createElement('span');
  el.className = 'ai-spinner';
  el.innerHTML = '<span class="ai-spinner-tip">...</span>';
  refEl.insertAdjacentElement('afterend', el);
  _spinner = el;
  _spinnerLines = [];
  return el;
}

function _detachSpinner() {
  if (_spinner && _spinner.parentNode) _spinner.parentNode.removeChild(_spinner);
  _spinner = null;
  _spinnerLines = [];
}

function _pushSpinnerLine(text) {
  if (!text || !_spinner) return;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return;
  _spinnerLines.push(...lines);
  if (_spinnerLines.length > 50) _spinnerLines = _spinnerLines.slice(-50);
  const tip = _spinner.querySelector('.ai-spinner-tip');
  if (tip) tip.textContent = _spinnerLines.slice(-10).join('\n');
}

// Return the sources array for the active scope
function scopedSources() {
  if (activeScope === 'global') return data.sources;
  if (!data.app_sources) data.app_sources = {};
  if (!data.app_sources[activeScope]) data.app_sources[activeScope] = [];
  return data.app_sources[activeScope];
}

function setScopedSources(arr) {
  if (activeScope === 'global') data.sources = arr;
  else { if (!data.app_sources) data.app_sources = {}; data.app_sources[activeScope] = arr; }
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  data = await ctx.readSources();
  if (!data.sources) data.sources = [];
  if (!data.app_sources) data.app_sources = {};

  // Feed live AI output chunks into the active spinner tooltip
  ctx.onAiProgress(chunk => _pushSpinnerLine(chunk));

  renderScopeBar();
  renderSourcesList();
  bindAddModal();
  bindBlobModal();
  ctx.onCloneOutput(text => appendCloneOutput(text));
});

// ── Scope bar ─────────────────────────────────────────────────────────────────
function renderScopeBar() {
  const bar = document.getElementById('scope-bar');
  if (!bar) return;
  bar.innerHTML = '';
  for (const scope of APP_SCOPES) {
    const btn = document.createElement('button');
    btn.className = 'scope-btn' + (scope.id === activeScope ? ' active' : '');
    btn.textContent = scope.label;
    const count = scope.id === 'global'
      ? (data.sources || []).length
      : ((data.app_sources || {})[scope.id] || []).length;
    if (count > 0) btn.textContent += ` (${count})`;
    btn.onclick = () => {
      activeScope = scope.id;
      selectedId = null;
      document.getElementById('detail-empty').classList.remove('hidden');
      document.getElementById('detail-content').classList.add('hidden');
      renderScopeBar();
      renderSourcesList();
    };
    bar.appendChild(btn);
  }
  // Update scope label in header
  const lbl = document.getElementById('scope-label');
  if (lbl) {
    const s = APP_SCOPES.find(s => s.id === activeScope);
    lbl.textContent = activeScope === 'global'
      ? 'Global -- applied to all apps'
      : `${s.label} -- extra context for this app only (merged with Global)`;
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
function fileIcon(rel) {
  if (rel.endsWith('.md') || rel.endsWith('.rst')) return '[ ]';
  if (rel.includes('package.json') || rel.includes('pom.xml') || rel.includes('go.mod')) return '[P]';
  if (rel.startsWith('.')) return '[.]';
  return '[ ]';
}
function sourceLocalDesc(src) {
  if (src.type === 'github') return src.ghRepo || '';
  return src.path || '';
}

// ── Sources list (sidebar) ────────────────────────────────────────────────────
function renderSourcesList() {
  const el = document.getElementById('sources-list');
  const sources = scopedSources();
  if (!sources.length) {
    el.innerHTML = '<div class="sources-empty">No sources yet.<br/>Click + Add Source.</div>';
    return;
  }
  el.innerHTML = '';
  for (const src of sources) {
    const active = src.active !== false;
    const item = document.createElement('div');
    item.className = 'source-item' + (src.id === selectedId ? ' selected' : '');
    item.innerHTML = `
      <div class="source-dot ${active ? 'active' : 'inactive'}"></div>
      <div class="source-item-info">
        <div class="source-item-name">${esc(src.name)}</div>
        <div class="source-item-meta">${esc(sourceLocalDesc(src))}</div>
      </div>
      <span class="source-type-pill ${src.type === 'github' ? 'pill-github' : 'pill-local'}">${src.type === 'github' ? 'github' : 'local'}</span>
      <button class="source-remove" title="Remove source">x</button>
    `;
    const rmBtn = item.querySelector('.source-remove');
    rmBtn.onclick = (e) => {
      e.stopPropagation();
      if (!confirm('Remove "' + src.name + '"?')) return;
      setScopedSources(scopedSources().filter(s => s.id !== src.id));
      ctx.writeSources(data);
      if (selectedId === src.id) {
        selectedId = null;
        document.getElementById('detail-empty').classList.remove('hidden');
        document.getElementById('detail-content').classList.add('hidden');
      }
      renderScopeBar();
      renderSourcesList();
    };
    item.onclick = () => selectSource(src.id);
    el.appendChild(item);
  }
}

// ── Select source ─────────────────────────────────────────────────────────────
async function selectSource(id) {
  selectedId = id;
  renderSourcesList();

  const src = scopedSources().find(s => s.id === id);
  if (!src) return;

  document.getElementById('detail-empty').classList.add('hidden');
  document.getElementById('detail-content').classList.remove('hidden');

  document.getElementById('detail-name').textContent = src.name;

  const badge = document.getElementById('detail-type-badge');
  badge.textContent = src.type === 'github' ? 'GitHub' : 'Local';
  badge.className = 'type-badge ' + (src.type === 'github' ? 'pill-github' : 'pill-local');

  document.getElementById('detail-path-row').textContent = sourceLocalDesc(src);

  const descRow = document.getElementById('detail-desc-row');
  if (src.description) {
    descRow.textContent = src.description;
    descRow.classList.remove('hidden');
  } else {
    descRow.classList.add('hidden');
  }

  // Active toggle
  const activeChk = document.getElementById('detail-active');
  activeChk.checked = src.active !== false;
  activeChk.onchange = () => {
    src.active = activeChk.checked;
    ctx.writeSources(data);
    renderSourcesList();
  };

  // Clone status
  const cloneStatus = document.getElementById('detail-clone-status');
  if (src.type === 'local') {
    cloneStatus.textContent = 'Local folder';
    cloneStatus.className = 'clone-status local-ok';
  } else {
    const cloned = await ctx.checkCloned(src);
    cloneStatus.textContent = cloned ? 'Cloned locally' : 'Not yet cloned';
    cloneStatus.className = 'clone-status ' + (cloned ? 'cloned' : 'not-cloned');
  }

  // Action buttons
  const btnClone  = document.getElementById('btn-clone');
  const btnPull   = document.getElementById('btn-pull');
  const btnVscode = document.getElementById('btn-vscode');
  const btnGhLink = document.getElementById('btn-gh-link');

  btnClone.style.display  = src.type === 'github' ? '' : 'none';
  btnPull.style.display   = src.type === 'github' ? '' : 'none';
  btnGhLink.style.display = src.type === 'github' ? '' : 'none';

  btnClone.onclick = async () => {
    showCloneOutput();
    const r = await ctx.cloneSource(src);
    appendCloneOutput(r.ok ? '\n' + r.message + '\n' : '\nError: ' + r.error + '\n');
    selectSource(id);
  };
  btnPull.onclick = async () => {
    showCloneOutput();
    const r = await ctx.pullSource(src);
    appendCloneOutput(r.ok ? '\n' + r.message + '\n' : '\nError: ' + r.error + '\n');
  };
  btnVscode.onclick = () => ctx.openVscode(src);
  btnGhLink.onclick = () => {
    if (src.url) ctx.openUrl(src.url);
    else if (src.ghRepo) ctx.openUrl('https://github.com/' + src.ghRepo);
  };

  document.getElementById('btn-rescan').onclick = () => {
    scanAndRender(src);
    loadSpecialFiles(src);
  };
  document.getElementById('btn-delete').onclick = () => {
    if (!confirm('Remove "' + src.name + '" from context sources?')) return;
    data.sources = data.sources.filter(s => s.id !== id);
    ctx.writeSources(data);
    selectedId = null;
    document.getElementById('detail-empty').classList.remove('hidden');
    document.getElementById('detail-content').classList.add('hidden');
    renderSourcesList();
  };

  // Tab wiring
  document.querySelectorAll('.detail-tab').forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });
  switchTab('files');

  hideCloneOutput();
  if (scanCache[id]) {
    renderFiles(scanCache[id]);
  } else {
    scanAndRender(src);
  }
  loadSpecialFiles(src);

  // Knowledge graph generate button
  document.getElementById('btn-gen-graph').onclick = () => generateKnowledgeGraph(src);
  // AGENTS.md generate + save buttons
  document.getElementById('btn-gen-agents').onclick = () => generateSpecialFile(src, 'agents');
  document.getElementById('btn-save-agents').onclick = () => saveSpecialFile(src, 'agents');
  // Copilot instructions generate + save buttons
  document.getElementById('btn-gen-copilot').onclick = () => generateSpecialFile(src, 'copilot');
  document.getElementById('btn-save-copilot').onclick = () => saveSpecialFile(src, 'copilot');
}

async function scanAndRender(src) {
  const filesList = document.getElementById('files-list');
  filesList.innerHTML = '<span class="list-empty">Scanning...</span>';
  const r = await ctx.scanSource(src);
  if (!r.ok) {
    filesList.innerHTML = `<span class="list-empty" style="color:#f85149">${esc(r.error)}</span>`;
    return;
  }
  scanCache[src.id] = r.files;
  renderFiles(r.files);
}

function renderFiles(files) {
  const filesList = document.getElementById('files-list');
  const countEl   = document.getElementById('files-count');
  countEl.textContent = files.length + ' file' + (files.length === 1 ? '' : 's');

  if (!files.length) {
    filesList.innerHTML = '<span class="list-empty">No context files found in this source</span>';
    return;
  }
  filesList.innerHTML = '';
  for (const f of files) {
    const row = document.createElement('div');
    row.className = 'file-row';
    row.innerHTML = `
      <span class="file-icon">${fileIcon(f.rel)}</span>
      <span class="file-name">${esc(f.rel)}</span>
      <span class="file-size">${fmtSize(f.size)}</span>
      <div class="file-actions">
        <button class="btn btn-ghost" data-rel="${esc(f.rel)}">Preview</button>
      </div>
    `;
    row.querySelector('[data-rel]').onclick = () => previewFile(f.rel);
    filesList.appendChild(row);
  }
}

async function previewFile(rel) {
  const src = data.sources.find(s => s.id === selectedId);
  if (!src) return;
  const r = await ctx.readFile({ src, rel });
  const modal      = document.getElementById('modal-preview');
  const contentEl  = document.getElementById('preview-content');
  const rawEl      = document.getElementById('preview-raw-content');
  const rawBtn     = document.getElementById('btn-preview-raw');

  document.getElementById('preview-filename').textContent = rel;

  const text = r.ok ? r.content : ('Error: ' + r.error);
  rawEl.textContent = text;

  const isMd = rel.match(/\.(md|markdown|rst|txt)$/i) || rel === 'AGENTS.md' || rel === 'CODEOWNERS';
  let showingRaw = !isMd;

  function renderView() {
    if (showingRaw) {
      contentEl.classList.add('hidden');
      rawEl.classList.remove('hidden');
      rawBtn.textContent = 'Rendered';
    } else {
      contentEl.innerHTML = renderMdFull(text);
      contentEl.classList.remove('hidden');
      rawEl.classList.add('hidden');
      rawBtn.textContent = 'Raw';
    }
  }

  rawBtn.onclick = () => { showingRaw = !showingRaw; renderView(); };
  renderView();

  modal.classList.remove('hidden');
  document.getElementById('btn-preview-close').onclick = () => modal.classList.add('hidden');
  modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.detail-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach(p =>
    p.classList.toggle('hidden', p.id !== 'tab-' + name));
}

// ── Special files (AGENTS.md, copilot instructions) ───────────────────────────
async function loadSpecialFiles(src) {
  const r = await ctx.readSpecialFiles(src);
  if (!r.ok) return;

  const agentsEl = document.getElementById('agents-content');
  if (r.agents) {
    agentsEl.innerHTML = renderMd(r.agents);
  } else {
    agentsEl.innerHTML = '<span class="list-empty">No AGENTS.md found in this source.</span>';
  }

  const copilotEl = document.getElementById('copilot-content');
  if (r.copilot) {
    copilotEl.innerHTML = renderMd(r.copilot);
  } else {
    copilotEl.innerHTML = '<span class="list-empty">No .github/copilot-instructions.md found in this source.</span>';
  }
}

// Simple markdown renderer (headings, code blocks, bold, lists)
function renderMd(md) {
  let html = esc(md)
    .replace(/^#{3} (.+)$/gm, '<h3>$1</h3>')
    .replace(/^#{2} (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre>$1</pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '<br/><br/>');
  return html;
}

// Full markdown renderer for file preview
function renderMdFull(md) {
  let html = md
    // Fenced code blocks first
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre class="md-code-block"><code${lang ? ` class="lang-${esc(lang)}"` : ''}>${esc(code)}</code></pre>`)
    // Inline code
    .replace(/`([^`\n]+)`/g, (_, c) => `<code class="md-inline-code">${esc(c)}</code>`)
    // Headings
    .replace(/^#{4} (.+)$/gm, (_, t) => `<h4 class="md-h4">${esc(t)}</h4>`)
    .replace(/^#{3} (.+)$/gm, (_, t) => `<h3 class="md-h3">${esc(t)}</h3>`)
    .replace(/^#{2} (.+)$/gm, (_, t) => `<h2 class="md-h2">${esc(t)}</h2>`)
    .replace(/^# (.+)$/gm,    (_, t) => `<h1 class="md-h1">${esc(t)}</h1>`)
    // Horizontal rules
    .replace(/^---+$/gm, '<hr class="md-hr"/>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, (_, t) => `<strong><em>${esc(t)}</em></strong>`)
    .replace(/\*\*(.+?)\*\*/g,     (_, t) => `<strong>${esc(t)}</strong>`)
    .replace(/__(.+?)__/g,          (_, t) => `<strong>${esc(t)}</strong>`)
    .replace(/\*(.+?)\*/g,          (_, t) => `<em>${esc(t)}</em>`)
    .replace(/_(.+?)_/g,            (_, t) => `<em>${esc(t)}</em>`)
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) =>
      `<a href="#" class="md-link" data-href="${esc(href)}" onclick="ctx.openUrl(this.dataset.href);return false">${esc(text)}</a>`)
    // Blockquotes
    .replace(/^> (.+)$/gm, (_, t) => `<blockquote class="md-blockquote">${esc(t)}</blockquote>`)
    // Unordered lists
    .replace(/((?:^[-*+] .+\n?)+)/gm, block => {
      const items = block.trim().split('\n').map(l => `<li>${esc(l.replace(/^[-*+] /, ''))}</li>`).join('');
      return `<ul class="md-ul">${items}</ul>`;
    })
    // Ordered lists
    .replace(/((?:^\d+\. .+\n?)+)/gm, block => {
      const items = block.trim().split('\n').map(l => `<li>${esc(l.replace(/^\d+\. /, ''))}</li>`).join('');
      return `<ol class="md-ol">${items}</ol>`;
    })
    // Paragraphs (blank line separation)
    .replace(/\n{2,}/g, '</p><p class="md-p">')
    .replace(/\n/g, '<br/>');
  return `<div class="md-body"><p class="md-p">${html}</p></div>`;
}

// ── Generate special files via AI ─────────────────────────────────────────────
// type: 'agents' | 'copilot'
async function generateSpecialFile(src, type) {
  const btnGen    = document.getElementById('btn-gen-' + type);
  const btnSave   = document.getElementById('btn-save-' + type);
  const statusEl  = document.getElementById(type + '-status');
  const contentEl = document.getElementById(type + '-content');

  btnGen.disabled = true;
  btnGen.textContent = 'Generating...';
  _attachSpinner(btnGen);
  statusEl.textContent = 'AI agent is analyzing the project and generating content...';
  statusEl.classList.remove('hidden');

  const r = type === 'agents'
    ? await ctx.generateAgentsMd(src)
    : await ctx.generateCopilotInstructions(src);

  _detachSpinner();
  btnGen.disabled = false;
  btnGen.textContent = 'Regenerate';

  if (!r.ok) {
    statusEl.textContent = 'Error: ' + (r.error || 'unknown');
    return;
  }

  statusEl.classList.add('hidden');
  // Store generated content for saving
  contentEl._generatedContent = r.content;
  contentEl.innerHTML = '<div style="white-space:pre-wrap;font-size:12px;line-height:1.6">' + esc(r.content) + '</div>';
  btnSave.classList.remove('hidden');
}

async function saveSpecialFile(src, type) {
  const contentEl = document.getElementById(type + '-content');
  const btnSave   = document.getElementById('btn-save-' + type);
  const content   = contentEl._generatedContent;
  if (!content) return;

  const relPath = type === 'agents' ? 'AGENTS.md' : '.github/copilot-instructions.md';
  const r = await ctx.writeRepoFile({ src, rel: relPath, content });
  if (r.ok) {
    btnSave.textContent = 'Saved!';
    btnSave.disabled = true;
    setTimeout(() => { btnSave.textContent = 'Save to Repo'; btnSave.disabled = false; }, 3000);
    // Reload from disk
    loadSpecialFiles(src);
  } else {
    alert('Save failed: ' + r.error);
  }
}


async function generateKnowledgeGraph(src) {
  const statusEl    = document.getElementById('graph-status');
  const containerEl = document.getElementById('graph-container');
  const btn         = document.getElementById('btn-gen-graph');

  btn.disabled = true;
  btn.textContent = 'Generating...';
  _attachSpinner(btn);
  statusEl.textContent = 'Asking AI to analyze context and generate Mermaid diagram...';
  statusEl.classList.remove('hidden');
  containerEl.innerHTML = '';

  const r = await ctx.generateKnowledgeGraph(src);
  _detachSpinner();
  btn.disabled = false;
  btn.textContent = 'Regenerate';

  if (!r.ok) {
    statusEl.textContent = 'Error: ' + (r.error || 'unknown');
    containerEl.innerHTML = r.raw ? `<div class="graph-raw">${esc(r.raw)}</div>` : '';
    return;
  }

  statusEl.classList.add('hidden');
  containerEl.innerHTML = `<div class="graph-raw">${esc(r.mermaid)}</div>` +
    '<div class="list-empty">Mermaid rendering requires mermaid.min.js vendor file.</div>';
}


function showCloneOutput() {
  document.getElementById('clone-output-box').classList.remove('hidden');
  document.getElementById('clone-output-pre').textContent = '';
}
function hideCloneOutput() {
  document.getElementById('clone-output-box').classList.add('hidden');
  document.getElementById('clone-output-pre').textContent = '';
}
function appendCloneOutput(text) {
  const pre = document.getElementById('clone-output-pre');
  pre.textContent += text;
  pre.scrollTop = pre.scrollHeight;
  document.getElementById('clone-output-box').classList.remove('hidden');
}

// ── Blob modal ────────────────────────────────────────────────────────────────
function bindBlobModal() {
  const modal = document.getElementById('modal-blob');
  document.getElementById('btn-view-blob').onclick = async () => {
    const r = await ctx.buildContextBlob();
    document.getElementById('blob-content').value = r.ok
      ? (r.blob || '(no active sources with readable files)')
      : ('Error: ' + r.error);
    modal.classList.remove('hidden');
  };
  document.getElementById('btn-blob-close').onclick = () => modal.classList.add('hidden');
  document.getElementById('btn-blob-copy').onclick = () => {
    const val = document.getElementById('blob-content').value;
    navigator.clipboard.writeText(val).catch(() => {});
  };
  modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
}

// ── Add modal ─────────────────────────────────────────────────────────────────
function bindAddModal() {
  const modal     = document.getElementById('modal-add');
  const ghSection = document.getElementById('gh-section');
  const lcSection = document.getElementById('local-section');
  const ghSel     = document.getElementById('gh-selected');
  const ghSelName = document.getElementById('gh-selected-name');
  const addName   = document.getElementById('add-name');
  const addDesc   = document.getElementById('add-desc');
  const errBox    = document.getElementById('modal-error');
  const confirmBtn= document.getElementById('btn-modal-confirm');

  let modalType    = 'github';
  let selectedRepo = null;   // git-projects project object
  let gitProjects  = [];
  let projectsLoaded = false;

  // Open modal
  document.getElementById('btn-add').onclick = async () => {
    modalType = 'github';
    selectedRepo = null;
    addName.value = '';
    addDesc.value = '';
    ghSel.classList.add('hidden');
    errBox.classList.add('hidden');
    confirmBtn.disabled = true;
    document.getElementById('local-path').value = '';
    document.getElementById('gh-proj-search').value = '';
    setType('github');
    modal.classList.remove('hidden');
    if (!projectsLoaded) await loadGitProjects();
  };

  document.getElementById('btn-modal-cancel').onclick = () => modal.classList.add('hidden');
  modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };

  // Type toggle
  document.querySelectorAll('.type-toggle-btn').forEach(btn => {
    btn.onclick = () => setType(btn.dataset.type);
  });
  function setType(t) {
    modalType = t;
    document.querySelectorAll('.type-toggle-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.type === t));
    ghSection.classList.toggle('hidden', t !== 'github');
    lcSection.classList.toggle('hidden', t !== 'local');
    confirmBtn.disabled = true;
    validateModal();
  }

  // Browse folder
  document.getElementById('btn-browse').onclick = async () => {
    const p = await ctx.browseFolder();
    if (p) {
      document.getElementById('local-path').value = p;
      if (!addName.value) addName.value = p.split('/').pop();
      validateModal();
    }
  };
  document.getElementById('local-path').addEventListener('input', () => validateModal());

  async function loadGitProjects() {
    const listEl = document.getElementById('gh-projects-list');
    listEl.innerHTML = '<div class="gh-projects-loading">Loading projects...</div>';
    gitProjects = await ctx.listGitProjects();
    projectsLoaded = true;
    renderProjectsList('');
    document.getElementById('gh-proj-search').focus();
  }

  function renderProjectsList(q) {
    const listEl = document.getElementById('gh-projects-list');
    const existingRepos = new Set(data.sources.filter(s => s.type === 'github').map(s => s.ghRepo));
    const lq = q.toLowerCase();
    const available = gitProjects.filter(p => {
      if (existingRepos.has(p.org + '/' + p.repo)) return false;
      if (!lq) return true;
      return (p.label || p.repo).toLowerCase().includes(lq) ||
             (p.org + '/' + p.repo).toLowerCase().includes(lq);
    });
    if (!available.length) {
      listEl.innerHTML = `<div class="gh-projects-loading">${lq ? 'No matches.' : 'No git projects found. Add repos in Git Projects first.'}</div>`;
      return;
    }
    listEl.innerHTML = '';
    available.forEach(proj => {
      const nameWithOwner = proj.org + '/' + proj.repo;
      const item = document.createElement('div');
      item.className = 'gh-proj-item' + (selectedRepo && selectedRepo.id === proj.id ? ' active' : '');
      item.innerHTML = `
        <div class="gh-proj-name">${esc(proj.label || proj.repo)}</div>
        <div class="gh-proj-meta">${esc(nameWithOwner)}${proj.localPath ? ' - ' + esc(proj.localPath) : ''}</div>
      `;
      item.onclick = () => {
        selectedRepo = proj;
        listEl.querySelectorAll('.gh-proj-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        document.getElementById('gh-selected-name').textContent = nameWithOwner;
        document.getElementById('gh-selected').classList.remove('hidden');
        if (!addName.value) addName.value = proj.label || proj.repo;
        validateModal();
      };
      listEl.appendChild(item);
    });
  }

  document.getElementById('gh-clear').onclick = () => {
    selectedRepo = null;
    ghSel.classList.add('hidden');
    document.getElementById('gh-projects-list').querySelectorAll('.gh-proj-item')
      .forEach(el => el.classList.remove('active'));
    validateModal();
  };

  document.getElementById('gh-proj-search').addEventListener('input', e => {
    renderProjectsList(e.target.value.trim());
  });

  addName.addEventListener('input', validateModal);

  function validateModal() {
    errBox.classList.add('hidden');
    if (modalType === 'github') {
      confirmBtn.disabled = !selectedRepo || !addName.value.trim();
    } else {
      confirmBtn.disabled = !document.getElementById('local-path').value.trim() || !addName.value.trim();
    }
  }

  confirmBtn.onclick = () => {
    const name = addName.value.trim();
    const desc = addDesc.value.trim();
    let src;
    if (modalType === 'github') {
      if (!selectedRepo) return;
      const nameWithOwner = selectedRepo.org + '/' + selectedRepo.repo;
      src = {
        id: 's-' + Date.now(),
        type: 'github',
        name,
        description: desc,
        ghRepo: nameWithOwner,
        url: selectedRepo.url || ('https://github.com/' + nameWithOwner),
        localPath: selectedRepo.localPath || null,
        active: true,
      };
    } else {
      const p = document.getElementById('local-path').value.trim();
      if (!p) return;
      src = {
        id: 's-' + Date.now(),
        type: 'local',
        name,
        description: desc,
        path: p,
        active: true,
      };
    }
    scopedSources().push(src);
    ctx.writeSources(data);
    modal.classList.add('hidden');
    renderScopeBar();
    renderSourcesList();
    selectSource(src.id);
  };
}



// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'context-manager');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────
