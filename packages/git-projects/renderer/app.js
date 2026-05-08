// ── State ────────────────────────────────────────────────────────────────────
let data         = { projects: [] };
let selectedId   = null;
let filterText   = '';
let sortOrder    = 'name-asc';
let collapsedSet = new Set();   // collapsed tree node keys

// ── Monaco script editors ─────────────────────────────────────────────────────
const monacoEditors = {};  // key → monaco editor instance

function initMonacoEditors() {
  require.config({ paths: { vs: '../node_modules/monaco-editor/min/vs' } });
  require(['vs/editor/editor.main'], () => {
    const SCRIPT_KEYS = [
      { key: 'setup',         containerId: 'monaco-setup',         textareaId: 'devsetup-script',        language: 'shell'    },
      { key: 'start',         containerId: 'monaco-start',         textareaId: 'start-script',           language: 'shell'    },
      { key: 'test',          containerId: 'monaco-test',          textareaId: 'test-script',            language: 'shell'    },
      { key: 'e2e',           containerId: 'monaco-e2e',           textareaId: 'e2e-script',             language: 'shell'    },
      { key: 'instructions',  containerId: 'monaco-instructions',  textareaId: 'devsetup-instructions',  language: 'markdown' },
    ];
    for (const { key, containerId, textareaId, language } of SCRIPT_KEYS) {
      const container = document.getElementById(containerId);
      if (!container) continue;
      const textarea  = document.getElementById(textareaId);
      const isInstructions = key === 'instructions';
      const ed = monaco.editor.create(container, {
        value: textarea ? textarea.value : '',
        language,
        theme: 'vs-dark',
        minimap: { enabled: false },
        lineNumbers: isInstructions ? 'on' : 'off',
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        fontSize: 12,
        lineHeight: 19,
        renderLineHighlight: 'none',
        scrollbar: { vertical: 'auto', horizontal: 'hidden' },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        padding: { top: 6, bottom: 6 },
        automaticLayout: true,
      });
      monacoEditors[key] = ed;
      if (!isInstructions) {
        // Script editors in tabs: only expand on focus if NOT already a tall tab-editor
        if (!container.classList.contains('tab-editor')) {
          ed.onDidFocusEditorWidget(() => { container.classList.add('expanded'); ed.layout(); });
          ed.onDidBlurEditorWidget(()  => { container.classList.remove('expanded'); ed.layout(); });
        }
      }
      // Keep hidden textarea in sync and refresh dots
      ed.onDidChangeModelContent(() => {
        if (textarea) textarea.value = ed.getValue();
        updateDevSetupDots();
      });
    }
  });
}

// Helper: set value on a Monaco editor (falls back to textarea if not ready)
function setScriptEditorValue(key, value) {
  if (monacoEditors[key]) {
    monacoEditors[key].setValue(value || '');
  } else {
    const taMap = { setup: 'devsetup-script', start: 'start-script', test: 'test-script', e2e: 'e2e-script', instructions: 'devsetup-instructions' };
    const ta = document.getElementById(taMap[key]);
    if (ta) ta.value = value || '';
  }
}

// Helper: get value from Monaco editor (falls back to textarea)
function getScriptEditorValue(key) {
  if (monacoEditors[key]) return monacoEditors[key].getValue();
  const taMap = { setup: 'devsetup-script', start: 'start-script', test: 'test-script', e2e: 'e2e-script', instructions: 'devsetup-instructions' };
  const ta = document.getElementById(taMap[key]);
  return ta ? ta.value : '';
}

function showInstructionsPreview() {
  const btnPreview = document.getElementById('btn-md-preview');
  const previewPane = document.getElementById('devsetup-instructions-preview');
  const editorWrap = document.getElementById('monaco-instructions');
  if (!previewPane) return;
  const src = getScriptEditorValue('instructions');
  previewPane.innerHTML = window.marked ? marked.parse(src) : `<pre>${src}</pre>`;
  previewPane.classList.remove('hidden');
  if (editorWrap) editorWrap.classList.add('hidden');
  if (btnPreview) btnPreview.classList.add('active');
}

function hideInstructionsPreview() {
  const btnPreview = document.getElementById('btn-md-preview');
  const previewPane = document.getElementById('devsetup-instructions-preview');
  const editorWrap = document.getElementById('monaco-instructions');
  if (!previewPane) return;
  previewPane.classList.add('hidden');
  if (editorWrap) editorWrap.classList.remove('hidden');
  if (btnPreview) btnPreview.classList.remove('active');
}

// ── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  data = await gp.readProjects();
  if (!data.projects) data.projects = [];

  // Check clone status for all projects
  await refreshCloneStatus();

  renderTree();
  bindAddModal();
  bindGroupPicker();
  bindOrgPicker();
  initAIReposPanel();
  bindSearch();
  bindSort();

  gp.onCloneOutput(text => appendOutput(text));
  initMonacoEditors();

  // Preview toggle for setup instructions markdown editor
  const btnPreview = document.getElementById('btn-md-preview');
  const previewPane = document.getElementById('devsetup-instructions-preview');
  const editorWrap = document.getElementById('monaco-instructions');
  if (btnPreview && previewPane) {
    btnPreview.addEventListener('click', () => {
      const showing = !previewPane.classList.contains('hidden');
      if (showing) {
        hideInstructionsPreview();
      } else {
        showInstructionsPreview();
      }
    });
  }
  // Wire @-mention file typeahead for all robos-ai-textarea elements
  customElements.whenDefined('robos-ai-textarea').then(() => {
    document.querySelectorAll('robos-ai-textarea').forEach(el => {
      el.addEventListener('robos-path-query', async (e) => {
        const r = await gp.listPath(e.detail.query);
        if (r && r.ok) el._showMentions(r.items);
      });
    });
  });
});

async function refreshCloneStatus() {
  for (const p of data.projects) {
    p._cloned = await gp.checkCloned(p.localPath);
  }
}

// ── Tree ─────────────────────────────────────────────────────────────────────
function switchDevSetupTab(key) {
  document.querySelectorAll('.devsetup-tab').forEach(b => b.classList.toggle('active', b.dataset.dstab === key));
  document.querySelectorAll('.devsetup-tab-pane').forEach(p => p.classList.toggle('hidden', p.id !== `devsetup-tab-${key}`));
  // Re-layout Monaco editor for the newly visible tab
  const edKey = key === 'setup' ? 'setup' : key;
  if (monacoEditors[edKey]) setTimeout(() => monacoEditors[edKey].layout(), 10);
}

function updateDevSetupDots() {
  const tabKeys = ['instructions', 'setup', 'start', 'test', 'e2e'];
  for (const key of tabKeys) {
    const dot = document.getElementById(`dot-${key}`);
    if (!dot) continue;
    const val = getScriptEditorValue(key);
    dot.classList.toggle('filled', !!(val && val.trim()));
  }
}

function buildTree(projects) {
  // Group: host → org → [projects]
  const tree = {};
  for (const p of projects) {
    if (!tree[p.host])              tree[p.host] = {};
    if (!tree[p.host][p.org])       tree[p.host][p.org] = [];
    tree[p.host][p.org].push(p);
  }
  return tree;
}

function sortProjects(projects) {
  const sorted = [...projects];
  switch (sortOrder) {
    case 'name-asc':       return sorted.sort((a, b) => (a.label || a.repo).localeCompare(b.label || b.repo));
    case 'name-desc':      return sorted.sort((a, b) => (b.label || b.repo).localeCompare(a.label || a.repo));
    case 'host-org':       return sorted.sort((a, b) => `${a.host}/${a.org}/${a.repo}`.localeCompare(`${b.host}/${b.org}/${b.repo}`));
    case 'cloned-first':   return sorted.sort((a, b) => (b._cloned ? 1 : 0) - (a._cloned ? 1 : 0) || (a.label || a.repo).localeCompare(b.label || b.repo));
    case 'uncloned-first': return sorted.sort((a, b) => (a._cloned ? 1 : 0) - (b._cloned ? 1 : 0) || (a.label || a.repo).localeCompare(b.label || b.repo));
    default:               return sorted;
  }
}

