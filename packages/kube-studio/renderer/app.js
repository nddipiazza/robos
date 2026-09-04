'use strict';

let clusters = [];
let namespaces = [];
let activeCluster = "kind-robos-local";
let activeNamespace = "acme-petshop-local";
let activeTab = "pods";
let currentResources = [];
let kgraphApps = [];
let helmReleases = [];
let argocdApps = [];
let vercelProjects = [];

// DOM elements
const clusterSelect = document.getElementById("cluster-select");
const namespaceSelect = document.getElementById("namespace-select");
const clusterBadge = document.getElementById("cluster-provider-badge");
const btnAddCluster = document.getElementById("btn-add-cluster");
const btnTriggerKGraph = document.getElementById("btn-trigger-kgraph");
const resourceSearch = document.getElementById("resource-search");
const btnRefresh = document.getElementById("btn-refresh");
const tableWrapper = document.getElementById("table-wrapper");
const tableHeaders = document.getElementById("table-headers");
const tableBody = document.getElementById("table-body");
const toolbarStats = document.getElementById("toolbar-stats");
const emptyCard = document.getElementById("empty-namespace-card");
const emptyNsName = document.getElementById("empty-ns-name");
const kgraphAppsContainer = document.getElementById("kgraph-apps-list");
const btnDeployAll = document.getElementById("btn-deploy-all");
const drawerPanel = document.getElementById("drawer-panel");
const drawerTitle = document.getElementById("drawer-title");
const drawerContent = document.getElementById("drawer-content");
const btnDrawerClose = document.getElementById("btn-drawer-close");
const btnDrawerCopy = document.getElementById("btn-drawer-copy");
const copilotResponse = document.getElementById("ai-copilot-response");
const btnCopilotSend = document.getElementById("btn-ai-copilot-send");

// Modal elements
const modalAddCluster = document.getElementById("modal-add-cluster");
const btnModalClose = document.getElementById("btn-modal-close");
const btnModalCancel = document.getElementById("btn-modal-cancel");
const btnModalConnect = document.getElementById("btn-modal-connect");
const modalProviderSelect = document.getElementById("modal-provider-select");
const modalClusterName = document.getElementById("modal-cluster-name");
const modalContextName = document.getElementById("modal-context-name");
const modalTargetNamespace = document.getElementById("modal-target-namespace");

// Task Delivery & PR Review Modal Elements
const btnOpenTaskDelivery = document.getElementById("btn-open-task-delivery");
const modalTaskDelivery = document.getElementById("modal-task-delivery");
const btnTaskModalClose = document.getElementById("btn-task-modal-close");
const tabBtnImplementer = document.getElementById("tab-btn-implementer");
const tabBtnPrReview = document.getElementById("tab-btn-pr-review");
const panelTaskImpl = document.getElementById("panel-task-impl");
const panelPrReview = document.getElementById("panel-pr-review");
const btnProceedToPr = document.getElementById("btn-proceed-to-pr");
const btnApproveAndMerge = document.getElementById("btn-approve-and-merge");

// ── Event Listeners ─────────────────────────────────────────────────────────

clusterSelect.addEventListener("change", (e) => {
  activeCluster = e.target.value;
  updateClusterBadge();
  loadNamespaces();
});

namespaceSelect.addEventListener("change", (e) => {
  activeNamespace = e.target.value;
  refreshActiveView();
});

resourceSearch.addEventListener("input", () => {
  renderResourceTable();
});

btnRefresh.addEventListener("click", () => {
  refreshActiveView();
});

btnAddCluster.addEventListener("click", () => {
  modalAddCluster.classList.remove("hidden");
});

btnModalClose.addEventListener("click", () => {
  modalAddCluster.classList.add("hidden");
});

btnModalCancel.addEventListener("click", () => {
  modalAddCluster.classList.add("hidden");
});

