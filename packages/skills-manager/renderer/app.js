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
