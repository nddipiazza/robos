#!/usr/bin/env node
'use strict';

/**
 * Deterministic Standalone Procedural GLB Generator for Starfall Command
 * Faction: Aurelian Concord — Veil Covert Branch (Dark Templar & Dark Shrine Counterparts)
 *
 * Outputs ONLY inside target directory (default __dirname):
 *   1. duskblade.glb    — Light melee infantry (~2.20 units tall, Y=0, +X forward) with a
 *                         sculpted mystic hood, split indigo armor with pale moonstone trim,
 *                         flowing split veil mantle, and a single long pale energy blade
 *                         engineered to remain unmistakably readable under cloak transparency.
 *                         Anchor: 'BladeTip'.
 *                         Accent nodes: Surf_TEAM_*, Surf_GLOW_*.
 *                         Animations: 'idle', 'walk', 'attack', 'cast', 'death'.
 *   2. veil_sanctum.glb — 3x3 narrow dark stone research shrine (< 6.8 units across, Y=0,
 *                         +X forward) with tall inward-arching obsidian-indigo monoliths,
 *                         crisp pale moonstone trim, violet ritual glow, and a suspended
 *                         faceted void crystal with gyroscopic containment rings.
 *                         Accent nodes: Surf_TEAM_*, Surf_GLOW_*.
 *                         Animations: 'idle' (seamless loop).
 *
 * Reuses the exact GLB conventions in generate_concord_mirage.cjs.
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

  addCyclicRingLoft(rings, ringCenters) {
    const R = rings.length;
    const M = rings[0].length;
    for (let r = 0; r < R; r++) {
      const rNext = (r + 1) % R;
      const cm = vLerp(ringCenters[r], ringCenters[rNext], 0.5);
      for (let i = 0; i < M; i++) {
        const j = (i + 1) % M;
        const a = rings[r][i], b = rings[r][j], c = rings[rNext][j], d = rings[rNext][i];
        const qMid = [
          (a[0] + b[0] + c[0] + d[0]) * 0.25,
          (a[1] + b[1] + c[1] + d[1]) * 0.25,
          (a[2] + b[2] + c[2] + d[2]) * 0.25,
        ];
        this.addQuad(a, b, c, d, vSub(qMid, cm));
      }
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

  addTubeAlongSpine(stations, sides = 6, capStart = true, capEnd = true, phaseOffset = null) {
    if (stations.length < 2) return;
    const rings = [];
    const centers = [];
    let prevUp = [0, 1, 0];
    const ph = phaseOffset !== null ? phaseOffset : Math.PI / sides;

    for (let k = 0; k < stations.length; k++) {
      const cur = stations[k].pos;
      let tang;
      if (k === 0) tang = vNorm(vSub(stations[1].pos, cur));
      else if (k === stations.length - 1) tang = vNorm(vSub(cur, stations[k - 1].pos));
      else tang = vNorm(vSub(stations[k + 1].pos, stations[k - 1].pos));

      let refUp = stations[k].upHint || prevUp;
      let side = vCross(tang, refUp);
      if (vLen(side) < 1e-4) side = vCross(tang, [0, 0, 1]);
      if (vLen(side) < 1e-4) side = vCross(tang, [1, 0, 0]);
      side = vNorm(side);
      const up = vNorm(vCross(side, tang));
      prevUp = up;

      const rx = stations[k].rx ?? stations[k].r ?? 0.12;
      const ry = stations[k].ry ?? stations[k].r ?? 0.12;
      const ring = [];
      for (let i = 0; i < sides; i++) {
        const th = (2 * Math.PI * i) / sides + ph;
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
    scaleX = 1.0,
    scaleZ = 1.0,
  }) {
    const rings = [];
    const centers = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const th = thStart + (thEnd - thStart) * u;
      const c = Math.cos(th), s = Math.sin(th);
      const rMid = (rInner + rOuter) * 0.5;
      rings.push([
        [cx + c * rInner * scaleX, yBot, cz + s * rInner * scaleZ],
        [cx + c * rOuter * scaleX, yBot, cz + s * rOuter * scaleZ],
        [cx + c * (rOuter - bevelIn) * scaleX, yTop, cz + s * (rOuter - bevelIn) * scaleZ],
        [cx + c * (rInner + bevelIn) * scaleX, yTop, cz + s * (rInner + bevelIn) * scaleZ],
      ]);
      centers.push([cx + c * rMid * scaleX, (yBot + yTop) * 0.5, cz + s * rMid * scaleZ]);
    }
    this.addLoft(rings, centers, true, true);
  }
}

// ---------------------------------------------------------------------------
// glTF 2.0 Binary (.glb) Scene Builder (Matches generate_concord_mirage.cjs)
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

  buildGLB(sceneName = 'ConcordVeilScene') {
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
        generator: 'StarfallCommand-ConcordVeilGenerator-1.0',
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
// Palette Factories: Concord Veil Covert Lineage (Indigo, Pale Trim, Void Violet)
// ---------------------------------------------------------------------------

function createDuskbladeMaterials(scene) {
  return {
    Surf_TEAM: scene.addMaterial({
      name: 'Surf_TEAM_Panel',
      hex: '#3c7ef0',
      metallic: 0.22,
      roughness: 0.34,
      emissiveHex: '#1b4294',
      emissiveBoost: 0.58,
    }),
    Surf_GLOW: scene.addMaterial({
      name: 'Surf_GLOW_Accent',
      hex: '#b98cff',
      metallic: 0.05,
      roughness: 0.14,
      emissiveHex: '#9d66ff',
      emissiveBoost: 1.85,
    }),
    // Deep shadow undersuit & cowl interior
    Mat_ShadowUndersuit: scene.addMaterial({
      name: 'Mat_ShadowUndersuit',
      hex: '#121322',
      metallic: 0.22,
      roughness: 0.66,
    }),
    // Mystic Nocturnal Indigo Hood & Flowing Split Mantle Cloth
    Mat_HoodIndigo: scene.addMaterial({
      name: 'Mat_HoodIndigo',
      hex: '#1e204a',
      metallic: 0.14,
      roughness: 0.48,
      emissiveHex: '#0c0d29',
      emissiveBoost: 0.40,
    }),
    // Split Indigo Primary Armor Plates (deep midnight violet-indigo, distinct from blue Surf_TEAM!)
    Mat_IndigoArmor: scene.addMaterial({
      name: 'Mat_IndigoArmor',
      hex: '#26285e',
      metallic: 0.46,
      roughness: 0.32,
      emissiveHex: '#101136',
      emissiveBoost: 0.45,
    }),
    // Lighter Dusk-Indigo Bevel Highlight (crisp facet separation uncloaked & cloaked!)
    Mat_IndigoBright: scene.addMaterial({
      name: 'Mat_IndigoBright',
      hex: '#383b82',
      metallic: 0.42,
      roughness: 0.28,
      emissiveHex: '#181a4a',
      emissiveBoost: 0.50,
    }),
    // Crisp Pale Moonstone-Silver Trim (anchors hood & split-armor edges when cloaked!)
    Mat_PaleTrim: scene.addMaterial({
      name: 'Mat_PaleTrim',
      hex: '#e2e8f8',
      metallic: 0.56,
      roughness: 0.24,
      emissiveHex: '#525e82',
      emissiveBoost: 0.45,
    }),
    // Glowing Violet Void Conduit in the clefts of the split armor
    Mat_VoidViolet: scene.addMaterial({
      name: 'Mat_VoidViolet',
      hex: '#bc6eff',
      metallic: 0.06,
      roughness: 0.16,
      emissiveHex: '#9d42ff',
      emissiveBoost: 1.80,
    }),
    // Single Long Pale Energy Blade — Luminous Moon-White Cutting Edge
    Mat_PaleBladeCore: scene.addMaterial({
      name: 'Mat_PaleBladeCore',
      hex: '#f4f8ff',
      metallic: 0.04,
      roughness: 0.08,
      emissiveHex: '#e6f1ff',
      emissiveBoost: 2.20,
    }),
    // Single Long Pale Energy Blade — Pale Ice-Lavender Inner Fuller Spine (gives crisp 2-tone blade detail!)
    Mat_PaleBladeFuller: scene.addMaterial({
      name: 'Mat_PaleBladeFuller',
      hex: '#bfd6ff',
      metallic: 0.10,
      roughness: 0.14,
      emissiveHex: '#8cb4ff',
      emissiveBoost: 1.45,
    }),
    // Single Long Pale Energy Blade — Shimmering Translucent Pale Warp-Edge Corona
    Mat_PaleBladeCorona: scene.addMaterial({
      name: 'Mat_PaleBladeCorona',
      hex: '#cce0ff',
      alpha: 0.42,
      metallic: 0.0,
      roughness: 0.12,
      emissiveHex: '#a8ccff',
      emissiveBoost: 1.65,
      alphaMode: 'BLEND',
      doubleSided: true,
    }),
  };
}

function createVeilSanctumMaterials(scene) {
  return {
    Surf_TEAM: scene.addMaterial({
      name: 'Surf_TEAM_Panel',
      hex: '#3c7ef0',
      metallic: 0.22,
      roughness: 0.36,
      emissiveHex: '#2252b5',
      emissiveBoost: 0.50,
    }),
    Surf_GLOW: scene.addMaterial({
      name: 'Surf_GLOW_Accent',
      hex: '#c388ff',
      metallic: 0.04,
      roughness: 0.16,
      emissiveHex: '#a352ff',
      emissiveBoost: 1.80,
    }),
    // Carved Monolithic Dark Obsidian-Basalt Stone (primary narrow shrine body)
    Mat_DarkStone: scene.addMaterial({
      name: 'Mat_DarkStone',
      hex: '#1c2133',
      metallic: 0.24,
      roughness: 0.56,
    }),
    // Deeper Abyssal Slate-Obsidian Plinth & Recessed Chamber Stone
    Mat_ObsidianDeep: scene.addMaterial({
      name: 'Mat_ObsidianDeep',
      hex: '#121522',
      metallic: 0.28,
      roughness: 0.62,
    }),
    // Nocturnal Indigo-Slate Carved Monolith Flank Stone (ties shrine to Duskblade's Concord Veil aesthetic)
    Mat_IndigoStone: scene.addMaterial({
      name: 'Mat_IndigoStone',
      hex: '#28304d',
      metallic: 0.30,
      roughness: 0.46,
    }),
    // Pale Silver-Ivory / Moonstone Architectural Trim
    Mat_PaleTrim: scene.addMaterial({
      name: 'Mat_PaleTrim',
      hex: '#d9e0f2',
      metallic: 0.46,
      roughness: 0.28,
      emissiveHex: '#353d54',
      emissiveBoost: 0.30,
    }),
    // Bright Polished Pale Moonstone Spire-Arris & Crown Bezel
    Mat_PaleBright: scene.addMaterial({
      name: 'Mat_PaleBright',
      hex: '#eef3ff',
      metallic: 0.52,
      roughness: 0.22,
      emissiveHex: '#495472',
      emissiveBoost: 0.38,
    }),
    // Suspended Void Crystal — Deep Abyssal Void-Amethyst Core Facets
    Mat_VoidCore: scene.addMaterial({
      name: 'Mat_VoidCore',
      hex: '#220b45',
      metallic: 0.32,
      roughness: 0.16,
      emissiveHex: '#4d169e',
      emissiveBoost: 0.95,
    }),
    // Vivid Violet Ritual Glow, Ley-Channels & Void Crystal Rift Seams
    Mat_VioletGlow: scene.addMaterial({
      name: 'Mat_VioletGlow',
      hex: '#bd6bff',
      metallic: 0.04,
      roughness: 0.14,
      emissiveHex: '#9e3fff',
      emissiveBoost: 1.90,
    }),
    // Intense Pale-Violet Focal Core & Crystal Crown Tips
    Mat_VioletCoreBright: scene.addMaterial({
      name: 'Mat_VioletCoreBright',
      hex: '#e7c2ff',
      metallic: 0.02,
      roughness: 0.10,
      emissiveHex: '#d494ff',
      emissiveBoost: 2.15,
    }),
    // Translucent Void Suspension Beam & Harmonic Field Aura
    Mat_VoidField: scene.addMaterial({
      name: 'Mat_VoidField',
      hex: '#9b4dff',
      alpha: 0.42,
      metallic: 0.0,
      roughness: 0.16,
      emissiveHex: '#7e2ce0',
      emissiveBoost: 1.65,
      alphaMode: 'BLEND',
      doubleSided: true,
    }),
  };
}

// ---------------------------------------------------------------------------
// Asset 1: duskblade.glb
// Aurelian Concord Duskblade (Dark Templar counterpart)
// - Light melee infantry (~2.20 units tall, floor at Y=0.0000, +X forward)
// - Sculpted mystic hood with pale moonstone brow trim & glowing visor slits
// - Split indigo armor plates across chest, shoulders, waist & greaves + split veil mantle
// - Single long pale energy blade on right weapon arm + 'BladeTip' anchor node
// - Engineered for high silhouette & edge contrast when cloak transparency is applied
// - Surf_TEAM_* and Surf_GLOW_* accent nodes
// - Animations: 'idle', 'walk', 'attack', 'cast', 'death'
// ---------------------------------------------------------------------------

function buildDuskbladeGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createDuskbladeMaterials(scene);

  const rootIdx = scene.addNode({ name: 'Duskblade', translation: [0, 0, 0] });

  // -------------------------------------------------------------------------
  // 1. Pelvis & Split Indigo Hip Tassets ('Pelvis' at [0, 0.96, 0])
  // -------------------------------------------------------------------------
  const pelvisRest = [0, 0.96, 0];
  const gPelvisUnder = new PrimitiveGeom(mats.Mat_ShadowUndersuit);
  const gPelvisIndigo = new PrimitiveGeom(mats.Mat_IndigoArmor);
  const gPelvisTrim = new PrimitiveGeom(mats.Mat_PaleTrim);
  const gPelvisViolet = new PrimitiveGeom(mats.Mat_VoidViolet);

  // Compact agile shadow-undersuit pelvis core
  gPelvisUnder.addChamferBox({
    center: [0, 0.02, 0],
    size: [0.25, 0.19, 0.34],
    topScale: [0.94, 0.95],
  });
  // Pale moonstone waist-belt chevron buckle (split left/right around violet waist gem)
  for (const side of [-1, 1]) {
    gPelvisTrim.addChamferBox({
      center: [0.02, 0.10, side * 0.11],
      size: [0.29, 0.055, 0.16],
      rotDeg: [side * -6, 0, 0],
      topScale: [1.02, 1.0],
    });
    // Split Indigo Hip Tassets (paired angled plates on -Z and +Z hips with pale trim borders!)
    gPelvisIndigo.addChamferBox({
      center: [0.00, -0.09, side * 0.23],
      size: [0.29, 0.27, 0.065],
      rotDeg: [side * 15, 0, -4],
      topScale: [0.84, 0.88],
    });
    gPelvisTrim.addChamferBox({
      center: [0.01, -0.21, side * 0.255],
      size: [0.24, 0.045, 0.07],
      rotDeg: [side * 15, 0, -4],
    });
  }
  gPelvisViolet.addFacetedCrystal({
    center: [0.16, 0.09, 0],
    radii: [0.035, 0.055, 0.038],
    sectors: 6,
    stacks: 4,
  });

  const pelvisMesh = scene.addMesh('Pelvis_Mesh', [
    gPelvisUnder,
    gPelvisIndigo,
    gPelvisTrim,
    gPelvisViolet,
  ]);
  const pelvisIdx = scene.addNode({
    name: 'Pelvis',
    meshIndex: pelvisMesh,
    translation: pelvisRest,
    parentIndex: rootIdx,
  });

  // Split Front & Rear Team Tabard Strips (Surf_TEAM_TabardFront, Surf_TEAM_TabardBack)
  {
    const gFrontTeam = new PrimitiveGeom(mats.Surf_TEAM);
    for (const side of [-1, 1]) {
      const zIn = side * 0.022;
      const zOut = side * 0.095;
      gFrontTeam.addLoft(
        [
          [
            [0.16, -0.32, Math.min(zIn, zOut)],
            [0.16, -0.32, Math.max(zIn, zOut)],
            [0.125, -0.32, Math.max(zIn, zOut)],
            [0.125, -0.32, Math.min(zIn, zOut)],
          ],
          [
            [0.155, 0.06, Math.min(zIn, side * 0.11)],
            [0.155, 0.06, Math.max(zIn, side * 0.11)],
            [0.12, 0.06, Math.max(zIn, side * 0.11)],
            [0.12, 0.06, Math.min(zIn, side * 0.11)],
          ],
        ],
        [
          [0.142, -0.32, side * 0.058],
          [0.138, 0.06, side * 0.066],
        ],
        true,
        true
      );
    }
    const ftMesh = scene.addMesh('Surf_TEAM_TabardFront', [gFrontTeam]);
    scene.addNode({ name: 'Surf_TEAM_TabardFront', meshIndex: ftMesh, parentIndex: pelvisIdx });

    const gBackTeam = new PrimitiveGeom(mats.Surf_TEAM);
    for (const side of [-1, 1]) {
      const zIn = side * 0.026;
      const zOut = side * 0.115;
      gBackTeam.addLoft(
        [
          [
            [-0.18, -0.36, Math.min(zIn, zOut)],
            [-0.18, -0.36, Math.max(zIn, zOut)],
            [-0.145, -0.36, Math.max(zIn, zOut)],
            [-0.145, -0.36, Math.min(zIn, zOut)],
          ],
          [
            [-0.15, 0.06, Math.min(zIn, side * 0.125)],
            [-0.15, 0.06, Math.max(zIn, side * 0.125)],
            [-0.115, 0.06, Math.max(zIn, side * 0.125)],
            [-0.115, 0.06, Math.min(zIn, side * 0.125)],
          ],
        ],
        [
          [-0.162, -0.36, side * 0.07],
          [-0.132, 0.06, side * 0.075],
        ],
        true,
        true
      );
    }
    const btMesh = scene.addMesh('Surf_TEAM_TabardBack', [gBackTeam]);
    scene.addNode({ name: 'Surf_TEAM_TabardBack', meshIndex: btMesh, parentIndex: pelvisIdx });
  }

  // -------------------------------------------------------------------------
  // 2. Articulated Agile Legs with Split Indigo Greaves ('Thigh_R/L' -> 'Shin_R/L')
  //    Pelvis Y = 0.96, Thigh at Y = -0.04 (0.92), Shin at Y = -0.44 (0.48),
  //    Boot sole at exact local Y = -0.4800 -> exact world Y = 0.0000!
  // -------------------------------------------------------------------------
  const legNodes = {};
  for (const [sideTag, sideSign] of [
    ['R', 1],
    ['L', -1],
  ]) {
    const gThUnder = new PrimitiveGeom(mats.Mat_ShadowUndersuit);
    const gThIndigo = new PrimitiveGeom(mats.Mat_IndigoArmor);
    const gThTrim = new PrimitiveGeom(mats.Mat_PaleTrim);

    gThUnder.addTubeAlongSpine(
      [
        { pos: [0, 0.02, 0], rx: 0.088, ry: 0.088 },
        { pos: [0, -0.42, 0], rx: 0.072, ry: 0.072 },
      ],
      6,
      true,
      true
    );
    // Split front/outer thigh indigo armor plates separated by a clean shadow seam
    gThIndigo.addChamferBox({
      center: [0.035, -0.18, sideSign * 0.035],
      size: [0.15, 0.32, 0.12],
      rotDeg: [0, sideSign * -12, 0],
      topScale: [1.05, 1.04],
      botScale: [0.84, 0.84],
    });
    gThIndigo.addChamferBox({
      center: [-0.03, -0.19, sideSign * 0.045],
      size: [0.11, 0.28, 0.10],
      rotDeg: [0, sideSign * 14, 0],
      topScale: [1.02, 1.02],
      botScale: [0.84, 0.84],
    });
    // Sharp pale moonstone knee-spur ridge
    gThTrim.addChamferBox({
      center: [0.095, -0.39, 0],
      size: [0.095, 0.105, 0.125],
      topScale: [0.78, 0.84],
    });

    const thMesh = scene.addMesh(`Thigh_${sideTag}_Mesh`, [gThUnder, gThIndigo, gThTrim]);
    const thIdx = scene.addNode({
      name: `Thigh_${sideTag}`,
      meshIndex: thMesh,
      translation: [0.0, -0.04, sideSign * 0.155],
      parentIndex: pelvisIdx,
    });

    const gShUnder = new PrimitiveGeom(mats.Mat_ShadowUndersuit);
    const gShIndigo = new PrimitiveGeom(mats.Mat_IndigoBright);
    const gShTrim = new PrimitiveGeom(mats.Mat_PaleTrim);
    const gShViolet = new PrimitiveGeom(mats.Mat_VoidViolet);

    // Sleek tapered undersuit calf
    gShUnder.addTubeAlongSpine(
      [
        { pos: [0, 0.03, 0], rx: 0.074, ry: 0.074 },
        { pos: [0, -0.39, 0], rx: 0.062, ry: 0.062 },
      ],
      6,
      true,
      true
    );
    // Split Indigo Greave Halves (inner & outer bladed shin plates)
    for (const halfSign of [-1, 1]) {
      gShIndigo.addLoft(
        [
          makeRectChamferRing(0.076, 0.034, 0.014, -0.37, 0.018, halfSign * 0.044),
          makeRectChamferRing(0.094, 0.040, 0.016, -0.14, 0.025, halfSign * 0.050),
          makeRectChamferRing(0.078, 0.035, 0.014, 0.03, 0.015, halfSign * 0.044),
        ],
        [
          [0.018, -0.37, halfSign * 0.044],
          [0.025, -0.14, halfSign * 0.050],
          [0.015, 0.03, halfSign * 0.044],
        ],
        true,
        true
      );
    }
    // Pale moonstone central shin crest blade
    gShTrim.addChamferBox({
      center: [0.098, -0.16, 0],
      size: [0.042, 0.34, 0.042],
      topScale: [0.80, 0.80],
    });
    // Violet shadow-step ankle node
    gShViolet.addFacetedCrystal({
      center: [-0.01, -0.27, sideSign * 0.088],
      radii: [0.028, 0.050, 0.022],
      sectors: 6,
      stacks: 3,
    });
    // Grounded split-toed Concord assassin boot (exact local Y = -0.4800 -> world Y = 0.0000!)
    gShUnder.addLoft(
      [
        makeRectChamferRing(0.135, 0.082, 0.028, -0.480, 0.040, 0),
        makeRectChamferRing(0.105, 0.072, 0.024, -0.375, 0.018, 0),
      ],
      [[0.040, -0.480, 0], [0.018, -0.375, 0]],
      true,
      true
    );
    gShTrim.addChamferBox({
      center: [0.132, -0.448, 0],
      size: [0.085, 0.060, 0.112],
      minYClamp: -0.480,
      topScale: [0.82, 0.84],
    });

    const shMesh = scene.addMesh(`Shin_${sideTag}_Mesh`, [gShUnder, gShIndigo, gShTrim, gShViolet]);
    const shIdx = scene.addNode({
      name: `Shin_${sideTag}`,
      meshIndex: shMesh,
      translation: [0.0, -0.44, 0.0],
      parentIndex: thIdx,
    });

    legNodes[sideTag] = { thighIdx: thIdx, shinIdx: shIdx };
  }

  // -------------------------------------------------------------------------
  // 3. Split Indigo Cuirass, Swept Split Pauldrons & Split Veil Mantle
  //    ('Torso' at [0, 0.14, 0] -> world Y = 1.10)
  // -------------------------------------------------------------------------
  const torsoRest = [0, 0.14, 0];
  const gTorUnder = new PrimitiveGeom(mats.Mat_ShadowUndersuit);
  const gTorIndigo = new PrimitiveGeom(mats.Mat_IndigoArmor);
  const gTorIndigoHi = new PrimitiveGeom(mats.Mat_IndigoBright);
  const gTorTrim = new PrimitiveGeom(mats.Mat_PaleTrim);
  const gTorViolet = new PrimitiveGeom(mats.Mat_VoidViolet);

  // Lean athletic shadow-undersuit abdomen & chest core
  gTorUnder.addLoft(
    [
      makeRectChamferRing(0.115, 0.150, 0.04, 0.00, 0.00, 0),
      makeRectChamferRing(0.145, 0.205, 0.05, 0.34, 0.01, 0),
      makeRectChamferRing(0.125, 0.180, 0.04, 0.52, 0.00, 0),
    ],
    [[0.00, 0.00, 0], [0.01, 0.34, 0], [0.00, 0.52, 0]],
    true,
    true
  );

  // SPLIT INDIGO CHEST CUIRASS: Distinct Left (-Z) & Right (+Z) sculpted breastplate halves
  // separated along the central sternum cleft (|z| = 0.042 .. 0.245) with pale moonstone trim!
  for (const side of [-1, 1]) {
    gTorIndigoHi.addLoft(
      [
        makeRectChamferRing(0.135, 0.070, 0.025, 0.13, 0.015, side * 0.115),
        makeRectChamferRing(0.175, 0.098, 0.032, 0.36, 0.025, side * 0.148),
        makeRectChamferRing(0.140, 0.082, 0.026, 0.51, 0.005, side * 0.132),
      ],
      [
        [0.015, 0.13, side * 0.115],
        [0.025, 0.36, side * 0.148],
        [0.005, 0.51, side * 0.132],
      ],
      true,
      true
    );
    // Crisp Pale Moonstone Inner Sternum Rib & High Collar Rim on each split half!
    gTorTrim.addTubeAlongSpine(
      [
        { pos: [0.155, 0.14, side * 0.048], rx: 0.024, ry: 0.024 },
        { pos: [0.198, 0.36, side * 0.052], rx: 0.028, ry: 0.026 },
        { pos: [0.145, 0.53, side * 0.068], rx: 0.026, ry: 0.024 },
        { pos: [-0.04, 0.55, side * 0.185], rx: 0.028, ry: 0.024 },
      ],
      4,
      true,
      true
    );
  }

  //SPLIT BACK CARAPACE PLATES (Left & Right dorsal indigo blades flanking central void spine!)
  for (const side of [-1, 1]) {
    gTorIndigo.addChamferBox({
      center: [-0.155, 0.35, side * 0.125],
      size: [0.10, 0.32, 0.14],
      rotDeg: [side * -8, side * 10, -6],
      topScale: [0.84, 0.84],
    });
  }

  // LEFT SHOULDER (-Z): Dramatic Split Twin-Blade Indigo Pauldron + Pale Trim + Violet Rift!
  // Lower pauldron wing (-Z)
  gTorIndigo.addLoft(
    [
      [
        [-0.15, 0.34, -0.24],
        [0.16, 0.34, -0.24],
        [0.18, 0.35, -0.46],
        [-0.17, 0.35, -0.46],
      ],
      [
        [-0.13, 0.48, -0.23],
        [0.14, 0.48, -0.23],
        [0.15, 0.52, -0.50],
        [-0.15, 0.52, -0.50],
      ],
    ],
    [[-0.01, 0.345, -0.35], [-0.01, 0.50, -0.365]],
    true,
    true
  );
  // Upper swept pauldron blade (-Z), separated by a visible split gap over a glowing violet fin!
  gTorIndigoHi.addLoft(
    [
      [
        [-0.13, 0.55, -0.23],
        [0.13, 0.55, -0.23],
        [0.14, 0.60, -0.47],
        [-0.15, 0.60, -0.47],
      ],
      [
        [-0.11, 0.75, -0.26],
        [0.05, 0.75, -0.26],
        [0.06, 0.82, -0.43],
        [-0.14, 0.82, -0.43],
      ],
    ],
    [[-0.01, 0.575, -0.35], [-0.035, 0.785, -0.345]],
    true,
    true
  );
  gTorTrim.addTubeAlongSpine(
    [
      { pos: [0.16, 0.52, -0.50], rx: 0.026, ry: 0.026 },
      { pos: [0.05, 0.83, -0.43], rx: 0.026, ry: 0.026 },
      { pos: [-0.15, 0.58, -0.47], rx: 0.026, ry: 0.026 },
    ],
    4,
    true,
    true
  );
  gTorViolet.addFacetedCrystal({
    center: [0.00, 0.54, -0.46],
    radii: [0.085, 0.035, 0.055],
    sectors: 6,
    stacks: 3,
  });

  // RIGHT WEAPON SHOULDER (+Z): Sleek Split Agile Crescent Shoulder Guard (2 angled indigo plates + pale trim)
  for (const [xOff, rotY] of [
    [0.065, -14],
    [-0.065, 14],
  ]) {
    gTorIndigoHi.addChamferBox({
      center: [xOff, 0.46, 0.33],
      size: [0.115, 0.14, 0.21],
      rotDeg: [-18, rotY, 0],
      topScale: [0.84, 0.84],
    });
  }
  gTorTrim.addTubeAlongSpine(
    [
      { pos: [0.13, 0.51, 0.30], rx: 0.024, ry: 0.024 },
      { pos: [0.00, 0.55, 0.41], rx: 0.026, ry: 0.026 },
      { pos: [-0.13, 0.51, 0.30], rx: 0.024, ry: 0.024 },
    ],
    4,
    true,
    true
  );

  const torsoMesh = scene.addMesh('Torso_Mesh', [
    gTorUnder,
    gTorIndigo,
    gTorIndigoHi,
    gTorTrim,
    gTorViolet,
  ]);
  const torsoIdx = scene.addNode({
    name: 'Torso',
    meshIndex: torsoMesh,
    translation: torsoRest,
    parentIndex: pelvisIdx,
  });

  // Torso Surf_TEAM_* & Surf_GLOW_* Accent Nodes
  {
    const gTeamL = new PrimitiveGeom(mats.Surf_TEAM);
    const lPoly = [
      [-0.11, -0.11],
      [0.11, -0.11],
      [0.07, 0.12],
      [-0.09, 0.12],
    ];
    gTeamL.addOrientedShield(
      [-0.02, 0.67, -0.455],
      vNorm([0.0, 0.38, -0.925]),
      [0.0, 0.925, 0.38],
      lPoly,
      0.032,
      0.86,
      0.01
    );
    const tlMesh = scene.addMesh('Surf_TEAM_PauldronLeft', [gTeamL]);
    scene.addNode({ name: 'Surf_TEAM_PauldronLeft', meshIndex: tlMesh, parentIndex: torsoIdx });

    const gTeamR = new PrimitiveGeom(mats.Surf_TEAM);
    const rPoly = [
      [-0.085, -0.06],
      [0.085, -0.06],
      [0.065, 0.065],
      [-0.065, 0.065],
    ];
    gTeamR.addOrientedShield(
      [0.0, 0.51, 0.385],
      vNorm([0.0, 0.72, 0.69]),
      [-1.0, 0.0, 0.0],
      rPoly,
      0.028,
      0.86,
      0.01
    );
    const trMesh = scene.addMesh('Surf_TEAM_PauldronRight', [gTeamR]);
    scene.addNode({ name: 'Surf_TEAM_PauldronRight', meshIndex: trMesh, parentIndex: torsoIdx });

    // Glowing Void Rift in center of Split Chest Cuirass + Dorsal Spine Core
    const gChestGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gChestGlow.addFacetedCrystal({
      center: [0.185, 0.35, 0],
      radii: [0.042, 0.125, 0.034],
      sectors: 6,
      stacks: 4,
    });
    gChestGlow.addFacetedCrystal({
      center: [-0.185, 0.36, 0],
      radii: [0.042, 0.135, 0.038],
      sectors: 6,
      stacks: 4,
    });
    const cgMesh = scene.addMesh('Surf_GLOW_ChestRift', [gChestGlow]);
    scene.addNode({ name: 'Surf_GLOW_ChestRift', meshIndex: cgMesh, parentIndex: torsoIdx });
  }

  // Split Flowing Veil Mantle Streamers ('Mantle_L' & 'Mantle_R' behind shoulders)
  const mantleNodes = {};
  for (const [mTag, side] of [
    ['L', -1],
    ['R', 1],
  ]) {
    const gManCloth = new PrimitiveGeom(mats.Mat_HoodIndigo);
    const gManTrim = new PrimitiveGeom(mats.Mat_PaleTrim);

    // Swept pointed indigo cowl-scarf tail draping down & backward (-X)
    gManCloth.addLoft(
      [
        [
          [0.00, 0.02, side * -0.07],
          [0.00, 0.02, side * 0.07],
          [-0.045, 0.00, side * 0.07],
          [-0.045, 0.00, side * -0.07],
        ],
        [
          [-0.08, -0.44, side * -0.085],
          [-0.08, -0.44, side * 0.095],
          [-0.12, -0.45, side * 0.095],
          [-0.12, -0.45, side * -0.085],
        ],
        [
          [-0.19, -0.88, side * -0.015],
          [-0.19, -0.88, side * 0.055],
          [-0.22, -0.89, side * 0.055],
          [-0.22, -0.89, side * -0.015],
        ],
      ],
      [
        [-0.022, 0.01, 0],
        [-0.10, -0.445, side * 0.005],
        [-0.205, -0.885, side * 0.02],
      ],
      true,
      true
    );
    // Pale moonstone edge piping along outer border of each split mantle streamer
    gManTrim.addTubeAlongSpine(
      [
        { pos: [-0.02, 0.01, side * 0.072], rx: 0.018, ry: 0.018 },
        { pos: [-0.10, -0.44, side * 0.098], rx: 0.018, ry: 0.018 },
        { pos: [-0.205, -0.89, side * 0.045], rx: 0.014, ry: 0.014 },
      ],
      4,
      true,
      true
    );

    const mMesh = scene.addMesh(`Mantle_${mTag}_Mesh`, [gManCloth, gManTrim]);
    mantleNodes[mTag] = scene.addNode({
      name: `Mantle_${mTag}`,
      meshIndex: mMesh,
      translation: [-0.13, 0.48, side * 0.15],
      parentIndex: torsoIdx,
    });
  }

  // -------------------------------------------------------------------------
  // 4. Sculpted Mystic Hood with Pale Trim & Shadowed Visor ('Head' at [0.03, 0.56, 0])
  //    World Y = 1.66 .. 2.2000 (exact 2.20 units tall!)
  // -------------------------------------------------------------------------
  const headRest = [0.03, 0.56, 0];
  const gHoodCloth = new PrimitiveGeom(mats.Mat_HoodIndigo);
  const gHoodPlate = new PrimitiveGeom(mats.Mat_IndigoBright);
  const gHoodTrim = new PrimitiveGeom(mats.Mat_PaleTrim);
  const gHoodDark = new PrimitiveGeom(mats.Mat_ShadowUndersuit);

  // Inner shadowed face mask / cowl void inside the hood
  gHoodDark.addLoft(
    [
      makeRectChamferRing(0.095, 0.090, 0.03, 0.02, 0.01, 0),
      makeRectChamferRing(0.115, 0.105, 0.035, 0.20, 0.03, 0),
      makeRectChamferRing(0.085, 0.080, 0.025, 0.34, 0.01, 0),
    ],
    [[0.01, 0.02, 0], [0.03, 0.20, 0], [0.01, 0.34, 0]],
    true,
    true
  );

  // Sculpted Mystic Cowl / Hood Outer Shell:
  // Broad draped cowl collar -> wide angular temple cheeks -> sharp forward predator brow (+X=0.21)
  // -> swept pointed assassin hood peak at local Y = 0.5400 -> exact world Y = 2.2000!
  const hoodRings = [
    // Flared cowl shoulders/neck drape
    [
      [0.11, 0.00, -0.15],
      [0.11, 0.00, 0.15],
      [-0.04, 0.00, 0.18],
      [-0.19, 0.01, 0.13],
      [-0.21, 0.01, 0.00],
      [-0.19, 0.01, -0.13],
      [-0.04, 0.00, -0.18],
    ],
    // Mid cowl framing cheeks
    [
      [0.14, 0.18, -0.145],
      [0.14, 0.18, 0.145],
      [-0.01, 0.19, 0.175],
      [-0.17, 0.19, 0.13],
      [-0.21, 0.20, 0.00],
      [-0.17, 0.19, -0.13],
      [-0.01, 0.19, -0.175],
    ],
    // Sharp overhanging forward brow peak (+X = 0.215!)
    [
      [0.215, 0.33, -0.055],
      [0.215, 0.33, 0.055],
      [0.05, 0.35, 0.155],
      [-0.14, 0.36, 0.115],
      [-0.22, 0.38, 0.00],
      [-0.14, 0.36, -0.115],
      [0.05, 0.35, -0.155],
    ],
    // Upper tapered hood crown
    [
      [0.08, 0.45, -0.035],
      [0.08, 0.45, 0.035],
      [-0.03, 0.46, 0.080],
      [-0.15, 0.47, 0.055],
      [-0.23, 0.49, 0.00],
      [-0.15, 0.47, -0.055],
      [-0.03, 0.46, -0.080],
    ],
    // Pointed mystic cowl apex at exact local Y = 0.5400 (world Y = 2.2000!)
    [
      [-0.08, 0.535, -0.016],
      [-0.08, 0.535, 0.016],
      [-0.13, 0.538, 0.028],
      [-0.20, 0.540, 0.018],
      [-0.25, 0.540, 0.00],
      [-0.20, 0.540, -0.018],
      [-0.13, 0.538, -0.028],
    ],
  ];
  gHoodCloth.addLoft(
    hoodRings,
    [
      [-0.05, 0.005, 0],
      [-0.03, 0.19, 0],
      [0.01, 0.35, 0],
      [-0.07, 0.465, 0],
      [-0.16, 0.538, 0],
    ],
    true,
    true
  );

  // Split Indigo armored face-guard cheek plates flanking lower cowl
  for (const side of [-1, 1]) {
    gHoodPlate.addChamferBox({
      center: [0.115, 0.11, side * 0.11],
      size: [0.11, 0.12, 0.045],
      rotDeg: [0, side * -18, 0],
      topScale: [0.84, 0.86],
    });
  }

  // Crisp Pale Moonstone Hood Brow Trim Arch (traces front hood opening & central ridge!)
  for (const side of [-1, 1]) {
    gHoodTrim.addTubeAlongSpine(
      [
        { pos: [0.12, 0.03, side * 0.145], rx: 0.022, ry: 0.022 },
        { pos: [0.155, 0.21, side * 0.135], rx: 0.024, ry: 0.024 },
        { pos: [0.222, 0.335, 0.0], rx: 0.026, ry: 0.026 },
      ],
      4,
      true,
      true
    );
  }
  gHoodTrim.addTubeAlongSpine(
    [
      { pos: [0.222, 0.34, 0.0], rx: 0.022, ry: 0.022 },
      { pos: [0.05, 0.465, 0.0], rx: 0.022, ry: 0.022 },
      { pos: [-0.21, 0.540, 0.0], rx: 0.018, ry: 0.018 },
    ],
    4,
    true,
    true
  );

  const headMesh = scene.addMesh('Head_Hood_Mesh', [
    gHoodCloth,
    gHoodPlate,
    gHoodTrim,
    gHoodDark,
  ]);
  const headIdx = scene.addNode({
    name: 'Head',
    meshIndex: headMesh,
    translation: headRest,
    parentIndex: torsoIdx,
  });

  // Glowing Twin Split Visor Eyes + Hood Crest Team Inlay
  {
    const gVisor = new PrimitiveGeom(mats.Surf_GLOW);
    for (const side of [-1, 1]) {
      gVisor.addChamferBox({
        center: [0.145, 0.215, side * 0.058],
        size: [0.055, 0.038, 0.075],
        rotDeg: [side * -14, side * -12, 0],
        topScale: [0.86, 0.88],
      });
    }
    const vMesh = scene.addMesh('Surf_GLOW_Visor', [gVisor]);
    scene.addNode({ name: 'Surf_GLOW_Visor', meshIndex: vMesh, parentIndex: headIdx });

    const gHoodTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gHoodTeam.addChamferBox({
      center: [-0.04, 0.45, 0],
      size: [0.16, 0.065, 0.068],
      rotDeg: [0, 0, 22],
      topScale: [0.84, 0.88],
    });
    const htMesh = scene.addMesh('Surf_TEAM_HoodCrest', [gHoodTeam]);
    scene.addNode({ name: 'Surf_TEAM_HoodCrest', meshIndex: htMesh, parentIndex: headIdx });
  }

  // -------------------------------------------------------------------------
  // 5. Right Arm + SINGLE LONG PALE ENERGY BLADE + 'BladeTip' Anchor!
  //    ('UpperArm_R' at [0.03, 0.41, 0.31] -> 'Forearm_R' at [0.12, -0.22, 0.08])
  //    Poised slightly outward & forward so the long luminous pale blade reads
  //    with 100% silhouette separation from -56 deg RTS camera AND under cloak!
  // -------------------------------------------------------------------------
  const gArmRUnder = new PrimitiveGeom(mats.Mat_ShadowUndersuit);
  const gArmRIndigo = new PrimitiveGeom(mats.Mat_IndigoArmor);
  gArmRUnder.addTubeAlongSpine(
    [
      { pos: [0, 0, 0], rx: 0.066, ry: 0.066 },
      { pos: [0.12, -0.22, 0.08], rx: 0.056, ry: 0.056 },
    ],
    6,
    true,
    true
  );
  gArmRIndigo.addChamferBox({
    center: [0.06, -0.11, 0.06],
    size: [0.11, 0.17, 0.11],
    rotDeg: [-14, 0, 26],
  });
  const uArmRMesh = scene.addMesh('UpperArm_R_Mesh', [gArmRUnder, gArmRIndigo]);
  const uArmRIdx = scene.addNode({
    name: 'UpperArm_R',
    meshIndex: uArmRMesh,
    translation: [0.03, 0.41, 0.31],
    parentIndex: torsoIdx,
  });

  // Forearm_R: Concord Veil Split-Indigo & Pale-Silver Warp-Hilt Emitter + Single Long Pale Energy Blade!
  const gWepIndigo = new PrimitiveGeom(mats.Mat_IndigoBright);
  const gWepTrim = new PrimitiveGeom(mats.Mat_PaleTrim);
  const gWepViolet = new PrimitiveGeom(mats.Mat_VoidViolet);
  const gBladeCore = new PrimitiveGeom(mats.Mat_PaleBladeCore);
  const gBladeCorona = new PrimitiveGeom(mats.Mat_PaleBladeCorona);

  // Split forearm gauntlet & elongated warp-blade projector housing (x = -0.06 .. +0.34)
  gWepIndigo.addChamferBox({
    center: [0.10, 0.01, 0.02],
    size: [0.34, 0.12, 0.15],
    topScale: [0.86, 0.88],
  });
  // Twin swept pale-moonstone emitter fork prongs cradling the base of the energy blade!
  for (const prongSign of [-1, 1]) {
    gWepTrim.addTubeAlongSpine(
      [
        { pos: [0.08, 0.03 * prongSign, 0.02 + prongSign * 0.065], rx: 0.032, ry: 0.026 },
        { pos: [0.26, 0.04 * prongSign, 0.03 + prongSign * 0.115], rx: 0.036, ry: 0.028 },
        { pos: [0.42, 0.02 * prongSign, 0.04 + prongSign * 0.085], rx: 0.020, ry: 0.016 },
      ],
      4,
      true,
      true
    );
  }
  // Swept rear counter-fin on gauntlet elbow (-X)
  gWepTrim.addTubeAlongSpine(
    [
      { pos: [0.02, 0.04, 0.02], rx: 0.030, ry: 0.022 },
      { pos: [-0.16, 0.08, 0.03], rx: 0.016, ry: 0.014 },
    ],
    4,
    true,
    true
  );

  // SINGLE LONG PALE ENERGY BLADE!
  // Spans from emitter throat [0.28, 0.01, 0.03] all the way to exact BladeTip [1.66, 0.08, 0.10]
  // (~1.38 units of pure luminous pale blade — total weapon span 1.82 units!).
  // Canted 32 deg in roll so its broad diamond-scythe flat faces UPWARD toward the -56 deg RTS camera
  // AND outward in 3/4 view!
  const bladeCant = quatFromEulerXYZ(32, 0, 0);
  const makeBladeDiamondRing = (pos, halfWidth, halfThick) => {
    const localPts = [
      [0, 0, -halfWidth],
      [0, halfThick, 0],
      [0, 0, halfWidth],
      [0, -halfThick, 0],
    ];
    return localPts.map((lp) => vAdd(pos, rotateVecByQuat(lp, bladeCant)));
  };

  const bladeTipLocal = [1.64, -0.14, 0.06];

  // Solid Luminous Ice-Moon Pale Blade Core (stays razor-bright even when game applies cloak transparency!)
  const coreStations = [
    { pos: [0.27, 0.005, 0.025], hw: 0.064, ht: 0.026 },
    { pos: [0.54, -0.022, 0.032], hw: 0.095, ht: 0.032 },
    { pos: [0.92, -0.062, 0.042], hw: 0.116, ht: 0.034 },
    { pos: [1.30, -0.102, 0.051], hw: 0.088, ht: 0.026 },
    { pos: [1.53, -0.128, 0.057], hw: 0.040, ht: 0.014 },
    { pos: bladeTipLocal, hw: 0.005, ht: 0.004 },
  ];
  gBladeCore.addLoft(
    coreStations.map((s) => makeBladeDiamondRing(s.pos, s.hw, s.ht)),
    coreStations.map((s) => s.pos),
    true,
    true
  );

  // Violet Void Fuller Conduit along the base third of the pale blade
  gWepViolet.addTubeAlongSpine(
    [
      { pos: [0.26, 0.006, 0.025], rx: 0.036, ry: 0.036 },
      { pos: [0.74, -0.043, 0.037], rx: 0.018, ry: 0.018 },
    ],
    4,
    true,
    true
  );

  // Outer Shimmering Translucent Pale Warp-Blade Edge Corona (wider scythe-glaive silhouette!)
  const coronaStations = [
    { pos: [0.30, 0.002, 0.026], hw: 0.088, ht: 0.034 },
    { pos: [0.60, -0.028, 0.034], hw: 0.132, ht: 0.042 },
    { pos: [0.98, -0.068, 0.044], hw: 0.152, ht: 0.044 },
    { pos: [1.34, -0.106, 0.052], hw: 0.115, ht: 0.034 },
    { pos: [1.55, -0.130, 0.058], hw: 0.052, ht: 0.018 },
    { pos: bladeTipLocal, hw: 0.007, ht: 0.006 },
  ];
  gBladeCorona.addLoft(
    coronaStations.map((s) => makeBladeDiamondRing(s.pos, s.hw, s.ht)),
    coronaStations.map((s) => s.pos),
    true,
    true
  );

  const forearmRRest = [0.12, -0.22, 0.08];
  // Opaque primitives FIRST, alpha-blend corona LAST!
  const forearmRMesh = scene.addMesh('Forearm_R_WarpBlade_Mesh', [
    gWepIndigo,
    gWepTrim,
    gWepViolet,
    gBladeCore,
    gBladeCorona,
  ]);
  const forearmRIdx = scene.addNode({
    name: 'Forearm_R',
    meshIndex: forearmRMesh,
    translation: forearmRRest,
    parentIndex: uArmRIdx,
  });

  // Forearm_R Surf_TEAM_* & Surf_GLOW_* Accents + Exact 'BladeTip' Node!
  {
    const gHiltTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gHiltTeam.addChamferBox({
      center: [0.12, 0.082, 0.02],
      size: [0.22, 0.040, 0.10],
      topScale: [0.86, 0.86],
    });
    const hmMesh = scene.addMesh('Surf_TEAM_HiltGuard', [gHiltTeam]);
    scene.addNode({ name: 'Surf_TEAM_HiltGuard', meshIndex: hmMesh, parentIndex: forearmRIdx });

    const gEmitGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gEmitGlow.addFacetedCrystal({
      center: [0.28, 0.065, 0.03],
      radii: [0.065, 0.042, 0.045],
      sectors: 6,
      stacks: 4,
    });
    const egMesh = scene.addMesh('Surf_GLOW_BladeEmitter', [gEmitGlow]);
    scene.addNode({ name: 'Surf_GLOW_BladeEmitter', meshIndex: egMesh, parentIndex: forearmRIdx });
  }

  // Exact 'BladeTip' anchor at the distal tip of the single long pale energy blade!
  scene.addNode({
    name: 'BladeTip',
    translation: bladeTipLocal,
    parentIndex: forearmRIdx,
  });

  // -------------------------------------------------------------------------
  // 6. Left Off-Hand Shadow-Weaving Gauntlet ('UpperArm_L' -> 'Forearm_L')
  //    Compact split-indigo bracer + pale trim — NO blade on left arm!
  // -------------------------------------------------------------------------
  const gArmLUnder = new PrimitiveGeom(mats.Mat_ShadowUndersuit);
  gArmLUnder.addTubeAlongSpine(
    [
      { pos: [0, 0, 0], rx: 0.066, ry: 0.066 },
      { pos: [0.08, -0.24, -0.06], rx: 0.056, ry: 0.056 },
    ],
    6,
    true,
    true
  );
  const uArmLMesh = scene.addMesh('UpperArm_L_Mesh', [gArmLUnder]);
  const uArmLIdx = scene.addNode({
    name: 'UpperArm_L',
    meshIndex: uArmLMesh,
    translation: [0.00, 0.41, -0.31],
    parentIndex: torsoIdx,
  });

  const gGauntIndigo = new PrimitiveGeom(mats.Mat_IndigoArmor);
  const gGauntTrim = new PrimitiveGeom(mats.Mat_PaleTrim);
  // Split two-plate indigo shadow bracer
  for (const zOff of [-0.035, 0.035]) {
    gGauntIndigo.addChamferBox({
      center: [0.12, -0.02, zOff],
      size: [0.24, 0.095, 0.055],
      topScale: [0.86, 0.86],
    });
  }
  gGauntTrim.addChamferBox({
    center: [0.22, 0.03, 0],
    size: [0.11, 0.038, 0.11],
    topScale: [0.84, 0.86],
  });
  const forearmLMesh = scene.addMesh('Forearm_L_Mesh', [gGauntIndigo, gGauntTrim]);
  const forearmLIdx = scene.addNode({
    name: 'Forearm_L',
    meshIndex: forearmLMesh,
    translation: [0.08, -0.24, -0.06],
    parentIndex: uArmLIdx,
  });

  {
    const gGauntGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gGauntGlow.addFacetedCrystal({
      center: [0.25, -0.02, 0],
      radii: [0.050, 0.038, 0.042],
      sectors: 6,
      stacks: 4,
    });
    const ggMesh = scene.addMesh('Surf_GLOW_GauntletL', [gGauntGlow]);
    scene.addNode({ name: 'Surf_GLOW_GauntletL', meshIndex: ggMesh, parentIndex: forearmLIdx });
  }

  // -------------------------------------------------------------------------
  // 7. Duskblade Baked Animations: 'idle', 'walk', 'attack', 'cast', 'death'
  //    Full-rig tracks on every clip prevent state bleed between animations,
  //    and pelvis height is precisely matched to leg flexion so min.y >= 0.000!
  // -------------------------------------------------------------------------
  const qId = quatFromEulerXYZ(0, 0, 0);

  // 7A. 'idle' (2.20s seamless stealth-poised breath, vigilant hood scan & blade readiness)
  const idleT = [0.0, 0.55, 1.10, 1.65, 2.20];
  scene.addAnimation('idle', [
    {
      nodeIndex: pelvisIdx,
      path: 'translation',
      times: idleT,
      values: [
        [0, 0.96, 0],
        [0, 0.974, 0],
        [0, 0.96, 0],
        [0, 0.965, 0],
        [0, 0.96, 0],
      ],
    },
    {
      nodeIndex: pelvisIdx,
      path: 'rotation',
      times: idleT,
      values: [
        qId,
        quatFromEulerXYZ(0, -2.5, 0),
        qId,
        quatFromEulerXYZ(0, 2.5, 0),
        qId,
      ],
    },
    {
      nodeIndex: legNodes.R.thighIdx,
      path: 'rotation',
      times: idleT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, -1.5),
        qId,
        quatFromEulerXYZ(0, 0, 1.5),
        qId,
      ],
    },
    {
      nodeIndex: legNodes.R.shinIdx,
      path: 'rotation',
      times: idleT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, 1.5),
        qId,
        quatFromEulerXYZ(0, 0, -1.5),
        qId,
      ],
    },
    {
      nodeIndex: legNodes.L.thighIdx,
      path: 'rotation',
      times: idleT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, 1.5),
        qId,
        quatFromEulerXYZ(0, 0, -1.5),
        qId,
      ],
    },
    {
      nodeIndex: legNodes.L.shinIdx,
      path: 'rotation',
      times: idleT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, -1.5),
        qId,
        quatFromEulerXYZ(0, 0, 1.5),
        qId,
      ],
    },
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: idleT,
      values: [
        qId,
        quatFromEulerXYZ(0, -5.0, -1.8),
        qId,
        quatFromEulerXYZ(0, 4.0, 1.2),
        qId,
      ],
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: idleT,
      values: [
        qId,
        quatFromEulerXYZ(0, 7.5, 1.5),
        qId,
        quatFromEulerXYZ(0, -6.5, -1.2),
        qId,
      ],
    },
    {
      nodeIndex: mantleNodes.L,
      path: 'rotation',
      times: idleT,
      values: [
        qId,
        quatFromEulerXYZ(2.5, 4.0, -4.0),
        qId,
        quatFromEulerXYZ(-2.0, -3.0, 2.0),
        qId,
      ],
    },
    {
      nodeIndex: mantleNodes.R,
      path: 'rotation',
      times: idleT,
      values: [
        qId,
        quatFromEulerXYZ(-2.5, -4.0, -3.5),
        qId,
        quatFromEulerXYZ(2.0, 3.0, 2.5),
        qId,
      ],
    },
    {
      nodeIndex: uArmRIdx,
      path: 'rotation',
      times: idleT,
      values: [
        qId,
        quatFromEulerXYZ(3.0, -4.0, 4.5),
        qId,
        quatFromEulerXYZ(-2.0, 3.0, -2.5),
        qId,
      ],
    },
    {
      nodeIndex: forearmRIdx,
      path: 'translation',
      times: idleT,
      values: [forearmRRest, forearmRRest, forearmRRest, forearmRRest, forearmRRest],
    },
    {
      nodeIndex: forearmRIdx,
      path: 'rotation',
      times: idleT,
      values: [
        qId,
        quatFromEulerXYZ(0, -3.0, 3.5),
        qId,
        quatFromEulerXYZ(0, 2.5, -2.0),
        qId,
      ],
    },
    {
      nodeIndex: uArmLIdx,
      path: 'rotation',
      times: idleT,
      values: [
        qId,
        quatFromEulerXYZ(4.0, -5.0, -4.0),
        qId,
        quatFromEulerXYZ(-3.0, 4.0, 3.0),
        qId,
      ],
    },
    {
      nodeIndex: forearmLIdx,
      path: 'rotation',
      times: idleT,
      values: [qId, quatFromEulerXYZ(0, 5.0, 6.0), qId, quatFromEulerXYZ(0, -3.0, -2.0), qId],
    },
  ]);

  // 7B. 'walk' (0.88s swift predatory shadow-stalker stride, min.y >= 0.000!)
  const walkT = [0.0, 0.22, 0.44, 0.66, 0.88];
  scene.addAnimation('walk', [
    {
      nodeIndex: pelvisIdx,
      path: 'translation',
      times: walkT,
      values: [
        [0, 0.96, 0],
        [0, 1.032, -0.015],
        [0, 0.96, 0],
        [0, 1.032, 0.015],
        [0, 0.96, 0],
      ],
    },
    {
      nodeIndex: pelvisIdx,
      path: 'rotation',
      times: walkT,
      values: [
        qId,
        quatFromEulerXYZ(0, -5, 0),
        qId,
        quatFromEulerXYZ(0, 5, 0),
        qId,
      ],
    },
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, -7),
        quatFromEulerXYZ(0, 9, -9),
        quatFromEulerXYZ(0, 0, -7),
        quatFromEulerXYZ(0, -9, -9),
        quatFromEulerXYZ(0, 0, -7),
      ],
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 7),
        quatFromEulerXYZ(0, -6, 9),
        quatFromEulerXYZ(0, 0, 7),
        quatFromEulerXYZ(0, 6, 9),
        quatFromEulerXYZ(0, 0, 7),
      ],
    },
    {
      nodeIndex: legNodes.R.thighIdx,
      path: 'rotation',
      times: walkT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, 28),
        qId,
        quatFromEulerXYZ(0, 0, -22),
        qId,
      ],
    },
    {
      nodeIndex: legNodes.R.shinIdx,
      path: 'rotation',
      times: walkT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, -16),
        qId,
        quatFromEulerXYZ(0, 0, -24),
        qId,
      ],
    },
    {
      nodeIndex: legNodes.L.thighIdx,
      path: 'rotation',
      times: walkT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, -22),
        qId,
        quatFromEulerXYZ(0, 0, 28),
        qId,
      ],
    },
    {
      nodeIndex: legNodes.L.shinIdx,
      path: 'rotation',
      times: walkT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, -24),
        qId,
        quatFromEulerXYZ(0, 0, -16),
        qId,
      ],
    },
    {
      nodeIndex: mantleNodes.L,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, -10),
        quatFromEulerXYZ(4, 6, -18),
        quatFromEulerXYZ(0, 0, -10),
        quatFromEulerXYZ(-3, -4, -14),
        quatFromEulerXYZ(0, 0, -10),
      ],
    },
    {
      nodeIndex: mantleNodes.R,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, -10),
        quatFromEulerXYZ(-3, -4, -14),
        quatFromEulerXYZ(0, 0, -10),
        quatFromEulerXYZ(4, 6, -18),
        quatFromEulerXYZ(0, 0, -10),
      ],
    },
    {
      nodeIndex: uArmRIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(4, -10, 4),
        quatFromEulerXYZ(6, -16, 0),
        quatFromEulerXYZ(4, -10, 4),
        quatFromEulerXYZ(2, -4, 10),
        quatFromEulerXYZ(4, -10, 4),
      ],
    },
    {
      nodeIndex: forearmRIdx,
      path: 'translation',
      times: walkT,
      values: [forearmRRest, forearmRRest, forearmRRest, forearmRRest, forearmRRest],
    },
    {
      nodeIndex: forearmRIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 6, 4),
        quatFromEulerXYZ(0, 10, 8),
        quatFromEulerXYZ(0, 6, 4),
        quatFromEulerXYZ(0, 4, 2),
        quatFromEulerXYZ(0, 6, 4),
      ],
    },
    {
      nodeIndex: uArmLIdx,
      path: 'rotation',
      times: walkT,
      values: [
        qId,
        quatFromEulerXYZ(0, 8, 22),
        qId,
        quatFromEulerXYZ(0, -8, -20),
        qId,
      ],
    },
    {
      nodeIndex: forearmLIdx,
      path: 'rotation',
      times: walkT,
      values: [
        quatFromEulerXYZ(0, 0, 10),
        quatFromEulerXYZ(0, 6, 18),
        quatFromEulerXYZ(0, 0, 10),
        quatFromEulerXYZ(0, -4, 6),
        quatFromEulerXYZ(0, 0, 10),
      ],
    },
  ]);

  // 7C. 'attack' (0.78s explosive wide melee cleave of the single long pale energy blade!)
  //     Coils wide right (+Z) -> lunges forward & whips BladeTip straight across +X (+2.08m reach!) -> left follow-through!
  const atkT = [0.0, 0.16, 0.29, 0.45, 0.63, 0.78];
  scene.addAnimation('attack', [
    {
      nodeIndex: pelvisIdx,
      path: 'translation',
      times: atkT,
      values: [
        [0, 0.96, 0],
        [-0.06, 0.985, 0.03],
        [0.20, 1.005, -0.02],
        [0.16, 0.995, -0.03],
        [0.05, 0.975, 0],
        [0, 0.96, 0],
      ],
    },
    {
      nodeIndex: pelvisIdx,
      path: 'rotation',
      times: atkT,
      values: [
        qId,
        quatFromEulerXYZ(0, -18, 0),
        quatFromEulerXYZ(0, 16, 0),
        quatFromEulerXYZ(0, 24, 0),
        quatFromEulerXYZ(0, 8, 0),
        qId,
      ],
    },
    {
      nodeIndex: legNodes.R.thighIdx,
      path: 'rotation',
      times: atkT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, -8),
        quatFromEulerXYZ(0, 0, 22),
        quatFromEulerXYZ(0, 0, 16),
        quatFromEulerXYZ(0, 0, 5),
        qId,
      ],
    },
    {
      nodeIndex: legNodes.R.shinIdx,
      path: 'rotation',
      times: atkT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, -6),
        quatFromEulerXYZ(0, 0, -18),
        quatFromEulerXYZ(0, 0, -12),
        quatFromEulerXYZ(0, 0, -4),
        qId,
      ],
    },
    {
      nodeIndex: legNodes.L.thighIdx,
      path: 'rotation',
      times: atkT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, 12),
        quatFromEulerXYZ(0, 0, -18),
        quatFromEulerXYZ(0, 0, -14),
        quatFromEulerXYZ(0, 0, -4),
        qId,
      ],
    },
    {
      nodeIndex: legNodes.L.shinIdx,
      path: 'rotation',
      times: atkT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, -10),
        quatFromEulerXYZ(0, 0, -6),
        quatFromEulerXYZ(0, 0, -6),
        quatFromEulerXYZ(0, 0, -2),
        qId,
      ],
    },
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: atkT,
      values: [
        qId,
        quatFromEulerXYZ(-4, -26, 4),
        quatFromEulerXYZ(4, 14, -8),
        quatFromEulerXYZ(6, 32, -8),
        quatFromEulerXYZ(2, 10, -3),
        qId,
      ],
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: atkT,
      values: [
        qId,
        quatFromEulerXYZ(0, 22, 0),
        quatFromEulerXYZ(0, -12, 5),
        quatFromEulerXYZ(0, -26, 5),
        quatFromEulerXYZ(0, -8, 0),
        qId,
      ],
    },
    {
      nodeIndex: mantleNodes.L,
      path: 'rotation',
      times: atkT,
      values: [
        qId,
        quatFromEulerXYZ(6, -12, -10),
        quatFromEulerXYZ(-8, 14, -24),
        quatFromEulerXYZ(-12, 20, -22),
        quatFromEulerXYZ(-4, 6, -8),
        qId,
      ],
    },
    {
      nodeIndex: mantleNodes.R,
      path: 'rotation',
      times: atkT,
      values: [
        qId,
        quatFromEulerXYZ(8, -16, -12),
        quatFromEulerXYZ(-6, 12, -22),
        quatFromEulerXYZ(-10, 18, -20),
        quatFromEulerXYZ(-3, 5, -6),
        qId,
      ],
    },
    {
      nodeIndex: uArmRIdx,
      path: 'rotation',
      times: atkT,
      values: [
        qId,
        quatFromEulerXYZ(16, -38, 16),
        quatFromEulerXYZ(-8, 6, 4),
        quatFromEulerXYZ(-18, 42, -6),
        quatFromEulerXYZ(-6, 12, -2),
        qId,
      ],
    },
    {
      nodeIndex: forearmRIdx,
      path: 'translation',
      times: atkT,
      values: [
        forearmRRest,
        [0.10, -0.20, 0.10],
        [0.18, -0.20, 0.04],
        [0.14, -0.21, 0.02],
        [0.12, -0.22, 0.06],
        forearmRRest,
      ],
    },
    {
      nodeIndex: forearmRIdx,
      path: 'rotation',
      times: atkT,
      values: [
        qId,
        quatFromEulerXYZ(-12, -20, 10),
        quatFromEulerXYZ(8, 8, 2),
        quatFromEulerXYZ(18, 26, -8),
        quatFromEulerXYZ(6, 8, -2),
        qId,
      ],
    },
    {
      nodeIndex: uArmLIdx,
      path: 'rotation',
      times: atkT,
      values: [
        qId,
        quatFromEulerXYZ(-10, 18, 24),
        quatFromEulerXYZ(12, -22, -18),
        quatFromEulerXYZ(18, -32, -24),
        quatFromEulerXYZ(6, -10, -8),
        qId,
      ],
    },
    {
      nodeIndex: forearmLIdx,
      path: 'rotation',
      times: atkT,
      values: [
        qId,
        quatFromEulerXYZ(0, 12, 20),
        quatFromEulerXYZ(0, -8, 12),
        quatFromEulerXYZ(0, -10, 10),
        quatFromEulerXYZ(0, -3, 4),
        qId,
      ],
    },
  ]);

  // 7D. 'cast' (1.16s Shadow-Stride / Veil-Shroud psionic invocation!)
  //     Left void-gauntlet thrusts forward (+X) while right pale blade raises in cross-guard focus!
  const castT = [0.0, 0.28, 0.60, 0.90, 1.16];
  scene.addAnimation('cast', [
    {
      nodeIndex: pelvisIdx,
      path: 'translation',
      times: castT,
      values: [
        [0, 0.96, 0],
        [-0.03, 0.97, 0],
        [0.06, 1.04, 0],
        [0.02, 0.985, 0],
        [0, 0.96, 0],
      ],
    },
    {
      nodeIndex: pelvisIdx,
      path: 'rotation',
      times: castT,
      values: [
        qId,
        quatFromEulerXYZ(0, 10, 0),
        quatFromEulerXYZ(0, -16, 0),
        quatFromEulerXYZ(0, -5, 0),
        qId,
      ],
    },
    {
      nodeIndex: legNodes.R.thighIdx,
      path: 'rotation',
      times: castT,
      values: [qId, quatFromEulerXYZ(0, 0, -4), quatFromEulerXYZ(0, 0, -10), quatFromEulerXYZ(0, 0, -3), qId],
    },
    {
      nodeIndex: legNodes.R.shinIdx,
      path: 'rotation',
      times: castT,
      values: [qId, quatFromEulerXYZ(0, 0, 4), quatFromEulerXYZ(0, 0, -6), quatFromEulerXYZ(0, 0, -2), qId],
    },
    {
      nodeIndex: legNodes.L.thighIdx,
      path: 'rotation',
      times: castT,
      values: [qId, quatFromEulerXYZ(0, 0, 6), quatFromEulerXYZ(0, 0, 14), quatFromEulerXYZ(0, 0, 4), qId],
    },
    {
      nodeIndex: legNodes.L.shinIdx,
      path: 'rotation',
      times: castT,
      values: [qId, quatFromEulerXYZ(0, 0, -6), quatFromEulerXYZ(0, 0, -14), quatFromEulerXYZ(0, 0, -4), qId],
    },
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: castT,
      values: [
        qId,
        quatFromEulerXYZ(0, 14, 4),
        quatFromEulerXYZ(0, -24, -6),
        quatFromEulerXYZ(0, -8, -2),
        qId,
      ],
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: castT,
      values: [
        qId,
        quatFromEulerXYZ(0, -10, -6),
        quatFromEulerXYZ(0, 20, 4),
        quatFromEulerXYZ(0, 6, 1),
        qId,
      ],
    },
    {
      nodeIndex: mantleNodes.L,
      path: 'rotation',
      times: castT,
      values: [
        qId,
        quatFromEulerXYZ(-6, 8, -8),
        quatFromEulerXYZ(-14, 16, -24),
        quatFromEulerXYZ(-5, 6, -8),
        qId,
      ],
    },
    {
      nodeIndex: mantleNodes.R,
      path: 'rotation',
      times: castT,
      values: [
        qId,
        quatFromEulerXYZ(6, -8, -8),
        quatFromEulerXYZ(14, -16, -24),
        quatFromEulerXYZ(5, -6, -8),
        qId,
      ],
    },
    {
      nodeIndex: uArmLIdx,
      path: 'rotation',
      times: castT,
      values: [
        qId,
        quatFromEulerXYZ(-16, -12, 36),
        quatFromEulerXYZ(8, 22, 74),
        quatFromEulerXYZ(4, 8, 26),
        qId,
      ],
    },
    {
      nodeIndex: forearmLIdx,
      path: 'rotation',
      times: castT,
      values: [
        qId,
        quatFromEulerXYZ(0, 14, 20),
        quatFromEulerXYZ(0, 20, 24),
        quatFromEulerXYZ(0, 8, 10),
        qId,
      ],
    },
    {
      nodeIndex: uArmRIdx,
      path: 'rotation',
      times: castT,
      values: [
        qId,
        quatFromEulerXYZ(-12, 22, 32),
        quatFromEulerXYZ(-24, 44, 56),
        quatFromEulerXYZ(-8, 14, 18),
        qId,
      ],
    },
    {
      nodeIndex: forearmRIdx,
      path: 'translation',
      times: castT,
      values: [forearmRRest, forearmRRest, forearmRRest, forearmRRest, forearmRRest],
    },
    {
      nodeIndex: forearmRIdx,
      path: 'rotation',
      times: castT,
      values: [
        qId,
        quatFromEulerXYZ(10, 18, 14),
        quatFromEulerXYZ(18, 32, 22),
        quatFromEulerXYZ(6, 10, 8),
        qId,
      ],
    },
  ]);

  // 7E. 'death' (1.24s stagger & kneeling assassin collapse onto ground Y >= 0.000!)
  const deathT = [0.0, 0.24, 0.60, 0.96, 1.24];
  scene.addAnimation('death', [
    {
      nodeIndex: pelvisIdx,
      path: 'translation',
      times: deathT,
      values: [
        [0, 0.96, 0],
        [-0.06, 0.965, 0.02],
        [-0.12, 0.825, 0.03],
        [-0.16, 0.745, 0.04],
        [-0.16, 0.745, 0.04],
      ],
    },
    {
      nodeIndex: pelvisIdx,
      path: 'rotation',
      times: deathT,
      values: [
        qId,
        quatFromEulerXYZ(3, -6, 6),
        quatFromEulerXYZ(6, -12, 12),
        quatFromEulerXYZ(8, -16, 16),
        quatFromEulerXYZ(8, -16, 16),
      ],
    },
    {
      nodeIndex: torsoIdx,
      path: 'rotation',
      times: deathT,
      values: [
        qId,
        quatFromEulerXYZ(0, 10, 10),
        quatFromEulerXYZ(4, -8, -18),
        quatFromEulerXYZ(6, -12, -32),
        quatFromEulerXYZ(6, -12, -32),
      ],
    },
    {
      nodeIndex: headIdx,
      path: 'rotation',
      times: deathT,
      values: [
        qId,
        quatFromEulerXYZ(0, -8, 8),
        quatFromEulerXYZ(4, 6, -12),
        quatFromEulerXYZ(6, 10, -18),
        quatFromEulerXYZ(6, 10, -18),
      ],
    },
    {
      nodeIndex: legNodes.R.thighIdx,
      path: 'rotation',
      times: deathT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, 14),
        quatFromEulerXYZ(-6, 0, 42),
        quatFromEulerXYZ(-8, 0, 56),
        quatFromEulerXYZ(-8, 0, 56),
      ],
    },
    {
      nodeIndex: legNodes.R.shinIdx,
      path: 'rotation',
      times: deathT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, -18),
        quatFromEulerXYZ(0, 0, -56),
        quatFromEulerXYZ(0, 0, -78),
        quatFromEulerXYZ(0, 0, -78),
      ],
    },
    {
      nodeIndex: legNodes.L.thighIdx,
      path: 'rotation',
      times: deathT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, 8),
        quatFromEulerXYZ(6, 0, 38),
        quatFromEulerXYZ(8, 0, 52),
        quatFromEulerXYZ(8, 0, 52),
      ],
    },
    {
      nodeIndex: legNodes.L.shinIdx,
      path: 'rotation',
      times: deathT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, -14),
        quatFromEulerXYZ(0, 0, -52),
        quatFromEulerXYZ(0, 0, -74),
        quatFromEulerXYZ(0, 0, -74),
      ],
    },
    {
      nodeIndex: mantleNodes.L,
      path: 'rotation',
      times: deathT,
      values: [
        qId,
        quatFromEulerXYZ(4, 0, -12),
        quatFromEulerXYZ(6, 8, 8),
        quatFromEulerXYZ(8, 12, 18),
        quatFromEulerXYZ(8, 12, 18),
      ],
    },
    {
      nodeIndex: mantleNodes.R,
      path: 'rotation',
      times: deathT,
      values: [
        qId,
        quatFromEulerXYZ(-4, 0, -12),
        quatFromEulerXYZ(-6, -8, 8),
        quatFromEulerXYZ(-8, -12, 18),
        quatFromEulerXYZ(-8, -12, 18),
      ],
    },
    {
      nodeIndex: uArmRIdx,
      path: 'rotation',
      times: deathT,
      values: [
        qId,
        quatFromEulerXYZ(8, -10, 14),
        quatFromEulerXYZ(12, -22, 20),
        quatFromEulerXYZ(14, -28, 24),
        quatFromEulerXYZ(14, -28, 24),
      ],
    },
    {
      nodeIndex: forearmRIdx,
      path: 'translation',
      times: deathT,
      values: [forearmRRest, forearmRRest, forearmRRest, forearmRRest, forearmRRest],
    },
    {
      nodeIndex: forearmRIdx,
      path: 'rotation',
      times: deathT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, 6),
        quatFromEulerXYZ(-6, -8, 10),
        quatFromEulerXYZ(-8, -12, 14),
        quatFromEulerXYZ(-8, -12, 14),
      ],
    },
    {
      nodeIndex: uArmLIdx,
      path: 'rotation',
      times: deathT,
      values: [
        qId,
        quatFromEulerXYZ(-8, 0, 10),
        quatFromEulerXYZ(-14, 10, 14),
        quatFromEulerXYZ(-18, 14, 18),
        quatFromEulerXYZ(-18, 14, 18),
      ],
    },
    {
      nodeIndex: forearmLIdx,
      path: 'rotation',
      times: deathT,
      values: [
        qId,
        quatFromEulerXYZ(0, 0, 6),
        quatFromEulerXYZ(0, 6, 10),
        quatFromEulerXYZ(0, 8, 12),
        quatFromEulerXYZ(0, 8, 12),
      ],
    },
  ]);

  return scene.buildGLB('DuskbladeScene');
}

// ---------------------------------------------------------------------------
// Asset 2: veil_sanctum.glb
// Aurelian Concord Veil Sanctum (Dark Shrine counterpart)
// - 3x3 narrow dark stone research shrine (< 6.8 units across: ~5.76 X by ~4.48 Z, ~6.08 Y tall)
// - Grounded at exact Y = 0.0000, +X forward ceremonial threshold portal
// - Tall narrow inward-arching obsidian/indigo-stone monolith spires with crisp pale moonstone trim
// - Sunken violet ritual ley-channels & containment tethers suspending a faceted Void Crystal
// - Surf_TEAM_* and Surf_GLOW_* accent nodes
// - Seamless looping 'idle' animation
// ---------------------------------------------------------------------------

function buildVeilSanctumGLB() {
  const scene = new GLBSceneBuilder();
  const mats = createVeilSanctumMaterials(scene);

  const rootIdx = scene.addNode({ name: 'VeilSanctum', translation: [0, 0, 0] });

  const gDarkStone = new PrimitiveGeom(mats.Mat_DarkStone);
  const gObsidian = new PrimitiveGeom(mats.Mat_ObsidianDeep);
  const gIndigoStone = new PrimitiveGeom(mats.Mat_IndigoStone);
  const gPaleTrim = new PrimitiveGeom(mats.Mat_PaleTrim);
  const gPaleBright = new PrimitiveGeom(mats.Mat_PaleBright);
  const gViolet = new PrimitiveGeom(mats.Mat_VioletGlow);
  const gVioletCore = new PrimitiveGeom(mats.Mat_VioletCoreBright);

  // -------------------------------------------------------------------------
  // 1. Stepped Narrow Dark-Stone Sanctuary Plinth (Y = 0.0000 .. 0.6400)
  //    Elongated narrow chamfered octagon: X in [-2.82, +2.82], Z in [-2.22, +2.22]
  //    (5.76 x 4.44 overall with threshold — strictly < 6.8 units across & visibly narrow!)
  // -------------------------------------------------------------------------
  gObsidian.addLoft(
    [
      makeRectChamferRing(2.82, 2.22, 0.78, 0.000, 0, 0),
      makeRectChamferRing(2.72, 2.12, 0.74, 0.260, 0, 0),
      makeRectChamferRing(2.38, 1.80, 0.62, 0.300, 0, 0),
    ],
    [[0, 0.000, 0], [0, 0.260, 0], [0, 0.300, 0]],
    true,
    true
  );

  // Recessed Glowing Violet Perimeter Fissure around the narrow plinth step (Y = 0.25 .. 0.35)
  gViolet.addLoft(
    [
      makeRectChamferRing(2.50, 1.92, 0.66, 0.250, 0, 0),
      makeRectChamferRing(2.50, 1.92, 0.66, 0.345, 0, 0),
    ],
    [[0, 0.250, 0], [0, 0.345, 0]],
    false,
    true
  );

  // Pale Moonstone Plinth Collar Band (high-contrast pale trim tracing the narrow base!)
  const plinthCollarRings = [];
  const plinthCollarCenters = [];
  const pOut = makeRectChamferRing(2.58, 1.99, 0.68, 0, 0, 0);
  const pIn = makeRectChamferRing(2.40, 1.82, 0.62, 0, 0, 0);
  for (let i = 0; i < pOut.length; i++) {
    plinthCollarRings.push([
      [pOut[i][0], 0.340, pOut[i][2]],
      [pOut[i][0] * 0.99, 0.420, pOut[i][2] * 0.99],
      [pIn[i][0], 0.430, pIn[i][2]],
      [pIn[i][0], 0.340, pIn[i][2]],
    ]);
    plinthCollarCenters.push([
      (pOut[i][0] + pIn[i][0]) * 0.5,
      0.385,
      (pOut[i][2] + pIn[i][2]) * 0.5,
    ]);
  }
  gPaleTrim.addCyclicRingLoft(plinthCollarRings, plinthCollarCenters);

  // Upper Narrow Dark-Stone Reliquary Altar Deck (Y = 0.42 .. 0.62, Z narrowed to ±1.66!)
  gDarkStone.addLoft(
    [
      makeRectChamferRing(2.38, 1.80, 0.60, 0.420, -0.04, 0),
      makeRectChamferRing(2.14, 1.56, 0.52, 0.620, -0.04, 0),
    ],
    [[-0.04, 0.420, 0], [-0.04, 0.620, 0]],
    false,
    true
  );

  // Sunken Central Void Ritual Well on Altar Deck ([0.06, 0.62 .. 0.80, 0])
  const wellSectors = 8;
  const wellRings = [];
  const wellCenters = [];
  for (let s = 0; s < wellSectors; s++) {
    const th = (2 * Math.PI * s) / wellSectors + Math.PI / wellSectors;
    const ca = Math.cos(th), sa = Math.sin(th);
    wellRings.push([
      [0.06 + ca * 0.92, 0.60, sa * 0.82],
      [0.06 + ca * 0.86, 0.80, sa * 0.76],
      [0.06 + ca * 0.64, 0.82, sa * 0.56],
      [0.06 + ca * 0.56, 0.63, sa * 0.48],
    ]);
    wellCenters.push([0.06 + ca * 0.74, 0.71, sa * 0.66]);
  }
  gPaleBright.addCyclicRingLoft(wellRings, wellCenters);

  // Glowing Violet Well Pool Disc at bottom of ritual well
  const wellPoolRing = [];
  for (let s = 0; s < wellSectors; s++) {
    const th = (2 * Math.PI * s) / wellSectors + Math.PI / wellSectors;
    wellPoolRing.push([0.06 + Math.cos(th) * 0.58, 0.66, Math.sin(th) * 0.50]);
  }
  gVioletCore.addPolygonCap(wellPoolRing, [0.06, 0.66, 0], [0, 1, 0]);

  // Narrow Elliptical Violet Ritual Ley-Arcs & Longitudinal Channel on the Dark Stone Deck
  for (const side of [-1, 1]) {
    gViolet.addConcentricArcStrip({
      rInner: 1.04,
      rOuter: 1.18,
      yBot: 0.615,
      yTop: 0.665,
      thStart: side > 0 ? 0.35 : Math.PI + 0.35,
      thEnd: side > 0 ? Math.PI - 0.35 : Math.PI * 2 - 0.35,
      steps: 6,
      bevelIn: 0.015,
      cx: 0.06,
      cz: 0,
      scaleX: 1.18,
      scaleZ: 0.88,
    });
  }
  // Forward (+X) and Rear (-X) Glowing Violet Ley-Runnels along the narrow shrine centerline
  gViolet.addChamferBox({
    center: [1.46, 0.635, 0],
    size: [0.96, 0.055, 0.20],
    topScale: [0.92, 0.88],
  });
  gViolet.addChamferBox({
    center: [-1.18, 0.635, 0],
    size: [0.84, 0.055, 0.20],
    topScale: [0.92, 0.88],
  });

  // -------------------------------------------------------------------------
  // 2. +X Forward Narrow Ceremonial Sanctuary Threshold & Twin Portal Pylons
  //    (X = +1.92 .. +2.94, Z = -0.96 .. +0.96 — clear +X forward orientation!)
  // -------------------------------------------------------------------------
  // Stepped dark-stone ceremonial ramp descending to Y = 0.000 at +X
  gDarkStone.addLoft(
    [
      [
        [2.94, 0.000, -0.78],
        [2.94, 0.000, 0.78],
        [1.96, 0.000, 0.92],
        [1.96, 0.000, -0.92],
      ],
      [
        [2.82, 0.240, -0.70],
        [2.82, 0.240, 0.70],
        [1.92, 0.580, 0.84],
        [1.92, 0.580, -0.84],
      ],
    ],
    [[2.45, 0.000, 0], [2.37, 0.410, 0]],
    true,
    true
  );
  // Twin Pale-Moonstone Threshold Side Rails & Glowing Violet Threshold Chevron
  for (const side of [-1, 1]) {
    gPaleBright.addTubeAlongSpine(
      [
        { pos: [1.94, 0.63, side * 0.84], rx: 0.095, ry: 0.075 },
        { pos: [2.84, 0.27, side * 0.70], rx: 0.080, ry: 0.065 },
      ],
      4,
      true,
      true
    );
    // Slender Dark-Stone Portal Sentinel Obelisks flanking the +X entrance (Y = 0.26 .. 2.38)
    gIndigoStone.addLoft(
      [
        makeRectChamferRing(0.24, 0.22, 0.06, 0.24, 2.26, side * 1.06),
        makeRectChamferRing(0.20, 0.18, 0.05, 1.56, 2.22, side * 1.02),
        makeRectChamferRing(0.08, 0.08, 0.02, 2.34, 2.14, side * 0.96),
      ],
      [
        [2.26, 0.24, side * 1.06],
        [2.22, 1.56, side * 1.02],
        [2.14, 2.34, side * 0.96],
      ],
      true,
      true
    );
    gPaleBright.addTubeAlongSpine(
      [
        { pos: [2.46, 0.34, side * 1.06], rx: 0.042, ry: 0.042 },
        { pos: [2.16, 2.38, side * 0.96], rx: 0.028, ry: 0.028 },
      ],
      4,
      true,
      true
    );
  }
  gVioletCore.addTubeAlongSpine(
    [
      { pos: [2.34, 0.46, -0.52], rx: 0.055, ry: 0.032 },
      { pos: [2.66, 0.33, 0.00], rx: 0.065, ry: 0.036 },
      { pos: [2.34, 0.46, 0.52], rx: 0.055, ry: 0.032 },
    ],
    4,
    true,
    true
  );

  // -------------------------------------------------------------------------
  // 3. Four Slender Corner Buttress Needles (Reinforces narrow gothic Dark-Shrine silhouette!)
  // -------------------------------------------------------------------------
  const buttressSpecs = [
    { x: 1.48, z: 1.54, sx: 1, sz: 1 },
    { x: 1.48, z: -1.54, sx: 1, sz: -1 },
    { x: -1.68, z: 1.54, sx: -1, sz: 1 },
    { x: -1.68, z: -1.54, sx: -1, sz: -1 },
  ];
  for (const b of buttressSpecs) {
    gDarkStone.addLoft(
      [
        makeRectChamferRing(0.28, 0.22, 0.06, 0.36, b.x, b.z),
        makeRectChamferRing(0.21, 0.17, 0.05, 1.48, b.x * 0.94, b.z * 0.92),
        makeRectChamferRing(0.07, 0.06, 0.02, 2.28, b.x * 0.86, b.z * 0.84),
      ],
      [
        [b.x, 0.36, b.z],
        [b.x * 0.94, 1.48, b.z * 0.92],
        [b.x * 0.86, 2.28, b.z * 0.84],
      ],
      true,
      true
    );
    gPaleTrim.addTubeAlongSpine(
      [
        { pos: [b.x + b.sx * 0.18, 0.42, b.z + b.sz * 0.16], rx: 0.042, ry: 0.042 },
        { pos: [b.x * 0.86, 2.32, b.z * 0.84], rx: 0.026, ry: 0.026 },
      ],
      4,
      true,
      true
    );
    gViolet.addFacetedCrystal({
      center: [b.x * 0.91, 1.72, b.z * 0.95],
      radii: [0.06, 0.22, 0.05],
      sectors: 5,
      stacks: 3,
    });
  }

  // -------------------------------------------------------------------------
  // 4. Twin Tall Narrow Inward-Arching Dark-Stone Shrine Monoliths (Y = 0.56 .. 6.08!)
  //    Flank the central void cleft on +Z (Right) and -Z (Left), rising tall and narrow
  //    with razor-crisp Pale Moonstone Trim arrises and glowing inner Violet Conduits!
  // -------------------------------------------------------------------------
  for (const side of [-1, 1]) {
    // 6-station swept narrow monolith blade rising from z = ±1.18 to pointed apex z = ±0.52 at Y = 6.08!
    const spireStations = [
      { y: 0.56, cx: 0.02, cz: side * 1.20, hx: 0.98, hz: 0.34, ch: 0.14 },
      { y: 1.65, cx: 0.00, cz: side * 1.26, hx: 0.86, hz: 0.32, ch: 0.12 },
      { y: 2.95, cx: -0.02, cz: side * 1.18, hx: 0.72, hz: 0.28, ch: 0.10 },
      { y: 4.25, cx: -0.04, cz: side * 0.98, hx: 0.54, hz: 0.23, ch: 0.08 },
      { y: 5.35, cx: -0.05, cz: side * 0.72, hx: 0.34, hz: 0.16, ch: 0.05 },
      { y: 6.08, cx: -0.06, cz: side * 0.50, hx: 0.09, hz: 0.07, ch: 0.02 },
    ];
    gDarkStone.addLoft(
      spireStations.map((s) => makeRectChamferRing(s.hx, s.hz, s.ch, s.y, s.cx, s.cz)),
      spireStations.map((s) => [s.cx, s.y, s.cz]),
      true,
      true
    );

    // Sculpted Indigo-Stone Outer Rib Buttress Plate on the lower-mid flank of each monolith
    gIndigoStone.addLoft(
      [
        makeRectChamferRing(0.68, 0.14, 0.05, 0.60, 0.02, side * 1.52),
        makeRectChamferRing(0.58, 0.14, 0.05, 2.10, 0.00, side * 1.54),
        makeRectChamferRing(0.38, 0.09, 0.03, 3.35, -0.02, side * 1.34),
      ],
      [
        [0.02, 0.60, side * 1.52],
        [0.00, 2.10, side * 1.54],
        [-0.02, 3.35, side * 1.34],
      ],
      true,
      true
    );

    // HIGH-CONTRAST PALE MOONSTONE ARCHITECTURAL TRIM ARRISES:
    // 1) Outer Dorsal Crest Spine running all the way up to Y = 6.08!
    gPaleBright.addTubeAlongSpine(
      [
        { pos: [0.02, 0.62, side * 1.62], rx: 0.075, ry: 0.065 },
        { pos: [0.00, 2.05, side * 1.64], rx: 0.070, ry: 0.060 },
        { pos: [-0.02, 3.35, side * 1.42], rx: 0.062, ry: 0.052 },
        { pos: [-0.04, 4.55, side * 1.08], rx: 0.052, ry: 0.044 },
        { pos: [-0.06, 6.08, side * 0.52], rx: 0.034, ry: 0.030 },
      ],
      4,
      true,
      true
    );
    // 2) Forward (+X) & Rear (-X) Pale Trim Edge Ribs framing the narrow monolith blade!
    for (const xEdge of [-1, 1]) {
      gPaleTrim.addTubeAlongSpine(
        [
          { pos: [0.02 + xEdge * 0.94, 0.62, side * 1.24], rx: 0.055, ry: 0.050 },
          { pos: [0.00 + xEdge * 0.78, 2.20, side * 1.26], rx: 0.050, ry: 0.046 },
          { pos: [-0.03 + xEdge * 0.56, 3.90, side * 1.06], rx: 0.042, ry: 0.038 },
          { pos: [-0.05 + xEdge * 0.28, 5.45, side * 0.70], rx: 0.032, ry: 0.028 },
        ],
        4,
        true,
        true
      );
    }

    // GLOWING VIOLET INNER CONDUIT GROOVE facing the suspended Void Crystal!
    gViolet.addTubeAlongSpine(
      [
        { pos: [0.02, 0.78, side * 0.86], rx: 0.065, ry: 0.055 },
        { pos: [0.00, 2.15, side * 0.92], rx: 0.065, ry: 0.055 },
        { pos: [-0.02, 3.45, side * 0.88], rx: 0.058, ry: 0.050 },
        { pos: [-0.04, 4.75, side * 0.68], rx: 0.048, ry: 0.042 },
        { pos: [-0.05, 5.55, side * 0.48], rx: 0.036, ry: 0.032 },
      ],
      4,
      true,
      true
    );

    // Pale Bezel Frame on Outer Monolith Flank for Surf_TEAM_Flank*
    const teamShieldPoly = [
      [-0.44, -0.52],
      [0.44, -0.52],
      [0.34, 0.52],
      [0.00, 0.68],
      [-0.34, 0.52],
    ];
    const bezelPoly = teamShieldPoly.map(([x, y]) => [x * 1.14, y * 1.12]);
    const flankCenter = [0.00, 2.35, side * 1.56];
    const flankOut = vNorm([0, 0.14, side]);
    gPaleBright.addOrientedShield(flankCenter, flankOut, [0, 1, 0], bezelPoly, 0.05, 0.90, 0.01);

    const gFlankTeam = new PrimitiveGeom(mats.Surf_TEAM);
    gFlankTeam.addOrientedShield(
      vAdd(flankCenter, vScale(flankOut, 0.035)),
      flankOut,
      [0, 1, 0],
      teamShieldPoly,
      0.055,
      0.88,
      0.01
    );
    const ftName = side > 0 ? 'Surf_TEAM_FlankRight' : 'Surf_TEAM_FlankLeft';
    const ftMesh = scene.addMesh(ftName, [gFlankTeam]);
    scene.addNode({ name: ftName, meshIndex: ftMesh, parentIndex: rootIdx });
  }

  // -------------------------------------------------------------------------
  // 5. Slender Rear Dorsal Monolith Spine (-X = -1.78, Y = 0.56 .. 5.42)
  //    Anchors the rear of the narrow cleft while leaving +X and overhead open!
  // -------------------------------------------------------------------------
  const rearStations = [
    { y: 0.56, cx: -1.68, hx: 0.46, hz: 0.72, ch: 0.14 },
    { y: 1.95, cx: -1.78, hx: 0.38, hz: 0.58, ch: 0.12 },
    { y: 3.55, cx: -1.62, hx: 0.28, hz: 0.42, ch: 0.09 },
    { y: 4.75, cx: -1.32, hx: 0.18, hz: 0.26, ch: 0.06 },
    { y: 5.42, cx: -1.04, hx: 0.08, hz: 0.10, ch: 0.02 },
  ];
  gDarkStone.addLoft(
    rearStations.map((s) => makeRectChamferRing(s.hx, s.hz, s.ch, s.y, s.cx, 0)),
    rearStations.map((s) => [s.cx, s.y, 0]),
    true,
    true
  );
  gPaleBright.addTubeAlongSpine(
    [
      { pos: [-2.16, 0.62, 0], rx: 0.068, ry: 0.068 },
      { pos: [-2.16, 2.05, 0], rx: 0.062, ry: 0.062 },
      { pos: [-1.88, 3.65, 0], rx: 0.052, ry: 0.052 },
      { pos: [-1.06, 5.44, 0], rx: 0.032, ry: 0.032 },
    ],
    4,
    true,
    true
  );
  gViolet.addTubeAlongSpine(
    [
      { pos: [-1.22, 0.75, 0], rx: 0.060, ry: 0.060 },
      { pos: [-1.38, 2.25, 0], rx: 0.058, ry: 0.058 },
      { pos: [-1.32, 3.65, 0], rx: 0.050, ry: 0.050 },
      { pos: [-1.02, 4.95, 0], rx: 0.038, ry: 0.038 },
    ],
    4,
    true,
    true
  );

  // Rear Dorsal Team Banner + Twin Forward Portal Team Pennants
  {
    const gRearTeam = new PrimitiveGeom(mats.Surf_TEAM);
    const rPoly = [
      [-0.28, -0.44],
      [0.28, -0.44],
      [0.22, 0.46],
      [0.00, 0.60],
      [-0.22, 0.46],
    ];
    gRearTeam.addOrientedShield(
      [-2.08, 2.45, 0],
      vNorm([-0.96, 0.28, 0]),
      [0.28, 0.96, 0],
      rPoly,
      0.055,
      0.86,
      0.01
    );
    const rtMesh = scene.addMesh('Surf_TEAM_RearSpire', [gRearTeam]);
    scene.addNode({ name: 'Surf_TEAM_RearSpire', meshIndex: rtMesh, parentIndex: rootIdx });

    for (const [pName, side] of [
      ['Surf_TEAM_ThresholdR', 1],
      ['Surf_TEAM_ThresholdL', -1],
    ]) {
      const gPen = new PrimitiveGeom(mats.Surf_TEAM);
      const pPoly = [
        [-0.14, -0.28],
        [0.14, -0.28],
        [0.11, 0.28],
        [-0.11, 0.28],
      ];
      gPen.addOrientedShield(
        [0.86, 1.95, side * 1.28],
        vNorm([0.92, 0.16, side * 0.35]),
        [0, 1, 0],
        pPoly,
        0.045,
        0.86,
        0.01
      );
      const pmMesh = scene.addMesh(pName, [gPen]);
      scene.addNode({ name: pName, meshIndex: pmMesh, parentIndex: rootIdx });
    }
  }

  // -------------------------------------------------------------------------
  // 6. Upper Apex Suspension Keystone Bridge (Y = 5.10 .. 5.62 between twin spires!)
  //    Visually anchors the top suspension tether right above the Void Crystal!
  // -------------------------------------------------------------------------
  gIndigoStone.addChamferBox({
    center: [-0.04, 5.34, 0],
    size: [0.46, 0.26, 1.18],
    topScale: [0.84, 0.78],
  });
  gPaleBright.addChamferBox({
    center: [-0.04, 5.48, 0],
    size: [0.36, 0.10, 0.96],
    topScale: [0.86, 0.84],
  });
  // Downward Pale Focuser Prongs above the Void Crystal
  for (const side of [-1, 1]) {
    gPaleBright.addTubeAlongSpine(
      [
        { pos: [-0.04, 5.26, side * 0.32], rx: 0.045, ry: 0.045 },
        { pos: [0.02, 4.78, side * 0.18], rx: 0.024, ry: 0.024 },
      ],
      4,
      true,
      true
    );
  }

  // Shrine Surf_GLOW_* Accent Nodes (Threshold Braziers, Well Focus, Apex Keystone)
  const shrineGlowSpecs = [
    { name: 'Surf_GLOW_ThresholdR', pos: [2.14, 2.48, 0.96], r: [0.12, 0.20, 0.12] },
    { name: 'Surf_GLOW_ThresholdL', pos: [2.14, 2.48, -0.96], r: [0.12, 0.20, 0.12] },
    { name: 'Surf_GLOW_WellFocus', pos: [0.06, 0.86, 0.00], r: [0.22, 0.18, 0.22] },
    { name: 'Surf_GLOW_ApexKeystone', pos: [-0.02, 5.06, 0.00], r: [0.18, 0.26, 0.18] },
  ];
  for (const gs of shrineGlowSpecs) {
    const gGlow = new PrimitiveGeom(mats.Surf_GLOW);
    gGlow.addFacetedCrystal({ center: gs.pos, radii: gs.r, sectors: 6, stacks: 4 });
    const gMesh = scene.addMesh(gs.name, [gGlow]);
    scene.addNode({ name: gs.name, meshIndex: gMesh, parentIndex: rootIdx });
  }

  const sanctumBodyMesh = scene.addMesh('VeilSanctum_Structure_Mesh', [
    gDarkStone,
    gObsidian,
    gIndigoStone,
    gPaleTrim,
    gPaleBright,
    gViolet,
    gVioletCore,
  ]);
  scene.addNode({ name: 'SanctumStructure', meshIndex: sanctumBodyMesh, parentIndex: rootIdx });

  // -------------------------------------------------------------------------
  // 7. Vertical Violet Suspension Tethers ('SuspensionTether' at [0.06, 2.96, 0])
  //    Translucent glowing violet beams from the lower ritual well & upper apex keystone
  //    visibly suspending the Void Crystal in mid-air!
  // -------------------------------------------------------------------------
  const gTetherField = new PrimitiveGeom(mats.Mat_VoidField);
  const gTetherBright = new PrimitiveGeom(mats.Mat_VioletGlow);
  // Lower suspension column (Y = 0.88 .. 2.18 -> local -2.08 .. -0.78)
  gTetherField.addTubeAlongSpine(
    [
      { pos: [0, -2.10, 0], rx: 0.34, ry: 0.34 },
      { pos: [0, -1.35, 0], rx: 0.18, ry: 0.18 },
      { pos: [0, -0.82, 0], rx: 0.26, ry: 0.26 },
    ],
    8,
    false,
    false
  );
  gTetherBright.addTubeAlongSpine(
    [
      { pos: [0, -2.08, 0], rx: 0.08, ry: 0.08 },
      { pos: [0, -0.86, 0], rx: 0.05, ry: 0.05 },
    ],
    6,
    true,
    true
  );
  // Upper suspension column (Y = 4.18 .. 5.06 -> local +1.22 .. +2.10)
  gTetherField.addTubeAlongSpine(
    [
      { pos: [-0.02, 1.18, 0], rx: 0.22, ry: 0.22 },
      { pos: [-0.05, 1.65, 0], rx: 0.14, ry: 0.14 },
      { pos: [-0.08, 2.08, 0], rx: 0.24, ry: 0.24 },
    ],
    8,
    false,
    false
  );
  gTetherBright.addTubeAlongSpine(
    [
      { pos: [-0.02, 1.16, 0], rx: 0.05, ry: 0.05 },
      { pos: [-0.08, 2.06, 0], rx: 0.07, ry: 0.07 },
    ],
    6,
    true,
    true
  );
  const tetherMesh = scene.addMesh('SuspensionTether_Mesh', [gTetherBright, gTetherField]);
  const tetherIdx = scene.addNode({
    name: 'SuspensionTether',
    meshIndex: tetherMesh,
    translation: [0.06, 2.96, 0],
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 8. THE SUSPENDED VOID CRYSTAL & GYROSCOPIC CONTAINMENT RINGS
  //    ('VoidCrystal' at [0.05, 3.06, 0], spanning Y = 1.98 .. 4.14!)
  // -------------------------------------------------------------------------
  const crystalPivot = [0.05, 3.06, 0];
  const gVoidPrism = new PrimitiveGeom(mats.Mat_VoidCore);
  const gCrystalRift = new PrimitiveGeom(mats.Mat_VioletGlow);
  const gCrystalTip = new PrimitiveGeom(mats.Mat_VioletCoreBright);
  const gCrystalPale = new PrimitiveGeom(mats.Mat_PaleBright);
  const gCrystalAura = new PrimitiveGeom(mats.Mat_VoidField);

  // Elongated 8-sided Double-Terminated Abyssal Void Crystal Core
  const makeOctRing = (r, y, phase = 0) => {
    const pts = [];
    for (let s = 0; s < 8; s++) {
      const th = (2 * Math.PI * s) / 8 + phase;
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    return pts;
  };
  gVoidPrism.addLoft(
    [
      makeOctRing(0.04, -1.06),
      makeOctRing(0.36, -0.62),
      makeOctRing(0.56, -0.14),
      makeOctRing(0.56, 0.18),
      makeOctRing(0.34, 0.66),
      makeOctRing(0.04, 1.08),
    ],
    [
      [0, -1.06, 0],
      [0, -0.62, 0],
      [0, -0.14, 0],
      [0, 0.18, 0],
      [0, 0.66, 0],
      [0, 1.08, 0],
    ],
    true,
    true
  );

  // Blazing Violet Rift Meridian Ribs & Equatorial Energy Belt erupting through the dark Void Core!
  for (let i = 0; i < 4; i++) {
    const th = (Math.PI * i) / 2 + Math.PI / 4;
    const ca = Math.cos(th), sa = Math.sin(th);
    gCrystalRift.addTubeAlongSpine(
      [
        { pos: [ca * 0.12, -0.92, sa * 0.12], rx: 0.038, ry: 0.038 },
        { pos: [ca * 0.59, -0.12, sa * 0.59], rx: 0.055, ry: 0.048 },
        { pos: [ca * 0.59, 0.16, sa * 0.59], rx: 0.055, ry: 0.048 },
        { pos: [ca * 0.12, 0.94, sa * 0.12], rx: 0.038, ry: 0.038 },
      ],
      4,
      true,
      true
    );
  }
  // Glowing Pale-Violet Equatorial Rift Gems & Upper/Lower Termination Sparks
  for (let i = 0; i < 4; i++) {
    const th = (Math.PI * i) / 2;
    gCrystalTip.addFacetedCrystal({
      center: [Math.cos(th) * 0.58, 0.02, Math.sin(th) * 0.58],
      radii: [0.09, 0.18, 0.09],
      sectors: 5,
      stacks: 4,
    });
  }
  gCrystalTip.addFacetedCrystal({
    center: [0, 1.02, 0],
    radii: [0.11, 0.20, 0.11],
    sectors: 6,
    stacks: 4,
  });
  gCrystalTip.addFacetedCrystal({
    center: [0, -1.00, 0],
    radii: [0.11, 0.20, 0.11],
    sectors: 6,
    stacks: 4,
  });

  // Pale Moonstone Harmonic Clasp Collars gripping the upper & lower shoulders of the Void Crystal
  for (const yCollar of [-0.66, 0.70]) {
    const cRings = [];
    const cCenters = [];
    for (let s = 0; s < 8; s++) {
      const th = (2 * Math.PI * s) / 8;
      const ca = Math.cos(th), sa = Math.sin(th);
      cRings.push([
        [ca * 0.42, yCollar - 0.045, sa * 0.42],
        [ca * 0.42, yCollar + 0.045, sa * 0.42],
        [ca * 0.31, yCollar + 0.050, sa * 0.31],
        [ca * 0.31, yCollar - 0.050, sa * 0.31],
      ]);
      cCenters.push([ca * 0.365, yCollar, sa * 0.365]);
    }
    gCrystalPale.addCyclicRingLoft(cRings, cCenters);
  }

  // Translucent Outer Violet-Void Harmonic Shell around the crystal
  gCrystalAura.addLoft(
    [
      makeOctRing(0.08, -1.16, Math.PI / 8),
      makeOctRing(0.68, 0.02, Math.PI / 8),
      makeOctRing(0.08, 1.18, Math.PI / 8),
    ],
    [[0, -1.16, 0], [0, 0.02, 0], [0, 1.18, 0]],
    true,
    true
  );

  // Opaque primitives FIRST, alpha-blend aura LAST!
  const crystalMesh = scene.addMesh('VoidCrystal_Mesh', [
    gVoidPrism,
    gCrystalRift,
    gCrystalTip,
    gCrystalPale,
    gCrystalAura,
  ]);
  const crystalIdx = scene.addNode({
    name: 'VoidCrystal',
    meshIndex: crystalMesh,
    translation: crystalPivot,
    parentIndex: rootIdx,
  });

  // Outer & Inner Pale-Trimmed Containment Rings + Orbiting Void Shards around VoidCrystal
  const buildContainmentRingMesh = (meshName, radius, halfThick, withShards) => {
    const gRingStone = new PrimitiveGeom(mats.Mat_DarkStone);
    const gRingPale = new PrimitiveGeom(mats.Mat_PaleBright);
    const gRingViolet = new PrimitiveGeom(mats.Mat_VioletGlow);
    const segs = 10;
    const rRings = [];
    const rCenters = [];
    const vRings = [];
    const vCenters = [];
    for (let s = 0; s < segs; s++) {
      const th = (2 * Math.PI * s) / segs;
      const ca = Math.cos(th), sa = Math.sin(th);
      rRings.push([
        [ca * (radius + 0.08), -halfThick, sa * (radius + 0.08)],
        [ca * (radius + 0.08), halfThick, sa * (radius + 0.08)],
        [ca * (radius - 0.04), halfThick * 0.85, sa * (radius - 0.04)],
        [ca * (radius - 0.04), -halfThick * 0.85, sa * (radius - 0.04)],
      ]);
      rCenters.push([ca * (radius + 0.02), 0, sa * (radius + 0.02)]);

      vRings.push([
        [ca * (radius - 0.03), -halfThick * 0.55, sa * (radius - 0.03)],
        [ca * (radius - 0.03), halfThick * 0.55, sa * (radius - 0.03)],
        [ca * (radius - 0.09), halfThick * 0.45, sa * (radius - 0.09)],
        [ca * (radius - 0.09), -halfThick * 0.45, sa * (radius - 0.09)],
      ]);
      vCenters.push([ca * (radius - 0.06), 0, sa * (radius - 0.06)]);
    }
    gRingPale.addCyclicRingLoft(rRings, rCenters);
    gRingViolet.addCyclicRingLoft(vRings, vCenters);

    if (withShards) {
      for (let k = 0; k < 4; k++) {
        const th = (Math.PI * k) / 2 + Math.PI / 4;
        const ca = Math.cos(th), sa = Math.sin(th);
        gRingStone.addChamferBox({
          center: [ca * (radius + 0.13), 0, sa * (radius + 0.13)],
          size: [0.16, 0.24, 0.16],
          rotDeg: [0, (-th * 180) / Math.PI, 0],
          topScale: [0.76, 0.76],
        });
        gRingViolet.addFacetedCrystal({
          center: [ca * (radius + 0.14), 0.18, sa * (radius + 0.14)],
          radii: [0.06, 0.11, 0.06],
          sectors: 5,
          stacks: 3,
        });
      }
    }
    return scene.addMesh(meshName, [gRingStone, gRingPale, gRingViolet]);
  };

  const outerRingMesh = buildContainmentRingMesh('ContainmentRing_Outer_Mesh', 0.94, 0.052, true);
  const outerRingIdx = scene.addNode({
    name: 'ContainmentRing_Outer',
    meshIndex: outerRingMesh,
    translation: crystalPivot,
    rotation: quatFromEulerXYZ(16, 0, -14),
    parentIndex: rootIdx,
  });

  const innerRingMesh = buildContainmentRingMesh('ContainmentRing_Inner_Mesh', 0.76, 0.040, false);
  const innerRingIdx = scene.addNode({
    name: 'ContainmentRing_Inner',
    meshIndex: innerRingMesh,
    translation: crystalPivot,
    rotation: quatFromEulerXYZ(-18, 0, 16),
    parentIndex: rootIdx,
  });

  // -------------------------------------------------------------------------
  // 9. Seamless Looping 'idle' Animation (3.20s Void Crystal Levitation & Gyro Pulse)
  //    Every track starts and ends with identical float values (t=0.0 === t=3.20)!
  // -------------------------------------------------------------------------
  const idleT = [0.0, 0.80, 1.60, 2.40, 3.20];
  scene.addAnimation('idle', [
    {
      nodeIndex: crystalIdx,
      path: 'translation',
      times: idleT,
      values: [
        [0.05, 3.06, 0],
        [0.05, 3.20, 0],
        [0.05, 3.06, 0],
        [0.05, 2.93, 0],
        [0.05, 3.06, 0],
      ],
    },
    {
      nodeIndex: crystalIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(3, 26, -2),
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-3, -26, 2),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      nodeIndex: crystalIdx,
      path: 'scale',
      times: idleT,
      values: [
        [1.0, 1.0, 1.0],
        [1.04, 1.03, 1.04],
        [1.0, 1.0, 1.0],
        [0.97, 0.98, 0.97],
        [1.0, 1.0, 1.0],
      ],
    },
    {
      nodeIndex: outerRingIdx,
      path: 'translation',
      times: idleT,
      values: [
        [0.05, 3.06, 0],
        [0.05, 3.16, 0],
        [0.05, 3.06, 0],
        [0.05, 2.97, 0],
        [0.05, 3.06, 0],
      ],
    },
    {
      nodeIndex: outerRingIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(16, 0, -14),
        quatFromEulerXYZ(22, -28, -8),
        quatFromEulerXYZ(16, 0, -14),
        quatFromEulerXYZ(10, 28, -20),
        quatFromEulerXYZ(16, 0, -14),
      ],
    },
    {
      nodeIndex: innerRingIdx,
      path: 'translation',
      times: idleT,
      values: [
        [0.05, 3.06, 0],
        [0.05, 3.18, 0],
        [0.05, 3.06, 0],
        [0.05, 2.95, 0],
        [0.05, 3.06, 0],
      ],
    },
    {
      nodeIndex: innerRingIdx,
      path: 'rotation',
      times: idleT,
      values: [
        quatFromEulerXYZ(-18, 0, 16),
        quatFromEulerXYZ(-12, 34, 24),
        quatFromEulerXYZ(-18, 0, 16),
        quatFromEulerXYZ(-24, -34, 8),
        quatFromEulerXYZ(-18, 0, 16),
      ],
    },
    {
      nodeIndex: tetherIdx,
      path: 'scale',
      times: idleT,
      values: [
        [1.0, 1.0, 1.0],
        [1.14, 1.0, 1.14],
        [1.0, 1.0, 1.0],
        [0.88, 1.0, 0.88],
        [1.0, 1.0, 1.0],
      ],
    },
  ]);

  return scene.buildGLB('VeilSanctumScene');
}

// ---------------------------------------------------------------------------
// Self-Validation Summary & CLI Entry Point
// ---------------------------------------------------------------------------

function summarizeVeilAsset(filename, glbBuffer, gltf) {
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
    { filename: 'duskblade.glb', build: buildDuskbladeGLB },
    { filename: 'veil_sanctum.glb', build: buildVeilSanctumGLB },
  ];

  const summaries = [];
  for (const sp of specs) {
    const { glbBuffer, gltf } = sp.build();
    const fullPath = path.join(outDir, sp.filename);
    fs.writeFileSync(fullPath, glbBuffer);
    summaries.push(summarizeVeilAsset(sp.filename, glbBuffer, gltf));
  }

  console.log(JSON.stringify(summaries, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildDuskbladeGLB,
  buildVeilSanctumGLB,
};
