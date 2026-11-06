'use strict';
// Windows icons for installed apps. A Start menu shortcut and a taskbar button need an .ico
// (or an .exe); without one they show the shared Electron/RobOS executable's icon, so every
// app looks the same. Each app ships icon.png (256×256, see scripts/app-manager/render-icons.cjs),
// and this wraps it in an .ico. Windows Vista and later read PNG images inside .ico files.
const fs = require('node:fs');
const path = require('node:path');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngSize(png) {
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIGNATURE) || png.toString('latin1', 12, 16) !== 'IHDR') throw new Error('Not a PNG image');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** An .ico holding one PNG image (sizes of 256 and above are stored as 0, per the format). */
function pngToIco(png) {
  const { width, height } = pngSize(png);
  if (width > 256 || height > 256) throw new Error('Icons can be at most 256×256');
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = width >= 256 ? 0 : width; entry[1] = height >= 256 ? 0 : height;
  entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8); entry.writeUInt32LE(header.length + entry.length, 12);
  return Buffer.concat([header, entry, png]);
}

/** Writes <dir>/icon.ico from <dir>/icon.png when needed. Returns its path, or null without a PNG. */
function ensureAppIco(dir) {
  const ico = path.join(dir, 'icon.ico'), png = path.join(dir, 'icon.png');
  if (fs.existsSync(ico)) return ico;
  if (!fs.existsSync(png)) return null;
  try {
    fs.writeFileSync(`${ico}.tmp`, pngToIco(fs.readFileSync(png)));
    fs.renameSync(`${ico}.tmp`, ico);
    return ico;
  } catch { fs.rmSync(`${ico}.tmp`, { force: true }); return null; }
}

module.exports = { pngToIco, pngSize, ensureAppIco };
