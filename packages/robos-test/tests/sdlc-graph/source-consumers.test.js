'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { GraphWorkspace } = require('../../../robos-graph/lib/graph-workspace');

// Exercise real store reads through registered IPC handlers, without starting Electron.
function load(appName, root, home) {
  const file = path.resolve(__dirname, '../../../', appName, 'main.js');
  const realRequire = createRequire(file);
  const handlers = new Map();
  const app = { commandLine: { appendSwitch() {} }, setPath() {}, setName() {},
    requestSingleInstanceLock: () => true, on() {}, whenReady: () => ({ then() {} }) };
  const env = { ...process.env, HOME: home };
  if (root === undefined) delete env.ROBOS_GRAPH_ROOT;
  else env.ROBOS_GRAPH_ROOT = root;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    __dirname: path.dirname(file), console, process: { env }, setTimeout,
    require(name) {
      if (name === 'electron') return { app, BrowserWindow: {}, shell: {}, ipcMain: { handle: (key, fn) => handlers.set(key, fn) } };
      if (name === 'os') return { ...os, homedir: () => home };
      if (name === 'child_process') return new Proxy({}, { get: () => () => { throw new Error('Unexpected subprocess'); } });
      if (name.includes('dom-snapshot')) throw new Error('No debug server in handler test');
      return realRequire(name);
    },
  }, { filename: file });
  return { handlers, invoke: (key, arg) => handlers.get(key)(null, arg) };
}
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-consumers-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const home = path.join(dir, 'home'); fs.mkdirSync(home);
  const root = path.join(dir, 'workspace');
  const ws = new GraphWorkspace(root); fs.mkdirSync(ws.root, { recursive: true });
  const write = nodes => fs.writeFileSync(ws.file, JSON.stringify({ ...ws.empty(), 'robos:nodes': nodes }));
  return { dir, home, root, ws, write };
}
function snapshot(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)).map(entry =>
    [entry.name, entry.isDirectory() ? snapshot(path.join(dir, entry.name)) : fs.readFileSync(path.join(dir, entry.name), 'utf8')]);
}
const node = (id, type) => ({ '@id': `urn:example:${id}`, '@type': type, 'dcterms:title': id, 'robos:package': 'core-platform' });
for (const appName of ['kube-studio', 'data-sources']) {
  const read = appName === 'kube-studio' ? 'kube-get-clusters' : 'ds-get-datasources';
  const rows = result => appName === 'kube-studio' ? result.clusters : result;
  test(`${appName}: external inventory is exact, reloads and never writes or seeds`, t => {
    const f = fixture(t);
    const n = node('cluster:one', appName === 'kube-studio' ? 'robos:KubernetesCluster' : ['robos:NoSQLDatabase']);
    f.write([n]); const before = snapshot(f.dir);
    const api = load(appName, f.root, f.home);
    const result = rows(api.invoke(read));
    assert.equal(result.length, 1); assert.equal(result[0].id, n['@id']);
    assert.equal(result[0].status, 'Unknown'); assert.equal(result[0].sourceOnly, true);
    assert.equal(appName === 'kube-studio' ? result[0].nodeCount : result[0].latencyMs, null);
    assert.deepEqual(snapshot(f.dir), before);
    f.write([]); const emptyBefore = snapshot(f.dir);
    assert.equal(rows(api.invoke(read)).length, 0);
    assert.deepEqual(snapshot(f.dir), emptyBefore);
    fs.writeFileSync(f.ws.file, '{bad json');
    assert.throws(() => api.invoke(read));
    fs.unlinkSync(f.ws.file);
    assert.throws(() => api.invoke(read), /unavailable/);
  });
  test(`${appName}: missing and blank explicit roots fail without fallback`, t => {
    const f = fixture(t); const before = snapshot(f.dir);
    for (const root of ['', path.join(f.dir, 'missing')]) {
      assert.throws(() => load(appName, root, f.home).invoke(read), /available/);
    }
    assert.deepEqual(snapshot(f.dir), before);
  });
  test(`${appName}: all legacy mutation and simulated probe channels are blocked`, async t => {
    const f = fixture(t); f.write([]); const before = snapshot(f.dir);
    const api = load(appName, f.root, f.home);
    const reads = new Set(['kube-get-clusters', 'kube-get-kgraph-apps', 'kube-get-namespaces', 'kube-get-resources', 'kube-get-helm-releases', 'kube-get-argocd-apps', 'ds-get-datasources', 'ds-get-drivers', 'open-url']);
    for (const channel of api.handlers.keys()) {
      if (!reads.has(channel)) await assert.rejects(async () => api.invoke(channel, {}), /graph review workflow/);
    }
    assert.deepEqual(snapshot(f.dir), before);
  });
}
test('legacy data-source reads still provide the original local catalog without an external root', async t => {
  const f = fixture(t);
  const sources = await load('data-sources', undefined, f.home).invoke('ds-get-datasources');
  assert.equal(sources.length, 5); assert.equal(sources[0].status, 'Connected');
});

