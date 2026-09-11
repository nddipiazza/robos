'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { OSLC_CONTEXT } = require('./oslc-parser');

const MAX_BYTES = 2 * 1024 * 1024;
const BULK = /(^|\/)(?:\.git|node_modules|vendor|dist|build|coverage|\.cache|\.next|\.turbo|__pycache__|generated|gen)(\/|$)|(?:\.pb\.go|_pb\.[jt]s|\.min\.js|\.map)$/i;
const SENSITIVE = /(^|\/)(?:\.env(?:\..*)?|\.npmrc|\.netrc|credentials(?:\..*)?|secrets?(?:\..*)?|id_rsa|id_ed25519)$|\.(?:pem|key|p12|pfx)$/i;
const identifier = value => typeof value === 'string' && /^[A-Za-z_@][A-Za-z0-9_@./+-]*$/.test(value) && value.length < 240;
const ref = id => ({ '@id': id });
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Deliberately no shell, hooks, network, user Git configuration or imported code.
function git(root, args, optional = false) {
  try {
    return execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', root, ...args], {
      encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
      env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } catch (_) {
    if (optional) return '';
    throw new Error('Unable to inspect source checkout with Git');
  }
}

function portableURL(raw) {
  if (!raw || /[\r\n]/.test(raw)) return undefined;
  // SCP-style SSH locations: discard the login, preserve only host and repo.
  const scp = raw.match(/^(?:[^/@:]+@)?([A-Za-z0-9.-]+):([^/].*)$/);
  if (scp && !raw.includes('://')) raw = `ssh://${scp[1]}/${scp[2]}`;
  try {
    const url = new URL(raw);
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol) || !url.hostname) return undefined;
    url.username = ''; url.password = ''; url.search = ''; url.hash = '';
    return url.toString();
  } catch (_) { return undefined; }
}

