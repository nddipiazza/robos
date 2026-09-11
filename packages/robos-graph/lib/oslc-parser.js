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
  // MCP contracts are JSON literals: JSON Schema and descriptor keys are not
  // RDF predicates and must survive expansion without a vocabulary mapping.
  'robos:inputSchema': { '@id': 'robos:inputSchema', '@type': '@json' },
  'robos:outputSchema': { '@id': 'robos:outputSchema', '@type': '@json' },
  'robos:annotations': { '@id': 'robos:annotations', '@type': '@json' },
  'robos:arguments': { '@id': 'robos:arguments', '@type': '@json' },
  'robos:parameters': { '@id': 'robos:parameters', '@type': '@json' },
  'robos:toolAnnotations': { '@id': 'robos:toolAnnotations', '@type': '@json' },
  'robos:mcpServer': { '@id': 'robos:mcpServer', '@type': '@id' },
  // New inventories reference resource/prompt nodes. Legacy toolsProvided can
  // contain plain tool names, so it must not be indiscriminately IRI-coerced.
  'robos:resourcesProvided': { '@id': 'robos:resourcesProvided', '@type': '@id', '@container': '@set' },
  'robos:promptsProvided': { '@id': 'robos:promptsProvided', '@type': '@id', '@container': '@set' },
  'robos:classification': { '@id': 'robos:classification', '@type': '@id', '@container': '@set' },
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
    this.title = doc['dcterms:title'] || 'RobOS Knowledge Graph';
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

    const knownIds = new Set(nodeList.map(n => n['@id']));
    for (const node of nodeList) {
      if (!node['@id']) continue;
      this.nodeIndex.set(node['@id'], node);

      if (!this.outgoingRefs.has(node['@id'])) {
        this.outgoingRefs.set(node['@id'], new Set());
      }

      const { nodeRelations } = require('./relationships');
      for (const edge of nodeRelations(node, knownIds)) {
        this.outgoingRefs.get(node['@id']).add(edge.to);
        if (!this.incomingRefs.has(edge.to)) this.incomingRefs.set(edge.to, new Set());
        this.incomingRefs.get(edge.to).add(node['@id']);
      }
    }
  }

  getNode(id) {
    return this.nodeIndex.get(id) || null;
  }

  queryNodes(filter = {}) {
    return this.nodes.filter(node => {
      if (filter.package && node['robos:package'] !== filter.package) return false;
      if (filter.type) {
        const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
        const match = types.some(t => t === filter.type || t.endsWith(`:${filter.type}`));
        if (!match) return false;
      }
      if (filter.repository && ![].concat(node['robos:repository'] || node['robos:inRepository'] || []).some(v => (typeof v === 'string' ? v : v['@id']) === filter.repository)) {
        return false;
      }
      if (filter.ownerTeam && ![].concat(node['robos:ownerTeam'] || []).some(v => (typeof v === 'string' ? v : v['@id']) === filter.ownerTeam)) {
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
    const { traverseDependencies } = require('./relationships');
    const dependents = traverseDependencies(this.nodes, nodeId, maxDepth, 'dependents');
    const dependencies = traverseDependencies(this.nodes, nodeId, maxDepth, 'dependencies');
    return { targetId: nodeId, blastRadiusCount: dependents.length, dependents, dependencies,
      semantics: 'Directed modeled dependencies; absence does not establish safety.' };
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
