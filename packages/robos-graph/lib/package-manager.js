'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { OSLC_CONTEXT } = require('./oslc-parser');

const DEFAULT_PACKAGES = [
  {
    id: 'core-platform',
    namespace: 'robos.platform',
    title: 'RobOS Platform Core & Base SDLC Architecture',
    description: 'Foundational architectural graph, system roots, and platform configuration.',
  },
  {
    id: 'organization',
    namespace: 'robos.org',
    title: 'Enterprise Organization, Teams & Personas',
    description: 'People, developer profiles, team topologies, and cross-team communication channels.',
  },
  {
    id: 'services',
    namespace: 'robos.services',
    title: 'Microservices, Web APIs & Interface Contracts',
    description: 'Backend microservices, OpenAPI 3.1 specifications, gRPC reflection stubs, and BDD verification features.',
  },
  {
    id: 'applications',
    namespace: 'robos.apps',
    title: 'Client Applications, Web Frontends & Games',
    description: 'Front-end SPAs, desktop workstations, PC & mobile games, mobile apps, and CLI tools.',
  },
  {
    id: 'devops',
    namespace: 'robos.devops',
    title: 'DevOps Accounts, Cloud Infrastructure & Pass Credentials',
    description: 'Cloud providers, CI/CD pipelines, container registries, OAuth apps, DNS domains, and secure GPG pass credentials.',
  },
  {
    id: 'learning',
    namespace: 'robos.learning',
    title: 'Interactive eLearning Curriculums & Knowledge Modules',
    description: 'Interactive developer courses, tutorials, and architectural training modules.',
  },
  {
    id: 'documentation',
    namespace: 'robos.docs',
    title: 'Living Documentation, Visual Architecture & Flow Diagrams',
    description: 'Living documentation pages, architecture decision records (ADRs), interactive walkthroughs, and visual flow diagrams with AI illustrations.',
  },
];

class KGraphPackageManager {
  constructor(options = {}) {
    this.baseDir = options.baseDir || options.rootDir || path.join(process.cwd(), '.robos');
    this.packagesDir = options.packagesDir || path.join(this.baseDir, 'kgraphs');
    this.manifestPath = options.manifestPath || path.join(this.baseDir, 'kgraph.yaml');
    this.aggregatedFilePath = options.aggregatedFilePath || path.join(this.baseDir, 'knowledge-graph.jsonld');
    this.packages = new Map(); // packageId -> { metadata, nodes: [] }
    this.nodeToPackage = new Map(); // nodeId -> packageId
    this.dirtyPackages = new Set();
    this.initialized = false;
    this.loadPackages();
  }

  ensureDirs() {
    fs.mkdirSync(this.baseDir, { recursive: true });
    fs.mkdirSync(this.packagesDir, { recursive: true });
    for (const p of DEFAULT_PACKAGES) {
      fs.mkdirSync(path.join(this.packagesDir, p.id), { recursive: true });
    }
  }

