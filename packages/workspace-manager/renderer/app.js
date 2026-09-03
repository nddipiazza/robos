'use strict';

let projectData = null;
let activeProjectId = 'buildbarn-platform';
let searchQuery = '';
let syncBannerMsg = null;
let ideModalOpen = false;

async function init() {
  if (window.api && window.api.getProjects) {
    projectData = await window.api.getProjects();
  } else {
    projectData = {
      activeBranch: 'main',
      projects: [
        {
          id: 'buildbarn-platform',
          name: 'BuildBarn Platform Meta-Project',
          description: 'Multi-repo distributed architecture encompassing Web Client, Forms API, and Protocol Buffers',
          reposCount: 3,
          taskId: 'TASK-102-order-sync',
          repos: [
            { id: 'buildbarn-web', name: 'React Web Portal', path: 'packages/buildbarn-web', branch: 'feat/order-sync', devServer: 'http://localhost:5173' },
            { id: 'forms-api', name: 'Forms API Microservice', path: 'packages/forms-api', branch: 'feat/order-sync', devServer: 'http://localhost:3000' },
            { id: 'common-proto', name: 'Common Protobuf Definitions', path: 'specs/proto', branch: 'feat/order-sync', devServer: 'N/A (Schema Library)' },
          ],
        },
        {
          id: 'analytics-pipeline',
          name: 'Real-Time Analytics & Ingestion',
          description: 'Distributed event ingestion connecting Apache Kafka topic streams to ClickHouse OLAP storage',
          reposCount: 2,
          taskId: 'TASK-204-clickhouse-migration',
          repos: [
            { id: 'kafka-pipeline', name: 'Kafka Stream Processor', path: 'services/kafka-pipe', branch: 'feat/clickhouse-sink', devServer: 'tcp://localhost:9092' },
            { id: 'clickhouse-sink', name: 'ClickHouse Columnar Store', path: 'infra/clickhouse', branch: 'feat/clickhouse-sink', devServer: 'http://localhost:8123' },
          ],
        },
        {
          id: 'identity-suite',
          name: 'Enterprise IAM & Directory Sync',
          description: 'OAuth2/OIDC token bridge with SCIM 2.0 active directory synchronization',
          reposCount: 2,
          taskId: 'TASK-315-scim-connector',
          repos: [
            { id: 'auth0-broker', name: 'Auth0 / OIDC Identity Broker', path: 'services/auth-broker', branch: 'feat/scim-sync', devServer: 'http://localhost:4000' },
            { id: 'directory-sync', name: 'SCIM 2.0 Directory Service', path: 'services/directory-sync', branch: 'feat/scim-sync', devServer: 'http://localhost:4001' },
          ],
        },
      ],
      activeWorkspace: {
        taskId: 'TASK-102-order-sync',
        branch: 'feat/order-sync',
        worktreeRoot: '/home/user/workspaces/TASK-102-order-sync',
        status: 'active',
        repos: [
          { id: 'buildbarn-web', name: 'React Web Portal', path: 'packages/buildbarn-web', branch: 'feat/order-sync', devServer: 'http://localhost:5173' },
          { id: 'forms-api', name: 'Forms API Microservice', path: 'packages/forms-api', branch: 'feat/order-sync', devServer: 'http://localhost:3000' },
          { id: 'common-proto', name: 'Common Protobuf Definitions', path: 'specs/proto', branch: 'feat/order-sync', devServer: 'N/A (Schema Library)' },
        ],
      },
    };
  }

  renderStats();
  renderProjectsList();
  renderWorkspace();
}

function getActiveProject() {
  return projectData.projects.find(p => p.id === activeProjectId) || projectData.projects[0];
}

function renderStats() {
  const proj = getActiveProject();
  document.getElementById('stat-projects-count').textContent = `${projectData.projects.length} Multi-Repo Projects`;
  document.getElementById('projects-count-badge').textContent = `${projectData.projects.length} Projects`;
  document.getElementById('stat-active-ws').textContent = proj.taskId;
  document.getElementById('stat-repos-count').textContent = `${proj.repos.length} Repositories Linked`;
}

