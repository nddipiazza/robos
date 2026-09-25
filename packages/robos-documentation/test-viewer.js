#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { SDLCKnowledgeGraphStore } = require('../robos-graph/index');

function parseArgs() {
  const args = {
    port: 3089,
    exportFirst: true,
    check: false,
    output: path.join(process.cwd(), 'docs', 'system-documentation', 'index.html'),
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === '--help' || arg === '-h') {
      console.log(`
RobOS Documentation Test Viewer

Usage:
  node packages/robos-documentation/test-viewer.js [options]

Options:
  --port=<port>      HTTP port to listen on (default: 3089)
  --output=<path>    Path to exported HTML documentation (default: docs/system-documentation/index.html)
  --no-export        Skip generating export before starting
  --check            Self-test mode: verifies server, requests page, asserts HTTP 200 and exits
  --help, -h         Show this help message
`);
      process.exit(0);
    }
    if (arg.startsWith('--port=')) args.port = parseInt(arg.split('=')[1], 10);
    if (arg.startsWith('--output=')) args.output = path.resolve(process.cwd(), arg.split('=')[1]);
    if (arg === '--no-export') args.exportFirst = false;
    if (arg === '--check') args.check = true;
  }
  return args;
}

async function startViewer(options = {}) {
  const port = options.port || 3089;
  const docPath = options.output || path.join(process.cwd(), 'docs', 'system-documentation', 'index.html');

  if (options.exportFirst !== false) {
    const candidates = [
      path.join(process.cwd(), '.robos', 'knowledge-graph.jsonld'),
      path.resolve(__dirname, '..', '..', '.robos', 'knowledge-graph.jsonld'),
    ];
    const repoGraph = candidates.find(c => fs.existsSync(c));
    const storeOpts = repoGraph
      ? { filePath: repoGraph, rootDir: path.dirname(repoGraph) }
      : {};
    const store = new SDLCKnowledgeGraphStore(storeOpts);
    const res = store.generateDocumentationWebsite({ outputFilePath: docPath });
    if (!res.ok) {
      throw new Error('Export generation failed: ' + res.error);
    }
  }

  if (!fs.existsSync(docPath)) {
    throw new Error(`Exported document not found at: ${docPath}`);
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', app: 'robos-documentation-viewer' }));
    }

    // Serve the generated documentation HTML
    if (fs.existsSync(docPath)) {
      const content = fs.readFileSync(docPath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      return res.end(content);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Documentation not found');
  });

  await new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  return {
    server,
    port,
    url: `http://127.0.0.1:${port}/`,
    docPath,
    close: () => new Promise(r => server.close(r)),
  };
}

async function main() {
  const args = parseArgs();

  console.log(`[robos-documentation-viewer] Starting Test Viewer on port ${args.port}…`);
  const viewer = await startViewer(args);

  console.log(`[robos-documentation-viewer] Ready!`);
  console.log(`- Local URL: ${viewer.url}`);
  console.log(`- Serving: ${viewer.docPath}`);

  if (args.check) {
    console.log('[robos-documentation-viewer] Running self-test request…');
    const checkRes = await new Promise((resolve, reject) => {
      http.get(viewer.url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
      }).on('error', reject);
    });

    console.log(`[robos-documentation-viewer] Received HTTP ${checkRes.statusCode}, body length: ${checkRes.body.length} bytes`);
    if (checkRes.statusCode === 200 && checkRes.body.includes('RobOS System Documentation')) {
      console.log('[robos-documentation-viewer] Self-test verified successfully! Shutting down.');
      await viewer.close();
      process.exit(0);
    } else {
      console.error('[robos-documentation-viewer] Verification failed: unexpected response');
      await viewer.close();
      process.exit(1);
    }
  } else {
    console.log('[robos-documentation-viewer] Press Ctrl+C to terminate viewer server.');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[robos-documentation-viewer] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  startViewer,
};
