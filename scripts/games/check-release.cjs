'use strict';
const fs = require('node:fs');
async function main() {
  const version = fs.readFileSync('VERSION', 'utf8').trim();
  const prefix = process.env.GAME_RELEASE_PREFIX || 'games-v';
  const response = await fetch(`https://api.github.com/repos/nddipiazza/robos/releases/tags/${prefix}${version}`);
  if (!response.ok && response.status !== 404) throw new Error(`Release lookup failed: ${response.status}`);
  const needed = response.status === 404;
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `needed=${needed}\n`);
  console.log(needed ? 'Building standalone game release.' : 'This game version is already published. Bump VERSION to release changed game builds.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
