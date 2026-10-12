#!/usr/bin/env node
'use strict';
// Copies a composed hero (see compose.js) into the front site:
//   site/assets/hero/{hero.mp4,hero.webm,poster.jpg,hero-storyboard.gif}  and  site/_data/hero.json
const fs = require('fs');
const path = require('path');
const [from] = process.argv.slice(2);
if (!from) { console.error('usage: publish-hero.js <composedDir>'); process.exit(1); }
const site = path.resolve(__dirname, '../../../../site');
const dest = path.join(site, 'assets', 'hero');
fs.mkdirSync(dest, { recursive: true });
for (const f of ['hero.mp4', 'hero.webm', 'poster.jpg', 'hero-storyboard.gif']) fs.copyFileSync(path.join(from, f), path.join(dest, f));
const { duration, chapters, slides } = JSON.parse(fs.readFileSync(path.join(from, 'chapters.json'), 'utf8'));
fs.rmSync(path.join(dest, 'slides'), { recursive: true, force: true });
fs.mkdirSync(path.join(dest, 'slides'), { recursive: true });
for (const row of slides) fs.copyFileSync(path.join(from, 'slides', row.file), path.join(dest, 'slides', row.file));
fs.mkdirSync(path.join(site, '_data'), { recursive: true });
fs.writeFileSync(path.join(site, '_data', 'hero.json'), JSON.stringify({ duration, chapters, slides }, null, 2) + '\n');
console.log('Published hero:', duration + 's,', chapters.length, 'steps,', slides.length, 'slides');
