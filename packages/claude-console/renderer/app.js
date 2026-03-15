'use strict';

let selectedCwd = '';
let isRunning = false;
let currentAssistantEl = null;  // streaming target
let currentText = '';           // accumulating text for current assistant message
let resumeSessionId = null;

// ── Boot ────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('btn-stop').addEventListener('click', () => window.claude.stopClaude());
  document.getElementById('btn-refresh').addEventListener('click', loadSessions);
  document.getElementById('btn-minimize').addEventListener('click', () => window.claude.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => window.claude.maximize());
  document.getElementById('btn-close').addEventListener('click', () => window.claude.close());
  document.getElementById('cwd-select').addEventListener('change', (e) => { selectedCwd = e.target.value; });

  // robos-ai-textarea events — wait for component to upgrade
  const input = document.getElementById('prompt-input');
  await customElements.whenDefined('robos-ai-textarea');
  input.addEventListener('robos-submit', (e) => {
    const { value, context } = e.detail;
    sendMessage(value, context);
  });
  input.addEventListener('robos-path-query', async (e) => {
    const r = await window.claude.listPath(e.detail.query);
    if (r && r.ok) input._showMentions(r.items);
  });

  // Esc to stop
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isRunning) window.claude.stopClaude();
  });

  // Claude events
  window.claude.onEvent(onClaudeEvent);
  window.claude.onDone(onClaudeDone);

  initResizer();
  await loadCwdChoices();
  await loadSessions();
  injectAppIcon();
});

// ── Send message ────────────────────────────────────────────────────────────
async function sendMessage(text, context) {
  const input = document.getElementById('prompt-input');
  const prompt = (text || '').trim();
  if (!prompt || isRunning) return;

  // Build prompt with context file references
  let fullPrompt = prompt;
  if (context && context.length) {
    const refs = context.map(c => c.path || c.name).filter(Boolean);
    if (refs.length) {
      fullPrompt = refs.map(r => `@${r}`).join(' ') + '\n\n' + prompt;
    }
  }

  // Show user message
  addUserMessage(prompt);
  input.value = '';

  // Start Claude
  isRunning = true;
  setStatus('running');
  document.getElementById('btn-stop').disabled = false;

  // Prepare streaming assistant bubble
  currentText = '';
  currentAssistantEl = addAssistantMessage('');

  const opts = { cwd: selectedCwd || undefined };
  if (resumeSessionId) opts.resume = resumeSessionId;

  await window.claude.sendMessage(fullPrompt, opts);
}

// ── Claude event handling ───────────────────────────────────────────────────
function onClaudeEvent(ev) {
  if (ev.type === 'system' && ev.subtype === 'init') {
    resumeSessionId = ev.session_id;
    addSystemMessage(`Session: ${ev.session_id.slice(0, 8)}… | Model: ${ev.model || 'unknown'}`);
    return;
  }

  if (ev.type === 'assistant' && ev.message) {
    const content = ev.message.content;
    if (!content) return;
    for (const block of content) {
      if (block.type === 'text' && block.text) {
        currentText += block.text;
        if (currentAssistantEl) {
          updateAssistantMessage(currentAssistantEl, currentText, true);
        }
      }
      if (block.type === 'tool_use') {
        addToolMessage(block.name, JSON.stringify(block.input, null, 2).slice(0, 500));
      }
    }
    return;
  }

  if (ev.type === 'tool_result' || (ev.type === 'user' && ev.message)) {
    // Tool results from Claude's internal tool use
    const content = ev.message?.content;
    if (content && Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_result' && block.content) {
          const text = typeof block.content === 'string' ? block.content : JSON.stringify(block.content).slice(0, 500);
          addToolResultMessage(text);
        }
      }
    }
    return;
  }

  if (ev.type === 'result') {
    const cost = ev.total_cost_usd;
    if (currentAssistantEl && cost) {
      const badge = document.createElement('div');
      badge.className = 'cost-badge';
      badge.textContent = `$${cost.toFixed(4)} · ${ev.duration_ms ? (ev.duration_ms / 1000).toFixed(1) + 's' : ''}`;
      currentAssistantEl.appendChild(badge);
    }
  }
}

function onClaudeDone(code) {
  isRunning = false;
  setStatus('idle');
  document.getElementById('btn-stop').disabled = true;

  // Remove streaming indicator
  if (currentAssistantEl) {
    updateAssistantMessage(currentAssistantEl, currentText, false);
    currentAssistantEl = null;
  }

  document.getElementById('prompt-input').focus();
  setTimeout(loadSessions, 500);
}

// ── Message rendering ───────────────────────────────────────────────────────
function addUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg msg-user';
  div.innerHTML = `<div class="msg-label">You</div><div class="msg-body">${esc(text)}</div>`;
  appendMessage(div);
}

function addAssistantMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg msg-assistant';
  div.innerHTML = `<div class="msg-label">Claude</div><div class="msg-body"></div>`;
  appendMessage(div);
  return div;
}

function updateAssistantMessage(el, text, streaming) {
  const body = el.querySelector('.msg-body');
  if (!body) return;
  body.innerHTML = renderMarkdown(text) + (streaming ? '<span class="streaming-dot"></span>' : '');
  scrollToBottom();
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg msg-system';
  div.textContent = text;
  appendMessage(div);
}

