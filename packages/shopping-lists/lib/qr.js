'use strict';

/**
 * Zero-dependency ISO/IEC 18004 QR Code SVG generator (Byte mode, ECC Level L, Versions 1–10).
 * Generates crisp, scannable SVG QR codes for Mobile Form URLs & Google Docs/Drive links offline.
 */

// Total data codewords & ECC codewords per block (ECC Level L, single-block versions 1-5 + multi-block 6-10)
const VERSION_TABLE = [
  null,
  { total: 26, ecPerBlock: 7, blocks: [1, 19, 0, 0] },      // v1: 21x21, max 17 bytes
  { total: 44, ecPerBlock: 10, blocks: [1, 34, 0, 0] },     // v2: 25x25, max 32 bytes
  { total: 70, ecPerBlock: 15, blocks: [1, 55, 0, 0] },     // v3: 29x29, max 53 bytes
  { total: 100, ecPerBlock: 20, blocks: [1, 80, 0, 0] },    // v4: 33x33, max 78 bytes
  { total: 134, ecPerBlock: 26, blocks: [1, 108, 0, 0] },   // v5: 37x37, max 106 bytes
  { total: 172, ecPerBlock: 18, blocks: [2, 68, 0, 0] },    // v6: 41x41, max 134 bytes
  { total: 196, ecPerBlock: 20, blocks: [4, 39, 0, 0] },    // v7: 45x45, max 154 bytes
  { total: 242, ecPerBlock: 24, blocks: [2, 97, 0, 0] },    // v8: 49x49, max 192 bytes
  { total: 292, ecPerBlock: 30, blocks: [2, 116, 0, 0] },   // v9: 53x53, max 230 bytes
  { total: 346, ecPerBlock: 18, blocks: [2, 68, 2, 69] },   // v10: 57x57, max 271 bytes
];

const ALIGNMENT_POS = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

// GF(256) with primitive polynomial 0x11d
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecLen) {
  const gen = rsGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    for (let j = 0; j < ecLen; j++) {
      rem[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return rem;
}

function pickVersion(byteLen) {
  for (let v = 1; v <= 10; v++) {
    const spec = VERSION_TABLE[v];
    const dataCap = spec.blocks[0] * spec.blocks[1] + spec.blocks[2] * spec.blocks[3];
    const headerBytes = v <= 9 ? 2 : 3; // 4-bit mode + 8/16-bit count
    if (byteLen + headerBytes <= dataCap) return v;
  }
  throw new Error('QR payload exceeds version 10 capacity (271 bytes).');
}

function encodeCodewords(bytes, version) {
  const spec = VERSION_TABLE[version];
  const dataCap = spec.blocks[0] * spec.blocks[1] + spec.blocks[2] * spec.blocks[3];
  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };

  pushBits(0b0100, 4); // Byte mode
  pushBits(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) pushBits(b, 8);

  const maxBits = dataCap * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataWords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let w = 0;
    for (let j = 0; j < 8; j++) w = (w << 1) | bits[i + j];
    dataWords.push(w);
  }
  let padIdx = 0;
  while (dataWords.length < dataCap) {
    dataWords.push(padIdx % 2 === 0 ? 0xec : 0x11);
    padIdx++;
  }

  // Split into blocks & interleave
  const blocks = [];
  let offset = 0;
  for (let g = 0; g < 2; g++) {
    const count = spec.blocks[g * 2];
    const len = spec.blocks[g * 2 + 1];
    for (let b = 0; b < count; b++) {
      const slice = dataWords.slice(offset, offset + len);
      offset += len;
      blocks.push({ data: slice, ec: Array.from(rsEncode(slice, spec.ecPerBlock)) });
    }
  }

  const out = [];
  const maxDataLen = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const b of blocks) out.push(b.ec[i]);
  }
  return out;
}

function buildMatrix(text) {
  const bytes = Buffer.from(String(text || ''), 'utf8');
  const version = pickVersion(bytes.length);
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunc = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFunc = (r, c, dark) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    modules[r][c] = Boolean(dark);
    isFunc[r][c] = true;
  };

  const drawFinder = (top, left) => {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const dist = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        setFunc(top + dy, left + dx, dist !== 2 && dist !== 4);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const align = ALIGNMENT_POS[version];
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
      const cy = align[i];
      const cx = align[j];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFunc(cy + dy, cx + dx, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve format info & dark module
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      isFunc[8][i] = true;
      isFunc[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    isFunc[8][size - 1 - i] = true;
    isFunc[size - 1 - i][8] = true;
  }
  setFunc(size - 8, 8, true);

  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const vBits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = Boolean((vBits >>> i) & 1);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunc(a, b, bit);
      setFunc(b, a, bit);
    }
  }

  // Place data bits in zig-zag
  const codewords = encodeCodewords(bytes, version);
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (!isFunc[r][c] && bitIdx < totalBits) {
          const dark = Boolean((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1);
          modules[r][c] = dark;
          bitIdx++;
        }
      }
    }
  }

  // Apply mask 0: (r + c) % 2 === 0 and write ECC-L (01) + mask 0 (000) format bits
  const mask = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isFunc[r][c] && (r + c) % 2 === 0) {
        modules[r][c] = !modules[r][c];
      }
    }
  }

  // Format bits: ECC Level L = 01, mask = 000 -> data = 0b01000
  const fmtData = (0b01 << 3) | mask;
  let rem = fmtData;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const fmtBits = ((fmtData << 10) | rem) ^ 0x5412;
  const getFmt = (i) => Boolean((fmtBits >>> i) & 1);

  for (let i = 0; i <= 5; i++) modules[8][i] = getFmt(i);
  modules[8][7] = getFmt(6);
  modules[8][8] = getFmt(7);
  modules[7][8] = getFmt(8);
  for (let i = 9; i < 15; i++) modules[14 - i][8] = getFmt(i);

  for (let i = 0; i < 8; i++) modules[size - 1 - i][8] = getFmt(i);
  for (let i = 8; i < 15; i++) modules[8][size - 15 + i] = getFmt(i);

  return { size, modules, version };
}

function renderQrSvg(text, { margin = 3, dark = '#0f172a', light = '#ffffff', sizePx = 200 } = {}) {
  const { size, modules } = buildMatrix(text);
  const total = size + margin * 2;
  let pathData = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) {
        pathData += `M${c + margin},${r + margin}h1v1h-1z`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges">`
    + `<rect width="${total}" height="${total}" fill="${light}" rx="2"/>`
    + `<path d="${pathData}" fill="${dark}"/>`
    + `</svg>`;
}

module.exports = {
  buildMatrix,
  renderQrSvg,
};
