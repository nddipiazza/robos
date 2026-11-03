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

/** Everything chart-shaped in one page. */
function readCharts(tableRows, text, source) {
  const enemies = [];
  const spells = [];
  for (const rows of tableRows) {
    if (!rows.length) continue;
    if (isBestiary(rows[0])) enemies.push(...readBestiary(rows, source));
    else if (isSpellChart(rows[0])) spells.push(...readSpellChart(rows, source));
  }
  const descriptions = readSpellDescriptions(text);
  for (const spell of spells) spell.description = spellDescription(spell, descriptions);
  return { enemies, spells };
}

module.exports = { readCharts, readBestiary, readSpellChart, readSpellName, readSpellDescriptions, slug };
