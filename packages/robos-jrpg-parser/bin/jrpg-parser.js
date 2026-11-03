#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const pipeline = require('../lib/pipeline');
const { DEFAULT_KINDS, TARGETS } = require('../lib/art');

const HELP = `RobOS JRPG parser: turn folders of classic JRPG resources you collected into a kgraph.

Commands:
  scan <dir...>                 List the files and what each one is
       [--manifest <file>]        Per-file overrides: {"files":{"name":{"role":"...","use":false}}}
  parse <dir...> --out <dir> --title <name> [--edition <name>]
       [--manifest <file>]
       [--no-agent]               Charts only, without the agent
       [--provider <id>]          Agent CLI (default antigravity)
       [--model <id>]             Agent model
  plan --out <dir> [--kinds a,b]  List the images that art would generate
  art --out <dir> [--kinds a,b] [--limit n] [--model <id>] [--force]
                                Generate images with Gemini and add them to the kgraph
  coverage --out <dir>          What is covered and what to collect next

Image kinds: ${Object.keys(TARGETS).join(', ')} (default: ${DEFAULT_KINDS.join(', ')})
`;

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out.flags[key] = argv[++i];
    else out.flags[key] = true;
  }
  return out;
}

function need(flags, name) {
  if (!flags[name] || flags[name] === true) throw new Error(`--${name} is required`);
  return flags[name];
}

function printCoverage(out) {
  const report = JSON.parse(fs.readFileSync(path.join(out, 'coverage.json'), 'utf8'));
  console.log(`${report.game.title} (${report.game.edition}): ${report.nodeCount} nodes`);
  for (const c of report.assetTypes) console.log(`  ${c.covered ? 'ok     ' : 'MISSING'} ${String(c.count).padStart(4)}  ${c.label}`);
  if (report.stillToCollect.length) {
    console.log('\nStill to collect by hand:');
    for (const c of report.stillToCollect) console.log(`  - ${c.collect}`);
  }
  if (report.warnings.length) {
    console.log('\nNotes:');
    for (const w of report.warnings) console.log(`  - ${w}`);
  }
}

async function main() {
  const { _: [command, ...dirs], flags } = parseArgs(process.argv.slice(2));
  const log = message => console.error(message);
  const kinds = typeof flags.kinds === 'string' ? flags.kinds.split(',') : undefined;

  switch (command) {
    case 'scan': {
      const manifest = flags.manifest ? JSON.parse(fs.readFileSync(flags.manifest, 'utf8')) : {};
      for (const s of pipeline.scan(dirs, manifest)) {
        const size = s.size ? `${s.size.width}x${s.size.height}` : '';
        console.log(`${s.use === false ? 'skip' : 'use '}  ${s.role.padEnd(14)} ${size.padEnd(10)} ${s.name}${s.note ? `  (${s.note})` : ''}`);
      }
      return;
    }
    case 'parse': {
      if (!dirs.length) throw new Error('Give at least one folder to parse');
      const out = need(flags, 'out');
      await pipeline.parse(dirs, {
        out, title: need(flags, 'title'), edition: flags.edition, manifest: flags.manifest,
        agent: !flags['no-agent'], providerId: flags.provider, model: flags.model, log,
      });
      printCoverage(out);
      return;
    }
    case 'plan': {
      for (const j of pipeline.plan(need(flags, 'out'), { kinds })) console.log(`${j.basis.padEnd(10)} ${j.kind.padEnd(16)} ${j.title}`);
      return;
    }
    case 'art': {
      const out = need(flags, 'out');
      const res = await pipeline.art(out, { kinds, limit: flags.limit ? Number(flags.limit) : undefined, model: flags.model, force: !!flags.force, log });
      console.log(`Generated ${res.generated} of ${res.planned} images in ${path.join(out, 'assets', 'generated')}`);
      for (const f of res.failures) console.log(`  failed ${f.id}: ${f.error}`);
      if (res.failures.length) process.exitCode = 1;
      return;
    }
    case 'coverage':
      printCoverage(need(flags, 'out'));
      return;
    default:
      console.log(HELP);
      if (command && command !== 'help') process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
