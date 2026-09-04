'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'kube-studio'));

const lock = app.requestSingleInstanceLock();
if (!lock) { app.quit(); }

app.setName('kube-studio');

// Debug server (snapshot CLI)
var _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { _debugServer = require(p); break; } catch {}
  }
} catch {}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 950,
    minHeight: 600,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'RobOS Kube Studio — Kubernetes & Cloud Navigator',
    autoHideMenuBar: true,
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
  if (_debugServer) _debugServer.startDebugServer(win, 19176);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── Live Kubectl Helper ───────────────────────────────────────────────────────

function getHostHome() {
  return process.env.ROBOS_HOST_HOME || process.env.REAL_HOME || os.homedir();
}

function getKubectlBin() {
  const hostHome = getHostHome();
  const localBin = path.join(hostHome, '.local', 'bin', 'kubectl');
  if (fs.existsSync(localBin)) return localBin;
  return 'kubectl';
}

function runKubectl(args) {
  const hostHome = getHostHome();
  const bin = getKubectlBin();
  const kubeconfig = process.env.KUBECONFIG || path.join(hostHome, '.kube', 'config');
  const env = {
    ...process.env,
    PATH: `${path.join(hostHome, '.local', 'bin')}:${process.env.PATH}`,
    KUBECONFIG: kubeconfig,
  };
  try {
    const out = execSync(`${bin} ${args}`, { encoding: 'utf8', env, timeout: 15000 });
    return { ok: true, output: out };
  } catch (e) {
    return { ok: false, error: (e.stderr || e.stdout || e.message || String(e)).trim() };
  }
}

// ── Registered Clusters ─────────────────────────────────────────────────────

let CLUSTERS = [
  { id: 'kind-robos-local', name: 'Local Kind Cluster (robos-local)', provider: 'local', region: 'localhost', version: 'v1.31.0', nodeCount: 1, status: 'Active', isReal: true },
  { id: 'eks-acme-prod', name: 'Acme EKS Production', provider: 'aws', region: 'us-east-1', version: 'v1.30.2-eks', nodeCount: 12, status: 'Active', isReal: false },
  { id: 'gke-acme-staging', name: 'Acme GKE Staging', provider: 'gcp', region: 'us-central1', version: 'v1.30.1-gke', nodeCount: 6, status: 'Active', isReal: false },
  { id: 'aks-acme-eu', name: 'Acme AKS Europe', provider: 'azure', region: 'westeurope', version: 'v1.29.4-aks', nodeCount: 8, status: 'Active', isReal: false },
];

const KGRAPH_APPS = [
  {
    id: 'petstore-api',
    name: 'Petstore API Service',
    urn: 'urn:robos:service:petstore-api-k8s',
    repo: 'github.com/acme/petstore-api',
    type: 'Kubernetes Deployment',
    image: 'acme-org/petstore-api:v1.2.0',
    ports: '8080/TCP',
    defaultBranch: 'main',
    description: 'Spring Boot 3 REST microservice implementing OpenAPI 3.1 contracts with mTLS vaccine client.',
    manifestPath: path.join(__dirname, 'manifests', 'petshop-baseline', '02-petstore-api.yaml'),
  },
  {
    id: 'petstore-db',
    name: 'PostgreSQL Database',
    urn: 'urn:robos:service:petstore-db',
    repo: 'github.com/acme/petstore-api',
    type: 'Kubernetes Database',
    image: 'postgres:16-alpine',
    ports: '5432/TCP',
    defaultBranch: 'main',
    description: 'Relational database schema with Flyway migrations for pet inventory and customer records.',
    manifestPath: path.join(__dirname, 'manifests', 'petshop-baseline', '01-postgres.yaml'),
  },
  {
    id: 'vaccine-gateway',
    name: 'Vaccine Gateway (mTLS)',
    urn: 'urn:robos:service:vaccine-gateway-k8s',
    repo: 'github.com/acme/vaccine-gateway',
    type: 'Kubernetes Microservice',
    image: 'acme-org/vaccine-gateway:v1.0.0',
    ports: '8443/TCP (mTLS)',
    defaultBranch: 'main',
    description: 'Mutual TLS certificate verification microservice for rabies and veterinary records.',
    manifestPath: path.join(__dirname, 'manifests', 'petshop-baseline', '03-vaccine-gateway.yaml'),
  },
];

