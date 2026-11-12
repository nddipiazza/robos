'use strict';

const fs = require('node:fs');
const path = require('node:path');

const OUT_DIR = __dirname;

// Material indices shared across Concord air fleet
const MAT = {
  IVORY: 0,
  GOLD: 1,
  ALLOY: 2,
  TEAM: 3,
  CYAN: 4,
  PRISM: 5,
};

function createMaterials(includePrism) {
  const mats = [
    {
      name: 'IvoryHull',
      pbrMetallicRoughness: {
        baseColorFactor: [0.94, 0.91, 0.84, 1.0],
        metallicFactor: 0.28,
        roughnessFactor: 0.24,
      },
    },
    {
      name: 'PolishedGold',
      pbrMetallicRoughness: {
        baseColorFactor: [0.98, 0.78, 0.30, 1.0],
        metallicFactor: 0.92,
        roughnessFactor: 0.15,
      },
      emissiveFactor: [0.06, 0.04, 0.01],
    },
    {
      name: 'DarkAlloy',
      pbrMetallicRoughness: {
        baseColorFactor: [0.22, 0.25, 0.32, 1.0],
        metallicFactor: 0.86,
        roughnessFactor: 0.24,
      },
    },
    {
      name: 'TeamColor',
      pbrMetallicRoughness: {
        baseColorFactor: [0.14, 0.44, 0.90, 1.0],
        metallicFactor: 0.30,
        roughnessFactor: 0.28,
      },
    },
    {
      name: 'CyanEnergy',
      pbrMetallicRoughness: {
        baseColorFactor: [0.22, 0.95, 1.00, 1.0],
        metallicFactor: 0.10,
        roughnessFactor: 0.12,
      },
      emissiveFactor: [0.18, 0.90, 1.00],
    },
  ];
  if (includePrism) {
    mats.push({
      name: 'CyanPrism',
      alphaMode: 'BLEND',
      pbrMetallicRoughness: {
        baseColorFactor: [0.20, 0.90, 1.00, 0.76],
        metallicFactor: 0.18,
        roughnessFactor: 0.07,
      },
      emissiveFactor: [0.12, 0.62, 0.82],
    });
  }
  return mats;
}

// --- Math Helpers ---
const v3 = (x, y, z) => [x, y, z];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function norm3(a) {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
}
function quatEuler(rx, ry, rz) {
  const cx = Math.cos(rx * 0.5), sx = Math.sin(rx * 0.5);
  const cy = Math.cos(ry * 0.5), sy = Math.sin(ry * 0.5);
  const cz = Math.cos(rz * 0.5), sz = Math.sin(rz * 0.5);
  // Intrinsic YXZ (yaw, pitch, roll)
  const qx = cy * sx * cz + sy * cx * sz;
  const qy = sy * cx * cz - cy * sx * sz;
  const qz = cy * cx * sz - sy * sx * cz;
  const qw = cy * cx * cz + sy * sx * sz;
  const l = Math.hypot(qx, qy, qz, qw) || 1;
  return [qx / l, qy / l, qz / l, qw / l];
}
function ensureQuatContinuity(quats) {
  const out = [];
  for (let i = 0; i < quats.length; i++) {
    let q = quats[i].slice();
    if (i > 0) {
      const p = out[i - 1];
      if (p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3] < 0) {
        q = [-q[0], -q[1], -q[2], -q[3]];
      }
    }
    out.push(q);
  }
  return out;
}

// --- Sculpted Mesh Builder with Crease-Angle Normals ---
class PartBuilder {
  constructor() {
    this.tris = []; // { p0, p1, p2, mat, group, crease }
  }

  addTri(p0, p1, p2, mat, group = 0, creaseDeg = 38) {
    const e1 = sub3(p1, p0);
    const e2 = sub3(p2, p0);
    const fn = cross3(e1, e2);
    if (Math.hypot(fn[0], fn[1], fn[2]) < 1e-9) return;
    this.tris.push({ p0, p1, p2, fn, mat, group, crease: Math.cos((creaseDeg * Math.PI) / 180) });
  }

  addQuad(p0, p1, p2, p3, mat, group = 0, creaseDeg = 38) {
    this.addTri(p0, p1, p2, mat, group, creaseDeg);
    this.addTri(p0, p2, p3, mat, group, creaseDeg);
  }

  mirrorFrom(other) {
    const mx = (p) => [-p[0], p[1], p[2]];
    for (const t of other.tris) {
      this.addTri(mx(t.p0), mx(t.p2), mx(t.p1), t.mat, t.group, (Math.acos(Math.max(-1, Math.min(1, t.crease))) * 180) / Math.PI);
    }
    return this;
  }

  translate(dx, dy, dz) {
    const d = [dx, dy, dz];
    for (const t of this.tris) {
      t.p0 = add3(t.p0, d);
      t.p1 = add3(t.p1, d);
      t.p2 = add3(t.p2, d);
    }
    return this;
  }

