#!/usr/bin/env node
'use strict';

/**
 * Deterministic Standalone Procedural GLB Generator for Starfall Command
 * Faction: Gnarl Brood — Ravager Evolution Pair (Rupture Crawler & Rupture Cocoon)
 *
 * Outputs ONLY inside target directory (default __dirname):
 *   1. rupture_crawler.glb — Tall many-legged (8-limb) acid artillery creature evolved
 *                            from the Bile Crawler (~3.30 units tall, radius 1.875,
 *                            +X forward, Y up, floor Y=0), with a vivid orange-green
 *                            dorsal caustic sac, flared armored limbs, and a readable
 *                            arcing launch pose.
 *                            Anchors: 'Muzzle', 'BileOrigin' (plus 'Head').
 *                            Animations: 'idle', 'walk', 'attack', 'cast', 'death'.
 *   2. rupture_cocoon.glb  — Squat swollen chitin shell (radius 1.25, ~1.58 units tall,
 *                            +X forward, Y up, floor Y=0) with overlapping armored
 *                            carapace girdles, calcified folded-limb buttresses, and a
 *                            pulsing molten-orange volcanic vent caldera with 4 valve
 *                            petals — visually distinct from the game's Baneling cocoon.
 *                            Animation: 'pulse' (seamless loop).
 *
 * Uses ONLY built-in Node.js modules ('fs', 'path', 'crypto'). Zero external dependencies.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Deterministic Math & Quaternion Utilities
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
  return [
    Number((n[0] * s).toFixed(7)),
    Number((n[1] * s).toFixed(7)),
    Number((n[2] * s).toFixed(7)),
    Number(Math.cos(half).toFixed(7)),
  ];
}

function quatFromEulerXYZ(rxDeg, ryDeg, rzDeg) {
  const rx = (rxDeg * Math.PI) / 360;
  const ry = (ryDeg * Math.PI) / 360;
  const rz = (rzDeg * Math.PI) / 360;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const x = sx * cy * cz + cx * sy * sz;
  const y = cx * sy * cz - sx * cy * sz;
  const z = cx * cy * sz + sx * sy * cz;
  const w = cx * cy * cz - sx * sy * sz;
  const l = Math.hypot(x, y, z, w) || 1;
  return [
    Number((x / l).toFixed(7)),
    Number((y / l).toFixed(7)),
    Number((z / l).toFixed(7)),
    Number((w / l).toFixed(7)),
  ];
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

function quatLerpNorm(a, b, t) {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  if (a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw < 0) {
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  const x = a[0] + (bx - a[0]) * t;
  const y = a[1] + (by - a[1]) * t;
  const z = a[2] + (bz - a[2]) * t;
  const w = a[3] + (bw - a[3]) * t;
  const l = Math.hypot(x, y, z, w) || 1;
  return [x / l, y / l, z / l, w / l];
}

function rotateVecByQuat(v, q) {
  const u = [q[0], q[1], q[2]];
  const s = q[3];
  const d = vDot(u, v);
  const c = vCross(u, v);
  return [
    2 * d * u[0] + (s * s - vDot(u, u)) * v[0] + 2 * s * c[0],
    2 * d * u[1] + (s * s - vDot(u, u)) * v[1] + 2 * s * c[1],
    2 * d * u[2] + (s * s - vDot(u, u)) * v[2] + 2 * s * c[2],
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
  const c = Math.min(ch, hx * 0.92, hz * 0.92);
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

function makeOvalRing(rx, rz, y, cx = 0, cz = 0, segs = 12) {
  const ring = [];
  for (let i = 0; i < segs; i++) {
    const th = (2 * Math.PI * i) / segs;
    ring.push([cx + Math.cos(th) * rx, y, cz + Math.sin(th) * rz]);
  }
  return ring;
}

/**
 * Analytic IK roll solver for lateral spider/crawler limbs:
 * Given rest hip height H (>0) and lateral reach L (>0) from hip to foot claw,
 * solves the exact outward roll angle theta (in degrees) so that when the hip
 * changes height by deltaHipY (negative = body lowers/collapses, positive = rises),
 * the tarsal claw tip stays cleanly planted on world Y = targetFootY (>= 0).
 */
function solveFootGroundedRollDeg(H, L, deltaHipY, targetFootY = 0.0) {
  const R = Math.hypot(H, L);
  const alpha = Math.atan2(H, L);
  const desiredRelY = targetFootY - (H + deltaHipY); // = -(H + deltaHipY - targetFootY)
  const sinArg = clamp(desiredRelY / R, -0.999, 0.999);
  // L*sin(theta) - H*cos(theta) = R * sin(theta - alpha) = desiredRelY
  const theta = alpha + Math.asin(sinArg);
  return (theta * 180) / Math.PI;
}