function addToolMessage(name, input) {
  const div = document.createElement('div');
  div.className = 'msg msg-tool';
  div.innerHTML = `<div class="tool-name">Tool: ${esc(name)}</div><div class="tool-content">${esc(input)}</div>`;
  appendMessage(div);
}

function addToolResultMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg msg-tool';
  const truncated = text.length > 300 ? text.slice(0, 300) + '…' : text;
  div.innerHTML = `<div class="tool-name">Result</div><div class="tool-content">${esc(truncated)}</div>`;
  appendMessage(div);
}

function appendMessage(el) {
  document.getElementById('messages').appendChild(el);
  scrollToBottom();
}

function scrollToBottom() {
  const msgs = document.getElementById('messages');
  msgs.scrollTop = msgs.scrollHeight;
}

// ── Markdown rendering (lightweight) ────────────────────────────────────────
function renderMarkdown(text) {
  // Code blocks with language
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const id = 'cb-' + Math.random().toString(36).slice(2, 8);
    return `<div class="code-block">
      <div class="code-block-header">
        <span class="code-block-lang">${esc(lang || 'text')}</span>
        <button class="code-block-copy" onclick="copyCode('${id}')">Copy</button>
      </div>
      <pre id="${id}"><code>${esc(code)}</code></pre>
    </div>`;
  });

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // Headers
  text = text.replace(/^### (.+)$/gm, '<h4 style="color:#e6edf3;margin:8px 0 4px">$1</h4>');
  text = text.replace(/^## (.+)$/gm, '<h3 style="color:#e6edf3;margin:10px 0 4px">$1</h3>');
  text = text.replace(/^# (.+)$/gm, '<h2 style="color:#e6edf3;margin:12px 0 6px">$1</h2>');

  // Unordered lists
  text = text.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Numbered lists
  text = text.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Paragraphs (double newline)
  text = text.replace(/\n\n/g, '</p><p>');
  text = '<p>' + text + '</p>';

  // Single newlines within paragraphs
  text = text.replace(/\n/g, '<br>');

  return text;
}

// ── Copy code block ─────────────────────────────────────────────────────────
window.copyCode = function(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const text = el.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = el.parentElement.querySelector('.code-block-copy');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); }
  });
};

// ── Session list ────────────────────────────────────────────────────────────
async function loadSessions() {
  const sessions = await window.claude.listSessions();
  const list = document.getElementById('session-list');
  list.innerHTML = '';

  if (!sessions.length) {
    list.innerHTML = '<div style="padding:12px;color:#6e7681;font-size:12px;text-align:center">No sessions yet</div>';
    return;
  }

  for (const s of sessions) {
    const div = document.createElement('div');
    div.className = 'session-item' + (resumeSessionId === s.id ? ' active' : '');
    div.innerHTML = `
      <div class="session-name">${esc(s.name || s.id.slice(0, 8))}</div>
      <div class="session-prompt">${s.prompt ? esc(s.prompt) : '<span style="color:#6e7681">—</span>'}</div>
      <div class="session-time">${s.time ? formatTime(s.time) : ''}</div>
    `;
    div.addEventListener('click', () => {
      if (isRunning) return;
      resumeSessionId = s.id;
      document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      // Clear chat and show resume hint
      document.getElementById('messages').innerHTML = '';
      addSystemMessage(`Resuming session ${s.id.slice(0, 8)}… — type a message to continue.`);
      document.getElementById('prompt-input').focus();
    });
    list.appendChild(div);
  }
}

// ── CWD picker ──────────────────────────────────────────────────────────────
async function loadCwdChoices() {
  const homeDir = await window.claude.getHomeDir();
  const dirs = await window.claude.getCwdChoices();
  const select = document.getElementById('cwd-select');
  select.innerHTML = '';

  const opt0 = document.createElement('option');
  opt0.value = homeDir;
  opt0.textContent = '~ (home)';
  select.appendChild(opt0);

  for (const dir of dirs) {
    const opt = document.createElement('option');
    opt.value = dir;
    opt.textContent = dir.startsWith(homeDir) ? '~' + dir.slice(homeDir.length) : dir;
    select.appendChild(opt);
  }
  selectedCwd = homeDir;
}

// ── Resizable sidebar ───────────────────────────────────────────────────────
function initResizer() {
  const resizer = document.getElementById('panel-resizer');
  const panel   = document.getElementById('sidebar');
  if (!resizer || !panel) return;
  let startX, startW;
  resizer.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startW = panel.getBoundingClientRect().width;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev) => {
      panel.style.width = Math.max(180, Math.min(420, startW + ev.clientX - startX)) + 'px';
    };
    const onUp = () => {
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function setStatus(state) {
  const badge = document.getElementById('session-status');
  badge.className = 'status-badge ' + state;
  badge.textContent = state === 'running' ? 'Thinking…' : 'Ready';
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
    return d.toLocaleDateString();
  } catch { return ''; }
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function injectAppIcon() {
  const apps = window.ROBOS_BUILTIN_APPS || [];
  const entry = apps.find(a => a.appId === 'claude-console');
  if (entry) {
    const el = document.getElementById('app-logo-icon');
    if (el) el.innerHTML = entry.iconSvg.replace(/width="48"/, 'width="22"').replace(/height="48"/, 'height="22"');
  }
}
