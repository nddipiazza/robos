'use strict';

/**
 * RobOS cRPG Open-Source 3D Spell Visual Effects Catalog
 * 
 * Maps spells and magical effects to modular 3D models (.glb binary glTF 2.0)
 * categorized across 5 delivery archetypes:
 *   - PROJECTILE: Linear/ballistic flight from caster to target (Fireball, Magic Missile, Frost Shard, Water Jet)
 *   - BURST: Impact detonation, expanding shockwaves & explosive radii (Fireball Explosion, Shatter, Water Splash)
 *   - AURA: Persistent ground rings, spinning vortices & elemental fields (Stinking Cloud, Blizzard, Healing Glyph)
 *   - BEAM: Ray / stroke connecting caster to target (Lightning Bolt, Ray of Frost, Dispel Beam)
 *   - BARRIER: Protective wards & rotating geometries anchored to caster (Shield, Mage Armor, Sanctuary, Dispel Purge)
 * 
 * Provenance:
 * - CC0 / Public Domain (RobOS procedural GLTF, Flare RPG, Kenney, OpenGameArt)
 */

const SPELL_3D_CATALOG = {
  // --- EVOCATION FIRE & PLASMA ---
  'fireball': {
    id: 'fireball',
    title: 'Fireball',
    school: 'Evocation',
    level: 3,
    deliveryType: 'projectile',
    model3dAsset: 'res://assets/models/spell_fireball_projectile.glb',
    burst3dAsset: 'res://assets/models/spell_fireball_explosion.glb',
    model3dScale: 1.0,
    burst3dScale: 1.8,
    speed: 750.0,
    flightStyle: 'linear',
    vfxColor: '#fa6414',
    burstColor: '#ff550a',
    duration: 0.45,
    soundCast: 'spell_cast',
    soundImpact: 'spell_impact',
    provenance: { source: 'RobOS / CC0', license: 'CC0' }
  },
  'fireball-explosion': {
    id: 'fireball-explosion',
    title: 'Fireball Detonation Shockwave',
    school: 'Evocation',
    level: 3,
    deliveryType: 'burst',
    model3dAsset: 'res://assets/models/spell_fireball_explosion.glb',
    burst3dAsset: 'res://assets/models/spell_fireball_explosion.glb',
    model3dScale: 2.0,
    vfxColor: '#ff500a',
    duration: 0.65,
    soundImpact: 'spell_impact',
    provenance: { source: 'RobOS / CC0', license: 'CC0' }
  },
  'burning-hands': {
    id: 'burning-hands',
    title: 'Burning Hands',
    school: 'Evocation',
    level: 1,
    deliveryType: 'burst',
    model3dAsset: 'res://assets/models/spell_fireball_projectile.glb',
    burst3dAsset: 'res://assets/models/spell_fireball_explosion.glb',
    model3dScale: 1.2,
    burst3dScale: 1.4,
    vfxColor: '#ff7711',
    duration: 0.4,
    soundCast: 'spell_cast',
    provenance: { source: 'RobOS / CC0', license: 'CC0' }
  },

  // --- EVOCATION FORCE & ARCANE ---
  'magic-missile': {
    id: 'magic-missile',
    title: 'Magic Missile',
    school: 'Evocation',
    level: 1,
    deliveryType: 'projectile',
    model3dAsset: 'res://assets/models/spell_magic_missile_orb.glb',
    burst3dAsset: 'res://assets/models/spell_magic_missile_orb.glb',
    model3dScale: 0.85,
    burst3dScale: 1.2,
    speed: 680.0,
    flightStyle: 'homing_dart',
    vfxColor: '#2ea6fa',
    duration: 0.3,
    soundCast: 'spell_cast',
    soundImpact: 'spell_impact',
    provenance: { source: 'RobOS / CC0', license: 'CC0' }
  },

  // --- EVOCATION LIGHTNING & ELECTRICITY ---
  'lightning-bolt': {
    id: 'lightning-bolt',
    title: 'Lightning Bolt',
    school: 'Evocation',
    level: 3,
    deliveryType: 'beam',
    model3dAsset: 'res://assets/models/spell_lightning_spark.glb',
    burst3dAsset: 'res://assets/models/spell_lightning_spark.glb',
    model3dScale: 1.4,
    burst3dScale: 1.6,
    speed: 1600.0,
    flightStyle: 'instant_line',
    vfxColor: '#faf541',
    duration: 0.35,
    soundCast: 'spell_cast',
    soundImpact: 'melee_crit',
    provenance: { source: 'RobOS / CC0', license: 'CC0' }
  },

  // --- EVOCATION / CONJURATION COLD & BLIZZARD ---
  'blizzard': {
    id: 'blizzard',
    title: 'Blizzard',
    school: 'Evocation',
    level: 3,
    deliveryType: 'aura',
    model3dAsset: 'res://assets/models/spell_blizzard_vortex.glb',
    burst3dAsset: 'res://assets/models/spell_frost_shard.glb',
    model3dScale: 1.5,
    burst3dScale: 1.2,
    vfxColor: '#bfe6ff',
    duration: 3.5,
    spinSpeed: 5.0,
    soundCast: 'spell_cast',
    provenance: { source: 'RobOS / CC0', license: 'CC0' }
  },
  'frost-shard': {
    id: 'frost-shard',
    title: 'Frost Shard / Ray of Frost',
    school: 'Evocation',
    level: 1,
    deliveryType: 'projectile',
    model3dAsset: 'res://assets/models/spell_frost_shard.glb',
    burst3dAsset: 'res://assets/models/spell_blizzard_vortex.glb',
    model3dScale: 0.95,
    burst3dScale: 1.1,
    speed: 620.0,
    flightStyle: 'linear',
    vfxColor: '#a6e0fa',
    duration: 0.4,
    soundCast: 'spell_cast',
    soundImpact: 'spell_impact',
    provenance: { source: 'RobOS / CC0', license: 'CC0' }
  },

  // --- CONJURATION WATER & ACID ---
  'water-splash': {
    id: 'water-splash',
    title: 'Tidal Wave / Water Splash',
    school: 'Conjuration',
    level: 2,
    deliveryType: 'burst',
    model3dAsset: 'res://assets/models/spell_water_splash.glb',
    burst3dAsset: 'res://assets/models/spell_water_splash.glb',
    model3dScale: 1.6,
    vfxColor: '#26a6f2',
    duration: 0.6,
    soundImpact: 'spell_impact',
    provenance: { source: 'RobOS / CC0', license: 'CC0' }
  },
  'water-jet': {
    id: 'water-jet',
    title: 'Hydro Water Jet',
    school: 'Conjuration',
    level: 1,
    deliveryType: 'projectile',
    model3dAsset: 'res://assets/models/spell_water_splash.glb',
    burst3dAsset: 'res://assets/models/spell_water_splash.glb',
    model3dScale: 0.9,
    burst3dScale: 1.3,
    speed: 700.0,
    flightStyle: 'linear',
    vfxColor: '#3bb2f5',
    duration: 0.4,
    soundCast: 'spell_cast',
    provenance: { source: 'RobOS / CC0', license: 'CC0' }
  },

  // --- CONJURATION MIASMA & GAS ---
  'stinking-cloud': {
    id: 'stinking-cloud',
    title: 'Stinking Cloud',
    school: 'Conjuration',
    level: 3,
    deliveryType: 'aura',
    model3dAsset: 'res://assets/models/spell_stinking_cloud_ring.glb',
    burst3dAsset: 'res://assets/models/spell_stinking_cloud_ring.glb',
    model3dScale: 1.8,
    vfxColor: '#73ad2e',
    duration: 4.0,
    spinSpeed: 2.2,
    soundCast: 'spell_cast',
    provenance: { source: 'RobOS / CC0', license: 'CC0' }
  },

  // --- EVOCATION RESTORATION & HOLY ---
  'cure-wounds': {
    id: 'cure-wounds',
    title: 'Cure Wounds',
    school: 'Evocation',
    level: 1,
    deliveryType: 'aura',
    model3dAsset: 'res://assets/models/spell_healing_glyph.glb',
    burst3dAsset: 'res://assets/models/spell_healing_glyph.glb',
    model3dScale: 1.2,
    vfxColor: '#26f273',
    duration: 1.0,
    soundCast: 'heal_cast',
    provenance: { source: 'RobOS / CC0', license: 'CC0' }
  },
  'healing-word': {
    id: 'healing-word',
    title: 'Healing Word',
    school: 'Evocation',
    level: 1,
    deliveryType: 'projectile',
    model3dAsset: 'res://assets/models/spell_healing_glyph.glb',
    burst3dAsset: 'res://assets/models/spell_healing_glyph.glb',
    model3dScale: 0.8,
    burst3dScale: 1.1,
    speed: 800.0,
    flightStyle: 'homing_dart',
    vfxColor: '#4dfa8c',
    duration: 0.35,
    soundCast: 'heal_cast',
    provenance: { source: 'RobOS / CC0', license: 'CC0' }
  },

  // --- ABJURATION PURGE & DISPEL ---
  'dispel-magic': {
    id: 'dispel-magic',
    title: 'Dispel Magic',
    school: 'Abjuration',
    level: 3,
    deliveryType: 'burst',
    model3dAsset: 'res://assets/models/spell_dispel_purge.glb',
    burst3dAsset: 'res://assets/models/spell_dispel_purge.glb',
    model3dScale: 1.6,
    vfxColor: '#bf66fa',
    duration: 0.7,
    soundCast: 'spell_cast',
    soundImpact: 'spell_impact',
    provenance: { source: 'RobOS / CC0', license: 'CC0' }
  },
  'counterspell': {
    id: 'counterspell',
    title: 'Counterspell',
    school: 'Abjuration',
    level: 3,
    deliveryType: 'barrier',
    model3dAsset: 'res://assets/models/spell_dispel_purge.glb',
    burst3dAsset: 'res://assets/models/spell_dispel_purge.glb',
    model3dScale: 1.3,
    vfxColor: '#cf52fa',
    duration: 0.5,
    soundCast: 'spell_cast',
    provenance: { source: 'RobOS / CC0', license: 'CC0' }
  },
  'shield': {
    id: 'shield',
    title: 'Shield',
    school: 'Abjuration',
    level: 1,
    deliveryType: 'barrier',
    model3dAsset: 'res://assets/models/armor_shield_heater.glb',
    burst3dAsset: 'res://assets/models/spell_magic_missile_orb.glb',
    model3dScale: 1.1,
    vfxColor: '#4da6fa',
    duration: 1.2,
    soundCast: 'spell_cast',
    provenance: { source: 'RobOS / CC0', license: 'CC0' }
  },
  'mage-armor': {
    id: 'mage-armor',
    title: 'Mage Armor',
    school: 'Abjuration',
    level: 1,
    deliveryType: 'barrier',
    model3dAsset: 'res://assets/models/spell_dispel_purge.glb',
    burst3dAsset: 'res://assets/models/spell_healing_glyph.glb',
    model3dScale: 1.2,
    vfxColor: '#6699fa',
    duration: 1.5,
    soundCast: 'spell_cast',
    provenance: { source: 'RobOS / CC0', license: 'CC0' }
  }
};