btnModalConnect.addEventListener("click", async () => {
  const provider = modalProviderSelect.value;
  const name = modalClusterName.value.trim() || "Local Kind Cluster";
  const context = modalContextName.value.trim() || "kind-robos-local";
  const targetNs = modalTargetNamespace.value.trim() || "acme-petshop-local";

  const res = await window.api.addCluster({
    id: context,
    name,
    provider,
    region: provider === "local" ? "localhost" : "us-east-1",
    kubecontext: context,
  });

  if (res.ok) {
    modalAddCluster.classList.add("hidden");
    activeCluster = context;
    activeNamespace = targetNs;
    await init();
  }
});

if (btnOpenTaskDelivery) {
  btnOpenTaskDelivery.addEventListener("click", () => {
    modalTaskDelivery.classList.remove("hidden");
    showTaskImplTab();
  });
}

if (btnTaskModalClose) {
  btnTaskModalClose.addEventListener("click", () => {
    modalTaskDelivery.classList.add("hidden");
  });
}

function showTaskImplTab() {
  tabBtnImplementer.classList.add("active");
  tabBtnPrReview.classList.remove("active");
  panelTaskImpl.classList.remove("hidden");
  panelPrReview.classList.add("hidden");
}

function showPrReviewTab() {
  tabBtnImplementer.classList.remove("active");
  tabBtnPrReview.classList.add("active");
  panelTaskImpl.classList.add("hidden");
  panelPrReview.classList.remove("hidden");
}

if (tabBtnImplementer) tabBtnImplementer.addEventListener("click", showTaskImplTab);
if (tabBtnPrReview) tabBtnPrReview.addEventListener("click", showPrReviewTab);
if (btnProceedToPr) btnProceedToPr.addEventListener("click", showPrReviewTab);

if (btnApproveAndMerge) {
  btnApproveAndMerge.addEventListener("click", async () => {
    btnApproveAndMerge.disabled = true;
    btnApproveAndMerge.innerHTML = `<span class="spinner">⏳</span> Merging PR #42 &amp; Reconciling KGraph main...`;

    const res = await window.api.triggerKGraphChange({
      taskKey: "PET-105",
      branch: "main",
      namespace: activeNamespace,
    });

    modalTaskDelivery.classList.add("hidden");
    btnApproveAndMerge.disabled = false;
    btnApproveAndMerge.innerHTML = `✓ Approve &amp; Merge PR to main`;

    if (res.ok) {
      toolbarStats.innerHTML = `<span style="color: var(--green)">⚡ PR #42 Merged to main! ${res.message}</span>`;
      setTimeout(() => {
        loadResources();
      }, 1000);
    }
  });
}

btnTriggerKGraph.addEventListener("click", async () => {
  btnTriggerKGraph.disabled = true;
  btnTriggerKGraph.innerHTML = `<span class="spinner">⏳</span> Reconciling KGraph main change...`;

  const res = await window.api.triggerKGraphChange({
    taskKey: "PET-105",
    branch: "main",
    namespace: activeNamespace,
  });

  if (res.ok) {
    toolbarStats.innerHTML = `<span style="color: var(--green)">${res.message}</span>`;
    setTimeout(() => {
      btnTriggerKGraph.disabled = false;
      btnTriggerKGraph.innerHTML = `⚡ Commit to KGraph main [PET-105]`;
      loadResources();
    }, 1200);
  }
});

btnDeployAll.addEventListener("click", async () => {
  btnDeployAll.disabled = true;
  btnDeployAll.innerHTML = `<span class="spinner">⏳</span> Deploying All KGraph Apps...`;

  for (const app of kgraphApps) {
    const branchInput = document.getElementById(`branch-input-${app.id}`);
    const branch = branchInput ? branchInput.value.trim() : "main";
    await window.api.deployApp({ appId: app.id, branch: branch || "main", namespace: activeNamespace });
  }

  toolbarStats.innerHTML = `<span style="color: var(--green)">✓ All Knowledge Graph applications deployed to '${activeNamespace}'.</span>`;
  setTimeout(() => {
    btnDeployAll.disabled = false;
    btnDeployAll.innerHTML = `Deploy All Applications`;
    loadResources();
  }, 1200);
});

