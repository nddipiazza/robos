'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

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

// ── Mock Data & Providers ───────────────────────────────────────────────────

const CLUSTERS = [
  { id: 'eks-acme-prod', name: 'Acme EKS Production', provider: 'aws', region: 'us-east-1', version: 'v1.30.2-eks', nodeCount: 12, status: 'Active' },
  { id: 'gke-acme-staging', name: 'Acme GKE Staging', provider: 'gcp', region: 'us-central1', version: 'v1.30.1-gke', nodeCount: 6, status: 'Active' },
  { id: 'aks-acme-eu', name: 'Acme AKS Europe', provider: 'azure', region: 'westeurope', version: 'v1.29.4-aks', nodeCount: 8, status: 'Active' },
  { id: 'kind-local', name: 'Local Kind Dev Cluster', provider: 'local', region: 'localhost', version: 'v1.30.0', nodeCount: 3, status: 'Active' },
];

const NAMESPACES = [
  { name: 'acme-petshop-prod', status: 'Active', age: '18d', labels: { "environment": "production", "team": "core-platform" } },
  { name: 'acme-petshop-staging', status: 'Active', age: '18d', labels: { "environment": "staging", "team": "core-platform" } },
  { name: 'kafka-strimzi', status: 'Active', age: '25d', labels: { "app.kubernetes.io/part-of": "strimzi" } },
  { name: 'ingress-nginx', status: 'Active', age: '30d', labels: { "app.kubernetes.io/name": "ingress-nginx" } },
  { name: 'default', status: 'Active', age: '45d', labels: {} },
  { name: 'kube-system', status: 'Active', age: '45d', labels: {} },
];

const PODS = [
  {
    name: 'petstore-api-7b8f9c4d2-k9m1a',
    namespace: 'acme-petshop-prod',
    ready: '1/1',
    status: 'Running',
    restarts: 0,
    cpu: '14m',
    memory: '154Mi',
    ip: '10.244.1.18',
    node: 'ip-10-0-12-44.ec2.internal',
    age: '18m',
    image: 'acme-org/petstore-api:v1.2.0',
    labels: { app: 'petstore-api', version: 'v1.2.0', "robos.dev/task": "PET-105" },
  },
  {
    name: 'petstore-api-7b8f9c4d2-p4x2b',
    namespace: 'acme-petshop-prod',
    ready: '1/1',
    status: 'Running',
    restarts: 0,
    cpu: '12m',
    memory: '148Mi',
    ip: '10.244.2.22',
    node: 'ip-10-0-12-45.ec2.internal',
    age: '18m',
    image: 'acme-org/petstore-api:v1.2.0',
    labels: { app: 'petstore-api', version: 'v1.2.0', "robos.dev/task": "PET-105" },
  },
  {
    name: 'petstore-api-7b8f9c4d2-z8w3c',
    namespace: 'acme-petshop-prod',
    ready: '1/1',
    status: 'Running',
    restarts: 0,
    cpu: '16m',
    memory: '160Mi',
    ip: '10.244.3.15',
    node: 'ip-10-0-12-46.ec2.internal',
    age: '18m',
    image: 'acme-org/petstore-api:v1.2.0',
    labels: { app: 'petstore-api', version: 'v1.2.0', "robos.dev/task": "PET-105" },
  },
  {
    name: 'vaccine-gateway-6d4a1b9f8-t1r4v',
    namespace: 'acme-petshop-prod',
    ready: '1/1',
    status: 'Running',
    restarts: 0,
    cpu: '8m',
    memory: '96Mi',
    ip: '10.244.1.19',
    node: 'ip-10-0-12-44.ec2.internal',
    age: '2d',
    image: 'acme-org/vaccine-gateway:v1.0.0',
    labels: { app: 'vaccine-gateway', "security.robos.dev/mtls": "enabled" },
  },
  {
    name: 'vaccine-gateway-6d4a1b9f8-m7q5w',
    namespace: 'acme-petshop-prod',
    ready: '1/1',
    status: 'Running',
    restarts: 0,
    cpu: '9m',
    memory: '98Mi',
    ip: '10.244.2.23',
    node: 'ip-10-0-12-45.ec2.internal',
    age: '2d',
    image: 'acme-org/vaccine-gateway:v1.0.0',
    labels: { app: 'vaccine-gateway', "security.robos.dev/mtls": "enabled" },
  },
  {
    name: 'petstore-db-postgresql-0',
    namespace: 'acme-petshop-prod',
    ready: '1/1',
    status: 'Running',
    restarts: 0,
    cpu: '28m',
    memory: '340Mi',
    ip: '10.244.1.12',
    node: 'ip-10-0-12-44.ec2.internal',
    age: '18d',
    image: 'postgres:16.2-alpine',
    labels: { "app.kubernetes.io/name": "postgresql" },
  },
  {
    name: 'strimzi-kafka-cluster-kafka-0',
    namespace: 'kafka-strimzi',
    ready: '1/1',
    status: 'Running',
    restarts: 0,
    cpu: '42m',
    memory: '680Mi',
    ip: '10.244.4.10',
    node: 'ip-10-0-12-48.ec2.internal',
    age: '25d',
    image: 'quay.io/strimzi/kafka:0.42.0-kafka-3.7.0',
    labels: { "strimzi.io/cluster": "strimzi-kafka-cluster", "strimzi.io/kind": "Kafka" },
  },
];

