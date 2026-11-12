#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT_DIR = __dirname;

// --- Concord Fleet PBR Material Palette ---
const MATERIALS = [
  { name: 'ConcordIvory', pbrMetallicRoughness: { baseColorFactor: [0.93, 0.91, 0.85, 1.0], metallicFactor: 0.18, roughnessFactor: 0.34 } },
  { name: 'ConcordGold', pbrMetallicRoughness: { baseColorFactor: [0.88, 0.70, 0.28, 1.0], metallicFactor: 0.84, roughnessFactor: 0.25 }, emissiveFactor: [0.05, 0.035, 0.01] },
  { name: 'TeamColor', pbrMetallicRoughness: { baseColorFactor: [0.16, 0.48, 0.92, 1.0], metallicFactor: 0.32, roughnessFactor: 0.36 }, emissiveFactor: [0.02, 0.07, 0.16] },
  { name: 'DarkMetal', pbrMetallicRoughness: { baseColorFactor: [0.10, 0.12, 0.16, 1.0], metallicFactor: 0.72, roughnessFactor: 0.45 } },
  { name: 'ShadowHangar', pbrMetallicRoughness: { baseColorFactor: [0.018, 0.022, 0.035, 1.0], metallicFactor: 0.20, roughnessFactor: 0.88 } },
  { name: 'SilverAlloy', pbrMetallicRoughness: { baseColorFactor: [0.85, 0.89, 0.95, 1.0], metallicFactor: 0.92, roughnessFactor: 0.18 } },
  { name: 'CyanEnergy', pbrMetallicRoughness: { baseColorFactor: [0.22, 0.95, 1.00, 1.0], metallicFactor: 0.05, roughnessFactor: 0.14 }, emissiveFactor: [0.16, 0.90, 1.00] }
];

const MAT = { IVORY: 0, GOLD: 1, TEAM: 2, DARK: 3, HANGAR: 4, SILVER: 5, CYAN: 6 };

// --- Deterministic Vector & Quaternion Helpers ---
function vSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function vCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function vNorm(a) {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
}
function quatFromEulerXYZ(rx, ry, rz) {
  const cx = Math.cos(rx * 0.5), sx = Math.sin(rx * 0.5);
  const cy = Math.cos(ry * 0.5), sy = Math.sin(ry * 0.5);
  const cz = Math.cos(rz * 0.5), sz = Math.sin(rz * 0.5);
  const q = [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz
  ];
  const f = new Float32Array(q);
  const l = Math.hypot(f[0], f[1], f[2], f[3]) || 1;
  return [Math.fround(f[0] / l), Math.fround(f[1] / l), Math.fround(f[2] / l), Math.fround(f[3] / l)];
}

// --- Mesh Builder (Per-Material Primitives) ---
class MeshBuilder {
  constructor() {
    this.buckets = new Map();
  }
  bucket(mat) {
    if (!this.buckets.has(mat)) this.buckets.set(mat, { pos: [], norm: [], uv: [], idx: [] });
    return this.buckets.get(mat);
  }
  addTri(mat, p0, p1, p2, uv0 = [0, 0], uv1 = [1, 0], uv2 = [0, 1]) {
    const e1 = vSub(p1, p0), e2 = vSub(p2, p0);
    const c = vCross(e1, e2);
    const len = Math.hypot(c[0], c[1], c[2]);
    if (len < 1e-10) return;
    const n = [c[0] / len, c[1] / len, c[2] / len];
    const b = this.bucket(mat);
    const base = b.pos.length / 3;
    b.pos.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    b.norm.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
    b.uv.push(uv0[0], uv0[1], uv1[0], uv1[1], uv2[0], uv2[1]);
    b.idx.push(base, base + 1, base + 2);
  }
  addQuad(mat, p0, p1, p2, p3, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
    this.addTri(mat, p0, p1, p2, [u0, v0], [u1, v0], [u1, v1]);
    this.addTri(mat, p0, p2, p3, [u0, v0], [u1, v1], [u0, v1]);
  }
  // Smooth or faceted loft across closed 3D ring stations: each station is an array of M [x,y,z] points
  // ordered clockwise in (X,Y) when looking from -Z toward +Z (i.e. x = sin(a), y = cos(a)) advancing along +Z.
  addLoft(mat, stations, { capStart = true, capEnd = true, smooth = false, startCenter = null, endCenter = null } = {}) {
    const S = stations.length;
    if (S < 2) return;
    const M = stations[0].length;
    if (!smooth) {
      for (let i = 0; i < S - 1; i++) {
        const s0 = stations[i], s1 = stations[i + 1];
        const v0 = i / (S - 1), v1 = (i + 1) / (S - 1);
        for (let j = 0; j < M; j++) {
          const j1 = (j + 1) % M;
          this.addQuad(mat, s0[j], s1[j], s1[j1], s0[j1], j / M, v0, (j + 1) / M, v1);
        }
      }
    } else {
      const b = this.bucket(mat);
      const base = b.pos.length / 3;
      const vNorms = Array.from({ length: S }, () => Array.from({ length: M }, () => [0, 0, 0]));
      for (let i = 0; i < S - 1; i++) {
        const s0 = stations[i], s1 = stations[i + 1];
        for (let j = 0; j < M; j++) {
          const j1 = (j + 1) % M;
          const n1 = vCross(vSub(s1[j], s0[j]), vSub(s1[j1], s0[j]));
          const n2 = vCross(vSub(s1[j1], s0[j]), vSub(s0[j1], s0[j]));
          for (const [si, sj, n] of [[i, j, n1], [i + 1, j, n1], [i + 1, j1, n1], [i, j, n2], [i + 1, j1, n2], [i, j1, n2]]) {
            vNorms[si][sj][0] += n[0]; vNorms[si][sj][1] += n[1]; vNorms[si][sj][2] += n[2];
          }
        }
      }
      for (let i = 0; i < S; i++) {
        for (let j = 0; j <= M; j++) {
          const jm = j % M;
          const p = stations[i][jm];
          const n = vNorm(vNorms[i][jm]);
          b.pos.push(p[0], p[1], p[2]);
          b.norm.push(n[0], n[1], n[2]);
          b.uv.push(j / M, i / (S - 1));
        }
      }
      const row = M + 1;
      for (let i = 0; i < S - 1; i++) {
        for (let j = 0; j < M; j++) {
          const a = base + i * row + j;
          const c = base + (i + 1) * row + j;
          const pA = stations[i][j], pB = stations[i][(j + 1) % M], pC = stations[i + 1][j], pD = stations[i + 1][(j + 1) % M];
          if (Math.hypot(...vCross(vSub(pC, pA), vSub(pD, pA))) > 1e-10) b.idx.push(a, c, c + 1);
          if (Math.hypot(...vCross(vSub(pD, pA), vSub(pB, pA))) > 1e-10) b.idx.push(a, c + 1, a + 1);
        }
      }
    }
    if (capStart) {
      const s0 = stations[0];
      const c0 = startCenter || avgPt(s0);
      for (let j = 0; j < M; j++) this.addTri(mat, c0, s0[j], s0[(j + 1) % M], [0.5, 0.5], [0, 0], [1, 0]);
    }
    if (capEnd) {
      const sN = stations[S - 1];
      const cN = endCenter || avgPt(sN);
      for (let j = 0; j < M; j++) this.addTri(mat, cN, sN[(j + 1) % M], sN[j], [0.5, 0.5], [1, 1], [0, 1]);
    }
  }
  // Tapered / beveled box along Z with custom front/back centers & half-extents
  addFrustumZ(mat, z0, cx0, cy0, wx0, hy0, z1, cx1, cy1, wx1, hy1, cap0 = true, cap1 = true) {
    const ring = (cx, cy, wx, hy, z) => [
      [cx - wx, cy + hy, z], [cx + wx, cy + hy, z],
      [cx + wx, cy - hy, z], [cx - wx, cy - hy, z]
    ];
    this.addLoft(mat, [ring(cx0, cy0, wx0, hy0, z0), ring(cx1, cy1, wx1, hy1, z1)], {
      capStart: cap0, capEnd: cap1, smooth: false,
      startCenter: [cx0, cy0, z0], endCenter: [cx1, cy1, z1]
    });
  }
  // Cylinder / prism along Z
  addTubeZ(mat, z0, cx0, cy0, rx0, ry0, z1, cx1, cy1, rx1, ry1, segs = 12, smooth = true, cap0 = true, cap1 = true) {
    const mk = (cx, cy, rx, ry, z) => {
      const pts = [];
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        pts.push([cx + rx * Math.sin(a), cy + ry * Math.cos(a), z]);
      }
      return pts;
    };
    this.addLoft(mat, [mk(cx0, cy0, rx0, ry0, z0), mk(cx1, cy1, rx1, ry1, z1)], {
      capStart: cap0, capEnd: cap1, smooth,
      startCenter: [cx0, cy0, z0], endCenter: [cx1, cy1, z1]
    });
  }
  // Hollow octagonal/polygonal ring around Z axis (for harmonic accelerator rings & collars)
  addRingZ(mat, cx, cy, z, rInner, rOuter, halfThickZ, segs = 12) {
    for (let j = 0; j < segs; j++) {
      const a0 = (j / segs) * Math.PI * 2;
      const a1 = ((j + 1) / segs) * Math.PI * 2;
      const s0 = Math.sin(a0), c0 = Math.cos(a0), s1 = Math.sin(a1), c1 = Math.cos(a1);
      const zB = z - halfThickZ, zF = z + halfThickZ;
      const oB0 = [cx + rOuter * s0, cy + rOuter * c0, zB], oB1 = [cx + rOuter * s1, cy + rOuter * c1, zB];
      const oF0 = [cx + rOuter * s0, cy + rOuter * c0, zF], oF1 = [cx + rOuter * s1, cy + rOuter * c1, zF];
      const iB0 = [cx + rInner * s0, cy + rInner * c0, zB], iB1 = [cx + rInner * s1, cy + rInner * c1, zB];
      const iF0 = [cx + rInner * s0, cy + rInner * c0, zF], iF1 = [cx + rInner * s1, cy + rInner * c1, zF];
      this.addQuad(mat, oB0, oF0, oF1, oB1); // outer
      this.addQuad(mat, iF0, iB0, iB1, iF1); // inner
      this.addQuad(mat, iF0, iF1, oF1, oF0); // front (+Z)
      this.addQuad(mat, oB0, oB1, iB1, iB0); // back (-Z)
    }
  }
  // Beveled horizontal armor / livery plate from 2D clockwise polygon in (X, Z) when viewed from +Y
  // Wait: let's ensure outward normals! If pts2D is ordered so cross2D > 0 in (X, Z):
  // Let's compute centroid and auto-orient pts2D so top face normal is +Y!
  addBevelPlateXZ(mat, ptsXZ, yBot, yTop, bevelInset = 0.02, yLiftFn = null) {
    const n = ptsXZ.length;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const p = ptsXZ[i], q = ptsXZ[(i + 1) % n];
      area += p[0] * q[1] - q[0] * p[1];
    }
    // In XZ: p0=(0,0), p1=(0,1)[+Z], p2=(1,0)[+X] -> (0,1,0)x(1,0,0) = (0,+1,0) (+Y)!
    // For p0(0,0)->p1(0,1)->p2(1,0): area = (0*1 - 0*0) + (0*0 - 1*1) + (1*0 - 0*0) = -1 < 0!
    // So area < 0 gives +Y normal for fan (c, p[i], p[i+1])!
    const poly = area < 0 ? ptsXZ.slice() : ptsXZ.slice().reverse();
    let cx = 0, cz = 0;
    for (const p of poly) { cx += p[0]; cz += p[1]; }
    cx /= n; cz /= n;
    const lift = (x, z) => yLiftFn ? yLiftFn(x, z) : 0;
    const bot = poly.map(([x, z]) => [x, yBot + lift(x, z), z]);
    const top = poly.map(([x, z]) => {
      const dx = cx - x, dz = cz - z;
      const d = Math.hypot(dx, dz) || 1;
      const ins = Math.min(bevelInset, d * 0.35);
      const nx = x + (dx / d) * ins, nz = z + (dz / d) * ins;
      return [nx, yTop + lift(nx, nz), nz];
    });
    const cTop = [cx, yTop + lift(cx, cz), cz];
    const cBot = [cx, yBot + lift(cx, cz), cz];
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n;
      this.addTri(mat, cTop, top[i], top[i1]);
      this.addTri(mat, cBot, bot[i1], bot[i]);
      this.addQuad(mat, bot[i], bot[i1], top[i1], top[i]);
    }
  }
  // Clone & mirror another MeshBuilder across X -> -X, preserving or adding to this builder
  addMirroredFrom(other) {
    for (const [mat, src] of other.buckets.entries()) {
      const dst = this.bucket(mat);
      const base = dst.pos.length / 3;
      for (let i = 0; i < src.pos.length; i += 3) {
        dst.pos.push(-src.pos[i], src.pos[i + 1], src.pos[i + 2]);
        const nx = -src.norm[i], ny = src.norm[i + 1], nz = src.norm[i + 2];
        const l = Math.hypot(nx, ny, nz) || 1;
        dst.norm.push(nx / l, ny / l, nz / l);
      }
      for (let i = 0; i < src.uv.length; i += 2) dst.uv.push(src.uv[i], src.uv[i + 1]);
      for (let i = 0; i < src.idx.length; i += 3) {
        dst.idx.push(base + src.idx[i], base + src.idx[i + 2], base + src.idx[i + 1]);
      }
    }
  }
  appendFrom(other) {
    for (const [mat, src] of other.buckets.entries()) {
      const dst = this.bucket(mat);
      const base = dst.pos.length / 3;
      for (let i = 0; i < src.pos.length; i++) { dst.pos.push(src.pos[i]); dst.norm.push(src.norm[i]); }
      for (let i = 0; i < src.uv.length; i++) dst.uv.push(src.uv[i]);
      for (let i = 0; i < src.idx.length; i++) dst.idx.push(base + src.idx[i]);
    }
  }
}

