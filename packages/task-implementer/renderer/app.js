'use strict';

let serverInfo = null;
let allTasks = [];
let selectedTask = null;
let agentRunning = false;

// ── Agent Personas State ──────────────────────────────────────────────────────
let agentPersonas = [];
let selectedPersonaIdx = 0;
let currentTaskPersona = null;

function getDefaultPersonasFallback() {
  return [
    {
      id: 'urn:robos:agent:software-architect',
      slug: 'software-architect',
      role: 'Software Architect',
      icon: '🏛️',
      title: 'RobOS Lead Software Architect Agent',
      category: 'Architecture',
      systemPrompt: 'You are the Lead Software Architect in the RobOS ecosystem.',
      developmentGuidance: 'Enforce C4 boundaries, maintain ADRs, evaluate blast radius.',
      implementationPrompt: 'Design resilient system abstractions, define interfaces and contracts.',
    },
    {
      id: 'urn:robos:agent:frontend-web-dev',
      slug: 'frontend-web-dev',
      role: 'Frontend Web Developer',
      icon: '🎨',
      title: 'RobOS Frontend & Electron UI Specialist',
      category: 'Frontend & UI',
      systemPrompt: 'You are an expert Frontend Web & Desktop UI Developer in RobOS.',
      developmentGuidance: 'Use standard RobOS CSS dark tokens, contextBridge preload IPC, accessible semantic DOM.',
      implementationPrompt: 'Implement modern, accessible UI components with reactive state and clear styles.',
    },
    {
      id: 'urn:robos:agent:game-dev',
      slug: 'game-dev',
      role: 'Game Developer',
      icon: '⚔️',
      title: 'RobOS Isometric cRPG & Systems Developer',
      category: 'Game Systems',
      systemPrompt: 'You are a veteran Game Developer in RobOS specializing in Godot 4 and tactical cRPGs.',
      developmentGuidance: 'Follow Godot 4 LTS best practices, D&D 5e SRD rules, Flare RPG sprite integration.',
      implementationPrompt: 'Build game systems, characters, turn mechanics, and tactical combat loops.',
    },
    {
      id: 'urn:robos:agent:backend-dev',
      slug: 'backend-dev',
      role: 'Backend Systems Developer',
      icon: '⚙️',
      title: 'RobOS Backend & Distributed Systems Specialist',
      category: 'Backend & Services',
      systemPrompt: 'You are a Backend Systems Specialist in RobOS.',
      developmentGuidance: 'Java 21 Spring Boot 3 or Node.js/Fastify, OpenAPI 3.1 contracts, zero secrets in code.',
      implementationPrompt: 'Implement robust REST/gRPC endpoints, database transactions, and business logic.',
    },
    {
      id: 'urn:robos:agent:data-engineer-dev',
      slug: 'data-engineer-dev',
      role: 'Data & Storage Engineer',
      icon: '💾',
      title: 'RobOS Data & Storage Engineer Agent',
      category: 'Data & Storage',
      systemPrompt: 'You are a Data & Storage Engineer in RobOS.',
      developmentGuidance: 'PostgreSQL schemas with Flyway migrations, Kafka event streaming, ACID consistency.',
      implementationPrompt: 'Design normalized data schemas, write migration scripts, and configure event topics.',
    },
    {
      id: 'urn:robos:agent:devops-engineer',
      slug: 'devops-engineer',
      role: 'DevOps & Cloud Engineer',
      icon: '☁️',
      title: 'RobOS DevOps & Cloud Infrastructure Agent',
      category: 'DevOps & Cloud',
      systemPrompt: 'You are a DevOps & Cloud Engineer in RobOS.',
      developmentGuidance: 'Kubernetes, Helm, ArgoCD GitOps, CI/CD pipelines, Prometheus metrics.',
      implementationPrompt: 'Configure Kubernetes manifests, Helm charts, Dockerfiles, and deployment automation.',
    },
  ];
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadAgentPersonas();
  setupAgentPersonasModal();

  const result = await window.robos.getServerInfo();
  if (!result.ok) {
    document.getElementById('server-badge').textContent = 'No server';
    document.getElementById('no-server').style.display = 'flex';
    document.getElementById('main-layout').style.display = 'none';
    return;
  }
  serverInfo = result.server;
  const badge = document.getElementById('server-badge');
  badge.textContent = `${serverInfo.name} (${serverInfo.type})`;
  badge.classList.add('connected');
  document.getElementById('no-server').style.display = 'none';
  document.getElementById('main-layout').style.display = 'flex';

  setupAgentListeners();
  loadTasks();
}