const DEPLOYMENTS = [
  {
    name: 'petstore-api',
    namespace: 'acme-petshop-prod',
    ready: '3/3',
    upToDate: 3,
    available: 3,
    age: '18d',
    image: 'acme-org/petstore-api:v1.2.0',
    strategy: 'RollingUpdate',
    ports: '8080/TCP, 9090/TCP',
  },
  {
    name: 'vaccine-gateway',
    namespace: 'acme-petshop-prod',
    ready: '2/2',
    upToDate: 2,
    available: 2,
    age: '2d',
    image: 'acme-org/vaccine-gateway:v1.0.0',
    strategy: 'RollingUpdate',
    ports: '8443/TCP (mTLS)',
  },
];

const SERVICES = [
  {
    name: 'petstore-api-svc',
    namespace: 'acme-petshop-prod',
    type: 'ClusterIP',
    clusterIP: '172.20.142.88',
    ports: '8080/TCP (http), 9090/TCP (metrics)',
    age: '18d',
  },
  {
    name: 'vaccine-gateway-svc',
    namespace: 'acme-petshop-prod',
    type: 'ClusterIP',
    clusterIP: '172.20.198.14',
    ports: '8443/TCP (mTLS https)',
    age: '2d',
  },
  {
    name: 'petstore-db-svc',
    namespace: 'acme-petshop-prod',
    type: 'ClusterIP',
    clusterIP: '172.20.80.20',
    ports: '5432/TCP (postgresql)',
    age: '18d',
  },
];

const INGRESSES = [
  {
    name: 'petstore-ingress',
    namespace: 'acme-petshop-prod',
    class: 'nginx',
    hosts: 'petshop.acme.internal, api.petshop.acme.internal',
    address: 'k8s-ingress-alb-849102.us-east-1.elb.amazonaws.com',
    ports: '80, 443 (TLS)',
    age: '18d',
  },
];

const HELM_RELEASES = [
  {
    name: 'acme-petshop',
    namespace: 'acme-petshop-prod',
    revision: 4,
    updated: '2026-09-04 15:08:00 UTC',
    status: 'deployed',
    chart: 'acme-petshop-1.2.0',
    appVersion: '1.2.0',
    notes: 'Release v1.2.0 deployed successfully with Rabies Verification microservice integration [PET-105].',
  },
  {
    name: 'strimzi-kafka',
    namespace: 'kafka-strimzi',
    revision: 1,
    updated: '2026-08-10 11:20:00 UTC',
    status: 'deployed',
    chart: 'strimzi-kafka-operator-0.42.0',
    appVersion: '0.42.0',
    notes: 'Kafka Strimzi operator running 3-node HA broker cluster.',
  },
  {
    name: 'cloudnative-pg',
    namespace: 'acme-petshop-prod',
    revision: 2,
    updated: '2026-08-15 09:45:00 UTC',
    status: 'deployed',
    chart: 'cloudnative-pg-1.23.1',
    appVersion: '1.23.1',
    notes: 'CloudNativePG PostgreSQL 16 high-availability cluster.',
  },
];

