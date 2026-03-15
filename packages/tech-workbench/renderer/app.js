// ── State ──────────────────────────────────────────────────────────────────────
let sessions = [];
let currentSession = null; // { meta, docs, refinedDocs, questions }
let draftDocIndex = 0;
let refinedDocIndex = 0;
let _autoSaveTimer = null;

// ── Boot ───────────────────────────────────────────────────────────────────────
(async () => {
  try {
    mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
  } catch {}
  // Wire journal logging for all robos-ai-textarea submissions
  window.robosJournalLog = (evt) => window.tps.journalLogEvent(evt).catch(() => {});
  // Wire quick-ask for all robos-ai-textarea "?" buttons
  window.robosQuickAsk = (question, context, contextFiles, onChunk, onDone, onError) => {
    const cleanup = window.tps.onQuickAskStream(chunk => onChunk(chunk));
    window.tps.quickAsk({ question, context, contextFiles }).then(r => {
      cleanup();
      if (r.ok) onDone(); else onError(r.error || 'Unknown error');
    }).catch(e => { cleanup(); onError(e.message); });
  };
  await refreshSessions();
  bindEvents();
})();

// ── Sessions ───────────────────────────────────────────────────────────────────
async function refreshSessions() {
  sessions = await window.tps.listSessions();
  renderSessionList();
}

