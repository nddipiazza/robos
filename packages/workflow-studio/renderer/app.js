/* global robos */
'use strict';

// ── Routing ───────────────────────────────────────────────────────────────────
const params    = new URLSearchParams(window.location.search);
const VIEW      = params.get('view') || 'issue';
const ISSUE_NUM = params.get('issue') || '';

const viewIssue  = document.getElementById('view-issue');
const viewConfig = document.getElementById('view-config');

// Module-level dirty callback — set by initConfig so renderConfigTypes can trigger it
let _notifyDirty = null;

if (VIEW === 'config') {
  viewConfig.classList.remove('hidden');
  initConfig();
} else {
  viewIssue.classList.remove('hidden');
  initIssue();
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Very small markdown renderer (no external deps)
function renderMd(md) {
  if (!md || !md.trim()) return '<em class="no-desc">No description provided.</em>';
  let html = escHtml(md);
  // code blocks (```)
  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) =>
    `<pre><code>${c}</code></pre>`);
  // inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm,   '<h1>$1</h1>');
  // bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // hr
  html = html.replace(/^---+$/gm, '<hr/>');
  // blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  // unordered list
  html = html.replace(/((?:^[-*] .+\n?)+)/gm, m => {
    const items = m.trim().split('\n').map(l => `<li>${l.replace(/^[-*] /, '')}</li>`);
    return `<ul>${items.join('')}</ul>`;
  });
  // ordered list
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, m => {
    const items = m.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`);
    return `<ol>${items.join('')}</ol>`;
  });
  // paragraphs (double newline)
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  // clean up empty paras around block elements
  html = html.replace(/<p>(<(?:h[1-6]|ul|ol|pre|hr|blockquote)[^>]*>)/g, '$1');
  html = html.replace(/(<\/(?:h[1-6]|ul|ol|pre|hr|blockquote)>)<\/p>/g, '$1');
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/\n/g, '<br/>');
  return html;
}

function getLabels(labels) {
  return (labels || []).map(l => (typeof l === 'string' ? l : l.name));
}

// ── Stream overlay ────────────────────────────────────────────────────────────

const streamOverlay = document.getElementById('stream-overlay');
const streamOutput  = document.getElementById('stream-output');
const streamTitle   = document.getElementById('stream-title');
let   streamUnsub   = null;

document.getElementById('btn-close-stream').onclick = () => closeStream();

function openStream(title) {
  streamTitle.textContent  = title;
  streamOutput.textContent = '';
  streamOverlay.classList.remove('hidden');
  if (streamUnsub) streamUnsub();
  streamUnsub = robos.onStream(data => {
    streamOutput.textContent += data;
    streamOutput.scrollTop = streamOutput.scrollHeight;
  });
}
function closeStream() {
  if (streamUnsub) { streamUnsub(); streamUnsub = null; }
  streamOverlay.classList.add('hidden');
}

// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS / CONFIG HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function getTS(settings) {
  const id = settings.active_task_server;
  return (settings.task_servers || []).find(ts => ts.id === id)
      || (settings.task_servers || [])[0]
      || { id: 'default', name: 'Default', issue_types: [], workflows: [] };
}

function getWorkflow(settings, typeId) {
  const ts = getTS(settings);
  return (ts.workflows || []).find(w => w.type_id === typeId) || null;
}

function getIssueType(labels) {
  const names = new Set(getLabels(labels));
  const ts_types = ['bug','feature-request','feature','task','chore','security','performance','question'];
  for (const t of ts_types) {
    if (names.has(t) || names.has(`type:${t}`)) return t === 'feature' ? 'feature-request' : t;
  }
  return null;
}

function getCurrentStateId(labels, states) {
  const names = new Set(getLabels(labels));
  for (const s of states) {
    if (names.has(s.id) || names.has(`state:${s.id}`)) return s.id;
  }
  const initial = states.find(s => s.is_initial);
  return initial ? initial.id : (states[0] ? states[0].id : null);
}

function buildTransitionMap(transitions) {
  const map = {};
  (transitions || []).forEach(t => {
    if (!map[t.from]) map[t.from] = [];
    if (!map[t.from].includes(t.to)) map[t.from].push(t.to);
  });
  return map;
}

// ══════════════════════════════════════════════════════════════════════════════
// ISSUE VIEW
// ══════════════════════════════════════════════════════════════════════════════

async function initIssue() {
  const settings = await robos.readSettings();
  const ts       = getTS(settings);
  const org      = ts.gh_org  || '';
  const repoName = ts.gh_repo || '';
  const repo     = org && repoName ? `${org}/${repoName}` : '';

  document.getElementById('btn-to-config').onclick = () => switchToConfig();

  if (!repo || !ISSUE_NUM) {
    setIssueError(repo ? 'No issue number specified.' : 'No repository configured — click ⚙ Config.');
    return;
  }

  document.getElementById('issue-repo-label').textContent = repo;

  const result = await robos.fetchIssue({ repo, num: ISSUE_NUM });
  if (!result.ok) { setIssueError(result.error || 'Failed to fetch issue'); return; }

  const issue  = result.data;
  const labels = getLabels(issue.labels);
  const typeId = getIssueType(issue.labels);
  const wf     = getWorkflow(settings, typeId);

  // Header
  document.getElementById('issue-num').textContent   = `#${issue.number}`;
  document.getElementById('issue-title').textContent = issue.title;
  if (issue.assignees && issue.assignees.length) {
    document.getElementById('issue-assignees').textContent =
      'Assigned to: ' + issue.assignees.map(a => a.login || a).join(', ');
  }

  // Type badge
  if (typeId) {
    const it = (getTS(settings).issue_types || []).find(t => t.id === typeId);
    const badge = document.getElementById('issue-type-badge');
    badge.textContent = it ? it.label : typeId;
    badge.style.color = it ? it.color : '#8b949e';
    badge.classList.remove('hidden');
  }

  // GitHub button
  document.getElementById('btn-open-github').onclick = () => robos.openUrl(issue.url);

  // VS Code button
  document.getElementById('btn-open-vscode').onclick = () =>
    robos.openVscode({ repo, org });

  // Issue body (markdown)
  document.getElementById('issue-body').innerHTML = renderMd(issue.body || '');

  // Steps to Reproduce
  const steps = extractSteps(issue.body || '');
  if (steps.length) {
    const strPanel = document.getElementById('panel-str');
    const strList  = document.getElementById('issue-str');
    strPanel.classList.remove('hidden');
    strList.innerHTML = steps.map(s => `<li>${escHtml(s)}</li>`).join('');
  }

  // Workflow
  if (wf && wf.states && wf.states.length) {
    const transMap  = buildTransitionMap(wf.transitions);
    const currentId = getCurrentStateId(labels, wf.states);
    renderStatePipeline(wf.states, currentId);
    renderTransitions(wf.states, transMap, currentId, async (targetState) => {
      await doTransition(issue, repo, settings, currentId, targetState, wf);
    });
    document.getElementById('issue-state-chip').textContent =
      (wf.states.find(s => s.id === currentId) || {}).label || currentId || '—';
  } else {
    document.getElementById('state-pipeline').innerHTML =
      '<p style="color:var(--text-1);font-size:12px">No workflow configured. <a href="#" id="lnk-config">Configure now →</a></p>';
    document.getElementById('lnk-config') &&
      (document.getElementById('lnk-config').onclick = e => { e.preventDefault(); switchToConfig(); });
  }

  // Workspace
  document.getElementById('btn-setup').onclick = async () => {
    openStream('🚀 Setting up workspace…');
    await robos.setupWorkspace({
      repo, num: ISSUE_NUM, org,
      workspace_setup_script: ts.workspace_setup_script || '',
    });
  };
  document.getElementById('btn-vscode').onclick = () => robos.openVscode({ repo, org });

  // AI ask
  const aiInput  = document.getElementById('ai-prompt-input');
  const aiOutput = document.getElementById('ai-output');
  wirePathQuery(aiInput);
  document.getElementById('btn-ai-ask').onclick = async () => {
    const p = (aiInput.value || '').trim();
    if (!p) return;
    aiOutput.innerHTML = '<span class="robos-spinner"></span>Thinking…';
    aiOutput.classList.remove('hidden');
    const unsub = robos.onStream(data => {
      if (aiOutput.querySelector('.robos-spinner')) aiOutput.innerHTML = '';
      aiOutput.textContent += data;
      aiOutput.scrollTop = aiOutput.scrollHeight;
    });
    await robos.runAiPrompt({
      prompt: `Issue #${ISSUE_NUM} in ${repo}: "${issue.title}"\n\nContext: ${(issue.body || '').slice(0, 800)}\n\n${p}`,
    });
    unsub();
  };
  // Cmd/Ctrl+Enter submits; plain Enter inserts a newline (multi-line textarea)
  aiInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      document.getElementById('btn-ai-ask').click();
    }
  });
}

