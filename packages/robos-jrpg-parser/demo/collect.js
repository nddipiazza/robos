#!/usr/bin/env node
'use strict';

// Adds the practice site's guide pages to the harvester's manifest. The harvester
// finds map files by itself but has no way to list a guide, so a person lists them.

const fs = require('fs');
const path = require('path');
const { PAGES } = require('./practice-site');

function addGuidePages(collection, siteUrl) {
  const file = path.join(collection, 'sources-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.strategywiki = Object.keys(PAGES).map(page => ({ url: `${siteUrl}/${page}`, file: page }));
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

module.exports = { addGuidePages };

if (require.main === module) {
  const [collection, siteUrl = 'http://127.0.0.1:8765'] = process.argv.slice(2);
  const manifest = addGuidePages(path.resolve(collection), siteUrl);
  console.log(`The manifest now lists ${manifest.maps.length} maps and ${manifest.strategywiki.length} guide pages.`);
}
