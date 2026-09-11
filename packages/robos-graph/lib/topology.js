/* Deterministic bounded topology selection. Relationship semantics arrive from
 * the shared relationships.js resolver, never from searching serialized nodes. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RobosTopology = factory();
})(globalThis, function() {
  'use strict';
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  function buildTopology(nodes, relations, { rootId, scope = 'neighborhood', maxNodes = 48, maxEdges = 160 } = {}) {
    const byId = new Map(nodes.map(n => [n['@id'], n]));
    const root = byId.get(rootId);
    const edges = relations.filter(e => byId.has(e.from) && byId.has(e.to)).slice().sort((a,b) => compare(a.from,b.from) || compare(a.to,b.to) || compare(a.predicate,b.predicate));
    const neighbors = new Map(nodes.map(n => [n['@id'], new Set()]));
    for (const e of edges) { neighbors.get(e.from).add(e.to); neighbors.get(e.to).add(e.from); }
    let candidates;
    if (scope === 'neighborhood') candidates = new Set(root ? [rootId, ...neighbors.get(rootId)] : []);
    else if (scope === 'package') candidates = new Set(nodes.filter(n => (n['robos:package'] || 'Unpackaged') === (root?.['robos:package'] || 'Unpackaged')).map(n => n['@id']));
    else if (scope === 'all') candidates = new Set(byId.keys());
    else throw new Error('Unknown topology scope: ' + scope);
    const eligibleEdges = edges.filter(e => candidates.has(e.from) && candidates.has(e.to));
    const ordered = [], visited = new Set(), layers = new Map();
    let nextLayer = 0;
    const seeds = [...candidates].sort((a,b) => neighbors.get(b).size - neighbors.get(a).size || compare(a,b));
    if (candidates.has(rootId)) seeds.unshift(rootId);
    // Traverse whole connected components before isolated nodes. The selected
    // component has priority even when its IDs sort after thousands of isolates.
    for (const seed of seeds) {
      if (visited.has(seed)) continue;
      const queue = [{ id: seed, layer: nextLayer }];
      visited.add(seed);
      for (let i = 0; i < queue.length; i++) {
        const { id, layer } = queue[i]; ordered.push(id); layers.set(id, layer); nextLayer = Math.max(nextLayer, layer + 1);
        for (const next of [...neighbors.get(id)].sort(compare)) if (candidates.has(next) && !visited.has(next)) { visited.add(next); queue.push({ id: next, layer: layer + 1 }); }
      }
    }
    const selected = ordered.slice(0, Math.max(1, maxNodes));
    const ids = new Set(selected);
    const shownEdges = eligibleEdges.filter(e => ids.has(e.from) && ids.has(e.to)).slice(0, Math.max(0, maxEdges));
    return { nodes: selected.map(id => byId.get(id)), edges: shownEdges, layers: Object.fromEntries(selected.map(id => [id, layers.get(id)])), totalNodes: candidates.size, totalEdges: eligibleEdges.length, omittedNodes: candidates.size - selected.length, omittedEdges: eligibleEdges.length - shownEdges.length };
  }
  return { buildTopology };
});
