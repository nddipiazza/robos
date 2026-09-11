(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./inspector-property-groups'));
  else root.RobosInspector = factory(root.RobosInspectorPropertyGroups);
})(globalThis, function(propertyGroups) {
  'use strict';
  const BASE_TABS = ['visual', 'query', 'rdf'];
  const graphIndexes = new WeakMap();
  function relationIndex(relations) {
    const index = new Map();
    for (const edge of relations) for (const id of new Set([edge.from, edge.to])) {
      if (!index.has(id)) index.set(id, []); index.get(id).push(edge);
    }
    return index;
  }
  const DOC_TYPES = new Set(['robos:DocumentationPage','robos:DocArticle','robos:DocSection','robos:ArchitectureDecisionRecord','robos:ADR','schema:DigitalDocument','schema:Article','schema:TechArticle']);
  const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
  const compact = value => typeof value === 'string' ? value.replace('https://robos.dev/ns/sdlc#','robos:').replace('https://schema.org/','schema:') : '';
  function safeUrl(value) {
    if (typeof value !== 'string' || /[\s<>"\u0000-\u001f]/.test(value)) return null;
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
  }
  function recordedSourceUrl(source, evidence, nodes) {
    if (evidence?.workingTreeStatus !== 'clean' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(evidence.revision || '') || !Number.isInteger(evidence.line) || evidence.line < 1) return null;
    const file = evidence.path;
    if (typeof file !== 'string' || !file || /[\\\x00-\x1f\x7f]/.test(file) || file.startsWith('/') || file.split('/').some(part => !part || part === '.' || part === '..')) return null;
    const references = [...new Set(list(source['robos:inRepository']).map(ref => typeof ref === 'string' ? ref : ref?.['@id']).filter(id => typeof id === 'string' && id))];
    if (references.length !== 1) return null;
    const id = references[0];
    const repo = nodes.find(node => node['@id'] === id);
    const remote = safeUrl(repo?.['robos:url']);
    if (!remote) return null;
    const url = new URL(remote), parts = url.pathname.replace(/\/$/, '').split('/').slice(1);
    if (url.origin !== 'https://github.com' || url.search || url.hash || parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_.-]+$/.test(part))) return null;
    const repository = parts[1].replace(/\.git$/, '');
    if (!repository || [parts[0], repository].some(part => part === '.' || part === '..')) return null;
    return `https://github.com/${parts[0]}/${repository}/blob/${evidence.revision}/${file.split('/').map(encodeURIComponent).join('/')}#L${evidence.line}`;
  }
  function capabilities(node = {}, nodes = [], relationships = new Map()) {
    if (!node || !node['@id']) return { tabs: ['visual'], documents: [], evidence: [], relations: [], groups: [] };
    if (!graphIndexes.has(nodes)) graphIndexes.set(nodes, new Map(nodes.map(n => [n['@id'], n])));
    const byId = graphIndexes.get(nodes), documents = [], seen = new Set();
    const documentKeys = new Set();
    const add = (kind, label, value, id, source = node) => {
      if (typeof value !== 'string' || !value.trim()) return;
      const key = JSON.stringify([kind, source['@id'], kind === 'path' ? value.replace(/^\.\//, '') : value]);
      if (documentKeys.has(key)) return; documentKeys.add(key);
      const sourceEvidence = list(source['robos:evidence']).filter(e => e && typeof e === 'object' && (kind !== 'path' || String(e.path || '').replace(/^\.\//, '') === value.replace(/^\.\//, '')));
      documents.push({ kind, label, value, ...(id ? {id} : {}), sourceEvidence, sourceNodeId: source['@id'], recordedSourceLinks: kind === 'path' ? sourceEvidence.map(e => recordedSourceUrl(source, e, nodes)).filter(Boolean) : [] });
    };
    const content = (doc, label) => {
      if (seen.has(doc['@id'])) return; seen.add(doc['@id']);
      for (const key of ['robos:content','robos:markdown','robos:markdownContent','schema:text','robos:context','robos:decision','robos:consequences']) add('text',`${label}: ${key}`,doc[key],undefined,doc);
      for (const key of ['robos:docPath','robos:sourcePath']) add('path',`${label}: ${key}`,doc[key],undefined,doc);
      for (const key of ['robos:docsUrl','robos:sourceUrl','schema:url']) { const url=safeUrl(doc[key]); if(url)add('url',label,url,undefined,doc); }
    };
    if (list(node['@type']).some(t=>DOC_TYPES.has(compact(t)))) content(node,node['dcterms:title']||node['@id']);
    for (const key of ['robos:documentation','robos:hasDocumentation','robos:hasDocumentationPage']) for (const value of list(node[key])) {
      const id = typeof value==='string' ? value : value?.['@id'];
      const target = byId.get(id);
      if(target && list(target['@type']).some(t=>DOC_TYPES.has(compact(t)))) { const before=documents.length; content(target,target['dcterms:title']||id); if(documents.length>before)add('node',key,target['dcterms:title']||id,id); continue; }
      const url=safeUrl(id); if(url){add('url',key,url);continue;}
      if(value && typeof value==='object' && !Array.isArray(value) && !value['@id']) {
        for(const field of ['content','markdown','architectureGuidelines']) add('text',`${key}: ${field}`,value[field]);
        for(const field of ['docsPath','docsPaths']) for(const entry of list(value[field])) add('path',`${key}: ${field}`,entry);
        const link=safeUrl(value.docsUrl); if(link)add('url',`${key}: docsUrl`,link);
      } else if (key==='robos:documentation' && typeof value==='string' && !/^[a-z][a-z0-9+.-]*:/i.test(value)) {
        if (/\.(?:md|mdx|rst|txt|html?)$/i.test(value) && !value.includes('\n')) add('path',key,value);
        else add('text',key,value);
      }
    }
    const evidence=list(node['robos:evidence']).filter(e=>e && typeof e==='object' && !Array.isArray(e) && Object.keys(e).length);
    for (const edge of list(node['robos:relationshipEvidence'])) {
      const target=typeof edge?.target==='string'?edge.target:edge?.target?.['@id'];
      if (!target || typeof edge?.predicate!=='string' || !list(node[edge.predicate]).some(ref=>(typeof ref==='string'?ref:ref?.['@id'])===target)) continue;
      for (const record of list(edge.evidence)) if(record && typeof record==='object' && !Array.isArray(record) && Object.keys(record).length) evidence.push({...record, 'relationship predicate':edge.predicate, 'relationship target':target});
    }
    const relations = relationships.get(node['@id']) || [];
    const groups = propertyGroups.groups(node, nodes);
    return { tabs: ['visual',...groups.map(group => `group-${group.id}`),...(relations.length?['topology']:[]),...(relations.some(e=>e.kind==='dependency')?['impact']:[]),'query',...(documents.length?['documentation']:[]),...(evidence.length?['evidence']:[]),'rdf'], documents, evidence, relations, groups };
  }
  function selectTab(requested,node,nodes,relationships) {
    const tab=({overview:'visual',jsonld:'rdf'})[requested]||requested;
    return capabilities(node,nodes,relationships).tabs.includes(tab)?tab:'visual';
  }
  return { BASE_TABS, capabilities, selectTab, safeUrl, relationIndex, recordedSourceUrl };
});
