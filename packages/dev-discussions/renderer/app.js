'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let appData = null;
let activeWorkspaceId = 'acme-sdlc';
let activeThreadId = 'thread-pet-101';
let currentFilter = 'all';
let searchQuery = '';

// ── DOM References ─────────────────────────────────────────────────────────
const channelsTreeEl     = document.getElementById('channels-tree');
const messagesContainerEl = document.getElementById('messages-container');
const channelSearchInput  = document.getElementById('channel-search');
const filterPills         = document.querySelectorAll('.filter-pill');
const guildIcons          = document.querySelectorAll('.guild-icon[data-workspace]');
const threadTitleEl       = document.getElementById('thread-title');
const threadBreadcrumbsEl = document.getElementById('thread-breadcrumbs');
const threadStatusEl      = document.getElementById('thread-status');
const threadSourceEl      = document.getElementById('thread-source');
const threadHeaderIconEl  = document.getElementById('thread-header-icon');
const cacheMetricsTextEl  = document.getElementById('cache-metrics-text');
const rateLimitPillEl     = document.getElementById('rate-limit-pill');
const composerTextareaEl  = document.getElementById('composer-textarea');
const btnSend             = document.getElementById('btn-send');
const btnSyncThread       = document.getElementById('btn-sync-thread');
const btnOpenRemote       = document.getElementById('btn-open-remote');
const btnExportKGraph     = document.getElementById('btn-export-thread-kgraph');
const btnExportAllKGraph  = document.getElementById('btn-export-kgraph');
const btnRefreshAll       = document.getElementById('btn-refresh-all');
const fileUploaderEl      = document.getElementById('file-uploader');

