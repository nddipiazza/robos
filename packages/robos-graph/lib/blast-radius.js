'use strict';
const { OSLCGraphParser } = require('./oslc-parser');

class BlastRadiusAnalyzer {
  analyzeImpact(diffResult, targetGraphDoc) {
    const parser = new OSLCGraphParser(targetGraphDoc);
    const affectedNodeIds = new Set([
      ...diffResult.addedNodes.map(n => n['@id']),
      ...diffResult.modifiedNodes.map(m => m.node['@id']),
      ...diffResult.removedNodes.map(n => n['@id']),
    ]);

    const impactedServices = new Set();
    const impactedTeams = new Set();
    const impactedContracts = new Set();
    const impactedRequirements = new Set();

    for (const nodeId of affectedNodeIds) {
      const node = parser.getNode(nodeId);
      if (node) {
        this.categorizeNode(node, impactedServices, impactedTeams, impactedContracts, impactedRequirements);
      }

      // Find downstream dependents
      const depResult = parser.findDependents(nodeId, 3);
      for (const dep of depResult.dependents) {
        this.categorizeNode(dep.node, impactedServices, impactedTeams, impactedContracts, impactedRequirements);
      }
    }

    return {
      totalImpactedNodes: impactedServices.size + impactedContracts.size + impactedRequirements.size,
      impactedServices: Array.from(impactedServices),
      impactedTeams: Array.from(impactedTeams),
      impactedContracts: Array.from(impactedContracts),
      impactedRequirements: Array.from(impactedRequirements),
    };
  }

  categorizeNode(node, services, teams, contracts, requirements) {
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    const isService = types.some(t => t.includes('Microservice') || t.includes('Container'));
    const isContract = types.some(t => t.includes('Contract') || t.includes('Component'));
    const isReq = types.some(t => t.includes('Requirement') || t.includes('Feature'));

    if (isService) services.add(node['dcterms:title'] || node['@id']);
    if (isContract) contracts.add(node['dcterms:title'] || node['@id']);
    if (isReq) requirements.add(node['dcterms:title'] || node['@id']);

    if (node['robos:ownerTeam']) {
      teams.add(node['robos:ownerTeam'].replace(/.*:/, ''));
    }
  }
}

module.exports = { BlastRadiusAnalyzer };
