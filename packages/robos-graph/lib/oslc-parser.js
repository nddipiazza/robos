'use strict';

const SOURCE_EVIDENCE_CONTEXT = {
  repository: 'robos:sourceRepository', path: 'robos:sourcePath',
  line: { '@id': 'robos:sourceLine', '@type': 'xsd:integer' },
  revision: 'robos:sourceRevision', sha256: 'robos:sourceHash',
  workingTreeStatus: 'robos:workingTreeStatus',
};

const OSLC_CONTEXT = {
  oslc: 'http://open-services.net/ns/core#',
  oslc_am: 'http://open-services.net/ns/am#',
  oslc_cm: 'http://open-services.net/ns/cm#',
  oslc_rm: 'http://open-services.net/ns/rm#',
  oslc_qm: 'http://open-services.net/ns/qm#',
  robos: 'https://robos.dev/ns/sdlc#',
  c4: 'https://c4model.com/ns#',
  pact: 'https://pact.io/ns#',
  dcterms: 'http://purl.org/dc/terms/',
  schema: 'https://schema.org/',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  'robos:technologyReference': { '@id': 'robos:technologyReference', '@type': '@id' },
  'robos:protocolReference': { '@id': 'robos:protocolReference', '@type': '@id' },
  'robos:sourceSummary': { '@id': 'robos:sourceSummary', '@type': '@json' },
  'robos:provenance': { '@id': 'robos:provenance', '@type': '@json' },
  'robos:relationshipEvidence': {
    '@id': 'robos:relationshipEvidence', '@container': '@set',
    '@context': {
      predicate: { '@id': 'robos:predicate', '@type': '@vocab' },
      target: { '@id': 'robos:target', '@type': '@id' },
      evidence: { '@id': 'robos:evidence', '@container': '@set', '@context': SOURCE_EVIDENCE_CONTEXT }, note: 'dcterms:description',
      condition: 'robos:condition', status: 'robos:evidenceStatus',
    },
  },
  'robos:evidence': {
    '@id': 'robos:evidence', '@container': '@set',
    '@context': SOURCE_EVIDENCE_CONTEXT,
  },
};

class OSLCGraphParser {
  constructor(doc = {}) {
    this.context = doc['@context'] || OSLC_CONTEXT;
    this.graphId = doc['@id'] || 'urn:robos:graph:system';
    this.graphType = doc['@type'] || ['oslc:ServiceProvider', 'robos:SystemGraph'];
    this.title = doc['dcterms:title'] || 'RobOS SDLC Knowledge Graph';
    this.nodes = [];
    this.nodeIndex = new Map();
    this.incomingRefs = new Map(); // targetId -> Set(sourceIds)
    this.outgoingRefs = new Map(); // sourceId -> Set(targetIds)

    if (Array.isArray(doc['robos:nodes'])) {
      this.loadNodes(doc['robos:nodes']);
    }
  }