function avgPt(pts) {
  let x = 0, y = 0, z = 0;
  for (const p of pts) { x += p[0]; y += p[1]; z += p[2]; }
  return [x / pts.length, y / pts.length, z / pts.length];
}

// ============================================================================
// 1. FLEET CARRIER (radius = 3.125, Hangar anchor, floor Y = 0)
// Broad gold/ivory carrier, twin launch lanes, dark shadowed hangar, long oval
// ============================================================================
function buildFleetCarrier() {
  const R = 3.125;
  const yMid = 0.925; // H = 1.85 -> H/2 = 0.925

  const hull = new MeshBuilder();
  const team = new MeshBuilder();

  // 1A. Sculpted Broad Oval Carrier Hull with Recessed Hangar & Launch Deck Trough
  const numStations = 33;
  const stations = [];
  for (let i = 0; i < numStations; i++) {
    const t = i / (numStations - 1);
    const u = -1 + 2 * t; // -1 (stern) to +1 (bow)
    const z = u * R;
    const env = Math.sqrt(Math.max(0, 1 - u * u));
    const W = 1.88 * env; // Pure broad oval outer width (3.76 wide x 6.25 long!)

    if (env < 1e-5) {
      // Exact stern & bow oval apexes at (0, yMid, +-3.125)
      const apex = Array.from({ length: 16 }, () => [0, yMid, z]);
      stations.push(apex);
      continue;
    }

    // Ventral keel touches exact Y = 0.0 across [-1.60, +1.60], curving smoothly to yMid at tips
    const keelBlend = Math.max(0, (Math.abs(u) - 0.51) / 0.49);
    const yBot = yMid * Math.pow(keelBlend, 1.65);
    const yBilge = yBot + (yMid - yBot) * 0.36;
    const yChineLo = yMid - 0.11 * env;
    const yChineHi = yMid + 0.10 * env;
    const yDeckOuter = yMid + 0.34 * env;

    // Central dorsal profile: elevated aft under citadel, deeply recessed for hangar & twin launch lanes!
    let yTrough = yMid + 0.36 * env;
    if (z > -0.95 && z < 2.95) {
      let recess = 0;
      if (z <= -0.78) recess = (z + 0.95) / 0.17;
      else if (z <= 2.68) recess = 1.0; // Full-depth recessed bay floor under hangar & twin launch lanes!
      else recess = Math.max(0, 1 - (z - 2.68) / 0.27);
      const targetFloor = z <= 0.95 ? 0.60 : 0.70;
      yTrough = yTrough * (1 - recess) + targetFloor * recess;
    }
    const wTrough = Math.min(0.74, W * 0.56);
    const wShoulder = Math.min(Math.max(wTrough + 0.08 * env, W * 0.62), W * 0.88);

    // 16-point clockwise cross-section in (X, Y)
    stations.push([
      [0, yTrough, z],                              // 0: top center (trough / deck floor)
      [wTrough * 0.96, yTrough, z],                 // 1: right trough floor edge
      [wShoulder, yDeckOuter, z],                   // 2: right inner deck wall top
      [W * 0.86, yDeckOuter * 0.98 + yMid * 0.02, z], // 3: right broad oval shoulder
      [W, yChineHi, z],                             // 4: right upper chine
      [W, yChineLo, z],                             // 5: right lower chine
      [W * 0.76, yBilge, z],                        // 6: right ventral bilge
      [W * 0.26, yBot, z],                          // 7: right keel skid flat
      [0, yBot, z],                                 // 8: bottom keel center (Y=0 across midship!)
      [-W * 0.26, yBot, z],                         // 9: left keel skid flat
      [-W * 0.76, yBilge, z],                       // 10: left ventral bilge
      [-W, yChineLo, z],                            // 11: left lower chine
      [-W, yChineHi, z],                            // 12: left upper chine
      [-W * 0.86, yDeckOuter * 0.98 + yMid * 0.02, z], // 13: left broad oval shoulder
      [-wShoulder, yDeckOuter, z],                  // 14: left inner deck wall top
      [-wTrough * 0.96, yTrough, z]                 // 15: left trough floor edge
    ]);
  }
  hull.addLoft(MAT.IVORY, stations, { capStart: false, capEnd: false, smooth: true });

  // 1B. Burnished Concord Gold Oval Rim Belt & Harmonic Rib Arches
  const rimHalf = new MeshBuilder();
  for (let i = 1; i < numStations - 1; i++) {
    const i1 = i + 1;
    if (i1 >= numStations - 1) break;
    const u0 = -1 + 2 * (i / (numStations - 1)), u1 = -1 + 2 * (i1 / (numStations - 1));
    const z0 = u0 * R, z1 = u1 * R;
    const e0 = Math.sqrt(Math.max(0, 1 - u0 * u0)), e1 = Math.sqrt(Math.max(0, 1 - u1 * u1));
    const w0 = 1.895 * e0, w1 = 1.895 * e1;
    // Clamp slightly inside sphere R near tips
    const cw0 = Math.min(w0, Math.sqrt(Math.max(0, R * R - z0 * z0 - 0.03)));
    const cw1 = Math.min(w1, Math.sqrt(Math.max(0, R * R - z1 * z1 - 0.03)));
    const ring0 = [[cw0 - 0.12 * e0, yMid + 0.13 * e0, z0], [cw0, yMid + 0.09 * e0, z0], [cw0, yMid - 0.09 * e0, z0], [cw0 - 0.12 * e0, yMid - 0.13 * e0, z0]];
    const ring1 = [[cw1 - 0.12 * e1, yMid + 0.13 * e1, z1], [cw1, yMid + 0.09 * e1, z1], [cw1, yMid - 0.09 * e1, z1], [cw1 - 0.12 * e1, yMid - 0.13 * e1, z1]];
    rimHalf.addLoft(MAT.GOLD, [ring0, ring1], { capStart: i === 1, capEnd: i1 === numStations - 2, smooth: false });
  }
  hull.appendFrom(rimHalf);
  hull.addMirroredFrom(rimHalf);

  // Ornate Gold Bow & Stern Medallion Prows (reaching exact z = +-3.125 at yMid!)
  hull.addFrustumZ(MAT.GOLD, 2.75, 0, yMid, 0.22, 0.09, R, 0, yMid, 0.0, 0.0, true, false);
  hull.addFrustumZ(MAT.GOLD, -R, 0, yMid, 0.0, 0.0, -2.72, 0, yMid, 0.28, 0.10, false, true);

  // Ventral DarkMetal Keel Skids sitting flush on Y = 0.0
  for (const sx of [-0.36, 0.36]) {
    hull.addFrustumZ(MAT.DARK, -1.45, sx, 0.04, 0.11, 0.04, 1.45, sx, 0.04, 0.11, 0.04);
  }

  // 1C. Dark Shadowed Hangar Bay (Deep recessed interior cavern z in [-0.90, +1.06])
  // Sunken ultra-dark ShadowHangar floor, rear bulkhead, shadowed side walls, and overhanging ceiling vault
  hull.addFrustumZ(MAT.HANGAR, -0.88, 0, 0.645, 0.74, 0.02, 1.08, 0, 0.665, 0.72, 0.02);    // dark shadowed hangar floor & threshold apron
  hull.addFrustumZ(MAT.HANGAR, -0.90, 0, 0.98, 0.75, 0.34, -0.80, 0, 0.98, 0.75, 0.34);     // deep shadowed rear bulkhead
  hull.addFrustumZ(MAT.HANGAR, -0.88, 0, 1.30, 0.75, 0.03, 0.62, 0, 1.26, 0.72, 0.03);      // shadowed hangar ceiling vault
  for (const sx of [-1, 1]) {
    hull.addFrustumZ(MAT.HANGAR, -0.88, sx * 0.73, 0.97, 0.045, 0.33, 1.05, sx * 0.70, 0.94, 0.045, 0.28); // dark shadowed bay walls
    for (const rz of [-0.55, -0.10, 0.35, 0.78]) {
      hull.addFrustumZ(MAT.DARK, rz - 0.04, sx * 0.66, 0.95, 0.045, 0.27, rz + 0.04, sx * 0.66, 0.95, 0.045, 0.27);
    }
  }
  // Shadowed central hangar dividing pier & gold portal brow
  hull.addFrustumZ(MAT.HANGAR, -0.75, 0, 0.96, 0.09, 0.31, 0.92, 0, 0.93, 0.11, 0.25);
  hull.addFrustumZ(MAT.GOLD, 0.48, 0, 1.28, 0.78, 0.045, 0.68, 0, 1.25, 0.74, 0.035); // Gold hangar portal arch

  // 1D. Twin Launch Lanes (Port x = -0.44, Starboard x = +0.44, emerging from hangar z in [+0.92, +2.72])
  // Central Spine Divider separating the two lanes
  hull.addFrustumZ(MAT.IVORY, 0.92, 0, 0.89, 0.14, 0.14, 2.78, 0, 0.91, 0.08, 0.09);
  hull.addFrustumZ(MAT.GOLD, 0.90, 0, 1.04, 0.10, 0.03, 2.82, 0, 0.99, 0.055, 0.025);

  for (const laneX of [-0.44, 0.44]) {
    // Dark armored runway deck bed for each launch lane (cleanly above yTrough = 0.70!)
    hull.addFrustumZ(MAT.DARK, 0.94, laneX, 0.76, 0.21, 0.025, 2.68, laneX, 0.82, 0.16, 0.025);
    // Glowing Cyan harmonic catapult strip running down the center of each lane
    hull.addFrustumZ(MAT.CYAN, 0.96, laneX, 0.795, 0.062, 0.015, 2.64, laneX, 0.855, 0.046, 0.015);
    // Twin raised ConcordGold magnetic launch rails flanking each lane
    for (const railOff of [-0.19, 0.19]) {
      hull.addFrustumZ(MAT.GOLD, 0.94, laneX + railOff, 0.835, 0.028, 0.055, 2.66, laneX + railOff * 0.82, 0.88, 0.022, 0.04);
    }
    // Sequential cyan launch chevron markers along each runway
    for (let k = 0; k < 4; k++) {
      const cz = 1.16 + k * 0.44;
      const cy = 0.80 + (cz - 0.96) * (0.06 / 1.68);
      hull.addFrustumZ(MAT.CYAN, cz - 0.035, laneX, cy, 0.13, 0.009, cz + 0.035, laneX, cy, 0.09, 0.009);
    }
  }

  // 1E. Overarching Concord Command Citadel & Harmonic Bridge (z in [-2.35, +0.58])
  const citStations = [
    [-2.35, 0.25, 1.08, 1.18],
    [-1.95, 0.68, 1.14, 1.48],
    [-1.25, 0.92, 1.22, 1.72],
    [-0.45, 0.88, 1.26, 1.76],
    [0.25, 0.80, 1.26, 1.60],
    [0.58, 0.68, 1.25, 1.38]
  ].map(([z, w, y0, y1]) => [
    [0, y1, z], [w * 0.65, y1 * 0.98 + y0 * 0.02, z], [w, y0 + (y1 - y0) * 0.35, z],
    [w * 0.95, y0, z], [-w * 0.95, y0, z], [-w, y0 + (y1 - y0) * 0.35, z], [-w * 0.65, y1 * 0.98 + y0 * 0.02, z]
  ]);
  hull.addLoft(MAT.IVORY, citStations, { capStart: true, capEnd: true, smooth: false });
  // Gold crest & glowing Cyan panoramic command bridge visor overlooking the twin launch lanes
  hull.addFrustumZ(MAT.GOLD, -1.85, 0, 1.75, 0.22, 0.05, 0.32, 0, 1.63, 0.16, 0.04);
  hull.addFrustumZ(MAT.CYAN, 0.22, 0, 1.49, 0.52, 0.055, 0.54, 0, 1.41, 0.44, 0.045);

  // Harmonic Gold Deck Ribs framing the broad oval shoulders
  const ribHalf = new MeshBuilder();
  for (const rz of [-1.45, -0.65, 0.15, 0.95, 1.75]) {
    const u = rz / R;
    const env = Math.sqrt(Math.max(0, 1 - u * u));
    const xIn = 0.78, xOut = 1.78 * env;
    if (xOut > xIn + 0.15) {
      ribHalf.addFrustumZ(MAT.GOLD, rz - 0.055, (xIn + xOut) * 0.5, yMid + 0.34 * env, (xOut - xIn) * 0.5, 0.035,
        rz + 0.055, (xIn + xOut) * 0.5, yMid + 0.34 * env, (xOut - xIn) * 0.5, 0.035);
    }
  }
  hull.appendFrom(ribHalf);
  hull.addMirroredFrom(ribHalf);

  // Aft Engine Shroud & 4 DarkMetal Thruster Nozzles
  for (const [ex, ey, er] of [[-0.68, 0.92, 0.18], [-0.26, 0.95, 0.22], [0.26, 0.95, 0.22], [0.68, 0.92, 0.18]]) {
    hull.addTubeZ(MAT.DARK, -2.78, ex, ey, er * 0.82, er * 0.70, -2.42, ex, ey, er, er * 0.85, 10, true, true, true);
    hull.addRingZ(MAT.GOLD, ex, ey, -2.76, er * 0.68, er * 0.90, 0.03, 10);
  }

  // 1F. TeamColor Livery Meshes (Broad oval shoulder crescents, bow chevrons & citadel banners)
  const teamHalf = new MeshBuilder();
  const deckLift = (x, z) => {
    const env = Math.sqrt(Math.max(0, 1 - (z / R) * (z / R)));
    return 0.345 * env;
  };
  teamHalf.addBevelPlateXZ(MAT.TEAM, [
    [0.84, -1.65], [1.28, -1.35], [1.62, -0.35], [1.60, 0.65], [1.34, 1.65], [0.92, 2.15],
    [0.78, 1.95], [1.02, 0.85], [1.06, -0.25], [0.84, -1.25]
  ], yMid - 0.01, yMid + 0.035, 0.03, deckLift);
  // Citadel flank TeamColor banner
  teamHalf.addFrustumZ(MAT.TEAM, -1.55, 0.86, 1.44, 0.05, 0.11, -0.15, 0.82, 1.46, 0.05, 0.12);
  team.appendFrom(teamHalf);
  team.addMirroredFrom(teamHalf);
  // Central forward bow TeamColor chevron
  team.addFrustumZ(MAT.TEAM, 1.85, 0, 1.02, 0.13, 0.03, 2.55, 0, 0.98, 0.07, 0.025);

  // 1G. Articulated Child Meshes (CommandSpire, LaunchPulse_L/R, ThrusterGlow)
  const spire = new MeshBuilder();
  spire.addFrustumZ(MAT.GOLD, -0.32, 0, 0.0, 0.12, 0.04, 0.22, 0, 0.18, 0.05, 0.03);
  for (const sx of [-1, 1]) {
    spire.addFrustumZ(MAT.IVORY, -0.28, sx * 0.28, 0.12, 0.24, 0.025, 0.12, sx * 0.46, 0.26, 0.12, 0.02);
    spire.addFrustumZ(MAT.CYAN, -0.20, sx * 0.42, 0.22, 0.05, 0.02, 0.08, sx * 0.48, 0.27, 0.03, 0.015);
  }
  spire.addTubeZ(MAT.CYAN, -0.12, 0, 0.24, 0.06, 0.06, 0.18, 0, 0.28, 0.02, 0.02, 8, false);

  const makeLaunchPulse = () => {
    const p = new MeshBuilder();
    p.addFrustumZ(MAT.GOLD, -0.18, 0, 0, 0.11, 0.025, 0.18, 0, 0, 0.04, 0.02);
    p.addTubeZ(MAT.CYAN, -0.22, 0, 0.02, 0.07, 0.035, 0.24, 0, 0.02, 0.01, 0.01, 8, false);
    return p;
  };

  const thrusters = new MeshBuilder();
  for (const [ex, ey, er] of [[-0.68, -0.005, 0.13], [-0.26, 0.025, 0.16], [0.26, 0.025, 0.16], [0.68, -0.005, 0.13]]) {
    thrusters.addTubeZ(MAT.CYAN, -0.22, ex, ey, 0.02, 0.02, 0.04, ex, ey, er, er * 0.85, 10, true);
  }

  const nodes = [
    { name: 'FleetCarrier', translation: [0, 0, 0], children: [1] },
    { name: 'CarrierRig', translation: [0, yMid, 0], children: [2, 3, 4, 5, 6, 7, 8] },
    { name: 'CarrierHull', translation: [0, -yMid, 0], meshBuilder: hull, meshName: 'CarrierHullMesh' },
    { name: 'TeamColor', translation: [0, -yMid, 0], meshBuilder: team, meshName: 'TeamColorMesh' },
    { name: 'Hangar', translation: [0, -0.085, 0.52] }, // World [0, 0.84, 0.52] inside dark hangar threshold!
    { name: 'CommandSpire', translation: [0, 0.62, -0.95], meshBuilder: spire, meshName: 'CommandSpireMesh' },
    { name: 'LaunchPulse_L', translation: [-0.44, -0.125, 0.58], meshBuilder: makeLaunchPulse(), meshName: 'LaunchPulseLMesh' },
    { name: 'LaunchPulse_R', translation: [0.44, -0.125, 0.58], meshBuilder: makeLaunchPulse(), meshName: 'LaunchPulseRMesh' },
    { name: 'ThrusterGlow', translation: [0, 0.0, -2.74], meshBuilder: thrusters, meshName: 'CarrierThrusterMesh' }
  ];

  // Animations: idle, hover, attack, death
  const animations = [
    {
      name: 'idle',
      tracks: [
        { node: 1, path: 'translation', times: [0, 0.9, 1.8, 2.7, 3.6], values: [
          [0, yMid, 0], [0, yMid + 0.035, 0], [0, yMid + 0.06, 0], [0, yMid + 0.025, 0], [0, yMid, 0]
        ] },
        { node: 1, path: 'rotation', times: [0, 0.9, 1.8, 2.7, 3.6], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(-0.012, 0.008, 0.018),
          quatFromEulerXYZ(0.008, 0, -0.012), quatFromEulerXYZ(0.012, -0.008, -0.016), quatFromEulerXYZ(0, 0, 0)
        ] },
        { node: 5, path: 'rotation', times: [0, 1.8, 3.6], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(0.04, 0, 0), quatFromEulerXYZ(0, 0, 0)
        ] },
        { node: 8, path: 'scale', times: [0, 0.9, 1.8, 2.7, 3.6], values: [
          [1, 1, 1], [1.05, 1.05, 1.25], [0.96, 0.96, 0.90], [1.06, 1.06, 1.28], [1, 1, 1]
        ] }
      ]
    },
    {
      name: 'hover',
      tracks: [
        { node: 1, path: 'translation', times: [0, 0.6, 1.2, 1.8, 2.4], values: [
          [0, yMid + 0.10, 0], [0.025, yMid + 0.16, 0.02], [0, yMid + 0.11, 0.03], [-0.025, yMid + 0.17, 0.01], [0, yMid + 0.10, 0]
        ] },
        { node: 1, path: 'rotation', times: [0, 0.6, 1.2, 1.8, 2.4], values: [
          quatFromEulerXYZ(-0.02, 0, 0), quatFromEulerXYZ(-0.035, 0.015, 0.045),
          quatFromEulerXYZ(-0.015, 0, -0.01), quatFromEulerXYZ(-0.035, -0.015, -0.045), quatFromEulerXYZ(-0.02, 0, 0)
        ] },
        { node: 8, path: 'scale', times: [0, 0.6, 1.2, 1.8, 2.4], values: [
          [1.08, 1.08, 1.35], [1.15, 1.15, 1.65], [1.05, 1.05, 1.30], [1.16, 1.16, 1.70], [1.08, 1.08, 1.35]
        ] }
      ]
    },
    {
      name: 'attack',
      tracks: [
        // Carrier braces forward & absorbs twin catapult launch recoil
        { node: 1, path: 'translation', times: [0, 0.35, 0.75, 1.15, 1.6, 2.0], values: [
          [0, yMid, 0], [0, yMid + 0.08, 0.08], [0, yMid + 0.06, -0.10], [0, yMid + 0.05, -0.14], [0, yMid + 0.02, -0.03], [0, yMid, 0]
        ] },
        { node: 1, path: 'rotation', times: [0, 0.35, 0.75, 1.15, 1.6, 2.0], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(0.045, 0, 0), quatFromEulerXYZ(-0.03, 0, 0.02),
          quatFromEulerXYZ(-0.035, 0, -0.02), quatFromEulerXYZ(0.01, 0, 0), quatFromEulerXYZ(0, 0, 0)
        ] },
        // Port launch shuttle streaks down left launch lane
        { node: 6, path: 'translation', times: [0, 0.25, 0.72, 0.78, 1.4, 2.0], values: [
          [-0.44, -0.125, 0.58], [-0.44, -0.12, 0.62], [-0.44, -0.075, 2.58], [-0.44, -0.125, 0.50], [-0.44, -0.125, 0.58], [-0.44, -0.125, 0.58]
        ] },
        { node: 6, path: 'scale', times: [0, 0.25, 0.65, 0.78, 1.4, 2.0], values: [
          [1, 1, 1], [1.35, 1.35, 1.8], [1.4, 1.4, 2.2], [0.05, 0.05, 0.05], [1, 1, 1], [1, 1, 1]
        ] },
        // Starboard launch shuttle streaks down right launch lane in staggered salvo
        { node: 7, path: 'translation', times: [0, 0.50, 0.98, 1.05, 1.6, 2.0], values: [
          [0.44, -0.125, 0.58], [0.44, -0.12, 0.62], [0.44, -0.075, 2.58], [0.44, -0.125, 0.50], [0.44, -0.125, 0.58], [0.44, -0.125, 0.58]
        ] },
        { node: 7, path: 'scale', times: [0, 0.50, 0.92, 1.05, 1.6, 2.0], values: [
          [1, 1, 1], [1.35, 1.35, 1.8], [1.4, 1.4, 2.2], [0.05, 0.05, 0.05], [1, 1, 1], [1, 1, 1]
        ] },
        { node: 8, path: 'scale', times: [0, 0.4, 1.0, 2.0], values: [
          [1, 1, 1], [1.25, 1.25, 2.0], [1.15, 1.15, 1.6], [1, 1, 1]
        ] }
      ]
    },
    {
      name: 'death',
      tracks: [
        { node: 1, path: 'translation', times: [0, 0.25, 0.65, 1.35, 2.0, 2.5], values: [
          [0, yMid, 0], [-0.08, yMid + 0.12, -0.06], [0.06, yMid + 0.04, -0.12],
          [0.12, yMid - 0.18, -0.18], [0.16, yMid - 0.34, -0.22], [0.16, yMid - 0.36, -0.22]
        ] },
        { node: 1, path: 'rotation', times: [0, 0.25, 0.65, 1.35, 2.0, 2.5], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(-0.08, 0.04, -0.14), quatFromEulerXYZ(0.09, -0.06, 0.26),
          quatFromEulerXYZ(0.16, -0.12, 0.52), quatFromEulerXYZ(0.20, -0.15, 0.68), quatFromEulerXYZ(0.21, -0.15, 0.70)
        ] },
        { node: 5, path: 'rotation', times: [0, 0.4, 1.5, 2.5], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(-0.18, 0.1, 0.22),
          quatFromEulerXYZ(0.32, 0.18, 0.45), quatFromEulerXYZ(0.35, 0.20, 0.48)
        ] },
        { node: 6, path: 'scale', times: [0, 0.4, 2.5], values: [[1, 1, 1], [0.03, 0.03, 0.03], [0.03, 0.03, 0.03]] },
        { node: 7, path: 'scale', times: [0, 0.5, 2.5], values: [[1, 1, 1], [0.03, 0.03, 0.03], [0.03, 0.03, 0.03]] },
        { node: 8, path: 'scale', times: [0, 0.2, 0.7, 2.5], values: [[1, 1, 1], [1.5, 1.5, 2.2], [0.03, 0.03, 0.03], [0.03, 0.03, 0.03]] }
      ]
    }
  ];

  return { sceneName: 'ConcordFleetCarrier', nodes, animations, targetRadius: R, yMid };
}

