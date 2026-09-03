'use strict';

let serverInfo = null;
let tasks = [];
let existingEpics = [];
let parentEpicKey = null;

// Projects state
let projectsList = [];
let currentProjectId = null;
let currentProjectName = null;

// ── Modal helpers (replace native prompt/confirm/alert) ───────────────────────
let _inputModalResolve = null;

function showInputModal(title, placeholder, defaultValue) {
  return new Promise(resolve => {
    _inputModalResolve = resolve;
    const overlay = document.getElementById('save-modal-overlay');
    const input   = document.getElementById('save-modal-input');
    const heading = overlay.querySelector('.modal-title');
    if (heading) heading.textContent = title || 'Enter value';
    input.placeholder = placeholder || '';
    input.value = defaultValue || '';
    overlay.style.display = 'flex';
    setTimeout(() => input.focus(), 50);
  });
}

function _resolveInputModal(value) {
  document.getElementById('save-modal-overlay').style.display = 'none';
  if (_inputModalResolve) { _inputModalResolve(value); _inputModalResolve = null; }
}

async function nativeConfirm(message) {
  try {
    const r = await window.robos.dialogConfirm({ message });
    return r && r.ok;
  } catch {
    return false;
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  const result = await window.robos.getServerInfo();
  if (!result.ok) {
    document.getElementById('server-badge').textContent = 'No server';
    document.getElementById('no-server').style.display = 'flex';
    document.getElementById('main-content').style.display = 'none';
  } else {
    serverInfo = result.server;
    const badge = document.getElementById('server-badge');
    badge.textContent = `${serverInfo.name} (${serverInfo.type})`;
    badge.classList.add('connected');
    document.getElementById('no-server').style.display = 'none';
    document.getElementById('main-content').style.display = 'flex';

    if (serverInfo.type === 'jira') {
      document.getElementById('epic-parent-section').style.display = 'block';
      loadExistingEpics();
    }
  }

  await loadProjectsList();
}

async function loadExistingEpics() {
  const statusEl = document.getElementById('epic-fetch-status');
  statusEl.textContent = 'Fetching epics…';
  const result = await window.robos.fetchJiraEpics({
    jiraUrl: serverInfo.jiraUrl,
    jiraProject: serverInfo.jiraProject,
    username: serverInfo.jiraUsername,
    tokenPassPath: serverInfo.jiraTokenPassPath,
  });
  if (!result.ok) {
    statusEl.textContent = result.error || 'Could not load epics';
    return;
  }
  existingEpics = result.epics || [];
  statusEl.textContent = existingEpics.length ? '' : (result.warning ? '' : 'No existing epics found.');
  renderEpicDropdown();
}

function renderEpicDropdown() {
  const sel = document.getElementById('parent-epic-select');
  sel.innerHTML = '<option value="">— None (create new epics from plan) —</option>' +
    existingEpics.map(e =>
      `<option value="${escHtml(e.key)}">[${escHtml(e.key)}] ${escHtml(e.summary)}</option>`
    ).join('');
  sel.value = parentEpicKey || '';
}

// ── Projects ──────────────────────────────────────────────────────────────────
async function loadProjectsList() {
  try {
    const result = await window.robos.listProjects();
    projectsList = result.ok ? (result.projects || []) : [];
  } catch (_) {
    projectsList = [];
  }
  renderProjectsSidebar();
}

function renderProjectsSidebar() {
  const list = document.getElementById('project-list');
  if (!list) return;

  // If we have an active project not yet in list, ensure it's displayed
  let displayList = [...projectsList];
  if (currentProjectName && !displayList.some(p => p.id === currentProjectId || p.name === currentProjectName)) {
    displayList.unshift({ id: currentProjectId || 'current-new-proj', name: currentProjectName });
  }

  if (!displayList.length) {
    list.innerHTML = '<div class="project-empty">No projects yet.<br>Click + to start one.</div>';
    return;
  }

  list.innerHTML = displayList.map(p => `
    <div class="project-item ${(p.id === currentProjectId || (!currentProjectId && p.name === currentProjectName)) ? 'active' : ''}" data-id="${escHtml(p.id)}">
      <span class="project-item-name">${escHtml(p.name)}</span>
      <button class="project-delete-btn" data-id="${escHtml(p.id)}" title="Delete project">×</button>
    </div>
  `).join('');

  list.querySelectorAll('.project-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.classList.contains('project-delete-btn')) return;
      openProject(el.dataset.id);
    });
  });

  list.querySelectorAll('.project-delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const proj = projectsList.find(p => p.id === id);
      if (!proj) return;
      const ok = await nativeConfirm(`Delete project "${proj.name}"?`);
      if (!ok) return;
      const result = await window.robos.deleteProject(id);
      if (result.ok) {
        if (currentProjectId === id) {
          currentProjectId = null;
          currentProjectName = null;
          updateProjectBadge();
        }
        await loadProjectsList();
      } else {
        showCreateStatus('Failed to delete: ' + (result.error || 'unknown error'), true);
      }
    });
  });
}

