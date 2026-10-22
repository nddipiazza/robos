'use strict';
// Bundle the canonical course as standalone HTML; Jekyll source isn't directly runnable.
const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve(__dirname, '../../docs/projects/crpg-realm/create-your-own-game/elearning/index.html');
const html = fs.readFileSync(source, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
  .replace(/\{\{\s*'([^']+)'\s*\|\s*relative_url\s*\}\}/g, (_, url) => `https://rowbose.com/v1${url}`)
  .replace(/(["'])\/v1\//g, '$1https://rowbose.com/v1/');
fs.mkdirSync(path.join(__dirname, 'renderer'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'renderer/course.html'), html);