// ── Toast Notifications ────────────────────────────────────────────────────
function showToast(message, duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

// ── Markdown Parser (Lightweight Zero-Dependency) ───────────────────────────
function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);

  // Fenced Code blocks
  html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold & Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3 style="font-size:13px;font-weight:700;margin:6px 0;color:#00bcd4;">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 style="font-size:14px;font-weight:700;margin:8px 0;color:#00bcd4;">$1</h2>');

  // Blockquotes
  html = html.replace(/^> (.*$)/gim, '<blockquote style="border-left:3px solid #00bcd4;padding-left:10px;margin:6px 0;color:#94a3b8;">$1</blockquote>');

  // Bullet Lists
  html = html.replace(/^\- (.*$)/gim, '<li style="margin-left:18px;list-style-type:disc;">$1</li>');

  // Paragraphs
  html = html.split('\n\n').map(p => {
    if (p.startsWith('<pre>') || p.startsWith('<h') || p.startsWith('<li>') || p.startsWith('<blockquote')) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return html;
}

// ── Diff Hunk Formatter ────────────────────────────────────────────────────
function renderDiffHunk(diffHunk) {
  if (!diffHunk) return '';
  const lines = diffHunk.split('\n');
  const renderedLines = lines.map(line => {
    let cls = '';
    if (line.startsWith('+')) cls = 'add';
    else if (line.startsWith('-')) cls = 'del';
    else if (line.startsWith('@')) cls = 'meta';
    return `<div class="diff-line ${cls}">${escapeHtml(line)}</div>`;
  }).join('');
  return `<div class="diff-body">${renderedLines}</div>`;
}

// ── Hierarchy Resolution ───────────────────────────────────────────────────
function findActiveThread() {
  if (!appData || !appData.projects) return null;
  for (const proj of appData.projects) {
    for (const feat of proj.features || []) {
      for (const item of feat.items || []) {
        if (item.id === activeThreadId) {
          return { item, feature: feat, project: proj };
        }
      }
    }
  }
  return null;
}

// ── Channel Tree Rendering ─────────────────────────────────────────────────
function renderChannelTree() {
  if (!appData || !appData.projects) {
    channelsTreeEl.innerHTML = '<div style="padding:16px;color:#64748b;">No projects found</div>';
    return;
  }

  const filteredProjects = appData.projects.filter(p => p.workspaceId === activeWorkspaceId);
  let treeHtml = '';

  for (const proj of filteredProjects) {
    const featureGroups = proj.features || [];
    let projHtml = '';

    for (const feat of featureGroups) {
      const items = (feat.items || []).filter(item => {
        // Filter by pill
        if (currentFilter !== 'all' && item.type !== currentFilter) return false;
        // Filter by search
        if (searchQuery) {
          const matchTitle = item.title.toLowerCase().includes(searchQuery);
          const matchNum = (item.number || '').toLowerCase().includes(searchQuery);
          return matchTitle || matchNum;
        }
        return true;
      });

      if (items.length === 0 && searchQuery) continue;

      let itemsHtml = '';
      for (const item of items) {
        const isActive = item.id === activeThreadId;
        const icon = item.type === 'pull-request' ? '🔀' : '📋';
        const commentCount = (item.comments || []).length;

        itemsHtml += `
          <div class="channel-item ${isActive ? 'active' : ''}" data-thread-id="${item.id}">
            <div class="channel-name-wrap">
              <span class="channel-icon">${icon}</span>
              <span class="channel-title-text" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
            </div>
            <span class="channel-badge">${commentCount}</span>
          </div>
        `;
      }

      projHtml += `
        <div class="feature-group">
          <div class="feature-header">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 9 12 15 18 9"/></svg>
            <span>${escapeHtml(feat.name)}</span>
          </div>
          <div class="feature-channels">
            ${itemsHtml || '<div style="padding:4px 20px;font-size:11px;color:#64748b;">No matching threads</div>'}
          </div>
        </div>
      `;
    }

    treeHtml += `
      <div class="project-group">
        <div class="project-header">
          <span style="font-size:14px;">${proj.icon || '📁'}</span>
          <span>${escapeHtml(proj.name)}</span>
        </div>
        ${projHtml}
      </div>
    `;
  }

  channelsTreeEl.innerHTML = treeHtml || '<div style="padding:16px;color:#64748b;">No matching channels</div>';

  // Attach click listeners to channel items
  channelsTreeEl.querySelectorAll('.channel-item').forEach(el => {
    el.addEventListener('click', () => {
      const threadId = el.getAttribute('data-thread-id');
      if (threadId) {
        activeThreadId = threadId;
        renderChannelTree();
        renderActiveThread();
      }
    });
  });
}

// ── Active Thread Rendering ────────────────────────────────────────────────
function renderActiveThread() {
  const context = findActiveThread();
  if (!context) {
    threadTitleEl.textContent = 'Select a Discussion Thread';
    threadBreadcrumbsEl.textContent = '';
    messagesContainerEl.innerHTML = '<div style="text-align:center;padding:60px;color:#64748b;">Select a project, feature, or pull request on the left to join the conversation.</div>';
    return;
  }

  const { item, feature, project } = context;

  // Update Header
  threadTitleEl.textContent = item.title;
  threadBreadcrumbsEl.textContent = `${project.name} / ${feature.name} / #${item.number}`;
  threadStatusEl.textContent = (item.status || 'OPEN').toUpperCase();
  threadStatusEl.className = `status-pill ${(item.status || 'open').toLowerCase()}`;
  threadSourceEl.textContent = item.sourceServer === 'jira' ? 'Jira Issue' : (item.type === 'pull-request' ? 'GitHub PR' : 'GitHub Issue');

  threadHeaderIconEl.innerHTML = item.type === 'pull-request'
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>'
    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  // Update Messages
  const comments = item.comments || [];
  if (comments.length === 0) {
    messagesContainerEl.innerHTML = '<div style="text-align:center;padding:60px;color:#64748b;">No comments yet in this thread. Start the discussion below!</div>';
    return;
  }

  let messagesHtml = '';
  for (const c of comments) {
    const isReview = !!c.isReviewComment;
    const author = c.author || { name: 'Anonymous', role: 'Developer', avatar: '👤', isAgent: false };
    const roleBadgeClass = author.isAgent ? 'agent' : (author.role.includes('Architect') ? 'architect' : (author.role.includes('Security') ? 'security' : 'engineer'));
    const timeStr = formatTimestamp(c.createdAt);

    // Review comment diff hunk
    let diffCardHtml = '';
    if (isReview && c.diffHunk) {
      const isResolved = !!c.resolved;
      diffCardHtml = `
        <div class="diff-hunk-card">
          <div class="diff-header">
            <span class="diff-file">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              ${escapeHtml(c.filePath || 'code diff')}:${c.lineNumber || 1}
            </span>
            <button class="diff-resolved-toggle ${isResolved ? 'resolved' : ''}" data-comment-id="${c.id}">
              ${isResolved ? '✓ Resolved' : 'Mark as resolved'}
            </button>
          </div>
          ${renderDiffHunk(c.diffHunk)}
        </div>
      `;
    }

    // Attachments
    let attachmentsHtml = '';
    if (c.attachments && c.attachments.length > 0) {
      for (const att of c.attachments) {
        const isVideo = att.mimeType && att.mimeType.includes('video');
        const icon = isVideo ? '🎥' : (att.mimeType && att.mimeType.includes('pdf') ? '📄' : '📎');
        const sizeStr = formatFileSize(att.fileSize);
        attachmentsHtml += `
          <div class="attachment-card" data-url="${escapeHtml(att.fileUrl)}">
            <span class="att-icon">${icon}</span>
            <div class="att-meta">
              <span class="att-title">${escapeHtml(att.title)}</span>
              <span class="att-size">${sizeStr} &bull; ${escapeHtml(att.mimeType || 'file')}</span>
            </div>
          </div>
        `;
      }
    }

    // Reactions
    let reactionsHtml = '';
    const reactions = c.reactions || {};
    for (const [emoji, count] of Object.entries(reactions)) {
      if (count > 0) {
        reactionsHtml += `<button class="reaction-pill" data-comment-id="${c.id}" data-emoji="${emoji}">${emoji} ${count}</button>`;
      }
    }
    reactionsHtml += `
      <button class="reaction-add-btn" data-comment-id="${c.id}" data-emoji="👍" title="React 👍">+👍</button>
      <button class="reaction-add-btn" data-comment-id="${c.id}" data-emoji="🚀" title="React 🚀">+🚀</button>
      <button class="reaction-add-btn" data-comment-id="${c.id}" data-emoji="💡" title="React 💡">+💡</button>
    `;

    messagesHtml += `
      <article class="message-card ${isReview ? 'is-review' : ''}">
        <div class="message-avatar">${author.avatar || '👤'}</div>
        <div class="message-body">
          <header class="message-header">
            <span class="message-author">${escapeHtml(author.name)}</span>
            <span class="role-badge ${roleBadgeClass}">${escapeHtml(author.role || 'Member')}</span>
            <time class="message-time" title="${escapeHtml(c.createdAt)}">${timeStr}</time>
          </header>
          ${diffCardHtml}
          <div class="message-content">
            ${parseMarkdown(c.content)}
          </div>
          ${attachmentsHtml}
          <footer class="reactions-bar">
            ${reactionsHtml}
          </footer>
        </div>
      </article>
    `;
  }

  messagesContainerEl.innerHTML = messagesHtml;
  messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;

  // Attach event handlers for resolved toggle & reactions
  messagesContainerEl.querySelectorAll('.diff-resolved-toggle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const commentId = btn.getAttribute('data-comment-id');
      if (window.robosDevDiscussions) {
        const res = await window.robosDevDiscussions.toggleResolved({ threadId: item.id, commentId });
        if (res && res.ok) {
          loadDiscussions();
          showToast(res.resolved ? 'Code conversation marked resolved' : 'Conversation reopened');
        }
      }
    });
  });

  messagesContainerEl.querySelectorAll('.reaction-pill, .reaction-add-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const commentId = btn.getAttribute('data-comment-id');
      const emoji = btn.getAttribute('data-emoji');
      if (window.robosDevDiscussions && commentId && emoji) {
        const res = await window.robosDevDiscussions.addReaction({ threadId: item.id, commentId, emoji });
        if (res && res.ok) {
          loadDiscussions();
        }
      }
    });
  });

  messagesContainerEl.querySelectorAll('.attachment-card').forEach(card => {
    card.addEventListener('click', () => {
      const url = card.getAttribute('data-url');
      if (url && window.robosDevDiscussions) {
        window.robosDevDiscussions.openExternal(url);
      }
    });
  });
}