async function loadAgentPersonas() {
  try {
    const res = await window.robos.listAgentPersonas();
    if (res && res.ok && Array.isArray(res.personas) && res.personas.length) {
      agentPersonas = res.personas;
    } else {
      agentPersonas = getDefaultPersonasFallback();
    }
  } catch (_) {
    agentPersonas = getDefaultPersonasFallback();
  }
  renderPersonaDropdown();
}

function renderPersonaDropdown() {
  const sel = document.getElementById('ws-agent-persona-select');
  if (!sel) return;
  sel.innerHTML = agentPersonas.map(p =>
    `<option value="${escHtml(p.id)}">${p.icon || '🤖'} ${escHtml(p.role)}</option>`
  ).join('');
}

function resolvePersonaForTask(task) {
  if (!agentPersonas || !agentPersonas.length) return null;

  // 1. Direct assignment
  if (task.agentPersonaId) {
    const found = agentPersonas.find(p => p.id === task.agentPersonaId);
    if (found) return found;
  }
  if (task.assignedRole) {
    const found = agentPersonas.find(p => p.role.toLowerCase() === task.assignedRole.toLowerCase());
    if (found) return found;
  }

  // 2. Label matching (e.g. role:frontend-web-dev or role:game-dev)
  if (Array.isArray(task.labels)) {
    for (const label of task.labels) {
      const lbl = typeof label === 'string' ? label : (label?.name || '');
      if (lbl.startsWith('role:')) {
        const slug = lbl.replace('role:', '').trim().toLowerCase();
        const found = agentPersonas.find(p => p.slug === slug || p.id.includes(slug));
        if (found) return found;
      }
    }
  }

  // 3. Keyword heuristic on title + body + labels
  const text = `${task.title || ''} ${task.body || ''} ${(task.labels || []).join(' ')}`.toLowerCase();
  if (/\b(godot|crpg|rpg|game|dnd|d&d|combat|dungeon|sprite|tilemap|isometric|gdscript)\b/.test(text)) {
    const found = agentPersonas.find(p => p.slug === 'game-dev');
    if (found) return found;
  }
  if (/\b(database|sql|postgres|postgresql|flyway|migration|kafka|schema|storage|table|query|nosql)\b/.test(text)) {
    const found = agentPersonas.find(p => p.slug === 'data-engineer-dev');
    if (found) return found;
  }
  if (/\b(frontend|react|web|ui|ux|component|electron|css|html|portal|dashboard|button|modal|view|styling|dom)\b/.test(text)) {
    const found = agentPersonas.find(p => p.slug === 'frontend-web-dev');
    if (found) return found;
  }
  if (/\b(kubernetes|k8s|helm|argocd|docker|dockerfile|ci\/cd|pipeline|ingress|cluster|deploy)\b/.test(text)) {
    const found = agentPersonas.find(p => p.slug === 'devops-engineer');
    if (found) return found;
  }
  if (/\b(architecture|architect|c4|adr|boundary|shacl|kgraph|ontology|spec|design)\b/.test(text)) {
    const found = agentPersonas.find(p => p.slug === 'software-architect');
    if (found) return found;
  }
  if (/\b(backend|api|rest|grpc|protobuf|service|controller|microservice|spring|spring-boot|fastify|express|endpoint|auth|jwt)\b/.test(text)) {
    const found = agentPersonas.find(p => p.slug === 'backend-dev');
    if (found) return found;
  }

  return agentPersonas.find(p => p.slug === 'backend-dev') || agentPersonas[0];
}