async function openProject(id) {
  const result = await window.robos.loadProject(id);
  if (!result.ok) {
    showGenerateStatus('Could not load project: ' + (result.error || 'unknown error'), true);
    return;
  }
  const proj = result.project;
  currentProjectId = proj.id;
  currentProjectName = proj.name;

  tasks = (proj.tasks || []).map(t => ({
    title:         t.title || '',
    body:          t.body || t.description || '',
    labels:        Array.isArray(t.labels) ? t.labels : [],
    isEpic:        !!t.isEpic,
    epicName:      t.epicName || '',
    parentEpicIdx: typeof t.parentEpicIdx === 'number' ? t.parentEpicIdx : null,
    issueType:     t.issueType || '',
    epicKey:       t.epicKey || null,
    ticketKey:     t.ticketKey || null,
    ticketUrl:     t.ticketUrl || null,
    ticketStatus:  t.ticketStatus || null,
  }));

  if (proj.prompt) document.getElementById('prompt-input').value = proj.prompt;
  if (proj.parentEpicKey) {
    parentEpicKey = proj.parentEpicKey;
    const sel = document.getElementById('parent-epic-select');
    if (sel) sel.value = parentEpicKey;
  }

  renderTasks();
  updateCount();
  updateProjectBadge();
  renderProjectsSidebar();

  if (tasks.length) {
    document.getElementById('preview-section').style.display = 'block';
    document.getElementById('results-section').style.display = 'none';
  }
}

async function saveToProject() {
  if (!tasks.length) {
    showCreateStatus('Nothing to save. Generate some tasks first.', true);
    return;
  }

  const name = currentProjectName || (document.getElementById('current-project-badge') ? document.getElementById('current-project-badge').textContent.replace(/^📁\s*/, '') : '') || 'Acme Petshop Platform';

  const promptText = getPromptValue();
  const result = await window.robos.saveProject({
    id: currentProjectId || undefined,
    name,
    prompt: promptText,
    parentEpicKey: parentEpicKey || null,
    serverId: serverInfo ? serverInfo.id : null,
    tasks,
  });

  if (!result.ok) {
    showCreateStatus('Failed to save: ' + (result.error || 'unknown error'), true);
    return;
  }

  currentProjectId = result.id;
  currentProjectName = name;
  updateProjectBadge();
  await loadProjectsList();
  showCreateStatus(`✓ Saved to project "${name}"`);
}

let activeFeatureId = null;
let projectFeatures = [];
let projectRepos = [];

function renderProjectMetadataCard(name) {
  const card = document.getElementById('project-metadata-card');
  if (!card) return;
  card.style.display = 'flex';
  const nameEl = document.getElementById('project-meta-name');
  if (nameEl) nameEl.textContent = `📁 ${name}`;
  const slug = (name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const badge = document.getElementById('project-kgraph-badge');
  if (badge) badge.textContent = `⬡ KGraph: urn:robos:project:${slug}`;
  renderRepoTags();
}

function renderRepoTags() {
  const list = document.getElementById('repo-tags-list');
  if (!list) return;
  list.innerHTML = projectRepos.map((repo, idx) => `
    <span class="repo-tag" title="Click to remove" data-idx="${idx}">📦 ${escHtml(repo)} ×</span>
  `).join('');

  list.querySelectorAll('.repo-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const idx = parseInt(tag.dataset.idx, 10);
      projectRepos.splice(idx, 1);
      renderRepoTags();
    });
  });
}

function addRepoTag(name) {
  name = (name || '').trim();
  if (!name) return;
  if (!projectRepos.includes(name)) {
    projectRepos.push(name);
    renderRepoTags();
  }
}

