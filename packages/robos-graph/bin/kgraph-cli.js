#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { SDLCKnowledgeGraphStore } = require('../lib/graph-store');
const { SHACLValidator } = require('../lib/shacl-validator');

function parseArgs(args) {
  const parsed = { _: [], flags: {} };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        parsed.flags[key] = args[++i];
      } else {
        parsed.flags[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        parsed.flags[key] = args[++i];
      } else {
        parsed.flags[key] = true;
      }
    } else {
      parsed._.push(arg);
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`
RobOS Knowledge Graph CLI (kgraph)
Usage: kgraph <command> [arguments] [options]

Commands:
  search <query>                 Search nodes across packages by text, title, tags, or URI
                                 Options: --type <type>, --package <pkg>, --json

  get <node-id>                  Inspect node details, incoming/outgoing reference counts
                                 Options: --json

  insert [json-string]           Insert or register a new node with SHACL validation gate
                                 Options: --file <path>, --package <pkg>, --no-validate

  update <node-id> [json-patch]  Update properties on an existing node with SHACL re-validation
                                 Options: --file <path>, --set <key=value>

  delete <node-id>               Delete a node from its package store and graph index
                                 Options: --cascade (prunes references from other nodes)

  query                          Query nodes by graph filters or path traversal
                                 Options: --type <type>, --package <pkg>, --depends-on <id>,
                                          --path-from <id> --path-to <id>, --json

  impact <node-id>               Trace upstream/downstream blast radius and dependent nodes
                                 Options: --depth <n> (default 3), --json

  validate [package-id]          Run W3C SHACL shape validation across packages
                                 Options: --strict, --json

  diff [branch-name]             Semantic blast radius diff comparing World 1 (main) vs World 2
                                 Options: --base <branch> (default main), --json

  export                         Export graph or package to standard semantic formats
                                 Options: --format <jsonld|ttl|nt> (default jsonld),
                                          --package <pkg>, --output <file>

  visualize [id-or-package]      Generate Mermaid diagram code or component dependency trees
                                 Options: --direction <TD|LR>, --max-nodes <n>, --output <file>

Examples:
  kgraph search "orders" --type robos:Microservice
  kgraph get "urn:robos:service:orders-api"
  kgraph impact "urn:robos:service:auth-service" --depth 2
  kgraph validate services
  kgraph visualize services --direction TD
`);
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0 || rawArgs.includes('--help') || rawArgs.includes('-h') || rawArgs[0] === 'help') {
    printHelp();
    process.exit(0);
  }

  const { _, flags } = parseArgs(rawArgs);
  const command = _[0];

  const store = new SDLCKnowledgeGraphStore();
  const isJson = flags.json === true;

  try {
    switch (command) {
      case 'search':
      case 'find':
      case 's': {
        const query = _[1] || flags.query || '';
        const results = store.searchNodes(query, {
          type: flags.type,
          package: flags.package || flags.pkg,
          ownerTeam: flags['owner-team'] || flags.team,
        });

        if (isJson) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          console.log(`\n🔍 Found ${results.length} Knowledge Graph node(s) matching "${query}":\n`);
          for (const node of results) {
            const types = Array.isArray(node['@type']) ? node['@type'].join(', ') : (node['@type'] || 'Node');
            const pkg = store.packageManager.nodeToPackage.get(node['@id']) || node['robos:package'] || 'core';
            console.log(`  • \x1b[36m${node['@id']}\x1b[0m`);
            console.log(`    Title:   ${node['dcterms:title'] || 'Untitled'}`);
            console.log(`    Type:    ${types}`);
            console.log(`    Package: ${pkg}`);
            if (node['dcterms:description']) {
              console.log(`    Desc:    ${node['dcterms:description']}`);
            }
            console.log('');
          }
        }
        break;
      }

      case 'get':
      case 'inspect':
      case 'show': {
        const id = _[1] || flags.id;
        if (!id) {
          console.error('Error: Node ID required. Usage: kgraph get <node-id>');
          process.exit(1);
        }
        const node = store.getNode(id);
        if (!node) {
          console.error(`Error: Node not found in Knowledge Graph: ${id}`);
          process.exit(1);
        }

        const outbound = Array.from(store.parser.outgoingRefs.get(id) || []);
        const inbound = Array.from(store.parser.incomingRefs.get(id) || []);
        const pkg = store.packageManager.nodeToPackage.get(id) || node['robos:package'] || 'core';

        if (isJson) {
          console.log(JSON.stringify({ ...node, _package: pkg, _inboundRefs: inbound, _outboundRefs: outbound }, null, 2));
        } else {
          console.log(`\n📄 Node: \x1b[36m${node['@id']}\x1b[0m`);
          console.log(`  Package:     ${pkg}`);
          console.log(`  Title:       ${node['dcterms:title'] || 'Untitled'}`);
          console.log(`  Type:        ${Array.isArray(node['@type']) ? node['@type'].join(', ') : node['@type']}`);
          if (node['dcterms:description']) {
            console.log(`  Description: ${node['dcterms:description']}`);
          }
          console.log(`  Outbound References (${outbound.length}):`);
          for (const ref of outbound) console.log(`    → ${ref}`);
          console.log(`  Inbound References  (${inbound.length}):`);
          for (const ref of inbound) console.log(`    ← ${ref}`);
          console.log('');
        }
        break;
      }

      case 'insert':
      case 'add':
      case 'create': {
        let nodeData = null;
        if (flags.file) {
          const content = fs.readFileSync(path.resolve(flags.file), 'utf8');
          nodeData = JSON.parse(content);
        } else if (_[1]) {
          try {
            nodeData = JSON.parse(_[1]);
          } catch (e) {
            console.error('Error: Invalid JSON string for node data.');
            process.exit(1);
          }
        } else if (flags.id && flags.type && flags.title) {
          nodeData = {
            '@id': flags.id,
            '@type': flags.type.includes(':') ? flags.type : `robos:${flags.type}`,
            'dcterms:title': flags.title,
            'dcterms:description': flags.description || flags.desc || '',
          };
          if (flags.package) nodeData['robos:package'] = flags.package;
        } else {
          console.error('Error: Node JSON or flags required. Usage: kgraph insert [json-string] or --file <path> or --id <id> --type <type> --title <title>');
          process.exit(1);
        }

        if (flags['no-validate'] !== true) {
          const validator = new SHACLValidator();
          const mockGraph = { nodes: [nodeData] };
          const valRes = validator.validateGraph(mockGraph);
          if (!valRes.conforms) {
            console.error('\x1b[31m❌ SHACL Validation Error: Node does not satisfy schema constraints:\x1b[0m');
            for (const r of valRes.results || []) {
              console.error(`  - [${r.severity || 'Violation'}] ${r.message} (${r.focusNode})`);
            }
            process.exit(1);
          }
        }

        const inserted = store.addNode(nodeData);
        if (isJson) {
          console.log(JSON.stringify({ success: true, node: inserted }, null, 2));
        } else {
          console.log(`\x1b[32m✔ Successfully inserted node into Knowledge Graph:\x1b[0m ${inserted['@id']}`);
          if (store.latestDocSyncPrompt) {
            console.log(`ℹ Doc Sync Assessment: ${store.latestDocSyncPrompt}`);
          }
        }
        break;
      }

      case 'update':
      case 'patch':
      case 'edit': {
        const id = _[1] || flags.id;
        if (!id) {
          console.error('Error: Node ID required. Usage: kgraph update <node-id> [json-patch]');
          process.exit(1);
        }

        let patch = {};
        if (flags.file) {
          patch = JSON.parse(fs.readFileSync(path.resolve(flags.file), 'utf8'));
        } else if (_[2]) {
          patch = JSON.parse(_[2]);
        } else if (flags.set) {
          const [k, v] = flags.set.split('=');
          patch[k.trim()] = v.trim();
        }

        const updated = store.updateNode(id, patch);
        if (!updated) {
          console.error(`Error: Node not found to update: ${id}`);
          process.exit(1);
        }

        if (isJson) {
          console.log(JSON.stringify({ success: true, node: updated }, null, 2));
        } else {
          console.log(`\x1b[32m✔ Successfully updated node in Knowledge Graph:\x1b[0m ${id}`);
        }
        break;
      }

      case 'delete':
      case 'remove':
      case 'rm':
      case 'del': {
        const id = _[1] || flags.id;
        if (!id) {
          console.error('Error: Node ID required. Usage: kgraph delete <node-id>');
          process.exit(1);
        }
        const cascade = flags.cascade === true;
        const removed = store.removeNode(id, { cascade });
        if (!removed) {
          console.error(`Error: Node not found to delete: ${id}`);
          process.exit(1);
        }

        if (isJson) {
          console.log(JSON.stringify({ success: true, deletedId: id, cascade }, null, 2));
        } else {
          console.log(`\x1b[32m✔ Successfully deleted node from Knowledge Graph:\x1b[0m ${id} (cascade: ${cascade})`);
        }
        break;
      }

      case 'query': {
        if (flags['path-from'] && flags['path-to']) {
          const pathRes = store.findPath(flags['path-from'], flags['path-to'], Number(flags['max-depth'] || 6));
          if (isJson) {
            console.log(JSON.stringify(pathRes, null, 2));
          } else if (pathRes) {
            console.log(`\n🛤️ Path found between ${flags['path-from']} and ${flags['path-to']} (${pathRes.length} hops):\n`);
            for (let i = 0; i < pathRes.length; i++) {
              console.log(`  [${i + 1}] ${pathRes[i].id} (${pathRes[i].node ? pathRes[i].node['dcterms:title'] || '' : ''})`);
            }
            console.log('');
          } else {
            console.log(`No direct reference path found between ${flags['path-from']} and ${flags['path-to']}.`);
          }
          return;
        }

        const filter = {};
        if (flags.type) filter.type = flags.type;
        if (flags.package) filter.package = flags.package;
        if (flags.search) filter.search = flags.search;

        const results = store.query(filter);
        if (isJson) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          console.log(`\n🔍 Query returned ${results.length} node(s):\n`);
          for (const n of results) {
            console.log(`  • ${n['@id']} - ${n['dcterms:title'] || 'Untitled'}`);
          }
          console.log('');
        }
        break;
      }

      case 'impact':
      case 'blast-radius':
      case 'deps': {
        const id = _[1] || flags.id;
        if (!id) {
          console.error('Error: Node ID required. Usage: kgraph impact <node-id>');
          process.exit(1);
        }
        const depth = Number(flags.depth || 3);
        const blast = store.findDependents(id, depth);

        if (isJson) {
          console.log(JSON.stringify(blast, null, 2));
        } else {
          console.log(`\n💥 Impact Analysis & Blast Radius for \x1b[36m${id}\x1b[0m:`);
          console.log(`   Direct & Transitive Dependents: ${blast.blastRadiusCount} (Max Depth: ${depth})\n`);
          for (const dep of blast.dependents || []) {
            console.log(`  • [Depth ${dep.depth}] \x1b[33m${dep.node['@id']}\x1b[0m (${dep.node['dcterms:title'] || 'Untitled'}) via ${dep.via}`);
          }
          console.log('');
        }
        break;
      }

      case 'validate':
      case 'check':
      case 'lint': {
        const pkgId = _[1] || flags.package;
        const res = store.validate();

        if (isJson) {
          console.log(JSON.stringify(res, null, 2));
        } else if (res.conforms) {
          console.log(`\x1b[32m✔ Knowledge Graph passes 100% of W3C SHACL shape constraints (0 violations).\x1b[0m`);
        } else {
          console.error(`\x1b[31m❌ Knowledge Graph validation failed with ${res.results ? res.results.length : 0} violation(s):\x1b[0m`);
          for (const v of res.results || []) {
            console.error(`  - [${v.severity || 'Violation'}] ${v.message} (FocusNode: ${v.focusNode})`);
          }
          process.exit(1);
        }
        break;
      }

      case 'diff': {
        const targetBranch = _[1] || flags.target || 'feature';
        const baseBranch = flags.base || 'main';
        const diffRes = store.diffBranches(baseBranch, targetBranch);

        if (isJson) {
          console.log(JSON.stringify(diffRes, null, 2));
        } else {
          console.log(`\n🌐 Semantic Blast Radius Diff (${baseBranch} ➔ ${targetBranch}):`);
          console.log(`  Added Nodes:    ${(diffRes.addedNodes || []).length}`);
          console.log(`  Modified Nodes: ${(diffRes.modifiedNodes || []).length}`);
          console.log(`  Removed Nodes:  ${(diffRes.removedNodes || []).length}`);
          if (diffRes.breakingChanges && diffRes.breakingChanges.length > 0) {
            console.log(`\n  ⚠️ Breaking Changes Detected (${diffRes.breakingChanges.length}):`);
            for (const b of diffRes.breakingChanges) {
              console.log(`    - ${b.nodeId}: ${b.reason}`);
            }
          }
          console.log('');
        }
        break;
      }

      case 'export': {
        const fmt = flags.format || 'jsonld';
        const pkgId = flags.package || flags.pkg || null;
        const exported = store.exportGraph(fmt, pkgId);

        if (flags.output || flags.out) {
          const outPath = path.resolve(flags.output || flags.out);
          fs.writeFileSync(outPath, exported, 'utf8');
          console.log(`\x1b[32m✔ Exported Knowledge Graph to ${outPath} (${fmt})\x1b[0m`);
        } else {
          console.log(exported);
        }
        break;
      }

      case 'visualize':
      case 'viz':
      case 'mermaid': {
        const target = _[1] || flags.id || flags.package || null;
        let rootId = null;
        let packageId = null;
        if (target) {
          if (target.startsWith('urn:')) {
            rootId = target;
          } else {
            packageId = target;
          }
        }
        const direction = flags.direction || 'TD';
        const maxNodes = Number(flags['max-nodes'] || 40);
        const mermaid = store.generateMermaidGraph({ rootId, packageId, direction, maxNodes });

        if (flags.output || flags.out) {
          const outPath = path.resolve(flags.output || flags.out);
          fs.writeFileSync(outPath, mermaid, 'utf8');
          console.log(`\x1b[32m✔ Generated Mermaid diagram saved to ${outPath}\x1b[0m`);
        } else {
          console.log(mermaid);
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(`\x1b[31mError executing kgraph ${command}: ${err.message}\x1b[0m`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

main();