// ── @-mention file typeahead — wires a robos-ai-textarea to listPath IPC ─────
function wirePathQuery(textarea) {
  if (!textarea || typeof customElements === 'undefined' || !textarea.addEventListener) return;
  customElements.whenDefined('robos-ai-textarea').then(() => {
    textarea.addEventListener('robos-path-query', async (e) => {
      try {
        const r = await robos.listPath(e.detail.query);
        if (r && r.ok && textarea._showMentions) textarea._showMentions(r.items);
      } catch (_) {}
    });
  }).catch(() => {});
}

function setIssueError(msg) {
  document.getElementById('issue-title').textContent = '⚠ ' + msg;
  document.getElementById('issue-title').style.color = 'var(--red)';
}

function switchToConfig() {
  viewIssue.classList.add('hidden');
  viewConfig.classList.remove('hidden');
  initConfig();
}

function extractSteps(body) {
  const STR = /^##+ +steps? +to +repro(duce)?/im;
  const lines = body.split('\n');
  let inStr = false; const steps = [];
  for (const line of lines) {
    if (STR.test(line)) { inStr = true; continue; }
    if (inStr) {
      if (/^##/.test(line)) break;
      const s = line.replace(/^[\d]+\.\s*/, '').replace(/^[-*]\s*/, '').trim();
      if (s) steps.push(s);
    }
  }
  return steps;
}

function renderStatePipeline(states, currentId) {
  const el = document.getElementById('state-pipeline');
  const currentIdx = states.findIndex(s => s.id === currentId);
  el.innerHTML = states.map((s, i) => {
    const cls = s.id === currentId ? 'active' : (i < currentIdx ? 'completed' : '');
    return `<div class="state-step ${cls}" style="color:${s.color || '#8b949e'}">
      <div class="state-dot"></div>
      <span>${escHtml(s.label)}</span>
    </div>`;
  }).join('');
}

function renderTransitions(states, transMap, currentId, onTransition) {
  const el = document.getElementById('transition-buttons');
  const targets = transMap[currentId] || [];
  if (!targets.length) {
    el.innerHTML = '<p style="color:var(--text-2);font-size:12px">No transitions available.</p>';
    return;
  }
  el.innerHTML = targets.map(tid => {
    const s = states.find(x => x.id === tid);
    if (!s) return '';
    return `<button class="btn btn-transition" data-tid="${escHtml(tid)}"
      style="border-left-color:${s.color || '#8b949e'}">
      → ${escHtml(s.label)}
    </button>`;
  }).join('');
  el.querySelectorAll('.btn-transition').forEach(btn => {
    btn.onclick = () => onTransition(btn.dataset.tid);
  });
}

async function doTransition(issue, repo, settings, fromId, toId, wf) {
  const toState = wf.states.find(s => s.id === toId);
  if (!toState) return;
  const ts = getTS(settings);

  // label transition
  await robos.transitionIssue({
    repo, num: issue.number,
    removeLabel: fromId ? `state:${fromId}` : null,
    addLabel: `state:${toId}`,
  });

  // run on_enter_script
  if (toState.on_enter_script && toState.on_enter_script.trim()) {
    openStream(`⚙ Running script for "${toState.label}"…`);
    await robos.runScript({
      script: toState.on_enter_script,
      env: {
        ISSUE_NUM: String(issue.number), ISSUE_TITLE: issue.title,
        ORG: ts.gh_org || '', REPO: ts.gh_repo || '',
        STATE_ID: toId, STATE_LABEL: toState.label,
      },
    });
  }

  // run on_enter_prompt (AI agent)
  if (toState.on_enter_prompt && toState.on_enter_prompt.trim()) {
    openStream(`🤖 AI agent: "${toState.label}"…`);
    await robos.runAiPrompt({
      prompt: toState.on_enter_prompt,
      env: {
        NUMBER: String(issue.number), ISSUE_TITLE: issue.title,
        ORG: ts.gh_org || '', REPO: ts.gh_repo || '',
        STATE: toId,
      },
    });
  }

  // reload
  location.reload();
}

// ══════════════════════════════════════════════════════════════════════════════
// CONFIG VIEW
// ══════════════════════════════════════════════════════════════════════════════

const AI_GENERATE_PROMPT = `You are setting up an AI-powered software development lifecycle system called RobOS.

Generate a JSON array of issue type configurations for an AI-first engineering team. Return ONLY valid JSON — no explanation, no markdown, no code fences.

CRITICAL JSON RULES — you MUST follow these exactly:
- All string values must be on a single line. Do NOT include literal newlines, tabs, or other control characters inside string values.
- Use \\n (escaped backslash-n) if you need a newline within a string, never a real newline character.
- Do not use smart quotes (\u201c\u201d\u2018\u2019) — use only straight ASCII double quotes.
- The entire response must be parseable by JSON.parse() with no modification.

Each item in the array should be an object with:
- "id": string (kebab-case, e.g. "bug", "feature-request")
- "label": string (display name)
- "color": string (hex color)
- "workflow": object with:
  - "states": array of state objects, each with:
    - "id": string (kebab-case)
    - "label": string
    - "color": string (hex)
    - "is_initial": boolean (true for the first state only)
    - "on_enter_prompt": string (what the AI agent should do when entering this state — be specific and actionable, mentioning GitHub, VS Code, etc.; use {number}, {org}, {repo} as placeholders; keep it on ONE line)
    - "on_enter_script": string (bash commands if any, otherwise "")
  - "transitions": array of {"from": "state-id", "to": "state-id"} objects

Include these issue types: Bug, Feature Request, Chore, Security Issue, Performance Issue, Question.

Make the workflow states reflect an AI-assisted SDLC where the AI agent actively:
1. Triages and investigates issues by reading code and GitHub context
2. Sets up the developer workspace (clone/checkout branch)
3. Drafts a fix or implementation
4. Writes automated tests
5. Creates a pull request
6. Handles code review feedback

Use descriptive state labels like "AI Triage", "AI Investigation", "AI Draft", "Human Review", "AI Testing", "AI PR Creation", "Code Review", "Done". Not every type needs all states — keep them lean and relevant.`;

async function initConfig() {
  const settings = await robos.readSettings();
  const ts       = getTS(settings);
  let dirty = false;

  function markDirty() {
    if (!dirty) { dirty = true; robos.setDirty(true); }
  }
  function markClean() {
    dirty = false; robos.setDirty(false);
  }
  _notifyDirty = markDirty;

  // Handle save-then-close triggered by main process close dialog
  robos.onCloseResponse(async (action) => {
    if (action === 'save') {
      const data = collectConfig(ts, settings);
      await robos.writeSettings(data);
      markClean();
      window.close();
    }
  });

  // back to issue
  const btnToIssue = document.getElementById('btn-to-issue');
  if (ISSUE_NUM) {
    btnToIssue.classList.remove('hidden');
    btnToIssue.onclick = () => {
      viewConfig.classList.add('hidden');
      viewIssue.classList.remove('hidden');
    };
  } else {
    btnToIssue.classList.add('hidden');
  }

  renderConfigTypes(ts);

  // Save
  document.getElementById('btn-save').onclick = async () => {
    const data = collectConfig(ts, settings);
    await robos.writeSettings(data);
    markClean();
    const st = document.getElementById('save-status');
    st.textContent = '✓ Saved';
    setTimeout(() => (st.textContent = ''), 2000);
  };

  document.getElementById('btn-clear-all').onclick = async () => {
    if (!confirm('Clear all issue types and workflows? This cannot be undone.')) return;
    ts.issue_types = [];
    ts.workflows   = [];
    renderConfigTypes(ts);
    const data = collectConfig(ts, settings);
    await robos.writeSettings(data);
    markClean();
    const st = document.getElementById('save-status');
    st.textContent = '✓ Cleared';
    setTimeout(() => (st.textContent = ''), 2000);
  };

  // Add type
  document.getElementById('btn-add-type').onclick = () => {
    if (!ts.issue_types) ts.issue_types = [];
    if (!ts.workflows)   ts.workflows   = [];
    const id = 'custom-' + Date.now();
    ts.issue_types.push({ id, label: 'New Type', color: '#8b949e' });
    ts.workflows.push({
      id: id + '-workflow', name: 'New Type Workflow', type_id: id,
      states: [
        { id: 'open',  label: 'Open',  color: '#8b949e', is_initial: true, on_enter_script: '', on_enter_prompt: '' },
        { id: 'done',  label: 'Done',  color: '#3fb950', on_enter_script: '', on_enter_prompt: '' },
      ],
      transitions: [{ from: 'open', to: 'done' }],
    });
    renderConfigTypes(ts);
    markDirty();
  };

  // AI generate
  const genPromptEl = document.getElementById('generate-prompt');
  const genStatus   = document.getElementById('generate-status');
  genPromptEl.value = '';
  wirePathQuery(genPromptEl);

  document.getElementById('btn-generate').onclick = async () => {
    const userHint = (genPromptEl.value || '').trim();
    const fullPrompt = AI_GENERATE_PROMPT + (userHint ? `\n\nAdditional context: ${userHint}` : '');
    genStatus.innerHTML = '<span class="robos-spinner"></span>Asking AI agent… this may take some time while the AI agent works…';
    genStatus.style.color = 'var(--yellow)';

    const result = await robos.generateWithAi({ prompt: fullPrompt });
    if (!result.ok) {
      genStatus.textContent = '✗ ' + result.error;
      genStatus.style.color = 'var(--red)';
      return;
    }

    try {
      const generated = Array.isArray(result.data) ? result.data : [result.data];
      applyGeneratedTypes(ts, generated);
      renderConfigTypes(ts);
      markDirty();
      genStatus.textContent = `✓ Generated ${generated.length} issue type(s) — review and Save when ready.`;
      genStatus.style.color = 'var(--green)';
    } catch (e) {
      genStatus.textContent = '✗ Failed to parse AI response: ' + e.message;
      genStatus.style.color = 'var(--red)';
    }
  };
}

function applyGeneratedTypes(ts, generated) {
  ts.issue_types = [];
  ts.workflows   = [];
  for (const g of generated) {
    ts.issue_types.push({ id: g.id, label: g.label, color: g.color || '#8b949e' });
    const wf = g.workflow || {};
    ts.workflows.push({
      id: g.id + '-workflow',
      name: g.label + ' Workflow',
      type_id: g.id,
      states: wf.states || [],
      transitions: wf.transitions || [],
    });
  }
}

function renderConfigTypes(ts) {
  const list = document.getElementById('config-types-list');
  list.innerHTML = '';
  const types = ts.issue_types || [];
  if (!types.length) {
    list.innerHTML = `<div style="color:var(--text-1);padding:20px;text-align:center">
      No issue types configured. Use <strong>✨ Generate</strong> to create them with AI, or add manually.
    </div>`;
    return;
  }
  types.forEach((t, idx) => {
    const wf     = (ts.workflows || []).find(w => w.type_id === t.id) || {};
    const states = wf.states || [];
    const card   = document.createElement('div');
    card.className = 'issue-type-card';
    card.innerHTML = `
      <div class="type-card-header" data-idx="${idx}">
        <div class="type-color-dot" style="background:${t.color || '#8b949e'}"></div>
        <span class="type-card-label">${escHtml(t.label)}</span>
        <span class="type-card-meta">${states.length} states</span>
        <span class="type-card-chevron">▶</span>
      </div>
      <div class="type-card-body">
        <div class="type-meta-row">
          <div class="field-group">
            <label>ID</label>
            <input class="field-input" data-field="id" value="${escHtml(t.id)}" style="width:140px"/>
          </div>
          <div class="field-group">
            <label>Label</label>
            <input class="field-input" data-field="label" value="${escHtml(t.label)}" style="width:180px"/>
          </div>
          <div class="field-group">
            <label>Color</label>
            <input type="color" class="color-input" data-field="color" value="${t.color || '#8b949e'}"/>
          </div>
        </div>
        <div class="states-label">Workflow States</div>
        <div class="states-list" data-type-id="${escHtml(t.id)}">
          ${states.map((s, si) => renderStateRow(s, si, t.id)).join('')}
        </div>
        <div class="add-state-row">
          <button class="btn btn-sm btn-add-state" data-type-id="${escHtml(t.id)}">+ Add State</button>
        </div>
        <div class="type-card-actions">
          <button class="btn btn-sm btn-danger btn-del-type" data-idx="${idx}">🗑 Remove Type</button>
        </div>
      </div>
    `;
    list.appendChild(card);

    // toggle expand
    card.querySelector('.type-card-header').onclick = () => {
      const body = card.querySelector('.type-card-body');
      const chev = card.querySelector('.type-card-chevron');
      body.classList.toggle('open');
      chev.classList.toggle('open');
    };

    // field edits
    card.querySelectorAll('[data-field]').forEach(inp => {
      inp.oninput = () => {
        t[inp.dataset.field] = inp.value;
        if (inp.dataset.field === 'color')
          card.querySelector('.type-color-dot').style.background = inp.value;
        if (_notifyDirty) _notifyDirty();
      };
    });

    // state fields
    card.querySelector('.states-list').addEventListener('input', e => {
      const si  = parseInt(e.target.dataset.si, 10);
      const fld = e.target.dataset.stateField;
      if (isNaN(si) || !fld) return;
      states[si][fld] = e.target.value;
      if (_notifyDirty) _notifyDirty();
    });

    // add state
    card.querySelector('.btn-add-state').onclick = () => {
      states.push({
        id: 'state-' + Date.now(), label: 'New State', color: '#8b949e',
        on_enter_script: '', on_enter_prompt: '',
      });
      card.querySelector('.states-list').innerHTML =
        states.map((s, si) => renderStateRow(s, si, t.id)).join('');
      if (_notifyDirty) _notifyDirty();
    };

    // delete type
    card.querySelector('.btn-del-type').onclick = () => {
      ts.issue_types.splice(idx, 1);
      ts.workflows = (ts.workflows || []).filter(w => w.type_id !== t.id);
      renderConfigTypes(ts);
      if (_notifyDirty) _notifyDirty();
    };
  });
}

function renderStateRow(s, si, typeId) {
  return `<div class="state-row">
    <input type="color" class="state-row-color" data-si="${si}" data-state-field="color" value="${s.color || '#8b949e'}" title="Color"/>
    <input class="field-input state-row-label" data-si="${si}" data-state-field="label" value="${escHtml(s.label)}" placeholder="State label" title="Label"/>
    <input class="field-input" data-si="${si}" data-state-field="id" value="${escHtml(s.id)}" placeholder="id" title="ID (kebab-case)" style="width:90px"/>
    <input class="field-input" data-si="${si}" data-state-field="on_enter_script" value="${escHtml(s.on_enter_script || '')}" placeholder="on_enter bash script…" title="Script run on enter"/>
    <textarea class="field-textarea" data-si="${si}" data-state-field="on_enter_prompt" rows="2"
      placeholder="AI agent prompt on enter (use {number}, {org}, {repo})…"
      title="AI prompt run on enter">${escHtml(s.on_enter_prompt || '')}</textarea>
    <div class="state-row-actions">
      <button class="btn btn-sm btn-danger" onclick="deleteState('${escHtml(typeId)}', ${si})">✕</button>
    </div>
  </div>`;
}

// global helper for delete-state button
window.deleteState = function(typeId, si) {
  // re-read settings then remove
  robos.readSettings().then(settings => {
    const ts = getTS(settings);
    const wf = (ts.workflows || []).find(w => w.type_id === typeId);
    if (wf && wf.states) {
      wf.states.splice(si, 1);
      renderConfigTypes(ts);
    }
  });
};

function collectConfig(ts, settings) {
  // ts is mutated in-place by field inputs, so just persist it back
  const newSettings = { ...settings };
  if (!newSettings.task_servers || !newSettings.task_servers.length) {
    newSettings.task_servers = [{ ...ts }];
    newSettings.active_task_server = ts.id;
  } else {
    const idx = newSettings.task_servers.findIndex(t => t.id === ts.id);
    if (idx >= 0) newSettings.task_servers[idx] = { ...ts };
    else newSettings.task_servers.push({ ...ts });
  }
  return newSettings;
}