function renderFeatureTabs() {
  const container = document.getElementById('project-features-tabs');
  if (!container) return;
  container.innerHTML = '';
  projectFeatures.forEach(feat => {
    const btn = document.createElement('button');
    btn.className = `feature-tab ${feat.id === activeFeatureId ? 'active' : ''}`;
    btn.textContent = feat.name;
    btn.addEventListener('click', () => switchFeature(feat.id));
    container.appendChild(btn);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'feature-tab-add';
  addBtn.id = 'btn-new-feature';
  addBtn.textContent = '+ Plan New Feature';
  addBtn.addEventListener('click', () => addNewFeature());
  container.appendChild(addBtn);
}

function switchFeature(featId) {
  const currentFeat = projectFeatures.find(f => f.id === activeFeatureId);
  if (currentFeat) currentFeat.tasks = [...tasks];

  activeFeatureId = featId;
  const targetFeat = projectFeatures.find(f => f.id === featId);
  if (targetFeat) {
    tasks = [...(targetFeat.tasks || [])];
    renderTasks();
    updateCount();
    document.getElementById('preview-section').style.display = 'block';
  }
  renderFeatureTabs();
}

function addNewFeature() {
  const featNum = projectFeatures.length + 1;
  const newFeat = {
    id: `feat-${featNum}`,
    name: `Feature ${featNum}: New Capability`,
    tasks: []
  };
  projectFeatures.push(newFeat);
  switchFeature(newFeat.id);
  showGenerateStatus(`Switched to ${newFeat.name}. Describe requirements below.`);
}

function updateProjectBadge() {
  const badge = document.getElementById('current-project-badge');
  if (!badge) return;
  if (currentProjectName) {
    badge.textContent = `📁 ${currentProjectName}`;
    badge.style.display = 'inline-flex';
    renderProjectMetadataCard(currentProjectName);
    renderFeatureTabs();
  } else {
    badge.style.display = 'none';
  }
}

// ── DOMContentLoaded ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  init();

  // Modal wiring
  document.getElementById('save-modal-ok').addEventListener('click', () => {
    _resolveInputModal(document.getElementById('save-modal-input').value);
  });
  document.getElementById('save-modal-cancel').addEventListener('click', () => _resolveInputModal(null));
  document.getElementById('save-modal-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      _resolveInputModal(e.target.value);
    }
    if (e.key === 'Escape') _resolveInputModal(null);
  });

  document.getElementById('btn-open-task-servers').addEventListener('click', () => window.robos.openTaskServers());
  document.getElementById('btn-generate').addEventListener('click', handleGenerate);

  const repoInput = document.getElementById('repo-tag-input');
  if (repoInput) {
    repoInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        addRepoTag(repoInput.value);
        repoInput.value = '';
      }
    });
  }

  // + New Project: show inline form in sidebar
  document.getElementById('btn-new-project').addEventListener('click', () => showNewProjectForm());

  function showNewProjectForm() {
    const form = document.getElementById('project-new-form');
    const input = document.getElementById('project-name-input');
    form.style.display = 'flex';
    input.value = '';
    input.focus();
  }

  function hideNewProjectForm() {
    document.getElementById('project-new-form').style.display = 'none';
  }

  async function applyNewProject(name) {
    name = (name || '').trim();
    if (!name) return;
    hideNewProjectForm();
    currentProjectName = name;
    tasks = [];
    parentEpicKey = null;
    projectFeatures = [];
    activeFeatureId = null;
    projectRepos = [];
    const techStackInput = document.getElementById('project-tech-stack');
    if (techStackInput) techStackInput.value = '';

    try {
      const saveRes = await window.robos.saveProject({
        name,
        prompt: '',
        serverId: serverInfo ? serverInfo.id : null,
        tasks: []
      });
      if (saveRes && saveRes.ok) {
        currentProjectId = saveRes.id;
      }
    } catch (_) {}

    await loadProjectsList();
    renderTasks();
    updateCount();
    updateProjectBadge();
    renderProjectMetadataCard(currentProjectName);
    renderFeatureTabs();
    document.getElementById('preview-section').style.display = 'block';
    document.getElementById('results-section').style.display = 'none';
    document.getElementById('prompt-input').value = '';
    showGenerateStatus(`Project "${currentProjectName}" created — describe tasks in prompt above or add manually below.`);
    document.getElementById('main-content').style.display = 'flex';
    document.getElementById('no-server').style.display = 'none';
    setTimeout(() => {
      const p = document.getElementById('prompt-input');
      if (p && p.focus) p.focus();
    }, 100);
  }

  document.getElementById('btn-project-confirm').addEventListener('click', () => {
    applyNewProject(document.getElementById('project-name-input').value);
  });
  document.getElementById('btn-project-cancel').addEventListener('click', hideNewProjectForm);
  document.getElementById('project-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      applyNewProject(e.target.value);
    }
    if (e.key === 'Escape') hideNewProjectForm();
  });

  const promptEl = document.getElementById('prompt-input');
  const genBtn = document.getElementById('btn-generate');
  function updateGenBtnState() {
    const val = getPromptValue();
    if (genBtn) {
      genBtn.disabled = !val || !val.trim();
    }
  }

  if (promptEl) {
    promptEl.addEventListener('input', updateGenBtnState);
    promptEl.addEventListener('change', updateGenBtnState);
    promptEl.addEventListener('keyup', updateGenBtnState);
    promptEl.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const val = getPromptValue();
        if (val && val.trim()) handleGenerate();
      }
    });
  }

  if (typeof customElements !== 'undefined') {
    customElements.whenDefined('robos-ai-textarea').then(() => {
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

  document.getElementById('btn-add-epic').addEventListener('click', () => {
    tasks.push({
      title: 'New Architecture Epic',
      body: 'Define epic scope, architectural boundaries, and deliverables.',
      labels: ['epic'],
      isEpic: true,
      epicName: 'New Epic',
      parentEpicIdx: null,
      issueType: 'Epic',
      ticketKey: null,
      ticketUrl: null,
      ticketStatus: null
    });
    renderTasks();
    document.getElementById('preview-section').style.display = 'block';
    updateCount();
  });

  document.getElementById('btn-add-task').addEventListener('click', () => {
    tasks.push({
      title: 'New Task / Story',
      body: 'Task implementation details, contracts, and acceptance criteria.',
      labels: [],
      isEpic: false,
      epicName: '',
      parentEpicIdx: null,
      issueType: 'Story',
      ticketKey: null,
      ticketUrl: null,
      ticketStatus: null
    });
    renderTasks();
    document.getElementById('preview-section').style.display = 'block';
    updateCount();
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    tasks = [];
    renderTasks();
    updateCount();
  });

  document.getElementById('btn-save-project').addEventListener('click', saveToProject);

  document.getElementById('parent-epic-select').addEventListener('change', e => {
    parentEpicKey = e.target.value || null;
  });

  document.getElementById('btn-create-all').addEventListener('click', handleSyncAll);
  document.getElementById('btn-plan-again').addEventListener('click', () => {
    document.getElementById('results-section').style.display = 'none';
    document.getElementById('preview-section').style.display = tasks.length ? 'block' : 'none';
  });

  const nextQBtn = document.getElementById('btn-question-next');
  if (nextQBtn) nextQBtn.addEventListener('click', handleNextQuestion);
  const prevQBtn = document.getElementById('btn-question-prev');
  if (prevQBtn) prevQBtn.addEventListener('click', handlePrevQuestion);
  const submitQBtn = document.getElementById('btn-question-submit');
  if (submitQBtn) submitQBtn.addEventListener('click', handleSubmitAnswers);
});

function getPromptValue() {
  const el = document.getElementById('prompt-input');
  if (!el) return '';
  if (typeof el.value === 'string' && el.value.trim()) return el.value.trim();
  const inner = el.querySelector('textarea, input');
  if (inner && inner.value && inner.value.trim()) return inner.value.trim();
  return (el.textContent || '').trim();
}

// ── Form-Based AI Clarification Wizard ───────────────────────────────────────
const ARCH_QUESTIONS = [
  {
    id: 'messaging',
    step: 'Question 1 of 2: Messaging & Event Pipeline',
    prompt: 'How should pet adoption and inventory events be handled across microservices?',
    options: [
      { id: 'kafka', label: 'Kafka Event Streaming (Recommended)', desc: 'Asynchronous topic ingestion for real-time pet adoption events & inventory sync.' },
      { id: 'rabbitmq', label: 'RabbitMQ AMQP Broker', desc: 'Message broker with exchanges for async worker queues.' },
      { id: 'rest', label: 'Synchronous REST / HTTP', desc: 'Direct synchronous HTTP calls between microservices without message broker.' }
    ],
    selected: 'kafka'
  },
  {
    id: 'security',
    step: 'Question 2 of 2: Health & Compliance Gateway',
    prompt: 'What verification mechanism is required for pet vaccination records?',
    options: [
      { id: 'vaccine-gateway', label: 'Dedicated Rabies Vaccine Verification Gateway', desc: 'Specialized validator microservice with veterinary records audit & certificate verification.' },
      { id: 'oauth2', label: 'Generic OAuth2 / JWT Authorization', desc: 'Standard role-based access control without dedicated health compliance service.' },
      { id: 'client-only', label: 'Client-Side Validation Only', desc: 'Form validation in React UI without backend gateway enforcement.' }
    ],
    selected: 'vaccine-gateway'
  }
];

let currentQuestionIndex = 0;
let userAnswers = {};

function startQuestionWizard() {
  currentQuestionIndex = 0;
  userAnswers = {
    messaging: 'kafka',
    security: 'vaccine-gateway'
  };
  const card = document.getElementById('ai-questions-card');
  if (card) card.style.display = 'flex';
  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  const q = ARCH_QUESTIONS[currentQuestionIndex];
  if (!q) return;

  const stepEl = document.getElementById('question-step-indicator');
  if (stepEl) stepEl.textContent = q.step;

  const promptEl = document.getElementById('question-prompt-text');
  if (promptEl) promptEl.textContent = q.prompt;

  const listEl = document.getElementById('question-options-list');
  if (listEl) {
    listEl.innerHTML = '';
    q.options.forEach(opt => {
      const isSelected = (userAnswers[q.id] || q.selected) === opt.id;
      const tile = document.createElement('label');
      tile.className = `option-tile ${isSelected ? 'selected' : ''}`;
      tile.innerHTML = `
        <input type="radio" name="question-${q.id}" value="${escHtml(opt.id)}" ${isSelected ? 'checked' : ''} />
        <div class="option-tile-content">
          <div class="option-tile-title">${escHtml(opt.label)}</div>
          <div class="option-tile-desc">${escHtml(opt.desc)}</div>
        </div>
      `;
      tile.addEventListener('click', () => {
        userAnswers[q.id] = opt.id;
        listEl.querySelectorAll('.option-tile').forEach(t => t.classList.remove('selected'));
        tile.classList.add('selected');
        tile.querySelector('input').checked = true;
      });
      listEl.appendChild(tile);
    });
  }

  const prevBtn = document.getElementById('btn-question-prev');
  const nextBtn = document.getElementById('btn-question-next');
  const submitBtn = document.getElementById('btn-question-submit');

  if (prevBtn) prevBtn.style.display = currentQuestionIndex > 0 ? 'inline-flex' : 'none';
  if (nextBtn) nextBtn.style.display = currentQuestionIndex < ARCH_QUESTIONS.length - 1 ? 'inline-flex' : 'none';
  if (submitBtn) submitBtn.style.display = currentQuestionIndex === ARCH_QUESTIONS.length - 1 ? 'inline-flex' : 'none';
}

function handleNextQuestion() {
  if (currentQuestionIndex < ARCH_QUESTIONS.length - 1) {
    currentQuestionIndex++;
    renderCurrentQuestion();
  }
}

function handlePrevQuestion() {
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    renderCurrentQuestion();
  }
}

