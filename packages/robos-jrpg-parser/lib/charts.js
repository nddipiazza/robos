'use strict';

// Reads the charts guides publish as tables, by their header cells, so any
// guide with the same columns works: monster and boss charts (HP, experience,
// gold, weakness) and spell charts (one column per spell level).

const { slug } = require('./slug');

const lower = s => String(s || '').toLowerCase();

function columnOf(header, re) {
  return header.findIndex(cell => re.test(lower(cell)));
}

function isBestiary(header) {
  return columnOf(header, /^hp$|hit points/) >= 0 && columnOf(header, /exp|^xp$/) >= 0;
}

function isSpellChart(header) {
  return header.length >= 2 && header.filter(cell => /^(level|lv\.?)\s*\d/i.test(cell)).length >= 2;
}

function int(value) {
  const n = parseInt(String(value).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function readBestiary(rows, source) {
  const header = rows[0];
  const boss = /boss/i.test(header[0]);
  const hp = columnOf(header, /^hp$|hit points/);
  const xp = columnOf(header, /exp|^xp$/);
  const gold = columnOf(header, /^gil$|^gold$|^gp$|^g$/);
  const weak = columnOf(header, /weak/);
  const out = [];
  for (const row of rows.slice(1)) {
    const name = row[0];
    if (!name) continue;
    const parts = name.split(/\s+-\s+/);
    out.push({
      name: parts.length > 1 ? parts[parts.length - 1] : name,
      altNames: parts.length > 1 ? parts.slice(0, -1) : [],
      boss,
      hp: int(row[hp]),
      xp: int(row[xp]),
      gold: gold >= 0 ? int(row[gold]) : null,
      weakness: weak >= 0 ? String(row[weak] || '').split(/[,/]/).map(s => s.trim()).filter(Boolean) : [],
      source,
    });
  }
  return out;
}

// "POISON (BANE) * *" → title POISON, alternate name BANE. "(HRM2 )" comes from split cells.
function readSpellName(cell) {
  const clean = cell.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim();
  const m = clean.match(/^(.+?)\s*\(\s*([^)]*?)\s*\)?$/);
  return m ? { name: m[1].trim(), altName: m[2].trim() || null } : { name: clean, altName: null };
}

function readSpellChart(rows, source) {
  const levels = rows[0].map(cell => {
    const m = cell.match(/(\d+)\s*\(?\s*([\d,]+)?/);
    return m ? { level: int(m[1]), price: m[2] ? int(m[2]) : null } : { level: null, price: null };
  });
  const body = rows.slice(1);
  // Charts of this era list black magic rows above white magic rows, in equal halves.
  const half = body.length % 2 === 0 ? body.length / 2 : null;
  const out = [];
  body.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!cell || !levels[c] || levels[c].level === null) return;
      const { name, altName } = readSpellName(cell);
      if (!name) return;
      out.push({
        name,
        altName,
        school: half === null ? null : r < half ? 'black' : 'white',
        level: levels[c].level,
        price: levels[c].price,
        source,
      });
    });
  });
  return out;
}

// Finds "NAME (ALT)" heading lines after a heading mentioning spell descriptions, and
// the text under each.
function readSpellDescriptions(text) {
  const lines = text.split('\n');
  const start = lines.findIndex(l => /(spell|magic).*descriptions?/i.test(l) && /part|^[ivx]+\.|^magic|^spell/i.test(l) && !/^[ivx]+\./i.test(l));
  if (start < 0) return new Map();
  const heading = /^[A-Z][A-Z0-9 /!]*( ?\([A-Z0-9! ]+\))?$/;
  const out = new Map();
  let names = null;
  let body = [];
  const flush = () => {
    if (names && body.length) for (const n of names) if (!out.has(n)) out.set(n, body.join(' '));
    body = [];
  };
  for (const line of lines.slice(start + 1)) {
    if (/^part\s+[ivx]+\b/i.test(line)) break;
    if (heading.test(line) && line.length < 28) {
      flush();
      const bare = line.replace(/\(.*\)/, '').trim();
      const alt = (line.match(/\(([^)]+)\)/) || [])[1];
      names = bare.split('/').map(s => s.replace(/\s+/g, '').trim()).filter(Boolean);
      if (alt) names.push(alt.replace(/\s+/g, ''));
    } else if (names) body.push(line);
  }
  flush();
  return out;
}