function updateDirectivesPanel(persona, task) {
  if (!persona) return;
  const badge = document.getElementById('directives-role-badge');
  const subtext = document.getElementById('directives-subtext');
  const preview = document.getElementById('persona-prompt-preview');
  if (badge) badge.textContent = `${persona.icon || '🤖'} ${persona.role}`;
  if (subtext) subtext.textContent = persona.description || 'Specialized role guidance for this task';

  let directivesText = '';
  if (task && task.body && task.body.includes('### 🤖 Implementation Directives:')) {
    const parts = task.body.split('### 🤖 Implementation Directives:');
    if (parts[1]) directivesText = parts[1].trim();
  } else if (task && task.implementationGuidance) {
    directivesText = task.implementationGuidance.trim();
  }

  if (!directivesText) {
    directivesText = `${persona.implementationPrompt || ''}\n\n${persona.developmentGuidance || ''}`.trim();
  }

  if (preview) preview.value = directivesText;
}

document.addEventListener('DOMContentLoaded', () => {
  init();

  document.getElementById('btn-open-task-servers').addEventListener('click', () => window.robos.openTaskServers());
  document.getElementById('btn-refresh').addEventListener('click', loadTasks);
  document.getElementById('filter-state').addEventListener('change', loadTasks);
  document.getElementById('filter-search').addEventListener('input', renderTaskList);
  document.getElementById('btn-start-agent').addEventListener('click', handleStartAgent);
  document.getElementById('btn-stop-agent').addEventListener('click', handleStopAgent);
  document.getElementById('btn-clear-output').addEventListener('click', () => {
    document.getElementById('agent-output').innerHTML = '';
  });
  document.getElementById('desc-toggle').addEventListener('click', () => {
    const desc = document.getElementById('task-description');
    const toggle = document.getElementById('desc-toggle');
    const visible = desc.style.display !== 'none';
    desc.style.display = visible ? 'none' : 'block';
    toggle.textContent = (visible ? '▸' : '▾') + ' Task Description';
  });

  const toggleDirectivesBtn = document.getElementById('btn-toggle-directives');
  if (toggleDirectivesBtn) {
    toggleDirectivesBtn.addEventListener('click', () => {
      const box = document.getElementById('persona-directives-box');
      if (!box) return;
      const visible = box.style.display !== 'none';
      box.style.display = visible ? 'none' : 'flex';
      toggleDirectivesBtn.classList.toggle('active', !visible);
    });
  }

  const personaSelect = document.getElementById('ws-agent-persona-select');
  if (personaSelect) {
    personaSelect.addEventListener('change', () => {
      const selId = personaSelect.value;
      const found = agentPersonas.find(p => p.id === selId);
      if (found) {
        currentTaskPersona = found;
        updateDirectivesPanel(found, selectedTask);
      }
    });
  }

  const resetDirectivesBtn = document.getElementById('btn-reset-directives');
  if (resetDirectivesBtn) {
    resetDirectivesBtn.addEventListener('click', () => {
      if (currentTaskPersona) {
        const preview = document.getElementById('persona-prompt-preview');
        if (preview) {
          preview.value = `${currentTaskPersona.implementationPrompt || ''}\n\n${currentTaskPersona.developmentGuidance || ''}`.trim();
        }
      }
    });
  }

  // Wire @-mention file typeahead for robos-ai-textarea
  if (typeof customElements !== 'undefined') {
    customElements.whenDefined('robos-ai-textarea').then(() => {
      const ctxEl = document.getElementById('extra-context');
      if (ctxEl && ctxEl.addEventListener) {
        ctxEl.addEventListener('robos-path-query', async (e) => {
          try {
            const r = await window.robos.searchIndex(e.detail.query);
            if (r && r.ok && ctxEl._showMentions) ctxEl._showMentions(r.items);
          } catch (_) {}
        });
      }
    }).catch(() => {});
  }
});

// ── Load tasks ────────────────────────────────────────────────────────────────
async function loadTasks() {
  const state = document.getElementById('filter-state').value;
  document.getElementById('task-list').innerHTML = '<div class="loading-row">Loading…</div>';
  const result = await window.robos.listTasks({ filter: { state } });
  if (!result.ok) {
    document.getElementById('task-list').innerHTML = `<div class="loading-row" style="color:#ef4444">Error: ${escHtml(result.error)}</div>`;
    return;
  }
  allTasks = result.tasks;
  renderTaskList();
}

