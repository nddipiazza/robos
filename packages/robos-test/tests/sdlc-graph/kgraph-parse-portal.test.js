'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { SHACLValidator } = require('../../../robos-graph/lib/shacl-validator');
const { SDLCKnowledgeGraphStore } = require('../../../robos-graph/lib/graph-store');
const {
  detectDirectoryArchetype,
  classifyFile,
  computeSha256,
  scanPathToGraphNodes,
} = require('../../../kgraph-parse-portal/lib/fs-mime-classifier');
const { TikaGrpcConnector } = require('../../../kgraph-parse-portal/lib/tika-grpc-connector');
const {
  BUILDBARN_OCI_CHART,
  generateBuildbarnHelmValues,
  generateHelmInstallCommand,
  checkRbeClusterStatus,
  generateKgraphClusterNode,
} = require('../../../kgraph-parse-portal/lib/buildbarn-rbe');
const { LuxirSearchBridge } = require('../../../kgraph-parse-portal/lib/luxir-search-bridge');
const { ParsePortalServer } = require('../../../kgraph-parse-portal/server');

describe('RobOS KGraph Parse Portal & Heavy-Scale Connectors Test Suite', () => {
  const validator = new SHACLValidator();
  let tempDir;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parse-portal-test-'));
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('1. RobOS Project & Application Registration in Knowledge Graph', () => {
    const graphFile = path.resolve(__dirname, '../../../../.robos/knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath: graphFile, rootDir: path.dirname(graphFile) });

    it('verifies urn:robos:project:robos-kgraph-parse-portal exists and conforms to ProjectShape', () => {
      const projectNode = store.getNode('urn:robos:project:robos-kgraph-parse-portal');
      assert.ok(projectNode, 'Project node must exist in Knowledge Graph');
      assert.strictEqual(projectNode['dcterms:title'], 'RobOS Kgraph Parse Portal');
      assert.strictEqual(projectNode['robos:status'], 'active');

      const res = validator.validate([projectNode]);
      assert.strictEqual(res.conforms, true, 'Project node must satisfy SHACL constraints');
      assert.strictEqual(res.violations.length, 0);
    });

    it('verifies urn:robos:app:kgraph-parse-portal exists and conforms to DesktopAppShape', () => {
      const appNode = store.getNode('urn:robos:app:kgraph-parse-portal');
      assert.ok(appNode, 'Application node must exist in Knowledge Graph');
      assert.strictEqual(appNode['dcterms:title'], 'RobOS Kgraph Parse Portal');
      assert.strictEqual(appNode['robos:desktopFramework'], 'Electron');
      assert.strictEqual(appNode['robos:hasProject'], 'urn:robos:project:robos-kgraph-parse-portal');

      const res = validator.validate([appNode]);
      assert.strictEqual(res.conforms, true, 'App node must satisfy SHACL constraints');
      assert.strictEqual(res.violations.length, 0);
    });

    it('verifies robos-kgraph-parse-portal is registered in ~/.config/robos/git-projects.json', () => {
      const gitProjectsPath = path.join(os.homedir(), '.config', 'robos', 'git-projects.json');
      if (fs.existsSync(gitProjectsPath)) {
        const data = JSON.parse(fs.readFileSync(gitProjectsPath, 'utf8'));
        const found = data.projects.find(p => p.id === 'p-kgraph-parse-portal' || p.label === 'robos-kgraph-parse-portal');
        assert.ok(found, 'robos-kgraph-parse-portal must be in git-projects.json');
        assert.strictEqual(found.label, 'robos-kgraph-parse-portal');
      }
    });
  });

  describe('2. Project Archetype Detection from Directory Markers', () => {
    it('detects Bazel and Buck2 monorepos', () => {
      const bazelDir = path.join(tempDir, 'bazel-proj');
      fs.mkdirSync(bazelDir);
      fs.writeFileSync(path.join(bazelDir, 'MODULE.bazel'), 'module(name = "my-mono")');
      const bRes = detectDirectoryArchetype(bazelDir);
      assert.strictEqual(bRes.archetype, 'bazel-monorepo');
      assert.strictEqual(bRes.buildSystem, 'Bazel');

      const buckDir = path.join(tempDir, 'buck2-proj');
      fs.mkdirSync(buckDir);
      fs.writeFileSync(path.join(buckDir, '.buckconfig'), '[cells]');
      const buckRes = detectDirectoryArchetype(buckDir);
      assert.strictEqual(buckRes.archetype, 'buck2-monorepo');
      assert.strictEqual(buckRes.buildSystem, 'Buck2');
    });

    it('detects Maven, Gradle, Cargo, and Go projects', () => {
      const mavenDir = path.join(tempDir, 'maven-proj');
      fs.mkdirSync(mavenDir);
      fs.writeFileSync(path.join(mavenDir, 'pom.xml'), '<project></project>');
      assert.strictEqual(detectDirectoryArchetype(mavenDir).archetype, 'maven-java');

      const cargoDir = path.join(tempDir, 'cargo-proj');
      fs.mkdirSync(cargoDir);
      fs.writeFileSync(path.join(cargoDir, 'Cargo.toml'), '[package]\nname = "test"');
      assert.strictEqual(detectDirectoryArchetype(cargoDir).archetype, 'cargo-rust');

      const goDir = path.join(tempDir, 'go-proj');
      fs.mkdirSync(goDir);
      fs.writeFileSync(path.join(goDir, 'go.mod'), 'module example.com/test');
      assert.strictEqual(detectDirectoryArchetype(goDir).archetype, 'go-module');
    });

    it('detects Godot 4 and Helm chart projects', () => {
      const godotDir = path.join(tempDir, 'godot-proj');
      fs.mkdirSync(godotDir);
      fs.writeFileSync(path.join(godotDir, 'project.godot'), 'config_version=5');
      assert.strictEqual(detectDirectoryArchetype(godotDir).archetype, 'godot-game');

      const helmDir = path.join(tempDir, 'helm-proj');
      fs.mkdirSync(helmDir);
      fs.writeFileSync(path.join(helmDir, 'Chart.yaml'), 'name: my-chart\nversion: 1.0.0');
      assert.strictEqual(detectDirectoryArchetype(helmDir).archetype, 'helm-chart');
    });
  });

  describe('3. Linux Filesystem MIME & Semantic Disambiguation', () => {
    it('disambiguates JSON into manifests, configs, contracts, and schema', () => {
      const pkgRes = classifyFile('package.json', null, '{"name": "test-pkg", "scripts": {"test": "echo 1"}}');
      assert.strictEqual(pkgRes.semanticType, 'robos:NodeManifest');
      assert.strictEqual(pkgRes.rawMime, 'application/json');

      const tsRes = classifyFile('tsconfig.json', null, '{"compilerOptions": {}}');
      assert.strictEqual(tsRes.semanticType, 'robos:TypeScriptConfig');

      const openapiJsonRes = classifyFile('openapi.json', null, '{"openapi": "3.1.0", "info": {}}');
      assert.strictEqual(openapiJsonRes.semanticType, 'robos:Contract');
      assert.strictEqual(openapiJsonRes.protocol, 'OpenAPI');
    });

    it('disambiguates YAML into Helm charts, Helm values, CI/CD pipelines, and Kubernetes manifests', () => {
      const chartRes = classifyFile('Chart.yaml', null, 'name: test\nversion: 1.0.0');
      assert.strictEqual(chartRes.semanticType, 'robos:HelmChartDefinition');

      const valRes = classifyFile('values.yaml', null, 'replicaCount: 2');
      assert.strictEqual(valRes.semanticType, 'robos:HelmValues');

      const cicdRes = classifyFile('.github/workflows/ci.yml', null, 'name: CI');
      assert.strictEqual(cicdRes.semanticType, 'robos:CICDPipeline');

      const k8sRes = classifyFile('deployment.yaml', null, 'apiVersion: apps/v1\nkind: Deployment');
      assert.strictEqual(k8sRes.semanticType, 'robos:KubernetesManifest');
      assert.strictEqual(k8sRes.kubernetesKind, 'Deployment');
    });

    it('disambiguates Protobuf, GraphQL, Gherkin, Systemd services, and ELF binaries', () => {
      const protoRes = classifyFile('order.proto', null, 'syntax = "proto3";\nmessage Order {}');
      assert.strictEqual(protoRes.semanticType, 'robos:ProtobufContract');
      assert.strictEqual(protoRes.protocol, 'gRPC/Protobuf');

      const gqlRes = classifyFile('schema.graphql', null, 'type Query { getOrder: Order }');
      assert.strictEqual(gqlRes.semanticType, 'robos:GraphQLContract');

      const bddRes = classifyFile('checkout.feature', null, 'Feature: Checkout');
      assert.strictEqual(bddRes.semanticType, 'robos:GherkinFeature');

      const sysRes = classifyFile('worker.service', null, '[Unit]\nDescription=Worker Service');
      assert.strictEqual(sysRes.semanticType, 'robos:SystemdService');

      // ELF executable header
      const elfBuf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
      const elfRes = classifyFile('/usr/bin/my-app', null, elfBuf);
      assert.strictEqual(elfRes.semanticType, 'robos:BinaryExecutable');
    });

    it('scans a real directory tree attaching cryptographic robos:evidence', () => {
      const scanDir = path.join(tempDir, 'sample-scan');
      fs.mkdirSync(scanDir);
      fs.writeFileSync(path.join(scanDir, 'package.json'), '{"name":"scan-test"}');
      fs.writeFileSync(path.join(scanDir, 'api.proto'), 'syntax="proto3";');
      fs.writeFileSync(path.join(scanDir, 'README.md'), '# Architecture');

      const res = scanPathToGraphNodes(scanDir, { maxDepth: 2, repository: 'sample-repo' });
      assert.ok(res.nodes.length >= 4);

      for (const node of res.nodes) {
        assert.ok(node['robos:evidence'], `Node ${node['@id']} must have robos:evidence`);
        assert.ok(node['robos:evidence'][0].sha256, `Node ${node['@id']} must have sha256 evidence`);
        assert.strictEqual(node['robos:evidence'][0].repository, 'sample-repo');
      }

      // Check SHACL compliance
      const valRes = validator.validate(res.nodes);
      assert.strictEqual(valRes.conforms, true, 'Extracted scan nodes must conform to SHACL');
    });
  });

  describe('4. Apache Tika 4.0 Streaming gRPC & AST Symbol Extraction', () => {
    const tika = new TikaGrpcConnector();

    it('extracts AST symbols for JavaScript, Python, Java, and Protobuf', () => {
      const jsCode = `
        class PaymentGateway extends BaseGateway {
          constructor() {}
        }
        function processPayment(orderId) {}
        const refundTx = async () => {};
        interface PaymentResult {}
      `;
      const jsSymbols = tika.extractAstSymbols(jsCode, '.ts');
      assert.ok(jsSymbols.some(s => s.type === 'class' && s.name === 'PaymentGateway'));
      assert.ok(jsSymbols.some(s => s.type === 'function' && s.name === 'processPayment'));
      assert.ok(jsSymbols.some(s => s.type === 'typeDefinition' && s.name === 'PaymentResult'));

      const protoCode = `
        syntax = "proto3";
        service OrderService {
          rpc CreateOrder (OrderRequest) returns (OrderResponse);
        }
        message OrderRequest { string id = 1; }
      `;
      const protoSymbols = tika.extractAstSymbols(protoCode, '.proto');
      assert.ok(protoSymbols.some(s => s.type === 'service' && s.name === 'OrderService'));
      assert.ok(protoSymbols.some(s => s.type === 'message' && s.name === 'OrderRequest'));
      assert.ok(protoSymbols.some(s => s.type === 'rpc' && s.name === 'CreateOrder'));
    });

    it('parses documents seamlessly with offline fallback', async () => {
      const doc = await tika.parseDocument('Hello RobOS Knowledge Graph', { fileName: 'test.txt' });
      assert.strictEqual(doc.text, 'Hello RobOS Knowledge Graph');
      assert.strictEqual(doc.mimeType, 'text/plain');
      assert.ok(doc.source.includes('tika'));
    });
  });

  describe('5. Hermetiq Buildbarn Helm Integration (REAPI v2 RBE)', () => {
    it('generates customized Helm values referencing oci://ghcr.io/hermetiq/buildbarn', () => {
      const valuesYaml = generateBuildbarnHelmValues({
        clusterName: 'test-buildbarn-rbe',
        replicaCount: 3,
        storageCapacity: '50Gi',
      });
      assert.ok(valuesYaml.includes(BUILDBARN_OCI_CHART));
      assert.ok(valuesYaml.includes('test-buildbarn-rbe'));
      assert.ok(valuesYaml.includes('50Gi'));
      assert.ok(valuesYaml.includes('bbStorage'));
      assert.ok(valuesYaml.includes('bbScheduler'));
      assert.ok(valuesYaml.includes('bbWorker'));
      assert.ok(valuesYaml.includes('bbFrontend'));
    });

    it('generates the correct Helm CLI install command', () => {
      const cmd = generateHelmInstallCommand({
        releaseName: 'prod-buildbarn',
        namespace: 'buildbarn-rbe',
        valuesFile: 'my-values.yaml',
      });
      assert.strictEqual(
        cmd,
        `helm upgrade --install prod-buildbarn ${BUILDBARN_OCI_CHART} --namespace buildbarn-rbe --create-namespace -f my-values.yaml`
      );
    });

    it('generates a SHACL-compliant RemoteExecutionCluster node', () => {
      const clusterNode = generateKgraphClusterNode({
        clusterId: 'test-rbe-cluster',
        title: 'Production Buildbarn RBE',
      });
      assert.strictEqual(clusterNode['@id'], 'urn:robos:cluster:test-rbe-cluster');
      assert.strictEqual(clusterNode['robos:protocol'], 'REAPI_v2');
      assert.strictEqual(clusterNode['robos:provider'], 'buildbarn');

      const res = validator.validate([clusterNode]);
      assert.strictEqual(res.conforms, true, 'RemoteExecutionCluster node must conform to SHACL');
      assert.strictEqual(res.violations.length, 0);
    });
  });

  describe('6. Luxir Search Bridge & Hybrid Querying', () => {
    const bridge = new LuxirSearchBridge();

    it('indexes nodes and queries by query string and faceted filters', async () => {
      const testNodes = [
        {
          '@id': 'urn:robos:file:api:user-service.proto',
          '@type': ['robos:ProtobufContract', 'robos:Contract', 'schema:CreativeWork'],
          'dcterms:title': 'user-service.proto',
          'dcterms:description': 'gRPC user authentication and profile stubs',
          'robos:mimeType': 'text/x-protobuf',
          'robos:semanticRole': 'gRPC Microservice Contract',
          'robos:protocol': 'gRPC/Protobuf',
        },
        {
          '@id': 'urn:robos:file:billing:package.json',
          '@type': ['robos:NodeManifest', 'robos:SourceArtifact', 'schema:CreativeWork'],
          'dcterms:title': 'package.json',
          'dcterms:description': 'Billing service dependencies',
          'robos:mimeType': 'application/json',
          'robos:semanticRole': 'Node.js Package Manifest',
        },
      ];

      const indexedCount = await bridge.indexNodes(testNodes);
      assert.strictEqual(indexedCount, 2);

      // Search full text
      const res1 = await bridge.search('authentication');
      assert.strictEqual(res1.length, 1);
      assert.strictEqual(res1[0].id, 'urn:robos:file:api:user-service.proto');

      // Search faceted by protocol
      const res2 = await bridge.search('', { protocol: 'gRPC/Protobuf' });
      assert.strictEqual(res2.length, 1);

      // Search faceted by type
      const res3 = await bridge.search('', { type: 'NodeManifest' });
      assert.strictEqual(res3.length, 1);
      assert.strictEqual(res3[0].id, 'urn:robos:file:billing:package.json');
    });
  });

  describe('7. ParsePortalServer REST API Server Lifecycle', () => {
    let server;
    const testPort = 19199;

    before(async () => {
      server = new ParsePortalServer({ port: testPort });
      await server.start();
    });

    after(async () => {
      if (server) await server.stop();
    });

    it('responds to GET /api/v1/status with health and connector states', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/v1/status`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ok, true);
      assert.strictEqual(data.service, 'RobOS Kgraph Parse Portal');
      assert.ok(data.buildbarn.chart.includes('buildbarn'));
    });

    it('responds to POST /api/v1/parse and returns extracted node', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/v1/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'user.proto',
          content: 'syntax = "proto3"; service UserService { rpc GetUser(Id) returns (User); }',
        }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ok, true);
      assert.strictEqual(data.graphNode['robos:protocol'], 'gRPC/Protobuf');
      assert.ok(data.parseResult.astSymbols.length >= 1);
    });

    it('responds to POST /api/v1/rbe/values with Helm chart parameters', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/v1/rbe/values`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterName: 'api-rbe-test' }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ok, true);
      assert.ok(data.valuesYaml.includes('api-rbe-test'));
      assert.ok(data.installCommand.includes(BUILDBARN_OCI_CHART));
    });
  });
});