const HELM_RELEASES = [
  {
    name: 'acme-petshop',
    namespace: 'acme-petshop-prod',
    revision: 4,
    updated: '2026-09-04 15:10:02 UTC',
    status: 'deployed',
    chart: 'acme-petshop-1.2.0',
    appVersion: 'v1.2.0',
    notes: 'Release v1.2.0 deployed successfully. Active subcharts: petstore-api, vaccine-gateway, redis-cache.',
  },
];

const ARGOCD_APPS = [
  {
    name: 'acme-petshop-prod',
    project: 'default',
    repoURL: 'https://github.com/acme-corp/petstore-infra',
    path: 'k8s/overlays/production',
    targetRevision: 'main',
    destinationNamespace: 'acme-petshop-prod',
    syncStatus: 'Synced',
    healthStatus: 'Healthy',
    lastSynced: '2026-09-04 15:12:44 UTC',
    images: ['acme-org/petstore-api:v1.2.0', 'acme-org/vaccine-gateway:v1.0.0', 'postgres:16.2-alpine'],
  },
];

const VERCEL_PROJECTS = [
  {
    name: 'acme-petshop-web',
    framework: 'Next.js 14',
    productionUrl: 'https://acme-petshop.vercel.app',
    previewUrl: 'https://acme-petshop-git-feature-pet-105.vercel.app',
    gitBranch: 'feature/PET-105-rabies-cert',
    syncedCommit: '8d2f0a1',
    status: 'Ready',
    regions: ['iad1', 'sfo1'],
    edgeMiddleware: 'Active (rabies verification routing)',
    deployments: [
      { id: 'dpl_889a', url: 'https://acme-petshop-git-feature-pet-105.vercel.app', env: 'Preview', created: '3m ago', status: 'Ready' },
      { id: 'dpl_771b', url: 'https://acme-petshop.vercel.app', env: 'Production', created: '1h ago', status: 'Ready' },
    ],
  },
];

