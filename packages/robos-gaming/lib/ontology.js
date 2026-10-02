'use strict';

/**
 * RobOS Gaming Knowledge Graph Ontology & W3C SHACL Shapes
 * Universal vocabulary and shape definitions for video games, cRPGs, and tabletop RPGs.
 */

const NS_GAME = 'https://robos.dev/ns/game#';
const NS_CRPG = 'https://robos.dev/ns/crpg#';
const NS_TABLETOP = 'https://robos.dev/ns/tabletop#';
const NS_SDLC = 'https://robos.dev/ns/sdlc#';

const GAMING_SHACL_SHAPES = [
  {
    shapeId: 'urn:robos:shape:GameShape',
    targetClass: 'robos:Game',
    refersFrom: 'https://schema.org/Game',
    domainStandard: 'https://schema.org/Game',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Game must declare a title.' },
      { path: 'robos:ruleset', minCount: 1, message: 'Game must declare an underlying ruleset (e.g. dnd5e, heroquest, d20).' },
      { path: 'robos:gameType', minCount: 1, message: 'Game must declare gameType (e.g. crpg, tabletop, action, roguelike).' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:GameCharacterShape',
    targetClass: 'robos:GameCharacter',
    refersFrom: 'https://schema.org/Person',
    domainStandard: 'https://schema.org/Person',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Character must have a name/title.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:GameClassShape',
    targetClass: 'robos:GameClass',
    refersFrom: 'https://schema.org/Role',
    domainStandard: 'https://schema.org/Role',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Game class must have a title (e.g. Barbarian, Fighter, Wizard).' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:GameMonsterShape',
    targetClass: 'robos:GameMonster',
    refersFrom: 'https://schema.org/Person',
    domainStandard: 'https://robos.dev/ns/game#Monster',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Monster must have a name.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:GameItemShape',
    targetClass: 'robos:GameItem',
    refersFrom: 'https://schema.org/Product',
    domainStandard: 'https://robos.dev/ns/game#Item',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Item must have a name.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:GameSpellShape',
    targetClass: 'robos:GameSpell',
    refersFrom: 'https://schema.org/Action',
    domainStandard: 'https://robos.dev/ns/game#Spell',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Spell must have a name.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:GameMapShape',
    targetClass: 'robos:GameMap',
    refersFrom: 'https://schema.org/Place',
    domainStandard: 'https://schema.org/Place',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Map must have a title.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:TabletopGameShape',
    targetClass: 'robos:TabletopGame',
    refersFrom: 'https://schema.org/Game',
    domainStandard: 'https://robos.dev/ns/tabletop#Game',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Tabletop game must declare a title.' },
      { path: 'robos:ruleset', minCount: 1, message: 'Tabletop game must declare a ruleset (e.g. heroquest).' },
      { path: 'robos:gridDimensions', minCount: 1, message: 'Tabletop game must declare grid dimensions [width, height].' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:TabletopHeroShape',
    targetClass: 'robos:TabletopHero',
    refersFrom: 'https://schema.org/Person',
    domainStandard: 'https://robos.dev/ns/tabletop#Hero',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Tabletop hero must have a name.' },
      { path: 'robos:bodyPoints', minCount: 1, message: 'Tabletop hero must declare Body Points (HP).' },
      { path: 'robos:mindPoints', minCount: 1, message: 'Tabletop hero must declare Mind Points (MP).' },
      { path: 'robos:attackDice', minCount: 1, message: 'Tabletop hero must declare initial attack dice count.' },
      { path: 'robos:defendDice', minCount: 1, message: 'Tabletop hero must declare initial defend dice count.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:TabletopMonsterShape',
    targetClass: 'robos:TabletopMonster',
    refersFrom: 'https://schema.org/Person',
    domainStandard: 'https://robos.dev/ns/tabletop#Monster',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Tabletop monster must have a name.' },
      { path: 'robos:bodyPoints', minCount: 1, message: 'Tabletop monster must declare Body Points.' },
      { path: 'robos:attackDice', minCount: 1, message: 'Tabletop monster must declare attack dice.' },
      { path: 'robos:defendDice', minCount: 1, message: 'Tabletop monster must declare defend dice.' },
      { path: 'robos:movementSquares', minCount: 1, message: 'Tabletop monster must declare movement speed in squares.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:TabletopQuestMapShape',
    targetClass: 'robos:TabletopQuestMap',
    refersFrom: 'https://schema.org/Place',
    domainStandard: 'https://robos.dev/ns/tabletop#QuestMap',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Quest map must declare a title.' },
      { path: 'robos:startingSpawn', minCount: 1, message: 'Quest map must declare starting stair/spawn coordinate [x, y].' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:TabletopMapConfigurationShape',
    targetClass: 'robos:TabletopMapConfiguration',
    refersFrom: 'https://schema.org/Place',
    domainStandard: 'https://robos.dev/ns/tabletop#MapConfiguration',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Tabletop map configuration must declare a title.' },
      { path: 'robos:gridDimensions', minCount: 1, message: 'Tabletop map configuration must declare grid dimensions [width, height].' }
    ]
  }
];

module.exports = {
  NS_GAME,
  NS_CRPG,
  NS_TABLETOP,
  NS_SDLC,
  GAMING_SHACL_SHAPES
};
