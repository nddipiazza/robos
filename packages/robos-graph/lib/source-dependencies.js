'use strict';
const path = require('node:path');
function addRelationship(node, predicate, target, evidence, note) {
  const values = [].concat(node[predicate] || []);
  if (!values.some(v => (typeof v === 'string' ? v : v['@id']) === target)) values.push({ '@id': target });
  node[predicate] = values;
  const records = node['robos:relationshipEvidence'] ||= [];
  if (!records.some(e => e.predicate === predicate && (typeof e.target === 'string' ? e.target : e.target['@id']) === target)) records.push({ predicate, target: { '@id': target }, evidence, ...(note ? { note } : {}) });
}
const SCALARS = new Set('double float int32 int64 uint32 uint64 sint32 sint64 fixed32 fixed64 sfixed32 sfixed64 bool string bytes'.split(' '));
function linkProtobufDependencies(nodes, sources, warnings) {
  const symbols = new Map();
  for (const source of sources) {
    source.package = (source.text.match(/^\s*package\s+([\w.]+)\s*;/m) || [])[1] || '';
    source.children = nodes.filter(n => n['robos:derivedFrom']?.['@id'] === source.contract['robos:derivedFrom']['@id']);
    for (const node of source.children.filter(n => ([].concat(n['@type']).includes('robos:DataModel') || n['robos:sourceKind'] === 'protobuf-enum'))) {
      const name = [source.package, (node['robos:modelName'] || node['dcterms:title'])].filter(Boolean).join('.');
      const key = source.repository + ':' + name;
      if (!symbols.has(key)) symbols.set(key, []);
      symbols.get(key).push({ node, source });
    }
    source.imports = [];
    source.publicImports = [];
    for (const match of source.text.matchAll(/\bimport\s+(?:(public|weak)\s+)?"([^"\n]+)"\s*;/g)) {
      const name = match[2];
      const candidates = sources.filter(s => s.repository === source.repository && (s.file === name || s.file.endsWith('/' + name) || s.file === path.posix.normalize(path.posix.join(path.posix.dirname(source.file), name))));
      if (candidates.length === 1) {
        source.imports.push(candidates[0]);
        if (match[1] === 'public') source.publicImports.push(candidates[0]);
        addRelationship(source.contract, 'robos:imports', candidates[0].contract['@id'], source.evidence(source.text.slice(0, match.index).split('\n').length));
      } else warnings.push({ code: candidates.length ? 'ambiguous-protobuf-import' : 'unresolved-protobuf-import', repository: source.repository, path: source.file, imported: name });
    }
  }
  for (const source of sources) {
    // Direct imports expose their own types and recursively re-exported public
    // imports. Ordinary/weak imports of those files are not visible here.
    // Resolve after every file's imports are collected, independent of order.
    const visible = new Set([source, ...source.imports]);
    const queue = [...source.imports];
    for (let i = 0; i < queue.length; i++) {
      for (const imported of queue[i].publicImports) {
        if (visible.has(imported)) continue;
        visible.add(imported); queue.push(imported);
      }
    }
    const resolve = (name, scope) => {
      if (SCALARS.has(name)) return null;
      const prefixes = [];
      if (!name.startsWith('.')) {
        const parts = [source.package, scope].filter(Boolean).join('.').split('.');
        while (parts.length) { prefixes.push(parts.join('.') + '.' + name); parts.pop(); }
      }
      prefixes.push(name.replace(/^\./, ''));
      for (const candidate of prefixes) {
        const matches = (symbols.get(source.repository + ':' + candidate) || []).filter(s => visible.has(s.source));
        if (matches.length === 1) return matches[0].node;
        if (matches.length > 1) return null;
      }
      return null;
    };
    const link = (node, predicate, type, scope, index) => {
      if (!node || SCALARS.has(type)) return;
      const target = resolve(type, scope);
      if (target) addRelationship(node, predicate, target['@id'], source.evidence(source.text.slice(0, index).split('\n').length));
      else warnings.push({ code: 'unresolved-protobuf-type', repository: source.repository, path: source.file, from: node['@id'], type });
    };
    // String literals cannot contain declarations or move brace scopes.
    const clean = source.text.replace(/"(?:\\.|[^"\\])*"/g, s => s.replace(/[^\n]/g, ' '));
    const stack = []; let pending = null;
    const token = /\b(message|service|enum|oneof)\s+([A-Za-z_]\w*)|\brpc\s+([A-Za-z_]\w*)\s*\(\s*(?:stream\s+)?([.\w]+)\s*\)\s*returns\s*\(\s*(?:stream\s+)?([.\w]+)\s*\)|\b(?:repeated\s+|optional\s+|required\s+)?(?:map\s*<\s*\w+\s*,\s*([.\w]+)\s*>|([.\w]+))\s+[A-Za-z_]\w*\s*=\s*\d+|[{}]/g;
    for (const m of clean.matchAll(token)) {
      const scope = stack.filter(s => s && ['message','service'].includes(s.kind)).map(s => s.name).join('.');
      if (m[1]) pending = { kind: m[1], name: m[2] };
      else if (m[3]) {
        const rpc = source.children.find(n => n['robos:sourceKind'] === 'protobuf-rpc' && n['dcterms:title'] === [scope,m[3]].filter(Boolean).join('.'));
        link(rpc, 'robos:inputType', m[4], '', m.index); link(rpc, 'robos:outputType', m[5], '', m.index);
      } else if (m[6] || m[7]) {
        if (stack.some(s => s?.kind === 'enum')) continue;
        const message = source.children.find(n => n['robos:modelName'] === scope);
        link(message, 'robos:fieldType', m[6] || m[7], scope, m.index);
      } else if (m[0] === '{') { stack.push(pending); pending = null; }
      else stack.pop();
    }
  }
}
module.exports = { addRelationship, linkProtobufDependencies };