function renderTaskList() {
  const search = document.getElementById('filter-search').value.toLowerCase();
  const filtered = search
    ? allTasks.filter(t => t.title.toLowerCase().includes(search) || t.key.toLowerCase().includes(search))
    : allTasks;

  const list = document.getElementById('task-list');
  if (!filtered.length) {
    list.innerHTML = '<div class="loading-row">No tasks found.</div>';
    return;
  }

  list.innerHTML = filtered.map(t => {
    const taskPersona = resolvePersonaForTask(t);
    return `
    <div class="task-item ${selectedTask && selectedTask.key === t.key ? 'active' : ''}" data-key="${escHtml(t.key)}">
      <div class="task-item-key">${escHtml(t.key)}</div>
      <div class="task-item-title">${escHtml(t.title)}</div>
      <div class="task-item-meta">
        ${taskPersona ? `<span class="task-label" style="background:rgba(59,130,246,0.15);color:var(--accent);">${taskPersona.icon || '🤖'} ${escHtml(taskPersona.role)}</span>` : ''}
        ${t.labels.slice(0, 3).map(l => `<span class="task-label">${escHtml(l)}</span>`).join('')}
        ${t.assignee ? `<span style="color:var(--text-muted)">@${escHtml(t.assignee)}</span>` : ''}
      </div>
    </div>
  `;
  }).join('');

  list.querySelectorAll('.task-item').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.key;
      const task = allTasks.find(t => t.key === key);
      if (task) selectTask(task);
    });
  });
}

// ── Select task ───────────────────────────────────────────────────────────────
function selectTask(task) {
  selectedTask = task;
  renderTaskList();

  document.getElementById('workspace-empty').style.display = 'none';
  const wa = document.getElementById('workspace-active');
  wa.style.display = 'flex';
  wa.style.flex = '1';
  wa.style.minHeight = '0';
  wa.style.flexDirection = 'column';
  wa.style.overflow = 'hidden';

  document.getElementById('ws-task-key').textContent = task.key;
  document.getElementById('ws-task-title').textContent = task.title;

  // Resolve assigned or detected persona
  currentTaskPersona = resolvePersonaForTask(task);
  const personaSel = document.getElementById('ws-agent-persona-select');
  if (personaSel && currentTaskPersona) {
    personaSel.value = currentTaskPersona.id;
  }
  updateDirectivesPanel(currentTaskPersona, task);

  const openLink = document.getElementById('ws-open-url');
  if (task.url) {
    openLink.style.display = 'inline-flex';
    openLink.onclick = (e) => { e.preventDefault(); window.robos.openUrl(task.url); };
  } else {
    openLink.style.display = 'none';
  }

  const descBox = document.getElementById('task-description-box');
  if (task.body && task.body.trim()) {
    descBox.style.display = 'block';
    document.getElementById('task-description').textContent = task.body.trim();
  } else {
    descBox.style.display = 'none';
  }

  document.getElementById('agent-output').innerHTML = '';
  setAgentStatus('', '');
}

// ── Agent ─────────────────────────────────────────────────────────────────────
function setupAgentListeners() {
  window.robos.onAgentStream(({ taskKey, text, stream }) => {
    if (selectedTask && selectedTask.key === taskKey) {
      appendOutput(text, stream);
    }
  });
  window.robos.onAgentDone(({ taskKey, code }) => {
    agentRunning = false;
    setAgentBusy(false);
    if (code === 0) {
      setAgentStatus('Agent finished successfully.', 'done-ok');
    } else {
      setAgentStatus(`Agent exited with code ${code}.`, 'done-err');
    }
  });
}

async function handleStartAgent() {
  if (!selectedTask) return;
  if (agentRunning) return;

  const ctxEl = document.getElementById('extra-context');
  const extraContext = (ctxEl && typeof ctxEl.value === 'string') ? ctxEl.value.trim() : '';
  const customDirectives = document.getElementById('persona-prompt-preview')
    ? document.getElementById('persona-prompt-preview').value.trim()
    : '';

  document.getElementById('agent-output').innerHTML = '';
  setAgentStatus(`Starting AI agent as ${currentTaskPersona ? currentTaskPersona.role : 'Specialist'}…`, 'running');
  setAgentBusy(true);
  agentRunning = true;

  const result = await window.robos.startAgent({
    taskKey: selectedTask.key,
    task: selectedTask,
    extraContext,
    persona: currentTaskPersona,
    customDirectives,
  });

  if (!result.ok) {
    agentRunning = false;
    setAgentBusy(false);
    setAgentStatus('Error: ' + result.error, 'done-err');
  }
}

