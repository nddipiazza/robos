'use strict';

let allBuiltin = [];
let allCustom  = [];
let activeCategory = 'All';
let searchQuery = '';
let editingId = null;

// ── Boot ─────────────────────────────────────────────────────────────────────
async function init() {
  const result = await window.robos.skillsList();
  if (!result.ok) { showError('Failed to load skills'); return; }
  allBuiltin = result.builtin || [];
  allCustom  = result.custom  || [];
  renderAll();
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function allSkills() {
  return [...allBuiltin, ...allCustom];
}

function filteredSkills() {
  let skills = allSkills();
  if (activeCategory !== 'All') skills = skills.filter(s => s.category === activeCategory);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    skills = skills.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.tags || []).some(t => t.toLowerCase().includes(q)) ||
      s.category.toLowerCase().includes(q)
    );
  }
  return skills;
}

function categories() {
  const cats = [...new Set(allSkills().map(s => s.category))].sort();
  return ['All', ...cats];
}

function renderAll() {
  renderCategoryTabs();
  renderGrid();
  updateCountBadge();
}

function renderCategoryTabs() {
  const container = document.getElementById('category-tabs');
  container.innerHTML = categories().map(c =>
    `<button class="cat-tab${c === activeCategory ? ' active' : ''}" data-cat="${escHtml(c)}">${escHtml(c)}</button>`
  ).join('');
  container.querySelectorAll('.cat-tab').forEach(btn => {
    btn.addEventListener('click', () => { activeCategory = btn.dataset.cat; renderAll(); });
  });
}

function renderGrid() {
  const grid = document.getElementById('skills-grid');
  const skills = filteredSkills();

  if (!skills.length) {
    grid.innerHTML = `<div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#30363d" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <p>No skills match your search.</p>
    </div>`;
    return;
  }

  grid.innerHTML = skills.map(s => renderSkillCard(s)).join('');

  grid.querySelectorAll('[data-action="copy"]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.command || '').catch(() => {});
      btn.textContent = '✓ Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
  });
  grid.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });
  grid.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteSkill(btn.dataset.id));
  });
}

function renderSkillCard(s) {
  const isCustom = s.source !== 'builtin';
  const tags = (s.tags || []).map(t => `<span class="tag-chip">${escHtml(t)}</span>`).join('');
  const editBtn = isCustom
    ? `<button class="btn btn-sm btn-outline" data-action="edit" data-id="${escHtml(s.id)}">Edit</button>`
    : '';
  const deleteBtn = isCustom
    ? `<button class="btn btn-sm btn-danger" data-action="delete" data-id="${escHtml(s.id)}">Delete</button>`
    : '';

  return `<div class="skill-card${isCustom ? ' custom-skill' : ''}">
    <div class="skill-card-header">
      <span class="skill-name">${escHtml(s.name)}</span>
      <span class="skill-badge ${isCustom ? (s.source === 'pack' ? 'pack' : 'custom') : 'builtin'}">${isCustom ? (s.source === 'pack' ? '📦 pack' : 'custom') : 'built-in'}</span>
    </div>
    <p class="skill-desc">${escHtml(s.description || '')}</p>
    ${s.command ? `<pre class="skill-command">${escHtml(s.command)}</pre>` : ''}
    ${tags ? `<div class="skill-tags">${tags}</div>` : ''}
    <div class="skill-actions">
      ${s.command ? `<button class="btn btn-sm btn-accent" data-action="copy" data-command="${escHtml(s.command || '')}">Copy</button>` : ''}
      ${editBtn}
      ${deleteBtn}
    </div>
  </div>`;
}

function updateCountBadge() {
  const total = allSkills().length;
  const shown = filteredSkills().length;
  document.getElementById('skill-count').textContent =
    shown === total ? `${total} skills` : `${shown} / ${total} skills`;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'New Skill';
  document.getElementById('field-name').value = '';
  document.getElementById('field-category').value = '';
  document.getElementById('field-description').value = '';
  document.getElementById('field-command').value = '';
  document.getElementById('field-tags').value = '';
  document.getElementById('skill-modal').style.display = 'flex';
}