function renderProjectsList() {
  const container = document.getElementById('projects-list');
  const filtered = projectData.projects.filter(p => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
  });

  container.innerHTML = filtered.map(proj => {
    const isSelected = proj.id === activeProjectId;
    const safeDomId = 'proj-item-' + proj.id.replace(/[^a-zA-Z0-9_-]/g, '_');

    return `
      <div class="proj-item ${isSelected ? 'active' : ''}" id="${safeDomId}" onclick="window.selectProject('${proj.id}')">
        <div>
          <div class="proj-title">${proj.id}</div>
          <div style="font-size: 10px; color: var(--text-muted);">${proj.name}</div>
        </div>
        <span class="count-badge">${proj.reposCount} repos</span>
      </div>
    `;
  }).join('');
}

function renderWorkspace() {
  const container = document.getElementById('workspace-details');
  const proj = getActiveProject();
  if (!proj) return;

  const ws = projectData.activeWorkspace;
  const statusBadge = document.getElementById('worktree-status-badge');
  if (statusBadge) {
    statusBadge.textContent = ws.status === 'active' ? '🟢 Active Worktree Session' : '⚪ Worktrees Cleaned';
    statusBadge.style.color = ws.status === 'active' ? 'var(--success)' : 'var(--text-muted)';
  }

  const worktreeRoot = `/home/user/workspaces/${proj.taskId}`;

  container.innerHTML = `
    <!-- Top Workspace Overview -->
    <div class="info-card" id="workspace-header-card">
      <div class="card-title">
        <span>🗂️ Active Task Workspace: <strong style="color: var(--accent);">${proj.taskId}</strong></span>
        <span class="branch-tag" id="active-branch-tag">🌿 ${proj.repos[0] ? proj.repos[0].branch : 'main'}</span>
      </div>
      <div style="font-size: 11px; color: var(--text-muted);">${proj.description}</div>
      <div style="font-size: 10px; margin-top: 4px;">
        <strong>Worktree Root:</strong> <code>${worktreeRoot}</code> &middot; <strong>Storage:</strong> <code>0 MB (Zero-Copy .git Links)</code>
      </div>
    </div>

    ${syncBannerMsg ? `
      <div class="sync-banner" id="sync-success-banner">
        ${syncBannerMsg}
      </div>
    ` : ''}

    ${ideModalOpen ? `
      <div class="ide-modal-banner" id="ide-modal-card">
        <div>💻 <strong>IDE Bridge Connected</strong> &middot; Multi-Root Workspace Dispatched to IntelliJ IDEA (Port 63343)</div>
        <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Breakpoints & debug environment synchronized across ${proj.repos.length} repositories.</div>
      </div>
    ` : ''}

    <!-- Coordinated Repositories & Worktree Links -->
    <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-top: 4px;">
      Linked Repositories (Synchronized Git Worktrees):
    </div>

    ${proj.repos.map(r => `
      <div class="repo-card" id="repo-item-${r.id.replace(/[^a-zA-Z0-9_-]/g, '_')}">
        <div>
          <div class="repo-name">${r.name} (<code>${r.id}</code>)</div>
          <div style="font-size: 10px; color: var(--text-muted);">
            Path: <code>${r.path}</code> &middot; Dev Server: <code>${r.devServer}</code>
          </div>
        </div>
        <span class="branch-tag repo-branch-badge">🌿 ${r.branch}</span>
      </div>
    `).join('')}

    <!-- Running Dev Servers & IDE Bridge -->
    <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-top: 8px;">
      Multi-Root IDE Configuration (.code-workspace / IntelliJ Modules):
    </div>

    <pre class="code-pre" id="code-workspace-pre">{
  "folders": [
${proj.repos.map(r => `    { "name": "${r.id}", "path": "${worktreeRoot}/${r.path}" }`).join(',\n')}
  ],
  "settings": {
    "terminal.integrated.cwd": "${worktreeRoot}"
  }
}</pre>
  `;
}

