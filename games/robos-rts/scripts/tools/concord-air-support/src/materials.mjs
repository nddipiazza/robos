// Deterministic procedural PNG encoder & Aurelian Concord PBR material library
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(typeStr, dataBuf) {
  const typeBuf = Buffer.from(typeStr, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(dataBuf.length, 0);
  const crcInput = Buffer.concat([typeBuf, dataBuf]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, dataBuf, crcBuf]);
}

export function encodeDeterministicPNG(width, height, rgbaBytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // 8-bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // non-interlaced

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (stride + 1);
    raw[rowOffset] = 0; // filter type None for crisp determinism
    rgbaBytes.copy(raw, rowOffset + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, {
    level: 9,
    memLevel: 8,
    strategy: zlib.constants.Z_DEFAULT_STRATEGY,
  });

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function hash2D(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function makeIvoryArmorTexture(size = 64) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Subtle architectural micro-seams & brushed sheen (neutral high-value so baseColorFactor controls hue)
      const seamX = (x % 16 === 0) ? -0.055 : (x % 16 === 1 ? 0.025 : 0);
      const seamY = (y % 16 === 0) ? -0.045 : (y % 16 === 1 ? 0.020 : 0);
      const brush = (hash2D(x >> 1, y, 11) - 0.5) * 0.022;
      const grad = Math.sin(u * Math.PI) * 0.018 + Math.sin(v * Math.PI) * 0.018;
      const val = Math.max(0.82, Math.min(1.0, 0.965 + seamX + seamY + brush + grad));
      const idx = (y * size + x) * 4;
      buf[idx + 0] = Math.round(val * 255);
      buf[idx + 1] = Math.round((val * 0.995) * 255);
      buf[idx + 2] = Math.round((val * 0.985) * 255);
      buf[idx + 3] = 255;
    }
  }
  return encodeDeterministicPNG(size, size, buf);
}

function makeGoldFiligreeTexture(size = 64) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const sheen = Math.sin(u * Math.PI * 2) * 0.03;
      const grain = (hash2D(x, y >> 2, 37) - 0.5) * 0.025;
      const groove = (y % 16 === 0) ? -0.05 : 0;
      const val = Math.max(0.84, Math.min(1.0, 0.97 + sheen + grain + groove));
      const idx = (y * size + x) * 4;
      buf[idx + 0] = Math.round(val * 255);
      buf[idx + 1] = Math.round(val * 252);
      buf[idx + 2] = Math.round(val * 244);
      buf[idx + 3] = 255;
    }
  }
  return encodeDeterministicPNG(size, size, buf);
}

function makeTealEnergyTexture(size = 64) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.min(1, Math.hypot(dx, dy) * 1.6);
      const core = 1.0 - r * 0.22;
      const idx = (y * size + x) * 4;
      buf[idx + 0] = Math.round(Math.min(255, (0.78 + (1 - r) * 0.22) * 255));
      buf[idx + 1] = Math.round(Math.min(255, core * 255));
      buf[idx + 2] = Math.round(Math.min(255, (0.92 + (1 - r) * 0.08) * 255));
      buf[idx + 3] = 255;
    }
  }
  return encodeDeterministicPNG(size, size, buf);
}

// Material indices shared consistently across all 4 Aurelian Concord assets
export const MAT = {
  IVORY_HULL: 0,
  GOLD_TRIM: 1,
  TEAL_GLOW: 2,
  TEAM_COLOR: 3,
  DARK_ALLOY: 4,
  CORE_BRIGHT: 5,
};

export function createConcordMaterialLibrary() {
  const textures = [
    { name: 'ivory_armor_tex', mimeType: 'image/png', bytes: makeIvoryArmorTexture(64) },
    { name: 'gold_trim_tex', mimeType: 'image/png', bytes: makeGoldFiligreeTexture(64) },
    { name: 'teal_energy_tex', mimeType: 'image/png', bytes: makeTealEnergyTexture(64) },
  ];

  const materials = [
    {
      // 0: IvoryHull — Original Aurelian warm ivory metallic hull
      name: 'IvoryHull',
      alphaMode: 'OPAQUE',
      doubleSided: false,
      pbrMetallicRoughness: {
        baseColorFactor: [0.93, 0.90, 0.83, 1.0],
        baseColorTexture: { index: 0 },
        metallicFactor: 0.45,
        roughnessFactor: 0.34,
      },
    },
    {
      // 1: GoldTrim — Warm Aurelian gold trims & rings
      name: 'GoldTrim',
      alphaMode: 'OPAQUE',
      doubleSided: false,
      pbrMetallicRoughness: {
        baseColorFactor: [0.94, 0.73, 0.27, 1.0],
        baseColorTexture: { index: 1 },
        metallicFactor: 0.88,
        roughnessFactor: 0.24,
      },
      emissiveFactor: [0.05, 0.035, 0.008],
    },
    {
      // 2: TealGlow — Recessed teal energy highlights & conduits
      name: 'TealGlow',
      alphaMode: 'OPAQUE',
      doubleSided: false,
      pbrMetallicRoughness: {
        baseColorFactor: [0.12, 0.88, 0.84, 1.0],
        baseColorTexture: { index: 2 },
        metallicFactor: 0.12,
        roughnessFactor: 0.20,
      },
      emissiveTexture: { index: 2 },
      emissiveFactor: [0.08, 0.78, 0.75],
    },
    {
      // 3: TeamColor — Moderate opaque TeamColor panels (untextured for clean runtime tinting)
      name: 'TeamColor',
      alphaMode: 'OPAQUE',
      doubleSided: false,
      pbrMetallicRoughness: {
        baseColorFactor: [0.15, 0.43, 0.86, 1.0],
        metallicFactor: 0.24,
        roughnessFactor: 0.40,
      },
    },
    {
      // 4: DarkAlloy — Recessed mechanical framing, landing cradle deck & vents
      name: 'DarkAlloy',
      alphaMode: 'OPAQUE',
      doubleSided: false,
      pbrMetallicRoughness: {
        baseColorFactor: [0.20, 0.23, 0.28, 1.0],
        metallicFactor: 0.74,
        roughnessFactor: 0.44,
      },
    },
    {
      // 5: CoreBright — Suspended luminous cores, prisms & active beam origin lens
      name: 'CoreBright',
      alphaMode: 'OPAQUE',
      doubleSided: false,
      pbrMetallicRoughness: {
        baseColorFactor: [0.52, 0.98, 0.94, 1.0],
        baseColorTexture: { index: 2 },
        metallicFactor: 0.15,
        roughnessFactor: 0.14,
      },
      emissiveTexture: { index: 2 },
      emissiveFactor: [0.28, 0.96, 0.90],
    },
  ];

  return { textures, materials };
}
