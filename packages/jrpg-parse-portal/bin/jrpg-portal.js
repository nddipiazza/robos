#!/usr/bin/env node
'use strict';

// JRPG Parse Portal CLI.
//
//   jrpg-portal profiles
//   jrpg-portal plan <profile>
//   jrpg-portal discover <profile> [--asset-types a,b] [--json]
//   jrpg-portal acquire <profile> --out <dir> [--cache <dir>] [--download-images] [--no-measure-maps] [--with-agent]
//   jrpg-portal coverage <kgraph-dir>

const path = require('path');
const portal = require('../lib/portal');
const { readKgraphFolder } = require('../lib/kgraph-writer');
const { coverage } = require('../lib/asset-types');
const { discoverSources, suggestionNodes } = require('../lib/agent-discovery');
const { HttpCache } = require('../lib/http-cache');

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) out.flags[key] = argv[++i];
      else out.flags[key] = true;
    } else out._.push(a);
  }
  return out;
}

function help() {
  console.log(`JRPG Parse Portal: acquire everything needed to remake a classic JRPG from fan resources.

Commands:
  profiles                         List game profiles
  plan <profile>                   Asset types and the fan sources planned for each
  discover <profile>               Ask the robos agent for more fan resources (probes each URL)
       --asset-types a,b            Limit to these asset types
       --provider <id>              Agent CLI to use (claude-code, codex, antigravity, github-copilot)
  acquire <profile> --out <dir>    Acquire and write a kgraph folder
       --cache <dir>                HTTP/image cache (default <out>/cache, git-ignored)
       --download-images            Also cache sprite images locally
       --no-measure-maps            Do not download maps to measure their size
       --with-agent                 Run discovery first and record its suggestions as sources
       --suggestions <file>         Record suggestions saved by \`discover --json\` instead
  coverage <dir>                   Asset-type coverage of a kgraph folder
  --json                           Machine-readable output`);
}

async function main() {
  const { _, flags } = parseArgs(process.argv.slice(2));
  const [cmd, arg] = _;
  const json = flags.json === true;
  const print = (obj, text) => console.log(json ? JSON.stringify(obj, null, 2) : text());
  switch (cmd) {
    case 'profiles': {
      const list = portal.listProfiles();
      return print(list, () => list.map(p => `${p.id.padEnd(22)} ${p.title} (${p.platform} ${p.region}, ${p.year}) — ${p.sources.length} sources`).join('\n'));
    }
    case 'plan': {
      const plan = portal.plan(arg);
      return print(plan, () => plan.map(a => `${a.label}\n${a.sources.length ? a.sources.map(s => `    ${s.status.padEnd(8)} ${s.title}  ${s.url}`).join('\n') : '    (no planned source — try discover)'}`).join('\n'));
    }
    case 'discover': {
      const profile = portal.getProfile(arg);
      const http = new HttpCache({ minIntervalMs: 300, retries: 0 });
      const res = await discoverSources(profile, { http, providerId: flags.provider, assetTypes: flags['asset-types'] ? String(flags['asset-types']).split(',') : null, log: m => !json && console.error(m) });
      return print(res, () => `${res.suggestions.length} new sources suggested (${res.rejected.length} rejected)\n` + res.suggestions.map(s => `  ${s.status.padEnd(28)} ${s.title}  ${s.url}  [${s.assetTypes.join(', ')}]`).join('\n'));
    }
    case 'acquire': {
      if (!flags.out) throw new Error('acquire needs --out <dir>');
      const outDir = path.resolve(String(flags.out));
      let extraSources = [];
      if (flags.suggestions) {
        // A saved `discover --json` result: record its suggestions without asking again.
        const saved = JSON.parse(require('fs').readFileSync(path.resolve(String(flags.suggestions)), 'utf8'));
        extraSources = suggestionNodes(portal.getProfile(arg).id.replace(/-usa$/, ''), saved.suggestions || []);
      } else if (flags['with-agent']) {
        const profile = portal.getProfile(arg);
        const res = await discoverSources(profile, { http: new HttpCache({ retries: 0 }), providerId: flags.provider, log: m => console.error(m) });
        extraSources = suggestionNodes(profile.id.replace(/-usa$/, ''), res.suggestions);
      }
      const res = await portal.acquire({
        profileId: arg, outDir, cacheDir: flags.cache ? path.resolve(String(flags.cache)) : undefined,
        downloadImages: flags['download-images'] === true, measureMaps: flags['no-measure-maps'] !== true, extraSources,
        log: m => !json && console.error(m),
      });
      return print(res, () => res.coverage.map(c => `${c.covered ? '✓' : '✗'} ${c.label.padEnd(58)} ${c.count}`).join('\n') + (res.warnings.length ? `\n\nNotes:\n${res.warnings.map(w => `  - ${w}`).join('\n')}` : ''));
    }
    case 'coverage': {
      const { nodes } = readKgraphFolder(path.resolve(arg || '.'));
      const cov = coverage(nodes);
      return print(cov, () => cov.map(c => `${c.covered ? '✓' : '✗'} ${c.label.padEnd(58)} ${c.count}`).join('\n'));
    }
    default:
      return help();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
