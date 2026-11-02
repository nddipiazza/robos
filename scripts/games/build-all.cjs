'use strict';
const { build } = require('./build.cjs');
async function main() {
  for (const id of Object.keys(require('../../site/_data/games.json'))) await build({ id, platform: process.env.GAME_PLATFORM });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
