'use strict';

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
      ];

      for (const k of refKeys) {
        const val = node[k];
        if (!val) continue;
        const targets = Array.isArray(val) ? val : [val];
        for (const t of targets) {
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
