'use strict';

let packageData = null;
let activePackageId = 'forms-api';
let searchQuery = '';
let healthReport = null;

async function init() {
  if (window.packageManager) {
    packageData = await window.packageManager.getPackages();
  } else {
    packageData = {
      activeBranch: 'main',
      packages: [
        {
          id: 'forms-api',
          name: 'Forms API Microservice',
          type: 'app',
          runtime: 'Node.js 20.12.0 (Mise)',
          devcontainer: '.devcontainer/devcontainer.json',
          port: 3000,
          healthEndpoint: 'http://localhost:3000/healthz',
          status: 'running',
          pid: 18490,
          cpu: '0.4%',
          memory: '142 MB',
          description: 'Dynamic forms backend microservice with OpenAPI 3.1 & PostgreSQL ORM',
          logs: '[forms-api] INFO: Devcontainer runtime initialized (Node 20.12.0)\n[forms-api] INFO: HTTP server listening on http://0.0.0.0:3000',
        },
      ],
    };
  }

  renderStats();
  renderPackagesList();
  renderWorkspace();
}

function renderStats() {
  document.getElementById('stat-packages-count').textContent = `${packageData.packages.length} Packages & Daemons`;
  document.getElementById('packages-count-badge').textContent = `${packageData.packages.length} Items`;

  const runningCount = packageData.packages.filter(p => p.status === 'running').length;
  document.getElementById('stat-running-status').textContent = `${runningCount}/${packageData.packages.length} Services Running`;
}

function renderPackagesList() {
  const container = document.getElementById('packages-list');
  const filtered = packageData.packages.filter(p => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
  });

  container.innerHTML = filtered.map(pkg => {
    const isSelected = pkg.id === activePackageId;
    const safeDomId = 'pkg-item-' + pkg.id.replace(/[^a-zA-Z0-9_-]/g, '_');

    return `
      <div class="pkg-item ${isSelected ? 'active' : ''}" id="${safeDomId}" onclick="window.selectPackage('${pkg.id}')">
        <div>
          <div class="pkg-title">${pkg.id}</div>
          <div style="font-size: 10px; color: var(--text-muted);">${pkg.name}</div>
        </div>
        <span class="type-badge type-${pkg.type}">${pkg.type}</span>
      </div>
    `;
  }).join('');
}

function renderWorkspace() {
  const container = document.getElementById('package-workspace');
  const pkg = packageData.packages.find(p => p.id === activePackageId) || packageData.packages[0];
  if (!pkg) return;

  const statusBadge = document.getElementById('package-status-badge');
  if (statusBadge) {
    statusBadge.textContent = pkg.status === 'running' ? `🟢 Running (PID ${pkg.pid || 18490})` : '🔴 Stopped';
    statusBadge.style.color = pkg.status === 'running' ? 'var(--success)' : 'var(--danger)';
  }

  container.innerHTML = `
    <!-- Top Package Overview -->
    <div class="info-card" id="package-header-card">
      <div class="card-title">
        <span>📦 <strong>${pkg.id}</strong> (${pkg.name})</span>
        <span class="type-badge type-${pkg.type}">${pkg.status.toUpperCase()}</span>
      </div>
      <div style="font-size: 11px; color: var(--text-muted);">${pkg.description}</div>
      <div style="font-size: 10px; margin-top: 4px;">
        <strong>Port:</strong> <code>${pkg.port}</code> &middot; <strong>Memory:</strong> <code>${pkg.memory || '120 MB'}</code> &middot; <strong>CPU:</strong> <code>${pkg.cpu || '0.2%'}</code>
      </div>
    </div>

    <!-- Devcontainer & Runtime Environment Card -->
    <div class="info-card" id="devcontainer-card">
      <div class="card-title">
        <span>🐳 Devcontainer & Mise Tool Versions</span>
        <span class="status-tag-pass">100% Isolated OCI Container</span>
      </div>
      <div style="font-size: 10px; margin-top: 2px;">
        <strong>Container Spec:</strong> <code>${pkg.devcontainer}</code><br/>
        <strong>Runtime Engine:</strong> <code>${pkg.runtime}</code><br/>
        <strong>Health Probe:</strong> <code>${pkg.healthEndpoint}</code>
      </div>
    </div>

    <!-- Process Lifecycle Controls Bar -->
    <div class="controls-bar" id="controls-bar">
      <button class="btn btn-primary" id="btn-start-service" onclick="window.startService()">▶ Start Service</button>
      <button class="btn btn-secondary" id="btn-restart-service" onclick="window.restartService()">🔄 Restart</button>
      <button class="btn btn-secondary" id="btn-stop-service" onclick="window.stopService()">⏹ Stop</button>
      <button class="btn btn-secondary" id="btn-run-health-check" onclick="window.probeHealth()">💓 Probe Healthz</button>
      ${healthReport ? `<span style="font-size: 10px; color: var(--success); font-weight: 700; margin-left: auto;" id="health-report-text">🟢 ${healthReport}</span>` : ''}
    </div>

    <!-- Live Process Log Streamer -->
    <div style="margin-top: 4px;">
      <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">
        Devcontainer Process Stdout/Stderr Log Stream:
      </div>
      <pre class="logs-pre" id="package-logs-pre">${pkg.logs || '# No process logs'}</pre>
    </div>
  `;
}