// ============================================================================
// 2. PURSUIT FIGHTER (radius = 0.625, BeamOrigin anchor, floor Y = 0)
// Tiny metallic sliver fighter
// ============================================================================
function buildPursuitFighter() {
  const R = 0.625;
  const yMid = 0.18; // H = 0.36 -> H/2 = 0.18

  const hull = new MeshBuilder();
  const team = new MeshBuilder();

  // 2A. Faceted Metallic Sliver Fuselage (z in [-0.625, +0.625])
  // 8-point faceted diamond/chisel cross-section in SilverAlloy
  const fuseSpec = [
    [-R,     0.000, 0.180, 0.180, 0.180], // exact razor tail spine at -0.625
    [-0.54,  0.055, 0.135, 0.180, 0.235],
    [-0.36,  0.105, 0.090, 0.175, 0.285],
    [-0.10,  0.125, 0.065, 0.175, 0.335], // midship fuselage peak
    [0.16,   0.095, 0.085, 0.180, 0.285],
    [0.40,   0.052, 0.135, 0.180, 0.225],
    [0.57,   0.020, 0.165, 0.180, 0.195],
    [R,      0.000, 0.180, 0.180, 0.180]  // exact needle spear tip at +0.625
  ];
  const fuseStations = fuseSpec.map(([z, w, yLo, yCh, yHi]) => [
    [0, yHi, z],
    [w * 0.58, yHi * 0.65 + yCh * 0.35, z],
    [w, yCh, z],
    [w * 0.52, yLo * 0.65 + yCh * 0.35, z],
    [0, yLo, z],
    [-w * 0.52, yLo * 0.65 + yCh * 0.35, z],
    [-w, yCh, z],
    [-w * 0.58, yHi * 0.65 + yCh * 0.35, z]
  ]);
  hull.addLoft(MAT.SILVER, fuseStations, { capStart: false, capEnd: false, smooth: false });

  // Ventral Stabilizer Strake / Skid touching exact Y = 0.0!
  hull.addFrustumZ(MAT.DARK, -0.22, 0, 0.045, 0.018, 0.045, 0.16, 0, 0.045, 0.012, 0.045); // bottom at 0.045 - 0.045 = 0.0!
  hull.addFrustumZ(MAT.GOLD, -0.18, 0, 0.012, 0.024, 0.012, 0.14, 0, 0.012, 0.016, 0.012); // skid shoe at Y = 0.0!

  // Glowing Cyan Sliver Cockpit Canopy & Gold Harmonic Collar
  hull.addFrustumZ(MAT.CYAN, -0.14, 0, 0.315, 0.042, 0.032, 0.22, 0, 0.255, 0.020, 0.022);
  hull.addFrustumZ(MAT.GOLD, -0.22, 0, 0.325, 0.052, 0.025, -0.12, 0, 0.328, 0.046, 0.025);

  // Precision Twin Gold Nose Focusing Tines framing BeamOrigin (+0.625)
  for (const sx of [-1, 1]) {
    hull.addFrustumZ(MAT.GOLD, 0.36, sx * 0.038, 0.18, 0.014, 0.014, 0.605, sx * 0.012, 0.18, 0.004, 0.005);
  }
  hull.addTubeZ(MAT.CYAN, 0.52, 0, 0.18, 0.016, 0.016, 0.622, 0, 0.18, 0.004, 0.004, 6, false);

  // DarkMetal Aft Micro-Thruster Shroud
  hull.addTubeZ(MAT.DARK, -0.55, 0, 0.18, 0.042, 0.034, -0.42, 0, 0.18, 0.055, 0.042, 8, false);

  // Central Dorsal TeamColor Pennant Spine
  team.addFrustumZ(MAT.TEAM, -0.44, 0, 0.295, 0.026, 0.028, -0.18, 0, 0.335, 0.032, 0.028);

  // 2B. Swept Razor Sliver Wing Blades (Wing_L & Wing_R child nodes)
  const buildWing = (sign) => {
    const w = new MeshBuilder();
    // Local wing origin at [sign * 0.07, 0, -0.04] relative to FighterRig ([0, 0.18, 0])
    const s0 = [[0, 0.018, 0.26], [sign * 0.02, 0.0, 0.28], [0, -0.018, 0.26], [-sign * 0.01, 0, 0.24]];
    const s1 = [[sign * 0.09, 0.015, 0.02], [sign * 0.13, -0.004, 0.00], [sign * 0.09, -0.016, 0.02], [0, 0, 0.04]];
    const s2 = [[sign * 0.19, 0.010, -0.30], [sign * 0.225, -0.012, -0.40], [sign * 0.18, -0.018, -0.30], [sign * 0.03, 0, -0.22]];
    if (sign > 0) {
      w.addLoft(MAT.SILVER, [s2, s1, s0], { capStart: true, capEnd: true, smooth: false });
      // Gold leading razor edge & TeamColor squadron chevron
      w.addFrustumZ(MAT.GOLD, -0.36, 0.195, -0.006, 0.016, 0.009, 0.22, 0.03, 0.002, 0.012, 0.008);
      w.addBevelPlateXZ(MAT.TEAM, [[0.035, 0.10], [0.135, -0.08], [0.175, -0.28], [0.085, -0.22], [0.025, -0.04]], 0.006, 0.020, 0.006);
    } else {
      const posWing = buildWing(1);
      w.addMirroredFrom(posWing);
    }
    return w;
  };

  const beamFlash = new MeshBuilder();
  beamFlash.addTubeZ(MAT.CYAN, -0.03, 0, 0, 0.018, 0.018, 0.012, 0, 0, 0.003, 0.003, 6, false);

  const thruster = new MeshBuilder();
  thruster.addTubeZ(MAT.CYAN, -0.07, 0, 0, 0.006, 0.006, 0.02, 0, 0, 0.036, 0.026, 8, false);

  const nodes = [
    { name: 'PursuitFighter', translation: [0, 0, 0], children: [1] },
    { name: 'FighterRig', translation: [0, yMid, 0], children: [2, 3, 4, 5, 6, 7, 8] },
    { name: 'FighterHull', translation: [0, -yMid, 0], meshBuilder: hull, meshName: 'FighterHullMesh' },
    { name: 'TeamColor', translation: [0, -yMid, 0], meshBuilder: team, meshName: 'TeamColorMesh' },
    { name: 'Wing_L', translation: [-0.07, 0, -0.04], meshBuilder: buildWing(-1), meshName: 'FighterWingLMesh' },
    { name: 'Wing_R', translation: [0.07, 0, -0.04], meshBuilder: buildWing(1), meshName: 'FighterWingRMesh' },
    { name: 'BeamOrigin', translation: [0, 0, R] }, // World [0, 0.18, 0.625] exact nose tip!
    { name: 'BeamFlash', translation: [0, 0, 0.60], scale: [0.5, 0.5, 0.5], meshBuilder: beamFlash, meshName: 'FighterBeamFlashMesh' },
    { name: 'ThrusterGlow', translation: [0, 0, -0.53], meshBuilder: thruster, meshName: 'FighterThrusterMesh' }
  ];

  const animations = [
    {
      name: 'idle',
      tracks: [
        { node: 1, path: 'translation', times: [0, 0.6, 1.2, 1.8, 2.4], values: [
          [0, yMid, 0], [0, yMid + 0.018, 0], [0, yMid + 0.028, 0], [0, yMid + 0.012, 0], [0, yMid, 0]
        ] },
        { node: 1, path: 'rotation', times: [0, 0.6, 1.2, 1.8, 2.4], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(-0.015, 0.02, 0.04),
          quatFromEulerXYZ(0.01, 0, -0.02), quatFromEulerXYZ(0.015, -0.02, -0.04), quatFromEulerXYZ(0, 0, 0)
        ] },
        { node: 8, path: 'scale', times: [0, 0.6, 1.2, 1.8, 2.4], values: [
          [1, 1, 1], [1.1, 1.1, 1.35], [0.95, 0.95, 0.9], [1.12, 1.12, 1.4], [1, 1, 1]
        ] }
      ]
    },
    {
      name: 'hover',
      tracks: [
        { node: 1, path: 'translation', times: [0, 0.45, 0.9, 1.35, 1.8], values: [
          [0, yMid + 0.04, 0], [0.02, yMid + 0.07, 0.015], [0, yMid + 0.045, 0.02], [-0.02, yMid + 0.075, 0.01], [0, yMid + 0.04, 0]
        ] },
        { node: 1, path: 'rotation', times: [0, 0.45, 0.9, 1.35, 1.8], values: [
          quatFromEulerXYZ(-0.03, 0, 0), quatFromEulerXYZ(-0.04, 0.035, 0.12),
          quatFromEulerXYZ(-0.02, 0, -0.03), quatFromEulerXYZ(-0.04, -0.035, -0.12), quatFromEulerXYZ(-0.03, 0, 0)
        ] },
        { node: 4, path: 'rotation', times: [0, 0.9, 1.8], values: [
          quatFromEulerXYZ(0, 0, 0.06), quatFromEulerXYZ(0, 0, -0.04), quatFromEulerXYZ(0, 0, 0.06)
        ] },
        { node: 5, path: 'rotation', times: [0, 0.9, 1.8], values: [
          quatFromEulerXYZ(0, 0, -0.06), quatFromEulerXYZ(0, 0, 0.04), quatFromEulerXYZ(0, 0, -0.06)
        ] },
        { node: 8, path: 'scale', times: [0, 0.45, 0.9, 1.35, 1.8], values: [
          [1.15, 1.15, 1.5], [1.3, 1.3, 2.0], [1.1, 1.1, 1.4], [1.3, 1.3, 2.0], [1.15, 1.15, 1.5]
        ] }
      ]
    },
    {
      name: 'attack',
      tracks: [
        // Sharp predatory dart forward, beam pulse flash at BeamOrigin, crisp recoil & snap roll recovery
        { node: 1, path: 'translation', times: [0, 0.22, 0.38, 0.62, 1.0, 1.3], values: [
          [0, yMid, 0], [0, yMid + 0.05, 0.12], [0, yMid + 0.04, 0.04], [0, yMid + 0.03, -0.06], [0, yMid + 0.01, 0], [0, yMid, 0]
        ] },
        { node: 1, path: 'rotation', times: [0, 0.22, 0.38, 0.65, 1.0, 1.3], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(0.09, 0, 0.18), quatFromEulerXYZ(-0.06, 0, -0.10),
          quatFromEulerXYZ(-0.04, 0, 0.22), quatFromEulerXYZ(0.01, 0, -0.04), quatFromEulerXYZ(0, 0, 0)
        ] },
        { node: 4, path: 'rotation', times: [0, 0.25, 0.6, 1.3], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(0, 0.08, -0.14), quatFromEulerXYZ(0, -0.03, 0.06), quatFromEulerXYZ(0, 0, 0)
        ] },
        { node: 5, path: 'rotation', times: [0, 0.25, 0.6, 1.3], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(0, -0.08, 0.14), quatFromEulerXYZ(0, 0.03, -0.06), quatFromEulerXYZ(0, 0, 0)
        ] },
        { node: 7, path: 'scale', times: [0, 0.18, 0.28, 0.50, 1.3], values: [
          [0.5, 0.5, 0.5], [2.4, 2.4, 4.2], [2.8, 2.8, 5.0], [0.4, 0.4, 0.4], [0.5, 0.5, 0.5]
        ] },
        { node: 8, path: 'scale', times: [0, 0.22, 0.6, 1.3], values: [
          [1, 1, 1], [1.4, 1.4, 2.6], [0.9, 0.9, 1.1], [1, 1, 1]
        ] }
      ]
    },
    {
      name: 'death',
      tracks: [
        { node: 1, path: 'translation', times: [0, 0.18, 0.55, 1.05, 1.5, 1.8], values: [
          [0, yMid, 0], [0.04, yMid + 0.08, -0.05], [-0.05, yMid + 0.02, -0.12],
          [-0.08, yMid - 0.06, -0.16], [-0.09, yMid - 0.09, -0.18], [-0.09, yMid - 0.095, -0.18]
        ] },
        { node: 1, path: 'rotation', times: [0, 0.18, 0.55, 1.05, 1.5, 1.8], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(-0.22, 0.15, 0.45), quatFromEulerXYZ(0.28, -0.25, 1.15),
          quatFromEulerXYZ(0.35, -0.38, 1.65), quatFromEulerXYZ(0.38, -0.42, 1.82), quatFromEulerXYZ(0.38, -0.42, 1.84)
        ] },
        { node: 4, path: 'rotation', times: [0, 0.3, 1.2, 1.8], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(-0.2, -0.25, -0.45), quatFromEulerXYZ(-0.3, -0.35, -0.65), quatFromEulerXYZ(-0.3, -0.35, -0.65)
        ] },
        { node: 5, path: 'rotation', times: [0, 0.3, 1.2, 1.8], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(0.15, 0.22, 0.38), quatFromEulerXYZ(0.25, 0.30, 0.52), quatFromEulerXYZ(0.25, 0.30, 0.52)
        ] },
        { node: 7, path: 'scale', times: [0, 0.2, 1.8], values: [[0.5, 0.5, 0.5], [0.02, 0.02, 0.02], [0.02, 0.02, 0.02]] },
        { node: 8, path: 'scale', times: [0, 0.15, 0.45, 1.8], values: [[1, 1, 1], [1.8, 1.8, 2.5], [0.02, 0.02, 0.02], [0.02, 0.02, 0.02]] }
      ]
    }
  ];

  return { sceneName: 'ConcordPursuitFighter', nodes, animations, targetRadius: R, yMid };
}

