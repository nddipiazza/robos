#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { EvidenceRunner } = require('./evidence-runner');
const { readTemplate } = require('./evidence-templates');

const HELP = `Run the Code Review evidence generator without opening Electron.
Usage: node evidence-runner-cli.js --review review.json --plan evidence-plan.json --output-dir NEW_DIRECTORY

review.json: { workspace, title, demoAgent: { command: absolutePath, args: ["exec", "--json"] } }
evidence-plan.json: { markdown, scenarios: [{ id, title }], template: evidenceTemplate }
The output directory must be new. Each run preserves its artifacts and evidence-run.json.
Exit codes: 0 completed, 2 checks need attention, 1 execution/configuration error.
`;

async function run(args, progress = () => {}) {
  const flags = {};
  while (args.length) {
    const key = args.shift();
    if (!['--review', '--plan', '--output-dir'].includes(key) || !args.length || flags[key]) throw Error(HELP);
    flags[key] = args.shift();
  }
  if (!flags['--review'] || !flags['--plan'] || !flags['--output-dir']) throw Error(HELP);
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const review = read(flags['--review']);
  if (!path.isAbsolute(review.workspace || '') || !fs.statSync(review.workspace).isDirectory()) throw Error('Review workspace must be an absolute directory.');
  const plan = read(flags['--plan']);
  if (!plan.markdown || !plan.scenarios?.length || !plan.template) throw Error('The evidence plan needs markdown, scenarios, and a selected template.');
  plan.template = readTemplate(plan.template);
  const directory = path.resolve(flags['--output-dir']);
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  fs.mkdirSync(directory, { mode: 0o700 }); // Exclusive: never replace an earlier run.
  const runner = new EvidenceRunner(review, { directory });
  return new Promise((resolve, reject) => {
    const stop = () => runner.stop();
    const clean = () => {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
      runner.removeListener('state', onState);
    };
    let lastProgress;
    function onState(state) {
      const latest = state.progress?.at(-1);
      if (latest && latest !== lastProgress) { lastProgress = latest; progress(latest.text); }
      if (state.status !== 'running') { clean(); resolve({ ...state, resultPath: runner.file }); }
    }
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    runner.on('state', onState);
    try { runner.start(plan); } catch (error) { clean(); reject(error); }
  });
}
if (require.main === module) {
  if (process.argv.includes('--help')) console.log(HELP);
  else run(process.argv.slice(2), text => process.stderr.write(text + '\n')).then(result => {
    console.log(JSON.stringify({ status: result.status, summary: result.summary, resultPath: result.resultPath }, null, 2));
    process.exitCode = result.status === 'completed' ? 0 : result.status === 'needs-attention' ? 2 : 1;
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { run };
