'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { OSLCGraphParser, OSLC_CONTEXT } = require('./oslc-parser');

function classifyBranch(branchName) {
  if (branchName === 'main' || branchName === 'master' || branchName === 'production') {
    return {
      type: 'production',
      label: 'Production Reality',
      badge: 'PROD',
      badgeClass: 'badge-prod',
      goal: 'Source of Truth (Verified & Deployed)',
    };
  }
  if (branchName.startsWith('feature/')) {
    return {
      type: 'feature',
      label: 'Feature Branch',
      badge: 'FEATURE',
      badgeClass: 'badge-feature',
      goal: 'Planned Production Capability (Merge Target: main)',
    };
  }
  if (branchName.startsWith('poc/') || branchName.startsWith('spike/')) {
    return {
      type: 'poc',
      label: 'POC / Technical Spike',
      badge: 'POC',
      badgeClass: 'badge-poc',
      goal: 'Feasibility Spike & Architecture Exploration',
    };
  }
  if (branchName.startsWith('pilot/') || branchName.startsWith('beta/')) {
    return {
      type: 'pilot',
      label: 'Pilot / Beta Rollout',
      badge: 'PILOT',
      badgeClass: 'badge-pilot',
      goal: 'Customer-Facing Beta & Canary Topology',
    };
  }
  return {
    type: 'custom',
    label: 'Custom Branch',
    badge: 'BRANCH',
    badgeClass: 'badge-custom',
    goal: 'Development Branch',
  };
}

const DEFAULT_BRANCH_DELTAS = {
  'feature/TASK-101-auth': {
    commit: 'f92c10a',
    author: 'AI Agent (Swarm-1)',
    timestamp: new Date().toISOString(),
    addedNodes: [
      {
        '@id': 'urn:robos:service:auth-gateway',
        '@type': ['oslc_am:Resource', 'c4:Container', 'robos:Microservice'],
        'dcterms:title': 'Authentication Gateway Service',
        'robos:repository': 'github.com/acme/buildbarn-auth',
        'robos:implementsContract': 'urn:robos:contract:auth-api-v1',
        'robos:ownerTeam': 'urn:robos:team:core-platform',
      },
      {
        '@id': 'urn:robos:contract:auth-api-v1',
        '@type': ['robos:Contract', 'c4:Component'],
        'dcterms:title': 'Auth Gateway OpenAPI 3.1 Spec',
        'robos:specFile': 'specs/contracts/auth-api-v1.yaml',
        'robos:protocol': 'OpenAPI 3.1',
      },
      {
        '@id': 'urn:robos:requirement:REQ-301-oauth',
        '@type': ['oslc_rm:Requirement', 'robos:Feature'],
        'dcterms:title': 'OAuth 2.0 PKCE Login Flow',
        'robos:featureFile': 'specs/features/oauth-login.feature',
        'oslc_qm:validatedBy': 'urn:robos:test:e2e-oauth-pkce',
        'robos:targetNode': 'urn:robos:service:auth-gateway',
      },
    ],
  },
  'poc/v2-graph-ql': {
    commit: 'b44d88e',
    author: 'Lead Architect',
    timestamp: new Date().toISOString(),
    addedNodes: [
      {
        '@id': 'urn:robos:service:graphql-federation',
        '@type': ['oslc_am:Resource', 'c4:Container', 'robos:Microservice'],
        'dcterms:title': 'Apollo GraphQL Federation Gateway',
        'robos:repository': 'github.com/acme/buildbarn-graphql',
        'robos:ownerTeam': 'urn:robos:team:core-platform',
      },
      {
        '@id': 'urn:robos:requirement:SPIKE-401-graphql',
        '@type': ['oslc_rm:Requirement', 'robos:Feature'],
        'dcterms:title': 'GraphQL Subgraph Stitching Spike',
        'robos:featureFile': 'specs/spikes/subgraph-stitching.feature',
        'robos:targetNode': 'urn:robos:service:graphql-federation',
      },
    ],
  },
  'pilot/beta-billing': {
    commit: 'c77e99f',
    author: 'Billing Team',
    timestamp: new Date().toISOString(),
    addedNodes: [
      {
        '@id': 'urn:robos:service:stripe-billing',
        '@type': ['oslc_am:Resource', 'c4:Container', 'robos:Microservice'],
        'dcterms:title': 'Stripe Metered Billing Engine',
        'robos:repository': 'github.com/acme/buildbarn-billing',
        'robos:implementsContract': 'urn:robos:contract:billing-pact-v1',
        'robos:ownerTeam': 'urn:robos:team:core-platform',
      },
      {
        '@id': 'urn:robos:contract:billing-pact-v1',
        '@type': ['robos:Contract', 'pact:ConsumerContract'],
        'dcterms:title': 'Billing Pact Consumer Contract',
        'robos:specFile': 'specs/pacts/billing-consumer.json',
        'robos:protocol': 'Pact v4',
      },
    ],
  },
};