  addOutwardTri(p0, p1, p2, insidePt, mat, group = 0, creaseDeg = 38) {
    const fn = cross3(sub3(p1, p0), sub3(p2, p0));
    const mid = [(p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3, (p0[2] + p1[2] + p2[2]) / 3];
    if (dot3(fn, sub3(mid, insidePt)) >= 0) {
      this.addTri(p0, p1, p2, mat, group, creaseDeg);
    } else {
      this.addTri(p0, p2, p1, mat, group, creaseDeg);
    }
  }

  addOutwardQuad(p0, p1, p2, p3, insidePt, mat, group = 0, creaseDeg = 38) {
    const fn = cross3(sub3(p1, p0), sub3(p2, p0));
    const mid = [
      (p0[0] + p1[0] + p2[0] + p3[0]) * 0.25,
      (p0[1] + p1[1] + p2[1] + p3[1]) * 0.25,
      (p0[2] + p1[2] + p2[2] + p3[2]) * 0.25,
    ];
    if (dot3(fn, sub3(mid, insidePt)) >= 0) {
      this.addQuad(p0, p1, p2, p3, mat, group, creaseDeg);
    } else {
      this.addQuad(p0, p3, p2, p1, mat, group, creaseDeg);
    }
  }

  loftRings(rings, mat, group = 1, creaseDeg = 38, capStart = true, capEnd = true, startTip = null, endTip = null) {
    const nR = rings.length;
    const m = rings[0].length;
    const centroids = rings.map((r) => r.reduce((acc, p) => add3(acc, p), [0, 0, 0]).map((v) => v / m));
    for (let i = 0; i < nR - 1; i++) {
      const rA = rings[i];
      const rB = rings[i + 1];
      const inside = mul3(add3(centroids[i], centroids[i + 1]), 0.5);
      for (let j = 0; j < m; j++) {
        const j2 = (j + 1) % m;
        this.addOutwardQuad(rA[j], rA[j2], rB[j2], rB[j], inside, mat, group, creaseDeg);
      }
    }
    if (capStart) {
      const r0 = rings[0];
      const c = startTip || centroids[0];
      const inside = centroids[Math.min(1, nR - 1)];
      for (let j = 0; j < m; j++) {
        this.addOutwardTri(c, r0[(j + 1) % m], r0[j], inside, mat, group + 100, creaseDeg);
      }
    }
    if (capEnd) {
      const rN = rings[nR - 1];
      const c = endTip || centroids[nR - 1];
      const inside = centroids[Math.max(0, nR - 2)];
      for (let j = 0; j < m; j++) {
        this.addOutwardTri(c, rN[j], rN[(j + 1) % m], inside, mat, group + 101, creaseDeg);
      }
    }
    return this;
  }

  addPlateStrip(upperPtsA, upperPtsB, lowerPtsA, lowerPtsB, mat, group = 2, creaseDeg = 25) {
    const n = upperPtsA.length;
    const segInside = (i) => {
      const pts = [
        upperPtsA[i], upperPtsB[i], upperPtsA[i + 1], upperPtsB[i + 1],
        lowerPtsA[i], lowerPtsB[i], lowerPtsA[i + 1], lowerPtsB[i + 1],
      ];
      return pts.reduce((acc, p) => add3(acc, p), [0, 0, 0]).map((v) => v / 8);
    };
    for (let i = 0; i < n - 1; i++) {
      const ins = segInside(i);
      this.addOutwardQuad(upperPtsA[i], upperPtsB[i], upperPtsB[i + 1], upperPtsA[i + 1], ins, mat, group, creaseDeg);
      this.addOutwardQuad(lowerPtsA[i], lowerPtsA[i + 1], lowerPtsB[i + 1], lowerPtsB[i], ins, mat, group, creaseDeg);
      this.addOutwardQuad(upperPtsA[i], upperPtsA[i + 1], lowerPtsA[i + 1], lowerPtsA[i], ins, mat, group + 1, 15);
      this.addOutwardQuad(upperPtsB[i], lowerPtsB[i], lowerPtsB[i + 1], upperPtsB[i + 1], ins, mat, group + 1, 15);
    }
    this.addOutwardQuad(upperPtsA[0], lowerPtsA[0], lowerPtsB[0], upperPtsB[0], segInside(0), mat, group + 2, 15);
    this.addOutwardQuad(upperPtsA[n - 1], upperPtsB[n - 1], lowerPtsB[n - 1], lowerPtsA[n - 1], segInside(n - 2), mat, group + 2, 15);
  }

  buildPrimitives() {
    const byMat = new Map();
    for (const t of this.tris) {
      if (!byMat.has(t.mat)) byMat.set(t.mat, []);
      byMat.get(t.mat).push(t);
    }
    const prims = [];
    const sortedMats = Array.from(byMat.keys()).sort((a, b) => a - b);
    for (const mat of sortedMats) {
      const list = byMat.get(mat);
      // Spatial weld bucket per (group, quantized pos)
      const buckets = new Map();
      const keyOf = (p, g) => `${g}:${Math.round(p[0] * 20000)},${Math.round(p[1] * 20000)},${Math.round(p[2] * 20000)}`;
      list.forEach((t, ti) => {
        const ufn = norm3(t.fn);
        t.ufn = ufn;
        for (const p of [t.p0, t.p1, t.p2]) {
          const k = keyOf(p, t.group);
          if (!buckets.has(k)) buckets.set(k, []);
          buckets.get(k).push(ti);
        }
      });

      const positions = [];
      const normals = [];
      const indices = [];
      const vertDedup = new Map();

      for (let ti = 0; ti < list.length; ti++) {
        const t = list[ti];
        const pts = [t.p0, t.p1, t.p2];
        const triIdx = [];
        for (let vi = 0; vi < 3; vi++) {
          const p = pts[vi];
          const adj = buckets.get(keyOf(p, t.group));
          let nx = 0, ny = 0, nz = 0;
          for (const oi of adj) {
            const o = list[oi];
            if (dot3(t.ufn, o.ufn) >= t.crease) {
              nx += o.fn[0];
              ny += o.fn[1];
              nz += o.fn[2];
            }
          }
          const n = norm3([nx || t.ufn[0], ny || t.ufn[1], nz || t.ufn[2]]);
          const vk = `${p[0].toFixed(5)},${p[1].toFixed(5)},${p[2].toFixed(5)}|${n[0].toFixed(4)},${n[1].toFixed(4)},${n[2].toFixed(4)}`;
          let idx = vertDedup.get(vk);
          if (idx === undefined) {
            idx = positions.length / 3;
            positions.push(p[0], p[1], p[2]);
            normals.push(n[0], n[1], n[2]);
            vertDedup.set(vk, idx);
          }
          triIdx.push(idx);
        }
        if (triIdx[0] !== triIdx[1] && triIdx[1] !== triIdx[2] && triIdx[2] !== triIdx[0]) {
          indices.push(triIdx[0], triIdx[1], triIdx[2]);
        }
      }
      if (indices.length > 0) {
        prims.push({
          mat,
          positions: new Float32Array(positions),
          normals: new Float32Array(normals),
          indices: new Uint16Array(indices),
        });
      }
    }
    return prims;
  }
}

// Helper: 8-point chamfered Concord octagonal ring in XY at Z (outward normals when Z increases from station i to i+1)
// Note: Looking along +Z (right = -X, up = +Y), CCW around +Z goes:
// TopRight(-x,+y) -> TopLeft(+x,+y) -> MidLeft(+x,cy) -> BotLeft(+x,-y) -> BotRight(-x,-y) -> MidRight(-x,cy)
// Let's verify cross((rA[1]-rA[0]), (rB[0]-rA[0]))!
// Wait: rA[0] = (0, +topH, z0), rA[1] = (-deckW, +topH, z0), rB[0] = (0, +topH, z1) with z1 > z0:
// e1 = rA[1]-rA[0] = (-deckW, 0, 0); e2 = rB[0]-rA[0] = (0, 0, +dz).
// cross(e1, e2) = (0*dz - 0, 0 - (-deckW)*dz, 0) = (0, +deckW*dz, 0) = +Y UPWARD OUTWARD!
// Awesome! That means going around -X -> -Y -> +X -> +Y gives exact outward CCW normals when z increases!
function makeOctRingZ(z, yOff, w, topH, botH, chineY = 0, deckRatio = 0.46, bellyRatio = 0.52) {
  const dw = w * deckRatio;
  const sw = w * 0.84;
  const bw = w * bellyRatio;
  return [
    [0, yOff + topH, z],
    [-dw, yOff + topH * 0.94, z],
    [-sw, yOff + topH * 0.52, z],
    [-w, yOff + chineY, z],
    [-bw, yOff - botH * 0.85, z],
    [0, yOff - botH, z],
    [bw, yOff - botH * 0.85, z],
    [w, yOff + chineY, z],
    [sw, yOff + topH * 0.52, z],
    [dw, yOff + topH * 0.94, z],
  ];
}

// General 3D oriented frame ring: given center C, forward F (unit), up U (unit):
// Right-hand basis where cross(e_ring, F) points outward:
// Let S = cross(F, U) (starboard/-X when F=+Z, U=+Y). Going +U -> +S -> -U -> -S gives outward normals!
function makeOrientedRing(center, forward, upHint, profile2D) {
  const F = norm3(forward);
  const S = norm3(cross3(F, upHint));
  const U = norm3(cross3(S, F));
  return profile2D.map(([s, u]) => [
    center[0] + S[0] * s + U[0] * u,
    center[1] + S[1] * s + U[1] * u,
    center[2] + S[2] * s + U[2] * u,
  ]);
}

function addCylinderZ(pb, cx, cy, z0, z1, r0, r1, sides, mat, group, cap0 = true, cap1 = true) {
  const ring0 = [];
  const ring1 = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    // +U = cos(a), +S (-X) = sin(a) -> x = cx - sin(a)*r, y = cy + cos(a)*r
    const sx = -Math.sin(a), uy = Math.cos(a);
    ring0.push([cx + sx * r0, cy + uy * r0, z0]);
    ring1.push([cx + sx * r1, cy + uy * r1, z1]);
  }
  pb.loftRings([ring0, ring1], mat, group, 45, cap0, cap1);
}

function addTorus(pb, center, axisMode, majorR, minorR, segMajor, segMinor, mat, group) {
  const rings = [];
  for (let i = 0; i <= segMajor; i++) {
    const t = (i % segMajor) / segMajor * Math.PI * 2;
    let c, tang, up;
    if (axisMode === 'Z') {
      c = [center[0] + Math.cos(t) * majorR, center[1] + Math.sin(t) * majorR, center[2]];
      tang = [-Math.sin(t), Math.cos(t), 0];
      up = [0, 0, 1];
    } else if (axisMode === 'Y') {
      c = [center[0] + Math.cos(t) * majorR, center[1], center[2] + Math.sin(t) * majorR];
      tang = [-Math.sin(t), 0, Math.cos(t)];
      up = [0, 1, 0];
    } else {
      c = [center[0], center[1] + Math.cos(t) * majorR, center[2] + Math.sin(t) * majorR];
      tang = [0, -Math.sin(t), Math.cos(t)];
      up = [1, 0, 0];
    }
    const prof = [];
    for (let j = 0; j < segMinor; j++) {
      const b = (j / segMinor) * Math.PI * 2;
      prof.push([Math.sin(b) * minorR, Math.cos(b) * minorR]);
    }
    rings.push(makeOrientedRing(c, tang, up, prof));
  }
  pb.loftRings(rings, mat, group, 48, false, false);
}

function addFacetedBipyramidZ(pb, cx, cy, zBack, zMid, zFront, rx, ry, sides, mat, group) {
  const mid = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
    mid.push([cx - Math.sin(a) * rx, cy + Math.cos(a) * ry, zMid]);
  }
  const pBack = [cx, cy, zBack];
  const pFront = [cx, cy, zFront];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    pb.addTri(pBack, mid[j], mid[i], mat, group, 5);
    pb.addTri(pFront, mid[i], mid[j], mat, group + 1, 5);
  }
}

// Extrude a closed 2D polygon in YZ with X thickness [x0, x1] (for crisp dorsal/ventral fins)
function addFinYZ(pb, polyYZ, xCenter, halfThickTop, halfThickBot, mat, group, crease = 22) {
  // Ensure polyYZ is CCW in (Z, Y) -> cross((z1-z0, y1-y0), +X)
  let area = 0;
  for (let i = 0; i < polyYZ.length; i++) {
    const [y0, z0] = polyYZ[i];
    const [y1, z1] = polyYZ[(i + 1) % polyYZ.length];
    area += z0 * y1 - z1 * y0;
  }
  const pts = area >= 0 ? polyYZ : polyYZ.slice().reverse();
  const n = pts.length;
  const cy = pts.reduce((s, p) => s + p[0], 0) / n;
  const cz = pts.reduce((s, p) => s + p[1], 0) / n;
  const yMin = Math.min(...pts.map((p) => p[0]));
  const yMax = Math.max(...pts.map((p) => p[0]));
  const htOf = (y) => lerp(halfThickBot, halfThickTop, (y - yMin) / Math.max(1e-4, yMax - yMin));

  const left = pts.map(([y, z]) => [xCenter + htOf(y), y, z]);
  const right = pts.map(([y, z]) => [xCenter - htOf(y), y, z]);
  const cL = [xCenter + htOf(cy) * 1.15, cy, cz];
  const cR = [xCenter - htOf(cy) * 1.15, cy, cz];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    pb.addTri(cL, left[j], left[i], mat, group, crease);
    pb.addTri(cR, right[i], right[j], mat, group + 1, crease);
    pb.addQuad(left[i], left[j], right[j], right[i], mat, group + 2, 18);
  }
}