function renderTree() {
  const container = document.getElementById('project-tree');
  const q = filterText.toLowerCase();

  const filtered = data.projects.filter(p =>
    !q || p.repo.toLowerCase().includes(q) ||
         p.org.toLowerCase().includes(q)  ||
         (p.label || '').toLowerCase().includes(q)
  );
  const visible = sortProjects(filtered);

  if (!visible.length) {
    container.innerHTML = `<div class="tree-empty">${data.projects.length ? 'No matches' : 'No projects yet'}</div>`;
    return;
  }

  const tree = buildTree(visible);
  container.innerHTML = '';

  for (const host of Object.keys(tree).sort()) {
    const hostKey    = `h:${host}`;
    const hostOpen   = !collapsedSet.has(hostKey);
    const hostGroup  = document.createElement('div');
    hostGroup.className = 'tree-group';

    const hostHdr = document.createElement('div');
    hostHdr.className = 'tree-host-hdr';
    hostHdr.innerHTML = `<span class="tree-chevron ${hostOpen ? 'open' : ''}">▶</span>🌐 ${host}`;
    hostHdr.onclick = () => { collapsedSet[hostOpen ? 'add' : 'delete'](hostKey); renderTree(); };

    const hostBody = document.createElement('div');
    hostBody.className = 'tree-host-body';
    if (!hostOpen) { hostBody.style.display = 'none'; }

    for (const org of Object.keys(tree[host]).sort()) {
      const orgKey   = `o:${host}/${org}`;
      const orgOpen  = !collapsedSet.has(orgKey);
      const orgGroup = document.createElement('div');
      orgGroup.className = 'tree-group';

      const orgHdr = document.createElement('div');
      orgHdr.className = 'tree-org-hdr';
      orgHdr.innerHTML = `<span class="tree-chevron ${orgOpen ? 'open' : ''}">▶</span><span class="tree-org-label">📂 ${org}</span><button class="tree-delete-btn" title="Remove all ${org} projects from list" data-host="${escHtml(host)}" data-org="${escHtml(org)}">✕</button>`;
      orgHdr.onclick = (e) => {
        if (e.target.closest('.tree-delete-btn')) {
          e.stopPropagation();
          deleteOrg(e.target.closest('.tree-delete-btn').dataset.host, e.target.closest('.tree-delete-btn').dataset.org);
          return;
        }
        collapsedSet[orgOpen ? 'add' : 'delete'](orgKey); renderTree();
      };

      const orgBody = document.createElement('div');
      orgBody.className = 'tree-org-body';
      if (!orgOpen) { orgBody.style.display = 'none'; }

      // Sort repos within org by selected order
      const orgProjects = sortProjects(tree[host][org]);
      for (const p of orgProjects) {
        const row = document.createElement('div');
        row.className = `tree-repo${p.id === selectedId ? ' selected' : ''}`;
        row.dataset.id = p.id;
        const explorerBtn = p._cloned
          ? `<button class="tree-explorer-btn" title="Open in File Explorer" data-explore="${escHtml(p.localPath)}">📂</button>`
          : '';
        row.innerHTML = `<span class="clone-dot ${p._cloned ? '' : 'not-cloned'}"></span><span class="tree-repo-name">${escHtml(p.label || p.repo)}</span>${explorerBtn}<button class="tree-delete-btn tree-repo-delete-btn" title="Remove from list" data-id="${escHtml(p.id)}">✕</button>`;
        row.onclick = (e) => {
          const delBtn = e.target.closest('.tree-repo-delete-btn');
          if (delBtn) { e.stopPropagation(); deleteProject(delBtn.dataset.id); return; }
          const btn = e.target.closest('[data-explore]');
          if (btn) { e.stopPropagation(); openInExplorer(btn.dataset.explore); return; }
          selectProject(p.id);
        };
        orgBody.appendChild(row);
      }

      orgGroup.appendChild(orgHdr);
      orgGroup.appendChild(orgBody);
      hostBody.appendChild(orgGroup);
    }

    hostGroup.appendChild(hostHdr);
    hostGroup.appendChild(hostBody);
    container.appendChild(hostGroup);
  }
}

// ── Select / detail ───────────────────────────────────────────────────────────
async function selectProject(id) {
  selectedId = id;
  renderTree();

  const p = data.projects.find(x => x.id === id);
  if (!p) return;

  p._cloned = await gp.checkCloned(p.localPath);

  document.getElementById('detail-empty').classList.add('hidden');
  document.getElementById('detail-content').classList.remove('hidden');

  document.getElementById('detail-repo-name').textContent = p.label || p.repo;

  const clipSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const clipBtn = (id, getText) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.onclick = () => {
      navigator.clipboard.writeText(getText()).then(() => {
        btn.innerHTML = '✓';
        btn.style.color = '#3fb950';
        setTimeout(() => { btn.innerHTML = clipSvg; btn.style.color = ''; }, 1200);
      });
    };
  };
  const httpsUrl = p.url.startsWith('git@') ? p.url.replace('git@github.com:', 'https://github.com/').replace(/\.git$/, '') : p.url.replace(/\.git$/, '');
  const sshUrl   = p.url.startsWith('git@') ? p.url : p.url.replace('https://github.com/', 'git@github.com:') + (p.url.endsWith('.git') ? '' : '.git');
  clipBtn('clip-name',  () => p.label || p.repo);
  clipBtn('clip-https', () => httpsUrl);
  clipBtn('clip-ssh',   () => sshUrl);
  clipBtn('clip-path',  () => p.localPath);

  // Show SSH row
  const sshRow = document.getElementById('detail-ssh-row');
  document.getElementById('detail-ssh').textContent = sshUrl;
  sshRow.classList.remove('hidden');

  const badge = document.getElementById('detail-clone-badge');
  badge.textContent = p._cloned ? '✓ Cloned' : 'Not cloned';
  badge.className   = `clone-badge ${p._cloned ? 'cloned' : 'not-cloned'}`;

  const urlEl = document.getElementById('detail-url');
  urlEl.textContent = p.url;
  urlEl.onclick = (e) => { e.preventDefault(); gp.openBrowser(p.url); };

  document.getElementById('detail-path').textContent = p.localPath;

  const notesRow = document.getElementById('detail-notes-row');
  if (p.notes) {
    notesRow.classList.remove('hidden');
    document.getElementById('detail-notes').textContent = p.notes;
  } else {
    notesRow.classList.add('hidden');
  }

  // Action buttons
  document.getElementById('btn-clone').disabled    = !!p._cloned;
  document.getElementById('btn-pull').disabled     = !p._cloned;
  document.getElementById('btn-open-ide').disabled = !p._cloned;
  document.getElementById('btn-terminal').disabled = !p._cloned;

  document.getElementById('btn-clone').onclick    = () => doClone(p);
  document.getElementById('btn-pull').onclick     = () => doPull(p);
  document.getElementById('btn-terminal').onclick = () => gp.openTerminal(p.localPath);
  document.getElementById('btn-browser').onclick  = () => gp.openBrowser(p.url);
  wireIdeDropdown(p);

  // Tab edit fields
  document.getElementById('edit-label').value = p.label || '';
  document.getElementById('edit-url').value   = p.url;
  document.getElementById('edit-path').value  = p.localPath;
  document.getElementById('edit-notes').value = p.notes || '';

  document.getElementById('btn-save-edit').onclick = () => saveEdit(p.id);

  setScriptEditorValue('instructions', p.devSetupInstructions || '');
  setScriptEditorValue('setup', p.devSetupScript || '');
  setScriptEditorValue('start', p.startScript    || '');
  setScriptEditorValue('test',  p.testScript     || '');
  setScriptEditorValue('e2e',   p.e2eScript      || '');
  document.getElementById('devsetup-output').classList.add('hidden');
  document.getElementById('devsetup-pre').textContent = '';
  document.getElementById('devsetup-fix-row').classList.add('hidden');
  document.getElementById('ai-fix-status').classList.add('hidden');
  document.getElementById('devsetup-ai-prompt').value = '';
  document.getElementById('ai-devsetup-status').classList.add('hidden');
  document.getElementById('devsetup-questionnaire').classList.add('hidden');
  updateDevSetupDots();

  // Wire devsetup inner tab switching
  document.querySelectorAll('.devsetup-tab').forEach(btn => {
    btn.onclick = () => switchDevSetupTab(btn.dataset.dstab);
  });
  switchDevSetupTab('instructions');
  if (getScriptEditorValue('instructions').trim()) showInstructionsPreview();

  // Script buttons
  document.getElementById('btn-run-devsetup').onclick          = () => runDevSetup(p);
  document.getElementById('btn-refine-script').onclick         = () => refineDevSetupField(p, 'script');
  document.getElementById('btn-run-start').onclick             = () => runStartScript(p);
  document.getElementById('btn-refine-start').onclick          = () => refineDevSetupField(p, 'start');
  document.getElementById('btn-run-test').onclick              = () => runScriptGeneric(p, 'test');
  document.getElementById('btn-refine-test').onclick           = () => refineDevSetupField(p, 'test');
  document.getElementById('btn-run-e2e').onclick               = () => runScriptGeneric(p, 'e2e');
  document.getElementById('btn-refine-e2e').onclick            = () => refineDevSetupField(p, 'e2e');

  // "Run in IntelliJ" buttons — open git project in IntelliJ via RobOS plugin, run named config
  document.querySelectorAll('.btn-run-intellij').forEach(btn => {
    btn.onclick = () => runInIntellij(p, btn.dataset.key);
  });
  ['start','test','e2e'].forEach(key => {
    document.getElementById(`${key}-output`).classList.add('hidden');
    document.getElementById(`${key}-pre`).textContent = '';
    document.getElementById(`${key}-fix-row`).classList.add('hidden');
    document.getElementById(`ai-fix-${key}-status`).classList.add('hidden');
  });

  document.getElementById('btn-save-devsetup').onclick        = () => saveDevSetup(p.id);
  document.getElementById('btn-ai-devsetup').onclick          = () => buildAiDevSetup(p);
  document.getElementById('btn-ai-interview').onclick         = () => startDevSetupInterview(p);
  document.getElementById('btn-refine-instructions').onclick  = () => refineDevSetupField(p, 'instructions');
  document.getElementById('btn-questionnaire-cancel').onclick = () => {
    document.getElementById('devsetup-questionnaire').classList.add('hidden');
  };

  // Secrets tab
  renderSecretsTable(p.secrets || []);
  document.getElementById('btn-add-secret').onclick         = () => addSecretRow();
  document.getElementById('btn-save-secrets').onclick       = () => saveSecrets(p.id);
  document.getElementById('btn-ai-detect-secrets').onclick  = () => aiDetectSecrets(p);
  const secretsStatus = document.getElementById('ai-secrets-status');
  if (secretsStatus) { secretsStatus.textContent = ''; secretsStatus.classList.add('hidden'); }

  // Load commits + branches
  loadCommits(p.localPath);
  loadBranches(p.localPath);

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });
  switchTab('commits');

  clearOutput();
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => {
    const isActive = c.id === `tab-${tab}`;
    c.classList.remove('hidden');   // hidden has !important — must remove before showing
    c.classList.toggle('active', isActive);
    c.style.display = isActive ? 'block' : 'none';
  });
  // When devsetup tab becomes visible, Monaco editors were initialized while hidden (0×0).
  // Force layout on all editors so they render at their correct CSS dimensions.
  if (tab === 'devsetup') {
    setTimeout(() => Object.values(monacoEditors).forEach(ed => ed && ed.layout()), 30);
  }
}

