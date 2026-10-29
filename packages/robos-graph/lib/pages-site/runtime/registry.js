/* KGraph site renderer registry. Shared by the static viewer (browser) and
 * the site builder (Node), so the resolution the builder reports is the one
 * the page uses.
 *
 * A renderer:
 *   KGraphSite.registerRenderer({
 *     id: 'jrpg-enemy',
 *     types: ['jrpg:Enemy'],        // types it renders (subtypes inherit it)
 *     nodes: ['urn:...'],           // or specific node ids
 *     render(node, ctx) {},         // detail page → HTML string
 *     card(node, ctx) {},           // optional: list card → HTML string
 *     collection(nodes, ctx, type) {} // optional: type index page → HTML string
 *   });
 *
 * Resolution for a node, first match wins:
 *   1. a renderer naming the node id, or the node's "site:renderer" property
 *   2. a renderer for one of the node's own types
 *   3. a renderer for the nearest parent type (rdfs:subClassOf, breadth first)
 *   4. the generic renderer
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KGraphRegistry = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createRegistry(ontology) {
    const renderers = new Map();   // id → renderer
    const byType = new Map();      // type → renderer id (last registered wins)
    const byNode = new Map();      // node id → renderer id
    const parents = new Map();     // type → [parent types]
    for (const [type, info] of Object.entries(ontology || {})) parents.set(type, [].concat(info.parents || info.parent || []).filter(Boolean));

    function registerRenderer(r) {
      if (!r || typeof r.id !== 'string' || !r.id) throw new Error('A renderer needs an id');
      if (typeof r.render !== 'function') throw new Error(`Renderer ${r.id} needs render(node, ctx)`);
      renderers.set(r.id, r);
      for (const t of r.types || []) byType.set(t, r.id);
      for (const n of r.nodes || []) byNode.set(n, r.id);
      return r;
    }

    function typesOf(node) {
      return [].concat(node && node['@type'] || []).filter(Boolean);
    }

    // Nearest-first ancestors of a type, breadth first, without repeats.
    function ancestors(type) {
      const out = [];
      const seen = new Set([type]);
      let frontier = [type];
      while (frontier.length) {
        const next = [];
        for (const t of frontier) {
          for (const p of parents.get(t) || []) {
            if (seen.has(p)) continue;
            seen.add(p); out.push(p); next.push(p);
          }
        }
        frontier = next;
      }
      return out;
    }

    // { renderer, via: 'node'|'type'|'parent'|'generic', type }
    function resolve(node) {
      const explicit = node && (node['site:renderer'] || node['robos:siteRenderer']);
      if (explicit && renderers.has(explicit)) return { renderer: renderers.get(explicit), via: 'node', type: null };
      if (node && byNode.has(node['@id'])) return { renderer: renderers.get(byNode.get(node['@id'])), via: 'node', type: null };
      return resolveType(typesOf(node));
    }

    function resolveType(types) {
      for (const t of types) if (byType.has(t)) return { renderer: renderers.get(byType.get(t)), via: 'type', type: t };
      // Nearest parent across all of the node's types.
      const lists = types.map(t => ancestors(t));
      const depth = Math.max(0, ...lists.map(l => l.length));
      for (let d = 0; d < depth; d++) {
        for (const l of lists) if (l[d] && byType.has(l[d])) return { renderer: renderers.get(byType.get(l[d])), via: 'parent', type: l[d] };
      }
      return { renderer: renderers.get('generic') || null, via: 'generic', type: null };
    }

    // The renderer a node would get if its own renderer stepped aside: lets a
    // custom renderer wrap its parent's output.
    function resolveParent(node, currentId) {
      if (currentId === 'generic') return null;
      const types = typesOf(node);
      const chain = [...types];
      for (const t of types) for (const a of ancestors(t)) if (!chain.includes(a)) chain.push(a);
      const from = chain.findIndex(t => byType.get(t) === currentId); // -1 when chosen by node
      for (let i = from + 1; i < chain.length; i++) {
        const id = byType.get(chain[i]);
        if (id && id !== currentId) return renderers.get(id);
      }
      return renderers.get('generic') || null;
    }

    return { registerRenderer, resolve, resolveType, resolveParent, ancestors, renderers, byType };
  }

  // Static scan of renderer source: the id and literal types/nodes arrays of
  // each registerRenderer({...}) call. The builder uses this to report the
  // resolution table without running renderer code.
  function scanRendererSource(source) {
    const out = [];
    const text = String(source || '');
    const re = /registerRenderer\s*\(\s*\{/g;
    const starts = [];
    let m;
    while ((m = re.exec(text))) starts.push(m.index);
    for (const [i, start] of starts.entries()) {
      // Look only inside this call: up to the next registerRenderer call.
      const body = text.slice(start, Math.min(starts[i + 1] ?? text.length, start + 4000));
      const id = (body.match(/\bid\s*:\s*['"]([^'"]+)['"]/) || [])[1];
      const list = key => {
        const lm = body.match(new RegExp(`\\b${key}\\s*:\\s*\\[([^\\]]*)\\]`));
        return lm ? [...lm[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]) : [];
      };
      if (id) out.push({ id, types: list('types'), nodes: list('nodes') });
    }
    return out;
  }

  return { createRegistry, scanRendererSource };
});
