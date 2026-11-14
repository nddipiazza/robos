#!/usr/bin/env node
'use strict';

/**
 * CLI for installing and inspecting open-source drum kits for RobOS DAW Studio.
 *
 * Usage:
 *   node packages/daw-studio/bin/daw-instruments.js list
 *   node packages/daw-studio/bin/daw-instruments.js install-defaults
 *   node packages/daw-studio/bin/daw-instruments.js install <kit-id>
 */

const {
  OPEN_DRUMKIT_CATALOG,
  inspectInstalledKits,
  downloadOpenDrumkit,
  downloadDefaultOpenDrumkits,
} = require('../lib/drum-instruments');

async function main() {
  const [cmd = 'list', arg] = process.argv.slice(2);

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
    console.log('Downloading default open-source drum kits (gm-rock-kit + tr-808-kit)...');
    const res = await downloadDefaultOpenDrumkits({
      onProgress: ({ kitId, completed, total, file }) => {
        process.stdout.write(`  [${kitId}] (${completed}/${total}) ${file}\n`);
      },
    });
    console.log(`\nDone! Installed into: ${res.status.drumkitsRoot}`);
    return;
  }

  if (cmd === 'install') {
    const kitId = arg || 'gm-rock-kit';
    if (kitId === 'all') {
      for (const k of OPEN_DRUMKIT_CATALOG) {
        console.log(`Downloading ${k.id} (${k.name})...`);
        await downloadOpenDrumkit(k.id, {
          onProgress: ({ completed, total, file }) => {
            process.stdout.write(`  (${completed}/${total}) ${file}\n`);
          },
        });
      }
      console.log('\nAll catalog kits installed.');
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

  console.error(`Unknown command "${cmd}". Use: list | install-defaults | install <gm-rock-kit|virtuosity-cc0|tr-808-kit|all>`);
  process.exit(1);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