// FIRE1 uses the description under FIRE; SHLD1 under SHLD.
function spellDescription(spell, descriptions) {
  const keys = [spell.name, spell.altName, spell.name.replace(/\d+$/, ''), spell.altName && spell.altName.replace(/\d+$/, '')];
  for (const key of keys) {
    if (key && descriptions.has(key.replace(/\s+/g, ''))) return descriptions.get(key.replace(/\s+/g, ''));
  }
  return null;
}

function isEquipmentTable(header) {
  return columnOf(header, /price|cost/) >= 0 && columnOf(header, /^damage|^attack|^atk|^absorb|^defense|^def$/) >= 0;
}

function isMusicTable(header) {
  return columnOf(header, /track/) >= 0 && columnOf(header, /title/) >= 0;
}

// "`FI` = Fighter | `KN` = Knight" lines give a guide's class abbreviations.
function readClassKey(text) {
  const key = new Map();
  for (const m of text.matchAll(/`([A-Z]{2})`\s*=\s*([A-Z][A-Za-z ]+?)(?=\s*\||\s*$)/gm)) key.set(m[1], m[2].trim());
  return key;
}

function readPermissions(cell, key) {
  const value = String(cell || '').trim();
  if (!value) return [];
  const all = [...key.values()];
  if (/^all classes$/i.test(value)) return all.length ? all : [value];
  const except = value.match(/^all except\s+(.+)/i);
  if (except && all.length) {
    const out = except[1].split(/[,\s]+/).map(code => key.get(code)).filter(Boolean);
    return all.filter(name => !out.includes(name));
  }
  return value.split(',').map(code => key.get(code.trim()) || code.trim()).filter(Boolean);
}

function readEquipment(rows, source, classKey) {
  const header = rows[0];
  const name = columnOf(header, /name/);
  const damage = columnOf(header, /^damage|^attack|^atk/);
  const absorb = columnOf(header, /^absorb|^defense|^def$/);
  const hit = columnOf(header, /^hit/);
  const crit = columnOf(header, /crit/);
  const weight = columnOf(header, /evade|weight|^w\.?$/);
  const price = columnOf(header, /price|cost/);
  const sell = columnOf(header, /^sell/);
  const equip = columnOf(header, /equip|class|permission/);
  const effect = columnOf(header, /special|effect|resist|cast/);
  const id = columnOf(header, /^id$/);
  const where = columnOf(header, /location/);
  const isWeapon = damage >= 0;
  const out = [];
  for (const row of rows.slice(1)) {
    // "Wooden staff / Staff" gives one item's two names. A row of one cell is a subheading.
    const [title, ...altNames] = String(row[name >= 0 ? name : 0] || '').split(/\s+\/\s+/).map(s => s.trim());
    if (!title || row.length < 3 || row[price] === '' || row[price] === undefined) continue;
    const special = effect >= 0 ? row[effect] : '';
    out.push({
      name: title,
      altNames,
      kind: isWeapon ? 'weapon' : 'armor',
      foundAt: where >= 0 && row[where] ? row[where] : null,
      slot: isWeapon ? null : lower(header[name >= 0 ? name : 0]).split(/\s+/)[0],
      gameId: id >= 0 ? int(row[id]) : null,
      damage: isWeapon ? int(row[damage]) : null,
      absorb: absorb >= 0 ? int(row[absorb]) : null,
      hit: hit >= 0 ? int(row[hit]) : null,
      crit: crit >= 0 ? int(row[crit]) : null,
      weight: weight >= 0 ? int(row[weight]) : null,
      price: price >= 0 ? int(row[price]) : null,
      sell: sell >= 0 ? int(row[sell]) : null,
      usableBy: equip >= 0 ? readPermissions(row[equip], classKey) : [],
      effect: special && special !== '-' ? special : null,
      exact: true,
      source,
    });
  }
  return out;
}

/** "Spell | Fire | Thunder" tables, one spell per column: its names in each release and its effect. */
function isSpellColumns(header) {
  return /^spell$/i.test(header[0] || '') && header.length >= 2;
}

