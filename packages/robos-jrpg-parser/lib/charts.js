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
  const idCol = columnOf(header, /^id$/);
  const nameCol = columnOf(header, /name|monster|enemy|boss/);
  const nameIdx = nameCol >= 0 ? nameCol : (idCol === 0 ? 1 : 0);
  const boss = /boss/i.test(header[nameIdx] || header[0]);
  const hp = columnOf(header, /^hp$|hit points/);
  const xp = columnOf(header, /exp|^xp$/);
  const gold = columnOf(header, /^gil$|^gold$|^gp$|^g$/);
  const atk = columnOf(header, /^atk$|^attack$|^damage$/);
  const acc = columnOf(header, /^acc$|^accuracy$|^hit%?$/);
  const hits = columnOf(header, /^hits$/);
  const crt = columnOf(header, /^crt$|^crit/);
  const def = columnOf(header, /^def$|^defense$|^absorb$/);
  const eva = columnOf(header, /^eva$|^evade$|^agility$/);
  const md = columnOf(header, /^m\.?d\.?$|magic def/);
  const mor = columnOf(header, /^mor$|^morale$/);
  const typeCol = columnOf(header, /^type$|^category$/);
  const weak = columnOf(header, /weak/);
  const resist = columnOf(header, /resist/);
  const satk = columnOf(header, /status atk|^satk$/);
  const aiCol = columnOf(header, /^ai|spells/);
  const splitList = val => String(val || '').split(/[,/]/).map(s => s.trim()).filter(s => s && !/^none$/i.test(s));
  const out = [];
  for (const row of rows.slice(1)) {
    const name = row[nameIdx];
    if (!name) continue;
    const parts = name.split(/\s+-\s+/);
    const entry = {
      name: parts.length > 1 ? parts[parts.length - 1] : name,
      altNames: parts.length > 1 ? parts.slice(0, -1) : [],
      boss,
      hp: int(row[hp]),
      xp: int(row[xp]),
      gold: gold >= 0 ? int(row[gold]) : null,
      weakness: weak >= 0 ? splitList(row[weak]) : [],
      source,
    };
    if (idCol >= 0 && int(row[idCol]) !== null) entry.gameId = int(row[idCol]);
    if (atk >= 0 && int(row[atk]) !== null) entry.attack = int(row[atk]);
    if (acc >= 0 && int(row[acc]) !== null) entry.accuracy = int(row[acc]);
    if (hits >= 0 && int(row[hits]) !== null) entry.hits = int(row[hits]);
    if (crt >= 0 && int(row[crt]) !== null) entry.critRate = int(row[crt]);
    if (def >= 0 && int(row[def]) !== null) entry.defense = int(row[def]);
    if (eva >= 0 && int(row[eva]) !== null) entry.evade = int(row[eva]);
    if (md >= 0 && int(row[md]) !== null) entry.magicDefense = int(row[md]);
    if (mor >= 0 && int(row[mor]) !== null) entry.morale = int(row[mor]);
    if (typeCol >= 0) entry.categories = splitList(row[typeCol]);
    if (resist >= 0) entry.resistances = splitList(row[resist]);
    if (satk >= 0) entry.statusAttack = splitList(row[satk]);
    if (aiCol >= 0 && row[aiCol] && !/^none/i.test(row[aiCol])) entry.ai = row[aiCol];
    out.push(entry);
  }
  return out;
}

// "BLAST (BURST) * *" → title BLAST, alternate name BURST. "(BRST )" comes from split cells.
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

// BLAST1 uses the description under BLAST.
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

// "`SQ` = Squire | `PL` = Paladin" lines give a guide's class abbreviations.
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
    // "Ash staff / Staff" gives one item's two names. A row of one cell is a subheading.
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
  return /^spell$/i.test(header[0] || '') && header.length >= 2 && columnOf(header, /power|effectivity|accuracy/) < 0;
}

function isSpellTable(header) {
  return columnOf(header, /^spell$|^magic$|^school$/) >= 0 && columnOf(header, /power|effectivity/) >= 0 && columnOf(header, /accuracy|^acc$/) >= 0;
}

