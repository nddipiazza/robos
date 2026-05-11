'use strict';

let allSkills = [];       // builtin + custom combined
let customSkills = [];
let selectedSkillIds = new Set();
let skillParams = {};     // { [skillId]: { [paramName]: value } }
let skillFilter = '';
let historyVisible = false;
let running = false;

// ── Parameter parsing ─────────────────────────────────────────────────────────
function extractParams(command) {
  const matches = (command || '').match(/\$([A-Z][A-Z0-9_]*)/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(1)))];
}

function substituteParams(command, params) {
  return command.replace(/\$([A-Z][A-Z0-9_]*)/g, (_, name) => params[name] || `$${name}`);
}

// ── Boot ─────────────────────────────────────────────────────────────────────
async function init() {
  const r = await window.robos.listSkills();
  if (r.ok) {
    customSkills = r.custom || [];
    allSkills = [...(r.builtin || []), ...customSkills];
    renderSidebar();
  }
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar() {
  const container = document.getElementById('skills-list');
  const q = skillFilter.toLowerCase();
  const filtered = allSkills.filter(s =>
    !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) ||
    (s.tags || []).some(t => t.includes(q))
  );

  if (!filtered.length) {
    container.innerHTML = `<div class="sidebar-empty">${
      allSkills.length ? 'No skills match filter.' : 'No skills yet. Open Skills Manager to add some.'
    }</div>`;
    return;
  }

  // Group by category
  const groups = {};
  filtered.forEach(s => {
    if (!groups[s.category]) groups[s.category] = [];
    groups[s.category].push(s);
  });

  container.innerHTML = Object.entries(groups).map(([cat, skills]) =>
    `<div class="sidebar-category">
      <div class="sidebar-category-header">${escHtml(cat)}</div>
      ${skills.map(s =>
        `<div class="sidebar-skill${selectedSkillIds.has(s.id) ? ' selected' : ''}" data-id="${escHtml(s.id)}" title="${escHtml(s.description || '')}">
          <div class="sidebar-skill-name">${escHtml(s.name)}</div>
          ${s.source === 'custom' ? '<span class="sidebar-skill-badge">custom</span>' : ''}
        </div>`
      ).join('')}
    </div>`
  ).join('');

  container.querySelectorAll('.sidebar-skill').forEach(el => {
    el.addEventListener('click', () => toggleSkill(el.dataset.id));
  });
}

function toggleSkill(id) {
  if (selectedSkillIds.has(id)) {
    selectedSkillIds.delete(id);
    delete skillParams[id];
  } else {
    selectedSkillIds.add(id);
    const skill = allSkills.find(s => s.id === id);
    if (skill) {
      const params = extractParams(skill.command);
      skillParams[id] = {};
      params.forEach(p => { skillParams[id][p] = ''; });
    }
  }
  renderSidebar();
  renderSkillChips();
  updateRunButton();
}

function renderSkillChips() {
  const container = document.getElementById('skill-chips');
  const selected = allSkills.filter(s => selectedSkillIds.has(s.id));
  if (!selected.length) { container.innerHTML = ''; updateRunButton(); return; }

  container.innerHTML = selected.map(s => {
    const params = Object.keys(skillParams[s.id] || {});
    const hasParams = params.length > 0;
    return `<div class="skill-chip-card${hasParams ? ' has-params' : ''}">
      <div class="skill-chip-header">
        <span class="skill-chip-name">${escHtml(s.name)}</span>
        <button class="skill-chip-remove" data-id="${escHtml(s.id)}" title="Remove skill">✕</button>
      </div>
      ${hasParams ? `<div class="skill-chip-params">
        ${params.map(p => `
          <div class="skill-param-row">
            <label class="skill-param-label">${escHtml(p)}</label>
            <input class="skill-param-input" data-skill="${escHtml(s.id)}" data-param="${escHtml(p)}"
              placeholder="value for $${escHtml(p)}"
              value="${escHtml((skillParams[s.id] || {})[p] || '')}"/>
          </div>`).join('')}
      </div>` : ''}
    </div>`;
  }).join('');

  container.querySelectorAll('.skill-chip-remove').forEach(el => {
    el.addEventListener('click', () => {
      selectedSkillIds.delete(el.dataset.id);
      delete skillParams[el.dataset.id];
      renderSidebar();
      renderSkillChips();
      updateRunButton();
    });
  });

  container.querySelectorAll('.skill-param-input').forEach(el => {
    el.addEventListener('input', () => {
      if (!skillParams[el.dataset.skill]) skillParams[el.dataset.skill] = {};
      skillParams[el.dataset.skill][el.dataset.param] = el.value;
    });
    // Stop skill sidebar toggling when clicking inside a param input
    el.addEventListener('click', e => e.stopPropagation());
  });
}

function updateRunButton() {
  const btn = document.getElementById('btn-run');
  const hint = document.getElementById('run-hint');
  const hasSkills = selectedSkillIds.size > 0;
  if (btn) btn.disabled = running;
  if (hint) hint.style.display = hasSkills ? 'none' : 'inline';
}

// ── Run prompt ────────────────────────────────────────────────────────────────
async function runPrompt() {
  if (running) return;
  const inputEl = document.getElementById('prompt-input');
  const prompt = (inputEl.value || '').trim();
  const hasSkills = selectedSkillIds.size > 0;

  if (!prompt && !hasSkills) {
    setStatus('Enter a prompt or select a skill first.', true);
    return;
  }

  running = true;
  setRunning(true);
  setStatus('Running AI agent…');
  document.getElementById('results-section').style.display = 'none';

  const skillHints = allSkills
    .filter(s => selectedSkillIds.has(s.id))
    .map(s => {
      const params = skillParams[s.id] || {};
      return { name: s.name, command: substituteParams(s.command || '', params) };
    });

  const agent = inputEl && inputEl.agent ? inputEl.agent : 'copilot';
  const effectivePrompt = prompt || 'Run the selected skills and show me the results.';

  const r = await window.robos.runPrompt({ prompt: effectivePrompt, skillHints, agent });

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

        // Login button in auth banner opens a terminal with the login command
        promptEl.addEventListener('robos-agent-login', (e) => {
          const agentId = e.detail && e.detail.agent;
          const loginCmd = agentId === 'copilot' ? 'gh auth login' : 'claude /login';
          window.robos.openLoginTerminal && window.robos.openLoginTerminal(loginCmd);
        });
      }
    }).catch(() => {});
  }

  document.getElementById('btn-clear-prompt').addEventListener('click', () => {
    document.getElementById('prompt-input').value = '';
    document.getElementById('results-section').style.display = 'none';
    document.getElementById('btn-clear-prompt').style.display = 'none';
    selectedSkillIds.clear();
    skillParams = {};
    renderSidebar();
    renderSkillChips();
    updateRunButton();
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
