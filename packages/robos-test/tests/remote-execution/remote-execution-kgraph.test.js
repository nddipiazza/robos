'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { SDLCKnowledgeGraphStore } = require('../../../robos-graph/lib/graph-store');
const { SHACLValidator } = require('../../../robos-graph/lib/shacl-validator');
const { OSLCGraphParser, OSLC_CONTEXT } = require('../../../robos-graph/lib/oslc-parser');
const { KGraphPackageManager } = require('../../../robos-graph/lib/package-manager');

describe('REAPI v2 Distributed Build & Buildbarn KGraph Engine Suite', () => {

  it('1. Enforces SHACL RemoteExecutionClusterShape constraints', () => {
    const validator = new SHACLValidator();

    // Invalid cluster node: missing executionEndpoint and casEndpoint
    const invalidCluster = {
      '@id': 'urn:robos:remote-execution:broken-cluster',
      '@type': ['robos:RemoteExecutionCluster'],
      'dcterms:title': 'Broken REAPI Cluster',
      'robos:protocol': 'REAPI_v2',
      'robos:provider': 'buildbarn',
    };

    const invalidRes = validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      'robos:nodes': [invalidCluster],
    }));

    assert.strictEqual(invalidRes.conforms, false);
    assert.ok(invalidRes.results.some(r => r.path === 'robos:executionEndpoint'));
    assert.ok(invalidRes.results.some(r => r.path === 'robos:casEndpoint'));

    // Valid cluster node
    const validCluster = {
      '@id': 'urn:robos:remote-execution:valid-cluster',
      '@type': ['robos:RemoteExecutionCluster'],
      'dcterms:title': 'Valid Buildbarn REAPI Cluster',
      'robos:protocol': 'REAPI_v2',
      'robos:provider': 'buildbarn',
      'robos:executionEndpoint': 'grpc://re-execution.buildbarn.internal:8980',
      'robos:casEndpoint': 'grpc://re-cas.buildbarn.internal:8980',
    };

    const validRes = validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      'robos:nodes': [validCluster],
    }));

    assert.strictEqual(validRes.conforms, true);
    assert.strictEqual(validRes.results.length, 0);
  });

  it('2. Enforces SHACL BuildSystemShape constraints', () => {
    const validator = new SHACLValidator();

    // Invalid build system: missing buildTool and configFile
    const invalidBuildSystem = {
      '@id': 'urn:robos:build-system:broken-system',
      '@type': ['robos:BuildSystem'],
      'dcterms:title': 'Broken Build System',
    };

    const invalidRes = validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      'robos:nodes': [invalidBuildSystem],
    }));

    assert.strictEqual(invalidRes.conforms, false);
    assert.ok(invalidRes.results.some(r => r.path === 'robos:buildTool'));
    assert.ok(invalidRes.results.some(r => r.path === 'robos:configFile'));

    // Valid Bazel BuildSystem
    const validBazel = {
      '@id': 'urn:robos:build-system:acme-bazel',
      '@type': ['robos:BuildSystem'],
      'dcterms:title': 'Acme Backend Monorepo (Bazel)',
      'robos:buildTool': 'bazel',
      'robos:configFile': '.bazelrc',
    };

    const validRes = validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      'robos:nodes': [validBazel],
    }));

    assert.strictEqual(validRes.conforms, true);
  });

  it('3. Creates, validates and queries RemoteExecutionCluster and BuildSystem in SDLCKnowledgeGraphStore', () => {
    const store = new SDLCKnowledgeGraphStore();

    // Register REAPI cluster
    const clusterRes = store.createRemoteExecutionCluster({
      slug: 'test-reapi-pool',
      title: 'Test REAPI Distributed Build Cluster',
      provider: 'buildbarn',
      executionEndpoint: 'grpc://re-exec.internal:8980',
      casEndpoint: 'grpc://re-cas.internal:8980',
      browserEndpoint: 'http://re-browser.internal:7984',
      workerPools: [
        {
          name: 'linux-x86_64-fast',
          osFamily: 'linux',
          isa: 'x86-64',
          containerImage: 'docker://debian:latest',
          concurrency: 48,
        },
      ],
    });

    assert.strictEqual(clusterRes.ok, true);
    assert.strictEqual(clusterRes.node['robos:protocol'], 'REAPI_v2');
    assert.strictEqual(clusterRes.node['robos:package'], 'devops');

    // Register Bazel build system
    const bazelRes = store.createBuildSystem({
      slug: 'test-bazel-monorepo',
      title: 'Test Bazel Monorepo',
      buildTool: 'bazel',
      hasRemoteExecution: clusterRes.node['@id'],
    });

    assert.strictEqual(bazelRes.ok, true);
    assert.strictEqual(bazelRes.node['robos:buildTool'], 'bazel');
    assert.strictEqual(bazelRes.node['robos:configFile'], '.bazelrc');
    assert.strictEqual(bazelRes.node['robos:package'], 'core-platform');

    // Register Buck2 build system
    const buck2Res = store.createBuildSystem({
      slug: 'test-buck2-monorepo',
      title: 'Test Buck2 Monorepo',
      buildTool: 'buck2',
      hasRemoteExecution: clusterRes.node['@id'],
    });

    assert.strictEqual(buck2Res.ok, true);
    assert.strictEqual(buck2Res.node['robos:buildTool'], 'buck2');
    assert.strictEqual(buck2Res.node['robos:configFile'], '.buckconfig');

    // Queries
    const clusters = store.getRemoteExecutionClusters();
    assert.ok(clusters.length >= 1);
    assert.ok(store.getRemoteExecutionCluster('test-reapi-pool') !== null);

    const buildSystems = store.getBuildSystems();
    assert.ok(buildSystems.length >= 2);
    assert.ok(store.getBuildSystem('test-bazel-monorepo') !== null);
    assert.ok(store.getBuildSystem('test-buck2-monorepo') !== null);
  });

  it('4. Generates valid Bazel .bazelrc configuration for REAPI v2', () => {
    const store = new SDLCKnowledgeGraphStore();
    const cluster = {
      '@id': 'urn:robos:remote-execution:test-cluster',
      'robos:provider': 'buildbarn',
      'robos:instanceName': 'prod-cluster',
      'robos:executionEndpoint': 'grpc://re-exec.buildbarn.corp:8980',
      'robos:casEndpoint': 'grpc://re-cas.buildbarn.corp:8980',
      'robos:workerPools': [
        {
          osFamily: 'linux',
          containerImage: 'docker://gcr.io/distroless/cc:latest',
        },
      ],
    };

    const bazelrc = store.generateBazelrc(cluster);

    assert.ok(bazelrc.includes('build:remote --remote_executor=grpc://re-exec.buildbarn.corp:8980'));
    assert.ok(bazelrc.includes('build:remote --remote_cache=grpc://re-cas.buildbarn.corp:8980'));
    assert.ok(bazelrc.includes('build:remote --remote_instance_name=prod-cluster'));
    assert.ok(bazelrc.includes('build:remote --remote_default_exec_properties=OSFamily=linux'));
    assert.ok(bazelrc.includes('build:remote --remote_default_exec_properties=container-image=docker://gcr.io/distroless/cc:latest'));
    assert.ok(bazelrc.includes('build:remote --remote_download_minimal'));
    assert.ok(bazelrc.includes('build:remote --remote_upload_local_results=true'));
    assert.ok(bazelrc.includes('build:cache --remote_cache=grpc://re-cas.buildbarn.corp:8980'));
  });

  it('5. Generates valid Buck2 .buckconfig configuration for REAPI v2', () => {
    const store = new SDLCKnowledgeGraphStore();
    const cluster = {
      '@id': 'urn:robos:remote-execution:test-cluster',
      'robos:provider': 'buildbarn',
      'robos:instanceName': 'prod-cluster',
      'robos:executionEndpoint': 'grpc://re-exec.buildbarn.corp:8980',
      'robos:casEndpoint': 'grpc://re-cas.buildbarn.corp:8980',
      'robos:actionCacheEndpoint': 'grpc://re-ac.buildbarn.corp:8980',
      'robos:tlsEnabled': false,
    };

    const buckconfig = store.generateBuckconfig(cluster);

    assert.ok(buckconfig.includes('[buck2_re_client]'));
    assert.ok(buckconfig.includes('engine_address = re-exec.buildbarn.corp:8980'));
    assert.ok(buckconfig.includes('action_cache_address = re-ac.buildbarn.corp:8980'));
    assert.ok(buckconfig.includes('cas_address = re-cas.buildbarn.corp:8980'));
    assert.ok(buckconfig.includes('instance_name = prod-cluster'));
    assert.ok(buckconfig.includes('use_tls = false'));
    assert.ok(buckconfig.includes('[buck2]'));
    assert.ok(buckconfig.includes('remote_execution = true'));
  });

  it('6. Generates modular Buildbarn microservice configurations (bb-storage, bb-scheduler, bb-worker, bb-runner, bb-browser)', () => {
    const store = new SDLCKnowledgeGraphStore();
    const cluster = {
      'robos:instanceName': 'main',
      'robos:executionEndpoint': 'grpc://re-exec.buildbarn.internal:8980',
      'robos:casEndpoint': 'grpc://re-cas.buildbarn.internal:8980',
    };

    const configs = store.generateBuildbarnConfigs(cluster);

    // bb-storage
    assert.ok(configs.storage.contentAddressableStorage.circular.maximumSize > 0);
    assert.ok(configs.storage.actionCache.completenessChecking);
    assert.strictEqual(configs.storage.grpcServers[0].listenAddresses[0], ':8980');

    // bb-scheduler
    assert.strictEqual(configs.scheduler.client.listenAddresses[0], ':8982');
    assert.strictEqual(configs.scheduler.worker.listenAddresses[0], ':8983');
    assert.strictEqual(configs.scheduler.contentAddressableStorage.endpoint.address, 're-cas.buildbarn.internal:8980');

    // bb-worker
    assert.strictEqual(configs.worker.blobstore.contentAddressableStorage.endpoint.address, 're-cas.buildbarn.internal:8980');
    assert.strictEqual(configs.worker.runner.endpoint.address, 'unix:///tmp/buildbarn/runner.sock');
    assert.strictEqual(configs.worker.concurrency, 16);

    // bb-runner
    assert.strictEqual(configs.runner.listenPath, '/tmp/buildbarn/runner.sock');

    // bb-browser
    assert.strictEqual(configs.browser.listenAddress, ':7984');
  });

  it('7. Supports alternative provider (NativeLink) with zero vendor lock-in', () => {
    const store = new SDLCKnowledgeGraphStore();
    const nativelinkConfig = store.generateNativeLinkConfig();

    assert.ok(nativelinkConfig.cas.main.filesystem.content_path);
    assert.ok(nativelinkConfig.ac.main.filesystem.content_path);
    assert.strictEqual(nativelinkConfig.servers[0].listen_address, '0.0.0.0:8980');
    assert.strictEqual(nativelinkConfig.servers[0].services.execution.scheduler, 'main');
  });

  it('8. Packages route correctly into modular KGraph packages (devops & core-platform)', () => {
    const pm = new KGraphPackageManager({ baseDir: '.robos' });

    const clusterNode = {
      '@id': 'urn:robos:remote-execution:routed-cluster',
      '@type': ['robos:RemoteExecutionCluster'],
      'dcterms:title': 'Routed Cluster',
    };
    const clusterPkg = pm.inferPackageForNode(clusterNode);
    assert.strictEqual(clusterPkg, 'devops');

    const buildSystemNode = {
      '@id': 'urn:robos:build-system:routed-bazel',
      '@type': ['robos:BuildSystem'],
      'dcterms:title': 'Routed Bazel Monorepo',
    };
    const buildSysPkg = pm.inferPackageForNode(buildSystemNode);
    assert.strictEqual(buildSysPkg, 'core-platform');
  });
});