// ---------------------------------------------------------------------------
// Low-Poly Flat-Shaded Geometry Builder
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

  addPolygonCap(ring, centerHint, normalDir) {
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
      this.addPolygonCap(rings[0], centers[0], vLen(dir) > 1e-6 ? dir : [0, -1, 0]);
    }
    if (capEnd) {
      const last = rings.length - 1;
      const dir = vSub(centers[last], centers[last - 1]);
      this.addPolygonCap(rings[last], centers[last], vLen(dir) > 1e-6 ? dir : [0, 1, 0]);
    }
  }

  addChamferBox({
    center = [0, 0, 0],
    size = [1, 1, 1],
    rotDeg = [0, 0, 0],
    topScale = [0.90, 0.90],
    botScale = [1.0, 1.0],
    chamfer = 0.14,
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
    const rBot = rawBot.map(xf);
    const rTop = rawTop.map(xf);
    const cBot = xf([0, -hy, 0]);
    const cTop = xf([0, hy, 0]);
    this.addLoft([rBot, rTop], [cBot, cTop], true, true);
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

      const rx = stations[k].rx ?? stations[k].r ?? 0.12;
      const ry = stations[k].ry ?? stations[k].r ?? 0.12;
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

  /**
   * Sculpted organic low-poly lobe for Gnarl Brood carapaces, caustic sacs, and swollen shells.
   */
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

  /**
   * Sculpted diamond/hexagonal flared chitin limb-shield blade along a limb segment.
   * Creates the signature Ravager flared armored limb silhouette.
   */
  addFlaredLimbBlade({
    pStart,
    pEnd,
    flareDir,
    thickness = 0.14,
    backWidth = 0.08,
    flareStart = 0.08,
    flarePeak = 0.34,
    flareSub = 0.18,
    flareEnd = 0.03,
    minYClamp = null,
  }) {
    const axis = vNorm(vSub(pEnd, pStart));
    const fDir = vNorm(vSub(flareDir, vScale(axis, vDot(flareDir, axis))));
    const sideDir = vNorm(vCross(axis, fDir));

    const stations = [
      { t: 0.00, fw: flareStart, bw: backWidth * 0.85, th: thickness * 0.72 },
      { t: 0.28, fw: flarePeak, bw: backWidth * 1.05, th: thickness * 1.00 },
      { t: 0.62, fw: flareSub, bw: backWidth * 0.80, th: thickness * 0.78 },
      { t: 0.92, fw: flareEnd, bw: backWidth * 0.35, th: thickness * 0.32 },
    ];

    const rings = [];
    const centers = [];
    for (const st of stations) {
      const base = vLerp(pStart, pEnd, st.t);
      const pts = [
        vAdd(base, vScale(fDir, st.fw)), // sharp outer flared blade edge
        vAdd(base, vAdd(vScale(fDir, st.fw * 0.32), vScale(sideDir, st.th * 0.5))),
        vAdd(base, vAdd(vScale(fDir, -st.bw * 0.65), vScale(sideDir, st.th * 0.38))),
        vAdd(base, vScale(fDir, -st.bw)), // inner limb spine
        vAdd(base, vAdd(vScale(fDir, -st.bw * 0.65), vScale(sideDir, -st.th * 0.38))),
        vAdd(base, vAdd(vScale(fDir, st.fw * 0.32), vScale(sideDir, -st.th * 0.5))),
      ];
      for (const p of pts) {
        if (minYClamp !== null && p[1] < minYClamp) p[1] = minYClamp;
      }
      const cPt = vAdd(base, vScale(fDir, (st.fw - st.bw) * 0.2));
      if (minYClamp !== null && cPt[1] < minYClamp) cPt[1] = minYClamp;
      rings.push(pts);
      centers.push(cPt);
    }
    this.addLoft(rings, centers, true, true);
  }

  addOrientedShield(origin, outAxis, upAxis, poly2D, thickness = 0.04, topShrink = 0.86, backInset = 0.01) {
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

  addConcentricArcStrip({
    rInner,
    rOuter,
    yBot,
    yTop,
    thStart,
    thEnd,
    steps = 8,
    bevelIn = 0.01,
    cx = 0,
    cz = 0,
  }) {
    const rings = [];
    const centers = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const th = thStart + (thEnd - thStart) * u;
      const c = Math.cos(th), s = Math.sin(th);
      const rMid = (rInner + rOuter) * 0.5;
      rings.push([
        [cx + c * rInner, yBot, cz + s * rInner],
        [cx + c * rOuter, yBot, cz + s * rOuter],
        [cx + c * (rOuter - bevelIn), yTop, cz + s * (rOuter - bevelIn)],
        [cx + c * (rInner + bevelIn), yTop, cz + s * (rInner + bevelIn)],
      ]);
      centers.push([cx + c * rMid, (yBot + yTop) * 0.5, cz + s * rMid]);
    }
    this.addLoft(rings, centers, true, true);
  }
}

// ---------------------------------------------------------------------------
// glTF 2.0 Binary (.glb) Scene Builder
// ---------------------------------------------------------------------------

class GLBSceneBuilder {
  constructor() {
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
    metallic = 0.12,
    roughness = 0.55,
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
      let comps = 3;
      let typeStr = 'VEC3';
      if (tr.path === 'rotation') {
        comps = 4;
        typeStr = 'VEC4';
      }
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

  buildGLB(sceneName = 'GnarlRuptureScene') {
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
        generator: 'StarfallCommand-GnarlRuptureGenerator-1.0',
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
    const jsonChunk =
      jsonPad > 0 ? Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]) : jsonRaw;

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
// Palette Factories (Gnarl Brood Chitin + Evolved Orange-Green Caustic Artillery)
// ---------------------------------------------------------------------------

function createGnarlRuptureMaterials(scene) {
  return {
    // Dedicated player-color & glow surfaces (overridden by RTSModels.gd on *Surf_TEAM* / *Surf_GLOW*)
    Surf_TEAM: scene.addMaterial({
      name: 'Surf_TEAM_Panel',
      hex: '#e8483c',
      metallic: 0.20,
      roughness: 0.38,
      emissiveHex: '#b82a20',
      emissiveBoost: 0.45,
    }),
    Surf_GLOW: scene.addMaterial({
      name: 'Surf_GLOW_Accent',
      hex: '#ff705e',
      metallic: 0.04,
      roughness: 0.18,
      emissiveHex: '#ff5240',
      emissiveBoost: 1.85,
    }),

    // Gnarl Brood evolved carapace & bone materials (shared lineage with Bile Crawler)
    Mat_ChitinBody: scene.addMaterial({
      name: 'Mat_ChitinBody',
      hex: '#4e335a',
      metallic: 0.22,
      roughness: 0.46,
    }),
    Mat_ChitinRidge: scene.addMaterial({
      name: 'Mat_ChitinRidge',
      hex: '#9468a6',
      metallic: 0.18,
      roughness: 0.36,
    }),
    Mat_ChitinDark: scene.addMaterial({
      name: 'Mat_ChitinDark',
      hex: '#22142b',
      metallic: 0.28,
      roughness: 0.54,
    }),
    Mat_BoneSpur: scene.addMaterial({
      name: 'Mat_BoneSpur',
      hex: '#dac9ae',
      metallic: 0.10,
      roughness: 0.36,
    }),
    Mat_WarmMembrane: scene.addMaterial({
      name: 'Mat_WarmMembrane',
      hex: '#693642',
      metallic: 0.06,
      roughness: 0.70,
    }),

    // Signature Ravager / Rupture caustic materials (kept off Surf_GLOW_* so orange-green stays vivid!)
    Mat_CausticGreenBase: scene.addMaterial({
      name: 'Mat_CausticGreenBase',
      hex: '#59cf17',
      metallic: 0.04,
      roughness: 0.24,
      emissiveHex: '#44ad0c',
      emissiveBoost: 1.15,
    }),
    Mat_CausticAmberMid: scene.addMaterial({
      name: 'Mat_CausticAmberMid',
      hex: '#d2e622',
      metallic: 0.03,
      roughness: 0.18,
      emissiveHex: '#c2d614',
      emissiveBoost: 1.45,
    }),
    Mat_CausticOrangeCore: scene.addMaterial({
      name: 'Mat_CausticOrangeCore',
      hex: '#ff6612',
      metallic: 0.02,
      roughness: 0.15,
      emissiveHex: '#ff5208',
      emissiveBoost: 2.05,
    }),
    Mat_CausticOrangeBright: scene.addMaterial({
      name: 'Mat_CausticOrangeBright',
      hex: '#ffc842',
      metallic: 0.0,
      roughness: 0.10,
      emissiveHex: '#ffa822',
      emissiveBoost: 2.40,
    }),
    Mat_CausticMembrane: scene.addMaterial({
      name: 'Mat_CausticMembrane',
      hex: '#ff8224',
      alpha: 0.52,
      metallic: 0.0,
      roughness: 0.14,
      emissiveHex: '#ff6812',
      emissiveBoost: 1.65,
      alphaMode: 'BLEND',
      doubleSided: true,
    }),
  };
}

// ---------------------------------------------------------------------------
// Asset 1: rupture_crawler.glb
// Gnarl Brood Rupture Crawler — Tall many-legged (8-limb) acid artillery creature
// evolved from the Bile Crawler (~3.30 units tall, radius 1.875, +X forward, Y=0),
// orange-green dorsal caustic sac, flared armored limbs, readable arcing launch pose.
// Anchors: 'Muzzle', 'BileOrigin' (plus 'Head').
// Animations: 'idle', 'walk', 'attack', 'cast', 'death'.
// ---------------------------------------------------------------------------

function buildRuptureCrawlerGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createGnarlRuptureMaterials(scene);

  const rootIdx = scene.addNode({ name: 'RuptureCrawler', translation: [0, 0, 0] });

  // -------------------------------------------------------------------------
  // 1. Elevated Siege Thorax ('ThoraxCore' at [0, 1.32, 0])
  // -------------------------------------------------------------------------
  const thoraxRest = [0.0, 1.32, 0.0];
  const gThChitin = new PrimitiveGeom(mats.Mat_ChitinBody);
  const gThRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
  const gThDark = new PrimitiveGeom(mats.Mat_ChitinDark);
  const gThBone = new PrimitiveGeom(mats.Mat_BoneSpur);
  const gThWarm = new PrimitiveGeom(mats.Mat_WarmMembrane);

  // Heavy dark-chitin ventral sternum & coxal leg-socket frame (world Y ~ 0.94 .. 1.38)
  gThDark.addSculptedLobe({
    center: [0.06, -0.10, 0.0],
    radii: [0.80, 0.28, 0.66],
    sectors: 10,
    stacks: 5,
    flattenBottom: 0.38,
  });
  // Muscular warm thoracic under-pleura
  gThWarm.addSculptedLobe({
    center: [-0.04, 0.04, 0.0],
    radii: [0.74, 0.28, 0.62],
    sectors: 10,
    stacks: 5,
  });

  // 3 Overlapping Flared Ravager Thoracic Carapace Plates (shared lineage with Bile Crawler tergites!)
  const thoraxPlates = [
    { cx: 0.44, cy: 0.22, sx: 0.48, sy: 0.18, sz: 1.24, rz: -14 },
    { cx: 0.04, cy: 0.30, sx: 0.52, sy: 0.20, sz: 1.42, rz: -6 },
    { cx: -0.36, cy: 0.36, sx: 0.48, sy: 0.20, sz: 1.34, rz: 6 },
  ];
  for (const tp of thoraxPlates) {
    gThChitin.addChamferBox({
      center: [tp.cx, tp.cy, 0],
      size: [tp.sx, tp.sy, tp.sz],
      rotDeg: [0, 0, tp.rz],
      topScale: [0.82, 0.86],
      chamfer: 0.18,
    });
    // Raised lavender-plum posterior ridge lip on each tergite
    gThRidge.addChamferBox({
      center: [tp.cx - 0.12, tp.cy + 0.08, 0],
      size: [0.16, 0.08, tp.sz * 0.92],
      rotDeg: [0, 0, tp.rz],
      topScale: [0.76, 0.88],
      chamfer: 0.16,
    });
    // Flared lateral thoracic eaves & calcified shoulder teeth
    for (const side of [-1, 1]) {
      gThRidge.addTubeAlongSpine(
        [
          { pos: [tp.cx + 0.04, tp.cy + 0.02, side * (tp.sz * 0.44)], rx: 0.09, ry: 0.055 },
          { pos: [tp.cx - 0.10, tp.cy + 0.12, side * (tp.sz * 0.57)], rx: 0.03, ry: 0.02 },
        ],
        5,
        true,
        true
      );
    }
  }

  // Paired calcified bone pectoral siege-spurs beneath the anterior thorax
  for (const side of [-1, 1]) {
    gThBone.addTubeAlongSpine(
      [
        { pos: [0.56, -0.18, side * 0.38], rx: 0.075, ry: 0.065 },
        { pos: [0.84, -0.26, side * 0.44], rx: 0.018, ry: 0.018 },
      ],
      5,
      true,
      true
    );
  }

  const thoraxMesh = scene.addMesh('ThoraxCore_Mesh', [
    gThChitin,
    gThRidge,
    gThDark,
    gThBone,
    gThWarm,
  ]);
  const thoraxIdx = scene.addNode({
    name: 'ThoraxCore',
    meshIndex: thoraxMesh,
    translation: thoraxRest,
    parentIndex: rootIdx,
  });

  // Dedicated Thorax Surf_TEAM_* & Surf_GLOW_* Nodes
  {
    for (const [sideTag, sideSign] of [
      ['R', 1],
      ['L', -1],
    ]) {
      const gTeamSh = new PrimitiveGeom(mats.Surf_TEAM);
      const shPoly = [
        [-0.24, -0.11],
        [0.24, -0.09],
        [0.18, 0.11],
        [-0.20, 0.12],
      ];
      gTeamSh.addOrientedShield(
        [0.16, 0.36, sideSign * 0.64],
        vNorm([0.12, 0.72, sideSign * 0.68]),
        [-0.98, 0.12, 0.0],
        shPoly,
        0.045,
        0.84,
        0.012
      );
      const tsMesh = scene.addMesh(`Surf_TEAM_ThoraxCrest${sideTag}`, [gTeamSh]);
      scene.addNode({
        name: `Surf_TEAM_ThoraxCrest${sideTag}`,
        meshIndex: tsMesh,
        parentIndex: thoraxIdx,
      });
    }

    const gGlowSpiracles = new PrimitiveGeom(mats.Surf_GLOW);
    for (const sideSign of [-1, 1]) {
      for (const sx of [0.36, -0.14]) {
        gGlowSpiracles.addFacetedCrystal({
          center: [sx, 0.14, sideSign * 0.69],
          radii: [0.065, 0.048, 0.045],
          sectors: 6,
          stacks: 3,
        });
      }
    }
    const gsMesh = scene.addMesh('Surf_GLOW_ThoraxSpiracles', [gGlowSpiracles]);
    scene.addNode({
      name: 'Surf_GLOW_ThoraxSpiracles',
      meshIndex: gsMesh,
      parentIndex: thoraxIdx,
    });
  }

  // -------------------------------------------------------------------------
  // 2. Horned Ravager Head, Flared Cheek Frills, Oral Acid Gullet & 'Muzzle'
  //    ('Head' at [0.86, 0.04, 0] -> world [0.86, 1.36, 0])
  // -------------------------------------------------------------------------
  const headLocal = [0.86, 0.04, 0.0];
  const gHdChitin = new PrimitiveGeom(mats.Mat_ChitinBody);
  const gHdRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
  const gHdDark = new PrimitiveGeom(mats.Mat_ChitinDark);
  const gHdBone = new PrimitiveGeom(mats.Mat_BoneSpur);
  const gHdGullet = new PrimitiveGeom(mats.Mat_CausticOrangeCore);
  const gHdGulletCore = new PrimitiveGeom(mats.Mat_CausticOrangeBright);

  // Armored sloped Ravager cranial shield & lower jaw cradle
  gHdChitin.addLoft(
    [
      makeRectChamferRing(0.22, 0.44, 0.09, -0.16, 0.10, 0),
      makeRectChamferRing(0.36, 0.50, 0.11, 0.08, 0.24, 0),
      makeRectChamferRing(0.32, 0.36, 0.09, 0.26, 0.20, 0),
      makeRectChamferRing(0.16, 0.20, 0.05, 0.34, 0.06, 0),
    ],
    [[0.10, -0.16, 0], [0.24, 0.08, 0], [0.20, 0.26, 0], [0.06, 0.34, 0]],
    true,
    true
  );

  // Swept-wide Ravager Lateral Cheek-Frill Horns (distinctive triangular Ravager head silhouette!)
  for (const side of [-1, 1]) {
    gHdRidge.addTubeAlongSpine(
      [
        { pos: [0.16, 0.08, side * 0.38], rx: 0.13, ry: 0.075 },
        { pos: [0.02, 0.20, side * 0.64], rx: 0.095, ry: 0.055 },
        { pos: [-0.18, 0.32, side * 0.80], rx: 0.024, ry: 0.018 },
      ],
      5,
      true,
      true
    );
    // Secondary forward brow horn
    gHdBone.addTubeAlongSpine(
      [
        { pos: [0.46, 0.14, side * 0.24], rx: 0.055, ry: 0.045 },
        { pos: [0.74, 0.20, side * 0.28], rx: 0.016, ry: 0.014 },
      ],
      5,
      true,
      true
    );
  }

  // Forward-jutting armored rostrum bayonet spear reaching exact world X = +1.8750!
  // Head world X = 0.86 -> local X = 1.0150 gives exact world X = 1.8750 at Z = 0!
  gHdRidge.addTubeAlongSpine(
    [
      { pos: [0.36, 0.16, 0.0], rx: 0.095, ry: 0.065 },
      { pos: [0.70, 0.10, 0.0], rx: 0.062, ry: 0.042 },
    ],
    5,
    true,
    false
  );
  gHdBone.addTubeAlongSpine(
    [
      { pos: [0.68, 0.10, 0.0], rx: 0.058, ry: 0.038 },
      { pos: [1.0150, 0.03, 0.0], rx: 0.001, ry: 0.001 },
    ],
    5,
    true,
    false
  );

  // Dark recessed oral maw throat + glowing molten-orange caustic spit gland inside mouth
  gHdDark.addChamferBox({
    center: [0.50, -0.10, 0.0],
    size: [0.28, 0.20, 0.38],
    topScale: [0.86, 0.86],
  });
  gHdGullet.addSculptedLobe({
    center: [0.60, -0.10, 0.0],
    radii: [0.15, 0.10, 0.14],
    sectors: 8,
    stacks: 4,
  });
  gHdGulletCore.addFacetedCrystal({
    center: [0.70, -0.10, 0.0],
    radii: [0.09, 0.065, 0.08],
    sectors: 6,
    stacks: 4,
  });

  const headMesh = scene.addMesh('Head_Mesh', [
    gHdChitin,
    gHdRidge,
    gHdDark,
    gHdBone,
    gHdGullet,
    gHdGulletCore,
  ]);
  const headIdx = scene.addNode({
    name: 'Head',
    meshIndex: headMesh,
    translation: headLocal,
    parentIndex: thoraxIdx,
  });

  // Head Surf_TEAM_BrowChevron & Surf_GLOW_Eyes
  {
    const gBrowTeam = new PrimitiveGeom(mats.Surf_TEAM);
    const bPoly = [
      [-0.22, 0.06],
      [0.00, -0.16],
      [0.22, 0.06],
      [0.14, 0.14],
      [0.00, -0.02],
      [-0.14, 0.14],
    ];
    gBrowTeam.addOrientedShield(
      [0.24, 0.30, 0.0],
      vNorm([0.48, 0.88, 0.0]),
      [-0.88, 0.48, 0.0],
      bPoly,
      0.038,
      0.86,
      0.01
    );
    const btMesh = scene.addMesh('Surf_TEAM_BrowChevron', [gBrowTeam]);
    scene.addNode({ name: 'Surf_TEAM_BrowChevron', meshIndex: btMesh, parentIndex: headIdx });

    const gEyes = new PrimitiveGeom(mats.Surf_GLOW);
    for (const side of [-1, 1]) {
      // Primary compound hunter eye + secondary lateral ocellus
      gEyes.addFacetedCrystal({
        center: [0.54, 0.08, side * 0.22],
        radii: [0.075, 0.055, 0.055],
        sectors: 6,
        stacks: 4,
      });
      gEyes.addFacetedCrystal({
        center: [0.42, 0.14, side * 0.34],
        radii: [0.055, 0.042, 0.042],
        sectors: 6,
        stacks: 3,
      });
    }
    const eyeMesh = scene.addMesh('Surf_GLOW_Eyes', [gEyes]);
    scene.addNode({ name: 'Surf_GLOW_Eyes', meshIndex: eyeMesh, parentIndex: headIdx });
  }

  // Articulated Flared Armored Mandible-Tusks ('Mandible_R' & 'Mandible_L')
  const mandibleNodes = {};
  for (const [sideTag, sideSign] of [
    ['R', 1],
    ['L', -1],
  ]) {
    const gMdChitin = new PrimitiveGeom(mats.Mat_ChitinBody);
    const gMdRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
    const gMdBone = new PrimitiveGeom(mats.Mat_BoneSpur);

    // Flared outer chitin mandible shield
    gMdChitin.addFlaredLimbBlade({
      pStart: [0.0, 0.0, 0.0],
      pEnd: [0.36, -0.06, -sideSign * 0.08],
      flareDir: [0.0, -0.15, sideSign * 1.0],
      thickness: 0.11,
      backWidth: 0.05,
      flareStart: 0.06,
      flarePeak: 0.18,
      flareSub: 0.12,
      flareEnd: 0.04,
    });
    gMdRidge.addTubeAlongSpine(
      [
        { pos: [0.02, 0.02, sideSign * 0.06], rx: 0.055, ry: 0.042 },
        { pos: [0.28, -0.02, sideSign * 0.09], rx: 0.032, ry: 0.024 },
      ],
      5,
      true,
      true
    );
    // Inward-hooked calcified bone pincer tusk
    gMdBone.addTubeAlongSpine(
      [
        { pos: [0.28, -0.04, -sideSign * 0.04], rx: 0.052, ry: 0.040 },
        { pos: [0.46, -0.07, -sideSign * 0.14], rx: 0.028, ry: 0.022 },
        { pos: [0.55, -0.08, -sideSign * 0.19], rx: 0.008, ry: 0.008 },
      ],
      5,
      true,
      true
    );

    const mdMesh = scene.addMesh(`Mandible_${sideTag}_Mesh`, [gMdChitin, gMdRidge, gMdBone]);
    mandibleNodes[sideTag] = scene.addNode({
      name: `Mandible_${sideTag}`,
      meshIndex: mdMesh,
      translation: [0.44, -0.10, sideSign * 0.28],
      parentIndex: headIdx,
    });
  }

  // Required 'Muzzle' anchor right at forward +X oral acid-bolt firing mouth!
  // World rest position: [0.86 + 0.88, 1.36 - 0.10, 0.0] = [1.74, 1.26, 0.0]
  scene.addNode({
    name: 'Muzzle',
    translation: [0.88, -0.10, 0.0],
    parentIndex: headIdx,
  });

  // -------------------------------------------------------------------------
  // 3. Readable Arcing Abdomen, Orange-Green Dorsal Caustic Sac & Mortar Hood
  //    ('AbdomenArch' -> 'DorsalSac' + 'DorsalMortar' -> 'BileOrigin')
  // -------------------------------------------------------------------------
  const abdomenLocal = [-0.42, 0.18, 0.0]; // world [-0.42, 1.50, 0.0]
  const gAbChitin = new PrimitiveGeom(mats.Mat_ChitinBody);
  const gAbRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
  const gAbDark = new PrimitiveGeom(mats.Mat_ChitinDark);
  const gAbBone = new PrimitiveGeom(mats.Mat_BoneSpur);
  const gAbWarm = new PrimitiveGeom(mats.Mat_WarmMembrane);

  // Sweeping C-curved ventral/lateral chitin artillery cradle arching rearward & high upward!
  const cradleSpine = [
    { pos: [0.12, -0.12, 0.0], rx: 0.48, ry: 0.24 },
    { pos: [-0.36, -0.10, 0.0], rx: 0.62, ry: 0.28 },
    { pos: [-0.86, 0.06, 0.0], rx: 0.56, ry: 0.26 },
    { pos: [-1.22, 0.28, 0.0], rx: 0.36, ry: 0.20 },
  ];
  gAbDark.addTubeAlongSpine(cradleSpine, 8, true, true, [0, 1, 0]);
  gAbWarm.addSculptedLobe({
    center: [-0.52, 0.14, 0.0],
    radii: [0.76, 0.30, 0.64],
    rotDeg: [0, 0, -18],
    sectors: 10,
    stacks: 5,
  });

  // Rear counterweight chitin keel spur reaching exact world X = -1.8750!
  // AbdomenArch world X = -0.42 -> local X = -1.4550 gives exact world X = -1.8750 at Z = 0!
  gAbChitin.addTubeAlongSpine(
    [
      { pos: [-1.06, 0.22, 0.0], rx: 0.26, ry: 0.18 },
      { pos: [-1.30, 0.28, 0.0], rx: 0.12, ry: 0.09 },
    ],
    6,
    true,
    false
  );
  gAbBone.addTubeAlongSpine(
    [
      { pos: [-1.28, 0.28, 0.0], rx: 0.10, ry: 0.075 },
      { pos: [-1.4550, 0.34, 0.0], rx: 0.001, ry: 0.001 },
    ],
    5,
    true,
    false
  );

  // 3 Ribbed Chitin Saddle-Straps & Flared Lateral Spines clasping the swollen caustic sac!
  const sacRibs = [
    { x: -0.06, yBot: 0.02, yMid: 0.48, zWide: 0.78, thick: 0.072 },
    { x: -0.52, yBot: 0.06, yMid: 0.62, zWide: 0.86, thick: 0.078 },
    { x: -0.98, yBot: 0.18, yMid: 0.66, zWide: 0.72, thick: 0.068 },
  ];
  for (const rb of sacRibs) {
    for (const side of [-1, 1]) {
      gAbDark.addTubeAlongSpine(
        [
          { pos: [rb.x, rb.yBot, side * (rb.zWide * 0.55)], rx: rb.thick, ry: rb.thick * 0.8 },
          { pos: [rb.x - 0.04, rb.yMid, side * rb.zWide], rx: rb.thick * 0.92, ry: rb.thick * 0.75 },
          { pos: [rb.x + 0.04, rb.yMid + 0.34, side * (rb.zWide * 0.62)], rx: rb.thick * 0.72, ry: rb.thick * 0.6 },
        ],
        6,
        true,
        true,
        [1, 0, 0]
      );
      // Flared lavender chitin spine spur jutting off each saddle rib!
      gAbRidge.addTubeAlongSpine(
        [
          { pos: [rb.x - 0.04, rb.yMid + 0.08, side * (rb.zWide * 0.94)], rx: 0.065, ry: 0.05 },
          { pos: [rb.x - 0.20, rb.yMid + 0.28, side * (rb.zWide * 1.12)], rx: 0.015, ry: 0.015 },
        ],
        5,
        true,
        true
      );
    }
  }

  const abdomenMesh = scene.addMesh('AbdomenArch_Mesh', [
    gAbChitin,
    gAbRidge,
    gAbDark,
    gAbBone,
    gAbWarm,
  ]);
  const abdomenIdx = scene.addNode({
    name: 'AbdomenArch',
    meshIndex: abdomenMesh,
    translation: abdomenLocal,
    parentIndex: thoraxIdx,
  });

  // 3B. Swollen Multi-Zone ORANGE-GREEN Dorsal Caustic Sac ('DorsalSac' under 'AbdomenArch')
  //     Local [-0.24, 0.56, 0.0] -> world [-0.66, 2.06, 0.0]
  const sacLocal = [-0.24, 0.56, 0.0];
  const gSacGreen = new PrimitiveGeom(mats.Mat_CausticGreenBase);
  const gSacAmber = new PrimitiveGeom(mats.Mat_CausticAmberMid);
  const gSacOrange = new PrimitiveGeom(mats.Mat_CausticOrangeCore);
  const gSacBright = new PrimitiveGeom(mats.Mat_CausticOrangeBright);
  const gSacMembrane = new PrimitiveGeom(mats.Mat_CausticMembrane);

  // Lower & Posterior Virulent Bile-Green Reservoir Lobes (shared Bile Crawler heritage!)
  gSacGreen.addSculptedLobe({
    center: [-0.24, -0.14, 0.0],
    radii: [0.78, 0.44, 0.76],
    rotDeg: [0, 0, -16],
    sectors: 12,
    stacks: 6,
    ribCount: 6,
    ribAmp: 0.05,
  });
  for (const side of [-1, 1]) {
    gSacGreen.addSculptedLobe({
      center: [-0.14, -0.06, side * 0.48],
      radii: [0.56, 0.36, 0.38],
      rotDeg: [side * 12, 0, -14],
      sectors: 10,
      stacks: 5,
    });
  }

  // Mid-Dorsal Superheated Chartreuse-Amber Reaction Chambers
  gSacAmber.addSculptedLobe({
    center: [-0.04, 0.24, 0.0],
    radii: [0.68, 0.44, 0.64],
    rotDeg: [0, 0, -22],
    sectors: 12,
    stacks: 6,
    ribCount: 6,
    ribAmp: 0.045,
  });
  for (const side of [-1, 1]) {
    gSacAmber.addSculptedLobe({
      center: [0.06, 0.28, side * 0.38],
      radii: [0.44, 0.32, 0.32],
      sectors: 9,
      stacks: 5,
    });
  }

  // Upper Dorsal Blazing Molten-Orange Artillery Blister Crown & Translucent Pressure Dome!
  gSacOrange.addSculptedLobe({
    center: [0.16, 0.56, 0.0],
    radii: [0.54, 0.40, 0.50],
    rotDeg: [0, 0, -28],
    sectors: 12,
    stacks: 6,
    ribCount: 5,
    ribAmp: 0.04,
  });
  for (const side of [-1, 1]) {
    gSacOrange.addSculptedLobe({
      center: [-0.16, 0.48, side * 0.26],
      radii: [0.30, 0.26, 0.26],
      sectors: 8,
      stacks: 5,
    });
  }
  gSacBright.addSculptedLobe({
    center: [0.24, 0.72, 0.0],
    radii: [0.32, 0.24, 0.30],
    rotDeg: [0, 0, -25],
    sectors: 10,
    stacks: 5,
  });
  gSacMembrane.addSculptedLobe({
    center: [0.16, 0.60, 0.0],
    radii: [0.58, 0.44, 0.54],
    rotDeg: [0, 0, -28],
    sectors: 12,
    stacks: 5,
  });

  const sacMesh = scene.addMesh('DorsalSac_Mesh', [
    gSacGreen,
    gSacAmber,
    gSacOrange,
    gSacBright,
    gSacMembrane,
  ]);
  const dorsalSacIdx = scene.addNode({
    name: 'DorsalSac',
    meshIndex: sacMesh,
    translation: sacLocal,
    parentIndex: abdomenIdx,
  });

  // 3C. Arcing Dorsal Artillery Mortar Hood & Nozzle ('DorsalMortar' under 'AbdomenArch')
  //     Local [0.38, 1.12, 0.0] -> world [-0.04, 2.62, 0.0]
  //     Curves forward & skyward (+46 deg elevation toward +X/+Y!) to exact world max.y = 3.3000!
  const mortarLocal = [0.38, 1.12, 0.0];
  const gMtChitin = new PrimitiveGeom(mats.Mat_ChitinBody);
  const gMtRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
  const gMtDark = new PrimitiveGeom(mats.Mat_ChitinDark);
  const gMtBone = new PrimitiveGeom(mats.Mat_BoneSpur);
  const gMtOrange = new PrimitiveGeom(mats.Mat_CausticOrangeCore);
  const gMtBright = new PrimitiveGeom(mats.Mat_CausticOrangeBright);

  // Heavy arched Ravager dorsal artillery cowl curving forward over thorax!
  gMtChitin.addTubeAlongSpine(
    [
      { pos: [-0.22, -0.14, 0.0], rx: 0.46, ry: 0.36 },
      { pos: [0.02, 0.14, 0.0], rx: 0.44, ry: 0.34 },
      { pos: [0.28, 0.34, 0.0], rx: 0.38, ry: 0.30 },
      { pos: [0.46, 0.46, 0.0], rx: 0.32, ry: 0.26 },
    ],
    8,
    true,
    true,
    [0, 1, 0]
  );

  // Flared Lateral Artillery Cowl Wings & Sighting Horns
  for (const side of [-1, 1]) {
    gMtRidge.addFlaredLimbBlade({
      pStart: [-0.14, 0.06, side * 0.26],
      pEnd: [0.42, 0.44, side * 0.24],
      flareDir: [-0.25, 0.55, side * 0.80],
      thickness: 0.12,
      backWidth: 0.06,
      flareStart: 0.08,
      flarePeak: 0.28,
      flareSub: 0.20,
      flareEnd: 0.06,
    });
    // Flanking dorsal hood horns (below 3.30 apex: local Y = 0.61 -> world Y = 3.23)
    gMtBone.addTubeAlongSpine(
      [
        { pos: [0.06, 0.36, side * 0.24], rx: 0.062, ry: 0.052 },
        { pos: [0.26, 0.52, side * 0.30], rx: 0.034, ry: 0.028 },
        { pos: [0.40, 0.61, side * 0.32], rx: 0.010, ry: 0.010 },
      ],
      5,
      true,
      true
    );
  }

  // Primary Swept Dorsal Artillery Crown Crest reaching EXACT world Y = 3.3000!
  // DorsalMortar world Y = 2.6200 -> local Y = 0.6800 gives exact world Y = 3.3000!
  gMtRidge.addTubeAlongSpine(
    [
      { pos: [-0.16, 0.22, 0.0], rx: 0.11, ry: 0.09 },
      { pos: [0.02, 0.48, 0.0], rx: 0.075, ry: 0.065 },
    ],
    6,
    true,
    false
  );
  gMtBone.addTubeAlongSpine(
    [
      { pos: [0.00, 0.46, 0.0], rx: 0.068, ry: 0.058 },
      { pos: [0.16, 0.6800, 0.0], rx: 0.001, ry: 0.001 },
    ],
    5,
    true,
    false
  );

  // Open Upward-and-Forward (+45 deg) Caustic Mortar Vent Throat & Glowing Orange Core!
  gMtDark.addTubeAlongSpine(
    [
      { pos: [0.34, 0.36, 0.0], rx: 0.27, ry: 0.24 },
      { pos: [0.52, 0.50, 0.0], rx: 0.24, ry: 0.21 },
    ],
    8,
    true,
    true
  );
  gMtOrange.addSculptedLobe({
    center: [0.48, 0.46, 0.0],
    radii: [0.21, 0.18, 0.21],
    rotDeg: [0, 0, 42],
    sectors: 8,
    stacks: 4,
  });
  gMtBright.addFacetedCrystal({
    center: [0.55, 0.52, 0.0],
    radii: [0.13, 0.11, 0.13],
    rotDeg: [0, 0, 42],
    sectors: 8,
    stacks: 4,
  });

  // 4 Calcified Bone Mortar Nozzle Valve Teeth framing the glowing orange artillery mouth
  for (const [dx, dy, dz] of [
    [0.58, 0.36, 0.0],
    [0.38, 0.60, 0.0],
    [0.48, 0.48, 0.24],
    [0.48, 0.48, -0.24],
  ]) {
    gMtBone.addTubeAlongSpine(
      [
        { pos: [dx, dy, dz], rx: 0.042, ry: 0.036 },
        { pos: [dx + 0.11, dy + 0.09, dz * 1.12], rx: 0.010, ry: 0.010 },
      ],
      5,
      true,
      true
    );
  }

  const mortarMesh = scene.addMesh('DorsalMortar_Mesh', [
    gMtChitin,
    gMtRidge,
    gMtDark,
    gMtBone,
    gMtOrange,
    gMtBright,
  ]);
  const dorsalMortarIdx = scene.addNode({
    name: 'DorsalMortar',
    meshIndex: mortarMesh,
    translation: mortarLocal,
    parentIndex: abdomenIdx,
  });

  // Surf_TEAM_MortarCollarR/L on upper dorsal artillery hood (super readable from RTS zoom!)
  for (const [sideTag, sideSign] of [
    ['R', 1],
    ['L', -1],
  ]) {
    const gTeamMt = new PrimitiveGeom(mats.Surf_TEAM);
    const mtPoly = [
      [-0.20, -0.09],
      [0.20, -0.08],
      [0.16, 0.09],
      [-0.16, 0.10],
    ];
    gTeamMt.addOrientedShield(
      [0.10, 0.28, sideSign * 0.42],
      vNorm([0.18, 0.64, sideSign * 0.75]),
      [-0.95, 0.26, 0.0],
      mtPoly,
      0.038,
      0.86,
      0.01
    );
    const tmMesh = scene.addMesh(`Surf_TEAM_MortarCollar${sideTag}`, [gTeamMt]);
    scene.addNode({
      name: `Surf_TEAM_MortarCollar${sideTag}`,
      meshIndex: tmMesh,
      parentIndex: dorsalMortarIdx,
    });
  }

  // Required 'BileOrigin' anchor right at the arcing dorsal caustic mortar mouth!
  // World rest position: [-0.04 + 0.60, 2.62 + 0.56, 0.0] = [0.56, 3.18, 0.0]
  scene.addNode({
    name: 'BileOrigin',
    translation: [0.60, 0.56, 0.0],
    parentIndex: dorsalMortarIdx,
  });

  // -------------------------------------------------------------------------
  // 4. Eight Tall Flared Armored Limbs (4 Pairs: 'Leg_0..3_R/L' -> 'Shin_0..3_R/L')
  //    Grounded cleanly at exact world Y = 0.0000 inside radius = 1.8750!
  //    Pair 1 sets exact lateral Z = +/-1.8750 at X = 0.0000!
  // -------------------------------------------------------------------------
  const legPairConfigs = [
    {
      // Pair 0: Broad Flared Front Ravager Siege-Brace Limbs
      idx: 0,
      hipX: 0.62,
      hipY: -0.10, // world Y = 1.22
      hipZ: 0.50,
      kneeRel: [0.42, 0.66, 0.58], // world [1.04, 1.88, +-1.08]
      footWorld: [1.26, 0.0000, 1.32], // hypot = 1.825 <= 1.875
      femurFlare: 0.24,
      shinFlare: 0.36, // extra-wide Ravager fore-shield blade!
      shinThick: 0.16,
      hasTeamStripe: true,
    },
    {
      // Pair 1: Anterior-Mid Wide Limbs — exact lateral span Z = +-1.8750 at X = 0.0000!
      idx: 1,
      hipX: 0.14,
      hipY: -0.08, // world Y = 1.24
      hipZ: 0.62,
      kneeRel: [-0.06, 0.72, 0.72], // world [0.08, 1.96, +-1.34]
      footWorld: [0.0000, 0.0000, 1.8750], // exact +-1.8750 Z & hypot = 1.8750!
      femurFlare: 0.22,
      shinFlare: 0.30,
      shinThick: 0.14,
      hasTeamStripe: false,
    },
    {
      // Pair 2: Posterior-Mid Tall Artillery Support Limbs
      idx: 2,
      hipX: -0.30,
      hipY: -0.08, // world Y = 1.24
      hipZ: 0.60,
      kneeRel: [-0.30, 0.70, 0.68], // world [-0.60, 1.94, +-1.28]
      footWorld: [-0.80, 0.0000, 1.64], // hypot = 1.825 <= 1.875
      femurFlare: 0.21,
      shinFlare: 0.28,
      shinThick: 0.14,
      hasTeamStripe: false,
    },
    {
      // Pair 3: Rear Siege-Anchor Limbs bracing the heavy caustic sac
      idx: 3,
      hipX: -0.70,
      hipY: -0.10, // world Y = 1.22
      hipZ: 0.48,
      kneeRel: [-0.46, 0.64, 0.56], // world [-1.16, 1.86, +-1.04]
      footWorld: [-1.38, 0.0000, 1.20], // hypot = 1.829 <= 1.875
      femurFlare: 0.22,
      shinFlare: 0.30,
      shinThick: 0.15,
      hasTeamStripe: false,
    },
  ];

  const legs = []; // { idx, sideTag, sideSign, hipIdx, shinIdx, hipWorldY, reachZ, hipX }

  for (const cfg of legPairConfigs) {
    for (const [sideTag, sideSign] of [
      ['R', 1],
      ['L', -1],
    ]) {
      const hipLocal = [cfg.hipX, cfg.hipY, sideSign * cfg.hipZ];
      const hipWorld = vAdd(thoraxRest, hipLocal);
      const kneeLocal = [cfg.kneeRel[0], cfg.kneeRel[1], sideSign * cfg.kneeRel[2]];
      const kneeWorld = vAdd(hipWorld, kneeLocal);
      const footWorld = [cfg.footWorld[0], 0.0000, sideSign * cfg.footWorld[2]];
      const footInShin = vSub(footWorld, kneeWorld);
      const groundInShin = -kneeWorld[1]; // exact local Y corresponding to world Y = 0.0000

      // --- Upper Limb (Coxa + High-Crested Flared Femur) ---
      const gFemDark = new PrimitiveGeom(mats.Mat_ChitinDark);
      const gFemChitin = new PrimitiveGeom(mats.Mat_ChitinBody);
      const gFemRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
      const gFemBone = new PrimitiveGeom(mats.Mat_BoneSpur);

      // Muscular dark joint socket + femur core
      gFemDark.addTubeAlongSpine(
        [
          { pos: [0, 0, 0], rx: 0.12, ry: 0.12 },
          { pos: kneeLocal, rx: 0.10, ry: 0.10 },
        ],
        6,
        true,
        true
      );
      // Flared dorsal femur carapace blade rising to jagged knee peak
      gFemChitin.addFlaredLimbBlade({
        pStart: vScale(kneeLocal, 0.12),
        pEnd: kneeLocal,
        flareDir: [0.0, 1.0, sideSign * 0.25],
        thickness: 0.15,
        backWidth: 0.08,
        flareStart: 0.10,
        flarePeak: cfg.femurFlare,
        flareSub: cfg.femurFlare * 0.82,
        flareEnd: 0.10,
      });
      // Lavender-plum dorsal femur ridge + calcified bone knee horn!
      gFemRidge.addTubeAlongSpine(
        [
          { pos: vAdd(vScale(kneeLocal, 0.25), [0, 0.10, 0]), rx: 0.065, ry: 0.05 },
          { pos: vAdd(kneeLocal, [0, 0.12, 0]), rx: 0.055, ry: 0.045 },
        ],
        5,
        true,
        true
      );
      gFemBone.addTubeAlongSpine(
        [
          { pos: vAdd(kneeLocal, [0, 0.06, sideSign * 0.04]), rx: 0.065, ry: 0.055 },
          { pos: vAdd(kneeLocal, [cfg.kneeRel[0] * 0.18, 0.28, sideSign * 0.14]), rx: 0.014, ry: 0.014 },
        ],
        5,
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
        parentIndex: thoraxIdx,
      });

      // --- Lower Limb (Broadly Flared Armored Tibia Shield + Grounded Bone Claw) ---
      const gShnDark = new PrimitiveGeom(mats.Mat_ChitinDark);
      const gShnChitin = new PrimitiveGeom(mats.Mat_ChitinBody);
      const gShnRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
      const gShnBone = new PrimitiveGeom(mats.Mat_BoneSpur);

      const ankleLocal = [
        footInShin[0] * 0.90,
        footInShin[1] + 0.22,
        footInShin[2] * 0.88,
      ];

      // Inner dark chitin tibia shaft
      gShnDark.addTubeAlongSpine(
        [
          { pos: [0, 0, 0], rx: 0.095, ry: 0.095 },
          { pos: ankleLocal, rx: 0.062, ry: 0.062 },
        ],
        6,
        true,
        true,
        [1, 0, 0],
        groundInShin
      );

      // Outward flare direction kept strictly inside horizontal radius 1.875!
      // For Pair 1 (foot at Z = +-1.8750), flare leans upward/forward so Z never exceeds +-1.8750!
      const flareVec =
        cfg.idx === 1
          ? [0.35, 0.65, sideSign * 0.18]
          : [cfg.hipX >= 0 ? 0.55 : -0.45, 0.42, sideSign * 0.55];

      gShnChitin.addFlaredLimbBlade({
        pStart: [0, 0.04, 0],
        pEnd: ankleLocal,
        flareDir: flareVec,
        thickness: cfg.shinThick,
        backWidth: 0.075,
        flareStart: 0.12,
        flarePeak: cfg.shinFlare,
        flareSub: cfg.shinFlare * 0.66,
        flareEnd: 0.05,
        minYClamp: groundInShin,
      });

      // Raised lighter-chitin bevel rim along upper outer tibia shield
      const rimStart = vAdd([0, 0.02, 0], vScale(vNorm(flareVec), 0.10));
      const rimPeak = vAdd(
        vLerp([0, 0.04, 0], ankleLocal, 0.30),
        vScale(vNorm(flareVec), cfg.shinFlare * 0.92)
      );
      const rimLow = vAdd(
        vLerp([0, 0.04, 0], ankleLocal, 0.72),
        vScale(vNorm(flareVec), cfg.shinFlare * 0.45)
      );
      gShnRidge.addTubeAlongSpine(
        [
          { pos: rimStart, rx: 0.045, ry: 0.035 },
          { pos: rimPeak, rx: 0.052, ry: 0.038 },
          { pos: rimLow, rx: 0.030, ry: 0.024 },
        ],
        5,
        true,
        true,
        [1, 0, 0],
        groundInShin
      );

      // Grounded calcified bone tarsal claw planted cleanly at exact world Y = 0.0000!
      // For Pair 1, tapered to a razor point at exact footInShin so |Z| never exceeds 1.8750!
      gShnBone.addTubeAlongSpine(
        [
          { pos: ankleLocal, rx: 0.068, ry: 0.062 },
          {
            pos: [
              footInShin[0] * 0.97,
              groundInShin + 0.055,
              footInShin[2] * (cfg.idx === 1 ? 0.965 : 0.98),
            ],
            rx: 0.036,
            ry: 0.034,
          },
          {
            pos: [footInShin[0], groundInShin, footInShin[2]],
            rx: cfg.idx === 1 ? 0.0005 : 0.012,
            ry: cfg.idx === 1 ? 0.0005 : 0.008,
          },
        ],
        5,
        true,
        true,
        [1, 0, 0],
        groundInShin
      );

      const shinMesh = scene.addMesh(`Shin_${cfg.idx}_${sideTag}_Mesh`, [
        gShnDark,
        gShnChitin,
        gShnRidge,
        gShnBone,
      ]);
      const shinIdx = scene.addNode({
        name: `Shin_${cfg.idx}_${sideTag}`,
        meshIndex: shinMesh,
        translation: kneeLocal,
        parentIndex: hipIdx,
      });

      if (cfg.hasTeamStripe) {
        const gLegTeam = new PrimitiveGeom(mats.Surf_TEAM);
        const midShield = vLerp([0, 0.0, 0], ankleLocal, 0.34);
        gLegTeam.addChamferBox({
          center: vAdd(midShield, [0.06, 0.02, sideSign * 0.09]),
          size: [0.12, 0.34, 0.06],
          rotDeg: [sideSign * 14, 0, -12],
          topScale: [0.82, 0.86],
        });
        const ltMesh = scene.addMesh(`Surf_TEAM_ForeLeg${sideTag}`, [gLegTeam]);
        scene.addNode({
          name: `Surf_TEAM_ForeLeg${sideTag}`,
          meshIndex: ltMesh,
          parentIndex: shinIdx,
        });
      }

      legs.push({
        idx: cfg.idx,
        sideTag,
        sideSign,
        hipIdx,
        shinIdx,
        hipWorldY: hipWorld[1],
        reachZ: Math.abs(footWorld[2]) - Math.abs(hipWorld[2]),
        hipX: cfg.hipX,
        hipY: cfg.hipY,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 5. Rupture Crawler Baked Animations: 'idle', 'walk', 'attack', 'cast', 'death'
  //    Every clip resets primary animated nodes cleanly and keeps min.y >= 0.0!
  // -------------------------------------------------------------------------
  const idQ = quatFromEulerXYZ(0, 0, 0);
  const unitScale = [1, 1, 1];

  // Helper to build full leg reset/compensation tracks when ThoraxCore moves/pitches
  function buildGroundedLegTracks(times, thoraxTranslations, thoraxPitchDegs, extraPerLeg = null) {
    const outTracks = [];
    for (const lg of legs) {
      const hipRots = [];
      const shinRots = [];
      for (let k = 0; k < times.length; k++) {
        const dy = thoraxTranslations[k][1] - thoraxRest[1];
        const rzRad = (thoraxPitchDegs[k] * Math.PI) / 180;
        const pitchDeltaY = lg.hipX * Math.sin(rzRad) + lg.hipY * (Math.cos(rzRad) - 1.0);
        const totalDeltaHipY = dy + pitchDeltaY;
        const extra = extraPerLeg ? extraPerLeg(lg, k) : { lift: 0, yaw: 0, shinBend: 0 };
        const baseRoll = solveFootGroundedRollDeg(
          lg.hipWorldY,
          lg.reachZ,
          totalDeltaHipY,
          extra.lift
        );
        hipRots.push(quatFromEulerXYZ(-lg.sideSign * baseRoll, lg.sideSign * extra.yaw, 0));
        shinRots.push(quatFromEulerXYZ(lg.sideSign * (extra.shinBend || 0), 0, 0));
      }
      outTracks.push(
        { nodeIndex: lg.hipIdx, path: 'rotation', times, values: hipRots },
        { nodeIndex: lg.shinIdx, path: 'rotation', times, values: shinRots }
      );
    }
    return outTracks;
  }

  // 5A. 'idle' (2.20s seamless pressurized caustic-sac breathing & predatory scan)
  const idleT = [0.0, 0.55, 1.10, 1.65, 2.20];
  const idleThoraxPos = [
    [0.0, 1.32, 0.0],
    [0.0, 1.355, 0.0],
    [0.0, 1.32, 0.0],
    [0.0, 1.30, 0.0],
    [0.0, 1.32, 0.0],
  ];
  const idlePitch = [0, 1.0, 0, -0.8, 0];
  scene.addAnimation('idle', [
    {
      nodeIndex: thoraxIdx,
      path: 'translation',
      times: idleT,
      values: idleThoraxPos,
    },
    {
      nodeIndex: thoraxIdx,
      path: 'rotation',
      times: idleT,
      values: idlePitch.map((rz, k) =>
        quatFromEulerXYZ(0, k === 1 ? 1.2 : k === 3 ? -1.2 : 0, rz)
      ),
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: idleT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 4.5, -2.0),
        idQ,
        quatFromEulerXYZ(0, -4.5, 1.8),
        idQ,
      ],
    },
    {
      nodeIndex: mandibleNodes.R,
      path: 'rotation',
      times: idleT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 6, 0),
        idQ,
        quatFromEulerXYZ(0, -3, 0),
        idQ,
      ],
    },
    {
      nodeIndex: mandibleNodes.L,
      path: 'rotation',
      times: idleT,
      values: [
        idQ,
        quatFromEulerXYZ(0, -6, 0),
        idQ,
        quatFromEulerXYZ(0, 3, 0),
        idQ,
      ],
    },
    {
      nodeIndex: abdomenIdx,
      path: 'rotation',
      times: idleT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, -2.5),
        idQ,
        quatFromEulerXYZ(0, 0, 2.0),
        idQ,
      ],
    },
    {
      nodeIndex: dorsalSacIdx,
      path: 'scale',
      times: idleT,
      values: [
        unitScale,
        [1.048, 1.036, 1.052],
        unitScale,
        [0.975, 0.982, 0.975],
        unitScale,
      ],
    },
    {
      nodeIndex: dorsalMortarIdx,
      path: 'rotation',
      times: idleT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, 3.0),
        idQ,
        quatFromEulerXYZ(0, 0, -2.0),
        idQ,
      ],
    },
    ...buildGroundedLegTracks(idleT, idleThoraxPos, idlePitch),
  ]);

  // 5B. 'walk' (0.96s seamless 8-legged alternating tetrapod Ravager scuttle!)
  //     Group A: (idx + (sideSign > 0 ? 0 : 1)) % 2 === 0 -> {0R, 1L, 2R, 3L}
  //     Group B: {0L, 1R, 2L, 3R}
  //     Uses pure Y-yaw on stance legs and upward X-roll lift on swing legs so min.y >= 0.0000 always!
  const walkT = [0.0, 0.24, 0.48, 0.72, 0.96];
  const walkThoraxPos = [
    [0.0, 1.32, 0.0],
    [0.0, 1.36, -0.02],
    [0.0, 1.32, 0.0],
    [0.0, 1.36, 0.02],
    [0.0, 1.32, 0.0],
  ];
  const walkPitch = [0, 0, 0, 0, 0];
  scene.addAnimation('walk', [
    {
      nodeIndex: thoraxIdx,
      path: 'translation',
      times: walkT,
      values: walkThoraxPos,
    },
    {
      nodeIndex: thoraxIdx,
      path: 'rotation',
      times: walkT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 2.8, 0),
        idQ,
        quatFromEulerXYZ(0, -2.8, 0),
        idQ,
      ],
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: walkT,
      values: [
        idQ,
        quatFromEulerXYZ(0, -3.5, -2.0),
        idQ,
        quatFromEulerXYZ(0, 3.5, -2.0),
        idQ,
      ],
    },
    {
      nodeIndex: abdomenIdx,
      path: 'rotation',
      times: walkT,
      values: [
        idQ,
        quatFromEulerXYZ(2.5, -3.0, -2.0),
        idQ,
        quatFromEulerXYZ(-2.5, 3.0, -2.0),
        idQ,
      ],
    },
    {
      nodeIndex: dorsalSacIdx,
      path: 'scale',
      times: walkT,
      values: [
        unitScale,
        [1.03, 0.98, 1.03],
        unitScale,
        [1.03, 0.98, 1.03],
        unitScale,
      ],
    },
    {
      nodeIndex: dorsalMortarIdx,
      path: 'rotation',
      times: walkT,
      values: [idQ, idQ, idQ, idQ, idQ],
    },
    ...buildGroundedLegTracks(walkT, walkThoraxPos, walkPitch, (lg, k) => {
      const isGroupA = (lg.idx + (lg.sideSign > 0 ? 0 : 1)) % 2 === 0;
      // k=0: neutral; k=1: Group A lifts & swings forward (+13 deg), Group B planted & drives back (-11 deg)
      // k=2: neutral; k=3: Group B lifts & swings forward (+13 deg), Group A planted & drives back (-11 deg)
      if (k === 1) {
        return isGroupA
          ? { lift: 0.26, yaw: 13.5, shinBend: 8 }
          : { lift: 0.005, yaw: -11.5, shinBend: 0 };
      }
      if (k === 3) {
        return !isGroupA
          ? { lift: 0.26, yaw: 13.5, shinBend: 8 }
          : { lift: 0.005, yaw: -11.5, shinBend: 0 };
      }
      return { lift: 0.0, yaw: 0.0, shinBend: 0 };
    }),
  ]);

  // 5C. 'attack' (0.84s direct forward plasma-acid bolt spit from 'Muzzle' & recoil)
  const atkT = [0.0, 0.16, 0.28, 0.56, 0.84];
  const atkThoraxPos = [
    [0.0, 1.32, 0.0],
    [-0.10, 1.29, 0.0],
    [0.14, 1.34, 0.0],
    [-0.06, 1.31, 0.0],
    [0.0, 1.32, 0.0],
  ];
  const atkPitch = [0, 3.5, -5.0, 1.8, 0];
  scene.addAnimation('attack', [
    {
      nodeIndex: thoraxIdx,
      path: 'translation',
      times: atkT,
      values: atkThoraxPos,
    },
    {
      nodeIndex: thoraxIdx,
      path: 'rotation',
      times: atkT,
      values: atkPitch.map((rz) => quatFromEulerXYZ(0, 0, rz)),
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: atkT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, 10),
        quatFromEulerXYZ(0, 0, -12),
        quatFromEulerXYZ(0, 0, 4),
        idQ,
      ],
    },
    {
      nodeIndex: mandibleNodes.R,
      path: 'rotation',
      times: atkT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 22, 0),
        quatFromEulerXYZ(0, -10, 0),
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
        quatFromEulerXYZ(0, -22, 0),
        quatFromEulerXYZ(0, 10, 0),
        quatFromEulerXYZ(0, -6, 0),
        idQ,
      ],
    },
    {
      nodeIndex: abdomenIdx,
      path: 'rotation',
      times: atkT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, 5),
        quatFromEulerXYZ(0, 0, -8),
        quatFromEulerXYZ(0, 0, 2),
        idQ,
      ],
    },
    {
      nodeIndex: dorsalSacIdx,
      path: 'scale',
      times: atkT,
      values: [
        unitScale,
        [1.08, 1.06, 1.08],
        [0.92, 0.95, 0.92],
        [1.02, 1.01, 1.02],
        unitScale,
      ],
    },
    {
      nodeIndex: dorsalMortarIdx,
      path: 'rotation',
      times: atkT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, 4),
        quatFromEulerXYZ(0, 0, -6),
        quatFromEulerXYZ(0, 0, 2),
        idQ,
      ],
    },
    ...buildGroundedLegTracks(atkT, atkThoraxPos, atkPitch, (lg, k) => {
      if (lg.idx === 0 && k === 1) return { lift: 0.08, yaw: 8, shinBend: 4 };
      if (lg.idx === 0 && k === 2) return { lift: 0.01, yaw: -6, shinBend: 0 };
      return { lift: k === 0 || k === 4 ? 0 : 0.01, yaw: 0, shinBend: 0 };
    }),
  ]);

  // 5D. 'cast' (1.24s signature Ravager Corrosive Bile high-arcing artillery launch from 'BileOrigin'!)
  const castT = [0.0, 0.32, 0.52, 0.88, 1.24];
  const castThoraxPos = [
    [0.0, 1.32, 0.0],
    [-0.08, 1.20, 0.0], // deep artillery siege crouch & pressure build!
    [-0.14, 1.40, 0.0], // skyward mortar launch heave & recoil!
    [-0.04, 1.28, 0.0], // shock absorption settle
    [0.0, 1.32, 0.0],
  ];
  const castPitch = [0, -8.0, 9.0, -2.5, 0];
  scene.addAnimation('cast', [
    {
      nodeIndex: thoraxIdx,
      path: 'translation',
      times: castT,
      values: castThoraxPos,
    },
    {
      nodeIndex: thoraxIdx,
      path: 'rotation',
      times: castT,
      values: castPitch.map((rz) => quatFromEulerXYZ(0, 0, rz)),
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: castT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, -14), // tucks armored head shield down to brace!
        quatFromEulerXYZ(0, 0, 8),
        quatFromEulerXYZ(0, 0, -3),
        idQ,
      ],
    },
    {
      nodeIndex: mandibleNodes.R,
      path: 'rotation',
      times: castT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 16, 0),
        quatFromEulerXYZ(0, 26, 0),
        quatFromEulerXYZ(0, 6, 0),
        idQ,
      ],
    },
    {
      nodeIndex: mandibleNodes.L,
      path: 'rotation',
      times: castT,
      values: [
        idQ,
        quatFromEulerXYZ(0, -16, 0),
        quatFromEulerXYZ(0, -26, 0),
        quatFromEulerXYZ(0, -6, 0),
        idQ,
      ],
    },
    {
      nodeIndex: abdomenIdx,
      path: 'rotation',
      times: castT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, 10), // coils abdomen back
        quatFromEulerXYZ(0, 0, -18), // whips dorsal mortar forward & skyward into high launch arc!
        quatFromEulerXYZ(0, 0, 4),
        idQ,
      ],
    },
    {
      nodeIndex: dorsalSacIdx,
      path: 'scale',
      times: castT,
      values: [
        unitScale,
        [1.16, 1.14, 1.16], // massive volatile orange-green sac distension!
        [0.82, 0.86, 0.82], // violent artillery expulsion contraction!
        [1.04, 1.02, 1.04],
        unitScale,
      ],
    },
    {
      nodeIndex: dorsalMortarIdx,
      path: 'rotation',
      times: castT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, 12),
        quatFromEulerXYZ(0, 0, -14), // aims BileOrigin steeply forward-upward along ballistic arc!
        quatFromEulerXYZ(0, 0, 3),
        idQ,
      ],
    },
    ...buildGroundedLegTracks(castT, castThoraxPos, castPitch, (lg, k) => {
      // Front Ravager siege-shield limbs flare wide to anchor the artillery launch!
      if (lg.idx === 0 && k === 1) return { lift: 0.02, yaw: 14, shinBend: 0 };
      if (lg.idx === 0 && k === 2) return { lift: 0.14, yaw: 18, shinBend: 6 };
      return { lift: k === 0 || k === 4 ? 0 : 0.015, yaw: 0, shinBend: 0 };
    }),
  ]);

  // 5E. 'death' (1.28s caustic sac rupture convulsion & 8-leg splayed collapse onto ground Y >= 0!)
  const deathT = [0.0, 0.24, 0.64, 1.00, 1.28];
  const deathThoraxPos = [
    [0.0, 1.32, 0.0],
    [-0.06, 1.40, 0.0], // upward pain spasm
    [-0.10, 0.76, 0.02], // legs buckling outward
    [-0.14, 0.42, 0.03], // ventral sternum settles cleanly onto ground (0.42 - 0.38 = 0.04 >= 0!)
    [-0.14, 0.42, 0.03],
  ];
  const deathPitch = [0, 8.0, -5.0, -8.0, -8.0];
  scene.addAnimation('death', [
    {
      nodeIndex: thoraxIdx,
      path: 'translation',
      times: deathT,
      values: deathThoraxPos,
    },
    {
      nodeIndex: thoraxIdx,
      path: 'rotation',
      times: deathT,
      values: [
        idQ,
        quatFromEulerXYZ(3, -4, 8),
        quatFromEulerXYZ(5, -6, -5),
        quatFromEulerXYZ(6, -8, -8),
        quatFromEulerXYZ(6, -8, -8),
      ],
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: deathT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 6, 16),
        quatFromEulerXYZ(0, -5, -8),
        quatFromEulerXYZ(4, -8, 6), // keeps rostrum tip well above ground!
        quatFromEulerXYZ(4, -8, 6),
      ],
    },
    {
      nodeIndex: mandibleNodes.R,
      path: 'rotation',
      times: deathT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 24, 0),
        quatFromEulerXYZ(0, 12, 0),
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
        quatFromEulerXYZ(0, -12, 0),
        quatFromEulerXYZ(0, -18, 0),
        quatFromEulerXYZ(0, -18, 0),
      ],
    },
    {
      nodeIndex: abdomenIdx,
      path: 'rotation',
      times: deathT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, 12),
        quatFromEulerXYZ(0, 0, -10),
        quatFromEulerXYZ(0, 0, -16),
        quatFromEulerXYZ(0, 0, -16),
      ],
    },
    {
      nodeIndex: dorsalSacIdx,
      path: 'scale',
      times: deathT,
      values: [
        unitScale,
        [1.12, 1.08, 1.12],
        [0.80, 0.72, 0.84],
        [0.68, 0.56, 0.74], // deflated ruptured caustic sac!
        [0.68, 0.56, 0.74],
      ],
    },
    {
      nodeIndex: dorsalMortarIdx,
      path: 'rotation',
      times: deathT,
      values: [
        idQ,
        quatFromEulerXYZ(0, 0, 10),
        quatFromEulerXYZ(0, 0, -14),
        quatFromEulerXYZ(0, 0, -22),
        quatFromEulerXYZ(0, 0, -22),
      ],
    },
    ...buildGroundedLegTracks(deathT, deathThoraxPos, deathPitch, (lg, k) => {
      if (k === 0) return { lift: 0, yaw: 0, shinBend: 0 };
      if (k === 1) return { lift: 0.08, yaw: lg.idx < 2 ? 10 : -8, shinBend: 6 };
      if (k === 2) return { lift: 0.05, yaw: lg.idx < 2 ? 14 : -12, shinBend: 10 };
      return { lift: 0.06, yaw: lg.idx < 2 ? 18 : -16, shinBend: 14 };
    }),
  ]);

  return scene.buildGLB('RuptureCrawlerScene');
}


