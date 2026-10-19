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
const {
  FAN_DUNGEON_28x21_CONFIG,
  HEROQUEST_CLASSIC_CONFIG,
  HEROQUEST_FIRST_LIGHT_CONFIG,
  FIRST_LIGHT_DUNGEON_CONFIG,
  MIDTERM_ELECTION_CAPITOL_CONFIG,
  getMapConfiguration,
  listMapConfigurations,
  registerMapConfiguration
} = require("./lib/map-configurations");
const { GameCartridgeBundler } = require("./lib/cartridge-bundler");
const {
  NS_GAME,
  NS_CRPG,
  NS_TABLETOP,
  NS_SDLC,
  GAMING_SHACL_SHAPES,
  TABLETOP_SAVE_STATE_SCHEMA,
  formatDurationSeconds,
  normalizeQuestSaveStateToKGraphNode
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

  // Multi-Map Configurations
  FAN_DUNGEON_28x21_CONFIG,
  HEROQUEST_CLASSIC_CONFIG,
  HEROQUEST_FIRST_LIGHT_CONFIG,
  FIRST_LIGHT_DUNGEON_CONFIG,
  MIDTERM_ELECTION_CAPITOL_CONFIG,
  getMapConfiguration,
  listMapConfigurations,
  registerMapConfiguration,

  // Cartridge Engine
  GameCartridgeBundler,

  // Ontology & SHACL Shapes
  NS_GAME,
  NS_CRPG,
  NS_TABLETOP,
  NS_SDLC,
  GAMING_SHACL_SHAPES,
  TABLETOP_SAVE_STATE_SCHEMA,
  formatDurationSeconds,
  normalizeQuestSaveStateToKGraphNode
};