// ============================================================================
// 3. HORIZON LANCER (radius = 2.5, BeamOrigin anchor, floor Y = 0)
// Long resonant horseshoe siege cruiser, cyan central accelerator
// ============================================================================
function buildHorizonLancer() {
  const R = 2.5;
  const yMid = 0.72; // H = 1.44 -> H/2 = 0.72

  const yoke = new MeshBuilder();
  const team = new MeshBuilder();

  // 3A. Aft Curved Horseshoe Yoke (z in [-2.50, -0.42])
  // Central stern hull from z = -2.50 (exact apex) to z = -0.56 (inner horseshoe U-wall!)
  const yokeSpec = [
    [-R,    0.00, 0.72, 0.72, 0.72], // exact stern apex (-2.5, yMid)
    [-2.28, 0.42, 0.36, 0.72, 1.04],
    [-1.90, 0.82, 0.08, 0.72, 1.24],
    [-1.45, 1.08, 0.00, 0.72, 1.32], // ventral keel touches exact Y = 0.0!
    [-0.95, 1.18, 0.00, 0.72, 1.28], // broadest curved horseshoe shoulder!
    [-0.68, 1.14, 0.08, 0.72, 1.16],
    [-0.54, 1.06, 0.24, 0.72, 1.04]  // transitions cleanly into twin outer prongs + central U-cavity
  ];
  const yokeStations = yokeSpec.map(([z, w, yLo, yCh, yHi]) => [
    [0, yHi, z],
    [w * 0.62, yHi * 0.88 + yCh * 0.12, z],
    [w, yCh + (yHi - yCh) * 0.25, z],
    [w, yCh - (yCh - yLo) * 0.25, z],
    [w * 0.68, yLo * 0.82 + yCh * 0.18, z],
    [w * 0.28, yLo, z],
    [0, yLo, z],
    [-w * 0.28, yLo, z],
    [-w * 0.68, yLo * 0.82 + yCh * 0.18, z],
    [-w, yCh - (yCh - yLo) * 0.25, z],
    [-w, yCh + (yHi - yCh) * 0.25, z],
    [-w * 0.62, yHi * 0.88 + yCh * 0.12, z]
  ]);
  yoke.addLoft(MAT.IVORY, yokeStations, { capStart: false, capEnd: true, smooth: true });

  // Dorsal Siege Command Citadel & Gold Harmonic Arch on the Horseshoe Yoke
  yoke.addFrustumZ(MAT.IVORY, -1.95, 0, 1.24, 0.28, 0.10, -0.82, 0, 1.32, 0.36, 0.12); // max Y = 1.44 = 2 * yMid!
  yoke.addFrustumZ(MAT.GOLD, -1.85, 0, 1.36, 0.16, 0.06, -0.78, 0, 1.40, 0.22, 0.04);
  yoke.addFrustumZ(MAT.CYAN, -0.88, 0, 1.33, 0.24, 0.045, -0.72, 0, 1.28, 0.20, 0.04); // Siege bridge visor
  yoke.addFrustumZ(MAT.GOLD, -R, 0, yMid, 0.0, 0.0, -2.22, 0, yMid, 0.24, 0.08, false, true); // Gold stern crest
  // DarkMetal Ventral Landing Skids at Y = 0.0
  for (const sx of [-0.34, 0.34]) {
    yoke.addFrustumZ(MAT.DARK, -1.52, sx, 0.035, 0.09, 0.035, -0.85, sx, 0.035, 0.09, 0.035);
  }
  // Curved Gold Shoulder Collars linking Yoke to Twin Horseshoe Prongs
  for (const sx of [-1, 1]) {
    yoke.addFrustumZ(MAT.GOLD, -0.85, sx * 0.78, yMid, 0.38, 0.32, -0.44, sx * 0.74, yMid, 0.34, 0.28);
  }
  // Aft DarkMetal Siege Thruster Housings
  for (const [ex, ey, er] of [[-0.52, 0.72, 0.16], [0, 0.74, 0.21], [0.52, 0.72, 0.16]]) {
    yoke.addTubeZ(MAT.DARK, -2.32, ex, ey, er * 0.8, er * 0.8, -1.95, ex, ey, er, er, 10, true);
    yoke.addRingZ(MAT.GOLD, ex, ey, -2.30, er * 0.65, er * 0.88, 0.025, 10);
  }

  // TeamColor Yoke Livery Crests
  for (const sx of [-1, 1]) {
    team.addBevelPlateXZ(MAT.TEAM, [
      [sx * 0.38, -1.85], [sx * 0.88, -1.52], [sx * 1.04, -0.75], [sx * 0.56, -0.68], [sx * 0.42, -1.35]
    ], 1.18, 1.25, 0.025);
  }

  // 3B. Twin Long Resonant Horseshoe Prongs (Prong_L & Prong_R, local origin [+-0.55, 0, -0.45] relative to LancerRig)
  // World Z spans [-0.55, +2.41], curving gracefully from outer horseshoe shoulder x=+-0.82 inward to x=+-0.46 at tip!
  const buildProng = (sign) => {
    const p = new MeshBuilder();
    if (sign < 0) {
      p.addMirroredFrom(buildProng(1));
      return p;
    }
    // Positive (+X / Starboard) prong in local space where node is at [+0.55, 0, -0.45] (world = local + [0.55, 0.72, -0.45])
    const prongCurve = [
      // [localZ, localCenterX, halfW, halfH] -> worldZ = localZ - 0.45, worldX = localCenterX + 0.55
      [-0.12, 0.22, 0.30, 0.27], // worldZ = -0.57, worldX = 0.77 (inner edge = 0.47 -> wide open 0.94 central throat!)
      [0.35,  0.24, 0.27, 0.25], // worldZ = -0.10, worldX = 0.79
      [0.95,  0.20, 0.24, 0.23], // worldZ = +0.50, worldX = 0.75
      [1.60,  0.14, 0.20, 0.20], // worldZ = +1.15, worldX = 0.69
      [2.20,  0.06, 0.16, 0.16], // worldZ = +1.75, worldX = 0.61
      [2.68, -0.04, 0.11, 0.11], // worldZ = +2.23, worldX = 0.51
      [2.86, -0.10, 0.02, 0.03]  // worldZ = +2.41, worldX = 0.45 -> hypot(0.47, 2.41) = 2.455 < 2.50!
    ];
    const pStations = prongCurve.map(([lz, lx, hw, hh]) => [
      [lx, hh, lz],
      [lx + hw * 0.72, hh * 0.78, lz],
      [lx + hw, 0, lz],
      [lx + hw * 0.72, -hh * 0.78, lz],
      [lx, -hh, lz],
      [lx - hw * 0.85, -hh * 0.58, lz], // flat/beveled inner resonance face pointing toward central accelerator!
      [lx - hw * 0.92, 0, lz],
      [lx - hw * 0.85, hh * 0.58, lz]
    ]);
    p.addLoft(MAT.IVORY, pStations, { capStart: true, capEnd: true, smooth: false });

    // Gold Outer Prong Trim & 5 Inner Resonant Tuning Teeth pointing at the Cyan Central Accelerator!
    for (let k = 0; k < 5; k++) {
      const lz = 0.35 + k * 0.52;
      const t = k / 4;
      const lx = 0.22 * (1 - t) + (-0.02) * t;
      const hw = 0.25 * (1 - t) + 0.13 * t;
      const inX = lx - hw * 0.88;
      // Gold harmonic tuning tooth protruding inward toward center accelerator
      p.addFrustumZ(MAT.GOLD, lz - 0.09, inX, 0, 0.05, 0.11 * (1 - 0.35 * t), lz + 0.09, inX - 0.09, 0, 0.07, 0.06 * (1 - 0.35 * t));
      p.addFrustumZ(MAT.CYAN, lz - 0.045, inX - 0.095, 0, 0.025, 0.045 * (1 - 0.3 * t), lz + 0.045, inX - 0.115, 0, 0.02, 0.035 * (1 - 0.3 * t));
    }
    // Gold Prong Spearhead Tip
    p.addFrustumZ(MAT.GOLD, 2.55, -0.02, 0, 0.12, 0.11, 2.87, -0.10, 0, 0.015, 0.02);

    // Bold TeamColor Dorsal Livery Band running down the length of each Horseshoe Prong!
    const liftProng = (x, z) => -0.065 * Math.max(0, (z - 0.3) / 2.2);
    p.addBevelPlateXZ(MAT.TEAM, [
      [0.10, 0.10], [0.34, 0.15], [0.24, 1.45], [0.06, 2.42], [-0.04, 2.38], [0.06, 1.40]
    ], 0.21, 0.265, 0.02, liftProng);

    return p;
  };

  // 3C. Cyan Central Accelerator (local to LancerRig [0, 0.72, 0], z in [-0.62, +2.50])
  const accel = new MeshBuilder();
  // Aft Siege Capacitor Crystal Dome nestled inside the horseshoe vertex
  accel.addTubeZ(MAT.DARK, -0.64, 0, 0, 0.26, 0.26, -0.46, 0, 0, 0.22, 0.22, 12, true);
  accel.addTubeZ(MAT.CYAN, -0.50, 0, 0, 0.19, 0.19, -0.22, 0, 0, 0.10, 0.10, 12, true);
  accel.addRingZ(MAT.GOLD, 0, 0, -0.45, 0.18, 0.28, 0.04, 12);

  // Continuous Radiant Cyan Central Accelerator Plasma Core Conduit (-0.30 -> +2.50 exact focal tip!)
  accel.addTubeZ(MAT.CYAN, -0.30, 0, 0, 0.075, 0.075, 2.32, 0, 0, 0.052, 0.052, 10, true, false, false);
  // Faceted Cyan Focal Crystal Lance reaching exact z = +2.50 at (0, yMid, +2.50)!
  accel.addTubeZ(MAT.CYAN, 2.28, 0, 0, 0.095, 0.095, R, 0, 0, 0.0, 0.0, 8, false, true, false);
  accel.addRingZ(MAT.GOLD, 0, 0, 2.26, 0.085, 0.145, 0.035, 8);

  // 4 Concentric Harmonic Accelerator Focusing Rings suspended down the open horseshoe throat!
  for (const [rz, rIn, rOut] of [[0.05, 0.15, 0.24], [0.68, 0.14, 0.22], [1.32, 0.125, 0.20], [1.92, 0.11, 0.175]]) {
    accel.addRingZ(MAT.GOLD, 0, 0, rz, rIn, rOut, 0.035, 10);
    accel.addRingZ(MAT.CYAN, 0, 0, rz, rIn - 0.025, rIn + 0.005, 0.022, 10);
  }

  const siegeFlash = new MeshBuilder();
  siegeFlash.addTubeZ(MAT.CYAN, -0.10, 0, 0, 0.08, 0.08, 0.10, 0, 0, 0.01, 0.01, 8, false);

  const thrusters = new MeshBuilder();
  for (const [ex, ey, er] of [[-0.52, 0, 0.12], [0, 0.02, 0.16], [0.52, 0, 0.12]]) {
    thrusters.addTubeZ(MAT.CYAN, -0.09, ex, ey, 0.02, 0.02, 0.03, ex, ey, er, er, 10, true);
  }

  const nodes = [
    { name: 'HorizonLancer', translation: [0, 0, 0], children: [1] },
    { name: 'LancerRig', translation: [0, yMid, 0], children: [2, 3, 4, 5, 6, 7, 8, 9] },
    { name: 'LancerYoke', translation: [0, -yMid, 0], meshBuilder: yoke, meshName: 'LancerYokeMesh' },
    { name: 'TeamColor', translation: [0, -yMid, 0], meshBuilder: team, meshName: 'TeamColorMesh' },
    { name: 'Prong_L', translation: [-0.55, 0, -0.45], meshBuilder: buildProng(-1), meshName: 'LancerProngLMesh' },
    { name: 'Prong_R', translation: [0.55, 0, -0.45], meshBuilder: buildProng(1), meshName: 'LancerProngRMesh' },
    { name: 'CentralAccelerator', translation: [0, 0, 0], meshBuilder: accel, meshName: 'CentralAcceleratorMesh' },
    { name: 'BeamOrigin', translation: [0, 0, R] }, // World [0, 0.72, 2.5] at cyan accelerator focal tip!
    { name: 'SiegeFlash', translation: [0, 0, 2.36], scale: [0.6, 0.6, 0.6], meshBuilder: siegeFlash, meshName: 'SiegeFlashMesh' },
    { name: 'ThrusterGlow', translation: [0, 0, -2.28], meshBuilder: thrusters, meshName: 'LancerThrusterMesh' }
  ];

  const animations = [
    {
      name: 'idle',
      tracks: [
        { node: 1, path: 'translation', times: [0, 0.8, 1.6, 2.4, 3.2], values: [
          [0, yMid, 0], [0, yMid + 0.03, 0], [0, yMid + 0.05, 0], [0, yMid + 0.02, 0], [0, yMid, 0]
        ] },
        { node: 1, path: 'rotation', times: [0, 0.8, 1.6, 2.4, 3.2], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(-0.01, 0.008, 0.015),
          quatFromEulerXYZ(0.008, 0, -0.01), quatFromEulerXYZ(0.01, -0.008, -0.015), quatFromEulerXYZ(0, 0, 0)
        ] },
        // Subtle harmonic resonance in central accelerator & prongs
        { node: 6, path: 'rotation', times: [0, 1.6, 3.2], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(0, 0, Math.PI * 0.25), quatFromEulerXYZ(0, 0, 0)
        ] },
        { node: 8, path: 'scale', times: [0, 1.6, 3.2], values: [[0.6, 0.6, 0.6], [0.95, 0.95, 1.1], [0.6, 0.6, 0.6]] }
      ]
    },
    {
      name: 'hover',
      tracks: [
        { node: 1, path: 'translation', times: [0, 0.55, 1.1, 1.65, 2.2], values: [
          [0, yMid + 0.08, 0], [0.02, yMid + 0.13, 0.02], [0, yMid + 0.09, 0.03], [-0.02, yMid + 0.14, 0.01], [0, yMid + 0.08, 0]
        ] },
        { node: 1, path: 'rotation', times: [0, 0.55, 1.1, 1.65, 2.2], values: [
          quatFromEulerXYZ(-0.02, 0, 0), quatFromEulerXYZ(-0.03, 0.018, 0.04),
          quatFromEulerXYZ(-0.015, 0, -0.015), quatFromEulerXYZ(-0.03, -0.018, -0.04), quatFromEulerXYZ(-0.02, 0, 0)
        ] },
        { node: 4, path: 'rotation', times: [0, 1.1, 2.2], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(0, -0.015, 0), quatFromEulerXYZ(0, 0, 0)
        ] },
        { node: 5, path: 'rotation', times: [0, 1.1, 2.2], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(0, 0.015, 0), quatFromEulerXYZ(0, 0, 0)
        ] },
        { node: 9, path: 'scale', times: [0, 0.55, 1.1, 1.65, 2.2], values: [
          [1.1, 1.1, 1.4], [1.2, 1.2, 1.8], [1.05, 1.05, 1.35], [1.22, 1.22, 1.85], [1.1, 1.1, 1.4]
        ] }
      ]
    },
    {
      name: 'attack',
      tracks: [
        // Prongs converge in harmonic resonance as cyan central accelerator charges, then heavy siege recoil!
        { node: 1, path: 'translation', times: [0, 0.55, 0.72, 0.95, 1.45, 1.9], values: [
          [0, yMid, 0], [0, yMid + 0.06, 0.06], [0, yMid + 0.05, -0.22], [0, yMid + 0.04, -0.26], [0, yMid + 0.02, -0.05], [0, yMid, 0]
        ] },
        { node: 1, path: 'rotation', times: [0, 0.55, 0.75, 1.05, 1.5, 1.9], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(0.025, 0, 0), quatFromEulerXYZ(-0.065, 0, 0),
          quatFromEulerXYZ(-0.045, 0, 0), quatFromEulerXYZ(0.01, 0, 0), quatFromEulerXYZ(0, 0, 0)
        ] },
        { node: 4, path: 'rotation', times: [0, 0.55, 0.75, 1.2, 1.9], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(0, -0.042, 0), quatFromEulerXYZ(0, 0.028, 0), quatFromEulerXYZ(0, -0.008, 0), quatFromEulerXYZ(0, 0, 0)
        ] },
        { node: 5, path: 'rotation', times: [0, 0.55, 0.75, 1.2, 1.9], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(0, 0.042, 0), quatFromEulerXYZ(0, -0.028, 0), quatFromEulerXYZ(0, 0.008, 0), quatFromEulerXYZ(0, 0, 0)
        ] },
        { node: 6, path: 'scale', times: [0, 0.55, 0.72, 1.1, 1.9], values: [
          [1, 1, 1], [1.28, 1.28, 1.0], [1.45, 1.45, 1.02], [0.95, 0.95, 1.0], [1, 1, 1]
        ] },
        { node: 8, path: 'scale', times: [0, 0.35, 0.62, 0.74, 1.1, 1.9], values: [
          [0.6, 0.6, 0.6], [1.8, 1.8, 1.8], [3.2, 3.2, 4.5], [3.8, 3.8, 6.0], [0.5, 0.5, 0.5], [0.6, 0.6, 0.6]
        ] },
        { node: 9, path: 'scale', times: [0, 0.55, 0.85, 1.9], values: [
          [1, 1, 1], [0.9, 0.9, 0.9], [1.35, 1.35, 2.2], [1, 1, 1]
        ] }
      ]
    },
    {
      name: 'death',
      tracks: [
        { node: 1, path: 'translation', times: [0, 0.25, 0.65, 1.3, 1.9, 2.4], values: [
          [0, yMid, 0], [0.06, yMid + 0.10, -0.08], [-0.08, yMid + 0.02, -0.15],
          [-0.14, yMid - 0.16, -0.22], [-0.18, yMid - 0.28, -0.26], [-0.18, yMid - 0.30, -0.26]
        ] },
        { node: 1, path: 'rotation', times: [0, 0.25, 0.65, 1.3, 1.9, 2.4], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(-0.10, -0.06, 0.18), quatFromEulerXYZ(0.12, 0.08, -0.34),
          quatFromEulerXYZ(0.20, 0.14, -0.62), quatFromEulerXYZ(0.24, 0.18, -0.78), quatFromEulerXYZ(0.25, 0.18, -0.80)
        ] },
        // Horseshoe prongs splay & droop as resonance field collapses
        { node: 4, path: 'rotation', times: [0, 0.4, 1.4, 2.4], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(0.08, 0.08, -0.12), quatFromEulerXYZ(0.16, 0.14, -0.22), quatFromEulerXYZ(0.17, 0.15, -0.24)
        ] },
        { node: 5, path: 'rotation', times: [0, 0.4, 1.4, 2.4], values: [
          quatFromEulerXYZ(0, 0, 0), quatFromEulerXYZ(0.10, -0.09, 0.14), quatFromEulerXYZ(0.19, -0.16, 0.25), quatFromEulerXYZ(0.20, -0.17, 0.27)
        ] },
        { node: 6, path: 'scale', times: [0, 0.2, 0.75, 2.4], values: [[1, 1, 1], [1.35, 1.35, 1], [0.08, 0.08, 0.98], [0.05, 0.05, 0.95]] },
        { node: 8, path: 'scale', times: [0, 0.2, 0.5, 2.4], values: [[0.6, 0.6, 0.6], [2.2, 2.2, 2.2], [0.02, 0.02, 0.02], [0.02, 0.02, 0.02]] },
        { node: 9, path: 'scale', times: [0, 0.2, 0.6, 2.4], values: [[1, 1, 1], [1.6, 1.6, 2.2], [0.02, 0.02, 0.02], [0.02, 0.02, 0.02]] }
      ]
    }
  ];

  return { sceneName: 'ConcordHorizonLancer', nodes, animations, targetRadius: R, yMid };
}