async function handleStopAgent() {
  if (!selectedTask) return;
  await window.robos.stopAgent({ taskKey: selectedTask.key });
  agentRunning = false;
  setAgentBusy(false);
  setAgentStatus('Agent stopped.', 'done-err');
}

function setAgentBusy(busy) {
  document.getElementById('btn-start-text').style.display = busy ? 'none' : 'inline';
  document.getElementById('btn-start-spinner').style.display = busy ? 'inline-block' : 'none';
  document.getElementById('btn-start-agent').disabled = busy;
  document.getElementById('btn-stop-agent').style.display = busy ? 'inline-flex' : 'none';
}

function setAgentStatus(msg, cls) {
  const el = document.getElementById('agent-status');
  el.textContent = msg;
  el.className = 'agent-status' + (cls ? ' ' + cls : '');
}

function appendOutput(text, stream) {
  const out = document.getElementById('agent-output');
  const span = document.createElement('span');
  span.className = stream === 'stderr' ? 'line-stderr' : 'line-stdout';
  span.textContent = text;
  out.appendChild(span);
  out.scrollTop = out.scrollHeight;
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Agent Personas Modal Wiring ───────────────────────────────────────────────
function setupAgentPersonasModal() {
  const btnOpen = document.getElementById('btn-agent-personas');
  const btnClose = document.getElementById('btn-close-personas');
  const overlay = document.getElementById('agent-personas-overlay');
  const btnSave = document.getElementById('btn-save-persona');
  const btnReset = document.getElementById('btn-reset-personas');
  const btnNew = document.getElementById('btn-new-custom-persona');

  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      overlay.style.display = 'flex';
      renderPersonasModal();
    });
  }
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      overlay.style.display = 'none';
    });
  }

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const current = agentPersonas[selectedPersonaIdx];
      if (!current) return;
      const updated = {
        ...current,
        role: document.getElementById('persona-edit-role').value.trim() || current.role,
        title: document.getElementById('persona-edit-title').value.trim() || current.title,
        description: document.getElementById('persona-edit-desc').value.trim(),
        systemPrompt: document.getElementById('persona-edit-sysprompt').value.trim(),
        developmentGuidance: document.getElementById('persona-edit-guidance').value.trim(),
        planningPrompt: document.getElementById('persona-edit-planning').value.trim(),
        implementationPrompt: document.getElementById('persona-edit-implementation').value.trim(),
      };
      try {
        const res = await window.robos.saveAgentPersona(updated);
        if (res && res.ok && res.persona) {
          agentPersonas[selectedPersonaIdx] = res.persona;
        } else {
          agentPersonas[selectedPersonaIdx] = updated;
        }
      } catch (_) {
        agentPersonas[selectedPersonaIdx] = updated;
      }
      renderPersonaDropdown();
      if (currentTaskPersona && currentTaskPersona.id === updated.id) {
        currentTaskPersona = agentPersonas[selectedPersonaIdx];
        updateDirectivesPanel(currentTaskPersona, selectedTask);
      }
      renderPersonasModal();
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      try {
        const res = await window.robos.resetAgentPersonas();
        if (res && res.ok && Array.isArray(res.personas)) {
          agentPersonas = res.personas;
        }
      } catch (_) {}
      selectedPersonaIdx = 0;
      renderPersonaDropdown();
      if (selectedTask) {
        currentTaskPersona = resolvePersonaForTask(selectedTask);
        if (currentTaskPersona) {
          const sel = document.getElementById('ws-agent-persona-select');
          if (sel) sel.value = currentTaskPersona.id;
          updateDirectivesPanel(currentTaskPersona, selectedTask);
        }
      }
      renderPersonasModal();
    });
  }

  if (btnNew) {
    btnNew.addEventListener('click', () => {
      const newSlug = `custom-dev-${Date.now().toString().slice(-4)}`;
      const newPersona = {
        id: `urn:robos:agent:${newSlug}`,
        slug: newSlug,
        role: 'Specialized Engineer',
        title: 'Custom Specialized Engineer Agent',
        description: 'Custom autonomous agent persona tailored for specialized development.',
        icon: '⭐',
        category: 'Custom',
        systemPrompt: 'You are an autonomous specialized software engineer in RobOS.',
        developmentGuidance: 'Follow standard RobOS SDLC guidelines.',
        planningPrompt: 'Break down tasks according to specialized domain requirements.',
        implementationPrompt: 'Implement specialized components and unit tests.',
        isDefault: false,
      };
      agentPersonas.push(newPersona);
      selectedPersonaIdx = agentPersonas.length - 1;
      renderPersonasModal();
    });
  }
}