btnDrawerClose.addEventListener("click", () => {
  drawerPanel.classList.add("hidden");
});

btnDrawerCopy.addEventListener("click", () => {
  navigator.clipboard.writeText(drawerContent.textContent);
  btnDrawerCopy.textContent = "Copied!";
  setTimeout(() => { btnDrawerCopy.textContent = "Copy"; }, 1500);
});

btnCopilotSend.addEventListener("click", sendCopilotMessage);

document.querySelectorAll(".chip-btn").forEach(chip => {
  chip.addEventListener("click", () => {
    const prompt = chip.dataset.prompt;
    const inputEl = document.getElementById("ai-copilot-input");
    if (typeof inputEl.setValue === "function") inputEl.setValue(prompt);
    else if (inputEl.value !== undefined) inputEl.value = prompt;
    const ta = inputEl.querySelector("textarea");
    if (ta) ta.value = prompt;
    sendCopilotMessage();
  });
});

// Tab navigation
document.querySelectorAll(".nav-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".view-panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    activeTab = tab.dataset.tab;

    if (activeTab === "helm") {
      document.getElementById("helm-view").classList.add("active");
      loadHelmReleases();
    } else if (activeTab === "argocd") {
      document.getElementById("argocd-view").classList.add("active");
      loadArgoCDApps();
    } else if (activeTab === "vercel") {
      document.getElementById("vercel-view").classList.add("active");
      loadVercelProjects();
    } else {
      document.getElementById("resources-view").classList.add("active");
      loadResources();
    }
  });
});

// ── Initialization ──────────────────────────────────────────────────────────

async function init() {
  const clusterRes = await window.api.getClusters();
  if (clusterRes.ok) {
    clusters = clusterRes.clusters;
    clusterSelect.innerHTML = clusters.map(c => 
      `<option value="${c.id}" ${c.id === activeCluster ? "selected" : ""}>${c.name} (${c.version})</option>`
    ).join("");
    updateClusterBadge();
  }

  const kappsRes = await window.api.getKGraphApps();
  if (kappsRes.ok) {
    kgraphApps = kappsRes.apps || [];
  }

  await loadNamespaces();
}

function updateClusterBadge() {
  const curr = clusters.find(c => c.id === activeCluster) || clusters[0];
  if (!curr) return;
  const p = (curr.provider || "LOCAL").toUpperCase();
  clusterBadge.textContent = `${p} ${curr.flavor ? curr.flavor.toUpperCase() : ""}`;
  clusterBadge.className = `provider-badge provider-${curr.provider}`;
}

async function loadNamespaces() {
  const nsRes = await window.api.getNamespaces({ clusterId: activeCluster });
  if (nsRes.ok) {
    namespaces = nsRes.namespaces;
    
    const hasActive = namespaces.some(n => n.name === activeNamespace);
    if (!hasActive && namespaces.length > 0) {
      activeNamespace = namespaces[0].name;
    }

    namespaceSelect.innerHTML = `<option value="all">All Namespaces</option>` +
      namespaces.map(ns => 
        `<option value="${ns.name}" ${ns.name === activeNamespace ? "selected" : ""}>${ns.name}</option>`
      ).join("");
  }
  refreshActiveView();
}

function refreshActiveView() {
  if (activeTab === "helm") loadHelmReleases();
  else if (activeTab === "argocd") loadArgoCDApps();
  else if (activeTab === "vercel") loadVercelProjects();
  else loadResources();
}

// ── Resource Views (Pods / Deployments / Services / Ingress) ────────────────

async function loadResources() {
  toolbarStats.textContent = `Loading ${activeTab}...`;
  const res = await window.api.getResources({
    clusterId: activeCluster,
    namespace: activeNamespace,
    kind: activeTab,
  });

  if (res.ok) {
    currentResources = res.items || [];
    renderResourceTable();
  } else {
    toolbarStats.textContent = `Error loading resources: ${res.error}`;
  }
}