window.selectProject = function(id) {
  activeProjectId = id;
  syncBannerMsg = null;
  ideModalOpen = false;
  renderStats();
  renderProjectsList();
  renderWorkspace();
  showActionToast(`🌐 Selected Project: ${id}`);
};

window.switchGitBranch = async function(branchName) {
  const selectEl = document.getElementById('select-gitops-branch');
  if (selectEl) selectEl.value = branchName;

  const proj = getActiveProject();
  if (proj) {
    proj.repos.forEach(r => { r.branch = branchName; });
  }

  if (window.api && window.api.switchBranch) {
    const res = await window.api.switchBranch(branchName);
    if (res.ok) {
      const commitEl = document.getElementById('git-commit-badge');
      if (commitEl) {
        commitEl.textContent = `commit: ${res.branchInfo.commit} (${res.branchInfo.clean ? 'clean' : 'delta'})`;
        commitEl.style.color = res.branchInfo.clean ? 'var(--text-muted)' : 'var(--accent)';
      }
      showActionToast(`🌿 Switched GitOps Branch to ${branchName} (${res.branchInfo.commit})`);
      renderWorkspace();
      return res;
    }
  } else {
    const commitEl = document.getElementById('git-commit-badge');
    if (commitEl) {
      commitEl.textContent = `commit: ${branchName === 'main' ? '8f9a2b1 (clean)' : 'd4e5f6a (delta)'}`;
      commitEl.style.color = branchName === 'main' ? 'var(--text-muted)' : 'var(--accent)';
    }
    showActionToast(`🌿 Switched GitOps Branch to ${branchName}`);
    renderWorkspace();
    return { ok: true, activeBranch: branchName };
  }
};

window.syncWorktrees = async function() {
  const proj = getActiveProject();
  syncBannerMsg = `⚡ Coordinated Git Worktrees created across ${proj.repos.length} repositories in 180ms!`;
  projectData.activeWorkspace.status = 'active';

  if (window.api && window.api.syncWorktrees) {
    const res = await window.api.syncWorktrees(proj.taskId);
    renderStats();
    renderWorkspace();
    return res;
  } else {
    renderStats();
    renderWorkspace();
    return { ok: true, worktreeCount: proj.repos.length };
  }
};

window.teardownWorkspace = async function() {
  const proj = getActiveProject();
  syncBannerMsg = `🗑️ Worktrees removed for ${proj.taskId} and dev server ports released.`;
  projectData.activeWorkspace.status = 'cleaned';
  ideModalOpen = false;

  if (window.api && window.api.teardownWorktree) {
    const res = await window.api.teardownWorktree(proj.taskId);
    renderWorkspace();
    return res;
  } else {
    renderWorkspace();
    return { ok: true };
  }
};

window.openInIDE = async function() {
  ideModalOpen = true;
  renderWorkspace();
  showActionToast(`💻 Launching Multi-Root Workspace in IntelliJ IDEA...`);
  if (window.api && window.api.openMultiRepoIDE) {
    return await window.api.openMultiRepoIDE('idea');
  } else {
    return { ok: true, ide: 'idea' };
  }
};

function showActionToast(msg) {
  let toast = document.getElementById('action-toast-banner');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'action-toast-banner';
    toast.style.cssText = `
      position: fixed;
      top: 60px;
      right: 20px;
      background: #161b22;
      border: 1.5px solid #00bcd4;
      color: #e6edf3;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      box-shadow: 0 4px 14px rgba(0, 188, 212, 0.4);
      z-index: 99999;
      transition: all 0.3s ease;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => {
    if (toast) toast.style.opacity = '0';
  }, 3000);
}

const searchInput = document.getElementById('ws-search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value || '';
    renderProjectsList();
  });
}

init();