// ============================================================================
// MODEL 1: DAWN INTERCEPTOR (radius = 1.875, LeftEmitter & RightEmitter)
// ============================================================================
function buildDawnInterceptor() {
  const BASE_Y = 0.56; // World floor at Y = 0.000 (lowest ventral edges at local y = -0.56)

  // 1. Central Hull (sleek Concord ivory & gold fuselage, crystal canopy, ventral keel)
  const hull = new PartBuilder();
  const hullStations = [
    // [z, yOff, w, topH, botH, chineY]
    [-1.62, 0.03, 0.14, 0.12, 0.11, 0.00],
    [-1.30, 0.02, 0.25, 0.18, 0.16, 0.00],
    [-0.75, 0.01, 0.33, 0.24, 0.20, -0.01],
    [-0.15, 0.01, 0.35, 0.27, 0.22, -0.01],
    [0.45, 0.00, 0.31, 0.25, 0.19, -0.01],
    [1.02, -0.01, 0.23, 0.18, 0.15, -0.01],
    [1.52, -0.01, 0.12, 0.10, 0.09, 0.00],
    [1.76, 0.00, 0.05, 0.045, 0.04, 0.00],
  ];
  hull.loftRings(
    hullStations.map((s) => makeOctRingZ(s[0], s[1], s[2], s[3], s[4], s[5])),
    MAT.IVORY,
    10,
    38,
    true,
    true,
    [0, 0.03, -1.68],
    [0, 0.00, 1.82]
  );

  // Polished Gold prow spear reaching exact +1.875
  hull.loftRings(
    [
      makeOctRingZ(1.36, -0.005, 0.155, 0.12, 0.105, 0),
      makeOctRingZ(1.66, 0.00, 0.082, 0.068, 0.060, 0),
    ],
    MAT.GOLD,
    12,
    28,
    true,
    true,
    [0, 0, 1.32],
    [0, 0, 1.875]
  );

  // Polished Gold aft dorsal tail-spear reaching exact -1.875
  addFinYZ(
    hull,
    [
      [0.16, -1.875],
      [0.56, -1.36],
      [0.52, -0.68],
      [0.21, -0.32],
      [0.14, -1.48],
    ],
    0,
    0.022,
    0.045,
    MAT.GOLD,
    14
  );
  // Ivory inner dorsal spine flank
  addFinYZ(
    hull,
    [
      [0.22, -1.52],
      [0.46, -1.24],
      [0.42, -0.72],
      [0.22, -0.45],
    ],
    0,
    0.038,
    0.062,
    MAT.IVORY,
    16
  );

  // Ventral keel blade resting cleanly on Y = 0.000 (local y = -0.560)
  addFinYZ(
    hull,
    [
      [-0.560, -0.78],
      [-0.560, 0.08],
      [-0.18, 0.48],
      [-0.17, -1.12],
    ],
    0,
    0.042,
    0.018,
    MAT.GOLD,
    18
  );

  // Dark alloy recessed under-intake collar & engine housing
  addCylinderZ(hull, 0, 0.02, -1.68, -1.32, 0.145, 0.19, 10, MAT.ALLOY, 20, true, false);
  // Gold central thruster crown
  addTorus(hull, [0, 0.02, -1.66], 'Z', 0.15, 0.028, 12, 6, MAT.GOLD, 22);

  // Crystalline Cyan Canopy Visor + Gold Canopy Arch
  const canopyStations = [
    [0.02, 0.21, 0.13, 0.09, 0.02, 0],
    [0.34, 0.22, 0.17, 0.13, 0.03, 0],
    [0.74, 0.18, 0.14, 0.11, 0.03, 0],
    [1.06, 0.12, 0.07, 0.05, 0.02, 0],
  ];
  hull.loftRings(
    canopyStations.map((s) => makeOctRingZ(s[0], s[1], s[2], s[3], s[4], s[5])),
    MAT.CYAN,
    24,
    20,
    true,
    true,
    [0, 0.21, -0.06],
    [0, 0.10, 1.16]
  );
  // Gold canopy central rib
  addFinYZ(
    hull,
    [
      [0.24, -0.08],
      [0.365, 0.36],
      [0.30, 0.78],
      [0.14, 1.18],
      [0.11, 1.05],
      [0.24, 0.35],
    ],
    0,
    0.018,
    0.024,
    MAT.GOLD,
    26
  );

  // TeamColor central dorsal blazon chevron behind canopy & nose crest
  hull.addPlateStrip(
    [[-0.21, 0.255, -0.78], [-0.25, 0.275, -0.35], [-0.18, 0.265, 0.04]],
    [[0.21, 0.255, -0.78], [0.25, 0.275, -0.35], [0.18, 0.265, 0.04]],
    [[-0.23, 0.220, -0.78], [-0.27, 0.240, -0.35], [-0.20, 0.230, 0.04]],
    [[0.23, 0.220, -0.78], [0.27, 0.240, -0.35], [0.20, 0.230, 0.04]],
    MAT.TEAM,
    28
  );
  hull.addPlateStrip(
    [[-0.12, 0.165, 1.08], [-0.07, 0.125, 1.38]],
    [[0.12, 0.165, 1.08], [0.07, 0.125, 1.38]],
    [[-0.14, 0.135, 1.08], [-0.09, 0.098, 1.38]],
    [[0.14, 0.135, 1.08], [0.09, 0.098, 1.38]],
    MAT.TEAM,
    29
  );

  // Sleek inner wing-bridge pylons connecting CentralHull (x=±0.31) across open negative-space gap to Twin Pods (x=±0.78)
  const bridgeLeft = new PartBuilder();
  bridgeLeft.addPlateStrip(
    [[0.28, 0.05, 0.22], [0.58, 0.03, 0.06]],
    [[0.28, 0.05, -0.36], [0.58, 0.03, -0.48]],
    [[0.28, -0.03, 0.22], [0.58, -0.04, 0.06]],
    [[0.28, -0.03, -0.36], [0.58, -0.04, -0.48]],
    MAT.ALLOY,
    30
  );
  // Gold leading-edge spar on inner pylon
  bridgeLeft.addPlateStrip(
    [[0.28, 0.065, 0.26], [0.60, 0.045, 0.10]],
    [[0.28, 0.065, 0.14], [0.60, 0.045, -0.02]],
    [[0.28, -0.04, 0.26], [0.60, -0.05, 0.10]],
    [[0.28, -0.04, 0.14], [0.60, -0.05, -0.02]],
    MAT.GOLD,
    31
  );
  const bridgeRight = new PartBuilder().mirrorFrom(bridgeLeft);
  hull.tris.push(...bridgeLeft.tris, ...bridgeRight.tris);

  // 2. Twin Flanking Pods (local origin at [±0.78, 0, 0] relative to Body)
  function buildPod(sign) {
    const pod = new PartBuilder();
    const podStations = [
      [-1.22, 0.00, 0.14, 0.14, 0.13, 0],
      [-0.85, 0.00, 0.21, 0.19, 0.17, 0],
      [-0.20, 0.00, 0.23, 0.21, 0.18, 0],
      [0.48, 0.00, 0.21, 0.19, 0.16, 0],
      [0.98, 0.00, 0.15, 0.14, 0.13, 0],
      [1.24, 0.00, 0.09, 0.09, 0.08, 0],
    ];
    pod.loftRings(
      podStations.map((s) => makeOctRingZ(s[0], s[1], s[2], s[3], s[4], s[5])),
      MAT.IVORY,
      40,
      36,
      true,
      true,
      [0, 0, -1.28],
      [0, 0, 1.32]
    );

    // Polished Gold forward pod cowling & intake collar
    pod.loftRings(
      [
        makeOctRingZ(0.82, 0.00, 0.172, 0.160, 0.148, 0),
        makeOctRingZ(1.18, 0.00, 0.115, 0.110, 0.102, 0),
      ],
      MAT.GOLD,
      42,
      32,
      true,
      true,
      [0, 0, 0.78],
      [0, 0, 1.26]
    );

    // DarkAlloy aft pod nozzle & Gold nozzle crown
    addCylinderZ(pod, 0, 0, -1.32, -1.10, 0.115, 0.145, 10, MAT.ALLOY, 43, true, false);
    addTorus(pod, [0, 0, -1.30], 'Z', 0.12, 0.022, 10, 6, MAT.GOLD, 44);

    // Bold TeamColor dorsal pod armor plate (high RTS readability!)
    pod.addPlateStrip(
      [[-0.13, 0.215, -0.78], [-0.14, 0.228, -0.15], [-0.11, 0.208, 0.56]],
      [[0.13, 0.215, -0.78], [0.14, 0.228, -0.15], [0.11, 0.208, 0.56]],
      [[-0.15, 0.180, -0.78], [-0.16, 0.190, -0.15], [-0.13, 0.172, 0.56]],
      [[0.15, 0.180, -0.78], [0.16, 0.190, -0.15], [0.13, 0.172, 0.56]],
      MAT.TEAM,
      45
    );

    // Glowing Cyan dorsal energy conduit along pod forward deck
    pod.addPlateStrip(
      [[-0.032, 0.205, 0.58], [-0.024, 0.135, 1.18]],
      [[0.032, 0.205, 0.58], [0.024, 0.135, 1.18]],
      [[-0.038, 0.175, 0.58], [-0.028, 0.105, 1.18]],
      [[0.038, 0.175, 0.58], [0.028, 0.105, 1.18]],
      MAT.CYAN,
      46
    );

    // Ventral pod strake touching Y = 0.000 (local y = -0.560)
    addFinYZ(
      pod,
      [
        [-0.560, -0.56],
        [-0.560, 0.08],
        [-0.16, 0.42],
        [-0.15, -0.82],
      ],
      0,
      0.032,
      0.015,
      MAT.GOLD,
      48
    );

    return sign < 0 ? new PartBuilder().mirrorFrom(pod) : pod;
  }

  // Recoiling Solar Lance Barrel (local to LeftPod / RightPod at [0, 0, 0])
  function buildLance() {
    const lance = new PartBuilder();
    addCylinderZ(lance, 0, 0, 1.12, 1.56, 0.072, 0.048, 8, MAT.ALLOY, 50, true, true);
    addCylinderZ(lance, 0, 0, 1.38, 1.62, 0.062, 0.038, 8, MAT.GOLD, 51, true, true);
    // Prong fins top & bottom on lance tip
    addFinYZ(
      lance,
      [
        [0.04, 1.24],
        [0.10, 1.48],
        [0.05, 1.64],
        [0.03, 1.62],
      ],
      0,
      0.012,
      0.016,
      MAT.GOLD,
      52
    );
    addFinYZ(
      lance,
      [
        [-0.10, 1.48],
        [-0.04, 1.24],
        [-0.03, 1.62],
        [-0.05, 1.64],
      ],
      0,
      0.016,
      0.012,
      MAT.GOLD,
      53
    );
    // Glowing emitter crystal lens at z = 1.64
    addFacetedBipyramidZ(lance, 0, 0, 1.55, 1.61, 1.66, 0.034, 0.034, 6, MAT.CYAN, 54);
    return lance;
  }

  function buildPulseCore() {
    const pulse = new PartBuilder();
    addFacetedBipyramidZ(pulse, 0, 0, -0.05, 0.0, 0.09, 0.045, 0.045, 8, MAT.CYAN, 56);
    return pulse;
  }

  // 3. Swept Outboard Delta Wings (pivot at [±0.94, 0, 0], reaching exact x = ±1.875 at z = 0.000!)
  // Local wing coords for LeftWing (+X): root x=0 (world +0.94) to tip x=+0.935 (world +1.875)
  function buildSweptWing(sign) {
    const w = new PartBuilder();
    // Main Ivory airfoil blade: leading edge sweeps from (0, +0.44) out to (+0.935, 0.000), trailing edge sweeps to (+0.68, -0.80)
    const spanStations = [
      // [xLocal, zLead, zTrail, yOff, halfThick]
      [0.00, 0.44, -0.78, 0.01, 0.068],
      [0.28, 0.30, -0.64, 0.015, 0.054],
      [0.58, 0.15, -0.72, 0.02, 0.038],
      [0.80, 0.06, -0.58, 0.014, 0.024],
      [0.915, 0.01, -0.06, 0.004, 0.010],
    ];
    const rings = spanStations.map(([x, zL, zT, y, ht]) => {
      const zMid1 = lerp(zT, zL, 0.32);
      const zMid2 = lerp(zT, zL, 0.76);
      return [
        [x, y + ht, zMid1],
        [x, y + ht * 0.72, zMid2],
        [x, y, zL],
        [x, y - ht * 0.72, zMid2],
        [x, y - ht, zMid1],
        [x, y, zT],
      ];
    });
    w.loftRings(rings, MAT.IVORY, 60, 32, true, true, [-0.02, 0.01, -0.15], [0.935, 0.0, 0.0]);

    // Polished Gold swept leading-edge scythe trim (reaches exact local x = 0.935 -> world +1.875 at z = 0.0!)
    const goldRings = spanStations.map(([x, zL, zT, y, ht]) => {
      const zBack = lerp(zL, zT, 0.24);
      const ght = ht * 1.08 + 0.005;
      return [
        [x, y + ght, lerp(zBack, zL, 0.45)],
        [x, y, zL + 0.022],
        [x, y - ght, lerp(zBack, zL, 0.45)],
        [x, y, zBack],
      ];
    });
    w.loftRings(goldRings, MAT.GOLD, 62, 26, true, true, [-0.01, 0.01, 0.36], [0.935, 0.0, 0.0]);

    // Bold TeamColor upper wing chevron blazon
    w.addPlateStrip(
      [[0.08, 0.078, 0.14], [0.42, 0.064, -0.02], [0.72, 0.044, -0.16]],
      [[0.08, 0.068, -0.34], [0.42, 0.056, -0.44], [0.72, 0.038, -0.46]],
      [[0.08, 0.050, 0.14], [0.42, 0.040, -0.02], [0.72, 0.024, -0.16]],
      [[0.08, 0.042, -0.34], [0.42, 0.034, -0.44], [0.72, 0.020, -0.46]],
      MAT.TEAM,
      64
    );

    // DarkAlloy trailing-edge control surface strip
    w.addPlateStrip(
      [[0.06, 0.028, -0.52], [0.56, 0.034, -0.52]],
      [[0.06, 0.012, -0.76], [0.56, 0.020, -0.70]],
      [[0.06, -0.010, -0.52], [0.56, 0.004, -0.52]],
      [[0.06, -0.008, -0.76], [0.56, 0.010, -0.70]],
      MAT.ALLOY,
      66
    );

    return sign < 0 ? new PartBuilder().mirrorFrom(w) : w;
  }

  // 4. Thruster Glow Plumes (central + twin pods, safely inside z >= -1.84)
  const thrusters = new PartBuilder();
  addFacetedBipyramidZ(thrusters, 0, 0.02, -1.84, -1.67, -1.56, 0.105, 0.105, 8, MAT.CYAN, 70);
  addFacetedBipyramidZ(thrusters, 0.78, 0.00, -1.48, -1.31, -1.20, 0.085, 0.085, 8, MAT.CYAN, 71);
  addFacetedBipyramidZ(thrusters, -0.78, 0.00, -1.48, -1.31, -1.20, 0.085, 0.085, 8, MAT.CYAN, 72);

  const nodeDefs = [
    { name: 'DawnInterceptorRoot', translation: [0, 0, 0], childNames: ['Body'] },
    { name: 'Body', translation: [0, BASE_Y, 0], rotation: [0, 0, 0, 1], childNames: ['CentralHull', 'LeftWing', 'RightWing', 'LeftPod', 'RightPod', 'ThrusterGlow'] },
    { name: 'CentralHull', meshBuilder: hull },
    { name: 'LeftWing', translation: [0.94, 0, 0], rotation: [0, 0, 0, 1], meshBuilder: buildSweptWing(1) },
    { name: 'RightWing', translation: [-0.94, 0, 0], rotation: [0, 0, 0, 1], meshBuilder: buildSweptWing(-1) },
    { name: 'LeftPod', translation: [0.78, 0, 0], rotation: [0, 0, 0, 1], meshBuilder: buildPod(1), childNames: ['LeftLance', 'LeftEmitter', 'LeftPulse'] },
    { name: 'LeftLance', translation: [0, 0, 0], meshBuilder: buildLance() },
    { name: 'LeftEmitter', translation: [0, 0, 1.66], rotation: [0, 0, 0, 1] },
    { name: 'LeftPulse', translation: [0, 0, 1.65], scale: [0.5, 0.5, 0.5], meshBuilder: buildPulseCore() },
    { name: 'RightPod', translation: [-0.78, 0, 0], rotation: [0, 0, 0, 1], meshBuilder: buildPod(-1), childNames: ['RightLance', 'RightEmitter', 'RightPulse'] },
    { name: 'RightLance', translation: [0, 0, 0], meshBuilder: buildLance() },
    { name: 'RightEmitter', translation: [0, 0, 1.66], rotation: [0, 0, 0, 1] },
    { name: 'RightPulse', translation: [0, 0, 1.65], scale: [0.5, 0.5, 0.5], meshBuilder: buildPulseCore() },
    { name: 'ThrusterGlow', translation: [0, 0, 0], scale: [1, 1, 1], meshBuilder: thrusters },
  ];

  const animations = buildDawnAnimations(BASE_Y);
  return {
    sceneName: 'DawnInterceptor',
    materials: createMaterials(false),
    nodeDefs,
    animations,
    expectedRadius: 1.875,
  };
}

