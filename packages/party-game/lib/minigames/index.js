'use strict';

// Mini game registry. To add a mini game, create a file in this folder with
// defineMiniGame() (see template.js) and add it to this list.
const MINI_GAMES = [
  require('./who-said-that'),
  require('./most-likely-to'),
  require('./house-quest'),
  require('./interest-trivia'),
  require('./truth-or-bot'),
];

function getMiniGame(id) {
  return MINI_GAMES.find((m) => m.id === id) || null;
}

function listMiniGames() {
  return MINI_GAMES.map(({ id, title, tagline, description, icon, minGuests, defaultRounds, answerSeconds }) => ({
    id, title, tagline, description, icon, minGuests, defaultRounds, answerSeconds,
  }));
}

module.exports = { MINI_GAMES, getMiniGame, listMiniGames };
