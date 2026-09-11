'use strict';

if (!window.robos) {
  window.robos = {
    getSessions: async () => [
      {
        id: 'session-rabies-101',
        title: 'Vaccination Tracking Feature',
        updatedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        model: 'claude-3-7-sonnet',
        mode: 'agent',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            text: 'Implement rabies vaccination record tracking for Acme Petshop: add the endpoint in the REST client, migrate the PostgreSQL database, deploy to the local Kube cluster, and file the PR for review.',
            timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
            context: ['@workspace:acme-petshop', '@file:src/main/java/PetController.java', '#symbol:PetRecord']
          },
          {
            id: 'msg-2',
            role: 'assistant',
            timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
            model: 'Claude 3.7 Sonnet',
            thinking: "1. Inspect System Topology C4 graph for acme-petshop dependencies.\n2. Identified database node 'petshop-db' (PostgreSQL) and REST service.\n3. Execute DDL migration on PostgreSQL container via Relational DB Manager.\n4. Synthesize Bruno .bru request and execute automated HTTP assertions.\n5. Roll out updated petshop-api-v2 Kubernetes deployment.\n6. Publish PR branch and trigger PR Review Theater with knowledge checks.",
            tools: [
              { name: 'robos_ekgraph_update_node', app: 'System Topology Studio', status: 'completed', result: 'Added vaccination contract & computed blast radius (3 downstream clients)' },
              { name: 'robos_db_execute_sql', app: 'Relational DB Manager', status: 'completed', result: 'ALTER TABLE pets ADD COLUMN rabies_vaccinated BOOLEAN NOT NULL DEFAULT FALSE;' },
              { name: 'robos_rest_send_request', app: 'REST API Client', status: 'completed', result: 'POST /api/v1/pets/101/vaccinations -> 201 Created (14ms)' },
              { name: 'robos_kube_rollout_restart', app: 'Kube Studio', status: 'completed', result: 'Deployment/petshop-api rolled out (1/1 Running)' },
              { name: 'robos_pr_review_theater_open', app: 'PR Review Theater', status: 'completed', result: 'Launched Stage 1 eLearning & Knowledge Check Quiz' }
            ],
            text: "I have completed the full orchestration cascade for rabies vaccination tracking across Acme Petshop:\n\n### 1. Database Migration Applied\nThe PostgreSQL schema has been updated via **Relational DB Manager**:\n```sql\nALTER TABLE pets \nADD COLUMN rabies_vaccinated BOOLEAN NOT NULL DEFAULT FALSE,\nADD COLUMN rabies_vaccination_date TIMESTAMP WITH TIME ZONE;\nCREATE INDEX idx_pets_rabies_status ON pets(rabies_vaccinated);\n```\n\n### 2. REST API Contract & Bruno Test Verified\nSynthesized `.bru` plain-text collection in **REST API Client** and executed against local server:\n```bash\nPOST http://localhost:8080/api/v1/pets/101/vaccinations\nStatus: 201 Created | Time: 14ms | Assertion: res.body.rabies_vaccinated == true [PASS]\n```\n\n### 3. Kubernetes Deployment & Pod Log Streaming\nUpdated manifests applied to **Kube Studio**. The container `petshop-api-v2` is now `1/1 Running` with verified database health checks.\n\n### 4. PR Review Theater Ready\nThe pull request has been opened and the **PR Review Theater** is now active with an anti-rubber-stamp knowledge check quiz and living architecture guide for lead architect sign-off."
          }
        ]
      },
      {
        id: 'session-blast-radius-102',
        title: 'Audit Auth Microservice Blast Radius',
        updatedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
        model: 'openai-o3-mini',
        mode: 'chat',
        messages: []
      }
    ],
    createSession: async (title) => ({ id: 's-' + Date.now(), title, updatedAt: new Date().toISOString(), messages: [] }),
    deleteSession: async () => ({ success: true }),
    getMessages: async () => [],
    sendMessage: async () => ({ success: true }),
    popoutPrompt: async () => ({ success: true }),
    getConnectedTools: async () => [
      { name: 'robos_ekgraph_update_node', app: 'System Topology Studio', description: 'Update entity node in Knowledge Graph' },
      { name: 'robos_db_execute_sql', app: 'Relational DB Manager', description: 'Execute DDL migrations and queries in PostgreSQL' },
      { name: 'robos_rest_send_request', app: 'REST API Client', description: 'Execute Git-backed Bruno (.bru) request' },
      { name: 'robos_kube_rollout_restart', app: 'Kube Studio', description: 'Trigger rolling restart and verify pod readiness' },
      { name: 'robos_pr_review_theater_open', app: 'PR Review Theater', description: 'Open interactive 6-stage review cockpit' }
    ],
    getWorkspaces: async () => [],
    onStreamChunk: () => {},
    onToolEvent: () => {}
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  let sessions = [];
  let currentSessionId = null;
  let activeMode = 'agent';

  // DOM Elements
  const sessionListEl = document.getElementById('session-list');
  const messagesContainerEl = document.getElementById('messages-container');
  const chatInputEl = document.getElementById('chat-input');
  const btnSendEl = document.getElementById('btn-send-message');
  const selectModelEl = document.getElementById('select-model');
  const inputModelTagEl = document.getElementById('input-model-tag');
  const btnNewChatEl = document.getElementById('btn-new-chat');
  const btnPopoutPromptEl = document.getElementById('btn-popout-prompt');
  const btnInputPopoutEl = document.getElementById('btn-input-popout');
  const btnToolsDrawerEl = document.getElementById('btn-tools-drawer');
  const toolsModalEl = document.getElementById('tools-modal');
  const btnCloseToolsEl = document.getElementById('btn-close-tools');
  const toolsListBodyEl = document.getElementById('tools-list-body');

  // Load Sessions
  try {
    sessions = await window.robos.getSessions();
    if (sessions && sessions.length > 0) {
      currentSessionId = sessions[0].id;
      renderSidebar();
      renderCurrentMessages();
    }
  } catch (err) {
    console.error('Failed to load sessions', err);
  }

  // Render Sidebar
  function renderSidebar() {
    sessionListEl.innerHTML = '';
    sessions.forEach(session => {
      const item = document.createElement('div');
      item.className = `session-item ${session.id === currentSessionId ? 'active' : ''}`;
      
      const timeAgo = formatTimeAgo(session.updatedAt);
      item.innerHTML = `
        <div class="session-title">${escapeHtml(session.title)}</div>
        <div class="session-meta">
          <span>${session.messages ? session.messages.length : 0} messages</span>
          <span>${timeAgo}</span>
        </div>
      `;
      item.addEventListener('click', () => {
        currentSessionId = session.id;
        renderSidebar();
        renderCurrentMessages();
      });
      sessionListEl.appendChild(item);
    });
  }

  // Render Messages
  function renderCurrentMessages() {
    messagesContainerEl.innerHTML = '';
    const session = sessions.find(s => s.id === currentSessionId);
    if (!session || !session.messages) return;

    session.messages.forEach(msg => {
      appendMessageToDOM(msg);
    });
    scrollToBottom();
  }

  function appendMessageToDOM(msg) {
    if (msg.role === 'user') {
      const row = document.createElement('div');
      row.className = 'message-row user';
      row.id = msg.id;

      let contextHtml = '';
      if (msg.context && msg.context.length > 0) {
        contextHtml = `<div class="user-context-pills">` +
          msg.context.map(c => `<span class="user-pill">${escapeHtml(c)}</span>`).join('') +
          `</div>`;
      }

      row.innerHTML = `
        <div class="user-bubble">
          <div>${escapeHtml(msg.text)}</div>
          ${contextHtml}
        </div>
      `;
      messagesContainerEl.appendChild(row);
    } else {
      const row = document.createElement('div');
      row.className = 'message-row';
      row.id = msg.id;

      let thinkingHtml = '';
      if (msg.thinking) {
        thinkingHtml = `
          <details class="thought-box" open>
            <summary>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              Thinking Process (${msg.model || 'Agent'})
            </summary>
            <div class="thought-content">${escapeHtml(msg.thinking)}</div>
          </details>
        `;
      }

      let toolsHtml = '';
      if (msg.tools && msg.tools.length > 0) {
        toolsHtml = `<div class="tool-cards">` +
          msg.tools.map(t => `
            <div class="tool-card">
              <div class="tool-info">
                <span class="tool-app-badge">${escapeHtml(t.app || 'RobOS App')}</span>
                <span class="tool-name">${escapeHtml(t.name)}</span>
                <span class="tool-result">${escapeHtml(t.result || '')}</span>
              </div>
              <span class="tool-status">✓ completed</span>
            </div>
          `).join('') +
          `</div>`;
      }

      const formattedMarkdown = renderBasicMarkdown(msg.text || '');

      row.innerHTML = `
        <div class="agent-row">
          <div class="agent-avatar">🤖</div>
          <div class="agent-body">
            <div class="agent-meta">
              <span class="agent-name">RobOS Agent</span>
              <span class="agent-model-tag">${escapeHtml(msg.model || 'Claude 3.7 Sonnet')}</span>
            </div>
            ${thinkingHtml}
            ${toolsHtml}
            <div class="markdown-body">${formattedMarkdown}</div>
          </div>
        </div>
      `;
      messagesContainerEl.appendChild(row);
    }
  }

  // Basic Markdown Renderer with Code Blocks
  function renderBasicMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);

    // Code blocks ```lang ... ```
    html = html.replace(/```([a-zA-Z0-9_\-]+)?\n([\s\S]*?)```/g, (_match, lang, code) => {
      const language = lang || 'text';
      return `
        <div class="code-block-wrapper">
          <div class="code-block-header">
            <span>${language}</span>
            <div class="code-block-actions">
              <button class="btn-code-action" onclick="navigator.clipboard.writeText(this.closest('.code-block-wrapper').querySelector('pre').innerText)">Copy</button>
              <button class="btn-code-action">Insert</button>
            </div>
          </div>
          <pre><code>${code}</code></pre>
        </div>
      `;
    });

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code style="background:#161b22;padding:2px 6px;border-radius:4px;font-family:var(--font-mono);font-size:11.5px;color:#38bdf8;">$1</code>');

    // Line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    return html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTimeAgo(dateStr) {
    if (!dateStr) return 'Just now';
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function scrollToBottom() {
    messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
  }

  // Send Message Logic
  async function sendMessage() {
    const text = chatInputEl.value.trim();
    if (!text) return;

    chatInputEl.value = '';
    chatInputEl.style.height = 'auto';

    const selectedModel = selectModelEl.options[selectModelEl.selectedIndex].text;
    const activeSession = sessions.find(s => s.id === currentSessionId);
    if (!activeSession) return;

    // Send payload to main
    try {
      await window.robos.sendMessage({
        sessionId: currentSessionId,
        message: text,
        model: selectedModel,
        mode: activeMode,
        context: ['@workspace:acme-petshop', '@file:PetController.java']
      });

      // Reload sessions
      sessions = await window.robos.getSessions();
      renderSidebar();
      renderCurrentMessages();
    } catch (err) {
      console.error('Failed to send message', err);
    }
  }

  // Stream Listeners
  window.robos.onStreamChunk((data) => {
    if (data.sessionId === currentSessionId) {
      const session = sessions.find(s => s.id === currentSessionId);
      if (session) {
        const msg = session.messages.find(m => m.id === data.messageId);
        if (msg) {
          if (data.thinking !== undefined) msg.thinking = data.thinking;
          if (data.text !== undefined) msg.text = data.text;
          renderCurrentMessages();
        }
      }
    }
  });

  window.robos.onToolEvent((data) => {
    if (data.sessionId === currentSessionId) {
      const session = sessions.find(s => s.id === currentSessionId);
      if (session) {
        const msg = session.messages.find(m => m.id === data.messageId);
        if (msg && data.tools) {
          msg.tools = data.tools;
          renderCurrentMessages();
        }
      }
    }
  });

  // Event Listeners
  btnSendEl.addEventListener('click', sendMessage);
  chatInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Model select
  selectModelEl.addEventListener('change', () => {
    inputModelTagEl.textContent = selectModelEl.options[selectModelEl.selectedIndex].text.split(' (')[0];
  });

  // Mode buttons
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMode = btn.getAttribute('data-mode');
    });
  });

  // Quick chips
  document.querySelectorAll('.chip-action').forEach(chip => {
    chip.addEventListener('click', () => {
      const cmd = chip.getAttribute('data-cmd');
      chatInputEl.value = cmd + ' ' + chatInputEl.value;
      chatInputEl.focus();
    });
  });

  // Pop out prompt
  btnPopoutPromptEl.addEventListener('click', () => {
    window.robos.popoutPrompt(chatInputEl.value.trim());
  });

  btnInputPopoutEl.addEventListener('click', () => {
    window.robos.popoutPrompt(chatInputEl.value.trim());
  });

  // New Chat
  btnNewChatEl.addEventListener('click', async () => {
    const newSession = await window.robos.createSession('New Agent Chat');
    sessions.unshift(newSession);
    currentSessionId = newSession.id;
    renderSidebar();
    renderCurrentMessages();
  });

  // MCP Tools Drawer
  btnToolsDrawerEl.addEventListener('click', async () => {
    const tools = await window.robos.getConnectedTools();
    toolsListBodyEl.innerHTML = tools.map(t => `
      <div class="tool-card">
        <div class="tool-info">
          <span class="tool-app-badge">${escapeHtml(t.app)}</span>
          <span class="tool-name">${escapeHtml(t.name)}</span>
        </div>
        <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(t.description)}</div>
      </div>
    `).join('');
    toolsModalEl.classList.remove('hidden');
  });

  btnCloseToolsEl.addEventListener('click', () => {
    toolsModalEl.classList.add('hidden');
  });
});