// ── Generate ──────────────────────────────────────────────────────────────────
async function handleGenerate() {
  const prompt = getPromptValue();
  if (!prompt) { showGenerateStatus('Please enter a description.', true); return; }
  if (!serverInfo) { showGenerateStatus('No task server connected.', true); return; }

  showGenerateStatus('AI is analyzing requirements — please answer the architecture questions below.');
  startQuestionWizard();
}

async function handleSubmitAnswers() {
  const card = document.getElementById('ai-questions-card');
  if (card) card.style.display = 'none';

  setGenerating(true);
  showGenerateStatus('AI agent is synthesizing finalized task breakdown from prompt and architecture selections…');

  const prompt = getPromptValue() + '\n\nSelected Architecture Options: ' + JSON.stringify(userAnswers);
  const result = await window.robos.generateTasks({ prompt, serverInfo });
  setGenerating(false);

  if (!result.ok) {
    showGenerateStatus('Error: ' + result.error, true);
    return;
  }

  tasks = result.tasks.map(t => ({
    title:          t.title || '',
    body:           t.body || t.description || '',
    labels:         Array.isArray(t.labels) ? t.labels : [],
    isEpic:         !!t.isEpic,
    epicName:       t.epicName || '',
    parentEpicIdx:  typeof t.parentEpicIndex === 'number' ? t.parentEpicIndex : null,
    issueType:      t.issueType || '',
    epicKey:        t.epicKey || null,
    ticketKey:      null,
    ticketUrl:      null,
    ticketStatus:   null,
  }));

  if (projectFeatures.length === 0) {
    projectFeatures.push({
      id: 'feat-core',
      name: 'Feature 1: Platform Core & APIs',
      tasks: [...tasks]
    });
    activeFeatureId = 'feat-core';
    renderFeatureTabs();
  }
  const techStackInput = document.getElementById('project-tech-stack');
  if (techStackInput && !techStackInput.value) {
    techStackInput.value = 'Java 21 Spring Boot 3 + React 18 + TypeSpec + Kafka + PostgreSQL';
  }
  if (projectRepos.length === 0) {
    projectRepos = ['petstore-api (Java)', 'petstore-web (React)', 'petstore-common (TypeSpec)'];
    renderRepoTags();
  }

  renderTasks();
  updateCount();
  document.getElementById('preview-section').style.display = 'block';
  document.getElementById('results-section').style.display = 'none';
  showGenerateStatus(`Generated ${tasks.length} task${tasks.length !== 1 ? 's' : ''} from collaborative planning session.`);
}

