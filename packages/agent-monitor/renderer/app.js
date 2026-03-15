'use strict';

let allSessions = [];
let allProcesses = [];
let selectedSession = null;
let monacoEditor = null;
let activeFilter = 'all'; // all, running, claude, copilot

// ── Initialization ──────────────────────────────────────────────────────────

async function init() {
  // Set app logo from icon registry
  try {
    const apps = window.ROBOS_BUILTIN_APPS || [];
    const entry = apps.find(a => a.appId === 'agent-monitor');
    if (entry) {
      document.getElementById('app-logo-icon').innerHTML = entry.iconSvg;
    }
  } catch {}

  await refreshData();
  initMonaco();
  initResizer();
  initActionHandlers();
  initFilterTabs();
  setInterval(refreshData, 5000);
}

// ── Data refresh ────────────────────────────────────────────────────────────

async function refreshData() {
  [allSessions, allProcesses] = await Promise.all([
    window.agentMonitor.listSessions(),
    window.agentMonitor.listProcesses(),
  ]);

  // Cross-reference: mark sessions as running if their PID is alive
  const runningPids = new Set(allProcesses.map(p => p.pid));
  for (const s of allSessions) {
    s.isRunning = s.pid ? runningPids.has(s.pid) : s.status === 'running';
  }

  // Add processes that don't have a tracked session
  for (const p of allProcesses) {
    if (!allSessions.find(s => s.pid === p.pid)) {
      allSessions.unshift({
        session_id: `proc-${p.pid}`,
        provider: p.provider,
        name: p.cwd ? p.cwd.split('/').pop() : `PID ${p.pid}`,
        cwd: p.cwd,
        started_at: p.startTime,
        first_message: '',
        isRunning: true,
        pid: p.pid,
      });
    }
  }

  renderSessionList();

  // If selected session is still valid, update its detail
  if (selectedSession) {
    const found = allSessions.find(s => s.session_id === selectedSession.session_id);
    if (found) selectSession(found, true);
  }
}

// ── Session list rendering ──────────────────────────────────────────────────

function renderSessionList() {
  const list = document.getElementById('session-list');
  const filtered = allSessions.filter(s => {
    if (activeFilter === 'running') return s.isRunning;
    if (activeFilter === 'claude') return s.provider === 'claude-code';
    if (activeFilter === 'copilot') return s.provider === 'github-copilot';
    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-sessions">No sessions found.</div>';
    return;
  }

  list.innerHTML = filtered.map(s => `
    <div class="session-item ${selectedSession?.session_id === s.session_id ? 'active' : ''} ${s.isRunning ? 'running' : ''}"
         data-id="${escapeAttr(s.session_id)}">
      <div class="session-header">
        <span class="provider-badge ${s.provider}">${s.provider === 'claude-code' ? 'Claude' : 'Copilot'}</span>
        ${s.isRunning ? '<span class="status-dot running"></span>' : '<span class="status-dot completed"></span>'}
      </div>
      <div class="session-name">${escapeHtml(s.name)}</div>
      <div class="session-meta">${s.cwd ? escapeHtml(s.cwd) : ''}</div>
      <div class="session-meta">${s.started_at ? formatTime(s.started_at) : ''}</div>
      ${s.first_message ? `<div class="session-prompt-preview">${escapeHtml(s.first_message.slice(0, 80))}</div>` : ''}
    </div>
  `).join('');

  // Attach click handlers
  list.querySelectorAll('.session-item').forEach(el => {
    el.addEventListener('click', () => {
      const session = filtered.find(s => s.session_id === el.dataset.id);
      if (session) selectSession(session);
    });
  });
}

// ── Session selection ───────────────────────────────────────────────────────

async function selectSession(session, silent) {
  selectedSession = session;
  if (!silent) renderSessionList();

  // Update header
  document.getElementById('detail-provider').textContent = session.provider === 'claude-code' ? 'Claude Code' : 'GitHub Copilot';
  document.getElementById('detail-name').textContent = session.name;
  document.getElementById('detail-cwd').textContent = session.cwd || 'N/A';
  document.getElementById('detail-status').textContent = session.isRunning ? 'Running' : 'Completed';
  document.getElementById('detail-status').className = `status-badge ${session.isRunning ? 'running' : 'completed'}`;

  // Show/hide action buttons
  document.getElementById('btn-kill').style.display = session.isRunning ? '' : 'none';
  document.getElementById('btn-terminal').style.display = '';

  // Load prompt into Monaco
  const prompt = await window.agentMonitor.getSessionPrompt(session.session_id, session.provider);
  if (monacoEditor && prompt) {
    monacoEditor.setValue(prompt);
  } else if (monacoEditor) {
    monacoEditor.setValue('// No prompt data available');
  }

  // Load log output
  const log = await window.agentMonitor.getSessionLog(session.session_id, session.provider);
  const logEl = document.getElementById('log-output');
  logEl.textContent = log || 'No log data available.';
  logEl.scrollTop = logEl.scrollHeight;
}

// ── Monaco editor ───────────────────────────────────────────────────────────

function initMonaco() {
  require.config({ paths: { vs: '../node_modules/monaco-editor/min/vs' } });
  require(['vs/editor/editor.main'], function () {
    monaco.editor.defineTheme('robos-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0a0e14',
        'editor.foreground': '#d0d0e8',
        'editorLineNumber.foreground': '#444466',
      }
    });

    monacoEditor = monaco.editor.create(document.getElementById('monaco-container'), {
      value: '// Select a session to view its prompt',
      language: 'markdown',
      theme: 'robos-dark',
      readOnly: true,
      wordWrap: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      lineNumbers: 'off',
      renderLineHighlight: 'none',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      padding: { top: 12, bottom: 12 },
    });

    // Auto-resize on window resize
    window.addEventListener('resize', () => monacoEditor.layout());
    // Layout when resizer changes sidebar width
    new ResizeObserver(() => monacoEditor.layout()).observe(document.getElementById('main-content'));
  });
}

// ── Panel resizer ───────────────────────────────────────────────────────────

function initResizer() {
  const resizer = document.getElementById('panel-resizer');
  const panel   = document.querySelector('.sidebar');
  if (!resizer || !panel) return;
  let startX, startW;
  resizer.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startW = panel.getBoundingClientRect().width;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev) => {
      const w = Math.max(240, Math.min(520, startW + ev.clientX - startX));
      panel.style.width = w + 'px';
    };
    const onUp = () => {
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

// ── Action handlers ─────────────────────────────────────────────────────────

function initActionHandlers() {
  document.getElementById('btn-kill').addEventListener('click', async () => {
    if (!selectedSession?.pid) return;
    await window.agentMonitor.killAgent(selectedSession.pid);
    setTimeout(refreshData, 500);
  });

  document.getElementById('btn-terminal').addEventListener('click', () => {
    if (!selectedSession) return;
    window.agentMonitor.openTerminal(selectedSession.session_id, selectedSession.provider);
  });

  // Title bar
  document.getElementById('btn-minimize').addEventListener('click', () => window.agentMonitor.minimize());
  document.getElementById('btn-close').addEventListener('click', () => window.agentMonitor.close());
}

// ── Filter tabs ─────────────────────────────────────────────────────────────

function initFilterTabs() {
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeFilter = tab.dataset.filter;
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderSessionList();
    });
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

// ── Start ───────────────────────────────────────────────────────────────────

init();
