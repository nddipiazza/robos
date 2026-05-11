'use strict';

let customSkills = [];
let selectedSkillIds = new Set();
let skillFilter = '';
let historyVisible = false;
let running = false;

// ── Boot ─────────────────────────────────────────────────────────────────────
async function init() {
  const r = await window.robos.listSkills();
  if (r.ok) {
    customSkills = r.custom || [];
    renderSidebar();
  }
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar() {
  const container = document.getElementById('skills-list');
  const q = skillFilter.toLowerCase();
  const filtered = customSkills.filter(s =>
    !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)
  );

  if (!filtered.length) {
    container.innerHTML = `<div class="sidebar-empty">${
      customSkills.length ? 'No skills match filter.' : 'No custom skills yet.<br/>Open Skills Manager to add some.'
    }</div>`;
    return;
  }

  container.innerHTML = filtered.map(s =>
    `<div class="sidebar-skill${selectedSkillIds.has(s.id) ? ' selected' : ''}" data-id="${escHtml(s.id)}">
      <div class="sidebar-skill-name">${escHtml(s.name)}</div>
      <div class="sidebar-skill-cat">${escHtml(s.category)}</div>
    </div>`
  ).join('');

  container.querySelectorAll('.sidebar-skill').forEach(el => {
    el.addEventListener('click', () => toggleSkill(el.dataset.id));
  });
}

function toggleSkill(id) {
  if (selectedSkillIds.has(id)) selectedSkillIds.delete(id);
  else selectedSkillIds.add(id);
  renderSidebar();
  renderSkillChips();
}

function renderSkillChips() {
  const container = document.getElementById('skill-chips');
  const selected = customSkills.filter(s => selectedSkillIds.has(s.id));
  if (!selected.length) { container.innerHTML = ''; return; }
  container.innerHTML = selected.map(s =>
    `<span class="skill-chip">
      ${escHtml(s.name)}
      <span class="skill-chip-remove" data-id="${escHtml(s.id)}">✕</span>
    </span>`
  ).join('');
  container.querySelectorAll('.skill-chip-remove').forEach(el => {
    el.addEventListener('click', () => { selectedSkillIds.delete(el.dataset.id); renderSidebar(); renderSkillChips(); });
  });
}

// ── Run prompt ────────────────────────────────────────────────────────────────
async function runPrompt() {
  if (running) return;
  const prompt = document.getElementById('prompt-input').value.trim();
  if (!prompt) { setStatus('Enter a prompt first.', true); return; }

  running = true;
  setRunning(true);
  setStatus('Running AI agent…');
  document.getElementById('results-section').style.display = 'none';

  const skillHints = customSkills.filter(s => selectedSkillIds.has(s.id))
    .map(s => ({ name: s.name, command: s.command }));

  const inputEl = document.getElementById('prompt-input');
  const agent = inputEl && inputEl.agent ? inputEl.agent : 'claude';

  const r = await window.robos.runPrompt({ prompt, skillHints, agent });

  setRunning(false);
  running = false;

  if (!r.ok) {
    setStatus('Error: ' + r.error, true);
    return;
  }

  setStatus('');
  displayResults(r.result);
  document.getElementById('btn-clear-prompt').style.display = 'inline-flex';
}

function setRunning(isRunning) {
  const btn = document.getElementById('btn-run');
  const spinner = document.getElementById('btn-run-spinner');
  const text = document.getElementById('btn-run-text');
  btn.disabled = isRunning;
  spinner.style.display = isRunning ? 'inline-block' : 'none';
  text.textContent = isRunning ? 'Running…' : 'Run with AI';
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('run-status');
  el.textContent = msg;
  el.className = 'status-text' + (isError ? ' error' : '');
}

