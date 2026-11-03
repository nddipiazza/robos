'use strict';
const games = require('../../site/_data/games.json');
function releaseGames(prefix = process.env.GAME_RELEASE_PREFIX || 'games-v') {
  return Object.fromEntries(Object.entries(games).filter(([, game]) => (game.release_prefix || 'games-v') === prefix));
}
function pagePath(id, game = games[id]) { return game.page_path || `/games/${id}/`; }
module.exports = { games, releaseGames, pagePath };
