#!/usr/bin/env node
'use strict';

const path = require('path');
const { SDLCKnowledgeGraphStore } = require('../robos-graph/index');

function parseArgs() {
  const args = {
    output: null,
    permalink: null,
    title: null,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === '--help' || arg === '-h') {
      console.log(`
RobOS Documentation Website Generator CLI

Usage:
  node packages/robos-documentation/cli-export-web.js [options]

Options:
  --output=<path>    Target HTML output file path (default: docs/system-documentation/index.html)
  --permalink=<uri>  Jekyll/GitHub Pages permalink (default: /system-documentation/)
  --title=<title>    Page title
  --help, -h         Show this help message
`);
      process.exit(0);
    }
    if (arg.startsWith('--output=')) args.output = arg.split('=')[1];
    if (arg.startsWith('--permalink=')) args.permalink = arg.split('=')[1];
    if (arg.startsWith('--title=')) args.title = arg.split('=')[1];
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const candidates = [
    path.join(process.cwd(), '.robos', 'knowledge-graph.jsonld'),
    path.resolve(__dirname, '..', '..', '.robos', 'knowledge-graph.jsonld'),
  ];
  const repoGraph = candidates.find(c => require('fs').existsSync(c));
  const storeOpts = repoGraph
    ? { filePath: repoGraph, rootDir: path.dirname(repoGraph) }
    : {};
  const store = new SDLCKnowledgeGraphStore(storeOpts);

  console.log('[robos-documentation] Generating GitHub Pages friendly documentation website…');
  const result = store.generateDocumentationWebsite({
    outputFilePath: args.output ? path.resolve(process.cwd(), args.output) : null,
    permalink: args.permalink,
    title: args.title,
  });

  if (!result.ok) {
    console.error(`[robos-documentation] Error: ${result.error}`);
    process.exit(1);
  }

  console.log('[robos-documentation] Success!');
  console.log(`- Documented Entities: ${result.entriesCount}`);
  console.log(`- Output File: ${result.filePath}`);
  console.log(`- GitHub Pages Permalink: ${result.permalink}`);
  console.log(`- Public URL: https://www.rowbose.com${result.permalink}`);
}

main().catch((err) => {
  console.error('[robos-documentation] Fatal error:', err);
  process.exit(1);
});