function openEditModal(id) {
  const skill = allCustom.find(s => s.id === id);
  if (!skill) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'Edit Skill';
  document.getElementById('field-name').value = skill.name || '';
  document.getElementById('field-category').value = skill.category || '';
  document.getElementById('field-description').value = skill.description || '';
  document.getElementById('field-command').value = skill.command || '';
  document.getElementById('field-tags').value = (skill.tags || []).join(', ');
  document.getElementById('skill-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('skill-modal').style.display = 'none';
}

async function saveModalSkill() {
  const name = document.getElementById('field-name').value.trim();
  const category = document.getElementById('field-category').value.trim();
  if (!name || !category) { alert('Name and Category are required.'); return; }

  const tags = document.getElementById('field-tags').value
    .split(',').map(t => t.trim()).filter(Boolean);

  const skill = {
    id: editingId || `custom-${Date.now()}`,
    name,
    category,
    description: document.getElementById('field-description').value.trim(),
    command: document.getElementById('field-command').value.trim(),
    tags,
    source: 'custom',
  };

  if (editingId) {
    const idx = allCustom.findIndex(s => s.id === editingId);
    if (idx >= 0) allCustom[idx] = skill;
    else allCustom.push(skill);
  } else {
    allCustom.push(skill);
  }

  const result = await window.robos.skillsSaveCustom(allCustom);
  if (!result.ok) { alert('Failed to save: ' + result.error); return; }
  closeModal();
  renderAll();
}

async function deleteSkill(id) {
  if (!confirm('Delete this custom skill?')) return;
  allCustom = allCustom.filter(s => s.id !== id);
  await window.robos.skillsSaveCustom(allCustom);
  renderAll();
}

// ── Skill Packs ───────────────────────────────────────────────────────────────
let currentPack = null;
let allPatterns = [];
let selectedPatterns = new Set();
let previewPattern = null;
let patternFilterQuery = '';
let patternFilterCat = 'All';

async function loadPacksView() {
  const res = await window.robos.skillsPacksList();
  if (!res.ok) { document.getElementById('packs-grid').innerHTML = `<p class="error-msg">Failed to load packs.</p>`; return; }
  renderPacksGrid(res.packs);
}

function renderPacksGrid(packs) {
  const grid = document.getElementById('packs-grid');
  grid.innerHTML = packs.map(p => `
    <div class="pack-card" data-pack-id="${escHtml(p.id)}">
      <div class="pack-card-badge" style="background:${p.badgeColor || '#7c3aed'}">${escHtml(p.id.split('/')[0])}</div>
      <div class="pack-card-body">
        <div class="pack-card-top">
          <span class="pack-name">${escHtml(p.name)}</span>
          ${p.cloneUrl
            ? `<a class="pack-repo-link" href="#" data-url="https://github.com/${escHtml(p.id)}">${escHtml(p.id)}</a>`
            : `<span class="pack-builtin-badge">Built-in</span>`}
        </div>
        <p class="pack-desc">${escHtml(p.description)}</p>
        <div class="pack-meta">
          <span class="pack-meta-item">${escHtml(p.stars)}</span>
          <span class="pack-meta-item">📋 ${escHtml(String(p.patternCount))} patterns</span>
          ${p.isCloned ? `<span class="pack-meta-item cloned">✓ Cloned locally</span>` : ''}
          ${p.tags.map(t => `<span class="pack-tag">${escHtml(t)}</span>`).join('')}
        </div>
        <div class="pack-actions">
          <button class="btn btn-accent" data-action="browse-pack" data-pack-id="${escHtml(p.id)}">Browse Patterns</button>
          ${p.cloneUrl
            ? `<button class="btn btn-outline" data-action="clone-pack" data-pack-id="${escHtml(p.id)}">${p.isCloned ? '↻ Update' : '⬇ Clone Repo'}</button>`
            : `<button class="btn btn-outline" disabled title="Built-in pack — always available">✓ Always Available</button>`}
        </div>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('[data-action="browse-pack"]').forEach(btn => {
    btn.addEventListener('click', () => openPackBrowser(btn.dataset.packId, packs));
  });
  grid.querySelectorAll('[data-action="clone-pack"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pack = packs.find(p => p.id === btn.dataset.packId);
      if (pack) await clonePack(pack, packs);
    });
  });
}

async function openPackBrowser(packId, packs) {
  currentPack = packs.find(p => p.id === packId);
  if (!currentPack) return;

  document.getElementById('packs-list-view').style.display = 'none';
  document.getElementById('packs-browser-view').style.display = 'flex';
  document.getElementById('browser-pack-title').textContent = currentPack.name + ' — ' + currentPack.id;

  selectedPatterns = new Set();
  updateSelectedCount();

  document.getElementById('pattern-list-status').textContent = 'Loading patterns…';
  document.getElementById('pattern-list').innerHTML = '';
  document.getElementById('preview-pane').style.display = 'none';

  const res = await window.robos.skillsPacksBrowse(packId);
  if (!res.ok) {
    document.getElementById('pattern-list-status').textContent = 'Error: ' + res.error;
    return;
  }
  allPatterns = res.patterns;

  // Populate category filter
  const cats = ['All', ...new Set(allPatterns.map(p => p.category)).values()].sort((a, b) => a === 'All' ? -1 : a.localeCompare(b));
  const sel = document.getElementById('pattern-cat-filter');
  sel.innerHTML = cats.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');

  document.getElementById('pattern-list-status').textContent =
    `${allPatterns.length} patterns from ${res.source === 'local' ? 'local clone' : 'GitHub API'}`;

  patternFilterQuery = '';
  patternFilterCat = 'All';
  document.getElementById('pattern-search').value = '';
  renderPatternList();
}

function filteredPatterns() {
  let p = allPatterns;
  if (patternFilterCat !== 'All') p = p.filter(x => x.category === patternFilterCat);
  if (patternFilterQuery) {
    const q = patternFilterQuery.toLowerCase();
    p = p.filter(x => x.name.toLowerCase().includes(q) || x.category.toLowerCase().includes(q) || x.id.toLowerCase().includes(q));
  }
  return p;
}

function renderPatternList() {
  const list = document.getElementById('pattern-list');
  const patterns = filteredPatterns();

  if (!patterns.length) {
    list.innerHTML = `<div class="empty-state small"><p>No patterns match.</p></div>`;
    return;
  }

  list.innerHTML = patterns.map(p => `
    <div class="pattern-row${p.installed ? ' installed' : ''}${selectedPatterns.has(p.id) ? ' selected' : ''}" data-id="${escHtml(p.id)}">
      <label class="pattern-check-label">
        <input type="checkbox" class="pattern-check" data-id="${escHtml(p.id)}" ${selectedPatterns.has(p.id) ? 'checked' : ''} ${p.installed ? 'disabled' : ''}/>
      </label>
      <div class="pattern-info" data-action="preview" data-id="${escHtml(p.id)}">
        <span class="pattern-name">${escHtml(p.name)}</span>
        <span class="pattern-cat-badge">${escHtml(p.category)}</span>
      </div>
      <div class="pattern-row-actions">
        ${p.installed
          ? `<span class="installed-badge">✓ Installed</span>`
          : `<button class="btn btn-sm btn-accent" data-action="install-one" data-id="${escHtml(p.id)}">Install</button>`
        }
        <button class="btn btn-sm btn-ghost" data-action="preview" data-id="${escHtml(p.id)}">Preview</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.pattern-check').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) selectedPatterns.add(cb.dataset.id);
      else selectedPatterns.delete(cb.dataset.id);
      updateSelectedCount();
      // Update row highlight
      const row = list.querySelector(`.pattern-row[data-id="${cb.dataset.id}"]`);
      if (row) row.classList.toggle('selected', cb.checked);
    });
  });
  list.querySelectorAll('[data-action="preview"]').forEach(el => {
    el.addEventListener('click', () => openPreview(el.dataset.id));
  });
  list.querySelectorAll('[data-action="install-one"]').forEach(btn => {
    btn.addEventListener('click', () => installPatterns([allPatterns.find(p => p.id === btn.dataset.id)].filter(Boolean)));
  });
}