// ---------------------------------------------------------------------------
// Asset 2: rupture_cocoon.glb
// Gnarl Brood Rupture Cocoon — Squat swollen chitin shell (radius 1.25, ~1.58 tall,
// +X forward, Y up, floor Y=0) with overlapping armored Ravager carapace girdles,
// 8 calcified folded-limb buttresses, pressurized orange fissure seams, and a wide
// forward-canted pulsing molten-orange volcanic vent framed by 4 chitin valve petals.
// Visually distinct from the narrow lime-green 3-sac Baneling cocoon.
// Animation: loopable 'pulse'.
// ---------------------------------------------------------------------------

function buildRuptureCocoonGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createGnarlRuptureMaterials(scene);

  const rootIdx = scene.addNode({ name: 'RuptureCocoon', translation: [0, 0, 0] });

  // -------------------------------------------------------------------------
  // 1. Grounded Basal Chitin Skirt & 8 Calcified Folded-Limb Buttresses
  //    ('CocoonBase' at [0, 0, 0] — exact floor Y=0.0000 & exact radius 1.2500)
  // -------------------------------------------------------------------------
  const gBaseDark = new PrimitiveGeom(mats.Mat_ChitinDark);
  const gBaseChitin = new PrimitiveGeom(mats.Mat_ChitinBody);
  const gBaseRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
  const gBaseBone = new PrimitiveGeom(mats.Mat_BoneSpur);
  const gBaseWarm = new PrimitiveGeom(mats.Mat_WarmMembrane);

  // Broad grounded organic creep-adhesion collar sitting flush at Y = 0.0000
  const baseSkirtRings = [
    makeOvalRing(1.06, 1.04, 0.0, 0.0, 0.0, 16),
    makeOvalRing(1.12, 1.10, 0.08, 0.0, 0.0, 16),
    makeOvalRing(1.00, 0.98, 0.22, 0.0, 0.0, 16),
    makeOvalRing(0.82, 0.80, 0.34, 0.0, 0.0, 16),
  ];
  gBaseDark.addLoft(
    baseSkirtRings,
    [
      [0, 0.0, 0],
      [0, 0.08, 0],
      [0, 0.22, 0],
      [0, 0.34, 0],
    ],
    true,
    true
  );

  // Warm fleshy creep-tendon cushion ring around basal perimeter
  gBaseWarm.addSculptedLobe({
    center: [0.0, 0.11, 0.0],
    radii: [1.08, 0.14, 1.06],
    sectors: 14,
    stacks: 5,
    flattenBottom: 0.85,
    ribCount: 8,
    ribAmp: 0.04,
    minYClamp: 0.0,
  });

  // 4 Cardinal Chitin Root-Claw Spurs (+X rostrum anchor, -X tail anchor, +-Z sternal anchors)
  // Tips reach exact +-1.2500 along X and Z at Y ~ 0.006 (clamped >= 0.0000) so static
  // min = [-1.2500, 0.0000, -1.2500], max.x/z = +1.2500, and maxHorizontalRadius = 1.2500!
  const cardinalDirs = [
    { dx: 1, dz: 0, baseH: 0.24, baseW: 0.16 },  // +X forward rostrum root
    { dx: -1, dz: 0, baseH: 0.20, baseW: 0.15 }, // -X rear abdominal root
    { dx: 0, dz: 1, baseH: 0.19, baseW: 0.14 },  // +Z right sternal root
    { dx: 0, dz: -1, baseH: 0.19, baseW: 0.14 }, // -Z left sternal root
  ];
  for (const cd of cardinalDirs) {
    gBaseRidge.addTubeAlongSpine(
      [
        { pos: [cd.dx * 0.78, cd.baseH, cd.dz * 0.78], rx: cd.baseW, ry: 0.11 },
        { pos: [cd.dx * 1.04, 0.10, cd.dz * 1.04], rx: cd.baseW * 0.72, ry: 0.075 },
      ],
      5,
      true,
      false,
      [0, 1, 0],
      0.0
    );
    gBaseBone.addTubeAlongSpine(
      [
        { pos: [cd.dx * 1.02, 0.10, cd.dz * 1.02], rx: cd.baseW * 0.66, ry: 0.068 },
        { pos: [cd.dx * 1.2500, 0.004, cd.dz * 1.2500], rx: 0.0004, ry: 0.0004 },
      ],
      4,
      true,
      true,
      [0, 1, 0],
      0.0
    );
  }

  // 8 Calcified Folded-Limb Buttresses (4 right, 4 left — echoing the 8 flared armored
  // limbs of the metamorphosing Rupture Crawler tucked around the swollen shell!)
  const buttressAzimuthsDeg = [24, 62, 118, 156, -24, -62, -118, -156];
  for (const azDeg of buttressAzimuthsDeg) {
    const az = degToRad(azDeg);
    const cx = Math.cos(az);
    const cz = Math.sin(az);
    // Upper tucked femur-ridge buttress descending from mid-shell to knee knuckle
    gBaseChitin.addFlaredLimbBlade({
      pStart: [cx * 0.76, 0.74, cz * 0.74],
      pEnd: [cx * 1.05, 0.34, cz * 1.03],
      flareDir: [cx * 0.72, 0.68, cz * 0.72],
      thickness: 0.15,
      backWidth: 0.06,
      flareStart: 0.08,
      flarePeak: 0.22,
      flareSub: 0.17,
      flareEnd: 0.09,
    });
    // Grounded lower shin-buttress anchoring into Y=0 creep skirt (max hypot ~ 1.19 <= 1.25)
    gBaseRidge.addTubeAlongSpine(
      [
        { pos: [cx * 1.02, 0.40, cz * 1.00], rx: 0.095, ry: 0.085 },
        { pos: [cx * 1.13, 0.14, cz * 1.12], rx: 0.068, ry: 0.058 },
      ],
      5,
      true,
      false,
      [0, 1, 0],
      0.0
    );
    // Calcified bone knee-horn & grounded claw tip
    gBaseBone.addTubeAlongSpine(
      [
        { pos: [cx * 1.01, 0.42, cz * 0.99], rx: 0.052, ry: 0.044 },
        { pos: [cx * 1.14, 0.56, cz * 1.12], rx: 0.012, ry: 0.010 },
      ],
      4,
      true,
      true
    );
    gBaseBone.addTubeAlongSpine(
      [
        { pos: [cx * 1.11, 0.15, cz * 1.10], rx: 0.058, ry: 0.048 },
        { pos: [cx * 1.185, 0.008, cz * 1.180], rx: 0.010, ry: 0.008 },
      ],
      4,
      true,
      true,
      [0, 1, 0],
      0.0
    );
  }

  const cocoonBaseMesh = scene.addMesh('CocoonBase_Mesh', [
    gBaseDark,
    gBaseChitin,
    gBaseRidge,
    gBaseBone,
    gBaseWarm,
  ]);
  scene.addNode({
    name: 'CocoonBase',
    meshIndex: cocoonBaseMesh,
    translation: [0, 0, 0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 2. Squat Swollen Chitin Shell & Pressurized Orange Fissure Seams
  //    ('CocoonShell' at [0, 0.14, 0] — swells & breathes during 'pulse')
  // -------------------------------------------------------------------------
  const shellOrigin = [0.0, 0.14, 0.0];
  const gShChitin = new PrimitiveGeom(mats.Mat_ChitinBody);
  const gShRidge = new PrimitiveGeom(mats.Mat_ChitinRidge);
  const gShDark = new PrimitiveGeom(mats.Mat_ChitinDark);
  const gShBone = new PrimitiveGeom(mats.Mat_BoneSpur);
  const gShFissureOrange = new PrimitiveGeom(mats.Mat_CausticOrangeCore);
  const gShFissureAmber = new PrimitiveGeom(mats.Mat_CausticAmberMid);

  // Main turgid, squat, swollen 8-lobed chitin dome (world Y ~ 0.18 .. 1.32, width ~ 2.12)
  gShChitin.addSculptedLobe({
    center: [0.02, 0.54, 0.0],
    radii: [1.05, 0.60, 1.01],
    sectors: 16,
    stacks: 8,
    flattenBottom: 0.45,
    ribCount: 8,
    ribAmp: 0.052,
    minYClamp: 0.04,
  });

  // 3 Overlapping Horizontal/Canted Armored Ravager Carapace Girdles wrapping the swollen shell
  const girdleSpecs = [
    { y: 0.34, rxB: 1.06, rzB: 1.02, rxT: 0.99, rzT: 0.95, h: 0.17, tiltZ: -3 },
    { y: 0.58, rxB: 0.98, rzB: 0.94, rxT: 0.86, rzT: 0.83, h: 0.18, tiltZ: -5 },
    { y: 0.80, rxB: 0.82, rzB: 0.79, rxT: 0.64, rzT: 0.62, h: 0.16, tiltZ: -7 },
  ];
  for (const gd of girdleSpecs) {
    const qTilt = quatFromEulerXYZ(0, 0, gd.tiltZ);
    const xfG = (pt) => vAdd([0.03, gd.y, 0.0], rotateVecByQuat(pt, qTilt));
    const r0 = makeOvalRing(gd.rxB, gd.rzB, -gd.h * 0.5, 0, 0, 14).map(xfG);
    const r1 = makeOvalRing(gd.rxB * 1.02, gd.rzB * 1.02, 0.0, 0, 0, 14).map(xfG);
    const r2 = makeOvalRing(gd.rxT, gd.rzT, gd.h * 0.5, 0, 0, 14).map(xfG);
    gShRidge.addLoft(
      [r0, r1, r2],
      [xfG([0, -gd.h * 0.5, 0]), xfG([0, 0, 0]), xfG([0, gd.h * 0.5, 0])],
      true,
      true
    );
  }

  // Forward (+X) Nascent Ravager Cranial Brow Shield & Twin Cheek-Horns for clear +X facing!
  gShRidge.addChamferBox({
    center: [0.88, 0.54, 0.0],
    size: [0.34, 0.30, 0.62],
    rotDeg: [0, 0, -24],
    topScale: [0.76, 0.78],
  });
  for (const side of [-1, 1]) {
    gShBone.addTubeAlongSpine(
      [
        { pos: [0.80, 0.56, side * 0.28], rx: 0.075, ry: 0.055 },
        { pos: [0.98, 0.66, side * 0.44], rx: 0.042, ry: 0.032 },
        { pos: [1.08, 0.74, side * 0.52], rx: 0.012, ry: 0.010 },
      ],
      5,
      true,
      true
    );
  }

  // 6 Pressurized Molten-Orange Fissure Seams radiating down from the upper vent caldera
  // between the chitin armor plates so internal orange energy bleeds through the shell!
  const fissureAnglesDeg = [0, 58, 122, 180, -122, -58];
  for (const fDeg of fissureAnglesDeg) {
    const fRad = degToRad(fDeg);
    const fx = Math.cos(fRad);
    const fz = Math.sin(fRad);
    gShFissureOrange.addTubeAlongSpine(
      [
        { pos: [0.05 + fx * 0.46, 0.94, fz * 0.44], rx: 0.068, ry: 0.042 },
        { pos: [0.03 + fx * 0.80, 0.72, fz * 0.77], rx: 0.055, ry: 0.036 },
        { pos: [0.02 + fx * 0.99, 0.44, fz * 0.96], rx: 0.032, ry: 0.024 },
      ],
      5,
      true,
      true
    );
    // Amber-yellow superheated inner crack highlight near top rim
    gShFissureAmber.addTubeAlongSpine(
      [
        { pos: [0.05 + fx * 0.44, 0.96, fz * 0.42], rx: 0.040, ry: 0.028 },
        { pos: [0.04 + fx * 0.68, 0.80, fz * 0.66], rx: 0.022, ry: 0.018 },
      ],
      4,
      true,
      true
    );
  }

  // Dark Volcanic Vent Caldera Collar crowning the shell (canted +8 deg forward toward +X)
  const ventCenterLocal = [0.06, 0.95, 0.0];
  const qVentTilt = quatFromEulerXYZ(0, 0, -8);
  const xfVent = (pt) => vAdd(ventCenterLocal, rotateVecByQuat(pt, qVentTilt));
  gShDark.addLoft(
    [
      makeOvalRing(0.64, 0.62, -0.10, 0, 0, 14).map(xfVent),
      makeOvalRing(0.56, 0.54, 0.06, 0, 0, 14).map(xfVent),
      makeOvalRing(0.46, 0.44, 0.14, 0, 0, 14).map(xfVent),
    ],
    [xfVent([0, -0.10, 0]), xfVent([0, 0.06, 0]), xfVent([0, 0.14, 0])],
    true,
    true
  );

  const cocoonShellMesh = scene.addMesh('CocoonShell_Mesh', [
    gShChitin,
    gShRidge,
    gShDark,
    gShBone,
    gShFissureOrange,
    gShFissureAmber,
  ]);
  const cocoonShellIdx = scene.addNode({
    name: 'CocoonShell',
    meshIndex: cocoonShellMesh,
    translation: shellOrigin,
    parentIndex: rootIdx,
  });

  // Overhead UI / targeting helper 'Head' above the crown
  scene.addNode({
    name: 'Head',
    translation: [0.06, 1.36, 0.0],
    parentIndex: cocoonShellIdx,
  });

  // Dedicated single-material player-color carapace plates (*Surf_TEAM*) & flank ocelli (*Surf_GLOW*)
  // Kept strictly on outer chitin perimeter so the central orange vent stays vivid molten-orange!
  {
    const shellTeamSpecs = [
      {
        name: 'Surf_TEAM_ShellFrontR',
        center: [0.64, 0.66, 0.56],
        normal: vNorm([0.62, 0.52, 0.58]),
        up: vNorm([-0.48, 0.85, -0.22]),
      },
      {
        name: 'Surf_TEAM_ShellFrontL',
        center: [0.64, 0.66, -0.56],
        normal: vNorm([0.62, 0.52, -0.58]),
        up: vNorm([-0.48, 0.85, 0.22]),
      },
      {
        name: 'Surf_TEAM_ShellRearR',
        center: [-0.62, 0.62, 0.56],
        normal: vNorm([-0.62, 0.50, 0.60]),
        up: vNorm([0.46, 0.86, -0.22]),
      },
      {
        name: 'Surf_TEAM_ShellRearL',
        center: [-0.62, 0.62, -0.56],
        normal: vNorm([-0.62, 0.50, -0.60]),
        up: vNorm([0.46, 0.86, 0.22]),
      },
    ];
    const badgePoly = [
      [-0.24, -0.14],
      [0.24, -0.14],
      [0.30, 0.04],
      [0.00, 0.20],
      [-0.30, 0.04],
    ];
    for (const st of shellTeamSpecs) {
      const gST = new PrimitiveGeom(mats.Surf_TEAM);
      gST.addOrientedShield(st.center, st.normal, st.up, badgePoly, 0.045, 0.86, 0.01);
      const stMesh = scene.addMesh(`${st.name}_Mesh`, [gST]);
      scene.addNode({
        name: st.name,
        meshIndex: stMesh,
        parentIndex: cocoonShellIdx,
      });
    }

    // Small lateral sensory bio-nodes (*Surf_GLOW*) low on the outer shell skirt
    const gSG = new PrimitiveGeom(mats.Surf_GLOW);
    for (const side of [-1, 1]) {
      gSG.addFacetedCrystal({
        center: [0.36, 0.36, side * 0.94],
        radii: [0.08, 0.06, 0.06],
        sectors: 6,
        stacks: 4,
      });
      gSG.addFacetedCrystal({
        center: [-0.34, 0.34, side * 0.94],
        radii: [0.075, 0.055, 0.055],
        sectors: 6,
        stacks: 4,
      });
    }
    const sgMesh = scene.addMesh('Surf_GLOW_ShellBioNodes_Mesh', [gSG]);
    scene.addNode({
      name: 'Surf_GLOW_ShellBioNodes',
      meshIndex: sgMesh,
      parentIndex: cocoonShellIdx,
    });
  }

  // -------------------------------------------------------------------------
  // 3. Signature Pulsing Molten-Orange Vent Core, Translucent Blister & 4 Valve Petals
  //    (Visually unmistakable vs. Baneling cocoon's 3 lime-green open spheres!)
  // -------------------------------------------------------------------------
  const ventCoreOrigin = [0.06, 0.94, 0.0]; // world [0.06, 1.08, 0.0]
  const gVentAmber = new PrimitiveGeom(mats.Mat_CausticAmberMid);
  const gVentOrange = new PrimitiveGeom(mats.Mat_CausticOrangeCore);
  const gVentBright = new PrimitiveGeom(mats.Mat_CausticOrangeBright);

  // Boiling amber-orange outer caldera bed ring
  gVentAmber.addSculptedLobe({
    center: [0.0, 0.06, 0.0],
    radii: [0.50, 0.16, 0.48],
    rotDeg: [0, 0, -8],
    sectors: 12,
    stacks: 5,
    ribCount: 6,
    ribAmp: 0.06,
  });

  // Swollen turgid molten-orange vent sac surging out of the crater
  gVentOrange.addSculptedLobe({
    center: [0.02, 0.16, 0.0],
    radii: [0.43, 0.28, 0.41],
    rotDeg: [0, 0, -8],
    sectors: 14,
    stacks: 6,
    ribCount: 6,
    ribAmp: 0.055,
  });

  // Incandescent golden-orange volcanic core + central erupting pressure papilla
  gVentBright.addSculptedLobe({
    center: [0.04, 0.26, 0.0],
    radii: [0.28, 0.22, 0.27],
    rotDeg: [0, 0, -8],
    sectors: 10,
    stacks: 5,
  });
  gVentBright.addFacetedCrystal({
    center: [0.06, 0.36, 0.0],
    radii: [0.16, 0.16, 0.15],
    rotDeg: [0, 0, -8],
    sectors: 8,
    stacks: 4,
  });

  const ventCoreMesh = scene.addMesh('OrangeVentCore_Mesh', [
    gVentAmber,
    gVentOrange,
    gVentBright,
  ]);
  const ventCoreIdx = scene.addNode({
    name: 'OrangeVentCore',
    meshIndex: ventCoreMesh,
    translation: ventCoreOrigin,
    parentIndex: cocoonShellIdx,
  });

  // Semi-transparent glowing orange caustic membrane blister enveloping the vent core
  const gVentMembrane = new PrimitiveGeom(mats.Mat_CausticMembrane);
  gVentMembrane.addSculptedLobe({
    center: [0.03, 0.20, 0.0],
    radii: [0.47, 0.32, 0.45],
    rotDeg: [0, 0, -8],
    sectors: 14,
    stacks: 6,
    flattenBottom: 0.25,
  });
  const ventBlisterMesh = scene.addMesh('OrangeVentBlister_Mesh', [gVentMembrane]);
  const ventBlisterIdx = scene.addNode({
    name: 'OrangeVentBlister',
    meshIndex: ventBlisterMesh,
    translation: [0, 0, 0],
    parentIndex: ventCoreIdx,
  });

  // 4 Articulated Chitin-and-Bone Sphincter Valve Petals ('VentPetal_0..3')
  // Hinged around the crater rim and curving inward/upward to crown at world Y = 1.5800!
  const petalSpecs = [
    { idx: 0, azDeg: 0, flareAxis: [0, 0, -1] },    // Front (+X) valve petal -> flares +X outward
    { idx: 1, azDeg: 90, flareAxis: [1, 0, 0] },    // Right (+Z) valve petal -> flares +Z outward
    { idx: 2, azDeg: 180, flareAxis: [0, 0, 1] },   // Rear  (-X) valve petal -> flares -X outward
    { idx: 3, azDeg: -90, flareAxis: [-1, 0, 0] },  // Left  (-Z) valve petal -> flares -Z outward
  ];
  const ventPetalNodes = [];
  for (const ps of petalSpecs) {
    const az = degToRad(ps.azDeg);
    const rx = Math.cos(az);
    const rz = Math.sin(az);
    const pivotLocal = [0.06 + rx * 0.46, 1.02, rz * 0.44]; // world Y = 1.16

    const gPtChitin = new PrimitiveGeom(mats.Mat_ChitinRidge);
    const gPtBone = new PrimitiveGeom(mats.Mat_BoneSpur);
    const gPtOrange = new PrimitiveGeom(mats.Mat_CausticOrangeCore);

    // Outer armored valve petal curving inward toward vent crown
    gPtChitin.addFlaredLimbBlade({
      pStart: [0.0, 0.0, 0.0],
      pEnd: [-rx * 0.18, 0.30, -rz * 0.18],
      flareDir: [rx * 0.85, 0.45, rz * 0.85],
      thickness: 0.16,
      backWidth: 0.05,
      flareStart: 0.08,
      flarePeak: 0.16,
      flareSub: 0.12,
      flareEnd: 0.05,
    });
    // Glowing orange inner mucosal lining of the valve flap
    gPtOrange.addTubeAlongSpine(
      [
        { pos: [-rx * 0.04, 0.05, -rz * 0.04], rx: 0.062, ry: 0.032 },
        { pos: [-rx * 0.15, 0.24, -rz * 0.15], rx: 0.038, ry: 0.022 },
      ],
      4,
      true,
      true
    );
    // Calcified bone crown tooth peaking at local Y = 0.4200 -> exact world Y = 0.14 + 1.02 + 0.42 = 1.5800!
    gPtBone.addTubeAlongSpine(
      [
        { pos: [-rx * 0.16, 0.26, -rz * 0.16], rx: 0.048, ry: 0.038 },
        { pos: [-rx * 0.22, 0.4200, -rz * 0.22], rx: 0.004, ry: 0.004 },
      ],
      4,
      true,
      true
    );

    const ptMesh = scene.addMesh(`VentPetal_${ps.idx}_Mesh`, [gPtChitin, gPtBone, gPtOrange]);
    const ptNode = scene.addNode({
      name: `VentPetal_${ps.idx}`,
      meshIndex: ptMesh,
      translation: pivotLocal,
      parentIndex: cocoonShellIdx,
    });
    ventPetalNodes.push({ nodeIndex: ptNode, flareAxis: ps.flareAxis });
  }

  // -------------------------------------------------------------------------
  // 4. Loopable 'pulse' Animation (1.60s seamless caustic vent heartbeat)
  //    Frame 0 === Last Frame float-for-float for zero-seam infinite looping!
  // -------------------------------------------------------------------------
  const idQ = [0, 0, 0, 1];
  const unitScale = [1, 1, 1];
  const pulseT = [0.0, 0.32, 0.58, 0.92, 1.28, 1.60];

  const petalOpenAnglesDeg = [0, 22, 8, 15, -4, 0];
  const petalTracks = ventPetalNodes.map((vp) => ({
    nodeIndex: vp.nodeIndex,
    path: 'rotation',
    times: pulseT,
    values: petalOpenAnglesDeg.map((ang) =>
      ang === 0 ? idQ : quatFromAxisAngle(vp.flareAxis, degToRad(ang))
    ),
  }));

  scene.addAnimation('pulse', [
    {
      nodeIndex: cocoonShellIdx,
      path: 'scale',
      times: pulseT,
      values: [
        unitScale,
        [1.045, 1.032, 1.045], // primary turgid shell swell
        [0.988, 1.010, 0.988], // brief elastic recoil
        [1.030, 1.022, 1.030], // secondary caustic heartbeat
        [0.978, 0.986, 0.978], // slow exhalation contraction
        unitScale,             // exact loop closure
      ],
    },
    {
      nodeIndex: ventCoreIdx,
      path: 'translation',
      times: pulseT,
      values: [
        ventCoreOrigin,
        [ventCoreOrigin[0] + 0.015, ventCoreOrigin[1] + 0.085, 0.0],
        [ventCoreOrigin[0] + 0.004, ventCoreOrigin[1] + 0.025, 0.0],
        [ventCoreOrigin[0] + 0.010, ventCoreOrigin[1] + 0.055, 0.0],
        [ventCoreOrigin[0] - 0.004, ventCoreOrigin[1] - 0.018, 0.0],
        ventCoreOrigin,
      ],
    },
    {
      nodeIndex: ventCoreIdx,
      path: 'scale',
      times: pulseT,
      values: [
        unitScale,
        [1.15, 1.24, 1.15], // molten-orange vent boils upward through open petals!
        [1.04, 1.06, 1.04],
        [1.11, 1.16, 1.11],
        [0.94, 0.92, 0.94],
        unitScale,
      ],
    },
    {
      nodeIndex: ventBlisterIdx,
      path: 'scale',
      times: pulseT,
      values: [
        unitScale,
        [1.08, 1.12, 1.08],
        [1.02, 1.03, 1.02],
        [1.06, 1.08, 1.06],
        [0.96, 0.95, 0.96],
        unitScale,
      ],
    },
    ...petalTracks,
  ]);

  return scene.buildGLB('RuptureCocoonScene');
}

// ---------------------------------------------------------------------------
// Self-Validation Summary & CLI Entry Point
// ---------------------------------------------------------------------------

function summarizeRuptureAsset(filename, glbBuffer, gltf) {
  let totalVerts = 0;
  let totalTris = 0;
  let maxHorizRad = 0;
  const globalMin = [Infinity, Infinity, Infinity];
  const globalMax = [-Infinity, -Infinity, -Infinity];

  const jsonLen = glbBuffer.readUInt32LE(12);
  const binStart = 20 + jsonLen + 8;

  const parentMap = new Map();
  gltf.nodes.forEach((n, idx) => {
    for (const c of n.children || []) parentMap.set(c, idx);
  });

  function worldPoint(nodeIdx, p) {
    let cur = p;
    let idx = nodeIdx;
    while (idx !== undefined) {
      const n = gltf.nodes[idx];
      if (n.scale) cur = [cur[0] * n.scale[0], cur[1] * n.scale[1], cur[2] * n.scale[2]];
      if (n.rotation) cur = rotateVecByQuat(cur, n.rotation);
      if (n.translation) cur = vAdd(cur, n.translation);
      idx = parentMap.get(idx);
    }
    return cur;
  }

  gltf.nodes.forEach((n, nIdx) => {
    if (n.mesh === undefined) return;
    const mesh = gltf.meshes[n.mesh];
    for (const prim of mesh.primitives) {
      const posAcc = gltf.accessors[prim.attributes.POSITION];
      const idxAcc = gltf.accessors[prim.indices];
      totalVerts += posAcc.count;
      totalTris += idxAcc.count / 3;

      const bv = gltf.bufferViews[posAcc.bufferView];
      const baseOff = binStart + (bv.byteOffset || 0) + (posAcc.byteOffset || 0);
      for (let i = 0; i < posAcc.count; i++) {
        const vx = glbBuffer.readFloatLE(baseOff + i * 12);
        const vy = glbBuffer.readFloatLE(baseOff + i * 12 + 4);
        const vz = glbBuffer.readFloatLE(baseOff + i * 12 + 8);
        const wp = worldPoint(nIdx, [vx, vy, vz]);
        for (let c = 0; c < 3; c++) {
          if (wp[c] < globalMin[c]) globalMin[c] = wp[c];
          if (wp[c] > globalMax[c]) globalMax[c] = wp[c];
        }
        const hr = Math.hypot(wp[0], wp[2]);
        if (hr > maxHorizRad) maxHorizRad = hr;
      }
    }
  });

  const allNodes = gltf.nodes.map((n) => n.name);
  const teamNodes = allNodes.filter((n) => n.startsWith('Surf_TEAM_'));
  const glowNodes = allNodes.filter((n) => n.startsWith('Surf_GLOW_'));
  const animations = (gltf.animations || []).map((a) => a.name);
  const sha256 = crypto.createHash('sha256').update(glbBuffer).digest('hex');

  return {
    filename,
    bytes: glbBuffer.length,
    sha256,
    verts: totalVerts,
    tris: totalTris,
    min: globalMin.map((x) => Number(x.toFixed(4))),
    max: globalMax.map((x) => Number(x.toFixed(4))),
    size: [
      Number((globalMax[0] - globalMin[0]).toFixed(4)),
      Number((globalMax[1] - globalMin[1]).toFixed(4)),
      Number((globalMax[2] - globalMin[2]).toFixed(4)),
    ],
    maxHorizontalRadius: Number(maxHorizRad.toFixed(4)),
    allNodes,
    teamNodes,
    glowNodes,
    animations,
  };
}

function main() {
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
  fs.mkdirSync(outDir, { recursive: true });

  const specs = [
    { filename: 'rupture_crawler.glb', build: buildRuptureCrawlerGLB },
    { filename: 'rupture_cocoon.glb', build: buildRuptureCocoonGLB },
  ];

  const summaries = [];
  for (const sp of specs) {
    const { glbBuffer, gltf } = sp.build();
    const fullPath = path.join(outDir, sp.filename);
    fs.writeFileSync(fullPath, glbBuffer);
    summaries.push(summarizeRuptureAsset(sp.filename, glbBuffer, gltf));
  }

  console.log(JSON.stringify(summaries, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildRuptureCrawlerGLB,
  buildRuptureCocoonGLB,
};