  loadNodes(nodeList) {
    this.nodes = nodeList;
    this.nodeIndex.clear();
    this.incomingRefs.clear();
    this.outgoingRefs.clear();

    for (const node of nodeList) {
      if (!node['@id']) continue;
      this.nodeIndex.set(node['@id'], node);

      if (!this.outgoingRefs.has(node['@id'])) {
        this.outgoingRefs.set(node['@id'], new Set());
      }

      // Collect reference edges
      const refKeys = [
        'robos:implementsContract',
        'robos:usesEntity',
        'robos:ownerTeam',
        'robos:dependsOn',
        'oslc_qm:validatedBy',
        'robos:service',
        'robos:targetNode',
        'robos:hasProject',
        'robos:hasFeature',
        'robos:hasEpic',
        'robos:hasTask',
        'robos:hasRepository',
        'robos:definesTopology',
        'robos:tracksEpic',
        'robos:enforcesContract',
        'robos:managedByTeam',
        'robos:teachesService',
        'robos:teachesContract',
        'robos:hasELearning',
        'robos:linkedNodes',
        'robos:hasOrganization',
        'robos:inOrganization',
        'robos:hasAgentRule',
        'robos:governedBy',
        'robos:hasDocumentation',
        'robos:hasRemoteExecution',
        'robos:usesBuildSystem',
        'robos:hasWorkerPool',
        'robos:buildConfig',
        'robos:hasFlowDiagram',
        'robos:hasDocumentationPage',
        'robos:hasADR',
        'robos:hasWalkthrough',
        'robos:supersededBy',
        'robos:flowDiagram',
        'robos:relatesTo',
        'robos:targetComponent',
        'robos:usesDatabase',
        'robos:usesMessageBroker',
        'robos:publishesTo',
        'robos:subscribesTo',
        'robos:usesMCPServer',
        'robos:deployedTo',
        'robos:targetCluster',
        'robos:inEnvironment',
        'robos:hasPipeline',
        'robos:consumesContract',
        'robos:assignedTeam',
        'robos:hasCredential',
        'robos:hasStory',
        'robos:hasSubtask',
        'robos:hasBug',
        'robos:hasSprint',
        'robos:hasMilestone',
        'robos:inProject',
        'robos:inEpic',
        'robos:inFeature',
        'robos:inStory',
        'robos:inSprint',
        'robos:parentTask',
        'robos:parentWorkItem',
        'robos:assignedDeveloper',
        'robos:assignedAgent',
        'robos:hasBranch',
        'robos:hasPullRequest',
        'robos:hasCommit',
        'robos:hasTag',
        'robos:repository',
        'robos:sourceBranch',
        'robos:targetBranch',
        'robos:hasEndpoint',
        'robos:hasDataModel',
        'robos:hasSchema',
        'robos:hasTable',
        'robos:hasColumn',
        'robos:hasIndex',
        'robos:hasCollection',
        'robos:database',
        'robos:table',
        'robos:hasTopic',
        'robos:hasQueue',
        'robos:hasConsumerGroup',
        'robos:broker',
        'robos:topic',
        'robos:hasTool',
        'robos:hasResource',
        'robos:hasPrompt',
        'robos:mcpServer',
        'robos:hasNamespace',
        'robos:hasNodePool',
        'robos:hasDeployment',
        'robos:hasKubeService',
        'robos:hasIngress',
        'robos:cluster',
        'robos:namespace',
        'robos:hasStage',
        'robos:hasJob',
        'robos:hasStep',
        'robos:pipeline',
        'robos:stage',
        'robos:job',
        'robos:hasModule',
        'robos:hasLesson',
        'robos:hasLab',
        'robos:hasQuiz',
        'robos:course',
        'robos:module',
        'robos:hasSection',
        'robos:hasOption',
        'robos:docPage',
        'robos:adr',
        'robos:hasRoute',
        'robos:hasCommand',
        'robos:hasFlag',
        'robos:app',
        'robos:command',
        'robos:refersFrom',
        'robos:hasBackground',
        'robos:inBackground',
        'robos:hasRule',
        'robos:inRule',
        'robos:hasScenario',
        'robos:inScenario',
        'robos:hasScenarioOutline',
        'robos:inScenarioOutline',
        'robos:hasExamples',
        'robos:examplesTable',
        'robos:hasDataTable',
        'robos:dataTable',
        'robos:hasDocString',
        'robos:docString',
        'robos:hasStepDefinition',
        'robos:stepDefinition',
        'robos:testsService',
        'robos:hasTestPlan',
        'robos:inTestPlan',
        'robos:hasTestSuite',
        'robos:inTestSuite',
        'robos:testFramework',
        'robos:testingLibrary',
        'oslc_qm:reportsOnTestCase',
        'oslc_qm:usesTestCase',
      ];

      // Imported JSON-LD may introduce relation predicates beyond the built-in
      // vocabulary. Index explicit @id references and URNs without losing them.
      for (const k of Object.keys(node)) {
        if (k === '@id' || k === '@type' || refKeys.includes(k)) continue;
        if ([].concat(node[k]).some(v => typeof v === 'string' && v.startsWith('urn:') || v && typeof v === 'object' && typeof v['@id'] === 'string')) refKeys.push(k);
      }
      for (const k of refKeys) {
        const val = node[k];
        if (!val) continue;
        const targets = Array.isArray(val) ? val : [val];
        for (const value of targets) {
          const t = value && typeof value === 'object' ? value['@id'] : value;
          if (typeof t === 'string') {
            this.outgoingRefs.get(node['@id']).add(t);
            if (!this.incomingRefs.has(t)) {
              this.incomingRefs.set(t, new Set());
            }
            this.incomingRefs.get(t).add(node['@id']);
          }
        }
      }
    }
  }

  getNode(id) {
    return this.nodeIndex.get(id) || null;
  }

  queryNodes(filter = {}) {
    return this.nodes.filter(node => {
      if (filter.type) {
        const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
        const match = types.some(t => t === filter.type || t.endsWith(`:${filter.type}`));
        if (!match) return false;
      }
      if (filter.repository && node['robos:repository'] !== filter.repository) {
        return false;
      }
      if (filter.ownerTeam && node['robos:ownerTeam'] !== filter.ownerTeam) {
        return false;
      }
      if (filter.search) {
        const s = filter.search.toLowerCase();
        const title = (node['dcterms:title'] || '').toLowerCase();
        const id = (node['@id'] || '').toLowerCase();
        if (!title.includes(s) && !id.includes(s)) return false;
      }
      return true;
    });
  }

  findDependents(nodeId, maxDepth = 3) {
    const visited = new Set();
    const results = [];

    const traverse = (currentId, depth) => {
      if (depth > maxDepth) return;
      const inbound = this.incomingRefs.get(currentId);
      if (!inbound) return;

      for (const sourceId of inbound) {
        if (!visited.has(sourceId)) {
          visited.add(sourceId);
          const sourceNode = this.getNode(sourceId);
          if (sourceNode) {
            results.push({
              node: sourceNode,
              depth,
              via: currentId,
            });
            traverse(sourceId, depth + 1);
          }
        }
      }
    };

    traverse(nodeId, 1);
    return {
      targetId: nodeId,
      blastRadiusCount: results.length,
      dependents: results,
    };
  }

  toJSONLD() {
    return {
      '@context': this.context,
      '@id': this.graphId,
      '@type': this.graphType,
      'dcterms:title': this.title,
      'robos:nodes': this.nodes,
    };
  }
}

module.exports = { OSLCGraphParser, OSLC_CONTEXT };
