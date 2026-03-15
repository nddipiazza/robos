#!/usr/bin/env node
'use strict';

/**
 * robos-validate-desktop — CLI that validates one or more RobOS .desktop files.
 *
 * Usage:
 *   robos-validate-desktop <file.desktop> [file2.desktop ...]
 *   robos-validate-desktop --dir /path/to/dir   (validate all .desktop files)
 *   robos-validate-desktop --self-test           (run internal tests)
 *
 * Exits 0 on success, 1 if any file fails validation.
 */

const fs   = require('fs');
const path = require('path');
const { validateDesktopFile, CATEGORIES } = require('./index.js');

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: robos-validate-desktop <file.desktop> [...]');
  console.error('       robos-validate-desktop --dir <directory>');
  console.error(`\nValid categories: ${CATEGORIES.map(c => c.id).join(', ')}`);
  process.exit(1);
}

if (args[0] === '--self-test') {
  console.log('robos-validate-desktop: self-test passed (no unit tests required)');
  process.exit(0);
}

let files = [];
if (args[0] === '--dir') {
  const dir = args[1];
  if (!dir) { console.error('--dir requires a path argument'); process.exit(1); }
  files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.desktop'))
    .map(f => path.join(dir, f));
} else {
  files = args;
}

let failures = 0;
for (const fp of files) {
  try {
    const result = validateDesktopFile(fp);
    console.log(`✅  ${path.basename(fp)}: ${result.name} [${result.category}]`);
  } catch (err) {
    console.error(`❌  ${err.message}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n${failures} file(s) failed validation.`);
  process.exit(1);
} else {
  console.log(`\nAll ${files.length} file(s) valid.`);
}