function renderResourceTable() {
  const query = resourceSearch.value.trim().toLowerCase();
  let items = currentResources;
  if (query) {
    items = items.filter(it => it.name.toLowerCase().includes(query) || (it.image || "").toLowerCase().includes(query));
  }

  // Handle Empty State with Deployable KGraph Apps
  if (items.length === 0 && !query) {
    tableWrapper.classList.add("hidden");
    emptyCard.classList.remove("hidden");
    emptyNsName.textContent = activeNamespace;
    toolbarStats.innerHTML = `Showing <strong>0</strong> ${activeTab} in <code>${activeNamespace}</code>`;
    renderKGraphApps();
    return;
  }

  tableWrapper.classList.remove("hidden");
  emptyCard.classList.add("hidden");
  toolbarStats.innerHTML = `Showing <strong>${items.length}</strong> ${activeTab} in <code>${activeNamespace}</code>`;

  if (activeTab === "pods") {
    tableHeaders.innerHTML = `
      <th>NAME</th>
      <th>NAMESPACE</th>
      <th>READY</th>
      <th>STATUS</th>
      <th>RESTARTS</th>
      <th>CPU</th>
      <th>MEMORY</th>
      <th>IP</th>
      <th>NODE</th>
      <th>AGE</th>
      <th>ACTIONS</th>
    `;

    tableBody.innerHTML = items.map(p => {
      const appName = (p.labels && p.labels.app) || (p.name.includes('-') ? p.name.substring(0, p.name.lastIndexOf('-')) : p.name);
      return `
      <tr class="resource-row">
        <td class="res-name"><span class="status-dot dot-running"></span><strong>${p.name}</strong></td>
        <td><code>${p.namespace}</code></td>
        <td>${p.ready}</td>
        <td><span class="badge badge-success">${p.status}</span></td>
        <td>${p.restarts}</td>
        <td>${p.cpu}</td>
        <td>${p.memory}</td>
        <td><code>${p.ip}</code></td>
        <td>${p.node}</td>
        <td>${p.age}</td>
        <td class="row-actions">
          <button class="btn-tiny" onclick="viewPodLogs('${p.name}', '${p.namespace}')">Logs</button>
          <button class="btn-tiny" onclick="describeResource('${p.name}', 'Pod', '${p.namespace}')">YAML</button>
          <button class="btn-danger-tiny" onclick="undeployFromRow('${appName}')">Undeploy</button>
        </td>
      </tr>
    `}).join("");
  } else if (activeTab === "deployments") {
    tableHeaders.innerHTML = `
      <th>NAME</th>
      <th>NAMESPACE</th>
      <th>READY</th>
      <th>UP-TO-DATE</th>
      <th>AVAILABLE</th>
      <th>CONTAINER IMAGE</th>
      <th>PORTS</th>
      <th>AGE</th>
      <th>ACTIONS</th>
    `;

    tableBody.innerHTML = items.map(d => `
      <tr class="resource-row">
        <td class="res-name"><span class="status-dot dot-running"></span><strong>${d.name}</strong></td>
        <td><code>${d.namespace}</code></td>
        <td>${d.ready}</td>
        <td>${d.upToDate}</td>
        <td>${d.available}</td>
        <td><code>${d.image}</code></td>
        <td>${d.ports}</td>
        <td>${d.age}</td>
        <td class="row-actions">
          <button class="btn-tiny btn-accent-tiny" onclick="restartDeployment('${d.name}', '${d.namespace}')">Restart</button>
          <button class="btn-tiny" onclick="describeResource('${d.name}', 'Deployment', '${d.namespace}')">YAML</button>
          <button class="btn-danger-tiny" onclick="undeployFromRow('${d.name}')">Undeploy</button>
        </td>
      </tr>
    `).join("");
  } else if (activeTab === "services") {
    tableHeaders.innerHTML = `
      <th>NAME</th>
      <th>NAMESPACE</th>
      <th>TYPE</th>
      <th>CLUSTER-IP</th>
      <th>PORTS</th>
      <th>AGE</th>
    `;

    tableBody.innerHTML = items.map(s => `
      <tr class="resource-row">
        <td class="res-name"><strong>${s.name}</strong></td>
        <td><code>${s.namespace}</code></td>
        <td>${s.type}</td>
        <td><code>${s.clusterIP}</code></td>
        <td>${s.ports}</td>
        <td>${s.age}</td>
      </tr>
    `).join("");
  } else if (activeTab === "ingresses") {
    tableHeaders.innerHTML = `
      <th>NAME</th>
      <th>NAMESPACE</th>
      <th>CLASS</th>
      <th>HOSTS</th>
      <th>ADDRESS</th>
      <th>PORTS</th>
      <th>AGE</th>
    `;

    tableBody.innerHTML = items.map(i => `
      <tr class="resource-row">
        <td class="res-name"><strong>${i.name}</strong></td>
        <td><code>${i.namespace}</code></td>
        <td>${i.class}</td>
        <td><code>${i.hosts}</code></td>
        <td>${i.address}</td>
        <td>${i.ports}</td>
        <td>${i.age}</td>
      </tr>
    `).join("");
  }
}