function renderPersonasModal() {
  const tabsList = document.getElementById('personas-tabs-list');
  if (!tabsList) return;

  const badge = document.getElementById('personas-count-badge');
  if (badge) badge.textContent = `${agentPersonas.length} Roles`;

  tabsList.innerHTML = agentPersonas.map((p, idx) => `
    <button class="persona-tab-item ${idx === selectedPersonaIdx ? 'active' : ''}" data-idx="${idx}">
      <span class="persona-tab-icon">${p.icon || '🤖'}</span>
      <div class="persona-tab-info">
        <span class="persona-tab-name">${escHtml(p.role || p.title)}</span>
        <span class="persona-tab-category">${escHtml(p.category || 'Specialist')}</span>
      </div>
    </button>
  `).join('');

  tabsList.querySelectorAll('.persona-tab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedPersonaIdx = parseInt(btn.dataset.idx, 10);
      renderPersonasModal();
    });
  });

  const active = agentPersonas[selectedPersonaIdx] || agentPersonas[0];
  if (active) {
    document.getElementById('persona-edit-role').value = active.role || '';
    document.getElementById('persona-edit-title').value = active.title || '';
    document.getElementById('persona-edit-desc').value = active.description || '';
    document.getElementById('persona-edit-sysprompt').value = active.systemPrompt || '';
    document.getElementById('persona-edit-guidance').value = active.developmentGuidance || '';
    document.getElementById('persona-edit-planning').value = active.planningPrompt || '';
    document.getElementById('persona-edit-implementation').value = active.implementationPrompt || '';
  }
}

// ── Demo & Test helpers — called via evalJS from the test/demo runner ─────────
window._demoSetServer = function(name, type) {
  const badge = document.getElementById('server-badge');
  badge.textContent = `${name} (${type})`;
  badge.classList.add('connected');
  document.getElementById('no-server').style.display = 'none';
  document.getElementById('main-layout').style.display = 'flex';
};

window._demoInjectTasks = function(tasks) {
  allTasks = tasks;
  renderTaskList();
};

window._demoSelectTask = function(key) {
  const task = allTasks.find(t => t.key === key);
  if (task) selectTask(task);
};

window._demoAppendOutput = function(text, isStderr) {
  appendOutput(text, isStderr ? 'stderr' : 'stdout');
};

window._demoSetAgentBusy = function(busy) {
  agentRunning = busy;
  setAgentBusy(busy);
};

window._demoSetAgentStatus = function(msg, cls) {
  setAgentStatus(msg, cls);
};

window._demoSelectPersona = function(id) {
  const p = agentPersonas.find(x => x.id === id || x.slug === id);
  if (p) {
    currentTaskPersona = p;
    const sel = document.getElementById('ws-agent-persona-select');
    if (sel) sel.value = p.id;
    updateDirectivesPanel(p, selectedTask);
  }
};

window._demoGetSelectedPersona = function() {
  return currentTaskPersona;
};

window._demoSetDirectives = function(text) {
  const el = document.getElementById('persona-prompt-preview');
  if (el) el.value = text;
};

window._demoGetDirectives = function() {
  const el = document.getElementById('persona-prompt-preview');
  return el ? el.value : '';
};