function readSpellTable(rows, source) {
  const header = rows[0];
  const idCol = columnOf(header, /^id$/);
  const nameCol = columnOf(header, /^spell$|^magic$|name/);
  const schoolCol = columnOf(header, /school/);
  const levelCol = columnOf(header, /^level|^lv/);
  const priceCol = columnOf(header, /price|cost/);
  const powerCol = columnOf(header, /power|effectivity/);
  const accCol = columnOf(header, /accuracy|^acc$/);
  const elemCol = columnOf(header, /element/);
  const targetCol = columnOf(header, /target|range/);
  const effectCol = columnOf(header, /effect|notes/);
  return rows.slice(1).filter(r => r[nameCol]).map(row => ({
    gameId: idCol >= 0 ? int(row[idCol]) : null,
    name: row[nameCol].trim(),
    school: schoolCol >= 0 && row[schoolCol] ? lower(row[schoolCol]).trim() : null,
    level: levelCol >= 0 ? int(row[levelCol]) : null,
    price: priceCol >= 0 ? int(row[priceCol]) : null,
    power: powerCol >= 0 ? int(row[powerCol]) : null,
    accuracy: accCol >= 0 ? int(row[accCol]) : null,
    element: elemCol >= 0 && row[elemCol] && !/^none$/i.test(row[elemCol]) ? row[elemCol] : null,
    range: targetCol >= 0 ? row[targetCol] : null,
    description: effectCol >= 0 ? row[effectCol] : null,
    source,
  }));
}

function isClassStatsTable(header) {
  return columnOf(header, /^class$/) >= 0 && columnOf(header, /^str$|strength/) >= 0 && columnOf(header, /^agi$|agility/) >= 0;
}

function readClassStatsTable(rows, source) {
  const header = rows[0];
  const clsCol = columnOf(header, /^class$/);
  const upgCol = columnOf(header, /upgrade/);
  const hpCol = columnOf(header, /^hp$/);
  const strCol = columnOf(header, /^str$|strength/);
  const agiCol = columnOf(header, /^agi$|agility/);
  const intCol = columnOf(header, /^int$|intelligence/);
  const vitCol = columnOf(header, /^vit$|vitality/);
  const lckCol = columnOf(header, /^lck$|^luck$/);
  const dmgCol = columnOf(header, /base dmg|damage/);
  const hitCol = columnOf(header, /base hit/);
  const hitLvCol = columnOf(header, /hit%\/lv/);
  const evaCol = columnOf(header, /base eva/);
  const mdCol = columnOf(header, /base m\.?d/);
  const mdLvCol = columnOf(header, /m\.?d\/lv/);
  const mpCol = columnOf(header, /starting mp/);
  return rows.slice(1).filter(r => r[clsCol]).map(row => ({
    name: row[clsCol].trim(),
    upgradesTo: upgCol >= 0 && row[upgCol] && row[upgCol] !== '-' ? row[upgCol].trim() : null,
    startingStats: {
      hp: hpCol >= 0 ? int(row[hpCol]) : null,
      str: strCol >= 0 ? int(row[strCol]) : null,
      agi: agiCol >= 0 ? int(row[agiCol]) : null,
      int: intCol >= 0 ? int(row[intCol]) : null,
      vit: vitCol >= 0 ? int(row[vitCol]) : null,
      luck: lckCol >= 0 ? int(row[lckCol]) : null,
      damage: dmgCol >= 0 ? int(row[dmgCol]) : null,
      baseHit: hitCol >= 0 ? int(row[hitCol]) : null,
      hitGrowth: hitLvCol >= 0 ? int(row[hitLvCol]) : null,
      baseEvade: evaCol >= 0 ? int(row[evaCol]) : null,
      baseMagicDefense: mdCol >= 0 ? int(row[mdCol]) : null,
      magicDefenseGrowth: mdLvCol >= 0 ? int(row[mdLvCol]) : null,
      startingMp: mpCol >= 0 ? int(row[mpCol]) : null,
    },
    source,
  }));
}

function isEncounterTable(header) {
  return columnOf(header, /slot 1/i) >= 0 && columnOf(header, /slot 2/i) >= 0;
}