const ALIASES = {
  'fireball_spell': 'fireball',
  'flame_ball': 'fireball',
  'magic_missile': 'magic-missile',
  'missile': 'magic-missile',
  'cure_wounds': 'cure-wounds',
  'heal': 'cure-wounds',
  'healing_word': 'healing-word',
  'lightning': 'lightning-bolt',
  'lightning_bolt': 'lightning-bolt',
  'dispel': 'dispel-magic',
  'dispel_magic': 'dispel-magic',
  'stinking_cloud': 'stinking-cloud',
  'water': 'water-splash',
  'ice_shard': 'frost-shard',
  'ray_of_frost': 'frost-shard'
};

function getSpell3D(idOrSlug) {
  if (!idOrSlug || typeof idOrSlug !== 'string') return null;
  const key = idOrSlug.trim().toLowerCase();
  if (SPELL_3D_CATALOG[key]) return SPELL_3D_CATALOG[key];
  if (ALIASES[key] && SPELL_3D_CATALOG[ALIASES[key]]) return SPELL_3D_CATALOG[ALIASES[key]];
  return null;
}

function getAllSpells3D() {
  return Object.values(SPELL_3D_CATALOG);
}

function getSpellsByDeliveryType(deliveryType) {
  if (!deliveryType) return [];
  const dt = deliveryType.toLowerCase();
  return Object.values(SPELL_3D_CATALOG).filter(s => s.deliveryType === dt);
}