window.selectPackage = function(id) {
  activePackageId = id;
  healthReport = null;
  renderStats();
  renderPackagesList();
  renderWorkspace();
};

window.switchGitBranch = async function(branchName) {
  if (window.packageManager) {
    const res = await window.packageManager.switchBranch(branchName);
    if (res.ok) {
      const commitEl = document.getElementById('git-commit-badge');
      if (commitEl) {
        commitEl.textContent = `commit: ${res.branchInfo.commit} (${res.branchInfo.clean ? 'clean' : 'delta'})`;
        commitEl.style.color = res.branchInfo.clean ? 'var(--text-muted)' : 'var(--accent)';
      }
      renderWorkspace();
      return res;
    }
  } else {
    const commitEl = document.getElementById('git-commit-badge');
    if (commitEl) {
      commitEl.textContent = `commit: ${branchName === 'main' ? '8f9a2b1 (clean)' : 'd4e5f6a (delta)'}`;
    }
    renderWorkspace();
    return { ok: true, activeBranch: branchName };
  }
};

window.startService = async function() {
  if (window.packageManager) {
    const res = await window.packageManager.startService(activePackageId);
    if (res.ok) {
      renderStats();
      renderWorkspace();
      return res;
    }
  } else {
    const pkg = packageData.packages.find(p => p.id === activePackageId);
    if (pkg) {
      pkg.status = 'running';
      pkg.logs += `\n[${pkg.id}] INFO: Started service successfully inside Devcontainer`;
      renderStats();
      renderWorkspace();
      return { ok: true, package: pkg };
    }
  }
};

window.stopService = async function() {
  if (window.packageManager) {
    const res = await window.packageManager.stopService(activePackageId);
    if (res.ok) {
      renderStats();
      renderWorkspace();
      return res;
    }
  } else {
    const pkg = packageData.packages.find(p => p.id === activePackageId);
    if (pkg) {
      pkg.status = 'stopped';
      pkg.logs += `\n[${pkg.id}] WARN: Service stopped`;
      renderStats();
      renderWorkspace();
      return { ok: true, package: pkg };
    }
  }
};

window.restartService = async function() {
  await window.stopService();
  await new Promise(r => setTimeout(r, 200));
  return await window.startService();
};

window.probeHealth = async function() {
  if (window.packageManager) {
    const res = await window.packageManager.probeHealth(activePackageId);
    if (res.ok) {
      healthReport = res.statusText;
      renderWorkspace();
      return res;
    }
  } else {
    healthReport = '200 OK (Healthy in 14ms)';
    renderWorkspace();
    return { ok: true, statusCode: 200 };
  }
};

window.rebuildAll = function() {
  alert('Rebuilding all Devcontainers via @devcontainers/cli');
};

window.startAll = function() {
  alert('Starting all microservices and background daemons');
};

const searchInput = document.getElementById('pkg-search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value || '';
    renderPackagesList();
  });
}

init();
