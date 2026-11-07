'use strict';
// Icon files for "(From Source)" shortcuts, made from each app's packages/<id>/icon.png
// (256×256, rendered by scripts/app-manager/render-icons.cjs) with no native tools:
//   Windows  .ico with 16–64 px bitmaps plus the 256 px PNG (see app-manager/lib/win-icon.cjs)
//   GNOME    hicolor PNGs at every size the dock, app grid and Alt+Tab ask for
//   macOS    .icns holding PNGs at 16–256 px, including the @2x variants
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { pngToIco, pngSize, decodePng, resize } = require('../../packages/app-manager/lib/win-icon.cjs');

const HICOLOR_SIZES = [16, 22, 24, 32, 48, 64, 96, 128, 256];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8), tail = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0); head.write(type, 4, 'latin1');
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}
/** An RGBA PNG of size×size pixels. */
function encodePng(rgba, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** PNGs of the source at each requested size; sizes above the source's are skipped (never upscaled). */
function scaledPngs(png, sizes) {
  const { width, height } = pngSize(png);
  const image = width === height ? decodePng(png) : null;
  const out = new Map();
  for (const size of sizes) {
    if (size === width && size === height) out.set(size, png);
    else if (image && size < width) out.set(size, encodePng(resize(image, size), size));
  }
  return out;
}

/** An .icns built from PNG entries (macOS 10.7+ reads these directly). */
function pngToIcns(png) {
  const types = [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic11', 32], ['ic12', 64], ['ic13', 256]];
  const pngs = scaledPngs(png, [...new Set(types.map(([, size]) => size))]);
  const entries = types.filter(([, size]) => pngs.has(size)).map(([type, size]) => {
    const head = Buffer.alloc(8); head.write(type, 0, 'latin1'); head.writeUInt32BE(8 + pngs.get(size).length, 4);
    return Buffer.concat([head, pngs.get(size)]);
  });
  const head = Buffer.alloc(8); head.write('icns', 0, 'latin1');
  head.writeUInt32BE(8 + entries.reduce((sum, entry) => sum + entry.length, 0), 4);
  return Buffer.concat([head, ...entries]);
}

/**
 * Writes <into>/<name>-<hash>.ico from a PNG and returns its path. Windows caches shortcut
 * icons by path and never notices the file changing, so a changed icon gets a new name.
 * Older icons with the same name are removed.
 */
function ensureIco(pngPath, into, name) {
  const source = fs.readFileSync(pngPath);
  const hash = crypto.createHash('sha1').update('ico2:').update(source).digest('hex').slice(0, 10);
  const ico = path.join(into, `${name}-${hash}.ico`);
  if (!fs.existsSync(ico)) {
    fs.mkdirSync(into, { recursive: true });
    fs.writeFileSync(`${ico}.tmp`, pngToIco(source));
    fs.renameSync(`${ico}.tmp`, ico);
  }
  removeIcos(into, name, ico);
  return ico;
}
function removeIcos(into, name, keep = null) {
  let files = [];
  try { files = fs.readdirSync(into); } catch { return; }
  for (const file of files) {
    const full = path.join(into, file);
    if (file.startsWith(`${name}-`) && /^[0-9a-f]{10}\.ico$/.test(file.slice(name.length + 1)) && full !== keep) {
      try { fs.rmSync(full); } catch {}
    }
  }
}

module.exports = { HICOLOR_SIZES, encodePng, scaledPngs, pngToIcns, ensureIco, removeIcos };