function renderKGraphApps() {
  if (!kgraphAppsContainer) return;
  kgraphAppsContainer.innerHTML = kgraphApps.map(app => `
    <div class="kgraph-app-card" id="card-${app.id}">
      <div class="kgraph-card-header">
        <span class="kgraph-app-name">${app.name}</span>
        <span class="kgraph-app-type">${app.type}</span>
      </div>
      <p class="kgraph-app-desc">${app.description}</p>
      <div class="kgraph-app-meta">
        <div><strong>Git Project:</strong> <code>${app.repo}</code></div>
        <div><strong>Ports:</strong> <code>${app.ports}</code></div>
      </div>
      <div class="kgraph-app-deploy-row">
        <div class="branch-input-group">
          <span class="branch-label">Branch:</span>
          <input type="text" id="branch-input-${app.id}" class="branch-input" value="${app.defaultBranch || 'main'}" placeholder="main">
        </div>
        <button class="btn btn-accent btn-tiny btn-deploy" onclick="deployKGraphApp('${app.id}', this)">Deploy</button>
      </div>
    </div>
  `).join("");
}

async function deployKGraphApp(appId, btnEl) {
  const branchInput = document.getElementById(`branch-input-${appId}`);
  const branch = (branchInput ? branchInput.value.trim() : "main") || "main";

  const btn = btnEl || document.querySelector(`#card-${appId} .btn-deploy`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner">⏳</span> Deploying...`;
  }

  const res = await window.api.deployApp({
    appId,
    branch,
    namespace: activeNamespace,
  });

  if (res.ok) {
    toolbarStats.innerHTML = `<span style="color: var(--green)">${res.message}</span>`;
    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `Deploy`;
      }
      loadResources();
    }, 1200);
  } else {
    toolbarStats.innerHTML = `<span style="color: var(--red)">Deploy failed: ${res.error}</span>`;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `Deploy`;
    }
  }
}

async function undeployFromRow(appName, skipConfirm = false) {
  if (!skipConfirm) {
    try {
      const ok = confirm(`Undeploy application '${appName}' from namespace '${activeNamespace}'?`);
      if (!ok) return;
    } catch (_) {}
  }

  const res = await window.api.undeployApp({ appId: appName, namespace: activeNamespace });
  if (res.ok) {
    toolbarStats.innerHTML = `<span style="color: var(--amber)">${res.message}</span>`;
    setTimeout(() => {
      loadResources();
    }, 1200);
  }
}

// ── Helm Releases View ──────────────────────────────────────────────────────

