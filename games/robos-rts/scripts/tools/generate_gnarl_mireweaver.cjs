'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Deterministic PRNG & procedural noise helpers
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoiseTile(u, v, freq, seed) {
  const x = u * freq, y = v * freq;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const wrap = (n) => ((n % freq) + freq) % freq;
  const n00 = hash2(wrap(x0), wrap(y0), seed);
  const n10 = hash2(wrap(x0 + 1), wrap(y0), seed);
  const n01 = hash2(wrap(x0), wrap(y0 + 1), seed);
  const n11 = hash2(wrap(x0 + 1), wrap(y0 + 1), seed);
  return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
}

function fbmTile(u, v, baseFreq, octaves, seed) {
  let sum = 0, amp = 0.5, norm = 0, freq = baseFreq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoiseTile(u, v, freq, seed + i * 31);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function worleyTile(u, v, cells, seed) {
  const x = u * cells, y = v * cells;
  const ix = Math.floor(x), iy = Math.floor(y);
  let d1 = 99, d2 = 99;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ((ix + dx) % cells + cells) % cells;
      const cy = ((iy + dy) % cells + cells) % cells;
      const px = ix + dx + 0.15 + 0.7 * hash2(cx, cy, seed);
      const py = iy + dy + 0.15 + 0.7 * hash2(cx, cy, seed + 97);
      const d = Math.hypot(x - px, y - py);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return { f1: d1, edge: Math.min(1, (d2 - d1) * 1.8) };
}

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// Zero-dependency deterministic PNG encoder
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePNG(w, h, rgba) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const rowOff = y * stride;
    raw[rowOff] = 1; // Sub filter
    for (let x = 0; x < w * 4; x++) {
      const cur = rgba[y * w * 4 + x];
      const left = x >= 4 ? rgba[y * w * 4 + x - 4] : 0;
      raw[rowOff + 1 + x] = (cur - left) & 0xFF;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function normalFromHeight(hField, w, h, strength) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w, xp = (x + 1) % w;
      const ym = Math.max(0, y - 1), yp = Math.min(h - 1, y + 1);
      const dx = (hField[y * w + xp] - hField[y * w + xm]) * strength;
      const dy = (hField[yp * w + x] - hField[ym * w + x]) * strength;
      const len = Math.hypot(dx, dy, 1) || 1;
      const idx = (y * w + x) * 4;
      out[idx] = Math.round(clamp((-dx / len) * 0.5 + 0.5, 0, 1) * 255);
      out[idx + 1] = Math.round(clamp((-dy / len) * 0.5 + 0.5, 0, 1) * 255);
      out[idx + 2] = Math.round(clamp((1 / len) * 0.5 + 0.5, 0, 1) * 255);
      out[idx + 3] = 255;
    }
  }
  return encodePNG(w, h, out);
}

// Build procedural organic chitin, frill membrane, bioluminescence & TeamColor textures
function buildTextures() {
  const S = 256;
  const plumAlb = new Uint8Array(S * S * 4);
  const plumORM = new Uint8Array(S * S * 4);
  const plumH = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const v = y / (S - 1);
    const bevel = smoothstep(0.0, 0.10, v) * (1 - 0.55 * smoothstep(0.92, 1.0, v));
    const rim = smoothstep(0.76, 0.90, v) * (1 - smoothstep(0.91, 0.99, v));
    const suture = 1 - smoothstep(0.0, 0.13, v);
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const cell = worleyTile(u, v, 10, 41);
      const micro = worleyTile(u, v, 24, 109);
      const grain = fbmTile(u, v, 8, 4, 7);
      const stria = 0.5 + 0.5 * Math.sin((v * 18 + grain * 2.2) * Math.PI * 2);
      const scute = smoothstep(0.06, 0.34, cell.edge) * (0.72 + 0.28 * smoothstep(0.04, 0.28, micro.edge));
      const h = bevel * (0.48 * scute + 0.24 * grain + 0.14 * stria + 0.22 * rim);
      plumH[y * S + x] = h;

      // Rich organic plum chitin palette (#1C0924 crevices -> #542061 mid -> #9A52A6 bevel highlights)
      let r = lerp(24, 92, h) + rim * 58 + grain * 18 - suture * 18;
      let g = lerp(8, 34, h) + rim * 28 + scute * 10 - suture * 8;
      let b = lerp(34, 108, h) + rim * 60 + grain * 22 - suture * 20;
      // Subtle iridescent violet-berry flecks on raised scutes
      if (cell.f1 < 0.26) {
        const spot = (1 - cell.f1 / 0.26) * bevel;
        r += spot * 24; g += spot * 6; b += spot * 28;
      }
      const i4 = (y * S + x) * 4;
      plumAlb[i4] = clamp(Math.round(r), 0, 255);
      plumAlb[i4 + 1] = clamp(Math.round(g), 0, 255);
      plumAlb[i4 + 2] = clamp(Math.round(b), 0, 255);
      plumAlb[i4 + 3] = 255;

      const ao = clamp(0.32 + 0.68 * bevel * (0.55 + 0.45 * scute), 0.22, 1);
      const rough = clamp(0.74 - 0.42 * scute * bevel - 0.12 * rim + 0.10 * (1 - stria), 0.22, 0.88);
      const metal = clamp(0.04 + 0.14 * rim + 0.08 * scute, 0, 0.26);
      plumORM[i4] = Math.round(ao * 255);
      plumORM[i4 + 1] = Math.round(rough * 255);
      plumORM[i4 + 2] = Math.round(metal * 255);
      plumORM[i4 + 3] = 255;
    }
  }

  // Raised Mint Frill fluted bioluminescent membrane
  const frillAlb = new Uint8Array(S * S * 4);
  const frillEmi = new Uint8Array(S * S * 4);
  const frillH = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const v = y / (S - 1); // 0 = plum collar root, 1 = scalloped outer mint margin
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const flute = 0.5 + 0.5 * Math.cos(u * 16 * Math.PI);
      const n1 = fbmTile(u, v, 6, 4, 211);
      const veinWave = Math.abs(Math.sin((u * 14 + (n1 - 0.5) * 0.9) * Math.PI));
      const primaryVein = Math.pow(1 - veinWave, 5.0);
      const cell = worleyTile(u, v * 0.8, 12, 313);
      const capVein = Math.pow(1 - clamp(cell.edge, 0, 1), 3.2) * smoothstep(0.15, 0.85, v);
      const edgeGlow = smoothstep(0.74, 0.96, v);
      const rootBlend = smoothstep(0.0, 0.24, v);
      const lum = clamp(0.28 + 0.48 * rootBlend + 0.34 * primaryVein + 0.28 * capVein + 0.32 * edgeGlow, 0, 1.35);
      frillH[y * S + x] = 0.45 * flute + 0.35 * primaryVein + 0.20 * capVein;

      const r = lerp(58, lerp(36, 170, clamp(lum - 0.25, 0, 1)), rootBlend);
      const g = lerp(22, lerp(192, 255, clamp(lum - 0.15, 0, 1)), rootBlend);
      const b = lerp(68, lerp(138, 218, clamp(lum - 0.20, 0, 1)), rootBlend);
      const i4 = (y * S + x) * 4;
      frillAlb[i4] = clamp(Math.round(r), 0, 255);
      frillAlb[i4 + 1] = clamp(Math.round(g), 0, 255);
      frillAlb[i4 + 2] = clamp(Math.round(b), 0, 255);
      frillAlb[i4 + 3] = 255;

      const em = clamp((0.26 * rootBlend + 0.58 * primaryVein + 0.44 * capVein + 0.55 * edgeGlow) * rootBlend, 0, 1);
      frillEmi[i4] = Math.round(em * 110);
      frillEmi[i4 + 1] = Math.round(em * 255);
      frillEmi[i4 + 2] = Math.round(em * 195);
      frillEmi[i4 + 3] = 255;
    }
  }

  // Glowing Forelimb bioluminescent chitin & spell-channels
  const bioAlb = new Uint8Array(S * S * 4);
  const bioEmi = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    const v = y / (S - 1); // 0 = upper joint, 1 = blazing claw tip
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const n = fbmTile(u, v, 8, 4, 503);
      const cell = worleyTile(u, v, 10, 607);
      const channel = Math.pow(0.5 + 0.5 * Math.cos((u * 4 + (n - 0.5) * 0.35) * Math.PI * 2), 2.4);
      const tipSurge = smoothstep(0.22, 0.88, v);
      const poreGlow = Math.pow(1 - clamp(cell.edge, 0, 1), 2.6);
      const glow = clamp(0.32 * channel + 0.62 * tipSurge + 0.35 * poreGlow, 0, 1);

      const i4 = (y * S + x) * 4;
      bioAlb[i4] = Math.round(lerp(66, 138, glow));
      bioAlb[i4 + 1] = Math.round(lerp(28, 255, glow));
      bioAlb[i4 + 2] = Math.round(lerp(78, 206, glow));
      bioAlb[i4 + 3] = 255;

      const e = clamp(glow * 1.12, 0, 1);
      bioEmi[i4] = Math.round(e * 125);
      bioEmi[i4 + 1] = Math.round(e * 255);
      bioEmi[i4 + 2] = Math.round(e * 198);
      bioEmi[i4 + 3] = 255;
    }
  }

  // TeamColor organic inlay plate texture (high luminance 0.74..1.0 so runtime tint multiplies cleanly)
  const TS = 128;
  const teamAlb = new Uint8Array(TS * TS * 4);
  for (let y = 0; y < TS; y++) {
    const v = y / (TS - 1);
    const border = smoothstep(0.0, 0.12, v) * smoothstep(1.0, 0.88, v);
    const hi = smoothstep(0.72, 0.88, v) * (1 - smoothstep(0.89, 0.99, v));
    for (let x = 0; x < TS; x++) {
      const u = x / TS;
      const cell = worleyTile(u, v, 8, 811);
      const n = fbmTile(u, v, 6, 3, 907);
      const val = clamp(0.72 + 0.18 * border * smoothstep(0.05, 0.35, cell.edge) + 0.08 * n + 0.10 * hi, 0.66, 1.0);
      const i4 = (y * TS + x) * 4;
      const c = Math.round(val * 255);
      teamAlb[i4] = c; teamAlb[i4 + 1] = c; teamAlb[i4 + 2] = c; teamAlb[i4 + 3] = 255;
    }
  }

  return {
    plumAlb: encodePNG(S, S, plumAlb),
    plumNorm: normalFromHeight(plumH, S, S, 3.2),
    plumORM: encodePNG(S, S, plumORM),
    frillAlb: encodePNG(S, S, frillAlb),
    frillNorm: normalFromHeight(frillH, S, S, 2.4),
    frillEmi: encodePNG(S, S, frillEmi),
    bioAlb: encodePNG(S, S, bioAlb),
    bioEmi: encodePNG(S, S, bioEmi),
    teamAlb: encodePNG(TS, TS, teamAlb),
  };
}

