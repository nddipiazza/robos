#!/usr/bin/env node
'use strict';
// Keep the published ontology in step with the executable registry. Does not
// invent classifications: missing catalog entries fail this command and tests.
const fs = require('node:fs');
const path = require('node:path');
const { BUILTIN_SHACL_SHAPES } = require('../packages/robos-graph/lib/shacl-validator');
const c = require('../packages/robos-graph/lib/classification');
for (const relative of ['../docs/schemas/ontology.jsonld', '../.robos/ontology.jsonld']) {
const file = path.resolve(__dirname, relative);
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map(doc['@graph'].map(node => [node['@id'], node]));
for (const shape of BUILTIN_SHACL_SHAPES) {
  if (!byId.has(shape.targetClass)) byId.set(shape.targetClass, { '@id': shape.targetClass, '@type': 'rdfs:Class', 'rdfs:label': shape.targetClass.split(':').pop(), 'robos:shaclShape': shape.shapeId, 'rdfs:subClassOf': { '@id': shape.schemaOrgType || shape.refersFrom } });
}
for (const id of Object.keys(c.CLASS_CODES)) if (!byId.has(id)) byId.set(id, { '@id': id, '@type': 'rdfs:Class', 'rdfs:label': id.split(':').pop() });
for (const id of Object.keys(c.PREDICATE_CODES)) byId.set(id, { ...(byId.get(id) || {}), '@id': id, '@type': 'rdf:Property', 'rdfs:label': id.split(':').pop() });
byId.set('robos:classification', { '@id': 'robos:classification', '@type': 'rdf:Property', 'rdfs:label': 'RobOS SDLC classification', 'rdfs:subPropertyOf': { '@id': 'schema:category' }, 'rdfs:domain': { '@id': 'rdfs:Resource' }, 'rdfs:range': { '@id': 'schema:CategoryCode' }, 'rdfs:comment': 'General graph-element classification using the RobOS-owned SDLC code set. Schema.org provides the vocabulary, not this SDLC taxonomy.' });
for (const [id, node] of byId) {
  if (['rdfs:Class', 'rdf:Property'].includes(node['@type'])) {
    const refs = c.resolveSchemaElement(id);
    if (!refs.length) throw new Error('Missing classification for ontology element ' + id);
    node['robos:classification'] = refs;
    if (node['rdfs:label'] === id.slice(6)) node['rdfs:label'] = id.split(':').pop();
  }
}
byId.set(c.CODE_SET_ID, { '@id': c.CODE_SET_ID, '@type': 'schema:CategoryCodeSet', 'schema:name': 'RobOS SDLC classification', 'schema:hasCategoryCode': c.CATALOG.map(cat => ({ '@id': cat.id })) });
for (const category of c.CATALOG) byId.set(category.id, Object.fromEntries(Object.entries(category).filter(([key]) => key.startsWith('@') || key.startsWith('schema:'))));
doc['@context'].sh = 'http://www.w3.org/ns/shacl#';
doc['@context']['robos:classification'] = { '@id': 'robos:classification', '@type': '@id', '@container': '@set' };
doc['@graph'] = [...byId.values()];
doc['robos:totalClasses'] = doc['@graph'].filter(n => n['@type'] === 'rdfs:Class').length;
doc['dcterms:description'] = 'RobOS SDLC class and predicate ontology, with complete built-in shape coverage and RobOS-owned classification codes expressed using Schema.org CategoryCode and CategoryCodeSet.';
fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
console.log(`${doc['robos:totalClasses']} classes, ${Object.keys(c.PREDICATE_CODES).length} predicates, ${c.CATALOG.length} classification codes`);

}