async function loadHelmReleases() {
  const res = await window.api.getHelmReleases();
  if (res.ok) {
    helmReleases = res.releases;
    const container = document.getElementById("helm-releases-list");
    container.innerHTML = helmReleases.map(h => `
      <div class="helm-card">
        <div class="helm-card-header">
          <div class="helm-title-block">
            <span class="helm-icon">⚓</span>
            <span class="helm-name">${h.name}</span>
            <span class="helm-rev-badge">Rev ${h.revision}</span>
          </div>
          <span class="badge badge-success">${h.status.toUpperCase()}</span>
        </div>
        <div class="helm-meta-grid">
          <div><span class="meta-label">Chart:</span> <code>${h.chart}</code></div>
          <div><span class="meta-label">App Version:</span> <code>${h.appVersion}</code></div>
          <div><span class="meta-label">Namespace:</span> <code>${h.namespace}</code></div>
          <div><span class="meta-label">Updated:</span> ${h.updated}</div>
        </div>
        <div class="helm-notes">${h.notes}</div>
        <div class="helm-card-actions">
          <button class="btn btn-tiny" onclick="describeResource('${h.name}', 'HelmRelease', '${h.namespace}')">Inspect Values</button>
          <button class="btn btn-tiny btn-outline" onclick="alert('Rollback preview for ' + '${h.name}')">Rollback</button>
        </div>
      </div>
    `).join("");
  }
}

// ── ArgoCD GitOps View ──────────────────────────────────────────────────────

async function loadArgoCDApps() {
  const res = await window.api.getArgoCDApps();
  if (res.ok) {
    argocdApps = res.apps;
    const container = document.getElementById("argocd-apps-list");
    container.innerHTML = argocdApps.map(app => `
      <div class="argocd-card">
        <div class="argocd-card-header">
          <div class="argocd-title-block">
            <span class="argocd-icon">🐙</span>
            <span class="argocd-name">${app.name}</span>
          </div>
          <div class="argocd-badges">
            <span class="badge badge-sync">${app.syncStatus}</span>
            <span class="badge badge-healthy">${app.healthStatus}</span>
          </div>
        </div>
        <div class="argocd-meta-grid">
          <div><span class="meta-label">Repository:</span> <code>${app.repoURL}</code></div>
          <div><span class="meta-label">Path / Target:</span> <code>${app.path} (${app.targetRevision})</code></div>
          <div><span class="meta-label">Destination:</span> <code>${app.destinationNamespace}</code></div>
          <div><span class="meta-label">Last Synced:</span> ${app.lastSynced}</div>
        </div>
        <div class="argocd-images-list">
          <span class="meta-label">Deployed Images:</span>
          ${app.images.map(img => `<span class="image-tag">${img}</span>`).join(" ")}
        </div>
        <div class="argocd-card-actions">
          <button class="btn btn-accent btn-tiny" onclick="syncArgoCD('${app.name}')">Sync Now (GitOps)</button>
          <button class="btn btn-tiny" onclick="describeResource('${app.name}', 'Application', 'argocd')">Manifest Diff</button>
        </div>
      </div>
    `).join("");
  }
}

// ── Vercel Serverless View ──────────────────────────────────────────────────