function readEncounterTable(rows, source) {
  const header = rows[0];
  const idCol = columnOf(header, /map id|domain/i);
  const areaCol = columnOf(header, /area|dungeon|grid|region/i);
  const rateCol = columnOf(header, /rate/i);
  const slotCols = [];
  header.forEach((h, idx) => {
    const m = String(h).match(/slot\s*(\d+)/i);
    if (m) slotCols.push({ slot: int(m[1]), index: idx });
  });
  return rows.slice(1).filter(r => r[areaCol >= 0 ? areaCol : 0]).map(row => ({
    domainId: idCol >= 0 ? row[idCol].trim() : null,
    area: row[areaCol >= 0 ? areaCol : 0].trim(),
    rate: rateCol >= 0 ? int(row[rateCol]) : null,
    slots: slotCols.map(sc => row[sc.index]).filter(s => s && s !== '-'),
    source,
  }));
}

function isChestTable(header) {
  return columnOf(header, /chest id/i) >= 0 && columnOf(header, /contents/i) >= 0;
}

function readChestTable(rows, source) {
  const header = rows[0];
  const idCol = columnOf(header, /chest id/i);
  const mapCol = columnOf(header, /map|location/i);
  const coordCol = columnOf(header, /coord/i);
  const contCol = columnOf(header, /contents/i);
  const keyCol = columnOf(header, /mystic key|gate|req/i);
  return rows.slice(1).filter(r => r[idCol] && r[contCol]).map(row => ({
    chestId: row[idCol].replace(/`/g, '').trim(),
    mapName: mapCol >= 0 ? row[mapCol].trim() : null,
    coordinates: coordCol >= 0 ? row[coordCol].trim() : null,
    contents: row[contCol].trim(),
    requiresKey: keyCol >= 0 ? /^yes|mystic/i.test(row[keyCol]) : false,
    source,
  }));
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
  return isBestiary(header) || isSpellChart(header) || isSpellTable(header) || isEquipmentTable(header)
    || isMusicTable(header) || isSpellColumns(header) || isClassStatsTable(header) || isEncounterTable(header)
    || isChestTable(header);
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
 * Reads a "## ... Shop ..." section of a Markdown guide: "### 1. Rivertown" headings with
 * "* **Weapon Shop:** Dagger (10 G)" bullets and "* **Magic (Level 1 - 100 G each):**" lists.
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
  const spellTableRows = [];
  const equipment = [];
  const music = [];
  const spellNames = [];
  const classes = [];
  const encounters = [];
  const chests = [];
  const classKey = readClassKey(text);
  for (const rows of tableRows) {
    if (!rows.length) continue;
    if (isBestiary(rows[0])) enemies.push(...readBestiary(rows, source));
    else if (isSpellChart(rows[0])) spells.push(...readSpellChart(rows, source));
    else if (isSpellTable(rows[0])) spellTableRows.push(...readSpellTable(rows, source));
    else if (isEquipmentTable(rows[0])) equipment.push(...readEquipment(rows, source, classKey));
    else if (isMusicTable(rows[0])) music.push(...readMusic(rows, source));
    else if (isSpellColumns(rows[0])) spellNames.push(...readSpellColumns(rows));
    else if (isClassStatsTable(rows[0])) classes.push(...readClassStatsTable(rows, source));
    else if (isEncounterTable(rows[0])) encounters.push(...readEncounterTable(rows, source));
    else if (isChestTable(rows[0])) chests.push(...readChestTable(rows, source));
  }
  const descriptions = readSpellDescriptions(text);
  for (const spell of spells) spell.description = spellDescription(spell, descriptions);
  for (const sr of spellTableRows) {
    const existing = spells.find(s => slug(s.name) === slug(sr.name) && (!sr.school || !s.school || s.school === sr.school));
    if (existing) {
      for (const k of ['power', 'accuracy', 'element', 'range', 'description', 'price', 'level', 'school']) {
        if (sr[k] !== null && sr[k] !== undefined && (existing[k] === null || existing[k] === undefined)) existing[k] = sr[k];
      }
    } else {
      spells.push(sr);
    }
  }
  const shops = readShopSections(text, source);
  return { enemies, spells, equipment, music, shops, spellNames, classes, encounters, chests, problems: checkShopPrices(shops, equipment) };
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