function updateSelectedCount() {
  const n = selectedPatterns.size;
  document.getElementById('selected-count').textContent = n;
  document.getElementById('btn-install-selected').disabled = n === 0;
}

async function openPreview(patternId) {
  previewPattern = allPatterns.find(p => p.id === patternId);
  if (!previewPattern) return;

  const pane = document.getElementById('preview-pane');
  pane.style.display = 'flex';
  document.getElementById('preview-title').textContent = previewPattern.name;
  document.getElementById('preview-content').textContent = 'Loading…';

  const btnInstall = document.getElementById('btn-install-preview');
  btnInstall.textContent = previewPattern.installed ? '✓ Installed' : 'Install';
  btnInstall.disabled = previewPattern.installed;

  const res = await window.robos.skillsPacksPreview(previewPattern);
  if (!res.ok) {
    document.getElementById('preview-content').textContent = 'Error: ' + res.error;
    return;
  }
  // Cache system.md on the pattern object for bulk imports
  previewPattern.systemMd = res.content;
  document.getElementById('preview-content').textContent = res.content;
}

async function installPatterns(patterns) {
  if (!patterns || !patterns.length) return;
  const res = await window.robos.skillsPacksImport({ patterns });
  if (!res.ok) { alert('Import failed: ' + res.error); return; }

  // Refresh installed status
  patterns.forEach(p => { p.installed = true; });
  allCustom = (await window.robos.skillsList()).custom || allCustom;
  renderPatternList();
  updateCountBadge();

  // Show toast-like feedback
  const status = document.getElementById('pattern-list-status');
  const prev = status.textContent;
  status.textContent = `✓ Installed ${res.added} pattern${res.added !== 1 ? 's' : ''} — ${res.total} total skills`;
  status.style.color = 'var(--accent)';
  setTimeout(() => { status.textContent = prev; status.style.color = ''; }, 3000);

  // Update preview button if open
  if (previewPattern) {
    const btn = document.getElementById('btn-install-preview');
    const installed = patterns.find(p => p.id === previewPattern.id);
    if (installed) { btn.textContent = '✓ Installed'; btn.disabled = true; }
  }
}