// ── Formatting Utilities ───────────────────────────────────────────────────
function formatTimestamp(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now - d;
  if (diffMs < 60000) return 'Just now';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ── Sending Messages ───────────────────────────────────────────────────────
async function sendMessage() {
  const content = composerTextareaEl.value.trim();
  if (!content) return;

  const context = findActiveThread();
  if (!context) {
    showToast('Select a thread first');
    return;
  }

  const postTarget = document.querySelector('input[name="post-target"]:checked').value;
  const postUpstream = postTarget === 'upstream';
  const isReviewComment = context.item.type === 'pull-request';

  composerTextareaEl.disabled = true;
  btnSend.disabled = true;

  try {
    if (window.robosDevDiscussions) {
      const res = await window.robosDevDiscussions.postComment({
        threadId: context.item.id,
        content,
        isReviewComment,
        filePath: isReviewComment ? 'controllers/vet.js' : null,
        lineNumber: isReviewComment ? 50 : null,
        postUpstream,
      });

      if (res && res.ok) {
        composerTextareaEl.value = '';
        await loadDiscussions();
        showToast(postUpstream ? 'Message posted and synced upstream to GitHub!' : 'Message saved to local cache & KGraph');
      } else {
        showToast('Error sending message: ' + (res.error || 'Unknown'));
      }
    }
  } catch (err) {
    showToast('Failed to send message: ' + err.message);
  } finally {
    composerTextareaEl.disabled = false;
    btnSend.disabled = false;
    composerTextareaEl.focus();
  }
}

// ── Load & Refresh Discussions ─────────────────────────────────────────────
async function loadDiscussions() {
  try {
    if (window.robosDevDiscussions) {
      appData = await window.robosDevDiscussions.getDiscussions();
      renderChannelTree();
      renderActiveThread();
      updateRateLimitBudget();
    }
  } catch (err) {
    console.error('Failed to load discussions:', err);
  }
}

async function updateRateLimitBudget() {
  if (appData && appData.rateLimitBudget) {
    const budget = appData.rateLimitBudget;
    rateLimitPillEl.textContent = `GitHub Budget: ${budget.remaining.toLocaleString()} / ${budget.limit.toLocaleString()}`;
  }
}

// ── Composer Toolbar Actions ───────────────────────────────────────────────
function insertFormatting(prefix, suffix = '') {
  const textarea = composerTextareaEl;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selection = text.substring(start, end);
  textarea.value = text.substring(0, start) + prefix + selection + suffix + text.substring(end);
  textarea.focus();
  textarea.selectionStart = start + prefix.length;
  textarea.selectionEnd = start + prefix.length + selection.length;
}

// ── Event Setup ────────────────────────────────────────────────────────────
function setupEvents() {
  // Search input
  channelSearchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderChannelTree();
  });

  // Filter pills
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.getAttribute('data-filter');
      renderChannelTree();
    });
  });

  // Guild workspace rail
  guildIcons.forEach(icon => {
    icon.addEventListener('click', () => {
      guildIcons.forEach(i => i.classList.remove('active'));
      icon.classList.add('active');
      activeWorkspaceId = icon.getAttribute('data-workspace');
      document.getElementById('ws-name').textContent = activeWorkspaceId === 'acme-sdlc' ? 'Acme Enterprise SDLC' : 'RobOS Platform Core';
      renderChannelTree();
      // Select first channel in new workspace
      const context = findActiveThread();
      if (!context || context.project.workspaceId !== activeWorkspaceId) {
        const firstProj = (appData.projects || []).find(p => p.workspaceId === activeWorkspaceId);
        if (firstProj && firstProj.features && firstProj.features[0] && firstProj.features[0].items && firstProj.features[0].items[0]) {
          activeThreadId = firstProj.features[0].items[0].id;
        }
      }
      renderActiveThread();
    });
  });

  // Send message
  btnSend.addEventListener('click', sendMessage);
  composerTextareaEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Toolbar buttons
  document.querySelectorAll('.composer-toolbar .tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      if (action === 'bold') insertFormatting('**', '**');
      else if (action === 'italic') insertFormatting('*', '*');
      else if (action === 'code') insertFormatting('`', '`');
      else if (action === 'codeblock') insertFormatting('```\n', '\n```');
      else if (action === 'diff') insertFormatting('```diff\n@@ -1,3 +1,5 @@\n+ ', '\n```');
      else if (action === 'quote') insertFormatting('> ');
    });
  });

  // File uploader simulation
  fileUploaderEl.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const context = findActiveThread();
    if (!context) return;

    const attachment = {
      title: file.name,
      fileUrl: `file:///home/robos/uploads/${encodeURIComponent(file.name)}`,
      fileSize: file.size || 1048576,
      mimeType: file.type || 'application/octet-stream',
    };

    const firstComment = (context.item.comments || [])[0];
    if (firstComment && window.robosDevDiscussions) {
      await window.robosDevDiscussions.addAttachment({
        threadId: context.item.id,
        commentId: firstComment.id,
        attachment
      });
      await loadDiscussions();
      showToast(`Attached ${file.name}`);
    }
  });

  // Header Actions
  btnSyncThread.addEventListener('click', async () => {
    const context = findActiveThread();
    if (!context) return;
    btnSyncThread.disabled = true;
    showToast('Checking remote for latest review comments...');
    if (window.robosDevDiscussions) {
      const res = await window.robosDevDiscussions.syncRemote({
        repo: context.project.slug,
        number: context.item.number,
        type: context.item.type
      });
      btnSyncThread.disabled = false;
      showToast(res.synced ? 'Remote review comments synced!' : 'Fast cache is current • 0 API requests spent');
      loadDiscussions();
    }
  });

  btnOpenRemote.addEventListener('click', () => {
    const context = findActiveThread();
    if (context && context.item.url && window.robosDevDiscussions) {
      window.robosDevDiscussions.openExternal(context.item.url);
    }
  });

  // Export Thread to KGraph
  btnExportKGraph.addEventListener('click', async () => {
    btnExportKGraph.disabled = true;
    if (window.robosDevDiscussions) {
      const res = await window.robosDevDiscussions.exportToKGraph();
      btnExportKGraph.disabled = false;
      if (res && res.ok) {
        showToast(`✓ Exported ${res.nodesExported} discussion nodes to Knowledge Graph!`);
      } else {
        showToast('Export failed: ' + (res.error || 'Unknown'));
      }
    }
  });

  // Export All to KGraph (Guild Rail)
  btnExportAllKGraph.addEventListener('click', async () => {
    if (window.robosDevDiscussions) {
      const res = await window.robosDevDiscussions.exportToKGraph();
      if (res && res.ok) {
        showToast(`✓ SDLC Knowledge Graph updated with all discussion threads & review comments!`);
      }
    }
  });

  // Refresh All
  btnRefreshAll.addEventListener('click', async () => {
    showToast('Refreshing cached threads & rate limit telemetry...');
    await loadDiscussions();
  });

  // Cache Diagnostics Info
  document.getElementById('btn-cache-info').addEventListener('click', () => {
    showToast('RobOS Smart Cache: 0ms reads • Local journal active • Rate limit budget: 4,892 calls');
  });
}

// ── Initialize App ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  setupEvents();
  await loadDiscussions();
});
