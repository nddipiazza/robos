'use strict';
const { build } = require('./build.cjs');
async function main() {
  for (const [id, game] of Object.entries(require('./catalog.cjs').releaseGames())) {
    if (process.env.GAME_PLATFORM === 'web' && !game.web) continue;
    await build({ id, platform: process.env.GAME_PLATFORM });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
