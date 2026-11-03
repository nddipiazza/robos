'use strict';
const games = require('../../site/_data/games.json');
const fs = require('node:fs');
const path = require('node:path');
function releaseGames(prefix = process.env.GAME_RELEASE_PREFIX || 'games-v') {
  return Object.fromEntries(Object.entries(games).filter(([, game]) => (game.release_prefix || 'games-v') === prefix));
}
function pagePath(id, game = games[id]) { return game.page_path || `/games/${id}/`; }
function releaseVersion(prefix) {
  const fallback = fs.readFileSync(path.resolve(__dirname, '../../VERSION'), 'utf8').trim();
  const versions = [...new Set(Object.values(releaseGames(prefix)).map(game => game.version || fallback))];
  if (versions.length !== 1) throw new Error('A game release group must have one version');
  return versions[0];
}
module.exports = { games, releaseGames, pagePath, releaseVersion };