function sampleClip(duration, steps, fn) {
  const times = [];
  for (let i = 0; i <= steps; i++) times.push((i / steps) * duration);
  return { times, eval: fn };
}

function buildDawnAnimations(baseY) {
  const TWO_PI = Math.PI * 2;

  // 1. IDLE (2.4s loop)
  const idleS = sampleClip(2.4, 24, (t) => {
    const p = (t / 2.4) * TWO_PI;
    return {
      Body: {
        t: [0, baseY + 0.14 + 0.05 * Math.sin(p), 0],
        r: quatEuler(0.025 * Math.sin(p + 0.6), 0, 0.042 * Math.sin(p)),
      },
      LeftWing: { r: quatEuler(0, 0, 0.025 * Math.sin(p)) },
      RightWing: { r: quatEuler(0, 0, -0.025 * Math.sin(p)) },
      ThrusterGlow: { s: [1, 1, 0.92 + 0.12 * Math.sin(p * 2)] },
    };
  });

  // 2. HOVER (1.6s combat hover loop)
  const hoverS = sampleClip(1.6, 24, (t) => {
    const p = (t / 1.6) * TWO_PI;
    return {
      Body: {
        t: [0.055 * Math.sin(p), baseY + 0.20 + 0.065 * Math.sin(p * 2), 0.025 * Math.cos(p)],
        r: quatEuler(0.055 + 0.03 * Math.sin(p * 2), 0.035 * Math.cos(p), -0.085 * Math.sin(p)),
      },
      LeftPod: { r: quatEuler(0.02 * Math.sin(p * 2), -0.018, 0) },
      RightPod: { r: quatEuler(0.02 * Math.sin(p * 2), 0.018, 0) },
      ThrusterGlow: { s: [1.08, 1.08, 1.15 + 0.18 * Math.sin(p * 3)] },
    };
  });

  // 3. ATTACK (0.90s alternating twin-pod solar lance burst)
  const attackS = sampleClip(0.9, 27, (t) => {
    const u = t / 0.9;
    const kickL = Math.exp(-Math.pow((u - 0.22) / 0.075, 2));
    const kickR = Math.exp(-Math.pow((u - 0.50) / 0.075, 2));
    const kickBoth = Math.exp(-Math.pow((u - 0.76) / 0.08, 2));
    const aimEnv = Math.sin(u * Math.PI);
    const lAmt = Math.min(1, kickL + kickBoth * 0.9);
    const rAmt = Math.min(1, kickR + kickBoth * 0.9);
    return {
      Body: {
        t: [0.02 * (kickL - kickR), baseY + 0.18 + 0.03 * aimEnv, -0.09 * (kickL * 0.5 + kickR * 0.5 + kickBoth)],
        r: quatEuler(0.05 * aimEnv - 0.04 * kickBoth, 0.03 * (kickR - kickL), 0.065 * (kickL - kickR)),
      },
      LeftLance: { t: [0, 0, -0.18 * lAmt] },
      RightLance: { t: [0, 0, -0.18 * rAmt] },
      LeftPulse: { s: [0.5 + 1.8 * lAmt, 0.5 + 1.8 * lAmt, 0.5 + 2.4 * lAmt] },
      RightPulse: { s: [0.5 + 1.8 * rAmt, 0.5 + 1.8 * rAmt, 0.5 + 2.4 * rAmt] },
      ThrusterGlow: { s: [1 + 0.25 * aimEnv, 1 + 0.25 * aimEnv, 1.1 + 0.35 * aimEnv] },
    };
  });

  // 4. CAST (1.40s Solar Overdrive charge, wing-flare & twin-lance nova surge)
  const castS = sampleClip(1.4, 28, (t) => {
    const u = t / 1.4;
    const charge = u < 0.45 ? Math.sin((u / 0.45) * (Math.PI * 0.5)) : Math.max(0, 1 - (u - 0.45) / 0.20);
    const surge = Math.exp(-Math.pow((u - 0.56) / 0.11, 2));
    const settle = Math.sin(u * Math.PI);
    return {
      Body: {
        t: [0, baseY + 0.16 + 0.18 * charge + 0.06 * surge, -0.10 * charge + 0.16 * surge],
        r: quatEuler(-0.18 * charge + 0.14 * surge, 0, 0.12 * Math.sin(u * TWO_PI) * settle),
      },
      LeftWing: { r: quatEuler(0, -0.10 * charge + 0.08 * surge, 0.20 * charge - 0.08 * surge) },
      RightWing: { r: quatEuler(0, 0.10 * charge - 0.08 * surge, -0.20 * charge + 0.08 * surge) },
      LeftPod: { r: quatEuler(0, -0.055 * charge, -0.08 * charge) },
      RightPod: { r: quatEuler(0, 0.055 * charge, 0.08 * charge) },
      LeftPulse: { s: [0.5 + 1.4 * charge + 1.6 * surge, 0.5 + 1.4 * charge + 1.6 * surge, 0.5 + 2.8 * surge] },
      RightPulse: { s: [0.5 + 1.4 * charge + 1.6 * surge, 0.5 + 1.4 * charge + 1.6 * surge, 0.5 + 2.8 * surge] },
      ThrusterGlow: { s: [1 + 0.4 * surge, 1 + 0.4 * surge, 1 + 0.8 * surge + 0.3 * charge] },
    };
  });

  // 5. DEATH (1.50s hit shudder, spiral descent, settles cleanly on Y=0 floor)
  const deathS = sampleClip(1.5, 30, (t) => {
    const u = t / 1.5;
    const jolt = Math.exp(-Math.pow((u - 0.08) / 0.06, 2));
    const fall = u < 0.15 ? 0 : Math.min(1, Math.pow((u - 0.15) / 0.68, 1.45));
    const bounce = u > 0.83 ? Math.exp(-(u - 0.83) * 14) * Math.abs(Math.sin((u - 0.83) * 26)) * 0.06 : 0;
    const yBody = lerp(baseY + 0.16, 0.30, fall) + 0.08 * jolt + bounce;
    const alive = Math.max(0.05, 1 - Math.min(1, u * 1.6));
    return {
      Body: {
        t: [0.12 * fall, yBody, -0.14 * jolt + 0.10 * fall],
        r: quatEuler(0.18 * fall - 0.12 * jolt, -1.25 * fall, 0.42 * fall + 0.18 * jolt),
      },
      LeftWing: { r: quatEuler(0.08 * fall, 0.12 * fall, -0.22 * fall) },
      RightWing: { r: quatEuler(0.10 * fall, -0.14 * fall, 0.16 * fall) },
      LeftPod: { t: [0.78 + 0.05 * fall, -0.04 * fall, -0.04 * fall], r: quatEuler(0.12 * fall, 0.08 * fall, -0.18 * fall) },
      RightPod: { t: [-0.78 - 0.04 * fall, -0.03 * fall, 0.03 * fall], r: quatEuler(0.10 * fall, -0.08 * fall, 0.14 * fall) },
      LeftPulse: { s: [0.5 * alive, 0.5 * alive, 0.5 * alive] },
      RightPulse: { s: [0.5 * alive, 0.5 * alive, 0.5 * alive] },
      ThrusterGlow: { s: [alive, alive, alive] },
    };
  });

  return [
    compileSampledAnimation('idle', idleS),
    compileSampledAnimation('hover', hoverS),
    compileSampledAnimation('attack', attackS),
    compileSampledAnimation('cast', castS),
    compileSampledAnimation('death', deathS),
  ];
}