async function loadCommits(lp) {
  const list = document.getElementById('commits-list');
  list.innerHTML = '<span class="list-empty">Loading…</span>';
  try {
    const r = await gp.getLog(lp);
    if (!r || !r.ok) {
      list.innerHTML = '<span class="list-empty">Not cloned</span>';
      return;
    }
    if (!r.commits.length) {
      list.innerHTML = '<span class="list-empty">Empty repository — no commits yet</span>';
      return;
    }
    list.innerHTML = '';
    r.commits.forEach(line => {
      const sha = line.slice(0, 7);
      const msg = line.slice(8);
      const row = document.createElement('div');
      row.className = 'commit-row';
      row.innerHTML = `<span class="commit-sha">${sha}</span><span class="commit-msg">${escHtml(msg)}</span>`;
      list.appendChild(row);
    });
  } catch {
    list.innerHTML = '<span class="list-empty">Failed to load commits</span>';
  }
}

async function loadBranches(lp) {
  const list = document.getElementById('branches-list');
  list.innerHTML = '<span class="list-empty">Loading…</span>';
  try {
    const r = await gp.getBranches(lp);
    if (!r || !r.ok) {
      list.innerHTML = '<span class="list-empty">Not cloned</span>';
      return;
    }
    if (!r.branches.length) {
      list.innerHTML = '<span class="list-empty">Empty repository — no branches yet</span>';
      return;
    }
    list.innerHTML = '';
    r.branches.forEach(b => {
      const isRemote = b.startsWith('remotes/') || b.startsWith('origin/');
      const row = document.createElement('div');
      row.className = 'branch-row';
      row.innerHTML = `<span class="branch-icon ${isRemote ? 'branch-remote' : ''}">${isRemote ? '☁' : '⎇'}</span><span class="branch-name ${isRemote ? 'branch-remote' : ''}">${escHtml(b)}</span>`;
      list.appendChild(row);
    });
  } catch {
    list.innerHTML = '<span class="list-empty">Failed to load branches</span>';
  }
}

// ── Open in File Explorer ─────────────────────────────────────────────────────
function openInExplorer(localPath) {
  gp.openInExplorer(localPath);
}

// ── IDE dropdown ─────────────────────────────────────────────────────────────
let _cachedIDEs = null;

async function wireIdeDropdown(p) {
  const btn = document.getElementById('btn-open-ide');
  const menu = document.getElementById('ide-dropdown-menu');
  if (!btn || !menu) return;

  btn.onclick = async (e) => {
    e.stopPropagation();
    if (!menu.classList.contains('hidden')) { menu.classList.add('hidden'); return; }
    if (!_cachedIDEs) _cachedIDEs = await gp.getInstalledIDEs();
    menu.innerHTML = '';
    if (!_cachedIDEs.length) {
      menu.innerHTML = '<div class="ide-dropdown-empty">No IDEs detected</div>';
    } else {
      for (const ide of _cachedIDEs) {
        const item = document.createElement('button');
        item.className = 'ide-dropdown-item';
        item.textContent = ide.name;
        item.addEventListener('click', (ev) => {
          ev.stopPropagation();
          menu.classList.add('hidden');
          gp.openInIDE(ide.cmd, p.localPath);
        });
        menu.appendChild(item);
      }
    }
    menu.classList.remove('hidden');
  };

  // Close dropdown when clicking outside
  document.addEventListener('mousedown', (e) => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) menu.classList.add('hidden');
  });
}

// ── Clone / Pull ──────────────────────────────────────────────────────────────
async function doClone(p) {
  showOutput();
  appendOutput(`Cloning ${p.url} → ${p.localPath}\n`);
  const r = await gp.clone(p.url, p.localPath);
  appendOutput(r.ok ? `\n✓ ${r.message}\n` : `\n✗ ${r.error}\n`);
  if (r.ok) {
    p._cloned = true;
    renderTree();
    selectProject(p.id);
  }
}

async function doPull(p) {
  showOutput();
  appendOutput(`Pulling in ${p.localPath}…\n`);
  const r = await gp.pull(p.localPath);
  appendOutput(r.ok ? `✓ ${r.message}\n` : `✗ ${r.error}\n`);
  if (r.ok) loadCommits(p.localPath);
}

// ── Edit / Delete ─────────────────────────────────────────────────────────────
function saveEdit(id) {
  const p = data.projects.find(x => x.id === id);
  if (!p) return;
  p.label     = document.getElementById('edit-label').value.trim();
  p.url       = document.getElementById('edit-url').value.trim();
  p.localPath = document.getElementById('edit-path').value.trim();
  p.notes     = document.getElementById('edit-notes').value.trim();
  gp.writeProjects(data);
  selectProject(id);
  renderTree();
}

function saveDevSetup(id) {
  const p = data.projects.find(x => x.id === id);
  if (!p) return;
  p.devSetupInstructions = getScriptEditorValue('instructions');
  p.devSetupScript       = getScriptEditorValue('setup');
  p.startScript          = getScriptEditorValue('start');
  p.testScript           = getScriptEditorValue('test');
  p.e2eScript            = getScriptEditorValue('e2e');
  gp.writeProjects(data);
  updateDevSetupDots();
  const btn = document.getElementById('btn-save-devsetup');
  btn.textContent = '✓ Saved';
  setTimeout(() => { btn.textContent = 'Save Dev Setup'; }, 2000);
}

function runDevSetup(p) { return runScriptGeneric(p, 'setup'); }
function runStartScript(p) { return runScriptGeneric(p, 'start'); }

async function runInIntellij(p, key) {
  if (!p._cloned) { alert('Project must be cloned first.'); return; }
  const scripts = {
    setup: getScriptEditorValue('setup'),
    start: getScriptEditorValue('start'),
    test:  getScriptEditorValue('test'),
    e2e:   getScriptEditorValue('e2e'),
  };

  // Show a waiting banner while IntelliJ starts up
  const banner = document.getElementById('intellij-wait-banner');
  const bannerMsg = document.getElementById('intellij-wait-msg');
  if (banner) banner.classList.remove('hidden');

  window.gp?.onIntellijWait(info => {
    if (!banner) return;
    if (info === null) { banner.classList.add('hidden'); return; }
    if (info.launching) {
      bannerMsg.textContent = '🚀 Launching IntelliJ… waiting for RobOS plugin (up to 3 min)';
    } else {
      bannerMsg.textContent = `⏳ Waiting for IntelliJ plugin… attempt ${info.attempt}, ${info.remaining}s remaining`;
    }
  });

  const r = await gp.runInIntellij(p.id, p.localPath, scripts, key);
  if (banner) banner.classList.add('hidden');
  if (!r.ok) alert(r.error || 'Failed to run in IntelliJ.');
}

