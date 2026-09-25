'use strict';

let entries = [];
let activeEntryId = null;
let currentDocData = null;
let activeFilter = 'ALL';
let searchQuery = '';
let activeTab = 'guide';

if (window.mermaid) {
  mermaid.initialize({ startOnLoad: false, theme: 'dark' });
}

window.addEventListener('DOMContentLoaded', async () => {
  await initApp();
});

async function initApp() {
  try {
    const target = await window.robosDocumentation.getInitialTarget();
    const initialTargetId = target ? target.entityId : null;

    await reloadEntries(initialTargetId);
  } catch (err) {
    console.error('Initialization error:', err);
  }

  // Setup search input
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderSidebar();
    });
  }
}

async function reloadEntries(preferredId = null) {
  try {
    entries = await window.robosDocumentation.listDocumentableEntries();
    populateDropdown();
    renderSidebar();

    const targetId = preferredId || activeEntryId || (entries.length > 0 ? entries[0].id : null);
    if (targetId) {
      await selectEntry(targetId);
    }
  } catch (err) {
    console.error('Error loading entries:', err);
  }
}

function populateDropdown() {
  const sel = document.getElementById('entity-selector');
  if (!sel) return;
  sel.innerHTML = '<option value="">Jump to Entity…</option>' +
    entries.map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.title)} (${e.isDocumented ? '✓' : 'needs doc'})</option>`).join('');
}

function renderSidebar() {
  const listEl = document.getElementById('entity-list');
  if (!listEl) return;

  const filtered = entries.filter(e => {
    if (activeFilter === 'DOCUMENTED' && !e.isDocumented) return false;
    if (activeFilter === 'NEEDS_DOCS' && e.isDocumented) return false;
    if (searchQuery) {
      const matchTitle = e.title && e.title.toLowerCase().includes(searchQuery);
      const matchId = e.id && e.id.toLowerCase().includes(searchQuery);
      const matchTech = e.technology && e.technology.toLowerCase().includes(searchQuery);
      if (!matchTitle && !matchId && !matchTech) return false;
    }
    return true;
  });

  listEl.innerHTML = '';
  if (filtered.length === 0) {
    listEl.innerHTML = '<li style="padding:1rem;color:var(--text-muted);font-size:0.8rem;">No matching entities.</li>';
  } else {
    filtered.forEach(e => {
      const li = document.createElement('li');
      li.className = 'entity-item ' + (e.id === activeEntryId ? 'active' : '');
      li.onclick = () => selectEntry(e.id);

      li.innerHTML = `
        <div class="item-title-row">
          <span class="item-title" title="${escapeHtml(e.title)}">${escapeHtml(e.title)}</span>
          <span class="status-pill ${e.isDocumented ? 'documented' : 'needs-docs'}">
            ${e.isDocumented ? '✓ Doc' : 'Needs Doc'}
          </span>
        </div>
        <div class="item-sub-row">
          <span class="badge">${escapeHtml(e.type || 'Resource')}</span>
          <span>${escapeHtml(e.technology || 'Polyglot')}</span>
        </div>
      `;
      listEl.appendChild(li);
    });
  }

  // Coverage statistics
  const total = entries.length;
  const documentedCount = entries.filter(e => e.isDocumented).length;
  const percent = total > 0 ? Math.round((documentedCount / total) * 100) : 0;

  document.getElementById('badge-coverage').textContent = `${documentedCount} / ${total} Documented`;
  document.getElementById('coverage-percent').textContent = `${percent}%`;
  document.getElementById('progress-fill').style.width = `${percent}%`;
}

window.setFilter = function(filterName) {
  activeFilter = filterName;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filterName);
  });
  renderSidebar();
};

window.onSelectDropdownEntity = function(entityId) {
  if (entityId) selectEntry(entityId);
};

async function selectEntry(entityId) {
  activeEntryId = entityId;
  renderSidebar();

  const sel = document.getElementById('entity-selector');
  if (sel) sel.value = entityId;

  try {
    currentDocData = await window.robosDocumentation.getEntryDoc(entityId);
    renderContent();
  } catch (err) {
    console.error('Error loading entry doc:', err);
  }
}

function renderContent() {
  if (!currentDocData || !currentDocData.entity) return;

  const entity = currentDocData.entity;
  const doc = currentDocData.documentation;
  const isDocumented = currentDocData.isDocumented;
  const title = (doc && doc['dcterms:title']) || entity['dcterms:title'] || entity['@id'];

  document.getElementById('view-title').textContent = title;

  // Render Topbar Metadata Tags
  const metaContainer = document.getElementById('view-meta-tags');
  metaContainer.innerHTML = `
    <span>Entity: <code>${escapeHtml(entity['@id'])}</code></span>
    <span>Type: <code>${escapeHtml(Array.isArray(entity['@type']) ? entity['@type'].join(', ') : entity['@type'])}</code></span>
    <span>Team: <code>${escapeHtml(entity['robos:ownerTeam'] || 'Platform')}</code></span>
    <span>Artifact: <code>${escapeHtml(currentDocData.docPath || 'docs/...')}</code></span>
  `;

  const topbarActions = document.getElementById('topbar-actions');
  topbarActions.innerHTML = '';
  if (isDocumented) {
    const btnRegen = document.createElement('button');
    btnRegen.className = 'btn btn-secondary';
    btnRegen.innerHTML = '⚡ Re-generate Docs';
    btnRegen.onclick = () => window.generateDocForCurrent();
    topbarActions.appendChild(btnRegen);
  }

  // Guide pane
  const guideBody = document.getElementById('guide-markdown-body');
  if (isDocumented && currentDocData.markdown) {
    guideBody.innerHTML = parseMarkdown(currentDocData.markdown);
    if (window.mermaid) {
      mermaid.run({ querySelector: '.mermaid' }).catch(() => {});
    }
  } else {
    guideBody.innerHTML = `
      <div class="needs-docs-card">
        <div class="needs-docs-icon">📑</div>
        <h3>No Living Documentation Registered</h3>
        <p>This architectural entity (<code>${escapeHtml(entity['@id'])}</code>) is recognized in the RobOS Knowledge Graph as an asset deserving documentation, but has not yet been documented.</p>
        <input type="text" id="custom-doc-prompt" class="prompt-input" placeholder="Optional: specify focus areas (e.g. event architecture, contracts, latency SLA)…">
        <button class="btn btn-green" onclick="window.generateDocForCurrent(document.getElementById('custom-doc-prompt').value)">
          ⚡ Generate Living Documentation
        </button>
      </div>
    `;
  }

  // Editor pane
  const editorArea = document.getElementById('markdown-editor');
  editorArea.value = currentDocData.markdown || '';
  document.getElementById('editor-file-path').textContent = 'Editing artifact: ' + (currentDocData.docPath || '');

  // Architecture Graph pane
  const graphContainer = document.getElementById('graph-view-container');
  const graphMermaid = `graph TD
    Client[External Consumer / Ingress] -->|Request| Target[${escapeHtml(entity['dcterms:title'] || 'Component')}]
    Target -->|State & Persistence| DB[(Data Store)]
    Target -->|Event Streaming| Broker[Kafka Event Bus]
    Target -->|Verified By| SHACL[W3C SHACL & BDD Tests]`;
  graphContainer.innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;padding:1.5rem;text-align:center;">
      <h3 style="margin-bottom:1rem;color:var(--text-main);">Visual Architecture Topology</h3>
      <pre class="mermaid">${escapeHtml(graphMermaid)}</pre>
    </div>
  `;
  if (window.mermaid) {
    mermaid.run({ querySelector: '#graph-view-container .mermaid' }).catch(() => {});
  }

  // KGraph JSON-LD pane
  const jsonldViewer = document.getElementById('jsonld-viewer');
  jsonldViewer.textContent = JSON.stringify({
    entity,
    documentation: doc || null,
  }, null, 2);
}

