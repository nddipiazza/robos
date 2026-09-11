'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { OSLC_CONTEXT } = require('./oslc-parser');
const { DEFAULT_PACKAGES } = require('./package-manager');
const { SHACLValidator } = require('./shacl-validator');

const clone = value => JSON.parse(JSON.stringify(value));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
const serialize = value => JSON.stringify(canonical(value), null, 2) + '\n';
const hash = value => crypto.createHash('sha256').update(serialize(value)).digest('hex');
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const byId = nodes => new Map(nodes.map(node => [node['@id'], node]));
const packageId = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

function validIdentity(id) {
  if (typeof id !== 'string' || /[\s\\<>"{}|^`\x00-\x1f\x7f]/u.test(id) || /%(?![0-9a-f]{2})/i.test(id)) return false;
  if (/^urn:/i.test(id)) return /^urn:[a-z0-9][a-z0-9-]{0,30}[a-z0-9]:[^?#]+(?:\?[^#]*)?(?:#.*)?$/i.test(id);
  if (!/^https?:\/\/[^/]/i.test(id)) return false;
  try { const url = new URL(id); return !!url.hostname && !url.username && !url.password; } catch { return false; }
}

function validEvidence(e) {
  return e && typeof e === 'object' && !Array.isArray(e) && typeof e.repository === 'string' && e.repository.trim() &&
    typeof e.path === 'string' && e.path.trim() && !path.isAbsolute(e.path) && !path.win32.isAbsolute(e.path) &&
    !e.path.includes('\0') && !e.path.split(/[\\/]/).includes('..') && Number.isInteger(e.line) && e.line > 0 &&
    (e.revision === undefined || typeof e.revision === 'string' && e.revision.trim()) &&
    (e.sha256 === undefined || typeof e.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(e.sha256));
}

// Record a process incarnation on Linux to avoid confusing a reused PID with
// the writer. On other hosts an existing PID is conservatively considered live.
function processStart(pid) {
  try { return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ').slice(1).join(') ').split(' ')[19]; } catch { return null; }
}

function deadOwner(owner) {
  if (!owner || owner.host !== os.hostname() || !Number.isInteger(owner.pid) || owner.pid < 1 || !owner.token) return false;
  try { process.kill(owner.pid, 0); } catch (error) { return error.code === 'ESRCH'; }
  const start = processStart(owner.pid);
  return !!(start && owner.start && start !== owner.start);
}

function readOwner(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Unrecognized workspace lock; cannot establish ownership: ${file}`);
  }
}

function acquireLock(file) {
  const owner = { pid: process.pid, host: os.hostname(), start: processStart(process.pid), token: crypto.randomUUID() };
  // Publish a complete ownership record atomically, never an empty lock file.
  const temporary = `${file}.owner-${owner.token}`;
  fs.writeFileSync(temporary, serialize(owner), { flag: 'wx' });
  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        fs.linkSync(temporary, file);
        return () => { if (readOwner(file)?.token === owner.token) fs.unlinkSync(file); };
      } catch (error) { if (error.code !== 'EEXIST') throw error; }
      const previous = readOwner(file);
      if (!previous) continue;
      if (!deadOwner(previous)) throw new Error(`Workspace writer is active or its ownership cannot be verified: ${file}`);
      // Serialize reclamation per old owner. Merely checking an inode then
      // unlinking races with another reclaimer and can remove a new live lock.
      // These guards use the same crash-recoverable ownership protocol.
      const release = acquireLock(`${file}.reap-${hash(previous).slice(0, 16)}`);
      try { if (same(readOwner(file), previous)) fs.unlinkSync(file); } finally { release(); }
    }
    throw new Error('Workspace lock changed repeatedly; retry');
  } finally { fs.unlinkSync(temporary); }
}

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file + '.tmp', 'w');
  try { fs.writeFileSync(fd, typeof value === 'string' ? value : serialize(value)); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(file + '.tmp', file);
}

function manifestText(raw, catalog, title) {
  if (raw === null) return serialize({ version: '1.0.0', title, repositories: [{ id: 'local', path: '.robos', packagesPath: 'kgraphs', default: true }], dependencies: [], packages: catalog });
  let parsed;
  try { parsed = JSON.parse(raw); } catch { /* Preserve ordinary block YAML without reserializing unrelated fields. */ }
  if (parsed !== undefined) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || (parsed.packages !== undefined && !Array.isArray(parsed.packages))) throw new Error('Malformed workspace manifest');
    const existing = new Map((parsed.packages || []).map(p => [p.id, p]));
    return serialize({ ...parsed, packages: [...catalog.map(p => ({ ...p, ...existing.get(p.id), path: p.path })), ...(parsed.packages || []).filter(p => !catalog.some(c => c.id === p.id))] });
  }
  const lines = raw.split('\n');
  const starts = lines.flatMap((line, i) => /^packages\s*:/.test(line) ? [i] : []);
  if (starts.length > 1) throw new Error('Duplicate packages field in workspace manifest');
  if (!starts.length) return raw.replace(/\n?$/, '\n') + 'packages:\n' + catalog.map(p => `  - ${JSON.stringify(p)}\n`).join('');
  const start = starts[0];
  if (!/^packages\s*:\s*(?:\[\])?\s*(?:#.*)?$/.test(lines[start])) throw new Error('Unsupported packages YAML syntax; preserve manifest and convert its packages field to a block sequence');
  let end = start + 1;
  while (end < lines.length && !/^[^\s#]/.test(lines[end])) end++;
  const block = lines.slice(start + 1, end).join('\n');
  const ids = new Set();
  for (const line of block.split('\n')) {
    if (!/^\s*-\s*\S/.test(line)) continue;
    const mapping = line.match(/^\s*-\s*(\{.*\})\s*$/);
    if (mapping) { try { ids.add(JSON.parse(mapping[1]).id); continue; } catch { /* Fail safely below. */ } }
    const id = line.match(/^\s*-\s*id:\s*['"]?([a-z0-9]+(?:-[a-z0-9]+)*)['"]?\s*(?:#.*)?$/);
    if (!id) throw new Error('Unsupported packages YAML entry; manifest was not modified');
    ids.add(id[1]);
  }
  const additions = catalog.filter(p => !ids.has(p.id)).map(p => `  - ${JSON.stringify(p)}`);
  if (!additions.length) return raw;
  lines[start] = lines[start].replace(/\[\]/, '');
  lines.splice(end, 0, ...additions);
  return lines.join('\n');
}

function resolveGraphRoot(root) {
  if (!root || typeof root !== 'string') throw new Error('An explicit graph root is required');
  const resolved = path.resolve(root);
  return path.basename(resolved) === '.robos' ? resolved : path.join(resolved, '.robos');
}

function normalize(doc) {
  if (!doc || !Array.isArray(doc['robos:nodes'])) throw new Error('Expected a JSON-LD document with robos:nodes');
  const result = clone(doc);
  delete result['@graph'];
  delete result['robos:generatedAt'];
  result['robos:nodes'].sort((a, b) => String(a['@id']).localeCompare(String(b['@id'])));
  return result;
}

function validateDocument(doc, { requireEvidence = false } = {}) {
  const errors = [];
  const warnings = [];
  if (!doc || !Array.isArray(doc['robos:nodes'])) return { conforms: false, errors: ['Missing robos:nodes array'], warnings };
  const nodes = doc['robos:nodes'];
  const ids = new Set();
  if (!doc['@context'] || typeof doc['@context'] !== 'object') errors.push('Missing local JSON-LD context');
  for (const n of nodes) {
    if (!n || typeof n !== 'object' || Array.isArray(n)) { errors.push('Node must be an object'); continue; }
    const id = n['@id'];
    if (!validIdentity(id)) errors.push(`Invalid node ID: ${id}`);
    if (ids.has(id)) errors.push(`Duplicate node ID: ${id}`);
    ids.add(id);
    const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
    if (!types.length || types.some(t => typeof t !== 'string' || !t.includes(':'))) errors.push(`${id}: invalid @type`);
    if (typeof n['dcterms:title'] !== 'string' || !n['dcterms:title'].trim()) errors.push(`${id}: missing title`);
    if (!packageId(n['robos:package'])) errors.push(`${id}: invalid package ID`);
    const evidence = n['robos:evidence'];
    if (types.includes('robos:Microservice') && !n['robos:ownerTeam']) warnings.push(`${id}: ownership unresolved`);
    if (requireEvidence && (!Array.isArray(evidence) || !evidence.length)) errors.push(`${id}: missing evidence`);
    if (evidence !== undefined) {
      if (!Array.isArray(evidence)) errors.push(`${id}: evidence must be an array`);
      else for (const e of evidence) {
        if (!validEvidence(e)) errors.push(`${id}: invalid source evidence`);
      }
    }
  }
  for (const n of nodes.filter(n => n && typeof n === 'object')) {
    const relationships = n['robos:relationshipEvidence'];
    if (relationships !== undefined) {
      if (!Array.isArray(relationships)) errors.push(`${n['@id']}: relationshipEvidence must be an array`);
      else for (const edge of relationships) {
        const target = typeof edge?.target === 'string' ? edge.target : edge?.target?.['@id'];
        if (!edge || typeof edge.predicate !== 'string' || !edge.predicate.includes(':') || !validIdentity(target) || !ids.has(target) ||
          ![].concat(n[edge.predicate] || []).some(ref => ref === target || ref?.['@id'] === target)) errors.push(`${n['@id']}: relationship evidence must match an existing predicate reference and target`);
        if (!Array.isArray(edge?.evidence) || !edge.evidence.length || !edge.evidence.every(validEvidence)) errors.push(`${n['@id']}: invalid relationship source evidence`);
        for (const key of ['note', 'condition']) if (edge?.[key] !== undefined && typeof edge[key] !== 'string') errors.push(`${n['@id']}: relationship ${key} must be a string`);
      }
    }
    for (const [property, value] of Object.entries(n)) {
      if (property === '@id' || property === '@type' || property === 'robos:evidence' || property === 'robos:relationshipEvidence') continue;
      for (const v of Array.isArray(value) ? value : [value]) {
        const ref = typeof v === 'string' && v.startsWith('urn:') ? v : v && typeof v === 'object' ? v['@id'] : null;
        if (ref && !ids.has(ref)) errors.push(`${n['@id']}: unresolved ${property} → ${ref}`);
      }
    }
  }
  if (!errors.length) {
    try {
      const report = new SHACLValidator().validateGraph({ nodes });
      for (const r of report.results) errors.push(`${r.focusNode}: ${r.resultMessage} (${r.resultPath})`);
      const shapes = new SHACLValidator().shapes;
      for (const n of nodes) {
        const types = [].concat(n['@type']);
        if (!shapes.some(s => types.includes(s.targetClass) || (s.targetClasses || []).some(t => types.includes(t)))) warnings.push(`${n['@id']}: no built-in shape; structural checks only`);
      }
    } catch (error) { errors.push(`Shape validation failed: ${error.message}`); }
  }
  return { conforms: errors.length === 0, nodesEvaluated: nodes.length, errors, warnings, constraints: ['structure', 'unique IDs', 'internal references', 'package names', 'source locations', 'built-in shape cardinality'] };
}

function diffNodes(before, after) {
  const a = byId(before), b = byId(after);
  const added = [], changed = [], removed = [];
  for (const [id, node] of b) {
    if (!a.has(id)) added.push(node);
    else if (!same(a.get(id), node)) changed.push({ id, properties: [...new Set([...Object.keys(a.get(id)), ...Object.keys(node)])].filter(k => !same(a.get(id)[k], node[k])).map(property => ({ property, before: a.get(id)[property], after: node[property] })) });
  }
  for (const [id, node] of a) if (!b.has(id)) removed.push(node);
  return { added, changed, removed };
}

class GraphWorkspace {
  constructor(root) {
    this.root = resolveGraphRoot(root);
    this.file = path.join(this.root, 'knowledge-graph.jsonld');
    this.stateFile = path.join(this.root, 'import-state.json');
    this.journal = path.join(this.root, 'pending-import.json');
  }

  empty(title = 'Workspace Knowledge Graph') {
    return { '@context': OSLC_CONTEXT, '@id': 'urn:robos:graph:workspace', '@type': ['robos:SystemGraph'], 'dcterms:title': title, 'robos:nodes': [] };
  }

  read() {
    if (fs.existsSync(this.journal)) throw new Error('An interrupted graph write needs recovery: kgraph recover --graph-root <workspace>');
    const aggregate = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : this.empty();
    const dir = path.join(this.root, 'kgraphs');
    if (!fs.existsSync(dir)) return normalize(aggregate);
    const nodes = [];
    let count = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const file = path.join(dir, entry.name, 'package.jsonld');
      if (!fs.existsSync(file)) continue;
      if (!packageId(entry.name)) throw new Error(`Invalid package directory: ${entry.name}`);
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (pkg['robos:package'] !== entry.name || !Array.isArray(pkg['robos:nodes'])) throw new Error(`Malformed graph package: ${file}`);
      for (const n of pkg['robos:nodes']) {
        if (n['robos:package'] !== entry.name) throw new Error(`Node ${n['@id']} has conflicting package membership`);
        nodes.push(n);
      }
      count++;
    }
    const doc = normalize({ ...aggregate, 'robos:nodes': count ? nodes : aggregate['robos:nodes'] });
    if (count && fs.existsSync(this.file) && !same(doc['robos:nodes'], normalize(aggregate)['robos:nodes'])) throw new Error('Package files and compatibility aggregate disagree; regenerate the aggregate explicitly');
    return doc;
  }

  state() { return fs.existsSync(this.stateFile) ? JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) : { extracted: [], revision: null }; }

  metadata() {
    const manifest = path.join(this.root, 'kgraph.yaml');
    const packages = {};
    const dir = path.join(this.root, 'kgraphs');
    if (fs.existsSync(dir)) for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !packageId(entry.name)) continue;
      const file = path.join(dir, entry.name, 'package.jsonld');
      if (fs.existsSync(file)) {
        const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
        delete envelope['robos:nodes'];
        packages[entry.name] = envelope;
      }
    }
    return { manifest: fs.existsSync(manifest) ? fs.readFileSync(manifest, 'utf8') : null, packages };
  }

  propose({ document, edits, prompt = '', mode = 'import', requireEvidence = false } = {}, snapshot) {
    if (!['import', 'refine', 'replace'].includes(mode)) throw new Error('Mode must be import, refine, or replace');
    const current = snapshot ? snapshot.current : this.read();
    const state = snapshot ? snapshot.state : this.state();
    const metadata = snapshot ? snapshot.metadata : this.metadata();
    const conflicts = [], stale = [];
    const retired = new Set(state.retired || []);
    let candidate = clone(current), extracted = state.extracted || [];
    if (mode === 'import') {
      const incoming = normalize(document);
      if (new Set(incoming['robos:nodes'].map(n => n['@id'])).size !== incoming['robos:nodes'].length) throw new Error('Duplicate node ID in import source');
      const previous = byId(extracted), present = byId(current['robos:nodes']), next = byId(incoming['robos:nodes']);
      for (const [id, fresh] of next) {
        const old = previous.get(id), accepted = present.get(id);
        if (!accepted && !old && !retired.has(id)) { present.set(id, fresh); continue; }
        if (!accepted) { conflicts.push({ id, property: '@id', reason: 'Previously removed entity reappeared', incoming: fresh }); continue; }
        const merged = clone(accepted);
        for (const key of new Set([...Object.keys(old || {}), ...Object.keys(fresh)])) {
          if (key === '@id') continue;
          const prior = old && old[key], now = fresh[key], chosen = accepted[key];
          if (same(chosen, prior) || same(chosen, now)) {
            if (now === undefined) delete merged[key]; else merged[key] = clone(now);
          } else if (!same(prior, now)) conflicts.push({ id, property: key, previous: prior, accepted: chosen, incoming: now });
        }
        present.set(id, merged);
      }
      for (const [id] of previous) if (!next.has(id) && present.has(id)) stale.push({ id, reason: 'No longer present in extracted sources; retained pending review' });
      candidate = { ...incoming, 'robos:nodes': [...present.values()] };
      // Retain the last seen source value even while a source is absent. This
      // preserves both merge ancestry and unresolved disappearance warnings.
      extracted = [...new Map([...previous, ...next]).values()].sort((a, b) => a['@id'].localeCompare(b['@id']));
    } else if (mode === 'replace') {
      candidate = normalize(document);
      const replacementIds = new Set(candidate['robos:nodes'].map(n => n['@id']));
      for (const n of current['robos:nodes']) if (!replacementIds.has(n['@id'])) retired.add(n['@id']);
      for (const id of replacementIds) retired.delete(id);
    } else {
      if (!Array.isArray(edits) || !edits.length) throw new Error('Refinement requires a nonempty edits array');
      const nodes = byId(candidate['robos:nodes']);
      for (const edit of edits) {
        if (edit.op === 'add') {
          if (!edit.node || nodes.has(edit.node['@id'])) throw new Error('add requires a new node ID');
          nodes.set(edit.node['@id'], clone(edit.node));
          retired.delete(edit.node['@id']);
        } else if (edit.op === 'update') {
          if (!nodes.has(edit.id)) throw new Error(`Unknown node: ${edit.id}`);
          if (edit.set && '@id' in edit.set || (edit.unset || []).includes('@id')) throw new Error('Node identity is immutable; use explicit add/remove edits');
          const node = { ...nodes.get(edit.id), ...clone(edit.set || {}) };
          for (const key of edit.unset || []) delete node[key];
          nodes.set(edit.id, node);
        } else if (edit.op === 'remove') {
          if (!nodes.delete(edit.id)) throw new Error(`Unknown node: ${edit.id}`);
          retired.add(edit.id);
        } else throw new Error(`Unsupported edit: ${edit.op}`);
      }
      candidate['robos:nodes'] = [...nodes.values()];
    }
    candidate = normalize(candidate);
    const request = clone({ mode, prompt, requireEvidence, ...(mode === 'refine' ? { edits } : { document }) });
    const proposal = { version: 1, base: hash(current), stateBase: hash(state), baseline: { current, state }, metadataBase: hash(metadata), metadata, request, mode, prompt, candidate, extracted, retired: [...retired].sort(), conflicts, stale, delta: diffNodes(current['robos:nodes'], candidate['robos:nodes']), validation: validateDocument(candidate, { requireEvidence }), requireEvidence };
    proposal.id = hash(proposal);
    return proposal;
  }

  apply(proposal, { expectedProposalId } = {}) {
    const { id, ...body } = proposal;
    if (hash(body) !== id) throw new Error('Proposal content does not match its ID');
    if (expectedProposalId !== undefined && id !== expectedProposalId) throw new Error('Proposal does not match the reviewed ID');
    if (proposal.conflicts.length) throw new Error('Resolve import conflicts before applying this proposal');
    const report = validateDocument(proposal.candidate, { requireEvidence: proposal.requireEvidence });
    if (!report.conforms) throw new Error(`Invalid graph: ${report.errors.join('; ')}`);
    fs.mkdirSync(this.root, { recursive: true });
    const release = acquireLock(path.join(this.root, 'write.lock'));
    try {
      if (hash(this.read()) !== proposal.base || hash(this.state()) !== proposal.stateBase || hash(this.metadata()) !== proposal.metadataBase) throw new Error('Stale proposal: the graph, metadata or import state changed; propose again');
      // A content hash detects damage, not authority. Regenerate all derived
      // fields so a rehashed delta, conflict list or source baseline cannot lie
      // about the request. Callers may additionally pin the reviewed ID above.
      if (!proposal.request || !same(this.propose(proposal.request), proposal)) throw new Error('Proposal is inconsistent with its request; propose again');
      const packageWrites = this.packageWrites(proposal);
      const packagesCurrent = packageWrites.every(([file, value]) => fs.existsSync(file) && (typeof value === 'string' ? fs.readFileSync(file, 'utf8') === value : same(JSON.parse(fs.readFileSync(file, 'utf8')), value)));
      if (packagesCurrent && fs.existsSync(this.file) && hash(this.read()) === hash(proposal.candidate) && same(this.state().extracted, proposal.extracted) && same(this.state().retired || [], proposal.retired)) return { changed: false, revision: hash(proposal.candidate) };
      this.packageWrites(proposal); // Preflight metadata before publishing a journal.
      writeAtomic(this.journal, proposal);
      this.finish(proposal);
      fs.unlinkSync(this.journal);
      return { changed: true, revision: hash(proposal.candidate), proposal: id };
    } finally { release(); }
  }

  packageWrites(proposal) {
    const doc = normalize(proposal.candidate);
    const packages = new Map(DEFAULT_PACKAGES.map(p => [p.id, p]));
    const metadata = proposal.metadata;
    if (!metadata || hash(metadata) !== proposal.metadataBase) throw new Error('Missing or inconsistent proposal metadata');
    for (const [id, envelope] of Object.entries(metadata.packages)) {
      if (!packageId(id)) throw new Error('Invalid package metadata ID');
      packages.set(id, { id, title: envelope['dcterms:title'] || id, namespace: envelope['robos:namespace'] || `robos.${id}` });
    }
    for (const n of doc['robos:nodes']) packages.set(n['robos:package'], packages.get(n['robos:package']) || { id: n['robos:package'], title: n['robos:package'], namespace: `robos.${n['robos:package']}` });
    const writes = [];
    const catalog = [];
    for (const p of [...packages.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      const relative = `kgraphs/${p.id}/package.jsonld`;
      const envelope = metadata.packages[p.id] || {};
      writes.push([path.join(this.root, relative), { '@context': doc['@context'], '@id': `urn:robos:package:${p.id}`, '@type': ['robos:KGraphPackage'], 'dcterms:title': p.title, 'robos:package': p.id, 'robos:namespace': p.namespace, ...envelope, '@context': { ...envelope['@context'], ...doc['@context'] }, 'robos:nodes': doc['robos:nodes'].filter(n => n['robos:package'] === p.id) }]);
      catalog.push({ id: p.id, namespace: p.namespace, title: p.title, path: relative });
    }
    writes.push([path.join(this.root, 'kgraph.yaml'), manifestText(metadata.manifest, catalog, doc['dcterms:title'])]);
    return writes;
  }

  finish(proposal) {
    const doc = normalize(proposal.candidate);
    for (const [file, value] of this.packageWrites(proposal)) writeAtomic(file, value);
    writeAtomic(this.file, doc);
    writeAtomic(this.stateFile, { revision: hash(doc), extracted: proposal.extracted, retired: proposal.retired });
    writeAtomic(path.join(this.root, 'revisions', `${proposal.id}.json`), proposal);
  }

  recover() {
    if (!fs.existsSync(this.root)) return { recovered: false };
    const release = acquireLock(path.join(this.root, 'write.lock'));
    try {
      // Read after locking: another recovery must not replay an old journal
      // after a newer writer has committed.
      if (!fs.existsSync(this.journal)) return { recovered: false };
      const proposal = JSON.parse(fs.readFileSync(this.journal, 'utf8'));
      const { id, ...body } = proposal;
      if (hash(body) !== id || proposal.conflicts?.length !== 0 || !validateDocument(proposal.candidate, { requireEvidence: proposal.requireEvidence }).conforms) throw new Error('Invalid recovery journal');
      if (!proposal.baseline || !proposal.request || !same(this.propose(proposal.request, { ...proposal.baseline, metadata: proposal.metadata }), proposal)) throw new Error('Inconsistent recovery journal');
      const nextState = { revision: hash(normalize(proposal.candidate)), extracted: proposal.extracted, retired: proposal.retired };
      if (hash(this.state()) !== proposal.stateBase && !same(this.state(), nextState)) throw new Error('Recovery journal is stale: import state changed');
      this.finish(proposal);
      fs.unlinkSync(this.journal);
      return { recovered: true, revision: hash(proposal.candidate) };
    } finally { release(); }
  }
}

module.exports = { GraphWorkspace, resolveGraphRoot, validateDocument, diffNodes, normalize, canonical, serialize, hash };
