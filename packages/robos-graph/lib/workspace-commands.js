'use strict';
const fs = require('node:fs');
const { GraphWorkspace, hash, serialize, validateDocument, diffNodes } = require('./graph-workspace');

const COMMANDS = new Set(['init', 'inspect', 'propose', 'apply', 'recover', 'context']);
function workspaceCommand(command, flags) {
  const workspace = new GraphWorkspace(flags['graph-root'] || process.env.ROBOS_GRAPH_ROOT);
  const readJSON = file => {
    if (typeof file !== 'string') throw new Error('A JSON file path is required');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  };
  let result;
  if (command === 'init') {
    if (fs.existsSync(workspace.file)) throw new Error('Graph already exists; use propose to change it');
    result = workspace.apply(workspace.propose({ mode: 'replace', document: workspace.empty(flags.title || 'Workspace Knowledge Graph') }));
  } else if (command === 'inspect') {
    const doc = workspace.read();
    const packages = {};
    for (const node of doc['robos:nodes']) packages[node['robos:package']] = (packages[node['robos:package']] || 0) + 1;
    result = { title: doc['dcterms:title'], revision: hash(doc), nodes: doc['robos:nodes'].length, packages, validation: validateDocument(doc, { requireEvidence: !!flags['require-evidence'] }) };
  } else if (command === 'propose') {
    const input = readJSON(flags.file);
    result = workspace.propose({ mode: flags.mode || (input.edits ? 'refine' : 'import'), document: input.document || input, edits: input.edits, prompt: flags.prompt || input.prompt || '', requireEvidence: !!flags['require-evidence'] });
  } else if (command === 'apply') result = workspace.apply(readJSON(flags.file));
  else if (command === 'recover') result = workspace.recover();
  else if (command === 'context') {
    const { WorkspaceReview } = require('./workspace-review');
    result = new WorkspaceReview(workspace.root).context({ prompt: flags.prompt || '', query: flags.query || '', packageId: flags.package, nodeId: flags.id, limit: Number(flags.limit || 40) });
  } else if (command === 'diff') result = diffNodes(workspace.read()['robos:nodes'], readJSON(flags.file)['robos:nodes']);
  else throw new Error(`Unsupported workspace command: ${command}`);
  if (flags.output) fs.writeFileSync(flags.output, serialize(result));
  else console.log(serialize(result));
  if (result.validation && !result.validation.conforms) process.exitCode = 1;
  return result;
}

module.exports = { workspaceCommand, COMMANDS };