class BranchManager {
  constructor(options = {}) {
    this.baseGraphData = JSON.parse(JSON.stringify(options.baseGraphData || DEFAULT_GRAPH_DATA));
    this.branches = new Map();
    this.activeBranch = options.activeBranch || 'main';
    this.init();
  }

  init() {
    // 1. Initialize main (production)
    this.branches.set('main', {
      name: 'main',
      commit: 'a71b8e4',
      author: 'RobOS Release Bot',
      timestamp: new Date().toISOString(),
      parent: null,
      classification: classifyBranch('main'),
      graphDoc: JSON.parse(JSON.stringify(this.baseGraphData)),
    });

    // 2. Initialize pre-populated child branches
    for (const [branchName, delta] of Object.entries(DEFAULT_BRANCH_DELTAS)) {
      const childDoc = JSON.parse(JSON.stringify(this.baseGraphData));
      childDoc['@id'] = `urn:robos:graph:buildbarn-platform:${branchName.replace(/\//g, '-')}`;
      childDoc['robos:nodes'].push(...JSON.parse(JSON.stringify(delta.addedNodes)));

      this.branches.set(branchName, {
        name: branchName,
        commit: delta.commit,
        author: delta.author,
        timestamp: delta.timestamp,
        parent: 'main',
        classification: classifyBranch(branchName),
        graphDoc: childDoc,
      });
    }
  }

  listBranches() {
    return Array.from(this.branches.values()).map(b => ({
      name: b.name,
      commit: b.commit,
      author: b.author,
      timestamp: b.timestamp,
      parent: b.parent,
      classification: b.classification,
      nodeCount: b.graphDoc['robos:nodes'].length,
      isActive: b.name === this.activeBranch,
    }));
  }

  getActiveBranch() {
    return this.branches.get(this.activeBranch) || this.branches.get('main');
  }

  switchBranch(branchName) {
    const startTime = Date.now();
    let branch = this.branches.get(branchName);
    if (!branch) {
      branch = this.createBranch(branchName);
    }
    this.activeBranch = branch.name;
    const durationMs = Date.now() - startTime;

    return {
      ok: true,
      branch: {
        name: branch.name,
        commit: branch.commit,
        author: branch.author,
        classification: branch.classification,
        nodeCount: branch.graphDoc['robos:nodes'].length,
      },
      durationMs,
      graphDoc: branch.graphDoc,
    };
  }

  createBranch(branchName, baseBranchName = 'main') {
    const base = this.branches.get(baseBranchName) || this.branches.get('main');
    const newDoc = JSON.parse(JSON.stringify(base.graphDoc));
    newDoc['@id'] = `urn:robos:graph:buildbarn-platform:${branchName.replace(/\//g, '-')}`;

    const branch = {
      name: branchName,
      commit: Math.random().toString(16).substring(2, 9),
      author: 'developer',
      timestamp: new Date().toISOString(),
      parent: baseBranchName,
      classification: classifyBranch(branchName),
      graphDoc: newDoc,
    };

    this.branches.set(branchName, branch);
    return branch;
  }

  getGraphForBranch(branchName) {
    const branch = this.branches.get(branchName);
    return branch ? branch.graphDoc : null;
  }
}

module.exports = { BranchManager, classifyBranch, DEFAULT_BRANCH_DELTAS };