// ============================================================================
// MODEL 2: PRISM RAY (radius = 2.1875, suspended cyan prism & BeamOrigin)
// ============================================================================
function buildPrismRay() {
  const BASE_Y = 0.64; // World floor at Y = 0.000 (lowest ventral keel at local y = -0.64)
  const PRISM_Z = 1.35; // Center of suspended focusing prism bay inside open crescent

  // 1. Elongated Aft Spine & Central Harmonic Bridge (z = -2.1875 to +0.46)
  const hull = new PartBuilder();
  const spineStations = [
    // [z, yOff, w, topH, botH, chineY]
    [-1.96, 0.01, 0.10, 0.09, 0.08, 0.00],
    [-1.52, 0.01, 0.23, 0.18, 0.15, 0.00],
    [-0.98, 0.01, 0.34, 0.25, 0.20, 0.00],
    [-0.40, 0.02, 0.42, 0.30, 0.23, 0.00],
    [0.05, 0.02, 0.46, 0.31, 0.24, 0.00],
    [0.34, 0.01, 0.36, 0.24, 0.19, 0.00],
  ];
  hull.loftRings(
    spineStations.map((s) => makeOctRingZ(s[0], s[1], s[2], s[3], s[4], s[5])),
    MAT.IVORY,
    10,
    38,
    true,
    true,
    [0, 0.00, -2.04],
    [0, 0.01, 0.46]
  );

  // Polished Gold aft tail-spire reaching exact z = -2.1875 (at local y = 0 -> world Y = 0.64)
  hull.loftRings(
    [
      makeOctRingZ(-1.98, 0.00, 0.09, 0.075, 0.068, 0),
      makeOctRingZ(-1.68, 0.005, 0.19, 0.15, 0.13, 0),
    ],
    MAT.GOLD,
    12,
    28,
    true,
    true,
    [0, 0, -2.1875],
    [0, 0.005, -1.62]
  );

  // Sculpted Gold dorsal harmonic crest sail along elongated spine
  addFinYZ(
    hull,
    [
      [0.18, -1.86],
      [0.64, -1.18],
      [0.58, -0.32],
      [0.32, 0.24],
      [0.24, -1.48],
    ],
    0,
    0.020,
    0.048,
    MAT.GOLD,
    14
  );
  // Ivory lower dorsal fairing
  addFinYZ(
    hull,
    [
      [0.24, -1.48],
      [0.48, -1.04],
      [0.45, -0.38],
      [0.28, 0.08],
    ],
    0,
    0.040,
    0.070,
    MAT.IVORY,
    15
  );

  // Ventral harmonic keel fin touching exact Y = 0.000 (local y = -0.640)
  addFinYZ(
    hull,
    [
      [-0.640, -1.02],
      [-0.640, -0.06],
      [-0.20, 0.36],
      [-0.16, -1.52],
    ],
    0,
    0.048,
    0.018,
    MAT.GOLD,
    16
  );

  // Forward concave harmonic projector collar facing the suspended prism (z = +0.34 to +0.52)
  addCylinderZ(hull, 0, 0.01, 0.30, 0.48, 0.24, 0.17, 10, MAT.GOLD, 18, false, true);
  addFacetedBipyramidZ(hull, 0, 0.01, 0.42, 0.50, 0.58, 0.11, 0.11, 8, MAT.CYAN, 19);

  // Crystalline Cyan Bridge Oculus & Spine Energy Conduit
  hull.addPlateStrip(
    [[-0.08, 0.335, -0.28], [-0.13, 0.335, 0.05], [-0.08, 0.265, 0.32]],
    [[0.08, 0.335, -0.28], [0.13, 0.335, 0.05], [0.08, 0.265, 0.32]],
    [[-0.10, 0.295, -0.28], [-0.15, 0.295, 0.05], [-0.10, 0.225, 0.32]],
    [[0.10, 0.295, -0.28], [0.15, 0.295, 0.05], [0.10, 0.225, 0.32]],
    MAT.CYAN,
    20
  );

  // TeamColor flanking spine heraldic armor plates (port & starboard of dorsal crest)
  const spineTeamL = new PartBuilder();
  spineTeamL.addPlateStrip(
    [[0.11, 0.305, -1.32], [0.14, 0.325, -0.64], [0.18, 0.320, -0.04]],
    [[0.26, 0.225, -1.32], [0.35, 0.255, -0.64], [0.38, 0.265, -0.04]],
    [[0.11, 0.265, -1.32], [0.14, 0.285, -0.64], [0.18, 0.280, -0.04]],
    [[0.26, 0.185, -1.32], [0.35, 0.215, -0.64], [0.38, 0.225, -0.04]],
    MAT.TEAM,
    22
  );
  // Twin mid-aft harmonic thruster pods on spine shoulders (x = ±0.44, z = -1.42 to -0.68)
  const nacL = new PartBuilder();
  nacL.loftRings(
    [
      makeOctRingZ(-1.42, -0.02, 0.12, 0.12, 0.11, 0),
      makeOctRingZ(-1.05, -0.01, 0.17, 0.15, 0.14, 0),
      makeOctRingZ(-0.62, 0.00, 0.14, 0.12, 0.11, 0),
    ],
    MAT.ALLOY,
    24,
    36,
    true,
    true,
    [0, -0.02, -1.46],
    [0, 0, -0.56]
  );
  addTorus(nacL, [0, -0.02, -1.42], 'Z', 0.115, 0.022, 10, 6, MAT.GOLD, 25);
  nacL.translate(0.44, 0, 0);
  const nacR = new PartBuilder().mirrorFrom(nacL);
  const spineTeamR = new PartBuilder().mirrorFrom(spineTeamL);
  hull.tris.push(...spineTeamL.tris, ...spineTeamR.tris, ...nacL.tris, ...nacR.tris);

  // Central aft harmonic nozzle
  addCylinderZ(hull, 0, 0.01, -1.62, -1.38, 0.12, 0.15, 10, MAT.ALLOY, 26, true, false);
  addTorus(hull, [0, 0.01, -1.60], 'Z', 0.12, 0.022, 10, 6, MAT.GOLD, 27);

  // 2. Sweeping Gold-and-Ivory Crescent Arms (pivot at [±0.34, 0, 0.08] on Body)
  // Curves smoothly outward to x = ±1.42 at z = +0.68, then arcs forward-inward to (±0.54, 0, +2.06)
  // Framing a wide circular open void around PrismMount at (0, 0, +1.35)!
  function buildCrescentArm(sign) {
    const arm = new PartBuilder();
    const px = 0.34, pz = 0.08;
    // Spine centerline points in Body coords (+X port side), converted to local arm coords
    const rawPts = [
      // [xBody, yBody, zBody, outerW, innerW, halfH]
      [0.32, 0.02, 0.02, 0.22, 0.20, 0.155],
      [0.74, 0.02, 0.14, 0.24, 0.20, 0.145],
      [1.14, 0.01, 0.36, 0.24, 0.19, 0.130],
      [1.34, 0.00, 0.68, 0.21, 0.17, 0.115],
      [1.32, 0.00, 1.04, 0.19, 0.15, 0.102],
      [1.14, 0.00, 1.40, 0.16, 0.13, 0.088],
      [0.86, 0.00, 1.75, 0.12, 0.10, 0.072],
      [0.60, 0.00, 1.98, 0.07, 0.06, 0.048],
    ];
    const pts = rawPts.map(([x, y, z, ow, iw, hh]) => ({
      c: [x - px, y, z - pz],
      ow,
      iw,
      hh,
    }));

    const ivoryRings = [];
    const goldOuterRings = [];
    const cyanInnerRings = [];
    const teamUpperA = [], teamUpperB = [], teamLowerA = [], teamLowerB = [];

    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)].c;
      const next = pts[Math.min(pts.length - 1, i + 1)].c;
      const tang = norm3(sub3(next, prev));
      // S = cross(tang, +Y) points toward OUTER convex rim of the +X crescent arm!
      //Wait: let's verify! At z increasing (tang = (0, 0, +1)), cross((0,0,1), (0,1,0)) = (-1, 0, 0) = INWARD (-X)!
      // At x increasing (tang = (+1, 0, 0)), cross((1,0,0), (0,1,0)) = (0, 0, +1) = FORWARD (+Z)!
      // Let's check! As the port (+X) arm goes from (0.32, 0.02) -> (1.34, 0.68) -> (0.60, 1.98):
      // At start: tang = (+0.95, 0, +0.3), cross(tang, +Y) = (-0.3, 0, +0.95) -> points +Z (concave inner side!).
      // At mid: tang = (0, 0, +1), cross(tang, +Y) = (-1, 0, 0) -> points -X (concave inner side toward prism!).
      // At tip: tang = (-0.75, 0, +0.66), cross(tang, +Y) = (-0.66, 0, -0.75) -> points inward toward prism!
      // YES! S = cross(tang, +Y) ALWAYS points INWARD toward the focal prism, and -S ALWAYS points OUTWARD toward the convex outer rim!
      const { c, ow, iw, hh } = pts[i];
      const profIvory = [
        [0, hh],
        [iw * 0.62, hh * 0.84],
        [iw, 0],
        [iw * 0.62, -hh * 0.84],
        [0, -hh],
        [-ow * 0.65, -hh * 0.82],
        [-ow, 0],
        [-ow * 0.65, hh * 0.82],
      ];
      ivoryRings.push(makeOrientedRing(c, tang, [0, 1, 0], profIvory));

      // Polished Gold convex outer crescent blade (-S direction!)
      const gOut = ow + 0.045 * (1 - i * 0.08);
      const gIn = ow * 0.62;
      const gH = hh * 0.88 + 0.008;
      const profGold = [
        [-gIn, gH],
        [-gIn * 0.92, 0],
        [-gIn, -gH],
        [-gOut, 0],
      ];
      goldOuterRings.push(makeOrientedRing(c, tang, [0, 1, 0], profGold));

      // Glowing Cyan harmonic field emitter strip along inner concave crescent rim (stations 2..7)
      if (i >= 2) {
        const cOut = iw + 0.024;
        const cIn = iw * 0.78;
        const cH = hh * 0.36;
        cyanInnerRings.push(
          makeOrientedRing(c, tang, [0, 1, 0], [
            [cIn, cH],
            [cOut, 0],
            [cIn, -cH],
            [cIn * 0.95, 0],
          ])
        );
      }

      // Bold TeamColor curved blazon along upper surface of crescent arm (stations 1..6)
      if (i >= 1 && i <= 6) {
        const S = norm3(cross3(tang, [0, 1, 0]));
        const pInU = add3(c, add3(mul3(S, iw * 0.45), [0, hh + 0.020, 0]));
        const pOutU = add3(c, add3(mul3(S, -ow * 0.52), [0, hh * 0.88 + 0.020, 0]));
        const pInL = add3(c, add3(mul3(S, iw * 0.48), [0, hh * 0.72, 0]));
        const pOutL = add3(c, add3(mul3(S, -ow * 0.55), [0, hh * 0.62, 0]));
        teamUpperA.push(pInU);
        teamUpperB.push(pOutU);
        teamLowerA.push(pInL);
        teamLowerB.push(pOutL);
      }
    }

    const hornTip = [0.54 - px, 0.0, 2.08 - pz]; // hypot(0.54, 2.08) = 2.149 < 2.1875
    arm.loftRings(ivoryRings, MAT.IVORY, 40, 38, true, true, [0.24 - px, 0.02, -0.04 - pz], hornTip);
    arm.loftRings(goldOuterRings, MAT.GOLD, 42, 32, true, true, [0.26 - px, 0.02, -0.02 - pz], [0.52 - px, 0.0, 2.10 - pz]);
    arm.loftRings(cyanInnerRings, MAT.CYAN, 44, 24, true, true);
    arm.addPlateStrip(teamUpperA, teamUpperB, teamLowerA, teamLowerB, MAT.TEAM, 46);

    // Subtle ventral crescent stabilizer fin touching Y = 0.000 (local y = -0.640) at xBody = 1.08 (local x = 0.74)
    addFinYZ(
      arm,
      [
        [-0.640, 0.42 - pz],
        [-0.640, 0.78 - pz],
        [-0.08, 1.02 - pz],
        [-0.08, 0.24 - pz],
      ],
      1.08 - px,
      0.028,
      0.012,
      MAT.GOLD,
      48
    );

    return sign < 0 ? new PartBuilder().mirrorFrom(arm) : arm;
  }

  // 3. Suspended Cyan Focusing Prism Assembly (local to PrismMount at [0, 0, PRISM_Z = 1.35])
  // Forward crystal apex reaches local z = +0.8375 -> Body z = 1.35 + 0.8375 = +2.1875 EXACT!
  const prismMesh = new PartBuilder();
  // Solid luminous CyanEnergy inner crystal core (opaque, ultra-visible at RTS zoom!)
  addFacetedBipyramidZ(prismMesh, 0, 0, -0.38, 0.02, 0.62, 0.22, 0.22, 8, MAT.CYAN, 60);
  // Translucent faceted CyanPrism outer crystal bipyramid reaching exact +2.1875!
  addFacetedBipyramidZ(prismMesh, 0, 0, -0.56, 0.00, 0.8375, 0.35, 0.35, 8, MAT.PRISM, 62);
  // Polished Gold mid-crystal collar band
  addTorus(prismMesh, [0, 0, -0.14], 'Z', 0.27, 0.020, 8, 6, MAT.GOLD, 64);

  // Outer & Inner Polished Gold Harmonic Gimbal Rings
  const outerRing = new PartBuilder();
  addTorus(outerRing, [0, 0, 0], 'Y', 0.47, 0.026, 20, 6, MAT.GOLD, 70);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    addFacetedBipyramidZ(outerRing, Math.cos(a) * 0.47, 0, Math.sin(a) * 0.47 - 0.045, Math.sin(a) * 0.47, Math.sin(a) * 0.47 + 0.045, 0.042, 0.042, 6, MAT.CYAN, 71 + i);
  }

  const innerRing = new PartBuilder();
  addTorus(innerRing, [0, 0, 0], 'X', 0.41, 0.022, 18, 6, MAT.GOLD, 76);

  // Focal Flare Lens right behind BeamOrigin (stays inside z <= +2.17 in rest pose)
  const focalFlare = new PartBuilder();
  addTorus(focalFlare, [0, 0, 0.68], 'Z', 0.11, 0.016, 12, 6, MAT.CYAN, 78);
  addFacetedBipyramidZ(focalFlare, 0, 0, 0.60, 0.70, 0.80, 0.065, 0.065, 8, MAT.CYAN, 79);

  // Aft Harmonic Drive Plumes
  const driveGlow = new PartBuilder();
  addFacetedBipyramidZ(driveGlow, 0, 0.01, -1.82, -1.61, -1.48, 0.095, 0.095, 8, MAT.CYAN, 80);
  addFacetedBipyramidZ(driveGlow, 0.44, -0.02, -1.64, -1.43, -1.30, 0.090, 0.090, 8, MAT.CYAN, 81);
  addFacetedBipyramidZ(driveGlow, -0.44, -0.02, -1.64, -1.43, -1.30, 0.090, 0.090, 8, MAT.CYAN, 82);

  const nodeDefs = [
    { name: 'PrismRayRoot', translation: [0, 0, 0], childNames: ['Body'] },
    { name: 'Body', translation: [0, BASE_Y, 0], rotation: [0, 0, 0, 1], childNames: ['CrescentHull', 'LeftCrescentArm', 'RightCrescentArm', 'PrismMount', 'DriveGlow'] },
    { name: 'CrescentHull', meshBuilder: hull },
    { name: 'LeftCrescentArm', translation: [0.34, 0, 0.08], rotation: [0, 0, 0, 1], meshBuilder: buildCrescentArm(1) },
    { name: 'RightCrescentArm', translation: [-0.34, 0, 0.08], rotation: [0, 0, 0, 1], meshBuilder: buildCrescentArm(-1) },
    { name: 'PrismMount', translation: [0, 0, PRISM_Z], rotation: [0, 0, 0, 1], childNames: ['FocusingPrism', 'OuterRing', 'InnerRing', 'FocalFlare', 'BeamOrigin'] },
    { name: 'FocusingPrism', translation: [0, 0, 0], rotation: [0, 0, 0, 1], meshBuilder: prismMesh },
    { name: 'OuterRing', translation: [0, 0, 0], rotation: [0, 0, 0, 1], meshBuilder: outerRing },
    { name: 'InnerRing', translation: [0, 0, 0], rotation: [0, 0, 0, 1], meshBuilder: innerRing },
    { name: 'FocalFlare', translation: [0, 0, 0], scale: [0.65, 0.65, 0.65], meshBuilder: focalFlare },
    { name: 'BeamOrigin', translation: [0, 0, 0.8375], rotation: [0, 0, 0, 1] },
    { name: 'DriveGlow', translation: [0, 0, 0], scale: [1, 1, 1], meshBuilder: driveGlow },
  ];

  const animations = buildPrismAnimations(BASE_Y, PRISM_Z);
  return {
    sceneName: 'PrismRay',
    materials: createMaterials(true),
    nodeDefs,
    animations,
    expectedRadius: 2.1875,
  };
}