function renderSessionList() {
  const list = document.getElementById('session-list');
  if (!sessions.length) {
    list.innerHTML = '<div class="session-empty">No sessions yet</div>';
    return;
  }
  list.innerHTML = sessions.map(s => {
    const active = currentSession?.meta.slug === s.slug ? 'active' : '';
    const phaseLabel = { describe: 'New', draft: 'Draft', questionnaire: 'Q&A', refined: '✨ Refined' }[s.phase] || s.phase;
    const phaseClass = s.phase === 'refined' ? 'phase-refined' : s.phase === 'draft' ? 'phase-draft' : '';
    const ago = timeSince(s.updatedAt || s.createdAt);
    return `<div class="session-row ${active}" data-slug="${esc(s.slug)}">
      <div class="session-row-name">${esc(s.name)}</div>
      <div class="session-row-meta">
        <span class="session-phase ${phaseClass}">${phaseLabel}</span>
        <span class="session-ago">${ago}</span>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.session-row[data-slug]').forEach(row => {
    row.addEventListener('click', () => openSession(row.dataset.slug));
  });
}

async function openSession(slug) {
  const data = await window.tps.loadSession(slug);
  if (!data) return;
  currentSession = data;
  window._currentSlug = slug;
  showSessionView();
  refreshSessionUI();
  renderSessionList();
}

function showSessionView() {
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('session-view').classList.remove('hidden');
}

function refreshSessionUI() {
  const { meta, docs, refinedDocs, questions } = currentSession;

  // Name
  document.getElementById('session-name-display').textContent = meta.name;

  // Phase stepper
  updatePhaseStepper(meta.phase);

  // Prompt — robos-ai-textarea component
  const promptInput = document.getElementById('prompt-input');
  promptInput.value = meta.prompt || '';

  // Show correct phase panel
  showPhase(meta.phase);

  // Render docs if available
  if (docs && docs.some(Boolean)) {
    draftDocIndex = 0;
    renderDocViewer('draft-viewer', 'draft-tabs', docs, draftDocIndex);
  }
  if (refinedDocs && refinedDocs.some(Boolean)) {
    refinedDocIndex = 0;
    renderDocViewer('refined-viewer', 'refined-tabs', refinedDocs, refinedDocIndex);
  }

  // Render questions
  if (questions && questions.length) renderQuestions(questions);
}

function updatePhaseStepper(phase) {
  const order = ['describe', 'draft', 'questionnaire', 'refined', 'projects'];
  const idx = order.indexOf(phase);
  document.querySelectorAll('.phase-step').forEach((el, i) => {
    el.classList.toggle('done',   i < idx);
    el.classList.toggle('active', i === idx);
  });
}

function showPhase(phase) {
  const active = ['describe', 'draft', 'questionnaire', 'refined', 'projects'].includes(phase) ? phase : 'describe';
  ['describe', 'draft', 'questionnaire', 'refined', 'projects'].forEach(p => {
    document.getElementById(`phase-${p}`).classList.toggle('hidden', p !== active);
  });
  if (active === 'projects') loadProjectsReport();
}

// ── Document viewer ────────────────────────────────────────────────────────────
async function renderDocViewer(viewerId, tabsId, docs, activeIdx) {
  const viewer = document.getElementById(viewerId);
  const tabs   = document.getElementById(tabsId);

  // Deactivate prompts tab (it has data-doc="prompts", not a number)
  tabs.querySelectorAll('.doc-tab[data-doc="prompts"]').forEach(b => b.classList.remove('active'));

  // Update numbered tabs
  tabs.querySelectorAll('.doc-tab[data-doc]:not([data-doc="prompts"])').forEach((btn, i) => {
    btn.classList.toggle('active', i === activeIdx);
    btn.classList.toggle('has-content', !!docs[i]);
    btn.disabled = !docs[i];
  });

  const content = docs[activeIdx];
  if (!content) { viewer.innerHTML = '<div class="doc-empty">Document not yet generated.</div>'; return; }

  // Render markdown
  let html;
  try { html = marked.parse(content); } catch { html = `<pre>${escHtml(content)}</pre>`; }
  viewer.innerHTML = `<div class="md-body">${html}</div>`;

  // Render mermaid diagrams
  viewer.querySelectorAll('code.language-mermaid, pre code.language-mermaid').forEach(async (el, idx) => {
    const container = el.closest('pre') || el;
    const code = el.textContent;
    const id = `mermaid-${viewerId}-${activeIdx}-${idx}-${Date.now()}`;
    try {
      const { svg } = await mermaid.render(id, code);
      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid-render';
      wrapper.innerHTML = svg;
      container.parentNode.replaceChild(wrapper, container);
    } catch (e) {
      container.classList.add('mermaid-error');
    }
  });

  viewer.scrollTop = 0;
}

function renderOriginalPrompts(viewerId, tabsId) {
  const viewer = document.getElementById(viewerId);
  const tabs   = document.getElementById(tabsId);

  // Mark prompts tab active, deactivate others
  tabs.querySelectorAll('.doc-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.doc === 'prompts');
  });

  const s = currentSession;
  if (!s) { viewer.innerHTML = '<div class="doc-empty">No session loaded.</div>'; return; }

  const esc = t => t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let html = '<div class="original-prompts">';

  // ── Problem Description ──────────────────────────────────────────────
  html += `<div class="op-section">
    <div class="op-field-label">🖊 Problem Description</div>
    <div class="op-field-value">${esc(s.meta.prompt || '(none)')}</div>
  </div>`;

  // ── Q&A Answers ──────────────────────────────────────────────────────
  const qs = s.questions || [];
  if (qs.length) {
    html += `<div class="op-section">
      <div class="op-field-label">❓ Clarifying Questions &amp; Answers</div>`;
    qs.forEach((q, i) => {
      const answered = q.answer && q.answer.trim();
      html += `<div class="op-qa${answered ? '' : ' op-qa-skipped'}">
        <div class="op-q"><span class="op-qnum">Q${i+1}</span> ${esc(q.question || '')}</div>
        <div class="op-a">${answered ? esc(q.answer) : '<em class="op-skipped">— not answered —</em>'}</div>
      </div>`;
    });
    html += `</div>`;
  }

  html += '</div>';
  viewer.innerHTML = html;
  viewer.scrollTop = 0;
}

function bindDocTabs(tabsId, viewerId, getDocsArr) {
  document.getElementById(tabsId).querySelectorAll('.doc-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.doc === 'prompts') {
        renderOriginalPrompts(viewerId, tabsId);
        return;
      }
      const idx = parseInt(btn.dataset.doc);
      renderDocViewer(viewerId, tabsId, getDocsArr(), idx);
    });
  });
}

// ── Questions ──────────────────────────────────────────────────────────────────
function renderQuestions(questions) {
  const list = document.getElementById('questions-list');
  const CATS = { context: '🌍', technical: '⚙️', constraints: '🔒', scale: '📈', timeline: '⏱', team: '👥', success: '✅' };

  list.innerHTML = questions.map((q, i) => {
    const icon = CATS[q.category] || '❓';
    return `<div class="qa-card">
      <div class="qa-num">${icon} ${i + 1}</div>
      <div class="qa-question">${esc(q.question)}</div>
      <robos-ai-textarea class="qa-answer" data-qid="${esc(q.id)}"
        show-submit="false" show-commands="false" min-height="60"
        placeholder="Your answer…"></robos-ai-textarea>
    </div>`;
  }).join('');

  // Pre-fill existing answers and wire path-query
  questions.forEach(q => {
    const el = list.querySelector(`robos-ai-textarea[data-qid="${q.id}"]`);
    if (!el) return;
    if (q.answer) {
      // Wait for component to upgrade then set value
      customElements.whenDefined('robos-ai-textarea').then(() => { try { el.value = q.answer; } catch {} });
    }
    el.addEventListener('robos-path-query', async (e) => {
      const r = await window.tps.listPath(e.detail.query);
      if (r && r.ok) el._showMentions(r.items);
    });
  });
}

// ── Bind events ────────────────────────────────────────────────────────────────
function bindEvents() {
  // New session modal
  document.getElementById('btn-new-session').addEventListener('click', () => {
    document.getElementById('modal-new').classList.remove('hidden');
    document.getElementById('new-session-name').value = '';
    document.getElementById('new-session-name').focus();
  });
  document.getElementById('btn-modal-cancel').addEventListener('click', closeNewModal);
  document.getElementById('modal-new').addEventListener('click', e => { if (e.target === e.currentTarget) closeNewModal(); });
  document.getElementById('new-session-name').addEventListener('keydown', e => { if (e.key === 'Enter') createSession(); if (e.key === 'Escape') closeNewModal(); });
  document.getElementById('btn-modal-create').addEventListener('click', createSession);

  // Rename
  document.getElementById('btn-copy-title').addEventListener('click', () => {
    if (!currentSession) return;
    navigator.clipboard.writeText(currentSession.meta.name).then(() => {
      const btn = document.getElementById('btn-copy-title');
      btn.textContent = '✅';
      setTimeout(() => { btn.textContent = '📋'; }, 1200);
    });
  });

  document.getElementById('btn-rename').addEventListener('click', async () => {
    if (!currentSession) return;
    const name = prompt('Session name:', currentSession.meta.name);
    if (!name || !name.trim()) return;
    await window.tps.renameSession(currentSession.meta.slug, name.trim());
    currentSession.meta.name = name.trim();
    document.getElementById('session-name-display').textContent = name.trim();
    await refreshSessions();
  });

  // Open folder
  document.getElementById('btn-open-folder').addEventListener('click', () => {
    if (currentSession) window.tps.openFolder(currentSession.meta.slug);
  });

  // Delete
  document.getElementById('btn-delete-session').addEventListener('click', async () => {
    if (!currentSession) return;
    if (!confirm(`Delete session "${currentSession.meta.name}"? This cannot be undone.`)) return;
    await window.tps.deleteSession(currentSession.meta.slug);
    currentSession = null;
    document.getElementById('empty-state').classList.remove('hidden');
    document.getElementById('session-view').classList.add('hidden');
    await refreshSessions();
  });

  // Phase 1: Analyze (button click or Ctrl+Enter via robos-submit event)
  document.getElementById('btn-analyze').addEventListener('click', doGenerateDraft);
  document.getElementById('prompt-input').addEventListener('robos-submit', doGenerateDraft);

  // Auto-save prompt on every keypress (debounced 600ms)
  document.getElementById('prompt-input').addEventListener('input', () => {
    if (!currentSession) return;
    clearTimeout(_autoSaveTimer);
    _autoSaveTimer = setTimeout(async () => {
      const val = document.getElementById('prompt-input').value;
      await window.tps.savePrompt(currentSession.meta.slug, val);
      currentSession.meta.prompt = val;
    }, 600);
  });

  // File path autocomplete — handle @/path... queries
  document.getElementById('prompt-input').addEventListener('robos-path-query', async (e) => {
    const promptInput = document.getElementById('prompt-input');
    const r = await window.tps.listPath(e.detail.query);
    if (r && r.ok) promptInput._showMentions(r.items);
  });

  // Phase 2: Generate questions, back to describe
  document.getElementById('btn-gen-questions').addEventListener('click', doGenerateQuestions);
  document.getElementById('btn-to-describe').addEventListener('click', () => {
    if (!currentSession) return;
    currentSession.meta.phase = 'describe';
    showPhase('describe');
    updatePhaseStepper('describe');
  });

  // Phase 3: Submit answers, back to draft
  document.getElementById('btn-back-to-draft').addEventListener('click', () => {
    showPhase('draft'); updatePhaseStepper('draft');
  });
  document.getElementById('btn-submit-answers').addEventListener('click', doRefine);

  // Phase 4: Re-refine, back to Q&A
  document.getElementById('btn-back-to-qa').addEventListener('click', () => {
    showPhase('questionnaire'); updatePhaseStepper('questionnaire');
  });
  document.getElementById('btn-re-refine').addEventListener('click', doRefine);

  // Doc tab binding (draft)
  bindDocTabs('draft-tabs', 'draft-viewer', () => currentSession?.docs || []);
  bindDocTabs('refined-tabs', 'refined-viewer', () => currentSession?.refinedDocs || []);

  // Stream handler — Phase 1 streaming is handled by robos-ai-textarea component
  // Phases 2/3/4 use their own stream boxes
  window.tps.onStream(chunk => {
    ['stream-pre-draft', 'stream-pre-qa', 'stream-pre-refined'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.closest('.hidden')) { el.textContent += chunk; el.scrollTop = el.scrollHeight; }
    });
  });
}

async function createSession() {
  const name = document.getElementById('new-session-name').value.trim();
  if (!name) return;
  closeNewModal();
  const meta = await window.tps.createSession(name);
  await refreshSessions();
  await openSession(meta.slug);
}

function closeNewModal() {
  document.getElementById('modal-new').classList.add('hidden');
}

// ── AI actions ─────────────────────────────────────────────────────────────────
async function doGenerateDraft() {
  if (!currentSession) return;
  const promptInput = document.getElementById('prompt-input');
  const prompt = promptInput.value.trim();
  if (!prompt) { alert('Please describe the problem first.'); return; }

  // Save prompt
  await window.tps.savePrompt(currentSession.meta.slug, prompt);
  currentSession.meta.prompt = prompt;

  // Show streaming in the component
  promptInput.clearStream();
  promptInput.startWaiting();
  const analyzeBtn = document.getElementById('btn-analyze');
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = '⏳ Analyzing…';
  document.body.style.cursor = 'wait';

  // Wire stream chunks to the component
  const streamHandler = chunk => promptInput.streamChunk(chunk);
  window.tps.onStream(streamHandler);

  try {
    const r = await window.tps.generateDraft(currentSession.meta.slug);
    promptInput.streamDone();
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = '🤖 Analyze & Generate Draft';
    document.body.style.cursor = '';

    if (!r.ok) { alert(`Error: ${r.error}`); return; }

    currentSession.meta.phase = 'draft';
    currentSession.docs = r.docs;
    updatePhaseStepper('draft');
    showPhase('draft');
    draftDocIndex = 1;
    renderDocViewer('draft-viewer', 'draft-tabs', currentSession.docs, 1);
    promptInput.clearStream();
    await refreshSessions();
  } catch (err) {
    promptInput.streamDone();
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = '🤖 Analyze & Generate Draft';
    document.body.style.cursor = '';
    alert(`Failed: ${err.message}`);
  }
}

async function doGenerateQuestions() {
  if (!currentSession) return;

  const streamBox = document.getElementById('stream-box-draft');
  const streamPre = document.getElementById('stream-pre-draft');
  streamBox.classList.remove('hidden');
  streamPre.textContent = '';
  document.getElementById('btn-gen-questions').disabled = true;

  try {
    const r = await window.tps.generateQuestions(currentSession.meta.slug);
    streamBox.classList.add('hidden');
    document.getElementById('btn-gen-questions').disabled = false;

    if (!r.ok) { alert(`Error: ${r.error}`); return; }

    currentSession.meta.phase = 'questionnaire';
    currentSession.questions = r.questions;
    updatePhaseStepper('questionnaire');
    showPhase('questionnaire');
    renderQuestions(r.questions);
    await refreshSessions();
  } catch (err) {
    streamBox.classList.add('hidden');
    document.getElementById('btn-gen-questions').disabled = false;
    alert(`Failed: ${err.message}`);
  }
}

async function doRefine() {
  if (!currentSession) return;

  // Collect answers from form
  const answers = (currentSession.questions || []).map(q => {
    const el = document.querySelector(`.qa-answer[data-qid="${q.id}"]`);
    return { ...q, answer: el ? el.value.trim() : (q.answer || '') };
  });

  // Save answers
  await window.tps.saveAnswers(currentSession.meta.slug, answers);
  currentSession.questions = answers;

  const streamBox = document.getElementById('stream-box-qa');
  const streamPre = document.getElementById('stream-pre-qa');
  streamBox.classList.remove('hidden');
  streamPre.textContent = '';
  document.getElementById('btn-submit-answers').disabled = true;
  document.getElementById('btn-re-refine').disabled = true;

  try {
    const r = await window.tps.refineDocs(currentSession.meta.slug);
    streamBox.classList.add('hidden');
    document.getElementById('btn-submit-answers').disabled = false;
    document.getElementById('btn-re-refine').disabled = false;

    if (!r.ok) { alert(`Error: ${r.error}`); return; }

    currentSession.meta.phase = 'refined';
    currentSession.refinedDocs = r.refinedDocs;
    updatePhaseStepper('refined');
    showPhase('refined');
    refinedDocIndex = 0;
    renderDocViewer('refined-viewer', 'refined-tabs', currentSession.refinedDocs, 0);
    await refreshSessions();
  } catch (err) {
    streamBox.classList.add('hidden');
    document.getElementById('btn-submit-answers').disabled = false;
    document.getElementById('btn-re-refine').disabled = false;
    alert(`Failed: ${err.message}`);
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escHtml(s) { return esc(s); }

function timeSince(ts) {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month:'short', day:'numeric' });
}

// ── Projects & Dependencies Report ────────────────────────────────────────────
// Wire phase step click
document.querySelectorAll('.phase-step').forEach(el => {
  if (el.dataset.phase === 'projects') {
    el.addEventListener('click', () => {
      showPhase('projects');
      updatePhaseStepper('projects');
    });
  }
});

document.getElementById('btn-refresh-projects').addEventListener('click', () => loadProjectsReport());

async function loadProjectsReport() {
  const el = document.getElementById('projects-report');
  el.innerHTML = '<div class="tps-loading">Loading…</div>';
  try {
    const slug = window._currentSlug;
    const r = await tps.getProjectsReport(slug);
    if (!r.ok) { el.innerHTML = `<div class="tps-loading">Error loading report</div>`; return; }

    const { projects, mentioned } = r;
    const mentionedSet = new Set(mentioned.map(m => m.toLowerCase()));

    // Build table
    let html = `<div class="proj-report-section">
      <div class="proj-report-title">🗄 Git Repositories (${projects.length})</div>
      <table class="proj-table">
        <thead><tr>
          <th>Repo</th><th>Org</th><th>Host</th><th>Cloned</th><th>Local Path</th><th>In Session</th>
        </tr></thead><tbody>`;

    if (!projects.length) {
      html += `<tr><td colspan="6" style="text-align:center;color:#8b949e">No repos configured. Add repos in Git Projects.</td></tr>`;
    } else {
      projects.forEach(p => {
        const repoId = `${p.org}/${p.repo}`.toLowerCase();
        const inSession = mentionedSet.has(repoId);
        const clonedBadge = p._cloned
          ? `<span class="proj-badge proj-badge-ok">✓ cloned</span>`
          : `<span class="proj-badge proj-badge-warn">not cloned</span>`;
        const localBadge = p.localExists
          ? `<span class="proj-badge proj-badge-ok">✓ exists</span>`
          : `<span class="proj-badge proj-badge-dim">—</span>`;
        const sessionBadge = inSession
          ? `<span class="proj-badge proj-badge-blue">📎 mentioned</span>`
          : `<span class="proj-badge proj-badge-dim">—</span>`;
        const repoUrl = `https://${p.host || 'github.com'}/${p.org}/${p.repo}`;
        html += `<tr class="${inSession ? 'proj-row-highlight' : ''}">
          <td><a href="#" class="proj-link" data-url="${esc(repoUrl)}">${esc(p.repo)}</a></td>
          <td>${esc(p.org)}</td>
          <td>${esc(p.host || 'github.com')}</td>
          <td>${clonedBadge}</td>
          <td style="font-size:10px;color:#8b949e;max-width:200px;overflow:hidden;text-overflow:ellipsis">${esc(p.localPath || '—')}</td>
          <td>${sessionBadge}</td>
        </tr>`;
      });
    }
    html += `</tbody></table></div>`;

    // Mentioned repos not in git-projects
    const projectIds = new Set(projects.map(p => `${p.org}/${p.repo}`.toLowerCase()));
    const untracked = mentioned.filter(m => !projectIds.has(m.toLowerCase()));
    if (untracked.length) {
      html += `<div class="proj-report-section" style="margin-top:16px">
        <div class="proj-report-title">🔗 Referenced in Session (not in Git Projects)</div>
        <div class="proj-untracked-list">`;
      untracked.forEach(m => {
        html += `<div class="proj-untracked-row">
          <span>github.com/${esc(m)}</span>
          <a href="#" class="proj-link" data-url="https://github.com/${esc(m)}">↗ Open</a>
        </div>`;
      });
      html += `</div></div>`;
    }

    el.innerHTML = html;
    el.querySelectorAll('.proj-link').forEach(a => {
      a.addEventListener('click', e => { e.preventDefault(); tps.openExternal(a.dataset.url); });
    });
  } catch (err) {
    el.innerHTML = `<div class="tps-loading">Error: ${esc(err.message)}</div>`;
  }
}


// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'tech-workbench');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────