  inferPackageForNode(node) {
    if (!node) return 'core-platform';
    if (node['robos:package']) return node['robos:package'];

    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type'] || ''];
    const typeStr = types.join(' ');

    if (typeStr.includes('FlowDiagram') || typeStr.includes('DocumentationPage') || typeStr.includes('DocArticle') || typeStr.includes('ArchitectureDecisionRecord') || typeStr.includes('ADR') || typeStr.includes('InteractiveWalkthrough') || typeStr.includes('CodeSnippet') || typeStr.includes('CodeSample') || typeStr.includes('ApiGuide')) {
      return 'documentation';
    }
    if (typeStr.includes('Person') || typeStr.includes('Developer') || typeStr.includes('Team') || typeStr.includes('GitProjectOrganization') || typeStr.includes('GitOrganization') || typeStr.includes('Company') || typeStr.includes('AgentPersona') || typeStr.includes('AIAgent') || typeStr.includes('TaskServer')) {
      return 'organization';
    }
    if (typeStr.includes('DevOpsIntegration') || typeStr.includes('PassCredential') || typeStr.includes('SecretReference') || typeStr.includes('CloudProvider') || typeStr.includes('RemoteExecutionCluster') || typeStr.includes('RemoteBuildCluster') || typeStr.includes('KubernetesCluster') || typeStr.includes('K8sCluster') || typeStr.includes('Environment') || typeStr.includes('DeploymentEnvironment') || typeStr.includes('GitOpsDeployment') || typeStr.includes('ArgoCDApplication') || typeStr.includes('CICDPipeline') || typeStr.includes('Pipeline')) {
      return 'devops';
    }
    if (typeStr.includes('BuildSystem') || typeStr.includes('MonorepoBuild') || typeStr.includes('Database') || typeStr.includes('RelationalDatabase') || typeStr.includes('NoSQLDatabase') || typeStr.includes('CacheStore') || typeStr.includes('MessageBroker') || typeStr.includes('EventBus') || typeStr.includes('MCPServer') || typeStr.includes('ToolProvider') || typeStr.includes('ContextSource') || typeStr.includes('PromptStrategy') || typeStr.includes('PromptOptimizer') || typeStr.includes('PromptCompiler') || typeStr.includes('AIPromptTechnique')) {
      return 'core-platform';
    }
    if (typeStr.includes('FrontEndApp') || typeStr.includes('PCGame') || typeStr.includes('MobileGame') || typeStr.includes('DesktopApp') || typeStr.includes('ConsoleApp') || typeStr.includes('MobileApp') || typeStr.includes('DataPipeline') || typeStr.includes('Library') || typeStr.includes('WebApplication') || typeStr.includes('VideoGame')) {
      return 'applications';
    }
    if (typeStr.includes('Microservice') || typeStr.includes('Contract') || typeStr.includes('ProtobufContract') || typeStr.includes('GRPCContract') || typeStr.includes('GraphQLContract') || typeStr.includes('GraphQLSchema') || typeStr.includes('Requirement') || typeStr.includes('Feature') || typeStr.includes('Scenario') || typeStr.includes('DataSource')) {
      return 'services';
    }
    if (typeStr.includes('ELearning') || typeStr.includes('Tutorial') || typeStr.includes('Course')) {
      return 'learning';
    }

    return 'core-platform';
  }

  loadPackages() {
    this.ensureDirs();
    this.packages.clear();
    this.nodeToPackage.clear();
    this.dirtyPackages.clear();

    // Check if subdirectories exist in packagesDir
    if (fs.existsSync(this.packagesDir)) {
      const subdirs = fs.readdirSync(this.packagesDir);
      for (const dirName of subdirs) {
        const fullDir = path.join(this.packagesDir, dirName);
        if (!fs.statSync(fullDir).isDirectory()) continue;

        const pkgFile = path.join(fullDir, 'package.jsonld');
        if (fs.existsSync(pkgFile)) {
          try {
            const raw = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
            const pkgId = raw['robos:package'] || dirName;
            const nodes = Array.isArray(raw['robos:nodes']) ? raw['robos:nodes'] : [];

            // Tag each node with package and namespace
            const ns = raw['robos:namespace'] || `robos.${pkgId}`;
            for (const n of nodes) {
              if (!n['robos:package']) n['robos:package'] = pkgId;
              if (!n['robos:namespace']) n['robos:namespace'] = ns;
              if (n['@id']) this.nodeToPackage.set(n['@id'], pkgId);
            }

            this.packages.set(pkgId, {
              id: pkgId,
              namespace: ns,
              version: raw['robos:version'] || '1.0.0',
              title: raw['dcterms:title'] || dirName,
              description: raw['dcterms:description'] || '',
              filePath: pkgFile,
              context: raw['@context'] || OSLC_CONTEXT,
              nodes,
            });
          } catch (e) {
            console.error(`Failed to load KGraph package ${pkgFile}:`, e.message);
          }
        }
      }
    }

    // Ensure all default packages are present in memory and on disk
    for (const def of DEFAULT_PACKAGES) {
      const pkgFile = path.join(this.packagesDir, def.id, 'package.jsonld');
      if (!fs.existsSync(pkgFile)) {
        const pkgData = {
          '@context': OSLC_CONTEXT,
          '@id': `urn:robos:package:${def.id}`,
          '@type': ['oslc_config:ConfigurationItem', 'robos:KGraphPackage'],
          'dcterms:title': def.title,
          'dcterms:description': def.description,
          'robos:package': def.id,
          'robos:namespace': def.namespace,
          'robos:version': '1.0.0',
          'robos:nodes': [],
        };
        try {
          fs.mkdirSync(path.dirname(pkgFile), { recursive: true });
          fs.writeFileSync(pkgFile, JSON.stringify(pkgData, null, 2), 'utf8');
        } catch (e) {}
      }

      if (!this.packages.has(def.id)) {
        this.packages.set(def.id, {
          id: def.id,
          namespace: def.namespace,
          version: '1.0.0',
          title: def.title,
          description: def.description,
          filePath: pkgFile,
          context: OSLC_CONTEXT,
          nodes: [],
        });
      }
    }

    this.initialized = true;
    return this.getAllNodes();
  }

