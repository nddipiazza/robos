#!/usr/bin/env node
'use strict';

// Writes the practice fan site the harvester downloads from in the course demo.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { MAPS, LEGEND, PALETTES, makeTile } = require('./world');

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return ~c >>> 0;
}

function png(width, height, rgbAt) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgbAt(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b;
    }
  }
  const chunk = (type, data) => {
    const head = Buffer.alloc(4); head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function mapPng({ palette, rows }) {
  const pal = PALETTES[palette];
  const cache = {};
  const tile = ch => (cache[ch] = cache[ch] || makeTile(LEGEND[ch].kind, pal));
  return png(rows[0].length * 16, rows.length * 16, (x, y) => tile(rows[y >> 4][x >> 4])[y & 15][x & 15]);
}

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
body{margin:0;font:15px/1.45 Verdana,Geneva,sans-serif;background:#f4efe4;color:#2c2620}
header{background:#7a2e1d;color:#fff4dc;padding:12px 22px}header b{font-size:21px}nav{background:#4d1d13;padding:7px 22px}
nav a{color:#ffd98a;margin-right:16px}main{padding:14px 22px}.note{background:#fff3c4;border:1px solid #d8b95a;padding:6px 10px;font-size:13px}
table{border-collapse:collapse;margin:10px 0;background:#fff}th,td{border:1px solid #bda98a;padding:4px 10px;text-align:left}th{background:#e7d9bd}
h1{font-size:21px;margin:12px 0 6px}h2{font-size:17px;margin:14px 0 4px}a{color:#8a2f12}img.thumb{height:48px;image-rendering:pixelated;vertical-align:middle}
</style></head><body><header><b>The Ember Quest Archive</b> &mdash; a made-up fan site for practice</header>
<nav><a href="/">Home</a><a href="/atlas/">Map atlas</a><a href="/guide/weapons.html">Weapons</a><a href="/guide/bestiary.html">Monsters</a><a href="/guide/magic.html">Magic</a><a href="/guide/walkthrough.html">Walkthrough</a></nav>
<main>${body}</main></body></html>`;

const table = (head, rows) => `<table><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;

const WEAPON_HEAD = ['Name', 'Damage', 'Hit', 'Price', 'Equip'];
const ARMOR_HEAD = ['Armor name', 'Absorb', 'Weight', 'Price', 'Equip'];

const PAGES = {
  'guide/weapons.html': ['Ember Quest (Retro) Weapons and Armor', `<h1>Weapons</h1>${table(WEAPON_HEAD, [
    ['Copper Knife', 4, 5, '10', 'Warden, Hexer'], ['Iron Sword', 8, 10, '40', 'Warden'], ['Ember Blade', 14, 15, '120', 'Warden'],
  ])}<h1>Armor</h1>${table(ARMOR_HEAD, [['Cloth Tunic', 1, 0, '8', 'Warden, Hexer'], ['Leather Vest', 3, 2, '30', 'Warden']])}`],
  'guide/shopkeeper-notes.html': ['Ember Quest shopkeeper notes', `<h1>Notes from a player</h1><p>Prices as I remember them, not double checked.</p>${table(WEAPON_HEAD, [
    ['Iron Sword', 8, 10, '45', 'Warden'], ['Ember Blade', 14, 15, '120', 'Warden'],
  ])}`],
  'guide/anniversary-prices.html': ['Ember Quest Anniversary Edition prices', `<h1>Anniversary Edition</h1><p>The remake changed the shops.</p>${table(WEAPON_HEAD, [
    ['Iron Sword', 12, 20, '99', 'Warden'], ['Ember Blade', 30, 40, '500', 'Warden'],
  ])}`],
  'guide/bestiary.html': ['Ember Quest (Retro) Monster Chart', `<h1>Monsters</h1>${table(['Name', 'HP', 'Exp', 'Gold', 'Atk', 'Def', 'Weakness'], [
    ['Mossling', 12, 3, 5, 3, 0, 'Fire'], ['Cave Bat', 8, 4, 6, 4, 0, 'Wind'],
  ])}<h2>Bosses</h2>${table(['Boss', 'HP', 'Exp', 'Gold', 'Atk', 'Def', 'Weakness'], [['Cinder Wyrm', 40, 50, 100, 6, 2, 'Water']])}`],
  'guide/magic.html': ['Ember Quest (Retro) Magic Table', `<h1>Spells</h1>${table(['Spell', 'School', 'Level', 'Price', 'Power', 'Accuracy', 'Effect'], [
    ['Spark', 'Black', 1, 20, 8, 24, 'Burns one enemy'], ['Soothe', 'White', 1, 20, 10, 0, 'Heals one ally'],
  ])}`],
  'guide/chests.html': ['Ember Quest (Retro) Treasure List', `<h1>Treasure chests</h1>${table(['Chest ID', 'Map', 'Coordinates', 'Contents'], [
    ['C1', 'Ashford Town', '(12, 3)', 'Ember Tonic'], ['C2', 'Emberfall Cave', '(3, 3)', '60 gold'],
  ])}`],
  'guide/walkthrough.html': ['Ember Quest (Retro) Walkthrough', `<h1>Walkthrough</h1>
<p>You start in Ashford Town with 50 gold. Buy the Iron Sword at the shop in the northwest corner before you leave.</p>
<p>Open the chest by the east wall for an Ember Tonic, then follow the road east to Emberfall Cave.</p>
<p>Mosslings wander the cave. The Cinder Wyrm waits at the altar deep inside. Defeat it to finish the game.</p>`],
};

function build(outDir) {
  fs.mkdirSync(path.join(outDir, 'atlas'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'guide'), { recursive: true });
  const names = Object.keys(MAPS);
  for (const name of names) fs.writeFileSync(path.join(outDir, 'atlas', name), mapPng(MAPS[name]));
  fs.writeFileSync(path.join(outDir, 'atlas', 'index.html'), page('Map atlas', `<h1>Map atlas</h1>
<p>Every map we have, from every game on the site. Click a name for the full picture.</p>
${table(['Preview', 'Game', 'Map file'], names.map(n => [`<img class="thumb" alt="" src="${n}">`, n.split('-')[0], `<a href="${n}">${n}</a>`]))}`));
  for (const [file, [title, body]] of Object.entries(PAGES)) fs.writeFileSync(path.join(outDir, file), page(title, body));
  fs.writeFileSync(path.join(outDir, 'index.html'), page('The Ember Quest Archive', `<p class="note">Ember Quest is not a real game. Everything here was invented for a RobOS course.</p>
<h1>Welcome, traveler</h1><p>Maps, shop prices and monster charts for the 1989 classic that never existed.</p>
<ul><li><a href="/atlas/">Map atlas</a></li>${Object.entries(PAGES).map(([f, [t]]) => `<li><a href="/${f}">${t}</a></li>`).join('')}</ul>`));
  fs.writeFileSync(path.join(outDir, 'robots.txt'), 'User-agent: *\nAllow: /\nCrawl-delay: 1\n');
  return { guidePages: Object.keys(PAGES) };
}

module.exports = { build, png, PAGES };

if (require.main === module) {
  const out = path.resolve(process.argv[2] || 'practice-site');
  build(out);
  console.log(`Wrote the practice site to ${out}`);
}
