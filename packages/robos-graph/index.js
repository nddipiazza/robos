'use strict';
const { OSLCGraphParser, OSLC_CONTEXT } = require('./lib/oslc-parser');
const { SHACLValidator, BUILTIN_SHACL_SHAPES } = require('./lib/shacl-validator');
const { BranchManager, classifyBranch, DEFAULT_BRANCH_DELTAS } = require('./lib/branch-manager');
const { GraphDiffEngine } = require('./lib/graph-diff');
const { BlastRadiusAnalyzer } = require('./lib/blast-radius');
const { GraphCoPilot } = require('./lib/graph-copilot');
const { RepoScanner } = require('./lib/repo-scanner');
const { GherkinLinker, SAMPLE_GHERKIN_FEATURE } = require('./lib/gherkin-linker');
const { SDLCKnowledgeGraphStore, DEFAULT_GRAPH_DATA } = require('./lib/graph-store');

const { BulkRepoImporter } = require('./lib/bulk-repo-importer');
const { KGraphPackageManager, DEFAULT_PACKAGES } = require('./lib/package-manager');
const { KGraphRepoManager } = require('./lib/repo-manager');
const { DevOpsIntegrationManager, DEVOPS_CATEGORIES, DEVOPS_PROVIDERS } = require('./lib/devops-integrations');

module.exports = {
  OSLCGraphParser,
  OSLC_CONTEXT,
  SHACLValidator,
  BUILTIN_SHACL_SHAPES,
  BranchManager,
  classifyBranch,
  DEFAULT_BRANCH_DELTAS,
  GraphDiffEngine,
  BlastRadiusAnalyzer,
  GraphCoPilot,
  RepoScanner,
  BulkRepoImporter,
  GherkinLinker,
  SAMPLE_GHERKIN_FEATURE,
  SDLCKnowledgeGraphStore,
  DEFAULT_GRAPH_DATA,
  KGraphPackageManager,
  DEFAULT_PACKAGES,
  KGraphRepoManager,
  DevOpsIntegrationManager,
  DEVOPS_CATEGORIES,
  DEVOPS_PROVIDERS,
};