// Vector & Quaternion Math
const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vScale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vLerp = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vNorm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-8 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
};

function quatFromEuler(rx, ry, rz) {
  const cx = Math.cos(rx * 0.5), sx = Math.sin(rx * 0.5);
  const cy = Math.cos(ry * 0.5), sy = Math.sin(ry * 0.5);
  const cz = Math.cos(rz * 0.5), sz = Math.sin(rz * 0.5);
  const x = sx * cy * cz + cx * sy * sz;
  const y = cx * sy * cz - sx * cy * sz;
  const z = cx * cy * sz + sx * sy * cz;
  const w = cx * cy * cz - sx * sy * sz;
  const l = Math.hypot(x, y, z, w) || 1;
  return [x / l, y / l, z / l, w / l];
}

// Material indices
const MAT_PLUM = 0;
const MAT_FRILL = 1;
const MAT_BIOLUM = 2;
const MAT_TEAM = 3;
const MAT_TEAM_GLOW = 4;

// Skeleton Joint Definitions (24 joints, pure-translation rest bind pivots)
const JOINT_DEFS = [
  { name: 'Body', parent: -1, pivot: [0, 0.52, 0.02] },          // 0
  { name: 'Thorax', parent: 0, pivot: [0, 0.58, 0.24] },         // 1
  { name: 'Head', parent: 1, pivot: [0, 0.64, 0.84] },           // 2
  { name: 'MandibleL', parent: 2, pivot: [-0.22, 0.54, 1.22] },  // 3
  { name: 'MandibleR', parent: 2, pivot: [0.22, 0.54, 1.22] },   // 4
  { name: 'FrillBase', parent: 1, pivot: [0, 0.78, 0.56] },      // 5
  { name: 'FrillCenter', parent: 5, pivot: [0, 0.82, 0.54] },    // 6
  { name: 'FrillLeft', parent: 5, pivot: [-0.18, 0.80, 0.54] },  // 7
  { name: 'FrillRight', parent: 5, pivot: [0.18, 0.80, 0.54] },  // 8
  { name: 'Abdomen1', parent: 0, pivot: [0, 0.58, -0.22] },      // 9
  { name: 'Abdomen2', parent: 9, pivot: [0, 0.53, -0.82] },      // 10
  { name: 'Tail', parent: 10, pivot: [0, 0.46, -1.36] },         // 11
  { name: 'ForeL_Hip', parent: 1, pivot: [-0.50, 0.52, 0.56] },  // 12
  { name: 'ForeL_Knee', parent: 12, pivot: [-1.38, 0.80, 0.88] },// 13
  { name: 'ForeL_Wrist', parent: 13, pivot: [-1.18, 0.34, 1.36] },// 14
  { name: 'ForeR_Hip', parent: 1, pivot: [0.50, 0.52, 0.56] },   // 15
  { name: 'ForeR_Knee', parent: 15, pivot: [1.38, 0.80, 0.88] }, // 16
  { name: 'ForeR_Wrist', parent: 16, pivot: [1.18, 0.34, 1.36] },// 17
  { name: 'RearL_Hip', parent: 9, pivot: [-0.52, 0.50, -0.44] }, // 18
  { name: 'RearL_Knee', parent: 18, pivot: [-1.42, 0.82, -0.68] },// 19
  { name: 'RearL_Ankle', parent: 19, pivot: [-1.62, 0.30, -0.84] },// 20
  { name: 'RearR_Hip', parent: 9, pivot: [0.52, 0.50, -0.44] },  // 21
  { name: 'RearR_Knee', parent: 21, pivot: [1.42, 0.82, -0.68] },// 22
  { name: 'RearR_Ankle', parent: 22, pivot: [1.62, 0.30, -0.84] },// 23
];

function makeWeight(j0, w0 = 1, j1 = 0, w1 = 0, j2 = 0, w2 = 0, j3 = 0, w3 = 0) {
  const sum = w0 + w1 + w2 + w3 || 1;
  const ws = [
    Math.fround(w0 / sum),
    Math.fround(w1 / sum),
    Math.fround(w2 / sum),
    0,
  ];
  ws[3] = Math.fround(Math.max(0, 1 - (ws[0] + ws[1] + ws[2])));
  return { j: [j0, w1 > 0 ? j1 : 0, w2 > 0 ? j2 : 0, ws[3] > 0 ? j3 : 0], w: ws };
}

function createBuckets() {
  return Array.from({ length: 5 }, () => ({
    pos: [], norm: [], tan: [], uv: [], joints: [], weights: [], idx: [],
  }));
}

// Loft a closed/capped parametric organic tube or shell with seam-wrapped smooth normals & valid tangents
function addLoft(buckets, mat, rings, radialSegs, opts = {}) {
  const b = buckets[mat];
  const baseV = b.pos.length / 3;
  const cols = radialSegs + 1;
  const rows = rings.length;
  const localPos = [];
  const localUV = [];
  const localJW = [];

  let prevUp = opts.upHint || [0, 1, 0];
  for (let i = 0; i < rows; i++) {
    const r = rings[i];
    const tPrev = i > 0 ? rings[i - 1].c : r.c;
    const tNext = i < rows - 1 ? rings[i + 1].c : r.c;
    let fwd = vSub(tNext, tPrev);
    if (Math.hypot(fwd[0], fwd[1], fwd[2]) < 1e-5) fwd = opts.defaultFwd || [0, 0, 1];
    fwd = vNorm(fwd);
    let right = vCross(prevUp, fwd);
    if (Math.hypot(right[0], right[1], right[2]) < 1e-4) {
      right = vCross([1, 0, 0], fwd);
      if (Math.hypot(right[0], right[1], right[2]) < 1e-4) right = [1, 0, 0];
    }
    right = vNorm(right);
    const up = vNorm(vCross(fwd, right));
    prevUp = up;

    const vCoord = r.v !== undefined ? r.v : i / Math.max(1, rows - 1);
    const jw = r.jw;
    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const th = u * Math.PI * 2;
      let lx = Math.cos(th) * r.rx;
      let ly = Math.sin(th) * r.ry;
      let lz = 0;
      if (opts.shapeFn) {
        const mod = opts.shapeFn(th, i / Math.max(1, rows - 1), lx, ly);
        lx = mod[0]; ly = mod[1]; lz = mod[2] || 0;
      }
      const p = [
        r.c[0] + right[0] * lx + up[0] * ly + fwd[0] * lz,
        r.c[1] + right[1] * lx + up[1] * ly + fwd[1] * lz,
        r.c[2] + right[2] * lx + up[2] * ly + fwd[2] * lz,
      ];
      localPos.push(p);
      localUV.push([(opts.uScale || 1) * u, vCoord]);
      localJW.push(opts.jwFn ? opts.jwFn(th, i / Math.max(1, rows - 1), p) : jw);
    }
  }

  const localTri = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * cols + j;
      const c = (i + 1) * cols + j;
      localTri.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }

  if (opts.capStart !== false) {
    const cIdx = localPos.length;
    localPos.push([...rings[0].c]);
    localUV.push([0.5, rings[0].v !== undefined ? rings[0].v : 0]);
    localJW.push(rings[0].jw);
    for (let j = 0; j < radialSegs; j++) localTri.push(cIdx, j, j + 1);
  }
  if (opts.capEnd !== false) {
    const cIdx = localPos.length;
    const last = rows - 1;
    localPos.push([...rings[last].c]);
    localUV.push([0.5, rings[last].v !== undefined ? rings[last].v : 1]);
    localJW.push(rings[last].jw);
    const rowStart = last * cols;
    for (let j = 0; j < radialSegs; j++) localTri.push(cIdx, rowStart + j + 1, rowStart + j);
  }

  appendWithNormalsAndTangents(b, baseV, localPos, localUV, localJW, localTri, rows, cols, radialSegs);
}

function appendWithNormalsAndTangents(b, baseV, localPos, localUV, localJW, localTri, seamRows, seamCols, radialSegs) {
  const nVerts = localPos.length;
  const nAcc = Array.from({ length: nVerts }, () => [0, 0, 0]);
  const tAcc = Array.from({ length: nVerts }, () => [0, 0, 0]);
  const bAcc = Array.from({ length: nVerts }, () => [0, 0, 0]);

  for (let t = 0; t < localTri.length; t += 3) {
    const i0 = localTri[t], i1 = localTri[t + 1], i2 = localTri[t + 2];
    const p0 = localPos[i0], p1 = localPos[i1], p2 = localPos[i2];
    const e1 = vSub(p1, p0), e2 = vSub(p2, p0);
    const fn = vCross(e1, e2);
    for (const iv of [i0, i1, i2]) {
      nAcc[iv][0] += fn[0]; nAcc[iv][1] += fn[1]; nAcc[iv][2] += fn[2];
    }
    const uv0 = localUV[i0], uv1 = localUV[i1], uv2 = localUV[i2];
    const du1 = uv1[0] - uv0[0], dv1 = uv1[1] - uv0[1];
    const du2 = uv2[0] - uv0[0], dv2 = uv2[1] - uv0[1];
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) > 1e-8) {
      const inv = 1 / det;
      const sdir = [(dv2 * e1[0] - dv1 * e2[0]) * inv, (dv2 * e1[1] - dv1 * e2[1]) * inv, (dv2 * e1[2] - dv1 * e2[2]) * inv];
      const tdir = [(du1 * e2[0] - du2 * e1[0]) * inv, (du1 * e2[1] - du2 * e1[1]) * inv, (du1 * e2[2] - du2 * e1[2]) * inv];
      for (const iv of [i0, i1, i2]) {
        tAcc[iv][0] += sdir[0]; tAcc[iv][1] += sdir[1]; tAcc[iv][2] += sdir[2];
        bAcc[iv][0] += tdir[0]; bAcc[iv][1] += tdir[1]; bAcc[iv][2] += tdir[2];
      }
    }
  }

  // Merge normals across longitudinal seam u=0 and u=1
  if (seamRows > 0 && seamCols === radialSegs + 1) {
    for (let r = 0; r < seamRows; r++) {
      const a = r * seamCols, z = r * seamCols + radialSegs;
      const sx = nAcc[a][0] + nAcc[z][0], sy = nAcc[a][1] + nAcc[z][1], sz = nAcc[a][2] + nAcc[z][2];
      nAcc[a] = [sx, sy, sz];
      nAcc[z] = [sx, sy, sz];
    }
  }

  for (let i = 0; i < nVerts; i++) {
    const p = localPos[i], uv = localUV[i], jw = localJW[i];
    const n = vNorm(nAcc[i]);
    let tg = tAcc[i];
    tg = vSub(tg, vScale(n, vDot(n, tg)));
    let tl = Math.hypot(tg[0], tg[1], tg[2]);
    if (tl < 1e-5) {
      const ref = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      tg = vNorm(vCross(ref, n));
    } else {
      tg = [tg[0] / tl, tg[1] / tl, tg[2] / tl];
    }
    const sign = vDot(vCross(n, tg), bAcc[i]) < 0 ? -1 : 1;

    b.pos.push(p[0], p[1], p[2]);
    b.norm.push(n[0], n[1], n[2]);
    b.tan.push(tg[0], tg[1], tg[2], sign);
    b.uv.push(uv[0], uv[1]);
    b.joints.push(jw.j[0], jw.j[1], jw.j[2], jw.j[3]);
    b.weights.push(jw.w[0], jw.w[1], jw.w[2], jw.w[3]);
  }
  for (let t = 0; t < localTri.length; t++) b.idx.push(baseV + localTri[t]);
}