function resolveSpellVFX(spellData) {
  if (!spellData) return null;
  const id = spellData.id || spellData.name || '';
  const match = getSpell3D(id);
  if (match) return match;

  const title = (spellData.title || spellData.name || '').toLowerCase();
  const school = (spellData.school || '').toLowerCase();
  const damageType = (spellData.damageType || '').toLowerCase();

  if (title.includes('fire') || damageType === 'fire') {
    return SPELL_3D_CATALOG['fireball'];
  }
  if (title.includes('missile') || damageType === 'force') {
    return SPELL_3D_CATALOG['magic-missile'];
  }
  if (title.includes('heal') || damageType === 'healing') {
    return SPELL_3D_CATALOG['cure-wounds'];
  }
  if (title.includes('lightning') || damageType === 'lightning') {
    return SPELL_3D_CATALOG['lightning-bolt'];
  }
  if (title.includes('frost') || title.includes('ice') || damageType === 'cold') {
    return SPELL_3D_CATALOG['frost-shard'];
  }
  if (title.includes('water') || damageType === 'water') {
    return SPELL_3D_CATALOG['water-splash'];
  }
  if (title.includes('dispel') || title.includes('counter') || school === 'abjuration') {
    return SPELL_3D_CATALOG['dispel-magic'];
  }
  if (title.includes('cloud') || damageType === 'poison') {
    return SPELL_3D_CATALOG['stinking-cloud'];
  }

  return SPELL_3D_CATALOG['magic-missile'];
}

module.exports = {
  SPELL_3D_CATALOG,
  getSpell3D,
  getAllSpells3D,
  getSpellsByDeliveryType,
  resolveSpellVFX
};