  splitMonolithicGraph(monolithicData) {
    this.ensureDirs();
    const nodes = Array.isArray(monolithicData['robos:nodes']) ? monolithicData['robos:nodes'] : [];

    // Group nodes by inferred package
    const grouped = {};
    for (const def of DEFAULT_PACKAGES) {
      grouped[def.id] = [];
    }

    for (const node of nodes) {
      const pkgId = this.inferPackageForNode(node);
      if (!grouped[pkgId]) grouped[pkgId] = [];
      grouped[pkgId].push({
        ...node,
        'robos:package': pkgId,
        'robos:namespace': DEFAULT_PACKAGES.find(p => p.id === pkgId)?.namespace || `robos.${pkgId}`,
      });
    }

    for (const def of DEFAULT_PACKAGES) {
      const pkgFile = path.join(this.packagesDir, def.id, 'package.jsonld');
      const pkgDoc = {
        '@context': OSLC_CONTEXT,
        '@id': `urn:robos:package:${def.id}`,
        '@type': ['oslc:ServiceProvider', 'robos:Package'],
        'robos:package': def.id,
        'robos:namespace': def.namespace,
        'robos:version': '1.0.0',
        'dcterms:title': def.title,
        'dcterms:description': def.description,
        'robos:nodes': grouped[def.id] || [],
      };
      fs.mkdirSync(path.dirname(pkgFile), { recursive: true });
      fs.writeFileSync(pkgFile, JSON.stringify(pkgDoc, null, 2), 'utf8');
    }

    return this.loadPackages();
  }

  getAllNodes() {
    const all = [];
    for (const pkg of this.packages.values()) {
      all.push(...pkg.nodes);
    }
    return all;
  }

  listPackages() {
    const list = [];
    for (const pkg of this.packages.values()) {
      list.push({
        id: pkg.id,
        namespace: pkg.namespace,
        version: pkg.version,
        title: pkg.title,
        description: pkg.description,
        nodeCount: pkg.nodes.length,
        filePath: pkg.filePath,
      });
    }
    return list;
  }

  getPackage(packageId) {
    return this.packages.get(packageId) || null;
  }

  getNode(nodeId) {
    const pkgId = this.nodeToPackage.get(nodeId);
    if (pkgId && this.packages.has(pkgId)) {
      return this.packages.get(pkgId).nodes.find(n => n['@id'] === nodeId) || null;
    }
    for (const pkg of this.packages.values()) {
      const found = pkg.nodes.find(n => n['@id'] === nodeId);
      if (found) return found;
    }
    return null;
  }