async function clonePack(pack, packs) {
  const overlay = document.getElementById('clone-overlay');
  const msg = document.getElementById('clone-status-msg');
  const bar = document.getElementById('clone-progress');

  overlay.style.display = 'flex';
  msg.textContent = `Cloning ${pack.id}…`;
  bar.style.width = '15%';

  // Animate progress bar while waiting
  let pct = 15;
  const ticker = setInterval(() => {
    pct = Math.min(pct + 2, 85);
    bar.style.width = pct + '%';
  }, 800);

  const res = await window.robos.skillsPacksClone(pack.id);
  clearInterval(ticker);
  bar.style.width = res.ok ? '100%' : '0%';

  if (!res.ok) {
    msg.textContent = 'Error: ' + res.error;
    setTimeout(() => { overlay.style.display = 'none'; }, 3500);
    return;
  }

  msg.textContent = res.action === 'updated' ? '✓ Repo updated!' : '✓ Cloned successfully!';
  setTimeout(() => {
    overlay.style.display = 'none';
    // Refresh packs list then re-open browser
    pack.isCloned = true;
    renderPacksGrid(packs);
    openPackBrowser(pack.id, packs);
  }, 1200);
}

// ── Top-level navigation ──────────────────────────────────────────────────────
function switchView(view) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  document.getElementById('view-my-skills').style.display   = view === 'my-skills'   ? 'flex' : 'none';
  document.getElementById('view-skill-packs').style.display = view === 'skill-packs' ? 'flex' : 'none';

  if (view === 'skill-packs') loadPacksView();
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showError(msg) {
  document.getElementById('skills-grid').innerHTML =
    `<div class="empty-state"><p style="color:var(--red)">${escHtml(msg)}</p></div>`;
}

