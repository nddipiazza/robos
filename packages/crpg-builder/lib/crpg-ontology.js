'use strict';

/**
 * RobOS cRPG Knowledge Graph Ontology & SHACL Shapes
 * 
 * Formal W3C SHACL shape definitions and vocabulary for party-based isometric
 * cRPGs (Infinity Engine / Baldur's Gate style) using D&D rulesets and Godot 4.
 * 
 * Upstream Provenance:
 * - schema:VideoGame (https://schema.org/VideoGame)
 * - schema:Role (https://schema.org/Role)
 * - schema:Person (https://schema.org/Person)
 * - schema:Action (https://schema.org/Action)
 * - schema:Product (https://schema.org/Product)
 * - schema:Place (https://schema.org/Place)
 * - schema:DataFeed (https://schema.org/DataFeed)
 * - schema:Conversation (https://schema.org/Conversation)
 * - oslc_cm:ChangeRequest (http://open-services.net/ns/cm#ChangeRequest)
 * - schema:Organization (https://schema.org/Organization)
 */

const NS_CRPG = 'https://robos.dev/ns/crpg#';
const NS_SDLC = 'https://robos.dev/ns/sdlc#';

const CRPG_SHACL_SHAPES = [
  {
    shapeId: 'urn:robos:shape:CRPGGameShape',
    targetClass: 'robos:CRPGGame',
    refersFrom: 'https://schema.org/VideoGame',
    domainStandard: 'https://schema.org/VideoGame',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'CRPG Game must have a title.' },
      { path: 'robos:ruleset', minCount: 1, message: 'CRPG Game must specify a ruleset (e.g. dnd5e, dnd35e).' },
      { path: 'robos:combatModel', minCount: 1, message: 'CRPG Game must declare combat model (real-time-with-pause or turn-based-tactical).' },
      { path: 'robos:gameEngine', minCount: 1, message: 'CRPG Game must declare target game engine (e.g. Godot 4).' },
      { path: 'robos:startingZone', minCount: 1, message: 'CRPG Game must specify starting map zone URN.' },
      { path: 'robos:assetPackage', minCount: 1, message: 'CRPG Game must declare primary open-source asset package (e.g. flare-game).' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:CRPGClassShape',
    targetClass: 'robos:CRPGClass',
    refersFrom: 'https://schema.org/Role',
    domainStandard: 'https://schema.org/Role',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Character class must have a title (e.g. Fighter, Wizard).' },
      { path: 'robos:hitDie', minCount: 1, message: 'Character class must specify hit die (d6, d8, d10, d12).' },
      { path: 'robos:primaryAbility', minCount: 1, message: 'Character class must specify primary ability (STR, DEX, INT, WIS, CHA).' },
      { path: 'robos:savingThrows', minCount: 1, message: 'Character class must specify proficient saving throws.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:CRPGMonsterShape',
    targetClass: 'robos:CRPGMonster',
    refersFrom: 'https://schema.org/Person',
    domainStandard: 'https://robos.dev/ns/crpg#Monster',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Monster must have a name.' },
      { path: 'robos:challengeRating', minCount: 1, message: 'Monster must define Challenge Rating (CR).' },
      { path: 'robos:armorClass', minCount: 1, message: 'Monster must declare Armor Class (AC).' },
      { path: 'robos:hitPoints', minCount: 1, message: 'Monster must declare Hit Points (HP).' },
      { path: 'robos:abilities', minCount: 1, message: 'Monster must specify 6 D&D ability scores.' },
      { path: 'robos:spriteAssetRef', minCount: 1, message: 'Monster must link to an 8-directional sprite asset.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:CRPGSpellShape',
    targetClass: 'robos:CRPGSpell',
    refersFrom: 'https://schema.org/Action',
    domainStandard: 'https://robos.dev/ns/crpg#Spell',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Spell must have a name.' },
      { path: 'robos:spellLevel', minCount: 1, message: 'Spell must specify spell level (0-9).' },
      { path: 'robos:magicSchool', minCount: 1, message: 'Spell must specify school of magic.' },
      { path: 'robos:castingTime', minCount: 1, message: 'Spell must declare casting time.' },
      { path: 'robos:range', minCount: 1, message: 'Spell must specify effective range.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:CRPGItemShape',
    targetClass: 'robos:CRPGItem',
    refersFrom: 'https://schema.org/Product',
    domainStandard: 'https://robos.dev/ns/crpg#Item',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Item must have a name.' },
      { path: 'robos:itemCategory', minCount: 1, message: 'Item must specify category (weapon, armor, shield, accessory, consumable, quest).' },
      { path: 'robos:cost', minCount: 1, message: 'Item must specify gold cost.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:CRPGMapZoneShape',
    targetClass: 'robos:CRPGMapZone',
    refersFrom: 'https://schema.org/Place',
    domainStandard: 'https://schema.org/Place',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Map zone must have a title.' },
      { path: 'robos:zoneType', minCount: 1, message: 'Map zone must declare type (dungeon, wilderness, town, interior).' },
      { path: 'robos:scenePath', minCount: 1, message: 'Map zone must specify engine scene path.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:CRPGEncounterTableShape',
    targetClass: 'robos:CRPGEncounterTable',
    refersFrom: 'https://schema.org/DataFeed',
    domainStandard: 'https://schema.org/DataFeed',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Encounter table must have a title.' },
      { path: 'robos:minLevel', minCount: 1, message: 'Encounter table must declare min recommended level.' },
      { path: 'robos:maxLevel', minCount: 1, message: 'Encounter table must declare max recommended level.' },
      { path: 'robos:encounterEntries', minCount: 1, message: 'Encounter table must contain encounter spawn entries.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:CRPGQuestShape',
    targetClass: 'robos:CRPGQuest',
    refersFrom: 'http://open-services.net/ns/cm#ChangeRequest',
    domainStandard: 'http://open-services.net/ns/cm#ChangeRequest',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Quest must have a title.' },
      { path: 'robos:questStages', minCount: 1, message: 'Quest must declare progressive stages/milestones.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:CRPGDialogueTreeShape',
    targetClass: 'robos:CRPGDialogueTree',
    refersFrom: 'https://schema.org/Conversation',
    domainStandard: 'https://schema.org/Conversation',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Dialogue tree must have a title.' },
      { path: 'robos:rootNode', minCount: 1, message: 'Dialogue tree must declare a root entry node ID.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:CRPGFactionShape',
    targetClass: 'robos:CRPGFaction',
    refersFrom: 'https://schema.org/Organization',
    domainStandard: 'https://schema.org/Organization',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Faction must have a title.' }
    ]
  }
];

module.exports = {
  NS_CRPG,
  NS_SDLC,
  CRPG_SHACL_SHAPES
};