function displayResults(result) {
  const section = document.getElementById('results-section');
  const success = result.success !== false;

  section.className = 'results-section' + (success ? '' : ' failed');
  section.style.display = 'block';

  document.getElementById('results-status-icon').textContent = success ? '✓' : '✗';
  document.getElementById('results-status-icon').style.color = success ? 'var(--green)' : 'var(--red)';
  document.getElementById('results-summary').textContent = result.summary || 'No summary provided';

  const steps = result.steps || [];
  document.getElementById('steps-list').innerHTML = steps.map((step, i) => `
    <div class="step-item">
      <div class="step-header">
        <span class="step-num">Step ${i + 1}</span>
        <span class="step-action">${escHtml(step.action || '')}</span>
      </div>
      ${step.command ? `<pre class="step-command">${escHtml(step.command)}</pre>` : ''}
      ${step.output ? `<pre class="step-output">${escHtml(step.output)}</pre>` : ''}
      ${step.note ? `<p class="step-note">${escHtml(step.note)}</p>` : ''}
    </div>
  `).join('');

  document.getElementById('result-text').textContent = result.result || '';
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── History ───────────────────────────────────────────────────────────────────
async function loadHistory() {
  const r = await window.robos.historyList();
  const items = r.ok ? (r.history || []).reverse() : [];
  const container = document.getElementById('history-list');

  if (!items.length) {
    container.innerHTML = '<div class="history-empty">No history yet.</div>';
    return;
  }

  container.innerHTML = items.map(entry => {
    const result = entry.result || {};
    const success = result.success !== false;
    const ts = entry.ts ? new Date(entry.ts).toLocaleString() : '';
    return `<div class="history-item" data-id="${escHtml(entry.id)}">
      <div class="history-item-prompt">${escHtml(entry.prompt || '')}</div>
      <div class="history-item-summary">${escHtml(result.summary || '')}</div>
      <div class="history-item-meta">
        <span class="history-item-status ${success ? 'ok' : 'fail'}">${success ? '✓ OK' : '✗ Failed'}</span>
        &nbsp;·&nbsp;${escHtml(ts)}
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const entry = items.find(e => e.id === el.dataset.id);
      if (!entry) return;
      document.getElementById('prompt-input').value = entry.prompt || '';
      displayResults(entry.result || {});
      toggleHistory(false);
    });
  });
}

function toggleHistory(force) {
  historyVisible = typeof force === 'boolean' ? force : !historyVisible;
  document.getElementById('history-panel').style.display = historyVisible ? 'flex' : 'none';
  if (historyVisible) loadHistory();
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Event wiring ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  init();

  document.getElementById('btn-run').addEventListener('click', runPrompt);

  document.getElementById('prompt-input').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runPrompt();
  });

  // Wire @-mention file typeahead for robos-ai-textarea
  if (typeof customElements !== 'undefined') {
    customElements.whenDefined('robos-ai-textarea').then(() => {
      const promptEl = document.getElementById('prompt-input');
      if (promptEl && promptEl.addEventListener) {
        promptEl.addEventListener('robos-path-query', async (e) => {
          try {
            const r = await window.robos.searchIndex(e.detail.query);
            if (r && r.ok && promptEl._showMentions) promptEl._showMentions(r.items);
          } catch (_) {}
        });
      }
    }).catch(() => {});
  }

  document.getElementById('btn-clear-prompt').addEventListener('click', () => {
    document.getElementById('prompt-input').value = '';
    document.getElementById('results-section').style.display = 'none';
    document.getElementById('btn-clear-prompt').style.display = 'none';
    selectedSkillIds.clear();
    renderSidebar();
    renderSkillChips();
    setStatus('');
  });

  document.getElementById('btn-new-prompt').addEventListener('click', () => {
    document.getElementById('results-section').style.display = 'none';
    document.getElementById('prompt-input').focus();
  });

  document.getElementById('skill-search').addEventListener('input', e => {
    skillFilter = e.target.value;
    renderSidebar();
  });

  document.getElementById('btn-history-toggle').addEventListener('click', () => toggleHistory());
  document.getElementById('btn-history-close').addEventListener('click', () => toggleHistory(false));

  document.getElementById('btn-clear-history').addEventListener('click', async () => {
    if (!confirm('Clear all prompt history?')) return;
    await window.robos.historyClear();
    loadHistory();
  });

  document.getElementById('btn-open-skills').addEventListener('click', async () => {
    await window.robos.openSkillsManager();
  });
});