// ── Event wiring ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  init();

  // Header navigation
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  // My Skills
  document.getElementById('btn-add-skill').addEventListener('click', openAddModal);
  document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', closeModal);
  document.getElementById('btn-modal-save').addEventListener('click', saveModalSkill);

  document.getElementById('btn-open-ai-prompt').addEventListener('click', async () => {
    await window.robos.skillsOpenAiPrompt();
  });

  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value;
    renderAll();
  });

  // Skill Packs browser
  document.getElementById('btn-back-to-packs').addEventListener('click', () => {
    document.getElementById('packs-browser-view').style.display = 'none';
    document.getElementById('packs-list-view').style.display = 'block';
  });

  document.getElementById('btn-close-preview').addEventListener('click', () => {
    document.getElementById('preview-pane').style.display = 'none';
  });

  document.getElementById('btn-install-preview').addEventListener('click', () => {
    if (previewPattern) installPatterns([previewPattern]);
  });

  document.getElementById('btn-install-selected').addEventListener('click', () => {
    const toInstall = allPatterns.filter(p => selectedPatterns.has(p.id));
    installPatterns(toInstall);
    selectedPatterns.clear();
    updateSelectedCount();
  });

  document.getElementById('btn-install-all').addEventListener('click', async () => {
    if (!confirm(`Install all ${allPatterns.filter(p => !p.installed).length} uninstalled patterns from this pack?`)) return;
    await installPatterns(allPatterns.filter(p => !p.installed));
  });

  document.getElementById('btn-clone-pack').addEventListener('click', async () => {
    if (currentPack) {
      const res = await window.robos.skillsPacksList();
      const packs = res.ok ? res.packs : [];
      await clonePack(currentPack, packs);
    }
  });

  document.getElementById('pattern-search').addEventListener('input', e => {
    patternFilterQuery = e.target.value;
    renderPatternList();
  });

  document.getElementById('pattern-cat-filter').addEventListener('change', e => {
    patternFilterCat = e.target.value;
    renderPatternList();
  });
});

// ── Rendering ─────────────────────────────────────────────────────────────────
function allSkills() {
  return [...allBuiltin, ...allCustom];
}

function filteredSkills() {
  let skills = allSkills();
  if (activeCategory !== 'All') skills = skills.filter(s => s.category === activeCategory);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    skills = skills.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.tags || []).some(t => t.toLowerCase().includes(q)) ||
      s.category.toLowerCase().includes(q)
    );
  }
  return skills;
}

function categories() {
  const cats = [...new Set(allSkills().map(s => s.category))].sort();
  return ['All', ...cats];
}

function renderAll() {
  renderCategoryTabs();
  renderGrid();
  updateCountBadge();
}

function renderCategoryTabs() {
  const container = document.getElementById('category-tabs');
  container.innerHTML = categories().map(c =>
    `<button class="cat-tab${c === activeCategory ? ' active' : ''}" data-cat="${escHtml(c)}">${escHtml(c)}</button>`
  ).join('');
  container.querySelectorAll('.cat-tab').forEach(btn => {
    btn.addEventListener('click', () => { activeCategory = btn.dataset.cat; renderAll(); });
  });
}

function renderGrid() {
  const grid = document.getElementById('skills-grid');
  const skills = filteredSkills();

  if (!skills.length) {
    grid.innerHTML = `<div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#30363d" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <p>No skills match your search.</p>
    </div>`;
    return;
  }

  grid.innerHTML = skills.map(s => renderSkillCard(s)).join('');

  grid.querySelectorAll('[data-action="copy"]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.command || '').catch(() => {});
      btn.textContent = '✓ Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
  });
  grid.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });
  grid.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteSkill(btn.dataset.id));
  });
}