function setGenerating(busy) {
  const btn = document.getElementById('btn-generate');
  document.getElementById('btn-generate-text').style.display = busy ? 'none' : 'inline';
  document.getElementById('btn-generate-spinner').style.display = busy ? 'inline-block' : 'none';
  btn.disabled = busy;
}

function showGenerateStatus(msg, isError = false) {
  const el = document.getElementById('generate-status');
  el.textContent = msg;
  el.className = 'status-text' + (isError ? ' error' : '');
}

// ── Render tasks ──────────────────────────────────────────────────────────────
function renderTasks() {
  const list = document.getElementById('task-list');
  list.innerHTML = '';

  if (!tasks.length) {
    list.innerHTML = `
      <div class="empty-plan-placeholder">
        <div style="font-weight:600; margin-bottom:4px; font-size:13px; color:var(--text);">No tasks in this plan yet</div>
        <div>Use the AI prompt above to generate a plan, or click <strong>⬡ + Add Epic</strong> / <strong>📄 + Add Task</strong> to construct manually.</div>
      </div>
    `;
    return;
  }

  const isJira = serverInfo && serverInfo.type === 'jira';

  if (isJira) {
    const epicIndices = tasks.map((t, i) => t.isEpic ? i : null).filter(i => i !== null);
    const rendered = new Set();
    const appendCard = (i, indent) => {
      if (rendered.has(i)) return;
      rendered.add(i);
      list.appendChild(buildCard(i, indent));
    };
    for (const epicIdx of epicIndices) {
      appendCard(epicIdx, 0);
      tasks.forEach((t, i) => { if (!t.isEpic && t.parentEpicIdx === epicIdx) appendCard(i, 1); });
    }
    tasks.forEach((t, i) => { if (!rendered.has(i)) appendCard(i, 0); });
  } else {
    tasks.forEach((_, i) => list.appendChild(buildCard(i, 0)));
  }
}