// Sculpted carapace shell helper (arched dorsal plate with 3 chitin ridges, beveled rim & tucked belly)
function carapaceShape(ridgeAmp, skirtFlare) {
  return (th, s, lx, ly) => {
    const sinT = Math.sin(th), cosT = Math.cos(th);
    if (sinT >= 0) {
      const ridge = 1 + ridgeAmp * Math.pow(Math.abs(Math.cos(th * 3)), 1.6) * sinT;
      const skirt = 1 + skirtFlare * Math.pow(Math.abs(cosT), 2.2) * (1 - sinT * 0.6);
      return [lx * skirt, ly * ridge, -0.05 * Math.pow(Math.abs(cosT), 2) * (1 - s)];
    }
    return [lx * 0.86, ly * 0.32, 0];
  };
}

// Build complete Mireweaver geometry
function buildMireweaverGeometry() {
  const buckets = createBuckets();
  const W = (j0, w0 = 1, j1 = 0, w1 = 0, j2 = 0, w2 = 0) => makeWeight(j0, w0, j1, w1, j2, w2);

  // 1. Ventral Sternum & Thoracic Carapace Hood (PlumChitin_Plates)
  addLoft(buckets, MAT_PLUM, [
    { c: [0, 0.44, -0.34], rx: 0.44, ry: 0.16, v: 0.08, jw: W(0, 0.7, 1, 0.3) },
    { c: [0, 0.38, 0.12], rx: 0.56, ry: 0.19, v: 0.45, jw: W(1, 0.8, 0, 0.2) },
    { c: [0, 0.40, 0.58], rx: 0.50, ry: 0.17, v: 0.78, jw: W(1, 1) },
    { c: [0, 0.48, 0.92], rx: 0.28, ry: 0.12, v: 0.96, jw: W(1, 0.6, 2, 0.4) },
  ], 16, { uScale: 2 });

  // Broad Low-Slung Dorsal Thorax Carapace Plate
  addLoft(buckets, MAT_PLUM, [
    { c: [0, 0.64, -0.30], rx: 0.48, ry: 0.16, v: 0.04, jw: W(1, 0.7, 0, 0.3) },
    { c: [0, 0.60, -0.14], rx: 0.66, ry: 0.30, v: 0.22, jw: W(1, 1) },
    { c: [0, 0.58, 0.24], rx: 0.72, ry: 0.34, v: 0.56, jw: W(1, 1) },
    { c: [0, 0.60, 0.62], rx: 0.62, ry: 0.28, v: 0.84, jw: W(1, 1) },
    { c: [0, 0.63, 0.84], rx: 0.40, ry: 0.16, v: 0.96, jw: W(1, 0.8, 2, 0.2) },
  ], 22, { shapeFn: carapaceShape(0.14, 0.18), uScale: 2 });

  // Dorsal TeamColor Saddle Crest & Luminous Nexus Node
  addLoft(buckets, MAT_TEAM, [
    { c: [0, 0.88, -0.22], rx: 0.12, ry: 0.04, v: 0.08, jw: W(1, 1) },
    { c: [0, 0.91, 0.02], rx: 0.34, ry: 0.06, v: 0.48, jw: W(1, 1) },
    { c: [0, 0.90, 0.28], rx: 0.24, ry: 0.05, v: 0.82, jw: W(1, 1) },
    { c: [0, 0.86, 0.44], rx: 0.09, ry: 0.03, v: 0.96, jw: W(1, 1) },
  ], 14, { shapeFn: carapaceShape(0.10, 0.12) });

  addLoft(buckets, MAT_TEAM_GLOW, [
    { c: [0, 0.93, -0.08], rx: 0.07, ry: 0.04, v: 0.1, jw: W(1, 1) },
    { c: [0, 0.96, 0.06], rx: 0.14, ry: 0.07, v: 0.5, jw: W(1, 1) },
    { c: [0, 0.93, 0.22], rx: 0.06, ry: 0.04, v: 0.9, jw: W(1, 1) },
  ], 12);

  // Symmetrical Forelimb Shoulder Pauldron Plates (TeamColor RTS landmarks)
  for (const side of [-1, 1]) {
    addLoft(buckets, MAT_TEAM, [
      { c: [side * 0.44, 0.72, 0.32], rx: 0.12, ry: 0.06, v: 0.10, jw: W(1, 1) },
      { c: [side * 0.58, 0.77, 0.52], rx: 0.22, ry: 0.09, v: 0.55, jw: W(1, 1) },
      { c: [side * 0.50, 0.72, 0.76], rx: 0.13, ry: 0.05, v: 0.92, jw: W(1, 1) },
    ], 12, { shapeFn: carapaceShape(0.08, 0.15) });
  }

  // 2. Sculpted Mystic Head, Glowing Eyes, Oral Gland & Weaver-Mandibles
  addLoft(buckets, MAT_PLUM, [
    { c: [0, 0.62, 0.76], rx: 0.38, ry: 0.20, v: 0.06, jw: W(2, 0.85, 1, 0.15) },
    { c: [0, 0.62, 0.98], rx: 0.40, ry: 0.22, v: 0.40, jw: W(2, 1) },
    { c: [0, 0.60, 1.22], rx: 0.28, ry: 0.17, v: 0.76, jw: W(2, 1) },
    { c: [0, 0.58, 1.40], rx: 0.12, ry: 0.09, v: 0.95, jw: W(2, 1) },
  ], 18, { shapeFn: carapaceShape(0.16, 0.10), uScale: 2 });

  // Nasal Crest Horn (TeamColor)
  addLoft(buckets, MAT_TEAM, [
    { c: [0, 0.74, 1.12], rx: 0.09, ry: 0.06, v: 0.1, jw: W(2, 1) },
    { c: [0, 0.79, 1.28], rx: 0.06, ry: 0.07, v: 0.6, jw: W(2, 1) },
    { c: [0, 0.85, 1.43], rx: 0.015, ry: 0.02, v: 0.98, jw: W(2, 1) },
  ], 10);

  // Oral Spell-Gland Core aiming toward CastOrigin
  addLoft(buckets, MAT_BIOLUM, [
    { c: [0, 0.52, 1.24], rx: 0.09, ry: 0.07, v: 0.2, jw: W(2, 1) },
    { c: [0, 0.54, 1.38], rx: 0.07, ry: 0.06, v: 0.8, jw: W(2, 1) },
    { c: [0, 0.56, 1.45], rx: 0.02, ry: 0.02, v: 1.0, jw: W(2, 1) },
  ], 10);

  for (const side of [-1, 1]) {
    // Primary Compound Eye & Secondary Ocellus
    addLoft(buckets, MAT_BIOLUM, [
      { c: [side * 0.25, 0.66, 1.04], rx: 0.05, ry: 0.05, v: 0.2, jw: W(2, 1) },
      { c: [side * 0.30, 0.68, 1.14], rx: 0.085, ry: 0.075, v: 0.65, jw: W(2, 1) },
      { c: [side * 0.26, 0.67, 1.24], rx: 0.04, ry: 0.04, v: 0.95, jw: W(2, 1) },
    ], 10);
    addLoft(buckets, MAT_BIOLUM, [
      { c: [side * 0.14, 0.72, 1.22], rx: 0.035, ry: 0.03, v: 0.3, jw: W(2, 1) },
      { c: [side * 0.15, 0.74, 1.30], rx: 0.045, ry: 0.04, v: 0.8, jw: W(2, 1) },
    ], 8);

    // Articulated Weaver-Mandibles (Plum base -> Glowing Mint blade tip)
    const mj = side < 0 ? 3 : 4;
    addLoft(buckets, MAT_PLUM, [
      { c: [side * 0.22, 0.54, 1.20], rx: 0.075, ry: 0.065, v: 0.15, jw: W(mj, 1) },
      { c: [side * 0.28, 0.53, 1.36], rx: 0.065, ry: 0.055, v: 0.75, jw: W(mj, 1) },
      { c: [side * 0.25, 0.53, 1.44], rx: 0.048, ry: 0.042, v: 0.94, jw: W(mj, 1) },
    ], 10);
    addLoft(buckets, MAT_BIOLUM, [
      { c: [side * 0.25, 0.53, 1.42], rx: 0.052, ry: 0.044, v: 0.25, jw: W(mj, 1) },
      { c: [side * 0.20, 0.55, 1.56], rx: 0.038, ry: 0.052, v: 0.70, jw: W(mj, 1) },
      { c: [side * 0.12, 0.58, 1.66], rx: 0.012, ry: 0.018, v: 1.00, jw: W(mj, 1) },
    ], 10);
  }

  // 3. Raised Mint Frill (Signature wide scalloped bioluminescent fan + 9 sculpted ribs)
  buildRaisedMintFrill(buckets, W);

  // 4. Tiered Organic-Plated Abdomen / Mire-Gaster (4 overlapping tergite shells + TeamColor chevrons + glowing vents)
  // Ventral Gaster Sac
  addLoft(buckets, MAT_PLUM, [
    { c: [0, 0.44, -0.18], rx: 0.50, ry: 0.20, v: 0.10, jw: W(9, 0.8, 0, 0.2) },
    { c: [0, 0.40, -0.68], rx: 0.54, ry: 0.21, v: 0.38, jw: W(9, 0.7, 10, 0.3) },
    { c: [0, 0.38, -1.16], rx: 0.42, ry: 0.18, v: 0.68, jw: W(10, 0.8, 11, 0.2) },
    { c: [0, 0.40, -1.58], rx: 0.22, ry: 0.13, v: 0.94, jw: W(11, 1) },
  ], 16, { uScale: 2 });

  const tergites = [
    { z0: -0.14, z1: -0.74, y: 0.62, rx: 0.78, ry: 0.28, jw: W(9, 1), chev: true },
    { z0: -0.62, z1: -1.18, y: 0.58, rx: 0.70, ry: 0.26, jw: W(10, 0.75, 9, 0.25), chev: true },
    { z0: -1.04, z1: -1.52, y: 0.53, rx: 0.54, ry: 0.22, jw: W(10, 0.45, 11, 0.55), chev: true },
    { z0: -1.38, z1: -1.74, y: 0.48, rx: 0.36, ry: 0.16, jw: W(11, 1), chev: false },
  ];
  for (const tg of tergites) {
    const zm = lerp(tg.z0, tg.z1, 0.48);
    const zr = lerp(tg.z0, tg.z1, 0.86);
    addLoft(buckets, MAT_PLUM, [
      { c: [0, tg.y - 0.03, tg.z0], rx: tg.rx * 0.78, ry: tg.ry * 0.62, v: 0.03, jw: tg.jw },
      { c: [0, tg.y, lerp(tg.z0, tg.z1, 0.18)], rx: tg.rx * 0.96, ry: tg.ry * 0.95, v: 0.24, jw: tg.jw },
      { c: [0, tg.y + 0.02, zm], rx: tg.rx, ry: tg.ry, v: 0.58, jw: tg.jw },
      { c: [0, tg.y - 0.01, zr], rx: tg.rx * 0.90, ry: tg.ry * 0.84, v: 0.88, jw: tg.jw },
      { c: [0, tg.y - 0.05, tg.z1], rx: tg.rx * 0.72, ry: tg.ry * 0.52, v: 0.98, jw: tg.jw },
    ], 20, { shapeFn: carapaceShape(0.15, 0.22), uScale: 2 });

    if (tg.chev) {
      addLoft(buckets, MAT_TEAM, [
        { c: [0, tg.y + tg.ry * 0.92, lerp(tg.z0, tg.z1, 0.20)], rx: tg.rx * 0.18, ry: 0.038, v: 0.12, jw: tg.jw },
        { c: [0, tg.y + tg.ry * 1.04, lerp(tg.z0, tg.z1, 0.52)], rx: tg.rx * 0.42, ry: 0.050, v: 0.58, jw: tg.jw },
        { c: [0, tg.y + tg.ry * 0.88, lerp(tg.z0, tg.z1, 0.84)], rx: tg.rx * 0.12, ry: 0.032, v: 0.92, jw: tg.jw },
      ], 12, { shapeFn: carapaceShape(0.08, 0.10) });

      // Bioluminescent lateral pleural mire-pods tucked under plate wings
      for (const side of [-1, 1]) {
        addLoft(buckets, MAT_BIOLUM, [
          { c: [side * tg.rx * 0.82, tg.y - 0.06, lerp(tg.z0, tg.z1, 0.30)], rx: 0.04, ry: 0.035, v: 0.2, jw: tg.jw },
          { c: [side * tg.rx * 0.90, tg.y - 0.05, lerp(tg.z0, tg.z1, 0.60)], rx: 0.075, ry: 0.055, v: 0.65, jw: tg.jw },
          { c: [side * tg.rx * 0.78, tg.y - 0.07, lerp(tg.z0, tg.z1, 0.86)], rx: 0.035, ry: 0.03, v: 0.95, jw: tg.jw },
        ], 8);
      }
    }
  }

  // Terminal Glowing Mire-Ampulla & Twin Chitin Tail Cerci
  addLoft(buckets, MAT_BIOLUM, [
    { c: [0, 0.46, -1.62], rx: 0.14, ry: 0.11, v: 0.2, jw: W(11, 1) },
    { c: [0, 0.47, -1.75], rx: 0.11, ry: 0.09, v: 0.7, jw: W(11, 1) },
    { c: [0, 0.49, -1.83], rx: 0.03, ry: 0.03, v: 1.0, jw: W(11, 1) },
  ], 12);
  for (const side of [-1, 1]) {
    addLoft(buckets, MAT_PLUM, [
      { c: [side * 0.16, 0.48, -1.62], rx: 0.065, ry: 0.055, v: 0.15, jw: W(11, 1) },
      { c: [side * 0.25, 0.52, -1.76], rx: 0.045, ry: 0.042, v: 0.65, jw: W(11, 1) },
      { c: [side * 0.20, 0.56, -1.85], rx: 0.015, ry: 0.018, v: 0.98, jw: W(11, 1) },
    ], 10);
  }

  // 5. Glowing Forelimbs (Front Pair — Sculpted bioluminescent spell-gauntlets & bifurcated claws)
  for (const side of [-1, 1]) {
    const jHip = side < 0 ? 12 : 15;
    const jKnee = side < 0 ? 13 : 16;
    const jWrist = side < 0 ? 14 : 17;

    // Coxa Socket & Armored Chitin Upper Femur Sleeve
    addLoft(buckets, MAT_PLUM, [
      { c: [side * 0.46, 0.52, 0.54], rx: 0.16, ry: 0.15, v: 0.08, jw: W(1, 0.5, jHip, 0.5) },
      { c: [side * 0.74, 0.62, 0.66], rx: 0.17, ry: 0.15, v: 0.42, jw: W(jHip, 1) },
      { c: [side * 1.12, 0.74, 0.80], rx: 0.15, ry: 0.13, v: 0.78, jw: W(jHip, 1) },
      { c: [side * 1.36, 0.80, 0.88], rx: 0.11, ry: 0.10, v: 0.95, jw: W(jHip, 1) },
    ], 14, { shapeFn: carapaceShape(0.12, 0.08) });

    // Glowing Energy Conduit & Raised Elbow Crystal Spur on Femur
    addLoft(buckets, MAT_BIOLUM, [
      { c: [side * 0.64, 0.65, 0.64], rx: 0.075, ry: 0.085, v: 0.15, jw: W(jHip, 1) },
      { c: [side * 1.08, 0.80, 0.80], rx: 0.095, ry: 0.11, v: 0.55, jw: W(jHip, 1) },
      { c: [side * 1.40, 0.86, 0.88], rx: 0.11, ry: 0.12, v: 0.82, jw: W(jHip, 1) },
      { c: [side * 1.50, 0.96, 0.80], rx: 0.025, ry: 0.035, v: 1.00, jw: W(jHip, 1) },
    ], 12);

    // Glowing Arcane Scythe-Forearm (Tibia) with Flared Dorsal Bioluminescent Blade
    addLoft(buckets, MAT_BIOLUM, [
      { c: [side * 1.38, 0.80, 0.88], rx: 0.11, ry: 0.12, v: 0.12, jw: W(jKnee, 1) },
      { c: [side * 1.36, 0.64, 1.06], rx: 0.15, ry: 0.20, v: 0.45, jw: W(jKnee, 1) },
      { c: [side * 1.28, 0.47, 1.24], rx: 0.14, ry: 0.18, v: 0.76, jw: W(jKnee, 1) },
      { c: [side * 1.18, 0.34, 1.36], rx: 0.10, ry: 0.12, v: 0.95, jw: W(jKnee, 1) },
    ], 14, {
      shapeFn: (th, s, lx, ly) => {
        // Flared upward/outward glowing blade crest so RTS top-down camera sees broad mint glow
        const fin = Math.sin(th) > 0 ? 1 + 0.55 * Math.pow(Math.sin(th), 2) * Math.sin(s * Math.PI) : 0.72;
        return [lx * (1 + 0.25 * Math.sin(s * Math.PI)), ly * fin, 0];
      },
    });

    // Dark Plum Chitin Wrist Cuff framing the glowing claw
    addLoft(buckets, MAT_PLUM, [
      { c: [side * 1.22, 0.40, 1.30], rx: 0.115, ry: 0.115, v: 0.20, jw: W(jKnee, 0.5, jWrist, 0.5) },
      { c: [side * 1.16, 0.31, 1.38], rx: 0.105, ry: 0.105, v: 0.85, jw: W(jWrist, 1) },
    ], 12);

    // Primary Glowing Weaver-Talon (Plants cleanly on Y = 0.000)
    addLoft(buckets, MAT_BIOLUM, [
      { c: [side * 1.18, 0.34, 1.36], rx: 0.095, ry: 0.105, v: 0.30, jw: W(jWrist, 1) },
      { c: [side * 1.06, 0.18, 1.50], rx: 0.075, ry: 0.090, v: 0.65, jw: W(jWrist, 1) },
      { c: [side * 0.95, 0.055, 1.60], rx: 0.052, ry: 0.050, v: 0.90, jw: W(jWrist, 1) },
      { c: [side * 0.90, 0.012, 1.63], rx: 0.026, ry: 0.012, v: 1.00, jw: W(jWrist, 1) },
    ], 12, { upHint: [0, 1, 0] });

    // Secondary Inner Channeling Spell-Tine (Frames CastOrigin)
    addLoft(buckets, MAT_BIOLUM, [
      { c: [side * 1.10, 0.27, 1.44], rx: 0.062, ry: 0.068, v: 0.40, jw: W(jWrist, 1) },
      { c: [side * 0.92, 0.25, 1.58], rx: 0.045, ry: 0.055, v: 0.75, jw: W(jWrist, 1) },
      { c: [side * 0.76, 0.26, 1.68], rx: 0.016, ry: 0.022, v: 1.00, jw: W(jWrist, 1) },
    ], 10);
  }

  // 6. Armored Plated Hind Legs (Rear Pair — Wide anchored quadruped stance on Y = 0.000)
  for (const side of [-1, 1]) {
    const jHip = side < 0 ? 18 : 21;
    const jKnee = side < 0 ? 19 : 22;
    const jAnkle = side < 0 ? 20 : 23;

    // Heavy Plated Femur
    addLoft(buckets, MAT_PLUM, [
      { c: [side * 0.48, 0.50, -0.44], rx: 0.17, ry: 0.16, v: 0.08, jw: W(9, 0.45, jHip, 0.55) },
      { c: [side * 0.84, 0.65, -0.54], rx: 0.20, ry: 0.18, v: 0.42, jw: W(jHip, 1) },
      { c: [side * 1.22, 0.78, -0.64], rx: 0.17, ry: 0.16, v: 0.78, jw: W(jHip, 1) },
      { c: [side * 1.44, 0.84, -0.69], rx: 0.11, ry: 0.11, v: 0.96, jw: W(jHip, 1) },
    ], 14, { shapeFn: carapaceShape(0.14, 0.10) });

    // Dorsal TeamColor War-Band on Hind Femur
    addLoft(buckets, MAT_TEAM, [
      { c: [side * 0.78, 0.78, -0.52], rx: 0.10, ry: 0.045, v: 0.15, jw: W(jHip, 1) },
      { c: [side * 1.04, 0.87, -0.59], rx: 0.14, ry: 0.055, v: 0.55, jw: W(jHip, 1) },
      { c: [side * 1.26, 0.90, -0.65], rx: 0.08, ry: 0.040, v: 0.90, jw: W(jHip, 1) },
    ], 10);

    // Armored Crusher Tibia + Knee Joint Glow Pod
    addLoft(buckets, MAT_BIOLUM, [
      { c: [side * 1.38, 0.83, -0.68], rx: 0.075, ry: 0.075, v: 0.3, jw: W(jKnee, 1) },
      { c: [side * 1.48, 0.91, -0.69], rx: 0.030, ry: 0.035, v: 0.95, jw: W(jKnee, 1) },
    ], 8);

    addLoft(buckets, MAT_PLUM, [
      { c: [side * 1.42, 0.82, -0.68], rx: 0.13, ry: 0.13, v: 0.10, jw: W(jKnee, 1) },
      { c: [side * 1.54, 0.60, -0.76], rx: 0.15, ry: 0.14, v: 0.48, jw: W(jKnee, 1) },
      { c: [side * 1.61, 0.36, -0.82], rx: 0.11, ry: 0.11, v: 0.86, jw: W(jKnee, 1) },
      { c: [side * 1.62, 0.28, -0.84], rx: 0.09, ry: 0.09, v: 0.96, jw: W(jKnee, 0.5, jAnkle, 0.5) },
    ], 14, { shapeFn: carapaceShape(0.12, 0.08) });

    // Grounded Mire-Tarsus & Two-Toed Clawed Foot Pad on Y = 0.000
    addLoft(buckets, MAT_PLUM, [
      { c: [side * 1.62, 0.30, -0.84], rx: 0.095, ry: 0.095, v: 0.15, jw: W(jAnkle, 1) },
      { c: [side * 1.64, 0.14, -0.86], rx: 0.085, ry: 0.075, v: 0.55, jw: W(jAnkle, 1) },
      { c: [side * 1.65, 0.04, -0.87], rx: 0.105, ry: 0.038, v: 0.88, jw: W(jAnkle, 1) },
      { c: [side * 1.65, 0.008, -0.87], rx: 0.095, ry: 0.008, v: 0.98, jw: W(jAnkle, 1) },
    ], 12, { upHint: [0, 0, 1] });
  }

  return buckets;
}