const ARGOCD_APPS = [
  {
    name: 'acme-petshop-prod',
    project: 'default',
    syncStatus: 'Synced',
    healthStatus: 'Healthy',
    repoURL: 'https://github.com/acme-corp/petstore-infra',
    targetRevision: 'main',
    path: 'k8s/overlays/production',
    destinationServer: 'https://eks.us-east-1.acme.aws:6443',
    destinationNamespace: 'acme-petshop-prod',
    lastSynced: 'Just now (Automated GitOps Sync on merge)',
    images: ['acme-org/petstore-api:v1.2.0', 'acme-org/vaccine-gateway:v1.0.0'],
  },
  {
    name: 'acme-petshop-staging',
    project: 'default',
    syncStatus: 'Synced',
    healthStatus: 'Healthy',
    repoURL: 'https://github.com/acme-corp/petstore-infra',
    targetRevision: 'main',
    path: 'k8s/overlays/staging',
    destinationServer: 'https://eks.us-east-1.acme.aws:6443',
    destinationNamespace: 'acme-petshop-staging',
    lastSynced: '12m ago',
    images: ['acme-org/petstore-api:v1.2.0', 'acme-org/vaccine-gateway:v1.0.0'],
  },
];

const VERCEL_PROJECTS = [
  {
    id: 'prj_acme_petstore_web',
    name: 'acme-petshop-web',
    framework: 'Next.js 14',
    status: 'READY',
    productionUrl: 'https://acme-petshop.vercel.app',
    previewUrl: 'https://acme-petshop-git-feature-pet-105.vercel.app',
    gitBranch: 'main',
    syncedCommit: 'a003b07 (feat(service): verify rabies cert over mTLS)',
    regions: ['iad1 (Washington, D.C.)', 'sfo1 (San Francisco)', 'fra1 (Frankfurt)'],
    edgeMiddleware: 'active',
    deployments: [
      { id: 'dpl_prod_9921', env: 'Production', branch: 'main', url: 'https://acme-petshop.vercel.app', created: '10m ago', status: 'READY' },
      { id: 'dpl_prev_8812', env: 'Preview', branch: 'feature/PET-105-rabies-verification', url: 'https://acme-petshop-git-feature-pet-105.vercel.app', created: '28m ago', status: 'READY' },
    ],
  },
];

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('kube-get-clusters', () => ({ ok: true, clusters: CLUSTERS }));

ipcMain.handle('kube-get-namespaces', (_, { clusterId } = {}) => ({
  ok: true,
  namespaces: NAMESPACES,
}));

ipcMain.handle('kube-get-resources', (_, { clusterId, namespace, kind } = {}) => {
  const ns = namespace || 'acme-petshop-prod';
  const k = (kind || 'pods').toLowerCase();

  if (k === 'pods') {
    const list = ns === 'all' ? PODS : PODS.filter(p => p.namespace === ns);
    return { ok: true, kind: 'Pods', items: list };
  }
  if (k === 'deployments') {
    const list = ns === 'all' ? DEPLOYMENTS : DEPLOYMENTS.filter(d => d.namespace === ns);
    return { ok: true, kind: 'Deployments', items: list };
  }
  if (k === 'services') {
    const list = ns === 'all' ? SERVICES : SERVICES.filter(s => s.namespace === ns);
    return { ok: true, kind: 'Services', items: list };
  }
  if (k === 'ingresses') {
    const list = ns === 'all' ? INGRESSES : INGRESSES.filter(i => i.namespace === ns);
    return { ok: true, kind: 'Ingresses', items: list };
  }
  return { ok: true, kind: k, items: [] };
});