function buildCard(i, indent) {
  const task = tasks[i];
  const isJira = serverInfo && serverInfo.type === 'jira';

  const card = document.createElement('div');
  let cardClass = 'task-card' + (task.isEpic ? ' task-epic' : '') + (indent ? ' task-child' : '');
  if (task.ticketKey) cardClass += ' task-synced';
  card.className = cardClass;

  const epicTypeBadge = isJira
    ? `<span class="issue-type-badge ${task.isEpic ? 'badge-epic' : 'badge-story'}">${task.isEpic ? '⬡ Epic' : (task.issueType || 'Story')}</span>`
    : '';

  const epicNameRow = (isJira && task.isEpic)
    ? `<div class="epic-name-row">
        <label class="epic-name-label">Epic name:</label>
        <input class="epic-name-input" type="text" value="${escHtml(task.epicName)}" placeholder="Short epic label…" data-idx="${i}"/>
       </div>`
    : '';

  let syncHtml = '';
  if (serverInfo) {
    if (task.ticketKey) {
      syncHtml = `<span class="ticket-badge" title="${escHtml(task.ticketUrl || '')}">${escHtml(task.ticketKey)}</span>
                  <button class="sync-btn sync-update-btn" data-idx="${i}" title="Re-sync to server">↺</button>`;
    } else {
      syncHtml = `<button class="sync-btn sync-create-btn" data-idx="${i}" title="Create on server">🔗 Sync</button>`;
    }
  }

  card.innerHTML = `
    <div class="task-card-header">
      ${indent ? '<span class="tree-indent">└</span>' : ''}
      ${epicTypeBadge}
      <span class="task-num">#${i + 1}</span>
      <input class="task-title-input" type="text" value="${escHtml(task.title)}" placeholder="Task title…"/>
      <div class="task-actions-area">
        <div class="task-sync-area">${syncHtml}</div>
        <button class="task-remove-btn" title="Remove task">×</button>
      </div>
    </div>
    ${epicNameRow}
    <div class="task-body-preview md-body" title="Click to edit">${renderMd(task.body)}</div>
    <textarea class="task-body-input" rows="5" placeholder="Description…" style="display:none">${escHtml(task.body)}</textarea>
    <div class="task-labels">
      ${task.labels.map((lbl, li) => `<span class="label-chip" data-li="${li}" data-ti="${i}" title="Click to remove">${escHtml(lbl)} ×</span>`).join('')}
      <button class="add-label-btn" data-ti="${i}">+ label</button>
    </div>
    <div class="label-input-wrap" style="display:none">
      <input class="label-input" type="text" placeholder="Label name…" maxlength="40"/>
      <button class="label-input-ok">✓</button>
      <button class="label-input-cancel">✕</button>
    </div>
  `;

  card.querySelector('.task-title-input').addEventListener('input', e => { tasks[i].title = e.target.value; });

  const preview = card.querySelector('.task-body-preview');
  const textarea = card.querySelector('.task-body-input');
  preview.addEventListener('click', () => { preview.style.display = 'none'; textarea.style.display = ''; textarea.focus(); });
  textarea.addEventListener('input', e => { tasks[i].body = e.target.value; });
  textarea.addEventListener('blur', () => { preview.innerHTML = renderMd(tasks[i].body); textarea.style.display = 'none'; preview.style.display = ''; });

  if (task.isEpic) {
    const epicInput = card.querySelector('.epic-name-input');
    if (epicInput) epicInput.addEventListener('input', e => { tasks[i].epicName = e.target.value; });
  }

  card.querySelector('.task-remove-btn').addEventListener('click', () => {
    tasks.splice(i, 1);
    tasks.forEach(t => {
      if (t.parentEpicIdx !== null) {
        if (t.parentEpicIdx === i) t.parentEpicIdx = null;
        else if (t.parentEpicIdx > i) t.parentEpicIdx--;
      }
    });
    renderTasks();
    updateCount();
    if (!tasks.length) document.getElementById('preview-section').style.display = 'none';
  });

  card.querySelectorAll('.label-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      tasks[i].labels.splice(parseInt(chip.dataset.li), 1);
      renderTasks();
    });
  });

  // Label add — inline input instead of prompt()
  const labelWrap = card.querySelector('.label-input-wrap');
  const labelInput = card.querySelector('.label-input');
  card.querySelector('.add-label-btn').addEventListener('click', () => {
    labelWrap.style.display = 'flex';
    labelInput.value = '';
    labelInput.focus();
  });
  const addLabel = () => {
    const lbl = labelInput.value.trim();
    if (lbl) { tasks[i].labels.push(lbl); renderTasks(); }
    else labelWrap.style.display = 'none';
  };
  card.querySelector('.label-input-ok').addEventListener('click', addLabel);
  card.querySelector('.label-input-cancel').addEventListener('click', () => { labelWrap.style.display = 'none'; });
  labelInput.addEventListener('keydown', e => { if (e.key === 'Enter') addLabel(); if (e.key === 'Escape') labelWrap.style.display = 'none'; });

  const syncBtn = card.querySelector('.sync-create-btn, .sync-update-btn');
  if (syncBtn) syncBtn.addEventListener('click', () => handleSyncTask(i));

  return card;
}