function readSpellColumns(rows) {
  const row = re => rows.find(r => re.test(r[0] || '')) || [];
  const names = row(/alternate names/i);
  const range = row(/^range/i);
  const effect = row(/^effect/i);
  return rows[0].slice(1).map((name, i) => {
    const alt = names[i + 1] || '';
    return {
      name,
      nes: (alt.match(/NES:\s*([^\s(]+)/) || [])[1] || null,
      psx: (alt.match(/PSX:\s*([^\s(]+)/) || [])[1] || null,
      range: range[i + 1] || null,
      effect: effect[i + 1] || null,
    };
  }).filter(s => s.name);
}

/** Whether code reads this table itself, so the agent need not. */
function isChartTable(rows) {
  if (!rows.length || !rows[0].length) return false;
  const header = rows[0];
  return isBestiary(header) || isSpellChart(header) || isEquipmentTable(header) || isMusicTable(header) || isSpellColumns(header);
}

function readMusic(rows, source) {
  const header = rows[0];
  const track = columnOf(header, /track/);
  const title = columnOf(header, /title/);
  const where = columnOf(header, /context|where|used|location/);
  return rows.slice(1).filter(row => row[title]).map(row => ({
    name: row[title], track: int(row[track]), usedFor: where >= 0 ? row[where] : null, source,
  }));
}

const SHOP_KINDS = [[/weapon/i, 'weapon'], [/armou?r/i, 'armor'], [/item|inventory/i, 'item']];

function pricedItems(text) {
  return [...text.matchAll(/([^,()]+?)\s*\((\d[\d,]*)\s*G\)/g)].map(m => ({ name: m[1].replace(/^\s*[*_]+|[*_]+\s*$/g, '').trim(), price: int(m[2]) }));
}

/**
 * Reads a "## ... Shop ..." section of a Markdown guide: "### 1. Coneria" headings with
 * "* **Weapon Shop:** Rapier (10 G)" bullets and "* **Magic (Level 1 - 100 G each):**" lists.
 */
function readShopSections(text, source) {
  const shops = new Map();
  const add = (town, kind, stock, price) => {
    const key = `${slug(town)}:${kind}`;
    if (!shops.has(key)) shops.set(key, { town, kind, stock: [], exact: true, source });
    const shop = shops.get(key);
    shop.stock.push(...stock);
    if (price !== undefined && price !== null) shop.price = price;
  };
  let inSection = false;
  let town = null;
  let magic = null;
  for (const line of text.split('\n')) {
    const heading = line.match(/^(#{1,6})\s+(.+)/);
    if (heading) {
      if (heading[1].length <= 2) inSection = /\bshops?\b/i.test(heading[2]);
      else if (inSection) town = heading[2].replace(/^\d+\.\s*/, '').replace(/\s*\(.*\)\s*$/, '').trim();
      magic = null;
      continue;
    }
    if (!inSection || !town) continue;
    const bullet = line.match(/^\s*\*\s+\*\*(.+?):\*\*\s*(.*)$/);
    if (bullet) {
      const [, label, rest] = bullet;
      magic = null;
      const level = label.match(/magic\s*\(level\s*(\d+)\s*-\s*([\d,]+)\s*G/i);
      if (level) { magic = { level: int(level[1]), price: int(level[2]) }; continue; }
      const prices = line.match(/\*\*inn:\*\*\s*([\d,]+)\s*G(?:\s*\|\s*\*\*clinic:\*\*\s*([\d,]+)\s*G)?/i);
      if (prices) {
        add(town, 'inn', [], int(prices[1]));
        if (prices[2]) add(town, 'clinic', [], int(prices[2]));
        continue;
      }
      const kind = SHOP_KINDS.find(([re]) => re.test(label));
      if (kind) {
        const items = pricedItems(rest);
        if (items.length) add(town, kind[1], items);
      }
      continue;
    }
    const school = line.match(/^\s*\*\s+\*(white|black):\*\s*(.*)$/i);
    if (school && magic) {
      const names = school[2].split(',').map(s => s.replace(/[*()]/g, '').trim()).filter(s => s && !/^none/i.test(s));
      if (names.length) add(town, `${school[1].toLowerCase()}-magic`, names.map(name => ({ name, price: magic.price, level: magic.level })));
    }
  }
  return [...shops.values()];
}

/** Shop items a guide's own equipment tables disagree with, so a person can check them. */
function checkShopPrices(shops, equipment) {
  const bySlug = new Map(equipment.map(e => [slug(e.name), e]));
  const problems = [];
  for (const shop of shops) {
    if (shop.kind !== 'weapon' && shop.kind !== 'armor') continue;
    for (const item of shop.stock) {
      const known = bySlug.get(slug(item.name));
      if (!known) problems.push(`${shop.town} ${shop.kind} shop sells ${item.name}, which is not in the equipment tables.`);
      else if (known.price !== item.price) problems.push(`${shop.town} ${shop.kind} shop sells ${item.name} for ${item.price}, but the equipment table says ${known.price}.`);
    }
  }
  return problems;
}

/** Everything chart-shaped in one page. */
function readCharts(tableRows, text, source) {
  const enemies = [];
  const spells = [];
  const equipment = [];
  const music = [];
  const spellNames = [];
  const classKey = readClassKey(text);
  for (const rows of tableRows) {
    if (!rows.length) continue;
    if (isBestiary(rows[0])) enemies.push(...readBestiary(rows, source));
    else if (isSpellChart(rows[0])) spells.push(...readSpellChart(rows, source));
    else if (isEquipmentTable(rows[0])) equipment.push(...readEquipment(rows, source, classKey));
    else if (isMusicTable(rows[0])) music.push(...readMusic(rows, source));
    else if (isSpellColumns(rows[0])) spellNames.push(...readSpellColumns(rows));
  }
  const descriptions = readSpellDescriptions(text);
  for (const spell of spells) spell.description = spellDescription(spell, descriptions);
  const shops = readShopSections(text, source);
  return { enemies, spells, equipment, music, shops, spellNames, problems: checkShopPrices(shops, equipment) };
}

/**
 * Compares a primary source's equipment with another's. Returns what the other source adds
 * (where to find an item) and where the numbers disagree. Rows only the other source has
 * are left out, because a page covering several editions lists remake-only gear.
 */
function crossCheckEquipment(primary, others) {
  const fields = [['damage', 'attack'], ['absorb', 'absorb'], ['hit', 'hit%'], ['price', 'price'], ['weight', 'weight']];
  const bySlug = new Map();
  for (const row of primary) for (const name of [row.name, ...(row.altNames || [])]) bySlug.set(slug(name), row);
  // Several pages can repeat one table, so each disagreement is reported once.
  const conflicts = new Map();
  let unmatched = 0;
  for (const other of others) {
    const match = [other.name, ...(other.altNames || [])].map(n => bySlug.get(slug(n))).find(Boolean);
    if (!match) { unmatched++; continue; }
    if (other.foundAt && !match.foundAt) match.foundAt = other.foundAt;
    for (const [field, label] of fields) {
      if (match[field] !== null && match[field] !== undefined && other[field] !== null && other[field] !== undefined && match[field] !== other[field]) {
        const key = `${match.name}:${field}:${other[field]}`;
        if (!conflicts.has(key)) conflicts.set(key, `${match.name}: ${label} is ${match[field]} in ${match.source} but ${other[field]} in ${other.source}.`);
      }
    }
  }
  return { conflicts: [...conflicts.values()], unmatched };
}

/** Gives chart spells their names for this edition, and the effects from a spell-column page. */
function applySpellNames(spells, spellNames, edition) {
  const useNes = /\bnes\b/i.test(edition);
  const lookup = new Map();
  for (const s of spellNames) for (const n of [s.psx, s.nes]) if (n && !lookup.has(slug(n))) lookup.set(slug(n), s);
  for (const spell of spells) {
    const s = lookup.get(slug(spell.name)) || (spell.altName && lookup.get(slug(spell.altName)));
    if (!s) continue;
    spell.range = s.range;
    if (!spell.description) spell.description = s.effect;
    if (useNes && s.nes) {
      spell.otherNames = [...new Set([spell.name, spell.altName, s.psx, s.name].filter(n => n && n !== s.nes))];
      spell.name = s.nes;
      spell.altName = null;
    } else spell.otherNames = [...new Set([spell.altName, s.nes, s.psx, s.name].filter(n => n && n !== spell.name))];
  }
}

module.exports = { readCharts, crossCheckEquipment, applySpellNames, isChartTable, readBestiary, readSpellChart, readSpellName, readSpellDescriptions, readShopSections, readPermissions, slug };