  upsertNode(node, targetPackageId) {
    if (!node || !node['@id']) return null;

    const pkgId = targetPackageId || node['robos:package'] || this.nodeToPackage.get(node['@id']) || this.inferPackageForNode(node);
    
    // Ensure package exists in memory
    if (!this.packages.has(pkgId)) {
      this.packages.set(pkgId, {
        id: pkgId,
        namespace: `robos.${pkgId}`,
        version: '1.0.0',
        title: `${pkgId} Package`,
        description: '',
        filePath: path.join(this.packagesDir, pkgId, 'package.jsonld'),
        context: OSLC_CONTEXT,
        nodes: [],
      });
    }

    const pkg = this.packages.get(pkgId);
    node['robos:package'] = pkgId;
    if (!node['robos:namespace']) node['robos:namespace'] = pkg.namespace;

    // Remove from previous package if moving
    const currentPkgId = this.nodeToPackage.get(node['@id']);
    if (currentPkgId && currentPkgId !== pkgId && this.packages.has(currentPkgId)) {
      const oldPkg = this.packages.get(currentPkgId);
      oldPkg.nodes = oldPkg.nodes.filter(n => n['@id'] !== node['@id']);
      this.dirtyPackages.add(currentPkgId);
    }

    const idx = pkg.nodes.findIndex(n => n['@id'] === node['@id']);
    if (idx >= 0) {
      pkg.nodes[idx] = { ...pkg.nodes[idx], ...node };
    } else {
      pkg.nodes.push(node);
    }

    this.nodeToPackage.set(node['@id'], pkgId);
    this.dirtyPackages.add(pkgId);
    return node;
  }

  removeNode(nodeId) {
    const pkgId = this.nodeToPackage.get(nodeId);
    if (!pkgId || !this.packages.has(pkgId)) return false;

    const pkg = this.packages.get(pkgId);
    const beforeLen = pkg.nodes.length;
    pkg.nodes = pkg.nodes.filter(n => n['@id'] !== nodeId);
    this.nodeToPackage.delete(nodeId);
    this.dirtyPackages.add(pkgId);
    return pkg.nodes.length < beforeLen;
  }

  saveDirtyPackages(aggregatedFilePath) {
    this.ensureDirs();
    for (const pkgId of this.dirtyPackages) {
      const pkg = this.packages.get(pkgId);
      if (!pkg) continue;

      const pkgDoc = {
        '@context': pkg.context || OSLC_CONTEXT,
        '@id': `urn:robos:package:${pkg.id}`,
        '@type': ['oslc:ServiceProvider', 'robos:Package'],
        'robos:package': pkg.id,
        'robos:namespace': pkg.namespace,
        'robos:version': pkg.version || '1.0.0',
        'dcterms:title': pkg.title,
        'dcterms:description': pkg.description,
        'robos:nodes': pkg.nodes,
        '@graph': pkg.nodes,
      };

      const file = pkg.filePath || path.join(this.packagesDir, pkg.id, 'package.jsonld');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(pkgDoc, null, 2), 'utf8');
    }
    this.dirtyPackages.clear();

    // Also write aggregated file for backwards compatibility
    const targetAggPath = aggregatedFilePath || this.aggregatedFilePath;
    if (targetAggPath) {
      try {
        const aggregatedDoc = {
          '@context': OSLC_CONTEXT,
          '@id': 'urn:robos:graph:acme-enterprise-global',
          '@type': ['oslc:ServiceProvider', 'robos:SystemGraph'],
          'dcterms:title': 'Acme Enterprise Global SDLC Universe',
          'robos:nodes': this.getAllNodes(),
          '@graph': this.getAllNodes(),
        };
        fs.mkdirSync(path.dirname(targetAggPath), { recursive: true });
        fs.writeFileSync(targetAggPath, JSON.stringify(aggregatedDoc, null, 2), 'utf8');
      } catch (err) {
        console.error('Failed to write aggregated knowledge graph:', err.message);
      }
    }
  }

  saveAll(aggregatedFilePath) {
    for (const pkgId of this.packages.keys()) {
      this.dirtyPackages.add(pkgId);
    }
    this.saveDirtyPackages(aggregatedFilePath);
  }
}

module.exports = {
  KGraphPackageManager,
  DEFAULT_PACKAGES,
};