window.switchTab = function(tabName) {
  activeTab = tabName;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.style.display = 'none';
  });

  const activePane = document.getElementById(`pane-${tabName}`);
  if (activePane) {
    activePane.style.display = (tabName === 'editor' ? 'flex' : 'block');
  }

  if (tabName === 'graph' && window.mermaid) {
    mermaid.run({ querySelector: '#graph-view-container .mermaid' }).catch(() => {});
  }
};

window.generateDocForCurrent = async function(prompt = '') {
  if (!activeEntryId) return;
  showToast('Synthesizing living documentation…');
  try {
    const res = await window.robosDocumentation.generateDoc({
      entityId: activeEntryId,
      prompt,
    });
    if (res.ok) {
      showToast('Living documentation generated and SHACL verified!');
      await reloadEntries(activeEntryId);
    } else {
      showToast('Error: ' + res.error);
    }
  } catch (err) {
    showToast('Failed to generate documentation: ' + err.message);
  }
};

window.saveCurrentDoc = async function() {
  if (!activeEntryId) return;
  const content = document.getElementById('markdown-editor').value;
  showToast('Saving documentation artifact…');
  try {
    const res = await window.robosDocumentation.saveDoc({
      entityId: activeEntryId,
      markdownContent: content,
    });
    if (res.ok) {
      showToast('Artifact saved and GitOps synchronized!');
      await selectEntry(activeEntryId);
      window.switchTab('guide');
    } else {
      showToast('Error: ' + res.error);
    }
  } catch (err) {
    showToast('Failed to save artifact: ' + err.message);
  }
};

