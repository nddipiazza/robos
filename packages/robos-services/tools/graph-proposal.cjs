'use strict';
// Prepare the scoped registration without bypassing the repository's review gate.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { GraphWorkspace, validateDocument } = require('../../robos-graph/lib/graph-workspace');
const { managed } = require('../lib/catalog.cjs');
const repo = path.resolve(__dirname, '../../..'), output = path.join(repo, '.robos/proposals/robos-services.json');
function node(id, type, title, source, extra = {}) {
  return { '@id': id, '@type': [type], 'dcterms:title': title, 'robos:package': type === 'robos:DesktopApp' ? 'applications' : 'services', 'robos:repository': source, 'robos:technology': 'Node.js 20+ / vanilla JavaScript', 'robos:refersFrom': type === 'robos:DesktopApp' ? 'https://schema.org/SoftwareApplication' : 'https://w3id.org/c4/Container', 'robos:evidence': [{ repository: 'https://github.com/nddipiazza/robos', path: source, line: 1, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, source))).digest('hex') }], ...extra };
}
const nodes = [node('urn:robos:desktop-app:robos-services', 'robos:DesktopApp', 'RobOS Services', 'packages/robos-services/main.js', { 'robos:desktopFramework': 'Electron', 'robos:dependsOn': ['urn:robos:service:robos-services-gateway'] }), ...managed.map(service => node(`urn:robos:service:robos-services-${service.id}`, 'robos:Microservice', service.name, 'packages/robos-services/server.cjs', { 'dcterms:description': service.description, 'robos:ports': [service.port] }))];
const workspace = new GraphWorkspace(repo), document = { ...workspace.empty('RobOS Services registration'), 'robos:nodes': nodes };
const validation = validateDocument(document, { requireEvidence: true });
if (!validation.conforms) throw new Error(validation.errors.join('\n'));
const request = { prompt: 'Register the Services app and its authenticated persistent service suite. Update living docs to match.', edits: nodes.map(node => ({ op: 'add', node })) };
let proposal;
try { proposal = workspace.propose({ ...request, mode: 'refine' }); }
catch (e) { proposal = { status: 'pending-existing-graph-repair', reason: e.message, ...request, validation }; }
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(proposal, null, 2) + '\n');
console.log(JSON.stringify({ output, scopedValidation: validation.conforms, status: proposal.status || 'proposed', errors: proposal.validation?.errors?.length || 0 }));
