'use strict';

const { COMBAT_DICE_FACES, UniversalDiceEngine, dice } = require("./lib/dice");
const { BoardGrid } = require("./lib/board-grid");
const {
  HEROQUEST_BOARD_WIDTH,
  HEROQUEST_BOARD_HEIGHT,
  HEROQUEST_ROOMS,
  HEROQUEST_STANDARD_DOORS,
  buildHeroQuestGrid
} = require("./lib/heroquest-board-spec");
const { GameCartridgeBundler } = require("./lib/cartridge-bundler");
const {
  NS_GAME,
  NS_CRPG,
  NS_TABLETOP,
  NS_SDLC,
  GAMING_SHACL_SHAPES
} = require("./lib/ontology");

module.exports = {
  // Dice Subsystem
  COMBAT_DICE_FACES,
  UniversalDiceEngine,
  dice,

  // Grid Mathematics & Blueprint
  BoardGrid,
  HEROQUEST_BOARD_WIDTH,
  HEROQUEST_BOARD_HEIGHT,
  HEROQUEST_ROOMS,
  HEROQUEST_STANDARD_DOORS,
  buildHeroQuestGrid,

  // Cartridge Engine
  GameCartridgeBundler,

  // Ontology & SHACL Shapes
  NS_GAME,
  NS_CRPG,
  NS_TABLETOP,
  NS_SDLC,
  GAMING_SHACL_SHAPES
};
