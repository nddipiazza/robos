#!/usr/bin/env node
'use strict';

// Turns what the parser read into a playable folder: cuts each collected map into
// 16x16 tiles, numbers the different tiles, and copies in the parsed numbers.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { LEGEND, PALETTES, GAME, MAPS, makeTile } = require('./world');

function readPng(file) {
  const b = fs.readFileSync(file);
  const width = b.readUInt32BE(16);
  const height = b.readUInt32BE(20);
  const parts = [];
  for (let o = 8; o < b.length;) {
    const len = b.readUInt32BE(o);
    if (b.toString('latin1', o + 4, o + 8) === 'IDAT') parts.push(b.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const stride = width * 3 + 1;
  for (let y = 0; y < height; y++) if (raw[y * stride] !== 0) throw new Error(`${file}: only the practice site's unfiltered PNGs can be read`);
  return { width, height, at: (x, y) => raw.subarray(y * stride + 1 + x * 3, y * stride + 1 + x * 3 + 3) };
}

function tileHash(png, tx, ty) {
  const h = crypto.createHash('sha1');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) h.update(png.at(tx * 16 + x, ty * 16 + y));
  return h.digest('hex');
}

/** The notes a person writes after looking at each kind of tile: what it is and whether you can walk on it. */
function tileNotes() {
  const notes = {};
  for (const { kind, walkable, special } of Object.values(LEGEND)) {
    const px = makeTile(kind, PALETTES.ember);
    const h = crypto.createHash('sha1');
    for (const row of px) for (const rgb of row) h.update(Buffer.from(rgb));
    notes[h.digest('hex')] = { kind, walkable, special: special || null };
  }
  return notes;
}

function sliceMap(file, notes, tileIds, tiles) {
  const png = readPng(file);
  const grid = [];
  for (let ty = 0; ty < png.height / 16; ty++) {
    const row = [];
    for (let tx = 0; tx < png.width / 16; tx++) {
      const hash = tileHash(png, tx, ty);
      if (!notes[hash]) throw new Error(`${file}: tile (${tx}, ${ty}) is not in the notes`);
      if (!tileIds.has(hash)) {
        tileIds.set(hash, tiles.length);
        tiles.push({ id: tiles.length, ...notes[hash], sample: { file: path.basename(file), x: tx, y: ty } });
      }
      row.push(tileIds.get(hash));
    }
    grid.push(row);
  }
  return grid;
}

const placeName = file => path.basename(file, '.png').split('-')[1].replace(/([a-z])([A-Z])/g, '$1 $2');

function buildGame(collection, parsedFile, outDir) {
  const parsed = JSON.parse(fs.readFileSync(parsedFile, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  const notes = tileNotes();
  const tileIds = new Map();
  const tiles = [];
  const maps = {};
  for (const source of parsed.sources.filter(s => s.role === 'area-map' && s.use !== false)) {
    const file = path.join(collection, source.name);
    fs.copyFileSync(file, path.join(outDir, path.basename(file)));
    maps[placeName(file)] = { image: path.basename(file), grid: sliceMap(file, notes, tileIds, tiles) };
  }
  const data = {
    title: parsed.game.title,
    startingGold: GAME.startingGold,
    start: { map: placeName(GAME.start.map), x: GAME.start.x, y: GAME.start.y },
    maps,
    tiles,
    weapons: parsed.equipment.filter(e => e.kind === 'weapon').map(({ name, damage, price }) => ({ name, damage, price })),
    enemies: parsed.enemies.map(({ name, hp, attack, defense, gold, xp, boss }) => ({ name, hp, attack, defense, gold, xp, boss: !!boss })),
    chests: parsed.chests.map(({ mapName, coordinates, contents }) => {
      const [x, y] = coordinates.match(/\d+/g).map(Number);
      return { map: mapName, x, y, contents };
    }),
  };
  fs.writeFileSync(path.join(outDir, 'game-data.json'), JSON.stringify(data, null, 1) + '\n');
  const gameDir = path.join(__dirname, 'game');
  for (const name of fs.readdirSync(gameDir)) fs.copyFileSync(path.join(gameDir, name), path.join(outDir, name));
  return data;
}

module.exports = { buildGame, readPng, tileNotes };

if (require.main === module) {
  const [collection, parsedFile, outDir] = process.argv.slice(2).map(p => path.resolve(p));
  const data = buildGame(collection, parsedFile, outDir);
  console.log(`Cut ${Object.keys(data.maps).length} maps into ${data.tiles.length} different tiles and wrote ${outDir}`);
}
