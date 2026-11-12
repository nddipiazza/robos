#!/usr/bin/env node
'use strict';

/**
 * Deterministic Standalone Procedural GLB Generator for Starfall Command
 * Faction: Gnarl Brood — Adaptation & Subterranean Ambush Tech Branch
 *
 * Outputs ONLY inside target directory (default __dirname):
 *   1. adaptation_chamber.glb — Evolution Chamber equivalent (radius 2.5, floor Y=0, +X forward).
 *                               Broad, low octagonal-scalloped purple-chitin splicing plate with
 *                               +X receptor mandibles, synaptic arterial conduits, and three
 *                               pulsating translucent genome vessels housing double-helix strands
 *                               and glowing mutagenic nuclei.
 *                               Meshes/Nodes: includes Surf_TEAM_*, Surf_GLOW_*.
 *                               Animations: 'idle' (seamless loop).
 *
 *   2. ambusher_den.glb       — Lurker Den equivalent (radius 2.5, floor Y=0, +X forward).
 *                               Subterranean predator lair crowned by a broad 7-blade crescent
 *                               fan of purple-lavender chitin & ivory-bone scythe-blades framing
 *                               a gaping, muscular, toothed +X living throat maw.
 *                               Meshes/Nodes: includes Surf_TEAM_*, Surf_GLOW_*.
 *                               Animations: 'idle' (seamless loop).
 *
 *   3. spine_ambusher.glb     — Lurker equivalent (radius 1.875, floor Y=0, +X forward).
 *                               Wide, low-slung ambush insect with six articulated bone-edged
 *                               scythe legs, burrowing horned head & scissoring mandibles, and a
 *                               menacing 3D radial crown of 11 barbed dorsal lancet spines.
 *                               Anchor: 'SpineOrigin' (plus 'Head', 'Muzzle').
 *                               Meshes/Nodes: includes Surf_TEAM_*, Surf_GLOW_*.
 *                               Animations: 'idle', 'walk', 'attack', 'burrow', 'surface', 'death'.
 *
 * Uses ONLY built-in Node.js modules ('fs', 'path', 'crypto'). Zero external dependencies.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Deterministic Math, Vector & Quaternion Utilities
// ---------------------------------------------------------------------------

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function vAdd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vSub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vScale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function vLerp(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function vDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vCross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vLen(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

function vNorm(a) {
  const l = vLen(a);
  return l > 1e-10 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function quatFromAxisAngle(axis, rad) {
  const n = vNorm(axis);
  const half = rad * 0.5;
  const s = Math.sin(half);
  const c = Math.cos(half);
  const l = Math.hypot(n[0] * s, n[1] * s, n[2] * s, c) || 1;
  return [
    Number(((n[0] * s) / l).toFixed(7)),
    Number(((n[1] * s) / l).toFixed(7)),
    Number(((n[2] * s) / l).toFixed(7)),
    Number((c / l).toFixed(7)),
  ];
}

function quatFromEulerXYZ(rxDeg, ryDeg, rzDeg) {
  const rx = (rxDeg * Math.PI) / 360;
  const ry = (ryDeg * Math.PI) / 360;
  const rz = (rzDeg * Math.PI) / 360;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // Intrinsic Z * Y * X composition matching standard Euler XYZ
  const qx = [sx, 0, 0, cx];
  const qy = [0, sy, 0, cy];
  const qz = [0, 0, sz, cz];
  return quatMul(qz, quatMul(qy, qx));
}

function quatMul(a, b) {
  const x = a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1];
  const y = a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0];
  const z = a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3];
  const w = a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2];
  const l = Math.hypot(x, y, z, w) || 1;
  return [
    Number((x / l).toFixed(7)),
    Number((y / l).toFixed(7)),
    Number((z / l).toFixed(7)),
    Number((w / l).toFixed(7)),
  ];
}

function quatSlerp(a, b, t) {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (dot < 0) {
    dot = -dot;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  if (dot > 0.9995) {
    const x = a[0] + (bx - a[0]) * t;
    const y = a[1] + (by - a[1]) * t;
    const z = a[2] + (bz - a[2]) * t;
    const w = a[3] + (bw - a[3]) * t;
    const l = Math.hypot(x, y, z, w) || 1;
    return [x / l, y / l, z / l, w / l];
  }
  const theta0 = Math.acos(clamp(dot, -1, 1));
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;
  return [
    a[0] * s0 + bx * s1,
    a[1] * s0 + by * s1,
    a[2] * s0 + bz * s1,
    a[3] * s0 + bw * s1,
  ];
}

function rotateVecByQuat(v, q) {
  const u = [q[0], q[1], q[2]];
  const s = q[3];
  const d = vDot(u, v);
  const c = vCross(u, v);
  const uu = vDot(u, u);
  return [
    2 * d * u[0] + (s * s - uu) * v[0] + 2 * s * c[0],
    2 * d * u[1] + (s * s - uu) * v[1] + 2 * s * c[1],
    2 * d * u[2] + (s * s - uu) * v[2] + 2 * s * c[2],
  ];
}

function srgbHexToLinear(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [
    Number(toLin(r).toFixed(6)),
    Number(toLin(g).toFixed(6)),
    Number(toLin(b).toFixed(6)),
  ];
}

function makeRectChamferRing(hx, hz, ch, y, cx = 0, cz = 0) {
  const c = Math.min(ch, hx * 0.90, hz * 0.90);
  return [
    [cx + hx, y, cz - hz + c],
    [cx + hx, y, cz + hz - c],
    [cx + hx - c, y, cz + hz],
    [cx - hx + c, y, cz + hz],
    [cx - hx, y, cz + hz - c],
    [cx - hx, y, cz - hz + c],
    [cx - hx + c, y, cz - hz],
    [cx + hx - c, y, cz - hz],
  ];
}

function makeOvalRing(rx, rz, y, cx = 0, cz = 0, segs = 12, phase = 0) {
  const ring = [];
  for (let i = 0; i < segs; i++) {
    const th = (2 * Math.PI * i) / segs + phase;
    ring.push([cx + Math.cos(th) * rx, y, cz + Math.sin(th) * rz]);
  }
  return ring;
}

function quadBezier3(p0, p1, p2, t) {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    u * u * p0[2] + 2 * u * t * p1[2] + t * t * p2[2],
  ];
}

// ---------------------------------------------------------------------------
// Low-Poly Flat-Shaded Procedural Geometry Builder (Outward-Normal Verified)
// ---------------------------------------------------------------------------

class PrimitiveGeom {
  constructor(materialIndex) {
    this.materialIndex = materialIndex;
    this.positions = [];
    this.normals = [];
    this.indices = [];
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  isEmpty() {
    return this.indices.length === 0;
  }

  addTri(a, b, c, outwardHint = null) {
    const ab = vSub(b, a);
    const ac = vSub(c, a);
    const raw = vCross(ab, ac);
    if (vLen(raw) < 1e-9) return;
    let n = vNorm(raw);
    let p1 = b, p2 = c;
    if (outwardHint && vDot(n, outwardHint) < 0) {
      n = vScale(n, -1);
      p1 = c;
      p2 = b;
    }
    const base = this.vertexCount;
    this.positions.push(
      a[0], a[1], a[2],
      p1[0], p1[1], p1[2],
      p2[0], p2[1], p2[2]
    );
    this.normals.push(
      n[0], n[1], n[2],
      n[0], n[1], n[2],
      n[0], n[1], n[2]
    );
    this.indices.push(base, base + 1, base + 2);
  }

  addQuad(a, b, c, d, outwardHint = null) {
    this.addTri(a, b, c, outwardHint);
    this.addTri(a, c, d, outwardHint);
  }

  addPolygonCap(ring, normalDir) {
    if (ring.length < 3) return;
    let cx = 0, cy = 0, cz = 0;
    for (const p of ring) {
      cx += p[0]; cy += p[1]; cz += p[2];
    }
    const ctr = [cx / ring.length, cy / ring.length, cz / ring.length];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      this.addTri(ctr, a, b, normalDir);
    }
  }

  addLoft(rings, ringCenters = null, capStart = true, capEnd = true) {
    if (rings.length < 2) return;
    const segs = rings[0].length;
    const centers =
      ringCenters ||
      rings.map((r) => {
        let sx = 0, sy = 0, sz = 0;
        for (const p of r) { sx += p[0]; sy += p[1]; sz += p[2]; }
        return [sx / r.length, sy / r.length, sz / r.length];
      });

    for (let k = 0; k < rings.length - 1; k++) {
      const r0 = rings[k];
      const r1 = rings[k + 1];
      const midC = vScale(vAdd(centers[k], centers[k + 1]), 0.5);
      for (let i = 0; i < segs; i++) {
        const j = (i + 1) % segs;
        const a = r0[i], b = r0[j], c = r1[j], d = r1[i];
        const qMid = [
          (a[0] + b[0] + c[0] + d[0]) * 0.25,
          (a[1] + b[1] + c[1] + d[1]) * 0.25,
          (a[2] + b[2] + c[2] + d[2]) * 0.25,
        ];
        this.addQuad(a, b, c, d, vSub(qMid, midC));
      }
    }

    if (capStart) {
      const dir = vSub(centers[0], centers[1]);
      this.addPolygonCap(rings[0], vLen(dir) > 1e-6 ? dir : [0, -1, 0]);
    }
    if (capEnd) {
      const last = rings.length - 1;
      const dir = vSub(centers[last], centers[last - 1]);
      this.addPolygonCap(rings[last], vLen(dir) > 1e-6 ? dir : [0, 1, 0]);
    }
  }

  addCyclicRingLoft(rings, ringCenters) {
    const R = rings.length;
    const M = rings[0].length;
    for (let r = 0; r < R; r++) {
      const rNext = (r + 1) % R;
      const cm = vLerp(ringCenters[r], ringCenters[rNext], 0.5);
      for (let i = 0; i < M; i++) {
        const iNext = (i + 1) % M;
        const p00 = rings[r][i];
        const p01 = rings[r][iNext];
        const p11 = rings[rNext][iNext];
        const p10 = rings[rNext][i];
        const quadMid = vScale(vAdd(vAdd(p00, p01), vAdd(p10, p11)), 0.25);
        this.addQuad(p00, p01, p11, p10, vSub(quadMid, cm));
      }
    }
  }

  addChamferBox({
    center = [0, 0, 0],
    size = [1, 1, 1],
    rotDeg = [0, 0, 0],
    topScale = [0.88, 0.88],
    botScale = [1.0, 1.0],
    chamfer = 0.15,
    minYClamp = null,
  }) {
    const q = quatFromEulerXYZ(rotDeg[0], rotDeg[1], rotDeg[2]);
    const hx = size[0] * 0.5;
    const hy = size[1] * 0.5;
    const hz = size[2] * 0.5;
    const chB = Math.min(hx, hz) * chamfer * 2.0;
    const chT = Math.min(hx * topScale[0], hz * topScale[1]) * chamfer * 2.0;

    const rawBot = makeRectChamferRing(hx * botScale[0], hz * botScale[1], chB, -hy);
    const rawTop = makeRectChamferRing(hx * topScale[0], hz * topScale[1], chT, hy);

    const xf = (pt) => {
      const w = vAdd(center, rotateVecByQuat(pt, q));
      if (minYClamp !== null && w[1] < minYClamp) w[1] = minYClamp;
      return w;
    };
    this.addLoft([rawBot.map(xf), rawTop.map(xf)], [xf([0, -hy, 0]), xf([0, hy, 0])], true, true);
  }

  addTubeAlongSpine(stations, sides = 6, capStart = true, capEnd = true, upHint = [0, 1, 0], minYClamp = null) {
    if (stations.length < 2) return;
    const rings = [];
    const centers = [];
    let prevUp = vNorm(upHint);

    for (let k = 0; k < stations.length; k++) {
      const cur = stations[k].pos;
      let tang;
      if (k === 0) tang = vNorm(vSub(stations[1].pos, cur));
      else if (k === stations.length - 1) tang = vNorm(vSub(cur, stations[k - 1].pos));
      else tang = vNorm(vSub(stations[k + 1].pos, stations[k - 1].pos));

      let side = vCross(tang, prevUp);
      if (vLen(side) < 1e-4) side = vCross(tang, [0, 0, 1]);
      if (vLen(side) < 1e-4) side = vCross(tang, [1, 0, 0]);
      side = vNorm(side);
      const up = vNorm(vCross(side, tang));
      prevUp = up;

      const rx = stations[k].rx ?? stations[k].r ?? 0.10;
      const ry = stations[k].ry ?? stations[k].r ?? 0.10;
      const ring = [];
      for (let i = 0; i < sides; i++) {
        const th = (2 * Math.PI * i) / sides + Math.PI / sides;
        const cs = Math.cos(th) * rx;
        const sn = Math.sin(th) * ry;
        const pt = vAdd(cur, vAdd(vScale(side, cs), vScale(up, sn)));
        if (minYClamp !== null && pt[1] < minYClamp) pt[1] = minYClamp;
        ring.push(pt);
      }
      rings.push(ring);
      const cPt = [...cur];
      if (minYClamp !== null && cPt[1] < minYClamp) cPt[1] = minYClamp;
      centers.push(cPt);
    }
    this.addLoft(rings, centers, capStart, capEnd);
  }

  addSculptedLobe({
    center = [0, 0, 0],
    radii = [0.5, 0.5, 0.5],
    rotDeg = [0, 0, 0],
    sectors = 10,
    stacks = 6,
    flattenBottom = 0.0,
    pinchX = 0.0,
    ribCount = 0,
    ribAmp = 0.0,
    phaseRad = 0,
    minYClamp = null,
  }) {
    const q = quatFromEulerXYZ(rotDeg[0], rotDeg[1], rotDeg[2]);
    const xf = (p) => {
      const w = vAdd(center, rotateVecByQuat(p, q));
      if (minYClamp !== null && w[1] < minYClamp) w[1] = minYClamp;
      return w;
    };

    const botY = -radii[1] * (1.0 - flattenBottom * 0.55);
    const botPole = xf([0, botY, 0]);
    const topPole = xf([0, radii[1], 0]);

    const rings = [];
    for (let st = 1; st < stacks; st++) {
      const v = st / stacks;
      const phi = (v - 0.5) * Math.PI;
      let y = Math.sin(phi) * radii[1];
      if (y < 0 && flattenBottom > 0) {
        y *= 1.0 - flattenBottom * 0.55 * Math.abs(Math.sin(phi));
      }
      const cosP = Math.cos(phi);
      const ring = [];
      for (let s = 0; s < sectors; s++) {
        const th = (2 * Math.PI * s) / sectors + phaseRad;
        const c = Math.cos(th);
        const sn = Math.sin(th);
        const rib = ribCount > 0 ? 1.0 + ribAmp * Math.sin(v * Math.PI) * Math.cos(ribCount * th) : 1.0;
        const xVal = c * cosP * radii[0] * rib;
        const pinch = 1.0 + pinchX * (xVal / (radii[0] || 1));
        const zVal = sn * cosP * radii[2] * rib * pinch;
        ring.push(xf([xVal, y, zVal]));
      }
      rings.push(ring);
    }

    for (let s = 0; s < sectors; s++) {
      const j = (s + 1) % sectors;
      const a = rings[0][s], b = rings[0][j];
      const midB = vScale(vAdd(botPole, vAdd(a, b)), 1 / 3);
      this.addTri(botPole, b, a, vSub(midB, center));
    }
    for (let k = 0; k < rings.length - 1; k++) {
      const r0 = rings[k], r1 = rings[k + 1];
      for (let s = 0; s < sectors; s++) {
        const j = (s + 1) % sectors;
        const qMid = vScale(vAdd(vAdd(r0[s], r0[j]), vAdd(r1[j], r1[s])), 0.25);
        this.addQuad(r0[s], r0[j], r1[j], r1[s], vSub(qMid, center));
      }
    }
    const lastR = rings[rings.length - 1];
    for (let s = 0; s < sectors; s++) {
      const j = (s + 1) % sectors;
      const a = lastR[s], b = lastR[j];
      const midT = vScale(vAdd(topPole, vAdd(a, b)), 1 / 3);
      this.addTri(topPole, a, b, vSub(midT, center));
    }
  }

  addFacetedCrystal({
    center = [0, 0, 0],
    radii = [0.2, 0.3, 0.2],
    rotDeg = [0, 0, 0],
    sectors = 6,
    stacks = 4,
    phaseRad = 0,
  }) {
    const q = quatFromEulerXYZ(rotDeg[0], rotDeg[1], rotDeg[2]);
    const xf = (p) => vAdd(center, rotateVecByQuat(p, q));
    const botPole = xf([0, -radii[1], 0]);
    const topPole = xf([0, radii[1], 0]);

    const rings = [];
    for (let st = 1; st < stacks; st++) {
      const v = st / stacks;
      const phi = (v - 0.5) * Math.PI;
      const y = Math.sin(phi) * radii[1];
      const cosP = Math.cos(phi);
      const ring = [];
      for (let s = 0; s < sectors; s++) {
        const th = (2 * Math.PI * s) / sectors + phaseRad;
        ring.push(xf([Math.cos(th) * cosP * radii[0], y, Math.sin(th) * cosP * radii[2]]));
      }
      rings.push(ring);
    }

    for (let s = 0; s < sectors; s++) {
      const j = (s + 1) % sectors;
      const a = rings[0][s], b = rings[0][j];
      const midB = vScale(vAdd(botPole, vAdd(a, b)), 1 / 3);
      this.addTri(botPole, b, a, vSub(midB, center));
    }
    for (let k = 0; k < rings.length - 1; k++) {
      const r0 = rings[k], r1 = rings[k + 1];
      for (let s = 0; s < sectors; s++) {
        const j = (s + 1) % sectors;
        const qMid = vScale(vAdd(vAdd(r0[s], r0[j]), vAdd(r1[j], r1[s])), 0.25);
        this.addQuad(r0[s], r0[j], r1[j], r1[s], vSub(qMid, center));
      }
    }
    const lastR = rings[rings.length - 1];
    for (let s = 0; s < sectors; s++) {
      const j = (s + 1) % sectors;
      const a = lastR[s], b = lastR[j];
      const midT = vScale(vAdd(topPole, vAdd(a, b)), 1 / 3);
      this.addTri(topPole, a, b, vSub(midT, center));
    }
  }

  addOrientedShield(origin, outAxis, upAxis, poly2D, thickness = 0.045, topShrink = 0.84, backInset = 0.012) {
    const out = vNorm(outAxis);
    let right = vCross(upAxis, out);
    if (vLen(right) < 1e-5) right = vCross([0, 1, 0], out);
    right = vNorm(right);
    const up = vNorm(vCross(out, right));

    const rBack = poly2D.map(([x, y]) =>
      vAdd(origin, vAdd(vScale(right, x), vAdd(vScale(up, y), vScale(out, -backInset))))
    );
    const rFront = poly2D.map(([x, y]) =>
      vAdd(
        origin,
        vAdd(vScale(right, x * topShrink), vAdd(vScale(up, y * topShrink), vScale(out, thickness)))
      )
    );
    this.addLoft(
      [rBack, rFront],
      [vAdd(origin, vScale(out, -backInset)), vAdd(origin, vScale(out, thickness))],
      true,
      true
    );
  }

  /**
   * Curved diamond-section chitin/bone scythe blade along a quadratic Bezier arc (p0 -> pCtrl -> p2).
   * edgeHint points toward the sharp cutting / flared blade edge; back side forms a reinforced spine.
   */
  addCurvedScytheBlade({
    p0,
    pCtrl,
    p2,
    edgeHint,
    steps = 5,
    widthStart = 0.14,
    widthPeak = 0.42,
    widthEnd = 0.012,
    backStart = 0.09,
    backPeak = 0.12,
    backEnd = 0.008,
    thickStart = 0.13,
    thickPeak = 0.16,
    thickEnd = 0.010,
    peakT = 0.36,
    minYClamp = null,
  }) {
    const rings = [];
    const centers = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const pos = quadBezier3(p0, pCtrl, p2, t);
      const dt = 0.02;
      const tA = Math.max(0, t - dt);
      const tB = Math.min(1, t + dt);
      const tang = vNorm(vSub(quadBezier3(p0, pCtrl, p2, tB), quadBezier3(p0, pCtrl, p2, tA)));

      let eDir = vSub(edgeHint, vScale(tang, vDot(edgeHint, tang)));
      if (vLen(eDir) < 1e-4) eDir = vCross(tang, [0, 1, 0]);
      if (vLen(eDir) < 1e-4) eDir = vCross(tang, [0, 0, 1]);
      eDir = vNorm(eDir);
      const sideDir = vNorm(vCross(tang, eDir));

      let fw, bw, th;
      if (t <= peakT) {
        const u = peakT > 1e-5 ? t / peakT : 1;
        const s = Math.sin(u * Math.PI * 0.5);
        fw = widthStart + (widthPeak - widthStart) * s;
        bw = backStart + (backPeak - backStart) * s;
        th = thickStart + (thickPeak - thickStart) * s;
      } else {
        const u = (t - peakT) / Math.max(1e-5, 1 - peakT);
        const taper = Math.pow(1 - u, 0.85);
        fw = widthEnd + (widthPeak - widthEnd) * taper;
        bw = backEnd + (backPeak - backEnd) * taper;
        th = thickEnd + (thickPeak - thickEnd) * taper;
      }

      // 6-point hexagonal/diamond blade section: razor leading edge -> twin bevel shoulders -> reinforced spine
      const pts = [
        vAdd(pos, vScale(eDir, fw)), // 0: sharp blade cutting edge
        vAdd(pos, vAdd(vScale(eDir, fw * 0.28), vScale(sideDir, th * 0.5))),
        vAdd(pos, vAdd(vScale(eDir, -bw * 0.62), vScale(sideDir, th * 0.36))),
        vAdd(pos, vScale(eDir, -bw)), // 3: reinforced dorsal/back spine
        vAdd(pos, vAdd(vScale(eDir, -bw * 0.62), vScale(sideDir, -th * 0.36))),
        vAdd(pos, vAdd(vScale(eDir, fw * 0.28), vScale(sideDir, -th * 0.5))),
      ];
      for (const p of pts) {
        if (minYClamp !== null && p[1] < minYClamp) p[1] = minYClamp;
      }
      const cPt = vAdd(pos, vScale(eDir, (fw - bw) * 0.18));
      if (minYClamp !== null && cPt[1] < minYClamp) cPt[1] = minYClamp;
      rings.push(pts);
      centers.push(cPt);
    }
    this.addLoft(rings, centers, true, true);
  }

  /**
   * Helical genetic strand tube inside Adaptation Chamber genome vessels.
   */
  addHelicalStrand({
    center = [0, 0, 0],
    helixR = 0.20,
    yStart = 0.0,
    yEnd = 1.0,
    turns = 1.15,
    phaseRad = 0.0,
    tubeR = 0.052,
    steps = 12,
  }) {
    const stations = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const th = phaseRad + u * turns * 2 * Math.PI;
      const env = 0.72 + 0.28 * Math.sin(u * Math.PI);
      const r = helixR * env;
      const taper = 0.55 + 0.45 * Math.sin(u * Math.PI);
      stations.push({
        pos: [
          center[0] + Math.cos(th) * r,
          center[1] + yStart + (yEnd - yStart) * u,
          center[2] + Math.sin(th) * r,
        ],
        rx: tubeR * taper,
        ry: tubeR * taper,
      });
    }
    this.addTubeAlongSpine(stations, 5, true, true, [0, 1, 0]);
  }
}

