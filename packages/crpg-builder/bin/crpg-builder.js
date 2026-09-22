#!/usr/bin/env node
'use strict';

const path = require('path');
const { CRPGGameBuilder } = require('../lib/builder');

const args = process.argv.slice(2);
const command = args[0] || 'generate';

const flags = {};
for (let i = 1; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const val = (i + 1 < args.length && !args[i + 1].startsWith('--')) ? args[++i] : true;
    flags[key] = val;
  }
}

const targetDir = flags['target-dir'] || flags.target || path.resolve(__dirname, '../../../games/crpg-realm');
const packagePath = flags['package-path'] || flags.package || path.resolve(__dirname, '../../../.robos/kgraphs/crpg/package.jsonld');

const builder = new CRPGGameBuilder({
  targetDir,
  kgraphPackagePath: packagePath
});

try {
  switch (command) {
    case 'generate':
    case 'build': {
      console.log(`\n⚔️  RobOS cRPG Game Builder`);
      console.log(`Reading cRPG Knowledge Graph: ${packagePath}`);
      console.log(`Output Directory:            ${targetDir}\n`);

      const result = builder.build();
      console.log(`✔ Processed ${result.nodesEvaluated} Knowledge Graph entities.`);
      if (result.warnings.length > 0) {
        console.log(`⚠️  Warnings:`);
        for (const w of result.warnings) console.log(`   - ${w}`);
      }
      console.log(`✔ Generated JSON data store under:   data/v1/`);
      console.log(`✔ Generated JSON Schemas under:       schemas/v1/`);
      console.log(`✔ Generated typed GDScript models:    src/generated/v1/`);
      console.log(`✔ Generated Godot 4 isometric scenes: scenes/\n`);
      console.log(`✨ Build completed successfully!`);
      break;
    }

    case 'validate': {
      console.log(`\n🛡️  Validating cRPG Knowledge Graph...`);
      const nodes = builder.loadGraph();
      const val = builder.validateGraph(nodes);
      if (!val.valid) {
        console.error(`❌ Validation Failed:`);
        for (const err of val.errors) console.error(`   - ${err}`);
        process.exit(1);
      } else {
        console.log(`✔ 100% Valid! Evaluated ${nodes.length} cRPG entities.`);
        if (val.warnings.length > 0) {
          console.log(`⚠️  Warnings:`);
          for (const w of val.warnings) console.log(`   - ${w}`);
        }
      }
      break;
    }

    case 'create-game':
    case 'create': {
      const gameId = args[1] && !args[1].startsWith('--') ? args[1] : 'realm-of-heroes';
      const title = flags.title || (flags.name || 'Realm of Heroes: A Night Without Memory');
      console.log(`\n🎮 RobOS cRPG & Infinity Engine Game Creator`);
      console.log(`Creating Game:       ${gameId} ("${title}")`);
      console.log(`Engine Architecture: Infinity Engine (urn:robos:infinity:engine:gemrb-infinity)`);
      console.log(`Target Directory:    ${targetDir}\n`);

      const result = builder.createGame(gameId, {
        title,
        ruleset: flags.ruleset || 'dnd5e',
        combatModel: flags.combat || 'real-time-with-pause',
        targetDir
      });

      console.log(`✔ Registered '${gameId}' in Knowledge Graph.`);
      console.log(`✔ Generated game project with ${result.nodesEvaluated} KGraph entities.`);
      console.log(`✨ Game creation completed successfully! Ready to play:`);
      console.log(`   cd ${targetDir} && ./play.sh\n`);
      break;
    }

    default:
      console.log(`Usage: crpg-builder [generate|create-game <id>|validate] [--title <name>] [--target-dir <dir>] [--package-path <path>]`);
      break;
  }
} catch (err) {
  console.error(`\n❌ Error: ${err.message}\n`);
  process.exit(1);
}