function updateCount() {
  document.getElementById('task-count').textContent = tasks.length;
  const epicCount = tasks.filter(t => t.isEpic).length;
  const epicBadge = document.getElementById('epic-count');
  if (epicBadge) {
    epicBadge.textContent = epicCount ? `${epicCount} epic${epicCount !== 1 ? 's' : ''}` : '';
    epicBadge.style.display = epicCount ? 'inline-flex' : 'none';
  }
}

// ── Per-task sync ──────────────────────────────────────────────────────────────
async function handleSyncTask(idx) {
  const task = tasks[idx];
  if (!task || !task.title.trim()) { showCreateStatus('Task needs a title before syncing.', true); return; }
  if (!serverInfo) { showCreateStatus('No task server connected.', true); return; }

  const epicKeyByIndex = {};
  tasks.forEach((t, i) => { if (t.ticketKey) epicKeyByIndex[i] = t.ticketKey; });

  showCreateStatus(`Syncing task #${idx + 1}…`);
  const result = await window.robos.syncTask({ task, taskIndex: idx, serverInfo, parentEpicKey: parentEpicKey || null, epicKeyByIndex });

  if (!result.ok) { showCreateStatus('Sync failed: ' + (result.error || 'unknown'), true); return; }

  tasks[idx].ticketKey = result.key;
  tasks[idx].ticketUrl = result.url || null;
  tasks[idx].ticketStatus = 'open';
  showCreateStatus(`✓ Synced: ${result.key}`);
  renderTasks();

  if (currentProjectId) {
    await window.robos.saveProject({ id: currentProjectId, name: currentProjectName, prompt: document.getElementById('prompt-input').value || '', parentEpicKey: parentEpicKey || null, serverId: serverInfo ? serverInfo.id : null, tasks });
  }
}

