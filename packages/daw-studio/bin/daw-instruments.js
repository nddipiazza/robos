#!/usr/bin/env node
'use strict';

/**
 * CLI for installing and inspecting open-source drum kits for RobOS DAW Studio.
 *
 * Usage:
 *   node packages/daw-studio/bin/daw-instruments.js list
 *   node packages/daw-studio/bin/daw-instruments.js dirs
 *   node packages/daw-studio/bin/daw-instruments.js add-dir "/path/to/vst-or-samples"
 *   node packages/daw-studio/bin/daw-instruments.js remove-dir "/path/to/vst-or-samples"
 *   node packages/daw-studio/bin/daw-instruments.js install-defaults
 *   node packages/daw-studio/bin/daw-instruments.js install <kit-id>
 */

const {
  OPEN_DRUMKIT_CATALOG,
  inspectInstalledKits,
  downloadOpenDrumkit,
  downloadDefaultOpenDrumkits,
} = require('../lib/drum-instruments');
const {
  addVstDirectory,
  removeVstDirectory,
  getVstDirectoriesSnapshot,
} = require('../lib/vst-directories');

async function main() {
  const [cmd = 'list', arg] = process.argv.slice(2);

  if (cmd === 'dirs') {
    const snap = getVstDirectoriesSnapshot();
    console.log(`Config: ${snap.configPath}`);
    console.log(`Custom VST & Sample Directories (${snap.customDirectories.length}):`);
    for (const d of snap.customDirectories) {
      const archNote = d.archiveCount > 0 ? `, ${d.archiveCount} unextracted .iso/archive(s)` : '';
      console.log(`  - ${d.label} -> ${d.path} (${d.pluginCount} plugins, ${d.sampleCount} samples${archNote})`);
    }
    return;
  }

  if (cmd === 'add-dir') {
    if (!arg) throw new Error('Missing directory path. Usage: daw-instruments.js add-dir "<dir>"');
    const added = addVstDirectory(arg);
    const snap = getVstDirectoriesSnapshot();
    const match = snap.customDirectories.find(d => d.path === added.path);
    console.log(`Added directory: ${added.path}`);
    if (match) {
      const archNote = match.archiveCount > 0 ? `, ${match.archiveCount} unextracted .iso/installer archive(s)` : '';
      console.log(`Indexed: ${match.pluginCount} plugin(s), ${match.sampleCount} audio sample(s)${archNote}`);
    }
    return;
  }

  if (cmd === 'remove-dir') {
    if (!arg) throw new Error('Missing directory path. Usage: daw-instruments.js remove-dir "<dir>"');
    const res = removeVstDirectory(arg);
    console.log(res.removed ? `Removed directory: ${arg}` : `Directory was not registered: ${arg}`);
    return;
  }

  if (cmd === 'list' || cmd === 'status') {
    const info = inspectInstalledKits();
    console.log(`Instruments Store: ${info.drumkitsRoot}\n`);
    for (const kit of info.kits) {
      const state = kit.installed && kit.sampleCount > 0
        ? `INSTALLED (${kit.sampleCount} samples)`
        : 'NOT INSTALLED';
      console.log(`- ${kit.id}: ${kit.name} [${kit.license}] — ${state}`);
      console.log(`  Source: ${kit.sourceUrl}`);
    }
    return;
  }

  if (cmd === 'install-defaults') {
    console.log('Downloading default open-source metal drum kits...');
    const res = await downloadDefaultOpenDrumkits({
      onProgress: ({ kitId, completed, total, file }) => {
        process.stdout.write(`  [${kitId}] (${completed}/${total}) ${file}\n`);
      },
    });
    console.log(`\nDone! Installed into: ${res.status.drumkitsRoot}`);
    return;
  }

  if (cmd === 'install') {
    const kitId = arg || 'muldjord-death-metal';
    if (kitId === 'all') {
      for (const k of OPEN_DRUMKIT_CATALOG) {
        console.log(`Downloading ${k.id} (${k.name})...`);
        await downloadOpenDrumkit(k.id, {
          onProgress: ({ completed, total, file }) => {
            process.stdout.write(`  (${completed}/${total}) ${file}\n`);
          },
        });
      }
      console.log(`\nAll ${OPEN_DRUMKIT_CATALOG.length} metal catalog kits installed.`);
      return;
    }
    console.log(`Downloading ${kitId}...`);
    const res = await downloadOpenDrumkit(kitId, {
      onProgress: ({ completed, total, file }) => {
        process.stdout.write(`  (${completed}/${total}) ${file}\n`);
      },
    });
    console.log(`\nInstalled ${res.downloadedFiles} sample files into ${res.kitDir}`);
    return;
  }

  console.error(`Unknown command "${cmd}". Use: list | dirs | add-dir <path> | remove-dir <path> | install-defaults | install <kit-id|all>`);
  process.exit(1);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