window.exportWebsite = async function() {
  showToast('Exporting GitHub Pages friendly documentation website…');
  try {
    const res = await window.robosDocumentation.exportWebsite();
    if (res.ok) {
      showToast(`Website exported to ${res.filePath} (${res.entriesCount} entities)!`);
    } else {
      showToast('Export failed: ' + res.error);
    }
  } catch (err) {
    showToast('Export error: ' + err.message);
  }
};

window.openTestViewer = async function() {
  showToast('Launching Documentation Test Viewer on port 3089…');
  try {
    const res = await window.robosDocumentation.launchTestViewer({ port: 3089 });
    if (res.ok) {
      showToast(`Test Viewer running at ${res.url}`);
    } else {
      showToast('Test Viewer error: ' + res.error);
    }
  } catch (err) {
    showToast('Failed to launch viewer: ' + err.message);
  }
};

function showToast(msg) {
  const el = document.getElementById('toast-notice');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => {
    el.classList.add('hidden');
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseMarkdown(md) {
  if (!md) return '';
  let raw = md;

  // Mermaid blocks
  raw = raw.replace(/\`\`\`mermaid\s*([\s\S]*?)\`\`\`/g, function(_, code) {
    return '<div style="background:#0d1117;border:1px solid var(--border-color);border-radius:8px;padding:1.25rem;margin:1.25rem 0;text-align:center;"><pre class="mermaid">' + escapeHtml(code.trim()) + '</pre></div>';
  });

  // Code blocks
  raw = raw.replace(/\`\`\`(\w+)?\s*([\s\S]*?)\`\`\`/g, function(_, lang, code) {
    return '<pre><code>' + escapeHtml(code.trim()) + '</code></pre>';
  });

  // Headers
  raw = raw.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  raw = raw.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  raw = raw.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Blockquotes
  raw = raw.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

  // Bold & Italic
  raw = raw.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  raw = raw.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Inline code
  raw = raw.replace(/\`([^\`]+)\`/g, '<code>$1</code>');

  // Lists
  raw = raw.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');

  const lines = raw.split('\n');
  let out = '';
  let inList = false;

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('<li>')) {
      if (!inList) { out += '<ul>'; inList = true; }
      out += trimmed;
    } else {
      if (inList) { out += '</ul>'; inList = false; }
      if (trimmed.length > 0 && !trimmed.startsWith('<h') && !trimmed.startsWith('<pre') && !trimmed.startsWith('<div') && !trimmed.startsWith('<blockquote') && !trimmed.startsWith('---')) {
        out += '<p>' + trimmed + '</p>';
      } else if (trimmed === '---') {
        out += '<hr style="border:0;border-top:1px solid var(--border-color);margin:1.5rem 0;">';
      } else {
        out += line + '\n';
      }
    }
  }
  if (inList) out += '</ul>';

  return out;
}