// ── Sync All ──────────────────────────────────────────────────────────────────
async function handleSyncAll() {
  const toSync = tasks.filter(t => t.title.trim());
  if (!toSync.length) { showCreateStatus('No tasks with titles to sync.', true); return; }

  setCreating(true);
  showCreateStatus(`Syncing ${toSync.length} task${toSync.length !== 1 ? 's' : ''}…`);

  const epicKeyByIndex = {};
  let successCount = 0, failCount = 0;

  const orderedIndices = [];
  tasks.forEach((t, i) => { if (t.isEpic && t.title.trim()) orderedIndices.push(i); });
  tasks.forEach((t, i) => { if (!t.isEpic && t.title.trim()) orderedIndices.push(i); });

  for (const idx of orderedIndices) {
    tasks.forEach((t, i) => { if (t.ticketKey) epicKeyByIndex[i] = t.ticketKey; });
    const result = await window.robos.syncTask({ task: tasks[idx], taskIndex: idx, serverInfo, parentEpicKey: parentEpicKey || null, epicKeyByIndex });
    if (result.ok) {
      tasks[idx].ticketKey = result.key;
      tasks[idx].ticketUrl = result.url || null;
      tasks[idx].ticketStatus = 'open';
      epicKeyByIndex[idx] = result.key;
      successCount++;
      showCreateStatus(`Synced ${successCount}/${orderedIndices.length}…`);
      renderTasks();
    } else { failCount++; }
  }

  setCreating(false);
  const msg = `✓ Synced ${successCount} task${successCount !== 1 ? 's' : ''}` + (failCount ? `, ${failCount} failed` : '');
  showCreateStatus(msg, failCount > 0);

  if (currentProjectId) {
    await window.robos.saveProject({ id: currentProjectId, name: currentProjectName, prompt: getPromptValue(), parentEpicKey: parentEpicKey || null, serverId: serverInfo ? serverInfo.id : null, tasks });
  } else if (successCount > 0) {
    if (currentProjectName) {
      await saveToProject();
    }
  }
}

function setCreating(busy) {
  const btn = document.getElementById('btn-create-all');
  document.getElementById('btn-create-text').style.display = busy ? 'none' : 'inline';
  document.getElementById('btn-create-spinner').style.display = busy ? 'inline-block' : 'none';
  btn.disabled = busy;
}

function showCreateStatus(msg, isError = false) {
  const el = document.getElementById('create-status');
  el.textContent = msg;
  el.className = 'status-text' + (isError ? ' error' : '');
}

function renderResults(results) {
  const list = document.getElementById('results-list');
  list.innerHTML = results.map(r => `
    <div class="result-item ${r.ok ? 'success' : 'fail'}">
      <span class="result-icon">${r.ok ? '✓' : '✗'}</span>
      ${r.isEpic ? '<span class="result-epic-badge">Epic</span>' : ''}
      <span class="result-title">${escHtml(r.title || '(untitled)')}</span>
      ${r.ok && r.url ? `<a class="result-link" href="${escHtml(r.url)}" id="link-${encodeURIComponent(r.url)}">${escHtml(r.key || r.url)}</a>` : ''}
      ${!r.ok ? `<span class="result-error">${escHtml(r.error)}</span>` : ''}
    </div>
  `).join('');
  results.filter(r => r.ok && r.url).forEach(r => {
    const a = list.querySelector(`[id="link-${encodeURIComponent(r.url)}"]`);
    if (a) a.addEventListener('click', e => { e.preventDefault(); window.robos.openUrl(r.url); });
  });
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderMd(src) {
  if (!src) return '<span class="md-empty">No description. Click to add…</span>';
  try {
    if (typeof marked !== 'undefined' && marked && marked.parse) {
      return marked.parse(src, { breaks: true, gfm: true });
    }
  } catch (_) {}
  return escHtml(src || '').replace(/\n/g, '<br>');
}
