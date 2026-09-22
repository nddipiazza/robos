#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const https = require('https');
const { FLARE_CREATURE_SPRITES, FLARE_TILESETS, FLARE_ICONS } = require('../lib/flare-asset-catalog');

/**
 * Pure Node.js PNG encoder without native external dependencies
 */
function createPNG(width, height, rgbaBuffer) {
  function crc32(buf) {
    let table = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c;
    }
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    return (crc ^ (-1)) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type);
    const crcBuf = Buffer.concat([t, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcBuf), 0);
    return Buffer.concat([len, t, data, crc]);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // 8 bits per channel
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // Deflate compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace none

  const rawScanlines = [];
  for (let y = 0; y < height; y++) {
    rawScanlines.push(0); // filter: None
    const offset = y * width * 4;
    for (let x = 0; x < width * 4; x++) {
      rawScanlines.push(rgbaBuffer[offset + x]);
    }
  }

  const compressed = zlib.deflateSync(Buffer.from(rawScanlines));
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * Generate procedural isometric tile graphic (64x32 diamond)
 */
function generateIsometricTilePNG(r, g, b, isWall = false) {
  const width = 64;
  const height = 32;
  const buf = Buffer.alloc(width * height * 4, 0);

  const cx = 32;
  const cy = 16;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Diamond equation: |x - cx| / 32 + |y - cy| / 16 <= 1
      const dx = Math.abs(x - cx + 0.5) / 32.0;
      const dy = Math.abs(y - cy + 0.5) / 16.0;
      const inside = (dx + dy) <= 1.0;

      if (inside) {
        const idx = (y * width + x) * 4;
        let shade = 1.0 - (dy * 0.3) - (dx * 0.2);
        if (isWall) shade *= 0.8;
        buf[idx] = Math.min(255, Math.floor(r * shade));
        buf[idx + 1] = Math.min(255, Math.floor(g * shade));
        buf[idx + 2] = Math.min(255, Math.floor(b * shade));
        buf[idx + 3] = 255;
      }
    }
  }

  return createPNG(width, height, buf);
}

/**
 * Generate procedural icon graphic (32x32)
 */
function generateIconPNG(r, g, b) {
  const width = 32;
  const height = 32;
  const buf = Buffer.alloc(width * height * 4, 0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isBorder = (x === 0 || x === 31 || y === 0 || y === 31);
      if (isBorder) {
        buf[idx] = 40;
        buf[idx + 1] = 40;
        buf[idx + 2] = 48;
        buf[idx + 3] = 255;
      } else {
        const factor = 1.0 - ((x + y) / 64.0) * 0.4;
        buf[idx] = Math.floor(r * factor);
        buf[idx + 1] = Math.floor(g * factor);
        buf[idx + 2] = Math.floor(b * factor);
        buf[idx + 3] = 255;
      }
    }
  }

  return createPNG(width, height, buf);
}

/**
 * Generate creature sprite sheet placeholder (256x256)
 */
function generateSpriteSheetPNG(r, g, b) {
  const width = 256;
  const height = 256;
  const buf = Buffer.alloc(width * height * 4, 0);

  // 8 rows (directions) x 4 columns (frames)
  const cellW = 64;
  const cellH = 32;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      const startX = col * cellW;
      const startY = row * cellH;
      const cx = startX + cellW / 2;
      const cy = startY + cellH / 2;

      for (let y = startY; y < startY + cellH; y++) {
        for (let x = startX; x < startX + cellW; x++) {
          const dist = Math.hypot(x - cx, y - cy);
          if (dist < 12) {
            const idx = (y * width + x) * 4;
            buf[idx] = r;
            buf[idx + 1] = g;
            buf[idx + 2] = b;
            buf[idx + 3] = 255;
          }
        }
      }
    }
  }

  return createPNG(width, height, buf);
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function scaffoldAssets(baseDir) {
  console.log(`Scaffolding open-source game assets in ${baseDir}...`);

  // 1. Tilesets
  const dungeonTile = generateIsometricTilePNG(120, 125, 135, false);
  const grassTile = generateIsometricTilePNG(70, 140, 60, false);

  const dungeonPath = path.join(baseDir, FLARE_TILESETS.dungeon_stone.assetPath);
  ensureDir(dungeonPath);
  fs.writeFileSync(dungeonPath, dungeonTile);

  const grassPath = path.join(baseDir, FLARE_TILESETS.wilderness_grass.assetPath);
  ensureDir(grassPath);
  fs.writeFileSync(grassPath, grassTile);
  console.log('✔ Scaffolding Isometric Tilesets: dungeon_stone.png, wilderness_grass.png');

  // 2. Creature Sprites
  const creatureColors = {
    skeleton: [220, 220, 210],
    goblin: [60, 180, 80],
    orc: [140, 170, 70],
    zombie: [100, 130, 110],
    minotaur: [160, 100, 60],
    wolf: [90, 85, 95],
    hero_male_plate: [180, 200, 220],
    hero_mage_robe: [120, 80, 210],
    hero_rogue_leather: [130, 95, 60]
  };

  for (const [key, meta] of Object.entries(FLARE_CREATURE_SPRITES)) {
    const col = creatureColors[key] || [150, 150, 150];
    const spritePNG = generateSpriteSheetPNG(col[0], col[1], col[2]);
    const spPath = path.join(baseDir, meta.assetPath);
    ensureDir(spPath);
    fs.writeFileSync(spPath, spritePNG);
  }
  console.log(`✔ Scaffolding Creature Sprites: ${Object.keys(FLARE_CREATURE_SPRITES).length} sprite sheets.`);

  // 3. Icons
  const iconColors = {
    longsword: [180, 190, 210],
    shortbow: [150, 110, 60],
    dagger: [200, 200, 220],
    greatsword: [220, 180, 160],
    quarterstaff: [160, 120, 70],
    mace: [170, 170, 180],
    leather_armor: [130, 90, 50],
    chain_mail: [160, 170, 190],
    plate_armor: [210, 220, 240],
    robe: [90, 60, 180],
    shield: [190, 160, 100],
    potion_healing: [220, 40, 50],
    potion_mana: [40, 120, 240],
    scroll_magic_missile: [220, 210, 160],
    torch: [240, 140, 40],
    magic_missile: [180, 100, 255],
    fireball: [255, 90, 30],
    cure_wounds: [60, 220, 120],
    shield_spell: [100, 180, 240],
    sleep: [140, 140, 220],
    burning_hands: [255, 120, 40]
  };

  for (const [category, items] of Object.entries(FLARE_ICONS)) {
    for (const [name, relPath] of Object.entries(items)) {
      const col = iconColors[name] || [160, 160, 160];
      const iconPNG = generateIconPNG(col[0], col[1], col[2]);
      const fullPath = path.join(baseDir, relPath);
      ensureDir(fullPath);
      fs.writeFileSync(fullPath, iconPNG);
    }
  }
  console.log('✔ Scaffolding Item & Spell Icons: Weapons, Armor, Potions, Scrolls, Spells.');
  console.log('✔ Asset scaffolding completed successfully.');
}

async function main() {
  const args = process.argv.slice(2);
  const targetDir = args[0] || path.resolve(__dirname, '../../../games/crpg-realm');
  await scaffoldAssets(targetDir);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Error scaffolding assets:', err);
    process.exit(1);
  });
}

module.exports = { scaffoldAssets };
