'use strict';
const fs = require('node:fs');
const { client } = require('./publish-release.cjs');
const required = ['unit', 'windows-regression / install', 'build (windows-latest)', 'build (ubuntu-24.04)', 'build (macos-15)', 'build (macos-15-intel)'];
function verifiedSource(run, jobs, repository) {
  if (run.head_repository?.full_name !== repository || run.path !== '.github/workflows/app-manager.yml' ||
      run.status !== 'completed' || !/^[a-f0-9]{40}$/.test(run.head_sha)) throw new Error('Not a completed modular release run from this repository');
  for (const name of required) if (!jobs.some(job => job.name === name && job.conclusion === 'success')) throw new Error(`Required release check has not passed: ${name}`);
  return run.head_sha;
}
async function main() {
  const runId = process.argv[2], repository = process.env.GITHUB_REPOSITORY;
  if (!/^\d+$/.test(runId || '') || !/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Invalid run or repository');
  const request = client(process.env.GITHUB_TOKEN), api = `https://api.github.com/repos/${repository}/actions/runs/${runId}`;
  const run = (await request(api)).data;
  const jobs = (await request(`${api}/jobs?per_page=100`)).data;
  if (jobs.total_count > 100) throw new Error('Unexpected release job count');
  const revision = verifiedSource(run, jobs.jobs, repository);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `revision=${revision}\n`);
  console.log(`All release gates passed for ${revision}`);
}
module.exports = { verifiedSource, required };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