async function runScriptGeneric(p, key) {
  const outId    = key === 'setup' ? 'devsetup-output' : `${key}-output`;
  const preId    = key === 'setup' ? 'devsetup-pre'    : `${key}-pre`;
  const fixId    = key === 'setup' ? 'devsetup-fix-row': `${key}-fix-row`;
  const fixStId  = key === 'setup' ? 'ai-fix-status'   : `ai-fix-${key}-status`;
  const fixBtnId = key === 'setup' ? 'btn-fix-script'  : `btn-fix-${key}`;
  const labels   = { setup: 'setup', start: 'start', test: 'test', e2e: 'E2E test' };
  const script   = getScriptEditorValue(key).trim();
  if (!script) { alert(`No ${labels[key] || key} script defined.`); return; }
  if (!p._cloned) { alert('Project must be cloned first.'); return; }
  const outBox    = document.getElementById(outId);
  const pre       = document.getElementById(preId);
  const fixRow    = document.getElementById(fixId);
  const fixStatus = document.getElementById(fixStId);
  outBox.classList.remove('hidden');
  fixRow.classList.add('hidden');
  fixStatus.classList.add('hidden');
  pre.textContent = `Running ${labels[key] || key} script…\n`;
  const r = await gp.runDevSetup(p.localPath, script);
  pre.textContent = r.output || r.error || '(no output)';
  if (!r.ok) {
    fixRow.classList.remove('hidden');
    document.getElementById(fixBtnId).onclick = () => fixScriptGeneric(p, key, pre.textContent);
  }
}

async function fixScriptGeneric(p, key, errorOutput) {
  const btn    = document.getElementById(`btn-fix-${key}`);
  const status = document.getElementById(`ai-fix-${key}-status`);
  btn.disabled = true; btn.textContent = '⏳ Fixing…';
  status.classList.remove('hidden'); status.textContent = `AI is analysing the error and rewriting the ${key} script…`;
  try {
    const result = await gp.aiFixScript(p.localPath, p.url, getScriptEditorValue(key), errorOutput, key);
    if (result.error) { status.textContent = '⚠ ' + result.error; return; }
    setScriptEditorValue(key, result.script);
    document.getElementById(`${key}-fix-row`).classList.add('hidden');
    status.textContent = `✓ Script updated — click ▶ Run to try again.`;
    setTimeout(() => status.classList.add('hidden'), 6000);
  } catch(e) {
    status.textContent = '⚠ ' + (e.message || String(e));
  } finally {
    btn.disabled = false; btn.textContent = '🤖 Fix';
  }
}

async function buildAiDevSetup(p, extraAnswers) {
  const btn    = document.getElementById('btn-ai-devsetup');
  const status = document.getElementById('ai-devsetup-status');
  const promptEl = document.getElementById('devsetup-ai-prompt');
  let prompt = (promptEl && (promptEl.value || promptEl.textContent || '')).trim();
  if (extraAnswers) prompt = prompt ? prompt + '\n\n' + extraAnswers : extraAnswers;

  btn.disabled = true; btn.textContent = '⏳ Generating…';
  status.classList.remove('hidden');

  const steps = [
    { step: 'instructions', tab: 'instructions', label: 'Instructions' },
    { step: 'setup',        tab: 'setup',        label: 'Setup script' },
    { step: 'start',        tab: 'start',        label: 'Start script' },
    { step: 'test',         tab: 'test',          label: 'Test script' },
    { step: 'e2e',          tab: 'e2e',           label: 'E2E script' },
  ];

  try {
    for (let i = 0; i < steps.length; i++) {
      const { step, tab, label } = steps[i];
      status.textContent = `Generating ${label} (${i + 1}/${steps.length})…`;

      const result = await gp.aiDevSetupStep(p.localPath, p.url, prompt, step);
      if (result.error) { status.textContent = `⚠ ${label}: ${result.error}`; return; }

      const tabBtn = document.querySelector(`.devsetup-tab[data-dstab="${tab}"]`);
      if (result.notApplicable) {
        setScriptEditorValue(tab, '');
        if (tabBtn) { tabBtn.disabled = true; tabBtn.classList.add('tab-disabled'); }
      } else {
        if (result.text) setScriptEditorValue(tab, result.text);
        if (tabBtn) { tabBtn.disabled = false; tabBtn.classList.remove('tab-disabled'); }
        switchDevSetupTab(tab);
        if (tab === 'instructions') showInstructionsPreview();
      }
      updateDevSetupDots();
    }

    switchDevSetupTab('instructions');
    showInstructionsPreview();
    saveDevSetup(p.id);
    status.textContent = '✓ Generated and saved.';
    setTimeout(() => status.classList.add('hidden'), 6000);
  } catch (e) {
    status.textContent = '⚠ ' + (e.message || String(e));
  } finally {
    btn.disabled = false; btn.textContent = '🤖 Generate';
  }
}

async function startDevSetupInterview(p) {
  const interviewBtn = document.getElementById('btn-ai-interview');
  const status = document.getElementById('ai-devsetup-status');
  const panel = document.getElementById('devsetup-questionnaire');
  const qqDiv = document.getElementById('questionnaire-questions');

  interviewBtn.disabled = true; interviewBtn.textContent = '⏳ Generating questions…';
  status.classList.remove('hidden'); status.textContent = 'AI is reading project to generate questions…';

  try {
    const promptEl = document.getElementById('devsetup-ai-prompt');
    const extra = (promptEl && (promptEl.value || promptEl.textContent || '')).trim();
    const result = await gp.aiDevSetupInterview(p.localPath, p.url, extra);
    if (result.error) { status.textContent = '⚠ ' + result.error; return; }
    status.classList.add('hidden');
    qqDiv.innerHTML = '';
    (result.questions || []).forEach((q, i) => {
      const row = document.createElement('div');
      row.className = 'questionnaire-row';
      row.innerHTML = `<label class="questionnaire-q">${i + 1}. ${q}</label>
        <input class="text-input questionnaire-answer" type="text" data-qi="${i}" placeholder="Your answer (optional)…" />`;
      qqDiv.appendChild(row);
    });
    panel.classList.remove('hidden');
    document.getElementById('btn-questionnaire-use').onclick = () => {
      const answers = [...panel.querySelectorAll('.questionnaire-answer')]
        .map((inp, i) => inp.value.trim() ? `Q: ${(result.questions || [])[i]}\nA: ${inp.value.trim()}` : null)
        .filter(Boolean).join('\n\n');
      panel.classList.add('hidden');
      buildAiDevSetup(p, answers || undefined);
    };
  } catch (e) {
    status.textContent = '⚠ ' + (e.message || String(e));
  } finally {
    interviewBtn.disabled = false; interviewBtn.textContent = '🎤 Ask me first';
  }
}

async function refineDevSetupField(p, field) {
  const map = {
    instructions: { btn: 'btn-refine-instructions', status: 'ai-refine-instructions-status', monacoKey: 'instructions', prompt: 'refine-instructions-prompt' },
    script:       { btn: 'btn-refine-script',        status: 'ai-refine-script-status',       monacoKey: 'setup',         prompt: 'refine-script-prompt' },
    start:        { btn: 'btn-refine-start',          status: 'ai-refine-start-status',        monacoKey: 'start',         prompt: 'refine-start-prompt' },
    test:         { btn: 'btn-refine-test',           status: 'ai-refine-test-status',         monacoKey: 'test',          prompt: 'refine-test-prompt' },
    e2e:          { btn: 'btn-refine-e2e',            status: 'ai-refine-e2e-status',          monacoKey: 'e2e',           prompt: 'refine-e2e-prompt' },
  };
  const ids = map[field];
  if (!ids) return;

  const btn      = document.getElementById(ids.btn);
  const status   = document.getElementById(ids.status);
  const promptEl = document.getElementById(ids.prompt);

  const current = getScriptEditorValue(ids.monacoKey).trim();
  if (!current) { status.classList.remove('hidden'); status.textContent = '⚠ Nothing to refine yet — generate first.'; return; }

  const refineFeedback = (promptEl && promptEl.value || '').trim();

  btn.disabled = true; btn.textContent = '⏳ Refining…';
  status.classList.remove('hidden');
  status.textContent = 'Refining with AI…';

  try {
    const result = await gp.aiRefineDevSetup(p.localPath, p.url, field, current, refineFeedback);
    if (result.error) {
      status.textContent = '⚠ ' + result.error;
    } else {
      setScriptEditorValue(ids.monacoKey, result.text);
      updateDevSetupDots();
      if (promptEl) { if (typeof promptEl.clear === 'function') promptEl.clear(); else promptEl.value = ''; }
      status.textContent = '✓ Refined — review and save.';
      setTimeout(() => status.classList.add('hidden'), 4000);
    }
  } catch (e) {
    status.textContent = '⚠ ' + (e.message || String(e));
  } finally {
    btn.disabled = false; btn.textContent = '🔄 Refine';
  }
}


function renderSecretsTable(secrets) {
  const tbody = document.getElementById('secrets-tbody');
  tbody.innerHTML = '';
  (secrets || []).forEach((s, i) => addSecretRow(s.envName, s.passPath));
}

