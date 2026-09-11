(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./inspector-groups'));
  else root.RobosInspectorPropertyGroups = factory(root.RobosInspectorGroups);
})(globalThis, function(catalog) {
  'use strict';
  const caches = new WeakMap();
  const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
  const compact = value => typeof value === 'string' ? value
    .replace('https://robos.dev/ns/sdlc#', 'robos:')
    .replace(/^https?:\/\/schema.org\//, 'schema:')
    .replace('http://open-services.net/ns/rm#', 'oslc_rm:')
    .replace('http://open-services.net/ns/qm#', 'oslc_qm:')
    .replace('http://open-services.net/ns/cm#', 'oslc_cm:')
    .replace('http://purl.org/dc/terms/', 'dcterms:') : '';
  function present(value) {
    if (value == null) return false;
    if (typeof value === 'string') return !!value.trim();
    if (Array.isArray(value)) return value.some(present);
    if (typeof value === 'object') return Object.values(value).some(present);
    return true;
  }
  function index(nodes) {
    if (caches.has(nodes)) return caches.get(nodes);
    const byId = new Map(nodes.map(node => [node['@id'], node])), incoming = new Map();
    for (const node of nodes) for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('@')) continue;
      for (const ref of list(value)) {
        const id = typeof ref === 'string' ? ref : ref?.['@id'];
        if (!byId.has(id)) continue;
        if (!incoming.has(id)) incoming.set(id, []);
        incoming.get(id).push({ predicate: compact(key), direction: 'incoming', node });
      }
    }
    const result = { byId, incoming }; caches.set(nodes, result); return result;
  }
  function groups(node, nodes = []) {
    const types = list(node['@type']).map(compact);
    const { byId, incoming } = index(nodes);
    const fields = Object.entries(node).map(([predicate, value]) => ({ predicate: compact(predicate), value }));
    return catalog.GROUPS.filter(group => group.types.some(type => types.includes(type))).map(group => {
      const recorded = fields.filter(field => group.properties.includes(field.predicate) && present(field.value));
      const related = [], seen = new Set();
      const add = relation => {
        const key = JSON.stringify([relation.predicate, relation.direction, relation.node['@id']]);
        if (!seen.has(key)) { seen.add(key); related.push(relation); }
      };
      for (const field of recorded) for (const ref of list(field.value)) {
        const id = typeof ref === 'string' ? ref : ref?.['@id'];
        if (byId.has(id)) add({ predicate: field.predicate, direction: 'outgoing', node: byId.get(id) });
      }
      for (const relation of incoming.get(node['@id']) || []) if ((group.incoming || []).includes(relation.predicate)) add(relation);
      return { ...group, nodeId: node['@id'], fields: recorded, related };
    }).filter(group => group.related.some(relation => relation.direction === 'incoming') || group.fields.some(field => (group.triggerProperties || group.properties).includes(field.predicate)));
  }
  function label(predicate) {
    const text = predicate.replace(/^.*[:#]/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return { groups, present, compact, label };
});
