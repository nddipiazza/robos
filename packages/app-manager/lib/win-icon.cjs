'use strict';
// Windows icons for installed apps. A Start menu shortcut and a taskbar button need an .ico
// (or an .exe); without one they show the shared Electron/RobOS executable's icon, so every
// app looks the same. Each app ships icon.png (256×256, see scripts/app-manager/render-icons.cjs),
// and this turns it into an .ico with the sizes Windows asks for.
//
// The Start menu and search list do not scale a lone 256 px image down: an .ico holding only
// that shows as a blank page there. So the .ico carries 16–64 px images as 32-bit bitmaps (the
// form Windows' own small icons use) next to the 256 px PNG, which Vista and later read as is.
// Shortcut icons go in paths().icons, where Start menu search will load them (see paths.cjs).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SMALL_SIZES = [16, 20, 24, 32, 40, 48, 64];

function pngSize(png) {
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIGNATURE) || png.toString('latin1', 12, 16) !== 'IHDR') throw new Error('Not a PNG image');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** RGBA pixels of an 8-bit, non-interlaced PNG (grey, RGB, palette, grey+alpha or RGBA). */
function decodePng(png) {
  const { width, height } = pngSize(png);
  const depth = png[24], type = png[25], interlace = png[28];
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (depth !== 8 || interlace !== 0 || !channels) throw new Error('Unsupported PNG format');
  const parts = []; let palette = null, transparency = null;
  for (let at = 8; at + 8 <= png.length;) {
    const length = png.readUInt32BE(at), kind = png.toString('latin1', at + 4, at + 8), data = png.subarray(at + 8, at + 8 + length);
    if (kind === 'IDAT') parts.push(data);
    else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') transparency = data;
    else if (kind === 'IEND') break;
    at += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(parts)), stride = width * channels;
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rows.subarray(y * stride, (y + 1) * stride), up = y ? rows.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0, b = up ? up[x] : 0, c = up && x >= channels ? up[x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (filter !== 0) throw new Error('Corrupt PNG');
      out[x] = (line[x] + predictor) & 0xff;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels, d = i * 4;
    if (type === 6) rows.copy(rgba, d, s, s + 4);
    else if (type === 2) { rows.copy(rgba, d, s, s + 3); rgba[d + 3] = 255; }
    else if (type === 0) { rgba[d] = rgba[d + 1] = rgba[d + 2] = rows[s]; rgba[d + 3] = 255; }
    else if (type === 4) { rgba[d] = rgba[d + 1] = rgba[d + 2] = rows[s]; rgba[d + 3] = rows[s + 1]; }
    else {
      const index = rows[s];
      if (!palette || index * 3 + 2 >= palette.length) throw new Error('Corrupt PNG palette');
      palette.copy(rgba, d, index * 3, index * 3 + 3);
      rgba[d + 3] = transparency && index < transparency.length ? transparency[index] : 255;
    }
  }
  return { width, height, rgba };
}

/** Area-averaged downscale to size×size, weighting colour by alpha so edges do not darken. */
function resize({ width, height, rgba }, size) {
  const out = Buffer.alloc(size * size * 4), sx = width / size, sy = height / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0, area = 0;
    for (let py = Math.floor(y * sy); py < Math.min(height, Math.ceil((y + 1) * sy)); py++) {
      const wy = Math.min(py + 1, (y + 1) * sy) - Math.max(py, y * sy);
      for (let px = Math.floor(x * sx); px < Math.min(width, Math.ceil((x + 1) * sx)); px++) {
        const w = wy * (Math.min(px + 1, (x + 1) * sx) - Math.max(px, x * sx)), i = (py * width + px) * 4, alpha = rgba[i + 3] * w;
        r += rgba[i] * alpha; g += rgba[i + 1] * alpha; b += rgba[i + 2] * alpha; a += alpha; area += w;
      }
    }
    const o = (y * size + x) * 4;
    if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
    out[o + 3] = Math.round(a / area);
  }
  return out;
}

/** An .ico image entry body: 32-bit BGRA bitmap, bottom-up, with an all-clear AND mask. */
function bitmapEntry(rgba, size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); header.writeInt32LE(size, 4); header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const s = (y * size + x) * 4, d = ((size - 1 - y) * size + x) * 4;
    pixels[d] = rgba[s + 2]; pixels[d + 1] = rgba[s + 1]; pixels[d + 2] = rgba[s]; pixels[d + 3] = rgba[s + 3];
  }
  const maskStride = Math.ceil(size / 32) * 4;
  return Buffer.concat([header, pixels, Buffer.alloc(maskStride * size)]);
}

function icoFile(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  const entries = [], bodies = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8); entry.writeUInt32LE(offset, 12);
    entries.push(entry); bodies.push(data); offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...bodies]);
}

/** An .ico from a square PNG of at most 256 px: small bitmaps plus the PNG itself as the largest image. */
function pngToIco(png) {
  const { width, height } = pngSize(png);
  if (width > 256 || height > 256) throw new Error('Icons can be at most 256×256');
  const largest = { size: Math.max(width, height), data: png };
  let image;
  try { image = width === height ? decodePng(png) : null; } catch { image = null; }
  // A PNG this cannot read still makes a working (single image) icon.
  const small = image ? SMALL_SIZES.filter(size => size < width).map(size => ({ size, data: bitmapEntry(resize(image, size), size) })) : [];
  return icoFile([...small, largest]);
}

// Bumped when pngToIco's output changes, so every app gets a freshly named icon.
const FORMAT = 2;

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Writes <into>/<name>-<hash>.ico from <dir>/icon.png when needed and returns its path, or null
 * without a PNG. Windows caches shortcut icons by file path and does not notice the file
 * changing, so an icon that changes gets a new name: the hash covers the PNG and FORMAT.
 * Older icons of the same name in <into> are removed (one still open is left for next time).
 */
function ensureAppIco(dir, { into = dir, name = 'icon' } = {}) {
  const png = path.join(dir, 'icon.png');
  if (!fs.existsSync(png)) return null;
  const source = fs.readFileSync(png);
  const hash = crypto.createHash('sha1').update(`${FORMAT}:`).update(source).digest('hex').slice(0, 10);
  const ico = path.join(into, `${name}-${hash}.ico`);
  if (!fs.existsSync(ico)) {
    try {
      fs.mkdirSync(into, { recursive: true });
      fs.writeFileSync(`${ico}.tmp`, pngToIco(source));
      fs.renameSync(`${ico}.tmp`, ico);
    } catch { fs.rmSync(`${ico}.tmp`, { force: true }); return null; }
  }
  removeIcons(into, name, ico);
  // An icon.ico written next to icon.png by earlier versions of App Manager.
  if (into !== dir) { try { fs.rmSync(path.join(dir, 'icon.ico'), { force: true }); } catch {} }
  return ico;
}

/** Removes <into>/<name>-<hash>.ico files (and a plain <name>.ico), except `keep`. */
function removeIcons(into, name, keep = null) {
  const pattern = new RegExp(`^${escape(name)}(-[0-9a-f]{10})?\\.ico$`);
  let files = [];
  try { files = fs.readdirSync(into); } catch { return; }
  for (const file of files) {
    const full = path.join(into, file);
    if (pattern.test(file) && full !== keep) { try { fs.rmSync(full); } catch {} }
  }
}

module.exports = { pngToIco, pngSize, decodePng, resize, ensureAppIco, removeIcons };
