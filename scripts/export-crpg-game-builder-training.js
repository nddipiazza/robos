#!/usr/bin/env node
'use strict';

// Regenerates the Game Builder Academy page from the knowledge graph and rebuilds
// the course bundled with its desktop app. This script only reads the graph: change
// the course with `kgraph propose` and `kgraph apply`, then rerun it. The page's
// front matter and the files in packages/crpg-game-builder-elearning are maintained
// by hand, so it leaves them alone.

const path = require('path');
const { SDLCKnowledgeGraphStore } = require('../packages/robos-graph/index.js');

const rootDir = path.resolve(__dirname, '..');
const courseId = 'urn:robos:elearning:course:crpg-game-builder';
const pagePath = path.join(rootDir, 'docs', 'projects', 'crpg-realm', 'create-your-own-game', 'elearning', 'index.html');

// A workspace store opens the graph read-only; other stores may rewrite it on load.
const store = new SDLCKnowledgeGraphStore({ graphRoot: path.join(rootDir, '.robos') });

const res = store.generateELearningWebsite({
  courseId,
  outputFilePath: pagePath,
  permalink: '/projects/crpg-realm/create-your-own-game/elearning/',
  docFilePath: path.join(rootDir, 'docs', 'projects', 'crpg-realm', 'create-your-own-game.md'),
  title: 'RobOS cRPG Game Builder & Tactical Engine Academy'
});

if (!res.ok) {
  console.error(`✘ ${res.error}`);
  process.exit(1);
}
console.log(`✔ Generated ${path.relative(rootDir, pagePath)}`);

require('../packages/crpg-game-builder-elearning/build-course.js');
console.log('✔ Rebuilt packages/crpg-game-builder-elearning/renderer/course.html');