// Sculpted 3D Double-Walled Raised Mint Frill + 9 Chitin-to-Mint Radial Spines
function buildRaisedMintFrill(buckets, W) {
  const origin = [0, 0.78, 0.56];
  const nSpines = 9;
  const maxAng = 74 * (Math.PI / 180);

  function frillWeight(uSigned, rFrac) {
    // uSigned in [-1, 1], rFrac in [0, 1]
    const baseBlend = clamp(1 - rFrac * 4.5, 0, 1);
    const fanW = 1 - baseBlend;
    let wL = 0, wC = 0, wR = 0;
    if (uSigned < 0) {
      const a = Math.min(1, -uSigned * 1.25);
      wL = a * fanW;
      wC = (1 - a) * fanW;
    } else {
      const a = Math.min(1, uSigned * 1.25);
      wR = a * fanW;
      wC = (1 - a) * fanW;
    }
    return makeWeight(5, baseBlend, 6, wC, 7, wL, 8, wR);
  }

  function frillSurfacePoint(uSigned, rFrac, sideOffset) {
    const ang = uSigned * maxAng;
    const maxLen = 0.96 - 0.20 * uSigned * uSigned;
    // Scalloped outer rim between the 9 radial spines
    const spinePhase = Math.abs(Math.cos(((uSigned + 1) * 0.5) * (nSpines - 1) * Math.PI));
    const scallop = 0.89 + 0.11 * Math.pow(spinePhase, 1.5);
    const r = rFrac * maxLen * lerp(1, scallop, smoothstep(0.45, 1.0, rFrac));

    // Pitched ~54 deg upward and swept into a regal concave saucer crown
    const pitch = (56 - 14 * uSigned * uSigned) * (Math.PI / 180);
    const sx = Math.sin(ang) * r * 1.18;
    const upDist = Math.cos(ang * 0.62) * r;
    const sy = Math.sin(pitch) * upDist;
    const sz = -Math.cos(pitch) * upDist * 0.68 - 0.10 * Math.pow(rFrac, 1.8) + 0.08 * uSigned * uSigned * r;

    // Fluted wave corrugation between spines + finite 3D membrane thickness
    const flute = 0.022 * Math.cos(((uSigned + 1) * 0.5) * (nSpines - 1) * Math.PI * 2) * Math.sin(rFrac * Math.PI);
    const halfThick = lerp(0.026, 0.008, rFrac) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (rFrac - 0.94) / 0.06), 2)));
    const nDir = vNorm([Math.sin(ang) * 0.28, 0.52, 0.82]);
    const off = flute + sideOffset * halfThick;

    return [
      origin[0] + sx + nDir[0] * off,
      origin[1] + sy + nDir[1] * off,
      origin[2] + sz + nDir[2] * off,
    ];
  }

  // Plum Chitin Collar Arch at base of Frill
  const collarRings = [];
  for (let i = 0; i <= 10; i++) {
    const u = (i / 10) * 2 - 1;
    const p = frillSurfacePoint(u, 0.06, 0);
    collarRings.push({ c: p, rx: 0.065, ry: 0.075, v: 0.2 + 0.6 * Math.abs(u), jw: W(5, 1) });
  }
  addLoft(buckets, MAT_PLUM, collarRings, 10, { upHint: [0, 1, 0] });

  // 3D Double-Walled Scalloped Mint Membrane
  const b = buckets[MAT_FRILL];
  const baseV = b.pos.length / 3;
  const cols = 40, rows = 10;
  const localPos = [], localUV = [], localJW = [], localTri = [];

  for (const face of [1, -1]) {
    for (let ir = 0; ir <= rows; ir++) {
      const rFrac = ir / rows;
      for (let ic = 0; ic <= cols; ic++) {
        const u = (ic / cols) * 2 - 1;
        localPos.push(frillSurfacePoint(u, rFrac, face));
        localUV.push([ic / cols, rFrac]);
        localJW.push(frillWeight(u, rFrac));
      }
    }
  }
  const stride = cols + 1;
  const backOffset = (rows + 1) * stride;
  for (let ir = 0; ir < rows; ir++) {
    for (let ic = 0; ic < cols; ic++) {
      const a = ir * stride + ic, c = (ir + 1) * stride + ic;
      localTri.push(a, a + 1, c, a + 1, c + 1, c); // Front (+Z/+Y facing)
      const ba = backOffset + a, bc = backOffset + c;
      localTri.push(ba, bc, ba + 1, ba + 1, bc, bc + 1); // Back (-Z facing)
    }
  }
  // Stitch outer scalloped margin & side edges
  for (let ic = 0; ic < cols; ic++) {
    const f0 = rows * stride + ic, f1 = f0 + 1;
    const b0 = backOffset + f0, b1 = backOffset + f1;
    localTri.push(f0, b0, f1, f1, b0, b1);
  }
  for (let ir = 0; ir < rows; ir++) {
    const fl0 = ir * stride, fl1 = (ir + 1) * stride;
    const bl0 = backOffset + fl0, bl1 = backOffset + fl1;
    localTri.push(fl0, fl1, bl0, fl1, bl1, bl0);
    const fr0 = ir * stride + cols, fr1 = (ir + 1) * stride + cols;
    const br0 = backOffset + fr0, br1 = backOffset + fr1;
    localTri.push(fr0, br0, fr1, fr1, br0, br1);
  }
  appendWithNormalsAndTangents(b, baseV, localPos, localUV, localJW, localTri, 0, 0, 0);

  // 9 Sculpted Radial Frill Ribs (Plum base -> Bioluminescent Mint tips + TeamColor crown pearls on key peaks)
  for (let s = 0; s < nSpines; s++) {
    const u = (s / (nSpines - 1)) * 2 - 1;
    const ribRings = [];
    for (let k = 0; k <= 6; k++) {
      const rf = (k / 6) * 1.07; // Spine tips project proudly past membrane scallop
      const p = frillSurfacePoint(u, Math.min(rf, 1.0), 0);
      if (rf > 1.0) {
        const pPrev = frillSurfacePoint(u, 0.92, 0);
        const dir = vNorm(vSub(p, pPrev));
        p[0] += dir[0] * 0.07; p[1] += dir[1] * 0.07; p[2] += dir[2] * 0.07;
      }
      const rad = lerp(0.042, 0.009, k / 6);
      ribRings.push({ c: p, rx: rad, ry: rad * 1.15, v: k / 6, jw: frillWeight(u, Math.min(1, rf)) });
    }
    const isKeyCrown = (s === 0 || s === 2 || s === 4 || s === 6 || s === 8);
    addLoft(buckets, isKeyCrown ? MAT_BIOLUM : MAT_PLUM, ribRings, 8, { upHint: [0, 0, 1] });

    if (s === 2 || s === 4 || s === 6) {
      const tip = ribRings[ribRings.length - 2];
      addLoft(buckets, MAT_TEAM, [
        { c: vAdd(tip.c, [0, -0.03, 0.02]), rx: 0.028, ry: 0.028, v: 0.2, jw: tip.jw },
        { c: tip.c, rx: 0.038, ry: 0.038, v: 0.6, jw: tip.jw },
        { c: vAdd(tip.c, [0, 0.04, -0.02]), rx: 0.014, ry: 0.014, v: 0.95, jw: tip.jw },
      ], 8);
    }
  }
}