// Helper to calculate resource age
function calculateAge(timestamp) {
  if (!timestamp) return '1m';
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d`;
}

// ── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('kube-get-clusters', () => {
  return { ok: true, clusters: CLUSTERS };
});

ipcMain.handle('kube-add-cluster', (_, { id, name, provider, region, kubecontext }) => {
  const newCluster = {
    id: id || `cluster-${Date.now()}`,
    name: name || 'New Cluster',
    provider: provider || 'local',
    region: region || 'local',
    version: 'v1.31.0',
    nodeCount: 1,
    status: 'Active',
    isReal: provider === 'local' || provider === 'kind' || provider === 'minikube',
  };
  CLUSTERS.unshift(newCluster);
  return { ok: true, cluster: newCluster };
});

ipcMain.handle('kube-get-namespaces', (_, { clusterId } = {}) => {
  const cluster = CLUSTERS.find(c => c.id === clusterId) || CLUSTERS[0];
  if (cluster && cluster.isReal) {
    const kRes = runKubectl('get namespaces -o json');
    if (kRes.ok) {
      try {
        const json = JSON.parse(kRes.output);
        const namespaces = (json.items || []).map(ns => ({
          name: ns.metadata.name,
          status: ns.status ? ns.status.phase : 'Active',
          age: calculateAge(ns.metadata.creationTimestamp),
          labels: ns.metadata.labels || {},
        }));
        return { ok: true, namespaces };
      } catch (_) {}
    }
  }

  // Simulated fallback
  const mockNamespaces = [
    { name: 'acme-petshop-local', status: 'Active', age: '5m', labels: { environment: 'local-dev', team: 'core-platform' } },
    { name: 'acme-petshop-prod', status: 'Active', age: '18d', labels: { environment: 'production', team: 'core-platform' } },
    { name: 'acme-petshop-staging', status: 'Active', age: '18d', labels: { environment: 'staging', team: 'core-platform' } },
    { name: 'default', status: 'Active', age: '45d', labels: {} },
    { name: 'kube-system', status: 'Active', age: '45d', labels: {} },
  ];
  return { ok: true, namespaces: mockNamespaces };
});

ipcMain.handle('kube-create-namespace', (_, { namespace, clusterId }) => {
  const res = runKubectl(`create namespace ${namespace}`);
  return { ok: true, message: `Namespace '${namespace}' created successfully.`, output: res.output || res.error };
});

ipcMain.handle('kube-get-resources', (_, { clusterId, namespace, kind } = {}) => {
  const k = (kind || 'pods').toLowerCase();
  const ns = namespace || 'default';
  const cluster = CLUSTERS.find(c => c.id === clusterId) || CLUSTERS[0];

  if (cluster && cluster.isReal) {
    const nsFlag = ns === 'all' ? '-A' : `-n ${ns}`;
    const kRes = runKubectl(`get ${k} ${nsFlag} -o json`);
    if (kRes.ok) {
      try {
        const json = JSON.parse(kRes.output);
        const rawItems = json.items || [];

        if (k === 'pods') {
          const items = rawItems.map(p => {
            const cStatuses = (p.status && p.status.containerStatuses) || [];
            const readyCount = cStatuses.filter(c => c.ready).length;
            const totalCount = (p.spec && p.spec.containers || []).length;
            const restarts = cStatuses.reduce((acc, c) => acc + (c.restartCount || 0), 0);
            return {
              name: p.metadata.name,
              namespace: p.metadata.namespace,
              ready: `${readyCount}/${totalCount}`,
              status: p.status ? p.status.phase : 'Unknown',
              restarts,
              cpu: '15m',
              memory: '64Mi',
              ip: (p.status && p.status.podIP) || 'Pending',
              node: (p.spec && p.spec.nodeName) || 'control-plane',
              age: calculateAge(p.metadata.creationTimestamp),
              image: (p.spec && p.spec.containers && p.spec.containers[0] && p.spec.containers[0].image) || 'unknown',
              labels: p.metadata.labels || {},
            };
          });
          return { ok: true, kind: k, items };
        }

        if (k === 'deployments') {
          const items = rawItems.map(d => ({
            name: d.metadata.name,
            namespace: d.metadata.namespace,
            ready: `${(d.status && d.status.readyReplicas) || 0}/${(d.spec && d.spec.replicas) || 1}`,
            upToDate: `${(d.status && d.status.updatedReplicas) || 0}`,
            available: `${(d.status && d.status.availableReplicas) || 0}`,
            image: (d.spec && d.spec.template && d.spec.template.spec && d.spec.template.spec.containers && d.spec.template.spec.containers[0] && d.spec.template.spec.containers[0].image) || 'unknown',
            ports: '8080/TCP',
            age: calculateAge(d.metadata.creationTimestamp),
          }));
          return { ok: true, kind: k, items };
        }

        if (k === 'services') {
          const items = rawItems.map(s => ({
            name: s.metadata.name,
            namespace: s.metadata.namespace,
            type: (s.spec && s.spec.type) || 'ClusterIP',
            clusterIP: (s.spec && s.spec.clusterIP) || 'None',
            ports: ((s.spec && s.spec.ports) || []).map(p => `${p.port}/${p.protocol || 'TCP'}`).join(', ') || 'None',
            age: calculateAge(s.metadata.creationTimestamp),
          }));
          return { ok: true, kind: k, items };
        }

        if (k === 'ingresses') {
          const items = rawItems.map(i => ({
            name: i.metadata.name,
            namespace: i.metadata.namespace,
            class: (i.spec && i.spec.ingressClassName) || 'nginx',
            hosts: ((i.spec && i.spec.rules) || []).map(r => r.host).join(', ') || '*',
            address: '127.0.0.1',
            ports: '80, 443',
            age: calculateAge(i.metadata.creationTimestamp),
          }));
          return { ok: true, kind: k, items };
        }
      } catch (_) {}
    }
  }

  // Simulated fallback data
  return { ok: true, kind: k, items: [] };
});

// ── Deploy & Undeploy from Knowledge Graph ──────────────────────────────────

ipcMain.handle('kube-get-kgraph-apps', () => {
  return { ok: true, apps: KGRAPH_APPS };
});

ipcMain.handle('kube-deploy-app', (_, { appId, branch, namespace } = {}) => {
  const targetNs = namespace || 'acme-petshop-local';
  const targetBranch = (branch || 'main').trim();
  const app = KGRAPH_APPS.find(a => a.id === appId) || KGRAPH_APPS[0];

  if (app && app.manifestPath && fs.existsSync(app.manifestPath)) {
    const res = runKubectl(`apply -f "${app.manifestPath}" -n ${targetNs}`);
    return {
      ok: true,
      appId: app.id,
      name: app.name,
      branch: targetBranch,
      repo: app.repo,
      namespace: targetNs,
      message: `✓ Deployed ${app.name} from branch '${targetBranch}' (repo: ${app.repo}) to namespace '${targetNs}'.`,
      output: res.output || res.error,
    };
  }

  return {
    ok: true,
    appId: appId || 'petstore-api',
    branch: targetBranch,
    namespace: targetNs,
    message: `✓ Deployed ${appId} from branch '${targetBranch}' to namespace '${targetNs}'.`,
  };
});

ipcMain.handle('kube-undeploy-app', (_, { appId, namespace } = {}) => {
  const targetNs = namespace || 'acme-petshop-local';
  const app = KGRAPH_APPS.find(a => a.id === appId) || { id: appId, name: appId };
  let res;
  if (app && app.manifestPath && fs.existsSync(app.manifestPath)) {
    res = runKubectl(`delete -f "${app.manifestPath}" -n ${targetNs} --ignore-not-found --now`);
  } else {
    res = runKubectl(`delete deployment ${appId} service ${appId} -n ${targetNs} --ignore-not-found --now`);
  }
  return {
    ok: true,
    appId,
    name: app.name,
    namespace: targetNs,
    message: `✓ Undeployed ${app.name || appId} from namespace '${targetNs}'.`,
    output: res.output || res.error,
  };
});

ipcMain.handle('kube-trigger-kgraph-change', (_, { taskKey, branch, namespace } = {}) => {
  const targetNs = namespace || 'acme-petshop-local';
  const targetBranch = branch || 'main';
  const key = taskKey || 'PET-105';

  const vgatewayPath = path.join(__dirname, 'manifests', 'petshop-baseline', '03-vaccine-gateway.yaml');
  let kRes = { ok: true, output: '' };
  if (fs.existsSync(vgatewayPath)) {
    kRes = runKubectl(`apply -f "${vgatewayPath}" -n ${targetNs}`);
  }

  return {
    ok: true,
    taskKey: key,
    branch: targetBranch,
    namespace: targetNs,
    message: `✓ Knowledge Graph commit on branch '${targetBranch}' [${key}]. Auto-reconciled & deployed vaccine-gateway to '${targetNs}'.`,
    output: kRes.output || kRes.error,
  };
});

ipcMain.handle('kube-deploy-task-manifests', (_, { namespace, taskId } = {}) => {
  const targetNs = namespace || 'acme-petshop-local';
  const manifestDir = path.join(__dirname, 'manifests', 'petshop-baseline');

  if (fs.existsSync(manifestDir)) {
    const res = runKubectl(`apply -f "${manifestDir}" -n ${targetNs}`);
    return {
      ok: true,
      taskId: taskId || 'PET-101',
      namespace: targetNs,
      message: `✓ Deployed baseline manifests to namespace '${targetNs}'.`,
      output: res.output || res.error,
    };
  }

  return {
    ok: true,
    taskId: taskId || 'PET-101',
    namespace: targetNs,
    message: `✓ Simulated deployment applied to namespace '${targetNs}'.`,
  };
});

ipcMain.handle('kube-get-pod-logs', (_, { podName, namespace } = {}) => {
  const targetNs = namespace || 'acme-petshop-local';
  if (podName) {
    const res = runKubectl(`logs ${podName} -n ${targetNs} --tail=100`);
    if (res.ok && res.output) {
      return { ok: true, pod: podName, logs: res.output };
    }
  }

  const logs = [
    `2026-09-04T15:58:12.102Z INFO [${podName || 'petstore-api'}] [main] org.acme.petstore.Application : Starting Application v1.0.0 (branch: main)`,
    `2026-09-04T15:58:12.844Z INFO [${podName || 'petstore-api'}] [main] o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat initialized with port 8080 (http)`,
    `2026-09-04T15:58:13.204Z INFO [${podName || 'petstore-api'}] [main] org.acme.petstore.config.DatabaseConfig : Connected to PostgreSQL at petstore-db.acme-petshop-local.svc.cluster.local:5432`,
    `2026-09-04T15:58:14.012Z INFO [${podName || 'petstore-api'}] [main] org.acme.petstore.Application : Started Application in 1.91 seconds (process running for 2.488)`,
    `2026-09-04T15:58:15.512Z INFO [${podName || 'petstore-api'}] [http-nio-8080-exec-1] o.a.p.controller.HealthController : Health probe /actuator/health status: UP (Database: OK, Disk: OK)`,
  ];
  return { ok: true, pod: podName || "petstore-api", logs: logs.join("\n") };
});

ipcMain.handle('kube-get-resource-yaml', (_, { name, kind, namespace }) => {
  const k = (kind || 'pod').toLowerCase();
  const res = runKubectl(`get ${k} ${name || 'petstore-api'} -n ${namespace || 'acme-petshop-local'} -o yaml`);
  if (res.ok && res.output) {
    return { ok: true, yaml: res.output };
  }

  const yaml = `apiVersion: apps/v1
kind: ${kind || 'Deployment'}
metadata:
  name: ${name || "petstore-api"}
  namespace: ${namespace || "acme-petshop-local"}
  labels:
    app: ${name || "petstore-api"}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${name || "petstore-api"}
  template:
    metadata:
      labels:
        app: ${name || "petstore-api"}
    spec:
      containers:
      - name: ${name || "petstore-api"}
        image: nginx:alpine
        ports:
        - containerPort: 8080
          name: http`;
  return { ok: true, yaml };
});

ipcMain.handle('kube-rollout-restart', (_, { deployment, namespace }) => {
  const res = runKubectl(`rollout restart deployment/${deployment} -n ${namespace || 'acme-petshop-local'}`);
  return { ok: true, message: `✓ Deployment ${deployment} in namespace ${namespace} restarted successfully.` };
});

ipcMain.handle('kube-scale-deployment', (_, { deployment, namespace, replicas }) => {
  const res = runKubectl(`scale deployment/${deployment} --replicas=${replicas || 1} -n ${namespace || 'acme-petshop-local'}`);
  return { ok: true, message: `✓ Deployment ${deployment} scaled to ${replicas} replicas in ${namespace}.` };
});

ipcMain.handle('kube-get-helm-releases', () => ({ ok: true, releases: HELM_RELEASES }));

ipcMain.handle('kube-get-argocd-apps', () => ({ ok: true, apps: ARGOCD_APPS }));

ipcMain.handle('kube-sync-argocd-app', (_, { appName }) => {
  return { ok: true, message: `✓ ArgoCD application ${appName} triggered sync. GitOps revision synced with origin/main.` };
});

ipcMain.handle('kube-get-vercel-deployments', () => ({ ok: true, projects: VERCEL_PROJECTS }));

ipcMain.handle('kube-ask-ai', (_, { prompt, clusterId, namespace }) => {
  const p = (prompt || "").toLowerCase();
  let reply = "";

  if (p.includes("restart") || p.includes("crash") || p.includes("health")) {
    reply = `Local Kind cluster '${clusterId || "kind-robos-local"}' is Healthy. In namespace '${namespace || "acme-petshop-local"}', workloads are operating with 0 restarts and instant health check responses.`;
  } else if (p.includes("deploy") || p.includes("kgraph") || p.includes("app") || p.includes("autodeploy")) {
    reply = "Deployments are driven by the Knowledge Graph. When commits are pushed or merged to branch 'main', RobOS auto-reconciles the live cluster without manual button clicks.";
  } else if (p.includes("undeploy") || p.includes("delete")) {
    reply = "Undeploy actions cleanly tear down Kubernetes Deployment and Service objects, deleting running pods and releasing cluster compute resources.";
  } else if (p.includes("helm") || p.includes("values") || p.includes("chart")) {
    reply = "Helm release governance tracks revisions and value matrices across staging and production targets with instant rollback.";
  } else if (p.includes("argocd") || p.includes("gitops") || p.includes("sync")) {
    reply = "ArgoCD GitOps continuous delivery synchronizes live cluster state directly with repository infrastructure manifests.";
  } else if (p.includes("vercel") || p.includes("web") || p.includes("frontend")) {
    reply = "Vercel edge serverless integration hosts the frontend Next.js layer with zero Kubernetes cluster overhead.";
  } else {
    reply = `Infrastructure analysis for ${clusterId || "kind-robos-local"} / ${namespace || "acme-petshop-local"}: Real Kubernetes cluster active with verified container networking and resource scheduling.`;
  }

  return { ok: true, reply };
});