// ============================================================================
// Spec-Compliant glTF 2.0 Binary (.glb) Serializer
// ============================================================================
function compileGLB(model) {
  const chunks = [];
  let byteOffset = 0;

  const bufferViews = [];
  const accessors = [];
  const meshes = [];

  function pushBytes(typedArr, target) {
    const raw = Buffer.from(typedArr.buffer, typedArr.byteOffset, typedArr.byteLength);
    const pad = (4 - (raw.length % 4)) % 4;
    const bv = { buffer: 0, byteOffset, byteLength: raw.length };
    if (target !== undefined) bv.target = target;
    const bvIdx = bufferViews.length;
    bufferViews.push(bv);
    chunks.push(raw);
    if (pad > 0) chunks.push(Buffer.alloc(pad, 0));
    byteOffset += raw.length + pad;
    return bvIdx;
  }

  function addFloatAccessor(arr, type, count, target, withMinMax = false) {
    const f32 = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) f32[i] = arr[i];
    const bv = pushBytes(f32, target);
    const acc = { bufferView: bv, componentType: 5126, count, type };
    if (withMinMax) {
      const comps = type === 'SCALAR' ? 1 : type === 'VEC2' ? 2 : type === 'VEC3' ? 3 : 4;
      const min = Array(comps).fill(Infinity), max = Array(comps).fill(-Infinity);
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < comps; c++) {
          const v = f32[i * comps + c];
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

  function addIndexAccessor(arr) {
    const maxIdx = arr.reduce((m, v) => (v > m ? v : m), 0);
    const use32 = maxIdx > 65535;
    const typed = use32 ? new Uint32Array(arr) : new Uint16Array(arr);
    const bv = pushBytes(typed, 34963);
    const idx = accessors.length;
    accessors.push({
      bufferView: bv,
      componentType: use32 ? 5125 : 5123,
      count: typed.length,
      type: 'SCALAR',
      min: [0],
      max: [maxIdx]
    });
    return idx;
  }

  // Build glTF nodes & meshes
  const gltfNodes = model.nodes.map((n) => {
    const gn = { name: n.name };
    if (n.translation) gn.translation = n.translation.map(Math.fround);
    if (n.rotation) gn.rotation = n.rotation.map(Math.fround);
    if (n.scale) gn.scale = n.scale.map(Math.fround);
    if (n.children && n.children.length > 0) gn.children = n.children.slice();
    if (n.meshBuilder) {
      const primitives = [];
      const sortedMats = Array.from(n.meshBuilder.buckets.keys()).sort((a, b) => a - b);
      for (const matIdx of sortedMats) {
        const b = n.meshBuilder.buckets.get(matIdx);
        if (b.idx.length === 0) continue;
        const vCount = b.pos.length / 3;
        // Ensure strict unit-length normals in Float32
        const cleanNorm = new Float32Array(b.norm.length);
        for (let i = 0; i < b.norm.length; i += 3) {
          const f = new Float32Array([b.norm[i], b.norm[i + 1], b.norm[i + 2]]);
          const l = Math.hypot(f[0], f[1], f[2]) || 1;
          cleanNorm[i] = f[0] / l; cleanNorm[i + 1] = f[1] / l; cleanNorm[i + 2] = f[2] / l;
        }
        const posAcc = addFloatAccessor(b.pos, 'VEC3', vCount, 34962, true);
        const normAcc = addFloatAccessor(cleanNorm, 'VEC3', vCount, 34962, false);
        const uvAcc = addFloatAccessor(b.uv, 'VEC2', vCount, 34962, false);
        const idxAcc = addIndexAccessor(b.idx);
        primitives.push({
          attributes: { POSITION: posAcc, NORMAL: normAcc, TEXCOORD_0: uvAcc },
          indices: idxAcc,
          material: matIdx,
          mode: 4
        });
      }
      gn.mesh = meshes.length;
      meshes.push({ name: n.meshName || `${n.name}Mesh`, primitives });
    }
    return gn;
  });

  // Build glTF animations (omitting bufferView.target per glTF 2.0 spec!)
  const gltfAnimations = model.animations.map((anim) => {
    const samplers = [];
    const channels = [];
    for (const tr of anim.tracks) {
      const count = tr.times.length;
      const inputAcc = addFloatAccessor(tr.times, 'SCALAR', count, undefined, true);
      const isRot = tr.path === 'rotation';
      const flat = [];
      let prevQ = null;
      for (const val of tr.values) {
        if (isRot) {
          let q = val.slice();
          if (prevQ && (prevQ[0] * q[0] + prevQ[1] * q[1] + prevQ[2] * q[2] + prevQ[3] * q[3]) < 0) {
            q = [-q[0], -q[1], -q[2], -q[3]];
          }
          const f = new Float32Array(q);
          const l = Math.hypot(f[0], f[1], f[2], f[3]) || 1;
          q = [f[0] / l, f[1] / l, f[2] / l, f[3] / l];
          prevQ = q;
          flat.push(q[0], q[1], q[2], q[3]);
        } else {
          flat.push(val[0], val[1], val[2]);
        }
      }
      const outputAcc = addFloatAccessor(flat, isRot ? 'VEC4' : 'VEC3', count, undefined, false);
      const sIdx = samplers.length;
      samplers.push({ input: inputAcc, interpolation: 'LINEAR', output: outputAcc });
      channels.push({ sampler: sIdx, target: { node: tr.node, path: tr.path } });
    }
    return { name: anim.name, channels, samplers };
  });

  const binBuffer = Buffer.concat(chunks);
  const gltf = {
    asset: { version: '2.0', generator: 'Starfall Concord Fleet Generator v1.0' },
    scene: 0,
    scenes: [{ name: model.sceneName, nodes: [0] }],
    nodes: gltfNodes,
    meshes,
    materials: MATERIALS,
    animations: gltfAnimations,
    buffers: [{ byteLength: binBuffer.length }],
    bufferViews,
    accessors
  };

  const jsonRaw = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
  const jsonChunk = jsonPad > 0 ? Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]) : jsonRaw;

  const totalLen = 12 + 8 + jsonChunk.length + 8 + binBuffer.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);          // version 2
  header.writeUInt32LE(totalLen, 8);

  const jsonHdr = Buffer.alloc(8);
  jsonHdr.writeUInt32LE(jsonChunk.length, 0);
  jsonHdr.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binHdr = Buffer.alloc(8);
  binHdr.writeUInt32LE(binBuffer.length, 0);
  binHdr.writeUInt32LE(0x004e4942, 4);  // 'BIN\0'

  return Buffer.concat([header, jsonHdr, jsonChunk, binHdr, binBuffer]);
}

