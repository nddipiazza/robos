#!/usr/bin/env node
'use strict';

/**
 * RobOS Luxir Search Index Direct CLI Tool
 *
 * Provides direct command-line access to query, inspect, and verify
 * documents indexed into the Luxir Search Engine by the Kgraph Parse Portal.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const { LuxirSearchBridge } = require('../lib/luxir-search-bridge');
const { scanPathToGraphNodes } = require('../lib/fs-mime-classifier');

const PORT = parseInt(process.env.ROBOS_PARSE_PORT || '19192', 10);
const LUXIR_ENDPOINT = process.env.ROBOS_LUXIR_ENDPOINT || 'http://127.0.0.1:8983';

function httpGet(urlStr) {
  return new Promise((resolve, reject) => {
    const req = http.get(urlStr, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function getLivePortalResults(query = '', type = '') {
  for (const port of [19192, 19193]) {
    try {
      const q = encodeURIComponent(query);
      const t = encodeURIComponent(type);
      const res = await httpGet(`http://localhost:${port}/api/v1/search?q=${q}&type=${t}`);
      if (res.status === 200 && res.data && res.data.ok) {
        return { source: `http://localhost:${port}`, ...res.data };
      }
    } catch {}
  }
  return null;
}

async function getLocalBridgeResults(query = '', type = '') {
  const bridge = new LuxirSearchBridge({ endpoint: LUXIR_ENDPOINT });
  const portalDir = path.resolve(__dirname, '..');
  const scanResult = scanPathToGraphNodes(portalDir, { maxDepth: 5, package: 'core-platform' });
  await bridge.indexNodes(scanResult.nodes);
  const results = await bridge.search(query, { type });
  return {
    source: 'in-process-luxir-bridge',
    ok: true,
    query,
    count: results.length,
    results,
    totalIndexed: bridge.localIndex.size,
    bridge,
  };
}

function printUsage() {
  console.log(`
\x1b[1m\x1b[36mRobOS Luxir Search Index Direct CLI\x1b[0m
Direct command-line inspection and query tool for Luxir C++ Search Index.

\x1b[1mUsage:\x1b[0m
  luxir-portal-cli \x1b[33m<command>\x1b[0m [arguments] [options]

\x1b[1mCommands:\x1b[0m
  \x1b[32mstatus\x1b[0m                  Check Luxir C++ engine connectivity and index statistics
  \x1b[32msearch\x1b[0m <query>          Query indexed documents (full-text, AST symbols, contracts)
                          Options: \x1b[36m--type <SHACLClass>\x1b[0m, \x1b[36m--json\x1b[0m
  \x1b[32minspect\x1b[0m <doc-id>         Inspect raw indexed Luxir document schema and metadata
  \x1b[32mcurl\x1b[0m <query>            Display and execute exact cURL HTTP REST command

\x1b[1mExamples:\x1b[0m
  luxir-portal-cli search "Contract"
  luxir-portal-cli search "tika" --type robos:Contract
  luxir-portal-cli inspect "urn:robos:file:kgraph-parse-portal:contracts-openapi.yaml"
  luxir-portal-cli status
`);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'help';

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printUsage();
    process.exit(0);
  }

  const isJson = args.includes('--json');
  let typeFilter = '';
  const typeIdx = args.indexOf('--type');
  if (typeIdx !== -1 && args[typeIdx + 1]) {
    typeFilter = args[typeIdx + 1];
  }

  if (cmd === 'status') {
    let live = await getLivePortalResults('', '');
    const bridge = new LuxirSearchBridge({ endpoint: LUXIR_ENDPOINT });
    const isOnline = await bridge.isLuxirOnline();
    const local = await getLocalBridgeResults('', '');

    const statusObj = {
      luxirEngine: {
        endpoint: LUXIR_ENDPOINT,
        online: isOnline,
        mode: isOnline ? 'native-cpp-engine' : 'hybrid-local-cache',
        protocol: 'HTTP/JSON + Luxir C++ REAPI',
      },
      portalGateway: {
        active: Boolean(live),
        connectedPort: live ? live.source : 'standalone-cli',
      },
      indexStats: {
        indexName: 'robos_kgraph',
        totalIndexedItems: live ? live.count : local.totalIndexed,
        targetShapes: ['robos:Contract', 'robos:SourceArtifact', 'robos:NodeManifest', 'robos:ProtobufContract'],
      },
    };

    if (isJson) {
      console.log(JSON.stringify(statusObj, null, 2));
    } else {
      console.log(`\n\x1b[1m\x1b[36m⚡ Luxir Search Engine Status\x1b[0m`);
      console.log(`─────────────────────────────────────────────────────────────`);
      console.log(`  • Luxir C++ Endpoint:    \x1b[33m${statusObj.luxirEngine.endpoint}\x1b[0m`);
      console.log(`  • Engine State:          \x1b[32m${statusObj.luxirEngine.mode}\x1b[0m (${isOnline ? 'Online' : 'Offline / Standby Fallback'})`);
      console.log(`  • Portal Gateway:        \x1b[36m${statusObj.portalGateway.connectedPort}\x1b[0m`);
      console.log(`  • Total Indexed Items:   \x1b[1m\x1b[32m${statusObj.indexStats.totalIndexedItems} documents\x1b[0m`);
      console.log(`  • Supported Shapes:      ${statusObj.indexStats.targetShapes.join(', ')}`);
      console.log(`─────────────────────────────────────────────────────────────\n`);
    }
    return;
  }

  if (cmd === 'search') {
    const query = args[1] && !args[1].startsWith('--') ? args[1] : '';
    let res = await getLivePortalResults(query, typeFilter);
    if (!res) {
      res = await getLocalBridgeResults(query, typeFilter);
    }

    if (isJson) {
      console.log(JSON.stringify(res, null, 2));
      return;
    }

    console.log(`\n\x1b[1m\x1b[36m🔍 Luxir Index Query: "${query}" ${typeFilter ? `[filter: ${typeFilter}]` : ''}\x1b[0m`);
    console.log(`\x1b[90mSource: ${res.source} | Hits: ${res.results.length} item(s)\x1b[0m`);
    console.log(`───────────────────────────────────────────────────────────────────────────────────`);

    if (res.results.length === 0) {
      console.log(`  \x1b[33mNo documents matched the query in the Luxir index.\x1b[0m\n`);
      return;
    }

    for (let i = 0; i < res.results.length; i++) {
      const doc = res.results[i];
      const types = Array.isArray(doc.types) ? doc.types.join(', ') : (doc.types || 'robos:SourceArtifact');
      console.log(`  \x1b[1m\x1b[32m[${i + 1}] ${doc.title || doc.id}\x1b[0m`);
      console.log(`      \x1b[36mID:\x1b[0m           ${doc.id}`);
      console.log(`      \x1b[36mTypes:\x1b[0m        ${types}`);
      console.log(`      \x1b[36mMIME Type:\x1b[0m    ${doc.mimeType || 'text/plain'}`);
      console.log(`      \x1b[36mRole:\x1b[0m         ${doc.semanticRole || 'Source Code / Resource'}`);
      if (doc.description) {
        console.log(`      \x1b[36mDesc:\x1b[0m         ${doc.description}`);
      }
      console.log('');
    }
    console.log(`───────────────────────────────────────────────────────────────────────────────────\n`);
    return;
  }

  if (cmd === 'inspect') {
    const docId = args[1];
    if (!docId) {
      console.error('\x1b[31mError: Document ID required. Usage: luxir-portal-cli inspect <doc-id>\x1b[0m');
      process.exit(1);
    }

    const local = await getLocalBridgeResults('', '');
    const doc = local.bridge.localIndex.get(docId) || Array.from(local.bridge.localIndex.values()).find(d => d.id.includes(docId) || d.title.includes(docId));

    if (!doc) {
      console.error(`\x1b[31mError: Document not found in Luxir index: "${docId}"\x1b[0m`);
      process.exit(1);
    }

    console.log(`\n\x1b[1m\x1b[36m📄 Luxir Indexed Document Inspection: ${doc.id}\x1b[0m`);
    console.log(`───────────────────────────────────────────────────────────────────────────────────`);
    console.log(JSON.stringify(doc, null, 2));
    console.log(`───────────────────────────────────────────────────────────────────────────────────\n`);
    return;
  }

  if (cmd === 'curl') {
    const query = args[1] || 'Contract';
    const targetUrl = `http://localhost:${PORT}/api/v1/search?q=${encodeURIComponent(query)}`;
    console.log(`\n\x1b[1m\x1b[36m🌐 Executing Direct cURL to Luxir REST Endpoint\x1b[0m`);
    console.log(`\x1b[33m$ curl -s "${targetUrl}" | jq .\x1b[0m\n`);

    let res = await getLivePortalResults(query, typeFilter);
    if (!res) {
      res = await getLocalBridgeResults(query, typeFilter);
    }
    console.log(JSON.stringify(res, null, 2));
    console.log('');
    return;
  }

  console.error(`\x1b[31mUnknown command: "${cmd}". Run "luxir-portal-cli help" for usage.\x1b[0m`);
}

main().catch((err) => {
  console.error('Fatal CLI error:', err.message);
  process.exit(1);
});