function buildPrismAnimations(baseY, prismZ) {
  const TWO_PI = Math.PI * 2;

  // 1. IDLE (3.0s majestic float & continuous Z-axis crystal rotation + gimbal precession)
  const idleS = sampleClip(3.0, 30, (t) => {
    const p = (t / 3.0) * TWO_PI;
    return {
      Body: {
        t: [0, baseY + 0.14 + 0.055 * Math.sin(p), 0],
        r: quatEuler(0.02 * Math.sin(p + 0.8), 0, 0.032 * Math.sin(p)),
      },
      PrismMount: {
        t: [0, 0.03 * Math.sin(p * 2), prismZ],
      },
      FocusingPrism: {
        r: quatEuler(0, 0, p),
      },
      OuterRing: {
        r: quatEuler(0.35 * Math.sin(p), p, 0.25 * Math.cos(p)),
      },
      InnerRing: {
        r: quatEuler(-p, 0.35 * Math.cos(p), 0.30 * Math.sin(p)),
      },
      DriveGlow: {
        s: [1, 1, 0.92 + 0.12 * Math.sin(p * 2)],
      },
    };
  });

  // 2. HOVER (2.0s energized cruise hover)
  const hoverS = sampleClip(2.0, 28, (t) => {
    const p = (t / 2.0) * TWO_PI;
    return {
      Body: {
        t: [0.045 * Math.sin(p), baseY + 0.20 + 0.065 * Math.sin(p * 2), 0.02 * Math.cos(p)],
        r: quatEuler(0.035 + 0.025 * Math.sin(p * 2), 0.025 * Math.cos(p), -0.06 * Math.sin(p)),
      },
      PrismMount: {
        t: [0, 0.04 * Math.sin(p * 2 + 0.5), prismZ],
      },
      FocusingPrism: {
        r: quatEuler(0, 0, p * 2),
      },
      OuterRing: {
        r: quatEuler(0.45 * Math.sin(p), p * 2, 0.30 * Math.cos(p)),
      },
      InnerRing: {
        r: quatEuler(-p * 2, 0.40 * Math.cos(p), 0.35 * Math.sin(p)),
      },
      FocalFlare: {
        s: [0.75 + 0.15 * Math.sin(p * 2), 0.75 + 0.15 * Math.sin(p * 2), 0.75 + 0.15 * Math.sin(p * 2)],
      },
      DriveGlow: {
        s: [1.06, 1.06, 1.15 + 0.16 * Math.sin(p * 3)],
      },
    };
  });

  // 3. ATTACK (1.20s crescent focal lock + sustained Prism Ray channel)
  const attackS = sampleClip(1.2, 30, (t) => {
    const u = t / 1.2;
    const focus = u < 0.22
      ? Math.sin((u / 0.22) * (Math.PI * 0.5))
      : u < 0.78
        ? 1.0
        : 0.5 * (1 + Math.cos(((u - 0.78) / 0.22) * Math.PI));
    const hum = focus * Math.sin(u * TWO_PI * 6);
    return {
      Body: {
        t: [0, baseY + 0.18 + 0.03 * focus, -0.09 * focus + 0.012 * hum],
        r: quatEuler(0.035 * focus, 0, 0.015 * hum),
      },
      LeftCrescentArm: {
        r: quatEuler(0, -0.065 * focus, 0),
      },
      RightCrescentArm: {
        r: quatEuler(0, 0.065 * focus, 0),
      },
      PrismMount: {
        t: [0.008 * hum, 0.008 * Math.cos(u * TWO_PI * 6) * focus, prismZ + 0.04 * focus],
      },
      FocusingPrism: {
        r: quatEuler(0, 0, u * TWO_PI * 3),
        s: [1 + 0.10 * focus, 1 + 0.10 * focus, 1 + 0.04 * focus],
      },
      OuterRing: {
        r: quatEuler((Math.PI * 0.5) * focus, 0, u * TWO_PI * 2),
      },
      InnerRing: {
        r: quatEuler(0, (Math.PI * 0.5) * focus, -u * TWO_PI * 2),
      },
      FocalFlare: {
        s: [0.65 + 1.45 * focus + 0.15 * hum, 0.65 + 1.45 * focus + 0.15 * hum, 0.65 + 1.10 * focus],
      },
      DriveGlow: {
        s: [1 + 0.22 * focus, 1 + 0.22 * focus, 1 + 0.42 * focus],
      },
    };
  });

  // 4. CAST (1.60s Prismatic Resonance: crescent wings open, gimbal rings expand, harmonic pulse)
  const castS = sampleClip(1.6, 32, (t) => {
    const u = t / 1.6;
    const charge = u < 0.48 ? Math.sin((u / 0.48) * (Math.PI * 0.5)) : Math.max(0, 1 - (u - 0.48) / 0.22);
    const release = Math.exp(-Math.pow((u - 0.58) / 0.11, 2));
    return {
      Body: {
        t: [0, baseY + 0.16 + 0.20 * charge + 0.05 * release, -0.06 * charge - 0.10 * release],
        r: quatEuler(-0.14 * charge + 0.11 * release, 0, 0.05 * Math.sin(u * TWO_PI)),
      },
      LeftCrescentArm: {
        r: quatEuler(0, 0.085 * charge - 0.075 * release, 0.06 * charge),
      },
      RightCrescentArm: {
        r: quatEuler(0, -0.085 * charge + 0.075 * release, -0.06 * charge),
      },
      PrismMount: {
        t: [0, 0.09 * charge, prismZ + 0.06 * release],
      },
      FocusingPrism: {
        r: quatEuler(0, 0, u * TWO_PI * 3),
        s: [1 + 0.16 * charge + 0.20 * release, 1 + 0.16 * charge + 0.20 * release, 1 + 0.08 * release],
      },
      OuterRing: {
        r: quatEuler(u * TWO_PI * 2, u * TWO_PI, 0),
        s: [1 + 0.18 * charge, 1 + 0.18 * charge, 1 + 0.18 * charge],
      },
      InnerRing: {
        r: quatEuler(0, -u * TWO_PI * 2, u * TWO_PI),
        s: [1 + 0.22 * charge, 1 + 0.22 * charge, 1 + 0.22 * charge],
      },
      FocalFlare: {
        s: [0.65 + 1.1 * charge + 1.8 * release, 0.65 + 1.1 * charge + 1.8 * release, 0.65 + 1.5 * release],
      },
      DriveGlow: {
        s: [1 + 0.35 * release, 1 + 0.35 * release, 1 + 0.65 * release + 0.25 * charge],
      },
    };
  });

  // 5. DEATH (1.80s prism containment failure & listing descent onto Y=0 floor)
  const deathS = sampleClip(1.8, 32, (t) => {
    const u = t / 1.8;
    const shudder = Math.exp(-Math.pow((u - 0.10) / 0.08, 2)) * Math.sin(u * 90);
    const fall = u < 0.16 ? 0 : Math.min(1, Math.pow((u - 0.16) / 0.68, 1.45));
    const bounce = u > 0.84 ? Math.exp(-(u - 0.84) * 13) * Math.abs(Math.sin((u - 0.84) * 24)) * 0.05 : 0;
    const yBody = lerp(baseY + 0.16, 0.34, fall) + bounce;
    const alive = Math.max(0.05, 1 - Math.min(1, u * 1.5));
    return {
      Body: {
        t: [-0.14 * fall + 0.03 * shudder, yBody, -0.10 * fall],
        r: quatEuler(0.15 * fall + 0.05 * shudder, 0.95 * fall, -0.38 * fall + 0.10 * shudder),
      },
      LeftCrescentArm: {
        r: quatEuler(0.08 * fall, 0.09 * fall, -0.16 * fall),
      },
      RightCrescentArm: {
        r: quatEuler(0.06 * fall, -0.07 * fall, 0.12 * fall),
      },
      PrismMount: {
        t: [0.05 * shudder, -0.14 * fall + 0.04 * shudder, prismZ - 0.08 * fall],
      },
      FocusingPrism: {
        r: quatEuler(0.45 * fall, 0.30 * fall, 1.8 * fall),
        s: [0.55 + 0.45 * alive, 0.55 + 0.45 * alive, 0.55 + 0.45 * alive],
      },
      OuterRing: {
        r: quatEuler(0.85 * fall + 0.2 * shudder, 0.4 * fall, -0.6 * fall),
      },
      InnerRing: {
        r: quatEuler(-0.7 * fall, 0.65 * fall, 0.5 * fall),
      },
      FocalFlare: {
        s: [0.65 * alive, 0.65 * alive, 0.65 * alive],
      },
      DriveGlow: {
        s: [alive, alive, alive],
      },
    };
  });

  return [
    compileSampledAnimation('idle', idleS),
    compileSampledAnimation('hover', hoverS),
    compileSampledAnimation('attack', attackS),
    compileSampledAnimation('cast', castS),
    compileSampledAnimation('death', deathS),
  ];
}

