#!/usr/bin/env node
'use strict';

/**
 * Deterministic Standalone Procedural GLB Generator for Starfall Command
 * Faction: Aurelian Concord — Heavy Psionic Merger Unit
 *
 * Outputs ONLY inside target directory (default __dirname):
 *   - lattice_archon.glb — Large Lattice Archon (~3.4 units tall, ~4.7 units across,
 *                          +X forward, Y up, lowest ring at ground Y = 0.0000):
 *                          muscular suspended translucent pale-blue energy silhouette,
 *                          visible bright spherical envelope (zero opaque outer shell),
 *                          orbiting split runes, and crackling surging hands.
 *                          Anchors: 'Muzzle', 'CastOrigin'.
 *                          Animations: 'idle', 'hover', 'attack', 'warp', 'death'.
 *
 * Uses ONLY built-in Node.js modules ('fs', 'path'). Zero external dependencies.
 */

const fs = require('fs');
const path = require('path');

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

// ---------------------------------------------------------------------------
// Low-Poly Flat-Shaded Geometry Builder (Outward-Verified Winding)
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
    for (const p of [a, p1, p2]) {
      this.positions.push(
        Number(p[0].toFixed(5)),
        Number(p[1].toFixed(5)),
        Number(p[2].toFixed(5))
      );
      this.normals.push(
        Number(n[0].toFixed(5)),
        Number(n[1].toFixed(5)),
        Number(n[2].toFixed(5))
      );
    }
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
    const ctr = centerHint || [cx / ring.length, cy / ring.length, cz / ring.length];
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

  addTubeAlongSpine(stations, sides = 6, capStart = true, capEnd = true) {
    if (stations.length < 2) return;
    const rings = [];
    const centers = [];
    let prevUp = [0, 1, 0];

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
      const phase = stations[k].phase ?? Math.PI / sides;
      const ring = [];
      for (let i = 0; i < sides; i++) {
        const th = (2 * Math.PI * i) / sides + phase;
        const cs = Math.cos(th) * rx;
        const sn = Math.sin(th) * ry;
        ring.push(vAdd(cur, vAdd(vScale(side, cs), vScale(up, sn))));
      }
      rings.push(ring);
      centers.push(cur);
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

  addSphericalCoronaBand({
    radius,
    thStart,
    thEnd,
    rotDeg = [0, 0, 0],
    widthTang = 0.068,
    thickRad = 0.016,
    steps = 14,
  }) {
    const q = quatFromEulerXYZ(rotDeg[0], rotDeg[1], rotDeg[2]);
    const pts = [];
    const tapers = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const th = thStart + (thEnd - thStart) * u;
      pts.push(rotateVecByQuat([Math.cos(th) * radius, 0, Math.sin(th) * radius], q));
      tapers.push(Math.sin(u * Math.PI) * 0.80 + 0.20);
    }
    const rings = [];
    const centers = [];
    for (let i = 0; i <= steps; i++) {
      const p = pts[i];
      let tang;
      if (i === 0) tang = vNorm(vSub(pts[1], p));
      else if (i === steps) tang = vNorm(vSub(p, pts[steps - 1]));
      else tang = vNorm(vSub(pts[i + 1], pts[i - 1]));

      const radOut = vNorm(p);
      const binorm = vNorm(vCross(tang, radOut));
      const w = widthTang * tapers[i];
      const h = thickRad * tapers[i];
      rings.push([
        vAdd(p, vAdd(vScale(binorm, -w), vScale(radOut, -h * 0.4))),
        vAdd(p, vAdd(vScale(binorm, w), vScale(radOut, -h * 0.4))),
        vAdd(p, vAdd(vScale(binorm, w * 0.72), vScale(radOut, h))),
        vAdd(p, vAdd(vScale(binorm, -w * 0.72), vScale(radOut, h))),
      ]);
      centers.push(p);
    }
    this.addLoft(rings, centers, true, true);
  }

  addSphericalLatitudeBand({
    radius,
    latDeg,
    thStart,
    thEnd,
    widthTang = 0.056,
    thickRad = 0.015,
    steps = 10,
  }) {
    const phi = (latDeg * Math.PI) / 180;
    const y = Math.sin(phi) * radius;
    const rLat = Math.cos(phi) * radius;
    const pts = [];
    const tapers = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const th = thStart + (thEnd - thStart) * u;
      pts.push([Math.cos(th) * rLat, y, Math.sin(th) * rLat]);
      tapers.push(Math.sin(u * Math.PI) * 0.80 + 0.20);
    }
    const rings = [];
    const centers = [];
    for (let i = 0; i <= steps; i++) {
      const p = pts[i];
      let tang;
      if (i === 0) tang = vNorm(vSub(pts[1], p));
      else if (i === steps) tang = vNorm(vSub(p, pts[steps - 1]));
      else tang = vNorm(vSub(pts[i + 1], pts[i - 1]));

      const radOut = vNorm(p);
      const binorm = vNorm(vCross(tang, radOut));
      const w = widthTang * tapers[i];
      const h = thickRad * tapers[i];
      rings.push([
        vAdd(p, vAdd(vScale(binorm, -w), vScale(radOut, -h * 0.4))),
        vAdd(p, vAdd(vScale(binorm, w), vScale(radOut, -h * 0.4))),
        vAdd(p, vAdd(vScale(binorm, w * 0.72), vScale(radOut, h))),
        vAdd(p, vAdd(vScale(binorm, -w * 0.72), vScale(radOut, h))),
      ]);
      centers.push(p);
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
      if (!Number.isFinite(floatArray[i])) {
        throw new Error(`Non-finite float at index ${i}: ${floatArray[i]}`);
      }
      const v = floatArray[i];
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
        throw new Error(`Primitive in mesh ${name} exceeds 65535 vertices (${pg.vertexCount})`);
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

  buildGLB(sceneName = 'LatticeArchonScene') {
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
        generator: 'StarfallCommand-ConcordArchonGenerator-1.0',
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
// Lattice Archon Material Palette
// Zero opaque outer shell! Surf_TEAM_* & Surf_GLOW_* used ONLY on delicate
// orbiting split-rune inlays & ground ticks so engine overrides keep the
// spherical envelope & muscular pale-blue silhouette 100% translucent!
// ---------------------------------------------------------------------------

function createLatticeArchonMaterials(scene) {
  return {
    Surf_TEAM: scene.addMaterial({
      name: 'Surf_TEAM_Panel',
      hex: '#3c7ef0',
      metallic: 0.20,
      roughness: 0.30,
      emissiveHex: '#204eb0',
      emissiveBoost: 0.75,
    }),
    Surf_GLOW: scene.addMaterial({
      name: 'Surf_GLOW_Accent',
      hex: '#92d8ff',
      metallic: 0.0,
      roughness: 0.10,
      emissiveHex: '#80ceff',
      emissiveBoost: 2.1,
    }),
    // Inner blazing ice-cyan eyes & palm singularities
    Mat_ArchonCore: scene.addMaterial({
      name: 'Mat_ArchonCoreWhiteBlue',
      hex: '#c8f9ff',
      alpha: 0.84,
      metallic: 0.0,
      roughness: 0.08,
      emissiveHex: '#96f0ff',
      emissiveBoost: 1.65,
      alphaMode: 'BLEND',
      doubleSided: true,
    }),
    // Muscular suspended translucent pale-blue energy silhouette (crisp 3D facet shading!)
    Mat_ArchonMuscle: scene.addMaterial({
      name: 'Mat_ArchonMusclePaleBlue',
      hex: '#62cfff',
      alpha: 0.68,
      metallic: 0.04,
      roughness: 0.26,
      emissiveHex: '#2ca4ff',
      emissiveBoost: 0.78,
      alphaMode: 'BLEND',
      doubleSided: true,
    }),
    // Crackling surging hand plasma ribbons & psionic mantle plumes
    Mat_ArchonSurge: scene.addMaterial({
      name: 'Mat_ArchonSurgeArc',
      hex: '#a8f3ff',
      alpha: 0.64,
      metallic: 0.0,
      roughness: 0.10,
      emissiveHex: '#7ce8ff',
      emissiveBoost: 1.65,
      alphaMode: 'BLEND',
      doubleSided: true,
    }),
    // Visible Bright Spherical Envelope (2 vibrant luminous pale-blue translucent shells -> zero opaque shell!)
    Mat_EnvelopeInner: scene.addMaterial({
      name: 'Mat_EnvelopeSphericalInner',
      hex: '#7ee6ff',
      alpha: 0.10,
      metallic: 0.0,
      roughness: 0.08,
      emissiveHex: '#5cdbff',
      emissiveBoost: 1.75,
      alphaMode: 'BLEND',
      doubleSided: false,
    }),
    Mat_EnvelopeMain: scene.addMaterial({
      name: 'Mat_EnvelopeSphericalMain',
      hex: '#9ef0ff',
      alpha: 0.20,
      metallic: 0.0,
      roughness: 0.06,
      emissiveHex: '#7ee8ff',
      emissiveBoost: 1.95,
      alphaMode: 'BLEND',
      doubleSided: false,
    }),
    // Blazing ice-cyan spherical corona bands hugging the bright spherical envelope
    Mat_EnvelopeSwirl: scene.addMaterial({
      name: 'Mat_EnvelopeCoronaArc',
      hex: '#c4f9ff',
      alpha: 0.74,
      metallic: 0.0,
      roughness: 0.06,
      emissiveHex: '#9cf2ff',
      emissiveBoost: 2.00,
      alphaMode: 'BLEND',
      doubleSided: true,
    }),
    // Translucent ground lattice & orbital wake arcs
    Mat_OrbitalWake: scene.addMaterial({
      name: 'Mat_OrbitalWakeEnergy',
      hex: '#5ed0ff',
      alpha: 0.44,
      metallic: 0.0,
      roughness: 0.16,
      emissiveHex: '#38b8ff',
      emissiveBoost: 1.65,
      alphaMode: 'BLEND',
      doubleSided: true,
    }),
    // Translucent Sapphire-Blue Crystal + Concord Gold for sleek Orbiting Split Runes
    Mat_RuneCrystal: scene.addMaterial({
      name: 'Mat_SplitRuneCrystalBlue',
      hex: '#46b8fc',
      alpha: 0.78,
      metallic: 0.16,
      roughness: 0.20,
      emissiveHex: '#207ce0',
      emissiveBoost: 0.90,
      alphaMode: 'BLEND',
      doubleSided: true,
    }),
    Mat_RuneGold: scene.addMaterial({
      name: 'Mat_RuneGoldBright',
      hex: '#eab949',
      metallic: 0.86,
      roughness: 0.22,
      emissiveHex: '#463008',
      emissiveBoost: 0.45,
    }),
    Mat_SlateDark: scene.addMaterial({
      name: 'Mat_ConcordSlateDark',
      hex: '#283448',
      metallic: 0.42,
      roughness: 0.56,
    }),
  };
}

// ---------------------------------------------------------------------------
// Specialized Procedural Helper: Bifurcated (Split!) Concord Orbiting Rune
// ---------------------------------------------------------------------------

/**
 * Adds one sleek bifurcated Aurelian Concord Split Rune at `origin` oriented
 * radially along `outDir`. Physically cloven into two separated crystalline-blue
 * & gold halves across an open glowing psionic rift gap!
 */
function addSplitRuneGlyph({
  origin,
  outDir,
  upDir = [0, 1, 0],
  scale = 1.0,
  gGold,
  gCrystal,
  gEnergy,
  gTeam = null,
  gGlow = null,
}) {
  const out = vNorm(outDir);
  let tang = vCross(upDir, out);
  if (vLen(tang) < 1e-5) tang = vCross([0, 1, 0], out);
  tang = vNorm(tang);
  const up = vNorm(vCross(out, tang));

  const pt = (rOff, yOff, tOff) =>
    vAdd(
      origin,
      vAdd(vScale(out, rOff * scale), vAdd(vScale(up, yOff * scale), vScale(tang, tOff * scale)))
    );

  // Physically cleft Upper & Lower Split-Rune Halves (clear 0.17*scale open gap between halves!)
  for (const halfSign of [1, -1]) {
    const yInner = halfSign * 0.085;
    const yMid = halfSign * 0.20;
    const yTip = halfSign * 0.34;

    // Sleek Crystalline Sapphire-Blue Rune Shard (sweeping radially out to +0.18*scale)
    const r0 = [
      pt(-0.07, yInner, -0.18),
      pt(0.11, yInner, -0.11),
      pt(0.11, yInner, 0.11),
      pt(-0.07, yInner, 0.18),
    ];
    const r1 = [
      pt(-0.03, yMid, -0.22),
      pt(0.18, yMid, -0.07),
      pt(0.18, yMid, 0.07),
      pt(-0.03, yMid, 0.22),
    ];
    const r2 = [
      pt(-0.01, yTip, -0.07),
      pt(0.09, yTip, -0.03),
      pt(0.09, yTip, 0.03),
      pt(-0.01, yTip, 0.07),
    ];
    gCrystal.addLoft(
      [r0, r1, r2],
      [pt(0.02, yInner, 0), pt(0.07, yMid, 0), pt(0.04, yTip, 0)],
      true,
      true
    );

    // Gleaming Concord Gold Outer Spine Crest on each split half
    gGold.addTubeAlongSpine(
      [
        { pos: pt(0.12, halfSign * 0.09, 0), rx: 0.030 * scale, ry: 0.048 * scale },
        { pos: pt(0.18, halfSign * 0.21, 0), rx: 0.028 * scale, ry: 0.040 * scale },
        { pos: pt(0.09, halfSign * 0.34, 0), rx: 0.018 * scale, ry: 0.024 * scale },
      ],
      4,
      true,
      true
    );

    // Luminous Pale-Blue Inner Energy Blade projecting toward the sphere
    gEnergy.addLoft(
      [
        [
          pt(-0.16, halfSign * 0.07, -0.08),
          pt(-0.05, halfSign * 0.07, -0.12),
          pt(-0.05, halfSign * 0.07, 0.12),
          pt(-0.16, halfSign * 0.07, 0.08),
        ],
        [
          pt(-0.10, halfSign * 0.24, -0.04),
          pt(-0.02, halfSign * 0.25, -0.06),
          pt(-0.02, halfSign * 0.25, 0.06),
          pt(-0.10, halfSign * 0.24, 0.04),
        ],
      ],
      [pt(-0.10, halfSign * 0.07, 0), pt(-0.06, halfSign * 0.24, 0)],
      true,
      true
    );
  }

  // Crackling Pale-Blue Energy Filaments bridging across the open split gap!
  for (const tSide of [-0.11, 0.11]) {
    gEnergy.addTubeAlongSpine(
      [
        { pos: pt(0.03, -0.09, tSide), rx: 0.014 * scale, ry: 0.014 * scale },
        { pos: pt(0.06, 0.00, tSide * 0.65), rx: 0.020 * scale, ry: 0.020 * scale },
        { pos: pt(0.03, 0.09, tSide), rx: 0.014 * scale, ry: 0.014 * scale },
      ],
      4,
      true,
      true
    );
  }

  // Surf_GLOW rift spark suspended inside the open split cleft!
  if (gGlow) {
    gGlow.addFacetedCrystal({
      center: pt(0.03, 0.0, 0.0),
      radii: [0.052 * scale, 0.040 * scale, 0.062 * scale],
      sectors: 6,
      stacks: 4,
    });
  }

  // Slim Surf_TEAM inlay on upper-outer bevel (crisp RTS team color, zero body occlusion!)
  if (gTeam) {
    const tPoly = [
      [-0.13 * scale, -0.042 * scale],
      [0.13 * scale, -0.042 * scale],
      [0.08 * scale, 0.042 * scale],
      [-0.08 * scale, 0.042 * scale],
    ];
    const faceN = vNorm(vAdd(vScale(out, 0.62), vScale(up, 0.78)));
    gTeam.addOrientedShield(
      pt(0.11, 0.24, 0),
      faceN,
      up,
      tPoly,
      0.022 * scale,
      0.86,
      0.005 * scale
    );
  }
}

// ---------------------------------------------------------------------------
// Main Asset Builder: lattice_archon.glb
// Playable scale ~3.4 units tall (0.0000 .. 3.4000) and ~4.7 across (-2.3500 .. +2.3500),
// +X forward, Y up, lowest ring at ground, Muzzle & CastOrigin,
// clips: idle, hover, attack, warp, death.
// ---------------------------------------------------------------------------

function buildLatticeArchonGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createLatticeArchonMaterials(scene);

  const rootIdx = scene.addNode({ name: 'LatticeArchon', translation: [0, 0, 0] });

  // =========================================================================
  // 1. Lowest Ring at Ground ('GroundLatticeRing' at exact Y = 0.0000!)
  // =========================================================================
  const gGrndWake = new PrimitiveGeom(mats.Mat_OrbitalWake);
  const gGrndSurge = new PrimitiveGeom(mats.Mat_ArchonSurge);
  const gGrndGold = new PrimitiveGeom(mats.Mat_RuneGold);
  const gGrndSlate = new PrimitiveGeom(mats.Mat_SlateDark);

  // 6 Segmented Outer Ground Lattice Energy Arcs (R = 1.88 .. 2.12, yBot = 0.0000 exact!)
  for (let k = 0; k < 6; k++) {
    const thMid = (Math.PI / 3) * k + Math.PI / 6;
    gGrndWake.addConcentricArcStrip({
      rInner: 1.88,
      rOuter: 2.12,
      yBot: 0.000,
      yTop: 0.030,
      thStart: thMid - 0.39,
      thEnd: thMid + 0.39,
      steps: 6,
      bevelIn: 0.008,
    });

    // Sleek split dark-slate & gold ground rune anchors (yBot = 0.0000!)
    const thClasp = (Math.PI / 3) * k;
    const ca = Math.cos(thClasp), sa = Math.sin(thClasp);
    for (const splitS of [-1, 1]) {
      const thS = thClasp + splitS * 0.042;
      const cs = Math.cos(thS), ss = Math.sin(thS);
      gGrndSlate.addChamferBox({
        center: [cs * 2.01, 0.020, ss * 2.01],
        size: [0.22, 0.040, 0.08],
        rotDeg: [0, -(thS * 180) / Math.PI, 0],
        minYClamp: 0.000,
      });
    }
    gGrndGold.addChamferBox({
      center: [ca * 2.13, 0.022, sa * 2.13],
      size: [0.12, 0.044, 0.14],
      rotDeg: [0, -(thClasp * 180) / Math.PI, 0],
      minYClamp: 0.000,
    });
  }

  // Forward +X Ground Pointer Chevron at [2.12 .. 2.350, 0.000 .. 0.038, 0]
  gGrndGold.addLoft(
    [
      [
        [2.13, 0.000, -0.15],
        [2.35, 0.000, 0.00],
        [2.13, 0.000, 0.15],
        [2.07, 0.000, 0.00],
      ],
      [
        [2.14, 0.038, -0.11],
        [2.32, 0.038, 0.00],
        [2.14, 0.038, 0.11],
        [2.09, 0.038, 0.00],
      ],
    ],
    [[2.16, 0.000, 0], [2.16, 0.038, 0]],
    true,
    true
  );

  // Inner Concentric Ground Phase Ripple Ring (R = 1.04 .. 1.20, yBot = 0.0000!)
  for (let k = 0; k < 3; k++) {
    const thMid = ((2 * Math.PI) / 3) * k;
    gGrndSurge.addConcentricArcStrip({
      rInner: 1.04,
      rOuter: 1.20,
      yBot: 0.000,
      yTop: 0.022,
      thStart: thMid - 0.68,
      thEnd: thMid + 0.68,
      steps: 6,
      bevelIn: 0.006,
    });
  }

  const groundRingMesh = scene.addMesh('GroundLatticeRing_Mesh', [
    gGrndWake,
    gGrndSurge,
    gGrndSlate,
    gGrndGold,
  ]);
  const groundRingIdx = scene.addNode({
    name: 'GroundLatticeRing',
    meshIndex: groundRingMesh,
    translation: [0, 0, 0],
    parentIndex: rootIdx,
  });

  // Delicate Ground Surf_TEAM & Surf_GLOW rune ticks
  {
    const gGrndTeam = new PrimitiveGeom(mats.Surf_TEAM);
    for (const deg of [45, -45, 135, -135]) {
      const r = (deg * Math.PI) / 180;
      gGrndTeam.addConcentricArcStrip({
        rInner: 2.13,
        rOuter: 2.21,
        yBot: 0.012,
        yTop: 0.040,
        thStart: r - 0.16,
        thEnd: r + 0.16,
        steps: 3,
        bevelIn: 0.004,
      });
    }
    const gtMesh = scene.addMesh('Surf_TEAM_GroundTicks', [gGrndTeam]);
    scene.addNode({ name: 'Surf_TEAM_GroundTicks', meshIndex: gtMesh, parentIndex: groundRingIdx });

    const gGrndGlow = new PrimitiveGeom(mats.Surf_GLOW);
    for (let k = 0; k < 6; k++) {
      const th = (Math.PI / 3) * k;
      gGrndGlow.addFacetedCrystal({
        center: [Math.cos(th) * 2.01, 0.042, Math.sin(th) * 2.01],
        radii: [0.042, 0.028, 0.042],
        sectors: 6,
        stacks: 3,
      });
    }
    const ggMesh = scene.addMesh('Surf_GLOW_GroundSparks', [gGrndGlow]);
    scene.addNode({ name: 'Surf_GLOW_GroundSparks', meshIndex: ggMesh, parentIndex: groundRingIdx });
  }

  // Hovering Tier-1 Cradle Ring ('LowerCradleRing' at [0, 0.24, 0] above GroundLatticeRing)
  {
    const gCradleEnergy = new PrimitiveGeom(mats.Mat_ArchonSurge);
    const gCradleGold = new PrimitiveGeom(mats.Mat_RuneGold);
    for (let k = 0; k < 4; k++) {
      const th = (Math.PI * 0.5) * k + Math.PI * 0.25;
      gCradleEnergy.addConcentricArcStrip({
        rInner: 1.06,
        rOuter: 1.20,
        yBot: -0.020,
        yTop: 0.020,
        thStart: th - 0.50,
        thEnd: th + 0.50,
        steps: 5,
        bevelIn: 0.006,
      });
      const thGap = (Math.PI * 0.5) * k;
      gCradleGold.addFacetedCrystal({
        center: [Math.cos(thGap) * 1.13, 0.0, Math.sin(thGap) * 1.13],
        radii: [0.055, 0.036, 0.055],
        sectors: 4,
        stacks: 3,
      });
    }
    const cradleMesh = scene.addMesh('LowerCradleRing_Mesh', [gCradleEnergy, gCradleGold]);
    scene.addNode({
      name: 'LowerCradleRing',
      meshIndex: cradleMesh,
      translation: [0, 0.24, 0],
      parentIndex: groundRingIdx,
    });
  }

  // =========================================================================
  // 2. Suspended Archon Core Root ('ArchonSuspension' at [0, 1.76, 0])
  // =========================================================================
  const suspRest = [0, 1.76, 0];
  const suspIdx = scene.addNode({
    name: 'ArchonSuspension',
    translation: suspRest,
    parentIndex: rootIdx,
  });

  // Required Combat & Ability Anchors (+X forward!)
  scene.addNode({
    name: 'Muzzle',
    translation: [1.96, 0.04, 0.0],
    parentIndex: suspIdx,
  });
  scene.addNode({
    name: 'CastOrigin',
    translation: [0.96, 0.48, 0.0],
    parentIndex: suspIdx,
  });

  // =========================================================================
  // 3. Muscular Suspended Translucent Pale-Blue Energy Silhouette ('ArchonBody')
  //    Sculpted heroic V-torso, broad deltoids, horned crown, suspended vortex
  //    tail, and wide-stance crackling SURGING HANDS!
  // =========================================================================
  const bodyIdx = scene.addNode({
    name: 'ArchonBody',
    translation: [0, 0, 0],
    parentIndex: suspIdx,
  });

  // 3A. Lower Suspended Psionic Vortex Tail ('LowerVortex' at [0, -0.24, 0] -> world Y = 1.52 down to 0.46)
  const vortexRest = [0, -0.24, 0];
  const gVorMuscle = new PrimitiveGeom(mats.Mat_ArchonMuscle);
  const gVorSurge = new PrimitiveGeom(mats.Mat_ArchonSurge);

  // Sculpted tapered waist & suspended cyclone tail (terminates cleanly at world Y = 0.46!)
  gVorMuscle.addTubeAlongSpine(
    [
      { pos: [0.02, 0.10, 0], rx: 0.24, ry: 0.32 },
      { pos: [-0.02, -0.24, 0], rx: 0.18, ry: 0.23 },
      { pos: [-0.10, -0.64, 0], rx: 0.11, ry: 0.13 },
      { pos: [-0.24, -1.06, 0], rx: 0.035, ry: 0.035 },
    ],
    8,
    true,
    true
  );

  // 3 Helical Swirling Spectral Tail Ribbons around the suspended lower vortex
  for (let h = 0; h < 3; h++) {
    const baseA = ((2 * Math.PI) / 3) * h;
    const hStations = [];
    for (let s = 0; s <= 5; s++) {
      const u = s / 5;
      const ang = baseA + u * 2.3;
      const rad = (1 - u * 0.72) * 0.28 + 0.04;
      const y = 0.04 - u * 1.04;
      const xDrift = -u * u * 0.24;
      hStations.push({
        pos: [xDrift + Math.cos(ang) * rad * 0.85, y, Math.sin(ang) * rad],
        rx: (1 - u * 0.65) * 0.052,
        ry: (1 - u * 0.65) * 0.024,
      });
    }
    gVorSurge.addTubeAlongSpine(hStations, 4, true, true);
  }

  const vortexMesh = scene.addMesh('LowerVortex_Mesh', [gVorMuscle, gVorSurge]);
  const vortexIdx = scene.addNode({
    name: 'LowerVortex',
    meshIndex: vortexMesh,
    translation: vortexRest,
    parentIndex: bodyIdx,
  });

  // 3B. Heroic V-Tapered Muscular Torso ('ArchonTorso' at [0, -0.20, 0] -> world Y = 1.56 .. 2.54)
  const torsoRest = [0, -0.20, 0];
  const gTorMuscle = new PrimitiveGeom(mats.Mat_ArchonMuscle);
  const gTorSurge = new PrimitiveGeom(mats.Mat_ArchonSurge);

  // Sleek Sternum Psionic Nexus Diamond nestled in the pectoral cleft
  gTorSurge.addFacetedCrystal({
    center: [0.44, 0.60, 0],
    radii: [0.08, 0.18, 0.11],
    sectors: 4,
    stacks: 4,
  });

  // Heroic V-Tapered Muscular Torso Loft (narrow 0.62 waist -> massive 1.78 lat/chest breadth!)
  gTorMuscle.addLoft(
    [
      makeRectChamferRing(0.22, 0.31, 0.09, -0.04, 0.01, 0),
      makeRectChamferRing(0.32, 0.55, 0.14, 0.24, 0.04, 0),
      makeRectChamferRing(0.46, 0.82, 0.20, 0.56, 0.08, 0),
      makeRectChamferRing(0.43, 0.89, 0.20, 0.80, 0.05, 0),
      makeRectChamferRing(0.26, 0.56, 0.12, 0.96, 0.03, 0),
    ],
    [
      [0.01, -0.04, 0],
      [0.04, 0.24, 0],
      [0.08, 0.56, 0],
      [0.05, 0.80, 0],
      [0.03, 0.96, 0],
    ],
    true,
    true
  );

  // Sculpted Heroic Pectoral Plates, Trapezius Collars, Lats & Abdominal Ridges
  for (const side of [-1, 1]) {
    gTorMuscle.addChamferBox({
      center: [0.40, 0.63, side * 0.38],
      size: [0.24, 0.30, 0.52],
      rotDeg: [side * 8, side * -15, -10],
      topScale: [0.88, 0.90],
    });
    gTorMuscle.addChamferBox({
      center: [0.02, 0.90, side * 0.34],
      size: [0.30, 0.18, 0.42],
      rotDeg: [side * -16, side * -8, -6],
      topScale: [0.82, 0.86],
    });
    gTorMuscle.addChamferBox({
      center: [0.04, 0.45, side * 0.70],
      size: [0.44, 0.42, 0.24],
      rotDeg: [side * -18, 0, 0],
      topScale: [0.92, 0.86],
    });
    gTorMuscle.addChamferBox({
      center: [0.34, 0.28, side * 0.16],
      size: [0.16, 0.28, 0.24],
      rotDeg: [0, side * -8, -8],
    });

    // Broad Swept-Back Psionic Mantle Plumes rising majestically behind the traps (-X)
    gTorSurge.addLoft(
      [
        [
          [-0.14, 0.72, side * 0.16],
          [-0.10, 0.72, side * 0.56],
          [-0.22, 0.68, side * 0.58],
          [-0.26, 0.68, side * 0.16],
        ],
        [
          [-0.28, 1.06, side * 0.22],
          [-0.24, 1.04, side * 0.68],
          [-0.34, 1.00, side * 0.70],
          [-0.38, 1.02, side * 0.22],
        ],
        [
          [-0.42, 1.30, side * 0.32],
          [-0.38, 1.26, side * 0.58],
          [-0.44, 1.24, side * 0.60],
          [-0.46, 1.28, side * 0.32],
        ],
      ],
      [
        [-0.18, 0.70, side * 0.36],
        [-0.31, 1.03, side * 0.45],
        [-0.42, 1.27, side * 0.46],
      ],
      true,
      true
    );
  }

  const torsoMesh = scene.addMesh('ArchonTorso_Mesh', [gTorMuscle, gTorSurge]);
  const torsoIdx = scene.addNode({
    name: 'ArchonTorso',
    meshIndex: torsoMesh,
    translation: torsoRest,
    parentIndex: bodyIdx,
  });

  // 3C. Commanding Horned Psionic Archon Head ('ArchonHead' at [0.18, 0.94, 0] -> world [0.18, 2.50, 0])
  const headRest = [0.18, 0.94, 0];
  const gHeadCore = new PrimitiveGeom(mats.Mat_ArchonCore);
  const gHeadMuscle = new PrimitiveGeom(mats.Mat_ArchonMuscle);
  const gHeadSurge = new PrimitiveGeom(mats.Mat_ArchonSurge);

  // Blazing Fierce Psionic Eye-Brow Visor (+X)
  for (const side of [-1, 1]) {
    gHeadCore.addChamferBox({
      center: [0.21, 0.23, side * 0.09],
      size: [0.07, 0.055, 0.14],
      rotDeg: [side * -14, side * -18, 0],
    });
  }

  // Sculpted Angular Psionic Cranium
  gHeadMuscle.addLoft(
    [
      makeRectChamferRing(0.15, 0.15, 0.05, 0.00, 0.01, 0),
      makeRectChamferRing(0.21, 0.20, 0.07, 0.20, 0.03, 0),
      makeRectChamferRing(0.19, 0.18, 0.06, 0.36, -0.01, 0),
      makeRectChamferRing(0.10, 0.10, 0.03, 0.46, -0.04, 0),
    ],
    [[0.01, 0.00, 0], [0.03, 0.20, 0], [-0.01, 0.36, 0], [-0.04, 0.46, 0]],
    true,
    true
  );

  // Twin Swept Psionic Crown Horns framing the Archon visage
  for (const side of [-1, 1]) {
    gHeadSurge.addTubeAlongSpine(
      [
        { pos: [0.06, 0.30, side * 0.14], rx: 0.062, ry: 0.042 },
        { pos: [-0.08, 0.52, side * 0.26], rx: 0.046, ry: 0.032 },
        { pos: [-0.22, 0.70, side * 0.32], rx: 0.018, ry: 0.016 },
      ],
      5,
      true,
      true
    );
  }

  const headMesh = scene.addMesh('ArchonHead_Mesh', [gHeadCore, gHeadMuscle, gHeadSurge]);
  const headIdx = scene.addNode({
    name: 'ArchonHead',
    meshIndex: headMesh,
    translation: headRest,
    parentIndex: torsoIdx,
  });

  // 3D. Massive Deltoid Shoulders, Wide-Stance Forearms & Crackling SURGING HANDS!
  //     Spread boldly at Z = ±0.92 -> elbows Z = ±1.14 -> Surging Hands Z = ±0.92, X = +1.10 .. +1.82
  //     so BOTH surging hands read with unmistakable power from RTS top-down zoom!
  const armRig = {};
  for (const [sideTag, sideSign] of [
    ['R', 1],
    ['L', -1],
  ]) {
    const shRest = [0.05, 0.78, sideSign * 0.94];
    const gShMuscle = new PrimitiveGeom(mats.Mat_ArchonMuscle);
    const gShSurge = new PrimitiveGeom(mats.Mat_ArchonSurge);

    // Massive Multi-Lobed Muscular Deltoid Cap & Thick Sculpted Bicep
    gShMuscle.addFacetedCrystal({
      center: [0.02, 0.05, sideSign * 0.06],
      radii: [0.32, 0.33, 0.32],
      rotDeg: [sideSign * -16, 0, 10],
      sectors: 8,
      stacks: 4,
    });
    gShMuscle.addChamferBox({
      center: [-0.02, 0.14, sideSign * 0.18],
      size: [0.45, 0.24, 0.33],
      rotDeg: [sideSign * -26, 0, -8],
      topScale: [0.84, 0.82],
    });
    gShMuscle.addTubeAlongSpine(
      [
        { pos: [0.02, -0.02, 0.02 * sideSign], rx: 0.24, ry: 0.22 },
        { pos: [0.18, -0.21, sideSign * 0.14], rx: 0.21, ry: 0.20 },
        { pos: [0.34, -0.38, sideSign * 0.24], rx: 0.18, ry: 0.18 },
      ],
      7,
      true,
      true
    );
    // Swept shoulder plasma flare
    gShSurge.addTubeAlongSpine(
      [
        { pos: [-0.02, 0.18, sideSign * 0.18], rx: 0.07, ry: 0.035 },
        { pos: [-0.18, 0.38, sideSign * 0.30], rx: 0.02, ry: 0.016 },
      ],
      4,
      true,
      true
    );

    const uArmMesh = scene.addMesh(`UpperArm_${sideTag}_Mesh`, [gShMuscle, gShSurge]);
    const uArmIdx = scene.addNode({
      name: `UpperArm_${sideTag}`,
      meshIndex: uArmMesh,
      translation: shRest,
      parentIndex: torsoIdx,
    });

    // --- Muscular Forearm ([0.34, -0.40, ±0.22] -> sweeps forward to wrist at [+0.68, -0.02, ∓0.20]) ---
    const foreRest = [0.34, -0.40, sideSign * 0.22];
    const gFoMuscle = new PrimitiveGeom(mats.Mat_ArchonMuscle);
    const gFoSurge = new PrimitiveGeom(mats.Mat_ArchonSurge);

    gFoMuscle.addTubeAlongSpine(
      [
        { pos: [-0.02, 0.0, 0.0], rx: 0.17, ry: 0.17 },
        { pos: [0.34, -0.01, -sideSign * 0.10], rx: 0.21, ry: 0.20 },
        { pos: [0.68, -0.02, -sideSign * 0.20], rx: 0.19, ry: 0.21 },
      ],
      7,
      true,
      true
    );
    // Swept Elbow & Forearm Plasma Fin trailing backward
    gFoSurge.addLoft(
      [
        [
          [0.08, -0.04, sideSign * 0.12],
          [0.50, -0.05, -sideSign * 0.02],
          [0.50, 0.05, -sideSign * 0.02],
          [0.08, 0.04, sideSign * 0.12],
        ],
        [
          [-0.24, -0.02, sideSign * 0.28],
          [0.24, -0.03, sideSign * 0.16],
          [0.24, 0.03, sideSign * 0.16],
          [-0.24, 0.02, sideSign * 0.28],
        ],
      ],
      [[0.29, 0, sideSign * 0.05], [0.0, 0, sideSign * 0.22]],
      true,
      true
    );

    const foreMesh = scene.addMesh(`Forearm_${sideTag}_Mesh`, [gFoMuscle, gFoSurge]);
    const foreIdx = scene.addNode({
      name: `Forearm_${sideTag}`,
      meshIndex: foreMesh,
      translation: foreRest,
      parentIndex: uArmIdx,
    });

    // --- Heroic Crackling SURGING HAND ('SurgingHand_R/L' at [0.68, -0.02, ∓0.20] -> world [1.06, 1.90, ±0.94]) ---
    const handRest = [0.68, -0.02, -sideSign * 0.20];
    const gHandCore = new PrimitiveGeom(mats.Mat_ArchonCore);
    const gHandMuscle = new PrimitiveGeom(mats.Mat_ArchonMuscle);

    // Blazing White-Blue Palm Singularity Core
    gHandCore.addFacetedCrystal({
      center: [0.22, 0.02, -sideSign * 0.03],
      radii: [0.16, 0.14, 0.18],
      sectors: 8,
      stacks: 4,
    });

    // Broad Sculpted Energy Palm canted so RTS camera sees open splayed palm & claws!
    gHandMuscle.addChamferBox({
      center: [0.18, 0.02, 0.0],
      size: [0.36, 0.18, 0.42],
      rotDeg: [sideSign * 28, sideSign * 12, 8],
      topScale: [0.92, 0.94],
    });

    // 4 Heroic Splayed Hooked Energy Fingers + 1 Opposed Thumb
    const fingerSpecs = [
      { yOff: 0.14, zOff: -sideSign * 0.17, yTip: 0.25, zTip: -sideSign * 0.25, len: 0.46 },
      { yOff: 0.07, zOff: -sideSign * 0.06, yTip: 0.12, zTip: -sideSign * 0.11, len: 0.52 },
      { yOff: -0.02, zOff: sideSign * 0.06, yTip: -0.02, zTip: sideSign * 0.06, len: 0.50 },
      { yOff: -0.11, zOff: sideSign * 0.17, yTip: -0.17, zTip: sideSign * 0.21, len: 0.42 },
    ];
    for (const fs of fingerSpecs) {
      const knuckle = [0.32, fs.yOff, fs.zOff];
      const midJoint = [0.32 + fs.len * 0.56, (fs.yOff + fs.yTip) * 0.55 + 0.03, (fs.zOff + fs.zTip) * 0.5];
      const clawTip = [0.32 + fs.len, fs.yTip, fs.zTip];

      gHandMuscle.addTubeAlongSpine(
        [
          { pos: knuckle, rx: 0.062, ry: 0.054 },
          { pos: midJoint, rx: 0.048, ry: 0.044 },
          { pos: clawTip, rx: 0.020, ry: 0.020 },
        ],
        5,
        true,
        true
      );
      gHandCore.addTubeAlongSpine(
        [
          { pos: midJoint, rx: 0.028, ry: 0.028 },
          { pos: clawTip, rx: 0.015, ry: 0.015 },
        ],
        4,
        true,
        true
      );
    }

    // Opposed Surging Energy Thumb
    gHandMuscle.addTubeAlongSpine(
      [
        { pos: [0.16, 0.13, -sideSign * 0.18], rx: 0.064, ry: 0.056 },
        { pos: [0.35, 0.26, -sideSign * 0.29], rx: 0.048, ry: 0.042 },
        { pos: [0.52, 0.30, -sideSign * 0.24], rx: 0.022, ry: 0.022 },
      ],
      5,
      true,
      true
    );

    const handMesh = scene.addMesh(`SurgingHand_${sideTag}_Mesh`, [gHandCore, gHandMuscle]);
    const handIdx = scene.addNode({
      name: `SurgingHand_${sideTag}`,
      meshIndex: handMesh,
      translation: handRest,
      parentIndex: foreIdx,
    });

    // Dedicated 'HandSurge_R/L' Child Node: Curved Crackling Psionic Surge Crescents!
    const surgeRest = [0.24, 0.02, 0.0];
    const gSurgeArcs = new PrimitiveGeom(mats.Mat_ArchonSurge);
    const gSurgeCore = new PrimitiveGeom(mats.Mat_ArchonCore);

    // 3 Curved Multi-Station Crackling Psionic Surge Arcs enveloping the hand & surging forward!
    for (let a = 0; a < 3; a++) {
      const ph = ((2 * Math.PI) / 3) * a + (sideSign > 0 ? 0.42 : -0.42);
      const arcPts = [];
      for (let s = 0; s <= 5; s++) {
        const u = s / 5;
        const ang = ph + u * 2.25;
        const rad = (Math.sin(u * Math.PI) * 0.65 + 0.35) * 0.24;
        const taper = Math.sin(u * Math.PI) * 0.78 + 0.22;
        arcPts.push({
          pos: [
            -0.22 + u * 0.86,
            Math.sin(ang) * rad,
            Math.cos(ang) * rad - sideSign * u * 0.06,
          ],
          rx: 0.046 * taper,
          ry: 0.020 * taper,
        });
      }
      gSurgeArcs.addTubeAlongSpine(arcPts, 4, true, true);
    }
    gSurgeCore.addFacetedCrystal({
      center: [0.44, 0.02, -sideSign * 0.04],
      radii: [0.12, 0.060, 0.070],
      sectors: 6,
      stacks: 4,
    });

    const surgeMesh = scene.addMesh(`HandSurge_${sideTag}_Mesh`, [gSurgeCore, gSurgeArcs]);
    const surgeIdx = scene.addNode({
      name: `HandSurge_${sideTag}`,
      meshIndex: surgeMesh,
      translation: surgeRest,
      parentIndex: handIdx,
    });

    armRig[sideTag] = {
      uArmIdx,
      foreIdx,
      handIdx,
      surgeIdx,
    };
  }

  // =========================================================================
  // 4. Visible Bright Spherical Envelope ('SphericalEnvelope' at [0, 0.02, 0] -> world [0, 1.78, 0])
  //    2 High-Luminance Smooth Spherical Shells ([1.46, 1.48, 1.46] & [1.58, 1.62, 1.58] -> max.y = 3.4000!)
  //    + Twist-Free Spherical Corona Bands & Latitude Crescents -> bright spherical
  //    envelope read at RTS zoom, crystal-clear view of the muscular Archon inside,
  //    ZERO opaque outer shell!
  // =========================================================================
  const envRest = [0, 0.02, 0];
  const gEnvInner = new PrimitiveGeom(mats.Mat_EnvelopeInner);
  const gEnvMain = new PrimitiveGeom(mats.Mat_EnvelopeMain);

  gEnvInner.addFacetedCrystal({
    center: [0, 0, 0],
    radii: [1.46, 1.48, 1.46],
    sectors: 28,
    stacks: 16,
  });
  gEnvMain.addFacetedCrystal({
    center: [0, 0, 0],
    radii: [1.58, 1.62, 1.58],
    sectors: 28,
    stacks: 16,
    phaseRad: Math.PI / 28,
  });

  const envMesh = scene.addMesh('SphericalEnvelope_Mesh', [gEnvInner, gEnvMain]);
  const envIdx = scene.addNode({
    name: 'SphericalEnvelope',
    meshIndex: envMesh,
    translation: envRest,
    parentIndex: suspIdx,
  });

  // Twist-Free Spherical Corona Bands & Latitude Crescents ('EnvelopeCoronaSwirl')
  // Hugs the spherical envelope brightly in 3D while keeping the +X chest/face window clear!
  const gSwirlBright = new PrimitiveGeom(mats.Mat_EnvelopeSwirl);
  const gSwirlSurge = new PrimitiveGeom(mats.Mat_ArchonSurge);

  // Twin Canted Great-Circle Corona Bands wrapping around sides & back (open +X window!)
  for (const [rot, th0, th1] of [
    [[24, 0, -8], 0.46, Math.PI * 2 - 0.46],
    [[-24, 0, 8], 0.46, Math.PI * 2 - 0.46],
  ]) {
    gSwirlBright.addSphericalCoronaBand({
      radius: 1.595,
      thStart: th0,
      thEnd: th1,
      rotDeg: rot,
      widthTang: 0.052,
      thickRad: 0.014,
      steps: 18,
    });
  }

  // Continuous Upper (+38 deg) & Lower (-36 deg) Spherical Latitude Halo Rings (open +X window!)
  for (const [latDeg, thOpen] of [
    [38, 0.58],
    [-36, 0.54],
  ]) {
    const targetGeom = latDeg > 0 ? gSwirlBright : gSwirlSurge;
    targetGeom.addSphericalLatitudeBand({
      radius: 1.595,
      latDeg,
      thStart: thOpen,
      thEnd: Math.PI * 2 - thOpen,
      widthTang: 0.038,
      thickRad: 0.013,
      steps: 16,
    });
  }

  const swirlMesh = scene.addMesh('EnvelopeCoronaSwirl_Mesh', [gSwirlBright, gSwirlSurge]);
  const swirlIdx = scene.addNode({
    name: 'EnvelopeCoronaSwirl',
    meshIndex: swirlMesh,
    translation: [0, 0, 0],
    parentIndex: envIdx,
  });

  // =========================================================================
  // 5. Orbiting Split Runes ('OrbitRing_Outer' & 'OrbitRing_Inner')
  //    Sleek Crystalline Sapphire-Blue & Gold bifurcated runes on true circular
  //    orbit R = 2.142 -> exact ~4.70-across footprint (-2.3500 .. +2.3500)!
  // =========================================================================

  // 5A. Primary Equatorial Split-Rune Orbit ('OrbitRing_Outer' at [0, -0.04, 0] -> world Y = 1.72)
  const orbitOutRest = [0, -0.04, 0];
  const gOutGold = new PrimitiveGeom(mats.Mat_RuneGold);
  const gOutCrystal = new PrimitiveGeom(mats.Mat_RuneCrystal);
  const gOutEnergy = new PrimitiveGeom(mats.Mat_ArchonSurge);
  const gOutWake = new PrimitiveGeom(mats.Mat_OrbitalWake);
  const gOutTeam = new PrimitiveGeom(mats.Surf_TEAM);
  const gOutGlow = new PrimitiveGeom(mats.Surf_GLOW);

  const outerOrbitR = 2.142;
  const outerRuneAngles = [
    { deg: 30, yOff: 0.04, scale: 1.00, hasTeam: true },
    { deg: -30, yOff: 0.04, scale: 1.00, hasTeam: true },
    { deg: 90, yOff: 0.00, scale: 1.00, hasTeam: true },
    { deg: -90, yOff: 0.00, scale: 1.00, hasTeam: true },
    { deg: 138, yOff: -0.03, scale: 0.94, hasTeam: false },
    { deg: -138, yOff: -0.03, scale: 0.94, hasTeam: false },
    { deg: 180, yOff: 0.02, scale: 1.00, hasTeam: true },
  ];

  for (const ra of outerRuneAngles) {
    const rad = (ra.deg * Math.PI) / 180;
    const ca = Math.cos(rad), sa = Math.sin(rad);
    addSplitRuneGlyph({
      origin: [ca * outerOrbitR, ra.yOff, sa * outerOrbitR],
      outDir: [ca, 0.0, sa],
      upDir: [0, 1, 0],
      scale: ra.scale,
      gGold: gOutGold,
      gCrystal: gOutCrystal,
      gEnergy: gOutEnergy,
      gTeam: ra.hasTeam ? gOutTeam : null,
      gGlow: gOutGlow,
    });
  }

  // Translucent Pale-Blue Orbital Wake Trails linking the split runes along R = 2.08..2.15 (open +X channel!)
  for (const [deg0, deg1] of [
    [38, 82],
    [98, 130],
    [146, 172],
    [-82, -38],
    [-130, -98],
    [-172, -146],
  ]) {
    gOutWake.addConcentricArcStrip({
      rInner: 2.08,
      rOuter: 2.15,
      yBot: -0.015,
      yTop: 0.015,
      thStart: (deg0 * Math.PI) / 180,
      thEnd: (deg1 * Math.PI) / 180,
      steps: 5,
      bevelIn: 0.004,
    });
  }

  const orbitOutMesh = scene.addMesh('OrbitRing_Outer_Mesh', [
    gOutCrystal,
    gOutGold,
    gOutEnergy,
    gOutWake,
  ]);
  const orbitOutIdx = scene.addNode({
    name: 'OrbitRing_Outer',
    meshIndex: orbitOutMesh,
    translation: orbitOutRest,
    parentIndex: suspIdx,
  });

  {
    const otMesh = scene.addMesh('Surf_TEAM_OuterRunes', [gOutTeam]);
    scene.addNode({ name: 'Surf_TEAM_OuterRunes', meshIndex: otMesh, parentIndex: orbitOutIdx });

    const ogMesh = scene.addMesh('Surf_GLOW_OuterRuneSparks', [gOutGlow]);
    scene.addNode({ name: 'Surf_GLOW_OuterRuneSparks', meshIndex: ogMesh, parentIndex: orbitOutIdx });
  }

  // 5B. Secondary Tilted Lattice Split-Rune Orbit ('OrbitRing_Inner' at [0, 0.02, 0], canted 24 deg!)
  const orbitInRest = [0, 0.02, 0];
  const orbitInRestRot = quatFromEulerXYZ(24, 0, 12);
  const gInGold = new PrimitiveGeom(mats.Mat_RuneGold);
  const gInCrystal = new PrimitiveGeom(mats.Mat_RuneCrystal);
  const gInEnergy = new PrimitiveGeom(mats.Mat_ArchonSurge);
  const gInWake = new PrimitiveGeom(mats.Mat_OrbitalWake);
  const gInGlow = new PrimitiveGeom(mats.Surf_GLOW);

  for (const deg of [42, 138, -138, -42]) {
    const th = (deg * Math.PI) / 180;
    const ca = Math.cos(th), sa = Math.sin(th);
    addSplitRuneGlyph({
      origin: [ca * 1.82, 0, sa * 1.82],
      outDir: [ca, 0, sa],
      upDir: [0, 1, 0],
      scale: 0.72,
      gGold: gInGold,
      gCrystal: gInCrystal,
      gEnergy: gInEnergy,
      gTeam: null,
      gGlow: gInGlow,
    });
    gInWake.addConcentricArcStrip({
      rInner: 1.76,
      rOuter: 1.82,
      yBot: -0.012,
      yTop: 0.012,
      thStart: th - 0.50,
      thEnd: th + 0.50,
      steps: 5,
      bevelIn: 0.003,
    });
  }

  const orbitInMesh = scene.addMesh('OrbitRing_Inner_Mesh', [
    gInCrystal,
    gInGold,
    gInEnergy,
    gInWake,
  ]);
  const orbitInIdx = scene.addNode({
    name: 'OrbitRing_Inner',
    meshIndex: orbitInMesh,
    translation: orbitInRest,
    rotation: orbitInRestRot,
    parentIndex: suspIdx,
  });

  {
    const igMesh = scene.addMesh('Surf_GLOW_InnerRuneSparks', [gInGlow]);
    scene.addNode({ name: 'Surf_GLOW_InnerRuneSparks', meshIndex: igMesh, parentIndex: orbitInIdx });
  }

  // =========================================================================
  // 6. Baked Animations: 'idle', 'hover', 'attack', 'warp', 'death'
  //    Full rig reset coverage across clips; seamless float-exact loops on
  //    'idle' and 'hover'; strict min.y >= 0.0000 across all 5 clips!
  // =========================================================================

  const idQ = quatFromEulerXYZ(0, 0, 0);
  const unitS = [1, 1, 1];
  const rep = (val, n) => Array.from({ length: n }, () => val);

  // -------------------------------------------------------------------------
  // 6A. 'idle' (3.20s seamless suspended levitation, surging hands & 3D split-rune precession)
  // -------------------------------------------------------------------------
  const idleT = [0.0, 0.8, 1.6, 2.4, 3.2];
  scene.addAnimation('idle', [
    {
      nodeIndex: suspIdx,
      path: 'translation',
      times: idleT,
      values: [
        [0, 1.76, 0],
        [0, 1.86, 0],
        [0, 1.76, 0],
        [0, 1.68, 0],
        [0, 1.76, 0],
      ],
    },
    { nodeIndex: suspIdx, path: 'rotation', times: idleT, values: rep(idQ, 5) },
    { nodeIndex: suspIdx, path: 'scale', times: idleT, values: rep(unitS, 5) },
    {
      nodeIndex: bodyIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 4.0, -2.0),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -4.0, 1.5),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    { nodeIndex: bodyIdx, path: 'scale', times: idleT, values: rep(unitS, 5) },
    {
      nodeIndex: vortexIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(4, 24, -4),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-4, -24, 4),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -3.0, -2.0),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 3.0, 1.5),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 6.5, 2.5),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -6.5, -2.0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armRig.R.uArmIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(3, -4, 5),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-2, 3, -3),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    { nodeIndex: armRig.R.foreIdx, path: 'rotation', times: idleT, values: rep(idQ, 5) },
    {
      nodeIndex: armRig.R.handIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(6, -5, 6),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-5, 4, -5),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armRig.R.surgeIdx,
      path: 'scale',
      times: idleT,
      values: [
        [1.0, 1.0, 1.0],
        [1.24, 1.18, 1.18],
        [1.0, 1.0, 1.0],
        [0.88, 0.90, 0.90],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: armRig.L.uArmIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-3, 4, 5),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(2, -3, -3),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    { nodeIndex: armRig.L.foreIdx, path: 'rotation', times: idleT, values: rep(idQ, 5) },
    {
      nodeIndex: armRig.L.handIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-6, 5, 6),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(5, -4, -5),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armRig.L.surgeIdx,
      path: 'scale',
      times: idleT,
      values: [
        [1.0, 1.0, 1.0],
        [0.90, 0.92, 0.92],
        [1.0, 1.0, 1.0],
        [1.24, 1.18, 1.18],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: envIdx,
      path: 'scale',
      times: idleT,
      values: [
        [1.0, 1.0, 1.0],
        [1.035, 1.035, 1.035],
        [1.0, 1.0, 1.0],
        [0.975, 0.975, 0.975],
        [1.0, 1.0, 1.0],
      ],
    },
    { nodeIndex: envIdx, path: 'rotation', times: idleT, values: rep(idQ, 5) },
    {
      nodeIndex: swirlIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(8, 36, -6),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-8, -36, 6),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: orbitOutIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(5, 0, 0),
        quatFromEulerXYZ(0, 32, 5),
        quatFromEulerXYZ(-5, 0, 0),
        quatFromEulerXYZ(0, -32, -5),
        quatFromEulerXYZ(5, 0, 0),
      ],
    },
    { nodeIndex: orbitOutIdx, path: 'scale', times: idleT, values: rep(unitS, 5) },
    {
      nodeIndex: orbitInIdx,
      path: 'rotation',
      times: idleT,
      values: [
        orbitInRestRot,
        quatFromEulerXYZ(15, -46, 22),
        orbitInRestRot,
        quatFromEulerXYZ(33, 46, 4),
        orbitInRestRot,
      ],
    },
    { nodeIndex: orbitInIdx, path: 'scale', times: idleT, values: rep(unitS, 5) },
    {
      nodeIndex: groundRingIdx,
      path: 'scale',
      times: idleT,
      values: [
        [1.0, 1.0, 1.0],
        [0.95, 1.0, 0.95],
        [1.0, 1.0, 1.0],
        [1.04, 1.0, 1.04],
        [1.0, 1.0, 1.0],
      ],
    },
    { nodeIndex: groundRingIdx, path: 'rotation', times: idleT, values: rep(idQ, 5) },
  ]);

  // -------------------------------------------------------------------------
  // 6B. 'hover' (1.60s seamless forward-gliding aggressive Archon flight loop)
  // -------------------------------------------------------------------------
  const hoverT = [0.0, 0.4, 0.8, 1.2, 1.6];
  scene.addAnimation('hover', [
    {
      nodeIndex: suspIdx,
      path: 'translation',
      times: hoverT,
      values: [
        [0.06, 1.80, 0.0],
        [0.12, 1.88, 0.02],
        [0.06, 1.80, 0.0],
        [0.10, 1.73, -0.02],
        [0.06, 1.80, 0.0],
      ],
    },
    {
      nodeIndex: suspIdx,
      path: 'rotation',
      times: hoverT,
      values: [
        quatFromEulerXYZ(0, 0, -6.0),
        quatFromEulerXYZ(2.0, -2.5, -7.5),
        quatFromEulerXYZ(0, 0, -6.0),
        quatFromEulerXYZ(-2.0, 2.5, -4.5),
        quatFromEulerXYZ(0, 0, -6.0),
      ],
    },
    { nodeIndex: suspIdx, path: 'scale', times: hoverT, values: rep(unitS, 5) },
    {
      nodeIndex: bodyIdx,
      path: 'rotation',
      times: hoverT,
      values: [
        quatFromEulerXYZ(0, 0, -4.5),
        quatFromEulerXYZ(0, 4.0, -6.0),
        quatFromEulerXYZ(0, 0, -4.5),
        quatFromEulerXYZ(0, -4.0, -3.0),
        quatFromEulerXYZ(0, 0, -4.5),
      ],
    },
    { nodeIndex: bodyIdx, path: 'scale', times: hoverT, values: rep(unitS, 5) },
    {
      nodeIndex: vortexIdx,
      path: 'rotation',
      times: hoverT,
      values: [
        quatFromEulerXYZ(0, 0, -12),
        quatFromEulerXYZ(5, 26, -16),
        quatFromEulerXYZ(0, 0, -12),
        quatFromEulerXYZ(-5, -26, -8),
        quatFromEulerXYZ(0, 0, -12),
      ],
    },
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: hoverT,
      values: [
        quatFromEulerXYZ(0, 0, -2),
        quatFromEulerXYZ(0, -4, -3),
        quatFromEulerXYZ(0, 0, -2),
        quatFromEulerXYZ(0, 4, -1),
        quatFromEulerXYZ(0, 0, -2),
      ],
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: hoverT,
      values: [
        quatFromEulerXYZ(0, 0, 9),
        quatFromEulerXYZ(0, 4, 11),
        quatFromEulerXYZ(0, 0, 9),
        quatFromEulerXYZ(0, -4, 7),
        quatFromEulerXYZ(0, 0, 9),
      ],
    },
    // Both surging hands poised symmetrically forward along +X during flight!
    {
      nodeIndex: armRig.R.uArmIdx,
      path: 'rotation',
      times: hoverT,
      values: [
        quatFromEulerXYZ(0, 0, 6),
        quatFromEulerXYZ(2, -3, 10),
        quatFromEulerXYZ(0, 0, 6),
        quatFromEulerXYZ(-2, 2, 3),
        quatFromEulerXYZ(0, 0, 6),
      ],
    },
    { nodeIndex: armRig.R.foreIdx, path: 'rotation', times: hoverT, values: rep(idQ, 5) },
    { nodeIndex: armRig.R.handIdx, path: 'rotation', times: hoverT, values: rep(idQ, 5) },
    {
      nodeIndex: armRig.R.surgeIdx,
      path: 'scale',
      times: hoverT,
      values: [
        [1.14, 1.08, 1.08],
        [1.32, 1.22, 1.22],
        [1.14, 1.08, 1.08],
        [0.98, 0.96, 0.96],
        [1.14, 1.08, 1.08],
      ],
    },
    {
      nodeIndex: armRig.L.uArmIdx,
      path: 'rotation',
      times: hoverT,
      values: [
        quatFromEulerXYZ(0, 0, 6),
        quatFromEulerXYZ(2, -2, 3),
        quatFromEulerXYZ(0, 0, 6),
        quatFromEulerXYZ(-2, 3, 10),
        quatFromEulerXYZ(0, 0, 6),
      ],
    },
    { nodeIndex: armRig.L.foreIdx, path: 'rotation', times: hoverT, values: rep(idQ, 5) },
    { nodeIndex: armRig.L.handIdx, path: 'rotation', times: hoverT, values: rep(idQ, 5) },
    {
      nodeIndex: armRig.L.surgeIdx,
      path: 'scale',
      times: hoverT,
      values: [
        [1.14, 1.08, 1.08],
        [0.98, 0.96, 0.96],
        [1.14, 1.08, 1.08],
        [1.32, 1.22, 1.22],
        [1.14, 1.08, 1.08],
      ],
    },
    {
      nodeIndex: envIdx,
      path: 'scale',
      times: hoverT,
      values: [
        [1.02, 1.00, 1.02],
        [1.05, 1.02, 1.05],
        [1.02, 1.00, 1.02],
        [0.99, 0.98, 0.99],
        [1.02, 1.00, 1.02],
      ],
    },
    { nodeIndex: envIdx, path: 'rotation', times: hoverT, values: rep(idQ, 5) },
    {
      nodeIndex: swirlIdx,
      path: 'rotation',
      times: hoverT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(12, 48, -10),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-12, -48, 10),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: orbitOutIdx,
      path: 'rotation',
      times: hoverT,
      values: [
        quatFromEulerXYZ(0, 0, -4),
        quatFromEulerXYZ(6, 38, -6),
        quatFromEulerXYZ(0, 0, -4),
        quatFromEulerXYZ(-6, -38, -2),
        quatFromEulerXYZ(0, 0, -4),
      ],
    },
    { nodeIndex: orbitOutIdx, path: 'scale', times: hoverT, values: rep(unitS, 5) },
    {
      nodeIndex: orbitInIdx,
      path: 'rotation',
      times: hoverT,
      values: [
        orbitInRestRot,
        quatFromEulerXYZ(12, -58, 20),
        orbitInRestRot,
        quatFromEulerXYZ(35, 58, 4),
        orbitInRestRot,
      ],
    },
    { nodeIndex: orbitInIdx, path: 'scale', times: hoverT, values: rep(unitS, 5) },
    {
      nodeIndex: groundRingIdx,
      path: 'scale',
      times: hoverT,
      values: [
        [0.98, 1.0, 0.98],
        [0.90, 1.0, 0.90],
        [0.98, 1.0, 0.98],
        [1.05, 1.0, 1.05],
        [0.98, 1.0, 0.98],
      ],
    },
    { nodeIndex: groundRingIdx, path: 'rotation', times: hoverT, values: rep(idQ, 5) },
  ]);

  // -------------------------------------------------------------------------
  // 6C. 'attack' (1.00s Twin Surging-Hands Psionic Shockwave Blast toward +X Muzzle!)
  // -------------------------------------------------------------------------
  const atkT = [0.0, 0.20, 0.40, 0.72, 1.00];
  scene.addAnimation('attack', [
    {
      nodeIndex: suspIdx,
      path: 'translation',
      times: atkT,
      values: [
        [0.00, 1.76, 0],
        [-0.12, 1.82, 0],
        [0.24, 1.80, 0],
        [-0.04, 1.75, 0],
        [0.00, 1.76, 0],
      ],
    },
    { nodeIndex: suspIdx, path: 'rotation', times: atkT, values: rep(idQ, 5) },
    { nodeIndex: suspIdx, path: 'scale', times: atkT, values: rep(unitS, 5) },
    {
      nodeIndex: bodyIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 8),
        quatFromEulerXYZ(0, 0, -14),
        quatFromEulerXYZ(0, 0, 3),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    { nodeIndex: bodyIdx, path: 'scale', times: atkT, values: rep(unitS, 5) },
    { nodeIndex: vortexIdx, path: 'rotation', times: atkT, values: rep(idQ, 5) },
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 6),
        quatFromEulerXYZ(0, 0, -8),
        quatFromEulerXYZ(0, 0, 2),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -6),
        quatFromEulerXYZ(0, 0, 14),
        quatFromEulerXYZ(0, 0, -2),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armRig.R.uArmIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-10, -22, -12),
        quatFromEulerXYZ(6, 20, 22),
        quatFromEulerXYZ(2, 5, 5),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armRig.R.foreIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -12, 8),
        quatFromEulerXYZ(0, 16, 10),
        quatFromEulerXYZ(0, 4, 2),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armRig.R.handIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-12, -10, -8),
        quatFromEulerXYZ(12, 14, 16),
        quatFromEulerXYZ(3, 3, 3),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armRig.R.surgeIdx,
      path: 'scale',
      times: atkT,
      values: [
        [1.0, 1.0, 1.0],
        [1.30, 1.25, 1.25],
        [1.72, 1.50, 1.50],
        [1.12, 1.08, 1.08],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: armRig.L.uArmIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(10, 22, -12),
        quatFromEulerXYZ(-6, -20, 22),
        quatFromEulerXYZ(-2, -5, 5),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armRig.L.foreIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 12, 8),
        quatFromEulerXYZ(0, -16, 10),
        quatFromEulerXYZ(0, -4, 2),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armRig.L.handIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(12, 10, -8),
        quatFromEulerXYZ(-12, -14, 16),
        quatFromEulerXYZ(-3, -3, 3),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: armRig.L.surgeIdx,
      path: 'scale',
      times: atkT,
      values: [
        [1.0, 1.0, 1.0],
        [1.30, 1.25, 1.25],
        [1.72, 1.50, 1.50],
        [1.12, 1.08, 1.08],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: envIdx,
      path: 'scale',
      times: atkT,
      values: [
        [1.0, 1.0, 1.0],
        [0.94, 0.96, 0.94],
        [1.10, 1.06, 1.06],
        [0.98, 0.99, 0.98],
        [1.0, 1.0, 1.0],
      ],
    },
    { nodeIndex: envIdx, path: 'rotation', times: atkT, values: rep(idQ, 5) },
    { nodeIndex: swirlIdx, path: 'rotation', times: atkT, values: rep(idQ, 5) },
    {
      nodeIndex: orbitOutIdx,
      path: 'rotation',
      times: atkT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -18, 6),
        quatFromEulerXYZ(0, 24, -10),
        quatFromEulerXYZ(0, 6, -2),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: orbitOutIdx,
      path: 'scale',
      times: atkT,
      values: [
        [1.0, 1.0, 1.0],
        [0.92, 1.0, 0.92],
        [1.08, 1.05, 1.08],
        [1.01, 1.0, 1.01],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: orbitInIdx,
      path: 'rotation',
      times: atkT,
      values: [
        orbitInRestRot,
        quatFromEulerXYZ(34, -30, 22),
        quatFromEulerXYZ(10, 48, 0),
        quatFromEulerXYZ(22, 12, 10),
        orbitInRestRot,
      ],
    },
    { nodeIndex: orbitInIdx, path: 'scale', times: atkT, values: rep(unitS, 5) },
    { nodeIndex: groundRingIdx, path: 'scale', times: atkT, values: rep(unitS, 5) },
    { nodeIndex: groundRingIdx, path: 'rotation', times: atkT, values: rep(idQ, 5) },
  ]);

  // -------------------------------------------------------------------------
  // 6D. 'warp' (1.40s Archon Psionic Lattice Singularity Merge / Warp-In!)
  // -------------------------------------------------------------------------
  const warpT = [0.0, 0.32, 0.68, 1.05, 1.40];
  scene.addAnimation('warp', [
    {
      nodeIndex: suspIdx,
      path: 'translation',
      times: warpT,
      values: [
        [0, 1.48, 0],
        [0, 1.98, 0],
        [0, 1.94, 0],
        [0, 1.79, 0],
        [0, 1.76, 0],
      ],
    },
    {
      nodeIndex: suspIdx,
      path: 'rotation',
      times: warpT,
      values: [
        quatFromEulerXYZ(0, -140, 0),
        quatFromEulerXYZ(0, -48, 0),
        quatFromEulerXYZ(0, 10, 0),
        quatFromEulerXYZ(0, -2, 0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    { nodeIndex: suspIdx, path: 'scale', times: warpT, values: rep(unitS, 5) },
    {
      nodeIndex: bodyIdx,
      path: 'scale',
      times: warpT,
      values: [
        [0.18, 0.24, 0.18],
        [0.78, 0.92, 0.78],
        [1.12, 1.14, 1.12],
        [1.02, 1.02, 1.02],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: bodyIdx,
      path: 'rotation',
      times: warpT,
      values: [
        quatFromEulerXYZ(0, 0, 12),
        quatFromEulerXYZ(0, 0, 16),
        quatFromEulerXYZ(0, 0, -6),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    { nodeIndex: vortexIdx, path: 'rotation', times: warpT, values: rep(idQ, 5) },
    { nodeIndex: torsoIdx, path: 'rotation', times: warpT, values: rep(idQ, 5) },
    { nodeIndex: headIdx, path: 'rotation', times: warpT, values: rep(idQ, 5) },
    {
      nodeIndex: armRig.R.uArmIdx,
      path: 'rotation',
      times: warpT,
      values: [
        quatFromEulerXYZ(16, 24, 28),
        quatFromEulerXYZ(-20, -32, -18),
        quatFromEulerXYZ(-12, -20, 16),
        quatFromEulerXYZ(-3, -5, 3),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    { nodeIndex: armRig.R.foreIdx, path: 'rotation', times: warpT, values: rep(idQ, 5) },
    { nodeIndex: armRig.R.handIdx, path: 'rotation', times: warpT, values: rep(idQ, 5) },
    {
      nodeIndex: armRig.R.surgeIdx,
      path: 'scale',
      times: warpT,
      values: [
        [0.4, 0.4, 0.4],
        [1.45, 1.45, 1.45],
        [1.60, 1.50, 1.50],
        [1.10, 1.08, 1.08],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: armRig.L.uArmIdx,
      path: 'rotation',
      times: warpT,
      values: [
        quatFromEulerXYZ(-16, -24, 28),
        quatFromEulerXYZ(20, 32, -18),
        quatFromEulerXYZ(12, 20, 16),
        quatFromEulerXYZ(3, 5, 3),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    { nodeIndex: armRig.L.foreIdx, path: 'rotation', times: warpT, values: rep(idQ, 5) },
    { nodeIndex: armRig.L.handIdx, path: 'rotation', times: warpT, values: rep(idQ, 5) },
    {
      nodeIndex: armRig.L.surgeIdx,
      path: 'scale',
      times: warpT,
      values: [
        [0.4, 0.4, 0.4],
        [1.45, 1.45, 1.45],
        [1.60, 1.50, 1.50],
        [1.10, 1.08, 1.08],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: envIdx,
      path: 'scale',
      times: warpT,
      values: [
        [0.22, 0.22, 0.22],
        [0.88, 0.88, 0.88],
        [1.12, 1.12, 1.12],
        [1.02, 1.02, 1.02],
        [1.0, 1.0, 1.0],
      ],
    },
    { nodeIndex: envIdx, path: 'rotation', times: warpT, values: rep(idQ, 5) },
    {
      nodeIndex: swirlIdx,
      path: 'rotation',
      times: warpT,
      values: [
        quatFromEulerXYZ(30, 150, -25),
        quatFromEulerXYZ(15, 75, -12),
        quatFromEulerXYZ(-6, -16, 4),
        quatFromEulerXYZ(0, 4, 0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: orbitOutIdx,
      path: 'scale',
      times: warpT,
      values: [
        [0.32, 0.32, 0.32],
        [0.82, 0.82, 0.82],
        [1.08, 1.08, 1.08],
        [1.01, 1.01, 1.01],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: orbitOutIdx,
      path: 'rotation',
      times: warpT,
      values: [
        quatFromEulerXYZ(0, 135, 0),
        quatFromEulerXYZ(0, 55, 0),
        quatFromEulerXYZ(0, -12, 0),
        quatFromEulerXYZ(0, 2, 0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    { nodeIndex: orbitInIdx, path: 'rotation', times: warpT, values: rep(orbitInRestRot, 5) },
    {
      nodeIndex: orbitInIdx,
      path: 'scale',
      times: warpT,
      values: [
        [0.28, 0.28, 0.28],
        [0.85, 0.85, 0.85],
        [1.10, 1.10, 1.10],
        [1.02, 1.02, 1.02],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: groundRingIdx,
      path: 'scale',
      times: warpT,
      values: [
        [0.25, 0.45, 0.25],
        [0.85, 1.00, 0.85],
        [1.08, 1.00, 1.08],
        [1.01, 1.00, 1.01],
        [1.00, 1.00, 1.00],
      ],
    },
    { nodeIndex: groundRingIdx, path: 'rotation', times: warpT, values: rep(idQ, 5) },
  ]);

  // -------------------------------------------------------------------------
  // 6E. 'death' (1.35s Unstable Psionic Overload Surge & Singularity Implosion!)
  // -------------------------------------------------------------------------
  const deathT = [0.0, 0.28, 0.72, 1.10, 1.35];
  scene.addAnimation('death', [
    {
      nodeIndex: suspIdx,
      path: 'translation',
      times: deathT,
      values: [
        [0, 1.76, 0],
        [-0.06, 2.02, 0],
        [0, 1.02, 0],
        [0, 0.34, 0],
        [0, 0.30, 0],
      ],
    },
    {
      nodeIndex: suspIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(6, 18, 14),
        quatFromEulerXYZ(-10, -42, -12),
        quatFromEulerXYZ(-14, -75, -16),
        quatFromEulerXYZ(-14, -75, -16),
      ],
    },
    { nodeIndex: suspIdx, path: 'scale', times: deathT, values: rep(unitS, 5) },
    {
      nodeIndex: bodyIdx,
      path: 'scale',
      times: deathT,
      values: [
        [1.0, 1.0, 1.0],
        [1.16, 1.18, 1.16],
        [0.36, 0.42, 0.36],
        [0.06, 0.06, 0.06],
        [0.05, 0.05, 0.05],
      ],
    },
    { nodeIndex: bodyIdx, path: 'rotation', times: deathT, values: rep(idQ, 5) },
    { nodeIndex: vortexIdx, path: 'rotation', times: deathT, values: rep(idQ, 5) },
    { nodeIndex: torsoIdx, path: 'rotation', times: deathT, values: rep(idQ, 5) },
    { nodeIndex: headIdx, path: 'rotation', times: deathT, values: rep(idQ, 5) },
    {
      nodeIndex: armRig.R.uArmIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-22, -28, 24),
        quatFromEulerXYZ(14, 20, -20),
        quatFromEulerXYZ(20, 26, -26),
        quatFromEulerXYZ(20, 26, -26),
      ],
    },
    { nodeIndex: armRig.R.foreIdx, path: 'rotation', times: deathT, values: rep(idQ, 5) },
    { nodeIndex: armRig.R.handIdx, path: 'rotation', times: deathT, values: rep(idQ, 5) },
    { nodeIndex: armRig.R.surgeIdx, path: 'scale', times: deathT, values: rep(unitS, 5) },
    {
      nodeIndex: armRig.L.uArmIdx,
      path: 'rotation',
      times: deathT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(22, 28, 24),
        quatFromEulerXYZ(-14, -20, -20),
        quatFromEulerXYZ(-20, -26, -26),
        quatFromEulerXYZ(-20, -26, -26),
      ],
    },
    { nodeIndex: armRig.L.foreIdx, path: 'rotation', times: deathT, values: rep(idQ, 5) },
    { nodeIndex: armRig.L.handIdx, path: 'rotation', times: deathT, values: rep(idQ, 5) },
    { nodeIndex: armRig.L.surgeIdx, path: 'scale', times: deathT, values: rep(unitS, 5) },
    {
      nodeIndex: envIdx,
      path: 'scale',
      times: deathT,
      values: [
        [1.0, 1.0, 1.0],
        [1.16, 1.16, 1.16],
        [0.38, 0.38, 0.38],
        [0.07, 0.07, 0.07],
        [0.05, 0.05, 0.05],
      ],
    },
    { nodeIndex: envIdx, path: 'rotation', times: deathT, values: rep(idQ, 5) },
    { nodeIndex: swirlIdx, path: 'rotation', times: deathT, values: rep(idQ, 5) },
    { nodeIndex: orbitOutIdx, path: 'rotation', times: deathT, values: rep(idQ, 5) },
    {
      nodeIndex: orbitOutIdx,
      path: 'scale',
      times: deathT,
      values: [
        [1.0, 1.0, 1.0],
        [1.12, 1.08, 1.12],
        [0.44, 0.36, 0.44],
        [0.10, 0.08, 0.10],
        [0.08, 0.06, 0.08],
      ],
    },
    { nodeIndex: orbitInIdx, path: 'rotation', times: deathT, values: rep(orbitInRestRot, 5) },
    {
      nodeIndex: orbitInIdx,
      path: 'scale',
      times: deathT,
      values: [
        [1.0, 1.0, 1.0],
        [1.15, 1.15, 1.15],
        [0.34, 0.34, 0.34],
        [0.07, 0.07, 0.07],
        [0.05, 0.05, 0.05],
      ],
    },
    {
      nodeIndex: groundRingIdx,
      path: 'scale',
      times: deathT,
      values: [
        [1.0, 1.0, 1.0],
        [1.18, 1.0, 1.18],
        [0.48, 0.5, 0.48],
        [0.12, 0.2, 0.12],
        [0.08, 0.2, 0.08],
      ],
    },
    { nodeIndex: groundRingIdx, path: 'rotation', times: deathT, values: rep(idQ, 5) },
  ]);

  return scene.buildGLB('LatticeArchonScene');
}

// ---------------------------------------------------------------------------
// Self-Validation Summary & CLI Entry Point
// ---------------------------------------------------------------------------

function summarizeArchonAsset(filename, glbBuffer, gltf) {
  let totalVerts = 0;
  let totalTris = 0;
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
      }
    }
  });

  const anchors = {};
  gltf.nodes.forEach((n, nIdx) => {
    if (n.name === 'Muzzle' || n.name === 'CastOrigin') {
      anchors[n.name] = worldPoint(nIdx, [0, 0, 0]).map((v) => Number(v.toFixed(4)));
    }
  });

  const allNodes = gltf.nodes.map((n) => n.name);
  const teamNodes = allNodes.filter((n) => n.startsWith('Surf_TEAM_'));
  const glowNodes = allNodes.filter((n) => n.startsWith('Surf_GLOW_'));
  const animations = (gltf.animations || []).map((a) => a.name);

  return {
    filename,
    bytes: glbBuffer.length,
    verts: totalVerts,
    tris: totalTris,
    min: globalMin.map((x) => Number(x.toFixed(4))),
    max: globalMax.map((x) => Number(x.toFixed(4))),
    size: [
      Number((globalMax[0] - globalMin[0]).toFixed(4)),
      Number((globalMax[1] - globalMin[1]).toFixed(4)),
      Number((globalMax[2] - globalMin[2]).toFixed(4)),
    ],
    anchors,
    allNodes,
    teamNodes,
    glowNodes,
    animations,
  };
}

function main() {
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
  fs.mkdirSync(outDir, { recursive: true });

  const { glbBuffer, gltf } = buildLatticeArchonGLB();
  const fullPath = path.join(outDir, 'lattice_archon.glb');
  fs.writeFileSync(fullPath, glbBuffer);

  const summary = summarizeArchonAsset('lattice_archon.glb', glbBuffer, gltf);
  console.log(JSON.stringify([summary], null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildLatticeArchonGLB,
};
