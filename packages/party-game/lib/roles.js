'use strict';

// Roles are assigned from survey trait scores. Every guest gets exactly one role.
// A role has a public face (announced on the TV) and an optional secret twist
// (only shown on that guest's phone). Mini games read `perks` to change scoring:
//
//   hint          — sees one wrong option eliminated before voting
//   doubleDown    — once per mini game, may double the points of a round
//   steal         — earns 1 bonus point for every guest they fool
//   crowdBonus    — +1 when voting with the majority
//   underdog      — +2 per round while in last place
//   secretMission — has a hidden goal; scores 5 bonus points at the finale if met

const ROLE_CATALOG = [
  {
    id: 'detective',
    title: 'The Detective',
    emoji: '🕵️',
    color: '#3b82f6',
    traits: { clever: 2, sneaky: 1 },
    blurb: 'Notices everything. Trusts no one.',
    perks: ['hint'],
    secret: 'Before each vote you will see one wrong answer crossed out.',
  },
  {
    id: 'wildcard',
    title: 'The Wildcard',
    emoji: '🃏',
    color: '#ec4899',
    traits: { chaotic: 2, bold: 1 },
    blurb: 'Nobody, including them, knows what happens next.',
    perks: ['doubleDown'],
    secret: 'Once per mini game, tap DOUBLE DOWN to double that round\'s points. Miss and you lose 2.',
  },
  {
    id: 'trickster',
    title: 'The Trickster',
    emoji: '🦊',
    color: '#f97316',
    traits: { sneaky: 2, creative: 1 },
    blurb: 'Smiles a little too much during bluffing rounds.',
    perks: ['steal'],
    secret: 'You earn a bonus point every time someone guesses wrong about you.',
  },
  {
    id: 'diplomat',
    title: 'The Diplomat',
    emoji: '🕊️',
    color: '#22c55e',
    traits: { kind: 2, social: 1 },
    blurb: 'Keeps the peace. Reads the room.',
    perks: ['crowdBonus'],
    secret: 'Voting with the majority earns you +1 every time.',
  },
  {
    id: 'champion',
    title: 'The Champion',
    emoji: '🏆',
    color: '#eab308',
    traits: { competitive: 2, bold: 1 },
    blurb: 'Here to win. Has already practiced their victory speech.',
    perks: ['doubleDown'],
    secret: 'Once per mini game, tap DOUBLE DOWN to double that round\'s points. Miss and you lose 2.',
  },
  {
    id: 'storyteller',
    title: 'The Storyteller',
    emoji: '📖',
    color: '#7c3aed',
    traits: { creative: 2, social: 1 },
    blurb: 'Every anecdote gets better with each telling.',
    perks: ['steal'],
    secret: 'Your tall tales pay off: +1 per guest fooled by a fact about you.',
  },
  {
    id: 'underdog',
    title: 'The Underdog',
    emoji: '🐢',
    color: '#14b8a6',
    traits: { kind: 1, clever: 0.5 },
    blurb: 'Quiet. Underestimated. Dangerous.',
    perks: ['underdog'],
    secret: 'While you are in last place, every correct answer earns +2 extra.',
  },
  {
    id: 'mole',
    title: 'The Mole',
    emoji: '🐀',
    color: '#ef4444',
    traits: { sneaky: 2, chaotic: 1 },
    blurb: 'Publicly: a normal party guest.',
    publicTitle: 'The Party Guest',
    perks: ['secretMission'],
    secret: 'Secret mission: get at least one guest to guess YOU in the final mini game. Pull it off for +5.',
    secretRole: true,
  },
];

function roleById(id) {
  return ROLE_CATALOG.find((r) => r.id === id) || null;
}

function affinity(role, traitScores) {
  let s = 0;
  for (const [t, w] of Object.entries(role.traits)) s += (traitScores[t] || 0) * w;
  return s;
}

// Deterministic PRNG so a game can be replayed from its seed.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Greedy assignment: the strongest guest/role affinity pairs are matched first,
// so each role is used once until the catalog runs out, then roles repeat.
// At most one Mole per game, and only with 4+ guests.
function assignRoles(guests, { enabledRoles = null, seed = 1 } = {}) {
  const rand = mulberry32(seed);
  let catalog = ROLE_CATALOG.filter((r) => !enabledRoles || enabledRoles.includes(r.id));
  if (guests.length < 4) catalog = catalog.filter((r) => !r.secretRole);
  if (catalog.length === 0) catalog = ROLE_CATALOG.filter((r) => !r.secretRole);

  const result = {};
  const remaining = new Set(guests.map((g) => g.id));
  let available = [...catalog];

  while (remaining.size > 0) {
    if (available.length === 0) available = catalog.filter((r) => !r.secretRole);
    const pairs = [];
    for (const gid of remaining) {
      const guest = guests.find((g) => g.id === gid);
      for (const role of available) {
        pairs.push({ gid, role, score: affinity(role, guest.traits || {}) + rand() * 0.25 });
      }
    }
    pairs.sort((a, b) => b.score - a.score);
    const usedRoles = new Set();
    for (const p of pairs) {
      if (!remaining.has(p.gid) || usedRoles.has(p.role.id)) continue;
      result[p.gid] = p.role.id;
      remaining.delete(p.gid);
      usedRoles.add(p.role.id);
    }
    available = available.filter((r) => !usedRoles.has(r.id));
  }
  return result;
}

// What the TV is allowed to show about a role (the Mole stays hidden).
function publicRole(role) {
  if (!role) return null;
  return {
    id: role.secretRole ? 'guest' : role.id,
    title: role.publicTitle || role.title,
    emoji: role.secretRole ? '🎉' : role.emoji,
    color: role.secretRole ? '#00bcd4' : role.color,
    blurb: role.blurb,
  };
}

function hasPerk(roleId, perk) {
  return Boolean(roleById(roleId)?.perks?.includes(perk));
}

module.exports = { ROLE_CATALOG, roleById, assignRoles, publicRole, hasPerk, mulberry32 };
