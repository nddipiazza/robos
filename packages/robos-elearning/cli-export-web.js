#!/usr/bin/env node
'use strict';

const path = require('path');
const { SDLCKnowledgeGraphStore } = require('../robos-graph/index');

function parseArgs() {
  const args = {
    courseId: 'robos-crpg',
    appId: null,
    output: null,
    permalink: null,
    all: false,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === '--help' || arg === '-h') {
      console.log(`
RobOS eLearning Website Generator CLI

Usage:
  node packages/robos-elearning/cli-export-web.js [options]

Options:
  --course=<id>      Course ID or slug (default: robos-crpg)
  --all              Export all robos:eLearningCourse nodes in the KGraph to /elearning/{course-id}
  --app=<id>         Target Application ID or slug
  --output=<path>    Target HTML output file path (default: docs/elearning/<slug>.html)
  --permalink=<uri>  Jekyll/GitHub Pages permalink (default: /elearning/<slug>)
  --help, -h         Show this help message
`);
      process.exit(0);
    }
    if (arg === '--all') args.all = true;
    if (arg.startsWith('--course=')) args.courseId = arg.split('=')[1];
    if (arg.startsWith('--app=')) args.appId = arg.split('=')[1];
    if (arg.startsWith('--output=')) args.output = arg.split('=')[1];
    if (arg.startsWith('--permalink=')) args.permalink = arg.split('=')[1];
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const fs = require('fs');
  const repoGraphDir = path.join(process.cwd(), '.robos');
  const store = (!process.env.ROBOS_GRAPH_ROOT && fs.existsSync(repoGraphDir))
    ? new SDLCKnowledgeGraphStore({ graphRoot: repoGraphDir })
    : new SDLCKnowledgeGraphStore();

  if (args.all) {
    const courses = store.getELearningNodes ? store.getELearningNodes() : [];
    for (const c of courses) {
      const res = store.generateELearningWebsite({ courseId: c['@id'] });
      if (res.ok) {
        console.log(`[robos-elearning] Exported ${c['@id']} -> ${res.siteUrl}`);
      } else {
        console.error(`[robos-elearning] Failed ${c['@id']}: ${res.error}`);
      }
    }
    return;
  }

  console.log(`[robos-elearning] Generating website version for course "${args.courseId}"…`);
  const result = store.generateELearningWebsite({
    courseId: args.courseId,
    appId: args.appId,
    outputFilePath: args.output ? path.resolve(process.cwd(), args.output) : null,
    permalink: args.permalink,
  });

  if (!result.ok) {
    console.error(`[robos-elearning] Error: ${result.error}`);
    process.exit(1);
  }

  console.log(`[robos-elearning] Success!`);
  console.log(`- Course: ${result.course['dcterms:title']}`);
  console.log(`- Output File: ${result.filePath}`);
  if (result.indexFilePath) {
    console.log(`- Directory Index: ${result.indexFilePath}`);
  }
  if (result.siteFilePath) {
    console.log(`- Front Site File: ${result.siteFilePath}`);
  }
  console.log(`- GitHub Pages Permalink: ${result.permalink}`);
  console.log(`- URL: ${result.siteUrl || ('https://rowbose.com/' + result.permalink)}`);
}

main().catch((err) => {
  console.error('[robos-elearning] Fatal error:', err);
  process.exit(1);
});