ipcMain.handle('kube-get-pod-logs', (_, { podName, namespace, tailLines } = {}) => {
  const logs = [
    "2026-09-04T15:08:12.102Z INFO [petstore-api] [main] org.acme.petstore.Application : Starting Application v1.2.0 on petstore-api-7b8f9c4d2-k9m1a with PID 1",
    "2026-09-04T15:08:12.844Z INFO [petstore-api] [main] o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat initialized with port 8080 (http)",
    "2026-09-04T15:08:13.204Z INFO [petstore-api] [main] org.acme.petstore.config.SecurityConfig : Initializing Mutual TLS client keystore from /certs/petstore-client.jks",
    "2026-09-04T15:08:13.412Z INFO [petstore-api] [main] o.a.p.client.VaccineGatewayClient       : Loaded CA Root truststore: CN=Acme Root CA 2026 (SHA256:88fa...)",
    "2026-09-04T15:08:13.951Z INFO [petstore-api] [main] o.a.p.client.VaccineGatewayClient       : mTLS connection pool established against https://vaccine-gateway-svc:8443 (TLSv1.3)",
    "2026-09-04T15:08:14.288Z INFO [petstore-api] [main] org.acme.petstore.events.KafkaPublisher : Connected to Kafka cluster at strimzi-kafka-cluster-kafka-0:9092",
    "2026-09-04T15:08:15.012Z INFO [petstore-api] [main] org.acme.petstore.Application : Started Application in 2.91 seconds (process running for 3.488)",
    "2026-09-04T15:08:24.512Z INFO [petstore-api] [http-nio-8080-exec-1] o.a.p.service.PetService : [PET-105] Verifying rabies certificate for petId=1001 with VaccineGatewayClient",
    "2026-09-04T15:08:24.542Z INFO [petstore-api] [http-nio-8080-exec-1] o.a.p.client.VaccineGatewayClient : mTLS handshake verified with vaccine-gateway. Status: VALID (Certificate #RAB-2026-991)",
    "2026-09-04T15:08:24.590Z INFO [petstore-api] [http-nio-8080-exec-1] o.a.p.events.KafkaPublisher : Published AdoptionApprovedEvent to topic petstore.adoptions.events (payload size: 348 bytes)",
    "2026-09-04T15:08:24.594Z INFO [petstore-api] [http-nio-8080-exec-1] o.a.p.controller.PetController : Adoption processed successfully (HTTP 200 OK)",
  ];
  return { ok: true, pod: podName || "petstore-api", logs: logs.join("\n") };
});

ipcMain.handle('kube-get-resource-yaml', (_, { name, kind, namespace }) => {
  const yaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name || "petstore-api"}
  namespace: ${namespace || "acme-petshop-prod"}
  labels:
    app: petstore-api
    app.kubernetes.io/name: petstore-api
    app.kubernetes.io/part-of: acme-petshop
    robos.dev/task: PET-105
    robos.dev/release: v1.2.0
spec:
  replicas: 3
  selector:
    matchLabels:
      app: petstore-api
  template:
    metadata:
      labels:
        app: petstore-api
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
      containers:
      - name: petstore-api
        image: acme-org/petstore-api:v1.2.0
        ports:
        - containerPort: 8080
          name: http
        - containerPort: 9090
          name: metrics
        env:
        - name: VACCINE_GATEWAY_URL
          value: "https://vaccine-gateway-svc.acme-petshop-prod.svc.cluster.local:8443"
        - name: KAFKA_BOOTSTRAP_SERVERS
          value: "strimzi-kafka-cluster-kafka-bootstrap.kafka-strimzi.svc:9092"
        volumeMounts:
        - name: mtls-certs
          mountPath: /certs
          readOnly: true
      volumes:
      - name: mtls-certs
        secret:
          secretName: petstore-mtls-client-certs`;
  return { ok: true, yaml };
});

ipcMain.handle('kube-rollout-restart', (_, { deployment, namespace }) => {
  return { ok: true, message: `✓ Deployment ${deployment} in namespace ${namespace} restarted successfully (rolling update triggered).` };
});

ipcMain.handle('kube-scale-deployment', (_, { deployment, namespace, replicas }) => {
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
    reply = "Cluster health is optimal. All 3 replicas of petstore-api in namespace acme-petshop-prod are in Running state with 0 restarts. CPU utilization is nominal at 14m/pod and Memory at 154Mi.";
  } else if (p.includes("helm") || p.includes("values") || p.includes("chart")) {
    reply = "Helm release acme-petshop is on Revision 4 with chart version 1.2.0. All subcharts (petstore-api, vaccine-gateway, strimzi-kafka) are healthy. Values override sets mTLS security context and Kafka bootstrap servers.";
  } else if (p.includes("argocd") || p.includes("gitops") || p.includes("sync")) {
    reply = "ArgoCD application acme-petshop-prod is Synced and Healthy against repo https://github.com/acme-corp/petstore-infra at revision main. Automated pruning is enabled.";
  } else if (p.includes("vercel") || p.includes("web") || p.includes("frontend")) {
    reply = "Vercel project acme-petshop-web is running Next.js 14 deployed to production at https://acme-petshop.vercel.app. Edge middleware is routing API calls to the Kubernetes Ingress at https://api.petshop.acme.internal.";
  } else {
    reply = `Infrastructure analysis for ${clusterId || "eks-acme-prod"} / ${namespace || "acme-petshop-prod"}: All workloads, Helm charts, and ArgoCD GitOps synchronizations are verified with 100% availability.`;
  }

  return { ok: true, reply };
});
