'use strict';

// Direction is dependent -> prerequisite. Provenance, ownership and containment
// remain queryable relationships, but are not runtime/build dependency evidence.
const DEPENDENCY_PREDICATES = new Set([
  'dependsOn', 'buildDependsOn', 'developmentDependsOn', 'peerDependsOn',
  'optionalDependsOn', 'imports', 'uses', 'calls', 'renders', 'reads', 'readsFrom',
  'writesTo', 'writesModel', 'usesModel', 'usesEntity', 'usesDatabase',
  'usesMessageBroker', 'usesMCPServer', 'implementsContract', 'consumesContract',
  'publishesTo', 'subscribesTo', 'consumesFrom', 'queries', 'routesTo', 'forwardsTo',
  'executesOn', 'sendsBuildEventsTo', 'sendsCompletedActionsTo', 'deadLettersTo',
  'builtBy', 'generatedBy', 'usesBuildSystem', 'usesSkill', 'broker', 'topic',
  'authenticationBoundary', 'hasConfiguration', 'inputType', 'outputType',
  'fieldType', 'referencesModel', 'testsService', 'validates',
].map(p => 'robos:' + p));
const INVERSE_DEPENDENCIES = new Set(['oslc_qm:validatedBy']);
const REFERENCE_PREDICATES = new Set([
  'inRepository', 'repository', 'derivedFrom', 'sourceArtifact', 'definedInContract',
  'forEnvironment', 'inEnvironment', 'ownerTeam', 'assignedTeam', 'managedByTeam',
  'developmentGuidance', 'relatedTo', 'relatesTo', 'teaches', 'modules', 'module',
  'course', 'provides', 'definesModel', 'exports', 'mcpServer', 'toolsProvided',
  'hasPipeline', 'packages', 'produces', 'publishes', 'app', 'hosts', 'implementedBy',
  'runs', 'targets', 'configures', 'includes', 'deploys', 'references', 'composes',
  'technologyReference', 'protocolReference', 'classification',
].map(p => 'robos:' + p));
const referenceId = value => typeof value === 'string' ? value : value && value['@id'];
function predicateKind(predicate) {
  if (DEPENDENCY_PREDICATES.has(predicate) || INVERSE_DEPENDENCIES.has(predicate)) return 'dependency';
  if (REFERENCE_PREDICATES.has(predicate)) return 'reference';
  return 'unclassified';
}
function nodeRelations(node, knownIds = new Set()) {
  const edges = [], seen = new Set();
  for (const [predicate, values] of Object.entries(node)) {
    if (predicate.startsWith('@') || ['robos:evidence', 'robos:relationshipEvidence'].includes(predicate)) continue;
    for (const value of [].concat(values || [])) {
      const target = referenceId(value);
      if (typeof target !== 'string') continue;
      // Do not interpret arbitrary string properties (titles, source paths) as links.
      if (!(value && typeof value === 'object' && value['@id']) &&
          !((predicateKind(predicate) !== 'unclassified' || /^(?:robos|oslc_[a-z]+):/.test(predicate) && knownIds.has(target)) && /^(?:urn:|https?:)/.test(target))) continue;
      const key = predicate + '\0' + target;
      if (seen.has(key)) continue; seen.add(key);
      const evidence = (node['robos:relationshipEvidence'] || []).filter(e => e.predicate === predicate && referenceId(e.target) === target);
      edges.push({ from: node['@id'], to: target, predicate, kind: predicateKind(predicate), internal: knownIds.has(target), evidence });
    }
  }
  return edges;
}
function dependencyEdges(nodes) {
  const ids = new Set(nodes.map(n => n['@id']));
  return nodes.flatMap(n => nodeRelations(n, ids)).filter(e => e.internal && e.kind === 'dependency')
    .map(e => INVERSE_DEPENDENCIES.has(e.predicate) ? { ...e, from: e.to, to: e.from, reversed: true } : e);
}
function traverseDependencies(nodes, start, maxDepth = 3, direction = 'dependents') {
  const byId = new Map(nodes.map(n => [n['@id'], n])), adjacency = new Map();
  for (const e of dependencyEdges(nodes)) {
    const key = direction === 'dependents' ? e.to : e.from;
    if (!adjacency.has(key)) adjacency.set(key, []);
    adjacency.get(key).push(e);
  }
  const seen = new Set([start]), queue = [{ id: start, depth: 0 }], results = [];
  const limit = Number.isFinite(Number(maxDepth)) ? Math.max(0, Math.min(100, Number(maxDepth))) : 3;
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]; if (current.depth >= limit) continue;
    for (const edge of adjacency.get(current.id) || []) {
      const id = direction === 'dependents' ? edge.from : edge.to;
      if (seen.has(id)) continue; seen.add(id);
      const depth = current.depth + 1;
      results.push({ node: byId.get(id), depth, via: current.id, predicate: edge.predicate, evidence: edge.evidence });
      queue.push({ id, depth });
    }
  }
  return results;
}
module.exports = { DEPENDENCY_PREDICATES, REFERENCE_PREDICATES, referenceId, predicateKind, nodeRelations, dependencyEdges, traverseDependencies };