/**
 * Multi-material barbed radial dorsal spine lancet helper:
 * - gSocket: dark chitin eruptive follicle collar at base
 * - gShaft:  purple/aged-bone fluted lower shaft
 * - gBone:   gleaming diamond-faceted barbed ivory-bone spearhead
 */
function addBarbedLancetSpine({
  basePos,
  dirVec,
  length,
  baseR = 0.115,
  barbFlare = 1.24,
  gSocket,
  gShaft,
  gBone,
}) {
  const dir = vNorm(dirVec);
  let side = vCross(dir, [0, 1, 0]);
  if (vLen(side) < 1e-4) side = vCross(dir, [1, 0, 0]);
  side = vNorm(side);

  // 1. Dark chitin follicle collar
  gSocket.addTubeAlongSpine(
    [
      { pos: vAdd(basePos, vScale(dir, -0.04)), rx: baseR * 1.30, ry: baseR * 1.18 },
      { pos: vAdd(basePos, vScale(dir, length * 0.16)), rx: baseR * 1.05, ry: baseR * 0.96 },
    ],
    6,
    true,
    true,
    side
  );

  // 2. Lower armored chitin/aged-bone shaft
  gShaft.addTubeAlongSpine(
    [
      { pos: vAdd(basePos, vScale(dir, length * 0.12)), rx: baseR * 0.96, ry: baseR * 0.84 },
      { pos: vAdd(basePos, vScale(dir, length * 0.44)), rx: baseR * 0.78, ry: baseR * 0.68 },
    ],
    5,
    true,
    true,
    side
  );

  // 3. Barbed diamond-faceted ivory-bone lancet head (flares at 42% then tapers to razor point!)
  gBone.addTubeAlongSpine(
    [
      { pos: vAdd(basePos, vScale(dir, length * 0.38)), rx: baseR * 0.68, ry: baseR * 0.56 },
      { pos: vAdd(basePos, vScale(dir, length * 0.48)), rx: baseR * barbFlare, ry: baseR * 0.80 },
      { pos: vAdd(basePos, vScale(dir, length * 0.78)), rx: baseR * 0.52, ry: baseR * 0.38 },
      { pos: vAdd(basePos, vScale(dir, length)), rx: 0.006, ry: 0.005 },
    ],
    4,
    true,
    true,
    side
  );
}

// ---------------------------------------------------------------------------
// glTF 2.0 Binary (.glb) Deterministic Scene Builder
// ---------------------------------------------------------------------------

class GLBSceneBuilder {
  constructor(generatorTag = 'StarfallCommand-GnarlAdaptationGenerator-1.0') {
    this.generatorTag = generatorTag;
    this.materials = [];
    this.meshes = [];
    this.nodes = [];
    this.animations = [];
    this.bufferChunks = [];
    this.byteOffset = 0;
    this.bufferViews = [];
    this.accessors = [];
  }

  addMaterial({
    name,
    hex,
    alpha = 1.0,
    metallic = 0.16,
    roughness = 0.50,
    emissiveHex = null,
    emissiveBoost = 1.0,
    alphaMode = undefined,
    doubleSided = false,
  }) {
    const rgb = srgbHexToLinear(hex);
    const mat = {
      name,
      pbrMetallicRoughness: {
        baseColorFactor: [rgb[0], rgb[1], rgb[2], Number(alpha.toFixed(4))],
        metallicFactor: Number(metallic.toFixed(4)),
        roughnessFactor: Number(roughness.toFixed(4)),
      },
    };
    if (emissiveHex) {
      const e = srgbHexToLinear(emissiveHex);
      mat.emissiveFactor = [
        Number(clamp(e[0] * emissiveBoost, 0, 1).toFixed(6)),
        Number(clamp(e[1] * emissiveBoost, 0, 1).toFixed(6)),
        Number(clamp(e[2] * emissiveBoost, 0, 1).toFixed(6)),
      ];
    }
    if (alphaMode) mat.alphaMode = alphaMode;
    else if (alpha < 1.0) mat.alphaMode = 'BLEND';
    if (doubleSided) mat.doubleSided = true;
    const idx = this.materials.length;
    this.materials.push(mat);
    return idx;
  }

  _appendBuffer(buf, target) {
    const pad = (4 - (buf.length % 4)) % 4;
    const aligned = pad > 0 ? Buffer.concat([buf, Buffer.alloc(pad, 0)]) : buf;
    const bv = {
      buffer: 0,
      byteOffset: this.byteOffset,
      byteLength: buf.length,
    };
    if (target !== undefined) bv.target = target;
    const bvIndex = this.bufferViews.length;
    this.bufferViews.push(bv);
    this.bufferChunks.push(aligned);
    this.byteOffset += aligned.length;
    return bvIndex;
  }

  _addFloatAccessor(floatArray, comps, typeStr, target) {
    const buf = Buffer.alloc(floatArray.length * 4);
    const mins = new Array(comps).fill(Infinity);
    const maxs = new Array(comps).fill(-Infinity);
    for (let i = 0; i < floatArray.length; i++) {
      const v = Number.isFinite(floatArray[i]) ? floatArray[i] : 0;
      buf.writeFloatLE(v, i * 4);
      const c = i % comps;
      const f32 = buf.readFloatLE(i * 4);
      if (f32 < mins[c]) mins[c] = f32;
      if (f32 > maxs[c]) maxs[c] = f32;
    }
    const bv = this._appendBuffer(buf, target);
    const accIdx = this.accessors.length;
    this.accessors.push({
      bufferView: bv,
      componentType: 5126, // FLOAT
      count: floatArray.length / comps,
      type: typeStr,
      min: mins.map((x) => Number(x.toFixed(6))),
      max: maxs.map((x) => Number(x.toFixed(6))),
    });
    return accIdx;
  }

  _addU16Accessor(intArray, target) {
    const buf = Buffer.alloc(intArray.length * 2);
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < intArray.length; i++) {
      buf.writeUInt16LE(intArray[i], i * 2);
      if (intArray[i] < mn) mn = intArray[i];
      if (intArray[i] > mx) mx = intArray[i];
    }
    const bv = this._appendBuffer(buf, target);
    const accIdx = this.accessors.length;
    this.accessors.push({
      bufferView: bv,
      componentType: 5123, // UNSIGNED_SHORT
      count: intArray.length,
      type: 'SCALAR',
      min: [mn],
      max: [mx],
    });
    return accIdx;
  }

  addMesh(name, primGeoms) {
    const primitives = [];
    for (const pg of primGeoms) {
      if (!pg || pg.isEmpty()) continue;
      if (pg.vertexCount > 65535) {
        throw new Error(`Primitive in mesh ${name} exceeds uint16 vertex limit: ${pg.vertexCount}`);
      }
      const posAcc = this._addFloatAccessor(pg.positions, 3, 'VEC3', 34962);
      const normAcc = this._addFloatAccessor(pg.normals, 3, 'VEC3', 34962);
      const idxAcc = this._addU16Accessor(pg.indices, 34963);
      primitives.push({
        attributes: { POSITION: posAcc, NORMAL: normAcc },
        indices: idxAcc,
        material: pg.materialIndex,
        mode: 4,
      });
    }
    if (primitives.length === 0) throw new Error(`Empty mesh: ${name}`);
    const meshIdx = this.meshes.length;
    this.meshes.push({ name, primitives });
    return meshIdx;
  }

  addNode({ name, meshIndex = null, translation = null, rotation = null, scale = null, parentIndex = null }) {
    const node = { name };
    if (meshIndex !== null) node.mesh = meshIndex;
    if (translation) node.translation = translation.map((v) => Number(v.toFixed(6)));
    if (rotation) node.rotation = rotation.map((v) => Number(v.toFixed(7)));
    if (scale) node.scale = scale.map((v) => Number(v.toFixed(6)));
    const idx = this.nodes.length;
    this.nodes.push(node);
    if (parentIndex !== null) {
      if (!this.nodes[parentIndex].children) this.nodes[parentIndex].children = [];
      this.nodes[parentIndex].children.push(idx);
    }
    return idx;
  }

  addAnimation(name, tracks) {
    const samplers = [];
    const channels = [];
    for (const tr of tracks) {
      const inAcc = this._addFloatAccessor(tr.times, 1, 'SCALAR');
      const flat = [];
      const comps = tr.path === 'rotation' ? 4 : 3;
      const typeStr = tr.path === 'rotation' ? 'VEC4' : 'VEC3';
      for (const val of tr.values) {
        for (let c = 0; c < comps; c++) flat.push(val[c]);
      }
      const outAcc = this._addFloatAccessor(flat, comps, typeStr);
      const sampIdx = samplers.length;
      samplers.push({
        input: inAcc,
        output: outAcc,
        interpolation: tr.interpolation || 'LINEAR',
      });
      channels.push({
        sampler: sampIdx,
        target: { node: tr.nodeIndex, path: tr.path },
      });
    }
    this.animations.push({ name, samplers, channels });
  }

  buildGLB(sceneName) {
    const hasParent = new Set();
    for (const n of this.nodes) {
      for (const c of n.children || []) hasParent.add(c);
    }
    const rootNodes = [];
    for (let i = 0; i < this.nodes.length; i++) {
      if (!hasParent.has(i)) rootNodes.push(i);
    }

    const binChunk = Buffer.concat(this.bufferChunks);
    const gltf = {
      asset: {
        version: '2.0',
        generator: this.generatorTag,
      },
      scene: 0,
      scenes: [{ name: sceneName, nodes: rootNodes }],
      nodes: this.nodes,
      materials: this.materials,
      meshes: this.meshes,
      accessors: this.accessors,
      bufferViews: this.bufferViews,
      buffers: [{ byteLength: binChunk.length }],
    };
    if (this.animations.length > 0) gltf.animations = this.animations;

    const jsonRaw = Buffer.from(JSON.stringify(gltf), 'utf8');
    const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
    const jsonChunk = jsonPad > 0 ? Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]) : jsonRaw;

    const totalLen = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0); // 'glTF'
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(totalLen, 8);

    const jsonHdr = Buffer.alloc(8);
    jsonHdr.writeUInt32LE(jsonChunk.length, 0);
    jsonHdr.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

    const binHdr = Buffer.alloc(8);
    binHdr.writeUInt32LE(binChunk.length, 0);
    binHdr.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

    return {
      glbBuffer: Buffer.concat([header, jsonHdr, jsonChunk, binHdr, binChunk]),
      gltf,
    };
  }
}

// ---------------------------------------------------------------------------
// Unified Gnarl Brood Adaptation & Ambush Palette
// ---------------------------------------------------------------------------

function createGnarlAdaptationMaterials(scene) {
  return {
    // Dedicated player-color & glow surfaces (mesh, node, and material names all carry Surf_TEAM / Surf_GLOW)
    Surf_TEAM: scene.addMaterial({
      name: 'Surf_TEAM_Panel',
      hex: '#e8483c',
      metallic: 0.20,
      roughness: 0.40,
      emissiveHex: '#b82a20',
      emissiveBoost: 0.42,
    }),
    Surf_GLOW: scene.addMaterial({
      name: 'Surf_GLOW_Accent',
      hex: '#ff705e',
      metallic: 0.04,
      roughness: 0.18,
      emissiveHex: '#ff5240',
      emissiveBoost: 1.85,
    }),

    // Gnarl Brood Chitin & Calcified Scythe-Bone Lineage
    Mat_ChitinBody: scene.addMaterial({
      name: 'Mat_ChitinBody',
      hex: '#4d3259',
      metallic: 0.22,
      roughness: 0.46,
    }),
    Mat_ChitinRidge: scene.addMaterial({
      name: 'Mat_ChitinRidge',
      hex: '#9c70b5',
      metallic: 0.18,
      roughness: 0.35,
    }),
    Mat_ChitinDark: scene.addMaterial({
      name: 'Mat_ChitinDark',
      hex: '#201229',
      metallic: 0.28,
      roughness: 0.54,
    }),
    Mat_BoneScythe: scene.addMaterial({
      name: 'Mat_BoneScythe',
      hex: '#e4d5bc',
      metallic: 0.10,
      roughness: 0.34,
    }),
    Mat_BoneShaft: scene.addMaterial({
      name: 'Mat_BoneShaft',
      hex: '#a89276',
      metallic: 0.12,
      roughness: 0.46,
    }),

    // Visceral Musculature & Living Throat Tissues
    Mat_VisceralOuter: scene.addMaterial({
      name: 'Mat_VisceralOuter',
      hex: '#732842',
      metallic: 0.06,
      roughness: 0.60,
    }),
    Mat_VisceralInner: scene.addMaterial({
      name: 'Mat_VisceralInner',
      hex: '#bf3959',
      metallic: 0.04,
      roughness: 0.32,
      emissiveHex: '#631227',
      emissiveBoost: 0.36,
    }),
    Mat_ThroatAbyss: scene.addMaterial({
      name: 'Mat_ThroatAbyss',
      hex: '#08030d',
      metallic: 0.0,
      roughness: 0.98,
    }),

    // Genome Splicing & Seismic Bioluminescence (Rich saturation without blowout)
    Mat_BioEmerald: scene.addMaterial({
      name: 'Mat_BioEmerald',
      hex: '#36d620',
      metallic: 0.04,
      roughness: 0.24,
      emissiveHex: '#1c7d0e',
      emissiveBoost: 0.48,
    }),
    Mat_BioChartreuse: scene.addMaterial({
      name: 'Mat_BioChartreuse',
      hex: '#a8f229',
      metallic: 0.02,
      roughness: 0.18,
      emissiveHex: '#6ab50d',
      emissiveBoost: 0.62,
    }),
    Mat_BioAmberCore: scene.addMaterial({
      name: 'Mat_BioAmberCore',
      hex: '#f27d12',
      metallic: 0.02,
      roughness: 0.20,
      emissiveHex: '#b34b00',
      emissiveBoost: 0.60,
    }),
    Mat_VesselMembrane: scene.addMaterial({
      name: 'Mat_VesselMembrane',
      hex: '#6be846',
      alpha: 0.28,
      metallic: 0.02,
      roughness: 0.14,
      emissiveHex: '#287d15',
      emissiveBoost: 0.22,
      alphaMode: 'BLEND',
      doubleSided: true,
    }),
  };
}

// ---------------------------------------------------------------------------
// Asset 1: adaptation_chamber.glb
// Evolution Chamber equivalent — radius 2.5, floor Y=0, +X forward.
// Broad, low octagonal-scalloped carapace splicing plate with +X receptor
// mandibles, converging synaptic conduits, and three tall pulsating genome
// vessels housing twisted double-helix cores and glowing mutagenic nuclei.
// ---------------------------------------------------------------------------

function buildAdaptationChamberGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createGnarlAdaptationMaterials(scene);

  const rootIdx = scene.addNode({ name: 'AdaptationChamber', translation: [0, 0, 0] });

  const gPlateChitin = new PrimitiveGeom(mats.Mat_ChitinBody);
  const gPlateRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
  const gPlateDark = new PrimitiveGeom(mats.Mat_ChitinDark);
  const gPlateBone = new PrimitiveGeom(mats.Mat_BoneScythe);
  const gPlateVisceral = new PrimitiveGeom(mats.Mat_VisceralOuter);
  const gPlateBio = new PrimitiveGeom(mats.Mat_BioEmerald);

  // -------------------------------------------------------------------------
  // 1. Broad, Low Scalloped Carapace Splicing Plate (Y = 0.0000 .. 0.72, R <= 2.50)
  // -------------------------------------------------------------------------
  const sectors = 16;
  const plateRings = [];
  const plateCenters = [];
  const deckInner = [];
  const baseSeal = [];

  for (let s = 0; s < sectors; s++) {
    const th = (2 * Math.PI * s) / sectors; // th = 0 is +X forward
    const ca = Math.cos(th);
    const sa = Math.sin(th);

    // Subtle 3-lobed organic trefoil modulation matching the 3 genome vessels while staying <= 2.495
    const lobe = 1.0 + 0.032 * Math.cos(3 * (th - Math.PI)); // swells at 180 deg, +-60 deg
    // Carve +X receptor intake trough right at th = 0
    const frontAlign = Math.max(0, ca);
    const intakeNotch = 1.0 - 0.14 * Math.pow(frontAlign, 6.0);
    const rimDip = 1.0 - 0.44 * Math.pow(frontAlign, 5.0);

    const rGround = Math.min(2.485, 2.38 * lobe * intakeNotch);
    const rSlope = rGround * 0.91;
    const rRimOut = rGround * 0.80;
    const rRimIn = rGround * 0.66;
    const rDeck = rGround * 0.56;

    const hSlope = 0.30 * rimDip;
    const hRimPeak = 0.64 * rimDip;
    const hRimIn = 0.58 * rimDip;
    const hDeck = 0.36;

    const profile = [
      [ca * rGround, 0.0000, sa * rGround], // 0: Grounded chitin apron at exact Y = 0
      [ca * rSlope, hSlope, sa * rSlope],   // 1: Low armored bevel slope
      [ca * rRimOut, hRimPeak, sa * rRimOut], // 2: Low plate outer crest
      [ca * rRimIn, hRimIn, sa * rRimIn],   // 3: Inner plate lip
      [ca * rDeck, hDeck, sa * rDeck],      // 4: Recessed splicing deck
      [ca * (rDeck * 0.90), 0.0000, sa * (rDeck * 0.90)], // 5: Inner structural anchor at Y = 0
    ];
    plateRings.push(profile);
    plateCenters.push([ca * (rGround * 0.76), 0.28 * rimDip, sa * (rGround * 0.76)]);
    deckInner.push([ca * (rDeck * 1.02), hDeck, sa * (rDeck * 1.02)]);
    baseSeal.push([ca * rGround, 0.0000, sa * rGround]);
  }

  gPlateChitin.addCyclicRingLoft(plateRings, plateCenters);

  // Close central recessed splicing deck top (Y = 0.38) and bottom seal (Y = 0.0000)
  for (let s = 0; s < sectors; s++) {
    const sNext = (s + 1) % sectors;
    gPlateDark.addTri([0, 0.38, 0], deckInner[sNext], deckInner[s], [0, 1, 0]);
    gPlateDark.addTri([0, 0.0000, 0], baseSeal[s], baseSeal[sNext], [0, -1, 0]);
  }

  // 8 Grounded Root-Spur Plates extending the low plate footprint cleanly to R = 2.495 (<= 2.500!)
  const rootAzimuthsDeg = [24, -24, 72, -72, 90, -90, 136, -136, 180];
  for (let i = 0; i < rootAzimuthsDeg.length; i++) {
    const az = degToRad(rootAzimuthsDeg[i]);
    const cx = Math.cos(az);
    const cz = Math.sin(az);
    const reach = (i === 4 || i === 5 || i === 8) ? 2.494 : 2.482;
    gPlateDark.addTubeAlongSpine(
      [
        { pos: [cx * 1.88, 0.44, cz * 1.88], rx: 0.24, ry: 0.16 },
        { pos: [cx * 2.26, 0.20, cz * 2.26], rx: 0.18, ry: 0.11 },
        { pos: [cx * reach, 0.006, cz * reach], rx: 0.004, ry: 0.005 },
      ],
      5,
      true,
      true,
      [0, 1, 0],
      0.0
    );
    // Raised lavender-chitin suture rib cap over each root plate
    gPlateRidge.addChamferBox({
      center: [cx * 2.02, 0.42, cz * 2.02],
      size: [0.44, 0.14, 0.28],
      rotDeg: [0, -rootAzimuthsDeg[i], -16],
      topScale: [0.76, 0.78],
      minYClamp: 0.0,
    });
  }

  // +X Forward Splicing Receptor Rostrum & Twin Ivory-Bone Intake Mandibles (reaches X = +2.494!)
  gPlateVisceral.addTubeAlongSpine(
    [
      { pos: [0.85, 0.42, 0.0], rx: 0.42, ry: 0.12 },
      { pos: [1.72, 0.28, 0.0], rx: 0.48, ry: 0.11 },
      { pos: [2.32, 0.10, 0.0], rx: 0.36, ry: 0.07 },
    ],
    6,
    true,
    true,
    [0, 1, 0],
    0.0
  );
  // Glowing emerald bio-synaptic channel down the +X receptor trough
  gPlateBio.addTubeAlongSpine(
    [
      { pos: [0.55, 0.48, 0.0], rx: 0.16, ry: 0.06 },
      { pos: [1.55, 0.35, 0.0], rx: 0.18, ry: 0.06 },
      { pos: [2.18, 0.16, 0.0], rx: 0.11, ry: 0.04 },
    ],
    5,
    true,
    true,
    [0, 1, 0],
    0.02
  );
  for (const side of [-1, 1]) {
    // Lavender-chitin receptor cheek-shield
    gPlateRidge.addChamferBox({
      center: [1.86, 0.38, side * 0.58],
      size: [0.68, 0.26, 0.28],
      rotDeg: [0, side * 16, -12],
      topScale: [0.78, 0.80],
      minYClamp: 0.0,
    });
    // Forward-curving ivory-bone splicing mandible tip keeping hypot <= 2.48
    gPlateBone.addCurvedScytheBlade({
      p0: [1.82, 0.36, side * 0.62],
      pCtrl: [2.22, 0.28, side * 0.54],
      p2: [2.445, 0.16, side * 0.32],
      edgeHint: [0.2, 0.25, -side * 0.9],
      steps: 4,
      widthStart: 0.11,
      widthPeak: 0.17,
      widthEnd: 0.006,
      backStart: 0.06,
      backPeak: 0.08,
      backEnd: 0.004,
      thickStart: 0.10,
      thickPeak: 0.12,
      thickEnd: 0.006,
      minYClamp: 0.01,
    });
  }

  // -------------------------------------------------------------------------
  // 2. Three Dark-Chitin Calyx Sockets + Arterial Conduits on the Low Plate
  // -------------------------------------------------------------------------
  const vesselSpecs = [
    {
      idx: 0,
      tag: 'Apex',
      pivot: [-0.82, 0.46, 0.0],
      radiusXZ: 0.66,
      height: 1.88, // reaches world Y ~ 2.38!
      tiltDeg: [0, 0, -7], // leans subtly forward (+X)
      turns: 1.25,
      nucleiOffsets: [
        [0.04, 0.52, -0.03],
        [-0.05, 0.98, 0.04],
        [0.03, 1.42, -0.02],
      ],
      clawAzimuths: [180, 118, -118],
    },
    {
      idx: 1,
      tag: 'Right',
      pivot: [0.46, 0.44, 0.96],
      radiusXZ: 0.54,
      height: 1.48, // reaches world Y ~ 1.94!
      tiltDeg: [8, 0, 4],
      turns: 1.05,
      nucleiOffsets: [
        [-0.03, 0.46, 0.03],
        [0.04, 0.96, -0.03],
      ],
      clawAzimuths: [42, 106, -24],
    },
    {
      idx: 2,
      tag: 'Left',
      pivot: [0.46, 0.44, -0.96],
      radiusXZ: 0.50,
      height: 1.32, // reaches world Y ~ 1.78!
      tiltDeg: [-8, 0, 4],
      turns: 0.95,
      nucleiOffsets: [
        [-0.03, 0.42, -0.03],
        [0.04, 0.86, 0.03],
      ],
      clawAzimuths: [-42, -106, 24],
    },
  ];

  const nexusPos = [0.06, 0.56, 0.0];
  // Raised dark-chitin & visceral central synaptic collar
  gPlateDark.addSculptedLobe({
    center: [nexusPos[0], 0.44, 0.0],
    radii: [0.54, 0.22, 0.54],
    sectors: 10,
    stacks: 4,
    flattenBottom: 0.5,
  });

  for (const vs of vesselSpecs) {
    // Dark chitin calyx bowl cradling each genome vessel
    gPlateDark.addLoft(
      [
        makeOvalRing(vs.radiusXZ * 1.24, vs.radiusXZ * 1.24, 0.32, vs.pivot[0], vs.pivot[2], 12),
        makeOvalRing(vs.radiusXZ * 1.14, vs.radiusXZ * 1.14, 0.58, vs.pivot[0], vs.pivot[2], 12),
        makeOvalRing(vs.radiusXZ * 0.96, vs.radiusXZ * 0.96, 0.66, vs.pivot[0], vs.pivot[2], 12),
      ],
      [
        [vs.pivot[0], 0.32, vs.pivot[2]],
        [vs.pivot[0], 0.58, vs.pivot[2]],
        [vs.pivot[0], 0.66, vs.pivot[2]],
      ],
      true,
      true
    );
    // Glowing emerald synaptic artery linking vessel socket to central nexus
    const midP = vLerp([vs.pivot[0], 0.48, vs.pivot[2]], [nexusPos[0], 0.54, nexusPos[2]], 0.5);
    gPlateBio.addTubeAlongSpine(
      [
        { pos: [vs.pivot[0], 0.48, vs.pivot[2]], rx: 0.13, ry: 0.08 },
        { pos: [midP[0], 0.56, midP[2]], rx: 0.11, ry: 0.08 },
        { pos: [nexusPos[0], 0.54, nexusPos[2]], rx: 0.13, ry: 0.08 },
      ],
      5,
      true,
      true,
      [0, 1, 0]
    );
  }

  // 4 Dark bezels for Surf_TEAM_* plates around the low plate perimeter
  const chamberTeamSpecs = [
    { name: 'Surf_TEAM_PlateFrontR', azDeg: 42, r: 1.96, y: 0.42 },
    { name: 'Surf_TEAM_PlateFrontL', azDeg: -42, r: 1.96, y: 0.42 },
    { name: 'Surf_TEAM_PlateRearR', azDeg: 136, r: 1.98, y: 0.46 },
    { name: 'Surf_TEAM_PlateRearL', azDeg: -136, r: 1.98, y: 0.46 },
  ];
  const teamBadgePoly = [
    [-0.30, -0.16],
    [0.30, -0.16],
    [0.38, 0.04],
    [0.00, 0.22],
    [-0.38, 0.04],
  ];
  const bezelPoly = teamBadgePoly.map(([x, y]) => [x * 1.16, y * 1.18]);

  for (const ts of chamberTeamSpecs) {
    const az = degToRad(ts.azDeg);
    const ca = Math.cos(az), sa = Math.sin(az);
    const out = vNorm([ca * 0.66, 0.75, sa * 0.66]); // tilted prominently toward RTS camera
    const up = vNorm([-ca * 0.75, 0.66, -sa * 0.75]);
    const origin = [ca * ts.r, ts.y, sa * ts.r];
    gPlateDark.addOrientedShield(origin, out, up, bezelPoly, 0.04, 0.90, 0.02);

    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gTeam.addOrientedShield(vAdd(origin, vScale(out, 0.032)), out, up, teamBadgePoly, 0.055, 0.84, 0.01);
    const tmMesh = scene.addMesh(`${ts.name}_Mesh`, [gTeam]);
    scene.addNode({ name: ts.name, meshIndex: tmMesh, parentIndex: rootIdx });
  }

  // Dedicated Surf_GLOW_* receptor & calyx nodes
  {
    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    // Twin +X intake receptor beacons + 3 calyx rim bio-runes
    const glowPts = [
      [2.04, 0.44, 0.42],
      [2.04, 0.44, -0.42],
      [-1.56, 0.64, 0.46],
      [-1.56, 0.64, -0.46],
      [0.06, 0.62, 1.48],
      [0.06, 0.62, -1.48],
    ];
    for (const gp of glowPts) {
      gGlow.addFacetedCrystal({
        center: gp,
        radii: [0.11, 0.09, 0.11],
        sectors: 6,
        stacks: 4,
      });
    }
    const glMesh = scene.addMesh('Surf_GLOW_ReceptorRunes_Mesh', [gGlow]);
    scene.addNode({ name: 'Surf_GLOW_ReceptorRunes', meshIndex: glMesh, parentIndex: rootIdx });
  }

  const plateMeshIdx = scene.addMesh('ChamberPlate_Mesh', [
    gPlateChitin,
    gPlateRidge,
    gPlateDark,
    gPlateBone,
    gPlateVisceral,
    gPlateBio,
  ]);
  scene.addNode({ name: 'ChamberPlate', meshIndex: plateMeshIdx, parentIndex: rootIdx });

  // Central Animated Synaptic Splicer Crown ('SplicerNexus')
  const gNexBio = new PrimitiveGeom(mats.Mat_BioChartreuse);
  const gNexAmber = new PrimitiveGeom(mats.Mat_BioAmberCore);
  const gNexChitin = new PrimitiveGeom(mats.Mat_ChitinRidge);
  gNexBio.addSculptedLobe({
    center: [0, 0.14, 0],
    radii: [0.34, 0.22, 0.34],
    sectors: 10,
    stacks: 5,
    ribCount: 6,
    ribAmp: 0.06,
  });
  gNexAmber.addFacetedCrystal({
    center: [0, 0.30, 0],
    radii: [0.18, 0.18, 0.18],
    sectors: 6,
    stacks: 4,
  });
  for (let i = 0; i < 3; i++) {
    const a = (2 * Math.PI * i) / 3;
    gNexChitin.addCurvedScytheBlade({
      p0: [Math.cos(a) * 0.36, 0.02, Math.sin(a) * 0.36],
      pCtrl: [Math.cos(a) * 0.44, 0.24, Math.sin(a) * 0.44],
      p2: [Math.cos(a) * 0.20, 0.40, Math.sin(a) * 0.20],
      edgeHint: [Math.cos(a), 0.3, Math.sin(a)],
      steps: 4,
      widthStart: 0.07,
      widthPeak: 0.11,
      widthEnd: 0.01,
      backStart: 0.04,
      backPeak: 0.05,
      backEnd: 0.008,
      thickStart: 0.07,
      thickPeak: 0.08,
      thickEnd: 0.01,
    });
  }
  const nexusMeshIdx = scene.addMesh('SplicerNexus_Mesh', [gNexChitin, gNexBio, gNexAmber]);
  const nexusNodeIdx = scene.addNode({
    name: 'SplicerNexus',
    meshIndex: nexusMeshIdx,
    translation: nexusPos,
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 3. Three Pulsating Genome Vessels (Inner Helical Core + Outer Membrane + Bone Claws)
  // -------------------------------------------------------------------------
  const vesselAnimNodes = [];

  for (const vs of vesselSpecs) {
    const vesselPivotIdx = scene.addNode({
      name: `GenomeVessel_${vs.tag}`,
      translation: vs.pivot,
      rotation: quatFromEulerXYZ(vs.tiltDeg[0], vs.tiltDeg[1], vs.tiltDeg[2]),
      parentIndex: rootIdx,
    });

    // 3A. Inner Opaque Helical Genome Core ('GenomeHelix_*') — vividly visible at normal RTS zoom!
    const gHxEmerald = new PrimitiveGeom(mats.Mat_BioEmerald);
    const gHxChartreuse = new PrimitiveGeom(mats.Mat_BioChartreuse);
    const gHxAmber = new PrimitiveGeom(mats.Mat_BioAmberCore);
    const gHxCap = new PrimitiveGeom(mats.Mat_ChitinRidge);

    // Lower glowing nutrient reservoir cushion inside vessel base
    gHxEmerald.addSculptedLobe({
      center: [0, vs.height * 0.24, 0],
      radii: [vs.radiusXZ * 0.78, vs.height * 0.22, vs.radiusXZ * 0.78],
      sectors: 10,
      stacks: 5,
      ribCount: 5,
      ribAmp: 0.05,
    });

    // Twin intertwined double-helix DNA/genome strands rising up the full vessel height!
    const yHelixBot = vs.height * 0.14;
    const yHelixTop = vs.height * 0.88;
    const helixRad = vs.radiusXZ * 0.48;
    gHxChartreuse.addHelicalStrand({
      center: [0, 0, 0],
      helixR: helixRad,
      yStart: yHelixBot,
      yEnd: yHelixTop,
      turns: vs.turns,
      phaseRad: 0.0,
      tubeR: vs.radiusXZ * 0.145,
      steps: 12,
    });
    gHxEmerald.addHelicalStrand({
      center: [0, 0, 0],
      helixR: helixRad,
      yStart: yHelixBot,
      yEnd: yHelixTop,
      turns: vs.turns,
      phaseRad: Math.PI,
      tubeR: vs.radiusXZ * 0.135,
      steps: 12,
    });

    // Base-pair cross-rungs linking the two genome strands
    const rungCount = 5;
    for (let r = 1; r <= rungCount; r++) {
      const u = r / (rungCount + 1);
      const th = u * vs.turns * 2 * Math.PI;
      const env = (0.72 + 0.28 * Math.sin(u * Math.PI)) * helixRad;
      const yR = yHelixBot + (yHelixTop - yHelixBot) * u;
      gHxChartreuse.addTubeAlongSpine(
        [
          { pos: [Math.cos(th) * env, yR, Math.sin(th) * env], r: 0.036 },
          { pos: [-Math.cos(th) * env, yR, -Math.sin(th) * env], r: 0.036 },
        ],
        4,
        false,
        false
      );
    }

    // Suspended incandescent amber-orange mutagenic genome nuclei
    for (const nOff of vs.nucleiOffsets) {
      gHxAmber.addSculptedLobe({
        center: nOff,
        radii: [vs.radiusXZ * 0.30, vs.radiusXZ * 0.26, vs.radiusXZ * 0.30],
        sectors: 8,
        stacks: 4,
      });
    }

    // Small chitinous bio-valve cap crowning the top pole of the vessel
    gHxCap.addSculptedLobe({
      center: [0, vs.height * 0.95, 0],
      radii: [vs.radiusXZ * 0.34, 0.09, vs.radiusXZ * 0.34],
      sectors: 8,
      stacks: 3,
    });

    const helixMeshIdx = scene.addMesh(`GenomeHelix_${vs.tag}_Mesh`, [
      gHxEmerald,
      gHxChartreuse,
      gHxAmber,
      gHxCap,
    ]);
    const helixNodeIdx = scene.addNode({
      name: `GenomeHelix_${vs.tag}`,
      meshIndex: helixMeshIdx,
      translation: [0, 0, 0],
      parentIndex: vesselPivotIdx,
    });

    // 3B. Semi-Translucent Bioluminescent Amniotic Vessel Envelope ('VesselSac_*')
    const gSac = new PrimitiveGeom(mats.Mat_VesselMembrane);
    gSac.addSculptedLobe({
      center: [0, vs.height * 0.50, 0],
      radii: [vs.radiusXZ, vs.height * 0.49, vs.radiusXZ],
      sectors: 12,
      stacks: 7,
      flattenBottom: 0.28,
      ribCount: 6,
      ribAmp: 0.035,
    });
    const sacMeshIdx = scene.addMesh(`VesselSac_${vs.tag}_Mesh`, [gSac]);
    const sacNodeIdx = scene.addNode({
      name: `VesselSac_${vs.tag}`,
      meshIndex: sacMeshIdx,
      translation: [0, 0, 0],
      parentIndex: vesselPivotIdx,
    });

    // 3C. Curved Ivory-Bone & Chitin Retaining Claws ('VesselClaws_*') gripping the vessel flank
    const gClawChitin = new PrimitiveGeom(mats.Mat_ChitinRidge);
    const gClawBone = new PrimitiveGeom(mats.Mat_BoneScythe);
    for (const cAzDeg of vs.clawAzimuths) {
      const az = degToRad(cAzDeg);
      const rx = Math.cos(az), rz = Math.sin(az);
      gClawChitin.addTubeAlongSpine(
        [
          { pos: [rx * vs.radiusXZ * 1.08, 0.08, rz * vs.radiusXZ * 1.08], rx: 0.09, ry: 0.07 },
          { pos: [rx * vs.radiusXZ * 1.12, vs.height * 0.38, rz * vs.radiusXZ * 1.12], rx: 0.065, ry: 0.055 },
        ],
        5,
        true,
        true
      );
      gClawBone.addCurvedScytheBlade({
        p0: [rx * vs.radiusXZ * 1.08, vs.height * 0.32, rz * vs.radiusXZ * 1.08],
        pCtrl: [rx * vs.radiusXZ * 1.16, vs.height * 0.62, rz * vs.radiusXZ * 1.16],
        p2: [rx * vs.radiusXZ * 0.86, vs.height * 0.82, rz * vs.radiusXZ * 0.86],
        edgeHint: [rx, 0.2, rz],
        steps: 4,
        widthStart: 0.08,
        widthPeak: 0.12,
        widthEnd: 0.008,
        backStart: 0.04,
        backPeak: 0.05,
        backEnd: 0.006,
        thickStart: 0.07,
        thickPeak: 0.08,
        thickEnd: 0.008,
      });
    }
    const clawMeshIdx = scene.addMesh(`VesselClaws_${vs.tag}_Mesh`, [gClawChitin, gClawBone]);
    const clawNodeIdx = scene.addNode({
      name: `VesselClaws_${vs.tag}`,
      meshIndex: clawMeshIdx,
      translation: [0, 0, 0],
      parentIndex: vesselPivotIdx,
    });

    vesselAnimNodes.push({
      sacNodeIdx,
      helixNodeIdx,
      clawNodeIdx,
      phaseIdx: vs.idx,
    });
  }

  // UI/Overhead target helper
  scene.addNode({
    name: 'Head',
    translation: [-0.25, 2.38, 0.0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 4. Seamless Looping 'idle' Animation (2.80s traveling genome pulsation)
  // -------------------------------------------------------------------------
  const idQ = [0, 0, 0, 1];
  const unitS = [1, 1, 1];
  const idleT = [0.0, 0.4667, 0.9333, 1.40, 1.8667, 2.3333, 2.80];

  const idleTracks = [
    {
      nodeIndex: nexusNodeIdx,
      path: 'scale',
      times: idleT,
      values: [
        unitS,
        [1.08, 1.14, 1.08],
        [0.97, 0.95, 0.97],
        [1.07, 1.12, 1.07],
        [0.98, 0.96, 0.98],
        [1.06, 1.10, 1.06],
        unitS,
      ],
    },
    {
      nodeIndex: nexusNodeIdx,
      path: 'rotation',
      times: idleT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 10, 0),
        quatFromEulerXYZ(0, 4, 0),
        quatFromEulerXYZ(0, -10, 0),
        quatFromEulerXYZ(0, -4, 0),
        quatFromEulerXYZ(0, 6, 0),
        idQ,
      ],
    },
  ];

  // Traveling 3-phase peristaltic wave across the 3 genome vessels!
  for (const va of vesselAnimNodes) {
    const phase = (va.phaseIdx * 2 * Math.PI) / 3;
    const sacScales = idleT.map((t, idx) => {
      if (idx === 0 || idx === idleT.length - 1) return unitS;
      const w = Math.sin((2 * Math.PI * t) / 2.80 + phase);
      const w2 = Math.sin((4 * Math.PI * t) / 2.80 + phase);
      const sxz = Number((1.0 + 0.078 * w + 0.022 * w2).toFixed(5));
      const sy = Number((1.0 + 0.062 * w - 0.018 * w2).toFixed(5));
      return [sxz, sy, sxz];
    });
    const helixPos = idleT.map((t, idx) => {
      if (idx === 0 || idx === idleT.length - 1) return [0, 0, 0];
      const w = Math.sin((2 * Math.PI * t) / 2.80 + phase);
      return [0, Number((0.055 * w).toFixed(5)), 0];
    });
    const helixRot = idleT.map((t, idx) => {
      if (idx === 0 || idx === idleT.length - 1) return idQ;
      const yaw = 18.0 * Math.sin((2 * Math.PI * t) / 2.80 + phase);
      return quatFromEulerXYZ(0, yaw, 0);
    });
    const clawScales = idleT.map((t, idx) => {
      if (idx === 0 || idx === idleT.length - 1) return unitS;
      const w = Math.sin((2 * Math.PI * t) / 2.80 + phase);
      const s = Number((1.0 + 0.032 * w).toFixed(5));
      return [s, 1.0, s];
    });

    idleTracks.push(
      { nodeIndex: va.sacNodeIdx, path: 'scale', times: idleT, values: sacScales },
      { nodeIndex: va.helixNodeIdx, path: 'translation', times: idleT, values: helixPos },
      { nodeIndex: va.helixNodeIdx, path: 'rotation', times: idleT, values: helixRot },
      { nodeIndex: va.clawNodeIdx, path: 'scale', times: idleT, values: clawScales }
    );
  }

  scene.addAnimation('idle', idleTracks);
  return scene.buildGLB('AdaptationChamberScene');
}

// ---------------------------------------------------------------------------
// Asset 2: ambusher_den.glb
// Lurker Den equivalent — radius 2.5, floor Y=0, +X forward.
// Subterranean ambush-predator lair defined by a broad 7-blade crescent fan
// of sweeping chitin-and-bone blades across the rear/flanks and a gaping,
// muscular, toothed +X living throat that pulses in peristaltic waves.
// ---------------------------------------------------------------------------

function buildAmbusherDenGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createGnarlAdaptationMaterials(scene);

  const rootIdx = scene.addNode({ name: 'AmbusherDen', translation: [0, 0, 0] });

  const gBaseChitin = new PrimitiveGeom(mats.Mat_ChitinBody);
  const gBaseRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
  const gBaseDark = new PrimitiveGeom(mats.Mat_ChitinDark);
  const gBaseBone = new PrimitiveGeom(mats.Mat_BoneScythe);
  const gBaseVisceral = new PrimitiveGeom(mats.Mat_VisceralOuter);

  // -------------------------------------------------------------------------
  // 1. Grounded Subterranean Crescent Burrow Base (Y = 0.0000 .. 1.34, R <= 2.50)
  // -------------------------------------------------------------------------
  const sectors = 18;
  const moundRings = [];
  const moundCenters = [];
  const botSeal = [];
  const topCap = [];

  for (let s = 0; s < sectors; s++) {
    const th = (2 * Math.PI * s) / sectors; // th = 0 is +X living throat opening
    const ca = Math.cos(th);
    const sa = Math.sin(th);

    // Deep +X indentation for the living throat chute while keeping wide crescent flanks
    const frontFactor = Math.max(0, ca);
    const throatIndent = 1.0 - 0.24 * Math.pow(frontFactor, 3.0);
    const heightDrop = 1.0 - 0.56 * Math.pow(frontFactor, 2.6);

    const rGround = Math.min(2.46, 2.38 * throatIndent * (1.0 + 0.03 * Math.cos(4 * th)));
    const rLow = rGround * 0.93;
    const rMid = rGround * 0.80;
    const rCrown = rGround * 0.56;

    const hLow = 0.44 * heightDrop;
    const hMid = 0.98 * heightDrop;
    const hCrown = 1.30 * heightDrop;

    moundRings.push([
      [ca * rGround, 0.0000, sa * rGround],
      [ca * rLow, hLow, sa * rLow],
      [ca * rMid, hMid, sa * rMid],
      [ca * rCrown, hCrown, sa * rCrown],
    ]);
    moundCenters.push([ca * (rGround * 0.72), hMid * 0.5, sa * (rGround * 0.72)]);
    botSeal.push([ca * rGround, 0.0000, sa * rGround]);
    topCap.push([ca * rCrown, hCrown, sa * rCrown]);
  }

  // Loft outer mound wall around azimuth
  for (let s = 0; s < sectors; s++) {
    const sNext = (s + 1) % sectors;
    const rA = moundRings[s];
    const rB = moundRings[sNext];
    for (let k = 0; k < 3; k++) {
      const p00 = rA[k], p01 = rB[k], p11 = rB[k + 1], p10 = rA[k + 1];
      const qMid = vScale(vAdd(vAdd(p00, p01), vAdd(p10, p11)), 0.25);
      gBaseChitin.addQuad(p00, p01, p11, p10, [qMid[0], Math.max(0.25, qMid[1] * 0.5), qMid[2]]);
    }
    gBaseChitin.addTri([-0.22, 1.24, 0], topCap[s], topCap[sNext], [0, 1, 0]);
    gBaseDark.addTri([0, 0.0000, 0], botSeal[s], botSeal[sNext], [0, -1, 0]);
  }

  // Grounded Root Buttresses around rear & flanks reaching exact R = 2.492 (<= 2.500)
  const rearButtressesDeg = [90, -90, 126, -126, 156, -156, 180];
  for (const azDeg of rearButtressesDeg) {
    const az = degToRad(azDeg);
    const cx = Math.cos(az), cz = Math.sin(az);
    gBaseDark.addTubeAlongSpine(
      [
        { pos: [cx * 1.78, 0.82, cz * 1.78], rx: 0.28, ry: 0.22 },
        { pos: [cx * 2.22, 0.36, cz * 2.22], rx: 0.22, ry: 0.16 },
        { pos: [cx * 2.488, 0.008, cz * 2.488], rx: 0.006, ry: 0.006 },
      ],
      5,
      true,
      true,
      [0, 1, 0],
      0.0
    );
  }

  // Twin Grounded Scythe-Forelimb Gate Buttresses flanking the +X Living Throat (reaches R = 2.492!)
  for (const side of [-1, 1]) {
    // High-arched armored femur shoulder flanking the throat
    gBaseChitin.addCurvedScytheBlade({
      p0: [0.92, 0.92, side * 1.18],
      pCtrl: [1.44, 1.32, side * 1.38],
      p2: [1.74, 0.78, side * 1.26],
      edgeHint: [0.35, 0.88, side * 0.35],
      steps: 4,
      widthStart: 0.16,
      widthPeak: 0.28,
      widthEnd: 0.12,
      backStart: 0.10,
      backPeak: 0.13,
      backEnd: 0.08,
      thickStart: 0.16,
      thickPeak: 0.20,
      thickEnd: 0.12,
      minYClamp: 0.0,
    });
    // Gleaming ivory-bone grounded scythe-claw anchoring +X throat lip at Y = 0.0000
    gBaseBone.addCurvedScytheBlade({
      p0: [1.68, 0.84, side * 1.26],
      pCtrl: [1.96, 0.52, side * 1.16],
      p2: [2.22, 0.004, side * 1.02],
      edgeHint: [0.65, 0.55, side * 0.28],
      steps: 5,
      widthStart: 0.14,
      widthPeak: 0.22,
      widthEnd: 0.004,
      backStart: 0.08,
      backPeak: 0.10,
      backEnd: 0.003,
      thickStart: 0.13,
      thickPeak: 0.15,
      thickEnd: 0.004,
      minYClamp: 0.0,
    });
  }

  // Arched Predator Hood Collar framing the +X Living Throat
  gBaseRidge.addLoft(
    [
      makeOvalRing(0.88, 1.48, 0.84, 0.22, 0, 12),
      makeOvalRing(0.96, 1.38, 1.42, 0.38, 0, 12),
      makeOvalRing(0.72, 1.06, 1.84, 0.46, 0, 12),
    ],
    [
      [0.22, 0.84, 0],
      [0.38, 1.42, 0],
      [0.46, 1.84, 0],
    ],
    true,
    true
  );

  // Brow Team War-Plates (Surf_TEAM_HoodBrowR / L) with dark bezels on upper throat hood
  const browTeamSpecs = [
    { name: 'Surf_TEAM_HoodBrowR', side: 1 },
    { name: 'Surf_TEAM_HoodBrowL', side: -1 },
  ];
  const browPoly = [
    [-0.32, -0.15],
    [0.32, -0.13],
    [0.26, 0.15],
    [-0.24, 0.17],
  ];
  const browBezel = browPoly.map(([x, y]) => [x * 1.16, y * 1.18]);
  for (const bt of browTeamSpecs) {
    const origin = [0.66, 1.68, bt.side * 0.78];
    const out = vNorm([0.48, 0.72, bt.side * 0.50]);
    const up = vNorm([-0.68, 0.62, -bt.side * 0.38]);
    gBaseDark.addOrientedShield(origin, out, up, browBezel, 0.04, 0.90, 0.02);

    const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gTeam.addOrientedShield(vAdd(origin, vScale(out, 0.032)), out, up, browPoly, 0.055, 0.84, 0.01);
    const tmMesh = scene.addMesh(`${bt.name}_Mesh`, [gTeam]);
    scene.addNode({ name: bt.name, meshIndex: tmMesh, parentIndex: rootIdx });
  }

  // Grounded visceral lower throat apron anchoring the +X living maw cleanly onto Y = 0.0000
  gBaseVisceral.addTubeAlongSpine(
    [
      { pos: [0.88, 0.38, 0.0], rx: 0.96, ry: 0.22 },
      { pos: [1.62, 0.22, 0.0], rx: 0.86, ry: 0.16 },
      { pos: [2.16, 0.06, 0.0], rx: 0.66, ry: 0.06 },
    ],
    6,
    true,
    true,
    [0, 1, 0],
    0.0
  );

  const denBaseMeshIdx = scene.addMesh('DenBase_Mesh', [
    gBaseChitin,
    gBaseRidge,
    gBaseDark,
    gBaseBone,
    gBaseVisceral,
  ]);
  scene.addNode({ name: 'DenBase', meshIndex: denBaseMeshIdx, parentIndex: rootIdx });

  // -------------------------------------------------------------------------
  // 2. Broad 7-Blade Crescent Fan of Chitin & Ivory-Bone Scythe-Blades
  //    Dominates the normal-zoom silhouette across -X rear and +-Z flanks!
  // -------------------------------------------------------------------------
  const fanBladeSpecs = [
    { name: 'BladeFan_Center', azDeg: 180, hTip: 3.06, rPivot: 1.32, yPivot: 1.06, chord: 0.42, hasTeam: false },
    { name: 'BladeFan_InnerR', azDeg: 149, hTip: 2.86, rPivot: 1.36, yPivot: 1.02, chord: 0.40, hasTeam: false },
    { name: 'BladeFan_InnerL', azDeg: -149, hTip: 2.86, rPivot: 1.36, yPivot: 1.02, chord: 0.40, hasTeam: false },
    { name: 'BladeFan_MidR', azDeg: 117, hTip: 2.54, rPivot: 1.40, yPivot: 0.96, chord: 0.38, hasTeam: true, teamTag: 'R', sideSign: 1 },
    { name: 'BladeFan_MidL', azDeg: -117, hTip: 2.54, rPivot: 1.40, yPivot: 0.96, chord: 0.38, hasTeam: true, teamTag: 'L', sideSign: -1 },
    { name: 'BladeFan_OuterR', azDeg: 85, hTip: 2.16, rPivot: 1.42, yPivot: 0.88, chord: 0.35, hasTeam: false },
    { name: 'BladeFan_OuterL', azDeg: -85, hTip: 2.16, rPivot: 1.42, yPivot: 0.88, chord: 0.35, hasTeam: false },
  ];

  const fanBladeNodes = [];
  for (let bIdx = 0; bIdx < fanBladeSpecs.length; bIdx++) {
    const fb = fanBladeSpecs[bIdx];
    const az = degToRad(fb.azDeg);
    const rx = Math.cos(az);
    const rz = Math.sin(az);
    // Tangent axis around Y so rotating around tangAxis flares the blade radially outward/inward!
    const tangAxis = [-rz, 0, rx];
    const pivotWorld = [rx * fb.rPivot, fb.yPivot, rz * fb.rPivot];

    const gBlDark = new PrimitiveGeom(mats.Mat_ChitinDark);
    const gBlBody = new PrimitiveGeom(mats.Mat_ChitinBody);
    const gBlRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
    const gBlBone = new PrimitiveGeom(mats.Mat_BoneScythe);

    const bladeH = fb.hTip - fb.yPivot;
    // Sweep outward to rMid <= 2.34 (local dr = 0.92), then hook dramatically upward & slightly inward at tip!
    // Keeps maxHorizontalRadius <= 2.46 even during +4 deg fan flare!
    const pBase = [0, -0.10, 0];
    const pMid = [rx * 0.84, bladeH * 0.52, rz * 0.84];
    const pTip = [rx * 0.62, bladeH, rz * 0.62];

    // Broad diamond-faceted chitin fan wing (wide tangential chord creates an unmistakable broad fan!)
    const wingRings = [];
    const wingCenters = [];
    const stFracs = [0.0, 0.28, 0.62, 0.88, 1.0];
    const chordScales = [0.72, 1.00, 0.92, 0.54, 0.06];
    const thickScales = [0.16, 0.20, 0.15, 0.09, 0.015];

    for (let k = 0; k < stFracs.length; k++) {
      const t = stFracs[k];
      const cPos = quadBezier3(pBase, pMid, pTip, t);
      const halfW = fb.chord * chordScales[k];
      const halfTh = thickScales[k];
      // Broad fan face oriented perpendicular to radial vector so it forms a continuous peacock/mantis fan!
      wingRings.push([
        vAdd(cPos, vAdd(vScale(tangAxis, halfW), vScale([rx, 0.22, rz], halfTh * 0.3))),
        vAdd(cPos, vScale([rx, 0.35, rz], halfTh * 1.15)), // outer dorsal keel
        vAdd(cPos, vAdd(vScale(tangAxis, -halfW), vScale([rx, 0.22, rz], halfTh * 0.3))),
        vAdd(cPos, vScale([-rx, 0.25, -rz], halfTh * 0.85)), // inner concave face toward throat
      ]);
      wingCenters.push(cPos);
    }
    gBlRidge.addLoft(wingRings, wingCenters, true, true);

    // Dark chitin central structural spine rib on outer back of each fan blade
    gBlDark.addTubeAlongSpine(
      [
        { pos: [rx * 0.08, -0.08, rz * 0.08], rx: 0.16, ry: 0.14 },
        { pos: [rx * 0.66, bladeH * 0.42, rz * 0.66], rx: 0.12, ry: 0.10 },
        { pos: [rx * 0.62, bladeH * 0.78, rz * 0.62], rx: 0.06, ry: 0.05 },
      ],
      5,
      true,
      true
    );

    // Lower overlapping purple-chitin scale sheath at blade socket
    gBlBody.addCurvedScytheBlade({
      p0: [rx * 0.06, -0.14, rz * 0.06],
      pCtrl: [rx * 0.58, bladeH * 0.26, rz * 0.58],
      p2: [rx * 0.72, bladeH * 0.56, rz * 0.72],
      edgeHint: [rx * 0.85, 0.35, rz * 0.85],
      steps: 4,
      widthStart: 0.16,
      widthPeak: 0.26,
      widthEnd: 0.04,
      backStart: 0.08,
      backPeak: 0.10,
      backEnd: 0.02,
      thickStart: 0.22,
      thickPeak: 0.28,
      thickEnd: 0.06,
    });

    // Gleaming calcified Ivory-Bone Scythe Crest & Razor Tip crowning every blade in the fan!
    gBlBone.addCurvedScytheBlade({
      p0: [rx * 0.42, bladeH * 0.32, rz * 0.42],
      pCtrl: [rx * 0.90, bladeH * 0.68, rz * 0.90],
      p2: [rx * 0.58, bladeH + 0.02, rz * 0.58],
      edgeHint: [rx * 0.92, 0.38, rz * 0.92],
      steps: 5,
      widthStart: 0.08,
      widthPeak: 0.22,
      widthEnd: 0.008,
      backStart: 0.05,
      backPeak: 0.08,
      backEnd: 0.006,
      thickStart: 0.10,
      thickPeak: 0.14,
      thickEnd: 0.010,
    });

    const blMeshIdx = scene.addMesh(`${fb.name}_Mesh`, [gBlDark, gBlBody, gBlRidge, gBlBone]);
    const blNodeIdx = scene.addNode({
      name: fb.name,
      meshIndex: blMeshIdx,
      translation: pivotWorld,
      parentIndex: rootIdx,
    });

    // Emblazon Surf_TEAM_FanWingR / L directly onto MidR and MidL fan blades!
    if (fb.hasTeam) {
      const gFanTeam = new PrimitiveGeom(mats.Surf_TEAM);
      const wingCenter = quadBezier3(pBase, pMid, pTip, 0.42);
      const inwardNormal = vNorm([-rx * 0.55, 0.80, -rz * 0.55]);
      const bladeUp = vNorm([rx * 0.35, 0.92, rz * 0.35]);
      const chevronPoly = [
        [-0.24, -0.22],
        [0.24, -0.22],
        [0.18, 0.22],
        [0.0, 0.32],
        [-0.18, 0.22],
      ];
      gFanTeam.addOrientedShield(
        vAdd(wingCenter, vScale(inwardNormal, 0.08)),
        inwardNormal,
        bladeUp,
        chevronPoly,
        0.048,
        0.84,
        0.01
      );
      const ftName = `Surf_TEAM_FanWing${fb.teamTag}`;
      const ftMesh = scene.addMesh(`${ftName}_Mesh`, [gFanTeam]);
      scene.addNode({
        name: ftName,
        meshIndex: ftMesh,
        parentIndex: blNodeIdx,
      });
    }

    fanBladeNodes.push({
      nodeIndex: blNodeIdx,
      flareAxis: tangAxis, // positive angle tilts blade outward away from center
      phaseOffset: Math.abs(180 - Math.abs(fb.azDeg)) * 0.018,
    });
  }

  // -------------------------------------------------------------------------
  // 3. Gaping, Muscular, Peristaltic +X "Living Throat" Maw
  //    Tilted +34 deg toward the +X overhead camera for dramatic RTS readability!
  // -------------------------------------------------------------------------
  // Local +Y of throatRoot points forward-upward along [+0.788, +0.616, 0] (+X maw axis!)
  const throatPivot = [0.76, 1.12, 0.0];
  const throatRot = quatFromEulerXYZ(0, 0, -52);
  const throatRootIdx = scene.addNode({
    name: 'LivingThroat',
    translation: throatPivot,
    rotation: throatRot,
    parentIndex: rootIdx,
  });

  // 3A. Outer Muscular Throat Sphincter Collar & Pitch-Black Abyss Funnel
  {
    const gThOuter = new PrimitiveGeom(mats.Mat_VisceralOuter);
    const gThInner = new PrimitiveGeom(mats.Mat_VisceralInner);
    const gThAbyss = new PrimitiveGeom(mats.Mat_ThroatAbyss);
    const gThGland = new PrimitiveGeom(mats.Mat_BioAmberCore);
    const gThTooth = new PrimitiveGeom(mats.Mat_BoneScythe);

    const tSec = 14;
    const outerCollarRings = [];
    const outerCollarCenters = [];
    const abyssBottomRing = [];
    for (let s = 0; s < tSec; s++) {
      const th = (2 * Math.PI * s) / tSec;
      const ca = Math.cos(th), sa = Math.sin(th);
      const rib = 1.0 + 0.06 * Math.cos(7 * th);
      const radX = ca > 0 ? 0.86 : 0.96;
      // Annular sphincter cross-section in throat local space (local Y = out of mouth!)
      outerCollarRings.push([
        [ca * radX * rib, -0.28, sa * 1.14 * rib], // deep base embedded in mound
        [ca * (radX + 0.06) * rib, 0.18, sa * 1.22 * rib], // muscular outer lip
        [ca * 0.78 * rib, 0.34, sa * 0.98 * rib],  // wet rolled sphincter crest
        [ca * 0.58 * rib, 0.08, sa * 0.74 * rib],  // inner esophageal wall
        [ca * 0.42, -0.38, sa * 0.52],             // deep throat abyss rim
      ]);
      outerCollarCenters.push([ca * 0.74, 0.02, sa * 0.92]);
      abyssBottomRing.push([ca * 0.44, -0.36, sa * 0.54]);
    }
    gThOuter.addCyclicRingLoft(outerCollarRings, outerCollarCenters);

    // Pitch-black subterranean throat pit floor
    for (let s = 0; s < tSec; s++) {
      const sNext = (s + 1) % tSec;
      gThAbyss.addTri([0, -0.40, 0], abyssBottomRing[sNext], abyssBottomRing[s], [0, 1, 0]);
    }

    // Glowing amber esophageal gland nodules around the rolled throat lip
    for (let g = 0; g < 8; g++) {
      const th = (2 * Math.PI * g) / 8 + Math.PI / 8;
      gThGland.addSculptedLobe({
        center: [Math.cos(th) * 0.76, 0.24, Math.sin(th) * 0.92],
        radii: [0.11, 0.09, 0.11],
        sectors: 6,
        stacks: 4,
      });
    }

    // 4 Upper/Lower Palatal Ivory-Bone Fangs hooking into the gullet
    const palatalAngles = [22, -22, 158, -158];
    for (const pDeg of palatalAngles) {
      const pr = degToRad(pDeg);
      const px = Math.cos(pr), pz = Math.sin(pr);
      gThTooth.addCurvedScytheBlade({
        p0: [px * 0.84, 0.26, pz * 0.98],
        pCtrl: [px * 0.72, 0.44, pz * 0.84],
        p2: [px * 0.46, 0.28, pz * 0.54],
        edgeHint: [-px, 0.4, -pz],
        steps: 4,
        widthStart: 0.075,
        widthPeak: 0.11,
        widthEnd: 0.006,
        backStart: 0.04,
        backPeak: 0.05,
        backEnd: 0.005,
        thickStart: 0.07,
        thickPeak: 0.08,
        thickEnd: 0.006,
      });
    }

    const thOuterMesh = scene.addMesh('ThroatCollar_Mesh', [
      gThOuter,
      gThInner,
      gThAbyss,
      gThGland,
      gThTooth,
    ]);
    scene.addNode({
      name: 'ThroatCollar',
      meshIndex: thOuterMesh,
      parentIndex: throatRootIdx,
    });
  }

  // 3B. Animated Inner Peristaltic Gullet Ring ('ThroatGulletRing') — contracts & swallows in 'idle'!
  let throatGulletIdx;
  {
    const gGulletFlesh = new PrimitiveGeom(mats.Mat_VisceralInner);
    const gGulletBio = new PrimitiveGeom(mats.Mat_BioChartreuse);
    const gSec = 12;
    const gRings = [];
    const gCenters = [];
    for (let s = 0; s < gSec; s++) {
      const th = (2 * Math.PI * s) / gSec;
      const ca = Math.cos(th), sa = Math.sin(th);
      const fold = 1.0 + 0.09 * Math.cos(6 * th);
      gRings.push([
        [ca * 0.68 * fold, -0.14, sa * 0.82 * fold],
        [ca * 0.72 * fold, 0.12, sa * 0.86 * fold],
        [ca * 0.50 * fold, 0.16, sa * 0.60 * fold],
        [ca * 0.38 * fold, -0.22, sa * 0.46 * fold],
      ]);
      gCenters.push([ca * 0.56, -0.02, sa * 0.68]);
    }
    gGulletFlesh.addCyclicRingLoft(gRings, gCenters);

    // 6 Bioluminescent chartreuse taste-papillae lining the inner throat sphincter
    for (let i = 0; i < 6; i++) {
      const th = (2 * Math.PI * i) / 6;
      gGulletBio.addFacetedCrystal({
        center: [Math.cos(th) * 0.54, 0.14, Math.sin(th) * 0.64],
        radii: [0.075, 0.065, 0.075],
        sectors: 6,
        stacks: 3,
      });
    }
    const gulletMesh = scene.addMesh('ThroatGulletRing_Mesh', [gGulletFlesh, gGulletBio]);
    throatGulletIdx = scene.addNode({
      name: 'ThroatGulletRing',
      meshIndex: gulletMesh,
      translation: [0, 0, 0],
      parentIndex: throatRootIdx,
    });
  }

  // 3C. Twin Articulated Lateral Pharyngeal Jaw-Hooks ('ThroatJaw_R' / 'ThroatJaw_L')
  const throatJawNodes = {};
  for (const [tag, side] of [
    ['R', 1],
    ['L', -1],
  ]) {
    const gJawChitin = new PrimitiveGeom(mats.Mat_ChitinRidge);
    const gJawBone = new PrimitiveGeom(mats.Mat_BoneScythe);

    gJawChitin.addSculptedLobe({
      center: [0, 0.08, side * 0.06],
      radii: [0.18, 0.16, 0.22],
      sectors: 8,
      stacks: 4,
    });
    gJawBone.addCurvedScytheBlade({
      p0: [0.0, 0.10, 0.0],
      pCtrl: [0.04, 0.44, -side * 0.12],
      p2: [0.02, 0.32, -side * 0.56],
      edgeHint: [0.2, 0.5, -side * 0.85],
      steps: 5,
      widthStart: 0.11,
      widthPeak: 0.19,
      widthEnd: 0.008,
      backStart: 0.06,
      backPeak: 0.08,
      backEnd: 0.005,
      thickStart: 0.10,
      thickPeak: 0.13,
      thickEnd: 0.008,
    });

    const jawMesh = scene.addMesh(`ThroatJaw_${tag}_Mesh`, [gJawChitin, gJawBone]);
    throatJawNodes[tag] = scene.addNode({
      name: `ThroatJaw_${tag}`,
      meshIndex: jawMesh,
      translation: [0.0, 0.20, side * 0.96],
      parentIndex: throatRootIdx,
    });
  }

  // Dedicated Surf_GLOW_* Sensory Predator Ocelli above Throat & Fan Sockets
  {
    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    const ocelliPts = [
      [0.92, 1.76, 0.26],
      [0.92, 1.76, -0.26],
      [0.84, 1.66, 0.52],
      [0.84, 1.66, -0.52],
      [-1.08, 1.38, 0.78],
      [-1.08, 1.38, -0.78],
    ];
    for (const op of ocelliPts) {
      gGlow.addFacetedCrystal({
        center: op,
        radii: [0.10, 0.085, 0.10],
        sectors: 6,
        stacks: 4,
      });
    }
    const glMesh = scene.addMesh('Surf_GLOW_ThroatOcelli_Mesh', [gGlow]);
    scene.addNode({ name: 'Surf_GLOW_ThroatOcelli', meshIndex: glMesh, parentIndex: rootIdx });
  }

  scene.addNode({
    name: 'Head',
    translation: [-0.35, 3.06, 0.0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 4. Seamless Looping 'idle' Animation (2.60s throat peristalsis & blade-fan flare)
  // -------------------------------------------------------------------------
  const idQ = [0, 0, 0, 1];
  const unitS = [1, 1, 1];
  const idleT = [0.0, 0.52, 1.04, 1.56, 2.08, 2.60];

  const idleTracks = [
    // Outer living throat breathing dilation
    {
      nodeIndex: throatRootIdx,
      path: 'scale',
      times: idleT,
      values: [
        unitS,
        [1.055, 1.04, 1.065], // wide inhale gape
        [0.965, 1.02, 0.955], // peristaltic swallow clench
        [1.035, 1.02, 1.040],
        [0.980, 0.99, 0.975],
        unitS,
      ],
    },
    // Inner gullet sphincter deep contraction & axial swallow pull
    {
      nodeIndex: throatGulletIdx,
      path: 'scale',
      times: idleT,
      values: [
        unitS,
        [1.14, 1.06, 1.14], // dilates open
        [0.78, 0.92, 0.78], // tight visceral sphincter squeeze!
        [1.06, 1.03, 1.06],
        [0.88, 0.96, 0.88],
        unitS,
      ],
    },
    {
      nodeIndex: throatGulletIdx,
      path: 'translation',
      times: idleT,
      values: [
        [0, 0, 0],
        [0, 0.06, 0],
        [0, -0.09, 0], // pulls inward down the gullet!
        [0, 0.03, 0],
        [0, -0.04, 0],
        [0, 0, 0],
      ],
    },
    // Pharyngeal bone jaws flare wide on inhale and snap inward on swallow!
    {
      nodeIndex: throatJawNodes.R,
      path: 'rotation',
      times: idleT,
      values: [
        idQ,
        quatFromEulerXYZ(-14, 0, 0), // flares outward
        quatFromEulerXYZ(16, 0, 0),  // clenches inward!
        quatFromEulerXYZ(-8, 0, 0),
        quatFromEulerXYZ(8, 0, 0),
        idQ,
      ],
    },
    {
      nodeIndex: throatJawNodes.L,
      path: 'rotation',
      times: idleT,
      values: [
        idQ,
        quatFromEulerXYZ(14, 0, 0),
        quatFromEulerXYZ(-16, 0, 0),
        quatFromEulerXYZ(8, 0, 0),
        quatFromEulerXYZ(-8, 0, 0),
        idQ,
      ],
    },
  ];

  // Synchronized menacing ripple across all 7 broad chitin fan blades!
  for (const fb of fanBladeNodes) {
    const rotVals = idleT.map((t, k) => {
      if (k === 0 || k === idleT.length - 1) return idQ;
      const w = Math.sin((2 * Math.PI * t) / 2.60 - fb.phaseOffset);
      // Keep outward flare subtle (-2.5 .. +3.2 deg) so maxHorizontalRadius stays <= 2.500!
      const deg = 3.0 * w;
      return quatFromAxisAngle(fb.flareAxis, degToRad(deg));
    });
    idleTracks.push({
      nodeIndex: fb.nodeIndex,
      path: 'rotation',
      times: idleT,
      values: rotVals,
    });
  }

  scene.addAnimation('idle', idleTracks);
  return scene.buildGLB('AmbusherDenScene');
}

// ---------------------------------------------------------------------------
// Asset 3: spine_ambusher.glb
// Lurker equivalent — radius 1.875, floor Y=0, +X forward.
// Wide, low-slung subterranean ambush insect with six articulated bone-edged
// scythe legs, burrowing shovel-horned head & scissoring mandibles, and a
// menacing 3D radial crown of 11 barbed dorsal lancet spines.
// Anchor: 'SpineOrigin' (plus 'Head', 'Muzzle').
// Animations: 'idle', 'walk', 'attack', 'burrow', 'surface', 'death'.
// ---------------------------------------------------------------------------

function buildSpineAmbusherGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createGnarlAdaptationMaterials(scene);

  const rootIdx = scene.addNode({ name: 'SpineAmbusher', translation: [0, 0, 0] });

  // -------------------------------------------------------------------------
  // 1. Wide, Low-Slung Ambush Carapace ('BodyCore' at rest [0.0, 0.80, 0.0])
  // -------------------------------------------------------------------------
  const bodyRest = [0.0, 0.80, 0.0];
  const gBdChitin = new PrimitiveGeom(mats.Mat_ChitinBody);
  const gBdRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
  const gBdDark = new PrimitiveGeom(mats.Mat_ChitinDark);
  const gBdBone = new PrimitiveGeom(mats.Mat_BoneScythe);
  const gBdVisceral = new PrimitiveGeom(mats.Mat_VisceralOuter);

  // Broad flattened dark-chitin ventral sternum (local minY ~ -0.22 -> world Y = 0.58 at rest)
  gBdDark.addSculptedLobe({
    center: [0.02, -0.08, 0.0],
    radii: [0.84, 0.16, 0.78],
    sectors: 12,
    stacks: 4,
    flattenBottom: 0.45,
  });

  // Muscular visceral pleural flank cushion
  gBdVisceral.addSculptedLobe({
    center: [0.0, 0.04, 0.0],
    radii: [0.80, 0.20, 0.76],
    sectors: 12,
    stacks: 5,
  });

  // 3 Wide Trilobite/Arachnid Overlapping Dorsal Carapace Shields (broad lateral silhouette!)
  const wideShields = [
    { cx: 0.42, cy: 0.14, sx: 0.52, sy: 0.16, sz: 1.54, rz: -10 },
    { cx: 0.00, cy: 0.20, sx: 0.58, sy: 0.18, sz: 1.76, rz: -2 },
    { cx: -0.42, cy: 0.16, sx: 0.50, sy: 0.16, sz: 1.50, rz: 8 },
  ];
  for (const ws of wideShields) {
    gBdChitin.addChamferBox({
      center: [ws.cx, ws.cy, 0],
      size: [ws.sx, ws.sy, ws.sz],
      rotDeg: [0, 0, ws.rz],
      topScale: [0.82, 0.86],
      chamfer: 0.20,
    });
    // Sweeping lavender-orchid lateral pleural wing-eaves + calcified serrated edge spurs
    for (const side of [-1, 1]) {
      gBdRidge.addCurvedScytheBlade({
        p0: [ws.cx + 0.10, ws.cy + 0.02, side * (ws.sz * 0.36)],
        pCtrl: [ws.cx - 0.02, ws.cy + 0.08, side * (ws.sz * 0.50)],
        p2: [ws.cx - 0.18, ws.cy - 0.02, side * (ws.sz * 0.60)],
        edgeHint: [0.2, 0.35, side * 0.90],
        steps: 4,
        widthStart: 0.11,
        widthPeak: 0.18,
        widthEnd: 0.012,
        backStart: 0.06,
        backPeak: 0.08,
        backEnd: 0.008,
        thickStart: 0.09,
        thickPeak: 0.11,
        thickEnd: 0.010,
      });
    }
  }

  // Paired anterior calcified pectoral burrowing tusks under shoulders
  for (const side of [-1, 1]) {
    gBdBone.addTubeAlongSpine(
      [
        { pos: [0.56, -0.10, side * 0.48], rx: 0.065, ry: 0.055 },
        { pos: [0.82, -0.14, side * 0.56], rx: 0.014, ry: 0.012 },
      ],
      4,
      true,
      true
    );
  }

  const bodyMeshIdx = scene.addMesh('BodyCore_Mesh', [
    gBdChitin,
    gBdRidge,
    gBdDark,
    gBdBone,
    gBdVisceral,
  ]);
  const bodyIdx = scene.addNode({
    name: 'BodyCore',
    meshIndex: bodyMeshIdx,
    translation: bodyRest,
    parentIndex: rootIdx,
  });

  // Dedicated Wide Carapace Surf_TEAM_* & Surf_GLOW_* Nodes
  {
    const bodyTeamPoly = [
      [-0.24, -0.13],
      [0.24, -0.11],
      [0.20, 0.13],
      [-0.18, 0.15],
    ];
    for (const [tag, side] of [
      ['R', 1],
      ['L', -1],
    ]) {
      const gTeam = new PrimitiveGeom(mats.Surf_TEAM);
      gTeam.addOrientedShield(
        [0.06, 0.28, side * 0.68],
        vNorm([0.08, 0.80, side * 0.59]),
        [-0.98, 0.10, 0],
        bodyTeamPoly,
        0.045,
        0.84,
        0.01
      );
      const tName = `Surf_TEAM_CarapaceWing${tag}`;
      const tMesh = scene.addMesh(`${tName}_Mesh`, [gTeam]);
      scene.addNode({ name: tName, meshIndex: tMesh, parentIndex: bodyIdx });
    }

    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    for (const side of [-1, 1]) {
      for (const sx of [0.34, -0.26]) {
        gGlow.addFacetedCrystal({
          center: [sx, 0.16, side * 0.82],
          radii: [0.065, 0.048, 0.055],
          sectors: 6,
          stacks: 3,
        });
      }
    }
    const glMesh = scene.addMesh('Surf_GLOW_PleuralSpiracles_Mesh', [gGlow]);
    scene.addNode({ name: 'Surf_GLOW_PleuralSpiracles', meshIndex: glMesh, parentIndex: bodyIdx });
  }

  // -------------------------------------------------------------------------
  // 2. Shovel-Horned Ambush Head & Scissoring Bone Mandibles ('Head')
  //    Local [0.76, -0.02, 0] -> World [0.76, 0.78, 0]
  // -------------------------------------------------------------------------
  const headLocal = [0.76, -0.02, 0.0];
  const gHdChitin = new PrimitiveGeom(mats.Mat_ChitinBody);
  const gHdRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
  const gHdDark = new PrimitiveGeom(mats.Mat_ChitinDark);
  const gHdBone = new PrimitiveGeom(mats.Mat_BoneScythe);

  // Broad wedge-shaped subterranean digging clypeus shield
  gHdChitin.addLoft(
    [
      makeRectChamferRing(0.20, 0.48, 0.09, -0.12, 0.08, 0),
      makeRectChamferRing(0.36, 0.54, 0.12, 0.04, 0.24, 0),
      makeRectChamferRing(0.28, 0.38, 0.09, 0.18, 0.16, 0),
    ],
    [
      [0.08, -0.12, 0],
      [0.24, 0.04, 0],
      [0.16, 0.18, 0],
    ],
    true,
    true
  );

  // Swept lateral burrowing cheek-horns + median rostrumplow
  gHdRidge.addCurvedScytheBlade({
    p0: [0.16, 0.14, 0.0],
    pCtrl: [0.54, 0.18, 0.0],
    p2: [0.84, 0.04, 0.0],
    edgeHint: [0.6, 0.8, 0.0],
    steps: 4,
    widthStart: 0.08,
    widthPeak: 0.13,
    widthEnd: 0.012,
    backStart: 0.05,
    backPeak: 0.06,
    backEnd: 0.008,
    thickStart: 0.16,
    thickPeak: 0.22,
    thickEnd: 0.02,
  });

  for (const side of [-1, 1]) {
    gHdRidge.addCurvedScytheBlade({
      p0: [0.14, 0.04, side * 0.42],
      pCtrl: [0.28, 0.10, side * 0.68],
      p2: [0.06, 0.18, side * 0.84],
      edgeHint: [0.3, 0.4, side * 0.85],
      steps: 4,
      widthStart: 0.10,
      widthPeak: 0.16,
      widthEnd: 0.012,
      backStart: 0.05,
      backPeak: 0.06,
      backEnd: 0.008,
      thickStart: 0.08,
      thickPeak: 0.10,
      thickEnd: 0.01,
    });
    // Forward calcified brow horn
    gHdBone.addTubeAlongSpine(
      [
        { pos: [0.42, 0.08, side * 0.30], rx: 0.055, ry: 0.042 },
        { pos: [0.74, 0.10, side * 0.36], rx: 0.012, ry: 0.010 },
      ],
      4,
      true,
      true
    );
  }

  const headMeshIdx = scene.addMesh('Head_Mesh', [gHdChitin, gHdRidge, gHdDark, gHdBone]);
  const headIdx = scene.addNode({
    name: 'Head',
    meshIndex: headMeshIdx,
    translation: headLocal,
    parentIndex: bodyIdx,
  });

  // Head Surf_TEAM_HeadCrest & Surf_GLOW_Eyes + Muzzle
  {
    const gHTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gHTeam.addOrientedShield(
      [0.20, 0.20, 0.0],
      vNorm([0.36, 0.93, 0.0]),
      [-0.93, 0.36, 0.0],
      [
        [-0.14, -0.18],
        [0.14, -0.18],
        [0.10, 0.18],
        [-0.10, 0.18],
      ],
      0.04,
      0.82,
      0.01
    );
    const htMesh = scene.addMesh('Surf_TEAM_HeadCrest_Mesh', [gHTeam]);
    scene.addNode({ name: 'Surf_TEAM_HeadCrest', meshIndex: htMesh, parentIndex: headIdx });

    const gHEyes = new PrimitiveGeom(mats.Surf_GLOW);
    for (const side of [-1, 1]) {
      gHEyes.addFacetedCrystal({
        center: [0.48, 0.09, side * 0.24],
        radii: [0.075, 0.052, 0.062],
        sectors: 6,
        stacks: 3,
      });
      gHEyes.addFacetedCrystal({
        center: [0.36, 0.11, side * 0.38],
        radii: [0.058, 0.045, 0.052],
        sectors: 6,
        stacks: 3,
      });
    }
    const heMesh = scene.addMesh('Surf_GLOW_Eyes_Mesh', [gHEyes]);
    scene.addNode({ name: 'Surf_GLOW_Eyes', meshIndex: heMesh, parentIndex: headIdx });
  }

  scene.addNode({
    name: 'Muzzle',
    translation: [0.86, 0.0, 0.0],
    parentIndex: headIdx,
  });

  // Twin Articulated Scissoring Ivory-Bone Mandible Scythes ('Mandible_R' / 'Mandible_L')
  // World max X = 0.76 + 0.38 + 0.70 = 1.840, Z ~ +-0.18 -> hypot = 1.849 <= 1.875!
  const mandibleNodes = {};
  for (const [tag, side] of [
    ['R', 1],
    ['L', -1],
  ]) {
    const gMdChitin = new PrimitiveGeom(mats.Mat_ChitinDark);
    const gMdBone = new PrimitiveGeom(mats.Mat_BoneScythe);
    gMdChitin.addSculptedLobe({
      center: [0.06, 0.0, side * 0.04],
      radii: [0.14, 0.09, 0.11],
      sectors: 7,
      stacks: 4,
    });
    gMdBone.addCurvedScytheBlade({
      p0: [0.08, 0.0, 0.0],
      pCtrl: [0.44, -0.02, side * 0.16],
      p2: [0.695, -0.01, -side * 0.14],
      edgeHint: [0.25, 0.1, -side * 0.95],
      steps: 5,
      widthStart: 0.08,
      widthPeak: 0.15,
      widthEnd: 0.005,
      backStart: 0.05,
      backPeak: 0.07,
      backEnd: 0.004,
      thickStart: 0.07,
      thickPeak: 0.09,
      thickEnd: 0.005,
    });
    const mdMesh = scene.addMesh(`Mandible_${tag}_Mesh`, [gMdChitin, gMdBone]);
    mandibleNodes[tag] = scene.addNode({
      name: `Mandible_${tag}`,
      meshIndex: mdMesh,
      translation: [0.38, -0.03, side * 0.34],
      parentIndex: headIdx,
    });
  }

  // -------------------------------------------------------------------------
  // 3. Broad Armored Tail-Telson & Earth-Anchoring Spurs ('TailTelson')
  //    Local [-0.74, -0.03, 0] -> World [-0.74, 0.77, 0]
  // -------------------------------------------------------------------------
  const tailLocal = [-0.74, -0.03, 0.0];
  let tailIdx;
  {
    const gTlChitin = new PrimitiveGeom(mats.Mat_ChitinBody);
    const gTlRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
    const gTlBone = new PrimitiveGeom(mats.Mat_BoneScythe);

    gTlChitin.addChamferBox({
      center: [-0.26, 0.04, 0.0],
      size: [0.56, 0.22, 1.08],
      rotDeg: [0, 0, 10],
      topScale: [0.76, 0.78],
      chamfer: 0.22,
    });
    gTlRidge.addChamferBox({
      center: [-0.62, 0.00, 0.0],
      size: [0.42, 0.16, 0.74],
      rotDeg: [0, 0, 14],
      topScale: [0.70, 0.72],
      chamfer: 0.22,
    });
    // Twin rear ivory-bone earth-brace spurs reaching world X = -0.74 - 1.08 = -1.820 (<= 1.875!)
    for (const side of [-1, 1]) {
      gTlBone.addCurvedScytheBlade({
        p0: [-0.66, 0.01, side * 0.28],
        pCtrl: [-0.92, 0.02, side * 0.36],
        p2: [-1.08, -0.04, side * 0.22],
        edgeHint: [-0.4, 0.25, side * 0.88],
        steps: 4,
        widthStart: 0.08,
        widthPeak: 0.13,
        widthEnd: 0.006,
        backStart: 0.05,
        backPeak: 0.06,
        backEnd: 0.004,
        thickStart: 0.07,
        thickPeak: 0.08,
        thickEnd: 0.005,
      });
    }
    const tlMesh = scene.addMesh('TailTelson_Mesh', [gTlChitin, gTlRidge, gTlBone]);
    tailIdx = scene.addNode({
      name: 'TailTelson',
      meshIndex: tlMesh,
      translation: tailLocal,
      parentIndex: bodyIdx,
    });
  }

  // -------------------------------------------------------------------------
  // 4. Menacing Radial Dorsal Spines + Dorsal Launch Crown + 'SpineOrigin'
  //    ('DorsalCrown' at [0.0, 0.28, 0.0] -> World [0.0, 1.08, 0.0])
  // -------------------------------------------------------------------------
  const crownLocal = [0.0, 0.28, 0.0];
  let dorsalCrownIdx;
  let spineBankCenterIdx;
  let spineBankRightIdx;
  let spineBankLeftIdx;
  {
    const gCrVisceral = new PrimitiveGeom(mats.Mat_VisceralOuter);
    const gCrChitin = new PrimitiveGeom(mats.Mat_ChitinDark);
    const gCrEmerald = new PrimitiveGeom(mats.Mat_BioEmerald);
    const gCrChartreuse = new PrimitiveGeom(mats.Mat_BioChartreuse);
    const gCrAmber = new PrimitiveGeom(mats.Mat_BioAmberCore);

    // Muscular dorsal spine-launcher saddle
    gCrVisceral.addSculptedLobe({
      center: [0.0, 0.06, 0.0],
      radii: [0.68, 0.22, 0.62],
      sectors: 12,
      stacks: 5,
      flattenBottom: 0.4,
      ribCount: 6,
      ribAmp: 0.05,
    });

    // Dark chitin armored launch-crater rim around the dorsal crown
    gCrChitin.addLoft(
      [
        makeOvalRing(0.64, 0.58, 0.02, 0, 0, 12),
        makeOvalRing(0.56, 0.52, 0.18, 0, 0, 12),
        makeOvalRing(0.42, 0.40, 0.24, 0, 0, 12),
      ],
      [
        [0, 0.02, 0],
        [0, 0.18, 0],
        [0, 0.24, 0],
      ],
      true,
      true
    );

    // Pressurized glowing chartreuse-emerald & amber seismic launch fissures radiating across the saddle!
    gCrAmber.addSculptedLobe({
      center: [0.02, 0.22, 0.0],
      radii: [0.36, 0.14, 0.34],
      sectors: 10,
      stacks: 4,
    });
    const fissureDirs = [0, 56, 124, 180, -124, -56];
    for (const fDeg of fissureDirs) {
      const fr = degToRad(fDeg);
      const fx = Math.cos(fr), fz = Math.sin(fr);
      gCrChartreuse.addTubeAlongSpine(
        [
          { pos: [fx * 0.18, 0.24, fz * 0.16], rx: 0.065, ry: 0.042 },
          { pos: [fx * 0.56, 0.12, fz * 0.52], rx: 0.045, ry: 0.032 },
        ],
        4,
        true,
        true
      );
      gCrEmerald.addSculptedLobe({
        center: [fx * 0.42, 0.16, fz * 0.40],
        radii: [0.11, 0.08, 0.11],
        sectors: 6,
        stacks: 3,
      });
    }

    const crMesh = scene.addMesh('DorsalCrown_Mesh', [
      gCrVisceral,
      gCrChitin,
      gCrEmerald,
      gCrChartreuse,
      gCrAmber,
    ]);
    dorsalCrownIdx = scene.addNode({
      name: 'DorsalCrown',
      meshIndex: crMesh,
      translation: crownLocal,
      parentIndex: bodyIdx,
    });

    // Required 'SpineOrigin' Anchor right at the seismic spine launch apex!
    // World rest position: [0.06, 0.80 + 0.28 + 0.88 = 1.96, 0.0]
    scene.addNode({
      name: 'SpineOrigin',
      translation: [0.06, 0.88, 0.0],
      parentIndex: dorsalCrownIdx,
    });

    // 4A. Central Median Dorsal Lancet Spines ('SpineBank_Center' — 3 tall crest javelins)
    {
      const gSock = new PrimitiveGeom(mats.Mat_ChitinDark);
      const gShft = new PrimitiveGeom(mats.Mat_BoneShaft);
      const gBone = new PrimitiveGeom(mats.Mat_BoneScythe);

      // Forward-raked, vertical-apex (world Y = 2.18!), and rear-raked median spines
      addBarbedLancetSpine({
        basePos: [0.34, 0.18, 0.0],
        dirVec: [0.46, 0.89, 0.0],
        length: 0.92,
        baseR: 0.125,
        barbFlare: 1.32,
        gSocket: gSock,
        gShaft: gShft,
        gBone,
      });
      addBarbedLancetSpine({
        basePos: [0.02, 0.22, 0.0],
        dirVec: [0.05, 0.998, 0.0],
        length: 0.88, // reaches local Y = 1.10 -> world Y = 2.18!
        baseR: 0.138,
        barbFlare: 1.35,
        gSocket: gSock,
        gShaft: gShft,
        gBone,
      });
      addBarbedLancetSpine({
        basePos: [-0.32, 0.18, 0.0],
        dirVec: [-0.48, 0.88, 0.0],
        length: 0.88,
        baseR: 0.120,
        barbFlare: 1.30,
        gSocket: gSock,
        gShaft: gShft,
        gBone,
      });

      const sbMesh = scene.addMesh('SpineBank_Center_Mesh', [gSock, gShft, gBone]);
      spineBankCenterIdx = scene.addNode({
        name: 'SpineBank_Center',
        meshIndex: sbMesh,
        translation: [0, 0, 0],
        parentIndex: dorsalCrownIdx,
      });
    }

    // 4B & 4C. Radial Left & Right Dorsal Spine Banks ('SpineBank_Right', 'SpineBank_Left')
    //          4 menacing radial lancets per side = 8 lateral + 3 median = 11 radial dorsal spines!
    const radialConfigs = [
      { azDeg: 32, tiltFromUpDeg: 40, len: 0.86, rBase: 0.118, bx: 0.28, bz: 0.12 },
      { azDeg: 74, tiltFromUpDeg: 46, len: 0.90, rBase: 0.124, bx: 0.08, bz: 0.18 },
      { azDeg: 112, tiltFromUpDeg: 46, len: 0.86, rBase: 0.118, bx: -0.14, bz: 0.18 },
      { azDeg: 148, tiltFromUpDeg: 42, len: 0.82, rBase: 0.112, bx: -0.32, bz: 0.12 },
    ];
    for (const [bankTag, side] of [
      ['Right', 1],
      ['Left', -1],
    ]) {
      const gSock = new PrimitiveGeom(mats.Mat_ChitinDark);
      const gShft = new PrimitiveGeom(mats.Mat_BoneShaft);
      const gBone = new PrimitiveGeom(mats.Mat_BoneScythe);

      for (const rc of radialConfigs) {
        const az = degToRad(side * rc.azDeg);
        const tilt = degToRad(rc.tiltFromUpDeg);
        const horiz = Math.sin(tilt);
        const dir = [Math.cos(az) * horiz, Math.cos(tilt), Math.sin(az) * horiz];
        addBarbedLancetSpine({
          basePos: [rc.bx, 0.04, side * rc.bz],
          dirVec: dir,
          length: rc.len,
          baseR: rc.rBase,
          barbFlare: 1.30,
          gSocket: gSock,
          gShaft: gShft,
          gBone,
        });
      }

      const bankMesh = scene.addMesh(`SpineBank_${bankTag}_Mesh`, [gSock, gShft, gBone]);
      const bankNode = scene.addNode({
        name: `SpineBank_${bankTag}`,
        meshIndex: bankMesh,
        translation: [0.0, 0.12, side * 0.22],
        parentIndex: dorsalCrownIdx,
      });
      if (side > 0) spineBankRightIdx = bankNode;
      else spineBankLeftIdx = bankNode;
    }
  }

  // -------------------------------------------------------------------------
  // 5. Six Articulated Scythe Legs (3 Pairs: Front 0, Wide-Lateral 1, Rear 2)
  //    Each leg = Hip ('Leg_i_S') + Curved Ivory-Bone Scythe Shin ('Shin_i_S')
  //    Exact rest floor contact at world Y = 0.0000 and maxHorizontalRadius <= 1.8750!
  // -------------------------------------------------------------------------
  const legDefs = [
    {
      idx: 0,
      hipX: 0.44,
      hipY: -0.08, // world Y = 0.72
      hipZ: 0.56,
      kneeWorld: [0.76, 1.34, 1.06],
      footWorld: [1.00, 0.0000, 1.50], // hypot = 1.8028 <= 1.875!
      scytheFlare: [0.45, 0.65, 0.60],
      bladeWidth: 0.27,
      hasTeam: true,
    },
    {
      idx: 1,
      hipX: 0.02,
      hipY: -0.06, // world Y = 0.74
      hipZ: 0.66,
      kneeWorld: [0.04, 1.46, 1.24],
      footWorld: [0.04, 0.0000, 1.868], // widest stance! hypot = 1.8684 <= 1.875!
      scytheFlare: [0.08, 0.72, 0.68],
      bladeWidth: 0.30,
      hasTeam: false,
    },
    {
      idx: 2,
      hipX: -0.42,
      hipY: -0.08, // world Y = 0.72
      hipZ: 0.56,
      kneeWorld: [-0.74, 1.30, 1.08],
      footWorld: [-0.94, 0.0000, 1.50], // hypot = 1.7702 <= 1.875!
      scytheFlare: [-0.45, 0.65, 0.62],
      bladeWidth: 0.26,
      hasTeam: false,
    },
  ];

  const extractUniquePts = (geoms) => {
    const seen = new Set();
    const out = [];
    for (const gm of geoms) {
      for (let i = 0; i < gm.positions.length; i += 3) {
        const px = gm.positions[i];
        const py = gm.positions[i + 1];
        const pz = gm.positions[i + 2];
        const key = `${px.toFixed(3)},${py.toFixed(3)},${pz.toFixed(3)}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push([px, py, pz]);
        }
      }
    }
    return out;
  };

  const legs = [];
  for (const cfg of legDefs) {
    for (const [sideTag, sideSign] of [
      ['R', 1],
      ['L', -1],
    ]) {
      const hipLocal = [cfg.hipX, cfg.hipY, sideSign * cfg.hipZ];
      const hipWorld = vAdd(bodyRest, hipLocal);
      const kneeW = [cfg.kneeWorld[0], cfg.kneeWorld[1], sideSign * cfg.kneeWorld[2]];
      const footW = [cfg.footWorld[0], cfg.footWorld[1], sideSign * cfg.footWorld[2]];

      const kneeLocal = vSub(kneeW, hipWorld);
      const footInShin = vSub(footW, kneeW);
      const groundInShin = -kneeW[1]; // exact local Y of world Y = 0.0000!

      // 5A. Arched Armored Femur ('Leg_i_S')
      const gFemDark = new PrimitiveGeom(mats.Mat_ChitinDark);
      const gFemChitin = new PrimitiveGeom(mats.Mat_ChitinBody);
      const gFemRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
      const gFemBone = new PrimitiveGeom(mats.Mat_BoneScythe);

      // Dark coxal ball-joint socket
      gFemDark.addSculptedLobe({
        center: [0, 0, 0],
        radii: [0.14, 0.13, 0.14],
        sectors: 7,
        stacks: 4,
      });

      // Curved dorsal-crested femur reaching up to the high scythe knee
      const femCtrl = [kneeLocal[0] * 0.48, kneeLocal[1] * 0.72 + 0.12, kneeLocal[2] * 0.48];
      gFemChitin.addCurvedScytheBlade({
        p0: [0, 0, 0],
        pCtrl: femCtrl,
        p2: kneeLocal,
        edgeHint: [cfg.scytheFlare[0] * 0.4, 0.90, sideSign * 0.35],
        steps: 4,
        widthStart: 0.12,
        widthPeak: 0.24,
        widthEnd: 0.12,
        backStart: 0.08,
        backPeak: 0.11,
        backEnd: 0.08,
        thickStart: 0.12,
        thickPeak: 0.16,
        thickEnd: 0.12,
      });
      // Lavender-orchid dorsal femur ridge highlight
      gFemRidge.addTubeAlongSpine(
        [
          { pos: [kneeLocal[0] * 0.18, kneeLocal[1] * 0.28 + 0.08, kneeLocal[2] * 0.18], rx: 0.055, ry: 0.045 },
          { pos: [kneeLocal[0] * 0.85, kneeLocal[1] * 0.92 + 0.08, kneeLocal[2] * 0.85], rx: 0.048, ry: 0.040 },
        ],
        4,
        true,
        true
      );
      // Calcified bone knee-horn jutting upward from the high knee joint!
      gFemBone.addTubeAlongSpine(
        [
          { pos: kneeLocal, rx: 0.068, ry: 0.058 },
          {
            pos: [
              kneeLocal[0] + cfg.scytheFlare[0] * 0.14,
              kneeLocal[1] + 0.24,
              kneeLocal[2] + sideSign * 0.12,
            ],
            rx: 0.012,
            ry: 0.010,
          },
        ],
        4,
        true,
        true
      );

      const femMesh = scene.addMesh(`Leg_${cfg.idx}_${sideTag}_Mesh`, [
        gFemDark,
        gFemChitin,
        gFemRidge,
        gFemBone,
      ]);
      const hipIdx = scene.addNode({
        name: `Leg_${cfg.idx}_${sideTag}`,
        meshIndex: femMesh,
        translation: hipLocal,
        parentIndex: bodyIdx,
      });

      // 5B. Wickedly Curved Ivory-Bone & Dark-Chitin Scythe Blade Shin ('Shin_i_S')
      const gShnDark = new PrimitiveGeom(mats.Mat_ChitinDark);
      const gShnRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
      const gShnBone = new PrimitiveGeom(mats.Mat_BoneScythe);

      // Control point bows outward/upward at upper tibia, then sweeps smoothly inward/downward like a reaper's scythe!
      // Carefully bounded on idx === 1 so |Z| never exceeds 1.8745!
      const ctrlZFactor = cfg.idx === 1 ? 0.36 : 0.48;
      const shinCtrl = [
        footInShin[0] * 0.48,
        footInShin[1] * 0.28 + 0.14,
        footInShin[2] * ctrlZFactor,
      ];
      const flareHint = [cfg.scytheFlare[0], cfg.scytheFlare[1], sideSign * cfg.scytheFlare[2]];

      // Upper dark-chitin & lavender-ridge reinforced scythe spine sheath (0% -> 58% down shin)
      const shinMid = quadBezier3([0, 0, 0], shinCtrl, footInShin, 0.56);
      gShnDark.addTubeAlongSpine(
        [
          { pos: [0, 0, 0], rx: 0.10, ry: 0.09 },
          { pos: vLerp([0, 0, 0], shinMid, 0.55), rx: 0.095, ry: 0.085 },
          { pos: shinMid, rx: 0.058, ry: 0.052 },
        ],
        5,
        true,
        true,
        [1, 0, 0],
        groundInShin
      );
      gShnRidge.addCurvedScytheBlade({
        p0: [0, 0.02, 0],
        pCtrl: vLerp([0, 0, 0], shinCtrl, 0.65),
        p2: shinMid,
        edgeHint: flareHint,
        steps: 4,
        widthStart: 0.12,
        widthPeak: cfg.bladeWidth * 0.76,
        widthEnd: 0.08,
        backStart: 0.07,
        backPeak: 0.09,
        backEnd: 0.05,
        thickStart: 0.11,
        thickPeak: 0.14,
        thickEnd: 0.08,
        minYClamp: groundInShin,
      });

      // Full-length gleaming Ivory-Bone Scythe Blade sweeping all the way to exact world Y = 0.0000!
      gShnBone.addCurvedScytheBlade({
        p0: vLerp([0, 0, 0], shinCtrl, 0.16),
        pCtrl: shinCtrl,
        p2: [footInShin[0], groundInShin, footInShin[2]],
        edgeHint: flareHint,
        steps: 6,
        widthStart: 0.10,
        widthPeak: cfg.bladeWidth,
        widthEnd: 0.0008,
        backStart: 0.06,
        backPeak: 0.09,
        backEnd: 0.0006,
        thickStart: 0.09,
        thickPeak: 0.12,
        thickEnd: 0.0008,
        peakT: 0.34,
        minYClamp: groundInShin,
      });

      const shinMesh = scene.addMesh(`Shin_${cfg.idx}_${sideTag}_Mesh`, [
        gShnDark,
        gShnRidge,
        gShnBone,
      ]);
      const shinIdx = scene.addNode({
        name: `Shin_${cfg.idx}_${sideTag}`,
        meshIndex: shinMesh,
        translation: kneeLocal,
        parentIndex: hipIdx,
      });

      const femSamplePts = extractUniquePts([gFemDark, gFemChitin, gFemRidge, gFemBone]);
      const shinGeomsForSample = [gShnDark, gShnRidge, gShnBone];

      if (cfg.hasTeam) {
        const gLegTeam = new PrimitiveGeom(mats.Surf_TEAM);
        const badgeOrigin = vAdd(
          quadBezier3([0, 0, 0], shinCtrl, footInShin, 0.28),
          [0.05, 0.04, sideSign * 0.06]
        );
        gLegTeam.addChamferBox({
          center: badgeOrigin,
          size: [0.13, 0.32, 0.065],
          rotDeg: [sideSign * 16, 0, -14],
          topScale: [0.82, 0.86],
          minYClamp: groundInShin + 0.15,
        });
        shinGeomsForSample.push(gLegTeam);
        const ltName = `Surf_TEAM_ForeScythe${sideTag}`;
        const ltMesh = scene.addMesh(`${ltName}_Mesh`, [gLegTeam]);
        scene.addNode({
          name: ltName,
          meshIndex: ltMesh,
          parentIndex: shinIdx,
        });
      }

      const shinSamplePts = extractUniquePts(shinGeomsForSample);
      legs.push({
        idx: cfg.idx,
        sideTag,
        sideSign,
        hipIdx,
        shinIdx,
        hipLocal,
        kneeLocal,
        femSamplePts,
        shinSamplePts,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 6. Exact 3D Vertex-Level Grounded-Scythe Solver & All 6 Unit Animations:
  //    'idle', 'walk', 'attack', 'burrow', 'surface', 'death'
  // -------------------------------------------------------------------------
  const idQ = quatFromEulerXYZ(0, 0, 0);
  const unitS = [1, 1, 1];

  function evalLegMinWorldY(lg, bodyPos, bodyQuat, hipQuat, shinQuat) {
    const hipWorldOrigin = vAdd(bodyPos, rotateVecByQuat(lg.hipLocal, bodyQuat));
    const combHipQ = quatMul(bodyQuat, hipQuat);
    let minY = Infinity;
    for (const p of lg.femSamplePts) {
      const wy = hipWorldOrigin[1] + rotateVecByQuat(p, combHipQ)[1];
      if (wy < minY) minY = wy;
    }
    const kneeWorldOrigin = vAdd(hipWorldOrigin, rotateVecByQuat(lg.kneeLocal, combHipQ));
    const combShinQ = quatMul(combHipQ, shinQuat);
    for (const p of lg.shinSamplePts) {
      const wy = kneeWorldOrigin[1] + rotateVecByQuat(p, combShinQ)[1];
      if (wy < minY) minY = wy;
    }
    return minY;
  }

  function solveGroundedLegPose(lg, bodyPos, bodyQuat, extra) {
    const shinBend = extra.shinBend || 0;
    const yaw = extra.yaw || 0;
    const targetLift = Math.max(0.0, extra.lift || 0);

    const isExactRest =
      Math.abs(bodyPos[0] - bodyRest[0]) < 1e-6 &&
      Math.abs(bodyPos[1] - bodyRest[1]) < 1e-6 &&
      Math.abs(bodyPos[2] - bodyRest[2]) < 1e-6 &&
      Math.abs(bodyQuat[0]) < 1e-6 &&
      Math.abs(bodyQuat[1]) < 1e-6 &&
      Math.abs(bodyQuat[2]) < 1e-6 &&
      Math.abs(bodyQuat[3] - 1) < 1e-6 &&
      targetLift === 0 &&
      yaw === 0 &&
      shinBend === 0;

    if (isExactRest) {
      return { hipQ: idQ, shinQ: idQ };
    }

    const shinQ = shinBend === 0 ? idQ : quatFromEulerXYZ(-lg.sideSign * shinBend, 0, 0);
    let lo = -35.0;
    let hi = 92.0;
    for (let it = 0; it < 22; it++) {
      const mid = 0.5 * (lo + hi);
      const hipQ = quatFromEulerXYZ(-lg.sideSign * mid, lg.sideSign * yaw, 0);
      const wy = evalLegMinWorldY(lg, bodyPos, bodyQuat, hipQ, shinQ);
      if (wy < targetLift) lo = mid;
      else hi = mid;
    }
    const bestRoll = 0.5 * (lo + hi);
    return {
      hipQ: quatFromEulerXYZ(-lg.sideSign * bestRoll, lg.sideSign * yaw, 0),
      shinQ,
    };
  }

  function buildGroundedLegTracks(times, bodyPositions, bodyQuats, extraFn = null, subDiv = 3) {
    const denseTimes = [];
    for (let k = 0; k < times.length - 1; k++) {
      for (let s = 0; s < subDiv; s++) {
        const u = s / subDiv;
        denseTimes.push(Number((times[k] + (times[k + 1] - times[k]) * u).toFixed(6)));
      }
    }
    denseTimes.push(times[times.length - 1]);

    const outTracks = [];
    for (const lg of legs) {
      const hipRots = [];
      const shinRots = [];
      for (let k = 0; k < times.length - 1; k++) {
        const ex0 = extraFn ? extraFn(lg, k) : { lift: 0, yaw: 0, shinBend: 0 };
        const ex1 = extraFn ? extraFn(lg, k + 1) : { lift: 0, yaw: 0, shinBend: 0 };
        for (let s = 0; s < subDiv; s++) {
          const u = s / subDiv;
          const bPos = s === 0 ? bodyPositions[k] : vLerp(bodyPositions[k], bodyPositions[k + 1], u);
          const bQuat = s === 0 ? bodyQuats[k] : quatSlerp(bodyQuats[k], bodyQuats[k + 1], u);
          const extra =
            s === 0
              ? ex0
              : {
                  lift: (ex0.lift || 0) + ((ex1.lift || 0) - (ex0.lift || 0)) * u,
                  yaw: (ex0.yaw || 0) + ((ex1.yaw || 0) - (ex0.yaw || 0)) * u,
                  shinBend: (ex0.shinBend || 0) + ((ex1.shinBend || 0) - (ex0.shinBend || 0)) * u,
                };
          const solved = solveGroundedLegPose(lg, bPos, bQuat, extra);
          hipRots.push(solved.hipQ);
          shinRots.push(solved.shinQ);
        }
      }
      const lastK = times.length - 1;
      const exLast = extraFn ? extraFn(lg, lastK) : { lift: 0, yaw: 0, shinBend: 0 };
      const solvedLast = solveGroundedLegPose(lg, bodyPositions[lastK], bodyQuats[lastK], exLast);
      hipRots.push(solvedLast.hipQ);
      shinRots.push(solvedLast.shinQ);

      outTracks.push(
        { nodeIndex: lg.hipIdx, path: 'rotation', times: denseTimes, values: hipRots },
        { nodeIndex: lg.shinIdx, path: 'rotation', times: denseTimes, values: shinRots }
      );
    }
    return outTracks;
  }

  // -------------------------------------------------------------------------
  // 6A. 'idle' (2.20s seamless predatory ambush scan & radial spine bristle)
  // -------------------------------------------------------------------------
  const idleT = [0.0, 0.55, 1.10, 1.65, 2.20];
  const idleBodyPos = [
    [0.0, 0.80, 0.0],
    [0.0, 0.835, 0.0],
    [0.0, 0.80, 0.0],
    [0.0, 0.775, 0.0],
    [0.0, 0.80, 0.0],
  ];
  const idleBodyRot = [
    idQ,
    quatFromEulerXYZ(0, 1.6, 1.0),
    idQ,
    quatFromEulerXYZ(0, -1.6, -0.8),
    idQ,
  ];
  scene.addAnimation('idle', [
    { nodeIndex: bodyIdx, path: 'translation', times: idleT, values: idleBodyPos },
    { nodeIndex: bodyIdx, path: 'rotation', times: idleT, values: idleBodyRot },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: idleT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 5.0, -2.0),
        idQ,
        quatFromEulerXYZ(0, -5.0, 1.8),
        idQ,
      ],
    },
    {
      nodeIndex: mandibleNodes.R,
      path: 'rotation',
      times: idleT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 10, 0),
        idQ,
        quatFromEulerXYZ(0, -5, 0),
        idQ,
      ],
    },
    {
      nodeIndex: mandibleNodes.L,
      path: 'rotation',
      times: idleT,
      values: [
        idQ,
        quatFromEulerXYZ(0, -10, 0),
        idQ,
        quatFromEulerXYZ(0, 5, 0),
        idQ,
      ],
    },
    {
      nodeIndex: tailIdx,
      path: 'rotation',
      times: idleT,
      values: [
        idQ,
        quatFromEulerXYZ(0, -3.5, 2.0),
        idQ,
        quatFromEulerXYZ(0, 3.5, -1.8),
        idQ,
      ],
    },
    {
      nodeIndex: dorsalCrownIdx,
      path: 'scale',
      times: idleT,
      values: [
        unitS,
        [1.045, 1.055, 1.045],
        unitS,
        [0.975, 0.970, 0.975],
        unitS,
      ],
    },
    {
      nodeIndex: spineBankRightIdx,
      path: 'rotation',
      times: idleT,
      values: [
        idQ,
        quatFromEulerXYZ(5.5, 0, 0), // bristles radially outward!
        idQ,
        quatFromEulerXYZ(-3.0, 0, 0),
        idQ,
      ],
    },
    {
      nodeIndex: spineBankLeftIdx,
      path: 'rotation',
      times: idleT,
      values: [
        idQ,
        quatFromEulerXYZ(-5.5, 0, 0),
        idQ,
        quatFromEulerXYZ(3.0, 0, 0),
        idQ,
      ],
    },
    ...buildGroundedLegTracks(idleT, idleBodyPos, idleBodyRot, (lg, k) => ({
      lift: k === 0 || k === 4 ? 0.0 : 0.006,
      yaw: 0,
      shinBend: 0,
    })),
  ]);

  // -------------------------------------------------------------------------
  // 6B. 'walk' (0.88s seamless 6-scythe alternating tripod predatory scuttle!)
  //     Tripod A: {0R, 1L, 2R}  |  Tripod B: {0L, 1R, 2L}
  // -------------------------------------------------------------------------
  const walkT = [0.0, 0.22, 0.44, 0.66, 0.88];
  const walkBodyPos = [
    [0.0, 0.80, 0.0],
    [0.0, 0.84, -0.025],
    [0.0, 0.80, 0.0],
    [0.0, 0.84, 0.025],
    [0.0, 0.80, 0.0],
  ];
  const walkBodyRot = [
    idQ,
    quatFromEulerXYZ(1.8, 3.2, 0),
    idQ,
    quatFromEulerXYZ(-1.8, -3.2, 0),
    idQ,
  ];
  scene.addAnimation('walk', [
    { nodeIndex: bodyIdx, path: 'translation', times: walkT, values: walkBodyPos },
    { nodeIndex: bodyIdx, path: 'rotation', times: walkT, values: walkBodyRot },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: walkT,
      values: [
        idQ,
        quatFromEulerXYZ(0, -4.5, -2.0),
        idQ,
        quatFromEulerXYZ(0, 4.5, -2.0),
        idQ,
      ],
    },
    {
      nodeIndex: mandibleNodes.R,
      path: 'rotation',
      times: walkT,
      values: [idQ, quatFromEulerXYZ(0, 8, 0), idQ, quatFromEulerXYZ(0, -4, 0), idQ],
    },
    {
      nodeIndex: mandibleNodes.L,
      path: 'rotation',
      times: walkT,
      values: [idQ, quatFromEulerXYZ(0, -8, 0), idQ, quatFromEulerXYZ(0, 4, 0), idQ],
    },
    {
      nodeIndex: tailIdx,
      path: 'rotation',
      times: walkT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 5.0, 2.0),
        idQ,
        quatFromEulerXYZ(0, -5.0, 2.0),
        idQ,
      ],
    },
    {
      nodeIndex: dorsalCrownIdx,
      path: 'scale',
      times: walkT,
      values: [unitS, [1.02, 0.98, 1.02], unitS, [1.02, 0.98, 1.02], unitS],
    },
    ...buildGroundedLegTracks(walkT, walkBodyPos, walkBodyRot, (lg, k) => {
      const isTripodA = (lg.idx + (lg.sideSign > 0 ? 0 : 1)) % 2 === 0;
      if (k === 1) {
        return isTripodA
          ? { lift: 0.24, yaw: 14.5, shinBend: 10 }
          : { lift: 0.008, yaw: -12.0, shinBend: 0 };
      }
      if (k === 3) {
        return !isTripodA
          ? { lift: 0.24, yaw: 14.5, shinBend: 10 }
          : { lift: 0.008, yaw: -12.0, shinBend: 0 };
      }
      return { lift: 0.0, yaw: 0.0, shinBend: 0 };
    }),
  ]);

  // -------------------------------------------------------------------------
  // 6C. 'attack' (0.86s seismic crouch & violent radial dorsal spine eruption from 'SpineOrigin'!)
  // -------------------------------------------------------------------------
  const atkT = [0.0, 0.16, 0.30, 0.56, 0.86];
  const atkBodyPos = [
    [0.0, 0.80, 0.0],
    [-0.06, 0.64, 0.0], // deep seismic pressure crouch!
    [0.10, 0.88, 0.0],  // violent upward-forward spine eruption heave!
    [-0.04, 0.76, 0.0], // recoil settle
    [0.0, 0.80, 0.0],
  ];
  const atkBodyRot = [
    idQ,
    quatFromEulerXYZ(0, 0, 5.0),
    quatFromEulerXYZ(0, 0, -7.5), // snaps forward toward +X target line!
    quatFromEulerXYZ(0, 0, 2.0),
    idQ,
  ];
  scene.addAnimation('attack', [
    { nodeIndex: bodyIdx, path: 'translation', times: atkT, values: atkBodyPos },
    { nodeIndex: bodyIdx, path: 'rotation', times: atkT, values: atkBodyRot },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: atkT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, -8),
        quatFromEulerXYZ(0, 0, 10),
        quatFromEulerXYZ(0, 0, -3),
        idQ,
      ],
    },
    {
      nodeIndex: mandibleNodes.R,
      path: 'rotation',
      times: atkT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 18, 0),
        quatFromEulerXYZ(0, -14, 0), // violent mandible scissor snap!
        quatFromEulerXYZ(0, 6, 0),
        idQ,
      ],
    },
    {
      nodeIndex: mandibleNodes.L,
      path: 'rotation',
      times: atkT,
      values: [
        idQ,
        quatFromEulerXYZ(0, -18, 0),
        quatFromEulerXYZ(0, 14, 0),
        quatFromEulerXYZ(0, -6, 0),
        idQ,
      ],
    },
    {
      nodeIndex: tailIdx,
      path: 'rotation',
      times: atkT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, -6),
        quatFromEulerXYZ(0, 0, 10),
        quatFromEulerXYZ(0, 0, -2),
        idQ,
      ],
    },
    {
      nodeIndex: dorsalCrownIdx,
      path: 'scale',
      times: atkT,
      values: [
        unitS,
        [1.10, 0.84, 1.10], // compresses & charges seismic pressure!
        [1.16, 1.28, 1.16], // explosive dorsal spine launch through SpineOrigin!
        [0.94, 0.92, 0.94],
        unitS,
      ],
    },
    {
      nodeIndex: spineBankCenterIdx,
      path: 'rotation',
      times: atkT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, 10),  // cocks backward
        quatFromEulerXYZ(0, 0, -16), // whips forward along +X seismic line!
        quatFromEulerXYZ(0, 0, 4),
        idQ,
      ],
    },
    {
      nodeIndex: spineBankRightIdx,
      path: 'rotation',
      times: atkT,
      values: [
        idQ,
        quatFromEulerXYZ(-14, 0, 0), // draws radial spines inward
        quatFromEulerXYZ(22, 0, -8), // violent radial spine eruption!
        quatFromEulerXYZ(-4, 0, 0),
        idQ,
      ],
    },
    {
      nodeIndex: spineBankLeftIdx,
      path: 'rotation',
      times: atkT,
      values: [
        idQ,
        quatFromEulerXYZ(14, 0, 0),
        quatFromEulerXYZ(-22, 0, -8),
        quatFromEulerXYZ(4, 0, 0),
        idQ,
      ],
    },
    ...buildGroundedLegTracks(atkT, atkBodyPos, atkBodyRot, (lg, k) => {
      if (lg.idx === 0 && k === 1) return { lift: 0.05, yaw: 12, shinBend: 4 };
      if (lg.idx === 0 && k === 2) return { lift: 0.02, yaw: -8, shinBend: 0 };
      return { lift: k === 0 || k === 4 ? 0.0 : 0.012, yaw: 0, shinBend: 0 };
    }),
  ]);

  // -------------------------------------------------------------------------
  // 6D & 6E. 'burrow' (0.76s) & 'surface' (0.72s) — Exact Symmetric Endpoint Match!
  //   - 'burrow': standing rest -> rapid fore-scythe digging -> low clamped subterranean
  //               entrenchment (BodyCore plunges 0.80 -> 0.27, scythes fold tight & wide
  //               as earth-anchors on Y >= 0, menacing radial dorsal spines bristle!).
  //   - 'surface': exact 'burrow' entrenched pose -> explosive upward breach -> standing rest!
  // -------------------------------------------------------------------------
  const entrenchedBodyPos = [0.02, 0.27, 0.0];
  const entrenchedBodyRot = idQ;
  const entrenchedHeadRot = quatFromEulerXYZ(0, 0, 4.0);
  const entrenchedTailRot = quatFromEulerXYZ(0, 0, -4.0);
  const entrenchedMandR = quatFromEulerXYZ(0, -10, 0);
  const entrenchedMandL = quatFromEulerXYZ(0, 10, 0);
  const entrenchedCrownScale = [1.08, 1.12, 1.08];
  const entrenchedCenterRot = quatFromEulerXYZ(0, 0, -4);
  const entrenchedRightRot = quatFromEulerXYZ(14, 0, 0);
  const entrenchedLeftRot = quatFromEulerXYZ(-14, 0, 0);
  const entrenchedLegExtra = (lg) => ({
    lift: 0.012,
    yaw: lg.idx === 0 ? 18 : lg.idx === 2 ? -18 : 0,
    shinBend: 18, // folds scythe shins outward-upward tightly into clamped burrow anchor stance!
  });

  const burrowT = [0.0, 0.16, 0.34, 0.54, 0.76];
  const burrowBodyPos = [
    [0.0, 0.80, 0.0],
    [0.05, 0.72, 0.0],  // pitches nose-down & claws open soil with fore-scythes!
    [0.03, 0.52, 0.0],  // mid-plunge intermediate step prevents interpolation sag!
    [0.02, 0.34, 0.0],  // settling into trench
    entrenchedBodyPos,  // locked entrenched ambush mine pose!
  ];
  const burrowBodyRot = [
    idQ,
    quatFromEulerXYZ(0, 0, -7.0), // nose-down dig!
    quatFromEulerXYZ(0, 2.5, -3.5),
    quatFromEulerXYZ(0, -1.5, -1.0),
    entrenchedBodyRot,
  ];
  scene.addAnimation('burrow', [
    { nodeIndex: bodyIdx, path: 'translation', times: burrowT, values: burrowBodyPos },
    { nodeIndex: bodyIdx, path: 'rotation', times: burrowT, values: burrowBodyRot },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: burrowT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, -10), // shovel-head digs!
        quatFromEulerXYZ(0, 4, -2),
        quatFromEulerXYZ(0, -2, 3),
        entrenchedHeadRot,
      ],
    },
    {
      nodeIndex: mandibleNodes.R,
      path: 'rotation',
      times: burrowT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 22, 0),
        quatFromEulerXYZ(0, -14, 0),
        quatFromEulerXYZ(0, 6, 0),
        entrenchedMandR,
      ],
    },
    {
      nodeIndex: mandibleNodes.L,
      path: 'rotation',
      times: burrowT,
      values: [
        idQ,
        quatFromEulerXYZ(0, -22, 0),
        quatFromEulerXYZ(0, 14, 0),
        quatFromEulerXYZ(0, -6, 0),
        entrenchedMandL,
      ],
    },
    {
      nodeIndex: tailIdx,
      path: 'rotation',
      times: burrowT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, 8),
        quatFromEulerXYZ(0, 0, 2),
        quatFromEulerXYZ(0, 0, -3),
        entrenchedTailRot,
      ],
    },
    {
      nodeIndex: dorsalCrownIdx,
      path: 'scale',
      times: burrowT,
      values: [
        unitS,
        [0.96, 0.94, 0.96],
        [1.02, 1.04, 1.02],
        [1.06, 1.10, 1.06],
        entrenchedCrownScale,
      ],
    },
    {
      nodeIndex: spineBankCenterIdx,
      path: 'rotation',
      times: burrowT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, 8),
        quatFromEulerXYZ(0, 0, 2),
        quatFromEulerXYZ(0, 0, -3),
        entrenchedCenterRot,
      ],
    },
    {
      nodeIndex: spineBankRightIdx,
      path: 'rotation',
      times: burrowT,
      values: [
        idQ,
        quatFromEulerXYZ(-10, 0, 0),
        quatFromEulerXYZ(4, 0, 0),
        quatFromEulerXYZ(12, 0, 0),
        entrenchedRightRot,
      ],
    },
    {
      nodeIndex: spineBankLeftIdx,
      path: 'rotation',
      times: burrowT,
      values: [
        idQ,
        quatFromEulerXYZ(10, 0, 0),
        quatFromEulerXYZ(-4, 0, 0),
        quatFromEulerXYZ(-12, 0, 0),
        entrenchedLeftRot,
      ],
    },
    ...buildGroundedLegTracks(burrowT, burrowBodyPos, burrowBodyRot, (lg, k) => {
      if (k === 0) return { lift: 0.0, yaw: 0, shinBend: 0 };
      if (k === 1) {
        // Fore-scythes lift & claw furiously to dig!
        return lg.idx === 0
          ? { lift: 0.18, yaw: 20, shinBend: 12 }
          : { lift: 0.015, yaw: -6, shinBend: 6 };
      }
      if (k === 2) {
        return lg.idx === 0
          ? { lift: 0.02, yaw: -8, shinBend: 14 }
          : { lift: 0.06, yaw: lg.idx === 2 ? -14 : 6, shinBend: 14 };
      }
      if (k === 3) {
        return {
          lift: 0.015,
          yaw: lg.idx === 0 ? 14 : lg.idx === 2 ? -14 : 0,
          shinBend: 16,
        };
      }
      return entrenchedLegExtra(lg);
    }),
  ]);

  // 6E. 'surface' (0.72s explosive breach out of entrenched burrow back to standing rest!)
  const surfaceT = [0.0, 0.18, 0.38, 0.56, 0.72];
  const surfaceBodyPos = [
    entrenchedBodyPos,
    [0.01, 0.56, 0.0], // rapid upward surge out of earth!
    [-0.02, 0.89, 0.0], // explosive breach overshoot!
    [0.0, 0.77, 0.0],  // grounded landing crouch
    [0.0, 0.80, 0.0],  // exact standing rest pose
  ];
  const surfaceBodyRot = [
    entrenchedBodyRot,
    quatFromEulerXYZ(0, 0, 6.0),  // nose rears upward out of soil!
    quatFromEulerXYZ(0, 0, 4.0),
    quatFromEulerXYZ(0, 0, -1.5),
    idQ,
  ];
  scene.addAnimation('surface', [
    { nodeIndex: bodyIdx, path: 'translation', times: surfaceT, values: surfaceBodyPos },
    { nodeIndex: bodyIdx, path: 'rotation', times: surfaceT, values: surfaceBodyRot },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: surfaceT,
      values: [
        entrenchedHeadRot,
        quatFromEulerXYZ(0, 0, 10),
        quatFromEulerXYZ(0, 0, 6),
        quatFromEulerXYZ(0, 0, -2),
        idQ,
      ],
    },
    {
      nodeIndex: mandibleNodes.R,
      path: 'rotation',
      times: surfaceT,
      values: [
        entrenchedMandR,
        quatFromEulerXYZ(0, 18, 0),
        quatFromEulerXYZ(0, 22, 0),
        quatFromEulerXYZ(0, 5, 0),
        idQ,
      ],
    },
    {
      nodeIndex: mandibleNodes.L,
      path: 'rotation',
      times: surfaceT,
      values: [
        entrenchedMandL,
        quatFromEulerXYZ(0, -18, 0),
        quatFromEulerXYZ(0, -22, 0),
        quatFromEulerXYZ(0, -5, 0),
        idQ,
      ],
    },
    {
      nodeIndex: tailIdx,
      path: 'rotation',
      times: surfaceT,
      values: [
        entrenchedTailRot,
        quatFromEulerXYZ(0, 0, -8),
        quatFromEulerXYZ(0, 0, -4),
        quatFromEulerXYZ(0, 0, 2),
        idQ,
      ],
    },
    {
      nodeIndex: dorsalCrownIdx,
      path: 'scale',
      times: surfaceT,
      values: [
        entrenchedCrownScale,
        [1.12, 1.16, 1.12],
        [1.06, 1.08, 1.06],
        [0.98, 0.97, 0.98],
        unitS,
      ],
    },
    {
      nodeIndex: spineBankCenterIdx,
      path: 'rotation',
      times: surfaceT,
      values: [
        entrenchedCenterRot,
        quatFromEulerXYZ(0, 0, -8),
        quatFromEulerXYZ(0, 0, 4),
        quatFromEulerXYZ(0, 0, -1),
        idQ,
      ],
    },
    {
      nodeIndex: spineBankRightIdx,
      path: 'rotation',
      times: surfaceT,
      values: [
        entrenchedRightRot,
        quatFromEulerXYZ(18, 0, 0),
        quatFromEulerXYZ(8, 0, 0),
        quatFromEulerXYZ(-2, 0, 0),
        idQ,
      ],
    },
    {
      nodeIndex: spineBankLeftIdx,
      path: 'rotation',
      times: surfaceT,
      values: [
        entrenchedLeftRot,
        quatFromEulerXYZ(-18, 0, 0),
        quatFromEulerXYZ(-8, 0, 0),
        quatFromEulerXYZ(2, 0, 0),
        idQ,
      ],
    },
    ...buildGroundedLegTracks(surfaceT, surfaceBodyPos, surfaceBodyRot, (lg, k) => {
      if (k === 0) return entrenchedLegExtra(lg);
      if (k === 1) return { lift: 0.04, yaw: lg.idx === 0 ? 12 : -8, shinBend: 12 };
      if (k === 2) return { lift: 0.10, yaw: lg.idx === 0 ? 8 : -4, shinBend: 4 };
      if (k === 3) return { lift: 0.01, yaw: 0, shinBend: 0 };
      return { lift: 0.0, yaw: 0, shinBend: 0 };
    }),
  ]);

  // -------------------------------------------------------------------------
  // 6F. 'death' (1.24s agonized convulsion & grounded 6-scythe collapse onto Y >= 0!)
  // -------------------------------------------------------------------------
  const deathT = [0.0, 0.20, 0.42, 0.68, 0.98, 1.24];
  const deathBodyPos = [
    [0.0, 0.80, 0.0],
    [-0.04, 0.90, 0.0],  // upward pain spasm!
    [-0.07, 0.64, 0.01], // mid-buckle intermediate step prevents arc sag!
    [-0.10, 0.42, 0.02], // lower buckle
    [-0.12, 0.29, 0.03], // ventral sternum settles cleanly above Y = 0!
    [-0.12, 0.29, 0.03],
  ];
  const deathBodyRot = [
    idQ,
    quatFromEulerXYZ(3, -4, 9),
    quatFromEulerXYZ(4, -5, 2),
    quatFromEulerXYZ(5, -6, -2),
    quatFromEulerXYZ(5, -7, -3),
    quatFromEulerXYZ(5, -7, -3),
  ];
  scene.addAnimation('death', [
    { nodeIndex: bodyIdx, path: 'translation', times: deathT, values: deathBodyPos },
    { nodeIndex: bodyIdx, path: 'rotation', times: deathT, values: deathBodyRot },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: deathT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 6, 14),
        quatFromEulerXYZ(2, 0, 6),
        quatFromEulerXYZ(3, -4, 6),
        quatFromEulerXYZ(4, -6, 8), // keeps mandible tips cleanly above Y = 0!
        quatFromEulerXYZ(4, -6, 8),
      ],
    },
    {
      nodeIndex: mandibleNodes.R,
      path: 'rotation',
      times: deathT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 24, 0),
        quatFromEulerXYZ(0, 16, 0),
        quatFromEulerXYZ(0, 14, 0),
        quatFromEulerXYZ(0, 18, 0),
        quatFromEulerXYZ(0, 18, 0),
      ],
    },
    {
      nodeIndex: mandibleNodes.L,
      path: 'rotation',
      times: deathT,
      values: [
        idQ,
        quatFromEulerXYZ(0, -24, 0),
        quatFromEulerXYZ(0, -16, 0),
        quatFromEulerXYZ(0, -14, 0),
        quatFromEulerXYZ(0, -18, 0),
        quatFromEulerXYZ(0, -18, 0),
      ],
    },
    {
      nodeIndex: tailIdx,
      path: 'rotation',
      times: deathT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, 10),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -5),
        quatFromEulerXYZ(0, 0, -6),
        quatFromEulerXYZ(0, 0, -6),
      ],
    },
    {
      nodeIndex: dorsalCrownIdx,
      path: 'scale',
      times: deathT,
      values: [
        unitS,
        [1.10, 1.12, 1.10],
        [0.96, 0.90, 0.96],
        [0.86, 0.78, 0.88],
        [0.80, 0.70, 0.84], // deflated dorsal launcher!
        [0.80, 0.70, 0.84],
      ],
    },
    {
      nodeIndex: spineBankCenterIdx,
      path: 'rotation',
      times: deathT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, 12),
        quatFromEulerXYZ(0, 0, 4),
        quatFromEulerXYZ(0, 0, 10),
        quatFromEulerXYZ(0, 0, 16), // median spines droop backward
        quatFromEulerXYZ(0, 0, 16),
      ],
    },
    {
      nodeIndex: spineBankRightIdx,
      path: 'rotation',
      times: deathT,
      values: [
        idQ,
        quatFromEulerXYZ(16, 0, 0),
        quatFromEulerXYZ(20, 0, 0),
        quatFromEulerXYZ(26, 0, 0),
        quatFromEulerXYZ(30, 0, 0), // radial spines splay limply outward
        quatFromEulerXYZ(30, 0, 0),
      ],
    },
    {
      nodeIndex: spineBankLeftIdx,
      path: 'rotation',
      times: deathT,
      values: [
        idQ,
        quatFromEulerXYZ(-16, 0, 0),
        quatFromEulerXYZ(-20, 0, 0),
        quatFromEulerXYZ(-26, 0, 0),
        quatFromEulerXYZ(-30, 0, 0),
        quatFromEulerXYZ(-30, 0, 0),
      ],
    },
    ...buildGroundedLegTracks(deathT, deathBodyPos, deathBodyRot, (lg, k) => {
      if (k === 0) return { lift: 0.0, yaw: 0, shinBend: 0 };
      if (k === 1) return { lift: 0.14, yaw: lg.idx === 0 ? 16 : -10, shinBend: 8 };
      if (k === 2) return { lift: 0.03, yaw: lg.idx === 0 ? 18 : -12, shinBend: 12 };
      if (k === 3) return { lift: 0.02, yaw: lg.idx === 0 ? 20 : -15, shinBend: 16 };
      return { lift: 0.015, yaw: lg.idx === 0 ? 22 : lg.idx === 2 ? -18 : 4, shinBend: 20 };
    }),
  ]);

  return scene.buildGLB('SpineAmbusherScene');
}

// ---------------------------------------------------------------------------
// Direct Binary GLB + Rest/Animated Kinematic Validator
// ---------------------------------------------------------------------------

function readAccessorValues(glbBuffer, gltf, binStart, accIdx) {
  const acc = gltf.accessors[accIdx];
  const bv = gltf.bufferViews[acc.bufferView];
  const off = binStart + (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const compsMap = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const comps = compsMap[acc.type];
  const out = [];
  for (let i = 0; i < acc.count; i++) {
    if (acc.componentType === 5126) {
      if (comps === 1) {
        out.push(glbBuffer.readFloatLE(off + i * 4));
      } else {
        const arr = [];
        for (let c = 0; c < comps; c++) arr.push(glbBuffer.readFloatLE(off + (i * comps + c) * 4));
        out.push(arr);
      }
    } else if (acc.componentType === 5123) {
      out.push(glbBuffer.readUInt16LE(off + i * 2));
    }
  }
  return out;
}

function sampleTrack(times, values, pathType, t) {
  if (t <= times[0]) return values[0];
  const last = times.length - 1;
  if (t >= times[last]) return values[last];
  let k = 0;
  while (k < last - 1 && times[k + 1] < t) k++;
  const span = times[k + 1] - times[k];
  const u = span > 1e-8 ? (t - times[k]) / span : 0;
  if (pathType === 'rotation') return quatSlerp(values[k], values[k + 1], u);
  return vLerp(values[k], values[k + 1], u);
}

function validateAndSummarizeAsset(spec, glbBuffer, gltf) {
  // 1. Validate binary GLB v2 header & chunk integrity
  if (glbBuffer.readUInt32LE(0) !== 0x46546c67) throw new Error(`${spec.filename}: invalid GLB magic`);
  if (glbBuffer.readUInt32LE(4) !== 2) throw new Error(`${spec.filename}: invalid GLB version`);
  if (glbBuffer.readUInt32LE(8) !== glbBuffer.length) throw new Error(`${spec.filename}: length mismatch`);

  const jsonLen = glbBuffer.readUInt32LE(12);
  const binStart = 20 + jsonLen + 8;

  const parentMap = new Map();
  gltf.nodes.forEach((n, idx) => {
    for (const c of n.children || []) parentMap.set(c, idx);
  });

  // Extract local vertex sets per node
  const nodeVertices = new Map();
  let totalVerts = 0;
  let totalTris = 0;

  gltf.nodes.forEach((n, nIdx) => {
    if (n.mesh === undefined) return;
    const mesh = gltf.meshes[n.mesh];
    const pts = [];
    for (const prim of mesh.primitives) {
      const posVals = readAccessorValues(glbBuffer, gltf, binStart, prim.attributes.POSITION);
      const normVals = readAccessorValues(glbBuffer, gltf, binStart, prim.attributes.NORMAL);
      const idxVals = readAccessorValues(glbBuffer, gltf, binStart, prim.indices);
      totalVerts += posVals.length;
      totalTris += idxVals.length / 3;

      for (const nv of normVals) {
        const nl = Math.hypot(nv[0], nv[1], nv[2]);
        if (!Number.isFinite(nl) || Math.abs(nl - 1.0) > 1e-2) {
          throw new Error(`${spec.filename}: non-unit normal in mesh ${mesh.name}`);
        }
      }
      for (const pv of posVals) {
        if (!pv.every(Number.isFinite)) throw new Error(`${spec.filename}: NaN/Inf position in ${mesh.name}`);
        pts.push(pv);
      }
    }
    nodeVertices.set(nIdx, pts);
  });

  function evalWorldBounds(overrides = null) {
    const mn = [Infinity, Infinity, Infinity];
    const mx = [-Infinity, -Infinity, -Infinity];
    let maxR = 0;

    function toWorld(nodeIdx, localPt) {
      let cur = localPt;
      let idx = nodeIdx;
      while (idx !== undefined) {
        const baseN = gltf.nodes[idx];
        const ov = overrides ? overrides.get(idx) : null;
        const sc = (ov && ov.scale) || baseN.scale;
        const rt = (ov && ov.rotation) || baseN.rotation;
        const tr = (ov && ov.translation) || baseN.translation;
        if (sc) cur = [cur[0] * sc[0], cur[1] * sc[1], cur[2] * sc[2]];
        if (rt) cur = rotateVecByQuat(cur, rt);
        if (tr) cur = vAdd(cur, tr);
        idx = parentMap.get(idx);
      }
      return cur;
    }

    for (const [nIdx, pts] of nodeVertices.entries()) {
      for (const p of pts) {
        const wp = toWorld(nIdx, p);
        for (let c = 0; c < 3; c++) {
          if (wp[c] < mn[c]) mn[c] = wp[c];
          if (wp[c] > mx[c]) mx[c] = wp[c];
        }
        const hr = Math.hypot(wp[0], wp[2]);
        if (hr > maxR) maxR = hr;
      }
    }
    return { mn, mx, maxR, toWorld };
  }

  // 2. Validate rest-pose floor Y=0 and exact target radius
  const rest = evalWorldBounds(null);
  if (Math.abs(rest.mn[1] - 0.0) > 1.5e-3) {
    throw new Error(`${spec.filename}: rest min.y=${rest.mn[1].toFixed(5)} violates floor Y=0`);
  }
  if (rest.maxR > spec.maxRadius + 1.5e-3) {
    throw new Error(
      `${spec.filename}: rest maxHorizontalRadius=${rest.maxR.toFixed(5)} exceeds radius ${spec.maxRadius}`
    );
  }
  if (rest.maxR < spec.maxRadius * 0.94) {
    throw new Error(
      `${spec.filename}: rest maxHorizontalRadius=${rest.maxR.toFixed(5)} underfills radius ${spec.maxRadius}`
    );
  }

  // 3. Validate Surf_TEAM and Surf_GLOW mesh & node names + required anchors
  const meshNames = gltf.meshes.map((m) => m.name);
  const nodeNames = gltf.nodes.map((n) => n.name);
  const teamMeshes = meshNames.filter((m) => m.includes('Surf_TEAM'));
  const glowMeshes = meshNames.filter((m) => m.includes('Surf_GLOW'));
  const teamNodes = nodeNames.filter((n) => n.includes('Surf_TEAM'));
  const glowNodes = nodeNames.filter((n) => n.includes('Surf_GLOW'));

  if (teamMeshes.length === 0 || teamNodes.length === 0) {
    throw new Error(`${spec.filename}: missing Surf_TEAM meshes/nodes`);
  }
  if (glowMeshes.length === 0 || glowNodes.length === 0) {
    throw new Error(`${spec.filename}: missing Surf_GLOW meshes/nodes`);
  }

  const anchorWorldPositions = {};
  for (const reqAnchor of spec.requiredAnchors || []) {
    const aIdx = gltf.nodes.findIndex((n) => n.name === reqAnchor);
    if (aIdx < 0) throw new Error(`${spec.filename}: missing required anchor '${reqAnchor}'`);
    anchorWorldPositions[reqAnchor] = rest.toWorld(aIdx, [0, 0, 0]).map((x) => Number(x.toFixed(4)));
  }

  // 4. Validate required animations & sample dense interpolated frames
  const animNames = (gltf.animations || []).map((a) => a.name);
  for (const reqClip of spec.requiredClips) {
    if (!animNames.includes(reqClip)) {
      throw new Error(`${spec.filename}: missing required animation clip '${reqClip}'`);
    }
  }

  const animChecks = {};
  for (const anim of gltf.animations || []) {
    const decodedTracks = anim.channels.map((ch) => {
      const samp = anim.samplers[ch.sampler];
      const times = readAccessorValues(glbBuffer, gltf, binStart, samp.input);
      const values = readAccessorValues(glbBuffer, gltf, binStart, samp.output);
      if (Math.abs(times[0]) > 1e-6) {
        throw new Error(`${spec.filename}/${anim.name}: track does not start at t=0`);
      }
      for (let i = 1; i < times.length; i++) {
        if (!(times[i] > times[i - 1])) {
          throw new Error(`${spec.filename}/${anim.name}: non-monotonic keyframe times`);
        }
      }
      if (ch.target.path === 'rotation') {
        for (const q of values) {
          const ql = Math.hypot(q[0], q[1], q[2], q[3]);
          if (Math.abs(ql - 1.0) > 2e-3) {
            throw new Error(`${spec.filename}/${anim.name}: non-unit quaternion`);
          }
        }
      }
      if (spec.loopClips.includes(anim.name)) {
        const first = values[0];
        const lastVal = values[values.length - 1];
        for (let c = 0; c < first.length; c++) {
          if (Math.abs(first[c] - lastVal[c]) > 1e-5) {
            throw new Error(`${spec.filename}/${anim.name}: loop seam mismatch on node ${ch.target.node}`);
          }
        }
      }
      return {
        node: ch.target.node,
        path: ch.target.path,
        times,
        values,
      };
    });

    const duration = Math.max(...decodedTracks.map((tr) => tr.times[tr.times.length - 1]));
    let clipMinY = Infinity;
    let clipMaxY = -Infinity;
    let clipMaxR = 0;
    const sampleSteps = 40;
    for (let s = 0; s <= sampleSteps; s++) {
      const t = (duration * s) / sampleSteps;
      const ov = new Map();
      for (const tr of decodedTracks) {
        if (!ov.has(tr.node)) ov.set(tr.node, {});
        ov.get(tr.node)[tr.path] = sampleTrack(tr.times, tr.values, tr.path, t);
      }
      const b = evalWorldBounds(ov);
      if (b.mn[1] < clipMinY) clipMinY = b.mn[1];
      if (b.mx[1] > clipMaxY) clipMaxY = b.mx[1];
      if (b.maxR > clipMaxR) clipMaxR = b.maxR;
    }

    if (clipMinY < -0.003) {
      throw new Error(
        `${spec.filename}/${anim.name}: animated floor penetration min.y=${clipMinY.toFixed(5)}`
      );
    }

    animChecks[anim.name] = {
      duration: Number(duration.toFixed(4)),
      minY: Number(clipMinY.toFixed(4)),
      maxY: Number(clipMaxY.toFixed(4)),
      maxR: Number(clipMaxR.toFixed(4)),
    };
  }

  const sha256 = crypto.createHash('sha256').update(glbBuffer).digest('hex');
  return {
    filename: spec.filename,
    bytes: glbBuffer.length,
    sha256,
    verts: totalVerts,
    tris: totalTris,
    min: rest.mn.map((x) => Number(x.toFixed(4))),
    max: rest.mx.map((x) => Number(x.toFixed(4))),
    size: [
      Number((rest.mx[0] - rest.mn[0]).toFixed(4)),
      Number((rest.mx[1] - rest.mn[1]).toFixed(4)),
      Number((rest.mx[2] - rest.mn[2]).toFixed(4)),
    ],
    maxHorizontalRadius: Number(rest.maxR.toFixed(4)),
    targetRadius: spec.maxRadius,
    teamMeshes,
    glowMeshes,
    teamNodes,
    glowNodes,
    anchors: anchorWorldPositions,
    animations: animChecks,
  };
}

function main() {
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
  fs.mkdirSync(outDir, { recursive: true });

  const specs = [
    {
      filename: 'adaptation_chamber.glb',
      build: buildAdaptationChamberGLB,
      maxRadius: 2.5,
      requiredClips: ['idle'],
      loopClips: ['idle'],
      requiredAnchors: [],
    },
    {
      filename: 'ambusher_den.glb',
      build: buildAmbusherDenGLB,
      maxRadius: 2.5,
      requiredClips: ['idle'],
      loopClips: ['idle'],
      requiredAnchors: [],
    },
    {
      filename: 'spine_ambusher.glb',
      build: buildSpineAmbusherGLB,
      maxRadius: 1.875,
      requiredClips: ['idle', 'walk', 'attack', 'burrow', 'surface', 'death'],
      loopClips: ['idle', 'walk'],
      requiredAnchors: ['SpineOrigin'],
    },
  ];

  const summaries = [];
  for (const spec of specs) {
    const { glbBuffer, gltf } = spec.build();
    const summary = validateAndSummarizeAsset(spec, glbBuffer, gltf);
    const outPath = path.join(outDir, spec.filename);
    fs.writeFileSync(outPath, glbBuffer);
    summaries.push(summary);
  }

  console.log(JSON.stringify(summaries, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildAdaptationChamberGLB,
  buildAmbusherDenGLB,
  buildSpineAmbusherGLB,
};