function renderSkillCard(s) {
  const isCustom = s.source !== 'builtin';
  const tags = (s.tags || []).map(t => `<span class="tag-chip">${escHtml(t)}</span>`).join('');
  const editBtn = isCustom
    ? `<button class="btn btn-sm btn-outline" data-action="edit" data-id="${escHtml(s.id)}">Edit</button>`
    : '';
  const deleteBtn = isCustom
    ? `<button class="btn btn-sm btn-danger" data-action="delete" data-id="${escHtml(s.id)}">Delete</button>`
    : '';

  return `<div class="skill-card${isCustom ? ' custom-skill' : ''}">
    <div class="skill-card-header">
      <span class="skill-name">${escHtml(s.name)}</span>
      <span class="skill-badge ${isCustom ? 'custom' : 'builtin'}">${isCustom ? 'custom' : 'built-in'}</span>
    </div>
    <p class="skill-desc">${escHtml(s.description || '')}</p>
    ${s.command ? `<pre class="skill-command">${escHtml(s.command)}</pre>` : ''}
    ${tags ? `<div class="skill-tags">${tags}</div>` : ''}
    <div class="skill-actions">
      <button class="btn btn-sm btn-accent" data-action="copy" data-command="${escHtml(s.command || '')}">Copy</button>
      ${editBtn}
      ${deleteBtn}
    </div>
  </div>`;
}

function updateCountBadge() {
  const total = allSkills().length;
  const shown = filteredSkills().length;
  document.getElementById('skill-count').textContent =
    shown === total ? `${total} skills` : `${shown} / ${total} skills`;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'New Skill';
  document.getElementById('field-name').value = '';
  document.getElementById('field-category').value = '';
  document.getElementById('field-description').value = '';
  document.getElementById('field-command').value = '';
  document.getElementById('field-tags').value = '';
  document.getElementById('skill-modal').style.display = 'flex';
}

function openEditModal(id) {
  const skill = allCustom.find(s => s.id === id);
  if (!skill) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'Edit Skill';
  document.getElementById('field-name').value = skill.name || '';
  document.getElementById('field-category').value = skill.category || '';
  document.getElementById('field-description').value = skill.description || '';
  document.getElementById('field-command').value = skill.command || '';
  document.getElementById('field-tags').value = (skill.tags || []).join(', ');
  document.getElementById('skill-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('skill-modal').style.display = 'none';
}

async function saveModalSkill() {
  const name = document.getElementById('field-name').value.trim();
  const category = document.getElementById('field-category').value.trim();
  if (!name || !category) { alert('Name and Category are required.'); return; }

  const tags = document.getElementById('field-tags').value
    .split(',').map(t => t.trim()).filter(Boolean);

  const skill = {
    id: editingId || `custom-${Date.now()}`,
    name,
    category,
    description: document.getElementById('field-description').value.trim(),
    command: document.getElementById('field-command').value.trim(),
    tags,
    source: 'custom',
  };

  if (editingId) {
    const idx = allCustom.findIndex(s => s.id === editingId);
    if (idx >= 0) allCustom[idx] = skill;
    else allCustom.push(skill);
  } else {
    allCustom.push(skill);
  }

  const result = await window.robos.skillsSaveCustom(allCustom);
  if (!result.ok) { alert('Failed to save: ' + result.error); return; }
  closeModal();
  renderAll();
}

async function deleteSkill(id) {
  if (!confirm('Delete this custom skill?')) return;
  allCustom = allCustom.filter(s => s.id !== id);
  await window.robos.skillsSaveCustom(allCustom);
  renderAll();
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showError(msg) {
  document.getElementById('skills-grid').innerHTML =
    `<div class="empty-state"><p style="color:var(--red)">${escHtml(msg)}</p></div>`;
}

// ── Event wiring ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  init();

  document.getElementById('btn-add-skill').addEventListener('click', openAddModal);
  document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', closeModal);
  document.getElementById('btn-modal-save').addEventListener('click', saveModalSkill);

  document.getElementById('btn-open-ai-prompt').addEventListener('click', async () => {
    await window.robos.skillsOpenAiPrompt();
  });

  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value;
    renderAll();
  });
});