function compileSampledAnimation(name, sampled) {
  const { times, eval: fn } = sampled;
  const perNode = new Map();
  for (let i = 0; i < times.length; i++) {
    const pose = fn(times[i]);
    for (const [nodeName, trs] of Object.entries(pose)) {
      if (!perNode.has(nodeName)) perNode.set(nodeName, { t: [], r: [], s: [] });
      const rec = perNode.get(nodeName);
      if (trs.t) rec.t.push(trs.t);
      if (trs.r) rec.r.push(trs.r);
      if (trs.s) rec.s.push(trs.s);
    }
  }
  const tracks = [];
  for (const [nodeName, rec] of perNode.entries()) {
    if (rec.t.length === times.length) tracks.push({ nodeName, path: 'translation', values: rec.t });
    if (rec.r.length === times.length) tracks.push({ nodeName, path: 'rotation', values: ensureQuatContinuity(rec.r) });
    if (rec.s.length === times.length) tracks.push({ nodeName, path: 'scale', values: rec.s });
  }
  return { name, times: new Float32Array(times), tracks };
}

// ============================================================================
// GLB 2.0 BINARY ENCODER & DETERMINISTIC BOUNDS VERIFIER
// ============================================================================
function exportGLB(spec, outPath) {
  const { sceneName, materials, nodeDefs, animations, expectedRadius } = spec;
  const nameToIdx = new Map();
  nodeDefs.forEach((n, i) => nameToIdx.set(n.name, i));

  const gltfNodes = [];
  const gltfMeshes = [];
  const bufferViews = [];
  const accessors = [];
  const binChunks = [];
  let byteOffset = 0;

  function appendBuffer(typedArray, target) {
    const raw = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const pad = (4 - (raw.length % 4)) % 4;
    const chunk = pad ? Buffer.concat([raw, Buffer.alloc(pad)]) : raw;
    const bv = { buffer: 0, byteOffset, byteLength: raw.length };
    if (target !== undefined) bv.target = target;
    const bvIdx = bufferViews.length;
    bufferViews.push(bv);
    binChunks.push(chunk);
    byteOffset += chunk.length;
    return bvIdx;
  }

  function addVecAccessor(floatArray, comps, target) {
    const bvIdx = appendBuffer(floatArray, target);
    const count = floatArray.length / comps;
    const min = new Array(comps).fill(Infinity);
    const max = new Array(comps).fill(-Infinity);
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < comps; c++) {
        const v = floatArray[i * comps + c];
        if (v < min[c]) min[c] = v;
        if (v > max[c]) max[c] = v;
      }
    }
    const typeMap = { 1: 'SCALAR', 3: 'VEC3', 4: 'VEC4' };
    const accIdx = accessors.length;
    accessors.push({
      bufferView: bvIdx,
      componentType: 5126,
      count,
      type: typeMap[comps],
      min,
      max,
    });
    return accIdx;
  }

  function addIndexAccessor(u16Array) {
    const bvIdx = appendBuffer(u16Array, 34963);
    let min = 65535, max = 0;
    for (let i = 0; i < u16Array.length; i++) {
      if (u16Array[i] < min) min = u16Array[i];
      if (u16Array[i] > max) max = u16Array[i];
    }
    const accIdx = accessors.length;
    accessors.push({
      bufferView: bvIdx,
      componentType: 5123,
      count: u16Array.length,
      type: 'SCALAR',
      min: [min],
      max: [max],
    });
    return accIdx;
  }

  // Build nodes & meshes
  const builtPrimsByNode = new Map();
  for (let i = 0; i < nodeDefs.length; i++) {
    const nd = nodeDefs[i];
    const gNode = { name: nd.name };
    if (nd.translation) gNode.translation = nd.translation;
    if (nd.rotation) gNode.rotation = nd.rotation;
    if (nd.scale) gNode.scale = nd.scale;
    if (nd.childNames && nd.childNames.length > 0) {
      gNode.children = nd.childNames.map((cn) => {
        const ci = nameToIdx.get(cn);
        if (ci === undefined) throw new Error(`Unknown child node: ${cn}`);
        return ci;
      });
    }
    if (nd.meshBuilder) {
      const prims = nd.meshBuilder.buildPrimitives();
      builtPrimsByNode.set(i, prims);
      const gPrims = prims.map((p) => ({
        attributes: {
          POSITION: addVecAccessor(p.positions, 3, 34962),
          NORMAL: addVecAccessor(p.normals, 3, 34962),
        },
        indices: addIndexAccessor(p.indices),
        material: p.mat,
      }));
      const meshIdx = gltfMeshes.length;
      gltfMeshes.push({ name: `${nd.name}Mesh`, primitives: gPrims });
      gNode.mesh = meshIdx;
    }
    gltfNodes.push(gNode);
  }

  // Verify rest-pose world-space bounds, floor at Y=0, and exact radius
  const worldOffsets = new Map();
  function walkWorld(ni, ox, oy, oz, sx, sy, sz) {
    const n = gltfNodes[ni];
    const t = n.translation || [0, 0, 0];
    const s = n.scale || [1, 1, 1];
    const wx = ox + t[0] * sx, wy = oy + t[1] * sy, wz = oz + t[2] * sz;
    const wsx = sx * s[0], wsy = sy * s[1], wsz = sz * s[2];
    worldOffsets.set(ni, [wx, wy, wz, wsx, wsy, wsz]);
    for (const ci of n.children || []) walkWorld(ci, wx, wy, wz, wsx, wsy, wsz);
  }
  walkWorld(0, 0, 0, 0, 1, 1, 1);

  const wMin = [Infinity, Infinity, Infinity];
  const wMax = [-Infinity, -Infinity, -Infinity];
  let maxR = 0;
  let triCount = 0;
  for (const [ni, prims] of builtPrimsByNode.entries()) {
    const [wx, wy, wz, wsx, wsy, wsz] = worldOffsets.get(ni);
    for (const p of prims) {
      triCount += p.indices.length / 3;
      const pos = p.positions;
      for (let k = 0; k < pos.length; k += 3) {
        const x = wx + pos[k] * wsx;
        const y = wy + pos[k + 1] * wsy;
        const z = wz + pos[k + 2] * wsz;
        if (x < wMin[0]) wMin[0] = x;
        if (y < wMin[1]) wMin[1] = y;
        if (z < wMin[2]) wMin[2] = z;
        if (x > wMax[0]) wMax[0] = x;
        if (y > wMax[1]) wMax[1] = y;
        if (z > wMax[2]) wMax[2] = z;
        const r = Math.hypot(x, z);
        if (r > maxR) maxR = r;
      }
    }
  }
  if (Math.abs(wMin[1]) > 1e-4) {
    throw new Error(`${sceneName}: expected floor minY=0, got ${wMin[1]}`);
  }
  if (Math.abs(maxR - expectedRadius) > 1e-3) {
    throw new Error(`${sceneName}: expected XZ radius=${expectedRadius}, got ${maxR}`);
  }

  // Encode Animations (no target on animation bufferViews per glTF 2.0 spec)
  const gltfAnimations = animations.map((anim) => {
    const timeAcc = addVecAccessor(anim.times, 1, undefined);
    const samplers = [];
    const channels = [];
    for (const tr of anim.tracks) {
      const comps = tr.path === 'rotation' ? 4 : 3;
      const flat = new Float32Array(tr.values.length * comps);
      for (let i = 0; i < tr.values.length; i++) {
        for (let c = 0; c < comps; c++) flat[i * comps + c] = tr.values[i][c];
      }
      const valAcc = addVecAccessor(flat, comps, undefined);
      const sIdx = samplers.length;
      samplers.push({ input: timeAcc, interpolation: 'LINEAR', output: valAcc });
      channels.push({
        sampler: sIdx,
        target: { node: nameToIdx.get(tr.nodeName), path: tr.path },
      });
    }
    return { name: anim.name, samplers, channels };
  });

  const gltf = {
    asset: { version: '2.0', generator: 'StarfallConcordAirGenerator/1.0' },
    scene: 0,
    scenes: [{ name: sceneName, nodes: [0] }],
    nodes: gltfNodes,
    meshes: gltfMeshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
    animations: gltfAnimations,
  };

  const jsonBufRaw = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonBufRaw.length % 4)) % 4;
  const jsonBuf = jsonPad ? Buffer.concat([jsonBufRaw, Buffer.alloc(jsonPad, 0x20)]) : jsonBufRaw;
  const binBuf = Buffer.concat(binChunks);

  const totalLength = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binBuf.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  fs.writeFileSync(outPath, Buffer.concat([header, jsonHeader, jsonBuf, binHeader, binBuf]));
  return {
    outPath,
    bytes: totalLength,
    triCount,
    boundsMin: wMin.map((v) => +v.toFixed(5)),
    boundsMax: wMax.map((v) => +v.toFixed(5)),
    xzRadius: +maxR.toFixed(5),
    clips: gltfAnimations.map((a) => a.name),
  };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dawnInfo = exportGLB(buildDawnInterceptor(), path.join(OUT_DIR, 'dawn_interceptor.glb'));
  const prismInfo = exportGLB(buildPrismRay(), path.join(OUT_DIR, 'prism_ray.glb'));
  console.log(JSON.stringify({ dawn_interceptor: dawnInfo, prism_ray: prismInfo }, null, 2));
}

if (require.main === module) {
  main();
}