// --- World-Space Rest-Pose Bounds Verification ---
function computeRestBounds(model) {
  const worldOffset = (nodeIdx) => {
    let tx = 0, ty = 0, tz = 0;
    const findChain = (curr, target, acc) => {
      const n = model.nodes[curr];
      const next = [...acc, n];
      if (curr === target) return next;
      for (const c of n.children || []) {
        const res = findChain(c, target, next);
        if (res) return res;
      }
      return null;
    };
    const chain = findChain(0, nodeIdx, []);
    let sx = 1, sy = 1, sz = 1;
    for (const n of chain) {
      const t = n.translation || [0, 0, 0];
      tx += t[0] * sx; ty += t[1] * sy; tz += t[2] * sz;
      const s = n.scale || [1, 1, 1];
      sx *= s[0]; sy *= s[1]; sz *= s[2];
    }
    return { tx, ty, tz, sx, sy, sz };
  };

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let maxXZ = 0, maxSphere = 0, triCount = 0;

  model.nodes.forEach((n, idx) => {
    if (!n.meshBuilder) return;
    const { tx, ty, tz, sx, sy, sz } = worldOffset(idx);
    for (const b of n.meshBuilder.buckets.values()) {
      triCount += b.idx.length / 3;
      for (let i = 0; i < b.pos.length; i += 3) {
        const x = Math.fround(b.pos[i] * sx + tx);
        const y = Math.fround(b.pos[i + 1] * sy + ty);
        const z = Math.fround(b.pos[i + 2] * sz + tz);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        const rXZ = Math.hypot(x, z);
        if (rXZ > maxXZ) maxXZ = rXZ;
        const r3D = Math.hypot(x, y - model.yMid, z);
        if (r3D > maxSphere) maxSphere = r3D;
      }
    }
  });
  return { minX, maxX, minY, maxY, minZ, maxZ, maxXZ, maxSphere, triCount };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const specs = [
    { file: 'fleet_carrier.glb', build: buildFleetCarrier },
    { file: 'pursuit_fighter.glb', build: buildPursuitFighter },
    { file: 'horizon_lancer.glb', build: buildHorizonLancer }
  ];

  for (const s of specs) {
    const model = s.build();
    const glb = compileGLB(model);
    const outPath = path.join(OUT_DIR, s.file);
    fs.writeFileSync(outPath, glb);
    const sha256 = crypto.createHash('sha256').update(glb).digest('hex');
    const b = computeRestBounds(model);
    console.log(
      `${s.file} | ${glb.length}B | tris=${b.triCount} | floorY=${b.minY.toFixed(4)} | ` +
      `rXZ=${b.maxXZ.toFixed(4)} | r3D=${b.maxSphere.toFixed(4)} | sha256=${sha256}`
    );
  }
}

if (require.main === module) main();
module.exports = { buildFleetCarrier, buildPursuitFighter, buildHorizonLancer, compileGLB };