test('logical datastores and brokers retain evidence with no invented connection facts', t => {
  const f = fixture(t);
  const evidence = [{ repository: 'example', path: 'config.yaml', line: 1 }];
  f.write([
    { ...node('db:sql', 'robos:DataStore'), 'robos:engine': 'PostgreSQL', 'robos:evidence': evidence, 'robos:boundServices': [{ '@id': 'urn:example:service:api' }] },
    { ...node('db:cache', ['robos:DataStore']), 'robos:engine': 'Redis' },
    { ...node('broker:events', 'robos:BrokerDefinition'), 'robos:brokerType': 'NATS' },
    { ...node('db:unclassified', 'robos:DataStore'), 'robos:engine': 'custom-engine' },
    node('db:table', 'robos:DatabaseTable'),
  ]);
  const before = snapshot(f.dir);
  const result = load('data-sources', f.root, f.home).invoke('ds-get-datasources');
  assert.equal(result.length, 4);
  const sql = result.find(ds => ds.id === 'urn:example:db:sql');
  const cache = result.find(ds => ds.id === 'urn:example:db:cache');
  const broker = result.find(ds => ds.id === 'urn:example:broker:events');
  assert.equal(sql.driverType, 'postgres'); assert.equal(sql.category, 'sql');
  assert.equal(sql.boundServices[0], 'urn:example:service:api');
  assert.deepEqual(sql['robos:evidence'], evidence);
  assert.equal(cache.category, 'nosql');
  assert.equal(broker.driverType, 'nats'); assert.equal(broker.category, 'streaming');
  assert.equal(result.find(ds => ds.id === 'urn:example:db:unclassified').category, null);
  for (const ds of result) {
    for (const field of ['host', 'port', 'database', 'latencyMs', 'lastChecked']) assert.equal(ds[field], null);
    assert.equal(ds.status, 'Unknown'); assert.equal(ds.sourceOnly, true);
  }
  assert.deepEqual(snapshot(f.dir), before);
});

test('Kube definitions stay source-only and namespace filtering never fabricates membership', t => {
  const f = fixture(t);
  f.write([
    { ...node('chart:web', 'robos:SourceArtifact'), 'robos:sourceKind': 'helm-chart', 'robos:declaredName': 'web', 'robos:version': '1.0.0' },
    { ...node('deployment:web', 'robos:GitOpsDeployment'), 'robos:gitopsEngine': 'argocd' },
    { ...node('deployment:other', 'robos:GitOpsDeployment'), 'robos:gitopsEngine': 'flux' },
    { ...node('namespace:one', 'robos:KubernetesNamespace'), 'robos:namespaceName': 'one', 'robos:namespaceOfCluster': { '@id': 'urn:example:cluster:one' } },
    { ...node('resource:web', 'robos:KubernetesDeployment'), 'robos:inNamespace': { '@id': 'urn:example:namespace:one' } },
    node('resource:unresolved', 'robos:KubernetesDeployment'),
    node('environment:dev', 'robos:EnvironmentProfile'),
  ]);
  const before = snapshot(f.dir);
  const api = load('kube-studio', f.root, f.home);
  assert.equal(api.invoke('kube-get-clusters').clusters.length, 0);
  const helm = api.invoke('kube-get-helm-releases');
  assert.equal(helm.definitionOnly, true); assert.equal(helm.releases.length, 1);
  assert.equal(helm.releases[0].name, 'web'); assert.equal(helm.releases[0].version, '1.0.0');
  assert.equal(helm.releases[0].revision, null); assert.equal(helm.releases[0].status, 'Unknown');
  const argo = api.invoke('kube-get-argocd-apps').apps;
  assert.equal(argo.length, 1); assert.equal(argo[0].syncStatus, 'Unknown'); assert.equal(argo[0].health, 'Unknown');
  assert.equal(api.invoke('kube-get-resources', { kind: 'deployments' }).items.length, 2);
  assert.equal(api.invoke('kube-get-resources', { kind: 'deployments', clusterId: 'urn:example:cluster:one', namespace: 'one' }).items.length, 1);
  assert.equal(api.invoke('kube-get-resources', { kind: 'deployments', clusterId: 'urn:example:cluster:other', namespace: 'one' }).items.length, 0);
  assert.deepEqual(snapshot(f.dir), before);
});