async function loadVercelProjects() {
  const res = await window.api.getVercelDeployments();
  if (res.ok) {
    vercelProjects = res.projects;
    const container = document.getElementById("vercel-projects-list");
    container.innerHTML = vercelProjects.map(v => `
      <div class="vercel-card">
        <div class="vercel-card-header">
          <div class="vercel-title-block">
            <span class="vercel-logo">▲</span>
            <span class="vercel-name">${v.name}</span>
            <span class="vercel-framework">${v.framework}</span>
          </div>
          <span class="badge badge-vercel">${v.status}</span>
        </div>
        <div class="vercel-domains-block">
          <div class="domain-row">
            <span class="domain-label">Production:</span>
            <a class="domain-link" href="#" onclick="window.open('${v.productionUrl}'); return false;">${v.productionUrl}</a>
          </div>
          <div class="domain-row">
            <span class="domain-label">Active Preview (PET-105):</span>
            <a class="domain-link" href="#" onclick="window.open('${v.previewUrl}'); return false;">${v.previewUrl}</a>
          </div>
        </div>
        <div class="vercel-meta-grid">
          <div><span class="meta-label">Git Branch:</span> <code>${v.gitBranch}</code></div>
          <div><span class="meta-label">Synced Commit:</span> <code>${v.syncedCommit}</code></div>
          <div><span class="meta-label">Edge Regions:</span> ${v.regions.join(", ")}</div>
          <div><span class="meta-label">Edge Middleware:</span> <code>${v.edgeMiddleware}</code></div>
        </div>
        <div class="vercel-deployments-list">
          <h4>Recent Vercel Deployments</h4>
          ${v.deployments.map(d => `
            <div class="vercel-dep-item">
              <span class="dep-env ${d.env.toLowerCase()}">${d.env}</span>
              <span class="dep-url">${d.url}</span>
              <span class="dep-created">${d.created}</span>
              <span class="badge badge-success">${d.status}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("");
  }
}

// ── Drawer Actions ──────────────────────────────────────────────────────────

async function viewPodLogs(podName, namespace) {
  drawerTitle.textContent = `Logs: ${podName} (${namespace})`;
  drawerContent.textContent = "Connecting to pod log stream...";
  drawerPanel.classList.remove("hidden");

  const res = await window.api.getPodLogs({ podName, namespace });
  if (res.ok) {
    drawerContent.textContent = res.logs;
  } else {
    drawerContent.textContent = `Failed to get logs: ${res.error}`;
  }
}

async function describeResource(name, kind, namespace) {
  drawerTitle.textContent = `${kind}: ${name} (${namespace}) — YAML Manifest`;
  drawerContent.textContent = "Loading YAML manifest...";
  drawerPanel.classList.remove("hidden");

  const res = await window.api.getResourceYaml({ name, kind, namespace });
  if (res.ok) {
    drawerContent.textContent = res.yaml;
  }
}

async function restartDeployment(deployment, namespace) {
  const res = await window.api.rolloutRestart({ deployment, namespace });
  if (res.ok) {
    alert(res.message);
    refreshActiveView();
  }
}

async function syncArgoCD(appName) {
  const res = await window.api.syncArgoCDApp({ appName });
  if (res.ok) {
    alert(res.message);
    loadArgoCDApps();
  }
}

// ── AI CoPilot ──────────────────────────────────────────────────────────────

async function sendCopilotMessage() {
  const inputEl = document.getElementById("ai-copilot-input");
  let prompt = "";
  if (typeof inputEl.getValue === "function") prompt = inputEl.getValue();
  else if (inputEl.value !== undefined) prompt = inputEl.value;
  const ta = inputEl.querySelector("textarea");
  if (ta && !prompt) prompt = ta.value;

  prompt = (prompt || "").trim();
  if (!prompt) return;

  copilotResponse.classList.remove("hidden");
  copilotResponse.innerHTML = `<span class="spinner">⏳</span> Asking Infrastructure CoPilot about <code>${prompt}</code>...`;

  const res = await window.api.askKubeAI({
    prompt,
    clusterId: activeCluster,
    namespace: activeNamespace,
  });

  if (res.ok) {
    copilotResponse.innerHTML = `<div class="copilot-answer"><strong>AI CoPilot:</strong> ${res.reply}</div>`;
  } else {
    copilotResponse.innerHTML = `<div class="error-text">Error: ${res.error}</div>`;
  }
}

// Make functions globally available for inline onclick attributes
window.viewPodLogs = viewPodLogs;
window.describeResource = describeResource;
window.restartDeployment = restartDeployment;
window.syncArgoCD = syncArgoCD;
window.deployKGraphApp = deployKGraphApp;
window.undeployFromRow = undeployFromRow;
window.loadResources = loadResources;

init();