function addSecretRow(envName = '', passPath = '') {
  const tbody = document.getElementById('secrets-tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="text-input secret-env" value="${escHtml(envName)}" placeholder="MY_SECRET_KEY"/></td>
    <td><input class="text-input secret-pass" value="${escHtml(passPath)}" placeholder="dev/my-secret"/></td>
    <td class="secret-actions">
      <button class="btn-tiny secret-remove danger" title="Remove">✕</button>
    </td>`;
  tr.querySelector('.secret-remove').onclick = () => tr.remove();
  tbody.appendChild(tr);
}

function collectSecrets() {
  return Array.from(document.querySelectorAll('#secrets-tbody tr')).map(tr => ({
    envName:  tr.querySelector('.secret-env').value.trim(),
    passPath: tr.querySelector('.secret-pass').value.trim(),
  })).filter(s => s.envName || s.passPath);
}

function saveSecrets(id) {
  const p = data.projects.find(x => x.id === id);
  if (!p) return;
  p.secrets = collectSecrets();
  gp.writeProjects(data);
  const btn = document.getElementById('btn-save-secrets');
  btn.textContent = '✓ Saved';
  setTimeout(() => { btn.textContent = 'Save Secrets'; }, 2000);
}

async function aiDetectSecrets(p) {
  const btn    = document.getElementById('btn-ai-detect-secrets');
  const status = document.getElementById('ai-secrets-status');
  btn.disabled = true; btn.textContent = '⏳ Scanning project…';
  status.classList.remove('hidden');
  status.textContent = 'Reading project files…';

  const result = await gp.aiDetectSecrets(p.localPath, p.url);

  btn.disabled = false; btn.textContent = '🤖 Read project and add secret names';

  if (result.error) {
    status.textContent = '⚠ ' + result.error;
    return;
  }

  // Append detected secrets (skip duplicates by envName)
  const existing = collectSecrets().map(s => s.envName.toUpperCase());
  let added = 0;
  (result.secrets || []).forEach(s => {
    if (!existing.includes((s.envName || '').toUpperCase())) {
      addSecretRow(s.envName, s.passPath);
      added++;
    }
  });

  if (added > 0) {
    status.textContent = `✓ Added ${added} secret${added > 1 ? 's' : ''} — review pass paths then Save.`;
  } else {
    status.textContent = '✓ No new secrets found (all already listed).';
  }
  setTimeout(() => status.classList.add('hidden'), 6000);
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function deleteProject(id) {
  const p = data.projects.find(x => x.id === id);
  const name = p ? (p.label || p.repo) : 'this project';
  if (!confirm(`Remove "${name}" from the list? (The local directory will not be deleted.)`)) return;
  data.projects = data.projects.filter(p => p.id !== id);
  gp.writeProjects(data);
  if (selectedId === id) {
    selectedId = null;
    document.getElementById('detail-empty').classList.remove('hidden');
    document.getElementById('detail-content').classList.add('hidden');
  }
  renderTree();
}

function deleteOrg(host, org) {
  const count = data.projects.filter(p => p.host === host && p.org === org).length;
  if (!count) return;
  if (!confirm(`Remove all ${count} project${count !== 1 ? 's' : ''} from "${org}" (${host}) from the list?\n\nLocal directories will NOT be deleted.`)) return;
  const removedIds = data.projects.filter(p => p.host === host && p.org === org).map(p => p.id);
  data.projects = data.projects.filter(p => !(p.host === host && p.org === org));
  gp.writeProjects(data);
  if (removedIds.includes(selectedId)) {
    selectedId = null;
    document.getElementById('detail-empty').classList.remove('hidden');
    document.getElementById('detail-content').classList.add('hidden');
  }
  renderTree();
}

// ── Add modal ─────────────────────────────────────────────────────────────────
function bindAddModal() {
  const modal      = document.getElementById('modal-add');
  const urlInput   = document.getElementById('add-url');
  const errBox     = document.getElementById('add-error');
  const validCount = document.getElementById('url-valid-count');
  const confirm    = document.getElementById('btn-add-confirm');
  const filterInput = document.getElementById('gh-repo-filter');
  const dropdown   = document.getElementById('gh-repo-dropdown');
  const ghStatus   = document.getElementById('gh-pick-status');
  const publicToggle = document.getElementById('btn-public-toggle');
  let allRepos     = [];
  let reposLoaded  = false;
  let activeIdx    = -1;
  let searchRepos  = [];
  let publicSearch = false;

  publicToggle.addEventListener('click', () => {
    publicSearch = !publicSearch;
    publicToggle.classList.toggle('active', publicSearch);
    filterInput.placeholder = publicSearch ? 'Search GitHub repos…' : 'Search your repos…';
    // Re-run search with new setting
    searchRepos = [];
    const v = filterInput.value.trim();
    if (publicSearch && v.length >= 3) {
      filterInput.dispatchEvent(new Event('input'));
    } else {
      renderDropdown(v);
    }
  });

  document.getElementById('btn-add').onclick = () => {
    urlInput.value    = '';
    filterInput.value = '';
    document.getElementById('clone-now-chk').checked = true;
    document.getElementById('clone-now-row').classList.add('hidden');
    document.getElementById('clone-progress').classList.add('hidden');
    validCount.classList.add('hidden');
    errBox.classList.add('hidden');
    confirm.disabled = true;
    confirm.textContent = 'Add Project';
    parsedUrls = [];
    dropdown.classList.add('hidden');
    modal.classList.remove('hidden');
    setTimeout(() => filterInput.focus(), 50);
    if (!reposLoaded) loadGhRepos();
  };

  async function loadGhRepos() {
    if (reposLoaded) return;
    ghStatus.textContent = '⏳ loading…';
    const r = await gp.listGhRepos();
    if (!r.ok || !r.repos?.length) {
      ghStatus.textContent = r.error ? '✗ error' : '0 repos';
      return;
    }
    allRepos    = r.repos;
    reposLoaded = true;
    ghStatus.textContent = `${allRepos.length} repos`;
    renderDropdown('');
  }

  function renderDropdown(q) {
    const lq = q.toLowerCase();
    const ownMatches = allRepos.filter(r =>
      !lq || r.nameWithOwner.toLowerCase().includes(lq)
    );
    // Merge in GitHub-wide search results (non-duplicates already filtered)
    const matches = [...ownMatches, ...searchRepos.filter(r =>
      !lq || r.nameWithOwner.toLowerCase().includes(lq)
    )];
    if (!matches.length) { dropdown.classList.add('hidden'); return; }

    // Group by owner
    const byOwner = {};
    matches.forEach(r => {
      const [owner] = r.nameWithOwner.split('/');
      if (!byOwner[owner]) byOwner[owner] = [];
      byOwner[owner].push(r);
    });

    dropdown.innerHTML = '';
    activeIdx = -1;
    for (const owner of Object.keys(byOwner).sort()) {
      const grpEl = document.createElement('div');
      grpEl.className = 'gh-dropdown-group';
      const lbl = document.createElement('div');
      lbl.className = 'gh-dropdown-group-label';
      lbl.textContent = owner;
      grpEl.appendChild(lbl);
      byOwner[owner].sort((a, b) => a.nameWithOwner.localeCompare(b.nameWithOwner)).forEach(repo => {
        const item = document.createElement('div');
        item.className = 'gh-dropdown-item';
        item.dataset.url = repo.url;
        const repoName = repo.nameWithOwner.split('/')[1];
        const badges = [
          repo.isFork    ? '<span class="repo-badge repo-fork">fork</span>' : '',
          repo.isPrivate ? '<span class="repo-badge repo-priv">private</span>' : '',
        ].join('');
        item.innerHTML = `<span>${escHtml(repoName)}</span>${badges}`;
        if (repo.description) item.title = repo.description;
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          pickRepo(repo.url);
        });
        grpEl.appendChild(item);
      });
      dropdown.appendChild(grpEl);
    }
    dropdown.classList.remove('hidden');
  }

  function pickRepo(url) {
    dropdown.classList.add('hidden');
    filterInput.value = url;
    // Append to textarea (avoid duplicates)
    const existing = urlInput.value.split('\n').map(l => l.trim()).filter(Boolean);
    if (!existing.includes(url)) {
      urlInput.value = existing.length ? existing.join('\n') + '\n' + url : url;
    }
    refreshUrlPreview();
  }

  // Show dropdown when filter input gains focus (if repos loaded)
  filterInput.addEventListener('focus', () => {
    if (reposLoaded) renderDropdown(filterInput.value);
  });
  filterInput.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.add('hidden'), 150);
  });
  let searchDebounce;

  filterInput.addEventListener('input', () => {
    renderDropdown(filterInput.value);
    // Also treat typed value as a URL if it looks like one
    const v = filterInput.value.trim();
    if (v.startsWith('http') || v.startsWith('git@')) {
      const existing = urlInput.value.split('\n').map(l => l.trim()).filter(Boolean);
      if (!existing.includes(v)) {
        urlInput.value = existing.length ? existing.join('\n') + '\n' + v : v;
        refreshUrlPreview();
      }
    }
    // GitHub-wide search for public repos (only when Public toggle is on)
    clearTimeout(searchDebounce);
    if (publicSearch && v.length >= 3) {
      searchDebounce = setTimeout(async () => {
        const r = await gp.searchGhRepos(v);
        if (r.ok && r.repos?.length) {
          // Merge: add any repos not already in allRepos
          const known = new Set(allRepos.map(x => x.nameWithOwner));
          const novel = r.repos.filter(x => !known.has(x.nameWithOwner));
          searchRepos = novel;
          renderDropdown(filterInput.value);
        }
      }, 400);
    } else {
      searchRepos = [];
    }
  });

  // Keyboard nav in dropdown
  filterInput.addEventListener('keydown', (e) => {
    const items = [...dropdown.querySelectorAll('.gh-dropdown-item')];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
      items[activeIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
      items[activeIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      pickRepo(items[activeIdx].dataset.url);
    } else if (e.key === 'Escape') {
      dropdown.classList.add('hidden');
    }
  });

  document.getElementById('btn-add-cancel').onclick = () => modal.classList.add('hidden');
  modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };

  let debounce;
  let parsedUrls = [];

  async function refreshUrlPreview() {
    const lines = urlInput.value.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) {
      errBox.classList.add('hidden');
      validCount.classList.add('hidden');
      confirm.disabled = true;
      parsedUrls = [];
      document.getElementById('clone-now-row').classList.add('hidden');
      document.getElementById('clone-progress').classList.add('hidden');
      return;
    }
    parsedUrls = await Promise.all(lines.map(l => gp.parseUrl(l)));
    const valid   = parsedUrls.filter(p => p.ok);
    const invalid = parsedUrls.filter(p => !p.ok);
    if (!valid.length) {
      errBox.textContent = 'No valid Git URLs found';
      errBox.classList.remove('hidden');
      validCount.classList.add('hidden');
      confirm.disabled = true;
      return;
    }
    errBox.classList.add('hidden');
    if (invalid.length) {
      errBox.textContent = `${invalid.length} invalid URL(s) will be skipped`;
      errBox.classList.remove('hidden');
    }
    validCount.textContent = valid.length === 1
      ? `✓ 1 project: ${valid[0].org}/${valid[0].repo}`
      : `✓ ${valid.length} projects`;
    validCount.classList.remove('hidden');
    confirm.textContent = valid.length > 1 ? `Add ${valid.length} Projects` : 'Add Project';
    confirm.disabled = false;
    document.getElementById('clone-now-row').classList.remove('hidden');
  }

  urlInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(refreshUrlPreview, 300);
  });

  confirm.onclick = async () => {
    const valid = parsedUrls.filter(p => p.ok);
    if (!valid.length) return;
    const cloneNow    = document.getElementById('clone-now-chk').checked;
    const progressBox = document.getElementById('clone-progress');
    const progressPre = document.getElementById('clone-progress-pre');

    let lastProject;
    for (let i = 0; i < valid.length; i++) {
      const p = valid[i];
      const project = {
        id: `p-${Date.now()}-${i}`,
        url:       p.url,
        host:      p.host,
        org:       p.org,
        repo:      p.repo,
        localPath: p.localPath,
        label:     p.repo,
        notes:     '',
        _cloned:   false,
      };
      data.projects.push(project);
      lastProject = project;
    }
    gp.writeProjects(data);

    if (cloneNow) {
      confirm.disabled = true;
      document.getElementById('btn-add-cancel').disabled = true;
      progressPre.textContent = '';
      progressBox.classList.remove('hidden');
      document.querySelector('#clone-progress .clone-progress-hdr').textContent = '⏳ Cloning…';

      let allOk = true;
      for (let i = 0; i < valid.length; i++) {
        const project = data.projects[data.projects.length - valid.length + i];
        const { url, localPath } = project;
        progressPre.textContent += `\n$ git clone ${url}\n  → ${localPath}\n`;
        const r = await gp.clone(url, localPath);
        if (r.ok) {
          project._cloned = true;
          progressPre.textContent += `✓ ${r.message || 'Done'}\n`;
        } else {
          allOk = false;
          progressPre.textContent += `✗ ${r.error || 'Failed'}\n`;
        }
        progressPre.scrollTop = progressPre.scrollHeight;
      }
      gp.writeProjects(data);

      document.querySelector('#clone-progress .clone-progress-hdr').textContent =
        allOk ? '✓ Clone complete' : '⚠ Clone finished with errors';
      confirm.disabled = false;
      document.getElementById('btn-add-cancel').disabled = false;
      if (allOk) setTimeout(() => modal.classList.add('hidden'), 1500);
    } else {
      modal.classList.add('hidden');
    }

    renderTree();
    if (lastProject) {
      gp.checkCloned(lastProject.localPath).then(cloned => {
        lastProject._cloned = cloned;
        renderTree();
        selectProject(lastProject.id);
      });
    }
  };
}

// ── Dev Group picker ──────────────────────────────────────────────────────────
async function bindGroupPicker() {
  const btn    = document.getElementById('btn-add-group');
  const modal  = document.getElementById('modal-group-picker');
  const errBox = document.getElementById('group-picker-error');
  let selectedGroupId = null;
  let allGroups = [];

  // Load groups and enable button if any exist
  const r = await gp.listGroups();
  allGroups = (r && r.groups) || [];
  if (allGroups.length > 0) btn.disabled = false;

  btn.onclick = () => {
    selectedGroupId = null;
    errBox.classList.add('hidden');
    document.getElementById('group-clone-progress').classList.add('hidden');
    document.getElementById('group-clone-now-row').style.display = 'none';
    document.getElementById('btn-group-picker-confirm').disabled = true;
    document.getElementById('btn-group-picker-cancel').disabled = false;
    renderGroupList(allGroups);
    modal.classList.remove('hidden');
  };

  function renderGroupList(groups) {
    const list = document.getElementById('group-picker-list');
    list.innerHTML = '';
    if (!groups.length) {
      list.innerHTML = '<div class="group-picker-empty">No dev groups found. Create one in RobOS Group Settings.</div>';
      return;
    }
    groups.forEach(g => {
      const repoCount = (g.settings && g.settings.git ? g.settings.git.length : 0);
      const item = document.createElement('div');
      item.className = 'group-picker-item';
      item.dataset.gid = g.id;
      item.innerHTML = `<span class="group-picker-name">${escHtml(g.name || g.id)}</span><span class="group-picker-count">${repoCount} repo${repoCount !== 1 ? 's' : ''}</span>`;
      item.onclick = () => {
        list.querySelectorAll('.group-picker-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        selectedGroupId = g.id;
        const hasRepos = repoCount > 0;
        document.getElementById('btn-group-picker-confirm').disabled = !hasRepos;
        document.getElementById('group-clone-now-row').style.display = hasRepos ? '' : 'none';
        if (!hasRepos) {
          errBox.textContent = 'This group has no Git repositories configured.';
          errBox.classList.remove('hidden');
        } else {
          errBox.classList.add('hidden');
        }
      };
      list.appendChild(item);
    });
  }

  document.getElementById('btn-group-picker-cancel').onclick = () => modal.classList.add('hidden');
  modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };

  document.getElementById('btn-group-picker-confirm').onclick = async () => {
    const group = allGroups.find(g => g.id === selectedGroupId);
    if (!group) return;
    const repos = (group.settings && group.settings.git) || [];
    if (!repos.length) return;

    const cloneNow   = document.getElementById('group-clone-now-chk').checked;
    const progressBox = document.getElementById('group-clone-progress');
    const progressPre = document.getElementById('group-clone-progress-pre');
    const hdr         = document.getElementById('group-clone-progress-hdr');
    const confirmBtn  = document.getElementById('btn-group-picker-confirm');
    const cancelBtn   = document.getElementById('btn-group-picker-cancel');

    // Parse all repo URLs
    const parsed = await Promise.all(repos.map(r => gp.parseUrl(r.url || '')));
    const valid  = parsed.filter(p => p.ok);

    if (!valid.length) {
      errBox.textContent = 'No valid Git URLs found in this group\'s repositories.';
      errBox.classList.remove('hidden');
      return;
    }

    // Add to projects list (skip duplicates by URL)
    const existingUrls = new Set(data.projects.map(p => p.url));
    let added = 0;
    const newProjects = [];
    for (let i = 0; i < valid.length; i++) {
      const p = valid[i];
      if (existingUrls.has(p.url)) continue;
      const project = {
        id:        `p-${Date.now()}-${i}`,
        url:       p.url,
        host:      p.host,
        org:       p.org,
        repo:      p.repo,
        localPath: p.localPath,
        label:     p.repo,
        notes:     repos[i] && repos[i].notes ? repos[i].notes : '',
        _cloned:   false,
      };
      data.projects.push(project);
      newProjects.push(project);
      existingUrls.add(p.url);
      added++;
    }
    gp.writeProjects(data);
    renderTree();

    if (!added) {
      errBox.textContent = `All ${valid.length} repo${valid.length !== 1 ? 's' : ''} from this group are already in your list.`;
      errBox.classList.remove('hidden');
      return;
    }

    if (cloneNow) {
      confirmBtn.disabled = true;
      cancelBtn.disabled  = true;
      progressPre.textContent = '';
      progressBox.classList.remove('hidden');
      hdr.textContent = `⏳ Cloning ${newProjects.length} repo${newProjects.length !== 1 ? 's' : ''}…`;

      let allOk = true;
      for (const project of newProjects) {
        progressPre.textContent += `\n$ git clone ${project.url}\n  → ${project.localPath}\n`;
        const cr = await gp.clone(project.url, project.localPath);
        if (cr.ok) {
          project._cloned = true;
          progressPre.textContent += `✓ ${cr.message || 'Done'}\n`;
        } else {
          allOk = false;
          progressPre.textContent += `✗ ${cr.error || 'Failed'}\n`;
        }
        progressPre.scrollTop = progressPre.scrollHeight;
      }
      gp.writeProjects(data);
      renderTree();

      hdr.textContent = allOk
        ? `✓ Done — ${newProjects.length} repo${newProjects.length !== 1 ? 's' : ''} cloned`
        : '⚠ Finished with some errors';
      confirmBtn.disabled = false;
      cancelBtn.disabled  = false;
      if (allOk) setTimeout(() => modal.classList.add('hidden'), 1800);
    } else {
      modal.classList.add('hidden');
    }
  };
}

// ── AI Repos Prompt Panel ─────────────────────────────────────────────────────
function initAIReposPanel() {
  const toggleBtn    = document.getElementById('btn-ai-prompt');
  const panel        = document.getElementById('ai-repos-panel');
  const agentSelect  = document.getElementById('ai-repos-agent-select');
  const promptEl     = document.getElementById('ai-repos-prompt');
  const genBtn       = document.getElementById('ai-repos-generate-btn');
  const statusEl     = document.getElementById('ai-repos-status');
  const resultSec    = document.getElementById('ai-repos-result-section');
  const reposList    = document.getElementById('ai-repos-list');
  const selAll       = document.getElementById('btn-ai-repos-sel-all');
  const deselAll     = document.getElementById('btn-ai-repos-desel-all');
  const selCount     = document.getElementById('ai-repos-sel-count');
  const cloneChk     = document.getElementById('ai-repos-clone-chk');
  const cloneProgress    = document.getElementById('ai-repos-clone-progress');
  const cloneProgressHdr = document.getElementById('ai-repos-clone-progress-hdr');
  const cloneProgressPre = document.getElementById('ai-repos-clone-progress-pre');
  const addBtn       = document.getElementById('btn-ai-repos-add');

  // Toggle panel visibility
  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('hidden');
    toggleBtn.textContent = panel.classList.contains('hidden') ? '✨ AI Prompt' : '✨ AI Prompt ▲';
  });

  // Wire @-mention file typeahead
  if (typeof customElements !== 'undefined') {
    customElements.whenDefined('robos-ai-textarea').then(() => {
      if (promptEl && promptEl.addEventListener) {
        promptEl.addEventListener('robos-path-query', async (e) => {
          try {
            const r = await gp.listPath(e.detail.query);
            if (r && r.ok && promptEl._showMentions) promptEl._showMentions(r.items);
          } catch (_) {}
        });
      }
    }).catch(() => {});
  }

  // Populate agent dropdown
  gp.listAIProviders().then(({ activeId, activeName, providers }) => {
    agentSelect.options[0].textContent = `Default (${activeName})`;
    agentSelect.options[0].value = '';
    (providers || [])
      .filter(p => p.id !== activeId)
      .forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        agentSelect.appendChild(opt);
      });
  }).catch(() => {});

  let _statusTimer = null;
  function showStatus(msg, type) {
    clearTimeout(_statusTimer);
    statusEl.textContent = msg;
    statusEl.className   = `ai-repos-status${type ? ' ' + type : ''}`;
    statusEl.classList.remove('hidden');
  }

  function updateSelCount() {
    const n = reposList.querySelectorAll('input[type=checkbox]:checked:not(:disabled)').length;
    selCount.textContent = `${n} selected`;
    addBtn.disabled = n === 0;
  }

  reposList.addEventListener('change', updateSelCount);
  selAll.addEventListener('click',   () => { reposList.querySelectorAll('input[type=checkbox]:not(:disabled)').forEach(c => c.checked = true);  updateSelCount(); });
  deselAll.addEventListener('click', () => { reposList.querySelectorAll('input[type=checkbox]:not(:disabled)').forEach(c => c.checked = false); updateSelCount(); });

  genBtn.addEventListener('click', async () => {
    const rawValue = typeof promptEl.value !== 'undefined' ? promptEl.value : promptEl.innerText || '';
    const prompt   = rawValue.trim();
    if (!prompt) { showStatus('Please describe the repositories first.', 'error'); return; }

    genBtn.disabled  = true;
    genBtn.textContent = '⏳ Generating…';
    resultSec.classList.add('hidden');
    cloneProgress.classList.add('hidden');
    showStatus(`Sending to ${agentSelect.options[agentSelect.selectedIndex].textContent}…`, '');

    try {
      const r = await gp.aiCreateRepos(prompt, agentSelect.value || null);
      if (!r || !r.ok) { showStatus(r?.error || 'AI generation failed.', 'error'); return; }

      const existingUrls = new Set((data.projects || []).map(p => (p.url || '').replace(/\.git$/, '')));
      reposList.innerHTML = '';
      r.repos.forEach(repo => {
        const alreadyAdded = existingUrls.has(repo.url.replace(/\.git$/, ''));
        const item = document.createElement('label');
        item.className = 'org-repo-item';
        const badges = alreadyAdded ? '<span class="org-badge">already added</span>' : '';
        item.innerHTML = `
          <input type="checkbox" data-url="${escHtml(repo.url)}" data-name="${escHtml(repo.name)}"
            data-group="${escHtml(repo.group || '')}" data-lp="${escHtml(repo.localPath || '')}"
            ${alreadyAdded ? 'disabled' : 'checked'} />
          <div class="org-repo-item-info">
            <span class="org-repo-name">${escHtml(repo.name)}</span>
            <span class="org-repo-desc">${escHtml(repo.url)}</span>
            ${badges ? `<div class="org-repo-badges">${badges}</div>` : ''}
          </div>`;
        reposList.appendChild(item);
      });
      resultSec.classList.remove('hidden');
      updateSelCount();

      // Clear status after a moment
      showStatus(`✅ Found ${r.repos.length} repo${r.repos.length !== 1 ? 's' : ''}`, 'success');
      clearTimeout(_statusTimer);
      _statusTimer = setTimeout(() => { statusEl.classList.add('hidden'); }, 5000);
    } catch (e) {
      showStatus(e.message || String(e), 'error');
    } finally {
      genBtn.disabled = false;
      genBtn.textContent = 'Generate';
    }
  });

  addBtn.addEventListener('click', async () => {
    const checked = Array.from(reposList.querySelectorAll('input[type=checkbox]:checked:not(:disabled)'));
    if (!checked.length) return;

    const existingUrls = new Set((data.projects || []).map(p => (p.url || '').replace(/\.git$/, '')));
    const toAdd = [];
    for (const c of checked) {
      const url = c.dataset.url;
      if (existingUrls.has(url.replace(/\.git$/, ''))) continue;
      toAdd.push({ url, name: c.dataset.name, group: c.dataset.group, localPath: c.dataset.lp || `~/source/${c.dataset.group}/${c.dataset.name}` });
    }
    for (const r of toAdd) data.projects.push(r);
    await gp.writeProjects(data);
    renderTree();

    const shouldClone = cloneChk.checked;
    if (shouldClone && toAdd.length) {
      addBtn.disabled = true;
      cloneProgress.classList.remove('hidden');
      cloneProgressHdr.textContent = `⏳ Cloning 0 / ${toAdd.length}…`;
      cloneProgressPre.textContent = '';
      let done = 0, allOk = true;
      for (const p of toAdd) {
        const isCloned = await gp.checkCloned(p.localPath);
        if (isCloned) { done++; continue; }
        const r = await gp.clone(p.url, p.localPath);
        done++;
        cloneProgressHdr.textContent = `⏳ Cloning ${done} / ${toAdd.length}…`;
        if (r && r.ok) {
          cloneProgressPre.textContent += `✓ ${p.name}\n`;
        } else {
          cloneProgressPre.textContent += `✗ ${p.name}: ${r?.error || 'failed'}\n`;
          allOk = false;
        }
        cloneProgressPre.scrollTop = cloneProgressPre.scrollHeight;
      }
      cloneProgressHdr.textContent = allOk ? `✅ Cloned ${done} repos` : `⚠ Finished with errors`;
      await refreshCloneStatus();
      renderTree();
      addBtn.disabled = false;
    } else {
      await refreshCloneStatus();
      renderTree();
    }

    // Clear prompt for next use
    try { promptEl.value = ''; } catch {}
    const inner = promptEl._inner || (promptEl.shadowRoot && promptEl.shadowRoot.querySelector('[contenteditable]'));
    if (inner) { try { inner.innerText = ''; } catch {} }
    resultSec.classList.add('hidden');
    cloneProgress.classList.add('hidden');
    showStatus(`✅ Added ${toAdd.length} repo${toAdd.length !== 1 ? 's' : ''}`, 'success');
    clearTimeout(_statusTimer);
    _statusTimer = setTimeout(() => { statusEl.classList.add('hidden'); }, 6000);
  });
}

// ── GitHub Org picker ─────────────────────────────────────────────────────────
function bindOrgPicker() {
  const modal        = document.getElementById('modal-org-picker');
  const orgInput     = document.getElementById('org-name-input');
  const btnLoad      = document.getElementById('btn-org-load');
  const loadStatus   = document.getElementById('org-load-status');
  const repoSection  = document.getElementById('org-repo-section');
  const repoList     = document.getElementById('org-repo-list');
  const filterInput  = document.getElementById('org-repo-filter');
  const btnSelAll    = document.getElementById('btn-org-select-all');
  const btnDeselAll  = document.getElementById('btn-org-deselect-all');
  const selCount     = document.getElementById('org-selected-count');
  const cloneChk     = document.getElementById('org-clone-now-chk');
  const errEl        = document.getElementById('org-error');
  const progressBox  = document.getElementById('org-clone-progress');
  const progressHdr  = document.getElementById('org-clone-progress-hdr');
  const progressPre  = document.getElementById('org-clone-progress-pre');
  const btnConfirm   = document.getElementById('btn-org-confirm');
  const btnCancel    = document.getElementById('btn-org-cancel');

  let allRepos = [];

  document.getElementById('btn-add-org').addEventListener('click', () => {
    orgInput.value = '';
    repoSection.classList.add('hidden');
    loadStatus.classList.add('hidden');
    errEl.classList.add('hidden');
    progressBox.classList.add('hidden');
    btnConfirm.disabled = true;
    allRepos = [];
    modal.classList.remove('hidden');
    setTimeout(() => orgInput.focus(), 50);
  });

  function renderRepoList(filter) {
    const q = (filter || '').toLowerCase();
    repoList.innerHTML = '';
    const visible = allRepos.filter(r => !q || r.nameWithOwner.toLowerCase().includes(q) || (r.description||'').toLowerCase().includes(q));
    const existingUrls = new Set((data.projects||[]).map(p => (p.url||'').replace(/\.git$/, '')));
    if (!visible.length) {
      repoList.innerHTML = '<div style="padding:10px;color:#7d8590;font-size:13px;text-align:center">No repos match</div>';
      return;
    }
    visible.forEach(repo => {
      const alreadyAdded = existingUrls.has(repo.url.replace(/\.git$/, ''));
      const item = document.createElement('label');
      item.className = 'org-repo-item';
      const badges = [];
      if (repo.isPrivate) badges.push('<span class="org-badge org-badge-private">private</span>');
      if (repo.isFork)    badges.push('<span class="org-badge org-badge-fork">fork</span>');
      if (alreadyAdded)   badges.push('<span class="org-badge">already added</span>');
      item.innerHTML = `
        <input type="checkbox" data-url="${escHtml(repo.url)}" data-nwo="${escHtml(repo.nameWithOwner)}"
          ${alreadyAdded ? 'disabled' : 'checked'} />
        <div class="org-repo-item-info">
          <span class="org-repo-name">${escHtml(repo.nameWithOwner)}</span>
          ${repo.description ? `<span class="org-repo-desc">${escHtml(repo.description)}</span>` : ''}
          ${badges.length ? `<div class="org-repo-badges">${badges.join('')}</div>` : ''}
        </div>`;
      repoList.appendChild(item);
    });
    updateSelCount();
  }

  function updateSelCount() {
    const checked = repoList.querySelectorAll('input[type=checkbox]:checked:not(:disabled)').length;
    selCount.textContent = `${checked} selected`;
    btnConfirm.disabled = checked === 0;
  }

  repoList.addEventListener('change', updateSelCount);

  filterInput.addEventListener('input', () => renderRepoList(filterInput.value));

  btnSelAll.addEventListener('click', () => {
    repoList.querySelectorAll('input[type=checkbox]:not(:disabled)').forEach(c => c.checked = true);
    updateSelCount();
  });
  btnDeselAll.addEventListener('click', () => {
    repoList.querySelectorAll('input[type=checkbox]:not(:disabled)').forEach(c => c.checked = false);
    updateSelCount();
  });

  async function doLoad() {
    const org = orgInput.value.trim();
    if (!org) return;
    btnLoad.disabled = true;
    loadStatus.textContent = `Loading repos for "${org}"…`;
    loadStatus.classList.remove('hidden');
    errEl.classList.add('hidden');
    repoSection.classList.add('hidden');
    allRepos = [];
    try {
      const r = await gp.listOrgRepos(org);
      if (!r || !r.ok) throw new Error(r?.error || 'Failed to load repos');
      allRepos = r.repos || [];
      loadStatus.textContent = `Found ${allRepos.length} repo${allRepos.length !== 1 ? 's' : ''} in ${org}`;
      filterInput.value = '';
      repoSection.classList.remove('hidden');
      renderRepoList('');
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
      loadStatus.classList.add('hidden');
    } finally {
      btnLoad.disabled = false;
    }
  }

  btnLoad.addEventListener('click', doLoad);
  orgInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLoad(); });

  btnCancel.addEventListener('click', () => modal.classList.add('hidden'));

  btnConfirm.addEventListener('click', async () => {
    const checked = Array.from(repoList.querySelectorAll('input[type=checkbox]:checked:not(:disabled)'));
    if (!checked.length) return;
    const repos = checked.map(c => ({ nameWithOwner: c.dataset.nwo, url: c.dataset.url }));
    const shouldClone = cloneChk.checked;

    // Add to data.projects
    const existingUrls = new Set((data.projects||[]).map(p => (p.url||'').replace(/\.git$/, '')));
    let added = 0;
    for (const repo of repos) {
      if (existingUrls.has(repo.url.replace(/\.git$/, ''))) continue;
      const parts = repo.nameWithOwner.split('/');
      const org   = parts[0] || '';
      const name  = parts[1] || repo.nameWithOwner;
      const lp    = `~/source/${repo.nameWithOwner}`;
      data.projects.push({ name, url: repo.url, localPath: lp, group: org });
      added++;
    }
    await gp.writeProjects(data);
    renderTree();

    if (shouldClone && added > 0) {
      btnConfirm.disabled = true;
      btnCancel.disabled  = true;
      progressBox.classList.remove('hidden');
      progressHdr.textContent = `⏳ Cloning 0 / ${added}…`;
      progressPre.textContent = '';
      let done = 0;
      const toClone = data.projects.slice(-added);
      let allOk = true;
      for (const p of toClone) {
        const isCloned = await gp.checkCloned(p.localPath);
        if (isCloned) { done++; continue; }
        const r = await gp.cloneRepo({ url: p.url, localPath: p.localPath });
        done++;
        progressHdr.textContent = `⏳ Cloning ${done} / ${added}…`;
        if (r && r.ok) {
          progressPre.textContent += `✓ ${p.name}\n`;
        } else {
          progressPre.textContent += `✗ ${p.name}: ${r?.error || 'failed'}\n`;
          allOk = false;
        }
        progressPre.scrollTop = progressPre.scrollHeight;
      }
      progressHdr.textContent = allOk ? `✅ Cloned ${done} repos` : `⚠ Finished with errors`;
      await refreshCloneStatus();
      renderTree();
      btnCancel.disabled  = false;
      if (allOk) setTimeout(() => modal.classList.add('hidden'), 1800);
    } else {
      await refreshCloneStatus();
      renderTree();
      modal.classList.add('hidden');
    }
  });
}

// ── Search ────────────────────────────────────────────────────────────────────
function bindSearch() {
  document.getElementById('tree-search').addEventListener('input', e => {
    filterText = e.target.value;
    renderTree();
  });
}

// ── Sort ──────────────────────────────────────────────────────────────────────
function bindSort() {
  document.getElementById('tree-sort').addEventListener('change', e => {
    sortOrder = e.target.value;
    renderTree();
  });
}

// ── Output ────────────────────────────────────────────────────────────────────
function showOutput() {
  const box = document.getElementById('output-box');
  box.classList.remove('hidden');
  document.getElementById('btn-clear-output').onclick = () => {
    box.classList.add('hidden');
    document.getElementById('output-pre').textContent = '';
  };
}
function clearOutput() {
  document.getElementById('output-box').classList.add('hidden');
  document.getElementById('output-pre').textContent = '';
}
function appendOutput(text) {
  const pre = document.getElementById('output-pre');
  pre.textContent += text;
  pre.scrollTop = pre.scrollHeight;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}


// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'git-projects');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────