// Normalize footprint to exact ground Y = 0.000 and exact XZ radius 1.875 around Root (0, 0)
function normalizeFootprint(buckets, joints, castOriginPos) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const b of buckets) {
    for (let i = 0; i < b.pos.length; i += 3) {
      const x = b.pos[i], y = b.pos[i + 1], z = b.pos[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  const shiftX = -0.5 * (minX + maxX);
  const shiftY = -minY;
  const shiftZ = -0.5 * (minZ + maxZ);

  let maxR = 0;
  for (const b of buckets) {
    for (let i = 0; i < b.pos.length; i += 3) {
      const x = b.pos[i] + shiftX;
      const z = b.pos[i + 2] + shiftZ;
      const r = Math.hypot(x, z);
      if (r > maxR) maxR = r;
    }
  }
  const TARGET_RADIUS = 1.875;
  const scaleXZ = TARGET_RADIUS / maxR;

  for (const b of buckets) {
    for (let i = 0; i < b.pos.length; i += 3) {
      b.pos[i] = Math.fround((b.pos[i] + shiftX) * scaleXZ);
      b.pos[i + 1] = Math.fround(Math.max(0, b.pos[i + 1] + shiftY));
      b.pos[i + 2] = Math.fround((b.pos[i + 2] + shiftZ) * scaleXZ);
    }
  }
  for (const j of joints) {
    j.pivot = [
      Math.fround((j.pivot[0] + shiftX) * scaleXZ),
      Math.fround(j.pivot[1] + shiftY),
      Math.fround((j.pivot[2] + shiftZ) * scaleXZ),
    ];
  }
  castOriginPos[0] = Math.fround((castOriginPos[0] + shiftX) * scaleXZ);
  castOriginPos[1] = Math.fround(castOriginPos[1] + shiftY);
  castOriginPos[2] = Math.fround((castOriginPos[2] + shiftZ) * scaleXZ);
}

// Build all 6 required animation clips: idle, walk, cast, burrow, surface, death
function buildAnimations(jointNodes, baseTrans) {
  function sampleClip(name, duration, steps, poseFn) {
    const times = new Float32Array(steps);
    for (let s = 0; s < steps; s++) times[s] = Math.fround((s / (steps - 1)) * duration);

    const tracks = new Map();
    const ensure = (jIdx) => {
      if (!tracks.has(jIdx)) tracks.set(jIdx, { t: null, r: null, s: null });
      return tracks.get(jIdx);
    };

    for (let s = 0; s < steps; s++) {
      const u = s / (steps - 1);
      const p = poseFn(u, u * duration);
      for (const [jIdxStr, tr] of Object.entries(p)) {
        const jIdx = Number(jIdxStr);
        const rec = ensure(jIdx);
        if (tr.dt) {
          if (!rec.t) rec.t = Array.from({ length: steps }, () => [0, 0, 0]);
          rec.t[s] = tr.dt;
        }
        if (tr.rot) {
          if (!rec.r) rec.r = Array.from({ length: steps }, () => [0, 0, 0, 1]);
          rec.r[s] = quatFromEuler(tr.rot[0], tr.rot[1], tr.rot[2]);
        }
        if (tr.scl) {
          if (!rec.s) rec.s = Array.from({ length: steps }, () => [1, 1, 1]);
          rec.s[s] = tr.scl;
        }
      }
    }

    const channels = [];
    for (const [jIdx, rec] of tracks.entries()) {
      const nodeIdx = jointNodes[jIdx];
      const bt = baseTrans[jIdx];
      if (rec.t) {
        const flat = new Float32Array(steps * 3);
        for (let i = 0; i < steps; i++) {
          flat[i * 3] = Math.fround(bt[0] + rec.t[i][0]);
          flat[i * 3 + 1] = Math.fround(bt[1] + rec.t[i][1]);
          flat[i * 3 + 2] = Math.fround(bt[2] + rec.t[i][2]);
        }
        channels.push({ nodeIdx, path: 'translation', type: 'VEC3', data: flat });
      }
      if (rec.r) {
        const flat = new Float32Array(steps * 4);
        for (let i = 0; i < steps; i++) {
          flat[i * 4] = Math.fround(rec.r[i][0]);
          flat[i * 4 + 1] = Math.fround(rec.r[i][1]);
          flat[i * 4 + 2] = Math.fround(rec.r[i][2]);
          flat[i * 4 + 3] = Math.fround(rec.r[i][3]);
        }
        channels.push({ nodeIdx, path: 'rotation', type: 'VEC4', data: flat });
      }
      if (rec.s) {
        const flat = new Float32Array(steps * 3);
        for (let i = 0; i < steps; i++) {
          flat[i * 3] = Math.fround(rec.s[i][0]);
          flat[i * 3 + 1] = Math.fround(rec.s[i][1]);
          flat[i * 3 + 2] = Math.fround(rec.s[i][2]);
        }
        channels.push({ nodeIdx, path: 'scale', type: 'VEC3', data: flat });
      }
    }
    return { name, times, channels };
  }

  const TAU = Math.PI * 2;

  // 1. idle: Breathing low suspension (feet stay planted via hip counter-flex), subtle frill fan pulse & mandible twitch
  const idle = sampleClip('idle', 2.4, 33, (u) => {
    const ph = u * TAU;
    const breath = Math.sin(ph);
    const sway = Math.sin(ph * 2);
    const dy = 0.032 * breath;
    const hipComp = dy * 0.85; // Counter-rotates hips so feet remain anchored on Y = 0
    return {
      0: { dt: [0.012 * sway, dy, 0], rot: [0.025 * breath, 0.02 * sway, -0.015 * sway] },
      1: { rot: [-0.03 * breath, 0, 0] },
      2: { rot: [0.04 * Math.cos(ph), 0.035 * sway, 0] },
      3: { rot: [0, -0.09 * (0.5 + 0.5 * Math.sin(ph * 2)), 0] },
      4: { rot: [0, 0.09 * (0.5 + 0.5 * Math.cos(ph * 2)), 0] },
      5: { rot: [0.06 * breath, 0, 0] },
      7: { rot: [0, -0.06 * breath, 0.05 * breath] },
      8: { rot: [0, 0.06 * breath, -0.05 * breath] },
      9: { rot: [-0.035 * breath, -0.025 * sway, 0] },
      10: { rot: [-0.04 * Math.cos(ph), -0.03 * sway, 0] },
      11: { rot: [0.06 * breath, 0.04 * sway, 0] },
      12: { rot: [0, 0, hipComp] },
      13: { rot: [0, 0, -hipComp * 0.7] },
      15: { rot: [0, 0, -hipComp] },
      16: { rot: [0, 0, hipComp * 0.7] },
      18: { rot: [0, 0, hipComp] },
      19: { rot: [0, 0, -hipComp * 0.6] },
      21: { rot: [0, 0, -hipComp] },
      22: { rot: [0, 0, hipComp * 0.6] },
    };
  });

  // 2. walk: Diagonal quadruped skitter-prowl (FL+RR paired vs FR+RL paired)
  function legWalkPose(phase, side) {
    const p = phase - Math.floor(phase);
    const swing = p < 0.5 ? Math.sin(p * 2 * Math.PI) : 0; // Lifts cleanly >= 0 during swing, 0 on ground during stance
    const stride = p < 0.5 ? lerp(-1, 1, p * 2) : lerp(1, -1, (p - 0.5) * 2);
    return {
      hip: [0, -side * stride * 0.24, -side * swing * 0.26],
      knee: [0, 0, side * swing * 0.34 - side * stride * 0.06],
      tip: [swing * 0.16, 0, -side * swing * 0.12],
    };
  }

  const walk = sampleClip('walk', 1.0, 25, (u) => {
    const ph = u * TAU;
    const fl = legWalkPose(u, -1), rr = legWalkPose(u + 0.06, 1);
    const fr = legWalkPose(u + 0.5, 1), rl = legWalkPose(u + 0.56, -1);
    const bounce = 0.028 * Math.abs(Math.sin(ph));
    return {
      0: { dt: [0.025 * Math.sin(ph), bounce, 0], rot: [0.03 * Math.sin(ph * 2), 0.055 * Math.sin(ph), -0.035 * Math.cos(ph)] },
      1: { rot: [0.02 * Math.cos(ph * 2), -0.03 * Math.sin(ph), 0] },
      2: { rot: [-0.03 * Math.sin(ph * 2), -0.04 * Math.sin(ph), 0] },
      3: { rot: [0, -0.08 * (0.5 + 0.5 * Math.sin(ph * 2)), 0] },
      4: { rot: [0, 0.08 * (0.5 + 0.5 * Math.cos(ph * 2)), 0] },
      5: { rot: [-0.08 + 0.05 * Math.sin(ph * 2), 0, 0.04 * Math.sin(ph)] },
      9: { rot: [0, -0.06 * Math.sin(ph), 0] },
      10: { rot: [0.03 * Math.sin(ph * 2), -0.08 * Math.cos(ph), 0] },
      11: { rot: [0.05 * Math.cos(ph * 2), -0.08 * Math.sin(ph), 0] },
      12: { rot: fl.hip }, 13: { rot: fl.knee }, 14: { rot: fl.tip },
      15: { rot: fr.hip }, 16: { rot: fr.knee }, 17: { rot: fr.tip },
      18: { rot: rl.hip }, 19: { rot: rl.knee }, 20: { rot: rl.tip },
      21: { rot: rr.hip }, 22: { rot: rr.knee }, 23: { rot: rr.tip },
    };
  });

  // 3. cast: Braces hind legs, rears forebody, flares mint frill wide, lifts & weaves glowing forelimbs toward CastOrigin
  const cast = sampleClip('cast', 1.6, 33, (u) => {
    const env = smoothstep(0.0, 0.22, u) * (1 - smoothstep(0.74, 1.0, u));
    const weave = Math.sin(u * TAU * 2) * env;
    const weaveCos = Math.cos(u * TAU * 2) * env;
    const burst = Math.exp(-Math.pow((u - 0.60) / 0.09, 2)) * env;
    return {
      0: { dt: [0, 0.09 * env, -0.10 * env + 0.06 * burst], rot: [-0.24 * env + 0.08 * burst, 0, 0] },
      1: { rot: [-0.14 * env + 0.12 * burst, 0.04 * weave, 0] },
      2: { rot: [0.18 * env + 0.08 * burst, -0.04 * weave, 0] },
      3: { rot: [0, -0.34 * env - 0.14 * burst, 0] },
      4: { rot: [0, 0.34 * env + 0.14 * burst, 0] },
      // Dramatic Mint Frill flare & shimmer
      5: { rot: [0.22 * env + 0.10 * burst, 0, 0.04 * weave], scl: [1 + 0.16 * env, 1 + 0.14 * env, 1 + 0.06 * env] },
      6: { rot: [0.08 * burst, 0, 0] },
      7: { rot: [0, -0.18 * env, 0.20 * env + 0.05 * weave] },
      8: { rot: [0, 0.18 * env, -0.20 * env + 0.05 * weave] },
      // Abdomen pumps arcane mire-plasm forward
      9: { rot: [0.18 * env, 0, 0] },
      10: { rot: [0.12 * env + 0.08 * weaveCos, 0, 0] },
      11: { rot: [0.16 * env - 0.10 * weave, 0, 0] },
      // Glowing Forelimbs rear up & weave twin arcane arcs around CastOrigin
      12: { rot: [-0.36 * env + 0.22 * burst, -0.28 * env + 0.18 * weave - 0.16 * burst, 0.44 * env] },
      13: { rot: [0.22 * env, 0.34 * env + 0.16 * weaveCos, -0.32 * env + 0.24 * burst] },
      14: { rot: [-0.28 * env + 0.30 * burst, 0.22 * weave, 0.18 * env] },
      15: { rot: [-0.36 * env + 0.22 * burst, 0.28 * env + 0.18 * weave + 0.16 * burst, -0.44 * env] },
      16: { rot: [0.22 * env, -0.34 * env + 0.16 * weaveCos, 0.32 * env - 0.24 * burst] },
      17: { rot: [-0.28 * env + 0.30 * burst, 0.22 * weave, -0.18 * env] },
      // Rear legs brace firmly on Y = 0
      18: { rot: [-0.16 * env, 0.08 * env, 0.08 * env] },
      19: { rot: [0, 0, -0.10 * env] },
      21: { rot: [-0.16 * env, -0.08 * env, -0.08 * env] },
      22: { rot: [0, 0, 0.10 * env] },
    };
  });

  // Shared burrowed endpoint pose (used at end of burrow and start of surface)
  function burrowedState(sinkAmt, digOsc, shimmy) {
    return {
      0: {
        dt: [0.03 * shimmy, -0.96 * sinkAmt, 0.06 * (1 - sinkAmt) * Math.abs(shimmy)],
        rot: [0.22 * (1 - sinkAmt) * smoothstep(0, 0.25, sinkAmt + 0.1), 0.09 * shimmy, 0.05 * shimmy],
      },
      1: { rot: [0.12 * (1 - sinkAmt), -0.05 * shimmy, 0] },
      2: { rot: [0.18 * sinkAmt, 0, 0] },
      3: { rot: [0, 0.14 * sinkAmt, 0] },
      4: { rot: [0, -0.14 * sinkAmt, 0] },
      // Mint frill folds sleekly flat back onto the dorsal carapace to slip underground
      5: { rot: [-0.98 * sinkAmt, 0, 0], scl: [1 - 0.18 * sinkAmt, 1 - 0.15 * sinkAmt, 1] },
      7: { rot: [0, 0.22 * sinkAmt, -0.24 * sinkAmt] },
      8: { rot: [0, -0.22 * sinkAmt, 0.24 * sinkAmt] },
      9: { rot: [-0.12 * sinkAmt, 0.06 * shimmy, 0] },
      10: { rot: [-0.15 * sinkAmt, 0, 0] },
      11: { rot: [-0.18 * sinkAmt, 0, 0] },
      // Rapid digging strokes transitioning to tucked burrowed limbs
      12: { rot: [0.25 * digOsc, 0.24 * sinkAmt + 0.28 * digOsc, 0.34 * sinkAmt] },
      13: { rot: [0, 0, -0.45 * sinkAmt - 0.25 * digOsc] },
      15: { rot: [-0.25 * digOsc, -0.24 * sinkAmt + 0.28 * digOsc, -0.34 * sinkAmt] },
      16: { rot: [0, 0, 0.45 * sinkAmt - 0.25 * digOsc] },
      18: { rot: [0, -0.20 * sinkAmt - 0.22 * digOsc, 0.36 * sinkAmt] },
      19: { rot: [0, 0, -0.42 * sinkAmt] },
      21: { rot: [0, 0.20 * sinkAmt - 0.22 * digOsc, -0.36 * sinkAmt] },
      22: { rot: [0, 0, 0.42 * sinkAmt] },
    };
  }

  // 4. burrow: Rapid claw digging + frill fold + shimmy descent into mire
  const burrow = sampleClip('burrow', 1.4, 29, (u) => {
    const digEnv = smoothstep(0.0, 0.12, u) * (1 - smoothstep(0.76, 0.92, u));
    const sink = smoothstep(0.14, 0.88, u);
    const digOsc = Math.sin(u * TAU * 3.5) * digEnv;
    const shimmy = Math.sin(u * TAU * 2.5) * digEnv;
    return burrowedState(sink, digOsc, shimmy);
  });

  // 5. surface: Erupts from burrowed mire with slight breach hop, mud-shake & dramatic mint frill unfurl
  const surface = sampleClip('surface', 1.2, 25, (u) => {
    const sink = 1 - smoothstep(0.04, 0.46, u);
    const breachHop = Math.exp(-Math.pow((u - 0.44) / 0.11, 2));
    const shakeEnv = smoothstep(0.36, 0.50, u) * (1 - smoothstep(0.76, 0.94, u));
    const shake = Math.sin(u * TAU * 3.0) * shakeEnv;
    const base = burrowedState(sink, 0, shake * 0.7);
    base[0].dt[1] += 0.14 * breachHop;
    base[0].rot[0] -= 0.16 * breachHop;
    // Proud frill flare as it breaks surface
    const flare = smoothstep(0.38, 0.62, u) * (1 - smoothstep(0.78, 1.0, u));
    base[5].rot[0] += 0.26 * flare;
    base[5].scl = [1 - 0.18 * sink + 0.14 * flare, 1 - 0.15 * sink + 0.14 * flare, 1];
    return base;
  });

  // 6. death: Hit recoil spasm -> legs buckle & curl -> body settles onto Y = 0 -> frill wilts limp
  const death = sampleClip('death', 1.5, 31, (u) => {
    const recoil = Math.exp(-Math.pow((u - 0.14) / 0.08, 2));
    const fall = smoothstep(0.18, 0.60, u);
    const twitch = Math.exp(-Math.pow((u - 0.72) / 0.045, 2)) * 0.18;
    return {
      0: {
        dt: [0.06 * fall, 0.08 * recoil - 0.26 * fall, -0.05 * recoil],
        rot: [-0.22 * recoil + 0.10 * fall, -0.08 * fall, 0.24 * fall],
      },
      1: { rot: [-0.14 * recoil + 0.08 * fall, 0, 0.08 * fall] },
      2: { rot: [-0.20 * recoil + 0.28 * fall, -0.16 * fall, 0.18 * fall] },
      3: { rot: [0, -0.28 * recoil + 0.18 * fall - twitch, 0] },
      4: { rot: [0, 0.28 * recoil - 0.12 * fall, 0] },
      // Frill snaps in shock then wilts sideways/backward onto carapace
      5: {
        rot: [0.24 * recoil - 0.78 * fall, 0.12 * fall, 0.28 * fall],
        scl: [1 + 0.10 * recoil - 0.12 * fall, 1 - 0.14 * fall, 1],
      },
      7: { rot: [0, 0.18 * fall, -0.22 * fall] },
      8: { rot: [0, -0.10 * fall, 0.16 * fall] },
      9: { rot: [0.10 * recoil - 0.08 * fall, 0.10 * fall, -0.10 * fall] },
      10: { rot: [-0.10 * fall, 0.12 * fall, 0] },
      11: { rot: [-0.14 * fall, 0.14 * fall, 0] },
      // Legs splay & curl upward so collapsed corpse rests cleanly on Y >= 0
      12: { rot: [-0.20 * recoil + 0.15 * fall, -0.22 * fall, 0.34 * fall + twitch] },
      13: { rot: [0, 0.25 * fall, 0.52 * fall - twitch] },
      14: { rot: [0, 0, 0.38 * fall] },
      15: { rot: [-0.20 * recoil + 0.10 * fall, 0.26 * fall, -0.52 * fall] },
      16: { rot: [0, -0.20 * fall, -0.48 * fall] },
      17: { rot: [0, 0, -0.32 * fall] },
      18: { rot: [0, 0.20 * fall, 0.32 * fall] },
      19: { rot: [0, 0, 0.44 * fall] },
      20: { rot: [0, 0, 0.26 * fall] },
      21: { rot: [0, -0.22 * fall, -0.46 * fall] },
      22: { rot: [0, 0, -0.40 * fall] },
      23: { rot: [0, 0, -0.22 * fall] },
    };
  });

  return [idle, walk, cast, burrow, surface, death];
}

// Pack everything into a validator-clean glTF 2.0 binary (.glb)
function packGLB() {
  const textures = buildTextures();
  const joints = JOINT_DEFS.map((d) => ({ ...d, pivot: [...d.pivot] }));
  const castOriginWorld = [0, 0.84, 1.50];
  const buckets = buildMireweaverGeometry();
  normalizeFootprint(buckets, joints, castOriginWorld);

  // Binary chunk accumulator (4-byte aligned segments)
  const binParts = [];
  let binOffset = 0;
  const bufferViews = [];
  const accessors = [];

  function appendBufferView(buf, target) {
    const pad = (4 - (buf.length % 4)) % 4;
    const aligned = pad > 0 ? Buffer.concat([buf, Buffer.alloc(pad)]) : buf;
    const bv = { buffer: 0, byteOffset: binOffset, byteLength: buf.length };
    if (target !== undefined) bv.target = target;
    const idx = bufferViews.length;
    bufferViews.push(bv);
    binParts.push(aligned);
    binOffset += aligned.length;
    return idx;
  }

  function addAccessor(typedArr, componentType, type, count, target, computeMinMax = false) {
    const buf = Buffer.from(typedArr.buffer, typedArr.byteOffset, typedArr.byteLength);
    const bvIdx = appendBufferView(buf, target);
    const acc = { bufferView: bvIdx, componentType, count, type };
    if (computeMinMax) {
      const comps = type === 'SCALAR' ? 1 : type === 'VEC2' ? 2 : type === 'VEC3' ? 3 : 4;
      const min = Array(comps).fill(Infinity);
      const max = Array(comps).fill(-Infinity);
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < comps; c++) {
          const v = typedArr[i * comps + c];
          if (v < min[c]) min[c] = v;
          if (v > max[c]) max[c] = v;
        }
      }
      acc.min = min;
      acc.max = max;
    }
    const idx = accessors.length;
    accessors.push(acc);
    return idx;
  }

  // Embed procedural PNG textures
  const imgList = [
    ['plum_chitin_albedo', textures.plumAlb],
    ['plum_chitin_normal', textures.plumNorm],
    ['plum_chitin_orm', textures.plumORM],
    ['mint_frill_albedo', textures.frillAlb],
    ['mint_frill_normal', textures.frillNorm],
    ['mint_frill_emissive', textures.frillEmi],
    ['forelimb_biolum_albedo', textures.bioAlb],
    ['forelimb_biolum_emissive', textures.bioEmi],
    ['teamcolor_inlay_albedo', textures.teamAlb],
  ];
  const images = imgList.map(([name, png]) => ({
    name,
    mimeType: 'image/png',
    bufferView: appendBufferView(png, undefined),
  }));
  const gltfTextures = images.map((img, i) => ({ name: img.name, sampler: 0, source: i }));

  const materials = [
    {
      name: 'PlumChitin_Plates',
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        baseColorTexture: { index: 0 },
        metallicFactor: 1.0,
        roughnessFactor: 1.0,
        metallicRoughnessTexture: { index: 2 },
      },
      normalTexture: { index: 1, scale: 1.15 },
      occlusionTexture: { index: 2, strength: 0.85 },
    },
    {
      name: 'MintFrill_Membrane',
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        baseColorTexture: { index: 3 },
        metallicFactor: 0.06,
        roughnessFactor: 0.34,
      },
      normalTexture: { index: 4, scale: 0.85 },
      emissiveTexture: { index: 5 },
      emissiveFactor: [0.32, 0.96, 0.70],
      doubleSided: true,
    },
    {
      name: 'Forelimb_Biolum',
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        baseColorTexture: { index: 6 },
        metallicFactor: 0.10,
        roughnessFactor: 0.24,
      },
      normalTexture: { index: 1, scale: 0.55 },
      emissiveTexture: { index: 7 },
      emissiveFactor: [0.42, 1.0, 0.78],
    },
    {
      name: 'TeamColor',
      pbrMetallicRoughness: {
        baseColorFactor: [0.92, 0.88, 0.98, 1],
        baseColorTexture: { index: 8 },
        metallicFactor: 0.18,
        roughnessFactor: 0.36,
      },
      normalTexture: { index: 1, scale: 0.50 },
      extras: { teamColor: true, isTeamColor: true, slot: 'primary' },
    },
    {
      name: 'TeamColor_Glow',
      pbrMetallicRoughness: {
        baseColorFactor: [0.95, 0.92, 1.0, 1],
        baseColorTexture: { index: 8 },
        metallicFactor: 0.10,
        roughnessFactor: 0.24,
      },
      emissiveTexture: { index: 8 },
      emissiveFactor: [0.62, 0.52, 0.80],
      extras: { teamColor: true, isTeamColor: true, slot: 'emissive' },
    },
  ];

  // Build Mesh Primitives
  const primitives = [];
  for (let m = 0; m < buckets.length; m++) {
    const b = buckets[m];
    const vCount = b.pos.length / 3;
    if (vCount === 0) continue;
    const posAcc = addAccessor(new Float32Array(b.pos), 5126, 'VEC3', vCount, 34962, true);
    const normAcc = addAccessor(new Float32Array(b.norm), 5126, 'VEC3', vCount, 34962, false);
    const tanAcc = addAccessor(new Float32Array(b.tan), 5126, 'VEC4', vCount, 34962, false);
    const uvAcc = addAccessor(new Float32Array(b.uv), 5126, 'VEC2', vCount, 34962, false);
    const jntAcc = addAccessor(new Uint16Array(b.joints), 5123, 'VEC4', vCount, 34962, false);
    const wgtAcc = addAccessor(new Float32Array(b.weights), 5126, 'VEC4', vCount, 34962, false);
    const idxAcc = addAccessor(new Uint16Array(b.idx), 5123, 'SCALAR', b.idx.length, 34963, false);

    primitives.push({
      attributes: {
        POSITION: posAcc,
        NORMAL: normAcc,
        TANGENT: tanAcc,
        TEXCOORD_0: uvAcc,
        JOINTS_0: jntAcc,
        WEIGHTS_0: wgtAcc,
      },
      indices: idxAcc,
      material: m,
    });
  }

  // Scene Node Hierarchy:
  // Node 0: "Root" at ground origin [0, 0, 0] with skinned mesh & child skeleton root ("Body")
  // Nodes 1..24: Skeleton joints
  // Node 25: "CastOrigin" anchor parented to "Head" (Node 3)
  const nodes = [{ name: 'Root', mesh: 0, skin: 0, children: [1] }];
  const jointNodeIndices = [];
  const baseTranslations = [];

  for (let j = 0; j < joints.length; j++) {
    const def = joints[j];
    const parentPivot = def.parent >= 0 ? joints[def.parent].pivot : [0, 0, 0];
    const relT = [
      Math.fround(def.pivot[0] - parentPivot[0]),
      Math.fround(def.pivot[1] - parentPivot[1]),
      Math.fround(def.pivot[2] - parentPivot[2]),
    ];
    baseTranslations.push(relT);
    const nodeIdx = nodes.length;
    jointNodeIndices.push(nodeIdx);
    nodes.push({ name: def.name, translation: relT, children: [] });
    if (def.parent >= 0) nodes[jointNodeIndices[def.parent]].children.push(nodeIdx);
  }

  // Attach CastOrigin anchor node to Head joint (joint 2 -> node jointNodeIndices[2])
  const headPivot = joints[2].pivot;
  const castOriginNodeIdx = nodes.length;
  nodes.push({
    name: 'CastOrigin',
    translation: [
      Math.fround(castOriginWorld[0] - headPivot[0]),
      Math.fround(castOriginWorld[1] - headPivot[1]),
      Math.fround(castOriginWorld[2] - headPivot[2]),
    ],
  });
  nodes[jointNodeIndices[2]].children.push(castOriginNodeIdx);

  for (const n of nodes) {
    if (n.children && n.children.length === 0) delete n.children;
  }

  // Inverse Bind Matrices (exact pure-translation inverse of each joint's world pivot)
  const ibm = new Float32Array(joints.length * 16);
  for (let j = 0; j < joints.length; j++) {
    const o = j * 16;
    ibm[o] = 1; ibm[o + 5] = 1; ibm[o + 10] = 1; ibm[o + 15] = 1;
    ibm[o + 12] = Math.fround(-joints[j].pivot[0]);
    ibm[o + 13] = Math.fround(-joints[j].pivot[1]);
    ibm[o + 14] = Math.fround(-joints[j].pivot[2]);
  }
  const ibmAcc = addAccessor(ibm, 5126, 'MAT4', joints.length, undefined, false);

  // Animations
  const rawClips = buildAnimations(jointNodeIndices, baseTranslations);
  const animations = rawClips.map((clip) => {
    const timeAcc = addAccessor(clip.times, 5126, 'SCALAR', clip.times.length, undefined, true);
    const samplers = [];
    const channels = [];
    for (const ch of clip.channels) {
      const outAcc = addAccessor(ch.data, 5126, ch.type, clip.times.length, undefined, false);
      const sIdx = samplers.length;
      samplers.push({ input: timeAcc, interpolation: 'LINEAR', output: outAcc });
      channels.push({ sampler: sIdx, target: { node: ch.nodeIdx, path: ch.path } });
    }
    return { name: clip.name, samplers, channels };
  });

  const gltf = {
    asset: { version: '2.0', generator: 'Starfall Command Mireweaver Deterministic Generator' },
    scene: 0,
    scenes: [{ name: 'MireweaverScene', nodes: [0] }],
    nodes,
    meshes: [{ name: 'Mireweaver', primitives }],
    skins: [{ name: 'MireweaverArmature', skeleton: jointNodeIndices[0], inverseBindMatrices: ibmAcc, joints: jointNodeIndices }],
    materials,
    textures: gltfTextures,
    images,
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: binOffset }],
    animations,
  };

  const jsonBytes = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunk = jsonPad > 0 ? Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]) : jsonBytes;
  const binChunk = Buffer.concat(binParts);

  const totalLen = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);

  const jsonHdr = Buffer.alloc(8);
  jsonHdr.writeUInt32LE(jsonChunk.length, 0);
  jsonHdr.writeUInt32LE(0x4E4F534A, 4); // 'JSON'

  const binHdr = Buffer.alloc(8);
  binHdr.writeUInt32LE(binChunk.length, 0);
  binHdr.writeUInt32LE(0x004E4942, 4); // 'BIN\0'

  return Buffer.concat([header, jsonHdr, jsonChunk, binHdr, binChunk]);
}

function main() {
  const outPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'mireweaver.glb');
  const glb = packGLB();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, glb);
  console.log(`Wrote ${outPath} (${glb.length} bytes)`);
}

if (require.main === module) main();
module.exports = { packGLB };
