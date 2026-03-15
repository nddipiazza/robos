'use strict';

let allSessions  = [];
let activeId     = null;
let activeEvents = [];

// ── Format helpers ────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
         ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDuration(startIso, endIso) {
  if (!startIso || !endIso) return '';
  const ms = new Date(endIso) - new Date(startIso);
  if (ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`;
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
}
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Session list ──────────────────────────────────────────────────────────────
async function loadSessions() {
  document.getElementById('session-list').innerHTML = '<div class="loading">Loading sessions…</div>';
  allSessions = await window.csv.listSessions();
  renderSessionList(allSessions);
}

function renderSessionList(sessions) {
  document.getElementById('session-count').textContent = `${sessions.length} sessions`;
  const list = document.getElementById('session-list');
  if (!sessions.length) {
    list.innerHTML = '<div class="loading">No sessions found</div>';
    return;
  }
  list.innerHTML = sessions.map(s => `
    <div class="session-card${s.id === activeId ? ' active' : ''}" data-id="${escHtml(s.id)}">
      <div class="sc-date">
        ${fmtDate(s.startTime)}
        <span class="sc-badge ${s.source === 'folder' ? 'folder' : ''}">${s.source === 'folder' ? '📁 full' : '📄 legacy'}</span>
        ${s.checkpoints > 0 ? `<span class="sc-badge folder">🏁 ${s.checkpoints} checkpoints</span>` : ''}
      </div>
      <div class="sc-preview">${escHtml(s.firstMessage)}</div>
      <div class="sc-stats">
        <span class="sc-stat">💬 ${s.userMessages}</span>
        <span class="sc-stat">🔧 ${s.toolCalls} tools</span>
        ${s.endTime ? `<span class="sc-stat">⏱ ${fmtDuration(s.startTime, s.endTime)}</span>` : ''}
      </div>
      ${s.cwd ? `<div class="sc-cwd">📂 ${escHtml(s.cwd)}</div>` : ''}
    </div>
  `).join('');

  list.querySelectorAll('.session-card').forEach(card => {
    card.addEventListener('click', () => openSession(card.dataset.id));
  });
}

// ── Open session ──────────────────────────────────────────────────────────────
async function openSession(id) {
  activeId = id;
  // Re-render list to update active state
  const filtered = getFilteredSessions();
  renderSessionList(filtered);

  const session = allSessions.find(s => s.id === id);
  if (!session) return;

  const detail = document.getElementById('detail-panel');
  detail.innerHTML = '<div class="loading" style="padding:40px;text-align:center">Loading session…</div>';

  activeEvents = await window.csv.loadSession({ eventsPath: session.eventsPath });

  const duration = fmtDuration(session.startTime, session.endTime);
  const userMsgs = activeEvents.filter(e => e.type === 'user.message').length;
  const asstMsgs = activeEvents.filter(e => e.type === 'assistant.message').length;
  const toolCalls= activeEvents.filter(e => e.type === 'tool.execution_start').length;

  detail.innerHTML = `
    <div class="detail-header">
      <div class="dh-title">${escHtml(id)}</div>
      <div class="dh-meta">
        <span class="dh-meta-item">🕐 ${fmtDate(session.startTime)}</span>
        ${duration ? `<span class="dh-meta-item">⏱ ${duration}</span>` : ''}
        <span class="dh-meta-item">💬 ${userMsgs} user · ${asstMsgs} assistant</span>
        <span class="dh-meta-item">🔧 ${toolCalls} tool calls</span>
        ${session.checkpoints > 0 ? `<span class="dh-meta-item">🏁 ${session.checkpoints} checkpoints</span>` : ''}
      </div>
      ${session.cwd ? `<div class="dh-cwd">📂 ${escHtml(session.cwd)}</div>` : ''}
    </div>
    <div class="detail-tabs">
      <button class="detail-tab active" data-dtab="conversation">💬 Conversation</button>
      <button class="detail-tab" data-dtab="tools">🔧 Tool Calls</button>
      ${session.checkpoints > 0 ? '<button class="detail-tab" data-dtab="checkpoints">🏁 Checkpoints</button>' : ''}
      <button class="detail-tab" data-dtab="stats">📊 Stats</button>
    </div>
    <div class="detail-body">
      <div class="tab-pane active" id="dtab-conversation"></div>
      <div class="tab-pane"       id="dtab-tools"></div>
      ${session.checkpoints > 0 ? '<div class="tab-pane" id="dtab-checkpoints"></div>' : ''}
      <div class="tab-pane"       id="dtab-stats"></div>
    </div>
  `;

  // Tab switching
  detail.querySelectorAll('.detail-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      detail.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
      detail.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const pane = document.getElementById(`dtab-${tab.dataset.dtab}`);
      if (pane) {
        pane.classList.add('active');
        if (!pane.dataset.loaded) loadTabPane(tab.dataset.dtab, session, pane);
      }
    });
  });

  // Load default tab
  const convPane = document.getElementById('dtab-conversation');
  loadTabPane('conversation', session, convPane);
}

// ── Tab pane loading ──────────────────────────────────────────────────────────
async function loadTabPane(tabKey, session, pane) {
  pane.dataset.loaded = '1';
  if (tabKey === 'conversation') renderConversation(pane);
  if (tabKey === 'tools')        renderTools(pane);
  if (tabKey === 'checkpoints')  await renderCheckpoints(pane, session);
  if (tabKey === 'stats')        renderStats(pane);
}

// ── Conversation tab ──────────────────────────────────────────────────────────
function renderConversation(pane) {
  // Build a map of tool execution results keyed by toolCallId
  const toolResults = {};
  for (const ev of activeEvents) {
    if (ev.type === 'tool.execution_complete') {
      const id = ev.data?.toolCallId;
      if (id) toolResults[id] = ev.data;
    }
  }

  const html = [];
  let pendingToolCalls = []; // buffer tool calls between assistant turns

  for (const ev of activeEvents) {
    if (ev.type === 'user.message') {
      const content = ev.data?.content || '';
      html.push(`
        <div class="msg-user">
          <div class="msg-label">👤 You <span class="msg-time">${fmtDate(ev.timestamp)}</span></div>
          <div class="msg-content">${escHtml(content)}</div>
        </div>
      `);
    }

    if (ev.type === 'assistant.message') {
      const content  = ev.data?.content || '';
      const toolReqs = ev.data?.toolRequests || [];
      let toolHtml   = '';

      if (toolReqs.length) {
        toolHtml = '<div class="tool-calls">';
        for (const tr of toolReqs) {
          const result = toolResults[tr.toolCallId];
          const hasErr = result?.error;
          const statusClass = hasErr ? 'err' : 'ok';
          const statusIcon  = hasErr ? '✗' : '✓';
          const argsStr = JSON.stringify(tr.arguments || {}, null, 2);
          const resultStr = result ? JSON.stringify(result.result ?? result.error ?? result, null, 2) : '';
          toolHtml += `
            <div class="tool-call">
              <div class="tool-call-header" onclick="toggleToolCall(this)">
                <span class="tool-call-name">${escHtml(tr.name)}</span>
                <span class="tool-call-status ${statusClass}">${statusIcon}</span>
                <span class="tool-call-arrow">▶</span>
              </div>
              <div class="tool-call-body">
                <pre><b>Args:</b>\n${escHtml(argsStr)}${resultStr ? `\n\n<b>Result:</b>\n${escHtml(resultStr.slice(0, 2000))}${resultStr.length > 2000 ? '\n…(truncated)' : ''}` : ''}</pre>
              </div>
            </div>
          `;
        }
        toolHtml += '</div>';
      }

      if (content || toolReqs.length) {
        html.push(`
          <div class="msg-assistant">
            <div class="msg-label">🤖 Copilot <span class="msg-time">${fmtDate(ev.timestamp)}</span></div>
            ${content ? `<div class="msg-content">${escHtml(content)}</div>` : ''}
            ${toolHtml}
          </div>
        `);
      }
    }

    if (ev.type === 'session.task_complete') {
      html.push(`<div class="evt-separator">✅ Task complete — ${fmtDate(ev.timestamp)}</div>`);
    }
    if (ev.type === 'session.compaction_start') {
      html.push(`<div class="evt-separator">🗜 Context compaction — ${fmtDate(ev.timestamp)}</div>`);
    }
    if (ev.type === 'session.mode_changed') {
      html.push(`<div class="evt-separator">🔄 Mode changed → ${escHtml(ev.data?.mode || '')} — ${fmtDate(ev.timestamp)}</div>`);
    }
  }

  pane.innerHTML = html.join('');

  // Expand/collapse long messages on click
  pane.querySelectorAll('.msg-content').forEach(el => {
    el.addEventListener('click', () => el.classList.toggle('expanded'));
  });
}

function toggleToolCall(header) {
  const body  = header.nextElementSibling;
  const arrow = header.querySelector('.tool-call-arrow');
  const open  = body.classList.toggle('open');
  arrow.classList.toggle('open', open);
}

// ── Tools tab ────────────────────────────────────────────────────────────────
function renderTools(pane) {
  const execStarts = activeEvents.filter(e => e.type === 'tool.execution_start');
  const execMap    = {};
  for (const ev of activeEvents.filter(e => e.type === 'tool.execution_complete')) {
    execMap[ev.data?.toolCallId] = ev;
  }

  if (!execStarts.length) {
    pane.innerHTML = '<div class="loading">No tool calls in this session</div>';
    return;
  }

  const html = execStarts.map(ev => {
    const name    = ev.data?.name || '?';
    const args    = JSON.stringify(ev.data?.arguments || {}, null, 2);
    const res     = execMap[ev.data?.toolCallId];
    const result  = res ? JSON.stringify(res.data?.result ?? res.data?.error ?? res.data, null, 2) : '';
    const hasErr  = res?.data?.error;
    const statusClass = hasErr ? 'err' : 'ok';
    const statusIcon  = hasErr ? '✗' : '✓';
    return `
      <div class="tool-call">
        <div class="tool-call-header" onclick="toggleToolCall(this)">
          <span class="tool-call-name">${escHtml(name)}</span>
          <span class="tool-call-status ${statusClass}">${statusIcon}</span>
          <span class="msg-time" style="margin-left:8px">${fmtDate(ev.timestamp)}</span>
          <span class="tool-call-arrow">▶</span>
        </div>
        <div class="tool-call-body">
          <pre><b>Args:</b>\n${escHtml(args)}${result ? `\n\n<b>Result:</b>\n${escHtml(result.slice(0, 3000))}${result.length > 3000 ? '\n…(truncated)' : ''}` : ''}</pre>
        </div>
      </div>
    `;
  }).join('');

  pane.innerHTML = `<div style="display:flex;flex-direction:column;gap:3px">${html}</div>`;
}

// ── Checkpoints tab ───────────────────────────────────────────────────────────
async function renderCheckpoints(pane, session) {
  pane.innerHTML = '<div class="loading">Loading checkpoints…</div>';
  const checkpoints = await window.csv.listCheckpoints({ sessionId: session.id });
  if (!checkpoints.length) {
    pane.innerHTML = '<div class="loading">No checkpoints</div>';
    return;
  }

  const html = checkpoints.map((cp, i) => `
    <div class="cp-card">
      <div class="cp-card-header" onclick="toggleCp(this)">
        <span class="cp-arrow">▶</span>
        <span class="cp-name">${escHtml(cp.filename.replace('.md', ''))}</span>
      </div>
      <div class="cp-body">${renderMarkdown(cp.content)}</div>
    </div>
  `).join('');

  pane.innerHTML = `<div class="cp-list">${html}</div>`;
}

function toggleCp(header) {
  const body  = header.nextElementSibling;
  const arrow = header.querySelector('.cp-arrow');
  const open  = body.classList.toggle('open');
  arrow.classList.toggle('open', open);
}

// Very simple markdown → HTML (headings, bold, code, paragraphs)
function renderMarkdown(md) {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[h|p|u|o|l|c|t|s])(.+)$/gm, '<p>$1</p>');
}

// ── Stats tab ────────────────────────────────────────────────────────────────
function renderStats(pane) {
  const userMsgs  = activeEvents.filter(e => e.type === 'user.message').length;
  const asstMsgs  = activeEvents.filter(e => e.type === 'assistant.message').length;
  const toolStarts= activeEvents.filter(e => e.type === 'tool.execution_start');
  const tasksDone = activeEvents.filter(e => e.type === 'session.task_complete').length;
  const compacts  = activeEvents.filter(e => e.type === 'session.compaction_start').length;
  const aborts    = activeEvents.filter(e => e.type === 'abort').length;

  // Tool frequency
  const toolFreq = {};
  for (const ev of toolStarts) {
    const name = ev.data?.name || '?';
    toolFreq[name] = (toolFreq[name] || 0) + 1;
  }
  const sortedTools = Object.entries(toolFreq).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const maxFreq = sortedTools[0]?.[1] || 1;

  const startEvt = activeEvents.find(e => e.type === 'session.start');
  const lastEvt  = activeEvents[activeEvents.length - 1];
  const duration = fmtDuration(startEvt?.data?.startTime || startEvt?.timestamp, lastEvt?.timestamp);

  pane.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">User Messages</div>
        <div class="stat-value">${userMsgs}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">AI Responses</div>
        <div class="stat-value">${asstMsgs}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Tool Calls</div>
        <div class="stat-value">${toolStarts.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Tasks Completed</div>
        <div class="stat-value">${tasksDone}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Context Compactions</div>
        <div class="stat-value">${compacts}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Events</div>
        <div class="stat-value">${activeEvents.length}</div>
      </div>
      ${duration ? `<div class="stat-card"><div class="stat-label">Duration</div><div class="stat-value" style="font-size:18px">${duration}</div></div>` : ''}
    </div>

    ${sortedTools.length ? `
    <div class="tools-freq">
      <div class="tools-freq-title">Most-Used Tools</div>
      ${sortedTools.map(([name, count]) => `
        <div class="tool-freq-row">
          <span class="tool-freq-name">${escHtml(name)}</span>
          <div class="tool-freq-bar-wrap">
            <div class="tool-freq-bar" style="width:${Math.round(count / maxFreq * 100)}%"></div>
          </div>
          <span class="tool-freq-count">${count}</span>
        </div>
      `).join('')}
    </div>` : ''}
  `;
}

// ── Search ────────────────────────────────────────────────────────────────────
function getFilteredSessions() {
  const q = document.getElementById('search-input').value.trim().toLowerCase();
  if (!q) return allSessions;
  return allSessions.filter(s =>
    s.firstMessage.toLowerCase().includes(q) ||
    s.id.toLowerCase().includes(q) ||
    s.cwd.toLowerCase().includes(q)
  );
}

document.getElementById('search-input').addEventListener('input', () => {
  renderSessionList(getFilteredSessions());
});

document.getElementById('btn-refresh').addEventListener('click', loadSessions);

// ── Init ──────────────────────────────────────────────────────────────────────
loadSessions();


// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'copilot-session-viewer');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────