function prefixes(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(p => typeof p !== 'string' || !p || p.startsWith('/') || p.includes('\\') || p.split('/').includes('..'))) {
    throw new Error('Exclusions must be relative path prefixes');
  }
  return value.map(p => p.replace(/^\.\//, '').replace(/\/$/, ''));
}

function classify(file) {
  const base = path.posix.basename(file);
  if (base === 'package.json') return ['node-package', 'applications'];
  if (base === 'go.mod') return ['go-module', 'services'];
  if (file.endsWith('.proto')) return ['protobuf', 'services'];
  if (/(^|\/)ent\/schema\/[^/]+\.go$/.test(file)) return ['ent-schema', 'core-platform'];
  if (base === 'Chart.yaml') return ['helm-chart', 'devops'];
  if (/^(?:docker-)?compose(?:[.-].*)?\.ya?ml$/i.test(base)) return ['compose', 'devops'];
  if (/^Pulumi(?:\..*)?\.ya?ml$/.test(base)) return ['pulumi', 'devops'];
  if (/^\.github\/workflows\/.*\.ya?ml$/.test(file) || /(^|\/)\.buildkite\//.test(file) || base === '.gitlab-ci.yml') return ['ci-workflow', 'devops'];
  if (/^(?:Makefile|Dockerfile(?:\..*)?|BUILD(?:\.bazel)?|WORKSPACE(?:\.bazel)?|MODULE\.bazel|\.bazelrc|CMakeLists.txt|settings\.gradle|build\.gradle)$/.test(base)) return ['build-settings', 'core-platform'];
  if (base === 'SKILL.md') return ['agent-skill', 'learning'];
  if (/\.(?:md|mdx)$/i.test(base)) return [/(^|\/)(?:training|tutorials?|labs?|lessons?|courses?)(\/|$)/i.test(file) ? 'training' : 'markdown', /(^|\/)(?:training|tutorials?|labs?|lessons?|courses?)(\/|$)/i.test(file) ? 'learning' : 'documentation'];
  if (/(?:\.test\.[cm]?[jt]sx?|\.spec\.[cm]?[jt]sx?|_test\.go|test_[^/]+\.py|\.feature)$/.test(base)) return ['test-suite', 'testing'];
  return ['unsupported', 'core-platform'];
}

// Replace comments without moving token line numbers; never evaluate source text.
function uncomment(text) {
  return text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, token => token.startsWith('/') ? token.replace(/[^\n]/g, ' ') : token);
}

function codeOnly(text) {
  return uncomment(text).replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`/g, token => token.replace(/[^\n]/g, ' '));
}

function goRequirements(clean) {
  const requirements = [];
  let block = null;
  for (const [index, raw] of clean.split('\n').entries()) {
    let line = raw.trim();
    if (!line) continue;
    if (line === ')') { block = null; continue; }
    const opening = line.match(/^([A-Za-z]+)\s*\(\s*$/);
    if (opening) { block = opening[1]; continue; }
    if (block !== 'require') {
      if (block || !/^require\s+/.test(line)) continue;
      line = line.replace(/^require\s+/, '');
    }
    const requirement = line.match(/^(?:"([^"]+)"|(\S+))\s+v\S+\s*$/);
    const name = requirement && (requirement[1] || requirement[2]);
    if (identifier(name)) requirements.push({ name: 'go:' + name, predicate: 'robos:dependsOn', line: index + 1 });
  }
  return requirements;
}

/** Extract checkout declarations. Revision identifies HEAD; hashes identify working bytes.
 * No source contents, commands, configuration values or local paths are exported.
 * includeUnsupported defaults to false; inventory always covers every tracked file.
 * Coverage (per repository):
 * trackedFiles = excludedFiles + missingFiles + unreadableFiles + inspectedFiles.
 * inspectedFiles counts readable text passing all exclusions, whether modeled or not.
 * artifactFiles counts files represented by a file artifact (not graph node count).
 * extractedFiles is a compatibility alias for artifactFiles, NOT semantic coverage.
 * semanticFiles counts files with extracted child declarations; it is not a claim
 * that the entire file is modeled. noSemanticExtractionFiles includes all other
 * inspected files, including unsupported files omitted from the graph.
 * unsupportedFiles is a subset of inspectedFiles and overlaps artifactFiles only
 * with includeUnsupported=true. byKind counts inspected files, independent of mode.
 * Inventory sha256 is null for files not read; exclusions do not trigger reads.
 */
function extractSources(manifest, localPaths) {
  if (!manifest || !/^[a-z][a-z0-9-]*$/.test(manifest.namespace) || typeof manifest.title !== 'string' || !manifest.title.trim() || !Array.isArray(manifest.sources) || !localPaths) {
    throw new Error('A namespace, title, sources and explicit localPaths are required');
  }
  if (manifest.includeUnsupported !== undefined && typeof manifest.includeUnsupported !== 'boolean') throw new Error('includeUnsupported must be a boolean');
  const globalExclude = prefixes(manifest.exclude);
  const seen = new Set();
  for (const source of manifest.sources) {
    if (!source || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(source.id) || seen.has(source.id)) throw new Error('Source IDs must be unique portable identifiers');
    seen.add(source.id); prefixes(source.exclude);
    if (typeof localPaths[source.id] !== 'string' || !path.isAbsolute(localPaths[source.id])) throw new Error(`Missing absolute checkout for source ${source.id}`);
  }
  const nodes = [], sources = [], warnings = [], coverage = [], inventory = [];
  const packages = new Map(), dependencies = [], protoSources = [];
  const urn = `urn:${manifest.namespace}`;

  for (const source of manifest.sources) {
    const root = localPaths[source.id], repoId = `${urn}:repo:${source.id}`;
    let top;
    try { top = git(root, ['rev-parse', '--show-toplevel']); }
    catch (_) { throw new Error(`Source ${source.id} is missing or is not a Git checkout`); }
    if (fs.realpathSync(top) !== fs.realpathSync(root)) throw new Error(`Source ${source.id} must name a checkout root`);
    const revision = git(root, ['rev-parse', '--verify', 'HEAD'], true) || null;
    const origin = portableURL(git(root, ['config', '--get', 'remote.origin.url'], true));
    const remoteHead = git(root, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], true).replace(/^refs\/remotes\/origin\//, '');
    const branch = git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], true) || null;
    const defaultBranch = remoteHead || null;
    const branchMetadataStatus = remoteHead ? 'remote-head' : branch ? 'default-unknown-current-branch-known' : 'unknown-detached';
    const files = [...new Set(git(root, ['ls-files', '-z', '--cached']).split('\0').filter(Boolean))].sort();
    const moduleFiles = files.filter(p => /(^|\/)(?:package\.json|go\.mod|Chart\.yaml)$/.test(p)).sort((a, b) => b.length - a.length);
    const statuses = new Map();
    let untrackedFiles = 0;
    for (const entry of git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']).split('\0').filter(Boolean)) {
      const state = entry.slice(0, 2), file = entry.slice(3);
      if (state === '??') untrackedFiles++;
      else statuses.set(file, state);
    }
    const count = { repository: source.id, trackedFiles: files.length, inspectedFiles: 0, artifactFiles: 0, excludedFiles: 0, missingFiles: 0, unreadableFiles: 0, unsupportedFiles: 0, noSemanticExtractionFiles: 0, extractedFiles: 0, semanticFiles: 0, modifiedFiles: statuses.size, untrackedFiles, byKind: {} };
    const metadata = { id: source.id, revision, origin: origin || null, defaultBranch, currentBranch: branch, branchMetadataStatus, dirty: statuses.size > 0 || untrackedFiles > 0 };
    const expected = portableURL(source.url);
    if (expected && origin && expected !== origin) warnings.push({ repository: source.id, code: 'origin-mismatch' });
    if (!origin) warnings.push({ repository: source.id, code: 'origin-unavailable' });
    if (!defaultBranch) warnings.push({ repository: source.id, code: 'default-branch-unknown' });
    if (!revision) warnings.push({ repository: source.id, code: 'revision-unavailable' });
    const repo = { '@id': repoId, '@type': origin && defaultBranch ? ['robos:GitRepository', 'schema:SoftwareSourceCode'] : ['robos:SourceArtifact', 'schema:CreativeWork'], 'dcterms:title': source.id, 'robos:package': 'organization', 'robos:sourcePath': '.', 'robos:sourceKind': 'git-repository', 'robos:inRepository': ref(repoId), 'robos:branchMetadataStatus': branchMetadataStatus, 'robos:status': 'implemented', 'robos:revision': revision };
    if (origin) repo['robos:url'] = origin;
    if (defaultBranch) repo['robos:defaultBranch'] = defaultBranch;
    if (branch) repo['robos:currentBranch'] = branch;
    repo['robos:evidenceStatus'] = repo['robos:status'];
    nodes.push(repo);
    const excludes = [...globalExclude, ...prefixes(source.exclude)];
    const evidenceCandidates = [];

    for (const file of files) {
      const [kind, pkg] = classify(file);
      const entry = { repository: source.id, path: file, type: kind, disposition: 'excluded', reason: null, sha256: null, revision, workingTreeStatus: statuses.get(file) || 'clean', represented: false, semanticExtraction: false, nodeIds: [] };
      inventory.push(entry);
      if (BULK.test(file) || SENSITIVE.test(file) || excludes.some(p => file === p || file.startsWith(`${p}/`))) {
        entry.reason = SENSITIVE.test(file) ? 'sensitive-path' : BULK.test(file) ? 'bulk-path' : 'manifest-exclusion';
        count.excludedFiles++; continue;
      }
      const absolute = path.join(root, file);
      let bytes;
      try {
        const stat = fs.lstatSync(absolute);
        if (!stat.isFile() || stat.size > MAX_BYTES || !fs.realpathSync(absolute).startsWith(fs.realpathSync(root) + path.sep)) {
          entry.reason = !stat.isFile() ? 'not-regular-file' : stat.size > MAX_BYTES ? 'size-limit' : 'outside-checkout';
          count.excludedFiles++; continue;
        }
        bytes = fs.readFileSync(absolute);
      } catch (error) {
        if (error.code === 'ENOENT') count.missingFiles++; else count.unreadableFiles++;
        entry.disposition = error.code === 'ENOENT' ? 'missing' : 'unreadable';
        entry.reason = error.code === 'ENOENT' ? 'tracked-file-missing' : 'tracked-file-unreadable';
        warnings.push({ repository: source.id, path: file, code: error.code === 'ENOENT' ? 'tracked-file-missing' : 'tracked-file-unreadable' });
        continue;
      }
      entry.sha256 = digest(bytes);
      if (bytes.includes(0)) { entry.reason = 'binary'; count.excludedFiles++; continue; }
      const text = bytes.toString('utf8');
      if (/\bCode generated\b[^\n]*\bDO NOT EDIT\b|@generated\b/.test(text.slice(0, 1024))) { entry.reason = 'generated-content'; count.excludedFiles++; continue; }
      count.inspectedFiles++; count.byKind[kind] = (count.byKind[kind] || 0) + 1;
      if (kind === 'unsupported') count.unsupportedFiles++;
      const hash = entry.sha256;
      const artifactId = `${urn}:artifact:${source.id}:${encodeURIComponent(file)}`;
      const evidence = line => [{ repository: source.id, path: file, line, revision, sha256: hash, workingTreeStatus: statuses.get(file) || 'clean' }];
      const moduleFile = moduleFiles.find(p => path.posix.dirname(p) === '.' || file.startsWith(path.posix.dirname(p) + '/'));
      const provenance = { extractor: 'source-extractor', module: moduleFile ? path.posix.dirname(moduleFile) : '.', path: file, repository: source.id };
      evidenceCandidates.push({ file, kind, evidence: evidence(1), provenance });
      if (kind === 'unsupported' && !manifest.includeUnsupported) {
        entry.disposition = 'unsupported'; entry.reason = 'no-extractor';
        count.noSemanticExtractionFiles++; continue;
      }
      const status = ['markdown', 'training', 'agent-skill'].includes(kind) ? 'documented' : ['ent-schema', 'test-suite'].includes(kind) ? 'implemented' : 'declared';
      const artifact = { '@id': artifactId, '@type': ['robos:SourceArtifact', 'schema:CreativeWork'], 'dcterms:title': file, 'robos:sourcePath': file, 'robos:sourceKind': kind, 'robos:inRepository': ref(repoId), 'robos:package': pkg, 'robos:status': status, 'robos:evidence': evidence(1), 'robos:provenance': provenance };
      nodes.push(artifact);
      artifact['robos:evidenceStatus'] = status;
      entry.disposition = 'represented'; entry.represented = true;
      entry.reason = kind === 'unsupported' ? 'unsupported-opt-in' : 'artifact-only';
      entry.nodeIds.push(artifactId);
      count.artifactFiles++; count.extractedFiles++;
      let semantic = false;
      const child = (key, type, title, properties = {}, line = 1) => {
        const node = { ...artifact, '@id': `${artifactId}#${encodeURIComponent(key)}`, '@type': [type], 'dcterms:title': title, 'robos:derivedFrom': ref(artifactId), 'robos:evidence': evidence(line), ...properties };
        nodes.push(node); entry.nodeIds.push(node['@id']); semantic = true; return node;
      };
      const register = (name, node, deps) => {
        if (!packages.has(name)) packages.set(name, []);
        packages.get(name).push(node['@id']); dependencies.push({ node, names: deps, evidence });
      };
      try {
        if (kind === 'node-package') {
          const data = JSON.parse(text);
          if (identifier(data.name)) {
            const deps = Object.keys({ ...data.dependencies, ...data.devDependencies, ...data.peerDependencies, ...data.optionalDependencies }).filter(identifier);
            const framework = ['react', 'vue', 'svelte', '@angular/core', 'next'].find(d => deps.includes(d));
            const frontend = framework && !data.exports && !data.main;
            const node = child('package', frontend ? 'robos:FrontEndApp' : 'robos:Library', data.name, { 'robos:repository': ref(repoId), 'robos:technology': 'Node.js', ...(frontend ? { 'robos:frontendFramework': framework } : {}) });
            register('npm:' + data.name, node, ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap(section => Object.keys(data[section] || {}).filter(identifier).map(name => ({ name: 'npm:' + name, predicate: { dependencies: 'robos:dependsOn', devDependencies: 'robos:developmentDependsOn', peerDependencies: 'robos:peerDependsOn', optionalDependencies: 'robos:optionalDependsOn' }[section], line: text.slice(0, Math.max(0, text.indexOf(JSON.stringify(name), text.indexOf(JSON.stringify(section))))).split('\n').length }))));
          }
        } else if (kind === 'go-module') {
          const clean = uncomment(text), match = clean.match(/^module\s+(\S+)/m);
          if (match && identifier(match[1])) {
            const node = child('module', 'robos:Library', match[1], { 'robos:repository': ref(repoId), 'robos:technology': 'Go' });
            register('go:' + match[1], node, goRequirements(clean));
          }
        } else if (kind === 'protobuf') {
          const clean = codeOnly(text), contract = child('contract', 'robos:Contract', file, { 'robos:specFile': file, 'robos:protocol': 'protobuf' });
          protoSources.push({ repository: source.id, file, text: uncomment(text), contract, evidence });
          // Scope names with brace nesting so nested messages and per-service RPCs stay distinct.
          const stack = []; let pending = null;
          const tokens = /\b(service|message|enum|rpc)\s+([A-Za-z_]\w*)|[{}]/g;
          for (const match of clean.matchAll(tokens)) {
            if (match[1]) {
              const name = [...stack.filter(Boolean), match[2]].join('.');
              const line = clean.slice(0, match.index).split('\n').length;
              if (match[1] === 'message') child(`message:${name}`, 'robos:DataModel', name, { 'robos:modelName': name, 'robos:definedInContract': ref(contract['@id']) }, line);
              else child(`${match[1]}:${name}`, 'robos:SourceArtifact', name, { '@type': ['robos:SourceArtifact', 'schema:CreativeWork'], 'robos:sourceKind': `protobuf-${match[1]}`, 'robos:definedInContract': ref(contract['@id']) }, line);
              pending = match[1] === 'rpc' ? null : match[2];
            } else if (match[0] === '{') { stack.push(pending); pending = null; }
            else stack.pop();
          }
        } else if (kind === 'ent-schema') {
          const clean = codeOnly(text);
          for (const match of clean.matchAll(/\btype\s+(\w+)\s+struct\s*\{\s*ent\.Schema\b/g)) child(`entity:${match[1]}`, 'robos:DataModel', match[1], { 'robos:modelName': match[1], 'robos:modelKind': 'ent-schema' }, clean.slice(0, match.index).split('\n').length);
        } else if (kind === 'markdown' || kind === 'training') {
          // Titles use portable paths; prose may contain credentials or local paths.
          child('document', 'robos:DocumentationPage', file, { 'robos:slug': encodeURIComponent(file), 'robos:docPath': file });
        } else if (kind === 'agent-skill') {
          const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
          const name = front && front[1].match(/^name:\s*["']?([\w.-]+)["']?\s*$/m);
          if (name) child('skill', 'robos:AgentSkill', name[1], { '@type': ['robos:AgentSkill', 'schema:CreativeWork'], 'robos:skillName': name[1] });
        } else if (kind === 'helm-chart' || kind === 'pulumi') {
          // Only conservative, literal top-level YAML metadata. Templates and config are not evaluated.
          const name = text.match(/^name:\s*["']?([A-Za-z_][\w.-]*)["']?\s*(?:#.*)?$/m);
          if (name) {
            artifact['robos:declaredName'] = name[1];
            if (kind === 'helm-chart') {
              const version = text.match(/^version:\s*["']?([0-9][\w.+-]*)["']?\s*(?:#.*)?$/m);
              if (version) artifact['robos:version'] = version[1];
            }
          }
        } else if (kind === 'compose') {
          // Service names are declarations, not evidence of running deployments.
          const lines = text.split(/\r?\n/); let inServices = false;
          for (let i = 0; i < lines.length; i++) {
            if (/^services:\s*(?:#.*)?$/.test(lines[i])) { inServices = true; continue; }
            if (/^\S/.test(lines[i]) && !lines[i].startsWith('#')) inServices = false;
            const match = inServices && lines[i].match(/^  ([A-Za-z_][\w.-]*):\s*(?:#.*)?$/);
            if (match) child(`service:${match[1]}`, 'robos:SourceArtifact', match[1], { '@type': ['robos:SourceArtifact', 'schema:CreativeWork'], 'robos:sourceKind': 'compose-service' }, i + 1);
          }
        } else if (kind === 'ci-workflow') {
          if (/^\s*(?:jobs|steps|pipeline|stages):/m.test(text)) child('pipeline', 'robos:CICDPipeline', file, { 'robos:platform': file.startsWith('.github/') ? 'GitHub Actions' : file.includes('.buildkite/') ? 'Buildkite' : 'GitLab CI', 'robos:workflowFile': file });
        } else if (kind === 'build-settings') {
          const base = path.posix.basename(file);
          const tool = base.startsWith('Dockerfile') ? 'Docker' : base === 'Makefile' ? 'Make' : base.includes('gradle') ? 'Gradle' : base === 'CMakeLists.txt' ? 'CMake' : 'Bazel';
          child('build', 'robos:BuildSystem', file, { 'robos:buildTool': tool, 'robos:configFile': file });
        } else if (kind === 'test-suite') {
          const framework = file.endsWith('_test.go') ? 'Go testing' : /(?:from|require\()\s*["']node:test["']/.test(text) ? 'node:test' : /["']@playwright\/test["']/.test(text) ? 'Playwright' : /["']vitest["']/.test(text) ? 'Vitest' : /\bimport pytest\b/.test(text) ? 'pytest' : null;
          if (framework) child('suite', 'robos:TestSuite', file, { 'robos:testFramework': framework });
        }
      } catch (_) { warnings.push({ repository: source.id, path: file, code: 'semantic-extraction-failed' }); }
      entry.semanticExtraction = semantic;
      if (semantic) { count.semanticFiles++; entry.reason = 'partial-declarations'; }
      else count.noSemanticExtractionFiles++;
    }
    evidenceCandidates.sort((a, b) => {
      const rank = c => /(^|\/)README(?:\.md)?$/i.test(c.file) ? 0 : ['node-package', 'go-module', 'helm-chart'].includes(c.kind) ? 1 : 2;
      return rank(a) - rank(b) || a.file.localeCompare(b.file);
    });
    if (evidenceCandidates.length) {
      repo['robos:evidence'] = evidenceCandidates[0].evidence;
      repo['robos:provenance'] = evidenceCandidates[0].provenance;
      metadata.represented = true;
      metadata.evidenceStatus = 'implemented';
      count.representedRepositories = 1;
    } else {
      nodes.splice(nodes.indexOf(repo), 1);
      metadata.represented = false;
      metadata.evidenceStatus = 'unresolved';
      count.representedRepositories = 0;
      warnings.push({ repository: source.id, code: 'repository-evidence-unavailable' });
    }
    sources.push(metadata); coverage.push(count);
  }
  const { addRelationship, linkProtobufDependencies } = require('./source-dependencies');
  for (const { node, names, evidence } of dependencies) {
    for (const dep of names) {
      const matches = packages.get(dep.name) || [];
      if (matches.length === 1 && matches[0] !== node['@id']) addRelationship(node, dep.predicate, matches[0], evidence(dep.line));
      else warnings.push({ code: matches.length > 1 ? 'ambiguous-module-dependency' : 'unresolved-module-dependency', module: dep.name, from: node['@id'], predicate: dep.predicate });
    }
  }
  linkProtobufDependencies(nodes, protoSources, warnings);
  // Provenance is explicit evidence of location/derivation, not runtime coupling.
  for (const node of nodes) for (const key of ['robos:inRepository', 'robos:repository', 'robos:derivedFrom', 'robos:definedInContract']) {
    for (const value of [].concat(node[key] || [])) {
      const target = typeof value === 'string' ? value : value['@id'];
      if (target && target !== node['@id']) addRelationship(node, key, target, node['robos:evidence']);
    }
  }
  return { document: { '@context': OSLC_CONTEXT, '@id': `${urn}:graph:system`, '@type': ['oslc:ServiceProvider', 'robos:SystemGraph'], 'dcterms:title': manifest.title, 'robos:nodes': nodes }, sources, coverage, warnings, inventory };
}

module.exports = { extractSources };
