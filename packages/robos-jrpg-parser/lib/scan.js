'use strict';

// Inventories one or more folders a person collected: hashes each file, works
// out what it is, and flags pages that describe another edition of the game.
// Reads local files only; nothing here touches the network.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { decodeHtml, htmlTitle, markdownTitle, savedFromUrl } = require('./html');

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const AUDIO_EXT = new Set(['.mp3', '.ogg', '.flac', '.wav', '.nsf', '.m4a', '.opus']);
const PAGE_EXT = new Set(['.html', '.htm', '.txt', '.md']);

// First match wins, so "select class" is not read as a sprite sheet.
const IMAGE_ROLES = [
  ['class-select', /\b(select|party|class)\b/],
  ['equip-screen', /\bequip/],
  ['shop-screen', /\b(shop|store|inn)\b/],
  ['battle-screen', /\b(battle|combat|fight)/],
  ['menu-screen', /\b(menu|status|title|subscreen)\b/],
  ['world-map', /\b(world|overworld)/],
  ['area-map', /\b(dungeon|cave|castle|town|floor|tower|shrine|temple|map)\b/],
  ['sprite-sheet', /\b(sprite|character|monster|enem|bestiary|boss)/],
  ['logo', /\b(logo|icon)\b/],
];

// File names marking a port, for a person collecting from a site that covers every release.
const PORT_NAMES = /\b(gba|psx|ps1|psp|wsc|wonderswan|3ds|ios|android|snes|mobile)\b/i;
// A page this large is an index of a whole site, not a guide to one game.
const MAX_PAGE_BYTES = 2 * 1024 * 1024;

// Page titles naming a remake or a mod: its stats and prices are not the base game's.
const OTHER_EDITION = /\b(mod|hack|randomi[sz]er)\b|dawn of souls|pixel remaster|anniversary edition/i;
const FORUM_TITLE = /let'?s play|\bforums?\b|\bthread\b/i;
const GUIDE_TITLE = /walkthrough|\bfaq\b|\bguide\b|strategy|\bwiki\b/i;

function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString('latin1', 0, 3) === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const kind = b.toString('latin1', 12, 16);
    if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  }
  return null;
}

function fileWords(name) {
  return name.replace(/\.[^.]+$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function imageRole(name) {
  const words = fileWords(name);
  for (const [role, re] of IMAGE_ROLES) if (re.test(words)) return role;
  return 'unknown';
}

function describePage(file) {
  if (fs.statSync(file).size > MAX_PAGE_BYTES) {
    return { title: path.basename(file), role: 'document', use: false, note: 'Too large to be a guide to one game, so it looks like a site index. Set "use": true in a manifest to read it.' };
  }
  const text = decodeHtml(fs.readFileSync(file));
  const title = (/\.md$/i.test(file) ? markdownTitle(text) : htmlTitle(text)) || path.basename(file);
  const out = { title, savedFrom: savedFromUrl(text) };
  if (OTHER_EDITION.test(title)) {
    out.use = false;
    out.note = `Title names another edition or a mod ("${title}"), so its stats and prices are not used.`;
  }
  out.role = FORUM_TITLE.test(title) ? 'forum-thread' : GUIDE_TITLE.test(title) ? 'walkthrough' : 'document';
  return out;
}

function walk(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // A browser's "Save page as" folder holds that page's scripts and styles.
      if (!entry.name.endsWith('_files')) walk(full, found);
    } else if (entry.isFile()) found.push(full);
  }
  return found;
}

/**
 * @param {string[]} dirs folders or single files to read
 * @param {{ files?: Object }} [manifest] per-file overrides by file name: { role, use, note }
 * @param {{ edition?: string }} [opts] the edition being parsed, so screenshots of its ports are skipped
 */
function scan(dirs, manifest = {}, { edition = '' } = {}) {
  const overrides = manifest.files || {};
  const seen = new Map();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) throw new Error(`Not found: ${dir}`);
    const single = fs.statSync(dir).isFile();
    for (const file of single ? [dir] : walk(dir)) {
      const ext = path.extname(file).toLowerCase();
      const name = single ? path.basename(file) : path.relative(dir, file);
      const sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (seen.has(sha256)) continue;
      const entry = { name, path: file, sha256, bytes: fs.statSync(file).size, use: true };
      if (IMAGE_EXT.has(ext)) {
        entry.kind = 'image';
        entry.role = imageRole(path.basename(file));
        entry.size = imageSize(file);
        const port = fileWords(path.basename(file)).match(PORT_NAMES);
        if (port && !new RegExp(`\\b${port[1]}\\b`, 'i').test(edition)) {
          entry.use = false;
          entry.note = `The file name marks the ${port[1].toUpperCase()} port.`;
        }
      } else if (AUDIO_EXT.has(ext)) {
        entry.kind = 'audio';
        entry.role = 'music';
      } else if (PAGE_EXT.has(ext)) {
        entry.kind = 'page';
        Object.assign(entry, describePage(file));
      } else {
        entry.kind = 'other';
        entry.role = 'unknown';
        entry.use = false;
        if (ext === '.pdf') entry.note = 'PDFs are not read yet.';
      }
      Object.assign(entry, overrides[name] || overrides[path.basename(file)] || {});
      seen.set(sha256, entry);
    }
  }
  return [...seen.values()];
}

module.exports = { scan, imageSize, imageRole, fileWords };
